import { useEffect, useState } from 'react';
import { api } from '../utils/api.js';
import { fmt } from '../utils/format.js';
import { manorStore } from '../utils/manorStore.js';

/** 莊園管理：收成、在 12 塊地上蓋 / 升級 / 拆除建築；參觀好友時只能看 */
export default function ManorPage({ player, config }) {
  const [st, setSt] = useState(manorStore.get());
  const [info, setInfo] = useState(null);
  const [pick, setPick] = useState(null); // 正在選建築的空地
  const [msg, setMsg] = useState('');
  const mine = st.ownerId === player.id;
  useEffect(() => manorStore.subscribe(setSt), []);
  const refresh = async () => {
    if (!mine) return;
    const r = await api.manorInfo();
    setInfo(r.result);
    manorStore.set({ view: { ...r.result } });
  };
  useEffect(() => { refresh(); const t = setInterval(refresh, 15000); return () => clearInterval(t); }, [mine]); // eslint-disable-line react-hooks/exhaustive-deps
  const doAct = async (fn, ok) => {
    try { await fn(); setMsg(ok); await refresh(); } catch (e) { setMsg(`❌ ${e.message}`); }
    setPick(null);
  };
  const view = mine ? info : st.view;
  if (!st.ownerId) return <p className="p-4 text-sm text-white/60">先進入莊園（村莊的「🏡 我的莊園」或好友列表的「莊園」）</p>;
  if (!view) return <p className="p-4 text-sm text-white/60">載入中…</p>;
  const B = config.buildings;
  const pend = info?.pending;
  return (
    <div className="space-y-3 overflow-y-auto p-3">
      <div className="flex items-center gap-3 rounded-xl border border-emerald-300/30 bg-emerald-500/5 p-3">
        <span className="text-3xl">🏡</span>
        <div className="flex-1">
          <div className="font-bold">{view.owner} 的莊園</div>
          <div className="text-[11px] text-white/60">繁榮度 {view.prosperity}（生產 +{view.prosperity}%）· 人氣 {view.likes}</div>
        </div>
        {mine && pend && (
          <button onClick={() => doAct(() => api.manorCollect(), '✅ 收成完成！')} disabled={!(pend.gold || pend.essence || Object.values(pend.mats).some((v) => v))}
            className="rounded-lg bg-gold px-3 py-2 text-xs font-bold text-ink active:scale-95 disabled:opacity-30">
            收成 {pend.hours.toFixed(1)}h<br /><span className="num font-normal">💰{fmt(pend.gold)} 💠{pend.essence}</span>
          </button>
        )}
      </div>
      {mine && info && <div className="num text-[11px] text-white/50">每小時：💰{fmt(info.rate.gold)} · 💠{info.rate.essence.toFixed(1)} · {Object.entries(info.rate.mats).map(([m, v]) => `${config.materials[m]?.name} ${v.toFixed(1)}`).join(' · ')}（最多累積 12 小時）</div>}
      {msg && <div className="rounded-lg bg-white/5 px-3 py-2 text-xs">{msg}</div>}
      <div className="grid grid-cols-3 gap-2">
        {view.plots.map((b, i) => {
          const d = b && B[b.id];
          const up = mine && b && b.lv < config.buildMaxLv ? info?.costs[b.id][b.lv] : null;
          return (
            <div key={i} className={`rounded-xl border p-2 text-center text-xs ${pick === i ? 'border-gold' : 'border-edge'} bg-panel`}>
              <div className="text-2xl">{d ? d.icon : '🟫'}</div>
              <div className="font-bold">{d ? `${d.name} Lv.${b.lv}` : `空地 ${i + 1}`}</div>
              {mine && !b && <button onClick={() => setPick(pick === i ? null : i)} className="mt-1 rounded bg-emerald-500/80 px-2 py-1 font-bold text-ink">建造</button>}
              {mine && b && (
                <div className="mt-1 flex justify-center gap-1">
                  {up && <button onClick={() => doAct(() => api.manorUpgrade(i), '✅ 升級完成')} disabled={player.gold < up.gold} className="num rounded bg-gold px-1.5 py-1 text-[10px] font-bold text-ink disabled:opacity-30">升級 💰{fmt(up.gold)}</button>}
                  <button onClick={() => doAct(() => api.manorRemove(i), '已拆除')} className="rounded bg-white/10 px-1.5 py-1 text-[10px]">拆</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {mine && pick != null && info && (
        <div className="rounded-xl border border-gold/50 bg-black/30 p-2">
          <div className="mb-1 text-xs font-bold text-gold">在空地 {pick + 1} 蓋什麼？</div>
          <div className="grid grid-cols-3 gap-1.5">
            {Object.values(B).map((d) => {
              const c = info.costs[d.id][0];
              return (
                <button key={d.id} onClick={() => doAct(() => api.manorBuild(pick, d.id), `✅ 蓋好了：${d.name}`)} disabled={player.gold < c.gold}
                  className="rounded-lg bg-panel p-1.5 text-[11px] disabled:opacity-30">
                  <div className="text-xl">{d.icon}</div>
                  <div className="font-bold">{d.name}</div>
                  <div className="text-white/50">{d.kind === 'prod' ? d.desc : `繁榮度 +${d.prosper}`}</div>
                  <div className="num text-gold">💰{fmt(c.gold)}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {!mine && <p className="text-[11px] text-white/45">你正在參觀好友的莊園（每天參觀一次可以拿到精華，好友的人氣也會 +1）</p>}
    </div>
  );
}
