/** 從右側滑出的面板，戰鬥在後面繼續跑 */
export default function SidePanel({ title, wide = false, onClose, children }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <aside
        onClick={(e) => e.stopPropagation()}
        className={`panel-in safe-r relative flex h-full ${wide ? 'w-[min(820px,94vw)]' : 'w-[min(560px,72vw)]'} flex-col border-l border-edge bg-ink/95 backdrop-blur`}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-edge px-4 py-2.5">
          <h2 className="font-bold">{title}</h2>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-lg bg-white/10 text-lg active:scale-90" aria-label="關閉">✕</button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>
  );
}
