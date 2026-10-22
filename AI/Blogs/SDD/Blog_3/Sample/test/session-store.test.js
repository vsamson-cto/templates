import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionStore } from '../src/session-store.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test('new session has a random UUID and a quota of 5', () => {
  const store = createSessionStore();
  const a = store.create();
  const b = store.create();
  assert.match(a, UUID);
  assert.notEqual(a, b);
  assert.equal(store.remaining(a), 5);
});

test('AC-7: reserve succeeds 5 times then fails', () => {
  const store = createSessionStore();
  const id = store.create();
  for (let i = 0; i < 5; i++) {
    assert.equal(store.reserve(id), true);
    store.commit(id);
  }
  assert.equal(store.remaining(id), 0);
  assert.equal(store.reserve(id), false);
});

test('AC-10: reservations count toward the limit before commit', () => {
  const store = createSessionStore();
  const id = store.create();
  const results = Array.from({ length: 6 }, () => store.reserve(id));
  assert.deepEqual(results, [true, true, true, true, true, false]);
});

test('AC-8: release frees a reserved slot', () => {
  const store = createSessionStore();
  const id = store.create();
  for (let i = 0; i < 5; i++) store.reserve(id);
  store.release(id);
  assert.equal(store.remaining(id), 1);
  assert.equal(store.reserve(id), true);
});

test('AC-9: sessions have independent quotas', () => {
  const store = createSessionStore();
  const a = store.create();
  const b = store.create();
  for (let i = 0; i < 5; i++) { store.reserve(a); store.commit(a); }
  assert.equal(store.remaining(a), 0);
  assert.equal(store.remaining(b), 5);
});

test('unknown session IDs are not accepted', () => {
  const store = createSessionStore();
  assert.equal(store.has('nope'), false);
  assert.equal(store.has(undefined), false);
  assert.equal(store.reserve('nope'), false);
  assert.equal(store.remaining('nope'), 0);
});

test('commit/release without reservation throw', () => {
  const store = createSessionStore();
  const id = store.create();
  assert.throws(() => store.commit(id));
  assert.throws(() => store.release(id));
});
