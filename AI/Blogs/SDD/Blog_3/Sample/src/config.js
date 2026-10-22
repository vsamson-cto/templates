import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// BR-3 / HD-1: "2 MB" interpreted as 2 × 1024 × 1024 bytes.
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

// BR-2: accepted files allowed per browser session.
export const MAX_FILES_PER_SESSION = 5;

// SEC-2: on an early rejection the server reads and discards at most this many
// body bytes so the client (e.g. a browser) can still read the error response.
// Beyond this the connection is closed instead.
export const MAX_DRAIN_BYTES = 8 * 1024 * 1024;

// BR-5c: the %%EOF marker must appear within this many trailing bytes.
export const EOF_SEARCH_BYTES = 1024;

export const DEFAULT_PORT = 3000;
export const DEFAULT_UPLOAD_DIR = path.join(projectRoot, 'tmp', 'uploads');
export const PUBLIC_DIR = path.join(projectRoot, 'public');
