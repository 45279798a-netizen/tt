// ─────────────────────────────────────────────
// 首領突襲：隨時可開的組隊首領戰（跟定時出現的世界王不同）
//  - 開啟的人 + 同地圖在線的朋友一起進入，共用一條血（每組一個獨立首領）
//  - 首領會換三個階段（前端演出：砸地 → 星環彈幕 → 隕星雨）
//  - 時間內打倒：依傷害比例發大量獎勵；時間到沒打倒就失敗
// ─────────────────────────────────────────────
import crypto from 'node:crypto';
import { MAPS, AOE_TARGETS, MAX_GAP_SEC, calcStats, farmMul } from './formulas.js';
import { getPlayer, giveReward, partnerMul, partyMates, cdText } from './state.js';
import { GameError } from './state.js';

export const RAID_SEC = Number(process.env.RAID_SEC ?? 240);
const RAID_HP_MUL = Number(process.env.RAID_HP_MUL ?? 2500); // 該地圖小怪血量 × 2500
// 冷卻：從開打算起 15 分鐘（原本沒有冷卻：後期角色回第 1 區秒殺首領，精華 / 星輝羽 / 寵物蛋可以無限刷）
export const RAID_CD_SEC = Number(process.env.RAID_CD_SEC ?? 900);
const raids = new Map();

export function startRaid(p) {
  if (p.inTown) throw new GameError('要在狩獵地圖才能發起首領突襲');
  if (p.raidId && raids.has(p.raidId)) throw new GameError('首領突襲正在進行中');
  const now = Date.now();
  if (now < (p.raidCd || 0)) throw new GameError(`首領突襲冷卻中，還要 ${cdText(p.raidCd - now)}`);
  const mates = partyMates(p.id).map((id) => getPlayer(id)).filter((q) => q && !q.inTown && q.mapId === p.mapId && !(q.raidId && raids.has(q.raidId)) && now >= (q.raidCd || 0));
  const members = [p, ...mates];
  const maxHp = MAPS[p.mapId].monsterHp * RAID_HP_MUL * (1 + 0.6 * (members.length - 1));
  const r = {
    id: crypto.randomBytes(4).toString('hex'), mapId: p.mapId, name: '深淵吸血鬼公爵', icon: '🦇',
    hp: maxHp, maxHp, start: now, endsAt: now + RAID_SEC * 1000, members: members.map((q) => q.id), dmg: {},
  };
  raids.set(r.id, r);
  for (const q of members) { q.raidId = r.id; q.lastRaidHit = now; q.raidCd = now + RAID_CD_SEC * 1000; }
  return { id: r.id, party: members.length };
}

export function raidPublic(id) {
  const r = id && raids.get(id);
  if (!r) return null;
  return { id: r.id, mapId: r.mapId, name: r.name, icon: r.icon, hp: Math.max(0, r.hp), maxHp: r.maxHp, start: r.start, endsAt: r.endsAt, endAt: r.endsAt, party: r.members.length };
}

export function hitRaid(pid, rawDmg, now = Date.now()) {
  const p = getPlayer(pid);
  const r = p.raidId && raids.get(p.raidId);
  const dmg = Number(rawDmg);
  if (!r || !(dmg > 0) || p.inTown || p.mapId !== r.mapId || now > r.endsAt) { p.lastRaidHit = now; return []; }
  const elapsed = Math.min(Math.max((now - (p.lastRaidHit || now - 2000)) / 1000, 0), MAX_GAP_SEC);
  p.lastRaidHit = now;
  const cap = (calcStats(p).dps / AOE_TARGETS) * 12 * partnerMul(p) * elapsed + 1;
  const v = Math.min(dmg, cap, r.hp);
  r.hp -= v;
  r.dmg[pid] = (r.dmg[pid] || 0) + v;
  return r.hp <= 0 ? finish(r) : [];
}

function finish(r) {
  raids.delete(r.id);
  const total = Object.values(r.dmg).reduce((a, b) => a + b, 0) || 1;
  const tier = r.mapId;
  const out = [];
  r.members.forEach((id) => {
    const q = getPlayer(id);
    if (q?.raidId === r.id) q.raidId = null;
    const share = (r.dmg[id] || 0) / total; // 每位成員都有保底，傷害比例另外加成
    const low = q ? farmMul(q, tier) : 1; // 在低於自己進度的地圖打：每低一區 ×0.3、沒有寵物蛋
    const reward = {
      essence: Math.round((50 + 150 * share) * (1 + tier * 0.25) * low),
      mats: { wf: Math.round((30 + 60 * share) * (1 + tier * 0.3) * low), wr: Math.round((3 + 8 * share) * (1 + tier * 0.2) * low) },
      gold: Math.floor(MAPS[tier].goldPerKill * 800 * (0.5 + share)),
      lowMap: low < 1,
    };
    reward.eggs = low >= 1 ? 1 : 0; // 每人一顆寵物蛋（自己進度的地圖才有）
    giveReward(id, { mats: reward.mats, gold: reward.gold, eggs: reward.eggs });
    if (q) q.essence += reward.essence;
    out.push({ to: id, msg: { t: 'raid_reward', name: r.name, share, ...reward } });
  });
  console.log(`[首領突襲] ${r.name} 被打倒（${r.members.length} 人）`);
  return out;
}

/** 每秒：時間到沒打倒 → 失敗 */
export function raidTick(now = Date.now()) {
  const out = [];
  for (const r of raids.values()) {
    if (now <= r.endsAt) continue;
    raids.delete(r.id);
    for (const id of r.members) {
      const q = getPlayer(id);
      if (q?.raidId === r.id) q.raidId = null;
      out.push({ to: id, msg: { t: 'raid_fail', name: r.name } });
    }
  }
  return out;
}
