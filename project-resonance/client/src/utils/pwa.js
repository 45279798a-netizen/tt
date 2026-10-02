// PWA 相關：安裝提示、全螢幕、橫向鎖定
import { useEffect, useState } from 'react';

// beforeinstallprompt 很早就會觸發，要在模組載入時就先接住
let deferredPrompt = null;
const listeners = new Set();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    listeners.forEach((fn) => fn());
  });
}

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isStandalone = () =>
  window.matchMedia('(display-mode: fullscreen)').matches ||
  window.matchMedia('(display-mode: standalone)').matches ||
  navigator.standalone === true;

export function useMediaQuery(query) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

export function usePwa() {
  const [, rerender] = useState(0);
  const [fullscreen, setFullscreen] = useState(!!document.fullscreenElement);

  useEffect(() => {
    const fn = () => rerender((n) => n + 1);
    listeners.add(fn);
    const fs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', fs);
    return () => { listeners.delete(fn); document.removeEventListener('fullscreenchange', fs); };
  }, []);

  const standalone = isStandalone();
  const canFullscreen = !standalone && !!document.documentElement.requestFullscreen;

  return {
    standalone,
    ios: isIOS(),
    canInstall: !!deferredPrompt && !standalone,
    install: async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(() => {});
      deferredPrompt = null;
      rerender((n) => n + 1);
    },
    fullscreen,
    canFullscreen,
    // 瀏覽器內遊玩時：進全螢幕並鎖橫向（Android Chrome 支援）
    enterFullscreen: async () => {
      try {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        await screen.orientation?.lock?.('landscape');
      } catch { /* 不支援就算了 */ }
    },
  };
}

// 已安裝的 App 開啟時也再鎖一次橫向
export function lockLandscape() {
  if (isStandalone()) screen.orientation?.lock?.('landscape').catch(() => {});
}
