// Test environment setup — runs before every test file.
//
// fake-indexeddb gives os/db.js a real IDB implementation under happy-dom
// (which ships none); importing the /auto side effect installs the globals.
import 'fake-indexeddb/auto';

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
