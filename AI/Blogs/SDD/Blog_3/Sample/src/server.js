import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_UPLOAD_DIR, MAX_FILE_BYTES, MAX_DRAIN_BYTES, PUBLIC_DIR } from './config.js';
import { validateFileName, validateSize, validateContent, MESSAGES } from './validation.js';
import { createSessionStore } from './session-store.js';
import { createStorage } from './storage.js';

const SESSION_COOKIE = 'sid';

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

// Allowlist of static files; request paths are never mapped onto the file system directly.
const STATIC_FILES = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/app.js': { file: 'app.js', type: 'text/javascript; charset=utf-8' },
  '/styles.css': { file: 'styles.css', type: 'text/css; charset=utf-8' },
};

const CSP = "default-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

const limitMessage = (max, name) =>
  `Upload failed: ${name ? `"${name}" was not uploaded because ` : ''}you have reached the limit of ${max} PDF files for this session.`;
const successMessage = (name, remaining) =>
  `"${name}" uploaded successfully. You can upload ${remaining} more file${remaining === 1 ? '' : 's'} this session.`;

function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) cookies[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return cookies;
}

function decodeFileName(raw) {
  if (typeof raw !== 'string') return undefined;
  try { return decodeURIComponent(raw); } catch { return undefined; }
}

/** Read the request body, buffering at most `limit` bytes (SEC-2). */
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    const onData = (chunk) => {
      total += chunk.length;
      if (total > limit) {
        cleanup();
        resolve({ tooLarge: true, bytesRead: total });
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => { cleanup(); resolve({ tooLarge: false, buffer: Buffer.concat(chunks, total) }); };
    const onError = (err) => { cleanup(); reject(err); };
    function cleanup() {
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onError);
    }
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
  });
}

/**
 * Read and throw away the rest of the body without buffering it, so the client
 * receives the rejection instead of a reset connection. Resolves false once
 * `limit` total bytes are exceeded (SEC-2).
 */
function discardBody(req, limit, alreadyRead = 0) {
  return new Promise((resolve, reject) => {
    if (req.readableEnded) return resolve(true);
    let total = alreadyRead;
    const onData = (chunk) => {
      total += chunk.length;
      if (total > limit) { cleanup(); req.pause(); resolve(false); }
    };
    const onEnd = () => { cleanup(); resolve(true); };
    const onError = (err) => { cleanup(); reject(err); };
    function cleanup() {
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onError);
    }
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
    req.resume();
  });
}

export function createApp({ uploadDir = DEFAULT_UPLOAD_DIR, sessions = createSessionStore() } = {}) {
  const storage = createStorage(uploadDir);

  /** Find or create the browser session; queue a Set-Cookie for new ones (SEC-3). */
  function resolveSession(req, res) {
    const existing = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (sessions.has(existing)) return existing;
    const sid = sessions.create();
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${sid}; HttpOnly; SameSite=Strict; Path=/`);
    return sid;
  }

  function sendJson(res, status, body, { closeConnection = false } = {}) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      ...SECURITY_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(payload),
      'Cache-Control': 'no-store',
      ...(closeConnection ? { Connection: 'close' } : {}),
    });
    res.end(payload);
  }

  async function serveStatic(res, entry) {
    const content = await readFile(path.join(PUBLIC_DIR, entry.file));
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': entry.type,
      'Content-Length': content.length,
      'Content-Security-Policy': CSP,
    });
    res.end(content);
  }

  async function handleUpload(req, res) {
    const sid = resolveSession(req, res);
    const reply = (status, message, extra = {}, opts) =>
      sendJson(res, status, { ok: status === 201, message, uploadsRemaining: sessions.remaining(sid), ...extra }, opts);
    // Rejections decided before the whole body is read: discard the remaining bytes (bounded)
    // so browsers can read the response; past MAX_DRAIN_BYTES, close the connection instead.
    const declared = Number(req.headers['content-length']);
    const rejectEarly = async (status, message, bytesRead = 0) => {
      const drained = !(declared > MAX_DRAIN_BYTES) && await discardBody(req, MAX_DRAIN_BYTES, bytesRead);
      reply(status, message, {}, { closeConnection: !drained });
    };

    const name = decodeFileName(req.headers['x-file-name']);
    if (sessions.remaining(sid) <= 0) return rejectEarly(429, limitMessage(sessions.maxFiles, name));

    const nameCheck = validateFileName(name);
    if (!nameCheck.ok) return rejectEarly(nameCheck.status, nameCheck.message);

    if (Number.isFinite(declared)) {
      const sizeCheck = validateSize(name, declared);
      if (!sizeCheck.ok) return rejectEarly(sizeCheck.status, sizeCheck.message);
    }

    const body = await readBody(req, MAX_FILE_BYTES);
    if (body.tooLarge) return rejectEarly(413, MESSAGES.tooLarge(name), body.bytesRead);

    const contentCheck = validateContent(name, body.buffer);
    if (!contentCheck.ok) return reply(contentCheck.status, contentCheck.message);

    // SEC-4: synchronous reservation — no await between check and claim.
    if (!sessions.reserve(sid)) return reply(429, limitMessage(sessions.maxFiles, name));
    let saved;
    try {
      saved = await storage.saveFile(sid, body.buffer);
    } catch {
      sessions.release(sid);
      return reply(500, `Upload failed: "${name}" could not be saved. Please try again.`);
    }
    sessions.commit(sid);
    const remaining = sessions.remaining(sid);
    return reply(201, successMessage(name, remaining), {
      file: { id: saved.id, name, size: body.buffer.length },
    });
  }

  const server = http.createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url, 'http://localhost');
      if (pathname === '/api/uploads') {
        if (req.method !== 'POST') {
          res.setHeader('Allow', 'POST');
          return sendJson(res, 405, { ok: false, message: 'Method not allowed.' });
        }
        return await handleUpload(req, res);
      }
      const entry = Object.hasOwn(STATIC_FILES, pathname) ? STATIC_FILES[pathname] : undefined;
      if (entry && (req.method === 'GET' || req.method === 'HEAD')) return await serveStatic(res, entry);
      return sendJson(res, 404, { ok: false, message: 'Not found.' });
    } catch {
      if (!res.headersSent) sendJson(res, 500, { ok: false, message: 'Unexpected server error.' });
      else res.destroy();
    }
  });

  return server;
}
