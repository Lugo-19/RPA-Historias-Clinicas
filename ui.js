// ============================================================
//  ui.js — Consola vistosa: banner, log con color, spinners
// ============================================================
const chalk = require('chalk');
const ora = require('ora');

// ── Banner de inicio ──────────────────────────────────────────
function banner() {
  const linea = chalk.cyan('═'.repeat(54));
  console.log('');
  console.log(linea);
  console.log(
    chalk.bold.cyan('   🤖  RPA Historias Clínicas ') +
    chalk.gray('— Pruebas automatizadas')
  );
  console.log(linea);
  console.log('');
}

// ── Log coloreado por tipo ───────────────────────────────────
function log(mensaje, tipo = 'info') {
  switch (tipo) {
    case 'ok':
      console.log(chalk.green('  ✓ ') + mensaje);
      break;
    case 'warn':
      console.log(chalk.yellow('  ⚠ ') + chalk.yellow(mensaje));
      break;
    case 'error':
      console.log(chalk.red('  ✗ ') + chalk.red(mensaje));
      break;
    case 'titulo':
      console.log('\n' + chalk.bold.blue('▣ ' + mensaje));
      break;
    default:
      console.log(chalk.gray('  → ') + mensaje);
  }
}

// ── Spinner (ora) ya iniciado ────────────────────────────────
function spinner(texto) {
  return ora({ text: texto, color: 'cyan', spinner: 'dots' }).start();
}

// ── Helper: ejecuta una función con spinner ──────────────────
async function withSpinner(texto, fn, exitoMsg) {
  const sp = spinner(texto);
  try {
    const res = await fn(sp);
    sp.succeed(exitoMsg || texto);
    return res;
  } catch (e) {
    sp.fail(`${texto} — ${e.message}`);
    throw e;
  }
}

// ── Caja de resumen final ────────────────────────────────────
function cajaResumen({ total, pass, fail, paciente, citaId, citaIdInt, excel, html }) {
  const ancho = 56;
  const top = chalk.cyan('╔' + '═'.repeat(ancho) + '╗');
  const bot = chalk.cyan('╚' + '═'.repeat(ancho) + '╝');
  const fila = (txt) => {
    const limpio = txt.replace(/\[[0-9;]*m/g, ''); // largo sin ANSI
    const relleno = Math.max(0, ancho - 1 - limpio.length);
    return chalk.cyan('║ ') + txt + ' '.repeat(relleno) + chalk.cyan('║');
  };
  console.log('\n' + top);
  console.log(fila(chalk.bold.white('RESULTADO FINAL')));
  console.log(fila(''));
  if (paciente != null) console.log(fila(chalk.gray('PacienteId:   ') + chalk.white(paciente)));
  if (citaIdInt != null) console.log(fila(chalk.gray('Cita:         ') + chalk.white(`${citaIdInt} → ${citaId}`)));
  console.log(fila(chalk.gray('Tabs:         ') + chalk.white(total)));
  console.log(fila(chalk.green(`PASS: ${pass}`) + '   ' + chalk.red(`FAIL: ${fail}`)));
  if (excel) console.log(fila(chalk.gray('Excel:        ') + chalk.white(excel)));
  if (html) console.log(fila(chalk.gray('HTML:         ') + chalk.white(html)));
  console.log(bot + '\n');
}

module.exports = { banner, log, spinner, withSpinner, cajaResumen };
