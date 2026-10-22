// Local mock — replace with production integration later.
// In-memory browser-session store: state lives only in this process and is
// lost on restart (BR-1, HD-4).
import { randomUUID } from 'node:crypto';
import { MAX_FILES_PER_SESSION } from './config.js';

export function createSessionStore({ maxFiles = MAX_FILES_PER_SESSION } = {}) {
  const sessions = new Map();

  function create() {
    const id = randomUUID();
    sessions.set(id, { accepted: 0, reserved: 0 });
    return id;
  }

  function has(id) {
    return typeof id === 'string' && sessions.has(id);
  }

  function remaining(id) {
    const s = sessions.get(id);
    return s ? maxFiles - s.accepted - s.reserved : 0;
  }

  /**
   * Synchronously claim a slot (SEC-4). Callers must not await between a
   * remaining()/reserve() decision and this call. Returns false at the limit.
   */
  function reserve(id) {
    const s = sessions.get(id);
    if (!s || s.accepted + s.reserved >= maxFiles) return false;
    s.reserved += 1;
    return true;
  }

  /** Turn a reserved slot into an accepted file. */
  function commit(id) {
    const s = sessions.get(id);
    if (!s || s.reserved === 0) throw new Error('commit without reservation');
    s.reserved -= 1;
    s.accepted += 1;
  }

  /** Give back a reserved slot (e.g. the file write failed). */
  function release(id) {
    const s = sessions.get(id);
    if (!s || s.reserved === 0) throw new Error('release without reservation');
    s.reserved -= 1;
  }

  return { create, has, remaining, reserve, commit, release, maxFiles };
}
