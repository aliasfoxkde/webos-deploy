// Terminal path model v2: the WASI preopen root resolves relative path
// syscalls against the session cwd (host.cwd), '~' maps to '/Home'.
import { describe, it, expect } from 'vitest';
import { MemFS, WasiHost, errno, normalize } from '../src/apps/terminal/wasi.js';
import { HOME, tilde, expandTilde } from '../src/apps/terminal/paths.js';

const enc = new TextEncoder();
const dec = new TextDecoder();
const OFLAGS_CREAT = 1; // WASI preview1 path_open oflags bit (public spec value)

const mem = new WebAssembly.Memory({ initial: 1 });
const setup = (seed = [], cwd = '/') => {
  const fs = new MemFS();
  fs.seed(seed);
  const host = new WasiHost(fs);
  host.memory = mem;
  host.cwd = cwd;
  return { fs, host, imp: host.imports() };
};
const writePath = (ptr, s) => new Uint8Array(mem.buffer).set(enc.encode(s), ptr);

describe('wasi host cwd', () => {
  it('maps the preopen root fd to the session cwd', () => {
    const { host } = setup([], '/Home/docs');
    expect(host.resolveDir(3)).toBe('/Home/docs');
  });

  it('defaults the cwd to /', () => {
    const { host } = setup();
    expect(host.cwd).toBe('/');
    expect(host.resolveDir(3)).toBe('/');
  });

  it('resolves relative path_create_directory against the cwd', () => {
    const { fs, imp } = setup([{ path: '/Home/docs', dir: true }], '/Home/docs');
    writePath(64, 'notes');
    expect(imp.path_create_directory(3, 64, 5)).toBe(errno.SUCCESS);
    expect(fs.get('/Home/docs/notes')?.dir).toBe(true);
    expect(fs.get('/notes')).toBeUndefined();
  });

  it('lets absolute paths bypass the cwd', () => {
    const { fs, imp } = setup([{ path: '/Home/docs', dir: true }], '/Home/docs');
    writePath(64, '/tmp-box');
    expect(imp.path_create_directory(3, 64, 8)).toBe(errno.SUCCESS);
    expect(fs.get('/tmp-box')?.dir).toBe(true);
  });

  it('resolves path_open .. and . segments against the cwd', () => {
    const { fs, imp } = setup(
      [{ path: '/Home/docs', dir: true }, { path: '/Home/docs/sub', dir: true }],
      '/Home/docs/sub',
    );
    writePath(64, '../up.txt');
    const openedPtr = 128;
    expect(imp.path_open(3, 0, 64, 9, OFLAGS_CREAT, 0, 0, 0, openedPtr)).toBe(errno.SUCCESS);
    expect(fs.get('/Home/docs/up.txt')?.dir).toBe(false);
  });

  it('clamps traversal above the root', () => {
    const { fs, imp } = setup([{ path: '/a', dir: true }], '/a/b');
    writePath(64, '../../../top');
    expect(imp.path_create_directory(3, 64, 12)).toBe(errno.SUCCESS);
    expect(fs.get('/top')?.dir).toBe(true);
  });

  it('reports the cwd path for fd_prestat lookups while root stays mounted', () => {
    const { imp } = setup([], '/Home');
    writePath(64, 'x'.repeat(16));
    expect(imp.fd_prestat_dir_name(3, 64, 16)).toBe(errno.SUCCESS);
    expect(dec.decode(new Uint8Array(mem.buffer).subarray(64, 65))).toBe('/');
  });
});

describe('wosh path presentation', () => {
  it('normalizes dot segments', () => {
    expect(normalize('/Home/./docs/')).toBe('/Home/docs');
    expect(normalize('/Home/docs/../docs/sub')).toBe('/Home/docs/sub');
    expect(normalize('')).toBe('/');
  });

  it('renders paths inside home with ~', () => {
    expect(tilde('/Home')).toBe('~');
    expect(tilde('/Home/docs')).toBe('~/docs');
    expect(tilde('/etc')).toBe('/etc');
    expect(tilde('/Homeless')).toBe('/Homeless');
  });

  it('expands ~ arguments to /Home', () => {
    expect(expandTilde('~')).toBe(HOME);
    expect(expandTilde('~/docs')).toBe('/Home/docs');
    expect(expandTilde('docs')).toBe('docs');
    expect(expandTilde('~other')).toBe('~other');
  });
});
