// ─────────────────────────────────────────────
// 莊園：每個人都有自己的莊園（12 塊地）
//  - 生產建築：金礦 / 精華泉 / 素材倉，離線也會累積（最多 12 小時），回來收成
//  - 裝飾：提高「繁榮度」，每 1 點繁榮度讓生產 +1%
//  - 好友可以來參觀（看得到彼此），每人每天參觀一次：參觀者拿精華、莊園主人人氣 +1
// 生產量跟著主人「去過最遠的地圖」成長，不會前期太多、後期沒用
// ─────────────────────────────────────────────
import { MAPS } from './formulas.js';
import { SETS } from './items.js';

export const PLOTS = 12;
export const MAX_HOURS = 12;
export const BUILD_MAX_LV = 10;

// kind: 'prod' 生產 / 'deco' 裝飾；cost 的 gold 會乘上「目前地圖的金幣尺度」
export const BUILDINGS = {
  goldmine:  { id: 'goldmine',  kind: 'prod', name: '金礦',     icon: '⛏️', desc: '每小時產出金幣', cost: 1500 },
  essence:   { id: 'essence',   kind: 'prod', name: '精華泉',   icon: '💠', desc: '每小時產出鍛造精華', cost: 2500 },
  warehouse: { id: 'warehouse', kind: 'prod', name: '素材倉',   icon: '📦', desc: '每小時產出最遠地圖的素材', cost: 2000 },
  tree:      { id: 'tree',      kind: 'deco', name: '綠蔭大樹', icon: '🌳', prosper: 2, cost: 300 },
  flower:    { id: 'flower',    kind: 'deco', name: '花圃',     icon: '🌷', prosper: 1, cost: 150 },
  lantern:   { id: 'lantern',   kind: 'deco', name: '石燈籠',   icon: '🏮', prosper: 2, cost: 400 },
  sakura:    { id: 'sakura',    kind: 'deco', name: '櫻花樹',   icon: '🌸', prosper: 3, cost: 700 },
  fountain:  { id: 'fountain',  kind: 'deco', name: '噴水池',   icon: '⛲', prosper: 4, cost: 1200 },
  statue:    { id: 'statue',    kind: 'deco', name: '星之雕像', icon: '🗿', prosper: 6, cost: 2500 },
};

const scale = (p) => MAPS[Math.max(0, Math.min(p.maxMap, MAPS.length - 1))].goldPerKill;

export function initManor(p) {
  p.manor ||= { plots: Array(PLOTS).fill(null), last: Date.now(), likes: 0, visits: {} };
  while (p.manor.plots.length < PLOTS) p.manor.plots.push(null);
}

export function prosperity(p) {
  return p.manor.plots.reduce((n, b) => n + (b && BUILDINGS[b.id]?.kind === 'deco' ? BUILDINGS[b.id].prosper * b.lv : 0), 0) + Math.floor((p.manor.likes || 0) / 5);
}

/** 每小時產量 */
export function ratePerHour(p) {
  const out = { gold: 0, essence: 0, mats: {} };
  const mul = 1 + prosperity(p) / 100;
  const tier = Math.min(p.maxMap, SETS.length - 1);
  const [ma, mb] = SETS[tier].mats;
  for (const b of p.manor.plots) {
    if (!b) continue;
    if (b.id === 'goldmine') out.gold += scale(p) * 250 * b.lv * mul;
    if (b.id === 'essence') out.essence += 1.5 * b.lv * mul;
    if (b.id === 'warehouse') { out.mats[ma] = (out.mats[ma] || 0) + 5 * b.lv * mul; out.mats[mb] = (out.mats[mb] || 0) + 0.25 * b.lv * mul; }
  }
  return out;
}

export function pending(p, now = Date.now()) {
  const h = Math.min((now - p.manor.last) / 3600_000, MAX_HOURS);
  const r = ratePerHour(p);
  return { hours: h, gold: Math.floor(r.gold * h), essence: Math.floor(r.essence * h), mats: Object.fromEntries(Object.entries(r.mats).map(([k, v]) => [k, Math.floor(v * h)])) };
}

export function buildCost(p, id, lv) {
  const b = BUILDINGS[id];
  return { gold: Math.floor(b.cost * scale(p) * 1.6 ** (lv - 1)) };
}

/** 公開資料（自己或好友參觀時看） */
export function manorView(p) {
  return { owner: p.name, ownerId: p.id, plots: p.manor.plots, prosperity: prosperity(p), likes: p.manor.likes || 0 };
}
