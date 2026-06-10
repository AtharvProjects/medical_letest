import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3001'
    },
    watch: {
      ignored: ['**/.wwebjs_auth/**', '**/.wwebjs_cache/**', '**/wwebjs_auth_dev/**', '**/wwebjs_cache_dev/**', '**/data/**']
    }
  }
});
