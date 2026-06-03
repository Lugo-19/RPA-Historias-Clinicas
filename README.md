# RPA Historias Clínicas

RPA (automatización) en **Playwright (Node.js)** que prueba de punta a punta la
**Historia Clínica de Morbilidad** de la app Angular **HCHealth**: genera una cita en
SQL Server, llena el formulario, lo guarda, imprime los documentos y produce un
**reporte QA Checklist en Excel** (con evidencias incrustadas y dashboard) + un reporte HTML.

Se distribuye como un **instalador autónomo de Windows** (`RPA Historias Clínicas`) que
corre **sin instalar Node ni Python** en la máquina del usuario final.

---

## ¿Cómo funciona?

En cada corrida el robot:

1. **Genera una cita nueva** en SQL Server (ejecuta el SP `agd_generar_citas`) y convierte
   el Id de la cita a base64 → forma la URL `/HC/<base64>`.
2. Abre la historia clínica en el navegador (Chromium, modo visible).
3. **Modal PYM** (Promoción y Mantenimiento): activa los programas configurados (p. ej.
   *Prenatal*) marcando su radio "SI"; activar un programa revela tabs/secciones extra.
4. **Recorre los tabs** y en cada uno: llena dropdowns buscables (diagnóstico, medicamento,
   orden), marca casillas, llena texto/números/selects con datos de prueba válidos, clasifica
   las alertas (SweetAlert2) por contenido (clínicas → se descartan; error de backend → tab
   **FAIL** con evidencia) y **captura pantalla** de cada tab (y panel por panel en los tabs
   de PYM).
5. **Guarda** la historia y confirma el envío; captura el "Guardado Correctamente".
6. **Imprime y captura** los 4 PDF (Historia Clínica, Medicamentos, Incapacidad, Ordenamientos).
7. Genera el **Excel QA Checklist** (vía `reporte.py`/`reporte.exe`) y un **reporte HTML**.

> Detalle completo de arquitectura y decisiones en **[`HANDOFF.md`](HANDOFF.md)**;
> pendientes y prioridades en **[`ROADMAP.md`](ROADMAP.md)**.

---

## Requisitos (máquina de desarrollo)

- **Node.js 22**
- **Python 3.12** (para el reporte Excel) con `openpyxl` y `Pillow`
- La **app Angular HCHealth** corriendo y accesible (por defecto `http://localhost:4200`)
- Acceso de red a la **base de datos** SQL Server

Para **generar el instalador**, además: **Inno Setup 6** y `pyinstaller`.

---

## Puesta en marcha tras clonar

> ⚠️ El repo **no incluye los secretos** (contraseña de BD). Tras clonar hay que recrear
> uno o dos archivos ignorados por git, según lo que vayas a hacer.

### A) Solo correr en desarrollo (`node rpa.js`)

```powershell
git clone https://github.com/Lugo-19/RPA-Historias-Clinicas.git
cd RPA-Historias-Clinicas

npm install                       # dependencias Node
npx playwright install chromium   # navegador de Playwright
pip install openpyxl Pillow       # para reporte.py

Copy-Item .env.example .env       # y edita .env: DB_CONNECTION y DB_PACIENTE_ID
node rpa.js
```

### B) Generar el instalador distribuible (`npm run build`)

Todo lo anterior, **más**:

```powershell
pip install pyinstaller           # (openpyxl/Pillow ya instalados)
# instala Inno Setup 6: https://jrsoftware.org/isdl.php

Copy-Item config.json.example config.local.json   # y edita: pon la contraseña real
npm run build
```

Resultado: **`release\RPA-HCHealth-Setup.exe`** (~170 MB), el único archivo que se
comparte con el usuario final.

### Archivos que SIEMPRE debes recrear al clonar (están en `.gitignore`)

| Archivo | Para qué | Cómo |
|---|---|---|
| `.env` | correr en desarrollo | `Copy-Item .env.example .env` + clave |
| `config.local.json` | generar el instalador (hornea la clave) | `Copy-Item config.json.example config.local.json` + clave |

---

## La herramienta empaquetada (usuario final)

El usuario recibe **un solo archivo**: `RPA-HCHealth-Setup.exe`.

1. Lo ejecuta → se instala con su ícono y nombre (`RPA Historias Clínicas`).
2. (Opcional) edita `config.json` (URL, paciente) — la **carpeta de salida y la contraseña
   ya vienen configuradas** en el build.
3. Doble clic en el acceso directo → el robot corre solo.

**Salida** en `C:\CheckLists\<fecha>\`:
- `Morbilidad\Run_Paciente_<id>\*.png` — capturas por tab e impresiones
- `Listado_Pruebas_HC_<fecha>.xlsx` — reporte QA
- `Reporte_<fecha>.html` — vista rápida
- `logs\rpa_log_*.txt` — log de diagnóstico de la corrida

> ⚠️ El instalador contiene la contraseña de la BD (horneada para comodidad).
> **No lo subas a sitios públicos**; compártelo solo con quien deba tenerla.

---

## Estructura del proyecto

| Archivo | Rol |
|---|---|
| `rpa.js` | Orquestador principal (Playwright): navegación, llenado, guardado, impresiones, reportes. |
| `db.js` | Conexión a SQL Server (`mssql`), genera la cita, base64. |
| `ui.js` | Consola con colores y spinners. |
| `logger.js` | Logs a archivo (diagnóstico). |
| `config.js` | Configuración y toggles; detecta modo empaquetado y carga `config.json`. |
| `reporte.py` | Generador del Excel QA (`openpyxl`). |
| `recon-pym.js` | Utilidad para (re)mapear el modal PYM (no es parte del flujo). |
| `build/` | Empaquetado: `build.ps1`, `installer.iss`, `make-icon.py`, `icono.png`. |

---

## Notas técnicas (gotchas del empaquetado)

Dos detalles **imprescindibles** al empaquetar con `pkg` (ya resueltos en `build.ps1`):

1. **`pkg` se invoca con `--no-bytecode --public --public-packages "*"`.** Por defecto `pkg`
   compila a bytecode V8, lo que rompe `page.evaluate()` de Playwright
   (`Passed function is not well-serializable!`).
2. **No se usa `rcedit` sobre el `.exe`.** Reescribir sus recursos desplaza el payload de
   `pkg` (`Pkg: Error reading from file`). El ícono/nombre se aplican vía el instalador y los
   accesos directos (`installer.iss`).

Más detalles y troubleshooting en [`HANDOFF.md`](HANDOFF.md).
