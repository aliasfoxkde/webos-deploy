import React from 'react';
import { useOS, ACCENTS, THEME_PRESETS } from '../os/state.jsx';

/* Personalization: accent color, theme preset, wallpaper presets (CSS art)
   or a custom image URL, plus dimming for photo wallpapers. */

const WALLPAPERS = [
  { id: '', label: 'Theme default', css: '' },
  { id: 'aurora', label: 'Aurora', css: 'radial-gradient(900px 600px at 20% 20%, rgba(52,211,153,0.35), transparent 60%), radial-gradient(1000px 700px at 80% 30%, rgba(56,189,248,0.30), transparent 60%), radial-gradient(900px 700px at 50% 90%, rgba(167,139,250,0.30), transparent 60%), linear-gradient(160deg, #07101c, #04070d 75%)' },
  { id: 'ember', label: 'Ember', css: 'radial-gradient(1000px 700px at 75% 75%, rgba(251,146,60,0.35), transparent 60%), radial-gradient(800px 600px at 20% 20%, rgba(244,114,182,0.22), transparent 60%), linear-gradient(160deg, #170c08, #0a0404 75%)' },
  { id: 'grid', label: 'Blueprint', css: 'repeating-linear-gradient(0deg, rgba(56,189,248,0.10) 0 1px, transparent 1px 40px), repeating-linear-gradient(90deg, rgba(56,189,248,0.10) 0 1px, transparent 1px 40px), radial-gradient(1000px 700px at 70% 20%, rgba(56,189,248,0.15), transparent 60%), linear-gradient(160deg, #0a1420, #05090f 75%)' },
  { id: 'mint', label: 'Mint', css: 'radial-gradient(1000px 700px at 25% 25%, rgba(163,230,53,0.25), transparent 60%), radial-gradient(900px 600px at 80% 80%, rgba(45,212,191,0.25), transparent 60%), linear-gradient(160deg, #0a1610, #050b08 75%)' },
];

export default function Settings() {
  const os = useOS();
  const t = os.theme;

  return (
    <div className="settings">
      <h2>Settings</h2>

      <section>
        <h3>Accent color</h3>
        <div className="swatches">
          {ACCENTS.map((c) => (
            <button
              key={c}
              className={`swatch ${t.accent === c ? 'on' : ''}`}
              style={{ background: c }}
              onClick={() => os.setTheme({ accent: c })}
              aria-label={`accent ${c}`}
            />
          ))}
          <input
            type="color"
            value={t.accent}
            onChange={(e) => os.setTheme({ accent: e.target.value })}
            title="Custom accent"
          />
        </div>
      </section>

      <section>
        <h3>Theme</h3>
        <div className="preset-row">
          {Object.entries(THEME_PRESETS).map(([id, p]) => (
            <button
              key={id}
              className={`preset ${t.preset === id && !t.wallpaper ? 'on' : ''}`}
              onClick={() => os.setTheme({ preset: id, wallpaper: '' })}
            >
              <span className="preset-preview" style={{ background: p.bg, color: p.text }}>
                <i style={{ background: t.accent }} />
              </span>
              {p.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>Wallpaper</h3>
        <div className="preset-row">
          {WALLPAPERS.map((w) => {
            const on = w.id === '' ? t.wallpaper === '' : t.wallpaper === w.css;
            return (
              <button
                key={w.id}
                className={`preset ${on ? 'on' : ''}`}
                onClick={() => os.setTheme({ wallpaper: w.css })}
              >
                <span className="preset-preview" style={{ background: w.css || THEME_PRESETS[t.preset]?.bg }} />
                {w.label}
              </button>
            );
          })}
        </div>
        <div className="row">
          <input
            type="url"
            placeholder="…or paste an image URL"
            value={t.wallpaper?.startsWith('http') ? t.wallpaper : ''}
            onChange={(e) => os.setTheme({ wallpaper: e.target.value })}
          />
        </div>
        {t.wallpaper?.startsWith('http') ? (
          <div className="row">
            <label className="dim">Dim image</label>
            <input
              type="range" min="0" max="1" step="0.05"
              value={1 - t.dim}
              onChange={(e) => os.setTheme({ dim: 1 - Number(e.target.value) })}
            />
          </div>
        ) : null}
      </section>

      <section>
        <h3>System</h3>
        <div className="row">
          <button className="btn" onClick={() => { Object.keys(localStorage).filter((k) => k.startsWith('webos.')).forEach((k) => localStorage.removeItem(k)); location.reload(); }}>
            Reset WebOS data
          </button>
          <span className="dim">{os.apps.length} apps installed · {os.windows.length} windows open</span>
        </div>
      </section>
    </div>
  );
}
