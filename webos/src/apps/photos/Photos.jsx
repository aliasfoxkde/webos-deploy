// Photos — image viewer with folder navigation and quick, honest edits:
// rotate/flip in 90° steps, drag-rect crop, tonal adjustments (exposure,
// contrast, saturation) and markup annotations (pen, line, arrow, rect,
// ellipse, text). Edits are non-destructive in session: toolbar state
// renders on screen, and Save re-encodes from the ORIGINAL pixels —
// rotate/flip and markup are lossless redraws; the crop and adjustments
// bake then.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { fileGet, filePut, fileList } from '../../os/db.js';
import { fmtBytes } from '../../os/format.js';
import { useOS } from '../../os/state.jsx';
import {
  isImageName, folderOf, baseName, mimeFor, normRot, rotDims,
  normCrop, cropToDisplay, cropFromDisplay, wrapIndex, renderImage, canvasBlob,
  ADJUST_DEFAULTS, isAdjusted, adjustFilter, applyAdjust,
  shapeFromDisplay, drawAnnotations, editedName,
} from './imops.js';
import './photos.css';

const TOOLS = [
  ['pen', 'Pen', '✎'],
  ['line', 'Line', '╱'],
  ['arrow', 'Arrow', '➚'],
  ['rect', 'Rectangle', '▭'],
  ['ellipse', 'Ellipse', '◯'],
  ['text', 'Text', 'T'],
];
const COLORS = [
  ['#ffffff', 'White'], ['#000000', 'Black'], ['#ff4d4f', 'Red'], ['#ff9f0a', 'Orange'],
  ['#ffd60a', 'Yellow'], ['#30d158', 'Green'], ['#409cff', 'Blue'], ['#bf5af2', 'Purple'],
];
const WIDTHS = [0.004, 0.008, 0.016]; // stroke width as a fraction of image height
const WIDTH_LABELS = ['S', 'M', 'L'];
const TOOL_PROMPTS = {
  pen: 'Pen: drag to draw',
  line: 'Line: drag from start to end',
  arrow: 'Arrow: drag from tail to head',
  rect: 'Rectangle: drag a box',
  ellipse: 'Ellipse: drag a box',
  text: 'Text: click where the label goes',
};
const SLIDERS = [
  ['exposure', 'Exposure', -2, 2],
  ['contrast', 'Contrast', -1, 1],
  ['saturation', 'Saturation', -1, 1],
];

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
  const [adj, setAdj] = useState(ADJUST_DEFAULTS);
  const [panel, setPanel] = useState(null); // null | 'markup' | 'adjust'
  const [tool, setTool] = useState(null); // active markup tool id (TOOLS)
  const [color, setColor] = useState(COLORS[2][0]);
  const [widthIdx, setWidthIdx] = useState(1);
  const [fill, setFill] = useState(false);
  const [anns, setAnns] = useState([]); // committed annotations, SOURCE space
  const [draft, setDraft] = useState(null); // in-progress annotation, display space
  const [textDraft, setTextDraft] = useState(null); // { dx, dy, value } display space
  const [zoom, setZoom] = useState(0); // 0 = fit
  const [box, setBox] = useState({ w: 0, h: 0 }); // stage inner size
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const stageRef = useRef(null);
  const cvRef = useRef(null);
  const ovRef = useRef(null);
  const textRef = useRef(null);
  const alive = useRef(true);
  const urlRef = useRef(null); // current blob URL (revoked on replace)
  const blobRef = useRef(null); // current original blob (saved untouched when unedited)
  const dragStart = useRef(null);
  const dragRectRef = useRef(null);
  const draftRef = useRef(null);
  useEffect(() => () => {
    alive.current = false;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  const cur = paths[idx] || argsPath;
  const edited = normRot(rot) !== 0 || flipH || flipV || Boolean(crop)
    || anns.length > 0 || isAdjusted(adj);

  // the placed text editor takes focus when it mounts (click → type)
  const editingText = textDraft !== null;
  useEffect(() => {
    if (editingText) textRef.current?.focus();
  }, [editingText]);

  const resetTransforms = () => {
    setRot(0); setFlipH(false); setFlipV(false); setCrop(null); setCropping(false);
    setDragRect(null); setZoom(0);
    setAnns([]); setAdj(ADJUST_DEFAULTS);
    setTool(null); setTextDraft(null);
    draftRef.current = null; setDraft(null);
  };

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

  // the in-progress shape maps into source space so it draws through the
  // same transform as the committed ones
  const strokeW = WIDTHS[widthIdx];
  const shapeOpts = { color, width: strokeW, size: strokeW * 4 };
  const draftSrc = draft
    ? shapeFromDisplay(draft.kind, draft, rot, flipH, flipV, { ...shapeOpts, fill: fill && (draft.kind === 'rect' || draft.kind === 'ellipse') })
    : null;

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
    // The filter stays on for the markup pass too — the bake (applyAdjust
    // over the flattened canvas) adjusts annotation pixels as well, so the
    // preview must agree stroke for stroke.
    ctx.filter = adjustFilter(adj);
    ctx.drawImage(img, -natW / 2, -natH / 2);
    if (anns.length) drawAnnotations(ctx, anns, natW, natH);
    if (draftSrc) drawAnnotations(ctx, [draftSrc], natW, natH);
    ctx.filter = 'none';
  }, [img, rot, flipH, flipV, cssW, cssH, W, H, natW, natH, scale, dpr, anns, draftSrc, adj]);

  /* ---- pointer input: crop drag OR markup tool, over the image box ---- */
  const ovPt = (e) => {
    const r = ovRef.current?.getBoundingClientRect();
    if (!r || !r.width || !r.height) return [0, 0];
    return [
      Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1),
      Math.min(Math.max((e.clientY - r.top) / r.height, 0), 1),
    ];
  };
  const setDraftBoth = (d) => { draftRef.current = d; setDraft(d); };
  const onDown = (e) => {
    if (cropping) {
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      const [x, y] = ovPt(e);
      dragStart.current = { x, y };
      dragRectRef.current = { x, y, w: 0, h: 0 };
      setDragRect(dragRectRef.current);
      return;
    }
    if (!tool) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const [x, y] = ovPt(e);
    if (tool === 'text') {
      setTextDraft({ dx: x, dy: y, value: '' });
      return;
    }
    dragStart.current = { x, y };
    setDraftBoth(tool === 'pen'
      ? { kind: 'pen', pts: [[x, y]] }
      : { kind: tool, x1: x, y1: y, x2: x, y2: y });
  };
  const onMove = (e) => {
    if (cropping) {
      const s = dragStart.current;
      if (!s) return;
      const [x, y] = ovPt(e);
      dragRectRef.current = { x: Math.min(s.x, x), y: Math.min(s.y, y), w: Math.abs(x - s.x), h: Math.abs(y - s.y) };
      setDragRect(dragRectRef.current);
      return;
    }
    if (!dragStart.current || !draftRef.current) return;
    const [x, y] = ovPt(e);
    const d = draftRef.current;
    setDraftBoth(d.kind === 'pen'
      ? { ...d, pts: [...d.pts, [x, y]] }
      : { ...d, x2: x, y2: y });
  };
  const onUp = () => {
    if (cropping) {
      if (!dragStart.current) return;
      dragStart.current = null;
      const r = dragRectRef.current;
      dragRectRef.current = null;
      setDragRect(null);
      // a real drag becomes the crop; a click clears any existing one
      setCrop(r && r.w > 0.02 && r.h > 0.02 ? cropFromDisplay(normCrop(r), rot, flipH, flipV) : null);
      return;
    }
    if (!dragStart.current) return;
    dragStart.current = null;
    const d = draftRef.current;
    setDraftBoth(null);
    if (!d) return;
    const big = d.kind === 'pen'
      ? d.pts.length > 1
      : Math.abs(d.x2 - d.x1) > 0.01 || Math.abs(d.y2 - d.y1) > 0.01;
    if (big) setAnns((a) => [...a, shapeFromDisplay(d.kind, d, rot, flipH, flipV, shapeOpts)]);
  };

  const commitText = () => {
    const t = textDraft;
    setTextDraft(null);
    if (!t || !t.value.trim()) return;
    const s = shapeFromDisplay('text', { x1: t.dx, y1: t.dy }, rot, flipH, flipV, shapeOpts);
    setAnns((a) => [...a, { ...s, text: t.value }]);
  };

  const shownRect = dragRect ?? (crop ? cropToDisplay(crop, rot, flipH, flipV) : null);

  /* ---- zoom + keys ---- */
  const zoomBy = (f) => setZoom((z) => Math.min(8, Math.max(0.05, (z || fit || 1) * f)));
  const onKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      if (anns.length) { setAnns((a) => a.slice(0, -1)); e.preventDefault(); }
      return;
    }
    if (e.key === 'ArrowLeft') { goto(-1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { goto(1); e.preventDefault(); }
    else if (e.key === '+' || e.key === '=') { zoomBy(1.25); e.preventDefault(); }
    else if (e.key === '-') { zoomBy(0.8); e.preventDefault(); }
    else if (e.key === '0') { setZoom(0); e.preventDefault(); }
    else if (e.key === 'Escape') {
      setCropping(false);
      setTool(null);
      draftRef.current = null;
      setDraft(null);
      setTextDraft(null);
    }
  };

  /* ---- save ---- */
  const save = async (asCopy) => {
    if (!img || !cur || busy) return;
    setBusy(true);
    try {
      const dir = folderOf(cur);
      let path = cur;
      if (asCopy) {
        const taken = new Set(paths.map((p) => baseName(p)));
        path = `${dir === '/' ? '' : dir}/${editedName(baseName(cur), taken)}`;
      }
      let blob = blobRef.current;
      if (edited) {
        const disp = crop ? cropToDisplay(crop, rot, flipH, flipV) : null;
        const canvas = renderImage(img, { rot, flipH, flipV }, disp, anns);
        applyAdjust(canvas, adj);
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

  const inputPad = cropping || (tool && tool !== 'text') || (tool === 'text' && !textDraft);
  const hintText = status
    || (cropping ? 'Crop: drag a region — click without dragging to clear'
      : tool ? `${TOOL_PROMPTS[tool]} — Esc to stop`
      : '');

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
        keys pass through to the shortcuts (arrows navigate, +/- zoom, 0 fits, Esc exits a mode). */}
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
            {textDraft && (
              <input
                ref={textRef}
                className="ph-text-input"
                style={{ left: `${textDraft.dx * 100}%`, top: `${textDraft.dy * 100}%`, color, fontSize: `${Math.max(9, Math.round(strokeW * 4 * cssH))}px` }}
                value={textDraft.value}
                aria-label="Annotation text"
                placeholder="Type…"
                onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitText();
                  else if (e.key === 'Escape') setTextDraft(null);
                  e.stopPropagation(); // don't drive the viewer's shortcuts
                }}
                onBlur={commitText}
              />
            )}
            {inputPad && (
              <div
                className="ph-crop-pad"
                ref={ovRef}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                role="region"
                aria-label={cropping ? 'Crop area — drag to select a region' : `Markup area — ${TOOL_PROMPTS[tool]}`}
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

      {panel === 'markup' && img && (
        <div className="ph-panel" role="toolbar" aria-label="Markup tools">
          {TOOLS.map(([id, label, glyph]) => (
            <button
              key={id}
              type="button"
              className={`ph-tool ${tool === id ? 'on' : ''}`}
              aria-pressed={tool === id}
              aria-label={label}
              title={label}
              onClick={() => { setTool((t) => (t === id ? null : id)); setTextDraft(null); }}
            >{glyph}</button>
          ))}
          <span className="ph-sep" />
          {COLORS.map(([hex, name]) => (
            <button
              key={hex}
              type="button"
              className={`ph-swatch ${color === hex ? 'on' : ''}`}
              style={{ background: hex }}
              aria-label={`${name} color`}
              aria-pressed={color === hex}
              title={name}
              onClick={() => setColor(hex)}
            />
          ))}
          <span className="ph-sep" />
          {WIDTH_LABELS.map((lab, i) => (
            <button
              key={lab}
              type="button"
              className={`ph-size ${widthIdx === i ? 'on' : ''}`}
              aria-pressed={widthIdx === i}
              aria-label={`${lab} stroke`}
              title={`${lab} stroke`}
              onClick={() => setWidthIdx(i)}
            >{lab}</button>
          ))}
          <button
            type="button"
            className={`ph-tool ${fill ? 'on' : ''}`}
            aria-pressed={fill}
            aria-label="Fill shapes"
            title="Fill shapes"
            onClick={() => setFill((v) => !v)}
          >Fill</button>
          <span className="ph-sep" />
          <button type="button" className="ph-tool" onClick={() => setAnns((a) => a.slice(0, -1))} disabled={!anns.length} aria-label="Undo last annotation" title="Undo (Ctrl+Z)">↶</button>
          <button type="button" className="ph-tool" onClick={() => setAnns([])} disabled={!anns.length} aria-label="Clear all annotations" title="Clear all">✕</button>
        </div>
      )}

      {panel === 'adjust' && img && (
        <div className="ph-panel" role="group" aria-label="Image adjustments">
          {SLIDERS.map(([key, label, min, max]) => (
            <label key={key} className="ph-slider">
              <span>{label}</span>
              <input
                type="range"
                min={min}
                max={max}
                step="0.05"
                value={adj[key]}
                aria-label={label}
                onChange={(e) => setAdj((a) => ({ ...a, [key]: Number(e.target.value) }))}
              />
              <span className="ph-slider-val">{adj[key] > 0 ? '+' : ''}{adj[key].toFixed(2)}</span>
            </label>
          ))}
          <button type="button" className="ph-tool" onClick={() => setAdj(ADJUST_DEFAULTS)} disabled={!isAdjusted(adj)}>Reset adjustments</button>
        </div>
      )}

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
        <button
          type="button"
          className={`ph-btn ${panel === 'markup' ? 'on' : ''}`}
          onClick={() => { setPanel((p) => (p === 'markup' ? null : 'markup')); setTool(null); setTextDraft(null); }}
          disabled={!img}
          title="Markup — draw on the image"
        >Markup</button>
        <button
          type="button"
          className={`ph-btn ${panel === 'adjust' ? 'on' : ''}`}
          onClick={() => setPanel((p) => (p === 'adjust' ? null : 'adjust'))}
          disabled={!img}
          title="Exposure, contrast, saturation"
        >Adjust</button>
        <span className="ph-sep" />
        <button type="button" className="ph-btn" onClick={() => { resetTransforms(); }} disabled={!edited && zoom === 0} title="Discard edits and zoom">Reset</button>
        <span className="ph-spring" />
        {meta && <span className="ph-meta" title={meta.type}>{natW}×{natH} · {fmtBytes(meta.size)}</span>}
        <button type="button" className="ph-btn" onClick={openInFiles} title="Open Files">Files</button>
        <button type="button" className="ph-btn" onClick={() => save(true)} disabled={!img || busy} title="Save a copy next to the original">Save copy</button>
        <button type="button" className="ph-btn accent" onClick={() => save(false)} disabled={!img || busy} title="Write edits back to the file in Files">{busy ? 'Saving…' : 'Save'}</button>
      </footer>
      {hintText && (
        <div className="ph-status" role="status">
          {hintText}
        </div>
      )}
    </div>
  );
}
