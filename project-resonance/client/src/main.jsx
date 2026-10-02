import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// 程式下載完就直接開始畫畫面：模型改在 App 的載入畫面裡一邊顯示進度一邊載（useGame.js）
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// 只在打包後的正式版註冊 Service Worker（開發模式不快取，免得改程式看不到）
// 注意：Service Worker 只能在 https 或 localhost 下運作 → 手機請透過 ngrok 的 https 網址安裝
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(console.warn));
}
