import { fmt } from '../utils/format.js';
import { setColor } from '../components/Icons.jsx';

/** 傳送師·露娜：選擇狩獵地圖 */
export default function PortalPage({ player, config, onGo, onField, onBoss, onTower }) {
  const u = player.nextUnlock;
  return (
    <div className="space-y-1.5 p-3">
      <p className="text-xs text-white/45">選一張地圖出發狩獵。新地圖要先做出上一區魔物的武器＋3 個部位，且戰力達標。</p>
      <div className="flex items-center gap-3 rounded-xl border border-amber-300/40 bg-amber-500/10 p-2.5">
        <span className="grid size-9 place-items-center rounded-lg bg-white/5 text-lg">🌾</span>
        <div className="min-w-0 flex-1">
          <div className="font-bold">緣起獵場 <span className="text-xs font-normal text-amber-200">· 村莊南邊 · 大家一起打</span></div>
          <div className="text-[11px] text-white/45">怪物強度跟你最遠的地圖（{config.maps[player.maxMap].name}）一樣，AI 玩家和朋友都在這裡；組隊加成也算 AI 玩家</div>
        </div>
        {player.inField ? <span className="text-xs text-emerald-300">目前在這</span>
          : <button onClick={onField} className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-ink active:scale-95">前往</button>}
      </div>
      <div className="flex items-center gap-3 rounded-xl border border-red-400/40 bg-red-500/10 p-2.5">
        <span className="grid size-9 place-items-center rounded-lg bg-white/5 text-lg">👑</span>
        <div className="min-w-0 flex-1">
          <div className="font-bold">深淵祭壇 <span className="text-xs font-normal text-red-200">· 巨大首領討伐</span></div>
          <div className="text-[11px] text-white/45">{player.worldBoss?.alive ? `${player.worldBoss.name} 甦醒中，大家一起把它磨倒` : '首領沉睡中'}</div>
        </div>
        {player.inBoss ? <span className="text-xs text-emerald-300">目前在這</span>
          : <button disabled={!player.worldBoss?.alive} onClick={onBoss} className="rounded-xl bg-red-500 px-4 py-2 text-sm font-bold active:scale-95 disabled:opacity-40">前往</button>}
      </div>
      <div className="flex items-center gap-3 rounded-xl border border-sky-400/40 bg-sky-500/10 p-2.5">
        <span className="grid size-9 place-items-center rounded-lg bg-white/5 text-lg">🗼</span>
        <div className="min-w-0 flex-1">
          <div className="font-bold">試煉之塔 <span className="text-xs font-normal text-sky-200">· 單人爬塔 · 最高 {player.tower.best} 層</span></div>
          <div className="text-[11px] text-white/45">60 秒打倒全部怪 + 守衛就上一層；每 5 層 +1 天賦點</div>
        </div>
        {player.inTower ? <span className="text-xs text-emerald-300">目前在這</span>
          : <button disabled={player.tower.done} onClick={onTower} className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-bold active:scale-95 disabled:opacity-40">挑戰</button>}
      </div>
      {config.maps.map((m) => {
        const set = config.sets[m.id];
        const open = m.id <= player.maxMap;
        const next = m.id === player.maxMap + 1;
        const here = !player.inTown && player.mapId === m.id;
        return (
          <div key={m.id} className={`flex items-center gap-3 rounded-xl border p-2.5 ${open ? 'border-edge bg-panel' : 'border-white/5 bg-white/[.02] opacity-60'}`}>
            <span className="num grid size-9 place-items-center rounded-lg bg-white/5 text-sm font-bold" style={{ color: setColor(m.id) }}>{m.id + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="font-bold">{m.name} <span className="text-xs font-normal" style={{ color: setColor(m.id) }}>· {open || next ? set.monster : '？？？'}</span></div>
              <div className="num text-[11px] text-white/45">怪物血量 {fmt(m.monsterHp)} · 建議戰力 {fmt(m.requiredCP)}</div>
            </div>
            {here ? (
              <span className="text-xs text-emerald-300">目前在這</span>
            ) : open ? (
              <button onClick={() => onGo(m.id)} className="rounded-xl bg-gold px-4 py-2 text-sm font-bold text-ink active:scale-95">傳送</button>
            ) : next ? (
              <button onClick={() => onGo(m.id)} className="rounded-xl border border-gold/50 px-3 py-2 text-xs text-gold active:scale-95">挑戰解鎖</button>
            ) : (
              <span className="text-xs text-white/30">🔒</span>
            )}
          </div>
        );
      })}
      {u && !u.ok && <p className="pt-1 text-center text-[11px] text-white/35">提示：在地圖上方也能看到下一區還缺什麼條件</p>}
    </div>
  );
}
