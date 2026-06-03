// ============================================================
//  RECON del modal PYM (Promoción y Mantenimiento)
//  Uso: node recon-pym.js
//
//  No forma parte del flujo del RPA. Abre una historia clínica,
//  espera el modal PYM y VUELCA su estructura (checkboxes, radios,
//  botones, labels y selectores estables) a un JSON + screenshot,
//  para poder mapear qué opciones existen (Prenatal, Puerperio, ...)
//  y construir luego la selección previa en config/prompt.
//
//  Reusa la misma generación de cita y launch que rpa.js.
// ============================================================

require('dotenv').config();
const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');
const cfg  = require('./config');
const ui   = require('./ui');
const { generarCita, citaIdToBase64 } = require('./db');

function fechaHoy() { return new Date().toISOString().slice(0, 10); }
function log(m, t = 'info') { ui.log(m, t); }

async function esperarPaginaLista(page) {
  try {
    await page.waitForSelector('.loaderSmall', { state: 'hidden', timeout: cfg.tiempos.timeoutCarga });
  } catch {}
  await page.waitForTimeout(600);
}

(async () => {
  ui.banner();

  const carpetaBase = path.join(cfg.carpetaSalida, fechaHoy(), 'recon-pym');
  if (!fs.existsSync(carpetaBase)) fs.mkdirSync(carpetaBase, { recursive: true });

  const base = process.env.BASE_URL || cfg.urlBase;
  let citaId = cfg.ids.morbilidad_adulto;
  let citaIdInt = null;
  const pacienteId = parseInt(process.env.DB_PACIENTE_ID || '80420', 10);

  // ── Generar cita (igual que rpa.js) ──────────────────────────
  if (cfg.bd && cfg.bd.usarBD) {
    const connStr = process.env.DB_CONNECTION || '';
    if (!connStr) { log('Falta DB_CONNECTION en .env', 'error'); process.exit(1); }
    const sp = ui.spinner(`Generando cita para PacienteId ${pacienteId}...`);
    try {
      citaIdInt = await generarCita(connStr, pacienteId);
      citaId = citaIdToBase64(citaIdInt);
      sp.succeed(`Cita generada: Id ${citaIdInt} → ${citaId}`);
    } catch (e) { sp.fail('No se pudo generar la cita: ' + e.message); process.exit(1); }
  } else {
    log(`Usando cita manual de config: ${citaId}`, 'info');
  }

  // ── Launch (idéntico a rpa.js: IPv6 + origen localhost) ──────
  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized', '--host-resolver-rules=MAP localhost [::1]'],
  });
  const context = await browser.newContext({ viewport: null, locale: 'es-CO' });

  const esLocal = /localhost|127\.0\.0\.1|\[::1\]/.test(base);
  if (!esLocal && cfg.cookies && cfg.cookies.length) {
    try {
      const host = new URL(base).hostname;
      await context.addCookies(cfg.cookies.map(c => ({
        name: c.name, value: String(c.value), domain: host, path: '/',
        secure: base.startsWith('https'), sameSite: 'Lax',
      })));
    } catch {}
  }

  const page = await context.newPage();
  const url = `${base}/HC/${citaId}`;
  log(`Abriendo ${url}`, 'titulo');
  await page.goto(url, { waitUntil: 'networkidle', timeout: cfg.tiempos.timeoutCarga });
  await esperarPaginaLista(page);

  // ── Esperar el modal PYM (igual criterio que rpa.js) ─────────
  log('Esperando modal PYM (hasta que cargue "Puerperio")...');
  try {
    await page.waitForSelector('div.modal-content', { state: 'visible', timeout: 15000 });
    await page.waitForSelector('div.modal-body :text("Puerperio")', { state: 'visible', timeout: 30000 });
    await page.waitForTimeout(800);
  } catch {
    log('No apareció el modal PYM. ¿La cita ya tenía PYM asignado?', 'warn');
  }

  // ── Screenshot del modal ─────────────────────────────────────
  const shot = path.join(carpetaBase, `modal-pym_${citaIdInt || 'manual'}.png`);
  await page.screenshot({ path: shot, fullPage: false });
  log(`Screenshot: ${shot}`, 'ok');

  // ── Volcar la estructura del modal ───────────────────────────
  const dump = await page.evaluate(() => {
    const modal = document.querySelector('div.modal.show .modal-content')
               || document.querySelector('div.modal-content');
    if (!modal) return { error: 'No se encontró el modal en el DOM' };

    const texto = (el) => (el && (el.innerText || el.textContent) || '').replace(/\s+/g, ' ').trim();

    // Selector "razonable" para un elemento (id > formcontrolname > name > nth-of-type)
    const selectorDe = (el) => {
      if (el.id) return `#${el.id}`;
      const fcn = el.getAttribute && el.getAttribute('formcontrolname');
      if (fcn) return `[formcontrolname="${fcn}"]`;
      const nm = el.getAttribute && el.getAttribute('name');
      if (nm) return `[name="${nm}"]`;
      // fallback: tag + clase principal
      const cls = (el.className || '').toString().split(/\s+/).filter(Boolean)[0];
      return cls ? `${el.tagName.toLowerCase()}.${cls}` : el.tagName.toLowerCase();
    };

    // Label asociado a un control (for=, label contenedor, o texto cercano)
    const labelDe = (el) => {
      if (el.id) {
        const lf = modal.querySelector(`label[for="${el.id}"]`);
        if (lf) return texto(lf);
      }
      const labWrap = el.closest('label');
      if (labWrap) return texto(labWrap);
      // hermano siguiente o anterior con texto
      const sib = el.nextElementSibling || el.previousElementSibling;
      if (sib && texto(sib)) return texto(sib);
      // contenedor padre con poco texto
      const p = el.closest('div,li,span');
      if (p && texto(p).length < 80) return texto(p);
      return '';
    };

    const controles = [...modal.querySelectorAll('input, select, textarea')].map((el, i) => ({
      i,
      tag: el.tagName.toLowerCase(),
      type: el.type || '',
      checked: !!el.checked,
      value: el.value || '',
      disabled: !!el.disabled,
      visible: el.offsetParent !== null && el.offsetHeight > 0,
      id: el.id || '',
      name: el.getAttribute('name') || '',
      formcontrolname: el.getAttribute('formcontrolname') || '',
      selector: selectorDe(el),
      label: labelDe(el),
    }));

    const botones = [...modal.querySelectorAll('button, a.btn')].map((el, i) => ({
      i, tag: el.tagName.toLowerCase(),
      text: texto(el),
      class: (el.className || '').toString(),
      disabled: !!el.disabled,
      visible: el.offsetParent !== null && el.offsetHeight > 0,
      selector: selectorDe(el),
    }));

    return {
      titulo: texto(modal.querySelector('.modal-title, h4, h3, h5')),
      htmlBody: (modal.querySelector('.modal-body') || modal).innerHTML.slice(0, 20000),
      controles,
      botones,
    };
  });

  const outJson = path.join(carpetaBase, `modal-pym_${citaIdInt || 'manual'}.json`);
  fs.writeFileSync(outJson, JSON.stringify({
    url, citaIdInt, citaId, pacienteId, fecha: fechaHoy(), dump,
  }, null, 2), 'utf8');
  log(`Volcado JSON: ${outJson}`, 'ok');

  // ── Resumen en consola ───────────────────────────────────────
  if (dump && dump.controles) {
    log(`Título modal: "${dump.titulo}"`, 'titulo');
    log(`Controles (input/select/textarea): ${dump.controles.length}`, 'ok');
    for (const c of dump.controles) {
      log(`  [${c.type || c.tag}] ${c.checked ? '☑' : '☐'} "${c.label}"  → ${c.selector}${c.visible ? '' : '  (oculto)'}`);
    }
    log(`Botones: ${dump.botones.map(b => `"${b.text}"`).join(', ')}`);
  } else {
    log('No se pudo volcar el modal: ' + (dump && dump.error || 'desconocido'), 'warn');
  }

  log('Recon completo. Revisa el JSON y el screenshot. El navegador queda abierto.', 'ok');
  // No cerramos el navegador: igual que rpa.js, lo dejamos abierto para inspección.
})();
