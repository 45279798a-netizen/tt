// ─────────────────────────────────────────────
// 即時連線：同地圖互相看見 + PvP 決鬥
//
// 兩種連線方式，前端自動選：
//  1. WebSocket（/ws）：最即時
//  2. HTTP 輪詢（POST /api/rt）：WebSocket 被通道 / 防毒 / 瀏覽器擋掉時的備援
// 兩種方式收發的訊息格式完全一樣。
//
// 前端 → 伺服器
//   { t: 'hello', token }                        （只有 WebSocket 需要）
//   { t: 'pos', x, z, ry, mv, rd }                位置（rd = 騎乘中）
//   { t: 'fx', k }                                出招特效（給別人看）
//   { t: 'duel_req', target, mode }               發起決鬥（mode: fair 公平 / power 戰力）
//   { t: 'duel_answer', from, accept }            回覆邀請
//   { t: 'hit', k }                               決鬥中出手（伺服器判定有沒有打中）
//   { t: 'duel_leave' }                           投降 / 離開
// 伺服器 → 前端
//   { t: 'state', players }                       同地圖的人（決鬥中只有對手）
//   { t: 'fx', id, k, x, z, ry }
//   { t: 'duel_invite', from, name, mode }
//   { t: 'duel_info', text }                      拒絕 / 逾時等提示
//   { t: 'duel_start', duel }                     開打（含倒數）
//   { t: 'duel_hp', hp, maxHp, hit }              血量更新
//   { t: 'duel_end', winner, reason }
// ─────────────────────────────────────────────
import { WebSocketServer } from 'ws';
import crypto from 'node:crypto';
import { publicInfo, playerByToken, recordDuel, setPartyCounter, setPartyMembers } from './state.js';
import { WEAPON_TYPES } from './items.js';
import { SKILLS } from './skills.js';
import { bossTick, bossFor, setBossPresence } from './boss.js';
import { raidTick } from './raid.js';

const TICK_MS = 100;
const HTTP_TIMEOUT_MS = 5000;
const COUNTDOWN_MS = 3000;
const DUEL_TIME_MS = 90_000;
const INVITE_TTL_MS = 20_000;
const ARENA_RADIUS = 14;

const num = (v, lo, hi) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 0);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** playerId → 連線資料 */
const clients = new Map();
/** duelId → 決鬥 */
const duels = new Map();
/** 被邀請者 id → { from, mode, at } */
const invites = new Map();

// ── 送訊息（WebSocket 直接送，輪詢模式先排隊） ──
function send(c, obj) {
  if (!c) return;
  if (c.ws) { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(obj)); }
  else if (c.queue.length < 80) c.queue.push(obj);
}

function newClient(id, ws) {
  return { id, x: 0, z: 0, ry: 0, mv: 0, rd: 0, ws, queue: [], lastSeen: Date.now(), fxBudget: 20, duel: null };
}

function join(c, mode) {
  const info = publicInfo(c.id);
  const where = info?.inTown ? '村莊' : `第 ${(info?.mapId ?? 0) + 1} 區`;
  console.log(`[連線] ${info?.name ?? c.id} 進入${where}（${mode === 'ws' ? 'WebSocket' : '相容模式'}）`);
}

function leave(c) {
  if (clients.get(c.id) !== c) return;
  const info = publicInfo(c.id);
  console.log(`[連線] ${info?.name ?? c.id} 離開`);
  if (c.duel) endDuel(duels.get(c.duel), otherSide(duels.get(c.duel), c.id), '對手離線了');
  clients.delete(c.id);
}

// ── 一般訊息處理（兩種連線共用） ─────────────
function handle(c, m) {
  if (!m || typeof m !== 'object') return;
  c.lastSeen = Date.now();
  switch (m.t) {
    case 'pos':
      c.x = num(m.x, -110, 110);
      c.z = num(m.z, -110, 110);
      c.ry = num(m.ry, -10, 10);
      c.mv = m.mv ? 1 : 0;
      c.rd = m.rd && !c.duel ? 1 : 0;
      c.mz = typeof m.mz === 'string' ? m.mz.slice(0, 64) : null; // 在誰的莊園（null = 不在莊園）
      break;
    case 'fx': broadcastFx(c, m.k); break;
    case 'duel_req': duelRequest(c, String(m.target || ''), m.mode === 'power' ? 'power' : 'fair'); break;
    case 'duel_answer': duelAnswer(c, String(m.from || ''), !!m.accept); break;
    case 'hit': duelHit(c, String(m.k || '')); break;
    case 'duel_leave': if (c.duel) endDuel(duels.get(c.duel), otherSide(duels.get(c.duel), c.id), '對手投降了'); break;
    default:
  }
}

function broadcastFx(c, kind) {
  if (typeof kind !== 'string' || c.fxBudget <= 0) return;
  c.fxBudget -= 1; // 防洗頻
  const fx = { t: 'fx', id: c.id, k: kind.slice(0, 10), x: c.x, z: c.z, ry: c.ry };
  for (const o of audienceOf(c)) send(o, fx);
}

/** 誰看得到 c：決鬥中只有對手；平常是同地圖、沒在決鬥的人 */
function audienceOf(c) {
  if (c.duel) {
    const d = duels.get(c.duel);
    return d ? [clients.get(otherSide(d, c.id))].filter(Boolean) : [];
  }
  const me = publicInfo(c.id);
  if (!me) return [];
  return [...clients.values()].filter((o) => o.id !== c.id && !o.duel && (o.mz ?? null) === (c.mz ?? null) && publicInfo(o.id)?.zone === me.zone);
}

/** 組隊加成用：同一張狩獵地圖（不含村莊、不含決鬥中）還有幾位在線玩家 */
function partyCount(id) {
  const c = clients.get(id);
  if (!c || c.duel || Date.now() - c.lastSeen > 15_000) return 0;
  const me = publicInfo(id);
  if (!me || me.inTown) return 0;
  let n = 0;
  for (const o of clients.values()) {
    if (o.id === id || o.duel || Date.now() - o.lastSeen > 15_000) continue;
    if (publicInfo(o.id)?.zone === me.zone) n++;
  }
  return n;
}
setPartyCounter(partyCount);
setBossPresence((mapId) => [...clients.values()].filter((o) => Date.now() - o.lastSeen < 15_000 && !o.duel && (() => { const i = publicInfo(o.id); return i && !i.inTown && i.mapId === mapId; })()).map((o) => o.id));
setPartyMembers((id) => {
  const me = publicInfo(id);
  if (!me || me.inTown) return [];
  return [...clients.values()].filter((o) => o.id !== id && !o.duel && Date.now() - o.lastSeen < 15_000 && publicInfo(o.id)?.zone === me.zone).map((o) => o.id);
});

/** 世界王：在同一張狩獵地圖才看得到 */
function bossOf(c) {
  const me = publicInfo(c.id);
  return me && !me.inTown && !c.duel ? bossFor(me.zone) : null;
}

/** 某張狩獵地圖現在有幾位在線玩家（世界王選地圖用） */
function huntingCount(mapId) {
  let n = 0;
  for (const c of clients.values()) {
    if (Date.now() - c.lastSeen > 15_000) continue;
    const info = publicInfo(c.id);
    if (info && !info.inTown && info.mapId === mapId) n++;
  }
  return n;
}

/** 送出世界王事件：to = 'all'（所有在線玩家）或某位玩家 id */
export function deliver(events) {
  for (const { to, msg } of events) {
    if (to === 'all') for (const c of clients.values()) send(c, msg);
    else send(clients.get(to), msg);
  }
}
setInterval(() => { deliver(bossTick(huntingCount)); deliver(raidTick()); }, 1000);

function visibleTo(c) {
  return audienceOf(c).map((o) => ({ ...publicInfo(o.id), x: o.x, z: o.z, ry: o.ry, mv: o.mv, rd: o.rd })).filter((p) => p.id);
}

// ── 決鬥 ──────────────────────────────────────
const otherSide = (d, id) => (d ? (d.a === id ? d.b : d.a) : null);

function duelRequest(c, targetId, mode) {
  const t = clients.get(targetId);
  const me = publicInfo(c.id);
  if (!t || !me || targetId === c.id) return send(c, { t: 'duel_info', text: '對方不在線上' });
  if (c.duel || t.duel) return send(c, { t: 'duel_info', text: '對方正在決鬥中' });
  if (me.inTown || publicInfo(targetId)?.inTown) return send(c, { t: 'duel_info', text: '村莊是和平區，到狩獵地圖才能決鬥' });
  if (invites.has(targetId)) return send(c, { t: 'duel_info', text: '對方還有別的邀請沒回覆' });
  invites.set(targetId, { from: c.id, mode, at: Date.now() });
  send(t, { t: 'duel_invite', from: c.id, name: me.name, mode, cp: me.cp });
  send(c, { t: 'duel_info', text: `已向 ${publicInfo(targetId)?.name} 發出決鬥邀請…` });
}

function duelAnswer(c, fromId, accept) {
  const inv = invites.get(c.id);
  if (!inv || inv.from !== fromId) return;
  invites.delete(c.id);
  const from = clients.get(fromId);
  if (!accept) return send(from, { t: 'duel_info', text: `${publicInfo(c.id)?.name} 拒絕了決鬥` });
  if (!from || from.duel || c.duel) return send(c, { t: 'duel_info', text: '對方已離開' });
  startDuel(from, c, inv.mode);
}

/** 公平模式大家一樣強；戰力模式用真實戰力 */
function power(d, id) {
  return d.mode === 'fair' ? 10_000 : Math.max(1, publicInfo(id)?.cp ?? 1);
}

function startDuel(ca, cb, mode) {
  const id = crypto.randomBytes(6).toString('hex');
  const d = { id, a: ca.id, b: cb.id, mode, startAt: Date.now() + COUNTDOWN_MS, endAt: Date.now() + COUNTDOWN_MS + DUEL_TIME_MS, hp: {}, maxHp: {}, last: {}, over: false };
  for (const pid of [d.a, d.b]) {
    d.maxHp[pid] = power(d, pid) * 0.4; // 同戰力約 15 秒分勝負
    d.hp[pid] = d.maxHp[pid];
    d.last[pid] = {};
  }
  duels.set(id, d);
  ca.duel = cb.duel = id;
  // 兩人出生在競技場左右兩側
  Object.assign(ca, { x: -7, z: 0 });
  Object.assign(cb, { x: 7, z: 0 });
  for (const [c, spawn] of [[ca, { x: -7, z: 0, ry: Math.PI / 2 }], [cb, { x: 7, z: 0, ry: -Math.PI / 2 }]]) {
    const opp = otherSide(d, c.id);
    send(c, {
      t: 'duel_start',
      duel: {
        id, mode, spawn, countdown: COUNTDOWN_MS, timeLimit: DUEL_TIME_MS, arena: ARENA_RADIUS,
        me: c.id, opp, oppName: publicInfo(opp)?.name, hp: d.hp, maxHp: d.maxHp,
      },
    });
  }
  console.log(`[決鬥] ${publicInfo(d.a)?.name} vs ${publicInfo(d.b)?.name}（${mode === 'fair' ? '公平' : '戰力'}）`);
}

// 各招式在 PvP 的倍率（以「每秒傷害」為單位）、射程、最短間隔（秒）
// 技能的數值統一定義在 skills.js
const BASIC_CD = { great: 0.4, katana: 0.3, dual: 0.25, staff: 0.35, spear: 0.35, bow: 0.35 };
function pvpMove(k, wtype) {
  const w = WEAPON_TYPES[wtype] ?? WEAPON_TYPES.great;
  if (k === 'atk') return { mult: w.interval, range: w.radius + (wtype === 'katana' ? 3 : 1.5), gap: w.interval * 0.45 };
  if (k === 'basic') { // 強力普攻可以狂點：三職業狂點都 ≈ 每秒 2 秒份（冷卻跟前端 WEAPON_STYLE 一致）
    const cd = BASIC_CD[wtype] ?? 0.4;
    return { mult: cd * 2, range: { katana: 9, staff: 11, spear: 8, bow: 11 }[wtype] ?? 6, gap: cd * 0.85 };
  }
  const sk = SKILLS[k];
  if (!sk || sk.cls !== wtype) return null; // 不是自己職業的技能 → 不算
  return { mult: sk.pvp.mult, range: sk.pvp.range, gap: sk.cd * 0.85 };
}

function duelHit(c, k) {
  const d = c.duel && duels.get(c.duel);
  if (!d || d.over || Date.now() < d.startAt) return;
  const att = publicInfo(c.id);
  const oppId = otherSide(d, c.id);
  const opp = clients.get(oppId);
  const mv = att && pvpMove(k, att.wtype);
  if (!mv || !opp || mv.mult <= 0) return;

  const now = Date.now();
  if (now - (d.last[c.id][k] || 0) < mv.gap * 1000) return; // 太快 → 不算
  if (dist(c, opp) > mv.range + 2) return;                    // 打不到
  d.last[c.id][k] = now;

  const crit = Math.random() < (att.wtype === 'katana' ? 0.3 : 0.2);
  const dmg = power(d, c.id) * 0.01 * mv.mult * (crit ? 1.5 : 1);
  d.hp[oppId] = Math.max(0, d.hp[oppId] - dmg);
  const msg = { t: 'duel_hp', hp: d.hp, maxHp: d.maxHp, hit: { by: c.id, to: oppId, k, dmg, crit } };
  send(c, msg);
  send(opp, msg);
  if (d.hp[oppId] <= 0) endDuel(d, c.id, '擊倒對手');
}

function endDuel(d, winner, reason) {
  if (!d || d.over) return;
  d.over = true;
  const loser = otherSide(d, winner);
  recordDuel(winner, loser);
  for (const pid of [d.a, d.b]) {
    const c = clients.get(pid);
    if (c && c.duel === d.id) {
      c.duel = null;
      send(c, { t: 'duel_end', winner, winnerName: publicInfo(winner)?.name, reason, hp: d.hp, maxHp: d.maxHp });
    }
  }
  duels.delete(d.id);
  console.log(`[決鬥] ${publicInfo(winner)?.name} 獲勝（${reason}）`);
}

// ── WebSocket ────────────────────────────────
export function attachRealtime(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    let c = null;
    ws.on('message', (raw) => {
      if (raw.length > 512) return;
      let m;
      try { m = JSON.parse(raw); } catch { return; }
      if (m.t === 'hello') {
        let p;
        try { p = playerByToken(m.token); } catch { return ws.close(4004, 'bad token'); }
        const old = clients.get(p.id);
        if (old?.ws && old.ws !== ws) { old.ws.onclose = null; old.ws.close(4000, 'replaced'); }
        c = newClient(p.id, ws);
        if (old?.duel) c.duel = old.duel; // 斷線重連還在同一場決鬥
        clients.set(p.id, c);
        join(c, 'ws');
        return;
      }
      if (c) handle(c, m);
    });
    ws.on('close', () => { if (c) leave(c); });
    ws.on('error', () => {});
  });

  setInterval(() => {
    const now = Date.now();
    for (const c of [...clients.values()]) {
      c.fxBudget = Math.min(20, c.fxBudget + 2);
      if (!c.ws && now - c.lastSeen > HTTP_TIMEOUT_MS) { leave(c); continue; }
      if (c.ws?.readyState === 1) c.ws.send(JSON.stringify({ t: 'state', players: visibleTo(c), boss: bossOf(c) }));
    }
    for (const [to, inv] of invites) {
      if (now - inv.at > INVITE_TTL_MS) { invites.delete(to); send(clients.get(inv.from), { t: 'duel_info', text: '對方沒有回應決鬥邀請' }); }
    }
    for (const d of duels.values()) {
      if (now > d.endAt) { // 時間到：血量比例高的贏
        const ra = d.hp[d.a] / d.maxHp[d.a], rb = d.hp[d.b] / d.maxHp[d.b];
        endDuel(d, ra >= rb ? d.a : d.b, '時間到，血量較多');
      }
    }
  }, TICK_MS);
}

// ── HTTP 輪詢備援 ────────────────────────────
export function httpRealtime(id, body) {
  let c = clients.get(id);
  if (!c || c.ws) {
    if (c?.ws) { c.ws.onclose = null; c.ws.close(4000, 'replaced'); }
    const duel = c?.duel ?? null;
    c = newClient(id, null);
    c.duel = duel;
    clients.set(id, c);
    join(c, 'http');
  }
  c.lastSeen = Date.now();
  if (body?.pos) handle(c, { t: 'pos', ...body.pos });
  for (const m of (Array.isArray(body?.msgs) ? body.msgs.slice(0, 20) : [])) handle(c, m);
  return { players: visibleTo(c), boss: bossOf(c), events: c.queue.splice(0) };
}

/** 給好友系統：這個人在不在線 */
export function isOnline(id) {
  return clients.has(id);
}

/** 給好友系統：推播通知（不在線就算了） */
export function notify(id, obj) {
  send(clients.get(id), obj);
}
