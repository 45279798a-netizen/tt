// ─────────────────────────────────────────────
// 寵物：孵蛋取得、跟在身邊、提供被動加成
//  - 寵物蛋：巨大首領 / 首領突襲 / 魔物潮（擊殺夠多）/ 試煉之塔（每 10 層）會掉，也可以用金幣買
//  - v0.6：6 隻 → 15 隻（新增生命、暴擊率、暴擊傷害類加成）
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
  // ── v0.6 新寵物 ──
  slime:     { id: 'slime',     name: '果凍史萊姆', icon: '🟢', rarity: 1, weight: 28, color: '#6fe36a', accent: '#d8ffb0', bonus: { expPct: [4, 0.4], goldPct: [2, 0.2] } },
  turtle:    { id: 'turtle',    name: '苔蘚小龜',   icon: '🐢', rarity: 1, weight: 26, color: '#7aa85a', accent: '#c9a66b', bonus: { hpPct: [6, 0.6] } },
  penguin:   { id: 'penguin',   name: '冰晶企鵝',   icon: '🐧', rarity: 1, weight: 26, color: '#2e3a52', accent: '#9be7ff', bonus: { goldPct: [5, 0.45] } },
  bat:       { id: 'bat',       name: '夜行小蝙蝠', icon: '🦇', rarity: 2, weight: 14, color: '#4a3a6a', accent: '#ff5a7a', bonus: { critRate: [1.5, 0.12] } },
  ghost:     { id: 'ghost',     name: '南瓜幽靈',   icon: '🎃', rarity: 2, weight: 14, color: '#ff9a3a', accent: '#b98cff', bonus: { goldPct: [4, 0.4], dropPct: [4, 0.4] } },
  golem:     { id: 'golem',     name: '水晶魔像',   icon: '💎', rarity: 2, weight: 12, color: '#7ab8ff', accent: '#e0f4ff', bonus: { hpPct: [5, 0.45], atkPct: [2, 0.2] } },
  unicorn:   { id: 'unicorn',   name: '迷你獨角獸', icon: '🦄', rarity: 2, weight: 10, color: '#fff4fb', accent: '#ff9ad5', bonus: { dropPct: [5, 0.45], expPct: [4, 0.4] } },
  kirin:     { id: 'kirin',     name: '麒麟寶寶',   icon: '🦌', rarity: 3, weight: 3,  color: '#ffd166', accent: '#5ee0c8', bonus: { atkPct: [5, 0.45], critDmg: [8, 0.8] } },
  starwhale: { id: 'starwhale', name: '星辰小鯨',   icon: '🐋', rarity: 3, weight: 1.5, color: '#3a5ab8', accent: '#ffe7a0', bonus: { atkPct: [4, 0.4], goldPct: [4, 0.4], expPct: [4, 0.4] } },
};

export function petBonus(id, lv, star = 0) {
  const d = PETS[id];
  if (!d) return {};
  const out = {};
  for (const [k, [b, per]] of Object.entries(d.bonus)) out[k] = ((b + per * (lv - 1)) * (1 + star * 0.2)) / 100;
  return out;
}

export function petStats(p) {
  const s = { atkPct: 0, goldPct: 0, dropPct: 0, expPct: 0, hpPct: 0, critRate: 0, critDmg: 0 };
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
