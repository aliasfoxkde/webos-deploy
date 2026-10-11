import React from 'react';
import { compositeLayers, floatStyles } from '../os/wpcompose.js';

/* The composited wallpaper layer (theme.wallpaper = 'wp-<id>'): base
   (theme gradient / solid color / multi-stop gradient / image), a pattern
   overlay, an effect overlay, and up to four floating images. Float
   animation is CSS-only and dies under prefers-reduced-motion (styles.css).
   The Settings studio reuses this exact component for its live preview —
   no preview copy that can drift. */
export default function CompositeWallpaper({ spec, themeBg, id = 'wallpaper', className = '' }) {
  const l = compositeLayers(spec, themeBg);
  return (
    <div
      id={id || undefined}
      aria-hidden="true"
      className={`wpcomp ${className}`}
      style={{ background: l.base }}
    >
      {!!l.pattern && <div className="wp-layer" style={{ background: l.pattern }} />}
      {!!l.effectCss && (
        <div
          className={`wp-layer wp-fx-${l.spec.effect.kind}`}
          style={{ background: l.effectCss, opacity: l.effectOpacity }}
        />
      )}
      {l.spec.floats.map((f) => {
        const st = floatStyles(f);
        return (
          <span key={f.id} className="wp-float" style={st.box}>
            <img src={f.image} alt="" className={`wp-a-${f.anim}`} style={st.img} />
          </span>
        );
      })}
    </div>
  );
}
