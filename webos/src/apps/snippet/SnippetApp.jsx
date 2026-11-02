import React, { useRef, useState } from 'react';
import CaptureOverlay, { saveSnippet } from './CaptureOverlay.jsx';
import './snippet.css';

// Annotation tools over the captured image, on a stacked canvas pair
// (image layer + ink layer).
const TOOLS = [
  { id: 'pen', label: 'Pen' },
  { id: 'arrow', label: 'Arrow' },
  { id: 'rect', label: 'Box' },
  { id: 'text', label: 'Text' },
];

const COLORS = ['#f43f5e', '#38bdf8', '#22c55e', '#fbbf24', '#ffffff'];

function drawStroke(ctx, tool, color, a, b, size) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = size;
  ctx.lineCap = 'round';
  if (tool === 'pen') {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  } else if (tool === 'rect') {
    ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  } else if (tool === 'arrow') {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const head = 10 + size * 2;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - head * Math.cos(ang - Math.PI / 6), b.y - head * Math.sin(ang - Math.PI / 6));
    ctx.lineTo(b.x - head * Math.cos(ang + Math.PI / 6), b.y - head * Math.sin(ang + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }
}

export default function SnippetApp() {
  const [shot, setShot] = useState(null); // HTMLImageElement of the capture
  const [overlay, setOverlay] = useState(false);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState(COLORS[0]);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  const imgRef = useRef(null);
  const inkRef = useRef(null);
  const drawRef = useRef(null);

  const onCaptured = (blob) => {
    setOverlay(false);
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setShot({ url, w: img.width, h: img.height });
    };
    img.onerror = () => setError('Captured image failed to load.');
    img.src = url;
  };

  const pos = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (e.currentTarget.width / r.width),
      y: (e.clientY - r.top) * (e.currentTarget.height / r.height),
    };
  };

  const onDown = (e) => {
    if (!shot) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* capture is optional */ }
    drawRef.current = pos(e);
  };
  const onMove = (e) => {
    const start = drawRef.current;
    if (!start || tool !== 'pen') return;
    const ctx = inkRef.current.getContext('2d');
    drawStroke(ctx, 'pen', color, start, pos(e), 3);
    drawRef.current = pos(e);
  };
  const onUp = (e) => {
    const start = drawRef.current;
    drawRef.current = null;
    if (!start || tool === 'pen') return;
    drawStroke(inkRef.current.getContext('2d'), tool, color, start, pos(e), 3);
  };

  const flatten = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = shot.w;
    canvas.height = shot.h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgRef.current, 0, 0);
    ctx.drawImage(inkRef.current, 0, 0);
    return new Promise((res) => canvas.toBlob(res, 'image/png'));
  };

  const save = async () => {
    try {
      const blob = await flatten();
      const path = await saveSnippet(blob);
      setSaved(path);
    } catch {
      setError('Save failed.');
    }
  };

  const copy = async () => {
    try {
      const blob = await flatten();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setSaved('clipboard');
    } catch {
      setError('Clipboard write was denied by the browser.');
    }
  };

  const download = async () => {
    const blob = await flatten();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'snippet.png';
    a.click();
  };

  return (
    <div className="snip">
      <div className="snip-toolbar" role="toolbar" aria-label="Snippet tools">
        <button type="button" className="snip-btn primary" onClick={() => setOverlay(true)}>
          {shot ? 'New capture' : 'Capture'}
        </button>
        {shot && TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`snip-btn ${tool === t.id ? 'on' : ''}`}
            aria-pressed={tool === t.id}
            onClick={() => setTool(t.id)}
          >
            {t.label}
          </button>
        ))}
        {shot && COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Color ${c}`}
            className={`snip-swatch ${color === c ? 'on' : ''}`}
            style={{ background: c }}
            onClick={() => setColor(c)}
          />
        ))}
        {shot && (
          <>
            <button type="button" className="snip-btn" onClick={() => { setShot(null); setSaved(''); }}>Discard</button>
            <button type="button" className="snip-btn" onClick={download}>Download</button>
            <button type="button" className="snip-btn" onClick={copy}>Copy</button>
            <button type="button" className="snip-btn primary" onClick={save}>Save</button>
          </>
        )}
      </div>
      {error && <p className="snip-error" role="alert">{error}</p>}
      {saved && <p className="snip-saved">Saved to {saved === 'clipboard' ? 'clipboard' : saved}</p>}
      <div className="snip-stage">
        {shot ? (
          <div className="snip-canvas-wrap" style={{ aspectRatio: `${shot.w} / ${shot.h}` }}>
            <img src={shot.url} alt="Captured snippet" className="snip-img" />
            <canvas
              ref={inkRef}
              width={shot.w}
              height={shot.h}
              className="snip-ink"
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
            />
          </div>
        ) : (
          <p className="snip-empty">No capture yet — press Capture.</p>
        )}
      </div>
      {overlay && (
        <CaptureOverlay onDone={onCaptured} onCancel={() => setOverlay(false)} />
      )}
    </div>
  );
}
