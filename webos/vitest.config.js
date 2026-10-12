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
      // Ratchet: floors sit just under the measured baseline (79.71/74.79/
      // 72.13/82.69 after the strict-lint pass — editedName extracted to
      // imops.js with counter-advance regression tests). Raise as tests
      // land; a regression in any metric fails `npm run coverage`.
      thresholds: {
        statements: 79.7,
        branches: 74.7,
        functions: 72.1,
        lines: 82.6,
      },
    },
  },
});
