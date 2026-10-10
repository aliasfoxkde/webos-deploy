import React, { useEffect, useRef } from 'react';

/* Interactive canvas wallpapers (`fx:<kind>` in theme.wallpaper). Drawn in
   code — no assets, no licenses. Pointer parallax on every effect; the rAF
   loop pauses when the tab is hidden and never starts under
   prefers-reduced-motion (one static frame is drawn instead). */

const TAU = Math.PI * 2;
const rand = (seedStr) => {
  // tiny deterministic PRNG so each kind looks the same every launch
  let h = 2166136261;
  for (const c of seedStr) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
};

const KINDS = {
  starfield: {
    colors: ['#ffffff', '#bcd8ff', '#ffe9c9'],
    draw(ctx, w, h, t, px, py) {
      const r = rand('starfield');
      const layers = 3;
      for (let l = 0; l < layers; l++) {
        const depth = (l + 1) / layers;
        const drift = t * 4 * depth;
        const ox = px * 18 * depth;
        const oy = py * 12 * depth;
        const n = Math.floor(140 * depth);
        for (let i = 0; i < n; i++) {
          const sx = ((r() * w + drift) % (w + 40)) - 20;
          const sy = r() * h;
          const size = 0.6 + r() * 1.4 * depth;
          ctx.globalAlpha = 0.25 + 0.65 * depth * (0.55 + 0.45 * Math.sin(t * 2 + i));
          ctx.fillStyle = this.colors[Math.floor(r() * this.colors.length)];
          ctx.beginPath();
          ctx.arc(sx + ox, (sy + oy + h) % h, size, 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    },
  },
  aurora: {
    draw(ctx, w, h, t, px, py) {
      const bands = [
        { hue: 'rgba(52, 211, 153,', amp: 60, y: 0.34, sp: 0.7, ph: 0 },
        { hue: 'rgba(56, 189, 248,', amp: 80, y: 0.42, sp: 0.45, ph: 2 },
        { hue: 'rgba(167, 139, 250,', amp: 50, y: 0.5, sp: 0.95, ph: 4 },
      ];
      for (const { hue, amp, y, sp, ph } of bands) {
        for (let off = 5; off >= 0; off--) {
          ctx.beginPath();
          for (let x = -20; x <= w + 20; x += 24) {
            const yy = h * y + Math.sin((x / w) * TAU * 1.4 + t * sp + ph + off * 0.35) * amp
              + Math.sin((x / w) * TAU * 3.1 - t * sp * 0.6) * amp * 0.35 + py * 26;
            ctx.lineTo(x, yy);
          }
          ctx.lineWidth = 46;
          ctx.strokeStyle = `${hue}${(0.035 + off * 0.012).toFixed(3)})`;
          ctx.lineCap = 'round';
          ctx.stroke();
        }
      }
      // stars behind
      const r = rand('aurora');
      ctx.fillStyle = '#e8ecf4';
      for (let i = 0; i < 90; i++) {
        ctx.globalAlpha = 0.12 + 0.3 * (0.5 + 0.5 * Math.sin(t + i * 1.7));
        ctx.beginPath();
        ctx.arc(r() * w, r() * h * 0.55 + py * 10, 0.8, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  },
  waves: {
    draw(ctx, w, h, t, px, py) {
      const bands = 7;
      for (let b = 0; b < bands; b++) {
        const depth = b / (bands - 1);
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 18) {
          const y = h * (0.55 + depth * 0.1)
            + Math.sin((x / w) * TAU * (1.2 + b * 0.28) + t * (0.5 + b * 0.14) + b) * (26 + b * 7)
            + py * 20 * depth;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, h * 0.5, 0, h);
        g.addColorStop(0, `rgba(14, 165, 190, ${(0.05 + depth * 0.09).toFixed(3)})`);
        g.addColorStop(1, `rgba(8, 60, 90, ${(0.10 + depth * 0.16).toFixed(3)})`);
        ctx.fillStyle = g;
        ctx.fill();
      }
      // moon
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = '#dbe7f4';
      ctx.beginPath();
      ctx.arc(w * 0.78 + px * 14, h * 0.2 + py * 10, 34, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    },
  },
  mesh: {
    draw(ctx, w, h, t, px, py) {
      const r = rand('mesh');
      const pts = Array.from({ length: 46 }, () => ({
        x: r() * w, y: r() * h, vx: (r() - 0.5) * 0.35, vy: (r() - 0.5) * 0.35, ph: r() * TAU,
      }));
      for (const p of pts) {
        p.dx = (p.x + Math.sin(t * 0.6 + p.ph) * 14 + p.vx * t * 12 + px * 22 + w) % w;
        p.dy = (p.y + Math.cos(t * 0.5 + p.ph) * 12 + p.vy * t * 12 + py * 16 + h) % h;
      }
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.16)';
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].dx - pts[j].dx;
          const dy = pts[i].dy - pts[j].dy;
          const d2 = dx * dx + dy * dy;
          if (d2 < 190 * 190) {
            ctx.globalAlpha = 1 - d2 / (190 * 190);
            ctx.beginPath();
            ctx.moveTo(pts[i].dx, pts[i].dy);
            ctx.lineTo(pts[j].dx, pts[j].dy);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(103, 232, 249, 0.5)';
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.dx, p.dy, 1.6, 0, TAU);
        ctx.fill();
      }
    },
  },
  matrix: {
    draw(ctx, w, h, t, px, py) {
      const fs = 15;
      const cols = Math.ceil(w / fs);
      const r = rand('matrix');
      const speeds = Array.from({ length: cols }, () => 3 + r() * 7);
      const chars = 'アイウエオカキクケコサシスセソ0123456789<>[]{}';
      ctx.font = `${fs}px ui-monospace, Menlo, monospace`;
      for (let c = 0; c < cols; c++) {
        const headY = ((t * speeds[c] * fs) + r() * h * 2) % (h + 200) - 100;
        for (let k = 0; k < 14; k++) {
          const y = headY - k * fs + py * 12;
          if (y < -fs || y > h + fs) continue;
          ctx.fillStyle = k === 0 ? '#c8ffe8' : `rgba(74, 222, 128, ${(0.5 - k * 0.033).toFixed(2)})`;
          ctx.fillText(chars[Math.floor(r() * chars.length)], c * fs + px * 8, y);
        }
      }
      ctx.fillStyle = 'rgba(4, 8, 6, 0.14)';
      ctx.fillRect(0, 0, w, h); // motion trails
    },
  },
};

export default function FxWallpaper({ kind, id = 'fx-wallpaper', speed = 1 }) {
  const ref = useRef(null);
  const fx = KINDS[kind] || KINDS.starfield;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let raf = 0;
    let w = 0;
    let h = 0;
    let px = 0;
    let py = 0;
    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    const onMove = (e) => {
      px = (e.clientX / window.innerWidth - 0.5) * 2;
      py = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('pointermove', onMove);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = performance.now();
    const frame = () => {
      const t = ((performance.now() - start) / 1000) * speed;
      ctx.fillStyle = '#05070d';
      ctx.fillRect(0, 0, w, h);
      fx.draw.call(fx, ctx, w, h, t, px, py);
      raf = requestAnimationFrame(frame);
    };
    if (reduced) {
      ctx.fillStyle = '#05070d';
      ctx.fillRect(0, 0, w, h);
      fx.draw.call(fx, ctx, w, h, 0, 0, 0); // one static frame, no loop
    } else {
      raf = requestAnimationFrame(frame);
    }
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduced) raf = requestAnimationFrame(frame);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [fx, speed]);

  return <canvas ref={ref} id={id} aria-hidden="true" />;
}
