import { MAX_FILE_BYTES, EOF_SEARCH_BYTES } from './config.js';

const PDF_SIGNATURE = Buffer.from('%PDF-', 'latin1');
const PDF_EOF_MARKER = Buffer.from('%%EOF', 'latin1');

const fail = (status, message) => ({ ok: false, status, message });
const OK = Object.freeze({ ok: true });

export const MESSAGES = Object.freeze({
  missingName: 'Upload failed: no file name was provided.',
  notPdf: (name) => `Upload failed: "${name}" is not a PDF. Only .pdf files are allowed.`,
  tooLarge: (name) => `Upload failed: "${name}" is larger than the 2 MB limit.`,
  empty: (name) => `Upload failed: "${name}" is empty.`,
  badSignature: (name) => `Upload failed: "${name}" is not a valid PDF file.`,
  noEof: (name) => `Upload failed: "${name}" appears to be incomplete or corrupted.`,
});

/** BR-4: file name present and ends in .pdf (case-insensitive). */
export function validateFileName(name) {
  if (typeof name !== 'string' || name.trim() === '') return fail(400, MESSAGES.missingName);
  if (!name.toLowerCase().endsWith('.pdf')) return fail(415, MESSAGES.notPdf(name));
  return OK;
}

/** BR-3: declared or actual size within the limit. */
export function validateSize(name, byteLength) {
  if (byteLength > MAX_FILE_BYTES) return fail(413, MESSAGES.tooLarge(name));
  return OK;
}

/** BR-5: basic content checks, applied in BR-6 order after size. */
export function validateContent(name, buffer) {
  const size = validateSize(name, buffer.length);
  if (!size.ok) return size;
  if (buffer.length === 0) return fail(422, MESSAGES.empty(name));
  if (!buffer.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE)) {
    return fail(422, MESSAGES.badSignature(name));
  }
  const tail = buffer.subarray(Math.max(0, buffer.length - EOF_SEARCH_BYTES));
  if (!tail.includes(PDF_EOF_MARKER)) return fail(422, MESSAGES.noEof(name));
  return OK;
}

/** Full check for a received file: name → extension → size → content (BR-6). */
export function validateUpload(name, buffer) {
  const nameResult = validateFileName(name);
  if (!nameResult.ok) return nameResult;
  return validateContent(name, buffer);
}
