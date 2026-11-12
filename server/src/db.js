// Veri katmanı.
//  DB_DRIVER=mysql  (canlı)  → mysql2 bağlantı havuzu
//  DB_DRIVER=sqlite (yerel geliştirme/test) → Node'un yerleşik SQLite'ı, ek kurulum gerektirmez
// Sorgular iki veritabanında da çalışacak sade SQL ile yazılır ("?" parametreleri).

import { config } from './config.js';
import { MIGRATIONS } from './schema.js';

function clean(params = []) {
  return params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p));
}

async function createMysql() {
  const mysql = (await import('mysql2/promise')).default;
  const pool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.name,
    charset: 'utf8mb4',
    connectionLimit: 10,
    supportBigNumbers: true,
    bigNumberStrings: false,
    dateStrings: true,
    timezone: 'Z'
  });

  const runner = (conn) => async (sql, params) => {
    const [rows] = await conn.query(sql, clean(params));
    return rows;
  };

  return {
    driver: 'mysql',
    query: runner(pool),
    async tx(fn) {
      for (let attempt = 0; ; attempt++) {
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();
          const result = await fn(runner(conn));
          await conn.commit();
          return result;
        } catch (e) {
          await conn.rollback().catch(() => {});
          // Kilitlenme olursa bir kez daha dene
          if ((e.code === 'ER_LOCK_DEADLOCK' || e.code === 'ER_LOCK_WAIT_TIMEOUT') && attempt < 2) continue;
          throw e;
        } finally {
          conn.release();
        }
      }
    },
    ddl: (sql) => `${sql} ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    async close() {
      await pool.end();
    }
  };
}

async function createSqlite() {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(config.db.sqliteFile);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = OFF;');
  const fix = (sql) => sql.replace(/\s+FOR UPDATE\b/gi, '');
  const query = async (sql, params) => {
    const stmt = db.prepare(fix(sql));
    if (/^\s*(SELECT|WITH|PRAGMA)/i.test(sql)) return stmt.all(...clean(params));
    const r = stmt.run(...clean(params));
    return { affectedRows: Number(r.changes) };
  };
  // SQLite tek yazıcıya izin verir: işlemleri sıraya sok
  let chain = Promise.resolve();
  return {
    driver: 'sqlite',
    query,
    tx(fn) {
      const run = chain.then(async () => {
        db.exec('BEGIN IMMEDIATE');
        try {
          const r = await fn(query);
          db.exec('COMMIT');
          return r;
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }
      });
      chain = run.catch(() => {});
      return run;
    },
    ddl: (sql) => sql,
    async close() {
      db.close();
    }
  };
}

export async function connect() {
  const db = config.db.driver === 'sqlite' ? await createSqlite() : await createMysql();
  await migrate(db);
  return db;
}

// Veritabanı yoksa ya da eskiyse tabloları oluşturur / günceller
async function migrate(db) {
  await db.query(db.ddl('CREATE TABLE IF NOT EXISTS schema_migrations (version INT PRIMARY KEY, applied_at BIGINT NOT NULL)'));
  const done = new Set((await db.query('SELECT version FROM schema_migrations')).map((r) => Number(r.version)));
  for (const m of MIGRATIONS) {
    if (done.has(m.version)) continue;
    for (const stmt of m.up) {
      const sql = /^\s*CREATE TABLE/i.test(stmt) ? db.ddl(stmt) : stmt;
      await db.query(sql);
    }
    await db.query('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', [m.version, Date.now()]);
    console.log(`[db] migration ${m.version} uygulandı: ${m.name}`);
  }
}
