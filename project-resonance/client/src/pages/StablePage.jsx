import { useState } from 'react';
import { fmt } from '../utils/format.js';
import MountPreview from '../components/MountPreview.jsx';

/** 馬廄·阿蹄：買坐騎、餵養升級、選出戰坐騎 */
export default function StablePage({ player, config, onBuy, onUpgrade, onEquip }) {
  const list = Object.values(config.mounts);
  const [sel, setSel] = useState(player.mount ?? list[0].id);
  const def = config.mounts[sel];
  const own = player.mounts[sel];
  const owned = Object.keys(player.mounts).length;

  return (
    <div className="flex h-full min-h-0">
      <div className="relative w-[40%] shrink-0 bg-gradient-to-b from-[#221b38] to-ink">
        <MountPreview def={def} locked={!own} equipped={player.gear} items={config.items} className="absolute inset-0" />
        <div className="pointer-events-none absolute inset-x-0 top-2 text-center">
          <div className="font-bold">{def.icon} {def.name}{own && <span className="num ml-1 text-xs text-gold">Lv.{own.lv}</span>}</div>
          <div className="px-3 text-[11px] text-white/50">{def.desc}</div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[10px] text-white/40">
          收藏 {owned}/{list.length} 隻 · 每隻攻擊 +{Math.round(config.collectAtk * 100)}%（目前 +{Math.round(owned * config.collectAtk * 100)}%）
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-2 overflow-y-auto p-3">
        {!player.inTown && (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">在野外只能切換出戰坐騎；購買、餵養要回村莊找阿蹄</p>
        )}
        <p className="text-[11px] text-white/45">
          騎乘時移動更快，也能邊騎邊砍。出戰中的坐騎就算沒騎著也有被動加成。決鬥時會自動下坐騎。
        </p>
        {list.map((m) => (
          <MountCard key={m.id} m={m} own={player.mounts[m.id]} active={player.mount === m.id} selected={sel === m.id}
            player={player} config={config} onSelect={() => setSel(m.id)}
            onBuy={() => onBuy(m.id)} onUpgrade={() => onUpgrade(m.id)}
            onEquip={() => onEquip(player.mount === m.id ? null : m.id)} />
        ))}
      </div>
    </div>
  );
}

function bonusText(bonus, affixes) {
  return Object.entries(bonus).map(([k, v]) => `${affixes[k]?.name ?? k} +${(v * 100).toFixed(v * 100 % 1 ? 1 : 0)}%`).join('、');
}

function CostLine({ cost, player, config }) {
  const parts = [];
  if (cost.gold) parts.push({ text: `💰${fmt(cost.gold)}`, ok: player.gold >= cost.gold });
  if (cost.essence) parts.push({ text: `💠${cost.essence}`, ok: player.essence >= cost.essence });
  for (const [mat, n] of Object.entries(cost.mats || {})) {
    parts.push({ text: `${config.materials[mat]?.name ?? mat} ${fmt(player.mats[mat] || 0)}/${n}`, ok: (player.mats[mat] || 0) >= n });
  }
  const all = parts.every((p) => p.ok);
  return {
    all,
    el: (
      <div className="num flex flex-wrap gap-x-2 text-[11px]">
        {parts.map((p) => <span key={p.text} className={p.ok ? 'text-white/70' : 'text-red-400'}>{p.text}</span>)}
      </div>
    ),
  };
}

function MountCard({ m, own, active, selected, player, config, onSelect, onBuy, onUpgrade, onEquip }) {
  const lv = own?.lv ?? 1;
  const cur = m.levels[lv - 1];
  const next = own && lv < config.mountMaxLv ? m.levels[lv] : null;
  const reach = m.tier > 2 || m.tier <= player.maxMap;
  const buy = !own && CostLine({ cost: m.cost, player, config });
  const up = own && cur.cost && CostLine({ cost: cur.cost, player, config });

  return (
    <div onClick={onSelect}
      className={`cursor-pointer rounded-xl border p-2.5 transition ${selected ? 'border-gold/60 bg-gold/5' : 'border-edge bg-panel'} ${!own && !reach ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2.5">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/5 text-2xl">{m.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">
            {m.name}
            {own && <span className="num ml-1.5 text-xs text-gold">Lv.{lv}/{config.mountMaxLv}</span>}
            {active && <span className="ml-1.5 rounded bg-emerald-500/25 px-1.5 text-[10px] text-emerald-200">出戰中</span>}
          </div>
          <div className="text-[11px] text-white/55">
            移速 ×{m.speed} · {bonusText(cur.bonus, config.affixes)}
            {next && <span className="text-emerald-300"> → {bonusText(next.bonus, config.affixes)}</span>}
          </div>
        </div>
        {own && (
          <button onClick={(e) => { e.stopPropagation(); onEquip(); }}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold active:scale-95 ${active ? 'border border-white/20 text-white/60' : 'bg-sky-500/80 text-ink'}`}>
            {active ? '取消出戰' : '出戰'}
          </button>
        )}
      </div>

      {!own && (
        <div className="mt-2 flex items-center gap-2 border-t border-white/5 pt-2">
          <div className="min-w-0 flex-1">{reach ? buy.el : <span className="text-[11px] text-white/40">🔒 去過「{config.maps[m.tier]?.name}」才能買</span>}</div>
          <button disabled={!player.inTown || !reach || !buy.all} onClick={(e) => { e.stopPropagation(); onBuy(); }}
            className="shrink-0 rounded-lg bg-gold px-3 py-1.5 text-xs font-bold text-ink active:scale-95 disabled:opacity-30">購買</button>
        </div>
      )}
      {own && up && (
        <div className="mt-2 flex items-center gap-2 border-t border-white/5 pt-2">
          <div className="min-w-0 flex-1"><span className="text-[10px] text-white/40">餵養升級：</span>{up.el}</div>
          <button disabled={!player.inTown || !up.all} onClick={(e) => { e.stopPropagation(); onUpgrade(); }}
            className="shrink-0 rounded-lg bg-emerald-500/80 px-3 py-1.5 text-xs font-bold text-ink active:scale-95 disabled:opacity-30">餵養</button>
        </div>
      )}
      {own && !up && <div className="mt-1.5 text-center text-[10px] text-gold/70">已達最高等級</div>}
    </div>
  );
}
