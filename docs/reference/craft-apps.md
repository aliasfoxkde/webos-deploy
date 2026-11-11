# Craft App Registry — Reference

**Snapshot:** WebOS v3.25.0, published 2026-11-03. The 13 external app registrations below are the latest values recorded in the 2026-11-02 status baseline. The live truth is `webos/src/os/registry.js` plus `packaging/fetch-apps.sh`, with version and deployed asset/WASM digest checks in `webos/tests/registry-versions.test.js`. Re-verify this table against the registry and deployed artifacts before the next release.

| App | Version | Source organization | Deployment |
|---|---:|---|---|
| cadcraft | 0.13.0 | storytold | `cadcraft-web.pages.dev` / WebOS embed |
| deckcraft | 0.11.1 | storytold | `deckcraft-web.pages.dev` / WebOS embed |
| designcraft | 0.13.0 | storytold | `designcraft-web.pages.dev` / WebOS embed |
| effectcraft | 0.17.0 | storytold | `effectcraft-web.pages.dev` / WebOS embed (own PWA glue) |
| firecraft | 0.2.3 | **aliasfoxkde** | `firecraft-web.pages.dev` / WebOS embed |
| gridcraft | 0.12.1 | storytold | `gridcraft-web.pages.dev` / WebOS embed |
| lightcraft | 0.14.0 | storytold | `lightcraft-web.pages.dev` / WebOS embed |
| pdfcraft | 0.14.0 | storytold | `pdfcraft-web.pages.dev` / WebOS embed |
| photocraft | 0.16.0 | storytold | `photocraft-web.pages.dev` / WebOS embed |
| solidcraft | 0.30.1 | tangency-labs | `solidcraft-web-cfu.pages.dev` / WebOS embed |
| soundcraft | 0.13.1 | storytold | `soundcraft-web.pages.dev` / WebOS embed |
| vectorcraft | 0.17.0 | storytold | `vectorcraft-web-9y7.pages.dev` / WebOS embed |
| wordcraft | 0.11.0 | storytold | `wordcraft-web.pages.dev` / WebOS embed |

Eight of the 13 external app bundles were recorded as served from the Cloudflare R2 `craftweb` route to stay within the Pages per-asset limit. Verify the current deployment configuration before changing this count or route list.

### Version reconciliation note — 2026-11-11

The FireCraft row in the WebOS registry is pinned to `0.2.3`, while
[aliasfoxkde/FireCraft](https://github.com/aliasfoxkde/FireCraft) has
published `v0.2.5`. Treat the registry value above as the version
currently declared by WebOS, **not** as proof that it is the newest
upstream release. Before changing it, fetch the candidate web ZIP,
verify its manifest and deployed JS/Wasm hashes, exercise the WebOS host
bridge and file handoff, and then update the registry, app fetch pin,
service-worker cache stamp and registry-version test in one reviewed
change. Do not infer the deployed bundle version from the upstream tag.

## Release and source ownership

Asset naming for fetched upstream web builds is `{app}-web-<version>.zip`. FireCraft is independently maintained in `aliasfoxkde/FireCraft`; the Storytold apps are maintained in their respective upstream repositories; SolidCraft is from `tangency-labs/solidcraft`. These are separate products. WebOS consumes their released web artifacts and does not own their source trees.

The registry and fetch script are the source of truth. Do not infer release versions from directory names, app-store copy or a previously downloaded artifact. A release update must match the upstream version, deployed asset and WASM digest; the automated version test is the enforcement point.
