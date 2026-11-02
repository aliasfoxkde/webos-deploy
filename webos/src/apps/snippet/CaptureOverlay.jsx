import React, { useCallback, useEffect, useRef, useState } from 'react';
import { rectFromDrag, isRectMeaningful, cropSourceRect, timestampName } from './capture.js';
import { filePut } from '../../os/db.js';
import './snippet.css';

// Full-screen region-select overlay. Picks a screen/window/tab via
// getDisplayMedia, draws the frame, lets the user drag a rect, resolves
// with a PNG Blob of that region. Escape cancels.
export default function CaptureOverlay({ onDone, onCancel }) {
  const [phase, setPhase] = useState('pick'); // pick | drag | processing
  const [error, setError] = useState('');
  const [rect, setRect] = useState(null);
  const dragRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => () => {
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
  }, []);

  const start = useCallback(async () => {
    setError('');
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError('Screen capture is not supported in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'never' },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      video.srcObject = stream;
      // play() can reject (autoplay policy) and its promise may never settle
      // in a non-browser host — the frame is ready either way, so don't await.
      video.play?.().catch(() => {});
      setPhase('drag');
    } catch (err) {
      if (err && err.name === 'NotAllowedError') return; // user cancelled picker — not an error
      setError(err?.message || 'Capture failed.');
    }
  }, []);

  const finish = useCallback(async (sel) => {
    setPhase('processing');
    const video = videoRef.current;
    const src = { w: video.videoWidth, h: video.videoHeight };
    // clientWidth/Height are 0 when the video has no layout box (hidden
    // element, no layout pass) — the intrinsic frame size is the fallback.
    const viewport = {
      w: video.clientWidth || video.videoWidth,
      h: video.clientHeight || video.videoHeight,
    };
    const crop = cropSourceRect(sel, viewport, src);
    if (!crop) {
      setError('Selection is outside the captured frame.');
      setPhase('drag');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = crop.w;
    canvas.height = crop.h;
    canvas.getContext('2d').drawImage(
      video,
      crop.x, crop.y, crop.w, crop.h,
      0, 0, crop.w, crop.h,
    );
    streamRef.current?.getTracks().forEach((t) => t.stop());
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    onDone(blob);
  }, [onDone]);

  const onPointerDown = (e) => {
    if (phase !== 'drag') return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* capture is optional */ }
    dragRef.current = { x0: e.clientX, y0: e.clientY };
    setRect({ x: e.clientX, y: e.clientY, w: 0, h: 0 });
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    setRect(rectFromDrag(d.x0, d.y0, e.clientX, e.clientY));
  };
  const onPointerUp = (e) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    const sel = rectFromDrag(d.x0, d.y0, e.clientX, e.clientY);
    setRect(sel);
    if (isRectMeaningful(sel)) finish(sel);
    else setRect(null);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="snip-overlay" role="dialog" aria-modal="true" aria-label="Screen capture">
      {/* always mounted — srcObject is attached before the drag phase renders it */}
      <video
        ref={videoRef}
        className={`snip-video ${phase === 'drag' ? '' : 'hidden'}`}
        muted
        playsInline
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      {phase === 'pick' && (
        <div className="snip-pick">
          <p>Choose the screen, window, or tab to capture from.</p>
          {error && <p className="snip-error" role="alert">{error}</p>}
          <div className="snip-actions">
            <button type="button" className="snip-btn primary" onClick={start}>Choose source</button>
            <button type="button" className="snip-btn" onClick={onCancel}>Cancel</button>
          </div>
        </div>
      )}
      {phase === 'drag' && (
        <>
          {error && <p className="snip-error" role="alert">{error}</p>}
          {rect && (
            <div
              className="snip-rect"
              style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
            />
          )}
          <div className="snip-hint">Drag to select a region · Esc to cancel</div>
        </>
      )}
      {phase === 'processing' && <div className="snip-hint">Processing…</div>}
      <canvas ref={canvasRef} hidden />
    </div>
  );
}

export async function saveSnippet(blob) {
  const name = timestampName();
  await filePut(`Pictures/${name}`, blob, 'image/png');
  return `Pictures/${name}`;
}
