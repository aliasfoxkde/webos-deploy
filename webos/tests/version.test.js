import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { VERSION } from '../src/version.js';

describe('version', () => {
  it('is a semver string', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('matches package.json', () => {
    // vitest's import.meta.url isn't file: scheme — resolve from the project root
    const pkg = JSON.parse(readFileSync(`${process.cwd()}/package.json`, 'utf8'));
    expect(VERSION).toBe(pkg.version);
  });
});
