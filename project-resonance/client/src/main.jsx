import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { loadMonsterModels } from './game3d/monsterModels.js';

// 主角用程式做的角色；先載入怪物 / 夥伴 / 翅膀模型（約 1.8 MB）再開始；網路太慢超過 20 秒就先用預設角色
const WAIT_MS = 20000;
const splash = document.getElementById('root');
if (splash) splash.innerHTML = '<div style="height:100vh;display:grid;place-items:center;color:#f5c04a;font:600 16px sans-serif;background:#0d0b16">載入角色模型中…</div>';
Promise.race([loadMonsterModels(), new Promise((r) => setTimeout(r, WAIT_MS))]).finally(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});

// 只在打包後的正式版註冊 Service Worker（開發模式不快取，免得改程式看不到）
// 注意：Service Worker 只能在 https 或 localhost 下運作 → 手機請透過 ngrok 的 https 網址安裝
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(console.warn));
}
