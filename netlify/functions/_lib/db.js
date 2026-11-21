import pg from 'pg';

let pool;

export function getPool() {
  if (pool) return pool;

  const connectionString = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Database connection string (NETLIFY_DATABASE_URL or DATABASE_URL) is not configured.');
  }

  const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
  pool = new pg.Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 10000,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  return pool;
}
