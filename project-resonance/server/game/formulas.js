// ─────────────────────────────────────────────
// 數值公式：所有「戰力通膨」的源頭都在這裡
// 裝備模板在 items.js，隨機數值 / 強化在 gear.js
// ─────────────────────────────────────────────
import { ITEMS, SLOTS, WEAPON_TYPES, TIER_GOLD, setBonus } from './items.js';
import { mainMul, sumAffixes } from './gear.js';
import { mountStats } from './mounts.js';
import { wingStats } from './wings.js';
import { petStats } from './pets.js';

// 目前 3 張狩獵地圖（地形設計在 client/src/game3d/maps.js）
const MAP_NAMES = ['翠綠森林', '熔岩峽谷', '霜雪遺跡', '烈陽聖域', '幽影沼澤', '星界天穹'];

// 每張地圖的怪物血量 ×30、金幣 ×22、經驗 ×20 —— 指數成長
export const MAPS = MAP_NAMES.map((name, i) => ({
  id: i,
  name,
  monsterHp: 50 * 30 ** i,
  goldPerKill: 3 * TIER_GOLD ** i,  // 地圖變大、怪變多（擊殺速度約 ×1.7），每隻收益跟著下調
  expPerKill: 2.5 * 20 ** i,
  requiredCP: 0, // 下面用「參考配裝」算出來
}));

export const AOE_TARGETS = 5;          // 每次 AoE 命中的怪物數
export const SKILL_DPS_BONUS = 3;      // 技能 + 強力普攻大約再多 3 倍秒傷（只用在防作弊上限，不算進戰力）
export const MAX_KILLS_PER_SEC = 30;   // 場景刷怪上限
// 不再有離線收益：只結算「在線、在狩獵地圖、畫面開著」時實際打倒的怪
export const MAX_GAP_SEC = 8;      // 兩次回報間隔超過這個秒數就不算（關掉畫面 / 斷線）
export const KILL_SLACK = 1.6;     // 回報擊殺數最多只能是理論上限的 1.6 倍（防作弊）
export const ELITE_VALUE = 10;     // 菁英怪 = 10 隻小怪的收益
export const BASE_CRIT = { rate: 0.05, dmg: 1.5 };
// 組隊加成：同一張狩獵地圖每多 1 位玩家，金幣 / 經驗 / 素材 +10%，最多 +30%
export const PARTY_BONUS = 0.1;
export const PARTY_MAX = 3;
export const partyMul = (others) => 1 + Math.min(Math.max(0, others), PARTY_MAX) * PARTY_BONUS;

export function expToNext(level) {
  return Math.floor(20 * 1.15 ** level);
}

/** 身上穿的裝備實體：{ weapon: inst|null, helm: ..., ... } */
export function equippedInsts(p) {
  const out = {};
  for (const slot of SLOTS) out[slot] = p.inv.find((x) => x.uid === p.equipped[slot]) ?? null;
  return out;
}

export function calcStats(p) {
  const L = p.level;
  const eq = equippedInsts(p);
  const insts = Object.values(eq).filter(Boolean);
  const aff = sumAffixes(insts);
  // 坐騎：出戰坐騎的被動 + 收藏攻擊加成，跟裝備附加屬性一起算
  const ms = mountStats(p);
  aff.atkPct += ms.atkPct;
  aff.goldPct += ms.goldPct;
  aff.dropPct += ms.dropPct;
  aff.expPct += ms.expPct;
  // 翅膀：配戴中的翅膀屬性 + 收藏加成
  const ws = wingStats(p);
  aff.atkPct += ws.atkPct;
  aff.hpPct += ws.hpPct;
  aff.goldPct += ws.goldPct;
  aff.dropPct += ws.dropPct;
  // 寵物：出戰中的寵物加成
  const ps = petStats(p);
  aff.atkPct += ps.atkPct; aff.goldPct += ps.goldPct; aff.dropPct += ps.dropPct; aff.expPct += ps.expPct;

  const w = eq.weapon;
  const wt = w ? ITEMS[w.base] : ITEMS.starter_weapon;
  let atk = (10 + L * 3 + wt.atk * (w ? mainMul(w) : 1)) * (1 + aff.atkPct);

  // 防具：角色基礎值平均分到 4 個部位，再加上裝備數值
  let def = 0, hp = 0;
  for (const slot of SLOTS) {
    if (slot === 'weapon') continue;
    const it = eq[slot];
    const t = it && ITEMS[it.base];
    const m = it ? mainMul(it) : 1;
    def += (5 + L * 1.5) / 4 + (t?.def || 0) * m;
    hp += (100 + L * 20) / 4 + (t?.hp || 0) * m;
  }
  def *= 1 + aff.defPct;
  hp *= 1 + aff.hpPct;

  const bonus = setBonus(insts.map((x) => x.base));
  atk *= bonus.atkMul;
  hp *= bonus.hpMul;

  const type = WEAPON_TYPES[wt.wtype] ?? WEAPON_TYPES.great;
  const critRate = Math.min(1, BASE_CRIT.rate + aff.critRate);
  const critDmg = BASE_CRIT.dmg + aff.critDmg;
  const dps = atk * AOE_TARGETS * type.dpsMul * (1 + critRate * (critDmg - 1));
  return {
    atk, def, hp, dps, wtype: type.id,
    critRate, critDmg, goldPct: aff.goldPct, expPct: aff.expPct, dropPct: aff.dropPct,
    mountSpeed: ms.speed,
  };
}

export function calcCP(stats) {
  // 用秒傷算（三種武器秒傷一樣，戰力也就一樣公平）
  return Math.floor(stats.dps * 0.8 + stats.def * 6 + stats.hp * 0.5);
}

export function calcRates(p) {
  const stats = calcStats(p);
  const map = MAPS[p.mapId];
  const killsPerSec = Math.min(stats.dps / map.monsterHp, MAX_KILLS_PER_SEC);
  return {
    killsPerSec,
    goldPerSec: killsPerSec * map.goldPerKill * (1 + stats.goldPct),
    expPerSec: killsPerSec * map.expPerKill * (1 + stats.expPct),
    dropMul: 1 + stats.dropPct,
    goldMul: 1 + stats.goldPct,
    expMul: 1 + stats.expPct,
  };
}

// ── 前往下一區的戰力門檻 ─────────────────────
// 「上一區整套 5 件（普通品質、無附加）、每件強化 +N、等級 L」的戰力
// 這樣調裝備數值時門檻會自動跟著變，不會又變成一進去就秒殺 / 永遠進不去
const REQ_BUILD = [null, { enh: 5, level: 22 }, { enh: 6, level: 45 }, { enh: 6, level: 60 }, { enh: 7, level: 80 }, { enh: 8, level: 100 }];
function referenceCP(tier, enh, level) {
  const inv = [];
  const equipped = {};
  for (const slot of SLOTS) {
    const base = slot === 'weapon' ? `s${tier}_weapon` : `s${tier}_${slot}`;
    const inst = { uid: slot, base, grade: 0, q: 1, lv: enh, aff: [] };
    inv.push(inst);
    equipped[slot] = inst.uid;
  }
  return calcCP(calcStats({ level, inv, equipped }));
}
MAPS.forEach((m, i) => {
  const r = REQ_BUILD[i];
  if (r) m.requiredCP = Math.floor(referenceCP(i - 1, r.enh, r.level) / 100) * 100;
});
