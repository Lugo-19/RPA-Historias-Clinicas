# ROADMAP — RPA HCHealth

Pendientes priorizados para futuras sesiones. Estado: ✅ Morbilidad end-to-end
(paciente adulto) + **programa PYM Prenatal** (selección por consola, activación,
expansión de acordeones, clasificación de alertas y evidencia panel-por-panel) +
✅ **empaquetado autónomo** distribuible (instalador "RPA Historias Clínicas", sin Node/Python,
validado corriendo el flujo completo desde el `.exe`).
Ver `HANDOFF.md` para el detalle del sistema actual.

---

## Cómo arrancar una sesión nueva

Mensaje sugerido de inicio:
> *"Trabaja sobre el RPA en `C:\HCHealth_RPA_Output\playwright-rpa`. Lee primero
> `HANDOFF.md` y `ROADMAP.md`. Quiero añadir: \<lo que sea\>."*

---

## Prioridad ALTA

- [ ] **Extender a otros módulos** (la lógica de tabs y llenado ya es genérica):
  - Enfermería (`/enfermeria/:id`)
  - Odontología (`/odontologia/:id`) — tiene **modal de tipo de visita** al cargar (ya hay `manejarModalOdontologia`); validar.
  - Nutrición (`/nutricion/:id`)
  - Seguimiento (`/SeguimientoHC/:id`) — ⚠️ ruta con mayúsculas.
  - Requiere: SP/IDs de cita por módulo y ajustar el campo `Módulo` del reporte.

## Prioridad MEDIA

- [ ] **Perfiles de paciente** para cubrir tabs condicionales que hoy no se ven:
  niño <5 / AIEPI, mujer → Mama/Cérvix, crónicos (Ruta Crónicos), etc.
  Hoy solo se cubre el perfil del PacienteId configurado (adulto).
  - [x] **Modal PYM mapeado** (16 programas) y **selección previa** implementada:
    `config.pym.activar` + prompt **multiselect** (muestra los 16 a la vez, marcar
    varios con espacio; los no validados salen como "(no validado)" vía
    `config.pym.funcionales`). Activar un programa revela sus tabs/secciones.
    **Prenatal** validado: añade el tab "Prenatal" y se diligencia completo
    (≈216 campos). Mapeo/inspección con `recon-pym.js`.
  - [x] **Error de backend → tab FAIL:** si un tab dispara un SweetAlert de error
    del servidor (deserialización Mongo, excepción, etc.), el RPA lo detecta
    (`detectarErrorApp`), captura el screenshot como evidencia, marca el tab como
    **Fallido** en el reporte y cierra el modal ("OK") para continuar.
  - [ ] ⚠️ **Hallazgo (bug de app, intermitente):** el tab Prenatal a veces lanza un
    error de deserialización Mongo ("Cannot deserialize a 'DateTime' from BsonType
    'Null'" en `HC_MasterPrenatal.Consultas`). No se repite en todas las citas. El
    RPA ya lo marca FAIL + evidencia cuando ocurre. Reportar al equipo de la app.
  - [x] **Clasificación de alertas (SweetAlert2) por contenido** — fundamentada en el
    código del frontend (`prenatal.component.ts`, `morbilidad/index.component.ts`):
    clínicas/info (ej. "tamización mensual con IgM") → se descartan y se continúa;
    error de backend → tab FAIL + evidencia; éxito → se captura. Resuelve el bloqueo
    por el popup de tamización.
  - [x] **Llenado 100% de Prenatal**: `expandirPaneles` (rpa.js) abre todos los paneles
    de `ngb-accordion` colapsados (toggle `h4.titletabs`/`[ngbPanelToggle]`, con dedupe
    para anidados) antes de llenar. Verificado: Prenatal expande **18 paneles** (Gestación,
    3 trimestres de exámenes con Toxoplasma, Monitoreo, riesgos, Chagas…) y se diligencian
    los campos vacíos sin bloqueo. Toggle global `config.expandirPaneles`.
  - [x] **Evidencia panel-por-panel para tabs de PYM**: para los tabs revelados por
    programas activados (ej. Prenatal), `capturarPanelesPYM` toma un element screenshot
    recortado de **cada panel del acordeón** y lo registra como **una fila propia** en el
    checklist ("Prenatal — Gestación Actual", "Prenatal — Tamizaje de Chagas", …).
    Verificado: Prenatal genera 18 capturas/filas. Toggle `config.evidenciaPanelPorPanelPYM`.
    Los tabs base conservan su captura única. (Nota: el header sticky puede solaparse
    levemente arriba de cada panel; cosmético.)
  - [ ] Probar el resto de programas PYM (Cervix, Ruta Crónicos, Vacunacion, etc.)
    y mapear qué tab/sección revela cada uno. Nota: el modal solo muestra los programas
    con `pacienteAplica=true` (vienen de `/api/Morbilidad/ValidarAccesoProgramas`); el
    catálogo interno va de IDs 3–44 (`index.component.ts checkoptions()`).
- [ ] **Parametrizar el SP/paciente por tipo de prueba** (ej. distintos PacienteId
  o SP que genere citas de perfiles distintos) para automatizar varios perfiles
  en una corrida.
- [ ] **Selección de módulo a ejecutar** desde prompt/config (hoy fijo Morbilidad).

- [x] **Empaquetado como herramienta autónoma (.exe)** — ✅ **TERMINADO y validado end-to-end.**
  `npm run build` genera `release\RPA-HCHealth-Setup.exe` (~170 MB, instalador Inno Setup
  "RPA Historias Clínicas" con ícono propio). Corre sin Node/Python: `config.js`/`rpa.js`
  detectan `process.pkg` y usan `config.json` (defaults: `C:/CheckLists` + clave) + `reporte.exe`
  (PyInstaller) + Chromium en `browser\`; consola UTF-8 (`chcp 65001`); logs en
  `<carpetaSalida>\logs\`. **Verificado** corriendo el flujo completo desde el `.exe`
  (llena campos, captura tabs + 18 paneles de Prenatal). Ver HANDOFF.md §13.
  - [x] **2 bugs solo-del-`.exe` resueltos** (ver gotchas §13): (a) rcedit corrompía el binario
    de pkg (`Pkg: Error reading from file`) → ícono vía instalador, no rcedit; (b) bytecode de
    pkg rompía `page.evaluate` de Playwright (`not well-serializable`) → `--no-bytecode`.
  - [x] **Ícono + nombre** "RPA Historias Clínicas" (fondo transparente, `make-icon.py`).
  - [x] **Sistema de logs a archivo** (`logger.js`) para diagnóstico del `.exe`.

## Prioridad BAJA

- [ ] **Fallback de rasterización PDF** (PyMuPDF) por si alguna captura del visor
  PDF saliera en blanco (hoy en headed funciona bien).
- [ ] **Pre-cálculo de fórmulas** del Excel (requiere LibreOffice; hoy se calculan
  al abrir en Excel).
- [ ] **Cookies/usuarios adicionales** si el login de producción setea más cookies
  que `UsuarioMedico`/`UsuarioPerfil`.
- [ ] **Más páginas de evidencia PDF** (hoy se captura solo la página visible).

---

## Ideas / mejoras opcionales

- Reintentos automáticos si la app o la BD fallan transitoriamente.
- Modo "solo reporte" (regenerar Excel desde un `reporte_data.json` existente).
- Integración CI (correr headless en un agente con la app y BD accesibles).
