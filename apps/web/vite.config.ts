import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // reachable from phones on the LAN during dev
    proxy: { '/api': 'http://localhost:3000' },
  },
});
