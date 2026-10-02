import { useEffect, useState } from 'react';
import { fmt } from '../utils/format.js';

const MODE_NAME = { fair: '公平對決', power: '戰力對決' };
const MODE_DESC = {
  fair: '雙方血量、攻擊一樣，比技術和走位',
  power: '用真實戰力，裝備越好越強',
};

/** 點朋友名字 → 選決鬥模式 */
export function ChallengeMenu({ target, onPick, onClose }) {
  return (
    <Modal onClose={onClose}>
      <div className="text-xs tracking-widest text-white/45">發起決鬥</div>
      <div className="mt-1 text-xl font-bold text-sky-200">⚔ {target.name}</div>
      <div className="num text-xs text-white/45">Lv.{target.level} · 戰力 {fmt(target.cp)} · {target.pvp?.w ?? 0} 勝 {target.pvp?.l ?? 0} 敗</div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {['fair', 'power'].map((m) => (
          <button key={m} onClick={() => onPick(m)}
            className="rounded-2xl border border-gold/40 bg-gold/10 p-3 text-left transition active:scale-95">
            <div className="font-bold text-gold">{MODE_NAME[m]}</div>
            <div className="mt-0.5 text-[11px] leading-snug text-white/55">{MODE_DESC[m]}</div>
          </button>
        ))}
      </div>
      <button onClick={onClose} className="mt-3 w-full py-1.5 text-sm text-white/40">取消</button>
    </Modal>
  );
}

/** 收到決鬥邀請 */
export function InviteModal({ invite, onAnswer }) {
  const [left, setLeft] = useState(20);
  useEffect(() => {
    const t = setInterval(() => setLeft((n) => n - 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { if (left <= 0) onAnswer(false); }, [left, onAnswer]);
  return (
    <Modal>
      <div className="text-xs tracking-widest text-white/45">決鬥邀請</div>
      <div className="mt-1 text-xl font-bold"><span className="text-sky-200">{invite.name}</span> 向你挑戰！</div>
      <div className="mt-1 text-sm text-gold">{MODE_NAME[invite.mode]}</div>
      <div className="text-[11px] text-white/45">{MODE_DESC[invite.mode]} · 對方戰力 {fmt(invite.cp)}</div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button onClick={() => onAnswer(false)} className="rounded-xl bg-white/10 py-3 font-bold text-white/70 active:scale-95">拒絕</button>
        <button onClick={() => onAnswer(true)} className="rounded-xl bg-gold py-3 font-bold text-ink active:scale-95">接受（{left}）</button>
      </div>
    </Modal>
  );
}

/** 決鬥中的血條、倒數、計時 */
export function DuelHud({ duel, hpState, myName, onSurrender }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(t); }, []);
  const startAt = duel.receivedAt + duel.countdown;
  const countdown = Math.ceil((startAt - now) / 1000);
  const remain = Math.max(0, Math.ceil((startAt + duel.timeLimit - now) / 1000));
  const bar = (id, name, mine) => {
    const hp = hpState.hp[id] ?? 0, max = hpState.maxHp[id] ?? 1;
    const pct = Math.max(0, (hp / max) * 100);
    return (
      <div className={`flex-1 ${mine ? '' : 'text-right'}`}>
        <div className={`mb-0.5 text-xs font-bold ${mine ? 'text-gold' : 'text-sky-200'}`}>{name}</div>
        <div className={`h-3 overflow-hidden rounded-full bg-black/60 ring-1 ring-white/15 ${mine ? '' : 'flex justify-end'}`}>
          <div className={`h-full transition-[width] duration-200 ${mine ? 'bg-gradient-to-r from-amber-500 to-gold' : 'bg-gradient-to-l from-sky-500 to-sky-300'}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="num mt-0.5 text-[10px] text-white/55">{fmt(hp)} / {fmt(max)}</div>
      </div>
    );
  };
  return (
    <>
      <div className="pointer-events-auto flex w-[min(520px,56vw)] items-start gap-3 rounded-2xl bg-black/55 px-3 py-2 backdrop-blur">
        {bar(duel.me, myName, true)}
        <div className="flex flex-col items-center pt-1">
          <div className="text-[10px] text-red-300">{MODE_NAME[duel.mode]}</div>
          <div className="num text-lg font-bold">{countdown > 0 ? '—' : remain}</div>
          <button onClick={onSurrender} className="mt-0.5 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/50">投降</button>
        </div>
        {bar(duel.opp, duel.oppName, false)}
      </div>
      {countdown > 0 && (
        <div key={countdown} className="duel-count pointer-events-none fixed inset-0 z-30 grid place-items-center">
          <div className="num text-8xl font-black text-gold">{countdown}</div>
        </div>
      )}
      {countdown <= 0 && countdown > -1 && (
        <div className="duel-count pointer-events-none fixed inset-0 z-30 grid place-items-center">
          <div className="text-6xl font-black text-red-400">開戰！</div>
        </div>
      )}
    </>
  );
}

/** 勝負結果 */
export function DuelResult({ result, onClose }) {
  return (
    <Modal onClose={onClose}>
      <div className={`text-5xl font-black ${result.win ? 'text-gold' : 'text-white/60'}`}>{result.win ? '勝利！' : '敗北'}</div>
      <div className="mt-2 text-sm text-white/60">{result.reason}</div>
      <div className="mt-1 text-xs text-white/40">PvP 戰績會顯示在「首領」頁的排行榜</div>
      <button onClick={onClose} className="mt-5 w-full rounded-xl bg-gold py-3 font-bold text-ink active:scale-95">回到狩獵</button>
    </Modal>
  );
}

function Modal({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6" onClick={onClose}>
      <div className="toast-pop w-full max-w-sm rounded-3xl border border-gold/30 bg-panel p-5 text-center" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
