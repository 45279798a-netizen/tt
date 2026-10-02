// 畫面設定：每台裝置自己存（localStorage），不會影響別人
//   fps      畫面更新上限（0 = 不限制）
//   res      解析度倍率（1 = 原生，0.5 = 一半，畫面糊一點但手機省電很多）
//   shadows  陰影
//   fx       特效品質：high / low（low = 粒子減半、命中特效少一點）
//   others   顯示其他玩家（含 AI）的技能特效
//   dmgNum   顯示傷害數字
//   meter    左下角顯示 FPS
//   cam      視角距離倍率（0.75 近 ～ 1.5 遠）
const KEY = 'resonance.settings';
const mobile = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

export const DEFAULTS = {
  fps: mobile ? 45 : 60,
  res: mobile ? 0.75 : 1,
  shadows: !mobile,
  fx: mobile ? 'low' : 'high',
  others: true,
  dmgNum: true,
  meter: false,
  cam: 1,
};

/** 一鍵套用的組合 */
export const PRESETS = {
  saver: { label: '🔋 省電', fps: 30, res: 0.5, shadows: false, fx: 'low' },
  balanced: { label: '⚖️ 平衡', fps: 45, res: 0.75, shadows: false, fx: 'low' },
  high: { label: '✨ 高畫質', fps: 60, res: 1, shadows: true, fx: 'high' },
};

let current = (() => {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
})();
const subs = new Set();

export const getSettings = () => current;
export function setSettings(patch) {
  current = { ...current, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* 無痕模式 */ }
  for (const f of subs) f(current);
}
export function onSettings(f) { subs.add(f); return () => subs.delete(f); }
