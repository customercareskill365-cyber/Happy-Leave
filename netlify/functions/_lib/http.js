import { ensureSchema, getPool } from './db.js';

const SESSION_COOKIE_NAME = 'tlm_session';
const SESSION_MAX_AGE_SEC = 12 * 60 * 60; // 12 hours

export function jsonResponse(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

function isWebRequest(req) {
  return (
    req &&
    typeof req.url === 'string' &&
    typeof req.method === 'string' &&
    req.headers &&
    typeof req.headers.forEach === 'function'
  );
}

async function normalizeToEvent(reqOrEvent) {
  if (!isWebRequest(reqOrEvent)) {
    return { isV2: false, event: reqOrEvent };
  }

  const headers = {};
  reqOrEvent.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const url = new URL(reqOrEvent.url);
  const queryStringParameters = {};
  for (const [k, v] of url.searchParams.entries()) {
    queryStringParameters[k] = v;
  }

  const method = (reqOrEvent.method || 'GET').toUpperCase();
  let body = null;
  if (method !== 'GET' && method !== 'HEAD') {
    const text = await reqOrEvent.text();
    body = text || null;
  }

  return {
    isV2: true,
    event: {
      httpMethod: method,
      headers,
      queryStringParameters,
      body,
      isBase64Encoded: false,
      rawUrl: reqOrEvent.url,
    },
  };
}

function toResult(resObj, isV2) {
  if (!isV2) return resObj;
  return new Response(resObj.body ?? '', {
    status: resObj.statusCode || 200,
    headers: resObj.headers || {},
  });
}

export function withHandler(fn) {
  return async (reqOrEvent, context) => {
    let isV2 = isWebRequest(reqOrEvent);
    try {
      const normalized = await normalizeToEvent(reqOrEvent);
      isV2 = normalized.isV2;
      // Ensure database connection and idempotent schema exist before executing handler
      const pool = getPool();
      await ensureSchema(pool);
      const result = await fn(normalized.event, context);
      return toResult(result, isV2);
    } catch (err) {
      if (err?.name === 'DbUnavailableError') {
        return toResult(jsonResponse(503, { error: err.message }), isV2);
      }
      if (
        err?.code === 'ECONNREFUSED' ||
        err?.code === 'ENOTFOUND' ||
        err?.code === 'ETIMEDOUT' ||
        err?.code === '28P01' ||
        err?.code === '57P01' ||
        err?.code === '57P03' ||
        err?.code === '3D000'
      ) {
        return toResult(
          jsonResponse(503, { error: 'Database connection unavailable. Check database configuration.' }),
          isV2,
        );
      }
      if (err?.code === '42P01' || err?.code === '42703') {
        return toResult(
          jsonResponse(503, { error: 'Database schema is not initialized. Run npm run db:migrate.' }),
          isV2,
        );
      }
      console.error('Unhandled function error:', err?.message || err);
      return toResult(jsonResponse(500, { error: 'Internal server error.' }), isV2);
    }
  };
}

export function parseJsonBody(event) {
  if (!event.body) return {};
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return null;
  }
}

export function requireMethod(event, allowedMethods) {
  const method = (event.httpMethod || 'GET').toUpperCase();
  if (!allowedMethods.includes(method)) {
    return jsonResponse(405, { error: `Method ${method} not allowed.` });
  }
  return null;
}

function firstHeaderVal(val) {
  if (!val || typeof val !== 'string') return '';
  return val.split(',')[0].trim();
}

export function getEffectiveHost(event) {
  const headers = event.headers || {};
  const fwdHost = firstHeaderVal(headers['x-forwarded-host'] || headers['X-Forwarded-Host']);
  if (fwdHost) return fwdHost;
  return firstHeaderVal(headers.host || headers.Host) || 'localhost:8888';
}

export function getRpAndOrigin(event) {
  const headers = event.headers || {};
  const hostHeader = getEffectiveHost(event);
  const rpID = hostHeader.split(':')[0];
  const fwdProto = firstHeaderVal(headers['x-forwarded-proto'] || headers['X-Forwarded-Proto']);
  const proto = fwdProto || (rpID === 'localhost' || rpID === '127.0.0.1' ? 'http' : 'https');
  const origin = `${proto}://${hostHeader}`;
  return { rpName: 'Team Leave Manager', rpID, origin };
}

export function requireSameOrigin(event) {
  const headers = event.headers || {};
  const secFetchSite = (headers['sec-fetch-site'] || headers['Sec-Fetch-Site'] || '').toLowerCase();
  if (secFetchSite === 'cross-site') {
    return jsonResponse(403, { error: 'Cross-site request rejected.' });
  }

  const origin = headers.origin || headers.Origin;
  const host = firstHeaderVal(headers.host || headers.Host);
  const fwdHost = firstHeaderVal(headers['x-forwarded-host'] || headers['X-Forwarded-Host']);
  if (!origin || (!host && !fwdHost)) return null;

  try {
    const originHost = new URL(origin).host;
    if (originHost !== host && originHost !== fwdHost) {
      return jsonResponse(403, { error: 'Cross-origin request rejected.' });
    }
  } catch {
    return jsonResponse(403, { error: 'Invalid origin header.' });
  }
  return null;
}

export function parseCookies(event) {
  const raw = event.headers?.cookie || event.headers?.Cookie || '';
  const out = {};
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(val);
      } catch {
        out[key] = val;
      }
    }
  }
  return out;
}

export function getSessionCookie(event) {
  const cookies = parseCookies(event);
  return cookies[SESSION_COOKIE_NAME] || null;
}

function isSecureRequest(event) {
  const proto = firstHeaderVal(event.headers?.['x-forwarded-proto'] || event.headers?.['X-Forwarded-Proto']);
  if (proto === 'https') return true;
  if (typeof event.rawUrl === 'string' && event.rawUrl.startsWith('https://')) return true;
  const host = getEffectiveHost(event);
  return !host.startsWith('localhost') && !host.startsWith('127.0.0.1');
}

export function buildSessionCookie(token, event) {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_MAX_AGE_SEC}`,
  ];
  if (isSecureRequest(event)) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function clearSessionCookie(event) {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (isSecureRequest(event)) {
    parts.push('Secure');
  }
  return parts.join('; ');
}
