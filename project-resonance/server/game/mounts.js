// ─────────────────────────────────────────────
// 坐騎：馬廄·阿蹄 那裡買、餵養升級
//  - 騎乘中移動速度 ×speed（可以邊騎邊砍）
//  - 「出戰中」的坐騎永遠提供被動加成（不用一直騎著）
//  - 收藏加成：每擁有一隻坐騎，攻擊 +COLLECT_ATK（全部收集 +12%）
//  - 升級：金幣 + 💠鍛造精華，被動加成隨等級成長，上限 MOUNT_MAX_LV
// 外觀在 client/src/game3d/mountModel.js
// ─────────────────────────────────────────────

export const MOUNT_MAX_LV = 20;
export const COLLECT_ATK = 0.03;

// bonus: { 屬性: [基礎, 每級] }（百分比數字，跟裝備附加屬性同單位）
// tier：用哪一區的金幣尺度算升級費用（天馬 = 3，最貴）
export const MOUNTS = {
  pony: {
    id: 'pony', name: '草原小馬', icon: '🐴', model: 'horse', tier: 0, speed: 1.35,
    color: '#b07a45', accent: '#f3e3c0',
    desc: '翠綠森林的溫馴小馬，新手的第一匹坐騎',
    bonus: { goldPct: [6, 1] },
    cost: { gold: 5000, mats: { m0a: 120, m0b: 6 } },
  },
  raptor: {
    id: 'raptor', name: '熔岩迅龍', icon: '🦎', model: 'raptor', tier: 1, speed: 1.5,
    color: '#5a2a1e', accent: '#ff7a2f',
    desc: '在熔岩上奔跑的蜥龍，背甲會發出熔光',
    bonus: { dropPct: [8, 1] },
    cost: { gold: 290_000, mats: { m1a: 260, m1b: 13 } },
  },
  wolf: {
    id: 'wolf', name: '霜牙雪狼', icon: '🐺', model: 'wolf', tier: 2, speed: 1.6,
    color: '#dfe9f5', accent: '#6cc8ff',
    desc: '霜雪遺跡的狼王，跑過的地方會留下冰晶',
    bonus: { atkPct: [6, 0.6] },
    cost: { gold: 16_000_000, mats: { m2a: 520, m2b: 26 } },
  },
  whale: {
    id: 'whale', name: '星辰鯨', icon: '🐋', model: 'whale', tier: 2, reqMap: 2, speed: 1.7,
    color: '#2a4a9a', accent: '#8ff3ff',
    desc: '在雲海裡悠游的巨鯨，身後拖著一道極光。抵達霜雪遺跡後可以喚醒',
    bonus: { expPct: [10, 1], goldPct: [6, 0.8] },
    cost: { gold: 1_200_000, essence: 200, mats: { m2a: 300, m2b: 25, wf: 60 } },
  },
  phoenix: {
    id: 'phoenix', name: '炎煌鳳凰', icon: '🔥', model: 'phoenix', tier: 3, reqMap: 3, speed: 1.85,
    color: '#ff5a1f', accent: '#ffd166',
    desc: '浴火重生的神鳥，展翅時整片天空都燒起來。抵達烈陽聖域後可以喚醒',
    bonus: { atkPct: [8, 0.7], expPct: [10, 1] },
    cost: { gold: 18_000_000, essence: 400, mats: { m3a: 300, m3b: 30, wr: 12 } },
  },
  qilin: {
    id: 'qilin', name: '雷光麒麟', icon: '⚡', model: 'qilin', tier: 4, reqMap: 4, speed: 1.9,
    color: '#2a3a6e', accent: '#7df9ff',
    desc: '踏著雷電奔馳的瑞獸，蹄下劈啪作響。抵達幽影沼澤後可以喚醒',
    bonus: { atkPct: [9, 0.8], goldPct: [10, 1], dropPct: [8, 1] },
    cost: { gold: 500_000_000, essence: 600, mats: { m4a: 400, m4b: 40, wr: 20 } },
  },
  dragon: {
    id: 'dragon', name: '天穹神龍', icon: '🐉', model: 'dragon', tier: 5, reqMap: 5, speed: 2.0,
    color: '#f2d27a', accent: '#5ee7ff',
    desc: '盤踞在星界天穹的神龍，飛行時捲起雲霧與星光。要抵達星界天穹才能喚醒',
    bonus: { atkPct: [10, 0.8], goldPct: [10, 1], dropPct: [10, 1] },
    cost: { gold: 6_000_000_000, essence: 900, mats: { m4b: 120, m5b: 120, wr: 30 } },
  },
  pegasus: {
    id: 'pegasus', name: '星輝天馬', icon: '🦄', model: 'pegasus', tier: 3, speed: 1.8,
    color: '#f7f3ff', accent: '#f5c04a',
    desc: '傳說中的天馬，要集齊前三區的稀有素材才能喚醒',
    bonus: { goldPct: [8, 1], dropPct: [8, 1] },
    cost: { gold: 80_000_000, essence: 300, mats: { m0b: 60, m1b: 60, m2b: 60 } },
  },
};

/** 某隻坐騎在某等級的被動加成（小數，例如 0.06 = 6%） */
export function mountBonus(id, lv) {
  const m = MOUNTS[id];
  const out = {};
  if (!m) return out;
  for (const [k, [base, per]] of Object.entries(m.bonus)) out[k] = (base + per * (lv - 1)) / 100;
  return out;
}

/** 升到下一級的花費 */
export function mountUpgradeCost(id, lv) {
  const m = MOUNTS[id];
  const goldBase = m.cost.gold * 0.12;
  return {
    gold: Math.floor(goldBase * 1.22 ** (lv - 1)),
    essence: Math.ceil(lv * 1.5 * (m.tier + 1)),
  };
}

/** 玩家身上所有坐騎帶來的加成：出戰坐騎的被動 + 收藏攻擊 */
export function mountStats(p) {
  const s = { atkPct: 0, goldPct: 0, dropPct: 0, expPct: 0, speed: 1 };
  const owned = Object.keys(p.mounts || {}).filter((id) => MOUNTS[id]);
  s.atkPct += owned.length * COLLECT_ATK;
  const cur = p.mount && p.mounts?.[p.mount] ? p.mount : null;
  if (cur) {
    for (const [k, v] of Object.entries(mountBonus(cur, p.mounts[cur].lv))) s[k] += v;
    s.speed = MOUNTS[cur].speed;
  }
  return s;
}
