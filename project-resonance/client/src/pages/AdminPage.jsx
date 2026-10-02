import { useEffect, useMemo, useState } from 'react';
import { api } from '../utils/api.js';
import { fmt } from '../utils/format.js';

/** 管理員面板：選人 → 選物資 → 發放；全服公告 */
export default function AdminPage({ config, pushEvent }) {
  const [list, setList] = useState([]);
  const [target, setTarget] = useState('online'); // all | online | pick
  const [picked, setPicked] = useState([]);
  const [q, setQ] = useState('');
  const [b, setB] = useState({ gold: '', essence: '', eggs: '', mat: '', matN: '', base: '', grade: 0, lv: 0, count: 1, mount: '', wing: '', pet: '' });
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setB((o) => ({ ...o, [k]: e.target.value }));

  const load = () => api.adminPlayers().then((r) => setList(r.list)).catch((e) => pushEvent?.({ type: 'error', text: e.message }));
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, []);

  const shown = list.filter((p) => !q || p.name.includes(q.trim()));
  const items = useMemo(() => Object.values(config.items).filter((it) => it.set >= 0)
    .sort((x, y) => x.set - y.set || x.slot.localeCompare(y.slot)), [config.items]);
  const toggle = (id) => setPicked((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));

  const give = async () => {
    const bundle = {
      gold: b.gold, essence: b.essence, eggs: b.eggs,
      mats: b.mat && b.matN ? { [b.mat]: b.matN } : {},
      item: b.base ? { base: b.base, grade: Number(b.grade), lv: Number(b.lv), count: Number(b.count) } : null,
      mount: b.mount || null, wing: b.wing || null, pet: b.pet || null,
    };
    const who = target === 'pick' ? picked : target;
    if (target === 'pick' && !picked.length) return pushEvent?.({ type: 'error', text: '請先勾選玩家' });
    const label = target === 'all' ? '全部玩家' : target === 'online' ? '在線玩家' : `${picked.length} 位玩家`;
    if (!window.confirm(`確定發放給 ${label}？`)) return;
    setBusy(true);
    try {
      const r = await api.adminGive({ target: who, bundle, note });
      pushEvent?.({ type: 'info', text: `🎁 已發放給 ${r.count} 人：${r.text}${r.short ? `（${r.short} 人背包滿，裝備沒拿到）` : ''}` });
      load();
    } catch (e) { pushEvent?.({ type: 'error', text: e.message }); } finally { setBusy(false); }
  };
  const announce = async () => {
    if (!msg.trim()) return;
    try { await api.adminAnnounce(msg); setMsg(''); pushEvent?.({ type: 'info', text: '📢 公告已送出' }); } catch (e) { pushEvent?.({ type: 'error', text: e.message }); }
  };

  const inp = 'w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-xs outline-none focus:border-gold/60';
  const lbl = 'mb-0.5 block text-[10px] text-white/45';
  return (
    <div className="flex h-full min-h-0 text-sm">
      {/* 左：玩家列表 */}
      <div className="flex w-[42%] shrink-0 flex-col border-r border-white/10">
        <div className="space-y-1.5 p-2">
          <div className="grid grid-cols-3 rounded-lg bg-white/5 p-0.5 text-xs font-bold">
            {[['online', '在線'], ['all', '全部'], ['pick', '勾選']].map(([id, t]) => (
              <button key={id} onClick={() => setTarget(id)} className={`rounded-md py-1 ${target === id ? 'bg-gold text-ink' : 'text-white/60'}`}>{t}</button>
            ))}
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋名字" className={inp} />
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-2">
          {shown.map((p) => (
            <label key={p.id} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${picked.includes(p.id) && target === 'pick' ? 'bg-gold/20' : 'bg-white/5'}`}>
              {target === 'pick' && <input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} />}
              <span className={`size-1.5 shrink-0 rounded-full ${p.online ? 'bg-emerald-400' : 'bg-white/20'}`} />
              <span className="truncate font-medium">{p.name}{p.admin && ' 🛡'}{p.bot && ' 🤖'}</span>
              <span className="num ml-auto shrink-0 text-white/50">{p.rebirth ? `${p.rebirth}轉 ` : ''}Lv.{p.level}</span>
            </label>
          ))}
          {!shown.length && <p className="p-4 text-center text-xs text-white/40">沒有玩家</p>}
        </div>
      </div>

      {/* 右：物資 + 公告 */}
      <div className="min-w-0 flex-1 space-y-3 overflow-y-auto p-3">
        <section className="grid grid-cols-3 gap-2">
          <div><span className={lbl}>💰 金幣</span><input type="number" min="0" value={b.gold} onChange={set('gold')} className={inp} /></div>
          <div><span className={lbl}>💠 精華</span><input type="number" min="0" value={b.essence} onChange={set('essence')} className={inp} /></div>
          <div><span className={lbl}>🥚 寵物蛋</span><input type="number" min="0" value={b.eggs} onChange={set('eggs')} className={inp} /></div>
          <div className="col-span-2"><span className={lbl}>素材</span>
            <select value={b.mat} onChange={set('mat')} className={inp}>
              <option value="">（不給）</option>
              {Object.values(config.materials).map((m) => <option key={m.id} value={m.id}>{m.name}{m.set >= 0 ? `（${config.sets[m.set].name}）` : ''}</option>)}
            </select>
          </div>
          <div><span className={lbl}>數量</span><input type="number" min="0" value={b.matN} onChange={set('matN')} className={inp} /></div>
        </section>

        <section className="grid grid-cols-4 gap-2">
          <div className="col-span-4"><span className={lbl}>裝備</span>
            <select value={b.base} onChange={set('base')} className={inp}>
              <option value="">（不給）</option>
              {items.map((it) => <option key={it.id} value={it.id}>{config.sets[it.set].name}·{it.wtype ? config.weaponTypes[it.wtype].name : config.slotLabel[it.slot]}·{it.name}</option>)}
            </select>
          </div>
          <div className="col-span-2"><span className={lbl}>品質</span>
            <select value={b.grade} onChange={set('grade')} className={inp}>
              {config.grades.map((g) => <option key={g.id} value={g.id}>{g.name}{g.weaponOnly ? '（武器限定）' : ''}</option>)}
            </select>
          </div>
          <div><span className={lbl}>強化 +</span><input type="number" min="0" value={b.lv} onChange={set('lv')} className={inp} /></div>
          <div><span className={lbl}>件數</span><input type="number" min="1" max="20" value={b.count} onChange={set('count')} className={inp} /></div>
        </section>

        <section className="grid grid-cols-3 gap-2">
          {[['mount', '坐騎', config.mounts], ['wing', '翅膀', config.wings], ['pet', '寵物', config.pets]].map(([k, t, defs]) => (
            <div key={k}><span className={lbl}>{t}</span>
              <select value={b[k]} onChange={set(k)} className={inp}>
                <option value="">（不給）</option>
                {Object.values(defs).map((d) => <option key={d.id} value={d.id}>{d.icon} {d.name}</option>)}
              </select>
            </div>
          ))}
        </section>
        <p className="text-[10px] text-white/35">已經有的坐騎不會重複給；已有的翅膀 +1 級、已有的寵物 +1 星。背包滿了裝備會少給。</p>

        <div><span className={lbl}>附言（收到的人會看到）</span><input value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} placeholder="例：週末活動獎勵" className={inp} /></div>
        <button disabled={busy} onClick={give} className="w-full rounded-xl bg-gold py-2.5 font-bold text-ink transition active:scale-[.98] disabled:opacity-40">
          🎁 發放給{target === 'all' ? '全部玩家' : target === 'online' ? `在線玩家（${list.filter((p) => p.online).length} 人）` : `勾選的 ${picked.length} 人`}
        </button>

        <section className="space-y-1.5 border-t border-white/10 pt-3">
          <span className={lbl}>📢 全服公告（所有在線玩家畫面上方顯示）</span>
          <div className="flex gap-2">
            <input value={msg} maxLength={120} onChange={(e) => setMsg(e.target.value)} placeholder="例：今晚 9 點世界王加倍！" className={inp} />
            <button onClick={announce} className="shrink-0 rounded-lg bg-sky-500 px-3 text-xs font-bold">送出</button>
          </div>
        </section>
        <p className="text-[10px] text-white/30">每一筆發放都會記在 server/data/admin-log.txt。玩家總數 {list.length}，在線 {list.filter((p) => p.online).length}，金幣最多 {fmt(Math.max(0, ...list.map((p) => p.gold)))}</p>
      </div>
    </div>
  );
}
