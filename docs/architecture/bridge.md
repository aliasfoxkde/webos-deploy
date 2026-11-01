# WebOS File-Storage Bridge Protocol

How an embedded app (iframe) reads and writes its own slice of the WebOS
disk. Host implementation: `webos/src/os/bridge.js` + the listener in
`webos/src/shell/EmbedFrame.jsx`. Working fixture: `/bridge-demo.html`
(installable as "Bridge Demo" from the App Store).

## Model

- Every embedded app owns **`/Apps/<appId>/`** in the Files virtual disk
  (IndexedDB). There is no read or write access outside it — an app cannot
  see another app's files or `/Home`. Users can still reach those files via
  the Files app (paths are ordinary disk paths).
- All bridge paths in requests are **relative names** (`settings.json`,
  `saves/slot1.json`). The host joins them under the app root, rejects `..`
  and absolute paths outright, and verifies containment before touching
  storage.

## Trust model

A request is served only when **all** hold:

1. `event.data.source === 'webos-app'` and `type` is a known method.
2. `event.origin` equals the origin of the app's own `url` in the registry
   (so only the real app origin can bridge).
3. The event's `source` window is the iframe WebOS created for that app
   (checked by EmbedFrame — sibling frames can't impersonate each other).

Replies are posted back **targeted** at the app origin only.

## Wire format

Child → host (via `window.parent.postMessage(msg, hostOrigin)`):

```js
{
  source: 'webos-app',
  requestId: 'unique-per-request',   // echoed in the reply
  type: 'webos:file-list' | 'webos:file-open' | 'webos:file-save' | 'webos:file-delete',
  // webos:file-open / file-delete / file-save:
  path: 'saves/slot1.json',          // relative to /Apps/<appId>/
  // webos:file-save only:
  blob: new Blob([...], { type: 'text/plain' }),   // structured-cloneable
}
```

Host → child (`event.source.postMessage(reply, appOrigin)`):

```js
{
  source: 'webos-host',
  requestId: '…same as request…',
  ok: true,
  payload: {
    // file-list:  { files: [{ path, type, size, mtime }, …] }
    // file-open:  { path, blob, type, size, mtime }
    // file-save:  { path, size }
    // file-delete:{ path }
  },
}
// on failure:
{ source: 'webos-host', requestId: '…', ok: false, error: 'reason string' }
```

Unknown/malformed/trust-failing messages get **no reply at all** (silent —
do not confirm liveness to untrusted frames). Storage errors and missing
files come back as `ok: false` with an `error` string.

Limits: single-save cap is 64 MiB (`MAX_SAVE` in bridge.js). Blobs are
structured-cloned, so any Cloneable payload works; text apps typically use
`new Blob([JSON.stringify(state)], { type: 'application/json' })`.

## Minimal client

```js
function bridgeRequest(type, payload = {}) {
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const onMsg = (e) => {
      const r = e.data;
      if (r?.source === 'webos-host' && r.requestId === requestId) {
        window.removeEventListener('message', onMsg);
        r.ok ? resolve(r.payload) : reject(new Error(r.error));
      }
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ source: 'webos-app', requestId, type, ...payload }, '*');
  });
}

await bridgeRequest('webos:file-save', { path: 'state.json', blob: new Blob([s]) });
const { blob } = await bridgeRequest('webos:file-open', { path: 'state.json' });
```

## Same-origin fixture

`bridge-demo.html` (shipped in `webos/public/`) is a complete client: save,
open, delete, list — install **Bridge Demo** from the App Store and open it;
files appear under `/Apps/bridge-demo/` in Files. When run standalone it
times out gracefully, which also demonstrates the host-absent path.

## Craft apps (Rust/WASM)

The craft apps embed cross-origin today (their Pages origins ≠ WebOS
origin), and the protocol is deliberately origin-agnostic: the app's Rust
side can call `window.parent.postMessage` through `wasm-bindgen` (`js_sys`),
matching `event.origin` against its own `location.origin` — no extra config
on either side. The craft repos' "no handwritten JS" rule is unaffected:
the client lives in Rust (`js_sys` postMessage), and the wire format above
is the only contract.
