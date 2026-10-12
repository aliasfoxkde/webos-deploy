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
      // Ratchet: floors sit just under the measured baseline (84.21/78.01/
      // 74.82/87.49 after the coreutils bridge suite — ensure/persist/
      // runUtil driven through a scripted fake guest over the REAL WASI
      // imports, with the Node Blob pin making IDB blob roundtrips real).
      // Raise as tests land; a regression in any metric fails `npm run
      // coverage`.
      thresholds: {
        statements: 84.2,
        branches: 78.0,
        functions: 74.8,
        lines: 87.4,
      },
    },
  },
});
