import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Canvas plotter: one square unit scale, "nice" gridlines, discontinuity-aware
// curves, wheel zoom about the cursor, drag pan, hover trace readout.
// Props: fns = [{ expr, fn, error }], colors = [hex].
const RESET_VIEW = { x: 0, y: 0, scale: 0.04 }; // units per pixel
const SAMPLE_STEP = 2; // px

function niceStep(raw) {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * pow;
}
const fmtTick = (v) => {
  const a = Math.abs(v);
  if (a >= 1e5 || (a !== 0 && a < 1e-3)) return v.toExponential(1);
  return String(parseFloat(v.toPrecision(10)));
};

export default function PlotCanvas({ fns, colors }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [view, setView] = useState(RESET_VIEW);
  const [trace, setTrace] = useState(null); // { px, py, x, ys: [{color, y}] }
  const drag = useRef(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (!w || !h) return;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const v = viewRef.current;
      const toPxX = (x) => (x - v.x) / v.scale + w / 2;
      const toPxY = (y) => h / 2 - (y - v.y) / v.scale;
      const toMathX = (px) => v.x + (px - w / 2) * v.scale;
      const toMathY = (py) => v.y - (py - h / 2) * v.scale;

      ctx.clearRect(0, 0, w, h);
      ctx.font = '10px ui-monospace, monospace';

      // grid
      const step = niceStep(v.scale * 90);
      const startX = Math.ceil(toMathX(0) / step) * step;
      const endX = toMathX(w);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.fillStyle = 'rgba(255,255,255,0.38)';
      ctx.beginPath();
      for (let x = startX; x <= endX; x += step) {
        const px = Math.round(toPxX(x)) + 0.5;
        ctx.moveTo(px, 0); ctx.lineTo(px, h);
      }
      const startY = Math.ceil(toMathY(h) / step) * step;
      const endY = toMathY(0);
      for (let y = startY; y <= endY; y += step) {
        const py = Math.round(toPxY(y)) + 0.5;
        ctx.moveTo(0, py); ctx.lineTo(w, py);
      }
      ctx.stroke();

      // axes + tick labels
      const ax = toPxY(0);
      const ay = toPxX(0);
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.beginPath();
      ctx.moveTo(0, Math.round(ax) + 0.5); ctx.lineTo(w, Math.round(ax) + 0.5);
      ctx.moveTo(Math.round(ay) + 0.5, 0); ctx.lineTo(Math.round(ay) + 0.5, h);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.42)';
      for (let x = startX; x <= endX; x += step) {
        if (Math.abs(x) < step / 1e6) continue;
        ctx.fillText(fmtTick(x), toPxX(x) + 3, clamp(ax + 12, 12, h - 4));
      }
      for (let y = startY; y <= endY; y += step) {
        if (Math.abs(y) < step / 1e6) continue;
        ctx.fillText(fmtTick(y), clamp(ay + 4, 4, w - 34), toPxY(y) - 3);
      }

      // curves
      fns.forEach((f, i) => {
        if (!f.fn) return;
        ctx.strokeStyle = colors[i % colors.length];
        ctx.lineWidth = 1.7;
        ctx.beginPath();
        let prev = null;
        for (let px = 0; px <= w; px += SAMPLE_STEP) {
          const y = f.fn(toMathX(px));
          if (!Number.isFinite(y)) { prev = null; continue; }
          const py = toPxY(y);
          if (py < -h || py > 2 * h) { prev = null; continue; }
          if (prev !== null && Math.abs(py - prev) > h * 1.5) prev = null; // discontinuity
          if (prev === null) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
          prev = py;
        }
        ctx.stroke();
      });
      ctx.lineWidth = 1;

      // hover trace
      if (trace) {
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.beginPath();
        ctx.moveTo(trace.px + 0.5, 0); ctx.lineTo(trace.px + 0.5, h);
        ctx.stroke();
        fns.forEach((f, i) => {
          if (!f.fn) return;
          const y = f.fn(trace.x);
          if (!Number.isFinite(y)) return;
          ctx.fillStyle = colors[i % colors.length];
          ctx.beginPath();
          ctx.arc(trace.px, toPxY(y), 3, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [fns, colors, view, trace]);

  // Wheel zoom anchored at the cursor.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = wrap.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      setView((v) => {
        const factor = e.deltaY < 0 ? 1 / 1.12 : 1.12;
        const scale = Math.min(1, Math.max(1e-7, v.scale * factor));
        const w = rect.width;
        const h = rect.height;
        const mx = v.x + (px - w / 2) * v.scale;
        const my = v.y - (py - h / 2) * v.scale;
        return { x: mx - (px - w / 2) * scale, y: my + (py - h / 2) * scale, scale };
      });
    };
    wrap.addEventListener('wheel', onWheel, { passive: false });
    return () => wrap.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (e) => {
    drag.current = { x: e.clientX, y: e.clientY, view };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    if (drag.current) {
      const d = drag.current;
      setView({
        x: d.view.x - (e.clientX - d.x) * d.view.scale,
        y: d.view.y + (e.clientY - d.y) * d.view.scale,
        scale: d.view.scale,
      });
      return;
    }
    const v = viewRef.current;
    const x = v.x + (px - rect.width / 2) * v.scale;
    setTrace({ px, py, x });
  };
  const onPointerUp = () => { drag.current = null; };
  const onLeave = () => { setTrace(null); drag.current = null; };

  const traceRows = trace
    ? fns.map((f, i) => ({ color: colors[i % colors.length], y: f.fn ? f.fn(trace.x) : NaN, expr: f.expr }))
        .filter((r) => Number.isFinite(r.y))
    : [];

  return (
    <div
      className="plot-wrap"
      ref={wrapRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onLeave}
      onDoubleClick={() => setView(RESET_VIEW)}
    >
      <canvas ref={canvasRef} className="plot-canvas" />
      <div className="plot-tools">
        <button type="button" className="tb-btn" title="Zoom in" onClick={() => scaleBy(1 / 1.4)}>+</button>
        <button type="button" className="tb-btn" title="Zoom out" onClick={() => scaleBy(1.4)}>−</button>
        <button type="button" className="tb-btn" title="Reset view" onClick={() => setView(RESET_VIEW)}>⌂</button>
      </div>
      {trace && traceRows.length > 0 && (
        <div className="plot-trace">
          <div className="dim">x = {fmtTick(trace.x)}</div>
          {traceRows.map((r, i) => (
            <div key={i}>
              <span className="trace-dot" style={{ background: r.color }} />
              {fmtTick(r.y)}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  function scaleBy(factor) {
    setView((v) => ({ ...v, scale: Math.min(1, Math.max(1e-7, v.scale * factor)) }));
  }
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
