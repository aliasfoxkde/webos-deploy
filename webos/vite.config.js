import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  // Bind the dev and preview servers to the IPv4 loopback explicitly.
  // Vite's default host ('localhost') resolves to [::1] on this host, so the
  // server is unreachable on 127.0.0.1 — the address the e2e scripts and
  // the CDP driver use. Pinning it also keeps the preview off the LAN.
  server: { port: 5180, host: '127.0.0.1' },
  preview: { port: 5180, host: '127.0.0.1' },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1200 },
});
