import { fmt } from '../utils/format.js';

/**
 * 夥伴：只能在村莊的「酒館」招募、叫她出門或留下
 * 右上角「夥伴」按鈕看狀態；酒館老闆那裡才能操作
 */
export default function PartnerPage({ player, config, atTavern, onRecruit, onDeploy, onUpgrade }) {
  const list = Object.values(config.partners || {});
  const canAct = atTavern && player.inTown;
  return (
    <div className="space-y-3 overflow-y-auto p-4">
      <p className="text-xs text-white/50">
        {atTavern ? '🍺 歡迎來到酒館！在這裡招募夥伴、帶一位跟你出門冒險（有被動加成），其他的留在店裡休息。'
          : '夥伴平常待在村莊的酒館；要招募、帶出門或留下，請回村莊找酒館老闆·大熊。'}
      </p>
      {list.map((d) => {
        const own = !!player.partners?.[d.id];
        const out = player.partnerOut === d.id;
        const costOk = player.gold >= (d.cost.gold || 0) && player.essence >= (d.cost.essence || 0);
        const locked = (player.maxMap || 0) < (d.reqMap || 0);
        const lv = player.partners?.[d.id]?.lv ?? 1;
        const maxed = lv >= config.partnerMaxLv;
        const up = config.partnerCosts[lv - 1];
        const upOk = up && player.gold >= up.gold && player.essence >= up.essence;
        const dmg = d.dmg.base + d.dmg.per * (lv - 1);
        return (
          <div key={d.id} className={`rounded-xl border p-3 ${locked && !own ? 'opacity-55' : ''}`} style={{ borderColor: `${d.color ?? '#ff7ab8'}55`, background: `${d.color ?? '#ff7ab8'}0d` }}>
            <div className="flex items-center gap-3">
              <span className="grid size-14 shrink-0 place-items-center rounded-2xl text-3xl" style={{ background: `${d.color ?? '#ff7ab8'}26` }}>{d.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="font-bold">{d.name}{own && <span className="num ml-1.5 text-sm text-gold">Lv.{lv}/{config.partnerMaxLv}</span>}
                  {own && <span className={`ml-2 rounded px-1.5 text-[10px] ${out ? 'bg-emerald-500/25 text-emerald-200' : 'bg-white/10 text-white/60'}`}>{out ? '一起戰鬥中' : '在酒館休息'}</span>}
                </div>
                <div className="text-[11px] text-white/55">{d.desc}</div>
              </div>
            </div>
            <div className="mt-2 rounded-lg bg-black/25 px-2 py-1.5 text-[11px] text-white/70">⚔️ 普攻：你的傷害 ×{Math.round(dmg * 100)}%，範圍攻擊 · 招式傷害 ×{(1 + lv * 0.05).toFixed(2)}{d.passiveText && <span className="ml-1 text-emerald-300">· 帶出門：{d.passiveText}</span>}</div>
            <div className="mt-1.5 space-y-1">
              {d.skills.map((k) => {
                const open = !own ? k.unlock <= 1 : lv >= k.unlock;
                return (
                  <div key={k.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] ${open ? 'bg-pink-500/10 text-white/80' : 'bg-black/20 text-white/35'}`}>
                    <span className="font-bold">{open ? '✦' : '🔒'} {k.name}</span>
                    <span className="flex-1 truncate">{k.desc}</span>
                    <span className="num shrink-0">{open ? `每 ${k.cd} 秒` : `Lv.${k.unlock} 解鎖`}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              {!own && (
                locked ? <span className="self-center text-xs text-white/45">🔒 到過「{config.maps[d.reqMap].name}」才能招募</span> : (
                <button disabled={!canAct || !costOk} onClick={() => onRecruit(d.id)}
                  className="rounded-lg bg-pink-400 px-4 py-2 text-sm font-bold text-ink active:scale-95 disabled:opacity-30">
                  招募（💰{fmt(d.cost.gold)}{d.cost.essence ? ` · 💠${d.cost.essence}` : ''}）
                </button>)
              )}
              {own && !maxed && (
                <button disabled={!canAct || !upOk} onClick={() => onUpgrade(d.id)}
                  className="rounded-lg bg-gold px-3 py-2 text-xs font-bold text-ink active:scale-95 disabled:opacity-30">
                  培養（💰{fmt(up.gold)} · 💠{up.essence}）
                </button>
              )}
              {own && (
                <button disabled={!canAct} onClick={() => onDeploy(out ? null : d.id)}
                  className={`rounded-lg px-4 py-2 text-sm font-bold active:scale-95 disabled:opacity-30 ${out ? 'border border-white/25 text-white/70' : 'bg-emerald-400 text-ink'}`}>
                  {out ? '留在酒館' : '一起出門'}
                </button>
              )}
            </div>
            {!canAct && <div className="mt-1 text-right text-[10px] text-white/35">要在村莊的酒館才能操作</div>}
          </div>
        );
      })}
    </div>
  );
}
