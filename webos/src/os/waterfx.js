// Parameter model for the interactive water wallpaper (shell/WaterWallpaper.jsx
// + shell/watergl.js) — ported from the webbg-demo engine (Liquid Distortion
// Lab): a wave-equation sim whose surface refracts the background under the
// pointer. Paths are 'group.key', two levels deep on purpose so both the
// Settings panel (#86) and the preset merger stay dead simple.

export const DEFAULTS = {
  bg: {
    colorA: '#0b1026',
    colorB: '#2c4a7c',
    angle: 35,
  },
  water: {
    simScale: 0.5,            // sim buffer fraction of output pixels
    waveSpeed: 1.4,           // integration step (higher = faster waves)
    damping: 0.998,           // per-frame pressure retention
    rippleRadius: 0.03,       // pointer brush radius, UV units
    rippleStrength: 3.5,
    dropRadius: 0.02,         // click/rain drop radius, UV units
    dropStrength: 12,
    rain: false,              // ambient droplets
    rainRate: 1.5,            // drops per second
  },
  optics: {
    distortion: 0.22,
    normalScale: 2.0,
    turbulence: 0.015,
    turbScale: 9.0,
    lightX: -3,
    lightY: 10,
    lightZ: 3,
    specPower: 50,
    specGain: 1.0,
    specTint: '#e6ebf2',
    chromatic: 0.0,           // per-channel refraction spread
    shimmer: 1.0,
  },
  grade: {
    brightness: 1.0,
    contrast: 1.0,
    saturation: 1.0,
    tint: '#ffffff',
    tintAmount: 0.0,
  },
  overlay: {
    vignette: 0.25,
    vignetteRadius: 0.75,
    grain: 0.04,
  },
};

// Named looks: partial deep-merge over DEFAULTS, only the keys that differ.
export const PRESETS = {
  calm: {
    water: { rippleStrength: 2.2, waveSpeed: 1.1, rain: false },
    optics: { distortion: 0.16, turbulence: 0.008, chromatic: 0.0, specGain: 0.8 },
    overlay: { vignette: 0.2, grain: 0.03 },
  },
  rain: {
    water: { rain: true, rainRate: 3.5, dropRadius: 0.015, dropStrength: 9 },
    optics: { distortion: 0.24, chromatic: 0.12 },
  },
  storm: {
    water: { waveSpeed: 1.8, damping: 0.997, rippleRadius: 0.05, rippleStrength: 5, rain: true, rainRate: 8, dropRadius: 0.03, dropStrength: 14 },
    optics: { distortion: 0.34, normalScale: 2.6, turbulence: 0.03, chromatic: 0.2, specGain: 1.4 },
    overlay: { vignette: 0.4, grain: 0.07 },
  },
  glass: {
    water: { rippleRadius: 0.06, rippleStrength: 1.5, waveSpeed: 0.8, damping: 0.999 },
    optics: { distortion: 0.4, normalScale: 3.0, turbulence: 0.004, specPower: 90, specGain: 1.6, chromatic: 0.3 },
    grade: { saturation: 1.15 },
    overlay: { vignette: 0.15, grain: 0.02 },
  },
  'deep water': {
    bg: { colorA: '#020617', colorB: '#0e2a4a', angle: 70 },
    water: { waveSpeed: 1.0, rippleRadius: 0.045, rippleStrength: 3, rain: true, rainRate: 0.6, dropRadius: 0.04, dropStrength: 8 },
    optics: { distortion: 0.3, turbulence: 0.02, turbScale: 6, specPower: 30, specGain: 1.2, chromatic: 0.08 },
    grade: { saturation: 0.85, brightness: 0.95 },
    overlay: { vignette: 0.45, grain: 0.05 },
  },
};

/* Deep-merge `patch` over `base` (2 levels); unknown keys and wrong-typed
   values are dropped so a stale persisted blob can never inject garbage
   into the engine. Returns a fresh object — never mutates either input. */
export function mergeParams(base, patch) {
  const out = structuredClone(base);
  if (!patch || typeof patch !== 'object') return out;
  for (const g of Object.keys(out)) {
    if (!patch[g] || typeof patch[g] !== 'object') continue;
    for (const k of Object.keys(out[g])) {
      if (k in patch[g] && typeof patch[g][k] === typeof out[g][k]) {
        out[g][k] = patch[g][k];
      }
    }
  }
  return out;
}

/* Resolved params for the engine: DEFAULTS deep-merged with the user's
   persisted patch (theme.water) and an optional named preset on top. */
export function resolveParams(userPatch, presetName) {
  const preset = presetName && PRESETS[presetName] ? PRESETS[presetName] : {};
  return mergeParams(mergeParams(DEFAULTS, userPatch), preset);
}

export const PRESET_NAMES = Object.keys(PRESETS);
