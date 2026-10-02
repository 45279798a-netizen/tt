// ─────────────────────────────────────────────
// 巨大首領討伐（取代原本定時出現的世界王）
//  - 專屬地圖「深淵祭壇」（村莊的首領祭司 / 傳送師可以去），首領一直待在祭壇中央
//  - 血量、防禦依「所有玩家」計算（最近 3 天有玩的真人 + AI 玩家）：
//      血量 = 大家的單體秒傷加總 × BOSS_SEC 秒 × (1 + 討伐次數 × 10%)
//      防禦 = 大家攻擊力的中位數；每個人實際造成的傷害 = 攻擊 ÷ (攻擊 + 防禦 × 0.35)
//      → 一般玩家約打出 7 成傷害；越強的人越不被防禦影響、太弱的人很難刮動它
//  - 血量會保留：不用一次打完，大家陸續上線一起把它磨倒（AI 玩家也會來打）
//  - 打倒後依傷害比例發獎勵（依每個人自己的進度換算），20 分鐘後下一隻甦醒
//  - 三隻首領輪流登場，外觀都是吸血鬼模型放大，每隻顏色 / 招式不同
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { MAPS, AOE_TARGETS, MAX_GAP_SEC, calcStats } from './formulas.js';
import { getPlayer, giveReward, partnerMul, allPlayers, saveSoon } from './state.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'boss.json');
const BOSS_SEC = Number(process.env.BOSS_SEC ?? 420);      // 全員一起打大約幾秒會倒（實際還要扣防禦）
const RESPAWN_MS = Number(process.env.BOSS_RESPAWN_SEC ?? 1200) * 1000;
const ACTIVE_MS = 3 * 24 * 3600_000;                         // 3 天內有玩的才算進首領強度
const HIT_CAP = 12;                                          // 每秒最多單體秒傷 × 12（含技能、暴擊、狂熱寬限）
export const DEF_K = 0.35;
export const MIN_MUL = 0.05;                                 // 再弱也至少打出 5%（新手也能參與）

export const BOSSES = [
  { name: '深淵巨像·泰坦', icon: '🗿', color: '#b98cff' },
  { name: '吸血鬼始祖·德古拉', icon: '🧛', color: '#ff3b5c' },
  { name: '龍骸魔王·尼德霍格', icon: '🐉', color: '#ff9a3a' },
];
export const BOSS_ZONE = 'B';

let boss = null;     // { id, kind, tier, hp, maxHp, def, dmg, gen }
let nextAt = 0;      // 死掉後下一隻甦醒的時間
let gen = 0;         // 累積討伐次數（每次 +10% 血量）
let presentIn = () => [];
export function setBossPresence(fn) { presentIn = fn; }

function load() {
  try {
    const s = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    boss = s.boss ?? null; nextAt = s.nextAt ?? 0; gen = s.gen ?? 0;
  } catch { /* 第一次開 */ }
}
let saveT = null;
function save() {
  if (saveT) return;
  saveT = setTimeout(() => {
    saveT = null;
    try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify({ boss, nextAt, gen })); } catch { /* ignore */ }
  }, 3000);
}
load();

/** 依所有玩家算出首領的強度 */
function scaleFromPlayers(now = Date.now()) {
  const active = allPlayers().filter((p) => now - (p.lastSettle || 0) < ACTIVE_MS || p.bot);
  const list = active.length ? active : allPlayers();
  if (!list.length) return { tier: 0, hp: MAPS[0].monsterHp * 3000, def: 50 };
  let dps = 0;
  const tiers = [], atks = [];
  for (const p of list) {
    const s = calcStats(p);
    dps += s.dps / AOE_TARGETS;
    atks.push(s.atk);
    tiers.push(p.maxMap || 0);
  }
  tiers.sort((a, b) => a - b);
  atks.sort((a, b) => a - b);
  // 防禦取攻擊的中位數（不用平均：少數很強的人會把防禦拉高到新手完全打不動）
  return { tier: tiers[Math.floor(tiers.length / 2)], hp: dps * BOSS_SEC, def: atks[Math.floor(atks.length / 2)] };
}

function spawn(now) {
  const sc = scaleFromPlayers(now);
  const kind = gen % BOSSES.length;
  const maxHp = Math.max(1000, sc.hp * (1 + gen * 0.1));
  boss = { id: crypto.randomBytes(4).toString('hex'), kind, tier: sc.tier, hp: maxHp, maxHp, def: sc.def, dmg: {}, gen, at: now };
  save();
  return [{ to: 'all', msg: { t: 'boss_spawn', name: BOSSES[kind].name, icon: BOSSES[kind].icon } }];
}

export function bossPublic() {
  if (!boss) return { next: nextAt, alive: false };
  const d = BOSSES[boss.kind];
  return {
    alive: true, id: boss.id, mapId: 'boss', name: d.name, icon: d.icon, color: d.color, kind: boss.kind,
    hp: Math.max(0, boss.hp), maxHp: boss.maxHp, def: boss.def, defK: DEF_K, minMul: MIN_MUL, gen: boss.gen,
    fighters: Object.keys(boss.dmg).length, tierName: MAPS[boss.tier]?.name,
  };
}
/** 只有在深淵祭壇的人看得到首領 */
export const bossFor = (zone) => (boss && zone === BOSS_ZONE ? bossPublic() : null);

export function myBossDamage(id) {
  if (!boss) return 0;
  const total = Object.values(boss.dmg).reduce((a, b) => a + b, 0);
  return total > 0 ? (boss.dmg[id] || 0) / total : 0;
}

/** 防禦減傷：每個人打出的比例 */
export const defMul = (atk, def) => Math.max(MIN_MUL, atk / (atk + def * DEF_K));

/** 每秒呼叫：沒有首領就看是不是該甦醒了 */
export function bossTick(_huntingCount, now = Date.now()) {
  if (!boss && now >= nextAt) return spawn(now);
  return [];
}

/**
 * 玩家（或 AI 玩家）打到首領的傷害（前端回報的是「已經扣過防禦」的數字）
 * @returns 打倒時的結算事件
 */
export function hitBoss(playerId, rawDmg, now = Date.now()) {
  const p = getPlayer(playerId);
  const dmg = Number(rawDmg);
  if (!boss || !(dmg > 0) || !p.inBoss) { p.lastBossHit = now; return []; }
  const elapsed = Math.min(Math.max((now - (p.lastBossHit || now - 2000)) / 1000, 0), MAX_GAP_SEC);
  p.lastBossHit = now;
  const st = calcStats(p);
  const cap = (st.dps / AOE_TARGETS) * HIT_CAP * partnerMul(p) * defMul(st.atk, boss.def * (1 - (st.talent?.defIgnore || 0))) * (1 + (st.talent?.bossDmg || 0)) * elapsed + 1;
  const value = Math.min(dmg, cap, boss.hp);
  boss.hp -= value;
  boss.dmg[playerId] = (boss.dmg[playerId] || 0) + value;
  save();
  return boss.hp <= 0 ? finish(now) : [];
}

function finish(now) {
  const b = boss;
  boss = null;
  gen += 1;
  nextAt = now + RESPAWN_MS;
  save();
  const total = Object.values(b.dmg).reduce((a, c) => a + c, 0) || 1;
  const ids = [...new Set([...Object.keys(b.dmg), ...presentIn(BOSS_ZONE)])];
  const ranking = ids.map((id) => [id, b.dmg[id] || 0]).sort((x, y) => y[1] - x[1]);
  const out = [];
  const names = [];
  ranking.forEach(([id, d], i) => {
    let p;
    try { p = getPlayer(id); } catch { return; }
    const share = d / total;
    const tier = Math.min(p.maxMap || 0, MAPS.length - 1); // 獎勵依每個人自己的進度換算
    const r = {
      wf: Math.round((25 + 80 * share) * (1 + tier * 0.3)),
      wr: Math.round((2 + 8 * share) * (1 + tier * 0.15)) + (i < 3 && d > 0 ? 1 : 0),
      essence: Math.round((40 + 200 * share) * (1 + tier * 0.25)),
      gold: Math.floor(MAPS[tier].goldPerKill * 500 * (0.5 + share)),
      eggs: i < 3 && d > 0 ? 1 : Math.random() < 0.3 ? 1 : 0,
    };
    giveReward(id, { mats: { wf: r.wf, wr: r.wr }, gold: r.gold, eggs: r.eggs });
    p.essence += r.essence;
    names.push(p.name);
    out.push({ to: id, msg: { t: 'boss_reward', name: BOSSES[b.kind].name, share, rank: i + 1, ...r } });
  });
  saveSoon();
  out.push({ to: 'all', msg: { t: 'boss_dead', name: BOSSES[b.kind].name, top: names[0] ?? '', count: names.length, next: nextAt } });
  console.log(`[巨大首領] ${BOSSES[b.kind].name} 被打倒（${names.length} 人參與，第一名 ${names[0] ?? '-'}）`);
  return out;
}
