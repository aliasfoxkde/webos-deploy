import React, { useState } from 'react';

/* Renders an app in an iframe, or an honest launch panel when the site
   forbids embedding (X-Frame-Options / CSP frame-ancestors). */
export default function EmbedFrame({ app, onLoaded }) {
  const [failed, setFailed] = useState(false);

  if (!app.embed) {
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
