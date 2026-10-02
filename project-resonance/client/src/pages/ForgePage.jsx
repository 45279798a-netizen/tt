import { useState } from 'react';
import { fmt } from '../utils/format.js';
import { ItemIcon, MatIcon, setColor } from '../components/Icons.jsx';
import { CoinIcon } from '../components/HudPlayer.jsx';
import { GearPicker, GearDetail, GearCompare, Essence, mainStatText } from '../components/Gear.jsx';

/** 鍛造師·鐵錘：製作（每次隨機數值）/ 強化 / 洗鍊 */
export default function ForgePage({ player, config, onCraft, onCraftMany, onCraftMissing, onEnhance, onEnhanceMany, onReroll, onEquip, onSynth, onDismantle }) {
  const [tab, setTab] = useState('craft');
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-edge px-3 pt-2">
        {[['craft', '⚒️ 鍛造'], ['enhance', '✨ 強化'], ['reroll', '🎲 洗鍊'], ['synth', '🧪 合成']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`rounded-t-lg px-4 py-2 text-sm font-bold ${tab === id ? 'bg-panel text-gold' : 'text-white/45'}`}>{label}</button>
        ))}
        <span className="ml-auto flex items-center gap-3 pb-1 text-sm">
          <span className="num flex items-center gap-1 text-gold"><CoinIcon className="size-3.5" />{fmt(player.gold)}</span>
          <Essence n={player.essence} />
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'craft' && <CraftTab player={player} config={config} onCraft={onCraft} onCraftMany={onCraftMany} onCraftMissing={onCraftMissing} onEquip={onEquip} onDismantle={onDismantle} />}
        {tab === 'enhance' && <UpgradeTab mode="enhance" player={player} config={config} onAct={onEnhance} onMany={onEnhanceMany} />}
        {tab === 'synth' && <SynthTab player={player} config={config} onSynth={onSynth} />}
      {tab === 'reroll' && <UpgradeTab mode="reroll" player={player} config={config} onAct={onReroll} />}
      </div>
    </div>
  );
}

function CraftTab({ player, config, onCraft, onCraftMany, onCraftMissing, onEquip, onDismantle }) {
  const { sets, items, materials, slots } = config;
  const [setId, setSetId] = useState(Math.min(player.mapId, player.maxMap));
  const [result, setResult] = useState(null);   // 單件：詳細 + 比較
  const [batch, setBatch] = useState(null);     // 多件：清單
  const [busy, setBusy] = useState(false);
  const set = sets[setId];
  const color = setColor(setId);
  const wtype = player.stats.wtype;
  // 武器只列自己職業的（其他武器收在「其他武器」裡），部位照順序
  const [otherW, setOtherW] = useState(false);
  const all = Object.values(items).filter((x) => x.set === setId).sort((a, b) => slots.indexOf(a.slot) - slots.indexOf(b.slot));
  const list = all.filter((x) => otherW || x.slot !== 'weapon' || x.wtype === wtype);
  const missing = all.filter((x) => (x.slot !== 'weapon' || x.wtype === wtype) && !player.codex.includes(x.id)).length;
  const maxTimes = (it) => Math.min(10, config.invLimit - player.inv.length, Math.floor(player.gold / Math.max(1, it.gold)),
    ...Object.entries(it.recipe).map(([m, n]) => Math.floor((player.mats[m] || 0) / n)));

  const run = async (fn) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r || r === true) return;
    const got = r.items ?? [r];
    if (got.length === 1) setResult(got[0]); else setBatch(got.map((x) => x.uid));
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 套裝：橫向一排，手機比較好點 */}
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-edge px-2 py-1.5">
        {sets.map((st) => {
          const seen = st.id <= player.maxMap;
          return (
            <button key={st.id} disabled={!seen} onClick={() => setSetId(st.id)}
              className={`shrink-0 rounded-lg border px-2.5 py-1 text-left disabled:opacity-25 ${setId === st.id ? 'border-white/40 bg-white/10' : 'border-transparent'}`}>
              <div className="text-[11px] font-bold" style={{ color: seen ? setColor(st.id) : undefined }}>{seen ? st.name : '？？？'}</div>
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="font-bold" style={{ color }}>{set.monster}</span>
          {set.mats.map((id) => (
            <span key={id} className="flex items-center gap-1">
              <MatIcon mat={materials[id]} size={13} />
              <span className={materials[id].rare ? 'text-gold' : 'text-white/60'}>{materials[id].name}</span>
              <b className="num">{fmt(player.mats[id] || 0)}</b>
            </span>
          ))}
          <span className="ml-auto flex gap-1.5">
            <button onClick={() => setOtherW((v) => !v)} className={`rounded-full px-2.5 py-1 text-[11px] ${otherW ? 'bg-white/20' : 'bg-white/5 text-white/50'}`}>其他武器</button>
            {missing > 0 && (
              <button disabled={busy} onClick={() => run(() => onCraftMissing(setId))} className="rounded-full bg-emerald-500 px-3 py-1 text-[11px] font-bold text-ink active:scale-95 disabled:opacity-40">
                ⚡ 補齊缺的 {missing} 件
              </button>
            )}
          </span>
        </div>
        <div className="text-[10px] text-white/40">
          品質機率：{config.grades.map((g) => <span key={g.id} className="ml-1" style={{ color: g.color }}>{g.name} {g.chance < 0.01 ? (g.chance * 100).toFixed(1) : Math.round(g.chance * 100)}%</span>)}
        </div>

        <div className="grid gap-1.5 lg:grid-cols-2">
          {list.map((it) => {
            const n = maxTimes(it);
            const made = player.codex.includes(it.id);
            const have = player.inv.filter((x) => x.base === it.id).length;
            return (
              <div key={it.id} className="rounded-xl border border-edge bg-panel p-2">
                <div className="flex items-center gap-2">
                  <ItemIcon item={it} size="size-10" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="truncate text-sm font-bold" style={{ color }}>{it.name}</span>
                      {made ? <span className="text-[10px] text-emerald-300">✔</span> : <span className="text-[10px] text-amber-300">未收集</span>}
                      {have > 0 && <span className="text-[10px] text-white/40">×{have}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 text-[11px]">
                      {Object.entries(it.recipe).map(([m, need]) => (
                        <span key={m} className={`num flex items-center gap-0.5 ${(player.mats[m] || 0) >= need ? 'text-white/60' : 'text-red-400'}`}>
                          <MatIcon mat={materials[m]} size={10} />{fmt(need)}
                        </span>
                      ))}
                      <span className={`num flex items-center gap-0.5 ${player.gold >= it.gold ? 'text-gold/80' : 'text-red-400'}`}><CoinIcon className="size-3" />{fmt(it.gold)}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-1.5 flex items-center gap-1">
                  <span className="num flex-1 text-[10px] text-white/40">{n > 0 ? `可做 ${n} 次` : '素材 / 金幣不足'}</span>
                  {[1, 5, 10].map((t) => (
                    <button key={t} disabled={busy || n < 1} onClick={() => run(() => (t === 1 ? onCraft(it.id) : onCraftMany(it.id, Math.min(t, n))))}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold active:scale-95 disabled:bg-white/5 disabled:text-white/25 ${t === 1 ? 'bg-gold text-ink' : 'bg-white/10'}`}>
                      ×{t === 1 ? 1 : Math.max(1, Math.min(t, n))}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {result && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6" onClick={() => setResult(null)}>
          <div className="toast-pop w-full max-w-xs rounded-3xl border-2 bg-panel p-4" onClick={(e) => e.stopPropagation()}
            style={{ borderColor: config.grades[result.grade].color, boxShadow: `0 0 40px ${config.grades[result.grade].color}55` }}>
            <div className="mb-2 text-center text-xs tracking-widest text-white/45">鍛造完成</div>
            {(() => {
              const live = player.inv.find((x) => x.uid === result.uid) || result; // 背包裡那份有戰力資料
              const worn = Object.values(player.equipped).includes(live.uid);
              return (
                <>
                  <GearDetail inst={live} config={config} />
                  {live.power != null && <div className="mt-2"><GearCompare inst={live} player={player} config={config} /></div>}
                  {onEquip && !worn && live.delta > 0 && (
                    <button onClick={() => onEquip(live.uid)} className="mt-2 w-full rounded-xl bg-emerald-500 py-2 text-sm font-bold text-ink">直接穿上</button>
                  )}
                </>
              );
            })()}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button onClick={() => setResult(null)} className="rounded-xl bg-white/10 py-2.5 text-sm">收下</button>
              <button onClick={() => { const b = result.base; setResult(null); run(() => onCraft(b)); }}
                className="rounded-xl bg-gold py-2.5 text-sm font-bold text-ink">再鍛造一次</button>
            </div>
          </div>
        </div>
      )}
      {batch && <BatchResult uids={batch} player={player} config={config} onEquip={onEquip} onDismantle={onDismantle} onClose={() => setBatch(null)} />}
    </div>
  );
}

/** 一次做很多件的結果：一覽 + 穿上最強 + 把沒用的直接分解 */
function BatchResult({ uids, player, config, onEquip, onDismantle, onClose }) {
  const worn = new Set(Object.values(player.equipped));
  const got = uids.map((u) => player.inv.find((x) => x.uid === u)).filter(Boolean);
  const best = [...got].sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))[0];
  const junk = got.filter((x) => !worn.has(x.uid) && !x.lock && (x.delta ?? 0) <= 0 && x.grade < 3);
  const junkEss = junk.reduce((n, x) => n + (x.yield?.essence || 0), 0);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="toast-pop w-full max-w-md rounded-3xl border border-gold/50 bg-panel p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 text-center text-xs tracking-widest text-white/45">鍛造完成 · {got.length} 件</div>
        <div className="max-h-[45vh] space-y-1 overflow-y-auto">
          {got.map((x) => {
            const g = config.grades[x.grade];
            return (
              <div key={x.uid} className={`flex items-center gap-2 rounded-lg px-2 py-1 text-xs ${x === best && (x.delta ?? 0) > 0 ? 'bg-emerald-500/15' : 'bg-white/5'}`}>
                <span className="font-bold" style={{ color: g.color }}>【{g.name}】</span>
                <span className="min-w-0 flex-1 truncate">{config.items[x.base].name}</span>
                {worn.has(x.uid) ? <span className="text-emerald-300">穿著</span>
                  : (x.delta ?? 0) > 0 ? <span className="num text-emerald-300">▲{fmt(x.delta)}</span> : <span className="text-white/30">—</span>}
              </div>
            );
          })}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button onClick={onClose} className="rounded-xl bg-white/10 py-2 text-sm">收下</button>
          <button disabled={!best || worn.has(best.uid) || (best.delta ?? 0) <= 0} onClick={() => onEquip(best.uid)}
            className="rounded-xl bg-emerald-500 py-2 text-xs font-bold text-ink disabled:opacity-30">穿上最強的</button>
          <button disabled={!junk.length} onClick={async () => { await onDismantle(junk.map((x) => x.uid)); }}
            className="rounded-xl bg-red-500/80 py-2 text-xs font-bold disabled:opacity-30">分解沒用的 {junk.length} 件{junk.length ? ` (💠${junkEss})` : ''}</button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-white/35">「沒用的」= 沒穿、沒上鎖、不會讓戰力變高、傳說以下</p>
      </div>
    </div>
  );
}

function UpgradeTab({ mode, player, config, onAct, onMany }) {
  const worn = Object.values(player.equipped);
  const [sel, setSel] = useState(worn.find(Boolean) ?? null);
  const inst = player.inv.find((x) => x.uid === sel);
  const enh = mode === 'enhance';
  const cost = inst && (enh ? inst.enhanceCost : inst.rerollCost);
  const maxed = enh && inst && inst.lv >= inst.cap;
  const ok = inst && !maxed && player.gold >= cost.gold && player.essence >= cost.essence;

  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1 overflow-y-auto p-3">
        <p className="mb-2 text-xs text-white/45">
          {enh
            ? `強化綁在這件裝備上，換裝不會繼承。每級主屬性 +${Math.round(config.enhancePerLv * 100)}%，需要金幣＋鍛造精華。`
            : '洗鍊會把附加屬性全部重骰（品質和條數不變），需要金幣＋鍛造精華。'}
        </p>
        <GearPicker player={player} config={config} selected={sel} onSelect={setSel} />
      </div>
      <div className="w-64 shrink-0 overflow-y-auto border-l border-edge p-3">
        {!inst ? <p className="pt-8 text-center text-xs text-white/35">選一件裝備</p> : (
          <div className="space-y-2">
            <GearDetail inst={inst} config={config} compact />
            {enh && (
              <div className="rounded-lg bg-white/5 p-2 text-xs">
                <div className="flex justify-between"><span className="text-white/50">強化</span><span className="num font-bold text-gold">+{inst.lv} / {inst.cap}</span></div>
                {!maxed && <div className="num mt-0.5 text-emerald-300">→ {mainStatText(inst, config, inst.lv + 1)}</div>}
              </div>
            )}
            {!maxed && (
              <div className="flex items-center justify-center gap-3 text-sm">
                <span className={`num flex items-center gap-1 ${player.gold >= cost.gold ? 'text-gold' : 'text-red-400'}`}><CoinIcon className="size-3.5" />{fmt(cost.gold)}</span>
                <span className={player.essence >= cost.essence ? '' : 'text-red-400'}><Essence n={cost.essence} /></span>
              </div>
            )}
            <button disabled={!ok} onClick={() => onAct(inst.uid)}
              className="w-full rounded-xl bg-gold py-3 font-bold text-ink transition active:scale-95 disabled:bg-white/10 disabled:text-white/35">
              {maxed ? '已達上限' : enh ? '強化 +1' : '洗鍊'}
            </button>
            {enh && !maxed && onMany && (
              <div className="grid grid-cols-2 gap-1.5">
                <button disabled={!ok} onClick={() => onMany(inst.uid, 5)} className="rounded-xl bg-white/10 py-2 text-sm font-bold active:scale-95 disabled:opacity-30">+5</button>
                <button disabled={!ok} onClick={() => onMany(inst.uid, 0)} className="rounded-xl bg-amber-500/80 py-2 text-xs font-bold text-ink active:scale-95 disabled:opacity-30">強化到資源用完</button>
              </div>
            )}
            {player.essence < (cost?.essence ?? 0) && <p className="text-center text-[10px] text-white/40">精華不夠？到背包分解不要的裝備</p>}
          </div>
        )}
      </div>
    </div>
  );
}

/** 素材合成：同區 普通→稀有、上一區稀有→下一區普通、羽晶→星輝羽（數量立刻更新） */
function SynthTab({ player, config, onSynth }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const mat = (m) => config.materials[m];
  const have = (m) => Math.floor(player.mats[m] || 0);
  const run = async (r, times) => {
    setBusy(true); setMsg('');
    const ok = await onSynth(r.id, times);
    if (ok) setMsg(`✅ 合成：${Object.entries(r.to).map(([k, v]) => `${mat(k)?.name ?? k} ×${fmt(v * times)}`).join('、')}`);
    setBusy(false);
  };
  const Mats = ({ m }) => (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      {Object.entries(m).map(([k, n]) => <span key={k} className="num inline-flex items-center gap-0.5"><MatIcon mat={mat(k)} size={12} />{mat(k)?.name ?? k}×{fmt(n)}</span>)}
    </span>
  );
  const reachable = config.synthRecipes.filter((r) => Object.keys(r.from).some((m) => have(m) > 0));
  return (
    <div className="space-y-1.5 overflow-y-auto p-2.5">
      <p className="text-[11px] text-white/50">同一區 6 普通 → 1 稀有；上一區 2 稀有 → 下一區 3 普通；8 羽晶 → 1 星輝羽。只列出你有素材的配方。</p>
      {msg && <div className="rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200">{msg}</div>}
      {reachable.length === 0 && <p className="py-6 text-center text-xs text-white/35">目前沒有可以合成的素材</p>}
      <div className="grid gap-1.5 lg:grid-cols-2">
        {reachable.map((r) => {
          const max = Math.max(0, Math.min(...Object.entries(r.from).map(([m, n]) => Math.floor(have(m) / n)), r.gold ? Math.floor(player.gold / r.gold) : 99999));
          return (
            <div key={r.id} className="rounded-xl border border-edge bg-panel p-2 text-xs">
              <div className="flex items-center gap-1.5"><Mats m={r.from} />{r.gold ? <span className="num text-gold/80">💰{fmt(r.gold)}</span> : null}</div>
              <div className="mt-0.5 text-emerald-300">→ <Mats m={r.to} /></div>
              <div className="mt-1 flex items-center gap-1">
                <span className="num flex-1 text-[10px] text-white/40">可合成 {fmt(max)} 次</span>
                <button disabled={busy || max < 1} onClick={() => run(r, 1)} className="rounded-lg bg-white/10 px-2.5 py-1 font-bold disabled:opacity-30">×1</button>
                <button disabled={busy || max < 10} onClick={() => run(r, 10)} className="rounded-lg bg-white/10 px-2.5 py-1 font-bold disabled:opacity-30">×10</button>
                <button disabled={busy || max < 1} onClick={() => run(r, Math.min(999, max))} className="rounded-lg bg-gold px-2.5 py-1 font-bold text-ink disabled:opacity-30">全部</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
