// ─────────────────────────────────────────────
// 翅膀：不會飛，但配戴中的翅膀有屬性加成（見 wingBonus），世界王掉的素材製作 / 升級
// 等級越高外觀越華麗：Lv.1 基本 → Lv.4 發光邊 → Lv.7 飄落光點 → Lv.10 光環
// 外觀在 client/src/game3d/wingModel.js
// ─────────────────────────────────────────────

export const WING_MAX_LV = 10;

// ── 翅膀屬性（配戴中的那對才有）＋收藏加成 ──
// 主屬性：攻擊 / 生命 % = rank × (基礎 + 每級成長)；Lv.10 額外金幣 / 掉落
// 收藏：每擁有一對翅膀，攻擊 +1%
export const WING_COLLECT_ATK = 0.01;
export function wingBonus(id, lv) {
  const w = WINGS[id];
  if (!w) return {};
  const r = w.rank;
  const out = { atkPct: (r * (2 + lv * 0.6)) / 100, hpPct: (r * (2 + lv * 0.6)) / 100 };
  if (lv >= WING_MAX_LV) { out.goldPct = (r * 2) / 100; out.dropPct = (r * 2) / 100; }
  return out;
}
export function wingStats(p) {
  const s = { atkPct: 0, hpPct: 0, goldPct: 0, dropPct: 0 };
  const owned = Object.keys(p.wings || {}).filter((id) => WINGS[id]);
  s.atkPct += owned.length * WING_COLLECT_ATK;
  if (p.wing && p.wings?.[p.wing]) for (const [k, v] of Object.entries(wingBonus(p.wing, p.wings[p.wing].lv))) s[k] += v;
  return s;
}

// rank：稀有度（影響升級花費）
export const WINGS = {
  angel:     { id: 'angel', name: '天使之翼', icon: '🕊️', model: 'feather', rank: 1, color: '#ffffff', accent: '#ffe08a', desc: '純白羽翼，最經典的一對', cost: { mats: { wf: 40, wr: 1 } } },
  butterfly: { id: 'butterfly', name: '幻蝶之翼', icon: '🦋', model: 'butterfly', rank: 1, color: '#ff8fd0', accent: '#7dd3fc', desc: '半透明的蝶翼，會閃爍光澤', cost: { mats: { wf: 50, wr: 2 } } },
  demon:     { id: 'demon', name: '惡魔之翼', icon: '🦇', model: 'bat', rank: 2, color: '#2a1630', accent: '#ff3b5c', desc: '漆黑的蝠翼，翼膜透出紅光', cost: { mats: { wf: 70, wr: 3 } } },
  dragon:    { id: 'dragon', name: '熔岩龍翼', icon: '🐉', model: 'bat', rank: 2, color: '#5a2a1e', accent: '#ff7a2f', desc: '熔岩巨龍的翅膀，骨架流著熔光', cost: { mats: { wf: 90, wr: 4 } } },
  crystal:   { id: 'crystal', name: '霜晶之翼', icon: '❄️', model: 'crystal', rank: 2, color: '#bfe6ff', accent: '#6cc8ff', desc: '冰晶碎片拼成的翅膀', cost: { mats: { wf: 90, wr: 4 } } },
  // 聖羽之翼：Meshy 模型翅膀（client/public/models/wing.glb），會飄落羽毛、閃光（three.quarks）
  // 取得條件比較難：要先把任一對翅膀練到 Lv.10，再加上大量世界王素材 + 精華
  seraph:    { id: 'seraph', name: '聖羽之翼', icon: '🪽', model: 'glb', rank: 4, color: '#ffffff', accent: '#ffe08a', desc: '傳說中天使的羽翼，會飄落發光的羽毛。需要先有一對 Lv.10 的翅膀', cost: { mats: { wf: 280, wr: 18 }, essence: 400 }, requireMaxWing: true },
  star:      { id: 'star', name: '星河之翼', icon: '🌌', model: 'galaxy', rank: 3, color: '#2a1a6e', accent: '#9be7ff', desc: '半透明的星雲翼膜，裡面流動著整片星河', cost: { mats: { wf: 160, wr: 10 } } },
};

/** Lv → Lv+1 的升級花費 */
export function wingUpgradeCost(id, lv) {
  const w = WINGS[id];
  return { mats: { wf: Math.ceil(12 * lv * w.rank), wr: Math.ceil(lv * 0.6 * w.rank) } };
}
