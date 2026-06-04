const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();

// Connection settings
const PG_USER = process.env.PGUSER || 'postgres';
const PG_PASSWORD = process.env.PGPASSWORD || 'postgres';
const PG_HOST = process.env.PGHOST || 'localhost';
const PG_PORT = process.env.PGPORT || 5432;
const PG_DATABASE = process.env.PGDATABASE || 'postgres';

let isPostgres = false;
let pgPool = null;
let sqliteDb = null;

// Initialize connection
function initDb() {
  return new Promise((resolve) => {
    // Attempt Postgres connection first unless forced to SQLite
    if (process.env.DB_TYPE === 'sqlite') {
      console.log('Database forced to SQLite mode.');
      setupSQLite().then(resolve);
      return;
    }

    console.log('Attempting to connect to PostgreSQL...');
    pgPool = new Pool({
      user: PG_USER,
      password: PG_PASSWORD,
      host: PG_HOST,
      port: PG_PORT,
      database: PG_DATABASE,
      connectionTimeoutMillis: 2000
    });

    pgPool.query('SELECT NOW()', (err) => {
      if (err) {
        console.warn('PostgreSQL connection failed. Falling back to SQLite. Error:', err.message);
        setupSQLite().then(resolve);
      } else {
        console.log('Successfully connected to PostgreSQL database:', PG_DATABASE);
        isPostgres = true;
        setupSchema().then(resolve);
      }
    });
  });
}

function setupSQLite() {
  return new Promise((resolve) => {
    const dbPath = path.join(__dirname, 'rockin.db');
    console.log('Initializing SQLite database at:', dbPath);
    sqliteDb = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Could not connect to SQLite database:', err.message);
        process.exit(1);
      }
      isPostgres = false;
      setupSchema().then(resolve);
    });
  });
}

function setupSchema() {
  return new Promise((resolve, reject) => {
    try {
      const schemaPath = path.join(__dirname, 'schema.sql');
      let schemaSql = fs.readFileSync(schemaPath, 'utf8');

      if (!isPostgres) {
        // Convert Postgres specific syntax to SQLite
        schemaSql = schemaSql
          .replace(/SERIAL PRIMARY KEY/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT')
          .replace(/VARCHAR\(\d+\)/gi, 'TEXT')
          .replace(/TIMESTAMP DEFAULT CURRENT_TIMESTAMP/gi, 'TEXT DEFAULT CURRENT_TIMESTAMP');
      }

      // Split the statements by semicolon (simple parser)
      const statements = schemaSql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      runStatements(statements)
        .then(() => {
          console.log('Database schema successfully initialized.');
          resolve();
        })
        .catch(err => {
          console.error('Schema initialization failed:', err);
          reject(err);
        });
    } catch (e) {
      console.error('Error reading schema.sql:', e);
      reject(e);
    }
  });
}

async function runStatements(statements) {
  for (const sql of statements) {
    await query(sql);
  }
}

// Unified query function
function query(text, params = []) {
  if (isPostgres) {
    return pgPool.query(text, params);
  } else {
    // Translate Postgres placeholders ($1, $2...) to SQLite placeholders (?, ?...)
    const sqliteText = text.replace(/\$\d+/g, '?');
    return new Promise((resolve, reject) => {
      const trimmed = text.trim().toUpperCase();
      const isSelect = trimmed.startsWith('SELECT');
      const isReturning = text.toLowerCase().includes('returning');

      if (isSelect || isReturning) {
        sqliteDb.all(sqliteText, params, (err, rows) => {
          if (err) return reject(err);
          resolve({ rows, rowCount: rows.length });
        });
      } else {
        sqliteDb.run(sqliteText, params, function (err) {
          if (err) return reject(err);
          resolve({ rows: [], rowCount: this.changes, lastID: this.lastID });
        });
      }
    });
  }
}

module.exports = {
  initDb,
  query,
  getIsPostgres: () => isPostgres
};
