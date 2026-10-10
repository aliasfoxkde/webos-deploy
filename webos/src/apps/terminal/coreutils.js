/* coreutils.wasm bridge — the wosh terminal's real-utility layer.

   vendor/coreutils.wasm is the uutils coreutils multicall binary
   (wasm32-wasip1, MIT — see vendor/coreutils-LICENSE and the row in
   docs/ATTRIBUTION.md). One lazy fetch, one compiled module, a fresh
   WebAssembly.Instance per invocation (globals reset between runs: no leaked
   exit state, no shared scratch). The virtual disk is seeded from the Files
   app's store before the first run and written back after any run that
   mutated it — ref comparison against the seeded byte arrays decides what
   to persist (MemFS never mutates in place).

   Path model (v2): the disk root '/' is the Files app store root and the
   shell owns a per-session cwd — runUtil pins it on the WASI host each run
   (`opts.cwd`), so utility-relative arguments ('notes', '../docs') resolve
   against the session cwd like a real shell, and absolute paths
   ('/Home/notes.txt') always work. wosh builtins keep precedence over
   shadowing utilities (echo/date/uname/whoami/pwd stay OS-wired); escape
   hatch: `coreutils <util> <args…>` always dispatches into wasm. */

import wasmUrl from '../../../vendor/coreutils.wasm?url';
import { MemFS, WasiHost } from './wasi.js';
import { UTIL_NAMES } from './coreutils-commands.js';
import { fileList, fileGet, filePut, fileDel, dirPut } from '../../os/db.js';

let cu = null; // { module, fs, host, seedBytes: Map, seedDirs: Set, seedFiles: Map }

export { UTIL_NAMES };

async function ensure() {
  if (cu) return cu;
  const res = await fetch(wasmUrl);
  if (!res.ok) throw new Error(`coreutils.wasm fetch failed: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const module = await WebAssembly.compile(bytes);
  const vfs = new MemFS();
  cu = { module, fs: vfs, host: new WasiHost(vfs), seedBytes: new Map(), seedDirs: new Set(), seedFiles: new Map() };
  const records = await fileList();
  const seeded = [];
  for (const rec of records) {
    if (rec.dir) { cu.seedDirs.add(rec.path); seeded.push({ path: rec.path, dir: true }); continue; }
    const blob = rec.blob ? rec.blob : (await fileGet(rec.path))?.blob;
    if (!blob) continue;
    const fileBytes = new Uint8Array(await blob.arrayBuffer());
    cu.seedBytes.set(rec.path, fileBytes);
    cu.seedFiles.set(rec.path, { type: rec.type, mtime: rec.mtime });
    seeded.push({ path: rec.path, bytes: fileBytes, mtime: rec.mtime });
  }
  cu.fs.seed(seeded);
  return cu;
}

/* Persist any mutated/created/deleted paths back to the Files store. */
async function persist() {
  if (!cu || !cu.fs.dirty) return;
  const ops = [];
  const seen = new Set();
  for (const entry of cu.fs.snapshot()) {
    seen.add(entry.path);
    if (entry.dir) {
      if (!cu.seedDirs.has(entry.path)) ops.push(dirPut(entry.path));
      continue;
    }
    if (cu.seedBytes.get(entry.path) !== entry.bytes) {
      // seeded files keep their store MIME type (MemFS writes default to octet-stream)
      const type = cu.seedFiles.get(entry.path)?.type || entry.type;
      ops.push(filePut(entry.path, new Blob([entry.bytes], { type })));
    }
  }
  for (const path of cu.seedFiles.keys()) {
    if (!seen.has(path)) ops.push(fileDel(path));
  }
  await Promise.all(ops);
  cu.fs.dirty = false;
}

/* Run one utility. `opts.cwd` pins the session cwd for this run (relative
   arguments inside the guest resolve against it). Returns
   { code, stdout, stderr, truncated }. */
export async function runUtil(name, args, opts = {}) {
  const ctx = await ensure();
  const argv = ['coreutils', name, ...args];
  ctx.host.reset(argv);
  ctx.host.cwd = opts.cwd || '/';
  // Async instantiate only — Chrome forbids sync `new WebAssembly.Instance`
  // on the main thread once the module's wire bytes exceed 8MB (this one is
  // ~10MB), and suggests exactly this API in the error text. The module
  // overload resolves directly to the Instance (no {module, instance} pair).
  const inst = await WebAssembly.instantiate(ctx.module, { wasi_snapshot_preview1: ctx.host.imports() });
  ctx.host.memory = inst.exports.memory;
  let code = 0;
  try {
    inst.exports._start();
  } catch (err) {
    if (err?.wasiExit !== undefined) code = err.wasiExit;
    else if (!err?.wasiCap) {
      code = 134; // wasm trap (`abort`) — mirror SIGABRT
      ctx.host.stderr += `${String((err && err.message) || err)}\n`;
    }
  }
  await persist();
  return { code, stdout: ctx.host.stdout, stderr: ctx.host.stderr, truncated: ctx.host.truncated };
}
