import React, { useEffect, useRef, useState } from 'react';
import createWaterEngine, { waterSupported } from './watergl.js';
import { DEFAULTS } from '../os/waterfx.js';
import FxWallpaper from './FxWallpaper.jsx';

/* The interactive water wallpaper (`fx:water`): a WebGL2 wave-equation sim
   whose surface refracts the background — pointer ripples, click drops,
   ambient rain (shell/watergl.js, ported from webbg-demo). The wallpaper
   sits BEHIND every window, so pointer input is bridged from `window`, not
   the canvas. Falls back to the 2D Tide FX when WebGL2 or float render
   targets are unavailable (probed once, during the first render). Reduced
   motion draws one calm static frame — `speed` scales the sim (the screen
   saver passes its gentle multiplier). */

export default function WaterWallpaper({ id = 'water-fx', params = null, speed = 1, motion = 'auto' }) {
  const ref = useRef(null);
  // lazy initializer: the capability probe runs once, at first render
  const [failed, setFailed] = useState(!waterSupported());
  const paramsRef = useRef(params);
  const engineRef = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || failed) return undefined;
    let engine;
    try {
      engine = createWaterEngine(canvas, paramsRef.current || structuredClone(DEFAULTS));
    } catch {
      // creation failed despite the probe (context lost at boot, driver
      // quirk) — defer past the effect body so the fallback swap happens in
      // a callback, not synchronous setState-in-effect
      const t = window.setTimeout(() => setFailed(true), 0);
      return () => window.clearTimeout(t);
    }
    engineRef.current = engine;
    // driver-only instrumentation: ?water-debug exposes live sim counters
    if (new URLSearchParams(window.location.search).has('water-debug')) {
      window.__water = engine;
    }
    const simScale = () => (paramsRef.current || {}).water?.simScale ?? 0.5;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      engine.step(dt, speed);
      raf = requestAnimationFrame(loop);
    };
    if (reduced && motion !== 'gentle') engine.drawStatic();
    else raf = requestAnimationFrame(loop);

    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduced) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    };
    // input bridge: the wallpaper never receives events directly
    const onMove = (e) => {
      engine.pointer(e.clientX * simScale(), (window.innerHeight - e.clientY) * simScale());
    };
    const onDown = (e) => {
      engine.addDrop(e.clientX / window.innerHeight, 1 - e.clientY / window.innerHeight);
    };
    const onLeave = () => engine.pointerOff();
    const onResize = () => engine.resize(window.innerWidth, window.innerHeight);

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerleave', onLeave);
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('resize', onResize);
      engineRef.current = null;
      engine.dispose();
    };
  }, [speed, motion, failed]); // failed flip → tear down the engine (fallback took over)

  // live parameter updates (Settings panel) — sim resolution changes
  // recreate the sim buffers; everything else is just uniforms
  useEffect(() => {
    paramsRef.current = params;
    if (params && engineRef.current) engineRef.current.setParams(params);
  }, [params]);

  if (failed) return <FxWallpaper kind="waves" id={id} />;
  return <canvas ref={ref} id={id} aria-hidden="true" />;
}
