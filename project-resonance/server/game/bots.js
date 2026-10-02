// ─────────────────────────────────────────────
// AI 玩家：伺服器上自己玩遊戲的「電腦帳號」，讓只有兩三個人的私服也熱鬧
//  - 第一次開機自動註冊 BOTS 個帳號（預設 10，環境變數 BOTS=0 可關掉），每個人有固定愛用的武器
//  - 剛建立時「快轉」0.5 ~ 20 小時的遊玩進度，所以有新手也有老手
//  - 會自己上線 / 下線（一次玩 15 ~ 60 分鐘、休息 5 ~ 30 分鐘）
//  - 上線時大多在「緣起獵場」，有時去自己最遠的地圖或在村莊逛；一樣會走路、騎坐騎、打怪、放技能
//    → 真人在同一張地圖會看到他們，他們的普攻 / 技能也會打到你畫面上的怪（像組隊一樣）
//  - 收益跟真人一樣走伺服器結算（settle），效率比真人低一點；會回村鍛造、強化、換裝、分解、
//    買坐騎、孵蛋、轉職、加天賦、去下一區
//  - 加 AI 玩家好友會在幾秒後自動接受；找他們決鬥會被婉拒
// ─────────────────────────────────────────────
import { botMarketTick } from './market.js';
import { MAP_DEFS } from '../../client/src/game3d/maps.js';
import { MAPS, calcStats, calcCP, calcRates } from './formulas.js';
import { ITEMS, SLOTS, SETS, WEAPON_TYPES } from './items.js';
import { CLASS_SKILLS } from './skills.js';
import { MOUNTS } from './mounts.js';
import { enhanceCost } from './gear.js';
import * as S from './state.js';
import { botJoin, botLeave, botFx, humansIn, deliver } from './realtime.js';
import { bossPublic, hitBoss, defMul } from './boss.js';

const BOT_COUNT = Math.max(0, Math.min(40, Number(process.env.BOTS ?? 10)));
const NAMES = ['小藍莓', '阿翔', '柚子茶', '夜行貓', '星野', '咖哩飯', '路過的勇者', '阿肥', '小雨', '風間',
  '米糕', '肉圓', '黑糖珍奶', '雪莉', '大頭', '月見', '哈密瓜', '鹹酥雞', '綠茶', '小火龍',
  '布丁', '阿貴', '芒果冰', '夜嵐', '貓咪老師', '飯糰', '凜', '小黑', '蛋餅', '晴天'];
const STYLES = ['great', 'katana', 'dual', 'spear', 'bow', 'scythe', 'fist'];
const MOVE = 6.5;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const MIN = 60_000;

// ── 地形：只需要「這條直線會不會走進水裡」+ 橋的位置（跟 client 的 world.js 同一套資料）──
function distSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
const distPoly = (x, z, pts) => { let d = Infinity; for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, distSeg(x, z, ...pts[i], ...pts[i + 1])); return d; };
function pointOnPoly(pts, f) {
  const lens = []; let total = 0;
  for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); lens.push(l); total += l; }
  let t = total * f;
  for (let i = 0; i < lens.length; i++) {
    if (t <= lens[i] || i === lens.length - 1) { const k = Math.min(1, t / lens[i]); return { x: pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, z: pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k }; }
    t -= lens[i];
  }
  return { x: pts[0][0], z: pts[0][1] };
}
const geoCache = new Map();
function geo(key) {
  if (geoCache.has(key)) return geoCache.get(key);
  const d = MAP_DEFS[key];
  const rivers = (d.rivers || []).map((r) => ({ pts: r.pts, half: r.w / 2 }));
  const bridges = (d.bridges || []).map((b) => (b.river !== undefined ? pointOnPoly(d.rivers[b.river].pts, b.at) : { x: b.x, z: b.z }));
  const g = { def: d, rivers, lakes: d.lakes || [], bridges, camps: d.camps || [] };
  geoCache.set(key, g);
  return g;
}
const wet = (g, x, z) => g.rivers.some((r) => distPoly(x, z, r.pts) < r.half + 0.6) || g.lakes.some((l) => Math.hypot(x - l.x, z - l.z) < l.r + 0.8);
const nearBridge = (g, x, z) => g.bridges.some((b) => Math.hypot(x - b.x, z - b.z) < 6);
function blocked(g, a, b) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 1.2);
  for (let i = 1; i < n; i++) {
    const x = a.x + ((b.x - a.x) * i) / n, z = a.z + ((b.z - a.z) * i) / n;
    if (wet(g, x, z) && !nearBridge(g, x, z)) return true;
  }
  return false;
}
/** 回傳要走的路點（必要時先走到橋），走不到就 null */
function routeTo(g, from, to) {
  if (!blocked(g, from, to)) return [to];
  let best = null, cost = Infinity;
  for (const b of g.bridges) {
    if (blocked(g, from, b) || blocked(g, b, to)) continue;
    const c = Math.hypot(b.x - from.x, b.z - from.z) + Math.hypot(to.x - b.x, to.z - b.z);
    if (c < cost) { cost = c; best = b; }
  }
  return best ? [best, to] : null;
}

// ── 每個 AI 的執行狀態（不存檔）──
const brains = new Map();

function zoneKey(p) { return p.inTown ? 'town' : p.inField ? 'field' : p.inBoss ? 'boss' : p.mapId; }
function wtypeOf(p) { return calcStats(p).wtype; }

function goOnline(p, b, now) {
  b.online = true;
  b.until = now + rand(15, 60) * MIN;
  const r = Math.random();
  try {
    if (bossPublic().alive && Math.random() < 0.2) S.enterBoss(p); // 有首領時偶爾去深淵祭壇幫忙打
    else if (r < 0.55) S.enterField(p);
    else if (r < 0.9) S.changeMap(p, p.maxMap);
    else S.enterTown(p);
  } catch { S.enterField(p); }
  b.c = botJoin(p.id);
  const g = geo(zoneKey(p));
  const sp = g.def.spawn;
  b.c.x = sp.x + rand(-3, 3); b.c.z = sp.z + rand(-3, 3);
  b.path = []; b.camp = null; b.settleT = now; b.thinkT = now + rand(20, 60) * 1000;
}

function goOffline(p, b, now) {
  b.online = false;
  b.until = now + rand(5, 30) * MIN;
  botLeave(p.id);
  b.c = null;
  S.enterTown(p);
}

/** 換一個目標營地（走得到的） */
function chooseCamp(g, b) {
  const pos = { x: b.c.x, z: b.c.z };
  const camps = [...g.camps].sort(() => Math.random() - 0.5);
  for (const c of camps) {
    const path = routeTo(g, pos, c);
    if (path) { b.camp = c; b.path = path; b.campT = Date.now() + rand(25, 60) * 1000; return; }
  }
  b.camp = null; b.path = [];
}

/** 每 0.2 秒：移動、普攻、放技能（只有那張地圖有真人在時才算，省資源） */
function move(p, b, dt, now) {
  const c = b.c, key = zoneKey(p), g = geo(key);
  const zone = p.inTown ? -1 : p.inField ? 'F' : p.inBoss ? 'B' : p.mapId;
  if (!humansIn(zone)) { c.mv = 0; return; }
  const st = WEAPON_TYPES[wtypeOf(p)] ?? WEAPON_TYPES.great;
  if (p.inTown) { // 村莊：在廣場附近散步，偶爾到訓練場試招
    if (!b.path.length) b.path = [{ x: rand(-12, 12), z: rand(-12, 10) }];
  } else if (p.inBoss) { // 深淵祭壇：圍著首領繞圈打
    const ar = g.def.arena;
    if (!b.path.length) { const a = rand(0, Math.PI * 2), r = rand(6, 10); b.path = [{ x: ar.x + Math.cos(a) * r, z: ar.z + Math.sin(a) * r }]; b.camp = { x: ar.x, z: ar.z, r: 12 }; }
  } else if (!b.camp || now > b.campT) chooseCamp(g, b);
  const wp = b.path[0];
  if (wp) {
    const dx = wp.x - c.x, dz = wp.z - c.z, d = Math.hypot(dx, dz);
    const sp = MOVE * (p.mount && d > 6 ? (MOUNTS[p.mount]?.speed ?? 1) : 1);
    if (d < 0.6) {
      b.path.shift();
      if (!b.path.length && b.camp) { // 到營地了：在營地裡換點打
        const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * b.camp.r * 0.8;
        b.path = [{ x: b.camp.x + Math.cos(a) * r, z: b.camp.z + Math.sin(a) * r }];
        b.pause = now + rand(1.5, 4) * 1000;
      }
    } else if (!(b.pause > now)) {
      const k = Math.min(1, (sp * dt) / d);
      c.x += dx * k; c.z += dz * k; c.ry = Math.atan2(dx, dz);
    }
    c.mv = d > 0.6 && !(b.pause > now) ? 1 : 0;
    c.rd = p.mount && d > 6 && !(b.pause > now) ? 1 : 0;
  }
  if (p.inTown) return;
  const inCamp = b.camp && Math.hypot(c.x - b.camp.x, c.z - b.camp.z) < b.camp.r + 2;
  if (!inCamp) return;
  if (!(b.atkT > now)) { b.atkT = now + st.interval * 1000 * rand(1, 1.3); c.ry += rand(-0.6, 0.6); botFx(c, 'atk'); }
  if (!(b.skillT > now)) {
    b.skillT = now + rand(4, 9) * 1000;
    const list = CLASS_SKILLS[wtypeOf(p)] ?? [];
    if (list.length) botFx(c, Math.random() < 0.3 ? 'basic' : pick(list));
  }
}

/** 每 2 秒：照真人的規則結算擊殺（只有在營地打怪時才有） */
function earn(p, b, now, eff = rand(0.45, 0.8)) {
  if (p.inTown) { p.lastSettle = now; return; }
  if (p.inBoss) { // 打首領：照真人一樣的上限與防禦算傷害
    const info = bossPublic();
    p.lastSettle = now;
    if (!info.alive) { S.enterField(p); return; }
    const st = calcStats(p);
    const sec = Math.min(8, (now - (p.lastBossHit || now)) / 1000);
    deliver(hitBoss(p.id, (st.dps / 5) * 3 * sec * eff * defMul(st.atk, info.def), now));
    return;
  }
  const r = calcRates(p);
  const sec = Math.min(8, (now - (p.lastSettle || now)) / 1000);
  const kills = Math.floor(r.killsPerSec * sec * eff + Math.random());
  S.settle(p, { kills, elites: Math.random() < 0.08 ? 1 : 0 }, now);
}

// ── 進度決策：鍛造、強化、換裝、分解、坐騎、寵物、轉職、天賦、下一區 ──
const cpOf = (p, eq) => calcCP(calcStats({ ...p, equipped: eq ?? p.equipped }));
function think(p) {
  const back = { inTown: p.inTown, inField: p.inField, mapId: p.mapId };
  p.inTown = true; // 鍛造要在村莊：瞬間回村辦完事
  try {
    const tier = p.maxMap;
    const style = p.botStyle in WEAPON_TYPES && tier >= (WEAPON_TYPES[p.botStyle].fromSet ?? 0) ? p.botStyle : 'great';
    // 1. 鍛造：最高那一區，武器優先，再補防具
    for (let round = 0; round < 6; round++) {
      let made = false;
      for (const slot of SLOTS) {
        const base = slot === 'weapon' ? (style === 'great' ? `s${tier}_weapon` : `s${tier}_${style}`) : `s${tier}_${slot}`;
        if (!ITEMS[base]) continue;
        const cur = p.inv.find((x) => x.uid === p.equipped[slot]);
        const curTier = cur ? ITEMS[cur.base].set : -1;
        if (curTier >= tier && (cur.grade > 0 || p.gold < ITEMS[base].gold * 6)) continue; // 已經有這區的：只有很有錢時才重做碰運氣
        try {
          const inst = S.craft(p, base);
          const eq = { ...p.equipped, [slot]: inst.uid };
          if (cpOf(p, eq) > cpOf(p)) S.equip(p, inst.uid);
          made = true;
        } catch { /* 素材不夠 */ }
      }
      if (!made) break;
    }
    // 1b. 跟真人一樣「狂鍛造 → 分解換精華」：素材多的話做最便宜的護手拿去分解（留住下一件要用的錢）
    const cheap = `s${tier}_gloves`;
    const fullSet = SLOTS.every((slot) => { const cur = p.inv.find((x) => x.uid === p.equipped[slot]); return cur && ITEMS[cur.base].set >= tier; });
    for (let i = 0; i < 12 && fullSet && ITEMS[cheap] && p.gold > ITEMS[cheap].gold * 4; i++) {
      try { S.craft(p, cheap); } catch { break; }
    }
    // 2. 分解沒穿的
    const junk = p.inv.filter((x) => !Object.values(p.equipped).includes(x.uid) && x.base !== 'starter_weapon').map((x) => x.uid);
    if (junk.length) try { S.dismantle(p, junk); } catch { /* ignore */ }
    // 3. 強化身上的（武器優先）：先把「最高那區還沒做的部位」的錢留起來，才不會一直強化卻永遠做不出下一套
    const reserve = SLOTS.reduce((n, slot) => {
      const cur = p.inv.find((x) => x.uid === p.equipped[slot]);
      const base = slot === 'weapon' ? (style === 'great' ? `s${tier}_weapon` : `s${tier}_${style}`) : `s${tier}_${slot}`;
      return n + (ITEMS[base] && (!cur || ITEMS[cur.base].set < tier) ? ITEMS[base].gold : 0);
    }, 0);
    for (let i = 0; i < 40; i++) {
      const eq = SLOTS.map((s) => p.inv.find((x) => x.uid === p.equipped[s])).filter(Boolean).sort((a, b2) => a.lv - b2.lv);
      const it = eq.find((x) => x.base !== 'starter_weapon' && enhanceCost(x).gold < (p.gold - reserve) * 0.5);
      if (!it) break;
      try { S.enhanceItem(p, it.uid); } catch { break; }
    }
    // 4. 坐騎、寵物蛋、轉職、天賦
    for (const id of Object.keys(MOUNTS)) if (!p.mounts[id]) try { S.buyMount(p, id); } catch { /* 不夠 */ }
    while (p.eggs > 0) try { S.hatchEgg(p); } catch { break; }
    try { S.doRebirth(p); } catch { /* 還不能 */ }
    try { S.autoTalents?.(p); } catch { /* 沒點數 */ }
  } finally {
    Object.assign(p, back);
  }
  // 5. 能去下一區就去
  if (!p.inTown && S.canUnlockMap(p, p.maxMap + 1)) {
    try { S.changeMap(p, p.maxMap + 1); if (back.inField) S.enterField(p); } catch { /* ignore */ }
  }
}

/** 快轉：新建的 AI 先「玩過」一段時間，不然大家都是 1 等（onHour：平衡模擬用，每小時回報一次） */
export function fastForward(p, hours, onHour, eff = [0.5, 0.75]) {
  let t = Date.now() - hours * 3600_000;
  const t0 = t;
  p.lastSettle = t;
  S.enterField(p);
  let next = t + 90_000, hour = t + 3600_000;
  while (t < Date.now()) {
    t += 8000;
    earn(p, null, t, rand(...eff));
    if (t > next) { next = t + 90_000; think(p); if (!p.inField) S.enterField(p); }
    if (onHour && t >= hour) { hour += 3600_000; onHour(Math.round((t - t0) / 3600_000), p); }
  }
  S.enterTown(p);
}

export function startBots() {
  if (!BOT_COUNT) return;
  const have = S.botPlayers();
  const names = NAMES.filter((n) => !have.some((p) => p.name === n)).sort(() => Math.random() - 0.5);
  for (let i = have.length; i < BOT_COUNT && names.length; i++) {
    const p = S.createBot(names.pop(), pick(STYLES));
    if (!p) continue;
    const t0 = Date.now();
    fastForward(p, 0.1 + 30 * Math.random() ** 3); // 大多是新手、少數玩很久的老手
    console.log(`[AI 玩家] 建立 ${p.name}（${WEAPON_TYPES[p.botStyle]?.name ?? ''}，Lv.${p.level}，最遠第 ${p.maxMap + 1} 區，${Date.now() - t0}ms）`);
  }
  const now = Date.now();
  S.botPlayers().slice(0, BOT_COUNT).forEach((p) => {
    const b = { online: false, until: now + rand(0, 3) * MIN };
    brains.set(p.id, b);
    if (Math.random() < 0.7) goOnline(p, b, now);
  });
  console.log(`[AI 玩家] ${brains.size} 位 AI 玩家上線中（${[...brains.values()].filter((b) => b.online).length} 位在線）`);

  let last = Date.now();
  setInterval(() => {
    const t = Date.now(), dt = Math.min(0.5, (t - last) / 1000);
    last = t;
    for (const [id, b] of brains) {
      let p;
      try { p = S.getPlayer(id); } catch { brains.delete(id); continue; }
      if (t > b.until) { if (b.online) goOffline(p, b, t); else goOnline(p, b, t); continue; }
      if (!b.online) continue;
      try {
        move(p, b, dt, t);
        if (t - b.settleT > 2000) { b.settleT = t; earn(p, b, t); }
        if (t > b.thinkT) { b.thinkT = t + rand(45, 90) * 1000; think(p); if (Math.random() < 0.25) botMarketTick(p); }
      } catch (e) { console.warn('[AI 玩家]', p.name, e.message); }
    }
  }, 200);
}

/** 加 AI 好友：幾秒後自動接受 */
export function botFriendReply(bot, from, notify) {
  setTimeout(() => {
    try {
      S.friendAnswer(bot, from.id, true);
      notify(from.id, { t: 'friend_info', text: `${bot.name} 接受了你的好友邀請！` });
    } catch { /* ignore */ }
  }, rand(3, 15) * 1000);
}
