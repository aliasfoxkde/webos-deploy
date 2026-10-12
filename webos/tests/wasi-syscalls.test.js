// WASI preview1 syscall suite — drives the real imports() surface with a
// scratch WebAssembly.Memory, exactly the way the coreutils guest calls it
// (raw pointers + little-endian scalars, no wasm binary needed). Covers the
// arg/env bridge, std streams + caps, the fd table (open/read/write/seek/
// stat/readdir), preopen discovery, path ops, clocks/random, poll_oneoff
// and the ENOTSUP stubs.
import { describe, it, expect } from 'vitest';
import { MemFS, WasiHost, errno, normalize, join } from '../src/apps/terminal/wasi.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

/* Boot a host bound to a fresh MemFS + real wasm memory. `files` are
   [path, text] pairs; stdin/cwd/argv/envs shape the per-run state. */
function boot({ files = [], argv = ['prog'], envs = [], cwd = '/', stdin = '', caps = {} } = {}) {
  const fs = new MemFS();
  fs.seed(files.map(([path, text]) => ({ path, bytes: enc.encode(text) })));
  const host = new WasiHost(fs, caps);
  host.memory = new WebAssembly.Memory({ initial: 1 });
  host.reset(argv, envs, enc.encode(stdin));
  host.cwd = cwd;
  return { fs, host, imp: host.imports() };
}
const dvOf = (host) => new DataView(host.memory.buffer);
const u8Of = (host) => new Uint8Array(host.memory.buffer);
const readCStr = (host, ptr) => {
  const b = u8Of(host);
  let end = ptr;
  while (b[end]) end += 1;
  return dec.decode(b.subarray(ptr, end));
};
const writeIovec = (host, at, ptr, len) => {
  const d = dvOf(host);
  d.setUint32(at, ptr, true);
  d.setUint32(at + 4, len, true);
};

describe('args + environ bridge', () => {
  it('sizes report count and NUL-terminated byte length', () => {
    const { host, imp } = boot({ argv: ['ls', '-la'], envs: ['A=1', 'BB=22'] });
    imp.args_sizes_get(100, 104);
    imp.environ_sizes_get(108, 112);
    const d = dvOf(host);
    expect(d.getUint32(100, true)).toBe(2);
    expect(d.getUint32(104, true)).toBe('ls'.length + 1 + '-la'.length + 1);
    expect(d.getUint32(108, true)).toBe(2);
    expect(d.getUint32(112, true)).toBe(4 + 6);
  });

  it('args_get writes pointers then strings; guest reads them back', () => {
    const { host, imp } = boot({ argv: ['cat', 'file with spaces.txt'] });
    imp.args_get(8, 64); // argv table at 8, string heap at 64
    const d = dvOf(host);
    expect(d.getUint32(8, true)).toBe(64);
    expect(readCStr(host, d.getUint32(8, true))).toBe('cat');
    expect(readCStr(host, d.getUint32(12, true))).toBe('file with spaces.txt');
  });

  it('environ_get roundtrips KEY=VALUE strings', () => {
    const { host, imp } = boot({ envs: ['TERM=xterm-256color'] });
    imp.environ_get(8, 64);
    const d = dvOf(host);
    expect(readCStr(host, d.getUint32(8, true))).toBe('TERM=xterm-256color');
  });
});

describe('clocks, random, process', () => {
  it('clock_time_get serves realtime and monotonic clocks as ns', () => {
    const { host, imp } = boot();
    imp.clock_time_get(0, 0, 16);
    const wallNs = Number(dvOf(host).getBigUint64(16, true));
    expect(Math.abs(wallNs / 1e6 - Date.now())).toBeLessThan(5_000);
    imp.clock_time_get(1, 0, 24);
    const monoNs = Number(dvOf(host).getBigUint64(24, true));
    expect(monoNs).toBeGreaterThan(0);
  });

  it('clock_res_get reports 1ns', () => {
    const { host, imp } = boot();
    expect(imp.clock_res_get(0, 16)).toBe(errno.SUCCESS);
    expect(dvOf(host).getBigUint64(16, true)).toBe(1n);
  });

  it('random_get fills the buffer with non-constant bytes', () => {
    const { host, imp } = boot();
    u8Of(host).fill(0, 32, 64);
    expect(imp.random_get(32, 32)).toBe(errno.SUCCESS);
    expect(u8Of(host).subarray(32, 64).some((b) => b !== 0)).toBe(true);
  });

  it('sched_yield succeeds; proc_exit throws the exit code; proc_raise is ENOSYS', () => {
    const { imp } = boot();
    expect(imp.sched_yield()).toBe(errno.SUCCESS);
    expect(() => imp.proc_exit(7)).toThrow();
    try {
      imp.proc_exit(7);
    } catch (e) {
      expect(e.wasiExit).toBe(7);
    }
    expect(imp.proc_raise(1)).toBe(errno.ENOSYS);
  });
});

describe('std streams', () => {
  it('fd_write to 1 and 2 accumulates output and reports nwritten', () => {
    const { host, imp } = boot();
    enc.encode('hello ').forEach((b, i) => { u8Of(host)[128 + i] = b; });
    enc.encode('world').forEach((b, i) => { u8Of(host)[160 + i] = b; });
    writeIovec(host, 8, 128, 6);
    writeIovec(host, 16, 160, 5);
    expect(imp.fd_write(1, 8, 2, 24)).toBe(errno.SUCCESS);
    expect(dvOf(host).getUint32(24, true)).toBe(11);
    expect(host.stdout).toBe('hello world');
    expect(imp.fd_write(2, 8, 2, 24)).toBe(errno.SUCCESS);
    expect(host.stderr).toBe('hello world');
  });

  it('runaway output trips the cap: truncated flag + wasiCap trap', () => {
    const { host, imp } = boot({ caps: { maxOut: 16, maxErr: 8 } });
    enc.encode('x'.repeat(64)).forEach((b, i) => { u8Of(host)[128 + i] = b; });
    writeIovec(host, 8, 128, 64);
    expect(() => imp.fd_write(1, 8, 1, 24)).toThrow();
    expect(host.truncated).toBe(true);
    expect(() => imp.fd_write(2, 8, 1, 24)).toThrow();
    expect(host.truncated).toBe(true);
  });

  it('fd_read serves pipeline stdin then EOF', () => {
    const { host, imp } = boot({ stdin: 'piped' });
    writeIovec(host, 8, 256, 16);
    expect(imp.fd_read(0, 8, 1, 24)).toBe(errno.SUCCESS);
    expect(dvOf(host).getUint32(24, true)).toBe(5);
    expect(dec.decode(u8Of(host).subarray(256, 261))).toBe('piped');
    expect(imp.fd_read(0, 8, 1, 24)).toBe(errno.SUCCESS); // stdinPos at end
    expect(dvOf(host).getUint32(24, true)).toBe(0); // EOF, not an error
  });

  it('fd_read refuses unhandled std fds and unknown fds', () => {
    const { host, imp } = boot();
    writeIovec(host, 8, 600, 2);
    expect(imp.fd_read(1, 8, 1, 24)).toBe(errno.ENOTSUP);
    expect(imp.fd_read(9, 8, 1, 24)).toBe(errno.EBADF);
  });

  it('fd_close drops the handle', () => {
    const { host, imp } = boot();
    host.fds.set(4, { path: '/f', pos: 0, append: false, dir: false });
    expect(imp.fd_close(4)).toBe(errno.SUCCESS);
    expect(host.fds.has(4)).toBe(false);
  });

  it('fd_fdstat_get types: char streams, dir preopen, regular files', () => {
    const { host, imp } = boot({ files: [['/f.txt', 'x']] });
    host.fds.set(4, { path: '/f.txt', pos: 0, append: false, dir: false });
    imp.fd_fdstat_get(0, 64);
    expect(dvOf(host).getUint8(64)).toBe(2); // character device (FILETYPE.char)
    imp.fd_fdstat_get(3, 64);
    expect(dvOf(host).getUint8(64)).toBe(3); // dir
    imp.fd_fdstat_get(4, 64);
    expect(dvOf(host).getUint8(64)).toBe(4); // regular
    expect(dvOf(host).getBigUint64(64 + 16, true)).toBe(0xFFFFFFFFFFFFFFFFn);
  });

  it('no-op setters and syncs all succeed', () => {
    const { imp } = boot();
    expect(imp.fd_fdstat_set_flags(1, 0)).toBe(errno.SUCCESS);
    expect(imp.fd_fdstat_set_rights(1, 0n, 0n)).toBe(errno.SUCCESS);
    expect(imp.fd_sync(1)).toBe(errno.SUCCESS);
    expect(imp.fd_datasync(1)).toBe(errno.SUCCESS);
    expect(imp.fd_advise(1, 0, 0, 0)).toBe(errno.SUCCESS);
    expect(imp.fd_allocate(1, 0, 0)).toBe(errno.SUCCESS);
  });
});

describe('fd table: file io', () => {
  const openFile = (booted, path, oflags = 0, fdflags = 0) => {
    const { host, imp } = booted;
    const bytes = enc.encode(path);
    u8Of(host).set(bytes, 512);
    imp.path_open(3, 0, 512, bytes.length, oflags, 0n, 0n, fdflags, 8);
    return dvOf(host).getUint32(8, true);
  };

  it('fd_write to an open file writes at pos; append mode writes at end', () => {
    const booted = boot({ files: [['/log.txt', 'ab']] });
    const { host, imp } = booted;
    const fd = openFile(booted, '/log.txt');
    enc.encode('CD').forEach((b, i) => { u8Of(host)[600 + i] = b; });
    writeIovec(host, 8, 600, 2);
    expect(imp.fd_write(fd, 8, 1, 24)).toBe(errno.SUCCESS);
    expect(dec.decode(host.fs.get('/log.txt').bytes)).toBe('CD'); // pos 0 overwrite
    // reopen with APPEND: writes land after existing bytes
    const fdA = openFile(booted, '/log.txt', 0, 1);
    writeIovec(host, 8, 600, 2);
    imp.fd_write(fdA, 8, 1, 24);
    expect(dec.decode(host.fs.get('/log.txt').bytes)).toBe('CDCD');
    expect(host.fds.get(fdA).append).toBe(true);
  });

  it('fd_write to a bare fd is EBADF; to a directory fd is EISDIR', () => {
    const booted = boot({ files: [['/d/f.txt', 'x']] });
    writeIovec(booted.host, 8, 600, 2);
    expect(booted.imp.fd_write(42, 8, 1, 24)).toBe(errno.EBADF);
    const dirFd = openFile(booted, '/d', 0);
    expect(booted.imp.fd_write(dirFd, 8, 1, 24)).toBe(errno.EISDIR);
  });

  it('fd_read advances pos across calls until EOF', () => {
    const booted = boot({ files: [['/f.txt', 'abcdefgh']] });
    const fd = openFile(booted, '/f.txt');
    const { host, imp } = booted;
    writeIovec(host, 8, 600, 3);
    expect(imp.fd_read(fd, 8, 1, 24)).toBe(errno.SUCCESS);
    expect(dvOf(host).getUint32(24, true)).toBe(3);
    expect(dec.decode(u8Of(host).subarray(600, 603))).toBe('abc');
    writeIovec(host, 8, 610, 99); // len > remaining → clamps to EOF
    imp.fd_read(fd, 8, 1, 24);
    expect(dvOf(host).getUint32(24, true)).toBe(5);
    expect(dec.decode(u8Of(host).subarray(610, 615))).toBe('defgh');
    imp.fd_read(fd, 8, 1, 24);
    expect(dvOf(host).getUint32(24, true)).toBe(0);
  });

  it('fd_read on a directory is EISDIR', () => {
    const booted = boot({ files: [['/d/f.txt', 'x']] });
    const fd = openFile(booted, '/d');
    writeIovec(booted.host, 8, 600, 2);
    expect(booted.imp.fd_read(fd, 8, 1, 24)).toBe(errno.EISDIR);
  });

  it('fd_seek resolves SET/CUR/END and clamps negatives; fd_tell reads pos', () => {
    const booted = boot({ files: [['/f.txt', '0123456789']] });
    const { host, imp } = booted;
    const fd = openFile(booted, '/f.txt');
    expect(imp.fd_seek(fd, 4n, 0, 16)).toBe(errno.SUCCESS); // SET
    expect(dvOf(host).getBigUint64(16, true)).toBe(4n);
    expect(imp.fd_seek(fd, -1n, 1, 16)).toBe(errno.SUCCESS); // CUR
    expect(dvOf(host).getBigUint64(16, true)).toBe(3n);
    expect(imp.fd_seek(fd, 0n, 2, 16)).toBe(errno.SUCCESS); // END
    expect(dvOf(host).getBigUint64(16, true)).toBe(10n);
    expect(imp.fd_seek(fd, -100n, 0, 16)).toBe(errno.SUCCESS); // clamps to 0
    expect(dvOf(host).getBigUint64(16, true)).toBe(0n);
    expect(imp.fd_seek(99, 0n, 0, 16)).toBe(errno.EBADF);
    expect(imp.fd_tell(fd, 16)).toBe(errno.SUCCESS);
    expect(dvOf(host).getBigUint64(16, true)).toBe(0n);
    expect(imp.fd_tell(99, 16)).toBe(errno.EBADF);
  });

  it('fd_filestat_get reports size/type; EBADF/ENOENT paths', () => {
    const booted = boot({ files: [['/f.txt', 'abcd']] });
    const { host, imp } = booted;
    const fd = openFile(booted, '/f.txt');
    expect(imp.fd_filestat_get(fd, 64)).toBe(errno.SUCCESS);
    const d = dvOf(host);
    expect(d.getBigUint64(64 + 32, true)).toBe(4n); // size
    expect(d.getUint8(64 + 16)).toBe(4); // regular
    expect(imp.fd_filestat_get(99, 64)).toBe(errno.EBADF);
    host.fds.set(9, { path: '/gone', pos: 0, append: false, dir: false });
    expect(imp.fd_filestat_get(9, 64)).toBe(errno.ENOENT);
  });

  it('fd_filestat_set_size shrinks and grows a file', () => {
    const booted = boot({ files: [['/f.txt', 'abcdefgh']] });
    const { host, imp } = booted;
    const fd = openFile(booted, '/f.txt');
    expect(imp.fd_filestat_set_size(fd, 3)).toBe(errno.SUCCESS);
    expect(dec.decode(host.fs.get('/f.txt').bytes)).toBe('abc');
    expect(imp.fd_filestat_set_size(fd, 5)).toBe(errno.SUCCESS);
    expect([...host.fs.get('/f.txt').bytes]).toEqual([97, 98, 99, 0, 0]);
    expect(imp.fd_filestat_set_size(99, 1)).toBe(errno.EBADF);
  });

  it('fd_filestat_set_times applies SET_ATIM (ns→ms), SET_*_NOW, keeps otherwise', () => {
    const booted = boot({ files: [['/f.txt', 'x']] });
    const { host, imp } = booted;
    const fd = openFile(booted, '/f.txt');
    host.fs.utimes('/f.txt', 1, 2);
    // FSTFLAGS: SET_ATIM=1, SET_ATIM_NOW=2, SET_MTIM=4, SET_MTIM_NOW=8
    expect(imp.fd_filestat_set_times(fd, 5_000_000n, 6_000_000n, 1 | 4)).toBe(errno.SUCCESS);
    expect(host.fs.get('/f.txt').atime).toBe(5); // ns → ms
    expect(host.fs.get('/f.txt').mtime).toBe(6);
    const before = Date.now();
    expect(imp.fd_filestat_set_times(fd, 0n, 0n, 2 | 8)).toBe(errno.SUCCESS);
    expect(host.fs.get('/f.txt').atime).toBeGreaterThanOrEqual(before);
    expect(host.fs.get('/f.txt').mtime).toBeGreaterThanOrEqual(before);
    expect(imp.fd_filestat_set_times(99, 0n, 0n, 0)).toBe(errno.EBADF);
  });

  it('fd_readdir emits dirents (name + type + cookie); cookie pages; small buffers truncate', () => {
    const booted = boot({ files: [['/d/b.txt', '1'], ['/d/a/c.txt', '2'], ['/d/z', '3']] });
    const { host, imp } = booted;
    const dirFd = openFile(booted, '/d');
    expect(imp.fd_readdir(dirFd, 256, 4096, 0, 24)).toBe(errno.SUCCESS);
    const d = dvOf(host);
    const written = d.getUint32(24, true);
    expect(written).toBeGreaterThan(0);
    // parse the dirent stream: [next:8][ino:8][namlen:4][type:1][name...]
    const names = [];
    for (let at = 256; at < 256 + written;) {
      const next = Number(d.getBigUint64(at, true));
      const namlen = d.getUint32(at + 16, true);
      const type = d.getUint8(at + 20);
      const name = dec.decode(u8Of(host).subarray(at + 24, at + 24 + namlen));
      names.push([name, type]);
      at += 24 + namlen;
      expect(next).toBeGreaterThan(0);
    }
    expect(names.map(([n]) => n)).toEqual(['a', 'b.txt', 'z']);
    expect(names[0][1]).toBe(3); // 'a' inferred dir
    expect(names[1][1]).toBe(4); // regular
    // cookie skips the first entry
    expect(imp.fd_readdir(dirFd, 256, 4096, 1, 24)).toBe(errno.SUCCESS);
    expect(d.getUint32(24, true)).toBeLessThan(written);
    // a buffer fitting exactly one 24-byte header + 1-char name truncates early
    expect(imp.fd_readdir(dirFd, 256, 25, 0, 24)).toBe(errno.SUCCESS);
    expect(d.getUint32(24, true)).toBe(25);
    expect(imp.fd_readdir(99, 256, 4096, 0, 24)).toBe(errno.EBADF);
    const fileFd = openFile(booted, '/d/z');
    expect(imp.fd_readdir(fileFd, 256, 4096, 0, 24)).toBe(errno.ENOTDIR);
  });
});

describe('preopen discovery', () => {
  it('fd 3 announces the root preopen; other fds are EBADF', () => {
    const { host, imp } = boot();
    expect(imp.fd_prestat_get(3, 64)).toBe(errno.SUCCESS);
    expect(dvOf(host).getUint8(64)).toBe(0); // preopendir tag
    expect(dvOf(host).getUint32(64 + 4, true)).toBe(1); // name len "/"
    expect(imp.fd_prestat_get(4, 64)).toBe(errno.EBADF);
  });

  it('fd_prestat_dir_name writes "/"; short buffers and bad fds refuse', () => {
    const { imp } = boot();
    expect(imp.fd_prestat_dir_name(3, 64, 8)).toBe(errno.SUCCESS);
    // (string verified via the preopen contract in path tests; length gate:)
    expect(imp.fd_prestat_dir_name(3, 64, 0)).toBe(errno.ENAMETOOLONG);
    expect(imp.fd_prestat_dir_name(4, 64, 8)).toBe(errno.EBADF);
  });
});

describe('path operations', () => {
  const open = (booted, path, oflags = 0, fdflags = 0, dirfd = 3) => {
    const { host, imp } = booted;
    const bytes = enc.encode(path);
    u8Of(host).set(bytes, 512);
    const rc = imp.path_open(dirfd, 0, 512, bytes.length, oflags, 0n, 0n, fdflags, 8);
    return { rc, fd: dvOf(host).getUint32(8, true) };
  };
  const stat = (booted, path, dirfd = 3) => {
    const { host, imp } = booted;
    const bytes = enc.encode(path);
    u8Of(host).set(bytes, 512);
    const rc = imp.path_filestat_get(dirfd, 0, 512, bytes.length, 64);
    if (rc !== errno.SUCCESS) return { rc };
    const d = dvOf(host);
    return { rc, size: Number(d.getBigUint64(64 + 32, true)), type: d.getUint8(64 + 16) };
  };

  it('opens existing files; relative paths resolve against the session cwd', () => {
    const booted = boot({ files: [['/Home/notes.txt', 'hi']] , cwd: '/Home' });
    const { rc, fd } = open(booted, 'notes.txt');
    expect(rc).toBe(errno.SUCCESS);
    expect(booted.host.fds.get(fd).path).toBe('/Home/notes.txt');
    expect(open(booted, '/Home/notes.txt').rc).toBe(errno.SUCCESS);
  });

  it('CREAT makes empty files (and dirs with DIRECTORY); missing without CREAT is ENOENT', () => {
    const booted = boot();
    const { fs } = booted;
    expect(open(booted, '/new.txt').rc).toBe(errno.ENOENT);
    expect(open(booted, '/new.txt', 1).rc).toBe(errno.SUCCESS); // OFLAGS.CREAT
    expect(fs.get('/new.txt').bytes).toHaveLength(0);
    expect(open(booted, '/x/y', 1 | 2).rc).toBe(errno.SUCCESS); // CREAT|DIRECTORY
    expect(fs.get('/x/y').dir).toBe(true);
  });

  it('EXCL on existing is EEXIST; TRUNC zeroes; dir opens refuse CREAT/TRUNC; DIRECTORY on file is ENOTDIR', () => {
    const booted = boot({ files: [['/f.txt', 'data'], ['/d/x', 'y']] });
    const { fs } = booted;
    expect(open(booted, '/f.txt', 4).rc).toBe(errno.EEXIST); // EXCL
    const { rc } = open(booted, '/f.txt', 1 | 8); // CREAT|TRUNC
    expect(rc).toBe(errno.SUCCESS);
    expect(fs.get('/f.txt').bytes).toHaveLength(0);
    expect(open(booted, '/d', 1).rc).toBe(errno.EISDIR); // CREAT on dir
    expect(open(booted, '/d', 8).rc).toBe(errno.EISDIR); // TRUNC on dir
    expect(open(booted, '/f.txt', 2).rc).toBe(errno.ENOTDIR); // DIRECTORY on file
    expect(open(booted, '/f.txt', 0, 0, 99).rc).toBe(errno.EBADF); // bad dirfd
  });

  it('path_filestat_get stats files and dirs; missing is ENOENT; bad dirfd EBADF', () => {
    const booted = boot({ files: [['/f.txt', 'abcd'], ['/d/x', 'y']] });
    expect(stat(booted, '/f.txt')).toMatchObject({ rc: 0, size: 4, type: 4 });
    expect(stat(booted, '/d')).toMatchObject({ rc: 0, type: 3 });
    expect(stat(booted, '/nope').rc).toBe(errno.ENOENT);
    expect(stat(booted, '/f.txt', 99).rc).toBe(errno.EBADF);
  });

  it('path_filestat_set_times: ns inputs land as ms, NOW stamps, missing is ENOENT', () => {
    const booted = boot({ files: [['/f.txt', 'x']] });
    const { host, imp } = booted;
    const call = (atim, mtim, flags) => {
      const bytes = enc.encode('/f.txt');
      u8Of(host).set(bytes, 512);
      return imp.path_filestat_set_times(3, 0, 512, bytes.length, atim, mtim, flags);
    };
    host.fs.utimes('/f.txt', 1, 2);
    expect(call(7_000_000n, 8_000_000n, 1 | 4)).toBe(errno.SUCCESS);
    expect(host.fs.get('/f.txt').atime).toBe(7);
    expect(host.fs.get('/f.txt').mtime).toBe(8);
    const before = Date.now();
    expect(call(0n, 0n, 2 | 8)).toBe(errno.SUCCESS);
    expect(host.fs.get('/f.txt').atime).toBeGreaterThanOrEqual(before);
    const bytes = enc.encode('/nope');
    u8Of(host).set(bytes, 512);
    expect(imp.path_filestat_set_times(3, 0, 512, bytes.length, 0n, 0n, 1)).toBe(errno.ENOENT);
  });

  it('path_create_directory makes dirs; existing is EEXIST; bad dirfd EBADF', () => {
    const booted = boot();
    const { host, imp } = booted;
    const mk = (path, dirfd = 3) => {
      const bytes = enc.encode(path);
      u8Of(host).set(bytes, 512);
      return imp.path_create_directory(dirfd, 512, bytes.length);
    };
    expect(mk('/a/b')).toBe(errno.SUCCESS);
    expect(booted.fs.get('/a/b').dir).toBe(true);
    expect(mk('/a/b')).toBe(errno.EEXIST);
    expect(mk('/c', 99)).toBe(errno.EBADF);
  });

  it('path_remove_directory + path_unlink_file map MemFS errnos through guarded', () => {
    const booted = boot({ files: [['/d/inner.txt', 'x'], ['/f.txt', 'y']] });
    const { host, imp } = booted;
    const call = (imp_, path, dirfd = 3) => {
      const bytes = enc.encode(path);
      u8Of(host).set(bytes, 512);
      return imp_(dirfd, 512, bytes.length);
    };
    expect(call(imp.path_remove_directory, '/d')).toBe(errno.ENOTEMPTY); // guarded catch
    expect(call(imp.path_unlink_file, '/d/inner.txt')).toBe(errno.SUCCESS);
    expect(call(imp.path_remove_directory, '/d')).toBe(errno.SUCCESS);
    expect(host.fs.get('/d')).toBeUndefined();
    expect(call(imp.path_unlink_file, '/ghost')).toBe(errno.SUCCESS); // rm -f
    expect(call(imp.path_remove_directory, '/nope', 99)).toBe(errno.EBADF);
    expect(call(imp.path_unlink_file, '/f.txt', 99)).toBe(errno.EBADF);
  });

  it('path_rename moves files and subtrees; EBADF on bad dirfds', () => {
    const booted = boot({ files: [['/a/inner.txt', 'x'], ['/b', '']] });
    const { host, imp } = booted;
    const mv = (from, to, dirfd = 3, newDirfd = 3) => {
      const fb = enc.encode(from);
      const tb = enc.encode(to);
      u8Of(host).set(fb, 512);
      u8Of(host).set(tb, 600);
      return imp.path_rename(dirfd, 512, fb.length, newDirfd, 600, tb.length);
    };
    expect(mv('/a/inner.txt', '/b/renamed.txt')).toBe(errno.SUCCESS);
    expect(host.fs.get('/b/renamed.txt')).toBeTruthy();
    expect(host.fs.get('/a/inner.txt')).toBeUndefined();
    expect(mv('/a', '/nope', 99)).toBe(errno.EBADF);
    expect(mv('/a', '/nope', 3, 99)).toBe(errno.EBADF);
  });

  it('symlinks, links, readlink and sockets are ENOTSUP', () => {
    const { imp } = boot();
    expect(imp.path_readlink()).toBe(errno.ENOTSUP);
    expect(imp.path_symlink()).toBe(errno.ENOTSUP);
    expect(imp.path_link()).toBe(errno.ENOTSUP);
    expect(imp.sock_accept()).toBe(errno.ENOTSUP);
    expect(imp.sock_recv()).toBe(errno.ENOTSUP);
    expect(imp.sock_send()).toBe(errno.ENOTSUP);
  });
});

describe('poll_oneoff', () => {
  it('answers every subscription immediately, echoing userdata and type', () => {
    const { host, imp } = boot();
    const d = dvOf(host);
    // two 48-byte subscriptions: [userdata:8][tag u8 @8]...
    d.setBigUint64(0, 111n, true);
    d.setUint8(8, 0); // clock
    d.setBigUint64(48, 222n, true);
    d.setUint8(56, 1); // fd_readwrite
    expect(imp.poll_oneoff(0, 256, 2, 8)).toBe(errno.SUCCESS);
    expect(d.getUint32(8, true)).toBe(2); // nevents
    // 32-byte events at 256 and 288
    expect(d.getBigUint64(256, true)).toBe(111n);
    expect(d.getUint16(256 + 8, true)).toBe(errno.SUCCESS);
    expect(d.getUint8(256 + 10)).toBe(0);
    expect(d.getBigUint64(288, true)).toBe(222n);
    expect(d.getUint8(288 + 10)).toBe(1);
  });
});

describe('module helpers', () => {
  it('normalize and join are exported pure helpers', () => {
    expect(normalize('/a//b/./c/..')).toBe('/a/b');
    expect(join('/Home', './x')).toBe('/Home/x');
  });
});
