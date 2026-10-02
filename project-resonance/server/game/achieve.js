// ─────────────────────────────────────────────
// 成就：一輩子的目標，每達成一階可以領一次獎勵 + 成就點
//  - 成就點永久加成：每 10 點攻擊、生命 +0.2%（在 formulas.calcStats 裡算）
//  - 進度都是從玩家資料直接算出來的（擊殺數、等級、地圖、收藏…），不用另外記錄
// ─────────────────────────────────────────────
import { ITEMS } from './items.js';

const mx = (arr) => (arr.length ? Math.max(...arr) : 0);
export const ACHIEVEMENTS = [
  { id: 'kills', name: '魔物剋星', icon: '⚔️', unit: '隻', tiers: [1000, 10_000, 100_000, 1_000_000], value: (p) => p.totalKills || 0 },
  { id: 'level', name: '身經百戰', icon: '📈', unit: '級（含轉職）', tiers: [50, 100, 250, 500], value: (p) => (p.level || 0) + (p.rebirth || 0) * 100 },
  { id: 'maps', name: '探險家', icon: '🗺️', unit: '區', tiers: [2, 4, 6, 8], value: (p) => (p.maxMap || 0) + 1 },
  { id: 'rebirth', name: '輪迴之路', icon: '🌟', unit: '轉', tiers: [1, 3, 5], value: (p) => p.rebirth || 0 },
  { id: 'enhance', name: '強化大師', icon: '✨', unit: '級', tiers: [10, 30, 60], value: (p) => mx((p.inv || []).map((x) => x.lv || 0)) },
  { id: 'grade', name: '神匠', icon: '⚒️', unit: '', tiers: [2, 3, 4], tierNames: ['擁有稀有裝備', '擁有傳說裝備', '擁有星輝武器'], value: (p) => mx((p.inv || []).map((x) => x.grade || 0)) },
  { id: 'craft', name: '圖鑑收集', icon: '📒', unit: '種', tiers: [10, 25, 50], value: (p) => (p.codex || []).filter((id) => ITEMS[id]).length },
  { id: 'mounts', name: '馴獸師', icon: '🐎', unit: '隻', tiers: [2, 5, 10], value: (p) => Object.keys(p.mounts || {}).length },
  { id: 'wings', name: '天空之翼', icon: '🪽', unit: '對', tiers: [1, 3, 6], value: (p) => Object.keys(p.wings || {}).length },
  { id: 'pets', name: '寵物達人', icon: '🐾', unit: '隻', tiers: [2, 4, 6], value: (p) => Object.keys(p.pets || {}).length },
  { id: 'pvp', name: '決鬥王', icon: '🏆', unit: '勝', tiers: [1, 10, 50], value: (p) => p.pvp?.w || 0 },
  { id: 'friends', name: '人緣好', icon: '👫', unit: '位', tiers: [1, 5, 10], value: (p) => (p.friends || []).length },
  { id: 'trial', name: '潮汐守門人', icon: '🌀', unit: '隻', tiers: [300, 800, 1500], value: (p) => p.trialBest || 0 },
];
const POINTS = [10, 20, 40, 80];

export const achievePoints = (p) => p.ach?.points || 0;
/** 成就點的永久加成 */
// v0.5 平衡：每 10 點 +0.5% → 全部做完 +75% 太多，改成 +0.2%（全部做完約 +30%）
export const achieveBonus = (p) => (Math.floor(achievePoints(p) / 10) * 0.2) / 100;

export function achieveReward(tier, goldPerKill) {
  return { essence: 40 * (tier + 1), gold: Math.floor(goldPerKill * 500 * (tier + 1)), eggs: tier >= 2 ? 1 : 0, points: POINTS[tier] };
}

export function achieveView(p, goldPerKill) {
  const claimed = p.ach?.claimed || {};
  return {
    points: achievePoints(p), bonus: achieveBonus(p),
    list: ACHIEVEMENTS.map((a) => {
      const v = a.value(p);
      return {
        id: a.id, name: a.name, icon: a.icon, unit: a.unit, value: v,
        tiers: a.tiers.map((t, i) => ({ target: t, label: a.tierNames?.[i], done: v >= t, claimed: !!claimed[`${a.id}:${i}`], reward: achieveReward(i, goldPerKill) })),
      };
    }),
  };
}

/** 可以領的數量（紅點用） */
export const achieveClaimable = (p) => ACHIEVEMENTS.reduce((n, a) => n + a.tiers.filter((t, i) => a.value(p) >= t && !p.ach?.claimed?.[`${a.id}:${i}`]).length, 0);
