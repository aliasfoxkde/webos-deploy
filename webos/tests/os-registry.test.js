// Registry invariants: every app record carries the full property sheet the
// App Store and Properties dialog render, ids are unique across both
// catalogs, and the derived exports (APP_INDEX, CATEGORIES, PLUGIN_IDS,
// allApps/findApp) behave.
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_APPS, STORE_APPS, APP_INDEX, CATEGORIES, PLUGIN_IDS,
  allApps, findApp,
} from '../src/os/registry.js';

const SHEET_FIELDS = ['id', 'name', 'tagline', 'version', 'url', 'icon', 'accent',
  'developer', 'category', 'rating', 'reviews', 'description'];
// Plugin apps render in-window from src/apps/<id>/ — leaner data-only
// manifests, no store sheet (rating/reviews/description/url/embed).
const PLUGIN_FIELDS = ['id', 'name', 'tagline', 'version', 'icon', 'accent', 'category'];

describe('registry data integrity', () => {
  it('every external app carries the full property sheet', () => {
    for (const a of [...DEFAULT_APPS, ...STORE_APPS].filter((x) => !PLUGIN_IDS.has(x.id))) {
      for (const f of SHEET_FIELDS) {
        expect(a[f], `${a.id}.${f}`).toBeDefined();
      }
      expect(a.description.length, `${a.id} description`).toBeGreaterThan(20);
      expect(a.rating === null || (a.rating >= 0 && a.rating <= 5), `${a.id} rating range`).toBe(true);
      expect(a.reviews, `${a.id} reviews`).toBeGreaterThanOrEqual(0);
      expect(a.url, `${a.id} url`).toMatch(/^(https?:\/\/|bridge-demo\.html)/);
      expect(typeof a.embed, `${a.id} embed`).toBe('boolean');
    }
  });

  it('every plugin manifest carries its lean in-window sheet', () => {
    for (const a of [...DEFAULT_APPS, ...STORE_APPS].filter((x) => PLUGIN_IDS.has(x.id))) {
      for (const f of PLUGIN_FIELDS) {
        expect(a[f], `${a.id}.${f}`).toBeDefined();
      }
    }
  });

  it('ids are unique across the union of both catalogs', () => {
    const ids = APP_INDEX.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('DEFAULT_APPS and STORE_APPS are disjoint (store apps install deliberately)', () => {
    const defIds = new Set(DEFAULT_APPS.map((a) => a.id));
    for (const a of STORE_APPS) expect(defIds.has(a.id), a.id).toBe(false);
  });

  it('plugin manifests are defaults, not store entries', () => {
    expect(PLUGIN_IDS.size).toBeGreaterThan(0);
    for (const id of PLUGIN_IDS) {
      expect(DEFAULT_APPS.some((a) => a.id === id), id).toBe(true);
    }
  });

  it('CATEGORIES is a sorted unique union of both catalogs', () => {
    const expected = [...new Set([...DEFAULT_APPS, ...STORE_APPS].map((a) => a.category))].sort();
    expect(CATEGORIES).toEqual(expected);
  });

  it('embeddable defaults point at pages.dev hosts or the bridge fixture', () => {
    // embed:false entries are honest launch panels — this asserts the flip
    // side: anything claiming iframe embedding has a frame-friendly URL.
    for (const a of DEFAULT_APPS.filter((x) => x.embed)) {
      expect(a.url.startsWith('https://') || a.url === 'bridge-demo.html', a.id).toBe(true);
    }
  });
});

describe('allApps / findApp', () => {
  it('allApps returns defaults plus exactly the installed store apps', () => {
    const installed = ['globe', 'g2048', 'planly'];
    const apps = allApps(installed);
    expect(apps.length).toBe(DEFAULT_APPS.length + 3);
    for (const id of installed) expect(apps.some((a) => a.id === id)).toBe(true);
    expect(apps.some((a) => a.id === 'photopea')).toBe(false);
  });

  it('allApps with an empty install list is just the defaults', () => {
    expect(allApps([]).map((a) => a.id)).toEqual(DEFAULT_APPS.map((a) => a.id));
  });

  it('unknown install ids are ignored', () => {
    expect(allApps(['nope', 'globe']).length).toBe(DEFAULT_APPS.length + 1);
  });

  it('findApp matches by id and misses cleanly', () => {
    const apps = allApps(['globe']);
    expect(findApp(apps, 'globe')?.name).toBe('Globe');
    expect(findApp(apps, 'photocraft')?.id).toBe('photocraft');
    expect(findApp(apps, 'missing')).toBeUndefined();
  });
});
