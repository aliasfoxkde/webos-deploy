// The craft app version is stated in three places, and all three must agree:
//   1. webos/src/os/registry.js     — the `version` row the shell shows
//   2. packaging/fetch-apps.sh      — the release zip to sync
//   3. packaging/pwa-inject.sh      — the service-worker cache name
//
// A drift between them is silent: the shell advertises one version, the
// bundle served is another, and the old SW cache keeps serving the stale
// one. This test pins the invariant so the mismatch cannot ship.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_INDEX } from '../src/os/registry.js';

// vitest root is webos/, so packaging/ sits beside the cwd.
const PACKAGING = join(process.cwd(), '..', 'packaging');

// The apps that ride the fetch-apps.sh pipeline. deckcraft/soundcraft/
// effectcraft are excluded: they deploy from source checkouts and have no
// release zip (see CLAUDE.md).
const FETCHED = ['cadcraft', 'designcraft', 'gridcraft', 'lightcraft', 'pdfcraft',
  'photocraft', 'vectorcraft', 'wordcraft', 'firecraft'];

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

  it('fetch-apps.sh lists every app that has a release zip', () => {
    for (const id of FETCHED) {
      expect(fetchVersions[id], `${id} missing from fetch-apps.sh APPS_LIST`).toBeDefined();
    }
  });

  it('pwa-inject.sh covers the same apps as fetch-apps.sh', () => {
    expect(Object.keys(pwaVersions).sort()).toEqual([...FETCHED].sort());
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
    for (const id of FETCHED) {
      expect(pwaVersions[id], `${id} pwa-inject version`).toBe(fetchVersions[id]);
    }
  });

  it('no app outside the fetched set is smuggled into fetch-apps.sh', () => {
    // deckcraft/soundcraft/effectcraft deploy from source checkouts;
    // `fetch_one` does `rm -rf apps/<name>` on --force, which would destroy
    // the checkout. They must never appear in APPS_LIST.
    for (const id of Object.keys(fetchVersions)) {
      expect(['deckcraft', 'soundcraft', 'effectcraft']).not.toContain(id);
    }
  });
});
