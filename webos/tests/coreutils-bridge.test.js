// coreutils.wasm bridge — the ensure/persist/runUtil flow. The 10MB uutils
// binary is stood in for by a scripted fake guest whose _start drives the
// REAL WASI imports the bridge hands to WebAssembly.instantiate: argv via
// args_get, output via fd_write, exit codes via proc_exit, disk writes via
// path_open/fd_write, pipeline input via fd_read. The Files store is the
// real os/db.js against fake-indexeddb (tests/setup.js), so persist()
// write-back and deletion are asserted against actual store contents.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../vendor/coreutils.wasm?url', () => ({ default: 'mock://coreutils.wasm' }));

const enc = new TextEncoder();
const dec = new TextDecoder();

/* Script for the fake guest: what _start does, driven through the real
   imports object the bridge built. Views are taken lazily — the bridge
   assigns host.memory only after instantiate resolves. */
let script = null;
let compileInput = null;

function installWasmStubs() {
  WebAssembly.compile = async (bytes) => { compileInput = bytes; return { fakeModule: true }; };
  WebAssembly.instantiate = async (module, imports) => {
    const isys = imports.wasi_snapshot_preview1;
    const memory = new WebAssembly.Memory({ initial: 1 }); // the "guest" linear memory
    return {
      exports: {
        memory,
        _start: () => {
          if (!script) return;
          // Views over THIS module's memory: the bridge has already handed
          // `memory` to the WasiHost (ctx.host.memory = inst.exports.memory)
          // before calling _start, so the syscalls below operate on it.
          const dv = () => new DataView(memory.buffer);
          const u8 = () => new Uint8Array(memory.buffer);
          // read argv through the real bridge: ptr table at 8, heap at 64
          isys.args_sizes_get(200, 204);
          isys.args_get(8, 64);
          const argv = [];
          for (let i = 0; i < dv().getUint32(200, true); i++) {
            const p = dv().getUint32(8 + i * 4, true);
            let e = p;
            while (u8()[e]) e += 1;
            argv.push(dec.decode(u8().subarray(p, e)));
          }
          const say = (text) => {
            const bytes = enc.encode(text);
            u8().set(bytes, 1024);
            dv().setUint32(40, 1024, true);
            dv().setUint32(44, bytes.length, true);
            isys.fd_write(1, 40, 1, 48);
          };
          for (const step of script.steps) {
            if (step.say !== undefined) {
              say(step.say(argv));
            } else if (step.exit !== undefined) {
              isys.proc_exit(step.exit);
            } else if (step.boom) {
              throw new Error(step.boom);
            } else if (step.cap) {
              throw { wasiCap: true };
            } else if (step.write) {
              // path_open(O_CREAT) + fd_write, all through the real bridge
              const pb = enc.encode(step.write);
              u8().set(pb, 2048);
              isys.path_open(3, 0, 2048, pb.length, 1, 0n, 0n, 0, 56);
              const fd = dv().getUint32(56, true);
              const wb = enc.encode(step.text);
              u8().set(wb, 3072);
              dv().setUint32(60, 3072, true);
              dv().setUint32(64, wb.length, true);
              isys.fd_write(fd, 60, 1, 68);
            } else if (step.readStdin) {
              dv().setUint32(70, 4096, true);
              dv().setUint32(74, 1024, true);
              isys.fd_read(0, 70, 1, 78);
              const n = dv().getUint32(78, true);
              say(`got:${dec.decode(u8().subarray(4096, 4096 + n))}`);
            } else if (step.unlink) {
              const pb = enc.encode(step.unlink);
              u8().set(pb, 2048);
              isys.path_unlink_file(3, 2048, pb.length);
            }
          }
        },
      },
    };
  };
}

/* The stubbed fetch every bridge test installs (4 wasm magic bytes). */
const okFetch = () => async () => ({
  ok: true,
  arrayBuffer: async () => new Uint8Array([0, 97, 115, 109]).buffer,
});

beforeEach(() => {
  script = null;
  compileInput = null;
  installWasmStubs();
});

describe('coreutils bridge', () => {
  it('fetches + compiles the wasm asset once, then reuses the memoized ctx', async () => {
    vi.resetModules();
    const db = await import('../src/os/db.js');
    await db.fileClear();
    let fetches = 0;
    vi.stubGlobal('fetch', async () => {
      fetches += 1;
      return { ok: true, arrayBuffer: async () => new Uint8Array([0, 97, 115, 109]).buffer };
    });
    const cu = await import('../src/apps/terminal/coreutils.js');
    script = { steps: [] };
    const r1 = await cu.runUtil('true', []);
    expect(compileInput).toBeInstanceOf(Uint8Array);
    expect(r1).toEqual({ code: 0, stdout: '', stderr: '', truncated: false });
    await cu.runUtil('true', []);
    expect(fetches).toBe(1); // one lazy fetch, one compiled module
    vi.unstubAllGlobals();
  });

  it('maps a fetch failure to a thrown bridge error', async () => {
    vi.resetModules();
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 500 }));
    const cu = await import('../src/apps/terminal/coreutils.js');
    await expect(cu.runUtil('ls', [])).rejects.toThrow('coreutils.wasm fetch failed: 500');
    vi.unstubAllGlobals();
  });

  it('plumbs argv (coreutils <util> <args…>) through args_get to the guest', async () => {
    vi.resetModules();
    const db = await import('../src/os/db.js');
    await db.fileClear();
    vi.stubGlobal('fetch', okFetch());
    const cu = await import('../src/apps/terminal/coreutils.js');
    script = { steps: [{ say: (argv) => argv.join(' ') }] };
    const r = await cu.runUtil('echo', ['-n', 'hi there']);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('coreutils echo -n hi there');
    vi.unstubAllGlobals();
  });

  it('maps proc_exit to the run code, traps to 134 + stderr, caps to truncated', async () => {
    vi.resetModules();
    const db = await import('../src/os/db.js');
    await db.fileClear();
    vi.stubGlobal('fetch', okFetch());
    const cu = await import('../src/apps/terminal/coreutils.js');
    script = { steps: [{ exit: 3 }] };
    expect((await cu.runUtil('false', [])).code).toBe(3);
    script = { steps: [{ boom: 'guest exploded' }] };
    const t = await cu.runUtil('segfault', []);
    expect(t.code).toBe(134);
    expect(t.stderr).toBe('guest exploded\n');
    // runaway `yes`: 3 × 50KB through real fd_write trips the 128KB cap
    const chunk = () => 'x'.repeat(50 * 1024);
    script = { steps: [{ say: chunk }, { say: chunk }, { say: chunk }] };
    const c = await cu.runUtil('yes', []);
    expect(c.code).toBe(0);
    expect(c.truncated).toBe(true);
    expect(c.stdout.length).toBeGreaterThan(128 * 1024);
    vi.unstubAllGlobals();
  });

  it('feeds opts.stdin to fd 0', async () => {
    vi.resetModules();
    const db = await import('../src/os/db.js');
    await db.fileClear();
    vi.stubGlobal('fetch', okFetch());
    const cu = await import('../src/apps/terminal/coreutils.js');
    script = { steps: [{ readStdin: true }] };
    const r = await cu.runUtil('cat', [], { stdin: 'piped bytes' });
    expect(r.stdout).toBe('got:piped bytes');
    vi.unstubAllGlobals();
  });

  it('persists guest-created files to the Files store', async () => {
    vi.resetModules();
    const db = await import('../src/os/db.js');
    await db.fileClear();
    vi.stubGlobal('fetch', okFetch());
    const cu = await import('../src/apps/terminal/coreutils.js');
    script = { steps: [{ write: '/Home/made-by-guest.txt', text: 'from wasm' }] };
    await cu.runUtil('tee', ['made-by-guest.txt'], { cwd: '/Home' });
    const rec = await db.fileGet('/Home/made-by-guest.txt');
    expect(rec).toBeTruthy();
    expect(await rec.blob.text()).toBe('from wasm');
    expect(rec.type).toBe('application/octet-stream'); // MemFS default type
    vi.unstubAllGlobals();
  });

  it('persists guest deletions, leaving no orphaned store records', async () => {
    vi.resetModules();
    const db = await import('../src/os/db.js');
    await db.fileClear();
    await db.filePut('/Home/doomed.txt', new Blob(['old']), 'text/plain');
    vi.stubGlobal('fetch', okFetch());
    const cu = await import('../src/apps/terminal/coreutils.js');
    script = { steps: [{ unlink: '/Home/doomed.txt' }] };
    await cu.runUtil('rm', ['doomed.txt'], { cwd: '/Home' });
    expect(await db.fileGet('/Home/doomed.txt')).toBeUndefined();
    expect((await db.fileList()).map((r) => r.path)).toEqual([]);
    vi.unstubAllGlobals();
  });
});
