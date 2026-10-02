// ─────────────────────────────────────────────
// Project Resonance 本機私服 — Express 主程式
// ─────────────────────────────────────────────
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAPS } from './game/formulas.js';
import { GRADES, AFFIXES, INV_LIMIT, ENHANCE_PER_LV } from './game/gear.js';
import { SKILLS, CLASS_SKILLS } from './game/skills.js';
import { MOUNTS, MOUNT_MAX_LV, COLLECT_ATK, mountBonus, mountUpgradeCost } from './game/mounts.js';
import { PARTY_BONUS, PARTY_MAX } from './game/formulas.js';
import { ITEMS, MATERIALS, SETS, SLOTS, SLOT_LABEL, UNLOCK_PIECES, WEAPON_TYPES } from './game/items.js';
import { attachRealtime, httpRealtime, isOnline, notify, deliver } from './game/realtime.js';
import { hitBoss, bossPublic, myBossDamage } from './game/boss.js';
import { startRaid, hitRaid, raidPublic } from './game/raid.js';
import { BUILDINGS, BUILD_MAX_LV, PLOTS } from './game/manor.js';
import { PETS, PET_MAX_LV, PET_MAX_STAR, petBonus, petFeedCost } from './game/pets.js';
import { WINGS, WING_MAX_LV, wingUpgradeCost, wingBonus, WING_COLLECT_ATK } from './game/wings.js';
import { PARTNERS, PARTNER_MAX_LV, partnerUpgradeCost } from './game/partners.js';
import {
  loadSave, saveNow, register, login, logout, playerByToken, settle,
  craft, equip, enhanceItem, rerollItem, dismantle, setLock, enterTown, buyMount, upgradeMount, equipMount, craftWing, upgradeWing, equipWing, recruitPartner, deployPartner, upgradePartner, startTrial, endTrial,
  buyEgg, hatchEgg, feedPet, equipPet,
  manorCollect, manorBuild, manorUpgrade, manorRemove, manorInfo, manorVisit, synth, synthRecipes,
  friendRequest, friendAnswer, friendRemove, friendList, travelToFriend,
  changeMap, snapshot, leaderboard, GameError, doRebirth, enterField,
  doLearnTalent, resetTalents, claimDaily, claimDailyChest, claimAchieve,
} from './game/state.js';
import { startBots, botFriendReply } from './game/bots.js';
import { initAdmin, claimAdmin, needAdmin, adminPlayers, adminGive, adminAnnounce, adminRevoke } from './game/admin.js';
import { TALENTS, BRANCHES, TALENT_TIER_REQ } from './game/talents.js';
import { REBIRTH_LV, REBIRTH_MAX, REBIRTH_PER, CLASS_TITLES, REBIRTH_COLORS } from './game/rebirth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');

loadSave();
const ADMIN_KEY = initAdmin();
const app = express();
app.use(express.json());

// 小工具：包住 handler，統一錯誤格式
const route = (fn) => (req, res) => {
  try {
    res.json(fn(req));
  } catch (err) {
    const status = err instanceof GameError ? err.status : 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: err.message || '伺服器錯誤' });
  }
};

// 玩家快照 + 世界王狀態（在哪、剩多少血、我打了幾 %）
const snap = (p) => ({ ...snapshot(p), worldBoss: { ...bossPublic(), myShare: myBossDamage(p.id) }, raid: raidPublic(p.raidId) });

// ── API ──────────────────────────────────────
app.get('/api/health', route(() => ({ ok: true, time: Date.now() })));

app.get('/api/config', route(() => ({
  maps: MAPS, items: ITEMS, materials: MATERIALS, sets: SETS,
  slots: SLOTS, slotLabel: SLOT_LABEL, unlockPieces: UNLOCK_PIECES, weaponTypes: WEAPON_TYPES,
  grades: GRADES, affixes: AFFIXES, invLimit: INV_LIMIT, enhancePerLv: ENHANCE_PER_LV,
  skills: SKILLS, classSkills: CLASS_SKILLS,
  // 坐騎：每級的加成 / 升級花費先算好給前端顯示
  mounts: Object.fromEntries(Object.entries(MOUNTS).map(([id, m]) => [id, {
    ...m,
    levels: Array.from({ length: MOUNT_MAX_LV }, (_, i) => ({ bonus: mountBonus(id, i + 1), cost: i + 1 < MOUNT_MAX_LV ? mountUpgradeCost(id, i + 1) : null })),
  }])),
  wings: Object.fromEntries(Object.entries(WINGS).map(([id, w]) => [id, {
    ...w, levels: Array.from({ length: WING_MAX_LV }, (_, i) => ({ bonus: wingBonus(id, i + 1), cost: i + 1 < WING_MAX_LV ? wingUpgradeCost(id, i + 1) : null })),
  }])),
  wingMaxLv: WING_MAX_LV, wingCollectAtk: WING_COLLECT_ATK,
  partners: PARTNERS, partnerMaxLv: PARTNER_MAX_LV,
  pets: Object.fromEntries(Object.entries(PETS).map(([id, d]) => [id, { ...d, levels: Array.from({ length: PET_MAX_LV }, (_, i) => ({ bonus: petBonus(id, i + 1), cost: i + 1 < PET_MAX_LV ? petFeedCost(i + 1) : null })) }])),
  petMaxLv: PET_MAX_LV, petMaxStar: PET_MAX_STAR,
  synthRecipes: synthRecipes(), buildings: BUILDINGS, buildMaxLv: BUILD_MAX_LV, manorPlots: PLOTS,
  partnerCosts: Array.from({ length: PARTNER_MAX_LV }, (_, i) => partnerUpgradeCost(i + 1)),
  mountMaxLv: MOUNT_MAX_LV, collectAtk: COLLECT_ATK, partyBonus: PARTY_BONUS, partyMax: PARTY_MAX,
  talents: TALENTS, talentBranches: BRANCHES, talentTierReq: TALENT_TIER_REQ,
  rebirth: { level: REBIRTH_LV, max: REBIRTH_MAX, per: REBIRTH_PER, titles: CLASS_TITLES, colors: REBIRTH_COLORS },
})));

// ── 帳號 ──────────────────────────────────────
const tokenOf = (req) => req.get('x-token') || '';
const me = (req) => playerByToken(tokenOf(req));

app.post('/api/register', route((req) => {
  const { p, token } = register(req.body?.name, req.body?.password);
  settle(p);
  return { token, player: snap(p) };
}));

app.post('/api/login', route((req) => {
  const { p, token, claimed } = login(req.body?.name, req.body?.password);
  settle(p); // 重設計時，不給離線收益
  return { token, claimed, player: snap(p) };
}));

// 用記住的 token 自動登入
app.get('/api/session', route((req) => {
  const p = me(req);
  settle(p);
  return { player: snap(p) };
}));

app.post('/api/logout', route((req) => { logout(tokenOf(req)); return { ok: true }; }));

// ── 遊戲（都要登入） ─────────────────────────
// 前端每 2 秒回報這段時間打倒的怪：{ kills, elites }
app.post('/api/me/sync', route((req) => {
  const p = me(req);
  const gained = settle(p, req.body || {});
  deliver(hitBoss(p.id, req.body?.bossDmg)); // 打世界王的傷害
  deliver(hitRaid(p.id, req.body?.raidDmg)); // 首領突襲的傷害
  return { player: snap(p), gained };
}));

// 玩家動作；動作的回傳值放在 result
const action = (fn) => route((req) => {
  const p = me(req);
  const result = fn(p, req.body || {}) ?? null;
  p.lastSettle = Date.now(); // 換地圖 / 回村莊時重新開始計時
  return { player: snap(p), result };
});

// 鍛造師（要在村莊）
app.post('/api/me/craft', action((p, b) => craft(p, b.base)));
app.post('/api/me/enhance', action((p, b) => enhanceItem(p, b.uid)));
app.post('/api/me/reroll', action((p, b) => rerollItem(p, b.uid)));
// 背包
app.post('/api/me/equip', action((p, b) => equip(p, b.uid)));
app.post('/api/me/dismantle', action((p, b) => dismantle(p, b.uids)));
app.post('/api/me/lock', action((p, b) => setLock(p, b.uid, b.lock)));
// 坐騎（買 / 升級要在村莊）
app.post('/api/me/mount/buy', action((p, b) => buyMount(p, String(b.id || ''))));
app.post('/api/me/mount/upgrade', action((p, b) => upgradeMount(p, String(b.id || ''))));
app.post('/api/me/partner/recruit', action((p, b) => recruitPartner(p, String(b.id || ''))));
app.post('/api/me/partner/upgrade', action((p, b) => upgradePartner(p, String(b.id || ''))));
app.post('/api/me/trial/start', action((p) => startTrial(p)));
app.post('/api/me/raid/start', action((p) => startRaid(p)));
// 莊園
app.get('/api/me/manor', action((p) => manorInfo(p)));
app.post('/api/me/manor/collect', action((p) => manorCollect(p)));
app.post('/api/me/manor/build', action((p, b) => manorBuild(p, Number(b.plot), String(b.id || ''))));
app.post('/api/me/manor/upgrade', action((p, b) => manorUpgrade(p, Number(b.plot))));
app.post('/api/me/manor/remove', action((p, b) => manorRemove(p, Number(b.plot))));
app.post('/api/me/manor/visit', action((p, b) => manorVisit(p, String(b.id || ''))));
// 寵物
app.post('/api/me/pet/buy', action((p) => buyEgg(p)));
app.post('/api/me/pet/hatch', action((p) => hatchEgg(p)));
app.post('/api/me/pet/feed', action((p, b) => feedPet(p, String(b.id || ''))));
app.post('/api/me/pet/equip', action((p, b) => equipPet(p, b.id ? String(b.id) : null)));
// 素材合成
app.post('/api/me/synth', action((p, b) => synth(p, String(b.id || ''), Number(b.times) || 1)));
app.post('/api/me/trial/end', action((p) => endTrial(p)));
// 轉職（村莊的轉職殿堂）
app.post('/api/me/rebirth', action((p) => doRebirth(p)));
// 天賦樹、每日任務、成就
app.post('/api/me/talent', action((p, b) => doLearnTalent(p, b.id)));
app.post('/api/me/talent/reset', action((p) => resetTalents(p)));
app.post('/api/me/daily/claim', action((p, b) => claimDaily(p, b.i)));
app.post('/api/me/daily/chest', action((p) => claimDailyChest(p)));
app.post('/api/me/achieve/claim', action((p, b) => claimAchieve(p, String(b.id || ''), b.tier)));
// 管理員：輸入密鑰成為管理員 → 發放物資、全服公告
app.post('/api/me/admin/claim', action((p, b) => claimAdmin(p, b.key)));
app.get('/api/admin/players', route((req) => { const p = me(req); needAdmin(p); return { list: adminPlayers(isOnline) }; }));
app.post('/api/admin/give', route((req) => {
  const r = adminGive(me(req), req.body || {}, isOnline);
  deliver(r.events);
  return { count: r.count, text: r.text, short: r.short };
}));
app.post('/api/admin/announce', route((req) => { deliver(adminAnnounce(me(req), req.body?.text)); return { ok: true }; }));
app.post('/api/admin/revoke', route((req) => adminRevoke(me(req), req.body?.id)));
app.post('/api/me/partner/deploy', action((p, b) => deployPartner(p, b.id ? String(b.id) : null)));
app.post('/api/me/wing/craft', action((p, b) => craftWing(p, String(b.id || ''))));
app.post('/api/me/wing/upgrade', action((p, b) => upgradeWing(p, String(b.id || ''))));
app.post('/api/me/wing/equip', action((p, b) => equipWing(p, b.id ? String(b.id) : null)));
app.post('/api/me/mount/equip', action((p, b) => equipMount(p, b.id ? String(b.id) : null)));
// 移動
app.post('/api/me/map', action((p, b) => changeMap(p, Number(b.mapId))));
app.post('/api/me/town', action((p) => enterTown(p)));
app.post('/api/me/field', action((p) => enterField(p))); // 村莊南邊的緣起獵場
// 好友
app.get('/api/me/friends', route((req) => friendList(me(req), isOnline)));
app.post('/api/me/friends/request', route((req) => {
  const p = me(req);
  const { target, autoAccepted } = friendRequest(p, req.body?.name);
  if (target.bot && !autoAccepted) botFriendReply(target, p, notify); // AI 玩家幾秒後自動接受
  notify(target.id, autoAccepted
    ? { t: 'friend_info', text: `你和 ${p.name} 成為好友了！` }
    : { t: 'friend_req', from: p.id, name: p.name });
  return { ok: true, autoAccepted, ...friendList(p, isOnline) };
}));
app.post('/api/me/friends/answer', route((req) => {
  const p = me(req);
  const from = friendAnswer(p, String(req.body?.id || ''), !!req.body?.accept);
  if (from && req.body?.accept) notify(from.id, { t: 'friend_info', text: `${p.name} 接受了你的好友邀請！` });
  return friendList(p, isOnline);
}));
app.post('/api/me/friends/remove', route((req) => {
  const p = me(req);
  friendRemove(p, String(req.body?.id || ''));
  return friendList(p, isOnline);
}));
app.post('/api/me/friends/travel', action((p, b) => travelToFriend(p, String(b.id || ''))));

// 即時連線的備援（WebSocket 被擋時用）
app.post('/api/rt', route((req) => httpRealtime(me(req).id, req.body)));

app.get('/api/leaderboard', route(() => ({ list: leaderboard() })));

app.use('/api', (_req, res) => res.status(404).json({ error: '沒有這個 API' }));

// ── 正式模式：直接服務打包好的 React ─────────
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST, {
    setHeaders(res, file) {
      // sw.js / index.html / manifest 不能被長期快取，否則更新後手機會卡在舊版
      if (/(sw\.js|index\.html|\.webmanifest)$/.test(file)) res.setHeader('Cache-Control', 'no-cache');
      if (file.endsWith('.webmanifest')) res.setHeader('Content-Type', 'application/manifest+json');
    },
  }));
  app.get('*', (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
}

// ── 啟動 ─────────────────────────────────────
// 不指定位址 = 同時聽 IPv4 與 IPv6（localhost 在 Windows 常解析成 ::1）
const server = app.listen(PORT, () => {
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => n.address);
  console.log('\n⚔️  Project Resonance 私服已啟動');
  console.log(`   本機:     http://localhost:${PORT}`);
  lan.forEach((ip) => console.log(`   區域網路: http://${ip}:${PORT}`));
  console.log(`   🔑 管理員密鑰: ${ADMIN_KEY}（遊戲裡「角色 → 管理員」輸入，就能發放物資；存在 server/data/admin.json）`);
  if (!fs.existsSync(CLIENT_DIST)) {
    console.log('   (開發模式：前端請開 Vite 顯示的網址，預設 :5173)');
  } else {
    console.log('   📲 要安裝到手機（全螢幕）需要 https，另開視窗執行其中一個：');
    console.log(`      cloudflared tunnel --url http://127.0.0.1:${PORT}`);
    console.log(`      ngrok http ${PORT}`);
  }
  console.log('');
});

attachRealtime(server); // WebSocket：同地圖的玩家互相看見
startBots();            // AI 玩家（環境變數 BOTS=0 可以關掉）

// 關閉伺服器時強制存檔
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { saveNow(); console.log('\n[存檔] 已儲存，伺服器關閉'); process.exit(0); });
}
