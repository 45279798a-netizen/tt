/** 直拿手機時蓋住畫面，提示轉成橫向 */
export default function RotateHint() {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5 bg-ink px-10 text-center">
      <div className="rotate-phone grid h-24 w-14 place-items-center rounded-xl border-2 border-gold">
        <div className="h-1 w-5 rounded-full bg-gold/60" />
      </div>
      <div>
        <div className="text-lg font-bold text-gold">請將手機轉為橫向</div>
        <p className="mt-1 text-sm text-white/50">《緣起》是橫向遊戲<br />記得關閉手機的螢幕方向鎖定</p>
      </div>
    </div>
  );
}
