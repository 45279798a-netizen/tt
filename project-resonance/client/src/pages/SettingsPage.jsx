import { useEffect, useState } from 'react';
import { getSettings, setSettings, onSettings, PRESETS, DEFAULTS } from '../utils/settings.js';

/** 畫面設定：只存在這台裝置，改了立刻生效 */
export default function SettingsPage() {
  const [s, setS] = useState(getSettings());
  useEffect(() => onSettings(setS), []);
  const Row = ({ label, hint, children }) => (
    <div className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5">
      <div className="min-w-0 flex-1"><div className="text-sm font-bold">{label}</div>{hint && <div className="text-[11px] text-white/45">{hint}</div>}</div>
      <div className="flex shrink-0 flex-wrap justify-end gap-1">{children}</div>
    </div>
  );
  const Opt = ({ k, v, children }) => (
    <button onClick={() => setSettings({ [k]: v })}
      className={`rounded-lg px-2.5 py-1.5 text-xs font-bold ${s[k] === v ? 'bg-gold text-ink' : 'bg-white/10 text-white/70'}`}>{children}</button>
  );
  const Toggle = ({ k }) => <><Opt k={k} v>開</Opt><Opt k={k} v={false}>關</Opt></>;
  return (
    <div className="space-y-2 p-3">
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(PRESETS).map(([id, p]) => {
          const { label, ...v } = p;
          return <button key={id} onClick={() => setSettings(v)} className="flex-1 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-sm font-bold text-gold active:scale-95">{label}</button>;
        })}
      </div>
      <Row label="視角距離" hint="拉遠看得比較廣，拉近角色比較大">{[[0.75, '近'], [1, '標準'], [1.25, '遠'], [1.5, '最遠']].map(([v, t]) => <Opt key={v} k="cam" v={v}>{t}</Opt>)}</Row>
      <Row label="畫面更新（FPS 上限）" hint="越低越省電、手機越不燙">{[30, 45, 60, 0].map((v) => <Opt key={v} k="fps" v={v}>{v || '不限'}</Opt>)}</Row>
      <Row label="解析度" hint="降低會糊一點，但卡頓的手機會順很多">{[0.5, 0.75, 1].map((v) => <Opt key={v} k="res" v={v}>{v * 100}%</Opt>)}</Row>
      <Row label="陰影" hint="關掉可以大幅減少手機負擔"><Toggle k="shadows" /></Row>
      <Row label="特效品質" hint="低 = 粒子數量減半"><Opt k="fx" v="high">高</Opt><Opt k="fx" v="low">低</Opt></Row>
      <Row label="其他玩家的技能特效" hint="人多時關掉會順很多（他們一樣會幫你打怪）"><Toggle k="others" /></Row>
      <Row label="傷害數字"><Toggle k="dmgNum" /></Row>
      <Row label="顯示 FPS" hint="左下角顯示目前每秒幾幀"><Toggle k="meter" /></Row>
      <button onClick={() => setSettings(DEFAULTS)} className="w-full rounded-xl border border-white/15 py-2 text-xs text-white/60">恢復預設</button>
      <p className="text-center text-[10px] text-white/30">設定只存在這台裝置，換手機要重新設定</p>
    </div>
  );
}
