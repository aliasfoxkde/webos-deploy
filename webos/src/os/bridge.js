/* App file-storage bridge: postMessage protocol between the WebOS shell and
   embedded app iframes. Apps get a private folder of the Files disk,
   /Apps/<appId>/, and ask for list/open/save/delete over window.postMessage.

   Trust model: a message is served only when (a) it carries
   source === 'webos-app' and a known type, (b) event.origin equals the
   origin of the embedded app's own URL, and (c) the event came from that
   iframe's window (checked by EmbedFrame before calling in). Replies go
   back targeted at the same origin. Paths are names relative to the app
   root: '..' and absolute names are rejected outright and the joined result
   is verified to stay under the root, so an app can never reach another
   app's files or /Home.
   handleBridge is pure (storage backend injected) so it unit-tests cleanly;
   EmbedFrame owns the window listener and the postMessage plumbing. */

const TYPES = new Set(['webos:file-list', 'webos:file-open', 'webos:file-save', 'webos:file-delete']);
// Single-file save cap — generous for settings/docs, hostile-blob-proof.
export const MAX_SAVE = 64 * 1024 * 1024;

export const appRoot = (appId) => `/Apps/${appId}`;

export function appOrigin(url) {
  try {
    return new URL(url, window.location.href).origin;
  } catch {
    return null;
  }
}

/* Join a relative name onto the app root. Returns the absolute store path,
   or null when the name is empty, absolute, or contains '..' (no silent
   re-rooting — bridge names are plain relative paths; the containment
   check afterwards is a second, independent guard). */
export function safeJoin(root, name) {
  if (typeof name !== 'string' || !name.trim() || name.startsWith('/')) return null;
  const parts = [];
  for (const seg of name.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') return null;
    parts.push(seg);
  }
  if (!parts.length) return null;
  const path = `${root}/${parts.join('/')}`;
  return path.startsWith(`${root}/`) ? path : null;
}

const ack = (msg, payload) => ({ source: 'webos-host', requestId: msg.requestId, ok: true, payload });
const nack = (msg, error) => ({ source: 'webos-host', requestId: msg.requestId, ok: false, error });

/* Handle one postMessage event. Returns the reply object, or null when the
   message is not a bridge request this app may make (caller sends nothing).
   `files` = { get, put, del, list } — the db.js API shape, injectable. */
export async function handleBridge(files, app, event) {
  const msg = event?.data;
  if (!msg || typeof msg !== 'object' || msg.source !== 'webos-app') return null;
  if (!TYPES.has(msg.type)) return null;
  const origin = appOrigin(app.url);
  if (!origin || event.origin !== origin) return null;

  const root = appRoot(app.id);
  const prefix = `${root}/`;
  try {
    switch (msg.type) {
      case 'webos:file-list': {
        const all = await files.list();
        const items = all
          .filter((r) => !r.dir && r.path.startsWith(prefix))
          .map((r) => ({ path: r.path.slice(prefix.length), type: r.type, size: r.size, mtime: r.mtime }));
        return ack(msg, { files: items });
      }
      case 'webos:file-open': {
        const path = safeJoin(root, msg.path);
        if (!path) return nack(msg, 'invalid path');
        const rec = await files.get(path);
        if (!rec || rec.dir) return nack(msg, 'not found');
        return ack(msg, {
          path: rec.path.slice(prefix.length),
          blob: rec.blob,
          type: rec.type,
          size: rec.size,
          mtime: rec.mtime,
        });
      }
      case 'webos:file-save': {
        const path = safeJoin(root, msg.path);
        if (!path) return nack(msg, 'invalid path');
        if (!(msg.blob instanceof Blob)) return nack(msg, 'blob required');
        if (msg.blob.size > MAX_SAVE) return nack(msg, 'file too large');
        await files.put(path, msg.blob, msg.type);
        return ack(msg, { path: msg.path, size: msg.blob.size });
      }
      case 'webos:file-delete': {
        const path = safeJoin(root, msg.path);
        if (!path) return nack(msg, 'invalid path');
        const rec = await files.get(path);
        if (!rec) return nack(msg, 'not found');
        await files.del(path);
        return ack(msg, { path: msg.path });
      }
      default:
        return null;
    }
  } catch (e) {
    return nack(msg, e?.message ?? 'storage error');
  }
}

/* Make a child→host request from the app side and await the matching reply.
   Used by tests and the same-origin fixture; real embedded apps can hand-roll
   the same three lines. targetOrigin must be the HOST's origin. */
export function bridgeRequest(win, request, timeoutMs = 10000) {
  const requestId = `req-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', onMsg);
      reject(new Error('bridge timeout'));
    }, timeoutMs);
    const onMsg = (event) => {
      const r = event.data;
      if (!r || r.source !== 'webos-host' || r.requestId !== requestId) return;
      clearTimeout(timer);
      window.removeEventListener('message', onMsg);
      if (r.ok) resolve(r.payload);
      else reject(new Error(r.error ?? 'bridge error'));
    };
    window.addEventListener('message', onMsg);
    win.postMessage({ source: 'webos-app', requestId, ...request }, '*');
  });
}
