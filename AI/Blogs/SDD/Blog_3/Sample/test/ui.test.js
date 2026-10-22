import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from './helpers.js';

let app;
before(async () => { app = await startApp(); });
after(async () => { await app.close(); });

test('AC-14: GET / serves the upload page with input, button, and live message region', async () => {
  const res = await fetch(`${app.base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^text\/html/);
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  const html = await res.text();
  assert.match(html, /<input[^>]+type="file"[^>]+accept="application\/pdf,\.pdf"/);
  assert.match(html, /<button[^>]+type="submit"/);
  assert.match(html, /<ul id="messages"[^>]+aria-live="polite"/);
  assert.match(html, /up to 5 PDF files per browser session/);
  assert.match(html, /2 MB or smaller/);
  assert.match(html, /<script src="\/app\.js"/);
});

test('AC-14: app.js is served as JavaScript and renders messages as text, not HTML', async () => {
  const res = await fetch(`${app.base}/app.js`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^text\/javascript/);
  const js = await res.text();
  assert.match(js, /textContent = text/);
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.match(js, /'X-File-Name': encodeURIComponent\(file\.name\)/);
  assert.match(js, /ok \? 'success' : 'error'/);
  assert.match(js, /const MAX_FILE_BYTES = 2 \* 1024 \* 1024;/);
  assert.match(js, /file\.size > MAX_FILE_BYTES/);
});

test('AC-14: styles.css is served; other paths are not exposed', async () => {
  const css = await fetch(`${app.base}/styles.css`);
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type'), /^text\/css/);
  for (const p of ['/index.html', '/../package.json', '/%2e%2e/package.json', '/src/server.js', '/constructor']) {
    const res = await fetch(`${app.base}${p}`);
    assert.equal(res.status, 404, p);
  }
});
