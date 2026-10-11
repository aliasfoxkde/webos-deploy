import React, { useEffect, useRef, useState } from 'react';
import { useOS } from './state.jsx';
import {
  LENS_TB_ID, LENS_MENU_ID, lensMap, lensScale, lensKey, lensSupported,
} from './lens.js';

/* LG4 — Chromium refraction (docs/planning/webos-apps/LIQUID-GLASS.md §5).
   One persistent <filter> per instrumented surface; the displacement map is
   regenerated (debounced) whenever the measured surface changes size and
   swapped into the filter in place, so CSS can reference the ids statically
   (body[data-lens] rules in styles.css). Pure progressive enhancement:
   engines without SVG-in-backdrop-filter keep the LG1 frost — the attribute
   never engages, the filters never render. */

// Encode a lens map as a PNG data URL for <feImage href>.
const mapUrl = ({ width, height, data }) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(new ImageData(data, width, height), 0, 0);
  return canvas.toDataURL('image/png');
};

// id → the element id this filter refracts
const surfaceEl = (id) => document.getElementById(id === LENS_TB_ID ? 'taskbar' : 'start-menu');

export default function LensFilters() {
  const os = useOS();
  const glass = os.persona === 'win' || os.persona === 'mac';
  const [maps, setMaps] = useState({}); // { [filterId]: { url, scale } }
  const timers = useRef(Object.create(null));

  const supported = lensSupported();

  useEffect(() => {
    if (!glass || !supported) return undefined;

    const pending = timers.current; // stable for the effect's lifetime
    const observers = new Set();
    let menuRo = null;

    const build = (id, el) => {
      const rect = el.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (!w || !h) return;
      const r = parseFloat(getComputedStyle(el).borderRadius) || 8;
      const key = lensKey(w, h, r);
      if (el.dataset.lensKey === key) return;
      el.dataset.lensKey = key;
      setMaps((m) => ({ ...m, [id]: { url: mapUrl(lensMap(w, h, r)), scale: lensScale() } }));
    };
    const attach = (id) => {
      const el = surfaceEl(id);
      if (!el) return null;
      build(id, el);
      const ro = new ResizeObserver(() => {
        clearTimeout(pending[id]);
        pending[id] = setTimeout(() => build(id, el), 150);
      });
      ro.observe(el);
      observers.add(ro);
      return ro;
    };
    // Re-attach the start-menu observer whenever it mounts (StartMenu
    // renders null while closed; the last-built filter persists).
    const mo = new MutationObserver(() => {
      if (menuRo || !surfaceEl(LENS_MENU_ID)) return;
      menuRo = attach(LENS_MENU_ID);
    });

    attach(LENS_TB_ID);
    if (surfaceEl(LENS_MENU_ID)) menuRo = attach(LENS_MENU_ID);
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      mo.disconnect();
      observers.forEach((ro) => ro.disconnect());
      Object.values(pending).forEach(clearTimeout);
      if (menuRo) menuRo.disconnect();
      delete document.body.dataset.lens;
    };
  }, [glass, supported]);

  // Engage the CSS only once at least one filter carries a map, so the
  // url(#…) reference never dangles.
  useEffect(() => {
    if (Object.keys(maps).length) document.body.dataset.lens = 'on';
  }, [maps]);

  if (!glass || !supported || !Object.keys(maps).length) return null;
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute' }}>
      <defs>
        {Object.entries(maps).map(([id, m]) => (
          <filter key={id} id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feImage href={m.url} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={m.scale} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        ))}
      </defs>
    </svg>
  );
}
