import { useCallback, useEffect, useState } from 'react';
import { api } from '../utils/api.js';
import { fmt } from '../utils/format.js';
import { MatIcon } from '../components/Icons.jsx';
import { GearPicker, GearDetail, mainStatText } from '../components/Gear.jsx';

const KINDS = [['all', '全部'], ['gear', '⚔️ 裝備'], ['mat', '🧪 素材'], ['egg', '🥚 寵物蛋'], ['essence', '💠 精華']];

/** 交易所：買 / 賣 / 我的掛單 / 成交紀錄 */
export default function MarketPage({ player, config, onList, onCancel, onBuy }) {
  const [tab, setTab] = useState('buy');
  const [view, setView] = useState(null);
  const refresh = useCallback(async () => { try { setView((await api.market()).result); } catch { /* 下次再試 */ } }, []);
  useEffect(() => { refresh(); const t = setInterval(refresh, 8000); return () => clearInterval(t); }, [refresh]);
  const after = (fn) => async (...a) => { const r = await fn(...a); refresh(); return r; };
  const mine = view?.listings.filter((l) => l.mine) ?? [];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-edge px-3 pt-2">
        {[['buy', '🛒 購買'], ['sell', '🏷️ 上架'], ['mine', `📋 我的掛單 ${mine.length}`], ['log', '📜 成交']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`rounded-t-lg px-3 py-2 text-sm font-bold ${tab === id ? 'bg-panel text-gold' : 'text-white/45'}`}>{label}</button>
        ))}
        <span className="num ml-auto pb-1 text-sm text-gold">💰 {fmt(player.gold)}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!view ? <p className="py-8 text-center text-xs text-white/40">載入中…</p>
          : tab === 'buy' ? <BuyTab view={view} player={player} config={config} onBuy={after(onBuy)} />
          : tab === 'sell' ? <SellTab view={view} player={player} config={config} mineCount={mine.length} onList={after(onList)} />
          : tab === 'mine' ? <MineTab list={mine} config={config} onCancel={after(onCancel)} />
          : <LogTab view={view} />}
      </div>
    </div>
  );
}

function ListingIcon({ l, config }) {
  if (l.kind === 'mat') return <MatIcon mat={config.materials[l.mat] ?? { name: l.name, rare: l.mat === 'wr' }} size={22} />;
  return <span className="text-xl">{l.kind === 'gear' ? '⚔️' : l.kind === 'egg' ? '🥚' : '💠'}</span>;
}
function ListingName({ l, config }) {
  if (l.kind !== 'gear') return <span>{l.name}{l.qty > 1 && <span className="num text-white/60"> ×{fmt(l.qty)}</span>}</span>;
  const g = config.grades[l.inst.grade];
  return (
    <span>
      <span style={{ color: g.color }}>【{g.name}】</span>{l.name}{l.inst.lv > 0 && <span className="text-gold"> +{l.inst.lv}</span>}
      <span className="num block text-[10px] text-white/45">{config.slotLabel[config.items[l.inst.base].slot]} · {mainStatText(l.inst, config)} · 附加 {l.inst.affixes?.length ?? 0} 條</span>
    </span>
  );
}
const refOf = (view, l) => (l.kind === 'mat' ? view.ref[l.mat] * l.qty : l.kind === 'egg' ? view.refEgg * l.qty : l.kind === 'essence' ? view.refEssence * l.qty : 0);

function BuyTab({ view, player, config, onBuy }) {
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');
  const [peek, setPeek] = useState(null);
  const list = view.listings.filter((l) => !l.mine && (kind === 'all' || l.kind === kind) && (!q || l.name.includes(q)));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        {KINDS.map(([id, label]) => (
          <button key={id} onClick={() => setKind(id)} className={`rounded-full px-2.5 py-1 text-[11px] ${kind === id ? 'bg-gold text-ink' : 'bg-white/10 text-white/60'}`}>{label}</button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋名稱" className="ml-auto w-28 rounded-lg bg-white/10 px-2 py-1 text-xs outline-none" />
      </div>
      {list.length === 0 && <p className="py-6 text-center text-xs text-white/40">目前沒有符合的商品，晚點再來看看</p>}
      {list.map((l) => {
        const ref = refOf(view, l);
        const pct = ref ? Math.round((l.price / ref) * 100) : null;
        return (
          <div key={l.id} className="flex items-center gap-2.5 rounded-xl border border-edge bg-panel p-2">
            <button onClick={() => l.kind === 'gear' && setPeek(l)} className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/5"><ListingIcon l={l} config={config} /></button>
            <div className="min-w-0 flex-1 text-sm">
              <ListingName l={l} config={config} />
              <div className="text-[10px] text-white/40">賣家 {l.sellerName}</div>
            </div>
            <div className="text-right">
              <div className="num text-sm font-bold text-gold">💰{fmt(l.price)}</div>
              {pct != null && <div className={`text-[10px] ${pct <= 90 ? 'text-emerald-300' : pct >= 130 ? 'text-red-300' : 'text-white/40'}`}>參考價 {pct}%</div>}
            </div>
            <button disabled={player.gold < l.price} onClick={() => onBuy(l.id)} className="rounded-lg bg-gold px-3 py-2 text-xs font-bold text-ink active:scale-95 disabled:opacity-30">購買</button>
          </div>
        );
      })}
      {peek && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6" onClick={() => setPeek(null)}>
          <div className="w-full max-w-xs rounded-2xl border border-edge bg-panel p-4" onClick={(e) => e.stopPropagation()}>
            <GearDetail inst={peek.inst} config={config} />
            <button onClick={() => setPeek(null)} className="mt-3 w-full rounded-lg bg-white/10 py-2 text-sm">關閉</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SellTab({ view, player, config, mineCount, onList }) {
  const [kind, setKind] = useState('mat');
  const [pick, setPick] = useState(null); // gear uid / mat id
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState('');
  const worn = new Set(Object.values(player.equipped));
  const mats = Object.keys(view.ref).filter((m) => Math.floor(player.mats[m] || 0) > 0);
  const have = kind === 'mat' ? Math.floor(player.mats[pick] || 0) : kind === 'egg' ? player.eggs || 0 : kind === 'essence' ? player.essence : 1;
  const unitRef = kind === 'mat' ? view.ref[pick] : kind === 'egg' ? view.refEgg : kind === 'essence' ? view.refEssence : 0;
  const n = kind === 'gear' ? 1 : Math.max(1, Math.min(have, Math.floor(Number(qty) || 1)));
  const p = Math.floor(Number(price) || 0);
  const ready = p >= 1 && (kind === 'gear' ? !!pick : kind === 'mat' ? !!pick && have >= n : have >= n) && mineCount < view.max;
  const choose = (k) => { setKind(k); setPick(k === 'egg' || k === 'essence' ? k : null); setQty(1); setPrice(''); };
  const submit = async () => {
    const ok = await onList({ kind, uid: kind === 'gear' ? pick : undefined, mat: kind === 'mat' ? pick : undefined, qty: n, price: p });
    if (ok) { setPick(kind === 'egg' || kind === 'essence' ? kind : null); setPrice(''); setQty(1); }
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {KINDS.slice(1).map(([id, label]) => (
          <button key={id} onClick={() => choose(id)} className={`rounded-full px-2.5 py-1 text-[11px] ${kind === id ? 'bg-gold text-ink' : 'bg-white/10 text-white/60'}`}>{label}</button>
        ))}
        <span className="ml-auto self-center text-[10px] text-white/40">手續費 {Math.round(view.fee * 1000) / 10}% · 掛單 {mineCount}/{view.max} · {view.expireH} 小時沒賣掉自動退回</span>
      </div>
      {kind === 'gear' && (
        <GearPicker player={player} config={config} selected={pick} onSelect={setPick}
          filter={(it) => !worn.has(it.uid) && !it.lock && it.base !== 'starter_weapon'} />
      )}
      {kind === 'mat' && (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {mats.length === 0 && <p className="col-span-full py-4 text-center text-xs text-white/40">沒有素材可以賣</p>}
          {mats.map((m) => (
            <button key={m} onClick={() => setPick(m)} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left ${pick === m ? 'border-gold bg-gold/10' : 'border-edge bg-panel'}`}>
              <MatIcon mat={config.materials[m]} size={16} />
              <span className="min-w-0 flex-1"><span className="block truncate text-[11px]">{config.materials[m]?.name}</span><b className="num text-xs">{fmt(player.mats[m])}</b></span>
            </button>
          ))}
        </div>
      )}
      {(kind === 'egg' || kind === 'essence') && <div className="rounded-lg bg-white/5 p-2 text-xs">你有 {kind === 'egg' ? `🥚 ${player.eggs || 0} 顆` : `💠 ${fmt(player.essence)}`}</div>}
      {pick && (
        <div className="space-y-2 rounded-xl border border-gold/30 bg-gold/5 p-3">
          {kind !== 'gear' && (
            <div className="flex items-center gap-2 text-xs">
              <span className="w-10 text-white/50">數量</span>
              <input type="number" min={1} max={have} value={qty} onChange={(e) => setQty(e.target.value)} className="num w-24 rounded-lg bg-black/30 px-2 py-1.5 outline-none" />
              {[0.25, 0.5, 1].map((f) => <button key={f} onClick={() => setQty(Math.max(1, Math.floor(have * f)))} className="rounded bg-white/10 px-2 py-1">{f === 1 ? '全部' : `${f * 100}%`}</button>)}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="w-10 text-white/50">總價</span>
            <input type="number" min={1} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="金幣" className="num w-32 rounded-lg bg-black/30 px-2 py-1.5 outline-none" />
            {unitRef > 0 && [0.8, 1, 1.2].map((f) => (
              <button key={f} onClick={() => setPrice(String(Math.ceil(unitRef * n * f)))} className="rounded bg-white/10 px-2 py-1">參考價{f === 1 ? '' : ` ×${f}`}</button>
            ))}
          </div>
          {p > 0 && <div className="num text-[11px] text-white/55">賣出後入帳 💰{fmt(Math.floor(p * (1 - view.fee)))}{n > 1 ? `（每個 ${fmt(p / n)}）` : ''}</div>}
          <button disabled={!ready} onClick={submit} className="w-full rounded-xl bg-gold py-2.5 text-sm font-bold text-ink active:scale-[.98] disabled:opacity-30">🏷️ 上架</button>
        </div>
      )}
    </div>
  );
}

function MineTab({ list, config, onCancel }) {
  if (!list.length) return <p className="py-6 text-center text-xs text-white/40">沒有掛單。到「上架」把用不到的東西賣給別人吧</p>;
  return (
    <div className="space-y-1.5">
      {list.map((l) => (
        <div key={l.id} className="flex items-center gap-2.5 rounded-xl border border-edge bg-panel p-2">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/5"><ListingIcon l={l} config={config} /></span>
          <div className="min-w-0 flex-1 text-sm"><ListingName l={l} config={config} /></div>
          <span className="num text-sm font-bold text-gold">💰{fmt(l.price)}</span>
          <button onClick={() => onCancel(l.id)} className="rounded-lg border border-white/20 px-3 py-1.5 text-xs">下架</button>
        </div>
      ))}
    </div>
  );
}

function LogTab({ view }) {
  if (!view.history.length) return <p className="py-6 text-center text-xs text-white/40">還沒有人成交</p>;
  return (
    <div className="space-y-1">
      {view.history.map((h, i) => (
        <div key={i} className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5 text-xs">
          <span className="min-w-0 flex-1 truncate">{h.buyer} 向 {h.seller} 買了 <b>{h.name}</b>{h.qty > 1 ? ` ×${fmt(h.qty)}` : ''}</span>
          <span className="num text-gold">💰{fmt(h.price)}</span>
          <span className="text-[10px] text-white/35">{new Date(h.at).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      ))}
    </div>
  );
}
