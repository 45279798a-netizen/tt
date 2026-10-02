import { useEffect, useRef, useState } from 'react';
import { fmt } from '../utils/format.js';
import { useCountUp } from '../hooks/useGame.js';

/** 左上角角色資訊：名字、等級、總戰力、金幣、經驗條 */
export default function HudPlayer({ player, online }) {
  const gold = useCountUp(player.gold); // 只顯示伺服器真的結算到的金幣
  const [flash, setFlash] = useState(0);
  const prevCP = useRef(player.cp);

  useEffect(() => {
    if (player.cp > prevCP.current) setFlash((f) => f + 1);
    prevCP.current = player.cp;
  }, [player.cp]);

  const expPct = Math.min(100, (player.exp / player.expToNext) * 100);

  return (
    <div className="w-48 overflow-hidden rounded-xl border border-white/10 bg-black/50 backdrop-blur">
      <div className="flex items-center gap-1.5 px-2.5 pt-1.5 text-[11px]">
        <span className={`size-1.5 shrink-0 rounded-full ${online ? 'bg-emerald-400' : 'animate-pulse bg-red-500'}`} />
        <span className="truncate font-medium">{player.name}</span>
        <span className="num ml-auto shrink-0 rounded bg-white/10 px-1">Lv.{player.level}</span>
      </div>
      <div className="flex items-end justify-between px-2.5 pb-1.5">
        <div className="leading-none">
          <div className="text-[9px] tracking-[0.25em] text-white/45">戰力</div>
          <div key={flash} className="cp-flash num text-xl font-bold text-gold">{fmt(player.cp)}</div>
        </div>
        <div className="flex flex-col items-end pb-0.5 leading-tight">
          <span className="flex items-center gap-1 text-gold"><CoinIcon className="size-3.5" /><span className="num text-xs font-semibold">{fmt(gold)}</span></span>
          <span className="num text-[10px] text-violet-300">💠{fmt(player.essence)}</span>
        </div>
      </div>
      <div className="h-1 bg-white/10">
        <div className="h-full bg-spirit transition-[width] duration-700" style={{ width: `${expPct}%` }} />
      </div>
    </div>
  );
}

export function CoinIcon({ className = 'size-4' }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden>
      <circle cx="8" cy="8" r="7" fill="currentColor" opacity=".25" />
      <circle cx="8" cy="8" r="5" fill="currentColor" />
      <path d="M8 5.5v5M6.5 7h3" stroke="#0b0a14" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
