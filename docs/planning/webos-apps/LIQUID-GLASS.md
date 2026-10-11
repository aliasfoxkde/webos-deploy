# Liquid Glass for ArtCraft WebOS — research + phased plan

Status: planned · owner: webos-deploy · created 2026-10-09

Brings Apple's **Liquid Glass** design language (WWDC 2025; iOS 26, iPadOS 26,
macOS Tahoe 26, watchOS 26, tvOS 26, visionOS 26) to the `mac` and `win`
personas, as a persona-scoped skin in the existing architecture
(`body[data-persona]` + CSS custom properties — no component forks). This doc
is the systematic plan: research findings → design system → surface inventory
→ accessibility guardrails → implementation phases.

Clean-room: Apple's public HIG/newsroom materials and published technical
write-ups are *observed* for behavior and numbers only. No Apple artwork,
fonts, icons, or marketing assets are copied; nothing here requires an
ATTRIBUTION row (all effects are code-drawn).

## 1. Research findings

### 1.1 The material (what Apple built)

- **One material, two jobs.** Liquid Glass "combines the optical properties
  of glass with a sense of fluidity": translucent elements that *adapt* —
  refracting and reflecting the content behind them, and switching between
  light and dark appearance to stay legible.
- **Two variants.** **Regular** glass is adaptive and legible by default
  (Apple bakes in tint/contrast protection). **Clear** glass is more
  transparent — used only where content underneath is controlled or
  non-critical. After beta feedback Apple *raised* default opacity on nav
  bars and chrome and later shipped a user tint slider (clearer ↔ more
  tinted) — i.e., even Apple retreated toward legibility.
- **Hierarchy is the point.** Glass floats **above** content: toolbars and
  controls detach from edges into floating bubbles; document content stays
  opaque below. Depth communicates "this is a control, not content."
- **Physical modeling.** Apple fabricated real glass lenses to tune the
  look: a convex **squircle edge profile** (⁴√(1−(1−x)⁴)) refracts at the
  bezel, plus a **specular rim light** — a bright edge highlight driven by
  the surface normal vs. a fixed light direction.
- **Fluidity.** Controls morph (a pill expanding into a menu) and respond to
  pointer/device motion; transitions feel liquid, not linear.

### 1.2 The web technique matrix (what a browser can do)

| Effect | Technique | Support |
|---|---|---|
| Frosted body | `backdrop-filter: blur() saturate()` + translucent tint | All evergreen browsers |
| Tint/adaptivity | translucent `background` layered over the blur; light/dark from theme tokens | All |
| Specular rim | inset `box-shadow`/gradient border on the top-light edge (or SVG `feImage`+`feBlend`) | All (CSS form) |
| True edge refraction | SVG `feDisplacementMap` fed by a precomputed lens map, applied as `backdrop-filter: url(#id)` | **Chromium only** (not in the CSS spec; Safari/Firefox ignore `url()` in backdrop-filter) |
| Grain/brilliance | SVG `feTurbulence` overlay at low opacity | All (as overlay `filter`, not backdrop) |

Refraction math (from the kube.io write-up): model the bezel as a convex
squircle height profile; compute surface normals by finite differences;
precompute one radius of displacement rays (they're radially symmetric),
normalize to the max pixel displacement, encode X/Y displacement in the
R/G channels of an RGBA map (128 = neutral), and pass `scale =
maxDisplacementPx` to `feDisplacementMap`. Animating only `scale` avoids
map rebuilds — rebuilding per resize is the known perf cliff.

Honest limits: CSS/SVG refraction is an *approximation* (single refraction
event, orthogonal rays, circle stretched to rounded-rect). It will read as
"glass with lensing," not ray-traced glass — which is also true of most
native-looking web recreations.

### 1.3 The usability evidence (what to avoid)

NN/g's October 2025 review of iOS 26 ("Liquid Glass Is Cracked") documents:
text camouflaged over photos; translucent search bars over message previews
("illegible mess"); icons blending into background imagery; motion that
distracts by the hundredth occurrence; shrunken tap targets; controls that
appear/vanish contextually ("hide-and-seek navigation"). Apple's own betas
walked opacity back up. These failures — not the aesthetic — are the
constraints in §4.

## 2. WebOS design system

New persona-scoped token layer (set inside the existing persona blocks, so
`bsd`/`tui`/`android` are untouched):

```css
/* regular glass — chrome that must stay legible (taskbar, menus, titlebars) */
--glass-fill: rgba(tint, 0.55–0.72);   /* legibility floor, NOT decorative */
--glass-blur: 22px;
--glass-sat: 1.6;                       /* saturate() = the "liquid" richness */
--glass-edge: 1px light top-left rim (specular) + 1px dark bottom-right;
/* clear glass — decorative slabs over wallpaper/void only (never under text) */
--glass-clear-fill: rgba(tint, 0.18–0.30);
```

- **Regular** for: taskbar, start menu, context menus, tray popovers, window
  titlebars, dialogs. **Clear** for: desktop widgets, snap preview, window
  body *chrome accents* — surfaces with no text responsibility or where the
  backdrop is our own wallpaper (controlled content).
- **Adaptivity**: token values come from the active theme preset (light
  theme → dark-on-light glass), matching the material's light/dark switch.
- **Concentricity**: nested surfaces keep a constant optical gap — child
  radius = parent radius − padding (menu items inside the menu, buttons
  inside the taskbar). Enforced by composing `--radius`/`--ctl-radius`.
- **Fluidity**: transform/opacity-only transitions (120–220 ms, accent
  curve); menus scale-fade from their anchor; all gated by
  `prefers-reduced-motion` and the existing `data-anim-off` kill switch.

## 3. Surface inventory (mac + win personas)

| Surface | Variant | Treatment |
|---|---|---|
| `#taskbar` | regular | floating slab: blur+saturate, specular top rim, hairline; win = full-width, mac = detached dock slab (already floating) |
| `#start-menu` / `.gp` | regular | thicker glass panel, concentric item radii, scale-fade from taskbar anchor |
| `.ctx-menu` | regular | same recipe as start menu (shared tokens, one rule) |
| `.tb-pop` (tray popovers) | regular | same recipe |
| `.titlebar` / `.win` chrome | regular | titlebar strip in glass over the window body; focused windows get a stronger specular rim |
| `.win` body | none | **content stays opaque** (Liquid Glass's own rule: controls glass, not content glass) |
| widgets sidebar | clear | wallpaper shows through; widget text gets a local scrim so contrast holds |
| `#snap-preview` | clear | already translucent; gains saturate + rim |
| Settings/App Store bodies | none | document-like content: opaque (per 1.1 hierarchy rule) |

## 4. Accessibility guardrails (hard rules, verified by tests)

1. **Text never sits directly on clear glass.** Any text-bearing glass
   surface uses `--glass-fill` ≥ 0.55 alpha over the theme chrome — the
   contrast test from `tests/personas-theme.test.js` extends to glass fills
   (flatten fill over worst-case wallpaper bases, require ≥ 7:1 text,
   ≥ 7:1 dim).
2. **`prefers-reduced-transparency`** → glass fills collapse to the opaque
   theme chrome (media query, zero JS).
3. **`prefers-reduced-motion` / `data-anim-off`** → morph/transition rules
   no-op (media query + existing attribute).
4. **Tap targets never shrink** vs. today's metrics; glass is a material
   swap, not a layout change.
5. **Controls stay put.** No contextual appearing/vanishing chrome (NN/g's
   "hide-and-seek") — fluidity applies to menus we already show.
6. **Feature-detect, don't UA-sniff**: `backdrop-filter: url(#f)` support is
   probed by checking `CSS.supports('backdrop-filter', 'url(#f)')`; without
   Chromium refraction the base frost is the experience (Safari/Firefox).

## 5. Phases

- **LG1 — token layer + baseline frost (CSS only).** `--glass-*` tokens in
  the `win`/`mac` persona blocks; rework taskbar/menus/titlebars to the
  regular-glass recipe; specular rim via layered box-shadows; concentric
  radius composition; reduced-transparency fallbacks. *Tests:* token
  presence + alpha floors asserted in a new `tests/glass-tokens.test.js`
  (parse the CSS like the contrast test parses presets).
- **LG2 — window chrome.** Titlebar strip glass, focused-window specular
  rim, detached mac dock slab polish. Visual verify via control-channel
  screenshots where a craft app is available; otherwise dev-server check.
- **LG3 — floating layer + fluidity.** Start menu, ctx menus, tray popovers
  on one shared glass recipe; anchor-origin scale-fade transitions;
  reduced-motion gates. *Tests:* a11y checks (kbd traversal unchanged) in
  existing component tests.
- **LG4 — Chromium refraction (progressive enhancement, timeboxed).** Lens
  displacement-map generator (pure module, unit-testable: map math + scale
  + cache key by size/radius), one shared `<svg><filter>` injected once,
  applied only where it earns its cost (taskbar + menus). Ship behind the
  `CSS.supports` probe; base frost everywhere else.
- **LG5 — docs + gates.** ARCHITECTURE.md persona section update,
  README note, full gate (vitest/eslint/build), release + deploy.

## 6. Risks

- `backdrop-filter` perf on low-end GPUs — mitigated: blur radii capped
  (≤ 26 px), `will-change` avoided, glass surfaces are few and static.
- The refraction map rebuilds on resize — cache by (w, h, radius), rebuild
  debounced; abort cleanly if it ever dominates a frame (drop to frost).
- Theme interaction: glass fills are theme-derived, so the QP7 contrast
  auditor must read the flattened composites, not raw tokens (§4.1).

## 7. Sources

- Apple — *Adopting Liquid Glass* (developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass) and HIG Materials
- Apple Newsroom — "Apple introduces a delightful and elegant new software design" (June 9, 2025)
- kube.io — *Liquid Glass in the Browser: Refraction with CSS and SVG* (displacement-map math, feImage specular, Chromium-only caveat)
- html-in-canvas.dev — *Liquid Glass Effect in CSS and WebGL* (backdrop-filter vs. shader tradeoffs)
- NN/g — *Liquid Glass Is Cracked, and Usability Suffers in iOS 26* (Oct 10, 2025)
- Wikipedia — *Liquid Glass* (design language overview, variants, platform rollout, reception; cites Apple's opacity walk-back)
- nikdelvin/liquid-glass (MIT) — observed for the fallback/support matrix only; no code copied
