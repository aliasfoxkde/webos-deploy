// Files app — branch coverage for the paths the happy-path spec never walks.
//
// ../src/os/db.js is mocked with an in-memory store whose records carry the
// same shapes the real IndexedDB store produces ({ path, dir, type, size,
// blob }); the app therefore sees the metadata it would see from a real disk
// and every assertion below is about observable app behaviour, never about
// the mock itself.
//
// The branches this file targets:
//   • media/device previews (video, audio, PDF, image, untyped binary)
//   • the storage-usage readout (estimate resolves / rejects / empty)
//   • records whose blob has gone missing (open, download, rename)
//   • rename rejections (invalid name, same name, name in use) and the
//     preview that a rename must close
//   • the two-step folder-delete arm window and its expiry timer
//   • forms, drops and file inputs that carry nothing
//   • path corners: trailing slashes, doubled slashes, nested markers
//   • the context-menu guards for paths that are not in the listing
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import { OSProvider } from '../src/os/state.jsx';

const h = vi.hoisted(() => ({ files: [], missing: new Set(), gate: null }));

vi.mock('../src/os/db.js', () => ({
  fileList: async () => {
    if (h.gate) await h.gate.promise;
    return h.files;
  },
  fileGet: async (path) => {
    if (h.missing.has(path)) return null;
    const r = h.files.find((f) => f.path === path && !f.dir);
    return r ? { blob: r.blob, type: r.type } : null;
  },
  filePut: async (path, blob, type) => {
    h.files = h.files.filter((f) => f.path !== path && !f.path.startsWith(`${path}/`));
    h.files.push({ path, dir: false, type: type || blob.type || '', size: blob.size, mtime: 1, blob });
  },
  fileDel: async (path) => { h.files = h.files.filter((f) => f.path !== path); },
  fileDelTree: async (path) => { h.files = h.files.filter((f) => f.path !== path && !f.path.startsWith(`${path}/`)); },
  dirPut: async (path) => {
    if (!h.files.some((f) => f.path === path)) h.files.push({ path, dir: true, mtime: 1 });
  },
}));

import FilesApp from '../src/apps/files/Files.jsx';

const seed = (...recs) => { h.files = recs.map((r) => ({ mtime: 1, ...r })); };
const blobOf = (text, type = 'text/plain') => new Blob([text], { type });
const fileRec = (path, text, type = 'text/plain') => ({
  path, dir: false, type, size: text.length, blob: blobOf(text, type),
});
const dirRec = (path) => ({ path, dir: true, mtime: 1 });

const mountFiles = () => render(<OSProvider><FilesApp /></OSProvider>);

// Let the mocked listing promise chain (and the React updates it schedules)
// drain without relying on timers.
const settle = async () => {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};

const ctxMenu = async (el) => {
  fireEvent.contextMenu(el, { clientX: 10, clientY: 10 });
  await act(async () => {});
};

// A right-click on a target the app never rendered. The context-menu system
// is window-level and reads the data-cm contract off any element, so this is
// how a stale/out-of-band path reaches the item builder.
const ctxMenuOn = async (kind, arg) => {
  const el = document.createElement('span');
  el.setAttribute('data-cm', `${kind}:${arg}`);
  const ev = new Event('contextmenu', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'target', { value: el });
  window.dispatchEvent(ev);
  await act(async () => {});
};

const storageDescriptor = Object.getOwnPropertyDescriptor(navigator, 'storage');
const setStorage = (estimate) => {
  Object.defineProperty(navigator, 'storage', { value: { estimate }, configurable: true, writable: true });
};

beforeEach(() => {
  cleanup();
  document.body.innerHTML = '';
  h.files = [];
  h.missing = new Set();
  h.gate = null;
  vi.stubGlobal('fetch', () => new Promise(() => {}));
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('about:blank');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => {
  delete window.showDirectoryPicker;
  if (storageDescriptor) Object.defineProperty(navigator, 'storage', storageDescriptor);
  else delete navigator.storage;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Files — previews by media kind', () => {
  it('gives video, audio and PDF blobs their own players', async () => {
    seed(
      fileRec('/Home/clip.mp4', 'vid', 'video/mp4'),
      fileRec('/Home/tune.mp3', 'aud', 'audio/mpeg'),
      fileRec('/Home/manual.pdf', 'pdf', 'application/pdf'),
    );
    mountFiles();

    fireEvent.click(await screen.findByTitle('clip.mp4 — 3 B'));
    await screen.findByRole('dialog', { name: 'clip.mp4' });
    expect(document.querySelector('.f-pv-body video')).toBeTruthy();
    fireEvent.click(screen.getByText('Close'));

    fireEvent.click(await screen.findByTitle('tune.mp3 — 3 B'));
    await screen.findByRole('dialog', { name: 'tune.mp3' });
    expect(document.querySelector('.f-pv-body audio')).toBeTruthy();
    fireEvent.click(screen.getByText('Close'));

    fireEvent.click(await screen.findByTitle('manual.pdf — 3 B'));
    await screen.findByRole('dialog', { name: 'manual.pdf' });
    expect(document.querySelector('.f-pv-body iframe')).toBeTruthy();
  });

  it('previews an image opened from the device, with an Import button', async () => {
    const shot = {
      kind: 'file', name: 'shot.png',
      getFile: async () => new File(['png'], 'shot.png', { type: 'image/png' }),
    };
    window.showDirectoryPicker = async () => ({
      name: 'proj',
      async *entries() { yield ['shot.png', shot]; },
    });
    mountFiles();
    fireEvent.click(screen.getByText('This device'));
    fireEvent.click(await screen.findByText('Choose a folder…'));
    fireEvent.click(await screen.findByText('shot.png'));

    const dialog = await screen.findByRole('dialog', { name: 'shot.png' });
    expect(dialog.querySelector('img')).toBeTruthy();
    expect(dialog.querySelector('[title="Import into /Home"]')).toBeTruthy();
  });

  it('treats a device file with no MIME type as a binary, not as text', async () => {
    const raw = {
      kind: 'file', name: 'notes',
      getFile: async () => new File(['x'], 'notes'),
    };
    window.showDirectoryPicker = async () => ({
      name: 'proj',
      async *entries() { yield ['notes', raw]; },
    });
    mountFiles();
    fireEvent.click(screen.getByText('This device'));
    fireEvent.click(await screen.findByText('Choose a folder…'));
    fireEvent.click(await screen.findByText('notes'));

    // no text/* and no known extension → the binary bucket, which has no player
    expect(await screen.findByText('No preview for this type — use Download.')).toBeTruthy();
  });
});

describe('Files — storage usage readout', () => {
  it('reports the browser storage usage once the estimate resolves', async () => {
    setStorage(async () => ({ usage: 100, quota: 1024 }));
    mountFiles();
    expect(await screen.findByText('100 B of 1.0 KB browser storage used')).toBeTruthy();
  });

  it('reports a zero usage estimate without printing an empty size', async () => {
    setStorage(async () => ({ usage: 0, quota: 0 }));
    mountFiles();
    expect(await screen.findByText('0 B of 0 B browser storage used')).toBeTruthy();
  });

  it('keeps the IndexedDB hint when the storage estimate rejects', async () => {
    setStorage(async () => { throw new Error('estimate unavailable'); });
    mountFiles();
    expect(await screen.findByText(/stored in this browser \(IndexedDB\)/)).toBeTruthy();
  });

  it('drops a listing that arrives after the app was unmounted', async () => {
    let release;
    h.gate = { promise: new Promise((res) => { release = res; }) };
    const estimate = vi.fn(async () => ({ usage: 1, quota: 2 }));
    setStorage(estimate);

    const { unmount } = mountFiles();
    unmount();
    await act(async () => { release(); await h.gate.promise; });

    // the listing arrived after unmount, so the app bailed out before it
    // touched state or probed the storage estimate
    expect(estimate).not.toHaveBeenCalled();
    expect(document.querySelector('.files')).toBeNull();
  });

  it('drops a storage estimate that lands after the app was unmounted', async () => {
    let releaseUsage;
    const estimate = vi.fn(() => new Promise((res) => { releaseUsage = res; }));
    setStorage(estimate);
    const errors = [];
    vi.spyOn(console, 'error').mockImplementation((...args) => { errors.push(args); });

    const { unmount } = mountFiles();
    await settle();
    expect(estimate).toHaveBeenCalled(); // the usage probe is under way

    unmount();
    await act(async () => { releaseUsage({ usage: 5, quota: 10 }); await Promise.resolve(); });

    // the estimate landed on a tree that is gone: it must be dropped, not
    // pushed into an unmounted component
    expect(errors).toEqual([]);
  });
});

describe('Files — records whose blob has gone missing', () => {
  it('opens no preview when the blob behind a listed file is gone', async () => {
    seed(fileRec('/Home/notes.txt', 'hi'));
    h.missing.add('/Home/notes.txt');
    mountFiles();

    fireEvent.click(await screen.findByTitle('notes.txt — 2 B'));
    await act(async () => {});
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('downloads nothing when the blob behind a listed file is gone', async () => {
    seed(fileRec('/Home/notes.txt', 'hi'));
    h.missing.add('/Home/notes.txt');
    mountFiles();

    fireEvent.click(await screen.findByTitle('Download'));
    await act(async () => {});
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  it('refuses to rename a file whose blob has gone', async () => {
    seed(fileRec('/Home/notes.txt', 'hi'));
    h.missing.add('/Home/notes.txt');
    mountFiles();

    await ctxMenu(await screen.findByTitle('notes.txt — 2 B'));
    fireEvent.click(screen.getByText('Rename…'));
    const input = screen.getByLabelText('File name');
    fireEvent.change(input, { target: { value: 'renamed.txt' } });
    fireEvent.submit(input.closest('form'));
    await act(async () => {});

    expect(h.files.map((f) => f.path)).toEqual(['/Home/notes.txt']);
    expect(await screen.findByTitle('notes.txt — 2 B')).toBeTruthy();
  });

  it('still moves the rest of a folder when one descendant blob has gone', async () => {
    seed(dirRec('/Home/Docs'), fileRec('/Home/Docs/a.txt', 'a'), fileRec('/Home/Docs/b.txt', 'b'));
    h.missing.add('/Home/Docs/a.txt');
    mountFiles();

    await ctxMenu(await screen.findByTitle('Docs — folder'));
    fireEvent.click(screen.getByText('Rename…'));
    const input = screen.getByLabelText('Folder name');
    fireEvent.change(input, { target: { value: 'Archive' } });
    fireEvent.submit(input.closest('form'));
    await act(async () => {});

    // a.txt has no blob to copy, so it is dropped; b.txt still moved
    expect(h.files.map((f) => f.path).sort()).toEqual(['/Home/Archive', '/Home/Archive/b.txt']);
  });
});

describe('Files — rename rejections', () => {
  it('rejects a rename to a name that is not a name', async () => {
    seed(fileRec('/Home/notes.txt', 'hi'));
    mountFiles();

    await ctxMenu(await screen.findByTitle('notes.txt — 2 B'));
    fireEvent.click(screen.getByText('Rename…'));
    const input = screen.getByLabelText('File name');
    fireEvent.change(input, { target: { value: 'bad/name' } });
    fireEvent.submit(input.closest('form'));
    await act(async () => {});

    expect(h.files.map((f) => f.path)).toEqual(['/Home/notes.txt']);
    expect(await screen.findByTitle('notes.txt — 2 B')).toBeTruthy();
  });

  it('rejects a rename to the name the file already has', async () => {
    seed(fileRec('/Home/notes.txt', 'hi'));
    mountFiles();

    await ctxMenu(await screen.findByTitle('notes.txt — 2 B'));
    fireEvent.click(screen.getByText('Rename…'));
    const input = screen.getByLabelText('File name');
    fireEvent.change(input, { target: { value: 'notes.txt' } });
    fireEvent.submit(input.closest('form'));
    await act(async () => {});

    expect(h.files.map((f) => f.path)).toEqual(['/Home/notes.txt']);
  });

  it('rejects a rename onto a name that is already taken', async () => {
    seed(fileRec('/Home/a.txt', 'a'), fileRec('/Home/b.txt', 'b'));
    mountFiles();

    await ctxMenu(await screen.findByTitle('a.txt — 1 B'));
    fireEvent.click(screen.getByText('Rename…'));
    const input = screen.getByLabelText('File name');
    fireEvent.change(input, { target: { value: 'b.txt' } });
    fireEvent.submit(input.closest('form'));
    await act(async () => {});

    expect(h.files.map((f) => f.path).sort()).toEqual(['/Home/a.txt', '/Home/b.txt']);
  });

  it('closes the preview of the file it renames', async () => {
    seed(fileRec('/Home/notes.txt', 'hi'));
    mountFiles();

    fireEvent.click(await screen.findByTitle('notes.txt — 2 B'));
    await screen.findByRole('dialog', { name: 'notes.txt' });

    await ctxMenu(screen.getByTitle('notes.txt — 2 B'));
    fireEvent.click(screen.getByText('Rename…'));
    const input = screen.getByLabelText('File name');
    fireEvent.change(input, { target: { value: 'renamed.txt' } });
    fireEvent.submit(input.closest('form'));
    await act(async () => {});

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(h.files.map((f) => f.path)).toEqual(['/Home/renamed.txt']);
  });
});

describe('Files — forms and empty inputs', () => {
  it('ignores ordinary keys in the create form', async () => {
    mountFiles();
    fireEvent.click(screen.getByText('New folder'));
    const input = screen.getByLabelText('New folder name');
    fireEvent.keyDown(input, { key: 'a' });

    expect(screen.getByLabelText('New folder name')).toBeTruthy(); // still open
    expect(h.files).toHaveLength(0); // and nothing was created
  });

  it('ignores ordinary keys in the folder rename form', async () => {
    seed(dirRec('/Home/Docs'));
    mountFiles();

    await ctxMenu(await screen.findByTitle('Docs — folder'));
    fireEvent.click(screen.getByText('Rename…'));
    const input = screen.getByLabelText('Folder name');
    fireEvent.keyDown(input, { key: 'a' });

    expect(screen.getByLabelText('Folder name')).toBeTruthy();
    expect(h.files.map((f) => f.path)).toEqual(['/Home/Docs']);
  });

  it('ignores ordinary keys in the file rename form', async () => {
    seed(fileRec('/Home/notes.txt', 'hi'));
    mountFiles();

    await ctxMenu(await screen.findByTitle('notes.txt — 2 B'));
    fireEvent.click(screen.getByText('Rename…'));
    const input = screen.getByLabelText('File name');
    fireEvent.keyDown(input, { key: 'a' });

    expect(screen.getByLabelText('File name')).toBeTruthy();
    expect(h.files.map((f) => f.path)).toEqual(['/Home/notes.txt']);
  });

  it('ignores a drop with no files and a file input with no selection', async () => {
    mountFiles();
    await screen.findByText(/Empty — drop files anywhere/);

    const grid = document.querySelector('.files');
    await act(async () => { fireEvent.drop(grid, { dataTransfer: { files: [] } }); });
    expect(h.files).toHaveLength(0);

    const input = document.querySelector('input[type="file"]');
    await act(async () => { fireEvent.change(input, { target: { files: [] } }); });
    expect(h.files).toHaveLength(0);
  });
});

describe('Files — path corners', () => {
  it('keeps the trailing slash of a doubled-slash path and skips the marker itself', async () => {
    seed(fileRec('/Home//notes.txt', 'hi'));
    mountFiles();

    // the doubled slash collapses to a folder entry with an empty name, whose
    // path keeps its trailing slash
    fireEvent.click(await screen.findByTitle(/— folder$/));
    expect(await screen.findByText('1 folders · 0 files in /Home/')).toBeTruthy();
  });

  it('skips a folder marker stored at the current path', async () => {
    seed(dirRec('/Home/'), fileRec('/Home/notes.txt', 'hi'));
    mountFiles();

    await screen.findByTitle('notes.txt — 2 B');
    // '/Home/' is the prefix itself, so it is not listed as a folder entry
    expect(screen.queryByTitle(/— folder$/)).toBeNull();
    expect(screen.getByText('0 folders · 1 files')).toBeTruthy();
  });

  it('does not invent a folder for a nested directory marker', async () => {
    seed(dirRec('/Home/a/b'), fileRec('/Home/c/d', 'x'));
    mountFiles();

    // the file prefix becomes a folder entry …
    expect(await screen.findByTitle('c — folder')).toBeTruthy();
    // … the nested directory marker does not
    expect(screen.queryByTitle('a — folder')).toBeNull();
    expect(screen.queryByTitle('a/b — folder')).toBeNull();
  });

  it('marks only the last crumb as the current location', async () => {
    seed(fileRec('/Home/Docs/sub/deep.txt', 'x'));
    mountFiles();

    fireEvent.click(await screen.findByTitle('Docs — folder'));
    fireEvent.click(await screen.findByTitle('sub — folder'));

    expect(screen.getByText('/ Docs').className).toBe(''); // an ancestor crumb
    expect(screen.getByText('/ sub').className).toContain('on'); // the current one
  });
});

describe('Files — device tab corners', () => {
  const fileHandle = (name, type = 'text/plain') => ({
    kind: 'file', name,
    getFile: async () => new File(['x'], name, { type }),
  });

  it('sorts same-kind device entries alphabetically', async () => {
    window.showDirectoryPicker = async () => ({
      name: 'proj',
      async *entries() { yield ['b.txt', fileHandle('b.txt')]; yield ['a.txt', fileHandle('a.txt')]; },
    });
    mountFiles();
    fireEvent.click(screen.getByText('This device'));
    fireEvent.click(await screen.findByText('Choose a folder…'));
    await screen.findByText('a.txt');

    const names = [...document.querySelectorAll('.f-grid .f-name')].map((n) => n.textContent);
    expect(names).toEqual(['a.txt', 'b.txt']);
  });

  it('says so when a device folder is empty', async () => {
    const empty = { kind: 'directory', name: 'empty', async *entries() { /* nothing */ } };
    window.showDirectoryPicker = async () => ({
      name: 'proj',
      async *entries() { yield ['empty', empty]; },
    });
    mountFiles();
    fireEvent.click(screen.getByText('This device'));
    fireEvent.click(await screen.findByText('Choose a folder…'));
    fireEvent.click(await screen.findByText('empty'));

    expect(await screen.findByText('This folder is empty.')).toBeTruthy();
  });
});

describe('Files — context-menu guards', () => {
  it('opens no menu for a path that is not in the listing', async () => {
    seed(fileRec('/Home/notes.txt', 'hi'));
    mountFiles();
    await screen.findByTitle('notes.txt — 2 B');

    await ctxMenuOn('ffile', '/Home/ghost.txt');
    expect(document.querySelector('.ctx-menu')).toBeNull();
  });

  it('opens nothing when the file menu points at a directory', async () => {
    seed(dirRec('/Home/Docs'));
    mountFiles();
    await screen.findByTitle('Docs — folder');

    await ctxMenuOn('ffile', '/Home/Docs');
    fireEvent.click(screen.getByText('Open'));
    await act(async () => {});

    // a folder has no blob to open, and the location did not change
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('1 folders · 0 files')).toBeTruthy();
  });
});

describe('Files — folder delete arming', () => {
  it('expires the arm on its own and keeps a re-armed folder armed', async () => {
    vi.useFakeTimers();
    try {
      seed(dirRec('/Home/A'), dirRec('/Home/B'));
      mountFiles();
      await settle();

      const delButtons = screen.getAllByTitle('Delete folder (and contents)');
      fireEvent.click(delButtons[0]); // arms A
      expect(screen.getAllByText('sure?')).toHaveLength(1);

      await act(async () => { vi.advanceTimersByTime(1000); });
      fireEvent.click(screen.getAllByTitle('Delete folder (and contents)')[1]); // arms B
      expect(screen.getAllByText('sure?')).toHaveLength(1);

      // A's window expires while B is the armed folder: A's expiry must not
      // clear B's arm
      await act(async () => { vi.advanceTimersByTime(2000); });
      expect(screen.getAllByText('sure?')).toHaveLength(1);

      // B's own window then expires and clears the arm
      await act(async () => { vi.advanceTimersByTime(1000); });
      expect(screen.queryByText('sure?')).toBeNull();
      expect(h.files.map((f) => f.path)).toEqual(['/Home/A', '/Home/B']); // nothing deleted
    } finally {
      vi.useRealTimers();
    }
  });
});
