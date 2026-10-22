import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createStorage } from '../src/storage.js';
import { makePdf } from './helpers.js';

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pdf-upload-storage-'));
  try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

test('AC-1: saves identical bytes under <root>/<sessionId>/<uuid>.pdf', () => withTempDir(async (dir) => {
  const storage = createStorage(dir);
  const sid = randomUUID();
  const pdf = makePdf(500);
  const saved = await storage.saveFile(sid, pdf);
  assert.equal(path.dirname(saved.path), path.join(dir, sid));
  assert.equal(path.basename(saved.path), `${saved.id}.pdf`);
  assert.deepEqual(await readFile(saved.path), pdf);
}));

test('AC-11: each save gets a new server-generated name inside root', () => withTempDir(async (dir) => {
  const storage = createStorage(dir);
  const sid = randomUUID();
  const a = await storage.saveFile(sid, makePdf());
  const b = await storage.saveFile(sid, makePdf());
  assert.notEqual(a.id, b.id);
  assert.equal((await readdir(path.join(dir, sid))).length, 2);
  for (const p of [a.path, b.path]) assert.ok(p.startsWith(path.resolve(dir) + path.sep));
}));

test('AC-11: rejects session IDs that are not UUIDs', () => withTempDir(async (dir) => {
  const storage = createStorage(dir);
  for (const bad of ['../evil', '..', '', 'abc']) {
    await assert.rejects(storage.saveFile(bad, makePdf()), /invalid session id/);
  }
  assert.deepEqual(await readdir(dir), []);
}));
