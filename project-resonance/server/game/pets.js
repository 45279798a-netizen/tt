// ─────────────────────────────────────────────
// 寵物：孵蛋取得、跟在身邊、提供被動加成
//  - 寵物蛋：世界王 / 首領突襲 / 魔物潮（擊殺夠多）會掉，也可以用金幣買
//  - 孵化隨機出一隻（依稀有度）；重複的會「升星」（每星加成 +20%，最多 5 星）
//  - 餵養：金幣 + 精華升級，最高 Lv.20
//  - 出戰中的寵物才有加成；外觀與特效在 client/src/game3d/pet.js
// ─────────────────────────────────────────────
export const PET_MAX_LV = 20;
export const PET_MAX_STAR = 5;

// rarity：1 普通 / 2 稀有 / 3 傳說（weight = 孵化機率權重）
export const PETS = {
  fox:       { id: 'fox',       name: '火尾小狐', icon: '🦊', rarity: 1, weight: 30, color: '#ff8a3a', accent: '#ffd166', bonus: { goldPct: [4, 0.4] } },
  bunny:     { id: 'bunny',     name: '雪團兔',   icon: '🐰', rarity: 1, weight: 30, color: '#f4f8ff', accent: '#9be7ff', bonus: { expPct: [5, 0.5] } },
  jelly:     { id: 'jelly',     name: '星光水母', icon: '🪼', rarity: 2, weight: 18, color: '#c98cff', accent: '#8ff3ff', bonus: { dropPct: [5, 0.5] } },
  owl:       { id: 'owl',       name: '機械貓頭鷹', icon: '🦉', rarity: 2, weight: 14, color: '#c9a06a', accent: '#7df9ff', bonus: { atkPct: [3, 0.3] } },
  babydragon:{ id: 'babydragon',name: '小龍崽',   icon: '🐲', rarity: 3, weight: 6,  color: '#5ee08a', accent: '#ffd166', bonus: { atkPct: [5, 0.45], goldPct: [4, 0.4] } },
  phoenixling:{ id: 'phoenixling', name: '小鳳凰', icon: '🐥', rarity: 3, weight: 2, color: '#ff5a1f', accent: '#ffe08a', bonus: { atkPct: [6, 0.5], dropPct: [5, 0.5] } },
};

export function petBonus(id, lv, star = 0) {
  const d = PETS[id];
  if (!d) return {};
  const out = {};
  for (const [k, [b, per]] of Object.entries(d.bonus)) out[k] = ((b + per * (lv - 1)) * (1 + star * 0.2)) / 100;
  return out;
}

export function petStats(p) {
  const s = { atkPct: 0, goldPct: 0, dropPct: 0, expPct: 0 };
  const own = p.pet && p.pets?.[p.pet];
  if (own) for (const [k, v] of Object.entries(petBonus(p.pet, own.lv, own.star))) s[k] += v;
  return s;
}

export function petFeedCost(lv) {
  return { gold: Math.floor(5000 * 1.6 ** (lv - 1)), essence: Math.ceil(4 + lv * 3) };
}

/** 用金幣買蛋：價格跟著最遠地圖的金幣尺度 */
export const eggPrice = (goldPerKill) => Math.floor(goldPerKill * 3000);

export function rollPet() {
  const list = Object.values(PETS);
  let r = Math.random() * list.reduce((n, d) => n + d.weight, 0);
  for (const d of list) { if ((r -= d.weight) < 0) return d.id; }
  return list[0].id;
}
