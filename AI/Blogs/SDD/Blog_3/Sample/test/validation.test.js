import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateFileName, validateContent, validateUpload } from '../src/validation.js';
import { MAX_FILE_BYTES, EOF_SEARCH_BYTES } from '../src/config.js';
import { makePdf } from './helpers.js';

test('AC-1: valid small PDF passes', () => {
  assert.deepEqual(validateUpload('doc.pdf', makePdf()), { ok: true });
});

test('AC-2: exactly 2,097,152 bytes passes', () => {
  assert.equal(MAX_FILE_BYTES, 2097152);
  assert.equal(validateUpload('big.pdf', makePdf(MAX_FILE_BYTES)).ok, true);
});

test('AC-2: 2,097,153 bytes is rejected with 413 and mentions 2 MB', () => {
  const r = validateUpload('big.pdf', makePdf(MAX_FILE_BYTES + 1));
  assert.equal(r.status, 413);
  assert.match(r.message, /2 MB/);
});

test('AC-3: non-.pdf extensions are rejected with 415', () => {
  for (const name of ['notes.txt', 'image.png', 'README', 'file.pdf.exe']) {
    const r = validateFileName(name);
    assert.equal(r.status, 415, name);
    assert.match(r.message, /Only \.pdf files are allowed/);
  }
});

test('AC-3: extension check is case-insensitive', () => {
  assert.equal(validateUpload('REPORT.PDF', makePdf()).ok, true);
});

test('AC-3: extension is checked before content (BR-6)', () => {
  assert.equal(validateUpload('notes.txt', makePdf()).status, 415);
});

test('AC-4: missing %PDF- signature is rejected with 422', () => {
  const buf = Buffer.from('hello world\n%%EOF\n', 'latin1');
  const r = validateContent('fake.pdf', buf);
  assert.equal(r.status, 422);
  assert.match(r.message, /not a valid PDF/);
});

test('AC-5: missing %%EOF is rejected with 422', () => {
  const r = validateContent('cut.pdf', Buffer.from('%PDF-1.4\nsome bytes', 'latin1'));
  assert.equal(r.status, 422);
  assert.match(r.message, /incomplete or corrupted/);
});

test('AC-5: %%EOF outside the last 1,024 bytes is rejected', () => {
  const buf = Buffer.concat([
    Buffer.from('%PDF-1.4\n%%EOF\n', 'latin1'),
    Buffer.alloc(EOF_SEARCH_BYTES, 0x20),
  ]);
  assert.equal(validateContent('trailing.pdf', buf).status, 422);
});

test('AC-5: %%EOF exactly at the start of the last 1,024 bytes passes', () => {
  const buf = Buffer.concat([
    Buffer.from('%PDF-1.4\n', 'latin1'),
    Buffer.alloc(4000, 0x20),
    Buffer.from('%%EOF', 'latin1'),
    Buffer.alloc(EOF_SEARCH_BYTES - 5, 0x20),
  ]);
  assert.equal(validateContent('edge.pdf', buf).ok, true);
});

test('AC-6: empty file is rejected with 422', () => {
  const r = validateContent('empty.pdf', Buffer.alloc(0));
  assert.equal(r.status, 422);
  assert.match(r.message, /is empty/);
});

test('AC-11: missing or blank file name is rejected with 400', () => {
  for (const name of [undefined, '', '   ']) {
    assert.equal(validateFileName(name).status, 400);
  }
});
