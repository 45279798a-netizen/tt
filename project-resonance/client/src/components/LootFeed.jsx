import { useEffect, useState } from 'react';
import { MatIcon } from './Icons.jsx';

/** 戰鬥畫面左側：素材拾取紀錄（伺服器實際結算的數量） */
export default function LootFeed({ events, materials }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);

  const rows = events
    .filter((e) => e.type === 'loot' && now - e.at < 6000)
    .flatMap((e) => Object.entries(e.mats).map(([id, n]) => ({ key: `${e.id}-${id}`, id, n, age: now - e.at })))
    .slice(-5);

  return (
    <div className="pointer-events-none flex flex-col gap-1">
      {rows.map((r) => {
        const m = materials[r.id];
        return (
          <div key={r.key}
            className={`loot-in flex w-fit items-center gap-1.5 rounded-full py-1 pl-1.5 pr-3 text-xs backdrop-blur
              ${m.rare ? 'bg-gold/25 text-gold' : 'bg-black/45 text-white/85'}`}
            style={{ opacity: r.age > 4500 ? 0.3 : 1, transition: 'opacity .8s' }}>
            <MatIcon mat={m} size={14} />
            <span>{m.name}</span>
            <b className="num">×{r.n}</b>
          </div>
        );
      })}
    </div>
  );
}
