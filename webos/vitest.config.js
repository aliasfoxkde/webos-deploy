import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.{js,jsx}'],
    setupFiles: ['tests/setup.js'],
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
        statements: 93.9,
        branches: 87.1,
        functions: 89.4,
        lines: 96.8,
      },
    },
  },
});
