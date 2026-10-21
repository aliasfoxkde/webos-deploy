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
      // Measured 2026-10-21 (full suite, 87 files / 1339 tests):
      //   statements 98.59% (7110/7211)   branches 94.20% (4425/4697)
      //   functions  98.16% (1874/1909)   lines    99.92% (5544/5548)
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
      //   Chat.jsx:38-48 — async stream/abort; happy-dom timers differ
      //   coreutils.js — network-fetch/wasm paths; no network in test env
      //   db.js:26,41,42 — same IndexedDB as above
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
        statements: 98.3,
        branches: 94.0,
        functions: 98.1,
        lines: 99.85,
      },
    },
  },
});
