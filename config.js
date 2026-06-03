// ============================================================
//  CONFIGURACIÓN DEL RPA — HCHealth
//  Edita este archivo antes de correr el robot.
//  Solo necesitas cambiar los números de los IDs (citaId).
// ============================================================

module.exports = {

  // ── Reporte QA Checklist (encabezado del Excel) ─────────────
  reporte: {
    version:      '1.0.0',
    ambiente:     'PRUEBAS',
    moduloHeader: 'HISTORIAS CLINICAS',
    testerDev:    'QA Automatization',  // Responsable de las pruebas (columna Tester Dev)
    clienteDefault: 'NEPS',
  },

  // ── Base de datos (generación de cita por SP) ───────────────
  // La cadena de conexión y el PacienteId van en el archivo .env
  // (DB_CONNECTION y DB_PACIENTE_ID). Aquí solo el comportamiento.
  bd: {
    usarBD: true,         // false = usar cita manual (ids.morbilidad_adulto), sin BD
    autoConfirmar: false, // true = no preguntar, usar valores de .env directamente
  },

  // URL base de la aplicación
  // Origen = localhost (necesario para que el backend no rechace por CORS).
  // El servidor escucha en IPv6 (::1); Chromium se configura para resolver
  // "localhost" a [::1] vía host-resolver-rules (ver rpa.js).
  urlBase: 'http://localhost:4200',

  // ── Cookies de sesión (solo para URLs NO locales) ───────────
  // En localhost la app usa el usuario "mprueba" hardcodeado; en una URL
  // de producción/test lee la cookie "UsuarioMedico". Estas cookies se
  // inyectan automáticamente cuando la Base URL no es localhost.
  cookies: [
    { name: 'UsuarioMedico', value: 'mprueba' },
    { name: 'UsuarioPerfil', value: '66' },
  ],

  // ── IDs de los encuentros (citaId) ──────────────────────────
  // Son los números que aparecen en la URL cuando abres
  // una historia clínica. Ejemplo: http://localhost:4200/HC/12345
  // El ID sería: '12345'
  //
  // Llena cada uno con el ID del paciente de prueba correspondiente.
  // Si no tienes un tipo de paciente, deja el valor como null
  // y ese módulo se saltará automáticamente.

  ids: {
    // ── Morbilidad (/HC/:id) ──────────────────────────────────
    // Necesitas hasta 3 pacientes distintos para ver todos los tabs
    morbilidad_adulto:        'NDY0MDA1',  // Adulto — cita 464005
    morbilidad_prenatal:      null,
    morbilidad_nino:          null,

    // ── Enfermería (/enfermeria/:id) ──────────────────────────
    enfermeria:               null,

    // ── Odontología (/odontologia/:id) ───────────────────────
    odontologia:              null,

    // ── Nutrición (/nutricion/:id) ────────────────────────────
    nutricion:                null,

    // ── Seguimiento (/SeguimientoHC/:id) ─────────────────────
    seguimiento:              null,

    // ── Procedimiento (/procedimiento/:id) ───────────────────
    procedimiento:            null,
  },

  // ── Carpeta donde se guardan las capturas y el reporte ──────
  // Se crea automáticamente si no existe.
  carpetaSalida: 'C:\\HCHealth_RPA_Output',

  // ── ¿Rellenar campos automáticamente antes de capturar? ─────
  // true  = el robot escribe datos de prueba en cada campo
  // false = solo navega y captura sin llenar nada
  rellenarCampos: true,

  // Texto que se escribe en los campos de texto
  textoPrueba: 'PRUEBA RPA',

  // Palabras semilla para dropdowns buscables. El robot prueba cada una
  // hasta obtener resultados. Cubren distintos tipos de búsqueda:
  //   diagnósticos CIE-10 (a01), medicamentos (ace=acetaminofén, met, ome),
  //   laboratorios (hem=hemograma, glu=glucosa), procedimientos (eco, con).
  semillasBusqueda: ['a01', 'ace', 'rad', 'eco', 'met', 'ome', 'hem', 'glu', 'con', 'dol'],

  // ── Comportamiento al terminar ──────────────────────────────
  // Mantener el navegador abierto al terminar (para revisar el resultado).
  // Si es false, la ventana queda abierta y debes cerrarla manualmente.
  cerrarNavegadorAlFinal: false,

  // Presionar el botón "Guardar" del sidebar al terminar de llenar.
  presionarGuardar: true,

  // Capturar los PDF del modal de impresión que aparece tras guardar
  // (Historia Clínica full, Medicamentos, Incapacidad, Ordenamientos).
  capturarImpresiones: true,

  // Casillas (checkboxes) que el bot debe MARCAR para revelar y llenar
  // los sub-formularios que aparecen (ej: "¿Requiere incapacidad?").
  casillasARevisar: ['incapacidad'],

  // Expandir los paneles de acordeón (ngb-accordion) antes de llenar, para
  // que los campos de paneles colapsados (ej. Prenatal: Gestación Actual,
  // Exámenes por trimestre, Monitoreo) también se diligencien y capturen.
  expandirPaneles: true,

  // Para tabs de PYM (revelados por programas activados): capturar cada panel
  // del acordeón por separado y registrarlo como una fila propia en el reporte.
  // Los tabs base conservan la captura única.
  evidenciaPanelPorPanelPYM: true,

  // ── Modal PYM (Promoción y Mantenimiento) ───────────────────
  // Al abrir una HC aparece el modal PYM con una lista de programas.
  // El robot ubica cada fila por el texto de su label y marca el radio "SI"
  // de los programas que actives aquí; el resto quedan en "NO" (default).
  // Activar un programa revela su(s) tab(s)/sección(es) en la historia.
  pym: {
    // Programas a activar por defecto (deben coincidir con un label de
    // `disponibles`). Vacío = no activa ninguno (solo "Aceptar").
    activar: ['Prenatal'],

    // En modo interactivo, preguntar por consola (multiselect) cuáles
    // activar antes de arrancar. En no interactivo se usa `activar`.
    preguntar: true,

    // Programas VALIDADOS end-to-end (revelan su tab y se diligencian bien).
    // El resto se muestran en la consola "para seguir el flujo" pero con la
    // anotación "(no validado)". Por ahora solo Prenatal está validado.
    funcionales: ['Prenatal'],

    // Catálogo de programas del modal (label EXACTO como aparece en pantalla).
    // Mapeado por recon-pym.js. El número es el form-control interno (informativo).
    disponibles: [
      'Artritis Reumatoide',          // 42
      'VIH',                          // 43
      'Asma',                         // 44
      'Adulto',                       //  5
      'Planificacion Familiar',       //  6
      'Agudeza Visual y Auditiva',    //  7
      'Prenatal',                     //  8
      'Preconcepcional',              // 28
      'Ruta Crónicos',                //  9
      'Obesidad',                     // 37
      'Falla Cardiaca',               // 36
      'Tuberculosis',                 // 31
      'Cervix',                       // 12
      'EPOC',                         // 27
      'Salud Mental',                 //  3
      'Vacunacion',                   // 11
    ],
  },

  // ── Tiempos de espera (en milisegundos) ─────────────────────
  // Solo cambia estos valores si el robot va muy rápido o muy lento.
  tiempos: {
    esperaEntreModulos:   2000,   // Pausa entre un módulo y otro
    esperaEntreAcciones:   800,   // Pausa general entre acciones
    timeoutCarga:        60000,   // Máximo tiempo esperando que cargue (60 seg)
  },

  // ── Tabs que necesitan captura de scroll (son muy largos) ───
  // El robot tomará una segunda captura desplazando la página.
  tabsConScroll: [
    'Antecedentes',
    'Prenatal',
    'Examen',
    'Conducta',
    'Ruta',
    'Crónicos',
    'Lactancia',
    'Planificaci',
    'Salud Mental',
    'Diagnostica',
    'Impresi',
  ],

};
