// Pure app libraries across three apps: the Notepad note store, the Weather
// Open-Meteo client (fetch mocked at the boundary), and the Photos transform
// math + canvas rendering (2d context stubbed with call recorders).
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  loadState, persistState, uniqueTitle, createNote, updateNote, renameNote,
  deleteNote, searchNotes, byRecency, isMdTitle, exportName,
} from '../src/apps/notepad/notes.js';
import {
  KEY, loadLoc, saveLoc, loadUnits, saveUnits, fmtTemp, fmtWind, fmtPrecip,
  UNITS_LABEL, geocode, fetchWeather, wmo,
} from '../src/apps/weather/api.js';
import {
  isImageName, folderOf, baseName, mimeFor, normRot, rotDims, normCrop,
  ptToDisplay, ptFromDisplay, cropToDisplay, cropFromDisplay, wrapIndex,
  renderImage, canvasBlob,
} from '../src/apps/photos/imops.js';

/* ---------- notepad/notes.js ---------- */

describe('notepad store', () => {
  beforeEach(() => localStorage.clear());

  it('seeds a welcome note; persisted state restores; corrupt JSON falls back', () => {
    const fresh = loadState();
    expect(fresh.notes[0].title).toBe('Welcome');
    expect(fresh.activeId).toBe(1);
    expect(fresh.restored).toBeUndefined();

    persistState({ notes: [{ id: 7, title: 'kept', text: '', created: 1, mtime: 2 }], activeId: 7, nextId: 8 });
    const restored = loadState();
    expect(restored.restored).toBe(true);
    expect(restored.notes[0].title).toBe('kept');

    localStorage.setItem('webos.notepad.v1', '!!!'); // corrupt payload
    expect(loadState().notes[0].title).toBe('Welcome');
  });

  it('persistState caps the payload and survives quota errors', () => {
    expect(persistState({ notes: [{ id: 1, title: 'a'.repeat(1_500_001), text: '' }], activeId: 1 })).toBe(false);
    expect(persistState({ notes: [{ id: 1, title: 'ok', text: '' }], activeId: 1 })).toBe(true);
    const boom = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(persistState({ notes: [], activeId: 1 })).toBe(false);
    boom.mockRestore();
  });

  it('uniqueTitle dedups case-insensitively and skips the note being renamed', () => {
    const notes = [{ id: 1, title: 'ideas.md' }, { id: 2, title: 'ideas 2.md' }];
    expect(uniqueTitle(notes, 'new')).toBe('new');
    expect(uniqueTitle(notes, 'IDEAS.MD')).toBe('IDEAS.MD 2');
    // numbering appends after the full title (extension included)
    // suffix numbering only avoids exact collisions, it does not try to
    // match other notes' 'title 2.md' style
    expect(uniqueTitle([...notes, { id: 3, title: 'ideas 3.md' }], 'ideas.md')).toBe('ideas.md 2');
    expect(uniqueTitle(notes, 'ideas 2.md', 2)).toBe('ideas 2.md'); // own name is free
  });

  it('create/update/rename keep mtime fresh and ids monotonic', () => {
    const s0 = { notes: [{ id: 1, title: 'a', text: '', created: 1, mtime: 1 }], activeId: 1, nextId: 2 };
    const s1 = createNote(s0, 'a');
    expect(s1.notes[1]).toMatchObject({ id: 2, title: 'a 2', text: '' });
    expect(s1.activeId).toBe(2);
    expect(s1.nextId).toBe(3);
    expect(s1.notes[1].mtime).toBeGreaterThan(1); // fresh stamp on create

    const s2 = updateNote(s1, 2, { text: 'hello' });
    expect(s2.notes[1].text).toBe('hello');
    expect(s2.notes[1].mtime).toBeGreaterThan(1);

    expect(renameNote(s1, 2, '  spaced  ').notes[1].title).toBe('spaced');
    expect(renameNote(s1, 2, '').notes[1].title).toBe('Untitled'); // blank falls back
    expect(renameNote(s1, 2, 'a').notes[1].title).toBe('a 2'); // dedup vs note 1
  });

  it('deleteNote moves the selection back; deleting the last note reseeds', () => {
    const s = {
      notes: [
        { id: 1, title: 'a', text: '', created: 1, mtime: 1 },
        { id: 2, title: 'b', text: '', created: 1, mtime: 2 },
      ],
      activeId: 2,
      nextId: 3,
    };
    expect(deleteNote(s, 2)).toMatchObject({ activeId: 1, nextId: 3 });
    const only = deleteNote({ ...s, notes: [s.notes[0]] }, 1);
    expect(only.notes).toHaveLength(1);
    expect(only.notes[0].id).toBe(3); // fresh note, new id
    expect(only.notes[0].title).toBe('Untitled');
  });

  it('searchNotes, byRecency, isMdTitle and exportName do their jobs', () => {
    const notes = [
      { id: 1, title: 'Groceries', text: 'milk' },
      { id: 2, title: 'Ideas', text: 'MILK bottle rocket' },
    ];
    expect(searchNotes(notes, 'milk')).toHaveLength(2);
    expect(searchNotes(notes, 'groceries')).toEqual([notes[0]]);
    expect(searchNotes(notes, '')).toEqual(notes); // empty query = all

    expect([byRecency({ mtime: 1 }, { mtime: 2 }), byRecency({ mtime: 5 }, { mtime: 2 })]).toEqual([1, -3]);

    expect(isMdTitle('a.MD')).toBe(true);
    expect(isMdTitle('a.markdown')).toBe(true);
    expect(isMdTitle('a.txt')).toBe(false);
    expect(isMdTitle('')).toBe(false);

    expect(exportName('note')).toBe('note.md');
    expect(exportName('a.md')).toBe('a.md');
    expect(exportName('weird:*?name')).toBe('weird-name.md'); // illegal run → one dash
    expect(exportName('note', new Set(['note.md']))).toBe('note-2.md');
    expect(exportName('a.md', new Set(['a.md', 'a-2.md']))).toBe('a-3.md');
  });
});

/* ---------- weather/api.js ---------- */

describe('weather units + location storage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('location roundtrips through localStorage; corrupt or missing is null', () => {
    expect(loadLoc()).toBeNull();
    saveLoc({ name: 'Oslo', lat: 59.9, lon: 10.7 });
    expect(loadLoc()).toEqual({ name: 'Oslo', lat: 59.9, lon: 10.7 });
    saveLoc(null);
    expect(localStorage.getItem(KEY)).toBeNull(); // clearing removes the key
    localStorage.setItem(KEY, '{nope');
    expect(loadLoc()).toBeNull();
  });

  it('units default to metric, round-trip, and broadcast the change', () => {
    expect(loadUnits()).toBe('metric');
    let seen = null;
    const on = (e) => { seen = e.detail; };
    window.addEventListener('webos:units', on);
    saveUnits('imperial');
    window.removeEventListener('webos:units', on);
    expect(loadUnits()).toBe('imperial');
    expect(seen).toBe('imperial');
    saveUnits('nonsense'); // anything else snaps back to metric
    expect(loadUnits()).toBe('metric');
  });

  it('unit conversions and labels', () => {
    expect(fmtTemp(100, 'imperial')).toBeCloseTo(212);
    expect(fmtTemp(20, 'metric')).toBe(20);
    expect(fmtWind(160.9344, 'imperial')).toBeCloseTo(100, 5);
    expect(fmtPrecip(25.4, 'imperial')).toBeCloseTo(1);
    expect(UNITS_LABEL.metric).toEqual({ temp: '°C', wind: 'km/h', precip: 'mm' });
    expect(UNITS_LABEL.imperial).toEqual({ temp: '°F', wind: 'mph', precip: 'in' });
  });
});

describe('weather network client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('geocode maps results to display labels; empty result sets are fine', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        results: [{ name: 'Oslo', admin1: 'Oslo', country: 'Norway', latitude: 59.9, longitude: 10.7 }],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await geocode('oslo')).toEqual([
      { name: 'Oslo', label: 'Oslo, Oslo, Norway', lat: 59.9, lon: 10.7 },
    ]);
    expect(fetchMock.mock.calls[0][0]).toContain('name=oslo&count=6');

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    expect(await geocode('nowhere')).toEqual([]);
  });

  it('non-2xx responses surface as Errors with the status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
    await expect(geocode('x')).rejects.toThrow('geocoder 500');
    await expect(fetchWeather(0, 0)).rejects.toThrow('forecast 500');
  });

  it('fetchWeather shapes the forecast: 5-day slice, pop fallback, current block', async () => {
    const daily = (n) => Array.from({ length: n }, (_, i) => i);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        current: {
          temperature_2m: 12.5, apparent_temperature: 10, relative_humidity_2m: 80,
          is_day: 1, precipitation: 0.2, weather_code: 61, wind_speed_10m: 9,
        },
        daily: {
          time: daily(6), weather_code: daily(6),
          temperature_2m_max: daily(6), temperature_2m_min: daily(6),
          precipitation_probability_max: [10, 20, 30, 40, 50, 60],
        },
      }),
    })));
    const w = await fetchWeather(1, 2);
    expect(w.current).toEqual({
      temp: 12.5, feels: 10, humidity: 80, wind: 9, precip: 0.2, code: 61, isDay: true,
    });
    expect(w.days).toHaveLength(5); // today drops off; next five remain
    expect(w.days[0]).toEqual({ date: 1, code: 1, max: 1, min: 1, pop: 20 });
    expect(w.units).toBe('°C');

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        current: { temperature_2m: 1, apparent_temperature: 1, relative_humidity_2m: 1, is_day: 0, weather_code: 0 },
        daily: {
          time: daily(2), weather_code: daily(2),
          temperature_2m_max: daily(2), temperature_2m_min: daily(2),
        },
        current_units: { temperature_2m: '°F' },
      }),
    })));
    const minimal = await fetchWeather(1, 2);
    expect(minimal.days[0].pop).toBe(0); // missing probability_max defaults
    expect(minimal.units).toBe('°F');
    expect(minimal.current.isDay).toBe(false);
  });

  it('wmo maps codes to icon + label; night swaps the clear icons', () => {
    expect(wmo(0, true)).toEqual({ icon: 'sun', label: 'Clear sky' });
    expect(wmo(0, false)).toEqual({ icon: 'moon', label: 'Clear night' });
    expect(wmo(1, false).icon).toBe('moon-cloud');
    expect(wmo(3).label).toBe('Overcast');
    expect(wmo(45).icon).toBe('fog');
    expect(wmo(65).icon).toBe('rain');
    expect(wmo(71).icon).toBe('snow');
    expect(wmo(95).icon).toBe('storm');
    expect(wmo(96).label).toBe('Thunderstorm + hail');
    expect(wmo(42)).toEqual({ icon: 'cloud', label: 'Unknown' }); // unmapped code
  });
});

/* ---------- photos/imops.js ---------- */

describe('photos path + mime triage', () => {
  it('image names come from mime type or extension', () => {
    expect(isImageName('x.txt', 'image/png')).toBe(true); // mime wins over name
    expect(isImageName('photo.JPG')).toBe(true);
    expect(isImageName('anim.webp')).toBe(true);
    expect(isImageName('notes.txt', 'text/plain')).toBe(false);
    expect(isImageName('', '')).toBe(false);
  });

  it('folder/base split like POSIX dirname/basename', () => {
    expect(folderOf('/Home/pics/a.png')).toBe('/Home/pics');
    expect(folderOf('a.png')).toBe('/');
    expect(folderOf('/a.png')).toBe('/');
    expect(baseName('/Home/pics/a.png')).toBe('a.png');
  });

  it('mimeFor keeps encodable formats and falls back to PNG', () => {
    expect(mimeFor('/a/b.jpg')).toBe('image/jpeg');
    expect(mimeFor('/a/b.JPEG')).toBe('image/jpeg');
    expect(mimeFor('/a/b.webp')).toBe('image/webp');
    expect(mimeFor('/a/b.png')).toBe('image/png');
    expect(mimeFor('/a/b.gif')).toBe('image/png'); // no encoder path → PNG
  });
});

describe('photos transform math', () => {
  it('normRot wraps into [0,360); junk input is 0', () => {
    expect(normRot(450)).toBe(90);
    expect(normRot(-90)).toBe(270);
    expect(normRot(360)).toBe(0);
    expect(normRot('nope')).toBe(0);
  });

  it('quarter turns swap canvas dimensions', () => {
    expect(rotDims(800, 600, 0)).toEqual([800, 600]);
    expect(rotDims(800, 600, 90)).toEqual([600, 800]);
    expect(rotDims(800, 600, 270)).toEqual([600, 800]);
    expect(rotDims(800, 600, 180)).toEqual([800, 600]);
  });

  it('normCrop clamps into the unit square keeping the minimum size', () => {
    expect(normCrop({ x: 0.2, y: 0.1, w: 0.3, h: 0.3 })).toEqual({ x: 0.2, y: 0.1, w: 0.3, h: 0.3 });
    expect(normCrop({ x: -1, y: -1, w: 5, h: 5 })).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    // a rect pushed past the right edge slides back so x+w stays <= 1
    const c = normCrop({ x: 0.9, y: 0, w: 0.5, h: 0.5 });
    expect(c).toEqual({ x: 0.5, y: 0, w: 0.5, h: 0.5 });
    expect(normCrop({ x: 0, y: 0, w: 0, h: 0 }).w).toBe(0.05); // min size
  });

  it('point mapping round-trips through every rotation and flip', () => {
    for (const rot of [0, 90, 180, 270]) {
      for (const flipH of [false, true]) {
        for (const flipV of [false, true]) {
          const [dx, dy] = ptToDisplay(0.25, 0.75, rot, flipH, flipV);
          expect(ptFromDisplay(dx, dy, rot, flipH, flipV)).toEqual([0.25, 0.75]);
        }
      }
    }
    expect(ptToDisplay(0, 0, 90, false, false)).toEqual([1, 0]); // CW: top-left → top-right
    expect(ptToDisplay(0, 0, 180, true, false)).toEqual([0, 1]); // (0,0) →flipH→ (1,0) →rot180→ (0,1)
  });

  it('crop rects survive the same mapping and stay normalized', () => {
    // binary-exact fractions: the round-trip must be exact, not approximate
    const crop = { x: 0.25, y: 0.5, w: 0.25, h: 0.25 };
    for (const rot of [0, 90, 180, 270]) {
      const d = cropToDisplay(crop, rot, true, false);
      for (const v of Object.values(d)) expect(v).toBeGreaterThanOrEqual(0);
      expect(cropFromDisplay(d, rot, true, false)).toEqual(crop);
    }
    // under 90° the rect's width/height swap with the axes
    expect(cropToDisplay(crop, 90, false, false)).toEqual({ x: 0.25, y: 0.25, w: 0.25, h: 0.25 });
  });

  it('wrapIndex steps around the list and handles the empty list', () => {
    expect(wrapIndex(0, 0, 1)).toBe(0);
    expect(wrapIndex(2, 3, 1)).toBe(0);
    expect(wrapIndex(0, 3, -1)).toBe(2);
    expect(wrapIndex(1, 3, 0)).toBe(1);
  });
});

describe('photos canvas rendering', () => {
  // happy-dom's canvas has no 2d context — record calls like the shell tests.
  const calls = [];
  const ctx2d = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'canvas') return null;
      return (...args) => calls.push([prop, args]);
    },
  });

  beforeEach(() => {
    calls.length = 0;
    Reflect.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: () => ctx2d,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    delete HTMLCanvasElement.prototype.getContext;
    vi.restoreAllMocks();
  });

  const img = { naturalWidth: 800, naturalHeight: 600 };

  it('renderImage sizes the canvas for the rotation and draws once', () => {
    const a = renderImage(img, { rot: 90, flipH: true });
    expect(a.width).toBe(600);
    expect(a.height).toBe(800);
    expect(calls.some(([op]) => op === 'drawImage')).toBe(true);
    expect(calls.some(([op, args]) => op === 'rotate' && args[0] === Math.PI / 2)).toBe(true);
    expect(calls.some(([op, args]) => op === 'scale' && args[0] === -1 && args[1] === 1)).toBe(true);

    const b = renderImage(img, {}); // no transform: natural size
    expect([b.width, b.height]).toEqual([800, 600]);
  });

  it('a partial crop re-draws the region into a second canvas', () => {
    const c = renderImage(img, {}, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
    expect([c.width, c.height]).toEqual([400, 300]);
    const draw = calls.filter(([op]) => op === 'drawImage');
    expect(draw).toHaveLength(2); // base render + crop blit
    // source offset into canvas a: 25% of 800/600
    expect(draw[1][1][1]).toBe(200);
    expect(draw[1][1][2]).toBe(150);

    expect(renderImage(img, {}, { x: 0, y: 0, w: 1, h: 1 }).width).toBe(800); // full-frame: no re-draw
  });

  it('canvasBlob resolves with the encoded blob and rejects null encodes', async () => {
    const ok = { toBlob: (cb) => cb(new Blob(['x'], { type: 'image/png' })) };
    const bad = { toBlob: (cb) => cb(null) };
    const blob = await canvasBlob(ok);
    expect(blob).toBeInstanceOf(Blob);
    await expect(canvasBlob(bad)).rejects.toThrow('image encode failed');
    const jpeg = await canvasBlob({ toBlob: (cb, type, q) => { expect(type).toBe('image/jpeg'); expect(q).toBe(0.8); cb(new Blob()); } }, 'image/jpeg', 0.8);
    expect(jpeg).toBeInstanceOf(Blob);
  });
});
