import React from 'react';
import { useOS } from '../os/state.jsx';
import FxWallpaper from './FxWallpaper.jsx';
import WaterWallpaper from './WaterWallpaper.jsx';
import { PhotoShowcase, BigClock } from './Screensaver.jsx';
import { resolveParams } from '../os/waterfx.js';

/* Settings mini-preview: the SELECTED screen-saver kind, live, at box
   scale. Reuses the exact implementations the fullscreen saver renders
   (FxWallpaper / WaterWallpaper / PhotoShowcase / BigClock) — no preview
   copies that can drift. The box is an explicitly requested preview, so
   motion stays on: `motion="gentle"` slows (never freezes) under
   prefers-reduced-motion. The water bridge means hovering anywhere drops
   ripples in the preview — the honest behavior, since the real wallpaper
   spans the window. */

const FX_KINDS = ['starfield', 'aurora', 'waves', 'mesh', 'matrix', 'tide', 'rain'];

export default function SaverPreview() {
  const os = useOS();
  const s = os.saver;
  return (
    <div
      className="saver-preview"
      role="img"
      aria-label={`Screen saver preview${s.kind === 'off' ? ' (off)' : `: ${s.kind}`}`}
    >
      {FX_KINDS.includes(s.kind) && (
        <FxWallpaper kind={s.kind} id="saver-preview-fx" speed={s.speed || 1} motion="gentle" />
      )}
      {s.kind === 'water' && (
        <WaterWallpaper
          id="saver-preview-fx" speed={0.35 * (s.speed || 1)} motion="gentle"
          params={resolveParams(os.theme?.water, os.theme?.waterPreset)}
        />
      )}
      {s.kind === 'photos' && <PhotoShowcase secs={s.photoSecs || 8} />}
      {s.kind === 'clock' && <BigClock />}
      {s.kind === 'off' && <span className="saver-preview-off">Screen saver is off</span>}
    </div>
  );
}
