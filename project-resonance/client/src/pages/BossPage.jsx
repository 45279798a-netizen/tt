import { useEffect, useState } from 'react';
import { api } from '../utils/api.js';
import { fmt } from '../utils/format.js';

/** 首領頁：世界 Boss 預留位置 + 幹話排行榜（已可運作） */
export default function BossPage({ player }) {
  const [list, setList] = useState([]);
  useEffect(() => {
    let alive = true;
    const load = () => api.leaderboard().then((d) => alive && setList(d.list)).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  return (
    <div className="space-y-3 p-4">
      <section className="rounded-2xl border border-dashed border-ember/40 bg-ember/5 p-4 text-center">
        <div className="font-bold text-ember">📜 公告：世界首領即將降臨</div>
        <p className="mt-1 text-xs text-white/45">共享血量的異步 Boss 會在後續版本開放</p>
      </section>

      <section className="rounded-2xl border border-edge bg-panel p-4">
        <h3 className="mb-2 text-xs tracking-widest text-white/45">幹話戰力榜 · PvP 戰績</h3>
        <ol className="space-y-1">
          {list.map((r, i) => (
            <li key={r.name}
              className={`flex items-center gap-3 rounded-lg px-2 py-2 text-sm ${r.name === player.name ? 'bg-gold/10' : ''}`}>
              <span className={`num w-6 text-center font-bold ${i === 0 ? 'text-gold' : i < 3 ? 'text-white/80' : 'text-white/35'}`}>{i + 1}</span>
              <span className="flex-1 truncate">{r.name}</span>
              <span className="num text-xs text-white/40">Lv.{r.level}</span>
              <span className="num w-16 text-right text-[11px] text-sky-200/80">⚔ {r.pvp?.w ?? 0}勝{r.pvp?.l ?? 0}敗</span>
              <span className="num w-20 text-right font-semibold text-gold">{fmt(r.cp)}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
