import React, { useState } from 'react';

/* Video player window: youtube.com itself forbids framing, so we build
   /embed/ URLs from a pasted link or ID, plus a few presets. */

function toEmbedUrl(input) {
  const s = input.trim();
  if (!s) return null;
  let m;
  if ((m = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/))) return `https://www.youtube.com/embed/${m[1]}?autoplay=1`;
  if (/^[\w-]{11}$/.test(s)) return `https://www.youtube.com/embed/${s}?autoplay=1`;
  if ((m = s.match(/list=([\w-]+)/))) return `https://www.youtube.com/embed/videoseries?list=${m[1]}`;
  return null;
}

const PRESETS = [
  { label: 'Lofi Girl — beats to relax/study to', value: 'jfKfPfyJRdk' },
];

export default function VideoApp() {
  const [src, setSrc] = useState(null);
  const [val, setVal] = useState('');

  return (
    <div className="video-app">
      {src ? (
        <iframe
          src={src}
          title="video player"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <div className="video-home">
          <img src="icons/video.svg" alt="" width="72" height="72" />
          <h3>Video</h3>
          <p>Paste a YouTube link, video ID or playlist ID — it plays here via the official embed player.</p>
          <form
            onSubmit={(e) => { e.preventDefault(); const u = toEmbedUrl(val); if (u) setSrc(u); }}
            className="video-form"
          >
            <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" autoFocus />
            <button className="btn accent" type="submit">Play</button>
          </form>
          <div className="video-presets">
            {PRESETS.map((p) => (
              <button key={p.value} className="btn" onClick={() => setSrc(toEmbedUrl(p.value))}>{p.label}</button>
            ))}
          </div>
          <p className="dim">Note: youtube.com itself can’t be embedded — this uses the official <code>/embed/</code> player.</p>
        </div>
      )}
    </div>
  );
}
