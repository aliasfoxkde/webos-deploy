// The CI configuration is itself gated.
//
// A gate that only exists in a YAML file drifts: someone edits the workflow,
// the pipeline stops enforcing a rule, and the docs keep claiming it is
// enforced. These assertions pin the rules that the rest of the repo
// documents as non-negotiable — zero-warning lint, the docs-coverage gate,
// the coverage ratchet and the e2e sweep as a hard (not optional) step.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const ROOT = '..';
const read = (p) => readFileSync(`${ROOT}/${p}`, 'utf8');
const pkg = JSON.parse(read('webos/package.json'));
const ci = read('.github/workflows/ci.yml');
const gitforce = read('.gitforce.yml');

describe('lint gate', () => {
  it('fails on warnings, not just errors', () => {
    expect(pkg.scripts.lint).toContain('--max-warnings 0');
  });

  it('is enforced identically in both CI systems', () => {
    // GitHub Actions goes through npm run lint; GitForge calls eslint directly.
    expect(ci).toMatch(/run:\s*npm run lint/);
    expect(gitforce).toMatch(/eslint \. --max-warnings 0/);
  });
});

describe('CI pipeline', () => {
  it('runs every documented gate', () => {
    expect(ci).toContain('npm run lint');
    expect(ci).toContain('tests/docs-coverage.test.js');
    expect(ci).toContain('tests/contrast-audit.test.js');
    expect(ci).toContain('npm run coverage');
    expect(ci).toContain('npm run build');
  });

  it('runs the e2e sweep as a required step, not an optional one', () => {
    // The sweep is the only regression detector for rendering interactions,
    // so it must be in `steps:` — never behind a `continue-on-error` or an
    // `if:` that can skip it.
    expect(ci).toContain('packaging/e2e/webos-sweep.mjs');
    expect(ci).not.toMatch(/continue-on-error/);
    // The step that runs the sweep must not be conditional. Look only at that
    // step's own block, so an unrelated `if:` later in the file cannot trip it.
    const step = ci.slice(ci.lastIndexOf('- name:', ci.indexOf('webos-sweep.mjs')));
    expect(step).not.toMatch(/^\s+if:/m);
  });

  it('has a time budget so a hung runner cannot block the queue', () => {
    expect(ci).toMatch(/timeout-minutes:\s*\d+/);
  });
});

describe('coverage ratchet', () => {
  it('pins four non-zero floors', () => {
    const cfg = read('webos/vitest.config.js');
    const thresholds = cfg.slice(cfg.indexOf('thresholds:'));
    for (const metric of ['statements', 'branches', 'functions', 'lines']) {
      const m = thresholds.match(new RegExp(`${metric}:\\s*([\\d.]+)`));
      expect(m, metric).not.toBeNull();
      expect(Number(m[1]), metric).toBeGreaterThan(0);
    }
  });
});

describe('pre-commit hook', () => {
  it('is committed at the repo root with the exec bit set', () => {
    const path = `${ROOT}/.husky/pre-commit`;
    expect(existsSync(path)).toBe(true);
    expect(statSync(path).mode & 0o111).not.toBe(0);
  });

  it('runs eslint over src and tests with zero warnings', () => {
    const hook = read('.husky/pre-commit');
    expect(hook).toContain('eslint');
    expect(hook).toContain('--max-warnings 0');
  });

  it('is installed by the prepare script from the repo root', () => {
    // husky resolves .git relative to the CWD; webos/ is not the repo root.
    expect(pkg.scripts.prepare).toBe('cd .. && husky .husky');
  });
});
