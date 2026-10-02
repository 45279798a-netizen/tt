import { useEffect, useState } from 'react';
import { useGame } from './hooks/useGame.js';
import { fmt } from './utils/format.js';
import { usePwa, useMediaQuery, lockLandscape } from './utils/pwa.js';
import HudPlayer from './components/HudPlayer.jsx';
import MenuBar, { MENUS, NPC_PANELS } from './components/MenuBar.jsx';
import SidePanel from './components/SidePanel.jsx';
import RotateHint from './components/RotateHint.jsx';
import BattlePage from './pages/BattlePage.jsx';
import BagPage from './pages/BagPage.jsx';
import CharacterPage from './pages/CharacterPage.jsx';
import ForgePage from './pages/ForgePage.jsx';
import BossPage from './pages/BossPage.jsx';
import FriendsPage from './pages/FriendsPage.jsx';
import PortalPage from './pages/PortalPage.jsx';
import StablePage from './pages/StablePage.jsx';
import PartnerPage from './pages/PartnerPage.jsx';
import ManorPage from './pages/ManorPage.jsx';
import PetPage from './pages/PetPage.jsx';
import RebirthPage from './pages/RebirthPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import TalentPage from './pages/TalentPage.jsx';
import QuestPage from './pages/QuestPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

export default function App() {
  const game = useGame();
  const pwa = usePwa();
  const [panel, setPanel] = useState(null);
  // 觸控裝置直拿 → 擋住並提示轉橫向
  const portrait = useMediaQuery('(orientation: portrait) and (pointer: coarse)');

  useEffect(() => { lockLandscape(); }, []);

  let screen;
  if (game.booting) screen = <Splash text={game.boot.text} pct={game.boot.pct} />;
  else if (!game.config) screen = <Splash text={`無法連上伺服器：${game.error}`} />;
  else if (!game.player) screen = <Login onLogin={game.login} onRegister={game.register} pwa={pwa} />;
  else {
    const { player, config } = game;
    const close = () => setPanel(null);
    const pages = {
      bag: <BagPage player={player} config={config} onEquip={game.doEquip} onLock={game.doLock} onDismantle={game.doDismantle} />,
      settings: <SettingsPage />,
      talent: <TalentPage player={player} config={config} onLearn={game.doTalent} onReset={game.doTalentReset} />,
      quest: <QuestPage player={player} config={config} onClaimDaily={game.doDailyClaim} onChest={game.doDailyChest} onClaimAchieve={game.doAchieveClaim} />,
      rebirth: <RebirthPage player={player} config={config} onRebirth={game.doRebirth} />,
      admin: player.admin ? <AdminPage config={config} pushEvent={game.pushEvent} /> : null,
      char: <CharacterPage player={player} config={config} onEquip={game.doEquip} onLogout={game.logout} onClaimAdmin={game.doClaimAdmin} onLoadout={game.doLoadout}
        onCraftWing={game.doCraftWing} onUpgradeWing={game.doUpgradeWing} onEquipWing={game.doEquipWing} />,
      friends: (
        <FriendsPage player={player}
          onTravel={async (id) => { if (await game.doTravel(id)) close(); }}
          onDuel={(f) => { close(); window.dispatchEvent(new CustomEvent('resonance:duel', { detail: f })); }} />
      ),
      board: <BossPage player={player} />,
      partner: <PartnerPage player={player} config={config} atTavern={false} onRecruit={game.doRecruitPartner} onDeploy={game.doDeployPartner} onUpgrade={game.doUpgradePartner} />,
      manor: <ManorPage player={player} config={config} />,
      pet: <PetPage player={player} config={config} onPet={game.doPet} />,
      tavern: <PartnerPage player={player} config={config} atTavern onRecruit={game.doRecruitPartner} onDeploy={game.doDeployPartner} onUpgrade={game.doUpgradePartner} />,
      // 村莊 NPC
      smith: player.inTown
        ? <ForgePage player={player} config={config} onCraft={game.doCraft} onEnhance={game.doEnhance} onReroll={game.doReroll} onEquip={game.doEquip} />
        : <p className="p-6 text-center text-sm text-white/50">鍛造師在村莊裡，先回村莊吧</p>,
      stable: <StablePage player={player} config={config} onBuy={game.doBuyMount} onUpgrade={game.doUpgradeMount} onEquip={game.doEquipMount} />,
      portal: <PortalPage player={player} config={config} onGo={async (id) => { if (await game.doChangeMap(id)) close(); }} onField={async () => { if (await game.doGoField()) close(); }} onBoss={async () => { if (await game.doGoBoss()) close(); }} />,
      boss: <BossGate player={player} config={config} onGo={async () => { if (await game.doGoBoss()) close(); }} />,
      field: <FieldGate player={player} config={config} onGo={async () => { if (await game.doGoField()) close(); }} />,
    };
    const title = MENUS.find((m) => m.id === panel)?.label ?? NPC_PANELS[panel];
    screen = (
      <>
        <BattlePage
          player={player} config={config} events={game.events}
          active={!portrait} killsPerMin={game.killsPerMin} pushEvent={game.pushEvent} onTrialStart={game.doTrialStart} onTrialEnd={game.doTrialEnd} onRaidStart={game.doRaidStart} onChangeMap={game.doChangeMap} onGoTown={game.doGoTown} onGoBoss={game.doGoBoss}
          onNpc={(id) => setPanel(id)}
          topLeft={<HudPlayer player={player} online={game.online} />}
          topRight={<MenuBar open={panel} onOpen={(id) => setPanel(panel === id ? null : id)} pwa={pwa} admin={player.admin} badges={{ friends: player.friendReqs, bag: player.inv.filter((x) => x.delta > 0).length, quest: player.badges.daily + player.badges.achieve, talent: player.badges.talent }} />}
        />
        {panel && pages[panel] && (
          <SidePanel title={title} wide={['char', 'smith', 'bag', 'stable', 'tavern', 'partner', 'manor', 'pet', 'admin', 'talent', 'quest'].includes(panel)} onClose={close}>
            {pages[panel]}
          </SidePanel>
        )}
        <Toast events={game.events} config={config} />
      </>
    );
  }

  return (
    <>
      {screen}
      {portrait && <RotateHint />}
    </>
  );
}

function Toast({ events, config }) {
  const last = [...events].reverse().find((e) => ['error', 'craft', 'dismantle', 'info'].includes(e.type));
  const [, force] = useState(0);
  useEffect(() => {
    if (!last) return;
    const t = setTimeout(() => force((n) => n + 1), 2600);
    return () => clearTimeout(t);
  }, [last?.id]);
  if (!last || Date.now() - last.at > 2500) return null;
  let cls = 'bg-red-500/90', text = last.text;
  if (last.type === 'craft') {
    const g = config.grades[last.inst.grade];
    cls = 'border bg-ink/90';
    text = <>⚒️ 鍛造成功！<span style={{ color: g.color }}>【{g.name}】</span>{config.items[last.inst.base]?.name}</>;
  } else if (last.type === 'dismantle') {
    cls = 'border border-violet-400/60 bg-ink/90 text-violet-200';
    text = `分解 ${last.count} 件，獲得 💠${last.essence} 鍛造精華`;
  } else if (last.type === 'info') {
    cls = 'border border-sky-400/50 bg-ink/90 text-sky-100';
  }
  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-50 grid place-items-center">
      <div className={`toast-pop rounded-full px-5 py-2 text-sm font-bold shadow-lg ${cls}`}>{text}</div>
    </div>
  );
}

/** 首領祭司：巨大首領的狀態 + 前往深淵祭壇 */
function BossGate({ player, onGo }) {
  const b = player.worldBoss || {};
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const eff = b.alive ? player.stats.atk / (player.stats.atk + b.def * b.defK) : 0;
  const left = Math.max(0, Math.ceil(((b.next || 0) - now) / 1000));
  return (
    <div className="space-y-3 p-4 text-sm">
      {b.alive ? (
        <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-3">
          <div className="text-lg font-black text-red-100">{b.icon} {b.name} <span className="text-xs font-normal text-white/50">第 {b.gen + 1} 次甦醒</span></div>
          <div className="boss-bar mt-2"><i style={{ width: `${(b.hp / b.maxHp) * 100}%` }} /><span className="num">{fmt(b.hp)} / {fmt(b.maxHp)}</span></div>
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-xs">
            <div className="rounded-lg bg-black/30 p-1.5"><div className="text-white/45">參與</div><b>{b.fighters} 人</b></div>
            <div className="rounded-lg bg-black/30 p-1.5"><div className="text-white/45">我的傷害</div><b>{Math.round((b.myShare || 0) * 100)}%</b></div>
            <div className="rounded-lg bg-black/30 p-1.5"><div className="text-white/45">我的破防</div><b className={eff < 0.4 ? 'text-red-300' : 'text-emerald-300'}>{Math.round(eff * 100)}%</b></div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-white/5 p-3 text-center">首領沉睡中，<b className="num text-gold">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</b> 後甦醒</div>
      )}
      <p className="text-xs leading-relaxed text-white/55">首領的<b>血量</b>是依照所有玩家（含 AI 玩家）的秒傷總和算的，<b>防禦</b>是大家攻擊力的平均；你的攻擊越高，被防禦擋掉的越少（上面的「破防」）。血量不會重置，大家陸續上線一起把它磨倒；倒下時依傷害比例發獎勵（依你自己的進度換算），前 3 名必得寵物蛋。</p>
      <button disabled={!b.alive} onClick={onGo} className="w-full rounded-xl bg-red-500 py-3 font-bold active:scale-[.98] disabled:opacity-40">👑 前往深淵祭壇討伐</button>
    </div>
  );
}

/** 村莊南門的獵場守衛：前往緣起獵場 */
function FieldGate({ player, config, onGo }) {
  return (
    <div className="space-y-3 p-4 text-sm">
      <p className="text-white/70">往南出村就是 <b className="text-amber-200">緣起獵場</b>。這裡的魔物會配合每個人的實力變強：你看到的怪物強度、掉落的素材，都跟你去過最遠的地圖（<b>{config.maps[player.maxMap].name}</b>）一樣。</p>
      <p className="text-xs text-white/50">不管進度到哪，大家都能在這裡碰面一起打。常常有其他冒險者（AI 玩家）在這裡狩獵，同地圖人越多組隊加成越高（最多 +30%）。</p>
      <button onClick={onGo} className="w-full rounded-xl bg-amber-400 py-3 font-bold text-ink active:scale-[.98]">🌾 出發到緣起獵場</button>
    </div>
  );
}

function Splash({ text, pct = null }) {
  if (pct == null) return <div className="grid min-h-dvh place-items-center px-8 text-center text-sm text-white/50">{text}</div>;
  return (
    <div className="grid min-h-dvh place-items-center bg-ink px-8">
      <div className="w-[min(320px,70vw)] text-center">
        <div className="text-4xl font-black tracking-widest text-gold">緣起</div>
        <div className="mt-3.5 mb-2 text-[13px] text-white/65">{text}</div>
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-gold to-amber-200 transition-[width] duration-300" style={{ width: `${Math.round(pct * 100)}%` }} />
        </div>
        <div className="num mt-1.5 text-xs text-white/40">{Math.round(pct * 100)}%</div>
      </div>
    </div>
  );
}

function Login({ onLogin, onRegister, pwa }) {
  const [mode, setMode] = useState('login'); // login | register
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const reg = mode === 'register';

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (reg && pw !== pw2) return setErr('兩次輸入的密碼不一樣');
    setBusy(true);
    try {
      if (reg) await onRegister(name, pw);
      else await onLogin(name, pw);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  const input = 'w-full rounded-xl border border-edge bg-panel px-4 py-2.5 text-center outline-none focus:border-gold/60';
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl items-center justify-center gap-8 overflow-y-auto px-6 py-4">
      <div className="hidden text-center sm:block">
        <div className="text-xs tracking-[0.4em] text-white/40">PROJECT RESONANCE</div>
        <h1 className="mt-2 text-5xl font-black text-gold">緣起</h1>
        <p className="mt-2 text-sm text-white/45">熟人私服 · 3D 割草 × 免洗魔物獵人</p>
      </div>
      <form onSubmit={submit} className="w-full max-w-xs space-y-2.5">
        <div className="text-center sm:hidden"><h1 className="text-3xl font-black text-gold">緣起</h1></div>
        <div className="grid grid-cols-2 rounded-xl bg-white/5 p-1 text-sm font-bold">
          {[['login', '登入'], ['register', '註冊新帳號']].map(([id, label]) => (
            <button type="button" key={id} onClick={() => { setMode(id); setErr(''); }}
              className={`rounded-lg py-1.5 transition ${mode === id ? 'bg-gold text-ink' : 'text-white/50'}`}>{label}</button>
          ))}
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={12} autoComplete="username"
          placeholder="帳號（也是遊戲裡顯示的名字）" className={input} />
        <input value={pw} onChange={(e) => setPw(e.target.value)} type="password" maxLength={64}
          autoComplete={reg ? 'new-password' : 'current-password'} placeholder="密碼（至少 4 個字）" className={input} />
        {reg && (
          <input value={pw2} onChange={(e) => setPw2(e.target.value)} type="password" maxLength={64}
            autoComplete="new-password" placeholder="再輸入一次密碼" className={input} />
        )}
        {err && <p className="text-center text-sm text-red-400">{err}</p>}
        <button disabled={busy || !name.trim() || pw.length < 4}
          className="w-full rounded-xl bg-gold py-3 text-lg font-bold text-ink transition active:scale-[.98] disabled:opacity-40">
          {busy ? '…' : reg ? '建立帳號並進入' : '進入世界'}
        </button>
        {!reg && <p className="text-center text-[11px] text-white/35">改版前的舊角色：輸入原本的名字＋新密碼，第一次登入會幫你設定密碼</p>}
        <InstallHint pwa={pwa} />
      </form>
    </div>
  );
}

function InstallHint({ pwa }) {
  if (pwa.standalone) return null;
  if (pwa.canInstall) {
    return (
      <button onClick={pwa.install}
        className="w-full rounded-2xl border border-gold/40 py-3 text-sm font-bold text-gold active:scale-[.98]">
        📲 安裝到手機主畫面（全螢幕遊玩）
      </button>
    );
  }
  if (pwa.ios) {
    return (
      <p className="text-center text-xs leading-relaxed text-white/45">
        📲 想全螢幕玩？點 Safari 下方的「分享」→「加入主畫面」
      </p>
    );
  }
  return null;
}
