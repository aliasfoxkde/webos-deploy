# The Craft Apps

ArtCraft WebOS currently registers **13 independently deployed Craft applications**. They are clean-room, primarily Rust/WebAssembly creative and productivity tools. The app registry pins the deployed versions and asset hashes; the live inventory is maintained in [Craft App Registry](../reference/craft-apps.md).

| App | Parity/workflow target | Current release |
|---|---|---|
| CADCraft | CAD and drafting | See [registry](../reference/craft-apps.md) |
| DeckCraft | Presentations | " |
| DesignCraft | Page layout | " |
| EffectCraft | Motion graphics and effects | " |
| FireCraft | Hybrid vector/bitmap web design | " |
| GridCraft | Spreadsheets | " |
| LightCraft | Photo library and RAW workflow | " |
| PdfCraft | PDF documents | " |
| PhotoCraft | Raster image editing | " |
| SolidCraft | 3D solid modeling | " |
| SoundCraft | Audio production | " |
| VectorCraft | Vector illustration | " |
| WordCraft | Word processing | " |

The applications are separate products and release independently. WebOS embeds the same published web bundles where the destination permits framing; it does not absorb their source code or become their only distribution channel.

## How embedding works

The shell hosts a compatible app in an `EmbedFrame` (iframe). If a site blocks framing, or a network/CSP condition prevents it from loading, WebOS shows an honest open-in-browser handoff rather than trying to rewrite remote HTML under the shell's origin. Each Craft app is also independently deployed. The registry version, downloaded web asset and WASM digest are pinned by `webos/tests/registry-versions.test.js`.

The external Craft catalogue is separate from WebOS's **13 bundled first-party plugins** (Browser, Calculator, Chat, Editor, Files, Notepad, Photos, Task Manager, Terminal, Video, Weather, Snippet and Cast).

## Updating

New upstream release builds are adopted through `packaging/fetch-apps.sh` and the registry/version workflow. Do not hand-edit downloaded app artifacts into the repository. Version/source/deployment details are maintained in [the registry reference](../reference/craft-apps.md) and verified by tests.
