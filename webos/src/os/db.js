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
    t.oncomplete = () => resolve(out?.result !== undefined ? out.result : out);
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

// Delete a path and everything under it (folder delete).
export const fileDelTree = async (prefix) => {
  const all = await fileList();
  const doomed = all.filter((f) => f.path === prefix || f.path.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`));
  for (const f of doomed) await fileDel(f.path);
  return doomed.length;
};
