import { useState } from 'react';
import { fmt } from '../utils/format.js';

const rewardText = (r, config) => [
  r.essence && `💠${r.essence}`, r.gold && `💰${fmt(r.gold)}`, r.eggs && `🥚×${r.eggs}`,
  ...Object.entries(r.mats || {}).map(([m, n]) => `${config.materials[m]?.name ?? m}×${n}`),
  r.points && `成就點 +${r.points}`,
].filter(Boolean).join('、');

/** 任務：每日任務 + 成就 */
export default function QuestPage({ player, config, onClaimDaily, onChest, onClaimAchieve }) {
  const [tab, setTab] = useState('daily');
  const d = player.daily, A = player.achieve;
  const allClaimed = d.quests.every((q) => q.claimed);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex gap-1 border-b border-white/10 p-2">
        {[['daily', `📅 每日任務${player.badges.daily ? ` (${player.badges.daily})` : ''}`], ['achieve', `🏆 成就${player.badges.achieve ? ` (${player.badges.achieve})` : ''}`]].map(([id, t]) => (
          <button key={id} onClick={() => setTab(id)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${tab === id ? 'bg-gold text-ink' : 'bg-white/5 text-white/60'}`}>{t}</button>
        ))}
        {tab === 'achieve' && <span className="ml-auto self-center text-[11px] text-white/50">成就點 {A.points} · 攻擊、生命 +{(A.bonus * 100).toFixed(1)}%</span>}
      </div>

      {tab === 'daily' ? (
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
          <p className="text-[11px] text-white/45">每天台灣時間 0 點換新的 5 個任務。每個獎勵：{rewardText(d.reward, config)}</p>
          {d.quests.map((q) => {
            const done = q.prog >= q.target;
            return (
              <div key={q.i} className="flex items-center gap-2.5 rounded-xl bg-white/5 p-2.5">
                <span className="text-xl">{q.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold">{q.name} <span className="num text-xs font-normal text-white/50">{fmt(q.prog)} / {fmt(q.target)}</span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${(q.prog / q.target) * 100}%` }} /></div>
                </div>
                {q.claimed ? <span className="text-xs text-white/35">已領</span>
                  : <button disabled={!done} onClick={() => onClaimDaily(q.i)} className="rounded-lg bg-gold px-3 py-1.5 text-xs font-bold text-ink active:scale-95 disabled:opacity-30">領取</button>}
              </div>
            );
          })}
          <div className="flex items-center gap-2.5 rounded-xl border border-gold/40 bg-gold/10 p-2.5">
            <span className="text-2xl">🎁</span>
            <div className="min-w-0 flex-1 text-xs"><b className="text-gold">每日寶箱</b>：5 個任務都領完就能開<br /><span className="text-white/55">{rewardText(d.chestReward, config)}</span></div>
            {d.chest ? <span className="text-xs text-white/35">已開</span>
              : <button disabled={!allClaimed} onClick={onChest} className="rounded-lg bg-gold px-3 py-1.5 text-xs font-bold text-ink active:scale-95 disabled:opacity-30">開啟</button>}
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
          <p className="text-[11px] text-white/45">一輩子的目標。每一階都能領獎勵和成就點，每 10 成就點永久攻擊、生命 +0.2%。</p>
          {A.list.map((a) => (
            <div key={a.id} className="rounded-xl bg-white/5 p-2.5">
              <div className="flex items-center gap-2 text-sm font-bold">{a.icon} {a.name}<span className="num ml-auto text-xs font-normal text-white/50">目前 {fmt(a.value)} {a.unit}</span></div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {a.tiers.map((t, i) => (
                  <button key={i} disabled={!t.done || t.claimed} onClick={() => onClaimAchieve(a.id, i)} title={rewardText(t.reward, config)}
                    className={`num rounded-lg border px-2 py-1 text-[11px] ${t.claimed ? 'border-emerald-400/40 text-emerald-300' : t.done ? 'border-gold bg-gold/20 font-bold text-gold active:scale-95' : 'border-white/10 text-white/40'}`}>
                    {t.claimed ? '✔ ' : ''}{t.label ?? `${fmt(t.target)} ${a.unit}`}{t.done && !t.claimed ? ' 領取' : ''}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
