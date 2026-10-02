// ─────────────────────────────────────────────
// 免洗版魔物獵人：魔物、素材、裝備、套裝
// 3 張地圖，每張一種魔物 → 2 種素材 → 一套裝備（3 種武器 + 4 件防具）
// ─────────────────────────────────────────────

export const SLOTS = ['weapon', 'helm', 'armor', 'gloves', 'boots'];

// 三種武器：秒傷相同（公平），手感不同
//  大劍：攻擊力最高、出手慢、範圍大
//  太刀：攻擊力中等、出手快、居合範圍長
//  雙劍：攻擊力最低、攻速最快、範圍小
export const WEAPON_TYPES = {
  great:  { id: 'great',  name: '大劍', atkMul: 1.0,  dpsMul: 1.0,  interval: 0.8,  radius: 4.2 },
  katana: { id: 'katana', name: '太刀', atkMul: 0.9,  dpsMul: 1.11, interval: 0.5,  radius: 3.8 },
  dual:   { id: 'dual',   name: '雙劍', atkMul: 0.72, dpsMul: 1.39, interval: 0.28, radius: 3.0 },
  // 星杖：遠程魔法，第四章（烈陽聖域）起才做得出來
  staff:  { id: 'staff',  name: '星杖', atkMul: 0.92, dpsMul: 1.08, interval: 0.6,  radius: 7.0, fromSet: 3 },
  // 長槍：中距離直線穿刺、雷龍系；長弓：遠程射手、風系（第一區就做得出來）
  spear:  { id: 'spear',  name: '長槍', atkMul: 0.86, dpsMul: 1.163, interval: 0.55, radius: 5.2 },
  bow:    { id: 'bow',    name: '長弓', atkMul: 0.9,  dpsMul: 1.111, interval: 0.55, radius: 9.0 },
  // 鐮刀：中距離大範圍橫掃、暗影系；拳套：超近距離極快連打、烈火系
  scythe: { id: 'scythe', name: '鐮刀', atkMul: 0.95, dpsMul: 1.053, interval: 0.7,  radius: 4.8 },
  fist:   { id: 'fist',   name: '拳套', atkMul: 0.66, dpsMul: 1.515, interval: 0.22, radius: 2.8 },
};
const STAFF_NAMES = { 3: '烈陽星杖', 4: '幽沼星杖', 5: '星界星杖', 6: '深潮星杖', 7: '龍魂星杖' };
const EXTRA_NAMES = {
  spear: ['翠刺長槍', '熔岩龍槍', '霜牙冰槍', '日輪聖槍', '幽沼魔槍', '星界天槍', '海皇三叉戟', '龍骸穿心槍'],
  bow: ['翠羽長弓', '炎心火弓', '霜語冰弓', '烈陽金弓', '幽影魔弓', '星辰神弓', '潮汐珊瑚弓', '龍脊破天弓'],
  scythe: ['翠藤鐮', '熔獄鐮', '霜魂鐮', '日蝕鐮', '幽冥鐮', '星滅鐮', '深淵潮鐮', '龍骨死神鐮'],
  fist: ['翠葉拳套', '熔岩拳套', '霜牙拳套', '烈陽拳套', '幽沼拳套', '星界拳套', '海潮拳套', '龍爪拳套'],
};
export const SLOT_LABEL = { weapon: '武器', helm: '頭盔', armor: '胸甲', gloves: '護手', boots: '護腿' };

const MONSTERS = [
  { monster: '翠團史萊姆', set: '翠團', mats: ['翠綠黏液', '史萊姆核'], weapon: ['黏液大劍', '翠葉太刀', '黏黏雙刃'] },
  { monster: '熔岩甲獸', set: '熔岩', mats: ['熔岩甲殼', '炎心'], weapon: ['熔岩大劍', '炎心太刀', '熔火雙刃'] },
  { monster: '霜牙冰靈', set: '霜語', mats: ['冰晶鱗', '霜牙'], weapon: ['霜牙大劍', '冰華太刀', '霜語雙刃'] },
  { monster: '烈陽守衛', set: '烈陽', mats: ['日輝砂', '太陽晶核'], weapon: ['烈陽大劍', '日冕太刀', '曜光雙刃'] },
  { monster: '沼影巨魔', set: '幽沼', mats: ['腐沼苔', '幽影晶'], weapon: ['幽沼大劍', '影蝕太刀', '沼霧雙刃'] },
  { monster: '星界巨魔', set: '星界', mats: ['星塵碎片', '天穹之心'], weapon: ['星界大劍', '天穹太刀', '星辰雙刃'] },
  { monster: '珊瑚海妖', set: '潮汐', mats: ['潮汐鱗', '深海明珠'], weapon: ['潮汐大劍', '海嵐太刀', '珊瑚雙刃'] },
  { monster: '骸骨龍兵', set: '龍骸', mats: ['龍骨碎片', '龍魂結晶'], weapon: ['龍骸大劍', '龍牙太刀', '龍爪雙刃'] },
];

// 素材掉落率（每擊殺一隻的期望值，伺服器用累積小數結算，不靠運氣）
// 稀有素材是主要的節奏控制：約 2.5 隻/秒 × 菁英加成 ≈ 每秒 4.4 份收益
export const DROP = { common: 0.15, rare: 0.006 }; // 怪變多後下調，維持原本的進度節奏

// 每往後一區：素材需求 ×TIER_MATS、金幣售價 ×(金幣收益成長 × TIER_MATS)
// → 每一區「做齊一套」要花的時間大約是上一區的 TIER_MATS 倍
export const TIER_MATS = 2.2;
export const TIER_GOLD = 22; // 跟 formulas.js 的金幣 / 擊殺成長一致
export const LATE_MATS = 1.9; // 第 4 區以後每區素材需求成長（v0.5：1.15 → 1.9，模擬原本 18 小時就破完 8 區）

// 換到下一區，需要擁有目前這區套裝幾件（像魔物獵人的升階條件）
export const UNLOCK_PIECES = 3;

// 每部位的基礎數值（會乘上 30^地圖，跟怪物血量同步成長）
const PIECES = {
  weapon: { atk: 300, common: 70, rare: 5, gold: 2400 },
  helm:   { def: 50, hp: 250, common: 45, rare: 3, gold: 1400 },
  armor:  { def: 80, hp: 400, common: 60, rare: 4, gold: 1900 },
  gloves: { def: 40, hp: 200, common: 35, rare: 2, gold: 1000 },
  boots:  { def: 50, hp: 250, common: 45, rare: 3, gold: 1400 },
};
const PIECE_NAME = { helm: '頭盔', armor: '胸甲', gloves: '護手', boots: '護腿' };

export const MATERIALS = {};
export const ITEMS = {
  starter_weapon: { id: 'starter_weapon', slot: 'weapon', wtype: 'great', set: -1, name: '新手木劍', atk: 5, def: 0, hp: 0, recipe: {}, gold: 0 },
};
export const SETS = [];

MONSTERS.forEach((m, i) => {
  const a = `m${i}a`, b = `m${i}b`;
  MATERIALS[a] = { id: a, name: m.mats[0], set: i, rare: false };
  MATERIALS[b] = { id: b, name: m.mats[1], set: i, rare: true };

  const scale = 30 ** i;
  // 越後面的裝備需要越多素材；第 3 區之後（第 4 區起）成長放緩成每區 ×1.15，後期不會太難拿
  const k = TIER_MATS ** Math.min(i, 2) * LATE_MATS ** Math.max(0, i - 2);
  const g = TIER_GOLD ** i * TIER_MATS ** Math.min(i, 2) * LATE_MATS ** Math.max(0, i - 2);
  const recipe = (p) => ({ [a]: Math.ceil(p.common * k), [b]: Math.ceil(p.rare * k) });
  for (const [slot, p] of Object.entries(PIECES)) {
    if (slot === 'weapon') {
      // 同一隻魔物可以做三種武器（id：大劍沿用舊的 s0_weapon，存檔相容）
      ['great', 'katana', 'dual', 'staff', 'spear', 'bow', 'scythe', 'fist'].forEach((wt, j) => {
        if (i < (WEAPON_TYPES[wt].fromSet ?? 0)) return; // 星杖：第四章起
        const id = wt === 'great' ? `s${i}_weapon` : `s${i}_${wt}`;
        ITEMS[id] = {
          id, slot, wtype: wt, set: i, name: wt === 'staff' ? STAFF_NAMES[i] ?? `星杖·${i + 1}` : EXTRA_NAMES[wt]?.[i] ?? m.weapon[j],
          atk: p.atk * scale * WEAPON_TYPES[wt].atkMul, def: 0, hp: 0,
          recipe: recipe(p), gold: Math.floor(p.gold * g),
        };
      });
      continue;
    }
    const id = `s${i}_${slot}`;
    ITEMS[id] = {
      id, slot, set: i,
      name: `${m.set}${PIECE_NAME[slot]}`,
      atk: 0,
      def: p.def * scale,
      hp: p.hp * scale,
      recipe: recipe(p),
      gold: Math.floor(p.gold * g),
    };
  }
  SETS.push({
    id: i, name: m.set, monster: m.monster, mats: [a, b],
    bonus: [
      { pieces: 3, text: '攻擊 +15%' },
      { pieces: 5, text: '攻擊 +30%、生命 +20%' },
    ],
  });
});

// 世界王素材（做翅膀 / 升級翅膀），不屬於任何一區
MATERIALS.wf = { id: 'wf', name: '羽晶', set: -1, rare: false, color: '#b9a6ff', boss: true };
MATERIALS.wr = { id: 'wr', name: '星輝羽', set: -1, rare: true, color: '#ffd166', boss: true };

/** 穿戴中「件數最多的套裝」的加成；templateIds = 身上 5 個部位的裝備模板 id */
export function setBonus(templateIds) {
  const count = {};
  for (const id of templateIds) {
    const it = ITEMS[id];
    if (it && it.set >= 0) count[it.set] = (count[it.set] || 0) + 1;
  }
  let best = -1, n = 0;
  for (const [s, c] of Object.entries(count)) if (c > n) { n = c; best = Number(s); }
  return {
    set: best,
    pieces: n,
    atkMul: n >= 5 ? 1.3 : n >= 3 ? 1.15 : 1,
    hpMul: n >= 5 ? 1.2 : 1,
  };
}
