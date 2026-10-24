// Error-path coverage for os/db.js: the promise plumbing that the happy-path
// tests in os-db.test.js and os-db-coverage.test.js never exercise — a failed
// database open, a failing transaction, an aborted transaction, and the
// memoized connection (a second call must reuse the same promise, not reopen).
// Each case drives a real fake-indexeddb instance and forces the failure at
// the IndexedDB boundary, so the module's own reject/resolve wiring is what
// is under test.
import { describe, it, expect, beforeEach, vi } from 'vitest';

let db;

beforeEach(async () => {
  vi.resetModules();
  indexedDB = new IDBFactory(); // eslint-disable-line no-global-assign
  db = await import('../src/os/db.js');
});

describe('os/db.js error paths and connection reuse', () => {
  it('rejects with a useful error when the database cannot open', async () => {
    // The open request fails inside fake-indexeddb when the factory errors;
    // replace open() with one whose request reports an error immediately.
    const boom = new Error('disk unavailable');
    indexedDB.open = () => {
      // FDBOpenDBRequest shape: the module only reads .onupgradeneeded,
      // .onsuccess and .onerror assignments plus result/error.
      const req = {
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        result: null,
        error: boom,
      };
      // The module assigns handlers then awaits; fire onerror asynchronously
      // so the assignment has happened.
      queueMicrotask(() => req.onerror?.());
      return req;
    };
    await expect(db.kvGet('x')).rejects.toThrow('disk unavailable');
  });

  it('rejects with a fallback message when an open error carries no error object', async () => {
    indexedDB.open = () => {
      const req = { onupgradeneeded: null, onsuccess: null, onerror: null, result: null, error: null };
      queueMicrotask(() => req.onerror?.());
      return req;
    };
    await expect(db.kvGet('x')).rejects.toThrow('indexedDB open failed');
  });

  it('rejects when the transaction errors mid-flight', async () => {
    const realOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args) => {
      const req = realOpen(...args);
      // The module assigns req.onsuccess AFTER open() returns, which would
      // overwrite a plain wrapper — so intercept the assignment itself. The
      // getter chains our db-wrapping hook in front of the module's handler
      // at dispatch time, with the real event.
      let moduleHandler;
      const wrapDb = (ev) => {
        const db2 = ev.target.result;
        const origTransaction = db2.transaction.bind(db2);
        db2.transaction = (...targs) => {
          const t = origTransaction(...targs);
          // Swallow completion and fail the module's promise the moment it
          // wires onerror — assignment interception, so no microtask race
          // against the commit.
          Object.defineProperty(t, 'oncomplete', {
            get: () => () => {}, set: () => {},
          });
          Object.defineProperty(t, 'onerror', {
            get: () => t._onerror, set: (fn) => { fn(t.error || new Error('transaction failed')); },
          });
          Object.defineProperty(t, 'onabort', {
            get: () => t._onabort, set: (fn) => { t._onabort = fn; },
          });
          return t;
        };
      };
      Object.defineProperty(req, 'onsuccess', {
        get: () => moduleHandler && ((ev) => { wrapDb(ev); moduleHandler(ev); }),
        set: (fn) => { moduleHandler = fn; },
      });
      return req;
    };
    await expect(db.kvGet('x')).rejects.toThrow(/transaction failed|aborted/i);
  });

  it('rejects when the transaction aborts', async () => {
    const realOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args) => {
      const req = realOpen(...args);
      // Same onsuccess-assignment interception as the error case, but the
      // transaction wrapper fails via onabort instead.
      let moduleHandler;
      const wrapDb = (ev) => {
        const db2 = ev.target.result;
        const origTransaction = db2.transaction.bind(db2);
        db2.transaction = (...targs) => {
          const t = origTransaction(...targs);
          Object.defineProperty(t, 'oncomplete', {
            get: () => () => {}, set: () => {},
          });
          Object.defineProperty(t, 'onerror', {
            get: () => t._onerror, set: (fn) => { t._onerror = fn; },
          });
          Object.defineProperty(t, 'onabort', {
            get: () => t._onabort, set: (fn) => { fn(t.error || new Error('transaction aborted')); },
          });
          return t;
        };
      };
      Object.defineProperty(req, 'onsuccess', {
        get: () => moduleHandler && ((ev) => { wrapDb(ev); moduleHandler(ev); }),
        set: (fn) => { moduleHandler = fn; },
      });
      return req;
    };
    await expect(db.kvGet('x')).rejects.toThrow('transaction aborted');
  });

  it('memoizes the connection — repeated calls reuse one open', async () => {
    let opens = 0;
    const realOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args) => {
      opens += 1;
      return realOpen(...args);
    };
    await db.kvSet('a', 1);
    await db.kvGet('a');
    await db.fileList();
    expect(opens).toBe(1);
    await expect(db.kvGet('a')).resolves.toBe(1);
  });
});
