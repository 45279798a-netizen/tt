import { useEffect, useMemo, useRef, useState } from 'react';
import { BattleScene } from '../game3d/BattleScene.js';
import Joystick from '../components/Joystick.jsx';
import { manorStore } from '../utils/manorStore.js';
import { api } from '../utils/api.js';
import SkillPad from '../components/SkillPad.jsx';
import { fmt, fmtRate } from '../utils/format.js';
import LootFeed from '../components/LootFeed.jsx';
import { setColor } from '../components/Icons.jsx';
import { Net } from '../utils/net.js';
import { setKillSource } from '../utils/killFeed.js';
import { NPCS } from '../game3d/themes.js';
import { ChallengeMenu, InviteModal, DuelHud, DuelResult } from '../components/DuelUI.jsx';

/**
 * 橫向全螢幕 3D 戰鬥
 * 左上：角色資訊（topLeft）　中上：地圖　右上：選單（topRight）
 * 左下：搖桿　　　　　　　　　　　　　　　右下：技能盤
 */
export default function BattlePage({ player, config, events, active, killsPerMin = 0, pushEvent, onTrialStart, onTrialEnd, onRaidStart, onChangeMap, onGoTown, onGoBoss, onNpc, topLeft, topRight }) {
  const wrapRef = useRef(null);
  const overlayRef = useRef(null);
  const sceneRef = useRef(null);
  const lastEvent = useRef(0);
  // 自動 / 手動：記住上次的選擇
  const [auto, setAuto] = useState(() => { try { return localStorage.getItem('resonance.auto') !== '0'; } catch { return true; } });
  const [failed, setFailed] = useState(false);
  // 騎乘：記住上次的選擇
  const [riding, setRiding] = useState(() => { try { return localStorage.getItem('resonance.ride') === '1'; } catch { return false; } });
  const [mates, setMates] = useState([]); // 同地圖的朋友
  const [link, setLink] = useState({ ok: false, mode: 'ws', reason: '' });
  const netRef = useRef(null);
  // PvP 決鬥
  const [duel, setDuel] = useState(null);
  const [duelHp, setDuelHp] = useState({ hp: {}, maxHp: {} });
  const [invite, setInvite] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [result, setResult] = useState(null);
  const [info, setInfo] = useState(null);
  const [nearNpc, setNearNpc] = useState(null); // 村莊裡靠近的 NPC
  const [boss, setBoss] = useState(null);       // 這張地圖的世界王
  const [bossNews, setBossNews] = useState(null); // 世界王出現 / 打倒的公告

  useEffect(() => {
    try {
      sceneRef.current = new BattleScene(wrapRef.current, overlayRef.current);
      setKillSource(() => sceneRef.current?.takeKillReport() ?? { kills: 0, elites: 0 });
    } catch (e) {
      console.error(e);
      setFailed(true);
    }
    return () => { setKillSource(null); sceneRef.current?.dispose(); sceneRef.current = null; };
  }, []);

  const town = player.inTown;
  const field = !town && !!player.inField; // 緣起獵場：怪物強度 = 自己最遠的地圖
  const altar = !town && !!player.inBoss;  // 深淵祭壇：巨大首領
  const tierMap = config.maps[player.mapId];
  const map = useMemo(() => (field ? { ...tierMap, id: 'field', field: true, name: '緣起獵場' }
    : altar ? { ...tierMap, id: 'boss', bossMap: true, name: '深淵祭壇' } : tierMap), [field, altar, tierMap]);
  // 莊園：在村莊時可以進自己的或好友的莊園（伺服器上仍算在村莊，沒有戰鬥）
  const [manor, setManor] = useState(manorStore.get());
  useEffect(() => manorStore.subscribe(setManor), []);
  useEffect(() => { if (!town && manor.ownerId) manorStore.set({ ownerId: null, view: null }); }, [town]); // eslint-disable-line react-hooks/exhaustive-deps
  const enterManor = async (id) => {
    if (!player.inTown) { pushEvent?.({ type: 'error', text: '要先回村莊才能去莊園' }); return; }
    try {
      const r = await api.manorVisit(id);
      manorStore.set({ ownerId: id, view: r.result.view });
      if (r.result.reward) pushEvent?.({ type: 'info', text: `🏡 參觀了 ${r.result.view.owner} 的莊園，獲得 💠${r.result.reward.essence}` });
    } catch (e) { pushEvent?.({ type: 'error', text: e.message }); }
  };
  useEffect(() => {
    const f = (e) => enterManor(e.detail);
    window.addEventListener('manor:visit', f);
    return () => window.removeEventListener('manor:visit', f);
  });
  const inManor = town && !!manor.ownerId;
  const sceneMap = useMemo(() => (inManor ? { id: `manor:${manor.ownerId}`, town: true, manor: true, ownerId: manor.ownerId, name: '莊園' }
    : town ? { id: 'town', town: true, name: '緣起村' } : map), [town, map, inManor, manor.ownerId]);
  useEffect(() => { sceneRef.current?.setManor(inManor ? manor.view : null); }, [inManor, manor.view, sceneMap]);

  // 穿脫裝備 → 角色外觀跟著換（要比地圖先設定，村莊 NPC 才拿得到裝備資料）
  useEffect(() => {
    sceneRef.current?.setEquipment(player.gear, config.items);
  }, [player.gear, config.items]);

  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.setStats(player.stats);
    s.setMap(sceneMap);
  }, [player.stats, sceneMap]);

  // 坐騎：出戰坐騎外觀 + 騎乘狀態
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.setMountDefs(config.mounts);
    s.setMount(player.mount);
    s.setRiding(riding);
  }, [config.mounts, player.mount, riding]);
  useEffect(() => {
    try { localStorage.setItem('resonance.ride', riding ? '1' : '0'); } catch { /* 無痕模式 */ }
  }, [riding]);
  const mountDef = player.mount ? config.mounts[player.mount] : null;

  // 魔物潮：伺服器說進行中就交給場景；時間到自動結算
  const [trialResult, setTrialResult] = useState(null);
  const [trialConfirm, setTrialConfirm] = useState(false);
  const [raidConfirm, setRaidConfirm] = useState(false);
  const trialEnding = useRef(false);
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.setTrial(player.trial && !player.inTown ? { endsAt: player.trial.endsAt, sec: (player.trial.endsAt - player.trial.start) / 1000 } : null);
  }, [player.trial?.endsAt, player.inTown]);
  useEffect(() => {
    if (!player.trial) return undefined;
    const t = setInterval(async () => {
      if (Date.now() < player.trial.endsAt || trialEnding.current) return;
      trialEnding.current = true;
      const r = await onTrialEnd?.();
      trialEnding.current = false;
      if (r && r.kills != null) setTrialResult(r);
    }, 500);
    return () => clearInterval(t);
  }, [player.trial, onTrialEnd]);

  // 首領突襲：伺服器的狀態交給場景（2 秒同步一次血量）
  useEffect(() => { sceneRef.current?.setRaid(player.raid && !player.inTown ? player.raid : null); }, [player.raid?.id, player.raid?.hp, player.inTown, player.mapId]);

  // 寵物：出戰中的寵物跟在身邊
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.setPetDefs(config.pets);
    s.setPet(player.pet, player.pet ? player.pets[player.pet]?.lv ?? 1 : 1);
  }, [config.pets, player.pet, player.pets, sceneMap]);

  // 夥伴：在酒館 / 跟著出門
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.setPartnerDefs(config.partners);
    s.setPartner({ out: player.partnerOut, recruited: Object.keys(player.partners || {}), lv: player.partnerOut ? player.partners[player.partnerOut]?.lv ?? 1 : 1 });
  }, [config.partners, player.partnerOut, player.partners, player.inTown, player.mapId]);

  // 翅膀外觀
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.setWingDefs(config.wings);
    s.setWing(player.wing, player.wing ? player.wings[player.wing]?.lv : 0);
  }, [config.wings, player.wing, player.wings]);

  // 固定技能
  const loadout = player.skills[player.stats.wtype];
  useEffect(() => {
    sceneRef.current?.setSkills(config.skills, loadout);
  }, [config.skills, loadout]);

  // 村莊 NPC：靠近顯示對話按鈕，自動走到就直接打開
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.onNpcNear = setNearNpc;
    s.onNpcArrive = (id) => onNpc?.(id);
    return () => { s.onNpcNear = null; s.onNpcArrive = null; };
  }, [onNpc]);

  // 轉職成功：播 3D 轉職儀式
  useEffect(() => {
    const h = (e) => sceneRef.current?.rebirthFx(e.detail.color);
    window.addEventListener('resonance:rebirth', h);
    return () => window.removeEventListener('resonance:rebirth', h);
  }, []);

  // 好友頁按「決鬥」
  useEffect(() => {
    const h = (e) => setChallenge(e.detail);
    window.addEventListener('resonance:duel', h);
    return () => window.removeEventListener('resonance:duel', h);
  }, []);

  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    const sync = () => (active && !document.hidden ? s.start() : s.stop());
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [active]);

  useEffect(() => {
    for (const e of events) {
      if (e.id <= lastEvent.current) continue;
      lastEvent.current = e.id;
      if (e.type === 'level') sceneRef.current?.levelUp();
    }
  }, [events]);

  useEffect(() => {
    sceneRef.current?.setAuto(auto);
    try { localStorage.setItem('resonance.auto', auto ? '1' : '0'); } catch { /* 無痕模式 */ }
  }, [auto]);

  useEffect(() => {
    if (!info) return;
    const t = setTimeout(() => setInfo(null), 3000);
    return () => clearTimeout(t);
  }, [info]);

  // 多人連線：回報自己的位置與招式，接收同地圖朋友（WebSocket 不通會自動改相容模式）
  useEffect(() => {
    const s = () => sceneRef.current;
    const net = new Net({
      getPos: () => s()?.getNetState() ?? { x: 0, z: 0, ry: 0, mv: 0 },
      onState: (list, bossInfo) => {
        s()?.setRemotePlayers(list);
        s()?.setBoss(bossInfo);
        setBoss((prev) => (!bossInfo ? null : prev && prev.id === bossInfo.id && Math.abs(prev.hp - bossInfo.hp) < bossInfo.maxHp * 0.002 ? prev : bossInfo));
        setMates((prev) => {
          const names = list.map((p) => `${p.id}|${p.level}|${p.cp}|${p.pvp?.w}|${p.pvp?.l}`).join(',');
          return prev.key === names ? prev : Object.assign(list.map((p) => ({ id: p.id, name: p.name, level: p.level, cp: p.cp, pvp: p.pvp })), { key: names });
        });
      },
      onFx: (m) => s()?.remoteFx(m.id, m.k, m.x, m.z, m.ry),
      onEvent: (m) => {
        if (m.t === 'duel_invite') setInvite(m);
        else if (m.t === 'friend_req') setInfo(`👋 ${m.name} 想加你好友，到「好友」接受`);
        else if (m.t === 'friend_info') setInfo(m.text);
        else if (m.t === 'gift') pushEvent?.({ type: 'info', text: `🎁 ${m.from} 發給你：${m.text}${m.note ? `（${m.note}）` : ''}` });
        else if (m.t === 'announce') setInfo(`📢 ${m.from}：${m.text}`);
        else if (m.t === 'duel_info') setInfo(m.text);
        else if (m.t === 'boss_spawn') setBossNews({ kind: 'spawn', ...m, at: Date.now() });
        else if (m.t === 'boss_flee') setBossNews({ kind: 'flee', ...m, at: Date.now() });
        else if (m.t === 'boss_dead') setBossNews({ kind: 'dead', ...m, at: Date.now() });
        else if (m.t === 'raid_reward') pushEvent?.({ type: 'info', text: `🦇 首領突襲成功！傷害 ${Math.round(m.share * 100)}%：💠${m.essence}、羽晶×${m.mats.wf}、星輝羽×${m.mats.wr}、💰${fmt(m.gold)}${m.eggs ? '、🥚寵物蛋×1' : ''}${m.lowMap ? '（低階地圖，獎勵減少）' : ''}` });
        else if (m.t === 'raid_fail') pushEvent?.({ type: 'error', text: `🦇 首領突襲失敗……${m.name}還活著` });
        else if (m.t === 'boss_reward') pushEvent?.({ type: 'info', text: `👑 討伐成功！第 ${m.rank} 名（${Math.round(m.share * 100)}%）獲得 💠${m.essence}、羽晶×${m.wf}、星輝羽×${m.wr}、💰${fmt(m.gold)}${m.eggs ? '、🥚寵物蛋×1' : ''}` });
        else if (m.t === 'duel_start') {
          s()?.startDuel(m.duel);
          setDuel({ ...m.duel, receivedAt: Date.now() });
          setDuelHp({ hp: m.duel.hp, maxHp: m.duel.maxHp });
          setInvite(null);
          setResult(null);
        } else if (m.t === 'duel_hp') {
          setDuelHp({ hp: m.hp, maxHp: m.maxHp });
          s()?.showDuelHit(m.hit, player.id);
        } else if (m.t === 'duel_end') {
          s()?.endDuel();
          setDuel(null);
          setResult({ win: m.winner === player.id, reason: m.reason });
        }
      },
      onStatus: (st) => setLink((prev) => (prev.ok === st.ok && prev.mode === st.mode && prev.reason === st.reason ? prev : st)),
    });
    netRef.current = net;
    if (s()) {
      s().onFx = (k) => net.fx(k);
      s().onHit = (k) => net.send({ t: 'hit', k }); // 決鬥中出手，交給伺服器判定
    }
    return () => { if (s()) { s().onFx = null; s().onHit = null; } net.close(); netRef.current = null; };
  }, [player.id]);

  const next = !town && !field && !altar && config.maps[player.mapId + 1];
  const u = player.nextUnlock;
  const canAdvance = next && u?.ok;
  const monster = config.sets[player.mapId];
  const lockText = !u ? '' : !u.weapon || !u.piecesOk
    ? `做出${monster.name}武器＋${u.needPieces}件（${u.pieces}/${u.needPieces}）`
    : `下一區需 ${fmt(next.requiredCP)} 戰力`;

  return (
    <div className="no-touch-action fixed inset-0 overflow-hidden bg-black">
      <div ref={wrapRef} className="absolute inset-0" />
      <div ref={overlayRef} className="pointer-events-none absolute inset-0 overflow-hidden" />

      {failed && (
        <div className="absolute inset-0 grid place-items-center p-8 text-center text-sm text-white/60">
          這台裝置不支援 WebGL，無法顯示 3D 戰鬥畫面
        </div>
      )}

      {/* 上排 HUD */}
      <div className="safe-x safe-t pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="pointer-events-auto">{topLeft}</div>
          <LootFeed events={events} materials={config.materials} />
        </div>

        {duel ? (
          <DuelHud duel={duel} hpState={duelHp} myName={player.name}
            onSurrender={() => netRef.current?.send({ t: 'duel_leave' })} />
        ) : (
        <div className="flex min-w-0 flex-col items-center gap-1.5">
          <div className="whitespace-nowrap rounded-full bg-black/50 px-4 py-1 text-center backdrop-blur short:px-3 short:py-0.5">
            {town ? (
              <>
                <span className="text-sm font-bold">🏘 緣起村</span>
                <span className="ml-2 text-[11px] font-bold text-emerald-300">和平區</span>
                <span className="ml-2 text-[11px] text-white/55 short:hidden">村莊裡可以試招，打怪請出發狩獵</span>
              </>
            ) : (
              <>
                <span className="text-sm font-bold">{field ? '🌾 緣起獵場' : altar ? '👑 深淵祭壇' : map.name}</span>
                <span className="ml-2 text-[11px] font-bold" style={{ color: setColor(player.mapId) }}>{field ? `強度：${tierMap.name}` : altar ? '巨大首領討伐' : `狩獵：${monster.monster}`}</span>
                <span className="num ml-2 text-[11px] text-white/55 short:hidden">{killsPerMin} 殺/分</span>
              </>
            )}
          </div>
          {town && !inManor && (
            <div className="pointer-events-auto flex max-w-[52vw] short:max-w-[38vw] gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
              {NPCS.map((n) => (
                <button key={n.id} onClick={() => sceneRef.current?.walkTo(n.id)}
                  className="shrink-0 whitespace-nowrap rounded-full border border-gold/40 bg-black/55 px-2.5 py-1 text-[11px] font-bold text-gold backdrop-blur active:scale-95">
                  {n.icon} {n.name.split('·').pop()}
                </button>
              ))}
            </div>
          )}
          <div className="flex max-w-[46vw] flex-wrap justify-center gap-1 text-[10px]">
            <LinkBadge link={link} count={mates.length + 1} onRetry={() => netRef.current?.start()} />
            {!town && player.party?.others > 0 && (
              <span className="rounded-full bg-emerald-500/25 px-2 py-0.5 font-bold text-emerald-200 backdrop-blur">
                🤝 組隊加成 +{Math.round((player.party.mul - 1) * 100)}%
              </span>
            )}
            {mates.slice(0, 4).map((m, i) => (
              <button key={m.id} disabled={town} onClick={() => setChallenge(m)}
                className={`${i >= 2 ? 'short:hidden ' : ''}pointer-events-auto rounded-full bg-black/45 px-2 py-0.5 text-sky-200 backdrop-blur active:scale-95`}>
                {m.name}{town ? '' : ' ⚔'}
              </button>
            ))}
          </div>
          <div className="pointer-events-auto flex gap-1.5">
            {!town && (
              <button onClick={() => onGoTown?.()}
                className="rounded-full bg-emerald-900/70 px-2.5 py-1 text-[11px] font-bold text-emerald-200 backdrop-blur active:scale-95">🏘 回村莊</button>
            )}
            {!town && !field && !altar && player.mapId > 0 && (
              <button onClick={() => onChangeMap(player.mapId - 1)}
                className="rounded-full bg-black/45 px-2.5 py-1 text-[11px] text-white/60 backdrop-blur">◀ 上一區</button>
            )}
            {next && (
              <button
                disabled={!canAdvance}
                onClick={() => onChangeMap(next.id)}
                className={`rounded-full px-3 py-1 text-[11px] font-bold backdrop-blur transition active:scale-95
                  ${canAdvance ? 'animate-pulse bg-gold text-ink' : 'bg-black/45 text-white/50'}`}
              >
                {canAdvance ? `前往 ${next.name} ▶` : `🔒 ${lockText}`}
              </button>
            )}
          </div>
        </div>
        )}

        <div className="pointer-events-auto">{topRight}</div>
      </div>

      {boss && !duel && <BossBar boss={boss} share={player.worldBoss?.myShare ?? 0} eff={Math.max(boss.minMul ?? 0, player.stats.atk / (player.stats.atk + boss.def * boss.defK))} />}
      {altar && !boss && !duel && <BossBar sleeping next={player.worldBoss?.next} />}
      {player.trial && !player.inTown && <TrialHud trial={player.trial} />}
      {town && !inManor && (
        <button onClick={() => enterManor(player.id)}
          className="pointer-events-auto fixed left-3 top-[96px] z-20 rounded-xl border border-emerald-300/50 bg-emerald-950/80 px-3 py-1.5 text-xs font-bold text-emerald-100 backdrop-blur active:scale-95">
          🏡 我的莊園
        </button>
      )}
      {inManor && (
        <div className="pointer-events-auto fixed left-3 top-[96px] z-20 flex flex-col gap-1.5">
          <span className="rounded-xl bg-black/60 px-3 py-1 text-xs font-bold text-emerald-200">🏡 {manor.view?.owner} 的莊園</span>
          <button onClick={() => onNpc('manor')} className="rounded-xl border border-emerald-300/50 bg-emerald-950/80 px-3 py-1.5 text-xs font-bold text-emerald-100 active:scale-95">{manor.ownerId === player.id ? '🛠 莊園管理' : '👀 看莊園'}</button>
          <button onClick={() => manorStore.set({ ownerId: null, view: null })} className="rounded-xl border border-white/25 bg-black/60 px-3 py-1.5 text-xs font-bold text-white/80 active:scale-95">🏘 回村莊</button>
        </div>
      )}
      {player.raid && !player.inTown && !duel && <BossBar boss={player.raid} share={0} raid />}
      {!town && !field && !altar && !duel && !player.raid && (
        <button onClick={() => setRaidConfirm(true)}
          className="pointer-events-auto fixed left-3 top-[134px] z-20 rounded-xl border border-rose-300/50 bg-rose-950/80 px-3 py-1.5 text-xs font-bold text-rose-100 backdrop-blur active:scale-95">
          🦇 首領突襲{cdLabel(player.raidCd)}
        </button>
      )}
      {raidConfirm && (
        <Modal onClose={() => setRaidConfirm(false)}>
          <div className="text-lg font-bold text-rose-200">🦇 首領突襲：深淵吸血鬼公爵</div>
          <p className="mt-2 text-sm text-white/70">4 分鐘內打倒首領。同地圖在線的朋友會一起進入，共用血量。</p>
          <p className="mt-1 text-xs text-white/55">三個階段：砸地 → 星環彈幕（要閃環）→ 隕星雨（看紅圈）。被打中會擊退暈眩。打倒依傷害比例給大量精華、羽晶、星輝羽、金幣。</p>
          <p className="mt-1 text-xs text-amber-200/80">冷卻 15 分鐘。在比自己最遠進度低的地圖開：每低一區獎勵 ×0.3、沒有寵物蛋。</p>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setRaidConfirm(false)} className="rounded-lg border border-white/20 px-4 py-2 text-sm">取消</button>
            <button onClick={async () => { setRaidConfirm(false); await onRaidStart?.(); }} className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-bold">開戰</button>
          </div>
        </Modal>
      )}
      {!town && !altar && !duel && !player.trial && (
        <button onClick={() => setTrialConfirm(true)}
          className="pointer-events-auto fixed left-3 top-[96px] z-20 rounded-xl border border-violet-300/50 bg-violet-950/80 px-3 py-1.5 text-xs font-bold text-violet-100 backdrop-blur active:scale-95">
          🌀 魔物潮{cdLabel(player.trialCd)}
        </button>
      )}
      {trialConfirm && (
        <Modal onClose={() => setTrialConfirm(false)}>
          <div className="text-lg font-bold text-violet-200">🌀 魔物潮挑戰</div>
          <p className="mt-2 text-xs text-emerald-200">👥 同一張地圖的朋友會一起加入（每多 1 人獎勵 +10%）</p>
          <p className="mt-2 text-sm text-white/70">在這張地圖撐過 3 分鐘：怪會從四面八方一波波湧來，每 20 秒變得更多更硬（共 9 波）。</p>
          <p className="mt-1 text-xs text-white/50">結束時依擊殺數額外獎勵：💠精華、羽晶、星輝羽、金幣。最佳紀錄：{player.trialBest || 0} 隻</p>
          <p className="mt-1 text-xs text-amber-200/80">冷卻 10 分鐘。在比自己最遠進度低的地圖開：每低一區獎勵 ×0.3、沒有寵物蛋。</p>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setTrialConfirm(false)} className="rounded-lg border border-white/20 px-4 py-2 text-sm">取消</button>
            <button onClick={async () => { setTrialConfirm(false); await onTrialStart?.(); }} className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-bold">開始</button>
          </div>
        </Modal>
      )}
      {trialResult && (
        <Modal onClose={() => setTrialResult(null)}>
          <div className="text-center">
            <div className="text-lg font-bold text-violet-200">🌀 魔物潮結束！</div>
            <div className="num mt-2 text-4xl font-black text-gold">{trialResult.kills} <span className="text-base text-white/60">隻</span></div>
            {trialResult.best && <div className="mt-1 text-sm font-bold text-emerald-300">🏆 新紀錄！</div>}
            {trialResult.lowMap && <div className="mt-1 text-xs text-amber-200">低階地圖：獎勵減少</div>}
            {trialResult.party > 1 && <div className="mt-1 text-xs text-emerald-200">👥 {trialResult.party} 人組隊 · 獎勵 +{Math.min(3, trialResult.party - 1) * 10}%</div>}
            <div className="num mt-3 flex flex-wrap justify-center gap-2 text-sm">
              <span className="rounded bg-white/10 px-2 py-1">💠 {trialResult.essence}</span>
              <span className="rounded bg-white/10 px-2 py-1">羽晶 {trialResult.mats.wf}</span>
              <span className="rounded bg-white/10 px-2 py-1">星輝羽 {trialResult.mats.wr}</span>
              <span className="rounded bg-white/10 px-2 py-1">💰 {fmt(trialResult.gold)}</span>
            </div>
            <button onClick={() => setTrialResult(null)} className="mt-4 rounded-lg bg-violet-500 px-6 py-2 text-sm font-bold">好</button>
          </div>
        </Modal>
      )}
      {bossNews && Date.now() - bossNews.at < 12000 && (
        <BossNews news={bossNews} player={player} onGo={() => { onGoBoss?.(); setBossNews(null); }} onClose={() => setBossNews(null)} />
      )}
      {info && (
        <div className="pointer-events-none fixed inset-x-0 top-28 z-40 grid place-items-center">
          <div className="toast-pop rounded-full bg-black/75 px-4 py-2 text-sm text-sky-100">{info}</div>
        </div>
      )}
      {challenge && (
        <ChallengeMenu target={challenge} onClose={() => setChallenge(null)}
          onPick={(mode) => { netRef.current?.send({ t: 'duel_req', target: challenge.id, mode }); setChallenge(null); }} />
      )}
      {invite && !duel && (
        <InviteModal invite={invite} onAnswer={(accept) => {
          netRef.current?.send({ t: 'duel_answer', from: invite.from, accept });
          setInvite(null);
        }} />
      )}
      {result && <DuelResult result={result} onClose={() => setResult(null)} />}

      {town && nearNpc && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-20 grid place-items-center">
          <button onClick={() => onNpc?.(nearNpc)}
            className="toast-pop pointer-events-auto rounded-2xl border-2 border-gold bg-ink/90 px-6 py-3 text-base font-bold text-gold shadow-xl active:scale-95">
            💬 和 {NPCS.find((n) => n.id === nearNpc)?.name} 對話
          </button>
        </div>
      )}

      {/* 下排操作：左搖桿、右技能 */}
      <div className="safe-x safe-b pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between">
        <div className="pointer-events-auto ml-4 mb-2">
          <Joystick onMove={(x, y, on) => sceneRef.current?.setJoystick(x, y, on)} />
        </div>
        <div className="mr-2">
          <SkillPad scene={sceneRef} auto={auto} wtype={player.stats.wtype} loadout={loadout} defs={config.skills}
            disabled={false} onToggleAuto={() => setAuto((a) => !a)}
            mount={mountDef} riding={riding && !duel} rideLocked={!!duel} onToggleRide={() => setRiding((r) => !r)} />
        </div>
      </div>
    </div>
  );
}

/** 冷卻剩餘時間（按鈕後面顯示「 · 4:59」，伺服器才是真正的判定） */
function cdLabel(until) {
  const s = Math.ceil(((until || 0) - Date.now()) / 1000);
  return s > 0 ? ` · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '';
}

function LinkBadge({ link, count, onRetry }) {
  if (link.ok) {
    return (
      <span className="rounded-full bg-sky-500/25 px-2 py-0.5 text-sky-200 backdrop-blur">
        👥 同地圖 {count} 人{link.mode === 'http' ? ' · 相容模式' : ''}
      </span>
    );
  }
  const text = {
    replaced: '⚠ 這個角色在別的地方登入了',
    unknown: '⚠ 伺服器找不到角色，請重新登入',
  }[link.reason] ?? '⚠ 連線中…';
  return (
    <span className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-black/55 px-2 py-0.5 text-amber-200 backdrop-blur">
      {text}
      {link.reason === 'replaced' && (
        <button onClick={onRetry} className="rounded-full bg-amber-300/20 px-1.5 text-amber-100">在這裡玩</button>
      )}
    </span>
  );
}

/** 世界王血條（畫面上方中間） */
function BossBar({ boss, share, raid = false, eff = null, sleeping = false, next = 0 }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  if (sleeping) {
    const left = Math.max(0, Math.ceil((next - now) / 1000));
    return (
      <div className="pointer-events-none fixed inset-x-0 top-[104px] z-20 grid place-items-center short:top-[84px]">
        <div className="rounded-full bg-black/60 px-4 py-1 text-xs font-bold text-violet-200">💤 首領沉睡中，<span className="num text-gold">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span> 後甦醒</div>
      </div>
    );
  }
  const pct = Math.max(0, (boss.hp / boss.maxHp) * 100);
  const left = Math.max(0, Math.ceil((boss.endAt - now) / 1000));
  return (
    <div className={`pointer-events-none fixed inset-x-0 ${raid ? 'top-[150px]' : 'top-[104px] short:top-[84px]'} z-20 grid place-items-center`}>
      <div className="w-[min(520px,60vw)]">
        <div className="flex items-end justify-between px-1 text-xs font-bold">
          <span className={`${raid ? 'text-violet-200' : 'text-red-200'} drop-shadow`}>{boss.icon} {boss.name} <span className="font-normal text-white/60">{raid ? `首領突襲 · ${boss.party} 人 · 第 ${pct > 70 ? 1 : pct > 35 ? 2 : 3} 階段` : `巨大首領 · ${boss.fighters} 人參與`}</span></span>
          <span className="num text-white/70">{raid ? `⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : `我 ${Math.round(share * 100)}% · 破防 ${Math.round((eff ?? 1) * 100)}%`}</span>
        </div>
        <div className="boss-bar"><i style={{ width: `${pct}%` }} /><span className="num">{fmt(boss.hp)} / {fmt(boss.maxHp)}</span></div>
      </div>
    </div>
  );
}
function BossNews({ news, player, onGo, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 12000); return () => clearTimeout(t); }, [news.at, onClose]);
  const canGo = news.kind === 'spawn' && !player.inBoss;
  const text = news.kind === 'spawn' ? `${news.icon} 巨大首領「${news.name}」在深淵祭壇甦醒了！`
    : `👑 巨大首領「${news.name}」被討伐了！${news.top ? `傷害第一：${news.top}` : ''}`;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[150px] z-40 grid place-items-center short:top-[110px]">
      <div className="toast-pop pointer-events-auto flex items-center gap-3 rounded-2xl border border-red-400/60 bg-ink/90 px-4 py-2 text-sm font-bold text-red-100 shadow-xl">
        <span>{text}</span>
        {canGo && <button onClick={onGo} className="rounded-lg bg-red-500 px-3 py-1 text-xs text-white active:scale-95">前往討伐</button>}
        <button onClick={onClose} className="text-white/40">✕</button>
      </div>
    </div>
  );
}

/** 魔物潮：倒數 + 第幾波 + 擊殺數 */
function TrialHud({ trial }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  const left = Math.max(0, Math.ceil((trial.endsAt - now) / 1000));
  const wave = Math.min(9, Math.floor((now - trial.start) / 20000) + 1);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[104px] z-20 grid place-items-center">
      <div className="flex items-center gap-4 rounded-2xl border border-violet-300/50 bg-violet-950/80 px-5 py-2 backdrop-blur" style={{ boxShadow: '0 0 20px rgba(185,140,255,.45)' }}>
        <span className="text-sm font-black text-violet-200">🌀 第 {wave} / 9 波</span>
        <span className="num text-2xl font-black text-white">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>
        <span className="num text-sm font-bold text-gold">擊殺 {Math.floor(trial.kills)}</span>
        {trial.party > 1 && <span className="text-xs font-bold text-emerald-300">👥 {trial.party} 人組隊</span>}
      </div>
    </div>
  );
}

function Modal({ children, onClose }) {
  return (
    <div className="pointer-events-auto fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-edge bg-panel p-5" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}
