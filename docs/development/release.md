# Packaging & Release

The active product target and acceptance gates are in
[planning/MVP-EXECUTION-PLAN.md](../planning/MVP-EXECUTION-PLAN.md).
The current maintainer handoff is
[planning/HANDOFF.md](../planning/HANDOFF.md). This page summarizes the
actual release path; historical phase H6 is not the current release authority.

## External Craft-app builds

Releases come from GitHub as `{app}-web-<version>.zip`:

```bash
packaging/fetch-apps.sh                 # sync all 13 registered external apps into apps/<name>/
packaging/fetch-apps.sh --app firecraft # one app
```

- Never commit fetched builds (`apps/`, `zips/` are gitignored).
- Never run `fetch-apps.sh --force` while a source checkout lives in
  `apps/<name>` — it replaces the destination. Canonical source repositories
  are independent checkouts; `apps/<name>` is reserved for fetched release
  artifacts.
- Bundles over the Pages 25 MiB per-asset cap go to the R2 `craftweb`
  route: `packaging/r2-publish.sh <app>`, deployed **from the app
  directory**.
- EffectCraft ships its own PWA glue — `packaging/pwa-inject.sh` leaves it
  alone.
- Adopting new upstream versions = registry rows + `fetch-apps.sh` list +
  `sw.js` cache-name bump, verified by `tests/registry-versions.test.js`.

## Site deploy

```bash
cd webos && npm run build
npx wrangler pages deploy dist --project-name artcraft-webos --branch main
```

## Release checklist (short form)

1. Version bump ×3: `package.json`, `src/version.js`, `public/sw.js`.
2. `npm run ci` green; `node packaging/e2e/webos-sweep.mjs` PASS.
3. Create a reviewed PR with release version, HISTORY entry, registry/SW
   pins and any app asset updates. Merge only after required gates pass.
4. Push the release tag `vX.Y.Z`; the tag-triggered workflow runs the
   release gates and publishes the release/deployment path configured in
   `.github/workflows/release.yml`.
5. Verify served asset hashes and the `sw.js` cache version against the tag.
6. Update PROGRESS/HISTORY/SESSIONS with the actual run and deployment receipts.

Do not treat a green build as a release receipt: the exact tag bytes must pass
the browser sweep, the deployed hashes must match, and the MVP backup/restore
workflow must be verified before promoting a productivity beta. See the
[MVP release acceptance](../planning/MVP-EXECUTION-PLAN.md#6-delivery-sequence).
