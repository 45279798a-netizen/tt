import { useRef, useState } from 'react';

const RADIUS = 52; // 搖桿可推的半徑 (px)

/** 左下角虛擬搖桿：拖曳時接管走位，放開後自動模式接手 */
export default function Joystick({ onMove }) {
  const baseRef = useRef(null);
  const [knob, setKnob] = useState({ x: 0, y: 0, active: false });
  const pid = useRef(null);

  const update = (e) => {
    const r = baseRef.current.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) { dx = (dx / len) * RADIUS; dy = (dy / len) * RADIUS; }
    setKnob({ x: dx, y: dy, active: true });
    onMove(dx / RADIUS, dy / RADIUS, true); // 螢幕往上 = 世界 -z，剛好對應
  };

  const end = () => {
    pid.current = null;
    setKnob({ x: 0, y: 0, active: false });
    onMove(0, 0, false);
  };

  return (
    <div
      ref={baseRef}
      className="no-touch-action pointer-events-auto relative grid size-32 place-items-center rounded-full border border-white/15 bg-black/25 backdrop-blur-sm"
      onPointerDown={(e) => { pid.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); update(e); }}
      onPointerMove={(e) => { if (pid.current === e.pointerId) update(e); }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="absolute inset-4 rounded-full border border-dashed border-white/10" />
      <div
        className={`size-14 rounded-full border-2 shadow-lg transition-colors ${knob.active ? 'border-gold bg-gold/40' : 'border-white/40 bg-white/20'}`}
        style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
      />
    </div>
  );
}
