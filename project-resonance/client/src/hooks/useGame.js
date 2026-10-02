import { useCallback, useEffect, useRef, useState } from 'react';
import { api, auth } from '../utils/api.js';
import { takeKills } from '../utils/killFeed.js';
import { vibrate } from '../utils/format.js';
import { loadMonsterModels } from '../game3d/monsterModels.js';

const MODEL_WAIT_MS = 12000; // 模型最多等 12 秒，之後背景繼續載（怪物先用程式外觀）

const SYNC_MS = 2000;

/**
 * 遊戲核心 hook：
 * - 登入 / 自動重新登入
 * - 每 2 秒向 Node.js 後端結算一次掛機收益
 * - 每次結算產生「戰報」事件給 UI 做飄字
 */
export function useGame() {
  const [player, setPlayer] = useState(null);
  const actSeq = useRef(0); // 每次動作 +1，用來丟掉過期的同步結果
  const [config, setConfig] = useState(null);
  const [events, setEvents] = useState([]);   // 飄字 / 戰報
  const [error, setError] = useState('');
  const [online, setOnline] = useState(true);
  const [booting, setBooting] = useState(true);
  const [boot, setBoot] = useState({ pct: 0.1, text: '連線伺服器中…' }); // 載入畫面的進度條
  const evId = useRef(0);
  const recent = useRef([]); // 最近幾次結算的擊殺數，算「實際」擊殺速度
  const [killsPerMin, setKillsPerMin] = useState(0);

  const pushEvent = useCallback((ev) => {
    const id = ++evId.current;
    setEvents((list) => [...list.slice(-12), { id, at: Date.now(), ...ev }]);
  }, []);

  const applyGained = useCallback((g) => {
    if (!g) return;
    if (g.kills > 0) pushEvent({ type: 'kill', kills: g.kills, gold: g.gold });
    if (g.mats && Object.keys(g.mats).length) pushEvent({ type: 'loot', mats: g.mats });
    if (g.levelsGained > 0) {
      pushEvent({ type: 'level', levels: g.levelsGained });
      vibrate([40, 30, 80]);
    }
  }, [pushEvent]);

  const enter = useCallback(({ token, player: p }) => {
    if (token) auth.set(token);
    setPlayer(p);
  }, []);

  /** 帳號密碼登入；回傳 claimed = 舊角色第一次設定密碼 */
  const login = useCallback(async (name, password) => {
    const r = await api.login(name, password);
    enter(r);
    return r;
  }, [enter]);

  const register = useCallback(async (name, password) => {
    enter(await api.register(name, password));
  }, [enter]);

  const logout = useCallback(async () => {
    try { await api.logout(); } catch { /* 離線也照樣登出 */ }
    auth.clear();
    setPlayer(null);
  }, []);

  // 啟動：抓設定 + 用記住的登入憑證自動登入
  // 三件事同時進行：抓設定、自動登入、下載角色 / 怪物模型（第二次打開模型會從手機快取讀，幾乎不用等）
  useEffect(() => {
    let modelPct = 0, step = 0;
    const show = (text) => setBoot({ pct: 0.08 + step * 0.12 + modelPct * 0.68, text });
    const models = Promise.race([
      loadMonsterModels((k) => { modelPct = k; show(`載入角色與怪物模型 ${Math.round(k * 100)}%`); }),
      new Promise((r) => setTimeout(r, MODEL_WAIT_MS)),
    ]);
    (async () => {
      try {
        const cfg = await api.config();
        step = 1; show('讀取存檔中…');
        let me = null;
        if (auth.get()) {
          try { me = await api.session(); } catch (e) { if (e.status === 401) auth.clear(); }
        }
        step = 2; show('載入角色與怪物模型…');
        await models;
        setBoot({ pct: 1, text: '準備完成！' });
        setConfig(cfg);
        if (me) enter(me);
      } catch (e) {
        setError(e.message);
        setOnline(false);
      } finally {
        setBooting(false);
      }
    })();
  }, [enter]);

  // 掛機同步迴圈
  useEffect(() => {
    if (!player?.id) return;
    let stop = false;
    const tick = async () => {
      if (stop || document.hidden) return;
      try {
        const seq = actSeq.current;
        const { player: p, gained } = await api.sync(takeKills()); // 回報這 2 秒真的打倒的怪
        if (stop) return;
        // 同步途中如果做了其他動作（換技能、裝備…），這份資料是舊的 → 不要蓋掉新的
        if (seq === actSeq.current) setPlayer(p);
        setOnline(true);
        applyGained(gained);
        const now = Date.now();
        recent.current = [...recent.current.filter((r) => now - r.at < 30_000), { at: now, kills: gained?.kills || 0 }];
        const span = Math.max(10, (now - recent.current[0].at) / 1000 + SYNC_MS / 1000);
        setKillsPerMin(Math.round((recent.current.reduce((n, r) => n + r.kills, 0) / span) * 60));
      } catch (e) {
        setOnline(false);
        if (e.status === 401) { auth.clear(); setPlayer(null); }
      }
    };
    const t = setInterval(tick, SYNC_MS);
    return () => { stop = true; clearInterval(t); };
  }, [player?.id, applyGained, logout]);

  // 動作：成功回傳伺服器的 result（例如鍛造出的裝備），失敗回傳 null 並跳錯誤
  const act = useCallback(async (fn) => {
    try {
      actSeq.current += 1;
      const { player: p, gained, result } = await fn();
      actSeq.current += 1;
      setPlayer(p);
      applyGained(gained);
      return result ?? true;
    } catch (e) {
      pushEvent({ type: 'error', text: e.message });
      return null;
    }
  }, [pushEvent, applyGained]);

  const doCraft = useCallback(async (base) => {
    const inst = await act(() => api.craft(base));
    if (inst) { vibrate([30, 40, 60]); pushEvent({ type: 'craft', inst }); }
    return inst;
  }, [act, pushEvent]);

  const doCraftMany = useCallback(async (base, times) => {
    const r = await act(() => api.craftMany(base, times));
    if (r) vibrate([30, 40, 60]);
    return r;
  }, [act]);
  const doCraftMissing = useCallback(async (set) => {
    const r = await act(() => api.craftMissing(set));
    if (r) vibrate([30, 40, 60]);
    return r;
  }, [act]);
  const doEnhanceMany = useCallback((uid, times) => act(() => api.enhanceMany(uid, times)).then((r) => { if (r) vibrate(20); return r; }), [act]);
  const doSynth = useCallback((id, times) => act(() => api.synth(id, times)), [act]);
  const doEquip = useCallback((uid) => act(() => api.equip(uid)), [act]);
  const doEnhance = useCallback((uid) => act(() => api.enhance(uid)).then((r) => { if (r) vibrate(15); return r; }), [act]);
  const doReroll = useCallback((uid) => act(() => api.reroll(uid)), [act]);
  const doDismantle = useCallback(async (uids) => {
    const r = await act(() => api.dismantle(uids));
    if (r) pushEvent({ type: 'dismantle', ...r });
    return r;
  }, [act, pushEvent]);
  const doLock = useCallback((uid, lock) => act(() => api.lock(uid, lock)), [act]);
  const doChangeMap = useCallback((mapId) => act(() => api.changeMap(mapId)), [act]);
  const doGoTown = useCallback(() => act(() => api.goTown()), [act]);
  const doGoField = useCallback(() => act(() => api.goField()), [act]);
  const doGoBoss = useCallback(() => act(() => api.goBoss()), [act]);
  const doMarketList = useCallback(async (b) => { const r = await act(() => api.marketList(b)); if (r) pushEvent({ type: 'info', text: '🏷️ 上架成功' }); return r; }, [act, pushEvent]);
  const doMarketCancel = useCallback(async (id) => { const r = await act(() => api.marketCancel(id)); if (r) pushEvent({ type: 'info', text: '已下架，東西退回背包' }); return r; }, [act, pushEvent]);
  const doMarketBuy = useCallback(async (id) => { const r = await act(() => api.marketBuy(id)); if (r) pushEvent({ type: 'info', text: `🛒 買到 ${r.name}${r.qty > 1 ? ` ×${r.qty}` : ''}` }); return r; }, [act, pushEvent]);
  const doTowerStart = useCallback(() => act(() => api.towerStart()), [act]);
  const doTowerClear = useCallback(() => act(() => api.towerClear()), [act]);
  const doTowerFail = useCallback(() => act(() => api.towerFail()), [act]);
  const doTalent = useCallback((id) => act(() => api.talent(id)).then((r) => { if (r) vibrate(15); return r; }), [act]);
  const doTalentReset = useCallback(() => act(() => api.talentReset()), [act]);
  const doLoadout = useCallback(async (cls, ids) => {
    const r = await act(() => api.loadout(cls, ids));
    if (r) pushEvent({ type: 'info', text: '✅ 技能配置已儲存' });
    return r;
  }, [act, pushEvent]);
  const gotText = (r) => [r.essence && `💠${r.essence}`, r.eggs && `🥚×${r.eggs}`, r.points && `成就點 +${r.points}`].filter(Boolean).join('、');
  const doClaim = useCallback(async (fn, label) => {
    const r = await act(fn);
    if (r) { vibrate([20, 30, 40]); pushEvent({ type: 'info', text: `🎁 ${label}：${gotText(r)}` }); }
    return r;
  }, [act, pushEvent]);
  const doDailyClaim = useCallback((i) => doClaim(() => api.dailyClaim(i), '任務完成'), [doClaim]);
  const doDailyChest = useCallback(() => doClaim(() => api.dailyChest(), '每日寶箱'), [doClaim]);
  const doAchieveClaim = useCallback((id, tier) => doClaim(() => api.achieveClaim(id, tier), '成就達成'), [doClaim]);
  const doTravel = useCallback((id) => act(() => api.travelToFriend(id)), [act]);
  const doBuyMount = useCallback(async (id) => {
    const r = await act(() => api.buyMount(id));
    if (r) { vibrate([30, 40, 80]); pushEvent({ type: 'info', text: `🐎 獲得新坐騎！已設為出戰` }); }
    return r;
  }, [act, pushEvent]);
  const doUpgradeMount = useCallback((id) => act(() => api.upgradeMount(id)).then((r) => { if (r) vibrate(15); return r; }), [act]);
  const doEquipMount = useCallback((id) => act(() => api.equipMount(id)), [act]);
  const doCraftWing = useCallback(async (id) => {
    const r = await act(() => api.craftWing(id));
    if (r) { vibrate([30, 40, 80]); pushEvent({ type: 'info', text: '🪽 製作完成！已經戴上' }); }
    return r;
  }, [act, pushEvent]);
  const doUpgradeWing = useCallback((id) => act(() => api.upgradeWing(id)).then((r) => { if (r) vibrate(15); return r; }), [act]);
  const doEquipWing = useCallback((id) => act(() => api.equipWing(id)), [act]);
  const doRecruitPartner = useCallback(async (id) => {
    const r = await act(() => api.recruitPartner(id));
    if (r) { vibrate([30, 40, 80]); pushEvent({ type: 'info', text: '🐱 米米成為你的夥伴了！' }); }
    return r;
  }, [act, pushEvent]);
  const doDeployPartner = useCallback((id) => act(() => api.deployPartner(id)), [act]);
  const doUpgradePartner = useCallback((id) => act(() => api.upgradePartner(id)).then((r) => { if (r) vibrate(20); return r; }), [act]);
  const doTrialStart = useCallback(() => act(() => api.trialStart()), [act]);
  const doRaidStart = useCallback(() => act(() => api.raidStart()), [act]);
  const doPet = useCallback((kind, id) => act(() => api[kind](id)), [act]);
  const doTrialEnd = useCallback(() => act(() => api.trialEnd()), [act]);
  const doRebirth = useCallback(async () => {
    const r = await act(() => api.rebirth());
    if (r) {
      vibrate([60, 40, 60, 40, 160]);
      pushEvent({ type: 'info', text: `🌟 第 ${r.turn} 轉完成！成為「${r.title}」` });
      window.dispatchEvent(new CustomEvent('resonance:rebirth', { detail: r })); // 3D 場景播轉職儀式
    }
    return r;
  }, [act, pushEvent]);
  const doClaimAdmin = useCallback(async (key) => {
    const r = await act(() => api.adminClaim(key));
    if (r) pushEvent({ type: 'info', text: '🛡 你已成為管理員，右上角多了「管理」按鈕' });
    return r;
  }, [act, pushEvent]);

  return {
    player, config, events, error, online, booting, boot, killsPerMin,
    login, register, logout, pushEvent,
    doCraft, doCraftMany, doCraftMissing, doEnhanceMany, doSynth, doEquip, doEnhance, doReroll, doDismantle, doLock, doChangeMap, doGoTown, doTravel,
    doBuyMount, doUpgradeMount, doEquipMount, doCraftWing, doUpgradeWing, doEquipWing, doRecruitPartner, doDeployPartner, doUpgradePartner, doTrialStart, doTrialEnd, doRaidStart, doPet, doRebirth, doClaimAdmin, doGoField, doGoBoss,
    doTalent, doTalentReset, doLoadout, doTowerStart, doTowerClear, doTowerFail, doMarketList, doMarketCancel, doMarketBuy, doDailyClaim, doDailyChest, doAchieveClaim,
  };
}

/**
 * 數字變化時平滑滾動到新數值（純視覺）
 * 只在伺服器給的數字真的變了才動 → 沒打怪就不會跳（舊版會用「理論收益」預測，在村莊也會亂跳）
 */
export function useCountUp(target, ms = 600) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  const shown = useRef(target);
  useEffect(() => {
    if (target === shown.current) return;
    // 往下掉（花錢）直接跳過去，往上加才滾動
    if (target < shown.current) { shown.current = target; setValue(target); return; }
    from.current = shown.current;
    let raf;
    const start = performance.now();
    const loop = (now) => {
      const k = Math.min(1, (now - start) / ms);
      const v = from.current + (target - from.current) * (1 - (1 - k) ** 3);
      shown.current = k >= 1 ? target : v;
      setValue(shown.current);
      if (k < 1) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}
