import test from 'node:test';
import assert from 'node:assert/strict';
import { getFirebaseErrorMessage, subscribeServerCollections } from './firestoreSync.js';

function harness() {
  const listeners = [];
  const events = [];
  const timers = new Map();
  let nextTimer = 0;
  const stop = subscribeServerCollections(['tasks', 'catalogs'].map(ref => ({
    ref, onData: snapshot => events.push(['data', ref, snapshot.docs]),
  })), {
    listen: (ref, options, next, error) => {
      assert.equal(options.includeMetadataChanges, true);
      const listener = { ref, next, error, stopped: false };
      listeners.push(listener);
      return () => { listener.stopped = true; };
    },
    onPending: () => events.push(['pending']),
    onSynced: () => events.push(['synced']),
    onError: error => events.push(['error', error.code]),
    schedule: callback => { timers.set(++nextTimer, callback); return nextTimer; },
    cancel: id => timers.delete(id),
  });
  const emit = (index, metadata = {}) => listeners[index].next({
    docs: [listeners[index].ref],
    metadata: { fromCache: false, hasPendingWrites: false, ...metadata },
  });
  const expire = () => {
    const callbacks = [...timers.values()];
    timers.clear();
    callbacks.forEach(callback => callback());
  };
  return { listeners, events, timers, stop, emit, expire };
}

test('shows cached data but confirms sync only after all collections reach the server', () => {
  const h = harness();
  h.emit(0, { fromCache: true });
  h.emit(1);
  assert.ok(h.events.some(event => event[0] === 'data' && event[1] === 'tasks'));
  assert.equal(h.events.filter(event => event[0] === 'synced').length, 0);
  h.emit(0);
  assert.equal(h.events.filter(event => event[0] === 'synced').length, 1);
  assert.equal(h.timers.size, 0);
  h.stop();
});

test('waits for local writes to be acknowledged and tracks a later lost connection', () => {
  const h = harness();
  h.emit(0, { hasPendingWrites: true });
  h.emit(1);
  assert.equal(h.events.filter(event => event[0] === 'synced').length, 0);
  h.emit(0);
  h.emit(1, { fromCache: true });
  h.expire();
  assert.deepEqual(h.events.at(-1), ['error', 'deadline-exceeded']);
  h.emit(1);
  assert.deepEqual(h.events.at(-1), ['synced']);
  h.stop();
});

test('a denied collection cannot be masked by successful updates from another collection', () => {
  const h = harness();
  h.listeners[0].error({ code: 'permission-denied' });
  h.emit(1);
  assert.ok(h.events.some(event => event[0] === 'error' && event[1] === 'permission-denied'));
  assert.equal(h.events.filter(event => event[0] === 'synced').length, 0);
  assert.equal(h.timers.size, 0);
  h.stop();
});

test('a timed-out sync can recover when server data arrives', () => {
  const h = harness();
  h.expire();
  assert.deepEqual(h.events.at(-1), ['error', 'deadline-exceeded']);
  h.emit(0);
  h.emit(1);
  assert.deepEqual(h.events.at(-1), ['synced']);
  h.stop();
});

test('cleanup removes listeners and ignores late events from a previous session', () => {
  const h = harness();
  h.stop();
  const eventCount = h.events.length;
  h.emit(0);
  h.listeners[1].error({ code: 'permission-denied' });
  h.expire();
  assert.equal(h.events.length, eventCount);
  assert.ok(h.listeners.every(listener => listener.stopped));
  assert.equal(h.timers.size, 0);
});

test('login diagnostics identify the actual site domain and distinguish database permissions', () => {
  const domainMessage = getFirebaseErrorMessage({ code: 'auth/unauthorized-domain' }, 'design-dkpm-app.vercel.app');
  assert.match(domainMessage, /design-dkpm-app\.vercel\.app/);
  assert.match(domainMessage, /Firebase Authentication/);
  assert.match(getFirebaseErrorMessage({ code: 'permission-denied' }), /Akses data ditolak/);
  assert.match(getFirebaseErrorMessage({ code: 'auth/popup-blocked' }), /pop-up/);
});
