// ============================================================
//  db.js — Conexión a SQL Server y generación de cita
// ============================================================
const sql = require('mssql');

// Parsea una cadena de conexión estilo .NET a la config de mssql
function parseConn(str) {
  const m = {};
  String(str).split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) m[p.slice(0, i).trim().toLowerCase()] = p.slice(i + 1).trim();
  });
  const [server, port] = (m['data source'] || m['server'] || '').split(',');
  return {
    server: (server || '').trim(),
    port: port ? parseInt(port, 10) : 1433,
    database: m['initial catalog'] || m['database'],
    user: m['user id'] || m['uid'],
    password: m['password'] || m['pwd'],
    options: { encrypt: false, trustServerCertificate: true },
    requestTimeout: 30000,
    connectionTimeout: 20000,
  };
}

// Ejecuta el SP agd_generar_citas y devuelve el Id de cita (entero)
async function generarCita(connStr, pacienteId) {
  const pool = await sql.connect(parseConn(connStr));
  try {
    const r = await pool
      .request()
      .input('PacienteId', sql.Int, pacienteId)
      .execute('agd_generar_citas');
    const row = r.recordset && r.recordset[0];
    if (!row || row.Id == null) {
      throw new Error('El SP no devolvió un Id de cita');
    }
    return row.Id;
  } finally {
    await pool.close();
  }
}

// El Id entero se codifica en base64 para la URL /HC/<base64>
const citaIdToBase64 = (id) => Buffer.from(String(id)).toString('base64');

module.exports = { generarCita, citaIdToBase64, parseConn };
