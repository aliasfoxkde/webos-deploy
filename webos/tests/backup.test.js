import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { webcrypto } from 'node:crypto';

let db;
let backup;

beforeEach(async () => {
  vi.resetModules();
  indexedDB = new IDBFactory(); // eslint-disable-line no-global-assign
  vi.stubGlobal('crypto', webcrypto);
  localStorage.clear();
  db = await import('../src/os/db.js');
  backup = await import('../src/os/backup.js');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const blob = (value, type = 'text/plain') => new Blob([value], { type });
const archiveOf = async () => backup.createBackupBlob();
const reSign = async (archive) => {
  const unsigned = { ...archive };
  delete unsigned.integrity;
  const bytes = new TextEncoder().encode(JSON.stringify(unsigned));
  const hash = await webcrypto.subtle.digest('SHA-256', bytes);
  archive.integrity = {
    algorithm: 'SHA-256',
    digest: [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
  };
  return new Blob([JSON.stringify(archive)], { type: 'application/json' });
};

describe('WebOS data backup', () => {
  it('exports and restores WebOS-owned settings, kv values, files and folder markers', async () => {
    await db.dirPut('/Home/Docs');
    await db.filePut('/Home/Docs/hello.txt', blob('hello'));
    await db.kvSet('sqlite.db', new Uint8Array([1, 2, 255]));
    await db.kvSet('plugin.private', { token: 'must-not-be-exported' });
    localStorage.setItem('webos.notepad.v1', JSON.stringify({ notes: [{ id: 1 }] }));
    localStorage.setItem('webos.auth.refresh-token', 'must-not-be-exported');
    localStorage.setItem('outside.origin', 'leave me alone');

    const exported = await archiveOf();
    expect(exported.type).toBe('application/vnd.artcraft.webos-backup+json');
    const restored = await backup.readBackupFile(exported);
    expect(restored.counts).toEqual({ files: 1, folders: 1, keyValues: 1, settings: 1 });
    expect(restored.excludedLocalStorageKeys).toEqual(['webos.auth.refresh-token']);
    expect(restored.excludedKvKeys).toEqual(['plugin.private']);
    const serialized = await exported.text();
    expect(serialized).not.toContain('must-not-be-exported');

    // Simulate a different/current profile that contains unregistered keys.
    // Restoring owned data must not delete or overwrite those records.
    await db.dbReplace({
      kvEntries: [['plugin.private', { keep: true }], ['auth.refresh_token', 'keep']],
      files: [],
    });
    localStorage.removeItem('webos.notepad.v1');
    localStorage.setItem('webos.auth.refresh-token', 'keep');
    await backup.restoreBackup(restored);

    expect([...await db.kvGet('sqlite.db')]).toEqual([1, 2, 255]);
    expect(await db.kvGet('plugin.private')).toEqual({ keep: true });
    expect(await db.kvGet('auth.refresh_token')).toBe('keep');
    expect(localStorage.getItem('webos.auth.refresh-token')).toBe('keep');
    expect(await (await db.fileGet('/Home/Docs/hello.txt')).blob.text()).toBe('hello');
    expect((await db.fileGet('/Home/Docs')).dir).toBe(true);
    expect(JSON.parse(localStorage.getItem('webos.notepad.v1')).notes[0].id).toBe(1);
    expect(localStorage.getItem('outside.origin')).toBe('leave me alone');
  });

  it('rejects a tampered payload before writing any data', async () => {
    await db.kvSet('keep', 'original');
    const archive = JSON.parse(await (await archiveOf()).text());
    archive.storage.kv.push({ key: 'injected', value: { kind: 'json', value: true } });
    await expect(backup.readBackupFile(new Blob([JSON.stringify(archive)]))).rejects.toThrow('integrity check failed');
    expect(await db.kvGet('keep')).toBe('original');
    expect(await db.kvGet('injected')).toBeUndefined();
  });

  it('rejects unsupported schema versions before accepting archive contents', async () => {
    const archive = JSON.parse(await (await archiveOf()).text());
    archive.schemaVersion = 2;
    await expect(backup.readBackupFile(new Blob([JSON.stringify(archive)]))).rejects.toThrow('version is not supported');
  });

  it('rejects malformed binary data even when the edited archive is re-signed', async () => {
    await db.filePut('/Home/test.txt', blob('safe'));
    const archive = JSON.parse(await (await archiveOf()).text());
    archive.storage.files.find((item) => !item.dir).data = 'not base64!';
    const altered = await reSign(archive);
    await expect(backup.readBackupFile(altered)).rejects.toThrow('malformed Base64');
  });

  it('rejects traversal paths even when the archive checksum is valid', async () => {
    await db.filePut('/Home/test.txt', blob('safe'));
    const archive = JSON.parse(await (await archiveOf()).text());
    archive.storage.files.find((item) => !item.dir).path = '/Home/../escape.txt';
    const altered = await reSign(archive);
    await expect(backup.readBackupFile(altered)).rejects.toThrow('unsafe file path');
  });

  it('rejects empty path segments, trailing separators and backslashes', async () => {
    const archive = JSON.parse(await (await archiveOf()).text());
    archive.storage.files.push(
      { path: '/Home//double.txt', dir: true, mtime: 1 },
      { path: '/Home/trailing/', dir: true, mtime: 1 },
      { path: '/Home/back\\\\slash', dir: true, mtime: 1 },
    );
    const altered = await reSign(archive);
    await expect(backup.readBackupFile(altered)).rejects.toThrow('unsafe file path');
  });

  it('rejects an invalid timestamp in the signed manifest', async () => {
    const archive = JSON.parse(await (await archiveOf()).text());
    archive.manifest.createdAt = 'not-a-date';
    const altered = await reSign(archive);
    await expect(backup.readBackupFile(altered)).rejects.toThrow('invalid export timestamp');
  });

  it('refuses to export a stored path that is not canonical', async () => {
    await db.filePut('/Home//unsafe.txt', blob('unsafe'));
    await expect(archiveOf()).rejects.toThrow('cannot be represented safely');
  });

  it('rejects archive files above the hard input limit without reading them', async () => {
    const oversized = { size: backup.MAX_ARCHIVE_BYTES + 1, text: vi.fn() };
    await expect(backup.readBackupFile(oversized)).rejects.toThrow('180 MiB import limit');
    expect(oversized.text).not.toHaveBeenCalled();
  });

  it('rolls the IndexedDB and localStorage state back if settings cannot be restored', async () => {
    await db.kvSet('target', 'new');
    localStorage.setItem('webos.target', 'new');
    const restored = await backup.readBackupFile(await archiveOf());

    await db.dbReplace({ kvEntries: [['stable', 'old']], files: [{ path: '/Home/old.txt', blob: blob('old'), type: 'text/plain', size: 3, mtime: 1 }] });
    localStorage.clear();
    localStorage.setItem('webos.stable', 'old');
    const originalSet = Storage.prototype.setItem;
    let rejectOnce = true;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === 'webos.target' && rejectOnce) {
        rejectOnce = false;
        throw new DOMException('quota exceeded', 'QuotaExceededError');
      }
      return originalSet.call(this, key, value);
    });

    await expect(backup.restoreBackup(restored)).rejects.toThrow('previous WebOS data was restored');
    expect(await db.kvGet('stable')).toBe('old');
    expect(await db.kvGet('target')).toBeUndefined();
    expect((await db.fileList()).map((item) => item.path)).toEqual(['/Home/old.txt']);
    expect(localStorage.getItem('webos.stable')).toBe('old');
    expect(localStorage.getItem('webos.target')).toBeNull();
  });

  it('refuses unsupported structured-clone types for an allowlisted key', async () => {
    await db.kvSet('sqlite.db', new Map([['x', 1]]));
    await expect(archiveOf()).rejects.toThrow('unsupported type');
  });

  it('rejects importing an unapproved IndexedDB key even with a valid checksum', async () => {
    const archive = JSON.parse(await (await archiveOf()).text());
    archive.storage.kv.push({ key: 'auth.refresh_token', value: { kind: 'json', value: 'stolen' } });
    const altered = await reSign(archive);
    await expect(backup.readBackupFile(altered)).rejects.toThrow('unsupported database key');
  });
});
