import { useState } from 'react';
import { fmt } from '../utils/format.js';
import { ItemIcon, MatIcon, setColor } from '../components/Icons.jsx';
import { CoinIcon } from '../components/HudPlayer.jsx';
import { GearPicker, GearDetail, GearCompare, Essence, mainStatText } from '../components/Gear.jsx';

/** 鍛造師·鐵錘：製作（每次隨機數值）/ 強化 / 洗鍊 */
export default function ForgePage({ player, config, onCraft, onEnhance, onReroll, onEquip }) {
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
        {tab === 'craft' && <CraftTab player={player} config={config} onCraft={onCraft} onEquip={onEquip} />}
        {tab === 'enhance' && <UpgradeTab mode="enhance" player={player} config={config} onAct={onEnhance} />}
        {tab === 'synth' && <SynthTab player={player} config={config} />}
      {tab === 'reroll' && <UpgradeTab mode="reroll" player={player} config={config} onAct={onReroll} />}
      </div>
    </div>
  );
}

function CraftTab({ player, config, onCraft, onEquip }) {
  const { sets, items, materials, slots } = config;
  const [setId, setSetId] = useState(Math.min(player.mapId, player.maxMap));
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = sets[setId];
  const color = setColor(setId);
  const list = Object.values(items).filter((x) => x.set === setId)
    .sort((a, b) => slots.indexOf(a.slot) - slots.indexOf(b.slot));

  const craft = async (base) => {
    setBusy(true);
    const inst = await onCraft(base);
    setBusy(false);
    if (inst && inst !== true) setResult(inst);
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="w-32 shrink-0 space-y-1 overflow-y-auto border-r border-edge p-2">
        {sets.map((s) => {
          const seen = s.id <= player.maxMap;
          return (
            <button key={s.id} disabled={!seen} onClick={() => setSetId(s.id)}
              className={`w-full rounded-lg px-2 py-1.5 text-left transition disabled:opacity-30 ${setId === s.id ? 'bg-white/10' : 'enabled:hover:bg-white/5'}`}>
              <div className="truncate text-xs font-bold" style={{ color: seen ? setColor(s.id) : undefined }}>{seen ? s.monster : '？？？'}</div>
              <div className="text-[10px] text-white/40">{seen ? `${s.name}系列` : '尚未遭遇'}</div>
            </button>
          );
        })}
      </div>

      <div className="min-w-0 flex-1 space-y-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] text-white/40">素材來源</div>
            <div className="font-bold" style={{ color }}>{set.monster}</div>
          </div>
          <div className="flex gap-3 text-xs">
            {set.mats.map((id) => (
              <span key={id} className="flex items-center gap-1.5">
                <MatIcon mat={materials[id]} size={14} />
                <span className={materials[id].rare ? 'text-gold' : 'text-white/70'}>{materials[id].name}</span>
                <b className="num">{fmt(player.mats[id] || 0)}</b>
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-lg bg-white/5 px-3 py-1.5 text-[11px] text-white/55">
          每次鍛造都會骰出不同數值：
          {config.grades.map((g) => <span key={g.id} className="ml-1.5" style={{ color: g.color }}>{g.name} {g.chance < 0.01 ? (g.chance * 100).toFixed(1) : Math.round(g.chance * 100)}%{g.weaponOnly ? '（武器限定）' : ''}</span>)}
          ，不滿意可以一直鍛造再分解。
        </div>

        {list.map((it) => {
          const matOk = Object.entries(it.recipe).every(([m, n]) => (player.mats[m] || 0) >= n);
          const goldOk = player.gold >= it.gold;
          const made = player.codex.includes(it.id);
          const have = player.inv.filter((x) => x.base === it.id).length;
          return (
            <div key={it.id} className="flex items-center gap-3 rounded-xl border border-edge bg-panel p-2.5">
              <ItemIcon item={it} size="size-11" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-bold" style={{ color }}>{it.name}</span>
                  <span className="text-[10px] text-white/35">{it.wtype ? config.weaponTypes[it.wtype].name : config.slotLabel[it.slot]}</span>
                  {made && <span className="text-[10px] text-emerald-300">圖鑑✔</span>}
                  {have > 0 && <span className="text-[10px] text-white/40">背包 ×{have}</span>}
                </div>
                <div className="num text-[11px] text-white/55">
                  基礎 {it.slot === 'weapon' ? `攻擊 ${fmt(it.atk)}` : `防禦 ${fmt(it.def)} · 生命 ${fmt(it.hp)}`}（±15%）
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px]">
                  {Object.entries(it.recipe).map(([m, n]) => {
                    const h = player.mats[m] || 0;
                    return (
                      <span key={m} className={`num flex items-center gap-1 ${h >= n ? 'text-white/70' : 'text-red-400'}`}>
                        <MatIcon mat={materials[m]} size={11} />{fmt(Math.min(h, n))}/{fmt(n)}
                      </span>
                    );
                  })}
                  <span className={`num flex items-center gap-0.5 ${goldOk ? 'text-gold/80' : 'text-red-400'}`}><CoinIcon className="size-3" />{fmt(it.gold)}</span>
                </div>
              </div>
              <button disabled={busy || !matOk || !goldOk} onClick={() => craft(it.id)}
                className="rounded-xl bg-gold px-4 py-2.5 text-sm font-bold text-ink transition active:scale-95 disabled:bg-white/10 disabled:text-white/35">
                鍛造
              </button>
            </div>
          );
        })}
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
              <button onClick={() => { const b = result.base; setResult(null); craft(b); }}
                className="rounded-xl bg-gold py-2.5 text-sm font-bold text-ink">再鍛造一次</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UpgradeTab({ mode, player, config, onAct }) {
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
              {maxed ? '已達上限' : enh ? '強化' : '洗鍊'}
            </button>
            {player.essence < (cost?.essence ?? 0) && <p className="text-center text-[10px] text-white/40">精華不夠？到背包分解不要的裝備</p>}
          </div>
        )}
      </div>
    </div>
  );
}

/** 素材合成：同區 普通→稀有、上一區稀有→下一區普通、羽晶→星輝羽 */
function SynthTab({ player, config }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const name = (m) => config.materials[m]?.name ?? m;
  const have = (m) => Math.floor(player.mats[m] || 0);
  const run = async (r, times) => {
    setBusy(true); setMsg('');
    try {
      const { api } = await import('../utils/api.js');
      await api.synth(r.id, times);
      setMsg(`✅ 合成成功：${Object.entries(r.to).map(([k, v]) => `${name(k)} ×${v * times}`).join('、')}（下次同步更新數量）`);
    } catch (e) { setMsg(`❌ ${e.message}`); }
    setBusy(false);
  };
  const reachable = config.synthRecipes.filter((r) => Object.keys(r.from).some((m) => have(m) > 0) || Object.keys(r.to).some((m) => have(m) > 0));
  return (
    <div className="space-y-2 overflow-y-auto p-3">
      <p className="text-[11px] text-white/50">素材不夠時可以合成：同一區 6 個普通 → 1 個稀有；上一區 2 個稀有 → 下一區 3 個普通；8 羽晶 → 1 星輝羽。</p>
      {msg && <div className="rounded-lg bg-white/5 px-3 py-2 text-xs">{msg}</div>}
      {reachable.map((r) => {
        const max = Math.min(...Object.entries(r.from).map(([m, n]) => Math.floor(have(m) / n)), r.gold ? Math.floor(player.gold / r.gold) : 9999);
        return (
          <div key={r.id} className="flex items-center gap-2 rounded-xl border border-edge bg-panel p-2.5 text-xs">
            <div className="min-w-0 flex-1">
              <div className="num">{Object.entries(r.from).map(([m, n]) => `${name(m)} ×${n}`).join(' + ')}{r.gold ? ` + 💰${fmt(r.gold)}` : ''}</div>
              <div className="num text-emerald-300">→ {Object.entries(r.to).map(([m, n]) => `${name(m)} ×${n}`).join('、')}</div>
              <div className="text-[10px] text-white/40">可合成 {Math.max(0, max)} 次</div>
            </div>
            <button disabled={busy || max < 1} onClick={() => run(r, 1)} className="rounded-lg bg-white/10 px-3 py-1.5 font-bold disabled:opacity-30">×1</button>
            <button disabled={busy || max < 10} onClick={() => run(r, 10)} className="rounded-lg bg-white/10 px-3 py-1.5 font-bold disabled:opacity-30">×10</button>
            <button disabled={busy || max < 1} onClick={() => run(r, max)} className="rounded-lg bg-gold px-3 py-1.5 font-bold text-ink disabled:opacity-30">全部</button>
          </div>
        );
      })}
    </div>
  );
}
