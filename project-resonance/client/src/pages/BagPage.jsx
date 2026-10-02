import { useState } from 'react';
import { fmt } from '../utils/format.js';
import { MatIcon } from '../components/Icons.jsx';
import { GearPicker, GearDetail, GearCompare, Essence, SORTS } from '../components/Gear.jsx';

const SLOT_FILTERS = [['all', '全部'], ['weapon', '武器'], ['helm', '頭盔'], ['armor', '胸甲'], ['gloves', '護手'], ['boots', '護腿']];

/** 背包：裝備（可穿 / 上鎖 / 分解）+ 素材 */
export default function BagPage({ player, config, onEquip, onLock, onDismantle }) {
  const [tab, setTab] = useState('gear');
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-edge px-3 pt-2">
        {[['gear', `🎒 裝備 ${player.inv.length}/${config.invLimit}`], ['mats', '🧪 素材']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`rounded-t-lg px-4 py-2 text-sm font-bold ${tab === id ? 'bg-panel text-gold' : 'text-white/45'}`}>{label}</button>
        ))}
        <span className="ml-auto pb-1 text-sm"><Essence n={player.essence} /></span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'gear'
          ? <GearTab player={player} config={config} onEquip={onEquip} onLock={onLock} onDismantle={onDismantle} />
          : <MatsTab player={player} config={config} />}
      </div>
    </div>
  );
}

function GearTab({ player, config, onEquip, onLock, onDismantle }) {
  const [slot, setSlot] = useState('all');
  const [sel, setSel] = useState(null);
  const [sort, setSort] = useState('power');
  const [confirm, setConfirm] = useState(null); // { uids, essence, text }
  const worn = new Set(Object.values(player.equipped));
  const inst = player.inv.find((x) => x.uid === sel);
  const canBreak = (it) => !worn.has(it.uid) && !it.lock && it.base !== 'starter_weapon';

  const [multi, setMulti] = useState(null); // 多選模式：Set<uid>
  const ask = (list, text) => {
    if (!list.length) { setConfirm({ uids: [], essence: 0, text: '沒有符合條件的裝備（穿著、上鎖的不會動）' }); return; }
    setConfirm({ uids: list.map((x) => x.uid), essence: list.reduce((n, x) => n + x.yield.essence, 0), text, warn: list.some((x) => x.grade >= 3) });
  };
  const G = config.grades;
  const bulk = (maxGrade) => ask(player.inv.filter((it) => canBreak(it) && it.grade <= maxGrade),
    `分解 ${G.slice(0, maxGrade + 1).map((g) => g.name).join('、')} 裝備（穿著、上鎖的不會動）`);
  const BULKS = [
    ['普通', () => bulk(0)], ['≤精良', () => bulk(1)], ['≤稀有', () => bulk(2)], ['≤傳說', () => bulk(3)],
    ['不比身上強的', () => ask(player.inv.filter((it) => canBreak(it) && (it.delta ?? 0) <= 0 && it.grade < 4), '分解所有「不會讓戰力變高」的裝備（星輝不算）')],
    ['舊地圖的', () => ask(player.inv.filter((it) => canBreak(it) && config.items[it.base].set < player.maxMap), `分解所有比「${config.maps[player.maxMap].name}」低階的裝備`)],
  ];
  const pick = (uid) => {
    if (!multi) { setSel(uid); return; }
    const it = player.inv.find((x) => x.uid === uid);
    if (!it || !canBreak(it)) return;
    const n = new Set(multi);
    if (n.has(uid)) n.delete(uid); else n.add(uid);
    setMulti(n);
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1 overflow-y-auto p-3">
        <div className="mb-2 flex flex-wrap gap-1">
          {SLOT_FILTERS.map(([id, label]) => (
            <button key={id} onClick={() => setSlot(id)}
              className={`rounded-full px-2.5 py-1 text-[11px] ${slot === id ? 'bg-gold text-ink' : 'bg-white/10 text-white/60'}`}>{label}</button>
          ))}
        </div>
        <div className="mb-2 flex items-center gap-1 text-[11px]">
          <span className="text-white/40">排序：</span>
          {SORTS.map(([id, label]) => (
            <button key={id} onClick={() => setSort(id)}
              className={`rounded px-2 py-0.5 ${sort === id ? 'bg-white/20 text-white' : 'text-white/45'}`}>{label}</button>
          ))}
          <span className="ml-auto text-white/35">⚔ 單件戰力 · <span className="text-emerald-400">▲</span> 比身上強</span>
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-lg bg-red-500/5 px-2 py-1.5">
          <span className="text-[11px] text-red-200/70">♻️ 一鍵分解：</span>
          {BULKS.map(([label, fn]) => (
            <button key={label} onClick={fn} className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] active:scale-95">{label}</button>
          ))}
          <button onClick={() => setMulti(multi ? null : new Set())}
            className={`ml-auto rounded-full px-3 py-1 text-[11px] font-bold ${multi ? 'bg-red-500 text-white' : 'border border-red-400/50 text-red-200'}`}>
            {multi ? '取消多選' : '☑ 多選分解'}
          </button>
        </div>
        {multi && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-red-400/40 bg-red-950/40 px-2 py-1.5 text-xs">
            <span className="flex-1">點裝備勾選（穿著 / 上鎖的不能選）：已選 <b>{multi.size}</b> 件</span>
            <button onClick={() => setMulti(new Set(player.inv.filter((it) => canBreak(it) && (slot === 'all' || config.items[it.base].slot === slot)).map((x) => x.uid)))} className="rounded bg-white/10 px-2 py-1">全選</button>
            <button disabled={!multi.size} onClick={() => ask(player.inv.filter((x) => multi.has(x.uid)), `分解勾選的 ${multi.size} 件`)} className="rounded bg-red-500 px-3 py-1 font-bold disabled:opacity-30">分解</button>
          </div>
        )}
        <GearPicker player={player} config={config} selected={sel} onSelect={pick} sort={sort} picked={multi}
          filter={(it) => slot === 'all' || config.items[it.base].slot === slot} />
      </div>

      <div className="w-64 shrink-0 overflow-y-auto border-l border-edge p-3">
        {!inst ? (
          <p className="pt-8 text-center text-xs text-white/35">點一件裝備看詳細</p>
        ) : (
          <div className="space-y-2">
            <GearDetail inst={inst} config={config} compact />
            <GearCompare inst={inst} player={player} config={config} />
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <button disabled={worn.has(inst.uid)} onClick={() => onEquip(inst.uid)}
                className="rounded-lg bg-gold py-2 text-sm font-bold text-ink disabled:bg-emerald-500/20 disabled:text-emerald-300">
                {worn.has(inst.uid) ? '穿著中' : '穿上'}
              </button>
              <button onClick={() => onLock(inst.uid, !inst.lock)} className="rounded-lg bg-white/10 py-2 text-sm">
                {inst.lock ? '🔓 解鎖' : '🔒 上鎖'}
              </button>
            </div>
            <button disabled={!canBreak(inst)}
              onClick={() => setConfirm({ uids: [inst.uid], essence: inst.yield.essence, text: `分解這件 ${config.items[inst.base].name}` })}
              className="w-full rounded-lg border border-red-400/40 py-2 text-sm text-red-300 disabled:opacity-30">
              分解（得 <Essence n={inst.yield.essence} />）
            </button>
            {!canBreak(inst) && <p className="text-[10px] text-white/35">穿著中、上鎖、新手武器不能分解</p>}
          </div>
        )}
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6" onClick={() => setConfirm(null)}>
          <div className="toast-pop w-full max-w-xs rounded-2xl border border-red-400/40 bg-panel p-4 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="font-bold">確定分解？</div>
            <div className="mt-1 text-sm text-white/60">{confirm.text}</div>
            {confirm.uids.length > 0 && <div className="mt-1 text-sm">{confirm.uids.length} 件 · 可獲得 <Essence n={confirm.essence} /> 鍛造精華 ＋ 部分素材</div>}
            {confirm.warn && <div className="mt-1 text-xs font-bold text-amber-300">⚠ 裡面有傳說以上的裝備！</div>}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={() => setConfirm(null)} className="rounded-lg bg-white/10 py-2">取消</button>
              <button disabled={!confirm.uids.length} onClick={async () => { await onDismantle(confirm.uids); setConfirm(null); setSel(null); setMulti(null); }}
                className="rounded-lg bg-red-500 py-2 font-bold disabled:opacity-30">分解</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MatsTab({ player, config }) {
  const { materials, sets } = config;
  const mats = [...sets.flatMap((s) => s.mats), 'wf', 'wr'].filter((id) => (player.mats[id] || 0) > 0);
  return (
    <div className="p-3">
      {mats.length === 0 && <p className="text-xs text-white/35">還沒有素材，去打怪吧！</p>}
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
        {mats.map((id) => {
          const m = materials[id];
          return (
            <div key={id} className={`flex items-center gap-2 rounded-lg border px-2 py-2 ${m.rare ? 'border-gold/30 bg-gold/5' : 'border-edge bg-panel'}`}>
              <MatIcon mat={m} size={18} />
              <div className="min-w-0 flex-1">
                <div className={`truncate text-[11px] ${m.rare ? 'text-gold' : 'text-white/70'}`}>{m.name}</div>
                <div className="num text-sm font-bold">{fmt(player.mats[id])}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
