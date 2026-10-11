// Wallpaper pack integrity + the custom-image layer builder.
import { describe, it, expect } from 'vitest';
import {
  WALLPAPERS, FITS, POSITIONS, isFx, wallpaperLayer,
} from '../src/os/wallpapers.js';

describe('WALLPAPERS pack', () => {
  it('has unique ids and complete records', () => {
    const ids = WALLPAPERS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const w of WALLPAPERS) {
      expect(w.label, w.id).toBeTruthy();
      expect(w.cat, w.id).toBeTruthy();
      expect(w.css || w.img || w.fx, w.id).toBeTruthy();
    }
  });

  it('categories are from the documented set', () => {
    expect([...new Set(WALLPAPERS.map((w) => w.cat))].sort()).toEqual(
      ['Gradients', 'Interactive', 'Mesh', 'Patterns', 'Photos', 'Scenery'],
    );
  });

  it('fx entries carry the fx flag and CSS art', () => {
    const fx = WALLPAPERS.filter((w) => w.fx);
    expect(fx.length).toBeGreaterThanOrEqual(5);
    for (const w of fx) {
      expect(w.id.startsWith('fx:'), w.id).toBe(true);
      expect(w.css, w.id).toBeTruthy();
    }
  });

  it('photo entries point at bundled files', () => {
    const photos = WALLPAPERS.filter((w) => w.cat === 'Photos');
    expect(photos.length).toBeGreaterThanOrEqual(8);
    for (const w of photos) {
      expect(w.img, w.id).toMatch(/^\.\/wallpapers\/photos\/[\w-]+\.jpg$/);
    }
  });
});

describe('isFx', () => {
  it('only fx: strings count', () => {
    expect(isFx('fx:aurora')).toBe(true);
    expect(isFx('photo:dunes')).toBe(false);
    expect(isFx('linear-gradient(…)')).toBe(false);
    expect(isFx(null)).toBe(false);
    expect(isFx(42)).toBe(false);
  });
});

describe('FITS / POSITIONS', () => {
  it('every fit maps to a real background-size', () => {
    expect(Object.entries(FITS)).toHaveLength(5);
    for (const f of Object.values(FITS)) expect(f.size).toBeTruthy();
  });

  it('nine positions cover the 3×3 grid', () => {
    expect(POSITIONS).toHaveLength(9);
    for (const p of POSITIONS) expect(p).toMatch(/^(left|center|right) (top|center|bottom)$/);
  });
});

describe('wallpaperLayer', () => {
  const img = { wallpaper: './wallpapers/photos/dunes.jpg', fit: 'fill', pos: 'center center', dim: 1, bright: 1, sat: 1, blur: 0 };

  it('null when unset or fx (FxWallpaper owns those pixels)', () => {
    expect(wallpaperLayer({ wallpaper: '' })).toBeNull();
    expect(wallpaperLayer({ wallpaper: 'fx:aurora', dim: 1 })).toBeNull();
  });

  it('image: shade + url + fit/pos/repeat + filter chain', () => {
    const layer = wallpaperLayer(img);
    expect(layer.background).toContain('url("./wallpapers/photos/dunes.jpg")');
    expect(layer.background).toContain('center center / cover no-repeat');
    expect(layer.filter).toBe('brightness(1) saturate(1) blur(0px)');
  });

  it('dim=0 darkens the most, clamped at 0.75', () => {
    const darkest = wallpaperLayer({ ...img, dim: 0 });
    const lightest = wallpaperLayer({ ...img, dim: 1 });
    expect(darkest.background).toContain('rgba(0,0,0,0.70)');
    expect(lightest.background).toContain('rgba(0,0,0,0.15)');
    const overClamped = wallpaperLayer({ ...img, dim: -5 });
    expect(overClamped.background).toContain('rgba(0,0,0,0.75)');
  });

  it('tile fit repeats; unknown fit falls back to cover; bad position centers', () => {
    expect(wallpaperLayer({ ...img, fit: 'tile' }).background).toContain('repeat fixed');
    expect(wallpaperLayer({ ...img, fit: 'bogus' }).background).toContain('/ cover');
    expect(wallpaperLayer({ ...img, pos: 'up' }).background).toContain('center center /');
  });

  it('a css preset passes through untouched', () => {
    const layer = wallpaperLayer({ wallpaper: 'linear-gradient(160deg, #07101c, #04070d)', dim: 0.5 });
    expect(layer.background).toBe('linear-gradient(160deg, #07101c, #04070d)');
    expect(layer.filter).toBe('none');
  });
});
