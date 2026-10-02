// ─────────────────────────────────────────────
// 交易所（v0.6）：玩家之間用金幣買賣裝備、素材、寵物蛋、鍛造精華
//  - 上架時東西先交給交易所保管（從背包扣掉），賣出後金幣直接進賣家口袋
//  - 手續費 5%（賣家付；天賦「商人」每級 -0.5%），用來回收金幣、減緩通膨
//  - 每人最多 12 筆掛單，48 小時沒賣掉自動退回；可以隨時下架
//  - 穿著中 / 上鎖 / 新手武器不能賣；買裝備要背包有空位
//  - 存檔：server/data/market.json；AI 玩家偶爾也會上架多的素材、買便宜的東西
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { MAPS, calcStats } from './formulas.js';
import { ITEMS, SETS, DROP, MATERIALS } from './items.js';
import { INV_LIMIT } from './gear.js';
import { GameError, getPlayer, allPlayers, saveSoon } from './state.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'market.json');
export const MARKET_FEE = 0.05;
export const MAX_LISTINGS = 12;
const EXPIRE_MS = Number(process.env.MARKET_EXPIRE_H ?? 48) * 3600_000;
const MAX_PRICE = 1e18;

let listings = [];  // { id, seller, sellerName, kind: 'gear'|'mat'|'egg'|'essence', inst?, mat?, qty, price, at }
let history = [];   // 最近成交 { kind, name, qty, price, seller, buyer, at }
function load() {
  try { const s = JSON.parse(fs.readFileSync(FILE, 'utf8')); listings = s.listings || []; history = s.history || []; } catch { /* 第一次開 */ }
}
let saveT = null;
function save() {
  if (saveT) return;
  saveT = setTimeout(() => {
    saveT = null;
    try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify({ listings, history })); } catch { /* ignore */ }
  }, 2000);
}
load();

let onNotify = () => {};
export function setMarketNotify(fn) { onNotify = fn; }

const matName = (id) => MATERIALS[id]?.name ?? (id === 'wf' ? '羽晶' : id === 'wr' ? '星輝羽' : id);
export const feeOf = (p) => Math.max(0.01, MARKET_FEE - (calcStats(p).talent?.tradeFee || 0));

/** 參考價：大約等於「自己打這些素材要花的時間能賺的金幣」 */
export function refPrice(kind, key) {
  if (kind === 'mat') {
    if (key === 'wf') return MAPS[2].goldPerKill * 40;
    if (key === 'wr') return MAPS[3].goldPerKill * 60;
    const tier = SETS.findIndex((s) => s.mats.includes(key));
    if (tier < 0) return 0;
    const rare = SETS[tier].mats[1] === key;
    return Math.ceil(MAPS[tier].goldPerKill / (rare ? DROP.rare : DROP.common));
  }
  if (kind === 'egg') return MAPS[3].goldPerKill * 3000;
  if (kind === 'essence') return MAPS[2].goldPerKill * 6;
  return 0;
}

function nameOf(l) {
  if (l.kind === 'gear') return ITEMS[l.inst.base]?.name ?? '裝備';
  if (l.kind === 'mat') return matName(l.mat);
  if (l.kind === 'egg') return '寵物蛋';
  return '鍛造精華';
}

/** 過期的退回賣家 */
function expire(now = Date.now()) {
  const keep = [];
  for (const l of listings) {
    if (now - l.at < EXPIRE_MS) { keep.push(l); continue; }
    try { giveBack(getPlayer(l.seller), l); } catch { /* 角色不在了就丟掉 */ }
  }
  if (keep.length !== listings.length) { listings = keep; save(); saveSoon(); }
}
setInterval(expire, 60_000).unref?.();

function giveBack(p, l) {
  if (l.kind === 'gear') p.inv.push(l.inst); // 背包滿也先放進去（只會超出一點點）
  else if (l.kind === 'mat') p.mats[l.mat] = (p.mats[l.mat] || 0) + l.qty;
  else if (l.kind === 'egg') p.eggs += l.qty;
  else p.essence += l.qty;
}

export function marketView(p) {
  expire();
  return {
    fee: feeOf(p), max: MAX_LISTINGS, expireH: EXPIRE_MS / 3600_000,
    listings: listings.map((l) => ({ ...l, name: nameOf(l), mine: l.seller === p.id })).sort((a, b) => b.at - a.at),
    history: history.slice(0, 30),
    ref: Object.fromEntries([...SETS.flatMap((s) => s.mats), 'wf', 'wr'].map((m) => [m, refPrice('mat', m)])),
    refEgg: refPrice('egg'), refEssence: refPrice('essence'),
  };
}

/** 上架：{ kind, uid? , mat?, qty, price } */
export function listItem(p, b) {
  const kind = String(b.kind || '');
  const price = Math.floor(Number(b.price));
  if (!(price >= 1 && price <= MAX_PRICE)) throw new GameError('價格不正確');
  if (listings.filter((l) => l.seller === p.id).length >= MAX_LISTINGS) throw new GameError(`最多同時掛 ${MAX_LISTINGS} 筆`);
  const qty = Math.max(1, Math.floor(Number(b.qty) || 1));
  const l = { id: crypto.randomBytes(5).toString('hex'), seller: p.id, sellerName: p.name, kind, qty, price, at: Date.now() };
  if (kind === 'gear') {
    const i = p.inv.findIndex((x) => x.uid === b.uid);
    if (i < 0) throw new GameError('找不到這件裝備');
    const it = p.inv[i];
    if (Object.values(p.equipped).includes(it.uid)) throw new GameError('穿著中的裝備不能賣');
    if (it.lock) throw new GameError('上鎖的裝備不能賣（先解鎖）');
    if (it.base === 'starter_weapon') throw new GameError('新手武器不能賣');
    p.inv.splice(i, 1);
    l.inst = it; l.qty = 1;
  } else if (kind === 'mat') {
    const m = String(b.mat || '');
    if (!(refPrice('mat', m) > 0)) throw new GameError('不能賣這種東西');
    if (Math.floor((p.mats[m] || 0) + 1e-9) < qty) throw new GameError('素材不夠');
    p.mats[m] -= qty;
    l.mat = m;
  } else if (kind === 'egg') {
    if ((p.eggs || 0) < qty) throw new GameError('寵物蛋不夠');
    p.eggs -= qty;
  } else if (kind === 'essence') {
    if ((p.essence || 0) < qty) throw new GameError('精華不夠');
    p.essence -= qty;
  } else throw new GameError('不能賣這種東西');
  listings.push(l);
  save(); saveSoon();
  return { id: l.id };
}

export function cancelListing(p, id) {
  const i = listings.findIndex((l) => l.id === id && l.seller === p.id);
  if (i < 0) throw new GameError('找不到這筆掛單');
  const [l] = listings.splice(i, 1);
  giveBack(p, l);
  save(); saveSoon();
  return { id };
}

export function buyListing(p, id) {
  const i = listings.findIndex((l) => l.id === id);
  if (i < 0) throw new GameError('這筆已經被買走了');
  const l = listings[i];
  if (l.seller === p.id) throw new GameError('不能買自己的東西（可以下架）');
  if (p.gold < l.price) throw new GameError('金幣不足');
  if (l.kind === 'gear' && p.inv.length >= INV_LIMIT) throw new GameError(`背包滿了（${INV_LIMIT} 格）`);
  listings.splice(i, 1);
  p.gold -= l.price;
  giveBack(p, l);
  let seller = null;
  try { seller = getPlayer(l.seller); } catch { /* 賣家不在了 */ }
  const got = Math.floor(l.price * (1 - (seller ? feeOf(seller) : MARKET_FEE)));
  if (seller) seller.gold += got;
  const name = nameOf(l);
  history.unshift({ kind: l.kind, name, qty: l.qty, price: l.price, seller: l.sellerName, buyer: p.name, at: Date.now(), grade: l.inst?.grade });
  history = history.slice(0, 60);
  save(); saveSoon();
  if (seller) onNotify(seller.id, { t: 'market', text: `💰 ${p.name} 買走了你的 ${name}${l.qty > 1 ? ` ×${l.qty}` : ''}，入帳 ${got.toLocaleString()} 金幣` });
  return { id, name, qty: l.qty, price: l.price };
}

// ── AI 玩家：讓交易所有點人氣 ─────────────────
/** 賣多的素材（打到的那一區的普通素材、羽晶），價格在參考價 ±25% */
export function botMarketTick(bot) {
  if (listings.filter((l) => l.seller === bot.id).length >= 4) return;
  const tier = Math.min(bot.maxMap || 0, SETS.length - 1);
  const pool = [...SETS[tier].mats, 'wf'].filter((m) => Math.floor(bot.mats[m] || 0) >= 30);
  if (pool.length && Math.random() < 0.6) {
    const m = pool[Math.floor(Math.random() * pool.length)];
    const qty = Math.min(Math.floor(bot.mats[m] / 3), m === SETS[tier].mats[1] ? 3 : 40);
    if (qty < 1) return;
    try { listItem(bot, { kind: 'mat', mat: m, qty, price: Math.ceil(refPrice('mat', m) * qty * (0.75 + Math.random() * 0.5)) }); } catch { /* 沒關係 */ }
    return;
  }
  // 便宜的東西（低於參考價 7 成）就買
  const deal = listings.find((l) => l.seller !== bot.id && l.kind === 'mat' && l.price < refPrice('mat', l.mat) * l.qty * 0.7 && bot.gold > l.price * 3);
  if (deal) { try { buyListing(bot, deal.id); } catch { /* 沒關係 */ } }
}

/** 管理員 / 測試用 */
export const marketStats = () => ({ listings: listings.length, sold: history.length, players: allPlayers().length });
