import React, { useRef } from 'react';
import { useOS, ACCENTS, THEME_PRESETS } from '../../os/state.jsx';
import {
  deriveTheme, draftFromTheme, newThemeId, resolveTheme,
  searchPacks, packToUserTheme, THEME_PACKS, contrast, mix,
} from '../../os/themes.js';
import {
  BASE_KINDS, PATTERN_KINDS, EFFECT_KINDS, FLOAT_ANIMS, MAX_FLOATS,
  newCompositeId,
} from '../../os/wpcompose.js';
import CompositeWallpaper from '../CompositeWallpaper.jsx';
import { WALLPAPERS, FITS, POSITIONS } from '../../os/wallpapers.js';
import { PERSONAS } from '../../os/personas.js';
import { DEFAULTS, PRESET_NAMES, mergeParams } from '../../os/waterfx.js';

// Uploaded wallpapers are data URLs in localStorage — cap them so the theme
// key can never blow past quota (2.5MB compressed-ish JPEG territory).
const MAX_UPLOAD = 2.5 * 1024 * 1024;

const CATS = ['All', ...new Set(WALLPAPERS.map((w) => w.cat))];
const presetLabel = (id) => id.replace(/\b\w/g, (ch) => ch.toUpperCase());

/* Wallpaper studio chip labels + upload limits (data-URL chars ≈ 4/3 ×
   bytes; both sit under the pure caps in os/wpcompose.js). */
const BASE_LABELS = { theme: 'Theme colors', color: 'Solid color', gradient: 'Gradient', image: 'Image' };
const PATTERN_LABELS = { none: 'No pattern', dots: 'Dots', grid: 'Grid', stripes: 'Stripes', checker: 'Checkers', diagonal: 'Diagonal', cross: 'Cross' };
const EFFECT_LABELS = { none: 'No effect', vignette: 'Vignette', glow: 'Glow', scanlines: 'Scanlines', grain: 'Grain' };
const ANIM_LABELS = { none: 'Still', float: 'Float', drift: 'Drift', pulse: 'Pulse', spin: 'Spin' };
const MAX_BASE_FILE = 1.6 * 1024 * 1024; // ≈ 2.13 MB as a data URL
const MAX_FLOAT_FILE = 700 * 1024;       // ≈ 0.93 MB as a data URL

export default function Appearance() {
  const os = useOS();
  const t = os.theme;
  const [cat, setCat] = React.useState('All');
  const [q, setQ] = React.useState('');
  const [draft, setDraft] = React.useState(null); // theme-builder fields when open
  const [pack, setPack] = React.useState('all');
  const [pq, setPq] = React.useState('');
  const [wpDraft, setWpDraft] = React.useState(null); // composite draft when open
  const [floatUrl, setFloatUrl] = React.useState('');
  const fileRef = useRef(null);
  const wpFileRef = useRef(null);
  const floatFileRef = useRef(null);

  /* ---- theme builder ----
     Draft fields derive live through deriveTheme — the preview and the
     contrast chips are the same math the desktop renders with. */
  const derived = draft ? deriveTheme(draft) : null;
  const startNew = () => {
    // seed from the active look so "New theme" starts somewhere familiar
    const base = resolveTheme(t.preset, os.userThemes);
    setDraft({ ...draftFromTheme({ ...base, accent: t.accent }), id: null, name: 'My theme' });
  };
  const startEdit = (u) => setDraft({
    id: u.id, name: u.name, paper: u.paper, text: u.text, dim: u.dim,
    accent: u.accent, chromeA: u.chromeA, lineA: u.lineA,
    glowA: u.glowA, glowB: u.glowB, glow: u.glow, angle: u.angle,
  });
  const saveDraft = () => {
    const name = draft.name.trim().slice(0, 40) || 'Untitled theme';
    const id = draft.id || newThemeId(name, os.userThemes.map((x) => x.id));
    os.themeSave({ ...draft, id, name });
    setDraft(null);
  };
  const ratioLabel = (ratio) => (ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : 'low');

  /* ---- wallpaper studio ----
     A composite draft edits the same spec shape wpcompose.js stores; the
     preview is the real CompositeWallpaper component, so what you see is
     what the desktop renders. wpSave normalizes — hostile values clamp or
     drop at the pure boundary. */
  const startWpNew = () => setWpDraft({
    id: null,
    name: 'My wallpaper',
    base: { kind: 'gradient', angle: 160, stops: [{ color: '#38bdf8', at: 0 }, { color: '#0b0e14', at: 100 }] },
    pattern: { kind: 'dots', size: 32, color: '#ffffff', opacity: 0.08 },
    effect: { kind: 'vignette', strength: 0.5, color: '#38bdf8' },
    floats: [],
  });
  const startWpEdit = (c) => setWpDraft(JSON.parse(JSON.stringify(c))); // deep copy — edits stay draft-local
  const patchWp = (patch) => setWpDraft({ ...wpDraft, ...patch });
  const patchBase = (patch) => setWpDraft({ ...wpDraft, base: { ...wpDraft.base, ...patch } });
  const patchPattern = (patch) => setWpDraft({ ...wpDraft, pattern: { ...wpDraft.pattern, ...patch } });
  const patchEffect = (patch) => setWpDraft({ ...wpDraft, effect: { ...wpDraft.effect, ...patch } });
  const saveWp = () => {
    const name = wpDraft.name.trim().slice(0, 40) || 'Untitled wallpaper';
    const id = wpDraft.id || newCompositeId(name, os.composites.map((x) => x.id));
    os.wpSave({ ...wpDraft, id, name });
    setWpDraft(null);
  };
  const addStop = () => {
    const stops = wpDraft.base.stops;
    const last = stops[stops.length - 1];
    const prev = stops[stops.length - 2] || last;
    patchBase({
      stops: [...stops, {
        color: mix(prev.color, last.color, 0.5),
        at: Math.min(100, Math.round((prev.at + last.at) / 2 + (last.at >= 100 ? -5 : 0))),
      }],
    });
  };
  const setStop = (i, key, value) => {
    patchBase({ stops: wpDraft.base.stops.map((s, j) => (j === i ? { ...s, [key]: value } : s)) });
  };
  const addFloat = (image) => {
    if (wpDraft.floats.length >= MAX_FLOATS) return;
    patchWp({
      floats: [...wpDraft.floats, {
        id: `fl-${Date.now().toString(36)}`, image, x: 72, y: 30, scale: 1, opacity: 1, anim: 'float', speed: 1,
      }],
    });
    setFloatUrl('');
  };
  const addFloatUrl = () => {
    const url = floatUrl.trim();
    if (/^https?:\/\//.test(url) || /^data:image\//.test(url)) addFloat(url);
  };
  const readImage = (file, limit, cb) => {
    if (!file) return;
    if (file.size > limit) {
      alert(`Image too large (${(file.size / 1048576).toFixed(1)} MB) — keep it under ${(limit / 1048576).toFixed(2)} MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => cb(String(reader.result));
    reader.readAsDataURL(file);
  };
  const patchFloat = (id, patch) => {
    patchWp({ floats: wpDraft.floats.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
  };
  // the active theme's derived background — base kind "theme colors" rides it
  const activeTheme = resolveTheme(t.preset, os.userThemes);

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
          {os.userThemes.map((u) => {
            const r = resolveTheme(u.id, os.userThemes);
            return (
              <span key={u.id} className={`preset user ${t.preset === u.id ? 'on' : ''}`}>
                <button
                  type="button"
                  className="preset-hit"
                  onClick={() => os.setTheme({ preset: u.id, wallpaper: '' })}
                  title={`Apply “${u.name}”`}
                >
                  <span className="preset-preview" style={{ background: r.bg, color: r.text }}>
                    <i style={{ background: u.accent }} />
                  </span>
                  {u.name}
                </button>
                <button
                  type="button"
                  className="preset-edit"
                  aria-label={`Edit theme ${u.name}`}
                  title={`Edit “${u.name}”`}
                  onClick={() => startEdit(u)}
                >✎</button>
              </span>
            );
          })}
          <button
            type="button" className="preset new-theme"
            onClick={startNew} aria-label="New theme"
            title="Compose a new theme from the current look"
          >
            <span className="preset-preview new-mark" aria-hidden="true">＋</span>
            New theme
          </button>
        </div>
      </section>

      {draft && derived && (
        <section className="theme-builder" role="group" aria-label="Theme builder">
          <h3>{draft.id ? 'Edit theme' : 'New theme'}</h3>
          <div className="th-grid">
            <div className="th-fields">
              <div className="row">
                <label className="dim" htmlFor="th-name">Name</label>
                <input
                  id="th-name" type="text" maxLength={40} value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  aria-label="Theme name"
                />
              </div>
              {[['paper', 'Paper'], ['text', 'Text'], ['dim', 'Dim text'], ['accent', 'Accent'], ['glowA', 'Glow A'], ['glowB', 'Glow B']].map(([key, label]) => (
                <div className="row" key={key}>
                  <label className="dim" htmlFor={`th-${key}`}>{label}</label>
                  <input
                    id={`th-${key}`} type="color" value={draft[key]}
                    onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                    aria-label={`${label} color`}
                  />
                  <span className="dim th-hex">{draft[key]}</span>
                </div>
              ))}
              <div className="row">
                <label className="dim" htmlFor="th-chromea">Chrome opacity</label>
                <input
                  id="th-chromea" type="range" min="0.5" max="0.98" step="0.02" value={draft.chromeA}
                  onChange={(e) => setDraft({ ...draft, chromeA: Number(e.target.value) })}
                  aria-label="Chrome opacity"
                />
                <span className="dim" style={{ minWidth: 38, textAlign: 'right' }}>{Math.round(draft.chromeA * 100)}%</span>
              </div>
              <div className="row">
                <label className="dim" htmlFor="th-linea">Line strength</label>
                <input
                  id="th-linea" type="range" min="0.04" max="0.3" step="0.01" value={draft.lineA}
                  onChange={(e) => setDraft({ ...draft, lineA: Number(e.target.value) })}
                  aria-label="Line strength"
                />
                <span className="dim" style={{ minWidth: 38, textAlign: 'right' }}>{Math.round(draft.lineA * 100)}%</span>
              </div>
              <div className="row">
                <label className="dim" htmlFor="th-glow">Glow strength</label>
                <input
                  id="th-glow" type="range" min="0" max="0.35" step="0.01" value={draft.glow}
                  onChange={(e) => setDraft({ ...draft, glow: Number(e.target.value) })}
                  aria-label="Glow strength"
                />
                <span className="dim" style={{ minWidth: 38, textAlign: 'right' }}>{Math.round(draft.glow * 100)}%</span>
              </div>
              <div className="row">
                <label className="dim" htmlFor="th-angle">Gradient angle</label>
                <input
                  id="th-angle" type="range" min="0" max="360" step="5" value={draft.angle}
                  onChange={(e) => setDraft({ ...draft, angle: Number(e.target.value) })}
                  aria-label="Gradient angle"
                />
                <span className="dim" style={{ minWidth: 38, textAlign: 'right' }}>{Math.round(draft.angle)}°</span>
              </div>
            </div>
            <div className="th-side">
              <div className="th-preview" style={{ background: derived.bg }}>
                <div className="th-win" style={{ background: derived.chrome, borderColor: derived.line }}>
                  <span className="th-title" style={{ color: derived.text }}>
                    <i className="th-dot" style={{ background: derived.accent }} />
                    {draft.name.trim() || 'Untitled theme'}
                  </span>
                  <span style={{ color: derived.text }}>Regular body text</span>
                  <span style={{ color: derived.dim }}>Dimmed secondary text</span>
                </div>
              </div>
              <div className="th-contrast">
                {[['Text', contrast(derived.text, derived.paper)], ['Dim', contrast(derived.dim, derived.paper)], ['Danger', contrast(derived.danger, derived.paper)]].map(([label, ratio]) => (
                  <span
                    key={label}
                    className={`chip th-ratio ${ratio >= 7 ? 'aaa' : ratio >= 4.5 ? 'aa' : 'low'}`}
                    title={`${label} on paper — WCAG contrast`}
                  >
                    {label} {ratio.toFixed(1)}:1 {ratioLabel(ratio)}
                  </span>
                ))}
              </div>
              <div className="row th-actions">
                <button type="button" className="btn" onClick={saveDraft}>{draft.id ? 'Save theme' : 'Create theme'}</button>
                <button type="button" className="btn slim" onClick={() => setDraft(null)}>Cancel</button>
                {draft.id && (
                  <button
                    type="button" className="btn slim danger"
                    onClick={() => { os.themeDelete(draft.id); setDraft(null); }}
                  >Delete</button>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      <section>
        <h3>Theme packs</h3>
        <p className="dim" style={{ marginTop: -6 }}>
          Curated palettes. Applying one copies it into your themes — it stays
          fully editable and survives pack changes.
        </p>
        <div className="row">
          <input
            type="search" placeholder="Search theme packs…" aria-label="Search theme packs"
            value={pq} onChange={(e) => setPq(e.target.value)}
          />
        </div>
        <div className="store-cats" style={{ marginBottom: 10 }}>
          {['all', ...THEME_PACKS.map((p) => p.id)].map((id) => {
            const label = id === 'all' ? 'All' : THEME_PACKS.find((p) => p.id === id).name;
            return (
              <button key={id} className={`chip ${pack === id ? 'on' : ''}`} onClick={() => setPack(id)}>{label}</button>
            );
          })}
        </div>
        <div className="pack-list">
          {searchPacks(pq, pack).map((card) => {
            const r = deriveTheme(card.f);
            const instId = `u-${card.pack}-${card.id}`;
            const active = t.preset === instId;
            const installed = os.userThemes.some((x) => x.id === instId);
            return (
              <div className="pack-card" key={instId}>
                <span className="pack-preview" style={{ background: r.bg }}>
                  <i style={{ background: r.accent }} />
                </span>
                <span className="pack-info">
                  <strong>{card.name}</strong>
                  <span className="dim">{card.packName} · {card.blurb}</span>
                </span>
                <button
                  type="button" className={`btn slim ${active ? '' : ''}`}
                  onClick={() => os.themeSave(packToUserTheme(card))}
                  aria-label={active ? `${card.name} is active` : `Apply theme ${card.name}`}
                  title={installed ? 'Re-apply (refreshes your editable copy)' : 'Copy into your themes and apply'}
                >
                  {active ? 'Active ✓' : installed ? 'Re-apply' : 'Apply'}
                </button>
              </div>
            );
          })}
          {!searchPacks(pq, pack).length && (
            <p className="dim">No pack themes match “{pq.trim()}”.</p>
          )}
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

      <section>
        <h3>Wallpaper studio</h3>
        <p className="dim" style={{ marginTop: -6 }}>
          Compose layered wallpapers: a base (theme colors, solid color,
          multi-stop gradient or image), a pattern overlay, an effect, and up
          to four floating images. Composites stay fully editable.
        </p>
        <div className="preset-row">
          {os.composites.map((c) => {
            const active = t.wallpaper === c.id;
            return (
              <span key={c.id} className={`preset user ${active ? 'on' : ''}`}>
                <button
                  type="button"
                  className="preset-hit"
                  onClick={() => os.setTheme({ wallpaper: c.id })}
                  title={`Apply “${c.name}”`}
                >
                  <span className="preset-preview">
                    <CompositeWallpaper spec={c} themeBg={activeTheme.bg} id={null} className="preset-wp" />
                  </span>
                  {c.name}
                </button>
                <button
                  type="button"
                  className="preset-edit"
                  aria-label={`Edit composite ${c.name}`}
                  title={`Edit “${c.name}”`}
                  onClick={() => startWpEdit(c)}
                >✎</button>
              </span>
            );
          })}
          <button
            type="button" className="preset new-theme"
            onClick={startWpNew} aria-label="New composite"
            title="Compose a layered wallpaper"
          >
            <span className="preset-preview new-mark" aria-hidden="true">＋</span>
            New composite
          </button>
        </div>
      </section>

      {wpDraft && (
        <section className="theme-builder" role="group" aria-label="Wallpaper studio">
          <h3>{wpDraft.id ? 'Edit composite' : 'New composite'}</h3>
          <div className="th-grid">
            <div className="th-fields">
              <div className="row">
                <label className="dim" htmlFor="wp-name">Name</label>
                <input
                  id="wp-name" type="text" maxLength={40} value={wpDraft.name}
                  onChange={(e) => patchWp({ name: e.target.value })}
                  aria-label="Composite name"
                />
              </div>
              <div className="row">
                <span className="dim">Base</span>
                <div className="seg-row" role="radiogroup" aria-label="Composite base kind">
                  {BASE_KINDS.map((k) => (
                    <button
                      key={k} type="button" role="radio" aria-checked={wpDraft.base.kind === k}
                      className={`chip ${wpDraft.base.kind === k ? 'on' : ''}`}
                      onClick={() => patchBase({ kind: k })}
                    >{BASE_LABELS[k]}</button>
                  ))}
                </div>
              </div>
              {wpDraft.base.kind === 'color' && (
                <div className="row">
                  <label className="dim" htmlFor="wp-base-color">Color</label>
                  <input
                    id="wp-base-color" type="color" value={wpDraft.base.color || '#10141c'}
                    onChange={(e) => patchBase({ color: e.target.value })}
                    aria-label="Base color"
                  />
                  <span className="dim th-hex">{wpDraft.base.color || '#10141c'}</span>
                </div>
              )}
              {wpDraft.base.kind === 'gradient' && (
                <div className="wpb-stops">
                  <span className="dim">Gradient stops</span>
                  {wpDraft.base.stops.map((s, i) => (
                    <div className="row" key={i}>
                      <input
                        type="color" value={s.color}
                        onChange={(e) => setStop(i, 'color', e.target.value)}
                        aria-label={`Stop ${i + 1} color`}
                      />
                      <input
                        type="range" min="0" max="100" step="1" value={s.at}
                        onChange={(e) => setStop(i, 'at', Number(e.target.value))}
                        aria-label={`Stop ${i + 1} position`}
                      />
                      <span className="dim th-hex" style={{ minWidth: 34, textAlign: 'right' }}>{Math.round(s.at)}%</span>
                      {wpDraft.base.stops.length > 2 && (
                        <button
                          type="button" className="btn slim"
                          aria-label={`Remove stop ${i + 1}`}
                          onClick={() => patchBase({ stops: wpDraft.base.stops.filter((_, j) => j !== i) })}
                        >✕</button>
                      )}
                    </div>
                  ))}
                  <div className="row">
                    {wpDraft.base.stops.length < 6 && (
                      <button type="button" className="btn slim" onClick={addStop}>Add stop</button>
                    )}
                  </div>
                  <div className="row">
                    <label className="dim" htmlFor="wp-angle">Angle</label>
                    <input
                      id="wp-angle" type="range" min="0" max="360" step="5" value={wpDraft.base.angle}
                      onChange={(e) => patchBase({ angle: Number(e.target.value) })}
                      aria-label="Gradient angle"
                    />
                    <span className="dim" style={{ minWidth: 38, textAlign: 'right' }}>{Math.round(wpDraft.base.angle)}°</span>
                  </div>
                </div>
              )}
              {wpDraft.base.kind === 'image' && (
                <div className="row">
                  <input
                    type="url" placeholder="Base image URL"
                    value={/^https?:\/\//.test(wpDraft.base.image || '') ? wpDraft.base.image : ''}
                    onChange={(e) => patchBase({ image: e.target.value })}
                    aria-label="Base image URL"
                  />
                  <button type="button" className="btn" onClick={() => wpFileRef.current?.click()}>Upload…</button>
                  <input
                    ref={wpFileRef} type="file" accept="image/*" hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      readImage(f, MAX_BASE_FILE, (url) => patchBase({ image: url }));
                    }}
                  />
                </div>
              )}
              <div className="row">
                <span className="dim">Pattern</span>
                <div className="seg-row" role="radiogroup" aria-label="Composite pattern">
                  {PATTERN_KINDS.map((k) => (
                    <button
                      key={k} type="button" role="radio" aria-checked={wpDraft.pattern.kind === k}
                      className={`chip ${wpDraft.pattern.kind === k ? 'on' : ''}`}
                      onClick={() => patchPattern({ kind: k })}
                    >{PATTERN_LABELS[k]}</button>
                  ))}
                </div>
              </div>
              {wpDraft.pattern.kind !== 'none' && (
                <>
                  <div className="row">
                    <label className="dim" htmlFor="wp-psize">Pattern size</label>
                    <input
                      id="wp-psize" type="range" min="8" max="160" step="2" value={wpDraft.pattern.size}
                      onChange={(e) => patchPattern({ size: Number(e.target.value) })}
                      aria-label="Pattern size"
                    />
                    <span className="dim" style={{ minWidth: 44, textAlign: 'right' }}>{Math.round(wpDraft.pattern.size)}px</span>
                  </div>
                  <div className="row">
                    <label className="dim" htmlFor="wp-pcolor">Pattern color</label>
                    <input
                      id="wp-pcolor" type="color" value={wpDraft.pattern.color}
                      onChange={(e) => patchPattern({ color: e.target.value })}
                      aria-label="Pattern color"
                    />
                    <label className="dim" htmlFor="wp-popacity">strength</label>
                    <input
                      id="wp-popacity" type="range" min="0.02" max="0.5" step="0.01" value={wpDraft.pattern.opacity}
                      onChange={(e) => patchPattern({ opacity: Number(e.target.value) })}
                      aria-label="Pattern strength"
                    />
                  </div>
                </>
              )}
              <div className="row">
                <span className="dim">Effect</span>
                <div className="seg-row" role="radiogroup" aria-label="Composite effect">
                  {EFFECT_KINDS.map((k) => (
                    <button
                      key={k} type="button" role="radio" aria-checked={wpDraft.effect.kind === k}
                      className={`chip ${wpDraft.effect.kind === k ? 'on' : ''}`}
                      onClick={() => patchEffect({ kind: k })}
                    >{EFFECT_LABELS[k]}</button>
                  ))}
                </div>
              </div>
              {wpDraft.effect.kind !== 'none' && (
                <div className="row">
                  <label className="dim" htmlFor="wp-estrength">Effect strength</label>
                  <input
                    id="wp-estrength" type="range" min="0.05" max="1" step="0.05" value={wpDraft.effect.strength}
                    onChange={(e) => patchEffect({ strength: Number(e.target.value) })}
                    aria-label="Effect strength"
                  />
                  <span className="dim" style={{ minWidth: 38, textAlign: 'right' }}>{Math.round(wpDraft.effect.strength * 100)}%</span>
                  {wpDraft.effect.kind === 'glow' && (
                    <>
                      <label className="dim" htmlFor="wp-ecolor">color</label>
                      <input
                        id="wp-ecolor" type="color" value={wpDraft.effect.color}
                        onChange={(e) => patchEffect({ color: e.target.value })}
                        aria-label="Glow color"
                      />
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="th-side">
              <div className="wpb-frame">
                <CompositeWallpaper
                  spec={{ ...wpDraft, id: 'wp-preview', name: wpDraft.name.trim() || 'Untitled wallpaper' }}
                  themeBg={activeTheme.bg}
                  id={null}
                  className="wpb-preview"
                />
              </div>
              <div className="row th-actions">
                <button type="button" className="btn" onClick={saveWp}>
                  {wpDraft.id ? 'Save composite' : 'Create composite'}
                </button>
                <button type="button" className="btn slim" onClick={() => setWpDraft(null)}>Cancel</button>
                {wpDraft.id && (
                  <button
                    type="button" className="btn slim danger"
                    onClick={() => { os.wpDelete(wpDraft.id); setWpDraft(null); }}
                  >Delete</button>
                )}
              </div>
            </div>
          </div>
          <div className="wpb-floats">
            <div className="row">
              <span className="dim">Floating images ({wpDraft.floats.length}/{MAX_FLOATS})</span>
              <input
                type="url" placeholder="Image URL…" aria-label="Floating image URL"
                value={floatUrl} onChange={(e) => setFloatUrl(e.target.value)}
              />
              <button type="button" className="btn slim" onClick={addFloatUrl}>Add URL</button>
              <button type="button" className="btn slim" onClick={() => floatFileRef.current?.click()}>Upload…</button>
              <input
                ref={floatFileRef} type="file" accept="image/*" hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  readImage(f, MAX_FLOAT_FILE, addFloat);
                }}
              />
            </div>
            {wpDraft.floats.map((f, i) => (
              <div className="wpb-float" key={f.id}>
                <img src={f.image} alt="" className="wpb-thumb" />
                <div className="wpb-float-grid">
                  <label className="dim" htmlFor={`wp-fx-${i}`}>X</label>
                  <input
                    id={`wp-fx-${i}`} type="range" min="0" max="100" step="1" value={f.x}
                    onChange={(e) => patchFloat(f.id, { x: Number(e.target.value) })}
                    aria-label={`Float ${i + 1} horizontal position`}
                  />
                  <label className="dim" htmlFor={`wp-fy-${i}`}>Y</label>
                  <input
                    id={`wp-fy-${i}`} type="range" min="0" max="100" step="1" value={f.y}
                    onChange={(e) => patchFloat(f.id, { y: Number(e.target.value) })}
                    aria-label={`Float ${i + 1} vertical position`}
                  />
                  <label className="dim" htmlFor={`wp-fs-${i}`}>Scale</label>
                  <input
                    id={`wp-fs-${i}`} type="range" min="0.05" max="3" step="0.05" value={f.scale}
                    onChange={(e) => patchFloat(f.id, { scale: Number(e.target.value) })}
                    aria-label={`Float ${i + 1} scale`}
                  />
                  <label className="dim" htmlFor={`wp-fo-${i}`}>Opacity</label>
                  <input
                    id={`wp-fo-${i}`} type="range" min="0.05" max="1" step="0.05" value={f.opacity}
                    onChange={(e) => patchFloat(f.id, { opacity: Number(e.target.value) })}
                    aria-label={`Float ${i + 1} opacity`}
                  />
                  <div className="seg-row" role="radiogroup" aria-label={`Float ${i + 1} animation`}>
                    {FLOAT_ANIMS.map((a) => (
                      <button
                        key={a} type="button" role="radio" aria-checked={f.anim === a}
                        className={`chip ${f.anim === a ? 'on' : ''}`}
                        onClick={() => patchFloat(f.id, { anim: a })}
                      >{ANIM_LABELS[a]}</button>
                    ))}
                  </div>
                  <label className="dim" htmlFor={`wp-fv-${i}`}>Speed</label>
                  <input
                    id={`wp-fv-${i}`} type="range" min="0.25" max="3" step="0.25" value={f.speed}
                    onChange={(e) => patchFloat(f.id, { speed: Number(e.target.value) })}
                    aria-label={`Float ${i + 1} animation speed`}
                  />
                </div>
                <button
                  type="button" className="btn slim danger"
                  aria-label={`Remove floating image ${i + 1}`}
                  onClick={() => patchWp({ floats: wpDraft.floats.filter((x) => x.id !== f.id) })}
                >✕</button>
              </div>
            ))}
            {!wpDraft.floats.length && (
              <p className="dim">No floating images yet — add one from a URL or an upload.</p>
            )}
          </div>
        </section>
      )}
    </>
  );
}
