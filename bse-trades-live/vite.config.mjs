import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, Vite serves the React app on :5173 and forwards /api and /ws to the Node server on :3000.
export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
});
