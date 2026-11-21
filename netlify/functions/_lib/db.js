import pg from 'pg';
import { getConnectionString } from '@netlify/database';

let pool;
let activeConnectionString = '';

export class DbUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DbUnavailableError';
    this.statusCode = 503;
  }
}

function getEnvVar(name) {
  try {
    if (typeof globalThis.Netlify !== 'undefined' && globalThis.Netlify?.env?.get) {
      const val = globalThis.Netlify.env.get(name);
      if (val) return val;
    }
  } catch {
    // Fallback to process.env
  }
  return process.env[name] || '';
}

function resolveConnectionString() {
  try {
    const netlifyUrl = getConnectionString();
    if (netlifyUrl) return netlifyUrl;
  } catch {
    // Not resolved via @netlify/database; check runtime environment variables.
  }
  return (
    getEnvVar('NETLIFY_DB_URL') ||
    getEnvVar('DATABASE_URL') ||
    getEnvVar('NETLIFY_DATABASE_URL') ||
    ''
  );
}

export function getPool() {
  const connectionString = resolveConnectionString();
  if (!connectionString) {
    throw new DbUnavailableError(
      'Database is not configured. Provision Netlify Database (NETLIFY_DB_URL) or set DATABASE_URL.',
    );
  }

  if (pool && activeConnectionString === connectionString) {
    return pool;
  }

  const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
  pool = new pg.Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 10000,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
  activeConnectionString = connectionString;

  return pool;
}
