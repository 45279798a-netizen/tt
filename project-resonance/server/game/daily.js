// ─────────────────────────────────────────────
// 每日任務：每天（台灣時間 0 點換日）隨機 5 個任務，做完領獎；5 個都領完再開「每日寶箱」
//  - 進度由各個動作回報：擊殺（settle）、菁英、獵場擊殺、鍛造、強化、分解、魔物潮、世界王 / 首領突襲
//  - 獎勵跟著最遠地圖成長（金幣），精華 / 羽晶固定
// ─────────────────────────────────────────────
export const DAILY_POOL = [
  { kind: 'kill', name: '討伐魔物', icon: '⚔️', targets: [400, 800, 1500] },
  { kind: 'elite', name: '擊倒菁英', icon: '💀', targets: [5, 10, 20] },
  { kind: 'field', name: '在緣起獵場狩獵', icon: '🌾', targets: [300, 600] },
  { kind: 'craft', name: '鍛造裝備', icon: '⚒️', targets: [2, 4] },
  { kind: 'enhance', name: '強化裝備', icon: '✨', targets: [3, 6, 10] },
  { kind: 'dismantle', name: '分解裝備', icon: '♻️', targets: [3, 6] },
  { kind: 'trial', name: '完成魔物潮', icon: '🌀', targets: [1] },
  { kind: 'boss', name: '討伐巨大首領或首領突襲', icon: '👑', targets: [1] },
  { kind: 'skill', name: '施放技能', icon: '🌟', targets: [40, 80] },
];
const QUESTS_PER_DAY = 5;

/** 台灣時間的日期字串（伺服器在哪個時區都一樣） */
export const todayKey = (now = Date.now()) => new Date(now + 8 * 3600_000).toISOString().slice(0, 10);

function seeded(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909); return ((h >>>= 0) % 1e6) / 1e6; };
}

/** 確保今天的任務已經產生（換日就重抽） */
export function ensureDaily(p, now = Date.now()) {
  const day = todayKey(now);
  if (p.daily?.day === day) return p.daily;
  const rnd = seeded(p.id + day);
  const pool = [...DAILY_POOL].sort(() => rnd() - 0.5).slice(0, QUESTS_PER_DAY);
  p.daily = {
    day,
    quests: pool.map((q) => ({ kind: q.kind, target: q.targets[Math.floor(rnd() * q.targets.length)], prog: 0, claimed: false })),
    chest: false,
  };
  return p.daily;
}

/** 進度 +n（各個動作呼叫） */
export function dailyAdd(p, kind, n = 1) {
  if (!(n > 0)) return;
  const d = ensureDaily(p);
  for (const q of d.quests) if (q.kind === kind && !q.claimed) q.prog = Math.min(q.target, q.prog + n);
}

/** 每個任務的獎勵 */
export function questReward(p, goldPerKill) {
  return { essence: 25 + (p.maxMap || 0) * 10, mats: { wf: 12 }, gold: Math.floor(goldPerKill * 400) };
}
export function chestReward(p, goldPerKill) {
  return { essence: 80 + (p.maxMap || 0) * 25, mats: { wf: 30, wr: 3 }, gold: Math.floor(goldPerKill * 1500), eggs: 1 };
}

export function dailyView(p, goldPerKill) {
  const d = ensureDaily(p);
  return {
    day: d.day, chest: d.chest,
    quests: d.quests.map((q, i) => ({ ...q, i, ...DAILY_POOL.find((x) => x.kind === q.kind), targets: undefined })),
    reward: questReward(p, goldPerKill), chestReward: chestReward(p, goldPerKill),
  };
}
