// Water wallpaper parameter model: validated merging, preset layering.
// The engine consumes the resolved tree; a stale persisted blob must never
// be able to inject unknown keys or wrong-typed values into it.
import { describe, it, expect } from 'vitest';
import { DEFAULTS, PRESETS, PRESET_NAMES, mergeParams, resolveParams } from '../src/os/waterfx.js';

describe('waterfx params', () => {
  it('DEFAULTS cover every group the engine reads', () => {
    expect(Object.keys(DEFAULTS).sort()).toEqual(['bg', 'grade', 'optics', 'overlay', 'water']);
    expect(Object.keys(DEFAULTS.water)).toContain('simScale');
    expect(Object.keys(DEFAULTS.optics)).toContain('distortion');
  });

  it('mergeParams keeps valid patches and drops unknown/wrong-typed keys', () => {
    const base = structuredClone(DEFAULTS);
    const out = mergeParams(base, {
      water: { waveSpeed: 2.5, bogus: 1 },      // valid + unknown key
      optics: { distortion: 'high' },           // wrong type → dropped
      nope: { x: 1 },                            // unknown group → dropped
      junk: 'string',
    });
    expect(out.water.waveSpeed).toBe(2.5);
    expect(out.water).not.toHaveProperty('bogus');
    expect(out.optics.distortion).toBe(DEFAULTS.optics.distortion);
    expect(out).not.toHaveProperty('nope');
    expect(out).not.toHaveProperty('junk');
  });

  it('mergeParams mutates neither input', () => {
    const base = structuredClone(DEFAULTS);
    mergeParams(base, { water: { waveSpeed: 3 } });
    expect(base.water.waveSpeed).toBe(DEFAULTS.water.waveSpeed);
  });

  it('mergeParams tolerates null/garbage patches', () => {
    expect(mergeParams(DEFAULTS, null)).toEqual(DEFAULTS);
    expect(mergeParams(DEFAULTS, 'garbage')).toEqual(DEFAULTS);
  });

  it('resolveParams layers DEFAULTS < user patch < preset', () => {
    const out = resolveParams({ water: { waveSpeed: 2.0 } }, 'storm');
    expect(out.water.waveSpeed).toBe(1.8); // storm preset wins over the patch
    expect(out.water.rain).toBe(true);     // preset-only key lands
    expect(out.grade.brightness).toBe(1);  // untouched default survives
  });

  it('resolveParams survives an unknown preset name', () => {
    expect(resolveParams(null, 'does-not-exist')).toEqual(DEFAULTS);
  });

  it('ships the five demo looks', () => {
    expect(PRESET_NAMES.sort()).toEqual(['calm', 'deep water', 'glass', 'rain', 'storm'].sort());
    expect(PRESETS.calm.water.rain).toBe(false);
  });
});
