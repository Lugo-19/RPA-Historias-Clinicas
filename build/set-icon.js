// set-icon.js — Aplica icono y metadatos (nombre, descripcion) a un .exe ya
// compilado. pkg no setea ni icono ni propiedades; usamos rcedit.
// Uso: node build/set-icon.js <ruta.exe> <ruta.ico> [nombreProducto] [version]
// rcedit v5 exporta { rcedit }; versiones previas exportaban la funcion directa.
const mod = require('rcedit');
const rcedit = typeof mod === 'function' ? mod : mod.rcedit;

const [, , exe, ico, nombre, version] = process.argv;
if (!exe) {
  console.error('Uso: node build/set-icon.js <ruta.exe> [ruta.ico] [nombreProducto] [version]');
  process.exit(2);
}

const opciones = {};
if (ico && ico !== '-') opciones.icon = ico;
if (nombre) {
  opciones['version-string'] = {
    ProductName: nombre,
    FileDescription: nombre,
    CompanyName: 'QA Automatization',
    LegalCopyright: 'QA Automatization',
    OriginalFilename: 'RPA-HCHealth.exe',
  };
}
if (version) {
  opciones['product-version'] = version;
  opciones['file-version'] = version;
}

// rcedit a veces falla con "Unable to commit changes" cuando el .exe recien
// escrito por pkg esta bloqueado por el antivirus. Reintentamos con espera.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function aplicarConReintentos(intentos = 6, esperaMs = 2000) {
  let ultimoError;
  for (let i = 1; i <= intentos; i++) {
    try {
      await rcedit(exe, opciones);
      console.log(`Metadatos aplicados a ${exe}` + (nombre ? ` ("${nombre}")` : '') + (i > 1 ? ` (intento ${i})` : ''));
      return;
    } catch (e) {
      ultimoError = e;
      console.error(`  rcedit intento ${i}/${intentos} fallo: ${e.message.split('\n')[0]}`);
      if (i < intentos) await sleep(esperaMs);
    }
  }
  console.error('Error al aplicar metadatos tras varios intentos: ' + (ultimoError && ultimoError.message));
  process.exit(1);
}

aplicarConReintentos();
