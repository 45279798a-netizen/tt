import { useState } from 'react';
import { fmt } from '../utils/format.js';

const RARITY = { 1: ['普通', 'text-white/60'], 2: ['稀有', 'text-sky-300'], 3: ['傳說', 'text-amber-300'] };

/** 寵物：買蛋 / 孵蛋、餵養升級、選出戰寵物 */
export default function PetPage({ player, config, onPet }) {
  const [hatched, setHatched] = useState(null);
  const pets = Object.values(config.pets);
  const hatch = async () => { const r = await onPet('petHatch'); if (r) setHatched(r); };
  return (
    <div className="space-y-3 overflow-y-auto p-3">
      <div className="flex items-center gap-3 rounded-xl border border-amber-300/30 bg-amber-500/5 p-3">
        <span className="text-4xl">🥚</span>
        <div className="flex-1 text-xs text-white/60">
          <div className="text-base font-bold text-white">寵物蛋 × {player.eggs || 0}</div>
          世界王（第一名必得、其他人 35%）、首領突襲（每人 1 顆）、魔物潮（擊殺 150 以上）會掉
        </div>
        <div className="flex flex-col gap-1.5">
          <button onClick={() => onPet('petBuy')} disabled={player.gold < player.eggPrice} className="num rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold disabled:opacity-30">買蛋 💰{fmt(player.eggPrice)}</button>
          <button onClick={hatch} disabled={!player.eggs} className="rounded-lg bg-gold px-3 py-1.5 text-xs font-bold text-ink active:scale-95 disabled:opacity-30">孵化！</button>
        </div>
      </div>
      {hatched && (
        <div className="toast-pop rounded-xl border border-gold/60 bg-gold/10 p-3 text-center">
          <div className="text-4xl">{config.pets[hatched.id].icon}</div>
          <div className="font-bold">{hatched.dup ? `又孵出 ${config.pets[hatched.id].name}！升到 ${hatched.star} 星` : `孵出新寵物：${config.pets[hatched.id].name}！`}</div>
          <div className={`text-xs ${RARITY[config.pets[hatched.id].rarity][1]}`}>{RARITY[config.pets[hatched.id].rarity][0]}</div>
        </div>
      )}
      <p className="text-[11px] text-white/45">出戰中的寵物會跟在你身邊並提供加成；重複孵到同一隻會升星（每星加成 +20%，最多 {config.petMaxStar} 星）；餵養可升到 Lv.{config.petMaxLv}。</p>
      <div className="grid grid-cols-2 gap-2">
        {pets.map((d) => {
          const own = player.pets?.[d.id];
          const lv = own?.lv ?? 1;
          const star = own?.star ?? 0;
          const cost = own && lv < config.petMaxLv ? d.levels[lv - 1].cost : null;
          const bonus = Object.entries(d.levels[lv - 1].bonus).map(([k, v]) => `${config.affixes[k]?.name ?? k}+${(v * 100 * (1 + star * 0.2)).toFixed(1)}%`).join(' ');
          const active = player.pet === d.id;
          return (
            <div key={d.id} className={`rounded-xl border p-2.5 ${active ? 'border-gold/70 bg-gold/5' : 'border-edge bg-panel'} ${own ? '' : 'opacity-45'}`}>
              <div className="flex items-center gap-2">
                <span className="text-3xl" style={{ filter: own ? 'none' : 'grayscale(1) brightness(.5)' }}>{d.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold">{d.name}</div>
                  <div className="text-[10px]"><span className={RARITY[d.rarity][1]}>{RARITY[d.rarity][0]}</span>{own && <span className="num ml-1 text-gold">Lv.{lv} {'★'.repeat(star)}</span>}</div>
                </div>
              </div>
              <div className="mt-1 text-[11px] text-emerald-300/90">{bonus}</div>
              {own ? (
                <div className="mt-1.5 flex gap-1">
                  <button onClick={() => onPet('petEquip', active ? null : d.id)} className={`flex-1 rounded-lg px-2 py-1 text-[11px] font-bold ${active ? 'border border-white/20 text-white/60' : 'bg-sky-500/80 text-ink'}`}>{active ? '休息' : '出戰'}</button>
                  {cost && <button onClick={() => onPet('petFeed', d.id)} disabled={player.gold < cost.gold || player.essence < cost.essence} className="num flex-1 rounded-lg bg-emerald-500/80 px-2 py-1 text-[10px] font-bold text-ink disabled:opacity-30">餵養 💰{fmt(cost.gold)}·💠{cost.essence}</button>}
                </div>
              ) : <div className="mt-1.5 text-center text-[10px] text-white/40">孵蛋取得</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
