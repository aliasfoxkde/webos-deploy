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
      // Ratchet. The floors are the measured baseline minus a tolerance that
      // absorbs the machine-dependent delta the timer bug used to cause
      // (3 functions / 1 statement); a real regression still fails the gate.
      //
      // Measured 2026-10-20 (full suite, 75 files / 1058 tests):
      //   statements 96.79% (6980/7211)   branches 88.83% (4169/4693)
      //   functions  96.22% (1837/1909)   lines    99.92% (5544/5548)
      // Only 4 lines remain uncovered (calcState.jsx:126, MarkdownView.jsx:81
      // and state.jsx:483 — unreachable reducer/switch defaults — plus
      // Panels.jsx:336, a V8 attribution quirk).
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
        statements: 96.7,
        branches: 88.75,
        functions: 96.05,
        lines: 99.85,
      },
    },
  },
});
