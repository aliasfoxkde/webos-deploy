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
      // Ratchet: floors sit just under the measured baseline (93.9/87.15/
      // 89.47/96.84 after the shell-surface sweep — real <App/> launches of
      // every lazy plugin chunk, the lens-filter debounce wiring, live
      // TaskManager signals, editor language detection, notepad timestamps +
      // export failure, AddApp icon upload/accent, bridgeRequest protocol).
      // Raise as tests land; a regression in any metric fails `npm run
      // coverage`.
      thresholds: {
        // ratchets only ever go up; measured 2026-10-19:
        // 96.65 / 88.69 / 96.02 / 99.78 (4 uncovered lines, all documented)
        statements: 96.6,
        branches: 88.6,
        functions: 96.0,
        lines: 99.7,
      },
    },
  },
});
