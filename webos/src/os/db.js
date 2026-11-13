// WebOS persistent storage — IndexedDB under the 'webos' database.
//
// Two object stores:
//   'kv'    — plain key/value blobs (SQLite database bytes, big app state)
//   'files' — the Files app's virtual disk: { path, blob, type, size, mtime }
//             keyed by path ('/Home/notes.txt'); folders are path prefixes.
//
// localStorage stays the home of small JSON settings (webos.*); anything that
// can grow (files, databases) belongs here.

const DB_NAME = 'webos';
const DB_VERSION = 1;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'path' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('indexedDB open failed'));
  });
  return dbPromise;
}

const tx = async (store, mode, fn) => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const out = fn(t.objectStore(store));
    // fn returns an IDBRequest (wait for it, resolve its result) or
    // undefined (write with no interesting result). Resolving req.result —
    // even when it's undefined — is the point: a missing kvGet key must
    // read as undefined, not as a truthy request object.
    t.oncomplete = () => resolve(out?.result);
    t.onerror = () => reject(t.error || new Error('transaction failed'));
    t.onabort = () => reject(t.error || new Error('transaction aborted'));
  });
};

/* ---- kv ---- */
export const kvGet = (key) => tx('kv', 'readonly', (s) => s.get(key));
export const kvSet = (key, value) => tx('kv', 'readwrite', (s) => s.put(value, key));
export const kvDel = (key) => tx('kv', 'readwrite', (s) => s.delete(key));

/* ---- files (virtual disk) ---- */
export const filePut = (path, blob, type) => {
  const rec = { path, blob, type: type || blob.type || 'application/octet-stream', size: blob.size, mtime: Date.now() };
  return tx('files', 'readwrite', (s) => s.put(rec));
};
export const fileGet = (path) => tx('files', 'readonly', (s) => s.get(path));
// Folders are marker records ({ dir: true }); traversal treats any path
// prefix as a folder too, so files dropped into a "missing" folder still show.
export const dirPut = (path) => tx('files', 'readwrite', (s) => s.put({ path, dir: true, mtime: Date.now() }));
export const fileDel = (path) => tx('files', 'readwrite', (s) => s.delete(path));
export const fileList = () => tx('files', 'readonly', (s) => s.getAll());
export const fileClear = () => tx('files', 'readwrite', (s) => s.clear());

// Delete a path and everything under it (folder delete). A trailing slash
// on the prefix is normalized away so '/docs/' and '/docs' behave the same —
// otherwise the folder marker record would survive a '/docs/' call.
export const fileDelTree = async (prefix) => {
  const root = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  const all = await fileList();
  const doomed = all.filter((f) => f.path === root || f.path.startsWith(`${root}/`));
  for (const f of doomed) await fileDel(f.path);
  return doomed.length;
};


// Read both host-owned IndexedDB stores in one read transaction. The key
// and value arrays from getAllKeys/getAll share IndexedDB's key ordering.
export const dbReadState = async () => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(['kv', 'files'], 'readonly');
    const keys = t.objectStore('kv').getAllKeys();
    const values = t.objectStore('kv').getAll();
    const files = t.objectStore('files').getAll();
    t.oncomplete = () => {
      resolve({
        kvEntries: keys.result.map((key, index) => [key, values.result[index]]),
        files: files.result,
      });
    };
    t.onerror = () => reject(t.error || new Error('snapshot transaction failed'));
    t.onabort = () => reject(t.error || new Error('snapshot transaction aborted'));
  });
};

// Apply both stores atomically. A quota or structured-clone failure aborts
// the transaction and leaves the previous database contents untouched.
const isStringArray = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');

export const dbApplyState = async ({ kvEntries = [], files = [], ownedKvKeys = null } = {}) => {
  if (!Array.isArray(kvEntries) || !Array.isArray(files)
    || (ownedKvKeys !== null && !isStringArray(ownedKvKeys))) {
    throw new TypeError('database replacement requires valid kvEntries, files and optional ownedKvKeys arrays');
  }
  for (const entry of kvEntries) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') {
      throw new TypeError('database replacement contains an invalid key/value entry');
    }
  }
  for (const record of files) {
    if (!record || typeof record.path !== 'string' || !record.path.startsWith('/')) {
      throw new TypeError('database replacement contains an invalid file record');
    }
  }

  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(['kv', 'files'], 'readwrite');
    const kv = t.objectStore('kv');
    const disk = t.objectStore('files');
    try {
      if (ownedKvKeys === null) {
        kv.clear();
        for (const [key, value] of kvEntries) kv.put(value, key);
      } else {
        // A selective restore replaces only explicitly owned keys and keeps
        // unknown/plugin/auth data intact. The read request keeps this
        // transaction active until its success callback queues the writes.
        const keys = kv.getAllKeys();
        keys.onsuccess = () => {
          try {
            for (const key of keys.result) {
              if (ownedKvKeys.includes(key)) kv.delete(key);
            }
            for (const [key, value] of kvEntries) kv.put(value, key);
          } catch (error) {
            try { t.abort(); } catch { /* transaction may already be inactive */ }
            reject(error);
          }
        };
      }
      disk.clear();
      for (const record of files) disk.put(record);
    } catch (error) {
      try { t.abort(); } catch { /* transaction may already be inactive */ }
      reject(error);
      return;
    }
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error || new Error('database replacement failed'));
    t.onabort = () => reject(t.error || new Error('database replacement aborted'));
  });
};
