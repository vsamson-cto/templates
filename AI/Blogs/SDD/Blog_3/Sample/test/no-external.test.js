import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function sources(dir) {
  const files = await readdir(path.join(root, dir));
  return Promise.all(files.filter((f) => f.endsWith('.js')).map(async (f) => ({
    file: `${dir}/${f}`,
    text: await readFile(path.join(root, dir, f), 'utf8'),
  })));
}

test('AC-15: package.json declares no dependencies of any kind', async () => {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  for (const key of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    assert.equal(pkg[key], undefined, key);
  }
});

test('AC-15: no environment variables, secrets, or API keys are read', async () => {
  for (const { file, text } of [...await sources('src'), ...await sources('public')]) {
    assert.doesNotMatch(text, /process\.env/, file);
    assert.doesNotMatch(text, /api[_-]?key|secret|token|password/i, file);
  }
});

test('AC-15: server code makes no outbound network calls', async () => {
  for (const { file, text } of await sources('src')) {
    assert.doesNotMatch(text, /\bfetch\(|http\.request|http\.get|node:https|net\.connect|dgram/, file);
  }
});

test('AC-15: browser code only calls the same-origin upload endpoint', async () => {
  for (const { file, text } of await sources('public')) {
    const urls = [...text.matchAll(/fetch\(\s*(['"`])(.*?)\1/g)].map((m) => m[2]);
    for (const url of urls) assert.equal(url, '/api/uploads', file);
    assert.doesNotMatch(text, /https?:\/\//, file);
  }
});
