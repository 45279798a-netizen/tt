// 目前在誰的莊園（村莊 / 野外 = null）。BattlePage 設定、ManorPage / 場景讀取
let state = { ownerId: null, view: null };
const subs = new Set();
export const manorStore = {
  get: () => state,
  set(next) { state = { ...state, ...next }; subs.forEach((f) => f(state)); },
  subscribe(f) { subs.add(f); return () => subs.delete(f); },
};
