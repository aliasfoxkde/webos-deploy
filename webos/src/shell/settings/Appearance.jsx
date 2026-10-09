import React, { useRef } from 'react';
import { useOS, ACCENTS, THEME_PRESETS } from '../../os/state.jsx';
import { WALLPAPERS, FITS, POSITIONS } from '../../os/wallpapers.js';

// Uploaded wallpapers are data URLs in localStorage — cap them so the theme
// key can never blow past quota (2.5MB compressed-ish JPEG territory).
const MAX_UPLOAD = 2.5 * 1024 * 1024;

const CATS = ['All', ...new Set(WALLPAPERS.map((w) => w.cat))];

export default function Appearance() {
  const os = useOS();
  const t = os.theme;
  const [cat, setCat] = React.useState('All');
  const fileRef = useRef(null);

  const onUpload = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_UPLOAD) {
      alert(`Image too large (${(file.size / 1048576).toFixed(1)} MB) — keep wallpapers under ${MAX_UPLOAD / 1048576} MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => os.setTheme({ wallpaper: String(reader.result) });
    reader.readAsDataURL(file);
  };

  const isCustom = t.wallpaper.startsWith('http') || t.wallpaper.startsWith('data:');
  const list = WALLPAPERS.filter((w) => cat === 'All' || w.cat === cat);

  return (
    <>
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
        <h3>Wallpaper</h3>
        <div className="store-cats" style={{ marginBottom: 10 }}>
          {CATS.map((c) => (
            <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
        <div className="preset-row">
          <button
            className={`preset ${t.wallpaper === '' ? 'on' : ''}`}
            onClick={() => os.setTheme({ wallpaper: '' })}
          >
            <span className="preset-preview" style={{ background: THEME_PRESETS[t.preset]?.bg }}>
              <i style={{ background: t.accent }} />
            </span>
            Theme default
          </button>
          {list.map((w) => (
            <button
              key={w.id}
              className={`preset ${t.wallpaper === w.css ? 'on' : ''}`}
              onClick={() => os.setTheme({ wallpaper: w.css })}
              title={`${w.label} (${w.cat})`}
            >
              <span className="preset-preview" style={{ background: w.css }} />
              {w.label}
            </button>
          ))}
        </div>
        <div className="row">
          <input
            type="url"
            placeholder="…or paste an image URL"
            value={t.wallpaper.startsWith('http') ? t.wallpaper : ''}
            onChange={(e) => os.setTheme({ wallpaper: e.target.value })}
          />
          <button className="btn" onClick={() => fileRef.current?.click()}>Upload…</button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onUpload} />
        </div>
        {isCustom ? (
          <div className="wx-adj">
            <div className="row">
              <label className="dim">Placement</label>
              <div className="seg-row">
                {Object.entries(FITS).map(([id, f]) => (
                  <button
                    key={id}
                    className={`chip ${(t.fit || 'fill') === id ? 'on' : ''}`}
                    onClick={() => os.setTheme({ fit: id })}
                    title={f.label}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            {t.fit !== 'tile' && (
              <div className="row">
                <label className="dim">Focus</label>
                <div className="pos-grid" role="group" aria-label="Image focus point">
                  {POSITIONS.map((p) => (
                    <button
                      key={p}
                      className={`pos-dot ${(t.pos || 'center center') === p ? 'on' : ''}`}
                      onClick={() => os.setTheme({ pos: p })}
                      aria-label={`focus ${p}`}
                      title={p}
                    />
                  ))}
                </div>
              </div>
            )}
            <div className="row">
              <label className="dim">Dim overlay</label>
              <input
                type="range" min="0" max="1" step="0.05"
                value={1 - t.dim}
                onChange={(e) => os.setTheme({ dim: 1 - Number(e.target.value) })}
              />
            </div>
            <div className="row">
              <label className="dim">Brightness</label>
              <input
                type="range" min="0.3" max="1.4" step="0.05"
                value={t.bright ?? 1}
                onChange={(e) => os.setTheme({ bright: Number(e.target.value) })}
              />
            </div>
            <div className="row">
              <label className="dim">Blur</label>
              <input
                type="range" min="0" max="20" step="1"
                value={t.blur ?? 0}
                onChange={(e) => os.setTheme({ blur: Number(e.target.value) })}
              />
            </div>
            <div className="row">
              <label className="dim">Saturation</label>
              <input
                type="range" min="0" max="2" step="0.1"
                value={t.sat ?? 1}
                onChange={(e) => os.setTheme({ sat: Number(e.target.value) })}
              />
            </div>
            <div className="row">
              <button className="btn slim" onClick={() => os.setTheme({ fit: 'fill', pos: 'center center', dim: 1, bright: 1, blur: 0, sat: 1 })}>
                Reset adjustments
              </button>
              <button className="btn slim danger" onClick={() => os.setTheme({ wallpaper: '' })}>Clear wallpaper</button>
            </div>
          </div>
        ) : null}
        <p className="dim">Every preset wallpaper is drawn in CSS — no image assets, no third-party requests. Uploads stay in this browser’s local storage (≤ 2.5 MB).</p>
      </section>
    </>
  );
}
