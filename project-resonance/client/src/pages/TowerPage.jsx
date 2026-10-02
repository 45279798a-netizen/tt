import { fmt } from '../utils/format.js';

/** 守塔人：試煉之塔的進度 + 下一層的獎勵 + 進塔 */
export default function TowerPage({ player, onStart }) {
  const t = player.tower;
  const r = t.nextReward, info = t.nextInfo;
  const ms = [5, 10, 25, 50, 100, 150, 200];
  return (
    <div className="space-y-3 p-4 text-sm">
      <div className="rounded-xl border border-sky-400/40 bg-sky-500/10 p-3">
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-black text-sky-100">🗼 最高 {t.best} / {t.max} 層</span>
          <span className="ml-auto text-xs text-amber-200">天賦點 +{t.talentFromTower} / 40</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-sky-400" style={{ width: `${(t.best / t.max) * 100}%` }} /></div>
        <div className="mt-1.5 flex justify-between text-[10px] text-white/40">
          {ms.map((m) => <span key={m} className={t.best >= m ? 'text-sky-300' : ''}>{m}</span>)}
        </div>
      </div>
      {!t.done && (
        <div className="rounded-xl bg-white/5 p-3">
          <div className="font-bold">第 {t.next} 層 <span className="text-xs font-normal text-white/50">· 強度約 {['翠綠森林', '熔岩峽谷', '霜雪遺跡', '烈陽聖域', '幽影沼澤', '星界天穹', '沉沒王都', '龍骨荒原'][info.tier]}</span></div>
          <div className="num mt-1 text-xs text-white/55">{info.count} 隻怪（血量 {fmt(info.hp)}）＋ 樓層守衛（{info.guardMul} 倍血），{info.sec} 秒內全部打倒</div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
            <span className="rounded bg-black/30 px-2 py-1">💠 {r.essence}</span>
            <span className="rounded bg-black/30 px-2 py-1">💰 {fmt(r.gold)}</span>
            {r.wr > 0 && <span className="rounded bg-black/30 px-2 py-1">星輝羽 {r.wr}</span>}
            {r.talent > 0 && <span className="rounded bg-amber-400/20 px-2 py-1 font-bold text-amber-200">🌳 天賦點 +1</span>}
            {r.eggs > 0 && <span className="rounded bg-black/30 px-2 py-1">🥚 ×1</span>}
          </div>
        </div>
      )}
      <p className="text-xs leading-relaxed text-white/55">一層一層往上爬的單人挑戰。每 25 層大約等於下一張地圖的怪物強度，共 200 層。首次通關才有獎勵；<b className="text-amber-200">每 5 層 +1 天賦點</b>、每 10 層一顆寵物蛋。失敗可以無限重來。塔裡打倒的怪不算一般擊殺。</p>
      <button disabled={t.done} onClick={onStart} className="w-full rounded-xl bg-sky-500 py-3 font-bold active:scale-[.98] disabled:opacity-40">
        {t.done ? '🏆 已登頂' : `🗼 挑戰第 ${t.next} 層`}
      </button>
    </div>
  );
}
