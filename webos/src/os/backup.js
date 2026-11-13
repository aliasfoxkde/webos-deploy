// Versioned, data-only backup for WebOS-owned storage.
// This first interoperable format is uncompressed JSON with binary values
// encoded as Base64. It avoids executing content and avoids decompression
// bombs; a ZIP transport can be added later without changing the storage schema.
import { dbApplyState, dbReadState } from './db.js';

export const BACKUP_FORMAT = 'artcraft-webos-backup';
export const BACKUP_SCHEMA_VERSION = 1;
export const MAX_ARCHIVE_BYTES = 180 * 1024 * 1024;
export const MAX_PAYLOAD_BYTES = 128 * 1024 * 1024;
export const MAX_BACKUP_ITEMS = 20_000;
const BASE64_CHUNK_BYTES = 0x7ffe;
const BASE64_YIELD_EVERY = 32;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}={2}|[A-Za-z0-9+/]{3}=)?$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

/*
 * Only first-party keys whose current data shape and user value are known are
 * included. Add keys here only after reviewing their contents and migration
 * behavior. Unknown webos.* settings and IndexedDB keys are listed in the
 * manifest but never exported or removed during restore.
 */
export const BACKUP_LOCAL_STORAGE_KEYS = Object.freeze([
  'webos.browser.session',
  'webos.calc.ans',
  'webos.calc.angle',
  'webos.calc.graph',
  'webos.calc.history',
  'webos.calc.memory',
  'webos.calc.mode',
  'webos.calc.precision',
  'webos.chat.history',
  'webos.composites',
  'webos.desktop',
  'webos.desktop.order',
  'webos.editor.state',
  'webos.events',
  'webos.firecraft.autosave',
  'webos.groups',
  'webos.installed',
  'webos.notes',
  'webos.notepad.v1',
  'webos.persona',
  'webos.recents',
  'webos.saver',
  'webos.taskbar',
  'webos.theme',
  'webos.ui',
  'webos.uiMode',
  'webos.userapps',
  'webos.userthemes',
  'webos.volume',
  'webos.weather.loc',
  'webos.weather.units',
  'webos.welcomed',
  'webos.widgets',
]);
export const BACKUP_KV_KEYS = Object.freeze(['sqlite.db']);

const LOCAL_STORAGE_KEY_SET = new Set(BACKUP_LOCAL_STORAGE_KEYS);
const KV_KEY_SET = new Set(BACKUP_KV_KEYS);

const encoder = new TextEncoder();
const byteLength = (value) => encoder.encode(value).byteLength;
const fail = (message) => { throw new Error(message); };
const ensure = (condition, message) => { if (!condition) fail(message); };

function localStorageEntries() {
  const entries = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key && LOCAL_STORAGE_KEY_SET.has(key)) entries.push([key, localStorage.getItem(key) ?? '']);
  }
  return entries.sort(([a], [b]) => a.localeCompare(b));
}

function omittedLocalStorageKeys() {
  const keys = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith('webos.') && !LOCAL_STORAGE_KEY_SET.has(key)) keys.push(key);
  }
  return keys.sort();
}

async function toBase64(bytes) {
  let encoded = '';
  let chunkIndex = 0;
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_BYTES) {
    const slice = bytes.subarray(offset, Math.min(offset + BASE64_CHUNK_BYTES, bytes.length));
    encoded += btoa(String.fromCharCode(...slice));
    chunkIndex += 1;
    if (chunkIndex % BASE64_YIELD_EVERY === 0 && offset + BASE64_CHUNK_BYTES < bytes.length) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  return encoded;
}

function fromBase64(value) {
  ensure(typeof value === 'string' && BASE64_PATTERN.exec(value) !== null,
    'Backup contains malformed Base64 data');
  let binary;
  try { binary = atob(value); } catch { fail('Backup contains malformed Base64 data'); }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

async function encodeKvValue(value) {
  if (value instanceof Blob) {
    return { kind: 'blob', type: value.type || 'application/octet-stream', data: await toBase64(new Uint8Array(await value.arrayBuffer())) };
  }
  if (value instanceof ArrayBuffer) {
    return { kind: 'arraybuffer', data: await toBase64(new Uint8Array(value)) };
  }
  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return { kind: 'typed-array', type: value.constructor.name, data: await toBase64(bytes) };
  }
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value) || Array.isArray(value) || plainObject(value)) {
    const json = JSON.stringify(value);
    ensure(json !== undefined, 'A stored value cannot be represented in a backup');
    return { kind: 'json', value: JSON.parse(json) };
  }
  fail('A stored value uses an unsupported type and cannot be backed up safely');
}

function decodeKvValue(value) {
  ensure(value && typeof value === 'object', 'Backup contains an invalid stored value');
  if (value.kind === 'json') return value.value;
  const bytes = fromBase64(value.data);
  if (value.kind === 'blob') {
    ensure(typeof value.type === 'string' && value.type.length <= 255, 'Backup contains an invalid Blob MIME type');
    return new Blob([bytes], { type: value.type });
  }
  if (value.kind === 'arraybuffer') return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  if (value.kind === 'typed-array') {
    const constructors = {
      Uint8Array, Uint8ClampedArray, Int8Array, Uint16Array, Int16Array,
      Uint32Array, Int32Array, Float32Array, Float64Array,
    };
    const Type = constructors[value.type];
    ensure(Type, 'Backup contains an unsupported typed-array type');
    ensure(bytes.byteLength % Type.BYTES_PER_ELEMENT === 0, 'Backup contains a misaligned typed array');
    const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return new Type(copy);
  }
  fail('Backup contains an unsupported stored-value encoding');
}

async function digest(value) {
  ensure(globalThis.crypto?.subtle, 'This browser does not provide secure SHA-256 support');
  const digestBuffer = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digestBuffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hasControlCharacter(value) {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) < 0x20) return true;
  }
  return false;
}

function safePath(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path === '/'
    || path.includes(String.fromCharCode(92)) || hasControlCharacter(path)
    || path.endsWith('/') || path.length > 2048) return false;
  const parts = path.slice(1).split('/');
  return parts.every((part) => part.length > 0 && part !== '.' && part !== '..');
}
function countStorage(storage) {
  return {
    files: storage.files.filter((item) => !item.dir).length,
    folders: storage.files.filter((item) => item.dir).length,
    keyValues: storage.kv.length,
    settings: storage.localStorage.length,
  };
}

export async function createBackupBlob() {
  const storageState = await dbReadState();
  const settings = localStorageEntries();
  const excludedLocalStorageKeys = omittedLocalStorageKeys();
  ensure(storageState.kvEntries.length + storageState.files.length + settings.length + excludedLocalStorageKeys.length <= MAX_BACKUP_ITEMS,
    'WebOS has too many stored items for one backup');

  const excludedKvKeys = [];
  const supportedKvEntries = [];
  for (const [key, value] of storageState.kvEntries) {
    ensure(typeof key === 'string', 'A stored database key cannot be represented in a backup');
    if (KV_KEY_SET.has(key)) supportedKvEntries.push([key, value]);
    else excludedKvKeys.push(key);
  }
  excludedKvKeys.sort();

  let totalPayloadBytes = settings.reduce((sum, [key, value]) => sum + byteLength(key) + byteLength(value), 0);
  const kv = [];
  for (const [key, value] of supportedKvEntries) {
    ensure(typeof key === 'string', 'A stored key cannot be represented in a backup');
    const encoded = await encodeKvValue(value);
    if (encoded.data) totalPayloadBytes += fromBase64(encoded.data).byteLength;
    else totalPayloadBytes += byteLength(JSON.stringify(encoded.value));
    ensure(totalPayloadBytes <= MAX_PAYLOAD_BYTES, 'WebOS data exceeds the 128 MiB backup payload limit');
    kv.push({ key, value: encoded });
  }

  const files = [];
  for (const record of storageState.files) {
    ensure(safePath(record.path), 'A stored file path cannot be represented safely in a backup');
    if (record.dir) {
      files.push({ path: record.path, dir: true, mtime: Number(record.mtime) || 0 });
    } else {
      ensure(record.blob instanceof Blob, 'A stored file is missing its binary payload');
      totalPayloadBytes += record.blob.size;
      files.push({
        path: record.path,
        dir: false,
        type: record.type || record.blob.type || 'application/octet-stream',
        size: record.blob.size,
        mtime: Number(record.mtime) || 0,
        data: await toBase64(new Uint8Array(await record.blob.arrayBuffer())),
      });
    }
    ensure(totalPayloadBytes <= MAX_PAYLOAD_BYTES, 'WebOS data exceeds the 128 MiB backup payload limit');
  }

  const createdAt = new Date().toISOString();
  const storage = { localStorage: settings, kv, files };
  const manifest = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    createdAt,
    application: 'ArtCraft WebOS',
    counts: countStorage(storage),
    payloadBytes: totalPayloadBytes,
    encoding: 'json+base64',
    excludedLocalStorageKeys,
    excludedKvKeys,
  };
  const unsigned = { format: BACKUP_FORMAT, schemaVersion: BACKUP_SCHEMA_VERSION, manifest, storage };
  const integrity = { algorithm: 'SHA-256', digest: await digest(JSON.stringify(unsigned)) };
  const serialized = JSON.stringify({ ...unsigned, integrity }, null, 2);
  ensure(byteLength(serialized) <= MAX_ARCHIVE_BYTES, 'Generated backup exceeds the 180 MiB archive limit');
  return new Blob([serialized], { type: 'application/vnd.artcraft.webos-backup+json' });
}

export async function readBackupFile(file) {
  ensure(file && typeof file.text === 'function' && Number.isFinite(file.size), 'Choose a WebOS backup file');
  ensure(file.size <= MAX_ARCHIVE_BYTES, 'Backup file exceeds the 180 MiB import limit');
  const serialized = await file.text();
  ensure(byteLength(serialized) <= MAX_ARCHIVE_BYTES, 'Backup file exceeds the 180 MiB import limit');

  let archive;
  try { archive = JSON.parse(serialized); } catch { fail('Backup is not valid JSON'); }
  ensure(archive && typeof archive === 'object' && archive.format === BACKUP_FORMAT, 'This is not an ArtCraft WebOS backup');
  ensure(archive.schemaVersion === BACKUP_SCHEMA_VERSION, 'This backup version is not supported by this WebOS build');
  ensure(archive.manifest?.schemaVersion === BACKUP_SCHEMA_VERSION, 'Backup manifest is missing or unsupported');
  ensure(typeof archive.manifest.createdAt === 'string' && Number.isFinite(Date.parse(archive.manifest.createdAt)), 'Backup manifest has an invalid export timestamp');
  ensure(archive.manifest.application === 'ArtCraft WebOS' && archive.manifest.encoding === 'json+base64', 'Backup manifest describes an unsupported payload format');
  const excludedLocalStorageKeys = archive.manifest.excludedLocalStorageKeys ?? [];
  const excludedKvKeys = archive.manifest.excludedKvKeys ?? [];
  ensure(Array.isArray(excludedLocalStorageKeys) && excludedLocalStorageKeys.length <= MAX_BACKUP_ITEMS
    && excludedLocalStorageKeys.every((key, index) => typeof key === 'string' && key.startsWith('webos.')
      && !LOCAL_STORAGE_KEY_SET.has(key) && excludedLocalStorageKeys.indexOf(key) === index),
  'Backup contains an invalid excluded-settings list');
  ensure(Array.isArray(excludedKvKeys) && excludedKvKeys.length <= MAX_BACKUP_ITEMS
    && excludedKvKeys.every((key, index) => typeof key === 'string' && !KV_KEY_SET.has(key)
      && excludedKvKeys.indexOf(key) === index),
  'Backup contains an invalid excluded-database-keys list');
  ensure(archive.integrity?.algorithm === 'SHA-256' && SHA256_PATTERN.exec(archive.integrity.digest || '') !== null,
    'Backup integrity metadata is missing or invalid');

  const unsigned = { ...archive };
  delete unsigned.integrity;
  const actualDigest = await digest(JSON.stringify(unsigned));
  ensure(actualDigest === archive.integrity.digest, 'Backup integrity check failed; no data was changed');

  const storage = archive.storage;
  ensure(storage && Array.isArray(storage.localStorage) && Array.isArray(storage.kv) && Array.isArray(storage.files),
    'Backup storage manifest is incomplete');
  ensure(storage.localStorage.length + storage.kv.length + storage.files.length <= MAX_BACKUP_ITEMS,
    'Backup contains too many items');

  let totalPayloadBytes = 0;
  const seenSettings = new Set();
  const localStorageValues = [];
  for (const entry of storage.localStorage) {
    ensure(Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string'
      && LOCAL_STORAGE_KEY_SET.has(entry[0]),
      'Backup contains a setting outside the supported WebOS backup allowlist');
    ensure(!seenSettings.has(entry[0]) && typeof entry[1] === 'string', 'Backup contains a duplicate or invalid setting');
    seenSettings.add(entry[0]);
    totalPayloadBytes += byteLength(entry[0]) + byteLength(entry[1]);
    localStorageValues.push([entry[0], entry[1]]);
  }

  const seenKeys = new Set();
  const kvEntries = [];
  for (const entry of storage.kv) {
    ensure(entry && typeof entry.key === 'string' && KV_KEY_SET.has(entry.key) && !seenKeys.has(entry.key),
      'Backup contains a duplicate or unsupported database key');
    seenKeys.add(entry.key);
    const decoded = decodeKvValue(entry.value);
    if (decoded instanceof Blob) totalPayloadBytes += decoded.size;
    else if (decoded instanceof ArrayBuffer) totalPayloadBytes += decoded.byteLength;
    else if (ArrayBuffer.isView(decoded)) totalPayloadBytes += decoded.byteLength;
    else totalPayloadBytes += byteLength(JSON.stringify(decoded));
    kvEntries.push([entry.key, decoded]);
  }

  const seenPaths = new Set();
  const files = [];
  for (const entry of storage.files) {
    ensure(entry && safePath(entry.path) && !seenPaths.has(entry.path), 'Backup contains a duplicate or unsafe file path');
    ensure(Number.isFinite(entry.mtime) && entry.mtime >= 0, 'Backup contains an invalid file timestamp');
    seenPaths.add(entry.path);
    const mtime = Number.isFinite(entry.mtime) ? entry.mtime : 0;
    if (entry.dir === true) {
      files.push({ path: entry.path, dir: true, mtime });
    } else {
      ensure(entry.dir === false && Number.isInteger(entry.size) && entry.size >= 0, 'Backup contains invalid file metadata');
      ensure(typeof entry.type === 'string' && entry.type.length <= 255, 'Backup contains an invalid file MIME type');
      const bytes = fromBase64(entry.data);
      ensure(bytes.byteLength === entry.size, 'Backup file size does not match its payload');
      totalPayloadBytes += bytes.byteLength;
      files.push({ path: entry.path, blob: new Blob([bytes], { type: entry.type }), type: entry.type, size: entry.size, mtime });
    }
    ensure(totalPayloadBytes <= MAX_PAYLOAD_BYTES, 'Backup payload exceeds the 128 MiB restore limit');
  }

  ensure(totalPayloadBytes <= MAX_PAYLOAD_BYTES, 'Backup payload exceeds the 128 MiB restore limit');
  ensure(archive.manifest.counts && Number.isInteger(archive.manifest.payloadBytes) && archive.manifest.payloadBytes === totalPayloadBytes,
    'Backup payload size does not match its manifest');
  const counts = countStorage({ localStorage: localStorageValues, kv: kvEntries, files });
  ensure(JSON.stringify(counts) === JSON.stringify(archive.manifest.counts), 'Backup item counts do not match its manifest');

  return {
    createdAt: archive.manifest.createdAt,
    counts,
    payloadBytes: totalPayloadBytes,
    localStorageEntries: localStorageValues,
    kvEntries,
    files,
    excludedLocalStorageKeys,
    excludedKvKeys,
  };
}

function replaceLocalStorage(entries) {
  const current = localStorageEntries();
  for (const [key] of current) localStorage.removeItem(key);
  for (const [key, value] of entries) localStorage.setItem(key, value);
}

export async function restoreBackup(backup) {
  ensure(backup && Array.isArray(backup.kvEntries) && Array.isArray(backup.files)
    && Array.isArray(backup.localStorageEntries), 'Validate a backup before restoring it');
  const previousDatabaseState = await dbReadState();
  const previousSettings = localStorageEntries();
  try {
    await dbApplyState({
      kvEntries: backup.kvEntries,
      files: backup.files,
      ownedKvKeys: BACKUP_KV_KEYS,
    });
    replaceLocalStorage(backup.localStorageEntries);
  } catch (error) {
    try {
      await dbApplyState(previousDatabaseState);
      replaceLocalStorage(previousSettings);
    } catch (rollbackError) {
      throw new Error(
        `Restore failed (${error.message || error}) and automatic rollback also failed `
        + `(${rollbackError.message || rollbackError}). Keep this tab open and export any remaining data before retrying.`,
      );
    }
    throw new Error(`Restore failed; the previous WebOS data was restored. ${error.message || error}`);
  }
  return backup.counts || countStorage({
    files: backup.files,
    kv: backup.kvEntries,
    localStorage: backup.localStorageEntries,
  });
}
