// ─────────────────────────────────────────────
// 天賦樹：三條分支（戰鬥 / 守護 / 財富），用天賦點學習
//  - 天賦點 = 等級 ÷ 4（無條件捨去）+ 每轉職一次 25 點 → 轉職後等級歸零但點數不會白費
//  - 每個分支 4 層：上一層要在「同一分支」投入夠多點才解鎖（第 2 層 5 點、第 3 層 15 點、第 4 層 25 點）
//  - 可以花金幣全部重置
//  - 效果：數值類在 formulas.calcStats 裡算；狂熱 / 首領傷害 / 暈眩這類在前端用 stats.talent 判斷
// ─────────────────────────────────────────────
export const TALENT_TIER_REQ = [0, 5, 15, 25];

// per：每一級的效果（百分比數字 → /100），max：最高等級
export const TALENTS = {
  // ── 戰鬥（紅）──
  w_atk:     { branch: 'war', tier: 0, name: '攻擊強化', icon: '⚔️', max: 5, per: { atkPct: 2 }, desc: '攻擊 +2% / 級' },
  w_crit:    { branch: 'war', tier: 0, name: '精準', icon: '🎯', max: 5, per: { critRate: 1 }, desc: '暴擊率 +1% / 級' },
  w_critdmg: { branch: 'war', tier: 1, name: '致命一擊', icon: '💥', max: 5, per: { critDmg: 5 }, desc: '暴擊傷害 +5% / 級' },
  w_skill:   { branch: 'war', tier: 1, name: '技能精通', icon: '📖', max: 5, per: { skillDmg: 3 }, desc: '技能傷害 +3% / 級' },
  w_cdr:     { branch: 'war', tier: 2, name: '疾風', icon: '🌪️', max: 5, per: { cdr: 2 }, desc: '技能冷卻 -2% / 級' },
  w_berserk: { branch: 'war', tier: 3, name: '狂戰之魂', icon: '🔥', max: 1, per: { atkPct: 10, feverTime: 3 }, desc: '攻擊 +10%，狂熱多 3 秒' },
  // ── 守護（藍）──
  g_hp:      { branch: 'guard', tier: 0, name: '強健體魄', icon: '❤️', max: 5, per: { hpPct: 3 }, desc: '生命 +3% / 級' },
  g_def:     { branch: 'guard', tier: 0, name: '鐵壁', icon: '🛡️', max: 5, per: { defPct: 3 }, desc: '防禦 +3% / 級' },
  g_boss:    { branch: 'guard', tier: 1, name: '屠龍者', icon: '🐉', max: 5, per: { bossDmg: 5 }, desc: '對世界王 / 首領傷害 +5% / 級' },
  g_ride:    { branch: 'guard', tier: 1, name: '騎術', icon: '🐎', max: 5, per: { mountSpeed: 3 }, desc: '騎乘速度 +3% / 級' },
  g_vigor:   { branch: 'guard', tier: 2, name: '不屈', icon: '🗿', max: 5, per: { hpPct: 4, defPct: 4 }, desc: '生命、防禦 +4% / 級' },
  g_aegis:   { branch: 'guard', tier: 3, name: '守護神', icon: '✨', max: 1, per: { hpPct: 10, stun: 50 }, desc: '生命 +10%，被暈眩時間減半' },
  // ── 財富（金）──
  f_gold:    { branch: 'fortune', tier: 0, name: '生財有道', icon: '💰', max: 5, per: { goldPct: 4 }, desc: '金幣獲取 +4% / 級' },
  f_exp:     { branch: 'fortune', tier: 0, name: '博學', icon: '📚', max: 5, per: { expPct: 4 }, desc: '經驗獲取 +4% / 級' },
  f_drop:    { branch: 'fortune', tier: 1, name: '尋寶', icon: '🔍', max: 5, per: { dropPct: 4 }, desc: '素材掉落 +4% / 級' },
  f_essence: { branch: 'fortune', tier: 1, name: '精華萃取', icon: '💠', max: 5, per: { essence: 10 }, desc: '分解得到的精華 +10% / 級' },
  f_fever:   { branch: 'fortune', tier: 2, name: '熱血', icon: '⚡', max: 5, per: { feverGain: 10 }, desc: '狂熱累積速度 +10% / 級' },
  f_luck:    { branch: 'fortune', tier: 3, name: '幸運星', icon: '🍀', max: 1, per: { luck: 50 }, desc: '鍛造出傳說 / 星輝的機率 ×1.5' },
};
export const BRANCHES = { war: { name: '戰鬥', color: '#ff6a5a' }, guard: { name: '守護', color: '#5fa8ff' }, fortune: { name: '財富', color: '#ffd166' } };

export const talentPoints = (p) => Math.floor((p.level || 1) / 4) + (p.rebirth || 0) * 25;
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
  if (spentPoints(p) >= talentPoints(p)) return '天賦點不夠（每 4 級 1 點，轉職一次 +25 點）';
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
