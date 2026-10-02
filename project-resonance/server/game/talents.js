// ─────────────────────────────────────────────
// 天賦樹：三條分支（戰鬥 / 守護 / 財富），用天賦點學習
//  - 天賦點 = 等級 ÷ 4（無條件捨去）+ 每轉職一次 25 點 + 試煉之塔每 5 層 1 點（最多 40 點）
//  - v0.6 擴充：每個分支 6 層（原本 4 層一下就點滿）：
//      第 2 層 5 點、第 3 層 15 點、第 4 層 30 點、第 5 層 50 點、第 6 層 70 點
//    前三層的天賦上限 5 → 10 級、每級效果減半（總效果不變，但要花兩倍點數）
//    第 6 層有「精通」：最多 30 級的無底洞，給後期的點數一個去處
//  - 全部點滿約 300 點（5 轉滿等 150 點 + 試煉之塔 40 點 → 要挑選）
//  - 可以花金幣全部重置
//  - 效果：數值類在 formulas.calcStats 裡算；狂熱 / 首領傷害 / 破甲 / 暈眩這類在前端用 stats.talent 判斷
// ─────────────────────────────────────────────
export const TALENT_TIER_REQ = [0, 5, 15, 30, 50, 70];
export const TALENT_VERSION = 2;

// per：每一級的效果（百分比數字 → /100），max：最高等級
export const TALENTS = {
  // ── 戰鬥（紅）──
  w_atk:     { branch: 'war', tier: 0, name: '攻擊強化', icon: '⚔️', max: 10, per: { atkPct: 1 }, desc: '攻擊 +1% / 級' },
  w_crit:    { branch: 'war', tier: 0, name: '精準', icon: '🎯', max: 10, per: { critRate: 0.5 }, desc: '暴擊率 +0.5% / 級' },
  w_critdmg: { branch: 'war', tier: 1, name: '致命一擊', icon: '💥', max: 10, per: { critDmg: 2.5 }, desc: '暴擊傷害 +2.5% / 級' },
  w_skill:   { branch: 'war', tier: 1, name: '技能精通', icon: '📖', max: 10, per: { skillDmg: 1.5 }, desc: '技能傷害 +1.5% / 級' },
  w_cdr:     { branch: 'war', tier: 2, name: '疾風', icon: '🌪️', max: 10, per: { cdr: 1 }, desc: '技能冷卻 -1% / 級' },
  w_berserk: { branch: 'war', tier: 3, name: '狂戰之魂', icon: '🔥', max: 1, per: { atkPct: 10, feverTime: 3 }, desc: '攻擊 +10%，狂熱多 3 秒' },
  w_rend:    { branch: 'war', tier: 4, name: '破甲', icon: '🪓', max: 10, per: { defIgnore: 3 }, desc: '無視巨大首領 3% 防禦 / 級' },
  w_weapon:  { branch: 'war', tier: 4, name: '武器大師', icon: '🗡️', max: 10, per: { skillDmg: 1, critDmg: 2 }, desc: '技能傷害 +1%、暴擊傷害 +2% / 級' },
  w_god:     { branch: 'war', tier: 5, name: '戰神降臨', icon: '👹', max: 1, per: { atkPct: 15, cdr: 5 }, desc: '攻擊 +15%，技能冷卻 -5%' },
  w_mastery: { branch: 'war', tier: 5, name: '戰鬥精通', icon: '♾️', max: 30, per: { atkPct: 0.5 }, desc: '攻擊 +0.5% / 級（最多 30 級）' },
  // ── 守護（藍）──
  g_hp:      { branch: 'guard', tier: 0, name: '強健體魄', icon: '❤️', max: 10, per: { hpPct: 1.5 }, desc: '生命 +1.5% / 級' },
  g_def:     { branch: 'guard', tier: 0, name: '鐵壁', icon: '🛡️', max: 10, per: { defPct: 1.5 }, desc: '防禦 +1.5% / 級' },
  g_boss:    { branch: 'guard', tier: 1, name: '屠龍者', icon: '🐉', max: 10, per: { bossDmg: 2.5 }, desc: '對巨大首領 / 首領傷害 +2.5% / 級' },
  g_ride:    { branch: 'guard', tier: 1, name: '騎術', icon: '🐎', max: 10, per: { mountSpeed: 1.5 }, desc: '騎乘速度 +1.5% / 級' },
  g_vigor:   { branch: 'guard', tier: 2, name: '不屈', icon: '🗿', max: 10, per: { hpPct: 2, defPct: 2 }, desc: '生命、防禦 +2% / 級' },
  g_aegis:   { branch: 'guard', tier: 3, name: '守護神', icon: '✨', max: 1, per: { hpPct: 10, stun: 50 }, desc: '生命 +10%，被暈眩時間減半' },
  g_titan:   { branch: 'guard', tier: 4, name: '巨人殺手', icon: '🏔️', max: 10, per: { bossDmg: 2, towerDmg: 2 }, desc: '對首領、試煉之塔守衛傷害 +2% / 級' },
  g_bulwark: { branch: 'guard', tier: 4, name: '堡壘', icon: '🏰', max: 10, per: { hpPct: 1.5, defPct: 1.5 }, desc: '生命、防禦 +1.5% / 級' },
  g_immortal:{ branch: 'guard', tier: 5, name: '不朽', icon: '🌟', max: 1, per: { hpPct: 15, bossDmg: 10 }, desc: '生命 +15%，首領傷害 +10%' },
  g_mastery: { branch: 'guard', tier: 5, name: '守護精通', icon: '♾️', max: 30, per: { hpPct: 0.5, defPct: 0.5 }, desc: '生命、防禦 +0.5% / 級（最多 30 級）' },
  // ── 財富（金）──
  f_gold:    { branch: 'fortune', tier: 0, name: '生財有道', icon: '💰', max: 10, per: { goldPct: 2 }, desc: '金幣獲取 +2% / 級' },
  f_exp:     { branch: 'fortune', tier: 0, name: '博學', icon: '📚', max: 10, per: { expPct: 2 }, desc: '經驗獲取 +2% / 級' },
  f_drop:    { branch: 'fortune', tier: 1, name: '尋寶', icon: '🔍', max: 10, per: { dropPct: 2 }, desc: '素材掉落 +2% / 級' },
  f_essence: { branch: 'fortune', tier: 1, name: '精華萃取', icon: '💠', max: 10, per: { essence: 5 }, desc: '分解得到的精華 +5% / 級' },
  f_fever:   { branch: 'fortune', tier: 2, name: '熱血', icon: '⚡', max: 10, per: { feverGain: 5 }, desc: '狂熱累積速度 +5% / 級' },
  f_luck:    { branch: 'fortune', tier: 3, name: '幸運星', icon: '🍀', max: 1, per: { luck: 50 }, desc: '鍛造出傳說 / 星輝的機率 ×1.5' },
  f_trader:  { branch: 'fortune', tier: 4, name: '商人', icon: '🏪', max: 10, per: { tradeFee: 0.5 }, desc: '交易所手續費 -0.5% / 級' },
  f_scholar: { branch: 'fortune', tier: 4, name: '學者', icon: '🎓', max: 10, per: { expPct: 2, dropPct: 1 }, desc: '經驗 +2%、素材掉落 +1% / 級' },
  f_midas:   { branch: 'fortune', tier: 5, name: '點金手', icon: '👑', max: 1, per: { goldPct: 20, luck: 25 }, desc: '金幣 +20%，鍛造好運再 +25%' },
  f_mastery: { branch: 'fortune', tier: 5, name: '財富精通', icon: '♾️', max: 30, per: { goldPct: 0.5, expPct: 0.5, dropPct: 0.5 }, desc: '金幣、經驗、掉落 +0.5% / 級（最多 30 級）' },
};
export const BRANCHES = { war: { name: '戰鬥', color: '#ff6a5a' }, guard: { name: '守護', color: '#5fa8ff' }, fortune: { name: '財富', color: '#ffd166' } };

export const TOWER_TALENT_EVERY = 5;
export const towerTalentPoints = (p) => Math.min(40, Math.floor((p.towerBest || 0) / TOWER_TALENT_EVERY));
export const talentPoints = (p) => Math.floor((p.level || 1) / 4) + (p.rebirth || 0) * 25 + towerTalentPoints(p);

/** 舊存檔（v1：前三層上限 5、效果是現在的 2 倍）→ 等級 ×2，效果不變 */
export function migrateTalents(p) {
  if ((p.talentVer || 1) >= TALENT_VERSION) return;
  for (const [id, lv] of Object.entries(p.talents || {})) if (TALENTS[id] && TALENTS[id].tier <= 2) p.talents[id] = Math.min(TALENTS[id].max, lv * 2);
  p.talentVer = TALENT_VERSION;
  if (spentPoints(p) > talentPoints(p)) p.talents = {}; // 點數不夠就免費重置
}
export const spentPoints = (p) => Object.values(p.talents || {}).reduce((n, v) => n + v, 0);
const spentIn = (p, branch) => Object.entries(p.talents || {}).reduce((n, [id, v]) => n + (TALENTS[id]?.branch === branch ? v : 0), 0);

/** 所有天賦加總（小數，例如 0.06 = 6%） */
export function talentStats(p) {
  const s = {};
  for (const [id, lv] of Object.entries(p.talents || {})) {
    const t = TALENTS[id];
    if (!t || !lv) continue;
    for (const [k, v] of Object.entries(t.per)) s[k] = (s[k] || 0) + (v * lv) / 100;
  }
  return s;
}

/** 回傳錯誤訊息（可以學就回傳 null） */
export function canLearn(p, id) {
  const t = TALENTS[id];
  if (!t) return '沒有這個天賦';
  const lv = p.talents?.[id] || 0;
  if (lv >= t.max) return '已經學滿了';
  if (spentPoints(p) >= talentPoints(p)) return '天賦點不夠（每 4 級 1 點、轉職一次 +25 點、試煉之塔每 5 層 1 點）';
  if (spentIn(p, t.branch) < TALENT_TIER_REQ[t.tier]) return `要先在「${BRANCHES[t.branch].name}」投入 ${TALENT_TIER_REQ[t.tier]} 點`;
  return null;
}

export function learnTalent(p, id) {
  const err = canLearn(p, id);
  if (err) return err;
  p.talents ||= {};
  p.talents[id] = (p.talents[id] || 0) + 1;
  return null;
}

/** AI 玩家：有點數就隨機往戰鬥 / 財富點 */
export function autoTalents(p) {
  const order = Object.keys(TALENTS).filter((id) => TALENTS[id].branch !== 'guard' || Math.random() < 0.3);
  for (let i = 0; i < 200 && spentPoints(p) < talentPoints(p); i++) {
    const ok = order.filter((id) => !canLearn(p, id));
    if (!ok.length) break;
    learnTalent(p, ok[Math.floor(Math.random() * ok.length)]);
  }
}
