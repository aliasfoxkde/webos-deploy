# Craft App Registry — Reference

Versions below are the deployed set as of the 2026-10-25 snapshot
(v3.23.0). The live truth is `webos/src/os/registry.js` + the
`fetch-apps.sh` list, pinned by `webos/tests/registry-versions.test.js`.

| App | Version | Source org | Deploy route |
|---|---|---|---|
| cadcraft | 0.13.0 | storytold | `<app>-web.pages.dev` / WebOS embed |
| deckcraft | 0.11.1 | storytold | " |
| designcraft | 0.13.0 | storytold | " |
| effectcraft | 0.17.0 | storytold | " (own PWA glue) |
| firecraft | 0.2.3 | **aliasfoxkde** | firecraft-web.pages.dev |
| gridcraft | 0.12.1 | storytold | " |
| lightcraft | 0.14.0 | storytold | " |
| pdfcraft | 0.14.0 | storytold | " |
| photocraft | 0.16.0 | storytold | " |
| soundcraft | 0.13.1 | storytold | " |
| vectorcraft | 0.17.0 | storytold | " |
| wordcraft | 0.11.0 | storytold | " |

Eight of the twelve are served from the R2 `craftweb` route (over the
Pages 25 MiB per-asset cap).

Asset naming: `{app}-web-<version>.zip` from the upstream release.
Checkouts of the craft sources are **not** kept under `apps/` — they live
in `/nas/Temp/repos/<Name>` (independent repos); `apps/<name>` holds only
fetched release builds.
