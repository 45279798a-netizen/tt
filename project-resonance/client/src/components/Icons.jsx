import { THEMES } from '../game3d/themes.js';

export const SLOT_ICON = { weapon: '🗡️', helm: '⛑️', armor: '🛡️', gloves: '🧤', boots: '🥾' };
const WEAPON_ICON = { great: '🗡️', katana: '⚔️', dual: '🔪', staff: '🪄', spear: '🔱', bow: '🏹' };

export const setColor = (set) => (set >= 0 ? THEMES[set % THEMES.length].mob : '#8a7a66');

/** 裝備圖示：部位圖案 + 套裝顏色底 */
export function ItemIcon({ item, slot, size = 'size-12', dim = false }) {
  const s = item?.slot ?? slot;
  const color = item ? setColor(item.set) : null;
  return (
    <div
      className={`relative grid shrink-0 place-items-center rounded-xl border ${size} ${dim ? 'opacity-40' : ''}`}
      style={color
        ? { background: `radial-gradient(circle at 30% 25%, ${color}66, ${color}22 70%)`, borderColor: `${color}aa` }
        : { background: 'rgba(255,255,255,.04)', borderColor: 'rgba(255,255,255,.12)', borderStyle: 'dashed' }}
    >
      <span className={`text-xl ${item ? '' : 'opacity-30 grayscale'}`}>{item?.wtype ? WEAPON_ICON[item.wtype] : SLOT_ICON[s]}</span>
    </div>
  );
}

/** 素材圖示：普通 = 圓形，稀有 = 發光菱形 */
export function MatIcon({ mat, size = 18 }) {
  const color = mat.color ?? setColor(mat.set);
  if (mat.rare) {
    return (
      <span className="inline-block shrink-0 rotate-45 rounded-[3px] border border-white/60"
        style={{ width: size * 0.78, height: size * 0.78, background: color, boxShadow: `0 0 8px ${color}` }} />
    );
  }
  return (
    <span className="inline-block shrink-0 rounded-full border border-black/30"
      style={{ width: size, height: size, background: `radial-gradient(circle at 35% 30%, #fff8, ${color} 55%)` }} />
  );
}
