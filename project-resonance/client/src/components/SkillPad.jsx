import { useEffect, useState } from 'react';
import { WEAPON_STYLE } from '../game3d/BattleScene.js';

// 4 個技能按鈕沿著大普攻按鈕排成弧形（拇指範圍）
const ARC = ['right-[108px] bottom-[12px]', 'right-[95px] bottom-[62px]', 'right-[60px] bottom-[97px]', 'right-[12px] bottom-[108px]'];

/** 右下角技能盤：大顆強力普攻 + 職業固定 4 招 */
export default function SkillPad({ scene, auto, onToggleAuto, wtype = 'great', loadout = [], defs = {}, disabled = false, mount = null, riding = false, rideLocked = false, onToggleRide }) {
  const basic = (WEAPON_STYLE[wtype] ?? WEAPON_STYLE.great).basic;
  const [cd, setCd] = useState({});

  useEffect(() => {
    const t = setInterval(() => scene.current && setCd(scene.current.getCooldowns()), 100);
    return () => clearInterval(t);
  }, [scene]);

  const cast = (id) => scene.current?.castSkill(id);

  return (
    <div className="pointer-events-none relative size-44">
      <div className={`transition ${disabled ? 'opacity-30 grayscale' : ''}`}>
      <SkillButton id="basic" s={basic} big cd={cd.basic} onCast={cast} className="right-0 bottom-0" disabled={disabled} />
      {loadout.map((id, i) => defs[id] && (
        <SkillButton key={id} id={id} s={defs[id]} cd={cd[id]} onCast={cast} className={ARC[i]} disabled={disabled} />
      ))}
      </div>
      {mount && (
        <button
          onClick={onToggleRide}
          disabled={rideLocked}
          className={`no-touch-action pointer-events-auto absolute -top-9 right-[74px] rounded-full border px-3 py-1.5 text-xs font-bold backdrop-blur transition active:scale-95 disabled:opacity-40
            ${riding ? 'border-amber-300/70 bg-amber-900/70 text-amber-100' : 'border-white/25 bg-black/60 text-white/70'}`}
        >
          {mount.icon} {riding ? '下坐騎' : '騎乘'}
        </button>
      )}
      <button
        onClick={onToggleAuto}
        className={`no-touch-action pointer-events-auto absolute -top-9 right-0 rounded-full border px-3 py-1.5 text-xs font-bold backdrop-blur transition active:scale-95
          ${auto ? 'border-emerald-300/70 bg-emerald-900/70 text-emerald-200' : 'border-white/25 bg-black/60 text-white/70'}`}
      >
        {auto ? '● 自動' : '○ 手動'}
      </button>
    </div>
  );
}

function SkillButton({ id, s, big, cd = 0, onCast, className, disabled }) {
  const ready = cd <= 0;
  const size = big ? 'size-20 text-3xl' : 'size-14 text-2xl';
  return (
    <button
      disabled={disabled}
      onPointerDown={(e) => { e.preventDefault(); onCast(id); }}
      className={`no-touch-action pointer-events-auto absolute grid place-items-center overflow-hidden rounded-full border-2 shadow-xl transition active:scale-90
        ${big ? 'border-gold/80 bg-gradient-to-br from-amber-500/60 to-red-700/60' : 'border-white/40 bg-gradient-to-br from-indigo-500/50 to-slate-900/70'}
        ${size} ${className}`}
    >
      <span className={ready ? '' : 'opacity-40'}>{s.icon}</span>
      {!ready && (
        <span className="absolute inset-0" style={{ background: `conic-gradient(rgba(0,0,0,.65) ${cd * 360}deg, transparent 0)` }} />
      )}
      {!big && <span className="absolute bottom-0.5 text-[9px] font-bold text-white/85 drop-shadow">{s.name}</span>}
    </button>
  );
}
