/* WASI preview1 host shim + in-memory filesystem, purpose-built for the
   terminal's coreutils.wasm bridge (see coreutils.js).

   Why hand-rolled: the shell only needs the ~40 syscalls Rust's std actually
   imports on wasip1 (args/env/clock/random/stdio + a single preopen root),
   and every off-the-shelf shim is a runtime dependency for a 10% subset.
   Filesystem: one preopen at "/", backed by a Map of virtual paths seeded
   from the OS files store. Reads/writes are fully in-memory per invocation;
   the caller diffs + persists afterwards (persist()). stdin is empty-EOF and
   poll_oneoff fires clock waits immediately — `sleep` returns at once, which
   is honest only because wosh has no pipelines to block anyway.

   Layout notes (spec: WebAssembly/WASI preview1): fdstat=24B, filestat=64B,
   dirent=24B, event=32B, subscription=48B, iovec=8B, prestat=8B. Always
   re-take the DataView per call — wasm memory can grow between syscalls. */

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: false });

const errno = {
  SUCCESS: 0, EBADF: 8, EEXIST: 20, EINVAL: 28, EIO: 29, EISDIR: 31,
  ENAMETOOLONG: 37, ENOENT: 44, ENOSYS: 52, ENOTDIR: 54, ENOTEMPTY: 55,
  ENOTSUP: 58,
};
const FILETYPE = { unknown: 0, dir: 3, regular: 4 };
const OFLAGS = { CREAT: 1, DIRECTORY: 2, EXCL: 4, TRUNC: 8 };
const FDFLAGS = { APPEND: 1 };
const FSTFLAGS = { SET_ATIM: 1, SET_ATIM_NOW: 2, SET_MTIM: 4, SET_MTIM_NOW: 8 };

/* Absolute-path normalize: collapse '.', '..', duplicate '/'. Returns '/'. */
export function normalize(p) {
  const out = [];
  for (const part of String(p).split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return `/${out.join('/')}`;
}

export const join = (base, p) => (p.startsWith('/') ? normalize(p) : normalize(`${base}/${p}`));

/* One in-memory virtual disk. Paths are absolute POSIX-ish strings matching
   the Files app's store ('/Home/notes.txt'); implicit parents are dirs. */
export class MemFS {
  constructor() {
    this.entries = new Map(); // path -> { dir, bytes: Uint8Array|null, mtime, atime, type }
    this.entries.set('/', { dir: true, bytes: null, mtime: Date.now(), atime: Date.now() });
    this.dirty = false; // any mutation since seed (drives persist())
  }

  seed(records) {
    for (const rec of records) {
      const path = normalize(rec.path);
      if (rec.dir) this.mkdirp(path);
      else this.write(path, rec.bytes, rec.mtime || 0, true);
    }
    this.dirty = false;
  }

  parent(path) {
    const p = normalize(path);
    return p === '/' ? null : p.slice(0, p.lastIndexOf('/')) || '/';
  }
  base(path) {
    const p = normalize(path);
    return p === '/' ? '' : p.slice(p.lastIndexOf('/') + 1);
  }

  /* Create the entry and every missing ancestor as a directory. Newly
     created entries mark the disk dirty (drives persist()). */
  mkdirp(path) {
    const parts = normalize(path).split('/').filter(Boolean);
    let cur = '';
    for (const part of parts) {
      cur += `/${part}`;
      const existing = this.entries.get(cur);
      if (existing && !existing.dir) throw errno.ENOTDIR;
      if (!existing) {
        this.entries.set(cur, { dir: true, bytes: null, mtime: 0, atime: 0 });
        this.dirty = true;
      }
    }
  }

  get(path) {
    const p = normalize(path);
    if (this.entries.has(p)) return this.entries.get(p);
    // implicit directory: any stored entry under this prefix makes it a dir
    const prefix = p.endsWith('/') ? p : `${p}/`;
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) {
        const implicit = { dir: true, bytes: null, mtime: 0, atime: 0 };
        this.entries.set(p, implicit);
        return implicit;
      }
    }
    return undefined;
  }

  children(path) {
    const p = normalize(path);
    const prefix = p.endsWith('/') ? p : `${p}/`;
    const names = new Map(); // name -> entry (implicit dirs materialized on demand)
    for (const [key, entry] of this.entries) {
      if (key === p || !key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      const slash = rest.indexOf('/');
      const name = slash < 0 ? rest : rest.slice(0, slash);
      if (!name) continue;
      if (slash < 0) names.set(name, entry);
      else if (!names.has(name)) names.set(name, { dir: true, bytes: null, mtime: 0, atime: 0 });
    }
    return [...names.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }

  /* Replace file contents. */
  write(path, bytes, mtime = Date.now(), quiet = false) {
    const p = normalize(path);
    const parent = this.parent(p);
    if (parent && this.get(parent) && !this.get(parent).dir) throw errno.ENOTDIR;
    const existing = this.entries.get(p);
    if (existing?.dir) throw errno.EISDIR;
    this.entries.set(p, { dir: false, bytes, mtime, atime: mtime, type: existing?.type || 'application/octet-stream' });
    if (!quiet) this.dirty = true;
  }

  remove(path, { dir = false } = {}) {
    const p = normalize(path);
    const entry = this.entries.get(p);
    if (!entry) { this.dirty = true; return; } // rm -f semantics; missing is fine
    if (dir && !entry.dir) throw errno.ENOTDIR;
    if (!dir && entry.dir) throw errno.EISDIR;
    if (entry.dir && this.children(p).length) throw errno.ENOTEMPTY;
    this.entries.delete(p);
    this.dirty = true;
  }

  rename(from, to) {
    const a = normalize(from);
    const b = normalize(to);
    const entry = this.entries.get(a);
    if (!entry) throw errno.ENOENT;
    if (b.startsWith(`${a}/`)) throw errno.EINVAL; // no move into own subtree
    const target = this.entries.get(b);
    if (target?.dir && this.children(b).length) throw errno.ENOTEMPTY;
    if (target && target.dir !== entry.dir) throw errno.EISDIR;
    const moved = new Map();
    for (const [key, value] of this.entries) {
      if (key === a) { moved.set(b, { ...value, mtime: Date.now() }); continue; }
      if (key.startsWith(`${a}/`)) { moved.set(`${b}${key.slice(a.length)}`, value); continue; }
      moved.set(key, value);
    }
    this.entries = moved;
    this.dirty = true;
  }

  utimes(path, atime, mtime) {
    const entry = this.entries.get(normalize(path));
    if (!entry) throw errno.ENOENT;
    entry.atime = atime;
    entry.mtime = mtime;
    this.dirty = true;
  }

  /* Full enumeration for write-back: every materialized entry except root
     (root is the Files store itself, never a record). */
  snapshot() {
    const out = [];
    for (const [path, entry] of this.entries) {
      if (path === '/') continue;
      out.push({ path, dir: entry.dir, bytes: entry.bytes, type: entry.type, mtime: entry.mtime });
    }
    return out;
  }
}

/* WASI preview1 host bound to a MemFS. stdout/stderr accumulate per run and
   are reset by reset(); stdin is empty (read → EOF). `memory` is assigned by
   the caller right after instantiation (imports must exist first), and every
   syscall re-takes its DataView, so wasm memory growth is always safe. */
export class WasiHost {
  constructor(fs, { maxOut = 128 * 1024, maxErr = 16 * 1024 } = {}) {
    this.fs = fs;
    this.memory = null; // WebAssembly.Memory — set before the first syscall
    this.fds = new Map(); // fd -> { path, pos, append, dir } for open files
    this.nextFd = 4; // 0-2 std streams, 3 the preopen root
    this.args = [];
    this.envs = [];
    this.stdout = '';
    this.stderr = '';
    this.maxOut = maxOut;
    this.maxErr = maxErr;
    this.truncated = false;
  }

  reset(argv, envs = []) {
    this.args = argv;
    this.envs = envs;
    this.stdout = '';
    this.stderr = '';
    this.fds = new Map();
    this.nextFd = 4;
    this.truncated = false;
  }

  imports() {
    const view = () => new DataView(this.memory.buffer);
    const u8 = () => new Uint8Array(this.memory.buffer);
    const readStr = (ptr, len) => decoder.decode(u8().subarray(ptr, ptr + len));
    const writeStr = (ptr, s) => u8().set(encoder.encode(s), ptr);
    const host = this;

    const statOf = (path, entry) => ({
      dev: 0, ino: hashPath(path),
      filetype: entry.dir ? FILETYPE.dir : FILETYPE.regular,
      nlink: 1, size: entry.dir ? 0 : (entry.bytes?.length || 0),
      atim: entry.atime || 0, mtim: entry.mtime || 0, ctim: entry.mtime || 0,
    });
    const writeStat = (path, entry, outPtr, dv) => {
      const st = statOf(path, entry);
      dv.setBigUint64(outPtr, BigInt(st.dev), true);
      dv.setBigUint64(outPtr + 8, BigInt(st.ino), true);
      dv.setUint8(outPtr + 16, st.filetype);
      dv.setBigUint64(outPtr + 24, BigInt(st.nlink), true);
      dv.setBigUint64(outPtr + 32, BigInt(st.size), true);
      dv.setBigUint64(outPtr + 40, BigInt(st.atim), true);
      dv.setBigUint64(outPtr + 48, BigInt(st.mtim), true);
      dv.setBigUint64(outPtr + 56, BigInt(st.ctim), true);
    };
    /* filestat_set_times: apply NOW/SET flags (ns inputs → ms), else keep. */
    const applySetTimes = (path, atim, mtim, flags) => {
      const entry = host.fs.get(path);
      if (!entry) return errno.ENOENT;
      const now = Date.now();
      host.fs.utimes(
        path,
        flags & FSTFLAGS.SET_ATIM_NOW ? now : flags & FSTFLAGS.SET_ATIM ? Number(atim) / 1e6 : entry.atime,
        flags & FSTFLAGS.SET_MTIM_NOW ? now : flags & FSTFLAGS.SET_MTIM ? Number(mtim) / 1e6 : entry.mtime,
      );
      return errno.SUCCESS;
    };
    /* path-level ops that report their own errno. */
    const guarded = (fn) => { try { return fn(); } catch (e) { return typeof e === 'number' ? e : errno.EIO; } };

    return {
      /* ---- process args/env ---- */
      args_sizes_get(argcPtr, bufSizePtr) {
        const dv = view();
        dv.setUint32(argcPtr, host.args.length, true);
        dv.setUint32(bufSizePtr, host.args.reduce((n, a) => n + encoder.encode(a).length + 1, 0), true);
        return errno.SUCCESS;
      },
      args_get(argvPtr, bufPtr) {
        const dv = view();
        for (const arg of host.args) {
          dv.setUint32(argvPtr, bufPtr, true);
          writeStr(bufPtr, arg);
          bufPtr += encoder.encode(arg).length + 1;
          argvPtr += 4;
        }
        return errno.SUCCESS;
      },
      environ_sizes_get(countPtr, bufSizePtr) {
        const dv = view();
        dv.setUint32(countPtr, host.envs.length, true);
        dv.setUint32(bufSizePtr, host.envs.reduce((n, e) => n + encoder.encode(e).length + 1, 0), true);
        return errno.SUCCESS;
      },
      environ_get(environPtr, bufPtr) {
        const dv = view();
        for (const env of host.envs) {
          dv.setUint32(environPtr, bufPtr, true);
          writeStr(bufPtr, env);
          bufPtr += encoder.encode(env).length + 1;
          environPtr += 4;
        }
        return errno.SUCCESS;
      },

      /* ---- clocks / random / process ---- */
      clock_time_get(clockId, _precision, outPtr) {
        const ms = clockId === 0 ? Date.now() : performance.now();
        view().setBigUint64(outPtr, BigInt(Math.round(ms * 1e6)), true);
        return errno.SUCCESS;
      },
      clock_res_get(_clockId, outPtr) {
        view().setBigUint64(outPtr, 1n, true);
        return errno.SUCCESS;
      },
      random_get(bufPtr, len) {
        crypto.getRandomValues(u8().subarray(bufPtr, bufPtr + len));
        return errno.SUCCESS;
      },
      sched_yield() { return errno.SUCCESS; },
      proc_exit(code) { throw { wasiExit: code | 0 }; },
      proc_raise(_sig) { return errno.ENOSYS; },

      /* ---- std streams + file descriptors ---- */
      fd_write(fd, iovsPtr, iovsLen, nwrittenPtr) {
        const dv = view();
        let total = 0;
        let text = '';
        for (let i = 0; i < iovsLen; i++) {
          const base = iovsPtr + i * 8;
          const ptr = dv.getUint32(base, true);
          const len = dv.getUint32(base + 4, true);
          text += decoder.decode(u8().subarray(ptr, ptr + len));
          total += len;
        }
        if (fd === 1 || fd === 2) {
          // runaway streams (`yes`) end as a trap once the cap is hit — the
          // runner catches it and marks the output truncated
          if (fd === 1) {
            host.stdout += text;
            if (host.stdout.length > host.maxOut) { host.truncated = true; throw { wasiCap: true }; }
          } else {
            host.stderr += text;
            if (host.stderr.length > host.maxErr) { host.truncated = true; throw { wasiCap: true }; }
          }
        } else {
          const handle = host.fds.get(fd);
          if (!handle) return errno.EBADF;
          const entry = host.fs.get(handle.path);
          if (!entry || entry.dir) return errno.EISDIR;
          const enc = encoder.encode(text);
          const old = entry.bytes || new Uint8Array(0);
          const start = handle.append ? old.length : Math.min(handle.pos, old.length);
          const merged = new Uint8Array(start + enc.length);
          merged.set(old.subarray(0, start));
          merged.set(enc, start);
          handle.pos = merged.length;
          host.fs.write(handle.path, merged);
        }
        view().setUint32(nwrittenPtr, total, true);
        return errno.SUCCESS;
      },
      fd_read(fd, iovsPtr, iovsLen, nreadPtr) {
        const handle = host.fds.get(fd);
        if (!handle) return fd <= 2 ? errno.ENOTSUP : errno.EBADF; // stdin: EOF already returned
        const entry = host.fs.get(handle.path);
        if (!entry || entry.dir) return errno.EISDIR;
        const dv = view();
        const bytes = entry.bytes || new Uint8Array(0);
        let total = 0;
        for (let i = 0; i < iovsLen && handle.pos < bytes.length; i++) {
          const base = iovsPtr + i * 8;
          const ptr = dv.getUint32(base, true);
          const len = dv.getUint32(base + 4, true);
          const slice = bytes.subarray(handle.pos, handle.pos + len);
          u8().set(slice, ptr);
          handle.pos += slice.length;
          total += slice.length;
        }
        view().setUint32(nreadPtr, total, true);
        return errno.SUCCESS;
      },
      fd_close(fd) { host.fds.delete(fd); return errno.SUCCESS; },
      fd_fdstat_get(fd, outPtr) {
        const dv = view();
        dv.setUint8(outPtr, fd === 3 ? FILETYPE.dir : fd <= 2 ? FILETYPE.char : FILETYPE.regular);
        dv.setBigUint64(outPtr + 8, 0n, true); // flags word + padding, all defaults
        const rights = 0xFFFFFFFFFFFFFFFFn; // permissive: std only sanity-checks
        dv.setBigUint64(outPtr + 16, rights, true);
        dv.setBigUint64(outPtr + 24, rights, true);
        return errno.SUCCESS;
      },
      fd_fdstat_set_flags(_fd, _flags) { return errno.SUCCESS; },
      fd_fdstat_set_rights(_fd, _base, _inheriting) { return errno.SUCCESS; },
      fd_sync(_fd) { return errno.SUCCESS; },
      fd_datasync(_fd) { return errno.SUCCESS; },
      fd_advise(_fd, _off, _len, _advice) { return errno.SUCCESS; },
      fd_allocate(_fd, _off, _len) { return errno.SUCCESS; },
      fd_seek(fd, offset, whence, newOffPtr) {
        const handle = host.fds.get(fd);
        if (!handle) return errno.EBADF;
        const size = host.fs.get(handle.path)?.bytes?.length || 0;
        const base = whence === 0 ? 0n : whence === 1 ? BigInt(handle.pos) : BigInt(size);
        handle.pos = Math.max(0, Number(base + offset));
        view().setBigUint64(newOffPtr, BigInt(handle.pos), true);
        return errno.SUCCESS;
      },
      fd_tell(fd, newOffPtr) {
        const handle = host.fds.get(fd);
        if (!handle) return errno.EBADF;
        view().setBigUint64(newOffPtr, BigInt(handle.pos), true);
        return errno.SUCCESS;
      },
      fd_filestat_get(fd, outPtr) {
        const handle = host.fds.get(fd);
        if (!handle) return errno.EBADF;
        const entry = host.fs.get(handle.path);
        if (!entry) return errno.ENOENT;
        writeStat(handle.path, entry, outPtr, view());
        return errno.SUCCESS;
      },
      fd_filestat_set_size(fd, size) {
        const handle = host.fds.get(fd);
        if (!handle) return errno.EBADF;
        const entry = host.fs.get(handle.path);
        if (!entry || entry.dir) return errno.EISDIR;
        const old = entry.bytes || new Uint8Array(0);
        const shrunk = new Uint8Array(Number(size));
        shrunk.set(old.subarray(0, Number(size)));
        host.fs.write(handle.path, shrunk);
        return errno.SUCCESS;
      },
      fd_filestat_set_times(fd, atim, mtim, flags) {
        const handle = host.fds.get(fd);
        if (!handle) return errno.EBADF;
        return applySetTimes(handle.path, atim, mtim, flags);
      },
      fd_readdir(fd, bufPtr, bufLen, cookie, outLenPtr) {
        const handle = host.fds.get(fd);
        if (!handle) return errno.EBADF;
        const entry = host.fs.get(handle.path);
        if (!entry?.dir) return errno.ENOTDIR;
        const dv = view();
        const kids = host.fs.children(handle.path);
        let written = 0;
        for (let i = Number(cookie); i < kids.length; i++) {
          const [name, kid] = kids[i];
          const nameBytes = encoder.encode(name);
          if (written + 24 + nameBytes.length > bufLen) break;
          const start = bufPtr + written;
          dv.setBigUint64(start, BigInt(i + 1), true); // d_next cookie
          dv.setBigUint64(start + 8, BigInt(hashPath(name)), true); // d_ino
          dv.setUint32(start + 16, nameBytes.length, true); // d_namlen
          dv.setUint8(start + 20, kid.dir ? FILETYPE.dir : FILETYPE.regular);
          u8().set(nameBytes, start + 24);
          written += 24 + nameBytes.length;
        }
        view().setUint32(outLenPtr, written, true);
        return errno.SUCCESS;
      },

      /* ---- preopen discovery: exactly one root at fd 3 ---- */
      fd_prestat_get(fd, outPtr) {
        if (fd !== 3) return errno.EBADF;
        const dv = view();
        dv.setUint8(outPtr, 0); // tag: preopendir
        dv.setUint32(outPtr + 4, 1, true); // name length: "/"
        return errno.SUCCESS;
      },
      fd_prestat_dir_name(fd, pathPtr, pathLen) {
        if (fd !== 3) return errno.EBADF;
        if (pathLen < 1) return errno.ENAMETOOLONG;
        writeStr(pathPtr, '/');
        return errno.SUCCESS;
      },

      /* ---- path operations (preopen root = the whole virtual disk) ----
         Scalar note: oflags/fdflags arrive as plain values — only openedPtr
         is a memory pointer. Rights are accepted but never enforced. */
      path_open(dirfd, _dirflags, pathPtr, pathLen, oflags, _rightsBase, _rightsInheriting, fdflags, openedPtr) {
        const dv = view();
        const path = readStr(pathPtr, pathLen);
        const root = host.resolveDir(dirfd);
        if (root === undefined) return errno.EBADF;
        const full = join(root, path);
        const existed = !!host.fs.get(full);
        if (!existed && (oflags & OFLAGS.CREAT)) {
          if (oflags & OFLAGS.DIRECTORY) host.fs.mkdirp(full);
          else host.fs.write(full, new Uint8Array(0));
        }
        const entry = host.fs.get(full);
        if (!entry) return errno.ENOENT;
        if ((oflags & OFLAGS.EXCL) && existed) return errno.EEXIST;
        if ((oflags & OFLAGS.DIRECTORY) && !entry.dir) return errno.ENOTDIR;
        if (entry.dir) {
          if (oflags & OFLAGS.CREAT) return errno.EISDIR;
          if (oflags & OFLAGS.TRUNC) return errno.EISDIR;
        } else if (oflags & OFLAGS.TRUNC) {
          host.fs.write(full, new Uint8Array(0));
        }
        const fd = host.nextFd++;
        host.fds.set(fd, { path: full, pos: 0, append: !!(fdflags & FDFLAGS.APPEND), dir: entry.dir });
        dv.setUint32(openedPtr, fd, true);
        return errno.SUCCESS;
      },
      path_filestat_get(dirfd, _flags, pathPtr, pathLen, outPtr) {
        // no symlinks in this fs — follow or not, same answer
        const path = readStr(pathPtr, pathLen);
        const root = host.resolveDir(dirfd);
        if (root === undefined) return errno.EBADF;
        const full = join(root, path);
        const entry = host.fs.get(full);
        if (!entry) return errno.ENOENT;
        writeStat(full, entry, outPtr, view());
        return errno.SUCCESS;
      },
      path_filestat_set_times(dirfd, _flags, pathPtr, pathLen, atim, mtim, flags) {
        const path = readStr(pathPtr, pathLen);
        const root = host.resolveDir(dirfd);
        if (root === undefined) return errno.EBADF;
        return applySetTimes(join(root, path), atim, mtim, flags);
      },
      path_create_directory(dirfd, pathPtr, pathLen) {
        const path = readStr(pathPtr, pathLen);
        const root = host.resolveDir(dirfd);
        if (root === undefined) return errno.EBADF;
        const full = join(root, path);
        if (host.fs.get(full)) return errno.EEXIST;
        host.fs.mkdirp(full); // mkdirp marks the disk dirty
        return errno.SUCCESS;
      },
      path_remove_directory(dirfd, pathPtr, pathLen) {
        const path = readStr(pathPtr, pathLen);
        const root = host.resolveDir(dirfd);
        if (root === undefined) return errno.EBADF;
        return guarded(() => { host.fs.remove(join(root, path), { dir: true }); return errno.SUCCESS; });
      },
      path_unlink_file(dirfd, pathPtr, pathLen) {
        const path = readStr(pathPtr, pathLen);
        const root = host.resolveDir(dirfd);
        if (root === undefined) return errno.EBADF;
        return guarded(() => { host.fs.remove(join(root, path)); return errno.SUCCESS; });
      },
      path_rename(dirfd, oldPtr, oldLen, newDirfd, newPtr, newLen) {
        const from = readStr(oldPtr, oldLen);
        const to = readStr(newPtr, newLen);
        const root = host.resolveDir(dirfd);
        const newRoot = host.resolveDir(newDirfd);
        if (root === undefined || newRoot === undefined) return errno.EBADF;
        return guarded(() => { host.fs.rename(join(root, from), join(newRoot, to)); return errno.SUCCESS; });
      },
      path_readlink() { return errno.ENOTSUP; },
      path_symlink() { return errno.ENOTSUP; },
      path_link() { return errno.ENOTSUP; },

      /* poll_oneoff: only used by std::thread::sleep here. Clock waits fire
         immediately (no real time passes); every subscription reports ready. */
      poll_oneoff(inPtr, outPtr, nsubscriptions, neventsPtr) {
        const dv = view();
        for (let i = 0; i < nsubscriptions; i++) {
          const sub = inPtr + i * 48;
          const ev = outPtr + i * 32;
          dv.setBigUint64(ev, dv.getBigUint64(sub, true), true); // userdata
          dv.setUint16(ev + 8, errno.SUCCESS, true); // error
          dv.setUint8(ev + 10, dv.getUint8(sub + 8), true); // event type = sub tag
          dv.setBigUint64(ev + 16, 0n, true); // fd_readwrite.nbytes
          dv.setUint16(ev + 24, 0, true); // flags
        }
        view().setUint32(neventsPtr, nsubscriptions, true);
        return errno.SUCCESS;
      },
      sock_accept() { return errno.ENOTSUP; },
      sock_recv() { return errno.ENOTSUP; },
      sock_send() { return errno.ENOTSUP; },
    };
  }

  /* Map a dirfd to its guest directory path. fd 3 is the preopen root "/";
     open directory handles resolve to their own path. */
  resolveDir(fd) {
    if (fd === 3) return '/';
    const handle = this.fds.get(fd);
    if (!handle) return undefined;
    return handle.dir ? handle.path : undefined;
  }
}

/* Stable-enough inode substitute: FNV-1a over the path string. */
function hashPath(path) {
  let h = 0x811c9dc5;
  for (let i = 0; i < path.length; i++) {
    h ^= path.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export { errno };
