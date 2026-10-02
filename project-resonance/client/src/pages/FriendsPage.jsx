import { useCallback, useEffect, useState } from 'react';
import { api } from '../utils/api.js';
import { fmt } from '../utils/format.js';

/** 好友：加好友、邀請、線上狀態、前往、決鬥 */
export default function FriendsPage({ player, onTravel, onDuel }) {
  const [data, setData] = useState({ friends: [], requests: [] });
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(() => api.friends().then(setData).catch(() => {}), []);
  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  const add = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      const r = await api.friendRequest(name.trim());
      setData(r);
      setMsg(r.autoAccepted ? '你們成為好友了！' : '已送出好友邀請，等對方接受');
      setName('');
    } catch (err) { setMsg(err.message); }
  };
  const answer = async (id, accept) => setData(await api.friendAnswer(id, accept));
  const remove = async (id) => setData(await api.friendRemove(id));

  return (
    <div className="space-y-3 p-3">
      <form onSubmit={add} className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={12} placeholder="輸入玩家名字加好友"
          className="min-w-0 flex-1 rounded-xl border border-edge bg-panel px-3 py-2 text-sm outline-none focus:border-gold/60" />
        <button disabled={!name.trim()} className="rounded-xl bg-gold px-4 text-sm font-bold text-ink disabled:opacity-40">加好友</button>
      </form>
      {msg && <p className="text-center text-xs text-sky-200">{msg}</p>}

      {data.requests.length > 0 && (
        <section className="rounded-xl border border-gold/40 bg-gold/5 p-2">
          <div className="mb-1 text-[11px] tracking-widest text-gold">好友邀請 · {data.requests.length}</div>
          {data.requests.map((r) => (
            <div key={r.id} className="flex items-center gap-2 py-1 text-sm">
              <span className="flex-1 font-bold">{r.name} <span className="num text-xs font-normal text-white/40">Lv.{r.level}</span></span>
              <button onClick={() => answer(r.id, false)} className="rounded-lg bg-white/10 px-3 py-1 text-xs">拒絕</button>
              <button onClick={() => answer(r.id, true)} className="rounded-lg bg-gold px-3 py-1 text-xs font-bold text-ink">接受</button>
            </div>
          ))}
        </section>
      )}

      <section>
        <div className="mb-1 text-[11px] tracking-widest text-white/45">好友 · {data.friends.length}</div>
        {data.friends.length === 0 && <p className="py-4 text-center text-xs text-white/35">還沒有好友，上面輸入朋友的名字吧</p>}
        <div className="space-y-1.5">
          {data.friends.map((f) => (
            <div key={f.id} className="flex items-center gap-2.5 rounded-xl border border-edge bg-panel p-2">
              <span className={`size-2.5 shrink-0 rounded-full ${f.online ? 'bg-emerald-400' : 'bg-white/20'}`} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold">{f.name}{f.bot && <span className="ml-1 rounded bg-sky-500/20 px-1 text-[9px] font-normal text-sky-200">AI</span>}
                  <span className="num ml-1.5 text-[10px] font-normal text-white/40">Lv.{f.level} · 戰力 {fmt(f.cp)} · {f.pvp.w}勝{f.pvp.l}敗</span>
                </div>
                <div className="text-[11px] text-white/50">{f.online ? '🟢 在線' : '離線'} · 📍{f.where}</div>
              </div>
              <button onClick={() => window.dispatchEvent(new CustomEvent('manor:visit', { detail: f.id }))} className="rounded-lg bg-emerald-500/25 px-2.5 py-1.5 text-xs text-emerald-100">莊園</button>
              <button onClick={() => onTravel(f.id)} className="rounded-lg bg-sky-500/25 px-2.5 py-1.5 text-xs text-sky-100">前往</button>
              <button disabled={!f.online || f.inTown || player.inTown} onClick={() => onDuel(f)}
                className="rounded-lg bg-red-500/25 px-2.5 py-1.5 text-xs text-red-100 disabled:opacity-30">⚔ 決鬥</button>
              <button onClick={() => remove(f.id)} className="px-1 text-xs text-white/30">✕</button>
            </div>
          ))}
        </div>
        <p className="mt-2 text-center text-[10px] text-white/30">決鬥要在同一張狩獵地圖（村莊是和平區），「前往」可以直接傳送到好友身邊</p>
      </section>
    </div>
  );
}
