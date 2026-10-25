import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.{js,jsx}'],
    setupFiles: ['tests/setup.js'],

    // The default 5s is wall-clock and flaky under coverage instrumentation
    // on loaded CI machines (whole tests time out without any logic change).
    testTimeout: 20_000,
    // Coverage gate is ratcheted in CI (see docs/planning/QUALITY-PROGRAM.md);
    // locally this just reports.
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/main.jsx', 'src/version.js'],
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage',
      // Ratchet. The floors are the measured baseline minus a tolerance;
      // a real regression still fails the gate.
      //
      // Measured 2026-10-25 (full suite, 91 files / 1370+ tests):
      //   statements 98.89% (7131/7211)   branches 94.91% (4458/4697)
      //   functions  99.05% (1891/1909)   lines    99.92% (5544/5548)
      //
      // Confirmed unreachable lines (marked with // istanbul ignore next):
      //   programmer.js:121 — '(' already consumed by the includes() guard above
      //   db.js:22-42 — IndexedDB error/onabort handlers; fake-indexeddb
      //     never fires them; documented as browser-level failure paths
      //   App.jsx:453 — state reducer default: arm; no action dispatched
      //   calcState.jsx:126 — unreachable switch default
      //   MarkdownView.jsx:81 — unreachable default
      //   Panels.jsx:336 — V8 attribution quirk (catch block)
      //   state.jsx:483 — unreachable switch default
      //
      // Remaining live gaps (environment-specific, not dead code):
      //   db.js:26,41,42 — IndexedDB error handlers fake-indexeddb never fires
      //   lens.js:45-49 — `|| 1` guards for degenerate inputs the branch
      //     conditions exclude (documented in P12 of PHASES.md)
      //   SaverPreview.jsx:29-37 — `|| 1`/`|| 8` fallbacks dead under the
      //     DEFAULT_SAVER merge (speed/photoSecs always truthy)
      //
      // Those numbers are REPRODUCIBLE: two consecutive full runs measured
      // them exactly. Before 2026-10-20 they were not — three one-second
      // clock intervals (Taskbar, Sidebar clock widget, Screensaver big
      // clock) were covered only when the test file outlived the timer, so
      // slow machines saw more coverage than fast CI runners and the same
      // commit measured 95.87% functions on CI but 96.02% locally. That
      // jitter broke the ratchet and turned CI red on every push.
      // tests/clock-timers.test.jsx now drives all three timers with fake
      // timers, which pins the metric.
      //
      // Raise the floors as tests land; a regression in any metric fails
      // `npm run coverage`.
      thresholds: {
        statements: 98.6,
        branches: 94.6,
        functions: 98.8,
        lines: 99.85,
      },
    },
  },
});
