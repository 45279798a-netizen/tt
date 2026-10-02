// ─────────────────────────────────────────────
// 試煉之塔（v0.6 新模式）：一層一層往上爬的單人挑戰
//  - 每層 60 秒內打倒全部怪物 + 樓層守衛就算通關，失敗可以無限重來
//  - 強度是「固定」的（不跟著玩家變強）：每 25 層 ≈ 往後一張地圖的怪物強度，共 200 層
//      怪物血量 = 50 × 30^((層數 − 1) ÷ 25) × 1.2；數量 10 → 20 隻；守衛 = 一般怪 15 倍血
//  - 首次通關才有獎勵：精華 + 金幣；每 5 層 +1 天賦點（最多 40 點）+ 星輝羽；每 10 層寵物蛋
//  - 在塔裡打倒的怪不算一般擊殺（不給經驗 / 掉落），獎勵全部在通關時發
//  - 伺服器驗證：用自己的秒傷估算 60 秒內最多打得出多少傷害，打不動的樓層回報通關會被拒絕
// ─────────────────────────────────────────────
import { MAPS, calcStats } from './formulas.js';
import { GameError, partnerMul } from './state.js';
import { TOWER_TALENT_EVERY } from './talents.js';
import { dailyAdd } from './daily.js';

export const TOWER_MAX = 200;
export const FLOOR_SEC = Number(process.env.TOWER_SEC ?? 60);
const FLOORS_PER_TIER = 25;
const GUARD_MUL = 15;
const SLACK = 3; // 驗證寬限（技能、暴擊、狂熱、寵物、夥伴都算在裡面）

export function floorInfo(f) {
  const tier = Math.min(MAPS.length - 1, Math.floor((f - 1) / FLOORS_PER_TIER));
  const hp = 50 * 30 ** ((f - 1) / FLOORS_PER_TIER) * 1.2;
  const count = Math.min(20, 10 + Math.floor(f / 10));
  return { floor: f, tier, hp, count, guardMul: GUARD_MUL, totalHp: hp * (count + GUARD_MUL), sec: FLOOR_SEC };
}

export function floorReward(f) {
  const { tier } = floorInfo(f);
  return {
    essence: 10 + f * 2,
    gold: Math.floor(MAPS[tier].goldPerKill * 120),
    wr: f % TOWER_TALENT_EVERY === 0 ? 1 + tier : 0,
    talent: f % TOWER_TALENT_EVERY === 0 && f <= 200 ? 1 : 0,
    eggs: f % 10 === 0 ? 1 : 0,
  };
}

export function towerView(p) {
  const best = p.towerBest || 0;
  const next = Math.min(TOWER_MAX, best + 1);
  return {
    best, max: TOWER_MAX, next, done: best >= TOWER_MAX,
    nextInfo: floorInfo(next), nextReward: floorReward(next),
    talentFromTower: Math.min(40, Math.floor(best / TOWER_TALENT_EVERY)),
    active: p.tower && p.inTower ? { ...p.tower, ...floorInfo(p.tower.floor) } : null,
  };
}

/** 進塔挑戰下一層（從村莊或在塔裡通關後直接接下一層） */
export function startFloor(p) {
  const best = p.towerBest || 0;
  if (best >= TOWER_MAX) throw new GameError('已經登頂了！');
  const now = Date.now();
  p.inTown = false; p.inField = false; p.inBoss = false; p.inTower = true;
  p.mapId = Math.min(p.maxMap, MAPS.length - 1);
  p.tower = { floor: best + 1, start: now, endsAt: now + FLOOR_SEC * 1000 };
  return { ...floorInfo(best + 1), endsAt: p.tower.endsAt };
}

/** 前端回報：全部打倒了 */
export function clearFloor(p) {
  const t = p.tower;
  if (!t || !p.inTower) throw new GameError('沒有在挑戰中');
  const now = Date.now();
  const elapsed = (now - t.start) / 1000;
  if (now > t.endsAt + 3000) { p.tower = null; throw new GameError('時間到了，挑戰失敗'); }
  const info = floorInfo(t.floor);
  const st = calcStats(p);
  const canDeal = st.dps * st.skillMul * partnerMul(p) * (1 + (st.talent?.towerDmg || 0)) * Math.max(elapsed, 3) * SLACK;
  if (elapsed < 3 || canDeal < info.totalHp) { p.tower = null; throw new GameError('實力不足，伺服器判定無法通關這一層'); }
  p.tower = null;
  if (t.floor <= (p.towerBest || 0)) return { floor: t.floor, first: false };
  p.towerBest = t.floor;
  const r = floorReward(t.floor);
  p.essence += r.essence;
  p.gold += r.gold;
  p.mats.wr = (p.mats.wr || 0) + r.wr;
  p.eggs += r.eggs;
  dailyAdd(p, 'tower');
  return { floor: t.floor, first: true, ...r, sec: Math.round(elapsed) };
}

/** 時間到 / 自己放棄 */
export function failFloor(p) {
  const f = p.tower?.floor;
  p.tower = null;
  return { floor: f ?? null };
}
