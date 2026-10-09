// Wallpaper pack — every entry is original CSS art (gradients / patterns),
// clean-room by construction. `css` is a full CSS `background` value.
// Categories: 'Gradients' | 'Scenery' | 'Patterns' | 'Mesh'.

export const WALLPAPERS = [
  // -- Gradients --
  { id: 'aurora', label: 'Aurora', cat: 'Gradients', css: 'radial-gradient(900px 600px at 20% 20%, rgba(52,211,153,0.35), transparent 60%), radial-gradient(1000px 700px at 80% 30%, rgba(56,189,248,0.30), transparent 60%), radial-gradient(900px 700px at 50% 90%, rgba(167,139,250,0.30), transparent 60%), linear-gradient(160deg, #07101c, #04070d 75%)' },
  { id: 'ember', label: 'Ember', cat: 'Gradients', css: 'radial-gradient(1000px 700px at 75% 75%, rgba(251,146,60,0.35), transparent 60%), radial-gradient(800px 600px at 20% 20%, rgba(244,114,182,0.22), transparent 60%), linear-gradient(160deg, #170c08, #0a0404 75%)' },
  { id: 'mint', label: 'Mint', cat: 'Gradients', css: 'radial-gradient(1000px 700px at 25% 25%, rgba(163,230,53,0.25), transparent 60%), radial-gradient(900px 600px at 80% 80%, rgba(45,212,191,0.25), transparent 60%), linear-gradient(160deg, #0a1610, #050b08 75%)' },
  { id: 'violet', label: 'Violet Dusk', cat: 'Gradients', css: 'linear-gradient(200deg, #1b1035 0%, #0d0a1f 45%, #05060f 100%), radial-gradient(800px 600px at 70% 20%, rgba(232,121,249,0.18), transparent 60%)' },
  { id: 'cobalt', label: 'Cobalt', cat: 'Gradients', css: 'linear-gradient(180deg, #0a1e3f 0%, #071226 55%, #04070d 100%), radial-gradient(900px 650px at 30% 80%, rgba(56,189,248,0.22), transparent 60%)' },
  { id: 'rose', label: 'Rosewood', cat: 'Gradients', css: 'linear-gradient(170deg, #200a12 0%, #12060b 60%, #070304 100%), radial-gradient(850px 600px at 25% 30%, rgba(244,114,182,0.20), transparent 60%)' },

  // -- Scenery (pure CSS landscape art) --
  { id: 'dunes', label: 'Dunes', cat: 'Scenery', css: 'radial-gradient(1200px 500px at 50% 118%, rgba(251,191,36,0.16), transparent 70%), radial-gradient(160% 90% at 20% 122%, #241408 38%, transparent 39%), radial-gradient(150% 80% at 75% 128%, #1a0e06 42%, transparent 43%), linear-gradient(180deg, #0b0f1e 0%, #241223 58%, #120a12 100%)' },
  { id: 'mountains', label: 'Ridgeline', cat: 'Scenery', css: 'linear-gradient(180deg, #071018 0%, #0c1a2a 55%, #16283c 100%), conic-gradient(from 245deg at 28% 108%, #0a141f 0deg, #0a141f 42deg, transparent 42deg), conic-gradient(from 250deg at 62% 112%, #101e2e 0deg, #101e2e 36deg, transparent 36deg), radial-gradient(500px 300px at 78% 16%, rgba(226,232,240,0.10), transparent 60%)' },
  { id: 'oceanwave', label: 'Tide', cat: 'Scenery', css: 'radial-gradient(140% 60% at 50% 118%, rgba(45,212,191,0.16), transparent 70%), radial-gradient(160% 26% at 18% 104%, rgba(14,116,144,0.30) 44%, transparent 45%), radial-gradient(150% 22% at 78% 110%, rgba(8,145,178,0.28) 40%, transparent 41%), linear-gradient(180deg, #04121c 0%, #062033 70%, #04283a 100%)' },
  { id: 'neoncity', label: 'Neon City', cat: 'Scenery', css: 'linear-gradient(180deg, #0d0618 0%, #150a26 52%, #060310 100%), repeating-linear-gradient(90deg, transparent 0 46px, rgba(232,121,249,0.10) 46px 50px, transparent 50px 96px, rgba(56,189,248,0.08) 96px 100px), radial-gradient(700px 420px at 80% 78%, rgba(232,121,249,0.14), transparent 65%)' },

  // -- Patterns --
  { id: 'grid', label: 'Blueprint', cat: 'Patterns', css: 'repeating-linear-gradient(0deg, rgba(56,189,248,0.10) 0 1px, transparent 1px 40px), repeating-linear-gradient(90deg, rgba(56,189,248,0.10) 0 1px, transparent 1px 40px), radial-gradient(1000px 700px at 70% 20%, rgba(56,189,248,0.15), transparent 60%), linear-gradient(160deg, #0a1420, #05090f 75%)' },
  { id: 'dots', label: 'Halftone', cat: 'Patterns', css: 'radial-gradient(rgba(232,236,244,0.10) 1.2px, transparent 1.3px) 0 0 / 26px 26px, linear-gradient(160deg, #101623, #070a10 75%)' },
  { id: 'diag', label: 'Hazard', cat: 'Patterns', css: 'repeating-linear-gradient(45deg, rgba(251,191,36,0.05) 0 14px, transparent 14px 28px), linear-gradient(160deg, #151006, #0a0803 75%)' },
  { id: 'weave', label: 'Weave', cat: 'Patterns', css: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0 2px, transparent 2px 18px), repeating-linear-gradient(90deg, rgba(255,255,255,0.025) 0 2px, transparent 2px 18px), linear-gradient(150deg, #101826, #080b12 75%)' },

  // -- Mesh --
  { id: 'mesh', label: 'Mesh', cat: 'Mesh', css: 'radial-gradient(at 12% 18%, rgba(56,189,248,0.28) 0, transparent 50%), radial-gradient(at 88% 12%, rgba(232,121,249,0.22) 0, transparent 50%), radial-gradient(at 80% 90%, rgba(52,211,153,0.22) 0, transparent 50%), radial-gradient(at 20% 85%, rgba(251,146,60,0.16) 0, transparent 50%), #07090d' },
  { id: 'mesh2', label: 'Deep Mesh', cat: 'Mesh', css: 'radial-gradient(at 70% 25%, rgba(129,140,248,0.30) 0, transparent 55%), radial-gradient(at 25% 70%, rgba(34,211,238,0.20) 0, transparent 50%), radial-gradient(at 90% 80%, rgba(244,114,182,0.14) 0, transparent 45%), #05070c' },
];

// Photos / uploads are dimmed so icons stay legible; gradients use full strength.
export const wallpaperBackground = (theme) => {
  const wp = theme.wallpaper;
  if (!wp) return null; // caller falls back to the preset bg
  if (wp.startsWith('http') || wp.startsWith('data:')) {
    const shade = Math.max(0, Math.min(0.75, 0.55 * (1 - theme.dim) + 0.15));
    return `linear-gradient(rgba(0,0,0,${shade.toFixed(2)}), rgba(0,0,0,${shade.toFixed(2)})), url("${wp}") center/cover no-repeat fixed`;
  }
  return wp; // CSS art from the pack
};
