import { mkdtemp, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/server.js';

/** Build a minimal byte sequence that passes BR-5 checks, padded to `size` bytes. */
export function makePdf(size = 64) {
  const head = Buffer.from('%PDF-1.4\n', 'latin1');
  const tail = Buffer.from('\n%%EOF\n', 'latin1');
  const padLength = size - head.length - tail.length;
  if (padLength < 0) throw new Error(`size ${size} too small for a test PDF`);
  return Buffer.concat([head, Buffer.alloc(padLength, 0x20), tail]);
}

/** Start the app on an ephemeral port with an isolated temp upload directory. */
export async function startApp() {
  const uploadDir = await mkdtemp(path.join(os.tmpdir(), 'pdf-upload-test-'));
  const server = createApp({ uploadDir });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    uploadDir,
    async listStored(sid) {
      try { return await readdir(path.join(uploadDir, sid)); } catch { return []; }
    },
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await rm(uploadDir, { recursive: true, force: true });
    },
  };
}

/** POST a file the way the browser page does. Returns { status, body, setCookie, cookie }. */
export async function upload(base, name, buffer, cookie) {
  const headers = { 'Content-Type': 'application/pdf' };
  if (name !== undefined) headers['X-File-Name'] = encodeURIComponent(name);
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${base}/api/uploads`, { method: 'POST', headers, body: buffer });
  const setCookie = res.headers.get('set-cookie');
  return {
    status: res.status,
    body: await res.json(),
    setCookie,
    cookie: setCookie ? setCookie.split(';')[0] : cookie,
  };
}

export const sidOf = (cookie) => cookie.split('=')[1];
