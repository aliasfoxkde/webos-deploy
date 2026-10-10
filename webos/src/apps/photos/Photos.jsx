// Photos — image viewer with folder navigation and quick, honest edits
// (rotate 90° steps, flips, drag-rect crop). Edits are non-destructive in
// session: the toolbar state renders on screen, and Save re-encodes from the
// ORIGINAL pixels (rotate/flip are lossless redraws; the crop bakes then).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { fileGet, filePut, fileList } from '../../os/db.js';
import { fmtBytes } from '../../os/format.js';
import { useOS } from '../../os/state.jsx';
import {
  isImageName, folderOf, baseName, mimeFor, normRot, rotDims,
  normCrop, cropToDisplay, cropFromDisplay, wrapIndex, renderImage, canvasBlob,
} from './imops.js';
import './photos.css';

export default function Photos({ args } = {}) {
  const os = useOS();
  const argsPath = args?.path || '';
  const [paths, setPaths] = useState([]);
  const [idx, setIdx] = useState(0);
  const [img, setImg] = useState(null);
  const [meta, setMeta] = useState(null); // { path, type, size }
  const [rot, setRot] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [crop, setCrop] = useState(null); // normalized, SOURCE space
  const [cropping, setCropping] = useState(false);
  const [dragRect, setDragRect] = useState(null); // display space, while dragging
  const [zoom, setZoom] = useState(0); // 0 = fit
  const [box, setBox] = useState({ w: 0, h: 0 }); // stage inner size
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const stageRef = useRef(null);
  const cvRef = useRef(null);
  const ovRef = useRef(null);
  const alive = useRef(true);
  const urlRef = useRef(null); // current blob URL (revoked on replace)
  const blobRef = useRef(null); // current original blob (saved untouched when unedited)
  const dragStart = useRef(null);
  const dragRectRef = useRef(null);
  useEffect(() => () => {
    alive.current = false;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  const cur = paths[idx] || argsPath;
  const edited = normRot(rot) !== 0 || flipH || flipV || Boolean(crop);

  const resetTransforms = () => { setRot(0); setFlipH(false); setFlipV(false); setCrop(null); setCropping(false); setDragRect(null); setZoom(0); };

  /* Decode a store path into an <img>; keep its original blob for untouched
     saves. The previous URL is revoked only after the new image decodes. */
  const open = useCallback(async (path) => {
    if (!path) return;
    const full = await fileGet(path).catch(() => null);
    if (!alive.current) return;
    if (!full?.blob) { setStatus(`not found: ${baseName(path)}`); return; }
    const url = URL.createObjectURL(full.blob);
    const image = new Image();
    image.onload = () => {
      if (!alive.current) { URL.revokeObjectURL(url); return; }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      blobRef.current = full.blob;
      setImg(image);
      setMeta({ path, type: full.blob.type || 'image/*', size: full.blob.size });
      setStatus('');
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setStatus(`cannot decode ${baseName(path)}`);
    };
    image.src = url;
  }, []);

  // Folder listing + initial open, re-run when launched with a new path.
  // (No-path launches render the empty pane directly — no state needed.)
  useEffect(() => {
    if (!argsPath) return undefined;
    let cancelled = false;
    (async () => {
      const list = await fileList().catch(() => []);
      if (cancelled || !alive.current) return;
      const dir = folderOf(argsPath);
      const prefix = dir === '/' ? '/' : `${dir}/`;
      const imgs = list
        .filter((r) => !r.dir && r.path.startsWith(prefix) && isImageName(baseName(r.path), r.type))
        .map((r) => r.path)
        .sort();
      const at = imgs.indexOf(argsPath);
      if (at < 0) imgs.unshift(argsPath); // odd (not in listing) — still show it
      setPaths(imgs);
      setIdx(Math.max(0, at));
      resetTransforms();
      open(argsPath);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per launch path
  }, [argsPath]);

  const goto = useCallback((delta) => {
    if (!paths.length) return;
    const next = wrapIndex(idx, paths.length, delta);
    const path = paths[next];
    if (!path || path === cur) return;
    setIdx(next);
    resetTransforms();
    open(path);
  }, [idx, paths, cur, open]);

  /* ---- display sizing + draw ---- */
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const natW = img?.naturalWidth || 0;
  const natH = img?.naturalHeight || 0;
  const [W, H] = rotDims(natW, natH, rot);
  const pad = 24;
  const fit = W && H && box.w > pad && box.h > pad
    ? Math.min((box.w - pad) / W, (box.h - pad) / H)
    : 1;
  const scale = zoom > 0 ? zoom : Math.max(0.01, fit);
  const cssW = Math.max(1, Math.round(W * scale));
  const cssH = Math.max(1, Math.round(H * scale));
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;

  useEffect(() => {
    const c = cvRef.current;
    if (!c || !img) return;
    c.width = Math.max(1, Math.round(cssW * dpr));
    c.height = Math.max(1, Math.round(cssH * dpr));
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = scale < 3; // nearest-neighbour once deeply zoomed
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(c.width / 2, c.height / 2);
    ctx.scale(c.width / W, c.height / H);
    ctx.rotate((normRot(rot) * Math.PI) / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    ctx.drawImage(img, -natW / 2, -natH / 2);
  }, [img, rot, flipH, flipV, cssW, cssH, W, H, natW, natH, scale, dpr]);

  /* ---- crop drag (display space → source space on release) ---- */
  const ovPt = (e) => {
    const r = ovRef.current?.getBoundingClientRect();
    if (!r || !r.width || !r.height) return [0, 0];
    return [
      Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1),
      Math.min(Math.max((e.clientY - r.top) / r.height, 0), 1),
    ];
  };
  const onDown = (e) => {
    if (!cropping) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const [x, y] = ovPt(e);
    dragStart.current = { x, y };
    dragRectRef.current = { x, y, w: 0, h: 0 };
    setDragRect(dragRectRef.current);
  };
  const onMove = (e) => {
    const s = dragStart.current;
    if (!cropping || !s) return;
    const [x, y] = ovPt(e);
    dragRectRef.current = { x: Math.min(s.x, x), y: Math.min(s.y, y), w: Math.abs(x - s.x), h: Math.abs(y - s.y) };
    setDragRect(dragRectRef.current);
  };
  const onUp = () => {
    if (!dragStart.current) return;
    dragStart.current = null;
    const r = dragRectRef.current;
    dragRectRef.current = null;
    setDragRect(null);
    // a real drag becomes the crop; a click clears any existing one
    setCrop(r && r.w > 0.02 && r.h > 0.02 ? cropFromDisplay(normCrop(r), rot, flipH, flipV) : null);
  };

  const shownRect = dragRect ?? (crop ? cropToDisplay(crop, rot, flipH, flipV) : null);

  /* ---- zoom + keys ---- */
  const zoomBy = (f) => setZoom((z) => Math.min(8, Math.max(0.05, (z || fit || 1) * f)));
  const onKeyDown = (e) => {
    if (e.key === 'ArrowLeft') { goto(-1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { goto(1); e.preventDefault(); }
    else if (e.key === '+' || e.key === '=') { zoomBy(1.25); e.preventDefault(); }
    else if (e.key === '-') { zoomBy(0.8); e.preventDefault(); }
    else if (e.key === '0') { setZoom(0); e.preventDefault(); }
    else if (e.key === 'Escape' && cropping) setCropping(false);
  };

  /* ---- save ---- */
  const editedPath = (path, taken) => {
    const m = path.match(/^\/?(.*?)(\.[^.]+)?$/);
    let name = `${m[1] || 'image'}-edited${m[2] || '.png'}`;
    let n = 2;
    while (taken.has(name)) name = `${m[1] || 'image'}-edited-${n}${m[2] || '.png'}`;
    return name;
  };
  const save = async (asCopy) => {
    if (!img || !cur || busy) return;
    setBusy(true);
    try {
      const dir = folderOf(cur);
      let path = cur;
      if (asCopy) {
        const taken = new Set(paths.map((p) => baseName(p)));
        path = `${dir === '/' ? '' : dir}/${editedPath(baseName(cur), taken)}`;
      }
      let blob = blobRef.current;
      if (edited) {
        const disp = crop ? cropToDisplay(crop, rot, flipH, flipV) : null;
        const canvas = renderImage(img, { rot, flipH, flipV }, disp);
        const type = mimeFor(path);
        blob = await canvasBlob(canvas, type, type === 'image/jpeg' ? 0.92 : undefined);
      }
      await filePut(path, blob);
      if (asCopy) {
        const list = await fileList().catch(() => []);
        if (!alive.current) return;
        const dir2 = folderOf(path);
        const prefix = dir2 === '/' ? '/' : `${dir2}/`;
        const imgs = list
          .filter((r) => !r.dir && r.path.startsWith(prefix) && isImageName(baseName(r.path), r.type))
          .map((r) => r.path)
          .sort();
        setPaths(imgs);
        setIdx(Math.max(0, imgs.indexOf(path)));
        resetTransforms();
        open(path);
      }
      setStatus(`saved ${baseName(path)} → Files`);
    } catch (e) {
      setStatus(`save failed: ${e.message ?? e}`);
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const openInFiles = () => { if (cur) os.launch('files'); };

  return (
    <div className="photos">
      <header className="ph-bar">
        <button type="button" className="ph-btn" onClick={() => goto(-1)} disabled={paths.length < 2} title="Previous image (←)" aria-label="Previous image">‹</button>
        <button type="button" className="ph-btn" onClick={() => goto(1)} disabled={paths.length < 2} title="Next image (→)" aria-label="Next image">›</button>
        <span className="ph-count">{paths.length ? `${idx + 1} / ${paths.length}` : '—'}</span>
        <span className="ph-name" title={cur}>{baseName(cur) || 'Photos'}</span>
        {edited && <span className="ph-edited">edited</span>}
        <span className="ph-spring" />
        <button type="button" className="ph-btn" onClick={() => zoomBy(0.8)} title="Zoom out (−)" aria-label="Zoom out">−</button>
        <span className="ph-zoom">{Math.round(scale * 100)}%</span>
        <button type="button" className="ph-btn" onClick={() => zoomBy(1.25)} title="Zoom in (+)" aria-label="Zoom in">+</button>
        <button type="button" className={`ph-btn ${zoom === 0 ? 'on' : ''}`} onClick={() => setZoom(0)} title="Fit to window (0)">Fit</button>
      </header>

      {/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex --
        a keyboard-driven viewer stage is exactly what role="application" exists for: focusable,
        keys pass through to the shortcuts (arrows navigate, +/- zoom, 0 fits, Esc exits crop). */}
      <div
        className="ph-stage"
        ref={stageRef}
        role="application"
        aria-label="Image viewer — arrow keys navigate, plus/minus zoom"
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        {img ? (
          <div className="ph-canvas-box" style={{ width: cssW, height: cssH }}>
            <canvas ref={cvRef} className="ph-canvas" aria-label={baseName(cur)} />
            {shownRect && (
              <div
                className={`ph-crop-rect ${cropping ? 'live' : ''}`}
                style={{ left: `${shownRect.x * 100}%`, top: `${shownRect.y * 100}%`, width: `${shownRect.w * 100}%`, height: `${shownRect.h * 100}%` }}
              />
            )}
            {cropping && (
              <div
                className="ph-crop-pad"
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                role="region"
                aria-label="Crop area — drag to select a region"
              />
            )}
          </div>
        ) : (
          <div className="ph-empty">
            {status || (argsPath ? 'Loading…' : 'No image open — pick one in Files')}
          </div>
        )}
      </div>
      {/* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}

      <footer className="ph-bar bottom">
        <button
          type="button"
          className={`ph-btn ${rot === 270 ? 'on' : ''}`}
          onClick={() => setRot((r) => normRot(r - 90))}
          title="Rotate left"
          aria-label="Rotate left"
        >⟲</button>
        <button
          type="button"
          className={`ph-btn ${rot === 90 ? 'on' : ''}`}
          onClick={() => setRot((r) => normRot(r + 90))}
          title="Rotate right"
          aria-label="Rotate right"
        >⟳</button>
        <button type="button" className={`ph-btn ${flipH ? 'on' : ''}`} onClick={() => setFlipH((v) => !v)} title="Flip horizontal" aria-label="Flip horizontal">⇋</button>
        <button type="button" className={`ph-btn ${flipV ? 'on' : ''}`} onClick={() => setFlipV((v) => !v)} title="Flip vertical" aria-label="Flip vertical">⇅</button>
        <span className="ph-sep" />
        <button type="button" className={`ph-btn ${cropping ? 'on' : ''}`} onClick={() => setCropping((v) => !v)} disabled={!img} title="Crop — drag a region on the image">Crop</button>
        {crop && <button type="button" className="ph-btn" onClick={() => setCrop(null)} title="Remove crop">Clear crop</button>}
        <span className="ph-sep" />
        <button type="button" className="ph-btn" onClick={() => { resetTransforms(); }} disabled={!edited && zoom === 0} title="Discard edits and zoom">Reset</button>
        <span className="ph-spring" />
        {meta && <span className="ph-meta" title={meta.type}>{natW}×{natH} · {fmtBytes(meta.size)}</span>}
        <button type="button" className="ph-btn" onClick={openInFiles} title="Open Files">Files</button>
        <button type="button" className="ph-btn" onClick={() => save(true)} disabled={!img || busy} title="Save a copy next to the original">Save copy</button>
        <button type="button" className="ph-btn accent" onClick={() => save(false)} disabled={!img || busy} title="Write edits back to the file in Files">{busy ? 'Saving…' : 'Save'}</button>
      </footer>
      {(status || cropping) && (
        <div className="ph-status" role="status">
          {status || 'Crop: drag a region — click without dragging to clear'}
        </div>
      )}
    </div>
  );
}
