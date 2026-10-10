import React, { useEffect, useRef, useState } from 'react';
import { fileGet, filePut, fileDel, fileList } from '../os/db.js';
import { appOrigin, handleBridge } from '../os/bridge.js';

/* Renders an app in an iframe, or an honest launch panel when the site
   forbids embedding (X-Frame-Options / CSP frame-ancestors).

   Embeds also get the file-storage bridge: a window 'message' listener that
   serves webos:file-* requests from this app's private /Apps/<id>/ folder.
   handleBridge checks the message itself; here we additionally pin the event
   to THIS iframe's window so sibling frames can't impersonate each other. */
export default function EmbedFrame({ app, onLoaded }) {
  const [failed, setFailed] = useState(false);
  const frame = useRef(null);

  const embed = Boolean(app.embed && app.url);
  useEffect(() => {
    if (!embed) return undefined;
    const onMsg = async (event) => {
      if (event.source !== frame.current?.contentWindow) return;
      const reply = await handleBridge({ get: fileGet, put: filePut, del: fileDel, list: fileList }, app, event);
      if (reply) frame.current?.contentWindow?.postMessage(reply, appOrigin(app.url));
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [embed, app]);

  if (!embed) {
    return (
      <div className="blocked">
        <img src={app.icon} alt="" width="72" height="72" />
        <h3>{app.name}</h3>
        <p>This app sends <code>X-Frame-Options</code>, so it can&rsquo;t run inside a WebOS window.</p>
        <button className="btn accent" onClick={() => window.open(app.url, '_blank', 'noopener')}>
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
        onError={() => setFailed(true)}
      />
      {failed && (
        <div className="blocked">
          <h3>Couldn&rsquo;t load {app.name}</h3>
          <button className="btn accent" onClick={() => window.open(app.url, '_blank', 'noopener')}>Open in a new tab ↗</button>
        </div>
      )}
    </div>
  );
}
