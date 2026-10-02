// ─────────────────────────────────────────────
// 轉職：每到 Lv.100 可以轉職一次（最多 5 轉），在村莊「轉職殿堂」找轉職導師
//  - 轉職後等級回到 Lv.1，換來永久加成（等級本身的數值很小，掉回 1 等幾乎不影響戰力）
//  - 每一轉：攻擊 / 生命 +10%、暴擊率 +1.5%、暴擊傷害 +8%、經驗 +15%
//           技能傷害 +6%、技能冷卻 -3%、裝備強化上限 +5
//  - 依武器職業有進階稱號（大劍 狂戰士 → 破軍 → 劍聖 → 武神 → 天崩劍帝 …），名字旁顯示、別人看得到
//  - 腳下常駐轉職光環（three.quarks），顏色依轉數；轉職瞬間有大型儀式特效
//  - 第 N 轉要先到過第 N 區（1 轉 = 熔岩峽谷）；花費：金幣（跟最遠地圖成長）+ 精華 + 星輝羽
//  - 轉職後升級需要的經驗 ×(1 + 轉數 × 1.5)，每一輪會越來越久
// ─────────────────────────────────────────────
// （不 import formulas.js，避免循環引用：地圖資料由呼叫端傳進來）

export const REBIRTH_LV = 100;
export const REBIRTH_MAX = 5;
export const REBIRTH_PER = {
  // v0.5 平衡：原本 5 轉疊到攻擊 +75%、技能 +50%，太膨脹
  atkPct: 0.1, hpPct: 0.1, critRate: 0.015, critDmg: 0.08, expPct: 0.15,
  skillDmg: 0.06, cdr: 0.03, enhanceCap: 5,
};
export const REBIRTH_EXP_MUL = 1.5;

// 每個武器職業 5 轉的進階稱號
export const CLASS_TITLES = {
  great: ['狂戰士', '破軍', '劍聖', '武神', '天崩劍帝'],
  katana: ['居合士', '劍豪', '刀聖', '月影', '無雙劍神'],
  dual: ['刃舞者', '修羅', '鬼人', '夜叉', '阿修羅王'],
  staff: ['星術士', '占星師', '星導者', '星辰賢者', '星界主宰'],
  spear: ['槍兵', '龍騎士', '雷槍將', '天槍', '雷龍神'],
  bow: ['獵人', '遊俠', '風之射手', '神射手', '星落弓神'],
};
// 轉職光環顏色（1 ~ 5 轉）
export const REBIRTH_COLORS = ['#7ed957', '#6cc8ff', '#c98cff', '#ffd166', '#ff5a7a'];

export const rebirthOf = (p) => Math.min(REBIRTH_MAX, Math.max(0, p.rebirth || 0));
export const titleOf = (p, wtype) => {
  const n = rebirthOf(p);
  return n > 0 ? CLASS_TITLES[wtype]?.[n - 1] ?? CLASS_TITLES.great[n - 1] : null;
};

/** n 轉的累積加成 */
export function rebirthBonus(n) {
  const out = {};
  for (const [k, v] of Object.entries(REBIRTH_PER)) out[k] = v * n;
  return out;
}

/** 下一轉的條件與花費（MAPS 由呼叫端傳入） */
export function rebirthNext(p, MAPS) {
  const n = rebirthOf(p);
  if (n >= REBIRTH_MAX) return null;
  const tier = Math.min(Math.max(0, p.maxMap), MAPS.length - 1);
  const needMap = Math.min(n + 1, MAPS.length - 1);
  return {
    turn: n + 1,
    level: REBIRTH_LV,
    needMap, needMapName: MAPS[needMap].name,
    cost: {
      gold: Math.floor(MAPS[tier].goldPerKill * 20000 * (n + 1)),
      essence: 300 * (n + 1),
      mats: { wr: 10 * (n + 1) },
    },
    reward: { eggs: 1, essence: 0 },
  };
}
