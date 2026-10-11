import React, { useRef } from 'react';
import { useOS, ACCENTS, THEME_PRESETS } from '../../os/state.jsx';
import { WALLPAPERS, FITS, POSITIONS } from '../../os/wallpapers.js';
import { PERSONAS } from '../../os/personas.js';
import { DEFAULTS, PRESET_NAMES, mergeParams } from '../../os/waterfx.js';

// Uploaded wallpapers are data URLs in localStorage — cap them so the theme
// key can never blow past quota (2.5MB compressed-ish JPEG territory).
const MAX_UPLOAD = 2.5 * 1024 * 1024;

const CATS = ['All', ...new Set(WALLPAPERS.map((w) => w.cat))];
const presetLabel = (id) => id.replace(/\b\w/g, (ch) => ch.toUpperCase());

export default function Appearance() {
  const os = useOS();
  const t = os.theme;
  const [cat, setCat] = React.useState('All');
  const [q, setQ] = React.useState('');
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
  const isFx = t.wallpaper.startsWith('fx:');
  const isWater = t.wallpaper === 'fx:water';
  // every water control writes a validated patch — mergeParams against the
  // DEFAULTS tree drops unknown keys/types, so a slider can never put
  // garbage into the persisted theme (and a partial stored patch — older
  // shape — normalizes to a full tree on the first edit instead of
  // silently dropping edits to groups it doesn't carry)
  const patchWater = (group, kv) =>
    os.setTheme({ water: mergeParams(DEFAULTS, { ...t.water, [group]: kv }) });
  const needle = q.trim().toLowerCase();
  const list = WALLPAPERS.filter((w) => (cat === 'All' || w.cat === cat)
    && (!needle
      || w.label.toLowerCase().includes(needle)
      || w.cat.toLowerCase().includes(needle)));

  return (
    <>
      <section>
        <h3>Persona</h3>
        <p className="dim" style={{ marginTop: -6 }}>
          The overall desktop skin. Applying one sets its theme, accent and taskbar
          side — everything stays adjustable afterwards.
        </p>
        <div className="seg-row" role="radiogroup" aria-label="OS persona">
          {PERSONAS.map((p) => (
            <button
              key={p.id}
              role="radio" aria-checked={os.persona === p.id}
              className={`chip ${os.persona === p.id ? 'on' : ''}`}
              onClick={() => os.setPersona(p.id)}
              title={p.tagline}
            >{p.label}</button>
          ))}
        </div>
      </section>

      <section>
        <h3>Interface</h3>
        <div className="row">
          <label className="dim" htmlFor="set-scale">UI scale</label>
          <input
            id="set-scale" type="range" min="0.85" max="1.25" step="0.05" aria-label="UI scale"
            value={os.ui.scale ?? 1}
            onChange={(e) => os.setUi({ scale: Number(e.target.value) })}
          />
          <span className="dim" style={{ minWidth: 38, textAlign: 'right' }}>{Math.round((os.ui.scale ?? 1) * 100)}%</span>
        </div>
        <div className="row">
          <label className="dim" htmlFor="set-transparency">Transparency</label>
          <input
            id="set-transparency" type="range" min="0.5" max="1.2" step="0.05" aria-label="Transparency strength"
            value={os.ui.transparency ?? 1}
            onChange={(e) => os.setUi({ transparency: Number(e.target.value) })}
          />
          <span className="dim" style={{ minWidth: 38, textAlign: 'right' }}>{Math.round((os.ui.transparency ?? 1) * 100)}%</span>
        </div>
        <div className="row">
          <span className="dim">Corner radius</span>
          <div className="seg-row" role="radiogroup" aria-label="Corner radius">
            {[['', 'Persona default'], ['8px', 'Small'], ['12px', 'Medium'], ['18px', 'Large']].map(([v, label]) => (
              <button
                key={v || 'auto'}
                role="radio" aria-checked={(os.ui.radius || '') === v}
                className={`chip ${(os.ui.radius || '') === v ? 'on' : ''}`}
                onClick={() => os.setUi({ radius: v })}
              >{label}</button>
            ))}
          </div>
        </div>
        <label className="check-row">
          <input type="checkbox" checked={os.ui.anim !== false} onChange={() => os.setUi({ anim: os.ui.anim === false })} />
          Animations (window open, popups, taskbar slide)
        </label>
      </section>

      <section>
        <h3>Window chrome</h3>
        <p className="dim" style={{ marginTop: -6 }}>
          “Persona default” follows the current OS persona (macOS puts buttons on
          the left, GNOME centers the title, tiling WMs drop the shadow…).
        </p>
        <div className="row">
          <span className="dim">Window buttons</span>
          <div className="seg-row" role="radiogroup" aria-label="Window button side">
            {[['', 'Persona default'], ['left', 'Left'], ['right', 'Right']].map(([v, label]) => (
              <button
                key={v || 'auto'}
                role="radio" aria-checked={(os.ui.tbSide || '') === v}
                className={`chip ${(os.ui.tbSide || '') === v ? 'on' : ''}`}
                onClick={() => os.setUi({ tbSide: v })}
              >{label}</button>
            ))}
          </div>
        </div>
        <div className="row">
          <span className="dim">Title alignment</span>
          <div className="seg-row" role="radiogroup" aria-label="Title alignment">
            {[['', 'Persona default'], ['left', 'Left'], ['center', 'Center']].map(([v, label]) => (
              <button
                key={v || 'auto'}
                role="radio" aria-checked={(os.ui.titleAlign || '') === v}
                className={`chip ${(os.ui.titleAlign || '') === v ? 'on' : ''}`}
                onClick={() => os.setUi({ titleAlign: v })}
              >{label}</button>
            ))}
          </div>
        </div>
        <div className="row">
          <span className="dim">Interface font</span>
          <div className="seg-row" role="radiogroup" aria-label="Interface font">
            {[['', 'Persona default'], ['rounded', 'Rounded'], ['mono', 'Mono'], ['serif', 'Serif']].map(([v, label]) => (
              <button
                key={v || 'auto'}
                role="radio" aria-checked={(os.ui.font || '') === v}
                className={`chip ${(os.ui.font || '') === v ? 'on' : ''}`}
                onClick={() => os.setUi({ font: v })}
              >{label}</button>
            ))}
          </div>
        </div>
        <div className="row">
          <span className="dim">Window shadow</span>
          <div className="seg-row" role="radiogroup" aria-label="Window shadow">
            {[['', 'Persona default'], ['off', 'Off'], ['soft', 'Soft'], ['deep', 'Deep']].map(([v, label]) => (
              <button
                key={v || 'auto'}
                role="radio" aria-checked={(os.ui.shadow || '') === v}
                className={`chip ${(os.ui.shadow || '') === v ? 'on' : ''}`}
                onClick={() => os.setUi({ shadow: v })}
              >{label}</button>
            ))}
          </div>
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
        <div className="row">
          <input
            type="search"
            placeholder="Search wallpapers…"
            aria-label="Search wallpapers"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
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
          {list.map((w) => {
            // three wallpaper kinds: CSS art presets, bundled photos, live FX
            const val = w.fx ? w.id : (w.img || w.css);
            const active = t.wallpaper === val;
            const preview = w.img
              ? { backgroundImage: `url(${w.img})`, backgroundSize: 'cover', backgroundPosition: 'center' }
              : { background: w.css };
            return (
              <button
                key={w.id}
                className={`preset ${active ? 'on' : ''}`}
                onClick={() => os.setTheme({ wallpaper: val, fit: 'fill' })}
                title={`${w.label} (${w.cat})${w.fx ? ' — animated, pointer parallax' : ''}`}
              >
                <span className="preset-preview" style={preview} />
                {w.label}
              </button>
            );
          })}
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
        {isFx && (
          <div className="wx-adj">
            <div className="row">
              <label className="dim" htmlFor="fx-speed">Animation speed</label>
              <input
                id="fx-speed" type="range" min="0.25" max="3" step="0.25"
                value={t.fxSpeed ?? 1}
                onChange={(e) => os.setTheme({ fxSpeed: Number(e.target.value) })}
                aria-label="Wallpaper animation speed"
              />
              <span className="dim" style={{ minWidth: 40, textAlign: 'right' }}>{t.fxSpeed ?? 1}×</span>
            </div>
          </div>
        )}
        {isWater && (
          <div className="wx-adj">
            <div className="row">
              <span className="dim">Look</span>
              <div className="seg-row" role="radiogroup" aria-label="Water look preset">
                <button
                  role="radio" aria-checked={!t.waterPreset}
                  className={`chip ${!t.waterPreset ? 'on' : ''}`}
                  onClick={() => os.setTheme({ waterPreset: '' })}
                >Custom</button>
                {PRESET_NAMES.map((id) => (
                  <button
                    key={id}
                    role="radio" aria-checked={t.waterPreset === id}
                    className={`chip ${t.waterPreset === id ? 'on' : ''}`}
                    onClick={() => os.setTheme({ waterPreset: id })}
                    title={`“${presetLabel(id)}” look — overrides matching custom knobs`}
                  >{presetLabel(id)}</button>
                ))}
              </div>
            </div>
            <div className="row">
              <span className="dim">Colors</span>
              <input
                type="color" value={t.water?.bg?.colorA || DEFAULTS.bg.colorA}
                onChange={(e) => patchWater('bg', { colorA: e.target.value })}
                aria-label="Water background color A"
              />
              <input
                type="color" value={t.water?.bg?.colorB || DEFAULTS.bg.colorB}
                onChange={(e) => patchWater('bg', { colorB: e.target.value })}
                aria-label="Water background color B"
              />
            </div>
            <div className="row">
              <label className="dim" htmlFor="water-angle">Gradient angle</label>
              <input
                id="water-angle" type="range" min="0" max="360" step="5"
                value={t.water?.bg?.angle ?? DEFAULTS.bg.angle}
                onChange={(e) => patchWater('bg', { angle: Number(e.target.value) })}
                aria-label="Water gradient angle"
              />
              <span className="dim" style={{ minWidth: 40, textAlign: 'right' }}>{t.water?.bg?.angle ?? DEFAULTS.bg.angle}°</span>
            </div>
            <div className="row">
              <label className="dim" htmlFor="water-wavespeed">Wave speed</label>
              <input
                id="water-wavespeed" type="range" min="0.1" max="3" step="0.05"
                value={t.water?.water?.waveSpeed ?? DEFAULTS.water.waveSpeed}
                onChange={(e) => patchWater('water', { waveSpeed: Number(e.target.value) })}
                aria-label="Water wave speed"
              />
            </div>
            <div className="row">
              <label className="dim" htmlFor="water-ripple">Ripple reach</label>
              <input
                id="water-ripple" type="range" min="0.005" max="0.12" step="0.005"
                value={t.water?.water?.rippleRadius ?? DEFAULTS.water.rippleRadius}
                onChange={(e) => patchWater('water', { rippleRadius: Number(e.target.value) })}
                aria-label="Cursor ripple radius"
              />
              <label className="dim" htmlFor="water-ripplestr">force</label>
              <input
                id="water-ripplestr" type="range" min="0.05" max="2" step="0.05"
                value={t.water?.water?.rippleStrength ?? DEFAULTS.water.rippleStrength}
                onChange={(e) => patchWater('water', { rippleStrength: Number(e.target.value) })}
                aria-label="Cursor ripple strength"
              />
            </div>
            <div className="row">
              <label className="dim" htmlFor="water-distort">Refraction</label>
              <input
                id="water-distort" type="range" min="0" max="1.5" step="0.05"
                value={t.water?.optics?.distortion ?? DEFAULTS.optics.distortion}
                onChange={(e) => patchWater('optics', { distortion: Number(e.target.value) })}
                aria-label="Water refraction strength"
              />
              <label className="dim" htmlFor="water-turb">sway</label>
              <input
                id="water-turb" type="range" min="0" max="1" step="0.05"
                value={t.water?.optics?.turbulence ?? DEFAULTS.optics.turbulence}
                onChange={(e) => patchWater('optics', { turbulence: Number(e.target.value) })}
                aria-label="Water ambient sway"
              />
            </div>
            <label className="check-row">
              <input
                type="checkbox" aria-label="Ambient rain drops"
                checked={!!t.water?.water?.rain}
                onChange={(e) => patchWater('water', { rain: e.target.checked })}
              />
              Ambient rain drops
            </label>
            {!!t.water?.water?.rain && (
              <div className="row">
                <label className="dim" htmlFor="water-rainrate">Rain rate</label>
                <input
                  id="water-rainrate" type="range" min="0.5" max="12" step="0.5"
                  value={t.water?.water?.rainRate ?? DEFAULTS.water.rainRate}
                  onChange={(e) => patchWater('water', { rainRate: Number(e.target.value) })}
                  aria-label="Rain drops per second"
                />
                <span className="dim" style={{ minWidth: 52, textAlign: 'right' }}>{t.water?.water?.rainRate ?? DEFAULTS.water.rainRate}/s</span>
              </div>
            )}
            <div className="row">
              <label className="dim" htmlFor="water-bright">Brightness</label>
              <input
                id="water-bright" type="range" min="0.5" max="1.5" step="0.05"
                value={t.water?.grade?.brightness ?? DEFAULTS.grade.brightness}
                onChange={(e) => patchWater('grade', { brightness: Number(e.target.value) })}
                aria-label="Water brightness"
              />
              <label className="dim" htmlFor="water-vig">vignette</label>
              <input
                id="water-vig" type="range" min="0" max="1" step="0.05"
                value={t.water?.overlay?.vignette ?? DEFAULTS.overlay.vignette}
                onChange={(e) => patchWater('overlay', { vignette: Number(e.target.value) })}
                aria-label="Water vignette"
              />
            </div>
            <div className="row">
              <button
                className="btn slim"
                onClick={() => os.setTheme({ water: undefined, waterPreset: '' })}
              >
                Reset water settings
              </button>
            </div>
          </div>
        )}
        {isCustom ? (
          <div className="wx-adj">
            <div className="row">
              <span className="dim">Placement</span>
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
                <span className="dim">Focus</span>
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
              <label className="dim" htmlFor="wp-dim">Dim overlay</label>
              <input
                id="wp-dim"
                type="range" min="0" max="1" step="0.05"
                value={1 - t.dim}
                onChange={(e) => os.setTheme({ dim: 1 - Number(e.target.value) })}
              />
            </div>
            <div className="row">
              <label className="dim" htmlFor="wp-bright">Brightness</label>
              <input
                id="wp-bright"
                type="range" min="0.3" max="1.4" step="0.05"
                value={t.bright ?? 1}
                onChange={(e) => os.setTheme({ bright: Number(e.target.value) })}
              />
            </div>
            <div className="row">
              <label className="dim" htmlFor="wp-blur">Blur</label>
              <input
                id="wp-blur"
                type="range" min="0" max="20" step="1"
                value={t.blur ?? 0}
                onChange={(e) => os.setTheme({ blur: Number(e.target.value) })}
              />
            </div>
            <div className="row">
              <label className="dim" htmlFor="wp-sat">Saturation</label>
              <input
                id="wp-sat"
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
        <p className="dim">Bundled photos are CC-licensed (docs/ATTRIBUTION.md); CSS packs and FX wallpapers are drawn in code. Custom uploads stay in this browser’s local storage (≤ 2.5 MB) — nothing is sent anywhere.</p>
      </section>
    </>
  );
}
