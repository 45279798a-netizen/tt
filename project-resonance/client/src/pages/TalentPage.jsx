import { fmt } from '../utils/format.js';

/** 天賦樹：三條分支，每條 4 層；上一層投入夠多點才解鎖下一層 */
export default function TalentPage({ player, config, onLearn, onReset }) {
  const T = config.talents, B = config.talentBranches, REQ = config.talentTierReq;
  const left = player.talentPoints - player.talentSpent;
  const spentIn = (br) => Object.entries(player.talents || {}).reduce((n, [id, v]) => n + (T[id]?.branch === br ? v : 0), 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2 text-xs">
        <span className="rounded-lg bg-gold/20 px-2 py-1 font-bold text-gold">天賦點 {left} / {player.talentPoints}</span>
        <span className="text-white/45">每 4 級 1 點，轉職一次 +25 點（轉職後點數不會消失）</span>
        <button onClick={() => { if (window.confirm(`花 💰${fmt(player.talentResetCost)} 重置全部天賦？`)) onReset(); }}
          className="ml-auto rounded-lg border border-white/20 px-2.5 py-1 text-white/70 active:scale-95">重置（💰{fmt(player.talentResetCost)}）</button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-2 overflow-y-auto p-2">
        {Object.entries(B).map(([br, info]) => {
          const spent = spentIn(br);
          return (
            <div key={br} className="flex flex-col gap-1.5 rounded-xl border p-2" style={{ borderColor: `${info.color}55`, background: `${info.color}0d` }}>
              <div className="text-center text-sm font-black" style={{ color: info.color }}>{info.name} <span className="num text-xs font-normal text-white/50">· {spent} 點</span></div>
              {REQ.map((need, tier) => (
                <div key={tier} className={`space-y-1 ${spent >= need ? '' : 'opacity-40'}`}>
                  {tier > 0 && <div className="text-center text-[9px] text-white/35">— 投入 {need} 點解鎖 —</div>}
                  {Object.entries(T).filter(([, t]) => t.branch === br && t.tier === tier).map(([id, t]) => {
                    const lv = player.talents?.[id] || 0;
                    const can = left > 0 && lv < t.max && spent >= need;
                    return (
                      <button key={id} disabled={!can} onClick={() => onLearn(id)}
                        className={`flex w-full items-center gap-1.5 rounded-lg border px-1.5 py-1.5 text-left transition active:scale-[.97] ${lv ? 'border-white/30 bg-white/10' : 'border-white/10 bg-black/30'} ${can ? 'ring-1 ring-gold/50' : ''}`}>
                        <span className="text-lg leading-none">{t.icon}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11px] font-bold">{t.name}</span>
                          <span className="block truncate text-[9px] text-white/50">{t.desc}</span>
                        </span>
                        <span className="num shrink-0 text-[10px]" style={{ color: lv >= t.max ? info.color : '#ffffff99' }}>{lv}/{t.max}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
