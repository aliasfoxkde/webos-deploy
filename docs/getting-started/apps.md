# The Craft Apps

Twelve ArtCraft desktop applications — clean-room, pure-Rust reimaginations
of classic creative software — are embedded in WebOS. Each ships as a
compiled WebAssembly bundle in an iframe window; you can also open any of
them full-page from the Start menu or the App Store.

| App | Parity target | Current release |
|---|---|---|
| CADCraft | AutoCAD | see [registry](../reference/craft-apps.md) |
| DeckCraft | PowerPoint | " |
| DesignCraft | InDesign | " |
| EffectCraft | After Effects | " |
| FireCraft | (flagship web app) | " |
| GridCraft | Excel | " |
| LightCraft | Lightroom | " |
| PdfCraft | Acrobat | " |
| PhotoCraft | Photoshop | " |
| SoundCraft | Pro Tools | " |
| VectorCraft | Illustrator | " |
| WordCraft | Word | " |

## How embedding works

The shell hosts each app in an `EmbedFrame` (iframe). If the iframe cannot
load (network, CSP), the frame falls back to an honest "open in new tab"
panel instead of a blank window. Each craft app is also deployed as its own
standalone site (`<name>-web.pages.dev`); WebOS embeds the same bundles and
keeps its registry rows pinned to the deployed asset + wasm hash
(enforced by `webos/tests/registry-versions.test.js`).

## Updating

New upstream releases are pulled with `packaging/fetch-apps.sh` (never
committed by hand) and adopted as a single release in this repo. The
per-app source lives in separate repositories under
`github.com/aliasfoxkde/<app>` — see the root `CLAUDE.md` for checkout
rules.
