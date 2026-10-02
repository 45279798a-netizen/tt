// 所有對後端的呼叫集中在這裡；登入後的 token 放在 x-token 標頭
const TOKEN_KEY = 'resonance.token';

export const auth = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } },
  set: (t) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* 無痕模式 */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* 無痕模式 */ } },
};

async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'x-token': auth.get() },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const post = (path, body) => request(path, { method: 'POST', body });

export const api = {
  config: () => request('/config'),
  register: (name, password) => post('/register', { name, password }),
  login: (name, password) => post('/login', { name, password }),
  session: () => request('/session'),
  logout: () => post('/logout', {}),
  sync: (report) => post('/me/sync', report),
  craft: (base) => post('/me/craft', { base }),
  craftMany: (base, times) => post('/me/craft/many', { base, times }),
  craftMissing: (set) => post('/me/craft/missing', { set }),
  enhanceMany: (uid, times) => post('/me/enhance/many', { uid, times }),
  enhance: (uid) => post('/me/enhance', { uid }),
  reroll: (uid) => post('/me/reroll', { uid }),
  equip: (uid) => post('/me/equip', { uid }),
  dismantle: (uids) => post('/me/dismantle', { uids }),
  lock: (uid, lock) => post('/me/lock', { uid, lock }),
  changeMap: (mapId) => post('/me/map', { mapId }),
  goTown: () => post('/me/town', {}),
  goField: () => post('/me/field', {}),
  goBoss: () => post('/me/boss', {}),
  market: () => request('/me/market'),
  marketList: (b) => post('/me/market/list', b),
  marketCancel: (id) => post('/me/market/cancel', { id }),
  marketBuy: (id) => post('/me/market/buy', { id }),
  towerStart: () => post('/me/tower/start', {}),
  towerClear: () => post('/me/tower/clear', {}),
  towerFail: () => post('/me/tower/fail', {}),
  friends: () => request('/me/friends'),
  petBuy: () => post('/me/pet/buy', {}),
  petHatch: () => post('/me/pet/hatch', {}),
  petFeed: (id) => post('/me/pet/feed', { id }),
  petEquip: (id) => post('/me/pet/equip', { id }),
  manorInfo: () => request('/me/manor'),
  manorCollect: () => post('/me/manor/collect', {}),
  manorBuild: (plot, id) => post('/me/manor/build', { plot, id }),
  manorUpgrade: (plot) => post('/me/manor/upgrade', { plot }),
  manorRemove: (plot) => post('/me/manor/remove', { plot }),
  manorVisit: (id) => post('/me/manor/visit', { id }),
  synth: (id, times) => post('/me/synth', { id, times }),
  friendRequest: (name) => post('/me/friends/request', { name }),
  friendAnswer: (id, accept) => post('/me/friends/answer', { id, accept }),
  friendRemove: (id) => post('/me/friends/remove', { id }),
  travelToFriend: (id) => post('/me/friends/travel', { id }),
  upgradePartner: (id) => post('/me/partner/upgrade', { id }),
  trialStart: () => post('/me/trial/start', {}),
  raidStart: () => post('/me/raid/start', {}),
  trialEnd: () => post('/me/trial/end', {}),
  recruitPartner: (id) => post('/me/partner/recruit', { id }),
  deployPartner: (id) => post('/me/partner/deploy', { id }),
  craftWing: (id) => post('/me/wing/craft', { id }),
  upgradeWing: (id) => post('/me/wing/upgrade', { id }),
  equipWing: (id) => post('/me/wing/equip', { id }),
  buyMount: (id) => post('/me/mount/buy', { id }),
  upgradeMount: (id) => post('/me/mount/upgrade', { id }),
  equipMount: (id) => post('/me/mount/equip', { id }),
  rt: (body) => post('/rt', body),
  rebirth: () => post('/me/rebirth', {}),
  talent: (id) => post('/me/talent', { id }),
  loadout: (cls, ids) => post('/me/loadout', { cls, ids }),
  talentReset: () => post('/me/talent/reset', {}),
  dailyClaim: (i) => post('/me/daily/claim', { i }),
  dailyChest: () => post('/me/daily/chest', {}),
  achieveClaim: (id, tier) => post('/me/achieve/claim', { id, tier }),
  adminClaim: (key) => post('/me/admin/claim', { key }),
  adminPlayers: () => request('/admin/players'),
  adminGive: (body) => post('/admin/give', body),
  adminAnnounce: (text) => post('/admin/announce', { text }),
  leaderboard: () => request('/leaderboard'),
};
