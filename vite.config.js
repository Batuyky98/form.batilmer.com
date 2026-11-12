import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Diğer yerel projelerle (5173) karışmasın diye ayrı port
  server: {
    port: 5180,
    strictPort: true,
    // Sunucu modunda (VITE_API_MODE=server) istekler yerel Node sunucusuna gider: cd server && npm run dev
    proxy: { '/api': 'http://localhost:3000' }
  }
});
