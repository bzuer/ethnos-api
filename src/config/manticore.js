const mysql = require('mysql2/promise');
const { logger } = require('../middleware/errorHandler');

const config = {
  host: process.env.MANTICORE_HOST || '127.0.0.1',
  port: parseInt(process.env.MANTICORE_PORT || '9306', 10),
  database: process.env.MANTICORE_DATABASE || 'Manticore',
  connectionLimit: parseInt(process.env.MANTICORE_POOL || '5', 10),
  connectTimeout: parseInt(process.env.MANTICORE_CONNECT_TIMEOUT_MS || '4000', 10)
};

let pool = null;
let lastError = null;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: config.host,
      port: config.port,
      database: config.database,
      ssl: false,
      waitForConnections: true,
      connectionLimit: config.connectionLimit,
      queueLimit: 0,
      enableKeepAlive: true,
      connectTimeout: config.connectTimeout
    });
  }
  return pool;
}

async function query(sql, params = []) {
  const [rows] = await getPool().query(sql, params);
  return rows;
}

async function queryWithMeta(sql, params = []) {
  const conn = await getPool().getConnection();
  try {
    const [rows] = await conn.query(sql, params);
    const [meta] = await conn.query('SHOW META');
    return { rows, meta };
  } finally {
    conn.release();
  }
}

async function ping() {
  try {
    await query('SELECT 1 AS ok');
    lastError = null;
    return true;
  } catch (error) {
    lastError = error.message;
    logger.warn(`Manticore ping failed: ${error.message}`);
    return false;
  }
}

async function close() {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end();
  }
}

module.exports = {
  config,
  getPool,
  query,
  queryWithMeta,
  ping,
  close,
  getLastError: () => lastError
};
