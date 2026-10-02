import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // 把 three.js / three.quarks / React 拆成獨立檔案：遊戲改版時手機只要重新下載小的遊戲程式，大的函式庫留在快取
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three.quarks') || id.includes('node_modules/quarks.core')) return 'quarks';
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/react')) return 'react';
        },
      },
    },
  },
  server: {
    host: true, // 讓同一個 Wi-Fi 的手機也能連到開發伺服器
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
});
