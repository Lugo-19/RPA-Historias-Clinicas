# ROADMAP — RPA HCHealth

Pendientes priorizados para futuras sesiones. Estado v1.0.0: ✅ Morbilidad
funcionando end-to-end (paciente adulto). Ver `HANDOFF.md` para el detalle del
sistema actual.

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
  prenatal, niño <5 / AIEPI, mujer → Mama/Cérvix, crónicos (Ruta Crónicos), etc.
  Hoy solo se cubre el perfil del PacienteId configurado (adulto).
- [ ] **Parametrizar el SP/paciente por tipo de prueba** (ej. distintos PacienteId
  o SP que genere citas de perfiles distintos) para automatizar varios perfiles
  en una corrida.
- [ ] **Selección de módulo a ejecutar** desde prompt/config (hoy fijo Morbilidad).

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
