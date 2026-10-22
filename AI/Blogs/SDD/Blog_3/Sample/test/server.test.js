import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { MAX_FILE_BYTES, MAX_DRAIN_BYTES } from '../src/config.js';
import { makePdf, startApp, upload, sidOf } from './helpers.js';

let app;
beforeEach(async () => { app = await startApp(); });
afterEach(async () => { await app.close(); });

/** Send a raw request with node:http so headers/body framing can be controlled. */
function rawUpload(headers, writeBody) {
  const { port } = new URL(app.base);
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: '/api/uploads', method: 'POST', headers },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve({
          status: res.statusCode,
          body: JSON.parse(data),
          cookie: res.headers['set-cookie']?.[0].split(';')[0],
        }));
      },
    );
    req.on('error', reject);
    writeBody(req);
  });
}

test('AC-1: valid PDF is accepted, stored, and reported', async () => {
  const pdf = makePdf(1000);
  const r = await upload(app.base, 'report.pdf', pdf);
  assert.equal(r.status, 201);
  assert.equal(r.body.ok, true);
  assert.match(r.body.message, /"report\.pdf" uploaded successfully/);
  assert.equal(r.body.uploadsRemaining, 4);
  assert.equal(r.body.file.name, 'report.pdf');
  assert.equal(r.body.file.size, 1000);
  const stored = await app.listStored(sidOf(r.cookie));
  assert.deepEqual(stored, [`${r.body.file.id}.pdf`]);
  assert.deepEqual(await readFile(path.join(app.uploadDir, sidOf(r.cookie), stored[0])), pdf);
});

test('AC-2: exactly 2,097,152 bytes is accepted', async () => {
  const r = await upload(app.base, 'max.pdf', makePdf(MAX_FILE_BYTES));
  assert.equal(r.status, 201);
});

test('AC-2: 2,097,153 bytes is rejected with 413 and not stored', async () => {
  const r = await upload(app.base, 'big.pdf', makePdf(MAX_FILE_BYTES + 1));
  assert.equal(r.status, 413);
  assert.equal(r.body.ok, false);
  assert.match(r.body.message, /2 MB limit/);
  assert.deepEqual(await app.listStored(sidOf(r.cookie)), []);
});

test('AC-3: non-PDF extension is rejected with 415; uppercase .PDF accepted', async () => {
  const txt = await upload(app.base, 'notes.txt', Buffer.from('hello'));
  assert.equal(txt.status, 415);
  assert.match(txt.body.message, /Only \.pdf files are allowed/);
  const png = await upload(app.base, 'image.png', makePdf(), txt.cookie);
  assert.equal(png.status, 415);
  assert.deepEqual(await app.listStored(sidOf(txt.cookie)), []);
  const upper = await upload(app.base, 'REPORT.PDF', makePdf(), txt.cookie);
  assert.equal(upper.status, 201);
});

test('AC-4: .pdf without %PDF- signature is rejected with 422', async () => {
  const r = await upload(app.base, 'fake.pdf', Buffer.from('<html>%%EOF</html>'));
  assert.equal(r.status, 422);
  assert.match(r.body.message, /not a valid PDF/);
  assert.deepEqual(await app.listStored(sidOf(r.cookie)), []);
});

test('AC-5: .pdf without trailing %%EOF is rejected with 422', async () => {
  const r = await upload(app.base, 'truncated.pdf', makePdf(5000).subarray(0, 4000));
  assert.equal(r.status, 422);
  assert.match(r.body.message, /incomplete or corrupted/);
  assert.deepEqual(await app.listStored(sidOf(r.cookie)), []);
});

test('AC-6: empty .pdf is rejected with 422', async () => {
  const r = await upload(app.base, 'empty.pdf', Buffer.alloc(0));
  assert.equal(r.status, 422);
  assert.match(r.body.message, /is empty/);
  assert.deepEqual(await app.listStored(sidOf(r.cookie)), []);
});

test('AC-7: 6th valid upload in a session is rejected with 429', async () => {
  let cookie;
  for (let i = 1; i <= 5; i++) {
    const r = await upload(app.base, `f${i}.pdf`, makePdf(), cookie);
    assert.equal(r.status, 201, `upload ${i}`);
    assert.equal(r.body.uploadsRemaining, 5 - i);
    cookie = r.cookie;
  }
  const sixth = await upload(app.base, 'f6.pdf', makePdf(), cookie);
  assert.equal(sixth.status, 429);
  assert.equal(sixth.body.ok, false);
  assert.match(sixth.body.message, /limit of 5 PDF files/);
  assert.match(sixth.body.message, /"f6\.pdf" was not uploaded/);
  assert.equal((await app.listStored(sidOf(cookie))).length, 5);
});

test('AC-8: rejected uploads do not consume quota', async () => {
  const bad = await upload(app.base, 'bad.txt', Buffer.from('x'));
  assert.equal(bad.status, 415);
  assert.equal(bad.body.uploadsRemaining, 5);
  for (let i = 1; i <= 5; i++) {
    const r = await upload(app.base, `f${i}.pdf`, makePdf(), bad.cookie);
    assert.equal(r.status, 201, `upload ${i}`);
  }
});

test('AC-9: a new session has its own quota', async () => {
  let cookie;
  for (let i = 0; i < 5; i++) cookie = (await upload(app.base, 'a.pdf', makePdf(), cookie)).cookie;
  assert.equal((await upload(app.base, 'a.pdf', makePdf(), cookie)).status, 429);
  const other = await upload(app.base, 'b.pdf', makePdf());
  assert.equal(other.status, 201);
  assert.notEqual(other.cookie, cookie);
  assert.equal(other.body.uploadsRemaining, 4);
});

test('AC-9: an unknown/forged session cookie gets a fresh session', async () => {
  const forged = 'sid=00000000-0000-0000-0000-000000000000';
  const r = await upload(app.base, 'a.pdf', makePdf(), forged);
  assert.equal(r.status, 201);
  assert.ok(r.setCookie, 'new Set-Cookie issued');
  assert.notEqual(r.cookie, forged);
});

test('AC-10: 6 concurrent uploads in one session -> exactly 5 accepted', async () => {
  const { cookie } = await upload(app.base, 'init.txt', Buffer.from('x')); // rejected; creates session
  const results = await Promise.all(
    Array.from({ length: 6 }, (_, i) => upload(app.base, `c${i}.pdf`, makePdf(200_000), cookie)),
  );
  const statuses = results.map((r) => r.status).sort();
  assert.deepEqual(statuses, [201, 201, 201, 201, 201, 429]);
  assert.equal((await app.listStored(sidOf(cookie))).length, 5);
});

test('AC-11: missing X-File-Name is rejected with 400', async () => {
  const r = await upload(app.base, undefined, makePdf());
  assert.equal(r.status, 400);
  assert.match(r.body.message, /no file name/);
});

test('AC-11: malformed URI-encoded name is rejected with 400', async () => {
  const res = await fetch(`${app.base}/api/uploads`, {
    method: 'POST', headers: { 'X-File-Name': '%E0%A4%A' }, body: makePdf(),
  });
  assert.equal(res.status, 400);
});

test('AC-11: path traversal in file name never escapes the session directory', async () => {
  const r = await upload(app.base, '../../evil.pdf', makePdf());
  assert.equal(r.status, 201);
  const sid = sidOf(r.cookie);
  assert.deepEqual(await readdir(app.uploadDir), [sid]);
  const stored = await app.listStored(sid);
  assert.deepEqual(stored, [`${r.body.file.id}.pdf`]);
  assert.match(stored[0], /^[0-9a-f-]{36}\.pdf$/);
});

test('AC-12: declared Content-Length over the limit is rejected with 413 and the client can read it', async () => {
  // Browser-like: full 3 MB body sent on a keep-alive connection; the response must arrive intact.
  const r = await upload(app.base, 'three-mb.pdf', makePdf(3_000_000));
  assert.equal(r.status, 413);
  assert.match(r.body.message, /2 MB limit/);
  assert.deepEqual(await app.listStored(sidOf(r.cookie)), []);
});

test('AC-12/SEC-2: declared Content-Length over the drain cap is rejected without reading the body', async () => {
  const r = await rawUpload(
    { 'X-File-Name': 'huge.pdf', 'Content-Length': String(MAX_DRAIN_BYTES + 1) },
    (req) => req.write('%PDF-'), // only a few bytes; the server must answer without the rest
  );
  assert.equal(r.status, 413);
  assert.match(r.body.message, /2 MB limit/);
  assert.deepEqual(await app.listStored(sidOf(r.cookie)), []);
});

test('early rejections (415/429) are readable by clients that send a large body', async () => {
  const notPdf = await upload(app.base, 'video.mp4', Buffer.alloc(1_500_000));
  assert.equal(notPdf.status, 415);
  let cookie = notPdf.cookie;
  for (let i = 0; i < 5; i++) cookie = (await upload(app.base, 'a.pdf', makePdf(), cookie)).cookie;
  const overLimit = await upload(app.base, 'b.pdf', makePdf(MAX_FILE_BYTES), cookie);
  assert.equal(overLimit.status, 429);
});

test('SEC-2: chunked body without Content-Length is capped at the limit', async () => {
  const r = await rawUpload(
    { 'X-File-Name': 'stream.pdf', 'Transfer-Encoding': 'chunked' },
    (req) => { req.write(makePdf(MAX_FILE_BYTES)); req.end(Buffer.alloc(1024)); },
  );
  assert.equal(r.status, 413);
  assert.deepEqual(await app.listStored(sidOf(r.cookie)), []);
});

test('SEC-2: chunked body past the drain cap gets 413 without the client finishing', async () => {
  const r = await rawUpload(
    { 'X-File-Name': 'endless.pdf', 'Transfer-Encoding': 'chunked' },
    (req) => req.write(Buffer.alloc(MAX_DRAIN_BYTES + 1024)), // never ended
  );
  assert.equal(r.status, 413);
  assert.deepEqual(await app.listStored(sidOf(r.cookie)), []);
});

test('AC-13: new client receives an HttpOnly SameSite=Strict session cookie', async () => {
  const r = await upload(app.base, 'a.pdf', makePdf());
  assert.match(r.setCookie, /^sid=[0-9a-f-]{36};/);
  assert.match(r.setCookie, /HttpOnly/);
  assert.match(r.setCookie, /SameSite=Strict/);
  assert.match(r.setCookie, /Path=\//);
  assert.doesNotMatch(r.setCookie, /Max-Age|Expires/i);
  const again = await upload(app.base, 'b.pdf', makePdf(), r.cookie);
  assert.equal(again.setCookie, null, 'existing session is reused');
});

test('SEC-8: responses carry nosniff; wrong method and unknown path handled', async () => {
  const get = await fetch(`${app.base}/api/uploads`);
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('x-content-type-options'), 'nosniff');
  const missing = await fetch(`${app.base}/nope`);
  assert.equal(missing.status, 404);
});
