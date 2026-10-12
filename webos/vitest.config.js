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
      // Ratchet: floors sit just under the measured baseline (85.67/79.34/
      // 77.94/89.19 after the settings-panels suite — every Panels.jsx panel
      // driven through real clicks/radios, incl. both confirm branches of
      // Reset/Factory reset). Raise as tests land; a regression in any
      // metric fails `npm run coverage`.
      thresholds: {
        statements: 85.6,
        branches: 79.3,
        functions: 77.9,
        lines: 89.1,
      },
    },
  },
});
