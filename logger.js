// ============================================================
//  logger.js — Registro a archivo robusto para diagnóstico.
//  Escritura SÍNCRONA (appendFileSync): la última línea queda en
//  disco aunque el proceso se cuelgue o se cierre de golpe (clave
//  para diagnosticar el .exe lanzado con doble clic).
// ============================================================
const fs   = require('fs');
const path = require('path');
const util = require('util');

let rutaLog = null;

function ts() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
         `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

function stripAnsi(s) {
  // Quita códigos de color ANSI para que el archivo sea legible
  return String(s).replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');
}

// Inicializa el log probando varias carpetas candidatas (primera que sirva).
// Devuelve la ruta del archivo, o null si no se pudo crear ninguna.
function init(carpetasCandidatas) {
  const stamp = ts().replace(/[:.\s]/g, '-');
  for (const carpeta of carpetasCandidatas.filter(Boolean)) {
    try {
      if (!fs.existsSync(carpeta)) fs.mkdirSync(carpeta, { recursive: true });
      const r = path.join(carpeta, `rpa_log_${stamp}.txt`);
      fs.appendFileSync(r, `===== Inicio de corrida ${ts()} =====\n`);
      rutaLog = r;
      return r;
    } catch (_) { /* probar la siguiente */ }
  }
  return null;
}

function write(...partes) {
  if (!rutaLog) return;
  const linea = partes
    .map(x => (typeof x === 'string' ? x : util.inspect(x, { depth: 3 })))
    .join(' ');
  try { fs.appendFileSync(rutaLog, `[${ts()}] ${stripAnsi(linea)}\n`); } catch (_) {}
}

// Hace "tee": todo lo que va a console.log/console.error también se guarda.
// (Captura el banner, los log() de la UI y cualquier salida suelta.)
function hookConsola() {
  const origLog = console.log.bind(console);
  const origErr = console.error.bind(console);
  console.log = (...a) => { write(...a); origLog(...a); };
  console.error = (...a) => { write('STDERR', ...a); origErr(...a); };
}

function ruta() { return rutaLog; }

module.exports = { init, write, hookConsola, ruta };
