// ─────────────────────────────────────────────
// 遊戲狀態：玩家資料、掛機結算、素材、裝備、JSON 存檔
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  MAPS, MAX_GAP_SEC, KILL_SLACK, ELITE_VALUE, SKILL_DPS_BONUS, MAX_KILLS_PER_SEC,
  calcStats, calcCP, calcRates, expToNext, equippedInsts, partyMul, farmMul,
} from './formulas.js';
import { MOUNTS, MOUNT_MAX_LV, mountUpgradeCost } from './mounts.js';
import { WINGS, WING_MAX_LV, wingUpgradeCost } from './wings.js';
import { PARTNERS, PARTNER_MAX_LV, partnerUpgradeCost, partnerDpsBonus } from './partners.js';
import { BUILDINGS, BUILD_MAX_LV, PLOTS, initManor, pending, buildCost, ratePerHour, prosperity, manorView } from './manor.js';
import { PETS, PET_MAX_LV, PET_MAX_STAR, petFeedCost, eggPrice, rollPet } from './pets.js';
import { ITEMS, SLOTS, SETS, DROP, UNLOCK_PIECES, setBonus } from './items.js';
import {
  rollItem, enhanceCap, enhanceCost, rerollCost, dismantleYield, reroll, INV_LIMIT,
} from './gear.js';
import { CLASS_SKILLS } from './skills.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const SAVE_FILE = path.join(DATA_DIR, 'players.json');

/** @type {Record<string, any>} */
let players = {};
/** 登入憑證 token → 玩家 id */
const sessions = new Map();

// ── 存讀檔 ──────────────────────────────────
export function loadSave() {
  try {
    players = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
    Object.values(players).forEach(migrate);
    for (const p of Object.values(players)) for (const t of p.sessions) sessions.set(t, p.id);
    console.log(`[存檔] 載入 ${Object.keys(players).length} 位玩家`);
  } catch {
    players = {};
    console.log('[存檔] 尚無存檔，建立新世界');
  }
}

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; saveNow(); }, 2000);
}

export function saveNow() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = SAVE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(players, null, 2));
  fs.renameSync(tmp, SAVE_FILE); // 先寫暫存再改名，避免當機時存檔損毀
  backupIfDue();
}

// ── 自動備份：每 30 分鐘留一份，保留最近 48 份（約一天） ──
// 長期跟朋友玩，存檔壞掉 / 誤刪時可以從 server/data/backups 撿回來
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const BACKUP_EVERY_MS = 30 * 60 * 1000;
const BACKUP_KEEP = 48;
let lastBackup = 0;
function backupIfDue() {
  const now = Date.now();
  if (now - lastBackup < BACKUP_EVERY_MS) return;
  lastBackup = now;
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const d = new Date(now);
    const pad = (n) => String(n).padStart(2, '0');
    const name = `players-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
    fs.copyFileSync(SAVE_FILE, path.join(BACKUP_DIR, name));
    const old = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith('players-')).sort();
    for (const f of old.slice(0, Math.max(0, old.length - BACKUP_KEEP))) fs.unlinkSync(path.join(BACKUP_DIR, f));
  } catch (e) {
    console.warn('[備份] 失敗：', e.message);
  }
}

// 舊版存檔升級
function migrate(p) {
  p.mats ||= {};
  p.maxMap ??= p.mapId;
  p.essence ??= 0;
  p.inTown ??= false;
  delete p.skills; // 技能改成每職業固定，不再存玩家配置
  p.friends ||= [];
  p.friendReqs ||= [];
  p.mounts ||= {};       // 坐騎：{ id: { lv } }
  p.mount ??= null;      // 出戰中的坐騎
  for (const id of Object.keys(p.mounts)) if (!MOUNTS[id]) delete p.mounts[id];
  if (p.mount && !p.mounts[p.mount]) p.mount = null;
  p.wings ||= {};        // 翅膀：{ id: { lv } }（純外觀）
  p.partners ||= {};     // 夥伴：{ id: { at, lv } }
  for (const o of Object.values(p.partners)) o.lv ||= 1;
  p.trialBest ??= 0;     // 魔物潮最佳紀錄（擊殺數）
  initManor(p);          // 莊園
  p.pets ||= {};         // 寵物：{ id: { lv, star } }
  p.pet ??= null;        // 出戰中的寵物
  p.eggs ||= 0;          // 寵物蛋
  p.trial ??= null;
  p.partnerOut ??= null; // 帶出門的夥伴（null = 都在酒館）
  if (p.partnerOut && !p.partners[p.partnerOut]) p.partnerOut = null;
  p.wing ??= null;
  if (p.wing && !p.wings[p.wing]) p.wing = null;
  if (!p.inv) {
    // 舊的「每種裝備一件 + 部位強化」→ 轉成裝備實體，部位強化等級轉到身上那件
    const f = p.forge || {};
    const oldEnh = p.enhance || { weapon: f.atk || 0, helm: f.hp || 0, armor: f.def || 0, gloves: 0, boots: 0 };
    const owned = [...new Set(['starter_weapon', ...(p.owned || [])])].filter((id) => ITEMS[id]);
    const oldEq = p.equipped || {};
    p.inv = [];
    p.equipped = { weapon: null, helm: null, armor: null, gloves: null, boots: null };
    for (const base of owned) {
      const t = ITEMS[base];
      const worn = oldEq[t.slot] === base || (base === 'starter_weapon' && !oldEq.weapon);
      const inst = rollItem(base, { grade: 0, q: 1, lv: 0 });
      if (worn) {
        inst.lv = Math.min(oldEnh[t.slot] || 0, enhanceCap(inst));
        p.equipped[t.slot] = inst.uid;
      }
      p.inv.push(inst);
    }
    p.codex = owned.filter((id) => id !== 'starter_weapon');
  }
  p.codex ||= [];
  delete p.forge; delete p.owned; delete p.enhance;

  // 改版成 3 張地圖：第 3 張以後的裝備 / 素材 / 進度全部收斂到第 3 張
  const LAST = SETS.length - 1;
  const fixId = (id) => id.replace(/^s(\d+)_/, (m, n) => `s${Math.min(Number(n), LAST)}_`);
  for (const it of p.inv) if (!ITEMS[it.base]) it.base = fixId(it.base);
  p.inv = p.inv.filter((it) => ITEMS[it.base]);
  p.codex = [...new Set(p.codex.map(fixId))].filter((id) => ITEMS[id]);
  for (const k of Object.keys(p.mats)) {
    const m = /^m(\d+)([ab])$/.exec(k);
    if (m && Number(m[1]) > LAST) {
      const to = `m${LAST}${m[2]}`;
      p.mats[to] = (p.mats[to] || 0) + p.mats[k];
      delete p.mats[k];
    }
  }
  p.mapId = Math.min(p.mapId, LAST);
  p.maxMap = Math.min(p.maxMap, LAST);
  for (const slot of SLOTS) if (p.equipped[slot] && !p.inv.some((x) => x.uid === p.equipped[slot])) p.equipped[slot] = null;
  delete p.killRemainder;
  p.sessions ||= [];
  p.pvp ||= { w: 0, l: 0 };
  return p;
}

// ── 玩家 ─────────────────────────────────────
function newPlayer(name) {
  return migrate({
    id: crypto.randomUUID(),
    name,
    level: 1,
    exp: 0,
    gold: 0,
    totalKills: 0,
    mapId: 0,
    inTown: true, // 新角色從村莊出生
    createdAt: Date.now(),
    lastSettle: Date.now(),
  });
}

// ── 帳號密碼 ───────────────────────────────
// 密碼用 scrypt 加鹽雜湊後才存，存檔裡看不到明碼
function hashPassword(pw, salt) {
  return crypto.scryptSync(String(pw), salt, 32).toString('hex');
}

function setPassword(p, pw) {
  p.passSalt = crypto.randomBytes(16).toString('hex');
  p.passHash = hashPassword(pw, p.passSalt);
}

function checkPassword(p, pw) {
  const a = Buffer.from(hashPassword(pw, p.passSalt), 'hex');
  const b = Buffer.from(p.passHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function issueToken(p) {
  const token = crypto.randomBytes(24).toString('hex');
  p.sessions = [...p.sessions.slice(-4), token]; // 最多同時記住 5 台裝置
  for (const t of [...sessions.keys()]) if (sessions.get(t) === p.id && !p.sessions.includes(t)) sessions.delete(t);
  sessions.set(token, p.id);
  scheduleSave();
  return token;
}

function cleanName(raw) {
  const name = String(raw ?? '').trim().slice(0, 12);
  if (!name) throw new GameError('請輸入帳號名稱');
  return name;
}

function cleanPassword(pw) {
  pw = String(pw ?? '');
  if (pw.length < 4) throw new GameError('密碼至少 4 個字');
  if (pw.length > 64) throw new GameError('密碼太長了');
  return pw;
}

const findByName = (name) => Object.values(players).find((x) => x.name === name);

export function register(rawName, pw) {
  const name = cleanName(rawName);
  pw = cleanPassword(pw);
  const exist = findByName(name);
  if (exist) {
    throw new GameError(exist.passHash ? '這個名字已經被註冊了' : '這是舊角色，請直接用「登入」，第一次登入會幫你設定密碼');
  }
  const p = newPlayer(name);
  setPassword(p, pw);
  players[p.id] = p;
  console.log(`[帳號] 新玩家「${name}」註冊`);
  return { p, token: issueToken(p) };
}

export function login(rawName, pw) {
  const name = cleanName(rawName);
  pw = cleanPassword(pw);
  const p = findByName(name);
  if (!p) throw new GameError('帳號不存在，請先註冊');
  let claimed = false;
  if (!p.passHash) {
    setPassword(p, pw); // 改版前的舊角色：第一次登入時設定密碼
    claimed = true;
    console.log(`[帳號] 舊角色「${name}」設定了密碼`);
  } else if (!checkPassword(p, pw)) {
    throw new GameError('密碼錯誤', 401);
  }
  return { p, token: issueToken(p), claimed };
}

export function playerByToken(token) {
  const id = sessions.get(String(token || ''));
  const p = id && players[id];
  if (!p) throw new GameError('登入已過期，請重新登入', 401);
  return p;
}

export function logout(token) {
  const id = sessions.get(token);
  if (!id) return;
  sessions.delete(token);
  const p = players[id];
  if (p) p.sessions = p.sessions.filter((t) => t !== token);
  scheduleSave();
}

/** PvP 戰績 */
export function recordDuel(winnerId, loserId) {
  if (players[winnerId]) players[winnerId].pvp.w += 1;
  if (players[loserId]) players[loserId].pvp.l += 1;
  scheduleSave();
}

export function getPlayer(id) {
  const p = players[id];
  if (!p) throw new GameError('找不到角色，請重新登入', 404);
  return p;
}

const floorMat = (v) => Math.floor((v || 0) + 1e-9);

// ── 狩獵結算：只算「真的打倒的怪」 ─────────────
// 前端每 2 秒回報這段時間自己參與擊殺的數量（小怪 / 菁英）
// 伺服器用秒傷算出理論上限，超過的部分不算（防作弊）
// 離線、在村莊、畫面關掉（超過 MAX_GAP_SEC 沒回報）都不會有收益
/** 同一張狩獵地圖還有幾位其他玩家（由即時連線模組提供，避免互相 import） */
let partyCounter = () => 0;
export function setPartyCounter(fn) { partyCounter = fn; }
/** 同一張狩獵地圖的其他在線玩家 id（組隊魔物潮用） */
let partyMembers = () => [];
export function setPartyMembers(fn) { partyMembers = fn; }
export const partyMates = (id) => partyMembers(id);
const partyOf = (p) => (p.inTown ? 0 : partyCounter(p.id));

export function settle(p, report = null, now = Date.now()) {
  const gap = (now - p.lastSettle) / 1000;
  p.lastSettle = now;
  const result = { kills: 0, gold: 0, levelsGained: 0, mats: {} };
  if (!report || p.inTown || gap <= 0) return result;

  const elapsed = Math.min(gap, MAX_GAP_SEC);
  const r = calcRates(p);
  // 上限：理論秒傷（含技能）× 寬限，再多留一隻菁英的份，避免剛好打倒菁英那次被砍掉
  const kps = Math.min(r.killsPerSec * (1 + SKILL_DPS_BONUS) * partnerMul(p), MAX_KILLS_PER_SEC);
  const cap = Math.ceil(kps * elapsed * KILL_SLACK) + ELITE_VALUE;
  const normal = Math.max(0, Math.floor(Number(report.kills) || 0));
  const elite = Math.max(0, Math.floor(Number(report.elites) || 0));
  const value = Math.min(normal + elite * ELITE_VALUE, cap);
  if (value <= 0) return result;

  const map = MAPS[p.mapId];
  const party = partyMul(partyOf(p));
  const [ma, mb] = SETS[p.mapId].mats;
  const before = { [ma]: floorMat(p.mats[ma]), [mb]: floorMat(p.mats[mb]) };
  p.totalKills += Math.min(normal + elite, value);
  const gold = value * map.goldPerKill * r.goldMul * party;
  p.gold += gold;
  p.exp += value * map.expPerKill * r.expMul * party;
  p.mats[ma] = (p.mats[ma] || 0) + value * DROP.common * r.dropMul * party;
  p.mats[mb] = (p.mats[mb] || 0) + value * DROP.rare * r.dropMul * party;
  result.kills = Math.min(normal + elite, value);
  if (p.trial && now <= p.trial.endsAt + 3000 && p.mapId === p.trial.mapId) p.trial.kills += result.kills;
  result.gold = gold;
  while (p.exp >= expToNext(p.level)) {
    p.exp -= expToNext(p.level);
    p.level += 1;
    result.levelsGained += 1;
  }
  for (const id of [ma, mb]) {
    const got = floorMat(p.mats[id]) - before[id];
    if (got > 0) result.mats[id] = got;
  }
  scheduleSave();
  return result;
}

// ── 背包 / 鍛造（鍛造只能在村莊找鍛造師） ──────
const needTown = (p) => { if (!p.inTown) throw new GameError('要回到村莊找鍛造師才能鍛造'); };
const findInst = (p, uid) => {
  const it = p.inv.find((x) => x.uid === uid);
  if (!it) throw new GameError('背包裡沒有這件裝備');
  return it;
};
const isWorn = (p, uid) => Object.values(p.equipped).includes(uid);
const tierOf = (inst) => ITEMS[inst.base]?.set ?? -1;

/** 鍛造：每次都骰出新的隨機數值，放進背包 */
export function craft(p, base) {
  needTown(p);
  const t = ITEMS[base];
  if (!t || t.set < 0) throw new GameError('沒有這件裝備');
  if (t.set > p.maxMap) throw new GameError('還沒遇過這種魔物');
  if (p.inv.length >= INV_LIMIT) throw new GameError(`背包滿了（${INV_LIMIT} 格），先分解一些吧`);
  for (const [mat, n] of Object.entries(t.recipe)) {
    if (floorMat(p.mats[mat]) < n) throw new GameError('素材不足，再去狩獵吧！');
  }
  if (p.gold < t.gold) throw new GameError('金幣不足');

  for (const [mat, n] of Object.entries(t.recipe)) p.mats[mat] -= n;
  p.gold -= t.gold;
  const inst = rollItem(base);
  p.inv.push(inst);
  if (!p.codex.includes(base)) p.codex.push(base);

  // 那個部位空著、或新的比身上的高階 → 自動穿上
  const cur = p.inv.find((x) => x.uid === p.equipped[t.slot]);
  if (!cur || t.set > tierOf(cur)) p.equipped[t.slot] = inst.uid;
  scheduleSave();
  return inst;
}

export function equip(p, uid) {
  const it = findInst(p, uid);
  p.equipped[ITEMS[it.base].slot] = uid;
  scheduleSave();
}

/** 強化：綁在這件裝備上，換裝不繼承 */
export function enhanceItem(p, uid) {
  needTown(p);
  const it = findInst(p, uid);
  const cap = enhanceCap(it);
  if (it.lv >= cap) throw new GameError(`已達強化上限 +${cap}`);
  const c = enhanceCost(it);
  if (p.gold < c.gold) throw new GameError('金幣不足');
  if (p.essence < c.essence) throw new GameError('鍛造精華不足，分解裝備可以獲得');
  p.gold -= c.gold;
  p.essence -= c.essence;
  it.lv += 1;
  scheduleSave();
  return it;
}

/** 洗鍊：附加屬性全部重骰 */
export function rerollItem(p, uid) {
  needTown(p);
  const it = findInst(p, uid);
  const c = rerollCost(it);
  if (p.gold < c.gold) throw new GameError('金幣不足');
  if (p.essence < c.essence) throw new GameError('鍛造精華不足，分解裝備可以獲得');
  p.gold -= c.gold;
  p.essence -= c.essence;
  reroll(it);
  scheduleSave();
  return it;
}

/** 分解：穿著的、上鎖的、新手武器不能分解 */
export function dismantle(p, uids) {
  const list = [...new Set(uids || [])].map((u) => p.inv.find((x) => x.uid === u)).filter(Boolean)
    .filter((it) => !isWorn(p, it.uid) && !it.lock && it.base !== 'starter_weapon');
  if (!list.length) throw new GameError('沒有可以分解的裝備（穿著或上鎖的不能分解）');
  const total = { count: list.length, essence: 0, mats: {} };
  for (const it of list) {
    const y = dismantleYield(it);
    total.essence += y.essence;
    for (const [m, n] of Object.entries(y.mats)) {
      total.mats[m] = (total.mats[m] || 0) + n;
      p.mats[m] = (p.mats[m] || 0) + n;
    }
  }
  p.essence += total.essence;
  const gone = new Set(list.map((x) => x.uid));
  p.inv = p.inv.filter((x) => !gone.has(x.uid));
  scheduleSave();
  return total;
}

export function setLock(p, uid, lock) {
  findInst(p, uid).lock = !!lock;
  scheduleSave();
}

// ── 坐騎（買、升級要在村莊找馬廄；出戰哪裡都能換） ──
const findMount = (id) => {
  const m = MOUNTS[id];
  if (!m) throw new GameError('沒有這隻坐騎');
  return m;
};

function payCost(p, cost) {
  if (p.gold < (cost.gold || 0)) throw new GameError('金幣不足');
  if (p.essence < (cost.essence || 0)) throw new GameError('鍛造精華不足，分解裝備可以獲得');
  for (const [mat, n] of Object.entries(cost.mats || {})) {
    if (floorMat(p.mats[mat]) < n) throw new GameError('素材不足，再去狩獵吧！');
  }
  p.gold -= cost.gold || 0;
  p.essence -= cost.essence || 0;
  for (const [mat, n] of Object.entries(cost.mats || {})) p.mats[mat] -= n;
}

export function buyMount(p, id) {
  if (!p.inTown) throw new GameError('要回到村莊找馬廄才能買坐騎');
  const m = findMount(id);
  if (p.mounts[id]) throw new GameError('已經擁有這隻坐騎了');
  const req = m.reqMap ?? (m.tier <= 2 ? m.tier : null);
  if (req != null && req > p.maxMap) throw new GameError('還沒去過那張地圖，買不到這隻坐騎');
  payCost(p, m.cost);
  p.mounts[id] = { lv: 1 };
  p.mount = id; // 買了直接出戰
  scheduleSave();
  return { id };
}

export function upgradeMount(p, id) {
  if (!p.inTown) throw new GameError('要回到村莊找馬廄才能餵養坐騎');
  findMount(id);
  const own = p.mounts[id];
  if (!own) throw new GameError('還沒有這隻坐騎');
  if (own.lv >= MOUNT_MAX_LV) throw new GameError(`已經是最高等級 Lv.${MOUNT_MAX_LV}`);
  payCost(p, mountUpgradeCost(id, own.lv));
  own.lv += 1;
  scheduleSave();
  return { id, lv: own.lv };
}

export function equipMount(p, id) {
  if (id == null || id === '') { p.mount = null; scheduleSave(); return; }
  findMount(id);
  if (!p.mounts[id]) throw new GameError('還沒有這隻坐騎');
  p.mount = id;
  scheduleSave();
}

// ── 翅膀（純外觀，哪裡都能做 / 升級） ──────────
const findWing = (id) => {
  const w = WINGS[id];
  if (!w) throw new GameError('沒有這對翅膀');
  return w;
};

export function craftWing(p, id) {
  const w = findWing(id);
  if (p.wings[id]) throw new GameError('已經擁有這對翅膀了');
  if (w.requireMaxWing && !Object.values(p.wings).some((o) => o.lv >= WING_MAX_LV)) {
    throw new GameError(`要先把任一對翅膀練到 Lv.${WING_MAX_LV}`);
  }
  payCost(p, w.cost);
  p.wings[id] = { lv: 1 };
  p.wing = id;
  scheduleSave();
  return { id };
}

export function upgradeWing(p, id) {
  findWing(id);
  const own = p.wings[id];
  if (!own) throw new GameError('還沒有這對翅膀');
  if (own.lv >= WING_MAX_LV) throw new GameError(`已經是最高等級 Lv.${WING_MAX_LV}`);
  payCost(p, wingUpgradeCost(id, own.lv));
  own.lv += 1;
  scheduleSave();
  return { id, lv: own.lv };
}

export function equipWing(p, id) {
  if (id == null || id === '') { p.wing = null; scheduleSave(); return; }
  findWing(id);
  if (!p.wings[id]) throw new GameError('還沒有這對翅膀');
  p.wing = id;
  scheduleSave();
}

// ── 夥伴（只能在村莊的酒館招募、帶出門 / 留在酒館） ──
export function recruitPartner(p, id) {
  const d = PARTNERS[id];
  if (!d) throw new GameError('沒有這位夥伴');
  if (!p.inTown) throw new GameError('要在村莊的酒館才能招募夥伴');
  if (p.partners[id]) throw new GameError('已經是你的夥伴了');
  payCost(p, d.cost);
  p.partners[id] = { at: Date.now(), lv: 1 };
  scheduleSave();
  return { id };
}

export function deployPartner(p, id) {
  if (!p.inTown) throw new GameError('要回村莊的酒館才能叫夥伴出門或留下');
  if (id == null || id === '') { p.partnerOut = null; scheduleSave(); return; }
  if (!PARTNERS[id] || !p.partners[id]) throw new GameError('還沒有這位夥伴');
  p.partnerOut = id;
  scheduleSave();
}

export function upgradePartner(p, id) {
  if (!p.inTown) throw new GameError('要在村莊的酒館才能培養夥伴');
  const own = p.partners[id];
  if (!PARTNERS[id] || !own) throw new GameError('還沒有這位夥伴');
  if (own.lv >= PARTNER_MAX_LV) throw new GameError(`已經是最高等級 Lv.${PARTNER_MAX_LV}`);
  payCost(p, partnerUpgradeCost(own.lv));
  own.lv += 1;
  scheduleSave();
  return { id, lv: own.lv };
}

/** 防作弊用：夥伴出戰時傷害上限放寬（等級越高放越寬） */
export const partnerMul = (p) => (p.partnerOut ? 1 + partnerDpsBonus(p.partners[p.partnerOut]?.lv ?? 1) : 1);

// ── 寵物 ───────────────────────────────────
export function buyEgg(p) {
  payCost(p, { gold: eggPrice(MAPS[Math.min(p.maxMap, MAPS.length - 1)].goldPerKill) });
  p.eggs += 1;
  scheduleSave();
}

export function hatchEgg(p) {
  if (p.eggs < 1) throw new GameError('沒有寵物蛋（世界王、首領突襲、魔物潮會掉，也可以用金幣買）');
  p.eggs -= 1;
  const id = rollPet();
  const own = p.pets[id];
  let dup = false;
  if (own) { dup = true; if (own.star < PET_MAX_STAR) own.star += 1; else p.essence += 50; } // 重複 → 升星（滿星換精華）
  else p.pets[id] = { lv: 1, star: 0 };
  if (!p.pet) p.pet = id;
  scheduleSave();
  return { id, dup, star: p.pets[id].star };
}

export function feedPet(p, id) {
  const own = p.pets[id];
  if (!own) throw new GameError('還沒有這隻寵物');
  if (own.lv >= PET_MAX_LV) throw new GameError(`已經是最高等級 Lv.${PET_MAX_LV}`);
  payCost(p, petFeedCost(own.lv));
  own.lv += 1;
  scheduleSave();
  return { id, lv: own.lv };
}

export function equipPet(p, id) {
  if (id && !p.pets[id]) throw new GameError('還沒有這隻寵物');
  p.pet = id || null;
  scheduleSave();
}

// ── 莊園 ───────────────────────────────────
export function manorCollect(p) {
  const got = pending(p);
  p.gold += got.gold;
  p.essence += got.essence;
  for (const [m, n] of Object.entries(got.mats)) p.mats[m] = (p.mats[m] || 0) + n;
  p.manor.last = Date.now();
  scheduleSave();
  return got;
}

export function manorBuild(p, plot, id) {
  const b = BUILDINGS[id];
  if (!b) throw new GameError('沒有這種建築');
  if (!(plot >= 0 && plot < PLOTS)) throw new GameError('沒有這塊地');
  if (p.manor.plots[plot]) throw new GameError('這塊地已經有東西了');
  manorCollect(p); // 先收成，產量重新計算
  payCost(p, buildCost(p, id, 1));
  p.manor.plots[plot] = { id, lv: 1 };
  scheduleSave();
}

export function manorUpgrade(p, plot) {
  const cur = p.manor.plots[plot];
  if (!cur) throw new GameError('這塊地是空的');
  if (cur.lv >= BUILD_MAX_LV) throw new GameError(`已經是最高等級 Lv.${BUILD_MAX_LV}`);
  manorCollect(p);
  payCost(p, buildCost(p, cur.id, cur.lv + 1));
  cur.lv += 1;
  scheduleSave();
}

export function manorRemove(p, plot) {
  if (!p.manor.plots[plot]) throw new GameError('這塊地是空的');
  manorCollect(p);
  p.manor.plots[plot] = null; // 拆掉不退錢
  scheduleSave();
}

export function manorInfo(p) {
  return { ...manorView(p), pending: pending(p), rate: ratePerHour(p), costs: Object.fromEntries(Object.keys(BUILDINGS).map((id) => [id, Array.from({ length: BUILD_MAX_LV }, (_, i) => buildCost(p, id, i + 1))])) };
}

/** 參觀好友莊園：每天每位好友一次，參觀者拿精華，主人人氣 +1 */
export function manorVisit(p, ownerId) {
  const o = players[ownerId];
  if (!o) throw new GameError('找不到這位玩家');
  if (o.id !== p.id && !p.friends.includes(o.id)) throw new GameError('只能參觀好友的莊園');
  initManor(o);
  const today = new Date().toISOString().slice(0, 10);
  let reward = null;
  if (o.id !== p.id) {
    o.manor.visits ||= {};
    if (o.manor.visits.day !== today) o.manor.visits = { day: today, who: [] };
    if (!o.manor.visits.who.includes(p.id)) {
      o.manor.visits.who.push(p.id);
      o.manor.likes = (o.manor.likes || 0) + 1;
      reward = { essence: 5 * (Math.min(p.maxMap, 5) + 1) };
      p.essence += reward.essence;
      scheduleSave();
    }
  }
  return { view: manorView(o), reward };
}

// ── 素材合成（在鍛造師那裡） ─────────────────────
// up:   同一區 6 普通 + 金幣 → 1 稀有
// next: 上一區 2 稀有 + 金幣 → 下一區 3 普通（後期地圖素材不夠時用）
// boss: 8 羽晶 → 1 星輝羽
export function synthRecipes() {
  const out = [];
  SETS.forEach((st, i) => {
    const [a, b] = st.mats;
    out.push({ id: `up${i}`, from: { [a]: 6 }, to: { [b]: 1 }, gold: Math.floor(MAPS[i].goldPerKill * 30) });
    if (i > 0) { const [, pb] = SETS[i - 1].mats; out.push({ id: `next${i}`, from: { [pb]: 2 }, to: { [a]: 3 }, gold: Math.floor(MAPS[i].goldPerKill * 40) }); }
  });
  out.push({ id: 'boss', from: { wf: 8 }, to: { wr: 1 }, gold: 0 });
  return out;
}

export function synth(p, id, times = 1) {
  const r = synthRecipes().find((x) => x.id === id);
  if (!r) throw new GameError('沒有這個合成配方');
  const n = Math.max(1, Math.min(999, Math.floor(times)));
  payCost(p, { gold: r.gold * n, mats: Object.fromEntries(Object.entries(r.from).map(([k, v]) => [k, v * n])) });
  for (const [k, v] of Object.entries(r.to)) p.mats[k] = (p.mats[k] || 0) + v * n;
  scheduleSave();
  return { to: Object.fromEntries(Object.entries(r.to).map(([k, v]) => [k, v * n])) };
}

// ── 魔物潮（3 分鐘生存挑戰）────────────────────
// 在目前的狩獵地圖開始：怪會一波波從四面八方湧來、越來越多越硬
// 擊殺照常由 settle 驗證結算；結束時依「驗證過的擊殺數」額外發獎勵
export const TRIAL_SEC = Number(process.env.TRIAL_SEC ?? 180); // 測試可用環境變數縮短
// 冷卻：從開始算起 10 分鐘才能再開（原本沒有冷卻，可以一場接一場刷星輝羽 / 寵物蛋）
export const TRIAL_CD_SEC = Number(process.env.TRIAL_CD_SEC ?? 600);
export const cdText = (ms) => { const s = Math.ceil(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)} 分 ${s % 60} 秒` : `${s} 秒`; };
export function startTrial(p) {
  if (p.inTown) throw new GameError('要在狩獵地圖才能開始魔物潮');
  if (p.trial && Date.now() < p.trial.endsAt + 5000) throw new GameError('魔物潮正在進行中');
  const now = Date.now();
  if (now < (p.trialCd || 0)) throw new GameError(`魔物潮冷卻中，還要 ${cdText(p.trialCd - now)}`);
  const t = { mapId: p.mapId, start: now, endsAt: now + TRIAL_SEC * 1000, kills: 0, party: 1 };
  // 組隊：同一張地圖、正在線上、沒在挑戰中的朋友一起進入（各自結算，共用倒數）
  const mates = partyMembers(p.id).map((id) => players[id]).filter((q) => q && !q.inTown && q.mapId === p.mapId && !(q.trial && now < q.trial.endsAt) && now >= (q.trialCd || 0));
  t.party = mates.length + 1;
  for (const q of [p, ...mates]) { q.trial = { ...t }; q.trialCd = now + TRIAL_CD_SEC * 1000; }
  scheduleSave();
  return { endsAt: t.endsAt, sec: TRIAL_SEC, party: t.party };
}

export function endTrial(p) {
  const t = p.trial;
  if (!t) throw new GameError('沒有進行中的魔物潮');
  if (Date.now() < t.endsAt - 1500) throw new GameError('時間還沒到');
  p.trial = null;
  const k = Math.floor(t.kills);
  const tier = t.mapId;
  const partyMul = 1 + 0.1 * Math.min(3, (t.party || 1) - 1); // 組隊額外 +10% / 人
  // 獎勵平衡：一場約 600~1200 隻。原本 k/8 精華、k/160 星輝羽（一場 = 世界王好幾隻的量）→ 下修並跟著地圖階級成長
  // 在比自己最遠地圖低的地方開：每低一區 ×0.3（farmMul），也拿不到寵物蛋
  const low = farmMul(p, tier);
  const mul = partyMul * low;
  const reward = {
    party: t.party || 1,
    kills: k,
    essence: Math.floor((k / 14) * (1 + tier * 0.25) * mul),
    mats: { wf: Math.floor((k / 45) * mul), wr: Math.floor((k / 450) * (1 + tier * 0.1) * mul) },
    gold: Math.floor(k * MAPS[tier].goldPerKill * 3 * partyMul),
    lowMap: low < 1,
  };
  reward.eggs = k >= 150 && low >= 1 ? 1 : 0;
  p.eggs += reward.eggs;
  const best = k > p.trialBest;
  if (best) p.trialBest = k;
  p.essence += reward.essence;
  p.gold += reward.gold;
  for (const [m, n] of Object.entries(reward.mats)) p.mats[m] = (p.mats[m] || 0) + n;
  scheduleSave();
  return { ...reward, best, record: p.trialBest };
}

/** 世界王結算時用：直接加素材 / 金幣（boss.js 呼叫） */
export function giveReward(id, { mats = {}, gold = 0, eggs = 0 } = {}) {
  const p = players[id];
  if (!p) return null;
  p.eggs = (p.eggs || 0) + eggs;
  for (const [m, n] of Object.entries(mats)) p.mats[m] = (p.mats[m] || 0) + n;
  p.gold += gold;
  scheduleSave();
  return p;
}

// ── 好友 ─────────────────────────────────────
export function friendRequest(p, rawName) {
  const name = String(rawName ?? '').trim();
  const t = findByName(name);
  if (!t) throw new GameError('找不到這個玩家');
  if (t.id === p.id) throw new GameError('不能加自己好友');
  if (p.friends.includes(t.id)) throw new GameError('你們已經是好友了');
  if (p.friendReqs.includes(t.id)) { friendAnswer(p, t.id, true); return { target: t, autoAccepted: true }; } // 對方也加過你 → 直接成為好友
  if (!t.friendReqs.includes(p.id)) t.friendReqs.push(p.id);
  scheduleSave();
  return { target: t, autoAccepted: false };
}

export function friendAnswer(p, fromId, accept) {
  p.friendReqs = p.friendReqs.filter((id) => id !== fromId);
  const from = players[fromId];
  if (accept && from) {
    if (!p.friends.includes(fromId)) p.friends.push(fromId);
    if (!from.friends.includes(p.id)) from.friends.push(p.id);
    from.friendReqs = from.friendReqs.filter((id) => id !== p.id);
  }
  scheduleSave();
  return from;
}

export function friendRemove(p, id) {
  p.friends = p.friends.filter((x) => x !== id);
  if (players[id]) players[id].friends = players[id].friends.filter((x) => x !== p.id);
  scheduleSave();
}

/** isOnline：由即時連線模組提供 */
export function friendList(p, isOnline) {
  const brief = (id) => {
    const f = players[id];
    if (!f) return null;
    return {
      id, name: f.name, level: f.level, cp: calcCP(calcStats(f)), pvp: f.pvp,
      online: isOnline(id), inTown: f.inTown, mapId: f.mapId,
      where: f.inTown ? '村莊' : MAPS[f.mapId]?.name,
    };
  };
  return {
    friends: p.friends.map(brief).filter(Boolean).sort((a, b) => b.online - a.online || b.cp - a.cp),
    requests: p.friendReqs.map(brief).filter(Boolean),
  };
}

/** 前往好友所在的地方（自己去過的地圖才能去） */
export function travelToFriend(p, id) {
  const f = players[id];
  if (!f || !p.friends.includes(id)) throw new GameError('對方不是你的好友');
  if (f.inTown) return enterTown(p);
  if (f.mapId > p.maxMap) throw new GameError(`你還沒解鎖「${MAPS[f.mapId].name}」`);
  changeMap(p, f.mapId);
}

// ── 村莊 ─────────────────────────────────────
export function enterTown(p) {
  p.inTown = true;
  scheduleSave();
}

// ── 換地圖 ───────────────────────────────────
// 某套裝擁有幾個「部位」（三種武器都算武器這一格）
// 用「鍛造圖鑑」判斷：做過就算，分解掉也不會被鎖回去
function setPiecesOwned(p, set) {
  return SLOTS.filter((slot) => p.codex.some((id) => ITEMS[id]?.set === set && ITEMS[id].slot === slot)).length;
}
const ownsSetWeapon = (p, set) => p.codex.some((id) => ITEMS[id]?.set === set && ITEMS[id].slot === 'weapon');

function unlockState(p, mapId) {
  const map = MAPS[mapId];
  if (!map) return null;
  const cp = calcCP(calcStats(p));
  const prevSet = mapId - 1;
  const pieces = prevSet >= 0 ? setPiecesOwned(p, prevSet) : UNLOCK_PIECES;
  const weapon = prevSet < 0 || ownsSetWeapon(p, prevSet);
  const visited = mapId <= p.maxMap;
  return {
    mapId,
    cpOk: visited || cp >= map.requiredCP,
    piecesOk: visited || (weapon && pieces >= UNLOCK_PIECES),
    weapon,
    pieces,
    needPieces: UNLOCK_PIECES,
    ok: visited || (cp >= map.requiredCP && weapon && pieces >= UNLOCK_PIECES),
  };
}

export function changeMap(p, mapId) {
  const u = unlockState(p, mapId);
  if (!u) throw new GameError('沒有這張地圖');
  if (!u.ok) {
    throw new GameError(!u.piecesOk
      ? `需要先做出 ${SETS[mapId - 1].name} 武器 + 套裝共 ${UNLOCK_PIECES} 件`
      : '戰力不足，無法前往');
  }
  p.mapId = mapId;
  p.maxMap = Math.max(p.maxMap, mapId);
  p.inTown = false;
  scheduleSave();
}

// ── 裝備戰力 ─────────────────────────────────
// power：這件裝備「本身」貢獻多少戰力（穿上它 − 那格空著）
// delta：換上它之後，總戰力會變多少（跟目前穿的比）
function gearPowers(p, cpNow) {
  const cpWith = (slot, uid) => calcCP(calcStats({ ...p, equipped: { ...p.equipped, [slot]: uid } }));
  const empty = {};
  for (const slot of SLOTS) empty[slot] = cpWith(slot, null);
  const out = {};
  for (const it of p.inv) {
    const slot = ITEMS[it.base].slot;
    const withIt = p.equipped[slot] === it.uid ? cpNow : cpWith(slot, it.uid);
    out[it.uid] = { power: Math.max(0, withIt - empty[slot]), delta: withIt - cpNow };
  }
  return out;
}

// ── 給前端的完整快照 ──────────────────────────
export function snapshot(p) {
  const stats = calcStats(p);
  const cp = calcCP(stats);
  const powers = gearPowers(p, cp);
  return {
    id: p.id,
    name: p.name,
    level: p.level,
    exp: p.exp,
    expToNext: expToNext(p.level),
    gold: p.gold,
    totalKills: p.totalKills,
    mapId: p.mapId,
    maxMap: p.maxMap,
    mats: Object.fromEntries(Object.entries(p.mats).map(([k, v]) => [k, floorMat(v)])),
    essence: p.essence,
    inv: p.inv.map((it) => ({
      ...it,
      ...powers[it.uid],
      cap: enhanceCap(it), enhanceCost: enhanceCost(it), rerollCost: rerollCost(it), yield: dismantleYield(it),
    })),
    equipped: p.equipped,
    gear: gearOf(p),
    codex: p.codex,
    inTown: p.inTown,
    skills: CLASS_SKILLS, // 固定技能（前端用目前武器類型取對應的 4 招）
    friendReqs: p.friendReqs.length,
    setBonus: setBonus(Object.values(gearOf(p))),
    nextUnlock: unlockState(p, p.mapId + 1),
    pvp: p.pvp,
    stats,
    cp,
    rates: calcRates(p),
    mounts: p.mounts,
    mount: p.mount,
    wings: p.wings,
    wing: p.wing,
    partners: p.partners,
    partnerOut: p.partnerOut,
    trial: p.trial, trialBest: p.trialBest, trialCd: p.trialCd || 0, raidCd: p.raidCd || 0,
    pets: p.pets, pet: p.pet, eggs: p.eggs,
    eggPrice: eggPrice(MAPS[Math.min(p.maxMap, MAPS.length - 1)].goldPerKill),
    party: { others: partyOf(p), mul: partyMul(partyOf(p)) },
    serverTime: Date.now(),
  };
}

export function leaderboard(limit = 20) {
  return Object.values(players)
    .map((p) => {
      return { name: p.name, level: p.level, cp: calcCP(calcStats(p)), totalKills: p.totalKills, pvp: p.pvp };
    })
    .sort((a, b) => b.cp - a.cp)
    .slice(0, limit);
}

export class GameError extends Error {
  constructor(msg, status = 400) { super(msg); this.status = status; }
}

/** 身上 5 個部位的裝備模板 id（給 3D 模型換外觀用） */
function gearOf(p) {
  const eq = equippedInsts(p);
  return Object.fromEntries(Object.entries(eq).map(([slot, it]) => [slot, it?.base ?? null]));
}

/** 給即時連線用：同地圖要顯示的公開資訊 */
export function publicInfo(id) {
  const p = players[id];
  if (!p) return null;
  const stats = calcStats(p);
  return {
    id: p.id, name: p.name, level: p.level, mapId: p.mapId,
    equipped: gearOf(p), atk: stats.atk, dps: stats.dps, wtype: stats.wtype,
    cp: calcCP(stats), pvp: p.pvp, zone: p.inTown ? -1 : p.mapId, inTown: p.inTown,
    mount: p.mount, mountSpeed: stats.mountSpeed,
    wing: p.wing, wingLv: p.wing ? p.wings[p.wing]?.lv ?? 1 : 0,
    pet: p.pet, petLv: p.pet ? p.pets[p.pet]?.lv ?? 1 : 0,
    partner: p.partnerOut, partnerLv: p.partnerOut ? p.partners[p.partnerOut]?.lv ?? 1 : 0,
  };
}
