import { fmt } from '../utils/format.js';

/** 轉職殿堂·轉職導師艾琳：Lv.100 轉職，等級回到 1，換永久加成與進階稱號 */
export default function RebirthPage({ player, config, onRebirth }) {
  const R = config.rebirth;
  const n = player.rebirth || 0;
  const next = player.rebirthNext;
  const wtype = player.stats.wtype;
  const titles = R.titles[wtype] ?? R.titles.great;
  const per = R.per;
  const pct = (v) => `${Math.round(v * 1000) / 10}%`;
  const bonusRows = (k) => [
    ['攻擊 / 生命', `+${pct(per.atkPct * k)}`], ['暴擊率', `+${pct(per.critRate * k)}`], ['暴擊傷害', `+${pct(per.critDmg * k)}`],
    ['經驗獲取', `+${pct(per.expPct * k)}`], ['技能傷害', `+${pct(per.skillDmg * k)}`], ['技能冷卻', `-${pct(per.cdr * k)}`],
    ['強化上限', `+${per.enhanceCap * k}`],
  ];

  const checks = next ? [
    { text: `等級 Lv.${next.level}（目前 Lv.${player.level}）`, ok: player.level >= next.level },
    { text: `到過「${next.needMapName}」`, ok: player.maxMap >= next.needMap },
    { text: `💰 ${fmt(next.cost.gold)}`, ok: player.gold >= next.cost.gold },
    { text: `💠 ${next.cost.essence}`, ok: player.essence >= next.cost.essence },
    ...Object.entries(next.cost.mats).map(([m, k]) => ({ text: `${config.materials[m]?.name ?? m} ${fmt(player.mats[m] || 0)}/${k}`, ok: (player.mats[m] || 0) >= k })),
  ] : [];
  const ready = checks.length && checks.every((c) => c.ok);

  return (
    <div className="space-y-3 p-3 text-sm">
      <div className="rounded-xl border border-violet-300/30 bg-gradient-to-br from-violet-900/50 to-ink p-3 text-center">
        <div className="text-[11px] tracking-[0.3em] text-violet-200/60">目前</div>
        <div className="mt-1 text-2xl font-black" style={{ color: n ? R.colors[n - 1] : '#ffffff' }}>
          {n ? `${n} 轉 · ${titles[n - 1]}` : '尚未轉職'}
        </div>
        <div className="mt-1 text-xs text-white/50">{config.weaponTypes[wtype].name}職業的進階之路：{titles.join(' → ')}</div>
      </div>

      {!player.inTown && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">要回村莊北邊的轉職殿堂才能轉職</p>}

      {next ? (
        <section className="space-y-2 rounded-xl bg-white/5 p-3">
          <div className="font-bold text-violet-100">第 {next.turn} 轉 →「{titles[next.turn - 1]}」</div>
          <ul className="space-y-1 text-xs">
            {checks.map((c) => <li key={c.text} className={c.ok ? 'text-emerald-300' : 'text-red-300'}>{c.ok ? '✔' : '✘'} {c.text}</li>)}
          </ul>
          <p className="text-[11px] text-white/45">轉職後等級回到 Lv.1（等級本身的數值很小，戰力幾乎不變），升級需要的經驗變成 ×{1 + next.turn * 1.5}。獎勵：🥚寵物蛋 ×1、腳下轉職光環換色。</p>
          <button disabled={!ready || !player.inTown} onClick={onRebirth}
            className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 py-2.5 font-bold transition active:scale-[.98] disabled:opacity-35">
            🌟 進行第 {next.turn} 轉
          </button>
        </section>
      ) : (
        <p className="rounded-xl bg-white/5 p-3 text-center text-gold">已達最高 {R.max} 轉！</p>
      )}

      <section>
        <div className="mb-1 text-xs text-white/45">累積加成（目前 {n} 轉{next ? ` → 第 ${next.turn} 轉後` : ''}）</div>
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          {bonusRows(n).map(([k, v], i) => (
            <div key={k} className="flex justify-between rounded-lg bg-white/5 px-2.5 py-1.5">
              <span className="text-white/45">{k}</span>
              <span className="num font-semibold">{v}{next && <span className="text-emerald-300"> → {bonusRows(n + 1)[i][1]}</span>}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
