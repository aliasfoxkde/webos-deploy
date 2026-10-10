// Wallpaper pack — every entry is original CSS art (gradients / patterns),
// clean-room by construction. `css` is a full CSS `background` value.
// Categories: 'Gradients' | 'Scenery' | 'Patterns' | 'Mesh'.

export const WALLPAPERS = [
  // -- Interactive (canvas FX in shell/FxWallpaper.jsx; pointer parallax,
  //    paused when the tab is hidden, static frame under reduced motion) --
  { id: 'fx:aurora', label: 'Aurora FX', cat: 'Interactive', fx: true, css: 'radial-gradient(900px 600px at 20% 20%, rgba(52,211,153,0.35), transparent 60%), radial-gradient(1000px 700px at 80% 30%, rgba(56,189,248,0.30), transparent 60%), linear-gradient(160deg, #07101c, #04070d 75%)' },
  { id: 'fx:starfield', label: 'Starfield FX', cat: 'Interactive', fx: true, css: 'radial-gradient(1px 1px at 25% 30%, #ffffff, transparent), radial-gradient(1px 1px at 70% 60%, #bcd8ff, transparent), linear-gradient(160deg, #05070d, #070a12 75%)' },
  { id: 'fx:waves', label: 'Tide FX', cat: 'Interactive', fx: true, css: 'linear-gradient(180deg, #04121c 0%, #062033 70%, #04283a 100%)' },
  { id: 'fx:mesh', label: 'Mesh FX', cat: 'Interactive', fx: true, css: 'radial-gradient(at 30% 30%, rgba(56,189,248,0.28) 0, transparent 50%), radial-gradient(at 75% 70%, rgba(103,232,249,0.16) 0, transparent 50%), #07090d' },
  { id: 'fx:matrix', label: 'Code Rain FX', cat: 'Interactive', fx: true, css: 'linear-gradient(180deg, #041008, #050a06)' },

  // -- Photos (bundled, real photographs — license rows in ATTRIBUTION.md) --
  { id: 'photo:dunes', label: 'Dunes', cat: 'Photos', img: './wallpapers/photos/dunes.jpg' },
  { id: 'photo:peak', label: 'Alpine Lake', cat: 'Photos', img: './wallpapers/photos/peak.jpg' },
  { id: 'photo:aurora', label: 'Polar Night', cat: 'Photos', img: './wallpapers/photos/aurora.jpg' },
  { id: 'photo:coast', label: 'Sea Cliffs', cat: 'Photos', img: './wallpapers/photos/coast.jpg' },
  { id: 'photo:forest', label: 'Misty Forest', cat: 'Photos', img: './wallpapers/photos/forest.jpg' },
  { id: 'photo:canyon', label: 'Canyon', cat: 'Photos', img: './wallpapers/photos/canyon.jpg' },
  { id: 'photo:galaxy', label: 'Milky Way', cat: 'Photos', img: './wallpapers/photos/galaxy.jpg' },
  { id: 'photo:tropical', label: 'Lagoon', cat: 'Photos', img: './wallpapers/photos/tropical.jpg' },

  // -- Gradients --
  { id: 'aurora', label: 'Aurora', cat: 'Gradients', css: 'radial-gradient(900px 600px at 20% 20%, rgba(52,211,153,0.35), transparent 60%), radial-gradient(1000px 700px at 80% 30%, rgba(56,189,248,0.30), transparent 60%), radial-gradient(900px 700px at 50% 90%, rgba(167,139,250,0.30), transparent 60%), linear-gradient(160deg, #07101c, #04070d 75%)' },
  { id: 'ember', label: 'Ember', cat: 'Gradients', css: 'radial-gradient(1000px 700px at 75% 75%, rgba(251,146,60,0.35), transparent 60%), radial-gradient(800px 600px at 20% 20%, rgba(244,114,182,0.22), transparent 60%), linear-gradient(160deg, #170c08, #0a0404 75%)' },
  { id: 'mint', label: 'Mint', cat: 'Gradients', css: 'radial-gradient(1000px 700px at 25% 25%, rgba(163,230,53,0.25), transparent 60%), radial-gradient(900px 600px at 80% 80%, rgba(45,212,191,0.25), transparent 60%), linear-gradient(160deg, #0a1610, #050b08 75%)' },
  { id: 'violet', label: 'Violet Dusk', cat: 'Gradients', css: 'linear-gradient(200deg, #1b1035 0%, #0d0a1f 45%, #05060f 100%), radial-gradient(800px 600px at 70% 20%, rgba(232,121,249,0.18), transparent 60%)' },
  { id: 'cobalt', label: 'Cobalt', cat: 'Gradients', css: 'linear-gradient(180deg, #0a1e3f 0%, #071226 55%, #04070d 100%), radial-gradient(900px 650px at 30% 80%, rgba(56,189,248,0.22), transparent 60%)' },
  { id: 'rose', label: 'Rosewood', cat: 'Gradients', css: 'linear-gradient(170deg, #200a12 0%, #12060b 60%, #070304 100%), radial-gradient(850px 600px at 25% 30%, rgba(244,114,182,0.20), transparent 60%)' },
  { id: 'solstice', label: 'Solstice', cat: 'Gradients', css: 'linear-gradient(190deg, #2a1408 0%, #3d1e10 34%, #1a1030 68%, #08060f 100%), radial-gradient(800px 500px at 24% 22%, rgba(251,191,36,0.26), transparent 62%), radial-gradient(700px 480px at 78% 70%, rgba(129,140,248,0.20), transparent 60%)' },
  { id: 'glacier', label: 'Glacier', cat: 'Gradients', css: 'linear-gradient(170deg, #0a2030 0%, #0e3242 45%, #071720 100%), radial-gradient(900px 600px at 70% 25%, rgba(165,243,252,0.22), transparent 62%), radial-gradient(700px 500px at 18% 80%, rgba(96,165,250,0.20), transparent 60%)' },

  // -- Scenery (pure CSS landscape art) --
  { id: 'dunes', label: 'Dunes', cat: 'Scenery', css: 'radial-gradient(1200px 500px at 50% 118%, rgba(251,191,36,0.16), transparent 70%), radial-gradient(160% 90% at 20% 122%, #241408 38%, transparent 39%), radial-gradient(150% 80% at 75% 128%, #1a0e06 42%, transparent 43%), linear-gradient(180deg, #0b0f1e 0%, #241223 58%, #120a12 100%)' },
  { id: 'mountains', label: 'Ridgeline', cat: 'Scenery', css: 'linear-gradient(180deg, #071018 0%, #0c1a2a 55%, #16283c 100%), conic-gradient(from 245deg at 28% 108%, #0a141f 0deg, #0a141f 42deg, transparent 42deg), conic-gradient(from 250deg at 62% 112%, #101e2e 0deg, #101e2e 36deg, transparent 36deg), radial-gradient(500px 300px at 78% 16%, rgba(226,232,240,0.10), transparent 60%)' },
  { id: 'oceanwave', label: 'Tide', cat: 'Scenery', css: 'radial-gradient(140% 60% at 50% 118%, rgba(45,212,191,0.16), transparent 70%), radial-gradient(160% 26% at 18% 104%, rgba(14,116,144,0.30) 44%, transparent 45%), radial-gradient(150% 22% at 78% 110%, rgba(8,145,178,0.28) 40%, transparent 41%), linear-gradient(180deg, #04121c 0%, #062033 70%, #04283a 100%)' },
  { id: 'neoncity', label: 'Neon City', cat: 'Scenery', css: 'linear-gradient(180deg, #0d0618 0%, #150a26 52%, #060310 100%), repeating-linear-gradient(90deg, transparent 0 46px, rgba(232,121,249,0.10) 46px 50px, transparent 50px 96px, rgba(56,189,248,0.08) 96px 100px), radial-gradient(700px 420px at 80% 78%, rgba(232,121,249,0.14), transparent 65%)' },
  { id: 'forest', label: 'Forest', cat: 'Scenery', css: 'radial-gradient(900px 400px at 50% 115%, rgba(74,222,128,0.10), transparent 70%), radial-gradient(170% 60% at 15% 118%, #0c2415 40%, transparent 41%), radial-gradient(160% 55% at 72% 124%, #0a1d11 44%, transparent 45%), radial-gradient(150% 46% at 42% 132%, #123020 48%, transparent 49%), linear-gradient(180deg, #04110c 0%, #0a2418 55%, #0e3320 100%)' },
  { id: 'canyon', label: 'Canyon', cat: 'Scenery', css: 'radial-gradient(1000px 420px at 50% 116%, rgba(251,146,60,0.14), transparent 70%), radial-gradient(165% 52% at 20% 120%, #2e1207 40%, transparent 41%), radial-gradient(155% 46% at 75% 126%, #40180a 46%, transparent 47%), radial-gradient(150% 38% at 48% 136%, #57200c 50%, transparent 51%), linear-gradient(180deg, #140a12 0%, #2b1210 52%, #4a1c0c 100%)' },

  // -- Patterns --
  { id: 'grid', label: 'Blueprint', cat: 'Patterns', css: 'repeating-linear-gradient(0deg, rgba(56,189,248,0.10) 0 1px, transparent 1px 40px), repeating-linear-gradient(90deg, rgba(56,189,248,0.10) 0 1px, transparent 1px 40px), radial-gradient(1000px 700px at 70% 20%, rgba(56,189,248,0.15), transparent 60%), linear-gradient(160deg, #0a1420, #05090f 75%)' },
  { id: 'dots', label: 'Halftone', cat: 'Patterns', css: 'radial-gradient(rgba(232,236,244,0.10) 1.2px, transparent 1.3px) 0 0 / 26px 26px, linear-gradient(160deg, #101623, #070a10 75%)' },
  { id: 'diag', label: 'Hazard', cat: 'Patterns', css: 'repeating-linear-gradient(45deg, rgba(251,191,36,0.05) 0 14px, transparent 14px 28px), linear-gradient(160deg, #151006, #0a0803 75%)' },
  { id: 'weave', label: 'Weave', cat: 'Patterns', css: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0 2px, transparent 2px 18px), repeating-linear-gradient(90deg, rgba(255,255,255,0.025) 0 2px, transparent 2px 18px), linear-gradient(150deg, #101826, #080b12 75%)' },
  { id: 'topo', label: 'Contour', cat: 'Patterns', css: 'repeating-radial-gradient(circle at 18% 24%, rgba(52,211,153,0.07) 0 2px, transparent 2px 46px), repeating-radial-gradient(circle at 84% 78%, rgba(56,189,248,0.07) 0 2px, transparent 2px 52px), linear-gradient(160deg, #071410, #04090a 75%)' },
  { id: 'checker', label: 'Checkers', cat: 'Patterns', css: 'repeating-conic-gradient(rgba(226,232,240,0.045) 0% 25%, transparent 0% 50%) 0 0 / 56px 56px, linear-gradient(160deg, #10141f, #070a10 75%)' },

  // -- Mesh --
  { id: 'mesh', label: 'Mesh', cat: 'Mesh', css: 'radial-gradient(at 12% 18%, rgba(56,189,248,0.28) 0, transparent 50%), radial-gradient(at 88% 12%, rgba(232,121,249,0.22) 0, transparent 50%), radial-gradient(at 80% 90%, rgba(52,211,153,0.22) 0, transparent 50%), radial-gradient(at 20% 85%, rgba(251,146,60,0.16) 0, transparent 50%), #07090d' },
  { id: 'mesh2', label: 'Deep Mesh', cat: 'Mesh', css: 'radial-gradient(at 70% 25%, rgba(129,140,248,0.30) 0, transparent 55%), radial-gradient(at 25% 70%, rgba(34,211,238,0.20) 0, transparent 50%), radial-gradient(at 90% 80%, rgba(244,114,182,0.14) 0, transparent 45%), #05070c' },
];

/* -- image placement options (custom URL / upload) -- */
export const FITS = {
  fill: { label: 'Fill', size: 'cover' },
  fit: { label: 'Fit', size: 'contain' },
  stretch: { label: 'Stretch', size: '100% 100%' },
  tile: { label: 'Tile', size: 'auto' },
  actual: { label: 'Actual', size: 'auto' },
};

export const POSITIONS = [
  'left top', 'center top', 'right top',
  'left center', 'center center', 'right center',
  'left bottom', 'center bottom', 'right bottom',
];

const isImage = (wp) => wp.startsWith('http') || wp.startsWith('data:') || wp.startsWith('./');
export const isFx = (wp) => typeof wp === 'string' && wp.startsWith('fx:');

// The desktop wallpaper layer: original-style properties for a custom image
// (placement + dim shade in the background, brightness/blur/saturation as a
// CSS filter), or the raw CSS value for a pack preset. `null` = no wallpaper;
// the caller falls back to the theme preset's background.
export const wallpaperLayer = (theme) => {
  const wp = theme.wallpaper;
  if (!wp) return null;
  if (isFx(wp)) return null; // canvas FX renders via <FxWallpaper/>, no CSS layer
  const dim = Math.max(0, Math.min(0.75, 0.55 * (1 - theme.dim) + 0.15));
  const shade = `linear-gradient(rgba(0,0,0,${dim.toFixed(2)}), rgba(0,0,0,${dim.toFixed(2)}))`;
  if (isImage(wp)) {
    const fit = FITS[theme.fit] || FITS.fill;
    const pos = POSITIONS.includes(theme.pos) ? theme.pos : 'center center';
    const repeat = theme.fit === 'tile' ? 'repeat' : 'no-repeat';
    return {
      background: `${shade}, url("${wp}") ${pos} / ${fit.size} ${repeat} fixed`,
      filter: `brightness(${theme.bright ?? 1}) saturate(${theme.sat ?? 1}) blur(${theme.blur ?? 0}px)`,
    };
  }
  return { background: wp, filter: 'none' };
};
