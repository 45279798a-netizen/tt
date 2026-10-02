// ─────────────────────────────────────────────
// 裝備實體：每次鍛造都會骰出不同數值
//  - 主屬性浮動 85%~115%
//  - 品質：普通 / 精良 / 稀有 / 傳說 → 附加屬性 1~4 條
//  - 強化等級綁在這件裝備上（換裝不繼承）
//  - 分解 → 鍛造精華 + 退一部分素材
//  - 精華用途：強化、洗鍊（重骰附加屬性）
// ─────────────────────────────────────────────
import crypto from 'node:crypto';
import { ITEMS } from './items.js';

export const GRADES = [
  { id: 0, name: '普通', color: '#d6d3e0', chance: 0.50, affixes: 1, mainBonus: 0 },
  { id: 1, name: '精良', color: '#5ee08a', chance: 0.30, affixes: 2, mainBonus: 0.03 },
  { id: 2, name: '稀有', color: '#5fa8ff', chance: 0.15, affixes: 3, mainBonus: 0.06 },
  { id: 3, name: '傳說', color: '#ffae3d', chance: 0.05, affixes: 4, mainBonus: 0.10 },
  // 星輝：武器才有，0.5% 機率（從傳說的機率裡分出來）；5 條附加、主屬性 +18%
  { id: 4, name: '星輝', color: '#9be7ff', chance: 0.005, affixes: 5, mainBonus: 0.18, weaponOnly: true },
];

// 附加屬性：都用百分比，才能跟著指數成長的數值一起用
export const AFFIXES = {
  atkPct:   { name: '攻擊',     min: 2, max: 10, unit: '%', slots: ['weapon', 'gloves', 'helm'] },
  hpPct:    { name: '生命',     min: 2, max: 10, unit: '%', slots: ['armor', 'boots', 'helm'] },
  defPct:   { name: '防禦',     min: 2, max: 10, unit: '%', slots: ['armor', 'boots', 'gloves'] },
  critRate: { name: '暴擊率',   min: 1, max: 5,  unit: '%', slots: ['weapon', 'gloves', 'helm'] },
  critDmg:  { name: '暴擊傷害', min: 4, max: 20, unit: '%', slots: ['weapon', 'gloves', 'boots'] },
  goldPct:  { name: '金幣獲取', min: 3, max: 12, unit: '%', slots: ['helm', 'armor', 'boots', 'gloves'] },
  expPct:   { name: '經驗獲取', min: 3, max: 12, unit: '%', slots: ['helm', 'armor', 'boots'] },
  dropPct:  { name: '素材掉落', min: 3, max: 10, unit: '%', slots: ['weapon', 'helm', 'gloves', 'boots'] },
};

export const INV_LIMIT = 120;
export const ENHANCE_PER_LV = 0.06; // 每強化一級，主屬性 +6%

const rnd = (a, b) => a + Math.random() * (b - a);

function rollGrade(slot) {
  let r = Math.random();
  for (const g of [...GRADES].reverse()) {
    if (g.weaponOnly && slot !== 'weapon') continue;
    if (r < g.chance) return g.id;
    r -= g.chance;
  }
  return 0;
}

function rollAffixes(slot, n) {
  const pool = Object.entries(AFFIXES).filter(([, a]) => a.slots.includes(slot)).map(([k]) => k);
  const picked = [];
  while (picked.length < n && pool.length) picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return picked.map((k) => {
    const a = AFFIXES[k];
    return { k, v: Math.round(rnd(a.min, a.max) * 10) / 10 };
  });
}

/** 鍛造出一件新裝備（可指定品質，用於舊存檔轉換） */
export function rollItem(base, forced = {}) {
  const t = ITEMS[base];
  const grade = forced.grade ?? rollGrade(t.slot);
  return {
    uid: crypto.randomBytes(5).toString('hex'),
    base,
    grade,
    q: forced.q ?? Math.round(rnd(0.85, 1.15) * 1000) / 1000, // 主屬性浮動
    lv: forced.lv ?? 0,
    aff: rollAffixes(t.slot, GRADES[grade].affixes),
    lock: false,
    at: Date.now(),
  };
}

/** 主屬性倍率：浮動 × 品質加成 × 強化 */
export function mainMul(inst) {
  return inst.q * (1 + GRADES[inst.grade].mainBonus) * (1 + inst.lv * ENHANCE_PER_LV);
}

/** 強化上限：第 N 套 = 10 × (N + 2)，新手武器 10 */
export function enhanceCap(inst) {
  return 10 * ((ITEMS[inst.base]?.set ?? -1) + 2);
}

/** 第 lv → lv+1 級要幾個精華（強化、分解退還共用） */
const essenceFor = (lv, tier) => Math.ceil((lv + 1) * (tier + 1) * ENHANCE_ESSENCE);
export const ENHANCE_ESSENCE = 0.3;

/** 強化花費：金幣（跟裝備階級一起成長）+ 精華 */
export function enhanceCost(inst) {
  const t = ITEMS[inst.base];
  const tier = Math.max(0, t.set);
  return {
    gold: Math.floor(60 * 22 ** tier * 1.15 ** inst.lv),
    essence: essenceFor(inst.lv, tier),
  };
}

/** 洗鍊花費 */
export function rerollCost(inst) {
  const tier = Math.max(0, ITEMS[inst.base].set);
  return { gold: Math.floor(100 * 22 ** tier), essence: 4 * (tier + 1) * (inst.grade + 1) };
}

/** 分解獲得：精華（階級 × 品質，加上一半強化投入）+ 退 25% 普通素材 */
export function dismantleYield(inst) {
  const t = ITEMS[inst.base];
  const tier = Math.max(0, t.set);
  let spent = 0;
  for (let i = 0; i < inst.lv; i++) spent += essenceFor(i, tier);
  const essence = (2 + inst.grade * 3) * (tier + 1) + Math.floor(spent * 0.5);
  const mats = {};
  for (const [m, n] of Object.entries(t.recipe || {})) {
    const back = Math.floor(n * 0.25);
    if (back > 0) mats[m] = back;
  }
  return { essence, mats };
}

/** 洗鍊：品質不變，附加屬性全部重骰 */
export function reroll(inst) {
  inst.aff = rollAffixes(ITEMS[inst.base].slot, GRADES[inst.grade].affixes);
}

/** 身上所有附加屬性加總（百分比 → 小數） */
export function sumAffixes(insts) {
  const s = { atkPct: 0, hpPct: 0, defPct: 0, critRate: 0, critDmg: 0, goldPct: 0, expPct: 0, dropPct: 0 };
  for (const it of insts) for (const a of it?.aff || []) s[a.k] += a.v / 100;
  return s;
}
