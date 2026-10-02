// ─────────────────────────────────────────────
// 世界王：定時出現在「有玩家在狩獵」的地圖，所有人共用一條血
//  - 出現在該地圖的決鬥場位置（空曠、靠近出生點），5 分鐘內沒打倒就離開
//  - 血量依地圖與當下在場人數調整
//  - 前端回報打到世界王的傷害，伺服器用秒傷檢查上限（防作弊）
//  - 打倒後依傷害比例發獎勵：羽晶 / 星輝羽（做翅膀）+ 金幣
// ─────────────────────────────────────────────
import crypto from 'node:crypto';
import { MAPS, AOE_TARGETS, MAX_GAP_SEC, calcStats } from './formulas.js';
import { getPlayer, giveReward, partnerMul } from './state.js';

export const BOSS_EVERY_MS = 15 * 60 * 1000;   // 每 15 分鐘一隻
export const BOSS_FIRST_MS = Number(process.env.BOSS_FIRST_SEC ?? 180) * 1000; // 開機後幾秒出第一隻（預設 3 分鐘，可用環境變數 BOSS_FIRST_SEC 改）
export const BOSS_DURATION_MS = 5 * 60 * 1000; // 5 分鐘沒打倒就離開
const BOSS_HP_MUL = 900;                       // = 該地圖小怪血量 × 900（單人約 1~3 分鐘）
const BOSS_HIT_CAP = 12;                       // 每秒最多 = 單體秒傷 × 12（含技能、暴擊、狂熱的寬限）

export const BOSSES = [
  // 世界王外觀都是吸血鬼領主（client/public/models/vampire.glb），每張地圖不同稱號
  { name: '幽林吸血鬼領主', icon: '🧛', color: '#7ed957' },
  { name: '熔血吸血鬼領主', icon: '🧛', color: '#ff6a2b' },
  { name: '霜月吸血鬼領主', icon: '🧛', color: '#6cc8ff' },
  { name: '蝕日吸血鬼領主', icon: '🧛', color: '#ffc94a' },
  { name: '幽沼吸血鬼領主', icon: '🧛', color: '#b26cff' },
  { name: '星穹吸血鬼領主', icon: '🧛', color: '#5ee7ff' },
  { name: '深淵吸血鬼女王', icon: '🧛', color: '#3fd6c6' },
  { name: '龍骸吸血鬼魔王', icon: '🧛', color: '#ff7a4a' },
];

let boss = null;
/** 某張地圖現在有哪些在線玩家（由即時連線模組提供） */
let presentIn = () => [];
export function setBossPresence(fn) { presentIn = fn; }
let nextAt = Date.now() + BOSS_FIRST_MS;

export function bossPublic() {
  if (!boss) return { next: nextAt };
  return {
    id: boss.id, mapId: boss.mapId, name: boss.name, icon: boss.icon, color: boss.color,
    hp: Math.max(0, boss.hp), maxHp: boss.maxHp, endAt: boss.endAt, mapName: MAPS[boss.mapId].name,
    fighters: Object.keys(boss.dmg).length,
  };
}

/** 給某地圖的人看（不在那張地圖就是 null） */
export function bossFor(zone) {
  return boss && boss.mapId === zone ? bossPublic() : null;
}

export function myBossDamage(id) {
  if (!boss) return 0;
  const total = Object.values(boss.dmg).reduce((a, b) => a + b, 0);
  return total > 0 ? (boss.dmg[id] || 0) / total : 0;
}

/**
 * 每秒呼叫一次
 * @param huntingCount (mapId) => 那張地圖現在有幾位在線玩家
 * @returns 要廣播的事件 [{ to: 'all' | playerId, msg }]
 */
export function bossTick(huntingCount, now = Date.now()) {
  const out = [];
  if (boss && now > boss.endAt) {
    out.push({ to: 'all', msg: { t: 'boss_flee', name: boss.name, mapName: MAPS[boss.mapId].name } });
    console.log(`[世界王] ${boss.name} 逃走了`);
    boss = null;
    nextAt = now + BOSS_EVERY_MS;
  }
  if (!boss && now >= nextAt) {
    const counts = MAPS.map((m) => huntingCount(m.id));
    const best = Math.max(...counts);
    if (best <= 0) { nextAt = now + 60_000; return out; } // 沒人在狩獵 → 1 分鐘後再看
    const choices = MAPS.filter((m) => counts[m.id] === best);
    const map = choices[Math.floor(Math.random() * choices.length)];
    const def = BOSSES[map.id] ?? BOSSES[0];
    const maxHp = map.monsterHp * BOSS_HP_MUL * (1 + 0.6 * (best - 1));
    boss = {
      id: crypto.randomBytes(4).toString('hex'), mapId: map.id, ...def,
      hp: maxHp, maxHp, startAt: now, endAt: now + BOSS_DURATION_MS, dmg: {},
    };
    out.push({ to: 'all', msg: { t: 'boss_spawn', name: def.name, icon: def.icon, mapId: map.id, mapName: map.name } });
    console.log(`[世界王] ${def.name} 出現在 ${map.name}（${best} 人在場）`);
  }
  return out;
}

/**
 * 玩家回報打到世界王的傷害（在 /api/me/sync 一起送）
 * @returns 打倒時的結算事件，否則 []
 */
export function hitBoss(playerId, rawDmg, now = Date.now()) {
  const p = getPlayer(playerId);
  const dmg = Number(rawDmg);
  if (!boss || !(dmg > 0) || p.inTown || p.inField || p.mapId !== boss.mapId) { p.lastBossHit = now; return []; }
  const elapsed = Math.min(Math.max((now - (p.lastBossHit || now - 2000)) / 1000, 0), MAX_GAP_SEC);
  p.lastBossHit = now;
  const cap = (calcStats(p).dps / AOE_TARGETS) * BOSS_HIT_CAP * partnerMul(p) * elapsed + 1;
  const value = Math.min(dmg, cap, boss.hp);
  boss.hp -= value;
  boss.dmg[playerId] = (boss.dmg[playerId] || 0) + value;
  return boss.hp <= 0 ? finish(now) : [];
}

function finish(now) {
  const b = boss;
  boss = null;
  nextAt = now + BOSS_EVERY_MS;
  const total = Object.values(b.dmg).reduce((a, c) => a + c, 0) || 1;
  const tier = b.mapId;
  // 參與者 = 有出手的人 + 王倒下時在這張地圖的人；每個人都有保底獎勵，傷害比例另外加成
  const ids = [...new Set([...Object.keys(b.dmg), ...presentIn(b.mapId)])];
  const ranking = ids.map((id) => [id, b.dmg[id] || 0]).sort((x, y) => y[1] - x[1]);
  const out = [];
  const names = [];
  ranking.forEach(([id, d], i) => {
    const share = d / total;
    const wf = Math.round((20 + 40 * share) * (1 + tier * 0.5));
    const wr = Math.round((1 + 3 * share) * (1 + tier * 0.3)) + (i === 0 && d > 0 ? 1 : 0); // 傷害第一名多 1 根星輝羽
    const gold = Math.floor(MAPS[tier].goldPerKill * 300 * (0.5 + share));
    const eggs = i === 0 && d > 0 ? 1 : Math.random() < 0.35 ? 1 : 0; // 寵物蛋：第一名必得，其他人 35%
    const p = giveReward(id, { mats: { wf, wr }, gold, eggs });
    if (!p) return;
    names.push(p.name);
    out.push({ to: id, msg: { t: 'boss_reward', name: b.name, share, rank: i + 1, wf, wr, gold, eggs } });
  });
  out.push({ to: 'all', msg: { t: 'boss_dead', name: b.name, mapName: MAPS[b.mapId].name, top: names[0] ?? '', count: names.length } });
  console.log(`[世界王] ${b.name} 被打倒（${names.join('、')}）`);
  return out;
}
