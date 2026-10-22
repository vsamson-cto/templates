// Local mock — replace with production integration later.
// Stores accepted files in the local temporary storage area (tmp/uploads/).
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function createStorage(rootDir) {
  const root = path.resolve(rootDir);

  /**
   * Write `buffer` to <root>/<sessionId>/<uuid>.pdf. Paths are built only from
   * server-generated UUIDs, never from client input (SEC-1).
   */
  async function saveFile(sessionId, buffer) {
    if (!UUID.test(sessionId)) throw new Error('invalid session id');
    const id = randomUUID();
    const dir = path.join(root, sessionId);
    const filePath = path.join(dir, `${id}.pdf`);
    await mkdir(dir, { recursive: true });
    await writeFile(filePath, buffer, { flag: 'wx' });
    return { id, path: filePath };
  }

  return { root, saveFile };
}
