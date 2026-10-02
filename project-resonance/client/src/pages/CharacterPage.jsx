import { useEffect, useState } from 'react';
import { fmt, fmtRate } from '../utils/format.js';
import CharacterPreview from '../components/CharacterPreview.jsx';
import { ItemIcon, setColor } from '../components/Icons.jsx';
import { GearTile, GearDetail, mainStatText } from '../components/Gear.jsx';
import { WEAPON_STYLE } from '../game3d/BattleScene.js';

/** 角色頁：左邊 3D 模型，右邊「裝備 / 技能 / 數值」 */
export default function CharacterPage({ player, config, onEquip, onLogout, onCraftWing, onUpgradeWing, onEquipWing }) {
  const [tab, setTab] = useState('gear');
  const [previewWing, setPreviewWing] = useState(null); // 翅膀頁點選時先預覽
  const wingId = tab === 'wings' && previewWing ? previewWing : player.wing;
  const wingDef = wingId ? config.wings[wingId] : null;
  const wingLv = wingId ? player.wings[wingId]?.lv ?? 1 : 1;
  return (
    <div className="flex h-full min-h-0">
      <div className="relative w-[40%] shrink-0 bg-gradient-to-b from-[#221b38] to-ink">
        <CharacterPreview equipped={player.gear} items={config.items} wing={wingDef} wingLv={wingLv} className="absolute inset-0" />
        <div className="pointer-events-none absolute inset-x-0 top-2 text-center">
          <div className="font-bold">{player.name}</div>
          <div className="num text-xs text-white/55">Lv.{player.level} · {config.weaponTypes[player.stats.wtype].name}</div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-2 text-center">
          <div className="text-[10px] tracking-[0.3em] text-white/45">戰力</div>
          <div className="num text-2xl font-bold text-gold">{fmt(player.cp)}</div>
          <div className="text-[10px] text-white/35">拖曳旋轉 · 點一下揮劍</div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 gap-1 border-b border-edge px-3 pt-2">
          {[['gear', '裝備'], ['wings', '翅膀'], ['skills', '技能'], ['stats', '數值']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`rounded-t-lg px-4 py-1.5 text-sm font-bold ${tab === id ? 'bg-panel text-gold' : 'text-white/45'}`}>{label}</button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {tab === 'gear' && <GearTab player={player} config={config} onEquip={onEquip} />}
          {tab === 'skills' && <SkillsTab player={player} config={config} />}
          {tab === 'wings' && <WingsTab player={player} config={config} preview={wingId} onPreview={setPreviewWing}
            onCraft={onCraftWing} onUpgrade={onUpgradeWing} onEquip={onEquipWing} />}
          {tab === 'stats' && <StatsTab player={player} config={config} onLogout={onLogout} />}
        </div>
      </div>
    </div>
  );
}

function GearTab({ player, config, onEquip }) {
  const { items, slots, slotLabel, sets } = config;
  const [picking, setPicking] = useState(null);
  const bonus = player.setBonus;
  return (
    <div className="space-y-1.5">
      {slots.map((slot) => {
        const inst = player.inv.find((x) => x.uid === player.equipped[slot]);
        const t = inst && items[inst.base];
        const open = picking === slot;
        const choices = player.inv.filter((x) => items[x.base].slot === slot && x.uid !== player.equipped[slot]);
        return (
          <div key={slot} className={`rounded-xl border ${open ? 'border-gold/60 bg-gold/5' : 'border-edge bg-panel'}`}>
            <button onClick={() => setPicking(open ? null : slot)} className="flex w-full items-center gap-2.5 p-2 text-left">
              {inst ? <GearTile inst={inst} config={config} /> : <ItemIcon slot={slot} size="size-11" />}
              <div className="min-w-0 flex-1">
                <div className="text-[10px] text-white/40">{slotLabel[slot]}</div>
                <div className="truncate text-sm font-semibold" style={{ color: t ? setColor(t.set) : undefined }}>
                  {t ? t.name : <span className="text-white/30">未裝備</span>}
                </div>
                {inst && <div className="num truncate text-[10px] text-white/45">{mainStatText(inst, config)}</div>}
              </div>
              <span className="flex flex-col items-end text-[10px] text-white/40">
                {choices.some((c) => c.delta > 0) && <span className="font-bold text-emerald-400">▲ 有更強的</span>}
                {choices.length ? `${choices.length} 件可換 ${open ? '▲' : '▼'}` : ''}
              </span>
            </button>
            {open && (
              <div className="space-y-1.5 border-t border-white/5 p-2">
                {choices.length === 0 && <p className="py-1 text-center text-xs text-white/40">背包裡沒有這個部位的其他裝備</p>}
                {choices
                  .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))
                  .map((c) => (
                    <button key={c.uid} onClick={() => { onEquip(c.uid); setPicking(null); }}
                      className="w-full rounded-lg bg-white/5 p-2 text-left active:scale-[.99]">
                      <GearDetail inst={c} config={config} compact />
                    </button>
                  ))}
              </div>
            )}
          </div>
        );
      })}
      <section className="rounded-xl border border-edge bg-panel p-3">
        <div className="mb-1 text-[11px] tracking-widest text-white/45">套裝效果</div>
        {bonus.set < 0 ? <p className="text-xs text-white/40">穿上同一套 3 件以上就會發動</p> : (
          <>
            <div className="text-sm font-bold" style={{ color: setColor(bonus.set) }}>{sets[bonus.set].name}套裝 · {bonus.pieces}/5 件</div>
            {sets[bonus.set].bonus.map((b) => (
              <div key={b.pieces} className={`text-xs ${bonus.pieces >= b.pieces ? 'text-emerald-300' : 'text-white/30'}`}>
                {bonus.pieces >= b.pieces ? '✔' : '○'} {b.pieces} 件：{b.text}
              </div>
            ))}
          </>
        )}
      </section>
    </div>
  );
}

/** 技能：每個職業固定 4 招（不能更換，換武器 = 換職業） */
function SkillsTab({ player, config }) {
  const cls = player.stats.wtype;
  const ids = config.classSkills[cls];
  const basic = WEAPON_STYLE[cls].basic;

  return (
    <div className="space-y-2">
      <div className="text-xs text-white/50">
        <b className="text-gold">{config.weaponTypes[cls].name}</b> 的固定技能 · 想用別的技能就換一種武器
      </div>
      <div className="flex items-center gap-2.5 rounded-xl border border-gold/30 bg-gold/5 p-2">
        <span className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-amber-500/60 to-red-700/60 text-xl">{basic.icon}</span>
        <div className="flex-1">
          <div className="text-sm font-bold">{basic.name} <span className="text-[10px] font-normal text-white/40">大按鈕</span></div>
          <div className="text-[11px] text-white/45">強力普攻，可以狂點</div>
        </div>
      </div>
      {ids.map((id, i) => {
        const s = config.skills[id];
        return (
          <div key={id} className="flex w-full items-center gap-2.5 rounded-xl border border-edge bg-panel p-2">
            <span className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-indigo-500/50 to-slate-900/70 text-xl">{s.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold">{s.name}
                <span className="num ml-2 text-[10px] font-normal text-white/40">冷卻 {s.cd} 秒{s.buff ? ' · 增益' : ''}</span>
              </div>
              <div className="text-[11px] text-white/50">{s.desc}</div>
            </div>
            <span className="grid size-6 place-items-center rounded-full bg-sky-400/80 text-xs font-bold text-ink">{i + 1}</span>
          </div>
        );
      })}
      <div className="pt-1 text-[10px] text-white/30">
        其他職業：{Object.keys(config.classSkills).filter((c) => c !== cls)
          .map((c) => `${config.weaponTypes[c].name}（${config.classSkills[c].map((k) => config.skills[k].name).join('、')}）`).join(' · ')}
      </div>
    </div>
  );
}

function StatsTab({ player, config, onLogout }) {
  const map = config.maps[player.mapId];
  const st = player.stats;
  const pct = (v) => `${(v * 100).toFixed(1)}%`;
  const rows = [
    ['攻擊', fmt(st.atk)], ['防禦', fmt(st.def)], ['生命', fmt(st.hp)], ['秒傷', fmt(st.dps)],
    ['暴擊率', pct(st.critRate)], ['暴擊傷害', pct(st.critDmg)],
    ['金幣獲取', `+${pct(st.goldPct)}`], ['經驗獲取', `+${pct(st.expPct)}`], ['素材掉落', `+${pct(st.dropPct)}`],
    ['掛機地點', map.name], ['擊殺/秒', fmtRate(player.rates.killsPerSec)], ['金幣/秒', fmt(player.rates.goldPerSec)],
    ['累積擊殺', fmt(player.totalKills)], ['PvP', `${player.pvp.w} 勝 ${player.pvp.l} 敗`],
  ];
  return (
    <div className="space-y-3">
      <section className="grid grid-cols-2 gap-1.5 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between rounded-lg bg-white/5 px-2.5 py-2">
            <span className="text-white/45">{k}</span><span className="num font-semibold">{v}</span>
          </div>
        ))}
      </section>
      <button onClick={onLogout} className="w-full rounded-xl border border-red-400/30 py-2 text-sm text-red-300 active:scale-[.98]">登出帳號</button>
    </div>
  );
}

/** 翅膀：純外觀，用世界王掉的「羽晶 / 星輝羽」製作、升級 */
function WingsTab({ player, config, preview, onPreview, onCraft, onUpgrade, onEquip }) {
  const has = (m) => player.mats[m] || 0;
  const hasMaxWing = Object.values(player.wings || {}).some((o) => o.lv >= config.wingMaxLv);
  const costText = (cost) => [
    ...Object.entries(cost.mats).map(([m, n]) => (
      <span key={m} className={has(m) >= n ? 'text-white/70' : 'text-red-400'}>{config.materials[m].name} {fmt(has(m))}/{n}</span>
    )),
    cost.essence ? <span key="ess" className={player.essence >= cost.essence ? 'text-white/70' : 'text-red-400'}>💠精華 {fmt(player.essence)}/{cost.essence}</span> : null,
  ];
  const canPay = (cost) => Object.entries(cost.mats).every(([m, n]) => has(m) >= n) && player.essence >= (cost.essence || 0);
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-white/45">
        配戴中的翅膀有<b className="text-emerald-300">攻擊、生命加成</b>（Lv.10 再加金幣、掉落），每收藏一對翅膀攻擊再 +{Math.round((config.wingCollectAtk || 0) * 100)}%。素材 <b className="text-violet-300">羽晶</b>、<b className="text-gold">星輝羽</b> 只有打倒<b className="text-red-300">世界王</b>才會掉。
        等級越高越華麗：Lv.4 發光邊、Lv.7 變大＋飄光點、Lv.10 光環。
      </p>
      <div className="num text-xs text-white/60">持有：羽晶 {fmt(has('wf'))} · 星輝羽 {fmt(has('wr'))}</div>
      {Object.values(config.wings).map((w) => {
        const own = player.wings[w.id];
        const lv = own?.lv ?? 0;
        const next = own && lv < config.wingMaxLv ? w.levels[lv - 1].cost : null;
        const worn = player.wing === w.id;
        return (
          <div key={w.id} onClick={() => onPreview(w.id)}
            className={`cursor-pointer rounded-xl border p-2.5 ${preview === w.id ? 'border-gold/60 bg-gold/5' : 'border-edge bg-panel'}`}>
            <div className="flex items-center gap-2.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/5 text-xl" style={{ boxShadow: own ? `0 0 12px ${w.accent}55` : 'none' }}>{w.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold">{w.name}
                  {own && <span className="num ml-1.5 text-xs text-gold">Lv.{lv}/{config.wingMaxLv}</span>}
                  {worn && <span className="ml-1.5 rounded bg-emerald-500/25 px-1.5 text-[10px] text-emerald-200">配戴中</span>}
                  <span className="ml-1.5 text-[10px] text-white/35">{'★'.repeat(w.rank)}</span>
                </div>
                <div className="text-[11px] text-white/45">{w.desc}</div>
                <div className="text-[11px] text-emerald-300/90">
                  {Object.entries(w.levels[Math.max(0, lv - 1)].bonus).map(([k, v]) => `${config.affixes[k]?.name ?? k}+${Math.round(v * 100)}%`).join(' ')}
                  {own && lv < config.wingMaxLv && <span className="text-white/40"> → {Object.entries(w.levels[lv].bonus).map(([k, v]) => `${config.affixes[k]?.name ?? k}+${Math.round(v * 100)}%`).join(' ')}</span>}
                </div>
              </div>
              {own && (
                <button onClick={(e) => { e.stopPropagation(); onEquip(worn ? null : w.id); }}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold active:scale-95 ${worn ? 'border border-white/20 text-white/60' : 'bg-sky-500/80 text-ink'}`}>
                  {worn ? '拿下' : '配戴'}
                </button>
              )}
            </div>
            {(!own || next) && (
              <div className="mt-2 flex items-center gap-2 border-t border-white/5 pt-2">
                <div className="num flex min-w-0 flex-1 flex-wrap gap-x-2 text-[11px]">
                  <span className="text-white/40">{own ? '升級：' : '製作：'}</span>{costText(own ? next : w.cost)}
                </div>
                {!own && w.requireMaxWing && !hasMaxWing && <span className="text-[10px] text-amber-300">需要一對 Lv.{config.wingMaxLv} 翅膀</span>}
                <button disabled={!canPay(own ? next : w.cost) || (!own && w.requireMaxWing && !hasMaxWing)} onClick={(e) => { e.stopPropagation(); (own ? onUpgrade : onCraft)(w.id); }}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold text-ink active:scale-95 disabled:opacity-30 ${own ? 'bg-emerald-500/80' : 'bg-gold'}`}>
                  {own ? '升級' : '製作'}
                </button>
              </div>
            )}
            {own && !next && <div className="mt-1.5 text-center text-[10px] text-gold/70">已達最高等級</div>}
          </div>
        );
      })}
    </div>
  );
}
