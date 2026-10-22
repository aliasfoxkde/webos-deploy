// Test environment setup — runs before every test file.
//
// fake-indexeddb gives os/db.js a real IDB implementation under happy-dom
// (which ships none); importing the /auto side effect installs the globals.
import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';
import { configure } from '@testing-library/react';

// RTL's async helpers (findByText and friends) give up after 1 s by default.
// On a loaded machine an async lookup that resolves in 2 ms of real time can
// still miss that budget, and the suite then fails for load reasons rather
// than logic. Give the async utilities the same headroom the 20 s per-test
// budget already allows.
configure({ asyncUtilTimeout: 5_000 });

// fake-indexeddb structured-clones records with Node's structuredClone, which
// does not recognize happy-dom's Blob — stored blobs degrade to content-less
// plain objects and the wasi bridge's `blob.arrayBuffer()` seeding breaks.
// Node's native Blob IS cloneable (and has arrayBuffer/text), matching real
// browser IDB behavior, so pin it as the global for every suite.
if (globalThis.Blob !== NodeBlob) globalThis.Blob = NodeBlob;

// happy-dom lacks URL.createObjectURL/revokeObjectURL (used by file/blob
// download paths); minimal in-memory stand-ins that track call counts.
let objectUrlSeq = 0;
const objectUrlCounts = new Map();
if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = (blob) => {
    const url = `blob:test-${++objectUrlSeq}`;
    objectUrlCounts.set(url, blob);
    return url;
  };
  globalThis.URL.revokeObjectURL = (url) => objectUrlCounts.delete(url);
}

// Reset per-test module state cleanly: db.js memoizes its connection, so
// tests that need a fresh DB reset modules via vi.resetModules() + this map.
export {};
