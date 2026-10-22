// The craft app version is stated in three places, and all three must agree:
//   1. webos/src/os/registry.js     — the `version` row the shell shows
//   2. packaging/fetch-apps.sh      — the release zip to sync
//   3. packaging/pwa-inject.sh      — the service-worker cache name
//
// A drift between them is silent: the shell advertises one version, the
// bundle served is another, and the old SW cache keeps serving the stale
// one. This test pins the invariant so the mismatch cannot ship.
//
// EffectCraft is the one exception: its upstream release ships its own PWA
// glue (manifest, icons and a service worker that precaches the build's file
// list), so packaging/pwa-inject.sh does not touch it. Its cache name is
// upstream's content hash, not the release version.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_INDEX } from '../src/os/registry.js';

// vitest root is webos/, so packaging/ sits beside the cwd.
const PACKAGING = join(process.cwd(), '..', 'packaging');

// Every craft app rides the fetch-apps.sh pipeline: upstream publishes a
// web release zip for each of them.
const FETCHED = ['cadcraft', 'deckcraft', 'designcraft', 'effectcraft', 'firecraft',
  'gridcraft', 'lightcraft', 'pdfcraft', 'photocraft', 'soundcraft', 'vectorcraft',
  'wordcraft'];

// Apps whose bundle gets the deployment's PWA wiring injected.
const INJECTED = FETCHED.filter((id) => id !== 'effectcraft');

function fetchListVersions() {
  const src = readFileSync(join(PACKAGING, 'fetch-apps.sh'), 'utf8');
  const block = src.slice(src.indexOf('APPS_LIST=('));
  const versions = {};
  for (const m of block.matchAll(/"([a-z]+)\s+([0-9][0-9.]*)\s*(?:[a-z]+)?"/g)) {
    versions[m[1]] = m[2];
  }
  return versions;
}

function pwaInjectVersions() {
  const src = readFileSync(join(PACKAGING, 'pwa-inject.sh'), 'utf8');
  const versions = {};
  for (const m of src.matchAll(/^inject_app\s+([a-z]+)\s+"[^"]*"\s+"[^"]*"\s+"#[0-9a-fA-F]+"\s+"([0-9][0-9.]*)"/gm)) {
    versions[m[1]] = m[2];
  }
  return versions;
}

describe('craft app version rows stay in sync across the pipeline', () => {
  const fetchVersions = fetchListVersions();
  const pwaVersions = pwaInjectVersions();

  it('fetch-apps.sh lists every craft app', () => {
    for (const id of FETCHED) {
      expect(fetchVersions[id], `${id} missing from fetch-apps.sh APPS_LIST`).toBeDefined();
    }
    expect(Object.keys(fetchVersions).sort()).toEqual([...FETCHED].sort());
  });

  it('pwa-inject.sh covers every app except the one shipping its own PWA', () => {
    expect(Object.keys(pwaVersions).sort()).toEqual([...INJECTED].sort());
    expect(pwaVersions.effectcraft, 'effectcraft must not be injected').toBeUndefined();
  });

  it('the registry version row matches the synced release version', () => {
    for (const id of FETCHED) {
      const row = APP_INDEX.find((a) => a.id === id);
      expect(row, `${id} missing from the registry`).toBeDefined();
      expect(row.version, `${id} registry version`).toBe(fetchVersions[id]);
    }
  });

  it('the service-worker cache name matches the release version', () => {
    // A stale cache name means the SW keeps serving the previous bundle
    // from cache after a deploy — the app appears frozen at the old version.
    for (const id of INJECTED) {
      expect(pwaVersions[id], `${id} pwa-inject version`).toBe(fetchVersions[id]);
    }
  });

  it('every craft app has a registry row', () => {
    for (const id of FETCHED) {
      const row = APP_INDEX.find((a) => a.id === id);
      expect(row, `${id} missing from the registry`).toBeDefined();
      expect(row.url, `${id} registry url`).toMatch(/^https:\/\//);
    }
  });
});
