# Packaging & Release

Deep context: [planning/HANDOFF.md](../planning/HANDOFF.md) (phase H6 is the
canonical release checklist). Summary here.

## Craft-app builds

Releases come from GitHub as `{app}-web-<version>.zip`:

```bash
packaging/fetch-apps.sh                 # sync all twelve into apps/<name>/
packaging/fetch-apps.sh --app firecraft # one app
```

- Never commit fetched builds (`apps/`, `zips/` are gitignored).
- Never run `fetch-apps.sh --force` while a source checkout lives in
  `apps/<name>` — it `rm -rf`s the destination. (Craft source checkouts
  live in `/nas/Temp/repos/<name>` for this reason.)
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
3. Commit `chore(release): X.Y.Z`, push, watch CI green.
4. `gh release create vX.Y.Z` with honest notes.
5. Deploy to Pages; verify served asset hash + `sw.js` cache name.
6. Update PROGRESS/HISTORY/SESSIONS.

Known pitfalls (root-owned node_modules on NAS runs, wrangler project
create, per-asset caps, coverage blind spots, …) are catalogued in
[HANDOFF.md §Known pitfalls](../planning/HANDOFF.md).
