// ============================================================
//  RPA HCHealth — Script principal
//  Uso: node rpa.js
// ============================================================

require('dotenv').config();

// Consola en UTF-8 para que el banner y acentos se vean bien (sobre todo en
// el .exe empaquetado lanzado por doble clic, donde la consola usa cp850/1252).
if (process.platform === 'win32') {
  try { require('child_process').execSync('chcp 65001', { stdio: 'ignore' }); } catch {}
}

const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');
const prompts = require('prompts');
const cfg  = require('./config');
const ui   = require('./ui');
const { generarCita, citaIdToBase64 } = require('./db');

// ── Utilidades ────────────────────────────────────────────────

function fechaHoy() {
  return new Date().toISOString().slice(0, 10); // yyyy-mm-dd
}

function horaAhora() {
  return new Date().toTimeString().slice(0, 8); // HH:MM:SS
}

function limpiarNombre(texto) {
  return texto
    .trim()
    .replace(/[áàä]/gi, 'a').replace(/[éèë]/gi, 'e')
    .replace(/[íìï]/gi, 'i').replace(/[óòö]/gi, 'o')
    .replace(/[úùü]/gi, 'u').replace(/ñ/gi, 'n')
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 50);
}

function crearCarpeta(ruta) {
  if (!fs.existsSync(ruta)) fs.mkdirSync(ruta, { recursive: true });
}

// Localiza chrome.exe dentro de la carpeta "browser\" empaquetada junto al
// .exe (pkg no incluye el navegador; se distribuye al lado). Busca recursivo
// porque el nombre de la subcarpeta de Chromium varía con la versión.
function buscarChromeEmpaquetado() {
  const base = path.join(cfg.dirApp, 'browser');
  if (!fs.existsSync(base)) return null;
  const pila = [base];
  while (pila.length) {
    const dir = pila.pop();
    let entradas;
    try { entradas = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entradas) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) pila.push(p);
      else if (e.name.toLowerCase() === 'chrome.exe') return p;
    }
  }
  return null;
}

function log(mensaje, tipo = 'info') {
  ui.log(mensaje, tipo);
}

// ── Esperar que el spinner de carga desaparezca ──────────────

async function esperarPaginaLista(page) {
  try {
    // Espera hasta que el spinner (.loaderSmall) no sea visible
    await page.waitForSelector('.loaderSmall', {
      state: 'hidden',
      timeout: cfg.tiempos.timeoutCarga,
    });
  } catch {
    // Si no había spinner, no hay problema
  }
  await page.waitForTimeout(600);
}

// ── Tomar captura de pantalla ────────────────────────────────

async function tomarCaptura(page, rutaArchivo, segundaCaptura = false) {
  // Scroll al inicio
  await page.keyboard.press('Control+Home');
  await page.waitForTimeout(300);

  await page.screenshot({ path: rutaArchivo, fullPage: false });
  log(`Captura: ${path.basename(rutaArchivo)}`, 'ok');

  // Segunda captura (scroll) para tabs muy largos
  if (segundaCaptura) {
    await page.keyboard.press('PageDown');
    await page.waitForTimeout(700);
    const rutaScroll = rutaArchivo.replace('.png', '_scroll.png');
    await page.screenshot({ path: rutaScroll, fullPage: false });
    log(`Captura scroll: ${path.basename(rutaScroll)}`, 'ok');
    // Volver arriba
    await page.keyboard.press('Control+Home');
  }
}

// ── Llenar texto, número, email, fecha y radios "NO" por JavaScript ──
// Rápido y sin scroll (no mueve la página por cada campo). Devuelve cuántos llenó.
async function llenarTextoyRadios(page) {
  const texto = cfg.textoPrueba || 'PRUEBA RPA';
  return await page.evaluate((txt) => {
    let c = 0;
    const hoy = new Date().toISOString().slice(0, 10);
    const visible = (el) =>
      el.offsetParent !== null && !el.disabled && !el.readOnly && el.offsetHeight > 0;
    const fire = (el) =>
      ['input', 'change', 'blur'].forEach((ev) =>
        el.dispatchEvent(new Event(ev, { bubbles: true }))
      );

    document.querySelectorAll('input[type="text"], input:not([type]), textarea').forEach((el) => {
      if (!visible(el) || el.value) return;
      el.value = txt; fire(el); c++;
    });
    // Numéricos: usar valores clínicamente NORMALES para signos vitales
    // (evita alertas tipo "cifras tensionales altas") y respetar min/max
    // para el resto. Se identifica el campo por el texto de su etiqueta.
    const VITALES = [
      { re: /satura|sat.*ox|spo2/,                       val: 98 },
      { re: /temperatura/,                               val: 36 },
      { re: /diast/,                                     val: 80 },
      { re: /sist|t\.?a\b|tensi|presi/,                  val: 120 },
      { re: /pulso|cardiaca|frecuencia\s*card|\bfc\b/,   val: 75 },
      { re: /respirator|frecuencia\s*resp|\bfr\b/,       val: 18 },
      { re: /peso/,                                      val: 65 },
      { re: /talla|estatura/,                            val: 165 },
      { re: /imc/,                                       val: 22 },
      { re: /perimetro|circunferen|abdominal|cefalic|braquial|pantorrilla|pelvic/, val: 80 },
      { re: /pliegue/,                                   val: 10 },
    ];
    const etiquetaDe = (el) => {
      const cont = el.closest('.form-group, .row, td');
      const lab = cont && cont.querySelector('label');
      return ((lab && lab.textContent) || el.getAttribute('placeholder') || '')
        .toLowerCase();
    };

    document.querySelectorAll('input[type="number"]').forEach((el) => {
      if (!visible(el) || el.value) return;
      const min = parseFloat(el.getAttribute('min'));
      const max = parseFloat(el.getAttribute('max'));
      const etq = etiquetaDe(el);
      let val = null;

      // 1) Valor normal según el tipo de signo vital
      const vital = VITALES.find((v) => v.re.test(etq));
      if (vital) {
        val = vital.val;
        // T.A: sistólica (1er campo) = 120, diastólica (2do campo) = 80
        if (/sist|t\.?a\b|tensi|presi/.test(etq)) {
          const cont = el.closest('.form-group, .row, td');
          const nums = cont ? Array.from(cont.querySelectorAll('input[type="number"]')) : [];
          if (nums.indexOf(el) >= 1) val = 80;
        }
      }

      // 2) Si no es vital conocido, punto medio del rango o 1
      if (val === null) {
        if (!isNaN(min) && !isNaN(max)) val = Math.round((min + max) / 2);
        else if (!isNaN(min)) val = min + 1;
        else if (!isNaN(max)) val = Math.min(max, 10);
        else val = 1;
      }

      // 3) Asegurar que el valor respete min/max
      if (!isNaN(min) && val < min) val = min;
      if (!isNaN(max) && val > max) val = max;

      el.value = String(val); fire(el); c++;
    });
    document.querySelectorAll('input[type="email"]').forEach((el) => {
      if (!visible(el) || el.value) return;
      el.value = 'prueba@rpa.com'; fire(el); c++;
    });
    document.querySelectorAll('input[type="date"]').forEach((el) => {
      if (!visible(el) || el.value) return;
      el.value = hoy; fire(el); c++;
    });
    // Radios "NO"
    document.querySelectorAll('label.kt-radio, label.kt-radio-inline').forEach((lbl) => {
      if (lbl.textContent.trim().toUpperCase() !== 'NO') return;
      const r = lbl.querySelector('input[type="radio"]');
      if (r && !r.checked && visible(r)) { r.click(); c++; }
    });
    return c;
  }, texto);
}

// ── Llenar selects nativos con la primera opción válida ──
// Hace varias pasadas: elegir un select puede revelar otros nuevos
// (ej. Tipo Incapacidad revela grupoServicio y modalidad).
async function llenarSelects(page) {
  let total = 0;
  for (let pasada = 0; pasada < 4; pasada++) {
    let llenados = 0;
    const selects = page.locator('select:visible');
    const cs = await selects.count();
    for (let i = 0; i < cs; i++) {
      const el = selects.nth(i);
      try {
        const val = await el.inputValue();
        if (val && !/undefined/i.test(val)) continue; // ya tiene valor
        // Elegir la primera opción real (índice 1 si hay placeholder, si no 0)
        const opts = await el.locator('option').count();
        const idx = opts > 1 ? 1 : 0;
        await el.selectOption({ index: idx }, { timeout: 2000 });
        llenados++; total++;
      } catch {}
    }
    if (llenados === 0) break;       // nada nuevo que llenar
    await page.waitForTimeout(300);  // dejar que aparezcan selects revelados
    // Cambiar selects clínicos (ej. Toxoplasma IgG/IgM) dispara alertas que
    // tapan los siguientes; descartarlas antes de la próxima pasada.
    await cerrarAlertas(page);
  }
  return total;
}

// ── Dropdowns buscables (angular2-multiselect): buscar, elegir y Agregar ──
// Al agregar, la app inserta una fila/formulario debajo que se llenará después.
async function llenarMultiselects(page, semillas) {
  let n = 0;
  const multis = page.locator('angular2-multiselect:visible');
  const cm = await multis.count();
  for (let i = 0; i < cm; i++) {
    const ms = multis.nth(i);
    try {
      await ms.locator('.c-btn, .cuppa-dropdown').first().click({ timeout: 2000 });
      const inputBusq = ms
        .locator('.list-filter input, input.searchinput, input[type="text"]')
        .first();
      let elegido = false;
      for (const semilla of semillas) {
        await inputBusq.fill('');
        await inputBusq.type(semilla, { delay: 80 });
        try {
          const primero = ms.locator('ul.lazyContainer li, .list-area li').first();
          await primero.waitFor({ state: 'visible', timeout: 4500 });
          await primero.click();
          elegido = true; n++;
          break;
        } catch { /* sin resultados, probar siguiente semilla */ }
      }

      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(300);

      if (elegido) {
        try {
          const grupo = ms.locator('xpath=ancestor::div[contains(@class,"input-group")][1]');
          const btnAgregar = grupo.locator('button').filter({ hasText: /agregar/i });
          if (await btnAgregar.count()) {
            await btnAgregar.first().click({ timeout: 2000 });
            await esperarPaginaLista(page);
            log('Item agregado a la lista', 'ok');
          }
        } catch {}
      } else {
        let motivo = 'sin resultados';
        try {
          const txt = await ms.locator('.dropdown-list, .list-area').first().innerText({ timeout: 800 });
          if (/no data available|no hay datos|sin datos/i.test(txt)) motivo = 'catálogo vacío (No Data Available)';
          else if (/3 o más caracteres|3 caracteres/i.test(txt)) motivo = 'requiere búsqueda específica';
        } catch {}
        log(`Dropdown buscable #${i + 1}: ${motivo}`, 'warn');
      }
    } catch {}
  }
  return n;
}

// ── Clasificación de alertas (SweetAlert2) ───────────────────
// El frontend (HCHealth) muestra TODO con Swal.fire sin wrapper. La
// distinción fiable es por CONTENIDO, no por ícono: los errores de backend
// (deserialización, excepciones) se muestran incluso como `warning`, así
// que se reconocen por su texto. Ver catálogo en el código del frontend
// (prenatal.component.ts / morbilidad/index.component.ts).
const RE_ERROR_APP = /error occurred|deserializ|exception|bsontype|no se pudo guardar|ha ocurrido un error|stack trace|unable to/i;
const RE_EXITO     = /guardado|[ée]xito/i;

// Selector de un popup SweetAlert (2 y legacy) visible.
const SEL_SWAL = '.swal2-popup, .sweet-alert.visible, .sweet-alert.showSweetAlert';

// ── Cerrar alertas que bloquean (clínicas / info / validación) ──
// Cierra las alertas NO críticas (ej. "tamización mensual con IgM",
// remisiones, "faltan datos", cifras vitales altas) para que el bot
// continúe. DEJA ABIERTAS las de ERROR de backend (las marca FAIL
// `detectarErrorApp`) y las de ÉXITO (las captura `capturarExito`).
async function cerrarAlertas(page) {
  for (let k = 0; k < 5; k++) {
    const alerta = page.locator(SEL_SWAL).first();
    let cnt = 0;
    try { cnt = await alerta.count(); } catch { break; }
    if (!cnt) break;
    if (!(await alerta.isVisible().catch(() => false))) break;

    const texto = (await alerta.innerText({ timeout: 600 }).catch(() => '')) || '';
    // No tocar errores de backend ni mensajes de éxito.
    if (RE_ERROR_APP.test(texto) || RE_EXITO.test(texto)) break;

    // Descartar la alerta clínica/info: botón OK/Aceptar/Cerrar/Continuar (o No/Cancelar).
    const btn = alerta
      .locator('button')
      .filter({ hasText: /^\s*(ok|aceptar|s[ií]|no|cancelar|cerrar|continuar)\s*$/i });
    try {
      await btn.first().click({ timeout: 1500 });
      await page.waitForTimeout(500);
    } catch {
      break;
    }
  }
}

// ── Detectar un error de backend en un SweetAlert visible ────
// Algunos tabs (ej. Prenatal) disparan un modal de error del servidor
// (deserialización Mongo, excepciones, etc.) con botón "OK". Lo detecta
// para marcar el tab como FALLIDO. NO es el mensaje de éxito de guardado.
async function detectarErrorApp(page) {
  try {
    const alerta = page.locator(SEL_SWAL).first();
    if (!(await alerta.count())) return { hayError: false, texto: '' };
    if (!(await alerta.isVisible().catch(() => false))) return { hayError: false, texto: '' };
    const texto = (await alerta.innerText({ timeout: 800 }).catch(() => '')) || '';
    // Ignorar éxito; reconocer SOLO errores de backend/excepciones (no
    // validaciones clínicas genéricas), por contenido — ver RE_ERROR_APP.
    if (RE_EXITO.test(texto)) return { hayError: false, texto: '' };
    if (RE_ERROR_APP.test(texto)) {
      return { hayError: true, texto: texto.replace(/\s+/g, ' ').trim() };
    }
    return { hayError: false, texto: '' };
  } catch {
    return { hayError: false, texto: '' };
  }
}

// ── Cerrar un SweetAlert con su botón OK / Aceptar ───────────
// Se usa para descartar el modal de error tras capturarlo como evidencia.
// (No se añade "ok" a cerrarAlertas global para no cerrar el error antes
// de poder detectarlo.)
async function cerrarAlertaOK(page) {
  try {
    const alerta = page.locator(
      '.sweet-alert.visible, .sweet-alert.showSweetAlert, .swal2-popup'
    ).first();
    const btn = alerta.locator('button').filter({ hasText: /^(ok|aceptar|s[ií]|cerrar)$/i });
    await btn.first().click({ timeout: 1500 });
    await page.waitForTimeout(400);
  } catch { /* nada que cerrar */ }
}

// ── Marcar casillas que revelan sub-formularios (ej. incapacidad) ──
// Devuelve cuántas marcó. Tras marcarlas, los campos ocultos aparecen
// y se llenan en los pasos siguientes.
async function marcarCasillasRequeridas(page) {
  const keywords = (cfg.casillasARevisar || []).map((k) => k.toLowerCase());
  if (!keywords.length) return 0;
  return await page.evaluate((kws) => {
    let c = 0;
    document.querySelectorAll('label.kt-checkbox, label.kt-checkbox-inline, label').forEach((lbl) => {
      const txt = (lbl.textContent || '').toLowerCase();
      if (!kws.some((k) => txt.includes(k))) return;
      const cb = lbl.querySelector('input[type="checkbox"]');
      if (cb && !cb.checked && cb.offsetParent !== null && !cb.disabled) {
        cb.click();
        c++;
      }
    });
    return c;
  }, keywords);
}

// ── Aceptar un diálogo (clic en Si / Aceptar / Guardar / Confirmar) ──
async function aceptarDialogo(page) {
  for (let k = 0; k < 3; k++) {
    const alerta = page.locator(
      '.sweet-alert.visible, .sweet-alert.showSweetAlert, .swal2-popup'
    );
    let cnt = 0;
    try { cnt = await alerta.count(); } catch { break; }
    if (!cnt) break;
    // No descartar el mensaje de éxito (se captura aparte)
    try {
      const txt = await alerta.first().innerText({ timeout: 500 });
      if (/guardado|[ée]xito/i.test(txt)) break;
    } catch {}
    const btn = alerta
      .locator('button')
      .filter({ hasText: /^(s[ií]|aceptar|guardar|confirmar|ok|continuar)$/i });
    try {
      await btn.first().click({ timeout: 1500 });
      await page.waitForTimeout(700);
    } catch {
      break;
    }
  }
}

// ── Capturar el mensaje de éxito tras guardar ────────────────
async function capturarExito(page, carpetaRun) {
  try {
    const alerta = page
      .locator('.sweet-alert.visible, .sweet-alert.showSweetAlert, .swal2-popup')
      .filter({ hasText: /guardado|[ée]xito/i }).first();
    await alerta.waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(400);
    const ruta = path.join(carpetaRun, 'GUARDADO_Exito.png');
    await page.screenshot({ path: ruta });
    log('Captura del mensaje de éxito guardada', 'ok');
    await alerta.locator('button')
      .filter({ hasText: /^(ok|aceptar|s[ií])$/i })
      .first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(400);
    return ruta;
  } catch {
    log('No apareció el mensaje de éxito (no se capturó)', 'warn');
    return '';
  }
}

// ── Presionar el botón "Guardar" del sidebar ─────────────────
async function presionarGuardar(page, carpetaRun) {
  try {
    // Selector principal por el tooltip (build de desarrollo expone ng-reflect)
    let btn = page.locator('a[ng-reflect-ngb-tooltip="Guardar"]');
    if ((await btn.count()) === 0) {
      // Respaldo: primer ítem "success" de la barra lateral (es Guardar)
      btn = page.locator('ul.kt-sticky-toolbar li.kt-sticky-toolbar__item--success a');
    }
    await btn.first().click({ timeout: 5000 });
    log('Botón Guardar presionado', 'ok');
    await page.waitForTimeout(1500);
    await aceptarDialogo(page);       // confirmar guardado si pregunta (SweetAlert)

    // Modal "Confirmar datos del paciente" → clic en "Enviar"
    try {
      const modal = page.locator('.modal.show .modal-content, div.modal-content:visible').first();
      await modal.waitFor({ state: 'visible', timeout: 6000 });
      const enviar = modal.locator('button').filter({ hasText: /^\s*enviar\s*$/i });
      if (await enviar.count()) {
        await enviar.first().click({ timeout: 3000 });
        log('Datos del paciente confirmados (Enviar)', 'ok');
        await esperarPaginaLista(page);
        await page.waitForTimeout(1000);
        await aceptarDialogo(page);   // posible mensaje de éxito tras enviar
      }
    } catch {
      /* no apareció el modal de confirmación de datos */
    }

    await esperarPaginaLista(page);
    // Capturar el mensaje "Guardado Correctamente" antes de cerrarlo
    const exitoPath = await capturarExito(page, carpetaRun);
    await aceptarDialogo(page);       // limpiar cualquier diálogo restante
    log('Guardado completado', 'ok');
    return { ok: true, exitoPath };
  } catch (e) {
    log('No se pudo presionar Guardar: ' + e.message.slice(0, 60), 'warn');
    return { ok: false, exitoPath: '' };
  }
}

// ── Capturar los PDF del modal de impresión post-guardado ────
// Imprime cada documento (HC versión full, Medicamentos, Incapacidad,
// Ordenamientos), captura la pestaña del PDF y devuelve las evidencias.
async function capturarImpresiones(page, carpetaRun) {
  const context = page.context();
  const evidencias = [];

  // ¿Apareció el modal "Información"?
  try {
    await page.waitForSelector('.modal-content h4.modal-title:has-text("Información")', { timeout: 8000 });
  } catch {
    return evidencias;
  }
  log('Modal de impresión detectado', 'ok');

  // Helper: ejecuta preFn (opcional), dispara el click que abre la pestaña,
  // espera el popup, lo captura y lo cierra.
  async function capturar(nombre, fileBase, preFn, triggerFn) {
    try {
      if (preFn) await preFn();
      const [popup] = await Promise.all([
        context.waitForEvent('page', { timeout: 15000 }),
        triggerFn(),
      ]);
      await popup.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
      await popup.waitForTimeout(2500); // dejar renderizar el PDF
      const ruta = path.join(carpetaRun, `PRINT_${fileBase}.png`);
      await popup.screenshot({ path: ruta });
      await popup.close();
      log(`Captura de impresión: ${nombre}`, 'ok');
      evidencias.push({ nombre, ruta });
    } catch (e) {
      log(`No se pudo capturar "${nombre}": ${e.message.slice(0, 60)}`, 'warn');
    }
  }

  // 1) Historia Clínica → Imprimir → Versión full → Continuar
  await capturar(
    'Historia Clínica (Full)', 'Historia_Clinica_Full',
    async () => {
      const fila = page.locator('.modal-content .row').filter({ hasText: /Historia clinica/i });
      await fila.locator('button.btn-primary').filter({ hasText: /^\s*imprimir\s*$/i }).first().click();
      await page.waitForSelector('h4:has-text("Impresión historia clinica")', { timeout: 8000 });
      await page.locator('label.kt-radio').filter({ hasText: /Versión full/i }).click();
    },
    async () => {
      await page.locator('button.btn-primary').filter({ hasText: /continuar/i }).click();
    }
  );

  // 2) Medicamentos / Incapacidad / Ordenamientos → anchor Imprimir (target=_blank)
  const docs = [
    { txt: /Medicamentos/i,  nombre: 'Medicamentos',  file: 'Medicamentos' },
    { txt: /Incapacidad/i,   nombre: 'Incapacidad',   file: 'Incapacidad' },
    { txt: /Ordenamientos/i, nombre: 'Ordenamientos', file: 'Ordenamientos' },
  ];
  for (const d of docs) {
    const filasDoc = page.locator('.modal-content .row').filter({ hasText: d.txt });
    const n = await filasDoc.count();
    for (let i = 0; i < n; i++) {
      const anchor = filasDoc.nth(i).locator('a.btn-primary').filter({ hasText: /imprimir/i });
      if ((await anchor.count()) === 0) continue;
      const etiqueta = n > 1 ? `${d.nombre} #${i + 1}` : d.nombre;
      const fileBase = n > 1 ? `${d.file}_${i + 1}` : d.file;
      await capturar(etiqueta, fileBase, null, async () => { await anchor.first().click(); });
    }
  }

  // Cerrar el modal Información
  try {
    await page.locator('.modal-content button.btn-success').filter({ hasText: /cerrar/i }).first().click({ timeout: 3000 });
  } catch {}

  return evidencias;
}

// ── Rellenar automáticamente todos los campos visibles ───────
// Orden importante:
//   1) Dropdowns buscables PRIMERO → al agregar aparecen filas/formularios nuevos
//   2) Texto + radios por JS (rápido, sin scroll) → cubre también las filas nuevas
//   3) Selects al final → cubre los selects de las filas recién agregadas
// ── Expandir paneles de acordeón (ngb-accordion) colapsados ──
// Tabs como Prenatal usan <ngb-accordion> con todos los paneles colapsados
// (activeIds="colapsado"). Sus campos no existen/visibles hasta abrirlos.
// El toggle es el header (h4.titletabs / [ngbPanelToggle]); se hace clic en
// cada panel que NO esté ya expandido (.collapse.show). Varias pasadas por
// si abrir uno revela acordeones anidados.
async function expandirPaneles(page) {
  let abiertosTotal = 0;
  for (let pasada = 0; pasada < 5; pasada++) {
    const abiertos = await page.evaluate(() => {
      const visible = (el) => el && el.offsetParent !== null && el.offsetHeight > 0;
      let n = 0;
      // Toggles del acordeón: el header del source es <h4 class="titletabs" ngbPanelToggle>.
      // (el atributo ngbPanelToggle se matchea case-insensitive en HTML)
      const toggles = document.querySelectorAll('h4.titletabs, [ngbpaneltoggle]');
      toggles.forEach((t) => {
        if (t.dataset.rpaSeen) return;        // ya procesado en una pasada previa
        if (!visible(t)) return;
        t.dataset.rpaSeen = '1';
        // Si ya está expandido (aria-expanded=true), no volver a hacer clic.
        const aria = t.getAttribute('aria-expanded');
        if (aria === 'true') return;
        t.click(); n++;
      });
      return n;
    });
    if (!abiertos) break;            // no quedaban paneles nuevos por abrir
    abiertosTotal += abiertos;
    await esperarPaginaLista(page);  // dejar renderizar el contenido del panel
    await page.waitForTimeout(350);
  }
  if (abiertosTotal) log(`Paneles de acordeón expandidos: ${abiertosTotal}`, 'ok');
  return abiertosTotal;
}

// ── ¿El tab actual corresponde a un programa PYM activado? ───
// Compara (normalizado, sin acentos) el nombre del tab contra la lista de
// programas activados. Ej. programa "Prenatal" → tab "Prenatal".
function esTabPYM(tabNombreRaw, programasPYM) {
  if (!Array.isArray(programasPYM) || !programasPYM.length) return false;
  const norm = (s) => limpiarNombre(String(s)).toLowerCase();
  const t = norm(tabNombreRaw);
  if (!t) return false;
  return programasPYM.some((p) => {
    const pn = norm(p);
    return pn && (t.includes(pn) || pn.includes(t));
  });
}

// ── Capturar panel por panel un tab de PYM (acordeón) ────────
// Cada panel (.card del ngb-accordion, header <h4.titletabs>) se captura como
// element screenshot recortado. Devuelve [{ titulo, ruta }] por panel.
async function capturarPanelesPYM(page, carpetaRun, tabIndex, tabNombreClean) {
  // Marcar cada contenedor de panel y obtener su título.
  const paneles = await page.evaluate(() => {
    const heads = [...document.querySelectorAll('h4.titletabs')]
      .filter((h) => h.offsetParent !== null && h.offsetHeight > 0);
    return heads.map((h, i) => {
      const card = h.closest('.card') || h.parentElement?.parentElement || h;
      card.setAttribute('data-rpa-panel', String(i));
      return { i, titulo: (h.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40) };
    });
  });

  const evidencias = [];
  for (const p of paneles) {
    const loc = page.locator(`[data-rpa-panel="${p.i}"]`).first();
    const tituloLimpio = limpiarNombre(p.titulo) || `panel_${p.i + 1}`;
    const ruta = path.join(
      carpetaRun,
      `${String(tabIndex).padStart(2, '0')}_${tabNombreClean}__${String(p.i + 1).padStart(2, '0')}_${tituloLimpio}.png`
    );
    try {
      await loc.scrollIntoViewIfNeeded({ timeout: 3000 });
      await page.waitForTimeout(200);
      await cerrarAlertas(page);                 // descartar alertas clínicas residuales
      await loc.screenshot({ path: ruta, timeout: 5000 });
    } catch {
      // Fallback: captura de viewport (mejor algo que nada).
      try { await page.screenshot({ path: ruta }); } catch { continue; }
    }
    log(`Captura panel: ${path.basename(ruta)}`, 'ok');
    evidencias.push({ titulo: p.titulo, ruta });
  }
  return evidencias;
}

async function rellenarCampos(page) {
  const semillas = cfg.semillasBusqueda || ['a01', 'ace', 'rad', 'eco'];
  let n = 0;

  if (cfg.expandirPaneles) await expandirPaneles(page);  // 0) abrir acordeones colapsados
  n += await llenarMultiselects(page, semillas);   // 1) agrega filas (diagnóstico, etc.)
  await page.waitForTimeout(300);
  const casillas = await marcarCasillasRequeridas(page); // 2) marcar incapacidad, etc.
  if (casillas) { n += casillas; await page.waitForTimeout(600); } // esperar que aparezcan campos
  n += await llenarTextoyRadios(page);             // 3) texto + radios (incl. filas nuevas)
  await cerrarAlertas(page);                        // cerrar alertas de signos vitales
  n += await llenarSelects(page);                  // 4) selects (incl. filas reveladas)
  await cerrarAlertas(page);                        // por si algún select dispara alerta

  if (n > 0) log(`Campos rellenados: ${n}`, 'ok');
  return n;
}

// ── Auditar campos que quedan inválidos tras el llenado ──────
// Devuelve la lista de campos con clase ng-invalid u "obligatorio"
// que están visibles, con una etiqueta para identificarlos.
async function auditarInvalidos(page) {
  return await page.evaluate(() => {
    const out = [];
    const sel = 'input.ng-invalid, select.ng-invalid, textarea.ng-invalid, .obligatorio';
    document.querySelectorAll(sel).forEach((el) => {
      if (el.offsetParent === null) return; // no visible
      const tag = el.tagName.toLowerCase();
      if (!['input', 'select', 'textarea'].includes(tag)) return;
      // Buscar una etiqueta legible
      let label =
        el.getAttribute('name') ||
        el.getAttribute('formcontrolname') ||
        el.getAttribute('placeholder') ||
        el.getAttribute('id') ||
        '';
      // Intentar el <label> asociado o texto cercano
      if (!label) {
        const lab = el.closest('.form-group, .col, td, div')?.querySelector('label');
        if (lab) label = lab.textContent.trim().slice(0, 30);
      }
      out.push({
        campo: label || tag,
        tipo: el.type || tag,
        valor: (el.value || '').slice(0, 15),
      });
    });
    return out;
  });
}

// ── Navegar a un módulo ───────────────────────────────────────

async function navegarA(page, url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: cfg.tiempos.timeoutCarga });
  await esperarPaginaLista(page);
}

// ── Manejar modal PYM (Promoción y Mantenimiento) ────────────
// Aparece al abrir cualquier historia clínica. Carga opciones de forma
// asíncrona — hay que esperar que el último ítem ("Puerperio") cargue
// antes de hacer clic en Aceptar.

async function manejarModalPYM(page, programas = []) {
  try {
    await page.waitForSelector('div.modal-content', { state: 'visible', timeout: 15000 });
    log('Modal PYM detectado, esperando que carguen todas las opciones...');

    await page.waitForSelector('div.modal-body :text("Puerperio")', {
      state: 'visible',
      timeout: 30000,
    });
    await page.waitForTimeout(500);

    // ── Activar los programas elegidos (marcar su radio "SI") ──
    // Cada programa es una fila .form-group.row con un <label.text-pym-title>
    // y un par de radios SI/NO (el primero = SI). Ubicamos por texto del label.
    for (const nombre of programas) {
      try {
        const fila = page
          .locator('div.modal-content .form-group.row')
          .filter({ has: page.locator('label.text-pym-title', { hasText: new RegExp(`^\\s*${escaparRegex(nombre)}\\s*$`, 'i') }) });

        if (!(await fila.count())) {
          log(`PYM: programa "${nombre}" no encontrado en el modal`, 'warn');
          continue;
        }

        // El <input radio> está oculto (kt-radio); se hace clic en el LABEL "SI".
        const labelSi = fila.first()
          .locator('label.kt-radio')
          .filter({ hasText: /^\s*SI\s*$/i })
          .first();
        await labelSi.click({ timeout: 4000 });
        await page.waitForTimeout(150);

        // Confirmar que el input correspondiente quedó marcado
        const radioSi = labelSi.locator('input[type="radio"]').first();
        if (await radioSi.isChecked()) {
          log(`PYM: "${nombre}" activado (SI)`, 'ok');
        } else {
          log(`PYM: "${nombre}" no quedó marcado`, 'warn');
        }
      } catch (e) {
        log(`PYM: no se pudo activar "${nombre}": ${e.message.slice(0, 80)}`, 'warn');
      }
    }
    if (programas.length) await page.waitForTimeout(400);

    const btnAceptar = page
      .locator('div.modal-footer button, div.modal-body ~ * button, button')
      .filter({ hasText: 'Aceptar' });
    await btnAceptar.first().click();
    log(`Modal PYM cerrado con Aceptar${programas.length ? ` (activados: ${programas.join(', ')})` : ''}`, 'ok');

    await page.waitForSelector('div.modal-content', { state: 'hidden', timeout: 10000 });
    await esperarPaginaLista(page);
  } catch {
    log('Modal PYM no apareció o ya estaba cerrado', 'warn');
  }
}

// Escapa caracteres especiales de regex en un texto literal.
function escaparRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Manejar modal de Odontología ──────────────────────────────

async function manejarModalOdontologia(page, tipoVisita = 'Control') {
  try {
    // Esperar el modal hasta 8 segundos
    await page.waitForSelector('div.modal.show', { timeout: 8000 });
    log(`Modal de Odontología detectado, seleccionando: ${tipoVisita}`);
    // Buscar el botón que contenga el texto del tipo de visita
    const boton = page.locator(`div.modal-body button`).filter({ hasText: tipoVisita });
    await boton.first().click();
    await esperarPaginaLista(page);
  } catch {
    log('Modal de Odontología no apareció (el encuentro ya tiene tipo asignado)', 'warn');
  }
}

// ── Recorrer todos los tabs de un módulo ─────────────────────

async function recorrerTabs(page, carpetaRun, modulo, run, encId, logs, programasPYM = []) {
  let tabIndex = 1;

  while (true) {
    // Intentar obtener el tab número tabIndex
    // La clase tabset1 está en <ngb-tabset>; los tabs son <ul.nav-tabs><li.nav-item><a.nav-link>
    const selector = `.tabset1 ul.nav-tabs li.nav-item:nth-child(${tabIndex}) > a`;
    const tabEl = page.locator(selector);
    const existe = await tabEl.count() > 0;

    if (!existe) break; // No hay más tabs

    const tabNombreRaw = (await tabEl.textContent() || '').trim();
    if (!tabNombreRaw) break;

    const tabNombreClean = limpiarNombre(tabNombreRaw);
    log(`  Tab ${tabIndex}: ${tabNombreRaw}`);

    const inicio = Date.now();

    // Scrollear el tab bar para que el tab sea visible
    await page.evaluate((idx) => {
      const items = document.querySelectorAll('.tabset1 ul.nav-tabs li.nav-item');
      if (items[idx - 1]) {
        items[idx - 1].scrollIntoView({ behavior: 'instant', inline: 'center' });
      }
    }, tabIndex);

    await page.waitForTimeout(200);

    // Hacer clic en el tab
    let status = 'PASS';
    let error  = '';
    let manejadoPYM = false;  // true = ya se registraron filas panel-por-panel

    try {
      await tabEl.click();
      await esperarPaginaLista(page);

      // Rellenar campos con datos de prueba (si está activado en config)
      if (cfg.rellenarCampos) {
        await rellenarCampos(page);
        await page.waitForTimeout(400); // dejar que Angular procese

        // Auditar campos que quedan inválidos
        const invalidos = await auditarInvalidos(page);
        if (invalidos.length) {
          log(`Campos inválidos (${invalidos.length}): ${invalidos.map(x => `${x.campo}="${x.valor}"`).join(', ')}`, 'warn');
        }
      }

      // Detectar error de backend (SweetAlert "OK") antes de capturar.
      const errorApp = await detectarErrorApp(page);

      // ── Rama PYM: una fila por panel del acordeón ──
      const esPYM = cfg.evidenciaPanelPorPanelPYM && esTabPYM(tabNombreRaw, programasPYM);
      if (esPYM) {
        // Si hubo error de backend, registrarlo como una fila FAIL aparte.
        if (errorApp.hayError) {
          const rutaErr = path.join(carpetaRun, `${String(tabIndex).padStart(2, '0')}_${tabNombreClean}__00_Error.png`);
          await page.screenshot({ path: rutaErr }).catch(() => {});
          log(`Error de backend en tab "${tabNombreRaw}": ${errorApp.texto.slice(0, 140)}`, 'error');
          logs.push({
            fecha: fechaHoy(), modulo, run, encId: encId || '', tabIndex,
            tabNombre: `${tabNombreRaw} — Error de carga`, status: 'FAIL',
            error: ('Error de la app: ' + errorApp.texto).slice(0, 200),
            screenshot: rutaErr, hora: horaAhora(), duracion: '0',
          });
          await cerrarAlertaOK(page);
        }
        const paneles = await capturarPanelesPYM(page, carpetaRun, tabIndex, tabNombreClean);
        if (paneles.length) {
          manejadoPYM = true;
          const dur = ((Date.now() - inicio) / 1000).toFixed(1);
          for (const pnl of paneles) {
            logs.push({
              fecha: fechaHoy(), modulo, run, encId: encId || '', tabIndex,
              tabNombre: `${tabNombreRaw} — ${pnl.titulo}`, status: 'PASS', error: '',
              screenshot: pnl.ruta, hora: horaAhora(), duracion: dur,
            });
          }
          log(`Tab PYM "${tabNombreRaw}": ${paneles.length} paneles capturados`, 'ok');
        }
      }

      // ── Flujo normal (tab base o PYM sin acordeón): captura única ──
      if (!manejadoPYM) {
        const necesitaScroll = cfg.tabsConScroll.some(t =>
          tabNombreRaw.toLowerCase().includes(t.toLowerCase())
        );
        const rutaCaptura = path.join(
          carpetaRun,
          `${String(tabIndex).padStart(2, '0')}_${tabNombreClean}.png`
        );
        await tomarCaptura(page, rutaCaptura, necesitaScroll);

        if (errorApp.hayError) {
          status = 'FAIL';
          error  = ('Error de la app: ' + errorApp.texto).slice(0, 200);
          log(`Error de backend en tab "${tabNombreRaw}": ${errorApp.texto.slice(0, 140)}`, 'error');
          await cerrarAlertaOK(page);   // descartar el modal para continuar
        }
      }

    } catch (e) {
      status = 'FAIL';
      error  = e.message.slice(0, 120);
      log(`ERROR en tab "${tabNombreRaw}": ${error}`, 'error');
    }

    // Filas panel-por-panel ya se registraron arriba; aquí solo el caso normal.
    if (!manejadoPYM) {
      const duracion = ((Date.now() - inicio) / 1000).toFixed(1);
      logs.push({
        fecha:    fechaHoy(),
        modulo,
        run,
        encId:    encId || '',
        tabIndex,
        tabNombre: tabNombreRaw,
        status,
        error,
        screenshot: path.join(carpetaRun, `${String(tabIndex).padStart(2, '0')}_${tabNombreClean}.png`),
        hora:     horaAhora(),
        duracion,
      });
    }

    tabIndex++;
  }

  log(`Total tabs encontrados: ${tabIndex - 1}`, 'ok');
}

// ── Ejecutar un módulo completo ───────────────────────────────

async function ejecutarModulo(page, opciones, logs) {
  const { modulo, run, url, encId, carpetaBase, tipoModalOdonto, programasPYM } = opciones;

  log(`MÓDULO: ${modulo} — ${run}`, 'titulo');

  if (!encId && modulo !== 'NotaAdministrativa' && modulo !== 'Reimpresion') {
    log(`Sin ID configurado para ${modulo} — saltando`, 'warn');
    return;
  }

  const carpetaRun = path.join(carpetaBase, modulo, run);
  crearCarpeta(carpetaRun);

  await navegarA(page, url);

  await manejarModalPYM(page, programasPYM || []);

  if (modulo === 'Odontologia') {
    await manejarModalOdontologia(page, tipoModalOdonto || 'Control');
  }

  // Verificar si el módulo usa tabs
  const tieneTabs = await page.locator('.tabset1 ul.nav-tabs li.nav-item').count() > 0;

  if (tieneTabs) {
    await recorrerTabs(page, carpetaRun, modulo, run, encId, logs, programasPYM || []);
    // Presionar "Guardar" al terminar de llenar todos los tabs
    if (cfg.rellenarCampos && cfg.presionarGuardar) {
      const { ok, exitoPath } = await presionarGuardar(page, carpetaRun);
      // Registrar el guardado como un caso de prueba más (con la captura del éxito)
      logs.push({
        fecha: fechaHoy(), modulo, run, encId: encId || '',
        tabIndex: logs.length + 1,
        tabNombre: 'Guardado de Historia Clínica',
        status: ok ? 'PASS' : 'FAIL',
        error: ok ? '' : 'No se pudo completar el guardado/envío',
        screenshot: exitoPath || '',
        hora: horaAhora(), duracion: '0',
      });

      // Capturar los PDF del modal de impresión post-guardado
      if (ok && cfg.capturarImpresiones) {
        const evs = await capturarImpresiones(page, carpetaRun);
        for (const ev of evs) {
          logs.push({
            fecha: fechaHoy(), modulo, run, encId: encId || '',
            tabIndex: logs.length + 1,
            tabNombre: `Impresión - ${ev.nombre}`,
            status: 'PASS', error: '',
            screenshot: ev.ruta,
            hora: horaAhora(), duracion: '0',
          });
        }
      }
    }
  } else {
    // Módulo de formulario único (Procedimiento, Nota, Reimpresión)
    const rutaCaptura = path.join(carpetaRun, '01_Formulario_Principal.png');
    await tomarCaptura(page, rutaCaptura, true);
    logs.push({
      fecha: fechaHoy(), modulo, run, encId: encId || '',
      tabIndex: 1, tabNombre: 'Formulario_Principal',
      status: 'PASS', error: '',
      screenshot: rutaCaptura,
      hora: horaAhora(), duracion: '0',
    });
  }

  await page.waitForTimeout(cfg.tiempos.esperaEntreModulos);
}

// ── Generar reporte HTML visual ───────────────────────────────

function generarHTML(logs, carpetaBase, meta = {}) {
  const filas = logs.map(l => {
    const color = l.status === 'PASS' ? '#e2efda' : '#fce4d6';
    const imgRel = path.relative(carpetaBase, l.screenshot).replace(/\\/g, '/');
    return `
      <tr style="background:${color}">
        <td>${l.modulo}</td>
        <td>${l.run}</td>
        <td style="text-align:center">${l.tabIndex}</td>
        <td>${l.tabNombre}</td>
        <td style="text-align:center;font-weight:bold">${l.status}</td>
        <td>${l.error || ''}</td>
        <td style="text-align:center">
          ${fs.existsSync(l.screenshot)
            ? `<a href="${imgRel}" target="_blank">Ver captura</a>`
            : 'Sin captura'}
        </td>
        <td style="text-align:center">${l.duracion}s</td>
      </tr>`;
  }).join('');

  const total = logs.length;
  const pass  = logs.filter(l => l.status === 'PASS').length;
  const fail  = logs.filter(l => l.status === 'FAIL').length;
  const pct   = total > 0 ? ((pass / total) * 100).toFixed(1) : 0;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Reporte RPA — HCHealth ${fechaHoy()}</title>
<style>
  body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
  h1 { color: #1F3864; }
  .resumen { display: flex; gap: 20px; margin-bottom: 24px; }
  .card { background: white; border-radius: 8px; padding: 16px 24px; box-shadow: 0 2px 6px rgba(0,0,0,.12); min-width: 120px; text-align: center; }
  .card .num { font-size: 2em; font-weight: bold; }
  .card .lbl { color: #666; font-size: .9em; }
  .pass { color: #375623; }
  .fail { color: #9c0006; }
  table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 6px rgba(0,0,0,.12); }
  th { background: #1F3864; color: white; padding: 10px 12px; text-align: left; font-size: .9em; }
  td { padding: 8px 12px; font-size: .88em; border-bottom: 1px solid #e0e0e0; }
  a { color: #1F3864; }
</style>
</head>
<body>
<h1>Reporte RPA — HCHealth</h1>
<p>Fecha: <b>${fechaHoy()}</b> — Ejecutado a las <b>${horaAhora()}</b></p>
${(meta && (meta.pacienteId != null || meta.citaIdInt != null))
  ? `<p>PacienteId: <b>${meta.pacienteId ?? ''}</b> &nbsp;|&nbsp; Cita: <b>${meta.citaIdInt ?? ''}</b> → <code>${meta.citaId ?? ''}</code></p>`
  : ''}

<div class="resumen">
  <div class="card"><div class="num">${total}</div><div class="lbl">Total tabs</div></div>
  <div class="card"><div class="num pass">${pass}</div><div class="lbl">PASS</div></div>
  <div class="card"><div class="num fail">${fail}</div><div class="lbl">FAIL</div></div>
  <div class="card"><div class="num">${pct}%</div><div class="lbl">Éxito</div></div>
</div>

<table>
<thead>
  <tr>
    <th>Módulo</th><th>Run</th><th>Tab#</th><th>Nombre Tab</th>
    <th>Estado</th><th>Error</th><th>Captura</th><th>Duración</th>
  </tr>
</thead>
<tbody>${filas}</tbody>
</table>
</body>
</html>`;

  const rutaHTML = path.join(carpetaBase, `Reporte_${fechaHoy()}.html`);
  fs.writeFileSync(rutaHTML, html, 'utf8');
  log(`Reporte HTML guardado: ${rutaHTML}`, 'ok');
  return rutaHTML;
}

// ── Construir filas del checklist QA a partir de los logs ────
function construirFilas(logs, datos) {
  const esAlta = (flujo) =>
    /diagn|conducta|guardado|impres|incapac/i.test(flujo);
  return logs.map((l, i) => {
    const flujo = l.tabNombre;
    const esGuardado = /guardado/i.test(flujo);
    const esImpresion = /impresi/i.test(flujo);
    const aprobado = l.status === 'PASS';
    let escenario, esperado, obtenido;
    if (esImpresion) {
      const doc = flujo.replace(/impresi[óo]n\s*-\s*/i, '');
      escenario = `Generación e impresión del documento: ${doc}`;
      esperado = 'El sistema genera el PDF y lo abre correctamente en una nueva pestaña';
      obtenido = aprobado ? 'PDF generado y capturado correctamente' : (l.error || 'Error al generar el PDF');
    } else if (esGuardado) {
      escenario = 'Guardar la historia clínica y confirmar el envío de datos del paciente';
      esperado = 'El sistema guarda la HC y confirma el envío sin errores';
      obtenido = aprobado ? 'Guardado y envío completados correctamente' : (l.error || 'Falló el guardado');
    } else {
      escenario = `Diligenciamiento y validación de la sección "${flujo}"`;
      esperado = `La sección "${flujo}" carga y permite diligenciar la información sin errores`;
      obtenido = aprobado ? 'Sección diligenciada y capturada correctamente' : (l.error || 'Error en la sección');
    }
    const tieneScroll = l.screenshot &&
      fs.existsSync(l.screenshot.replace(/\.png$/i, '_scroll.png'));
    return {
      id: `HC-${String(i + 1).padStart(3, '0')}`,
      cliente: datos.cliente,
      ambiente: cfg.reporte.ambiente,
      modulo: cfg.reporte.moduloHeader,
      flujo,
      escenario,
      esperado,
      obtenido,
      estado: aprobado ? 'Aprobado' : 'Fallido',
      prioridad: esAlta(flujo) ? 'Alta' : 'Media',
      tester: cfg.reporte.testerDev,
      fecha: l.fecha || fechaHoy(),
      evidencia: l.screenshot || '',
      observaciones: tieneScroll ? 'Con captura de scroll' : '',
    };
  });
}

// ── Generar el reporte Excel invocando reporte.py (openpyxl) ──
function generarReporteExcel(logs, carpetaBase, datos) {
  const { spawnSync } = require('child_process');
  const filas = construirFilas(logs, datos);
  const meta = {
    moduloHeader: cfg.reporte.moduloHeader,
    version: cfg.reporte.version,
    ambiente: cfg.reporte.ambiente,
    tester: cfg.reporte.testerDev,
    desarrollador: datos.desarrollador,
    cliente: datos.cliente,
    fecha: fechaHoy(),
    pacienteId: datos.pacienteId,
    citaId: datos.citaId,
    citaIdInt: datos.citaIdInt,
  };
  const jsonPath = path.join(carpetaBase, 'reporte_data.json');
  const xlsxPath = path.join(carpetaBase, `Listado_Pruebas_HC_${fechaHoy()}.xlsx`);
  fs.writeFileSync(jsonPath, JSON.stringify({ meta, filas }, null, 2), 'utf8');

  // Empaquetado: usar reporte.exe (PyInstaller) junto al .exe.
  // Desarrollo: invocar python reporte.py (requiere Python + openpyxl).
  let cmd, args, cwd;
  if (cfg.empaquetado) {
    cmd = path.join(cfg.dirApp, 'reporte.exe');
    args = [jsonPath, xlsxPath];
    cwd = cfg.dirApp;
  } else {
    cmd = process.platform === 'win32' ? 'python' : 'python3';
    args = ['reporte.py', jsonPath, xlsxPath];
    cwd = __dirname;
  }
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) {
    log('Error al generar el Excel con Python: ' + (r.stderr || r.error || '').toString().slice(0, 200), 'error');
    return null;
  }
  const ruta = (r.stdout || '').trim() || xlsxPath;
  log(`Reporte Excel guardado: ${ruta}`, 'ok');
  return ruta;
}

// ── PROGRAMA PRINCIPAL ────────────────────────────────────────

(async () => {
  ui.banner();

  const carpetaBase = path.join(cfg.carpetaSalida, fechaHoy());
  crearCarpeta(carpetaBase);
  log(`Carpeta de salida: ${carpetaBase}`);

  const ids  = cfg.ids;
  const ext  = cfg.externo || {};
  let base   = process.env.BASE_URL || ext.baseUrl || cfg.urlBase;
  const logs = [];

  const interactivo = process.stdin.isTTY && !(cfg.bd && cfg.bd.autoConfirmar);

  // ── Datos del reporte: desarrollador y cliente ───────────────
  let desarrollador = process.env.DEV_NAME || ext.desarrollador || cfg.reporte.testerDev || 'QA Automatization';
  let cliente = ext.cliente || cfg.reporte.clienteDefault || 'NEPS';

  // ── Obtener la cita (generándola en la BD o usando una manual) ──
  let citaId = ids.morbilidad_adulto;  // fallback manual
  let citaIdInt = null;
  let pacienteId = parseInt(process.env.DB_PACIENTE_ID || ext.pacienteId || '80420', 10);

  if (interactivo) {
    log('Confirma los datos de la ejecución (Enter acepta el valor por defecto):', 'titulo');
    const datos = await prompts([
      { type: 'text', name: 'dev',     message: 'Nombre del desarrollador', initial: desarrollador },
      { type: 'text', name: 'cliente', message: 'Cliente',                  initial: cliente },
      { type: 'text', name: 'baseUrl', message: 'Base URL de la app',       initial: base },
    ]);
    if (datos.dev) desarrollador = datos.dev;
    if (datos.cliente) cliente = datos.cliente;
    if (datos.baseUrl) base = datos.baseUrl;
  }

  // ── Programas del modal PYM a activar ────────────────────────
  const pymCfg = cfg.pym || {};
  let programasPYM = Array.isArray(pymCfg.activar) ? [...pymCfg.activar] : [];

  if (interactivo && pymCfg.preguntar && Array.isArray(pymCfg.disponibles)) {
    const funcionales = Array.isArray(pymCfg.funcionales) ? pymCfg.funcionales : [];
    const sel = await prompts({
      type: 'multiselect',
      name: 'pym',
      message: 'Modal PYM — marca los programas a activar (espacio = marcar, Enter = confirmar)',
      hint: '- ↑↓ moverse · espacio marcar · a marcar todos · Enter confirmar',
      instructions: false,
      choices: pymCfg.disponibles.map(p => ({
        // Solo los validados se diligencian completos hoy; el resto se ofrecen igual.
        title: funcionales.includes(p) ? p : `${p} (no validado)`,
        value: p,
        selected: programasPYM.includes(p),
      })),
    });
    if (Array.isArray(sel.pym)) programasPYM = sel.pym;
  }
  log(`PYM a activar: ${programasPYM.length ? programasPYM.join(', ') : '(ninguno)'}`,
      programasPYM.length ? 'ok' : 'info');

  if (cfg.bd && cfg.bd.usarBD) {
    let connStr = process.env.DB_CONNECTION || ext.dbConnection || '';

    if (interactivo) {
      const resp = await prompts([
        { type: 'text',   name: 'conn',     message: 'Cadena de conexión', initial: connStr },
        { type: 'number', name: 'paciente', message: 'PacienteId',          initial: pacienteId },
      ]);
      if (resp.conn) connStr = resp.conn;
      if (resp.paciente) pacienteId = resp.paciente;
    } else {
      log(`Modo no interactivo — usando .env (PacienteId ${pacienteId})`, 'info');
    }

    if (!connStr) {
      log('No hay cadena de conexión (define "dbConnection" en config.json o DB_CONNECTION en .env)', 'error');
      process.exit(1);
    }

    const sp = ui.spinner(`Generando cita para PacienteId ${pacienteId}...`);
    try {
      citaIdInt = await generarCita(connStr, pacienteId);
      citaId = citaIdToBase64(citaIdInt);
      sp.succeed(`Cita generada: Id ${citaIdInt} → ${citaId}`);
    } catch (e) {
      sp.fail('No se pudo generar la cita: ' + e.message);
      process.exit(1);
    }
  } else {
    log(`Usando cita manual de config: ${citaId}`, 'info');
  }

  // ── Abrir navegador ──────────────────────────────────────────
  const spNav = ui.spinner('Abriendo navegador...');
  const lanzaOpts = {
    headless: false,
    args: [
      '--start-maximized',
      // localhost → [::1] sin cambiar el origen (evita CORS; server en IPv6)
      '--host-resolver-rules=MAP localhost [::1]',
    ],
  };
  // Empaquetado: usar el Chromium distribuido en "browser\" (pkg no lo incluye).
  if (cfg.empaquetado) {
    const chromePath = buscarChromeEmpaquetado();
    if (chromePath) lanzaOpts.executablePath = chromePath;
    else log('No se encontró Chromium en la carpeta "browser"; intentando el del sistema', 'warn');
  }
  const browser = await chromium.launch(lanzaOpts);
  const context = await browser.newContext({ viewport: null, locale: 'es-CO' });

  // Inyectar cookies de sesión cuando la URL NO es local (la app lee
  // "UsuarioMedico" de la cookie en producción; en localhost usa "mprueba").
  const esLocal = /localhost|127\.0\.0\.1|\[::1\]/.test(base);
  if (!esLocal && cfg.cookies && cfg.cookies.length) {
    try {
      const host = new URL(base).hostname;
      await context.addCookies(cfg.cookies.map(c => ({
        name: c.name,
        value: String(c.value),
        domain: host,
        path: '/',
        secure: base.startsWith('https'),
        sameSite: 'Lax',
      })));
      spNav.text = `Cookies de sesión inyectadas para ${host}`;
    } catch (e) {
      log('No se pudieron inyectar las cookies: ' + e.message.slice(0, 60), 'warn');
    }
  }

  const page = await context.newPage();
  spNav.succeed('Navegador abierto');

  // ── Lista de módulos a ejecutar ──────────────────────────────
  const modulos = [
    {
      modulo: 'Morbilidad',
      run:    `Run_Paciente_${pacienteId}`,
      url:    `${base}/HC/${citaId}`,
      encId:  citaId,
      pacienteId,
      citaIdInt,
      programasPYM,
    },
  ];

  // ── Ejecutar cada módulo ─────────────────────────────────────
  for (const mod of modulos) {
    await ejecutarModulo(page, { ...mod, carpetaBase }, logs);
  }

  // ── Generar reportes ─────────────────────────────────────────
  log('Generando reportes...', 'titulo');
  const datos = { desarrollador, cliente, pacienteId, citaId, citaIdInt };
  const spRep = ui.spinner('Generando reporte Excel (checklist + dashboard)...');
  let rutaExcel = null;
  try {
    rutaExcel = generarReporteExcel(logs, carpetaBase, datos);
    spRep.succeed('Reporte Excel generado');
  } catch (e) {
    spRep.fail('Error generando Excel: ' + e.message);
  }
  const rutaHTML = generarHTML(logs, carpetaBase, { pacienteId, citaId, citaIdInt });

  // ── Cerrar navegador (o dejarlo abierto según config) ────────
  if (cfg.cerrarNavegadorAlFinal) {
    await browser.close();
  } else {
    log('Navegador abierto para revisión. Ciérralo manualmente cuando termines.', 'ok');
  }

  // ── Resumen final ────────────────────────────────────────────
  ui.cajaResumen({
    total: logs.length,
    pass: logs.filter(l => l.status === 'PASS').length,
    fail: logs.filter(l => l.status === 'FAIL').length,
    paciente: pacienteId,
    citaId,
    citaIdInt,
    excel: rutaExcel ? path.basename(rutaExcel) : '(error)',
    html: path.basename(rutaHTML),
  });

})();
