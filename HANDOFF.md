# HANDOFF — RPA HCHealth (Pruebas de Historias Clínicas)

> Documento de traspaso. Resume qué es el proyecto, cómo correrlo, cómo está
> construido, qué decisiones se tomaron y qué falta.
> Última actualización: 2026-06-03 (empaquetado autónomo + branding "RPA Historias Clínicas" validado).

---

## 1. Resumen ejecutivo

RPA (automatización) construido con **Playwright (Node.js)** que prueba de punta a
punta la **Historia Clínica de Morbilidad** de la app Angular **HCHealth**.

En cada corrida el robot:
1. **Genera una cita nueva** en SQL Server (ejecuta un SP) y la convierte a base64.
2. Abre la historia clínica `/HC/<base64>` en el navegador.
3. **Llena automáticamente** los 9 tabs con datos de prueba válidos.
4. **Guarda** la historia y confirma el envío de datos.
5. **Imprime y captura** los 4 PDF (Historia Clínica full, Medicamentos, Incapacidad, Ordenamientos).
6. Genera un **reporte Excel estilo QA Checklist** (con evidencias incrustadas y Dashboard con gráficos) + un reporte HTML.

Objetivo: reemplazar el llenado/verificación manual del checklist QA por un proceso automático con evidencias.

---

## 2. Arquitectura / Archivos

Carpeta del proyecto: **`C:\HCHealth_RPA_Output\playwright-rpa\`**

| Archivo | Rol |
|---|---|
| `rpa.js` | Orquestador principal (Playwright): prompts, navegación, llenado, guardado, impresiones, reportes. |
| `db.js` | Conexión a SQL Server (`mssql`), ejecuta el SP `agd_generar_citas`, convierte el Id de cita a base64. |
| `ui.js` | Consola vistosa con `chalk` (colores) + `ora` (spinners): banner, `log`, spinners, caja resumen. |
| `logger.js` | **Logs a archivo** (síncronos) para diagnóstico: `<carpetaSalida>\logs\rpa_log_*.txt`; tee de console + errores no atrapados. Clave para depurar el `.exe`. |
| `reporte.py` | **Generador del Excel QA** con `openpyxl`: hoja Checklist + Dashboard con gráficos + evidencias incrustadas. |
| `config.js` | Comportamiento configurable (toggles, semillas de búsqueda, datos de reporte, BD, **programas PYM**); detecta modo empaquetado y carga `config.json`. |
| `config.json.example` | Plantilla de config externa para el `.exe` (BD, URL, paciente, **carpeta de salida**); se distribuye como `config.json`. |
| `build/` | Empaquetado: `build.ps1`, `installer.iss`, `make-icon.py`, `icono.png`. Ver §13. |
| `recon-pym.js` | Utilidad de inspección (NO parte del flujo): abre una HC, espera el modal PYM y vuelca su estructura (controles, labels, selectores) a JSON + screenshot. Sirve para (re)mapear los programas del modal. |
| `.env` | Credenciales de BD y PacienteId (NO se sube a git). |
| `.env.example` | Plantilla de `.env` sin secretos. |
| `.gitignore` | Excluye `node_modules/` y `.env`. |
| `package.json` | Dependencias Node. |
| `HANDOFF.md` | Este documento. |

**Salida de cada corrida:** `C:\HCHealth_RPA_Output\<YYYY-MM-DD>\`
- `Morbilidad\Run_Paciente_<id>\*.png` — capturas por tab (+ `_scroll`) y `PRINT_*.png` (PDFs).
- `Listado_Pruebas_HC_<fecha>.xlsx` — reporte QA Checklist.
- `Reporte_<fecha>.html` — reporte visual rápido.
- `reporte_data.json` — datos que `rpa.js` pasa a `reporte.py`.

---

## 3. Requisitos

- **Node.js 22** (verificado v22.22.2) + dependencias (`npm install`):
  `playwright`, `exceljs`, `mssql`, `dotenv`, `chalk@4`, `ora@5`, `prompts`.
- **Navegador de Playwright**: `npx playwright install chromium` (ya instalado).
- **Python 3.12** con `openpyxl` y `Pillow` (ya instalados) — para `reporte.py`.
- **App Angular HCHealth** corriendo en `http://localhost:4200`.
  - ⚠️ El dev server escucha solo en **IPv6 (`::1`)**; Chromium resuelve `localhost`
    a IPv4 y da "connection refused". Se resuelve con el arg
    `--host-resolver-rules=MAP localhost [::1]` (ya configurado en `rpa.js`).
  - La Base URL es **editable por corrida** (prompt / `BASE_URL` en `.env` / `config.urlBase`).
- **Para URLs NO locales**: la app autentica leyendo la cookie `UsuarioMedico` (en
  localhost usa `"mprueba"` hardcodeado). El bot **inyecta cookies de sesión**
  automáticamente cuando la Base URL no es local (ver `config.cookies`:
  `UsuarioMedico`, `UsuarioPerfil`). Si producción setea más cookies, agregarlas ahí.
- **Acceso a la BD** `192.168.200.89` (SQL Server) desde la máquina.

---

## 4. Cómo correrlo

```powershell
cd "C:\HCHealth_RPA_Output\playwright-rpa"
node rpa.js
```

**Modo interactivo** (terminal): pregunta, con Enter para aceptar el default:
1. Nombre del desarrollador → va a "Responsable Dev" del reporte.
2. Cliente → columna Cliente (default `NEPS`).
3. **Base URL de la app** (default `http://localhost:4200`, o `.env BASE_URL`).
4. Cadena de conexión (default desde `.env`).
5. PacienteId (default desde `.env`, `80420`).

**Modo no interactivo** (CI/background, sin TTY): usa los valores de `.env` y
`config.js`. Para forzarlo aun con terminal: `config.js` → `bd.autoConfirmar: true`.

> Al terminar, el navegador queda **abierto** para revisión (config `cerrarNavegadorAlFinal: false`).
> Ciérralo manualmente; ahí termina el proceso de Node.

---

## 5. Flujo end-to-end (qué hace cada corrida)

1. **Cita**: `db.js` ejecuta `EXEC agd_generar_citas @PacienteId` → devuelve `Id` (entero, ej. 464030) → `base64("464030")` = `NDY0MDMw` → URL `/HC/NDY0MDMw`.
2. **Modal PYM** (Promoción y Mantenimiento): espera que cargue (hasta "Puerperio"),
   **activa los programas elegidos** marcando su radio "SI" (ver `config.pym`) y da
   "Aceptar". Activar un programa revela tabs/secciones condicionales (ej. Prenatal
   añade el tab "Prenatal"). El modal lista 16 programas; cada uno es una fila con
   label `.text-pym-title` + radios SI/NO. Se ubica por el texto del label y se hace
   clic en el **label** "SI" (el `<input radio>` está oculto por el estilo `kt-radio`,
   por eso `.check()` no sirve). Mapeado con `recon-pym.js`.
3. **Recorre los tabs** (9 base; +1 "Prenatal" si se activó ese programa) y en cada uno:
   - Dropdowns buscables (`angular2-multiselect`) primero: escribe semilla, espera resultados, elige el primero y da **Agregar** (diagnóstico, medicamento, orden) → aparecen filas nuevas.
   - Marca la casilla **"¿Requiere incapacidad?"** → revela su sub-formulario.
   - Texto / radios por JS (rápido, sin scroll). Radios SI/NO → **NO**.
   - Números: respetan `min`/`max`; los **signos vitales** usan valores clínicos normales (T.A 120/80, temp 36, SatO2 98, peso 65, talla 165) para no disparar alertas.
   - Selects: varias pasadas (elegir uno revela otros, ej. Tipo Incapacidad → grupoServicio/modalidad).
   - **Clasifica las alertas (SweetAlert2) por CONTENIDO** (no por ícono — el frontend
     muestra hasta errores de backend como `warning`):
     - **Clínicas / validación / info** (ej. "tamización mensual con IgM", remisiones,
       "faltan datos", cifras vitales altas) → `cerrarAlertas` las **descarta** (OK/Aceptar/
       Cerrar) y el bot continúa.
     - **Error de backend** (`error occurred|deserializ|exception|bsontype|no se pudo guardar`)
       → `detectarErrorApp` lo detecta → el tab se marca **FAIL** con la captura como
       evidencia y se cierra el modal para seguir.
     - **Éxito** (`guardado|éxito`) → se deja abierto para `capturarExito`.
   - Audita campos que queden inválidos (`.ng-invalid`/`.obligatorio`) y avisa.
   - Captura el tab (+ `_scroll` en tabs largos).
   - **Tabs de PYM** (revelados por programas activados, ej. Prenatal): en vez de una
     captura única, `expandirPaneles` abre todos los paneles del acordeón y
     `capturarPanelesPYM` toma un element screenshot de **cada panel**, registrando
     **una fila por panel** en el reporte (toggle `config.evidenciaPanelPorPanelPYM`).
4. **Guardar**: botón del sidebar (`guardarHistoriaClinica`) → modal "Confirmar datos del paciente" → **Enviar**. Captura el SweetAlert **"Guardado Correctamente"** (`GUARDADO_Exito.png`) como evidencia de la fila "Guardado de Historia Clínica".
5. **Impresiones** (modal "Información"):
   - Historia Clínica → Imprimir → **Versión full** → Continuar → captura el PDF (pestaña nueva).
   - Medicamentos / Incapacidad / Ordenamientos → Imprimir (abren PDF en pestaña) → captura.
6. **Reportes**: `rpa.js` arma las filas, escribe `reporte_data.json`, invoca `python reporte.py` → Excel; y genera el HTML.

---

## 6. Configuración

### `config.js`
| Clave | Para qué |
|---|---|
| `urlBase` | URL de la app por defecto (`http://localhost:4200`); editable por prompt. |
| `cookies` | Cookies de sesión a inyectar cuando la Base URL NO es local (`UsuarioMedico`, `UsuarioPerfil`). |
| `bd.usarBD` | `true` = genera cita desde BD; `false` = usa cita manual `ids.morbilidad_adulto`. |
| `bd.autoConfirmar` | `true` = no pregunta, usa `.env`/config directamente. |
| `rellenarCampos` | Activa/desactiva el llenado de campos. |
| `textoPrueba` | Texto para inputs/textareas (`PRUEBA RPA`). |
| `semillasBusqueda` | Palabras para dropdowns buscables (diagnósticos/medicamentos/órdenes). |
| `pym.activar` | Programas del modal PYM a marcar "SI" por defecto (ej. `['Prenatal']`). |
| `pym.preguntar` | `true` = en modo interactivo pregunta (multiselect, muestra los 16 a la vez) cuáles activar. |
| `pym.funcionales` | Programas validados end-to-end (ej. `['Prenatal']`); el resto sale como "(no validado)" en el prompt. |
| `pym.disponibles` | Catálogo de los 16 programas del modal (label exacto). Opciones del prompt. |
| `presionarGuardar` | Presiona "Guardar" al terminar. |
| `capturarImpresiones` | Captura los PDF del modal de impresión. |
| `cerrarNavegadorAlFinal` | `false` = deja el navegador abierto. |
| `tabsConScroll` | Tabs que requieren una 2ª captura con scroll. |
| `expandirPaneles` | Abre los paneles de `ngb-accordion` colapsados antes de llenar (ej. Prenatal). |
| `evidenciaPanelPorPanelPYM` | En tabs de PYM, captura cada panel del acordeón como fila propia del reporte. |
| `reporte.version/ambiente/moduloHeader/testerDev/clienteDefault` | Encabezado del reporte. |
| `tiempos.*` | Esperas (timeouts) ajustables. |

### `.env`
```
DB_CONNECTION=Data Source=192.168.200.89;Initial Catalog=db_everest_900440054_test;User ID=desarrollo;Password=***
DB_PACIENTE_ID=80420
# DEV_NAME=  (opcional, default del desarrollador en modo no interactivo)
```

---

## 7. El reporte Excel (`Listado_Pruebas_HC_<fecha>.xlsx`)

Réplica del template QA `Listado de Pruebas HC`. Generado por `reporte.py` (openpyxl).

- **Hoja `✅ Checklist`**: encabezado corporativo (Módulo, Versión, Ambiente, Fechas, **Responsable Dev** = desarrollador); 14 columnas (ID, Cliente, Ambiente, Módulo, Flujo, Escenario, Resultado Esperado/Obtenido, Estado, Prioridad, **Tester Dev = QA Automatization**, Fecha, **Evidencia** (captura incrustada), Observaciones). Formato condicional por Estado (verde/rojo…) y Prioridad; dropdowns; fila de totales con fórmulas `COUNTIF`.
- **Hoja `📊 Dashboard`**: métricas (Total/Aprobados/Fallidos, %Éxito…), **gráfico de pastel** (por Estado) y **de barras** (por Módulo), y resumen del ciclo.

**Mapeo de casos**: 1 fila por tab + "Guardado de Historia Clínica" + 4 filas "Impresión - …".
**Prioridad** inferida: Alta para Impresión Diagnóstica, Conducta, Guardado e Impresiones; Media el resto.

---

## 8. Decisiones y supuestos

- **IPv6/CORS**: origen debe ser `localhost` (no `[::1]`) para que el backend no rechace por CORS; Chromium conecta a `[::1]` vía host-resolver-rules.
- **base64**: se codifica el **Id entero** de la cita como string (verificado: `464005` → `NDY0MDA1`).
- **Valores asumidos** (en `config.js`, editables): Versión `1.0.0`, Ambiente `PRUEBAS`, Módulo `HISTORIAS CLINICAS`, Período del Dashboard = fecha de hoy, Criterio ≥ 90% aprobados.
- **Tester Dev** fijo = `QA Automatization`; **Responsable Dev** = nombre del desarrollador (prompt).
- Solo se captura la **página visible** (pág. 1) de cada PDF; en modo **headed** el visor PDF se captura bien (no sale en blanco).

---

## 9. Estado actual

✅ **Funcionando end-to-end** para **Morbilidad** con paciente adulto (PacienteId 80420),
incluyendo el programa **PYM Prenatal**.
- **Modal PYM**: selección por consola (multiselect, 16 programas) y activación por clic en
  el label "SI"; activar un programa revela su tab (Prenatal validado).
- **Acordeones**: se expanden todos los paneles antes de llenar (`expandirPaneles`).
- **Alertas**: clasificadas por contenido — clínicas/info se descartan, error de backend → tab FAIL.
- **Evidencia PYM**: captura **panel por panel** (una fila por panel del acordeón).
- Última corrida: **31 casos, 0 fallos** (incluye los 18 paneles de Prenatal + 4 impresiones).
- Cita fresca por corrida.

✅ **Empaquetado autónomo terminado y validado** (ver §13): instalador
**RPA Historias Clínicas** (con ícono y nombre propios) que corre sin Node/Python; config con
defaults listos (carpeta `C:/CheckLists` + clave); verificado corriendo el flujo completo desde
el `.exe` contra producción. Se resolvieron 2 bugs solo-del-`.exe` (rcedit corrompía el binario;
bytecode rompía `page.evaluate`) — ver gotchas en §13.

---

## 10. Pendientes / próximos pasos

> 👉 La lista priorizada y actualizada está en **`ROADMAP.md`**. Resumen abajo.


- **Extender a otros módulos**: Enfermería (`/enfermeria/:id`), Odontología (`/odontologia/:id`, tiene modal de tipo de visita), Nutrición (`/nutricion/:id`), Seguimiento (`/SeguimientoHC/:id`). El loop de tabs y el llenado ya son genéricos; falta el SP/IDs de cita por módulo y ajustar el `Módulo` del reporte.
- **Perfiles de paciente** para cubrir tabs condicionales (prenatal, niño <5/AIEPI, mujer→Mama/Cérvix, crónicos, etc.). Hoy solo se cubre el perfil del PacienteId configurado.
- **Recalcular fórmulas**: el Excel muestra las fórmulas; se calculan al abrirlo en Excel real (LibreOffice no está instalado para pre-cálculo).
- **Fallback PDF**: si alguna captura del visor PDF saliera en blanco, rasterizar el PDF (ej. PyMuPDF). Hoy no hace falta (headed funciona).

> Nota: el código muerto `generarExcel` (ExcelJS) ya fue eliminado; el reporte
> se genera solo con `reporte.py`. La dependencia `exceljs` se quitó de `package.json`.

---

## 11. Problemas conocidos / troubleshooting

| Síntoma | Causa / Solución |
|---|---|
| `ERR_CONNECTION_REFUSED` en localhost:4200 | El dev server escucha en IPv6. Ya resuelto con host-resolver-rules; verifica que la app esté corriendo. |
| Búsquedas (medicamentos/órdenes) sin resultados | El backend rechaza por CORS si el origen no es `localhost`. No cambiar `urlBase` a `[::1]`. |
| `EBUSY: resource busy` al guardar el Excel | El archivo está abierto en Excel; el script guarda con sufijo de hora automáticamente. |
| La cita se repite | Solo pasa si `bd.usarBD=false` (cita manual). Con BD siempre genera una nueva. |
| Captura de PDF en blanco | Solo riesgo en headless; el proyecto corre headed (`headless:false`). |
| El proceso "no termina" | Es intencional: el navegador queda abierto. Ciérralo manualmente. |

---

## 12. Comandos útiles

```powershell
# Correr el RPA
cd "C:\HCHealth_RPA_Output\playwright-rpa"; node rpa.js

# Reinstalar dependencias
npm install

# Probar solo la conexión a BD (script ad-hoc; ver db.js)
node -e "require('dotenv').config(); const {generarCita,citaIdToBase64}=require('./db'); generarCita(process.env.DB_CONNECTION, +process.env.DB_PACIENTE_ID).then(id=>console.log(id, citaIdToBase64(id)))"

# Regenerar el Excel a partir de un reporte_data.json existente
python reporte.py "<ruta>\reporte_data.json" "<ruta>\salida.xlsx"
```

---

## 13. Empaquetado / distribución (herramienta autónoma)

El RPA puede empaquetarse en un entregable que corre **sin instalar Node ni Python**.
✅ **Verificado end-to-end** (Morbilidad completo: llena campos, captura todos los tabs +
los 18 paneles de Prenatal, genera Excel/HTML) corriendo desde el `.exe`.

El usuario final recibe **un instalador** (`RPA-HCHealth-Setup.exe`, ~170 MB, Inno Setup) con
identidad **"RPA Historias Clínicas"** (nombre + ícono propio) que despliega una carpeta con:
`RPA-HCHealth.exe` (rpa.js vía `@yao-pkg/pkg`) · `reporte.exe` (reporte.py vía
PyInstaller) · `browser\` (Chromium de Playwright, ~300 MB) · `config.json` · `icono.ico` ·
`LEEME.txt`. El usuario instala → doble clic en el acceso directo → corre (sin editar nada).

**Cómo el código detecta el modo empaquetado** (sin romper `node rpa.js` en dev):
- `config.js` expone `empaquetado` (`!!process.pkg`) y `dirApp`
  (`path.dirname(process.execPath)` cuando empaquetado, si no `__dirname`).
- `config.js` carga overrides desde `config.json` (junto al .exe) → `cfg.externo`
  (`dbConnection`, `pacienteId`, `baseUrl`, `cliente`, `desarrollador`, `carpetaSalida`).
  `rpa.js` los usa como fallback de `.env`: `process.env.X || cfg.externo.X || default`.
- `carpetaSalida` por defecto: el `config.json.example` que se distribuye ya trae
  `"C:/CheckLists"` (y la cadena de conexión con la clave real), así el usuario no edita nada.
  Si `carpetaSalida` queda vacío: empaquetado → `Salidas\` junto al .exe; dev → `C:\HCHealth_RPA_Output`.
- **Reporte**: empaquetado spawnea `reporte.exe`; dev sigue usando `python reporte.py`.
- **Chromium**: empaquetado usa `executablePath` localizando `chrome.exe` bajo `browser\`
  (`buscarChromeEmpaquetado` en `rpa.js`); dev usa el del caché de Playwright.
- **Logs de diagnóstico** (`logger.js`): cada corrida escribe `<carpetaSalida>\logs\rpa_log_*.txt`
  (síncrono, sobrevive a cuelgues/cierres); captura console + errores no atrapados. Fue lo que
  permitió diagnosticar los bugs del empaquetado.
- ⚠️ La contraseña de BD queda en texto plano en `config.json` **y en `config.json.example`**
  (decisión de comodidad; el repo es solo local). `config.json` real está en `.gitignore`.
  **El instalador contiene la clave** → no subirlo a sitios públicos.

**⚠️ Gotchas críticos del empaquetado (NO romper):**
1. **pkg debe ir `--no-bytecode --public --public-packages "*"`**. Por defecto pkg compila el
   JS a bytecode V8, lo que **rompe `page.evaluate()` de Playwright** con
   `Passed function is not well-serializable!` (Playwright necesita el código FUENTE de la
   función). Sin esto, el `.exe` falla en el primer tab (Anamnesis) y la ventana se cierra.
2. **NO usar rcedit sobre el `.exe` de pkg.** rcedit reescribe la sección de recursos y
   **desplaza el payload** que pkg appende al final → `Pkg: Error reading from file` (no abre).
   El ícono/nombre se aplican vía el instalador y los accesos directos (`installer.iss` apunta
   a `icono.ico`), sin tocar el binario.

**Cómo construir el entregable:**
```powershell
npm run build      # = powershell -File build\build.ps1
```
Requisitos en la máquina de **build** (no en la del usuario): Node 22, Python +
`pyinstaller`/`openpyxl`/`Pillow`, Chromium de Playwright instalado, e Inno Setup 6
(opcional; sin él, `dist\` queda como carpeta portátil para comprimir en .zip).
Archivos: `build\build.ps1` (orquesta pkg + PyInstaller + Chromium + ícono + Inno),
`build\installer.iss` (definición del instalador, UTF-8 con BOM por los acentos),
`build\make-icon.py` (PNG→ICO: quita fondo oscuro + recorta), `build\icono.png` (fuente del
ícono), `config.json.example`, `LEEME.txt`. (`build\set-icon.js`/rcedit quedó **sin uso** tras
el gotcha #2.)
