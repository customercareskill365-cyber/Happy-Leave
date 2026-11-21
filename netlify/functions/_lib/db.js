import pg from 'pg';
import { getConnectionString } from '@netlify/database';

let pool;

export class DbUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DbUnavailableError';
    this.statusCode = 503;
  }
}

function resolveConnectionString() {
  if (process.env.NETLIFY_DB_URL) {
    return process.env.NETLIFY_DB_URL;
  }
  try {
    const netlifyUrl = getConnectionString();
    if (netlifyUrl) return netlifyUrl;
  } catch {
    // Not running inside Netlify Database runtime; fall back to standard env vars.
  }
  return process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || '';
}

export function getPool() {
  if (pool) return pool;

  const connectionString = resolveConnectionString();
  if (!connectionString) {
    throw new DbUnavailableError(
      'Database is not configured. Provision Netlify Database (NETLIFY_DB_URL) or set DATABASE_URL.',
    );
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
