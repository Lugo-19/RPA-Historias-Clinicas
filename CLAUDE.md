# CLAUDE.md — RPA HCHealth (playwright-rpa)

> Guía para sesiones de Claude que trabajen sobre este proyecto.

## Qué es

RPA en **Playwright (Node.js)** que prueba de punta a punta la **Historia Clínica
de Morbilidad** de la app Angular HCHealth: genera una cita en SQL Server, llena
el formulario, guarda, imprime documentos y produce un **reporte QA Checklist en
Excel** (con evidencias incrustadas y Dashboard). Corre en `localhost:4200` por
defecto.

## ⚠️ Regla #1 — Lee esto primero

Antes de tocar nada, lee **`HANDOFF.md`** (estado completo, arquitectura, cómo
correr) y **`ROADMAP.md`** (qué falta y prioridades). No reconstruyas contexto
desde cero: ya está documentado ahí.

## Gotchas críticos (no romper)

1. **IPv6**: el dev server escucha solo en `::1`. Chromium se lanza con
   `--host-resolver-rules=MAP localhost [::1]` (en `rpa.js`). No quitar.
2. **CORS**: el origen DEBE ser `localhost` (no `[::1]`), o el backend rechaza las
   búsquedas (medicamentos/órdenes). No cambiar `urlBase` a `[::1]`.
3. **Navegador abierto al final**: es intencional (`cerrarNavegadorAlFinal: false`).
   El proceso de Node no termina hasta cerrarlo a mano.
4. **Reporte = Python**: el Excel lo genera `reporte.py` (openpyxl), NO ExcelJS.

## Cómo correr

```powershell
cd "C:\HCHealth_RPA_Output\playwright-rpa"
node rpa.js
```
Pregunta (Enter acepta default): desarrollador, cliente, Base URL, cadena de
conexión, PacienteId. Requiere la app Angular corriendo en `localhost:4200`.

## Estructura

`rpa.js` (orquestador) · `db.js` (SQL Server) · `ui.js` (consola) ·
`reporte.py` (Excel) · `config.js` (toggles) · `.env` (credenciales).

## Reglas de trabajo

- **No subir `.env`** (tiene la contraseña de la BD). Ya está en `.gitignore`.
- Cambios funcionales: probar con `node rpa.js` (no solo `--check`).
- Al terminar una mejora grande, actualizar `HANDOFF.md` y `ROADMAP.md`.
