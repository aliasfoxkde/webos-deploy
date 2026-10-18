import React, { useEffect, useRef } from 'react';
import { fileGet, filePut, fileDel as _fileDel, fileList as _fileList } from '../os/db.js';
import { appOrigin, handleBridge, postToApp } from '../os/bridge.js';
import { useOS } from '../os/state.jsx';

/* FireCraft autosave: after each 'applied' reply, debounce and save the
   document bytes to /Apps/firecraft/autosave.fw.png via the Files disk.
   On launch, if the file exists, open it first (on 'ready' reply).
   Toggle: localStorage key 'webos.firecraft.autosave' (default true). */
const AUTOSAVE_KEY = 'webos.firecraft.autosave';
const AUTOSAVE_PATH = '/Apps/firecraft/autosave.fw.png';
const EXPORT_PATH_PREFIX = '/Apps/firecraft/export-';
let _debounceTimer = null;

export function firecraftAutosave(frame) {
  if (localStorage.getItem(AUTOSAVE_KEY) === 'false') return;
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(async () => {
    try {
      const saved = await postToApp(frame, { type: 'exportDocument' }, 'firecraft');
      if (saved.bytes) {
        const blob = new Blob([saved.bytes], { type: 'image/png' });
        await filePut(AUTOSAVE_PATH, blob, 'image/png');
      }
    } catch { /* autosave failures are silent */ }
  }, 1200);
}

export async function firecraftRestore(frame, path) {
  if (localStorage.getItem(AUTOSAVE_KEY) === 'false') return;
  try {
    const filePath = path ?? AUTOSAVE_PATH;
    const rec = await fileGet(filePath);
    if (rec?.blob) {
      await postToApp(frame, { type: 'openDocument', bytes: await rec.blob.arrayBuffer() }, 'firecraft');
    }
  } catch { /* no saved doc is fine */ }
}

/* Renders an app in an iframe, or an honest launch panel when the site
   forbids embedding (X-Frame-Options / CSP frame-ancestors).

   Embeds also get the file-storage bridge: a window 'message' listener that
   serves webos:file-* requests from this app's private /Apps/<id>/ folder.
   handleBridge checks the message itself; here we additionally pin the event
   to THIS iframe's window so sibling frames can't impersonate each other. */
export default function EmbedFrame({ app, onLoaded, onMessage, args }) {
  // NB: no onError/failed fallback here — React never dispatches `error` for
  // iframes (it traps only `load`), so such a handler would be dead code.
  // Embed failures are handled by the honest blocked panel for non-embed apps.
  const frame = useRef(null);
  const os = useOS();
  const embed = Boolean(app.embed && app.url);
  useEffect(() => {
    if (!embed) return undefined;
    const onMsg = async (event) => {
      if (event.source !== frame.current?.contentWindow) return;
      const fd = event.data;
      // FireCraft: autosave on 'applied', restore on 'ready'.
      if (fd?.source === 'firecraft') {
        if (fd.type === 'applied') firecraftAutosave(frame.current);
        if (fd.type === 'ready') firecraftRestore(frame.current, args?.path);
        // exportPng: export PNG and open in Photos.
        if (fd.type === 'exportPng') {
          const os = await import('../os/state.jsx').then((m) => m.useOS());
          try {
            const result = await postToApp(frame.current, { type: 'exportPng' }, 'firecraft');
            if (result.bytes) {
              const blob = new Blob([result.bytes], { type: 'image/png' });
              const ts = Date.now();
              const path = `${EXPORT_PATH_PREFIX}${ts}.png`;
              await filePut(path, blob, 'image/png');
              os.launch('photos', { path });
            }
          } catch { /* export failures are silent */ }
        }
        if (onMessage) onMessage(fd, frame.current);
        return;
      }
      const reply = await handleBridge({ get: fileGet, put: filePut }, app, event);
      if (reply) frame.current?.contentWindow?.postMessage(reply, appOrigin(app.url));
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [embed, app, onMessage, args]);

  if (!embed) {
    return (
      <div className="blocked">
        <img src={app.icon} alt="" width="72" height="72" />
        <h3>{app.name}</h3>
        <p>This app sends <code>X-Frame-Options</code>, so it can&rsquo;t run inside a WebOS window.</p>
        <button className="btn accent" onClick={() => os.launch('browser', { url: app.url })}>
          Open in the WebOS Browser
        </button>
        <button className="btn" onClick={() => window.open(app.url, '_blank', 'noopener')}>
          Open {app.name} in a new tab ↗
        </button>
      </div>
    );
  }

  return (
    <div className="frame-wrap">
      <iframe
        ref={frame}
        src={app.url}
        title={app.name}
        allow="fullscreen; clipboard-read; clipboard-write; camera; microphone; autoplay"
        onLoad={onLoaded}
      />
    </div>
  );
}
