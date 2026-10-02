export const MENUS = [
  { id: 'bag', label: '背包', icon: 'M6 8h12l-1 12H7zM9 8V6a3 3 0 016 0v2' },
  { id: 'pet', label: '寵物', icon: 'M7 10a2 2 0 100-4 2 2 0 000 4zM17 10a2 2 0 100-4 2 2 0 000 4zM4.5 15a2 2 0 100-4 2 2 0 000 4zM19.5 15a2 2 0 100-4 2 2 0 000 4zM12 21c-3 0-5-1.5-5-3.5S9 13 12 13s5 2.5 5 4.5S15 21 12 21z' },
  { id: 'partner', label: '夥伴', icon: 'M8 11a3 3 0 100-6 3 3 0 000 6zM16 11a3 3 0 100-6 3 3 0 000 6zM2 20c0-3 2.7-5 6-5 1.5 0 2.9.4 4 1.1 1.1-.7 2.5-1.1 4-1.1 3.3 0 6 2 6 5' },
  { id: 'char', label: '角色', icon: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 3.6-6 8-6s8 2 8 6' },
  { id: 'friends', label: '好友', icon: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5M16 4.5a3.5 3.5 0 010 6.5M18 14.8c2.4.6 4 2.3 4 5.2' },
  { id: 'board', label: '排行', icon: 'M5 20l2-9 5 4 5-4 2 9zM7 11L5 5l4 3 3-5 3 5 4-3-2 6' },
];

// 村莊 NPC 打開的面板
export const ADMIN_MENU = { id: 'admin', label: '管理', icon: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6zM9 12l2 2 4-4' };
export const NPC_PANELS = { rebirth: '🌟 轉職殿堂·艾琳', admin: '🛡 管理員', smith: '🔨 鍛造師·鐵錘', portal: '✨ 傳送師·露娜', board: '📜 冒險者告示板', stable: '🐎 馬廄·阿蹄', tavern: '🍺 酒館', manor: '🏡 莊園' };

const FS_ICON = 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5';

/** 右上角選單：像手遊一樣一排圓形按鈕，點開側邊面板 */
export default function MenuBar({ open, onOpen, pwa, badges = {}, admin = false }) {
  return (
    <div className="flex items-center gap-1.5">
      {pwa.canFullscreen && !pwa.fullscreen && (
        <RoundBtn label="全螢幕" icon={FS_ICON} onClick={pwa.enterFullscreen} />
      )}
      {[...MENUS, ...(admin ? [ADMIN_MENU] : [])].map((m) => (
        <RoundBtn key={m.id} label={m.label} icon={m.icon} active={open === m.id} badge={badges[m.id]} onClick={() => onOpen(m.id)} />
      ))}
    </div>
  );
}

function RoundBtn({ label, icon, active, onClick, badge }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex size-12 flex-col items-center justify-center rounded-xl border backdrop-blur transition active:scale-90
        ${active ? 'border-gold bg-gold/25 text-gold' : 'border-white/15 bg-black/50 text-white/80'}`}
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
        <path d={icon} />
      </svg>
      <span className="mt-0.5 text-[9px] font-medium">{label}</span>
      {badge > 0 && <span className="num absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-red-500 text-[9px] font-bold text-white">{badge}</span>}
    </button>
  );
}
