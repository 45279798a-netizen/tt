// ─────────────────────────────────────────────
// 管理員系統：發放物資 / 全服公告
//  - 第一次開伺服器會產生「管理員密鑰」存在 server/data/admin.json，並印在伺服器視窗
//    （也可以用環境變數 ADMIN_KEY 指定）
//  - 遊戲裡「角色 → 最下面 → 管理員」輸入密鑰 → 這個帳號變成管理員，右上角多一個「管理」按鈕
//  - 管理員可以：查看所有玩家、發放物資給「某幾位 / 在線玩家 / 全部玩家」、全服公告
//    物資：金幣、精華、寵物蛋、任何素材、指定裝備（部位 / 品質 / 強化）、坐騎、翅膀、寵物
//  - 收到的人會即時跳通知；每一筆發放都記在 server/data/admin-log.txt
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ITEMS, MATERIALS } from './items.js';
import { GRADES, INV_LIMIT, rollItem, enhanceCap } from './gear.js';
import { MOUNTS } from './mounts.js';
import { WINGS, WING_MAX_LV } from './wings.js';
import { PETS, PET_MAX_STAR } from './pets.js';
import { allPlayers, getPlayer, GameError, saveSoon } from './state.js';
import { rebirthOf } from './rebirth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const KEY_FILE = path.join(DATA_DIR, 'admin.json');
const LOG_FILE = path.join(DATA_DIR, 'admin-log.txt');

let adminKey = '';

/** 開機時呼叫：讀 / 產生管理員密鑰 */
export function initAdmin() {
  if (process.env.ADMIN_KEY) { adminKey = String(process.env.ADMIN_KEY); return adminKey; }
  try {
    adminKey = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8')).key || '';
  } catch { /* 第一次開 */ }
  if (!adminKey) {
    adminKey = crypto.randomBytes(4).toString('hex').toUpperCase();
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(KEY_FILE, JSON.stringify({ key: adminKey, note: '遊戲裡「角色 → 管理員」輸入這組密鑰就能成為管理員；刪掉這個檔案重開伺服器會換一組新的' }, null, 2));
  }
  return adminKey;
}

function log(line) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${line}\n`);
  } catch { /* 記錄失敗不影響發放 */ }
}

/** 輸入密鑰成為管理員 */
export function claimAdmin(p, key) {
  const a = Buffer.from(String(key ?? '').trim().toUpperCase());
  const b = Buffer.from(adminKey.toUpperCase());
  if (!adminKey || a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new GameError('密鑰錯誤', 403);
  p.admin = true;
  saveSoon();
  log(`[成為管理員] ${p.name}`);
  console.log(`[管理員] ${p.name} 成為管理員`);
  return { ok: true };
}

export function needAdmin(p) {
  if (!p.admin) throw new GameError('只有管理員可以使用', 403);
}

/** 所有玩家（管理面板列表用） */
export function adminPlayers(isOnline) {
  return allPlayers()
    .map((q) => ({
      id: q.id, name: q.name, level: q.level, rebirth: rebirthOf(q), maxMap: q.maxMap,
      gold: q.gold, essence: q.essence, eggs: q.eggs || 0, online: isOnline(q.id), admin: !!q.admin,
      inTown: q.inTown, mapId: q.mapId,
    }))
    .sort((a, b) => b.online - a.online || b.level - a.level);
}

const num = (v, max = 1e18) => {
  const n = Math.floor(Number(v) || 0);
  return Math.max(0, Math.min(max, n));
};

/** 整理管理員送來的物資內容（擋掉亂填的值） */
function cleanBundle(b = {}) {
  const out = { gold: num(b.gold), essence: num(b.essence, 1e9), eggs: num(b.eggs, 999), mats: {}, item: null, mount: null, wing: null, pet: null };
  for (const [id, n] of Object.entries(b.mats || {})) if (MATERIALS[id] && num(n, 1e9) > 0) out.mats[id] = num(n, 1e9);
  if (b.item?.base && ITEMS[b.item.base] && b.item.base !== 'starter_weapon') {
    const t = ITEMS[b.item.base];
    let grade = Math.min(GRADES.length - 1, num(b.item.grade, 9));
    if (GRADES[grade].weaponOnly && t.slot !== 'weapon') grade = 3;
    out.item = { base: b.item.base, grade, lv: num(b.item.lv, 999), count: Math.max(1, num(b.item.count, 20)) };
  }
  if (b.mount && MOUNTS[b.mount]) out.mount = b.mount;
  if (b.wing && WINGS[b.wing]) out.wing = b.wing;
  if (b.pet && PETS[b.pet]) out.pet = b.pet;
  return out;
}

/** 文字摘要（通知 / 紀錄用） */
function describe(x) {
  const parts = [];
  if (x.gold) parts.push(`💰${x.gold.toLocaleString()}`);
  if (x.essence) parts.push(`💠${x.essence}`);
  if (x.eggs) parts.push(`🥚寵物蛋×${x.eggs}`);
  for (const [id, n] of Object.entries(x.mats)) parts.push(`${MATERIALS[id].name}×${n}`);
  if (x.item) parts.push(`【${GRADES[x.item.grade].name}】${ITEMS[x.item.base].name}${x.item.lv ? ` +${x.item.lv}` : ''}${x.item.count > 1 ? ` ×${x.item.count}` : ''}`);
  if (x.mount) parts.push(`坐騎「${MOUNTS[x.mount].name}」`);
  if (x.wing) parts.push(`翅膀「${WINGS[x.wing].name}」`);
  if (x.pet) parts.push(`寵物「${PETS[x.pet].name}」`);
  return parts.join('、');
}

/** 發給一位玩家；回傳實際拿到的東西（背包滿就少給裝備） */
function giveTo(q, x) {
  q.gold += x.gold;
  q.essence += x.essence;
  q.eggs = (q.eggs || 0) + x.eggs;
  for (const [id, n] of Object.entries(x.mats)) q.mats[id] = (q.mats[id] || 0) + n;
  const got = { ...x, mats: { ...x.mats } };
  if (x.item) {
    const room = Math.max(0, INV_LIMIT - q.inv.length);
    const n = Math.min(room, x.item.count);
    for (let i = 0; i < n; i++) {
      const inst = rollItem(x.item.base, { grade: x.item.grade });
      inst.lv = Math.min(x.item.lv, enhanceCap(inst, rebirthOf(q)));
      q.inv.push(inst);
    }
    if (n > 0 && !q.codex.includes(x.item.base)) q.codex.push(x.item.base);
    got.item = n > 0 ? { ...x.item, count: n } : null;
  }
  if (x.mount && !q.mounts[x.mount]) { q.mounts[x.mount] = { lv: 1 }; q.mount ||= x.mount; } else got.mount = null;
  if (x.wing) {
    if (!q.wings[x.wing]) { q.wings[x.wing] = { lv: 1 }; q.wing ||= x.wing; } else q.wings[x.wing].lv = Math.min(WING_MAX_LV, q.wings[x.wing].lv + 1);
  }
  if (x.pet) {
    const own = q.pets[x.pet];
    if (!own) { q.pets[x.pet] = { lv: 1, star: 0 }; q.pet ||= x.pet; } else own.star = Math.min(PET_MAX_STAR, own.star + 1);
  }
  return got;
}

/**
 * 發放物資
 * @param target 'all' | 'online' | [玩家 id...]
 * @returns { count, text, events } events 給即時連線推播通知
 */
export function adminGive(admin, { target, bundle, note } = {}, isOnline) {
  needAdmin(admin);
  const x = cleanBundle(bundle);
  const text = describe(x);
  if (!text) throw new GameError('沒有選任何物資');
  let list;
  if (target === 'all') list = allPlayers();
  else if (target === 'online') list = allPlayers().filter((q) => isOnline(q.id));
  else if (Array.isArray(target)) list = [...new Set(target.map(String))].map((id) => { try { return getPlayer(id); } catch { return null; } }).filter(Boolean);
  else throw new GameError('請選擇要發給誰');
  if (!list.length) throw new GameError('沒有符合的玩家');
  const msg = String(note ?? '').trim().slice(0, 80);
  const events = [];
  let short = 0;
  for (const q of list) {
    const got = giveTo(q, x);
    if (x.item && (!got.item || got.item.count < x.item.count)) short += 1;
    events.push({ to: q.id, msg: { t: 'gift', from: admin.name, text: describe(got), note: msg } });
  }
  saveSoon();
  const who = target === 'all' ? '全部玩家' : target === 'online' ? '在線玩家' : list.map((q) => q.name).join('、');
  log(`[發放] ${admin.name} → ${who}（${list.length} 人）：${text}${msg ? `｜附言：${msg}` : ''}`);
  console.log(`[管理員] ${admin.name} 發放給 ${who}：${text}`);
  return { count: list.length, text, short, events };
}

/** 全服公告 */
export function adminAnnounce(admin, rawText) {
  needAdmin(admin);
  const text = String(rawText ?? '').trim().slice(0, 120);
  if (!text) throw new GameError('公告內容是空的');
  log(`[公告] ${admin.name}：${text}`);
  return [{ to: 'all', msg: { t: 'announce', from: admin.name, text } }];
}

/** 移除某人的管理員身分（不能移除自己，避免沒人能管） */
export function adminRevoke(admin, id) {
  needAdmin(admin);
  const q = getPlayer(String(id));
  if (q.id === admin.id) throw new GameError('不能移除自己');
  q.admin = false;
  saveSoon();
  log(`[移除管理員] ${admin.name} 移除了 ${q.name}`);
  return { ok: true };
}
