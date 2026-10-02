import { fmt } from '../utils/format.js';
import { ItemIcon, setColor } from './Icons.jsx';

/** 主屬性倍率（跟伺服器 gear.js 的 mainMul 一樣） */
export function mainMul(inst, config) {
  return inst.q * (1 + config.grades[inst.grade].mainBonus) * (1 + inst.lv * config.enhancePerLv);
}

export const gradeOf = (inst, config) => config.grades[inst.grade];

/** 主屬性文字：武器顯示攻擊，防具顯示防禦 / 生命 */
export function mainStatText(inst, config, lvOverride) {
  const t = config.items[inst.base];
  const m = mainMul({ ...inst, lv: lvOverride ?? inst.lv }, config);
  return t.slot === 'weapon' ? `攻擊 ${fmt(t.atk * m)}` : `防禦 ${fmt(t.def * m)} · 生命 ${fmt(t.hp * m)}`;
}

/** 戰力變化箭頭：穿上後總戰力會 +/- 多少 */
export function DeltaTag({ delta, className = '' }) {
  if (delta == null || delta === 0) return null;
  const up = delta > 0;
  return (
    <span className={`num font-bold ${up ? 'text-emerald-400' : 'text-red-400'} ${className}`}>
      {up ? '▲' : '▼'}{fmt(Math.abs(delta))}
    </span>
  );
}

/** 小方塊：圖示 + 品質外框 + 強化等級 + 鎖 + 單件戰力 + 跟身上比較 */
export function GearTile({ inst, config, selected, worn, onClick }) {
  const g = gradeOf(inst, config);
  const t = config.items[inst.base];
  return (
    <button onClick={onClick}
      className={`relative flex w-[60px] flex-col items-center rounded-xl border-2 px-0.5 pb-0.5 pt-0.5 transition active:scale-95 ${selected ? 'ring-2 ring-white' : ''}`}
      style={{ borderColor: g.color, background: `${g.color}14` }}>
      <ItemIcon item={t} size="size-11" />
      <span className="num -mt-0.5 text-[10px] font-bold leading-tight text-gold">⚔{fmt(inst.power ?? 0)}</span>
      {!worn && inst.delta !== 0 && (
        <span className={`num absolute -left-1 -top-1.5 rounded px-0.5 text-[10px] font-bold leading-tight ${inst.delta > 0 ? 'bg-emerald-500 text-ink' : 'bg-red-500/80 text-white'}`}>
          {inst.delta > 0 ? '▲' : '▼'}
        </span>
      )}
      {inst.lv > 0 && <span className="num absolute -right-1 -top-1 rounded bg-ink px-1 text-[10px] font-bold text-gold">+{inst.lv}</span>}
      {worn && <span className="absolute -left-1 -top-1.5 rounded bg-emerald-500 px-1 text-[9px] font-bold text-ink">穿</span>}
      {inst.lock && <span className="absolute -bottom-1 -right-1 text-[11px]">🔒</span>}
    </button>
  );
}

/** 裝備詳細：名稱、品質、主屬性、附加屬性 */
export function GearDetail({ inst, config, compact = false }) {
  const g = gradeOf(inst, config);
  const t = config.items[inst.base];
  const wtName = t.wtype ? config.weaponTypes[t.wtype].name : config.slotLabel[t.slot];
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2.5">
        <div className="rounded-xl border-2 p-0.5" style={{ borderColor: g.color }}><ItemIcon item={t} size={compact ? 'size-10' : 'size-12'} /></div>
        <div className="min-w-0">
          <div className="truncate font-bold" style={{ color: setColor(t.set) }}>
            {t.name}{inst.lv > 0 && <span className="num ml-1 text-gold">+{inst.lv}</span>}
          </div>
          <div className="text-[11px]">
            <span className="font-bold" style={{ color: g.color }}>{g.name}</span>
            <span className="text-white/40"> · {wtName} · 數值浮動 {Math.round(inst.q * 100)}%</span>
          </div>
        </div>
      </div>
      {inst.power != null && (
        <div className="flex items-baseline gap-2 rounded-lg bg-gold/10 px-2.5 py-1">
          <span className="text-[11px] text-white/50">裝備戰力</span>
          <span className="num text-lg font-bold text-gold">{fmt(inst.power)}</span>
          <DeltaTag delta={inst.delta} className="ml-auto text-xs" />
        </div>
      )}
      <div className="num rounded-lg bg-white/5 px-2.5 py-1.5 text-sm font-semibold">{mainStatText(inst, config)}</div>
      <div className="space-y-0.5">
        {inst.aff.map((a, i) => {
          const def = config.affixes[a.k];
          const pct = (a.v - def.min) / (def.max - def.min);
          return (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="text-white/60">◆ {def.name}</span>
              <span className="num font-bold" style={{ color: pct > 0.8 ? '#ffae3d' : pct > 0.5 ? '#5fa8ff' : '#e6e1f0' }}>+{a.v}{def.unit}</span>
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                <span className="block h-full rounded-full bg-white/40" style={{ width: `${Math.max(8, pct * 100)}%` }} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const SORTS = [['power', '戰力'], ['delta', '提升'], ['set', '階級'], ['grade', '品質']];

/** 背包裡的裝備清單（可依部位篩選、排序） */
export function GearPicker({ player, config, selected, onSelect, filter, sort = 'power' }) {
  const worn = new Set(Object.values(player.equipped));
  const key = {
    power: (a, b) => (b.power ?? 0) - (a.power ?? 0),
    delta: (a, b) => (b.delta ?? 0) - (a.delta ?? 0),
    set: (a, b) => (config.items[b.base].set - config.items[a.base].set) || (b.grade - a.grade) || (b.lv - a.lv),
    grade: (a, b) => (b.grade - a.grade) || (b.power ?? 0) - (a.power ?? 0),
  }[sort];
  const list = player.inv
    .filter((it) => !filter || filter(it))
    .sort((a, b) => (worn.has(b.uid) - worn.has(a.uid)) || key(a, b));
  if (!list.length) return <p className="py-6 text-center text-xs text-white/35">背包裡沒有裝備</p>;
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {list.map((it) => (
        <GearTile key={it.uid} inst={it} config={config} selected={selected === it.uid} worn={worn.has(it.uid)} onClick={() => onSelect(it.uid)} />
      ))}
    </div>
  );
}

/** 裝備比對：這件 vs 同部位身上那件 */
export function GearCompare({ inst, player, config }) {
  const t = config.items[inst.base];
  const curUid = player.equipped[t.slot];
  const cur = curUid && curUid !== inst.uid ? player.inv.find((x) => x.uid === curUid) : null;
  if (curUid === inst.uid) return <div className="rounded-lg bg-emerald-500/10 px-2 py-1 text-center text-[11px] text-emerald-300">這件就是身上穿的</div>;
  if (!cur) return <div className="rounded-lg bg-emerald-500/10 px-2 py-1 text-center text-[11px] text-emerald-300">這個部位空著，穿上就是賺</div>;

  const ct = config.items[cur.base];
  const mainA = mainOf(inst, t, config);
  const mainB = mainOf(cur, ct, config);
  const affA = affMap(inst); const affB = affMap(cur);
  const keys = [...new Set([...Object.keys(affA), ...Object.keys(affB)])];
  const rows = [
    ['戰力', inst.power ?? 0, cur.power ?? 0, ''],
    ...(t.slot === 'weapon'
      ? [['攻擊', mainA.atk, mainB.atk, '']]
      : [['防禦', mainA.def, mainB.def, ''], ['生命', mainA.hp, mainB.hp, '']]),
    ...keys.map((k) => [config.affixes[k].name, affA[k] || 0, affB[k] || 0, config.affixes[k].unit]),
  ];
  return (
    <div className="rounded-lg border border-white/10 bg-black/25 p-2 text-[11px]">
      <div className="mb-1 flex items-center justify-between text-white/45">
        <span>⚖ 對比身上</span>
        <span className="truncate pl-2" style={{ color: config.grades[cur.grade].color }}>{ct.name}{cur.lv > 0 ? ` +${cur.lv}` : ''}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 gap-y-0.5">
        <span className="text-white/35" /><span className="text-right text-white/35">這件</span><span className="text-right text-white/35">身上</span><span />
        {rows.map(([label, a, b, unit]) => {
          const d = a - b;
          const fmtv = (v) => (unit ? `${Math.round(v * 10) / 10}${unit}` : fmt(v));
          return [
            <span key={label + 'l'} className="text-white/60">{label}</span>,
            <span key={label + 'a'} className="num text-right font-semibold">{fmtv(a)}</span>,
            <span key={label + 'b'} className="num text-right text-white/50">{fmtv(b)}</span>,
            <span key={label + 'd'} className={`num w-10 text-right font-bold ${d > 0 ? 'text-emerald-400' : d < 0 ? 'text-red-400' : 'text-white/25'}`}>
              {d === 0 ? '—' : `${d > 0 ? '+' : '-'}${unit ? Math.round(Math.abs(d) * 10) / 10 : fmt(Math.abs(d))}`}
            </span>,
          ];
        })}
      </div>
      <div className="mt-1.5 border-t border-white/5 pt-1 text-center">
        換上後總戰力 <DeltaTag delta={inst.delta} />{inst.delta === 0 && <span className="text-white/40">不變</span>}
      </div>
    </div>
  );
}

function mainOf(inst, t, config) {
  const m = mainMul(inst, config);
  return { atk: (t.atk || 0) * m, def: (t.def || 0) * m, hp: (t.hp || 0) * m };
}
function affMap(inst) {
  const o = {};
  for (const a of inst.aff) o[a.k] = (o[a.k] || 0) + a.v;
  return o;
}

export function Essence({ n, className = '' }) {
  return <span className={`num inline-flex items-center gap-0.5 text-violet-300 ${className}`}>💠{fmt(n)}</span>;
}
