// ─────────────────────────────────────────────
// 3D 上帝視角 ARPG 戰鬥場景（Three.js）
// 不依賴 React：React 只負責建立、餵數值、接搖桿與技能
//
// 「角色 actor」= 自己 or 同地圖的朋友，共用同一套攻擊 / 技能程式。
// 朋友的招式也會打到你畫面上的怪（純視覺，收益仍由伺服器結算）。
// ─────────────────────────────────────────────
import * as THREE from 'three';
import { NPCS } from './themes.js';
import { MAP_DEFS } from './maps.js';
import { World } from './world.js';
import { createHero, applyEquipment, animateHero, triggerSwing, addEnvironment } from './heroModel.js';
import { castSkillFx, updateSkillFx, removeOrbitBlades } from './skills.js';
import { createMount, animateMount, disposeMount } from './mountModel.js';
import { setHeroWings } from './wingModel.js';
import { QuarksFx } from './quarksFx.js';
import { createMonster, monsterReady } from './monsterModels.js';
import { Partner } from './partner.js';
import { Pet } from './pet.js';
import { createPlot } from './manorModels.js';
import { fmt, vibrate } from '../utils/format.js';

const MAX_MOBS = 96;
const CAMP_RANGE = 58;       // 離自己（或朋友）多近的營地才會刷怪
const AGGRO = 11;            // 怪物發現玩家的距離
const MOVE_SPEED = 6.5;
// 狂熱：連續擊殺累積能量，滿了進入 8 秒狂熱（攻速、冷卻、傷害提升，純手感，收益仍由伺服器結算）
const FEVER_TIME = 8;
const FEVER_PER_KILL = 1 / 45;
const FEVER_PER_ELITE = 0.2;
// 騎乘時腳下的特效顏色
const MOUNT_TRAIL = { horse: 0xb89a6a, raptor: 0xff7a2f, wolf: 0xbfe6ff, pegasus: 0xffe08a };

// 三種武器的手感與技能
// 三種武器的普攻手感 + 「強力普攻」按鈕；其他技能由伺服器 config.skills 定義
export const WEAPON_STYLE = {
  great: { name: '大劍', interval: 0.8, radius: 4.2, color: 0xfff1c4, basic: { name: '斬擊', icon: '⚔️', cd: 0.4 } },
  katana: { name: '太刀', interval: 0.5, radius: 3.8, color: 0xc7f0ff, basic: { name: '居合', icon: '🗡️', cd: 0.3 } },
  dual: { name: '雙劍', interval: 0.28, radius: 3.0, color: 0xffc2c2, basic: { name: '亂舞', icon: '⚔️', cd: 0.25 } },
  // 星杖：遠程，普攻是射向最近敵人的星彈（範圍爆炸）
  staff: { name: '星杖', interval: 0.6, radius: 7.0, color: 0x9be7ff, basic: { name: '星芒', icon: '✨', cd: 0.35 }, ranged: true, keep: 5 },
};
const styleOf = (wtype) => WEAPON_STYLE[wtype] ?? WEAPON_STYLE.great;

const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const rand = (a, b) => a + Math.random() * (b - a);

function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class BattleScene {
  constructor(container, overlay) {
    this.container = container;
    this.overlay = overlay;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.style.display = 'block';
    // 光照：色調映射（Neutral 保留卡通配色的飽和度）+ 太陽即時陰影
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.qfx = new QuarksFx(this.scene, (x, z) => this.gy(x, z)); // 技能特效（three.quarks）
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 200);
    this.camOffset = new THREE.Vector3(0, 20, 14.5);
    this.camFocus = new THREE.Vector3();

    this.clock = new THREE.Clock();
    this.time = 0;
    this.map = null;
    this.theme = null;
    this.items = {};
    this.auto = true;
    this.joy = { x: 0, y: 0, active: false };
    this.manualUntil = 0;
    this.cool = {};          // 技能 id → 剩餘冷卻秒數
    this.skillDefs = {};     // 伺服器 config.skills
    this.loadout = [];       // 目前裝在技能盤上的 4 招
    this.attackTimer = 0;
    this.shake = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.fever = 0;          // 狂熱能量 0~1
    this.feverTime = 0;      // 狂熱剩餘秒數
    this.mountDefs = {};     // 伺服器 config.mounts
    this.wingDefs = {};      // 伺服器 config.wings
    this.boss = null;        // 世界王（也放在 this.mobs 裡，boss: true）
    this.stunT = 0;          // 被世界王砸中的暈眩秒數
    this.wantRide = false;   // 玩家想不想騎（決鬥結束後恢復）
    this.spawnCount = 0;
    this.onFx = null;  // (kind) => void，給連線層廣播自己的招式
    this.onHit = null; // (kind) => void，決鬥中出手，交給伺服器判定
    this.onNpcNear = null;   // (npcId | null) => void，村莊裡靠近 NPC
    this.onNpcArrive = null; // (npcId) => void，自動走到 NPC 身邊
    this.npcs = [];
    this.nearNpc = null;
    this.walkTarget = null;
    this.duel = null;  // 決鬥中：{ oppId, startAt, radius, cx, cz }
    this.world = null;
    this.killReport = { kills: 0, elites: 0, bossDmg: 0, raidDmg: 0 }; // 等著回報給伺服器的擊殺 / 世界王傷害
    this.campState = [];

    this.mobs = [];
    this.effects = [];
    this.coins = [];
    this.particles = [];
    this.numbers = [];
    this.timers = [];
    this.remotes = new Map();

    this._shared();
    this._lights();
    this._ground();
    this._player();
    this._overlayEls();

    this._loop = this._loop.bind(this);
    this.ro = new ResizeObserver(() => this._resize());
    this.ro.observe(container);
    this._resize();
  }

  // ── 共用資源 ───────────────────────────────
  _shared() {
    const shadowTex = canvasTexture(64, (g, s) => {
      const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      grd.addColorStop(0, 'rgba(0,0,0,0.55)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, s, s);
    });
    this.shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });

    this.barGeo = new THREE.PlaneGeometry(1, 0.13);
    this.barFillGeo = new THREE.PlaneGeometry(1, 0.13).translate(0.5, 0, 0);
    this.barBgMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthTest: false });
    this.barFillMat = new THREE.MeshBasicMaterial({ color: 0xff4d4d, depthTest: false });

    this.eyeGeo = new THREE.SphereGeometry(0.13, 10, 8);
    this.pupilGeo = new THREE.SphereGeometry(0.065, 8, 6);
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.pupilMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

    this.ringGeo = new THREE.RingGeometry(0.88, 1, 56).rotateX(-Math.PI / 2);
    this.discGeo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
    this.slashGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.boltGeo = new THREE.CylinderGeometry(0.18, 0.35, 16, 6).translate(0, 8, 0);
    this.pillarGeo = new THREE.CylinderGeometry(1, 1, 14, 24, 1, true).translate(0, 7, 0);
    this.coinGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.07, 14);
    this.coinMat = new THREE.MeshLambertMaterial({ color: 0xf5c04a, emissive: 0x6b4a00 });
    this.partGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);

    // ── 技能特效用的共用資源 ──
    this.glowTex = canvasTexture(128, (g, s) => {
      const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.25, 'rgba(255,255,255,0.65)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, s, s);
    });
    // 月牙刀光：中心在 +Z 方向（跟角色面向一致），用 rotation.y = 面向角度 轉到正確方向
    this.crescentGeo = {};
    for (const arc of [1.6, 2.4, 3.2]) {
      this.crescentGeo[arc] = new THREE.RingGeometry(0.55, 1, 32, 1, -Math.PI / 2 - arc / 2, arc).rotateX(-Math.PI / 2);
    }
    this.wallGeo = new THREE.CylinderGeometry(1, 1, 1, 40, 1, true).translate(0, 0.5, 0);
    this.spikeGeo = new THREE.ConeGeometry(0.35, 1.4, 5).translate(0, 0.7, 0);
    this.sparkGeo = new THREE.OctahedronGeometry(0.09, 0);
    this.petalGeo = new THREE.PlaneGeometry(0.28, 0.18);
    this.bladeGeo = new THREE.BoxGeometry(0.12, 0.08, 1.3);
    this.fxMats = {}; // 依顏色共用的發光材質（火花、花瓣），不釋放
  }

  /** 依顏色共用的發光材質 */
  _fxMat(color, kind = 'spark') {
    const key = `${kind}:${color}`;
    if (!this.fxMats[key] && kind === 'solid') this.fxMats[key] = new THREE.MeshBasicMaterial({ color });
    if (!this.fxMats[key]) {
      this.fxMats[key] = new THREE.MeshBasicMaterial({
        color, transparent: true, depthWrite: false,
        blending: kind === 'petal' ? THREE.NormalBlending : THREE.AdditiveBlending,
        side: kind === 'petal' ? THREE.DoubleSide : THREE.FrontSide,
        opacity: kind === 'petal' ? 0.95 : 1,
      });
    }
    return this.fxMats[key];
  }

  _lights() {
    this.envTex = addEnvironment(this.renderer, this.scene); // 主角金屬盔甲的反射
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
    this.scene.add(this.hemi);
    // 太陽：斜斜地從左後上方照，影子往右下（鏡頭這邊）落，角色才有立體感
    this.sun = new THREE.DirectionalLight(0xffffff, 1.7);
    this.sunDir = new THREE.Vector3(-0.55, 1, -0.35).normalize();
    this.sun.castShadow = true;
    const mobile = window.matchMedia?.('(pointer: coarse)').matches;
    const size = mobile ? 1024 : 2048; // 手機用小一點的陰影貼圖
    this.sun.shadow.mapSize.set(size, size);
    const sc = this.sun.shadow.camera; // 陰影範圍跟著鏡頭焦點走，只算畫面附近
    sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 90;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);
    // 鏡頭方向的補光：讓背光面不會死黑（不投影）
    this.fill = new THREE.DirectionalLight(0xffffff, 0.35);
    this.scene.add(this.fill, this.fill.target);
  }

  /** 讓物件投射陰影（只處理不透明、受光的網格；特效、光暈、半透明不投影） */
  _shadowify(root) {
    root.traverse((o) => {
      if (!o.isMesh || o.userData.sh) return;
      o.userData.sh = 1;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m || m.isMeshBasicMaterial || m.transparent || m.blending === THREE.AdditiveBlending) return;
      o.castShadow = true;
    });
  }

  /** 地圖：地面接收陰影；樹、石頭、建築這類有高度的投射陰影（草、花太小不投，省效能） */
  _shadowWorld() {
    const ground = this.world.group.children.find((o) => o.isMesh && o.material?.vertexColors);
    if (ground) ground.receiveShadow = true;
    this.world.group.traverse((o) => {
      if (!o.isMesh || o === ground) return;
      const m = o.material;
      if (!m || m.isMeshBasicMaterial || m.transparent) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox;
      const tall = (bb.max.y - bb.min.y) * (o.isInstancedMesh ? 1 : o.getWorldScale(tmpV).y);
      if (tall > 0.7) o.castShadow = true;
      if (!o.isInstancedMesh && tall > 1.5) o.receiveShadow = true; // 大型建築 / 地標也接收影子
    });
  }

  _ground() {
    this.scene.fog = new THREE.Fog(0x000000, 30, 70);
  }

  /** 地面高度（沒有地圖時是 0） */
  gy(x, z) {
    return this.world ? this.world.height(x, z) : 0;
  }

  // ── 角色（自己 / 朋友共用） ────────────────
  _makeActor(isLocal) {
    const hero = createHero();
    const g = new THREE.Group(); // 角色的位置 / 面向；hero.root 平常掛在這，騎乘時改掛到坐騎鞍上
    g.add(hero.root);
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({
      color: isLocal ? 0xf5c04a : 0x7dd3fc, transparent: true, opacity: 0.5, depthWrite: false,
    }));
    ring.scale.setScalar(1.05);
    ring.position.y = 0.04;
    const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    shadow.scale.setScalar(1.8);
    shadow.position.y = 0.02;
    // 鬼人化的紅色氣場
    const aura = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({
      color: 0xff3b3b, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    aura.position.y = 0.06;
    g.add(ring, shadow, aura);
    this.scene.add(g);
    return {
      local: isLocal, group: g, hero, rig: hero.rig, ring, aura,
      wtype: 'great', atk: 10, dpsMul: 1, facing: 0, moving: false,
      whirlTime: 0, whirlTick: 0, demonTime: 0, frenzyTime: 0, frenzyTick: 0,
      bladesTime: 0, bladesTick: 0, leapT: 0, buffs: { dmg: 0, crit: 0, venom: 0 },
      mount: null, mountId: null, riding: false, mountSpeed: 1, trailT: 0, feverTime: 0,
    };
  }

  _player() {
    this.player = this._makeActor(true);
  }

  _overlayEls() {
    this.overlay.innerHTML = '';
    this.combEl = document.createElement('div');
    this.combEl.className = 'combo-counter';
    // 小地圖（點一下放大）
    this.miniEl = document.createElement('canvas');
    this.miniEl.className = 'minimap';
    this.miniEl.width = this.miniEl.height = 200;
    this.miniEl.addEventListener('click', () => this.miniEl.classList.toggle('big'));
    this.overlay.append(this.miniEl);
    this.flashEl = document.createElement('div');
    this.flashEl.className = 'screen-flash';
    this.feverEl = document.createElement('div');
    this.feverEl.className = 'fever-bar';
    this.feverEl.innerHTML = '<i></i><span>狂熱</span>';
    this.feverFill = this.feverEl.firstChild;
    this.feverLabel = this.feverEl.lastChild;
    this.vignetteEl = document.createElement('div');
    this.vignetteEl.className = 'fever-vignette';
    this.overlay.append(this.vignetteEl, this.combEl, this.feverEl, this.flashEl);
  }

  // ── 對外 API ───────────────────────────────
  setStats(stats) {
    this.player.atk = stats.atk;
    this.player.dpsMul = stats.atk > 0 ? stats.dps / (stats.atk * 5) : 1;
  }

  setEquipment(equipped, items) {
    this.items = items;
    applyEquipment(this.player.hero, equipped, items);
    this.player.wtype = this.player.hero.wtype;
    for (const n of this.npcs) if (n.hero) applyEquipment(n.hero, n.look, items); // 裝備資料表載入後補上 NPC 外觀
  }

  // ── 世界王 ─────────────────────────────
  /** info：伺服器送來的世界王（不在這張地圖 = null） */
  setBoss(info) {
    if (!info || this.map?.town || this.duel) {
      const b = this.boss;
      if (b) {
        this.mobs = this.mobs.filter((m) => m !== b);
        this.boss = null;
        if (b.model && b.ratio < 0.05 && !info && !this.duel) this._bossDeath(b);
        else this._removeMob(b);
      }
      return;
    }
    if (!this.boss || this.boss.bossId !== info.id) {
      if (this.boss) { this._removeMob(this.boss); this.mobs = this.mobs.filter((m) => m !== this.boss); }
      this.boss = this._makeBoss(info);
      this.mobs.push(this.boss);
      const p = this.boss.group.position;
      this._beam(p, 3, 16, 0xff3b5c, 1.2);
      this._wall(p, 1, 12, 2.5, 0xff3b5c, 0.9);
      this.shake = Math.max(this.shake, 0.5);
    }
    this.boss.ratio = Math.max(0, info.hp / info.maxHp);
  }

  // ── 首領突襲（組隊首領戰）─────────────────
  // 三個階段：①砸地（70% 以上）②＋星環彈幕（35%~70%）③＋隕星雨（35% 以下）
  setRaid(info) {
    if (!info || this.map?.town || this.duel || info.mapId !== this.map?.id) {
      const b = this.raidBoss;
      if (b) {
        this.mobs = this.mobs.filter((m) => m !== b);
        this.raidBoss = null;
        if (b.model && b.ratio < 0.05 && !info) this._bossDeath(b); else this._removeMob(b);
      }
      return;
    }
    if (!this.raidBoss || this.raidBoss.bossId !== info.id) {
      if (this.raidBoss) { this._removeMob(this.raidBoss); this.mobs = this.mobs.filter((m) => m !== this.raidBoss); }
      const m = this._makeBoss(info);
      m.raid = true; m.phase = 1; m.ringT = 3; m.meteorT = 2; m.runeT = 0; m.rings = [];
      m.group.scale.setScalar(1.25);
      m.aura.material.color.set(0xb98cff);
      m.attackT = 2.5;
      this.raidBoss = m;
      this.mobs.push(m);
      const p = m.group.position;
      this.qfx.rune(p, 10, 0xb98cff, 2.5, 1);
      this.qfx.beam(p, 3, 20, 0xb98cff, 1.4);
      this.qfx.wall(p, 1, 14, 3, 0xd8b4fe, 1);
      this.shake = Math.max(this.shake, 0.6);
      this._number(this.player.group.position, '首領突襲！', 'fever', 1);
    }
    this.raidBoss.ratio = Math.max(0, info.hp / info.maxHp);
  }

  _raidPatterns(m, dt) {
    const Q = this.qfx, bp = m.group.position, P = this.player.group.position;
    const color = [0, 0xb98cff, 0x5ee7ff, 0xff4d6a][m.phase];
    const phase = m.ratio > 0.7 ? 1 : m.ratio > 0.35 ? 2 : 3;
    if (phase > m.phase) { // 換階段：咆哮 → 光柱 + 衝擊牆 + 震動
      m.phase = phase;
      const c = [0, 0xb98cff, 0x5ee7ff, 0xff4d6a][phase];
      Q.beam(bp, 3.5, 22, c, 1.2);
      Q.wall(bp, 1, 16, 3.5, c, 0.9);
      Q.shock(bp, 18, c, 0.8);
      Q.flash(bp, 14, c, 0.7, 4);
      Q.light(bp, c, 90, 1, 34, 4);
      this.shake = Math.max(this.shake, 0.7);
      this._number(P, phase === 2 ? '第二階段：星環彈幕！' : '最終階段：隕星雨！', 'fever', 0.8);
      m.model?.play('RunFast', { fade: 0.1 });
      this._later(0.6, () => m.model?.play('Alert', { fade: 0.3 }));
    }
    m.runeT -= dt;
    if (m.runeT <= 0) { m.runeT = 2; Q.rune(bp, 9, color, 2.2, m.phase === 3 ? 2 : 0.7); } // 腳下常駐魔法陣
    const d = flat(P, bp);
    // ② 星環彈幕：從首領往外擴散的光環，碰到就擊退暈眩（要算準時機往內或往外閃）
    if (m.phase >= 2) {
      m.ringT -= dt;
      if (m.ringT <= 0) {
        m.ringT = m.phase === 3 ? 4.5 : 5.5;
        m.rings.push({ r: 2.5 });
        Q.ring(bp, 2.5, 20, 1.8, color);
        Q.sparks(bp, 24, color, 12, 0.6, { y: 1.5 });
        Q.flash(bp, 6, color, 0.4, 3);
      }
      for (const ring of m.rings) {
        ring.r += (17.5 / 1.8) * dt;
        if (!ring.hit && Math.abs(d - ring.r) < 0.9 && !this.duel) { ring.hit = true; this._raidHit(P, bp, 5, 0.8); }
      }
      m.rings = m.rings.filter((r) => r.r < 20);
    }
    // ③ 隕星雨：腳下 3 個紅圈預警 1 秒，隕星砸下
    if (m.phase >= 3) {
      m.meteorT -= dt;
      if (m.meteorT <= 0 && d < 24) {
        m.meteorT = 4;
        for (let i = 0; i < 3; i++) {
          const at = { x: P.x + (i ? rand(-3.5, 3.5) : 0), z: P.z + (i ? rand(-3.5, 3.5) : 0) };
          Q.ring(at, 2.6, 2.6, 1.0, 0xff2a2a);
          Q.disc(at, 2.4, 1.0, 0x661020);
          this._later(1.0, () => Q.meteor(at, 0xff4d6a, () => {
            const pp = this.player.group.position;
            if (flat(pp, at) < 2.7 && !this.duel) this._raidHit(pp, at, 3.5, 0.7);
          }));
        }
      }
    }
  }

  /** 被首領的招式打中：擊退 + 暈眩 + 畫面閃紅 */
  _raidHit(P, from, push, stun) {
    const ang = Math.atan2(P.x - from.x, P.z - from.z) || rand(0, 6.28);
    this.moveLocalTo(P.x + Math.sin(ang) * push, P.z + Math.cos(ang) * push);
    this.stunT = Math.max(this.stunT, stun);
    this._number(P, '暈眩！', 'hurt', 1.2);
    this.shake = Math.max(this.shake, 0.45);
    this._screenFlash('255,70,90');
    vibrate([60, 40, 60]);
  }

  /** 世界王倒下：播 Dead 動畫 2.8 秒後消失 */
  _bossDeath(b) {
    b.tag?.remove();
    b.aura.visible = false;
    b.model.play('Dead', { fade: 0.15, once: true });
    this._glowFlash(b.group.position, 9, 0xff3b5c, 0.8, 2);
    this._sparks(b.group.position, 30, 0xff5c7a, 10, 1, { up: 1.5 });
    this.shake = Math.max(this.shake, 0.4);
    const tick = (dt) => b.model.mixer.update(dt);
    this.dyingBosses = [...(this.dyingBosses || []), { b, t: 2.8, tick }];
  }

  _makeBoss(info) {
    const at = this.def.arena ?? this.def.spawn;
    const g = new THREE.Group();
    g.position.set(at.x, this.gy(at.x, at.z), at.z);
    const model = monsterReady('vampire') ? createMonster('vampire', 6.2) : null;
    const mat = model ? model.mats[0] : new THREE.MeshLambertMaterial({ color: this.mobColor, flatShading: true, emissive: 0x330000 });
    const body = model ? model.root : new THREE.Mesh(this.mobGeo, mat);
    if (!model) { body.scale.setScalar(4.2); body.position.y = 2.6; }
    g.add(body);
    const gold = new THREE.MeshLambertMaterial({ color: 0xf5c04a, emissive: 0x6b4a00, flatShading: true });
    const eye = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
    // 頭飾：史萊姆戴王冠、甲獸長巨角、冰靈繞著冰刺
    const crown = new THREE.Group();
    if (model) { /* 吸血鬼領主不需要程式頭飾 */ } else if (this.mobShape === 'slime') {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.1, 4), gold);
        c.position.set(Math.cos(a) * 1.1, 0, Math.sin(a) * 1.1);
        crown.add(c);
      }
      crown.position.y = 4.9;
    } else if (this.mobShape === 'beetle') {
      for (const sx of [-1, 1]) {
        const h = new THREE.Mesh(new THREE.ConeGeometry(0.45, 3, 5), gold);
        h.position.set(sx * 1.2, 0.6, 1.8);
        h.rotation.set(0.9, 0, -sx * 0.4);
        crown.add(h);
      }
      crown.position.y = 3.2;
    } else {
      for (let i = 0; i < 6; i++) {
        const c = new THREE.Mesh(this.shardGeo, new THREE.MeshBasicMaterial({ color: 0xe8f6ff }));
        c.scale.setScalar(4);
        c.position.set(Math.cos((i / 6) * Math.PI * 2) * 3.4, 3, Math.sin((i / 6) * Math.PI * 2) * 3.4);
        crown.add(c);
      }
    }
    for (const sx of model ? [] : [-0.8, 0.8]) {
      const e = new THREE.Mesh(this.eyeGeo, eye);
      e.scale.setScalar(2.6);
      e.position.set(sx, 3, 2.2);
      g.add(e);
    }
    const aura = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xff3b5c, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    aura.scale.setScalar(4.5);
    aura.position.y = 0.1;
    const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    shadow.scale.setScalar(8);
    shadow.position.y = 0.05;
    g.add(crown, aura, shadow);
    this.scene.add(g);
    const tag = document.createElement('div');
    tag.className = 'boss-tag';
    tag.textContent = `${info.icon ?? '👑'} ${info.name}`;
    this.overlay.appendChild(tag);
    return {
      boss: true, bossId: info.id, group: g, body, mat, crown, aura, tag, alive: true, radius: model ? 2.2 : 3.2, model,
      hp: Infinity, maxHp: Infinity, ratio: 1, flash: 0, camp: -1, attackT: 3, hop: 0, bar: { visible: false },
    };
  }

  _updateBoss(m, dt) {
    const g = m.group;
    m.hop += dt;
    const P = this.player.group.position;
    const d = flat(P, g.position);
    // 面向自己
    const want = Math.atan2(P.x - g.position.x, P.z - g.position.z);
    let dr = want - g.rotation.y;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    g.rotation.y += dr * Math.min(1, dt * 2);
    if (m.model) m.model.mixer.update(dt);
    else m.body.position.y = 2.6 + Math.sin(m.hop * 2) * 0.2;
    if (m.raid) this._raidPatterns(m, dt);
    m.crown.rotation.y += dt * (this.mobShape === 'spirit' || this.mobShape === 'sentinel' ? 0.8 : 0);
    m.aura.material.opacity = 0.4 + Math.sin(m.hop * 4) * 0.2;
    m.flash = Math.max(0, m.flash - dt);
    if (m.model) m.model.setEmissive(m.flash > 0 ? 0x666666 : 0x000000);
    else m.mat.emissive.setHex(m.flash > 0 ? 0xffffff : 0x330000);
    // 攻擊：鎖定自己目前的位置 → 紅圈預警 1.1 秒 → 砸下（只判定自己，朋友各自判定）
    m.attackT -= dt;
    if (m.attackT <= 0 && d < 20 && !this.duel) {
      m.attackT = rand(3.2, 4.8);
      this._bossSlam(m, { x: P.x + rand(-1, 1), z: P.z + rand(-1, 1) });
    }
    // 名字
    tmpV.set(g.position.x, g.position.y + 7, g.position.z).project(this.camera);
    const off = tmpV.z > 1 || Math.abs(tmpV.x) > 1.1 || Math.abs(tmpV.y) > 1.1;
    m.tag.style.display = off ? 'none' : '';
    if (!off) m.tag.style.transform = `translate(${(tmpV.x * 0.5 + 0.5) * this.width}px, ${(-tmpV.y * 0.5 + 0.5) * this.height}px) translate(-50%, -100%)`;
  }

  _bossSlam(m, at) {
    const R = 3.4, T = 1.1;
    const mat = new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.25, depthWrite: false });
    const disc = new THREE.Mesh(this.discGeo, mat);
    disc.position.set(at.x, this.gy(at.x, at.z) + 0.08, at.z);
    this.scene.add(disc);
    this.effects.push({ mesh: disc, t: 0, life: T, update: (e, k) => { disc.scale.setScalar(R * k); mat.opacity = 0.2 + 0.25 * k; } });
    this._ring(at, R, R, T, 0xff2a2a);
    this._later(T, () => {
      if (!this.boss || this.boss !== m) return;
      this._glowFlash(at, 6, 0xff5a3a, 0.4, 0.6);
      this._wall(at, 0.5, R + 1, 1.6, 0xff4d2a, 0.45);
      for (let i = 0; i < 5; i++) this._spike({ x: at.x + rand(-R, R) * 0.7, z: at.z + rand(-R, R) * 0.7 }, 0x5a3a3a, 0.6, 1);
      if (m.model) { // 吸血鬼：衝刺一下再回到待機
        m.model.play('RunFast', { fade: 0.1 });
        this._later(0.5, () => m.model.play('Alert', { fade: 0.25 }));
      } else {
        m.body.scale.set(4.6, 3.6, 4.6);
        this._later(0.15, () => m.body.scale.setScalar(4.2));
      }
      const pos = this.player.group.position;
      const dd = flat(pos, at);
      if (dd < R + 0.4 && !this.duel) { // 被砸中：擊退 + 暈眩
        const ang = Math.atan2(pos.x - at.x, pos.z - at.z) || rand(0, 6.28);
        this.moveLocalTo(pos.x + Math.sin(ang) * 4.5, pos.z + Math.cos(ang) * 4.5);
        this.stunT = 0.9;
        this._number(pos, '暈眩！', 'hurt', 1.2);
        this.shake = Math.max(this.shake, 0.5);
        this._screenFlash('255,80,60');
        vibrate([60, 40, 60]);
      } else if (dd < 12) {
        this.shake = Math.max(this.shake, 0.2);
      }
    });
  }

  // ── 魔物潮（3 分鐘生存挑戰）───────────────
  // 營地暫停；怪從玩家四周一波波湧來，每 20 秒一波：數量更多、血更厚、菁英更多
  setTrial(info) {
    if (!info) {
      if (this.trial) {
        for (const m of this.mobs) if (m.trial && m.alive) { this.qfx.flash(m.group.position, 1.6, 0xb98cff, 0.3, 0.8); this._removeMob(m); m.alive = false; m.dying = 0; }
        this.mobs = this.mobs.filter((m) => !m.trial);
      }
      this.trial = null;
      return;
    }
    if (this.trial?.endsAt === info.endsAt) return;
    this.trial = { endsAt: info.endsAt, start: info.endsAt - info.sec * 1000, wave: 0, spawnT: 0 };
  }

  _updateTrial(dt) {
    const T = this.trial, now = Date.now();
    if (now > T.endsAt) return;
    const wave = Math.min(9, Math.floor((now - T.start) / 20000) + 1);
    const P = this.player.group.position;
    if (wave !== T.wave) { // 新的一波：地面魔法陣 + 衝擊波
      T.wave = wave;
      this._number(P, `第 ${wave} 波！`, 'fever', 0.9);
      this.qfx.rune(P, 8, 0xb98cff, 1.4, 2);
      this.qfx.shock(P, 14, 0xd8b4fe, 0.7);
      this.qfx.light(P, 0xb98cff, 40, 0.6, 24);
    }
    T.spawnT -= dt;
    const alive = this.mobs.filter((m) => m.trial && m.alive).length;
    if (T.spawnT <= 0 && alive < 60 + wave * 6 && this.mobs.length < 130) {
      T.spawnT = 1 / (2.5 + wave * 0.9);
      const a = rand(0, Math.PI * 2), r = rand(11, 16);
      const x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
      const at = { x, z };
      if (this.world && !this.world.crossesWater(P.x, P.z, x, z)) { // 隔著河的位置不生（怪過不來）
        this._spawnMob(-1, { x, z, elite: Math.random() < 0.05 + wave * 0.012, hpMul: 1 + (wave - 1) * 0.3 });
        if (Math.random() < 0.3) this.qfx.flash(at, 1.4, 0xb98cff, 0.3, 0.6); // 從紫霧裡冒出來
      }
    }
  }

  // ── 寵物 ───────────────────────────────
  setPetDefs(defs) { this.petDefs = defs || {}; }
  setPet(id, lv = 1) {
    const def = id ? this.petDefs?.[id] : null;
    if ((this.pet?.def.id ?? null) === (def?.id ?? null) && this.pet?.lv === lv) return;
    this.pet?.dispose();
    this.pet = def ? new Pet(this, def, this.player, lv) : null;
  }

  // ── 莊園：依佈局在 12 塊地上蓋建築 ──────────
  setManor(view) {
    this.manorView = view; // 記住：換地圖（setMap）之後再蓋一次
    this._clearManor();
    if (!view || !this.map?.manor) return;
    this.manorGroup = new THREE.Group();
    view.plots.forEach((b, i) => {
      const g = createPlot(b, i);
      g.position.y = this.gy(g.position.x, g.position.z);
      this.manorGroup.add(g);
    });
    this.scene.add(this.manorGroup);
    this._shadowify(this.manorGroup);
    this.manorGroup.traverse((o) => { if (o.isMesh && o.geometry.type === 'BoxGeometry' && o.position.y < 0.1) o.receiveShadow = true; });
    this.manorFxT = 0;
  }
  _clearManor() {
    if (!this.manorGroup) return;
    this.scene.remove(this.manorGroup);
    this.manorGroup.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
    this.manorGroup = null;
  }
  _updateManor(dt) {
    if (!this.manorGroup) return;
    this.manorGroup.traverse((o) => { if (o.userData.spin) { o.rotation.y += dt * 1.5; o.position.y += Math.sin(this.time * 2) * 0.002; } });
    this.manorFxT -= dt;
    if (this.manorFxT <= 0) { // 生產建築偶爾冒光（金礦金光、精華泉藍光）
      this.manorFxT = 0.6;
      for (const g of this.manorGroup.children) {
        if (Math.random() > 0.25) continue;
        const p = g.position;
        this.qfx.sparks({ x: p.x, z: p.z }, 2, Math.random() < 0.5 ? 0xffd166 : 0x9be7ff, 2, 0.8, { y: 1.5, up: 2 });
      }
    }
  }

  // ── 夥伴 ───────────────────────────────
  // 還沒帶出門 → 在村莊酒館門口；帶出門 → 跟著自己（任何地圖）
  static TAVERN_SPOT = { x: -11, z: 3.2 };
  setPartnerDefs(defs) { this.partnerDefs = defs || {}; }
  setPartner({ out = null, recruited = [], lv = 1 } = {}) {
    this.partnerState = { out, recruited, lv };
    this._rebuildPartner();
  }
  _rebuildPartner() {
    const st = this.partnerState;
    this.partner?.dispose(); this.partner = null;
    if (!st || !this.map) return;
    const defs = this.partnerDefs || {};
    if (st.out && defs[st.out]) this.partner = new Partner(this, defs[st.out], this.player, 'follow', null, st.lv);
    else if (this.map.town && st.recruited[0] && defs[st.recruited[0]]) {
      this.partner = new Partner(this, defs[st.recruited[0]], null, 'home', BattleScene.TAVERN_SPOT);
    }
  }

  // ── 翅膀（純外觀） ─────────────────────
  setWingDefs(defs) { this.wingDefs = defs || {}; }
  setWing(id, lv) { setHeroWings(this.player.hero, id ? this.wingDefs[id] : null, lv || 1); }

  // ── 坐騎 ───────────────────────────────
  setMountDefs(defs) { this.mountDefs = defs || {}; }

  /** 換出戰坐騎（id 或 null） */
  setMount(id) {
    this._setActorMount(this.player, id);
    this._applyRide(this.player, this.wantRide && !!id && !this.duel);
  }

  /** 騎 / 下馬；回傳實際狀態（沒坐騎、決鬥中不能騎） */
  setRiding(on) {
    this.wantRide = !!on;
    const P = this.player;
    const can = !!P.mount && !this.duel;
    const next = this.wantRide && can;
    if (next !== P.riding) {
      this._applyRide(P, next);
      this._rideFx(P);
    }
    return P.riding;
  }

  _setActorMount(a, id) {
    const def = id ? this.mountDefs[id] : null;
    if ((def?.id ?? null) === a.mountId) return;
    if (a.mount) {
      if (a.hero.root.parent === a.mount.seat) a.group.add(a.hero.root);
      a.group.remove(a.mount.root);
      disposeMount(a.mount);
    }
    a.mount = def ? createMount(def) : null;
    a.mountId = def?.id ?? null;
    a.mountSpeed = def?.speed ?? 1;
    if (a.mount) {
      a.mount.root.visible = false;
      a.group.add(a.mount.root);
    }
    if (a.riding) this._applyRide(a, !!a.mount);
  }

  /** 角色坐到坐騎鞍上 / 下來 */
  _applyRide(a, on) {
    a.riding = !!on && !!a.mount;
    const h = a.hero.root;
    if (a.riding) {
      a.mount.root.visible = true;
      a.mount.seat.add(h);
      h.position.set(0, -a.hero.hipY - 0.03, -0.05);
    } else {
      if (a.mount) a.mount.root.visible = false;
      a.group.add(h);
      h.position.set(0, 0, 0);
    }
    const k = a.riding ? 1.6 : 1;
    a.ring.scale.setScalar(1.05 * k);
    a.aura.scale.setScalar(k);
  }

  _rideFx(a) {
    const pos = a.group.position;
    if (a.riding && a.mount?.def.model === 'dragon') { // 召喚神龍：魔法陣 + 光柱 + 雲霧（three.quarks）
      this.qfx.rune(pos, 4, 0x5ee7ff, 1.2, 2);
      this.qfx.beam(pos, 1.2, 10, 0xf2d27a, 0.7);
      this.qfx.shock(pos, 5, 0x8ff3ff, 0.5);
      for (let i = 0; i < 3; i++) this.qfx.dragonTrail(pos, 1 + i * 0.6);
    }
    this._ring(pos, 0.4, 3, 0.4, 0xf3e3c0);
    this._glowFlash(pos, 3, a.riding ? 0xfff1c4 : 0xffffff, 0.35, 0.8);
    for (let i = 0; i < 10; i++) this._particle(pos, 0xb89a6a);
  }

  setSkills(defs, loadout) {
    this.skillDefs = defs || {};
    this.loadout = loadout || [];
  }

  /** basic 是各武器的強力普攻，其他是伺服器定義的技能 */
  _cdOf(id) {
    return id === 'basic' ? styleOf(this.player.wtype).basic.cd : this.skillDefs[id]?.cd ?? 5;
  }

  setMap(map) {
    if (this.map?.id === map.id) { this.map = map; return; }
    this.map = map;
    const def = map.manor ? MAP_DEFS.manor : map.town ? MAP_DEFS.town : MAP_DEFS[map.id] ?? MAP_DEFS[0];
    this.manorOwner = map.manor ? map.ownerId : null;
    this._clearManor();
    this.def = def;
    this.endDuel(true);
    for (const m of this.mobs) this._removeMob(m);
    this.mobs = [];
    for (const c of this.coins) this.scene.remove(c.mesh);
    this.coins = [];
    this.killReport = { kills: 0, elites: 0, bossDmg: 0, raidDmg: 0 };

    // 蓋新地圖
    this.world?.dispose(this.scene);
    this.world = new World(def);
    this.world.build(this.scene, this.items);
    this.campState = this.world.camps.map(() => ({ count: 0, timer: 0, spawned: 0 }));
    this.mini = this.world.minimapBase(200);

    // 天空、霧、光線
    const sky = new THREE.Color(def.sky);
    this.scene.background = sky;
    this.scene.fog.color.set(def.fog[0]);
    this.scene.fog.near = def.fog[1];
    this.scene.fog.far = def.fog[2];
    this.hemi.color.set(def.hemi[0]);
    this.hemi.groundColor.set(def.hemi[1]);
    // 半球光（天空／地面補光）調弱、太陽調強：明暗對比更清楚，不再一片平
    this.hemi.intensity = def.hemi[2] * 0.62;
    this.sun.color.set(def.sun[0]);
    this.sun.intensity = def.sun[1] * 1.6;
    this.fill.color.set(def.hemi[0]);
    this._shadowWorld();

    this._mobLook(def.mob);
    this._buildTown(!!def.town);
    this._rebuildPartner(); // 換地圖：夥伴跟過來 / 回到酒館
    if (map.manor && this.manorView) this.setManor(this.manorView); // 莊園建築
    const sp = def.spawn;
    this.player.group.position.set(sp.x + rand(-2, 2), 0, sp.z + rand(-1, 1));
    this.player.facing = Math.PI; // 面向北方（地圖深處）
    this.player.group.rotation.y = Math.PI;
    this.camFocus.copy(this.player.group.position);
  }

  /** 每張地圖的怪物長相 */
  _mobLook(mob) {
    this.mobColor = mob.color;
    this.mobShape = mob.shape;
    this.mobGeo?.dispose();
    this.mobGeo = {
      slime: () => new THREE.SphereGeometry(0.62, 14, 10).scale(1, 0.8, 1),
      beetle: () => new THREE.DodecahedronGeometry(0.62, 0).scale(1.15, 0.75, 1.35),
      spirit: () => new THREE.OctahedronGeometry(0.62, 0).scale(1, 1.3, 1),
      sentinel: () => new THREE.IcosahedronGeometry(0.6, 0).scale(1, 1.15, 1), // 烈陽守衛：漂浮的金色晶體
    }[mob.shape]();
    this.partMat?.dispose();
    this.partMat = new THREE.MeshBasicMaterial({ color: mob.color });
    this.hornGeo ??= new THREE.ConeGeometry(0.12, 0.55, 5);
    this.shardGeo ??= new THREE.OctahedronGeometry(0.16, 0).scale(0.6, 1.6, 0.6);
  }

  /** 伺服器收益用：拿走累積的擊殺數 */
  takeKillReport() {
    const r = this.killReport;
    this.killReport = { kills: 0, elites: 0, bossDmg: 0, raidDmg: 0 };
    return r;
  }

  setAuto(v) { this.auto = v; }

  setJoystick(x, y, active) {
    this.joy.x = x; this.joy.y = y; this.joy.active = active;
    if (!active) this.manualUntil = this.time + 1.2;
  }

  getCooldowns() {
    const out = {};
    for (const k of ['basic', ...this.loadout]) out[k] = (this.cool[k] || 0) / this._cdOf(k);
    return out;
  }

  /** 連線層每 0.1 秒取一次自己的位置 */
  getNetState() {
    const p = this.player;
    return { x: +p.group.position.x.toFixed(2), z: +p.group.position.z.toFixed(2), ry: +p.facing.toFixed(2), mv: p.moving ? 1 : 0, rd: p.riding ? 1 : 0, mz: this.manorOwner ?? null };
  }

  castSkill(id) {
    if (!this.map || this.map.town || (this.cool[id] || 0) > 0) return false; // 村莊不能出招
    if (id !== 'basic' && !this.loadout.includes(id)) return false;
    if (this.duel && performance.now() < this.duel.startAt) return false;
    if (this.stunT > 0) return false;
    this.cool[id] = this._cdOf(id);
    this._skill(this.player, id);
    this.onFx?.(id);
    if (this.duel) this.onHit?.(id);
    return true;
  }

  levelUp() {
    const p = this.player.group.position;
    const mat = new THREE.MeshBasicMaterial({ color: 0xf5c04a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(this.pillarGeo, mat);
    m.position.copy(p);
    this.scene.add(m);
    this.effects.push({ mesh: m, t: 0, life: 0.9, update: (e, k) => { m.position.copy(this.player.group.position); const r = 0.9 - k * 0.6; m.scale.set(r, 1, r); mat.opacity = 0.35 * (1 - k); } });
    this._ring(p, 0.5, 6, 0.8, 0xf5c04a);
    this._number(p, 'LEVEL UP', 'lvl');
  }

  // ── 朋友（多人同地圖） ─────────────────────
  /** list: 伺服器送來的同地圖其他玩家 */
  setRemotePlayers(list) {
    const seen = new Set();
    for (const r of list.slice(0, 15)) {
      seen.add(r.id);
      let a = this.remotes.get(r.id);
      if (!a) {
        a = this._makeActor(false);
        a.id = r.id;
        a.group.position.set(r.x, 0, r.z);
        a.target = { x: r.x, z: r.z, ry: r.ry };
        a.tag = document.createElement('div');
        a.tag.className = 'name-tag';
        this.overlay.appendChild(a.tag);
        this.remotes.set(r.id, a);
      }
      a.target = { x: r.x, z: r.z, ry: r.ry };
      a.netMoving = !!r.mv;
      a.atk = r.atk;
      a.dpsMul = r.atk > 0 ? r.dps / (r.atk * 5) : 1;
      const key = JSON.stringify(r.equipped) + Object.keys(this.items).length; // 裝備資料表載入後也要重套
      if (key !== a.equipKey) {
        a.equipKey = key;
        applyEquipment(a.hero, r.equipped, this.items);
        a.wtype = a.hero.wtype;
      }
      setHeroWings(a.hero, r.wing ? this.wingDefs[r.wing] : null, r.wingLv || 1);
      const petDef = r.pet ? this.petDefs?.[r.pet] : null; // 朋友的寵物
      if ((a.pet?.def.id ?? null) !== (petDef?.id ?? null)) { a.pet?.dispose(); a.pet = petDef ? new Pet(this, petDef, a, r.petLv || 1) : null; }
      const pdef = r.partner && !r.duel ? this.partnerDefs?.[r.partner] : null;
      if ((a.partner?.def.id ?? null) !== (pdef?.id ?? null) || (pdef && a.partner.lv !== (r.partnerLv || 1))) {
        a.partner?.dispose();
        a.partner = pdef ? new Partner(this, pdef, a, 'follow', null, r.partnerLv || 1) : null;
      }
      // 朋友的坐騎：外觀跟著出戰坐騎換，騎乘狀態跟著網路
      this._setActorMount(a, r.mount || null);
      const rd = !!r.rd && !!a.mount;
      if (rd !== a.riding) { this._applyRide(a, rd); this._rideFx(a); }
      const label = `${r.name} <span>Lv.${r.level} · ${styleOf(a.wtype).name}</span>`;
      if (a.tag.innerHTML !== label) a.tag.innerHTML = label;
    }
    for (const [id, a] of this.remotes) {
      if (seen.has(id)) continue;
      if (a.mount) disposeMount(a.mount);
      a.partner?.dispose();
      a.pet?.dispose();
      removeOrbitBlades(this, a);
      this.scene.remove(a.group);
      a.tag.remove();
      this.remotes.delete(id);
    }
  }

  // ── 村莊 ─────────────────────────────────
  _buildTown(on) {
    for (const n of this.npcs) { this.scene.remove(n.group); n.tag.remove(); }
    this.npcs = [];
    this.nearNpc = null;
    this.walkTarget = null;
    this.onNpcNear?.(null);
    if (!on) return;

    for (const def of NPCS) {
      const g = new THREE.Group();
      g.position.set(def.x, this.gy(def.x, def.z), def.z);
      let hero = null;
      if (def.look) {
        hero = createHero({ model: false });
        applyEquipment(hero, def.look, this.items);
        hero.root.rotation.y = def.x < 0 ? 0.6 : def.x > 0 ? -0.6 : 0; // 面向廣場
        g.add(hero.root);
      }
      const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xf5c04a, transparent: true, opacity: 0.6, depthWrite: false }));
      ring.scale.setScalar(1.4); ring.position.y = 0.05;
      g.add(ring);
      this.scene.add(g);
      const tag = document.createElement('div');
      tag.className = 'npc-tag';
      tag.innerHTML = `${def.icon} ${def.name}`;
      this.overlay.appendChild(tag);
      this.npcs.push({ ...def, group: g, hero, ring, tag });
    }
  }

  /** 自動走到 NPC 身邊（點畫面上的 NPC 名字） */
  walkTo(npcId) {
    this.walkTarget = this.npcs.find((n) => n.id === npcId) ?? null;
  }

  // ── PvP 決鬥 ─────────────────────────────
  startDuel(info) {
    this.endDuel(true);
    const ar = this.def?.arena ?? { x: 0, z: 0 };
    this.duel = { oppId: info.opp, startAt: performance.now() + info.countdown, radius: info.arena, cx: ar.x, cz: ar.z }; // 用真實時間倒數
    for (const m of this.mobs) this._removeMob(m);
    this.mobs = [];
    for (const c of this.coins) this.scene.remove(c.mesh);
    this.coins = [];
    const p = this.player;
    if (p.riding) this._applyRide(p, false); // 決鬥不能騎乘
    this.feverTime = 0;
    p.feverTime = 0;
    p.group.position.set(ar.x + info.spawn.x, 0, ar.z + info.spawn.z);
    p.facing = info.spawn.ry;
    p.group.rotation.y = info.spawn.ry;
    this.camFocus.copy(p.group.position);
    for (const k in this.cool) this.cool[k] = 0;
    // 競技場：紅色邊界 + 地面光暈
    const g = new THREE.Group();
    g.position.set(ar.x, this.gy(ar.x, ar.z) + 0.15, ar.z);
    const edge = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.9, depthWrite: false }));
    edge.scale.setScalar(info.arena);
    edge.position.y = 0.05;
    const floor = new THREE.Mesh(this.discGeo, new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.08, depthWrite: false }));
    floor.scale.setScalar(info.arena);
    floor.position.y = 0.03;
    // 四根火把標示場地
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const torch = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 2.4, 6), new THREE.MeshLambertMaterial({ color: '#5a3d22' }));
      torch.position.set(Math.cos(a) * (info.arena + 0.6), 1.2, Math.sin(a) * (info.arena + 0.6));
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 6), new THREE.MeshBasicMaterial({ color: '#ff8a3a' }));
      flame.position.set(torch.position.x, 2.7, torch.position.z);
      g.add(torch, flame);
    }
    g.add(edge, floor);
    this.scene.add(g);
    this.arena = g;
  }

  endDuel(silent = false) {
    if (this.arena) {
      this.arena.traverse((o) => { o.material?.dispose(); });
      this.scene.remove(this.arena);
      this.arena = null;
    }
    if (!this.duel) return;
    this.duel = null;
    if (this.wantRide && this.player.mount) this._applyRide(this.player, true);
    if (!silent && this.def) this.player.group.position.set(this.def.spawn.x + rand(-2, 2), 0, this.def.spawn.z);
  }

  /** 伺服器判定打中 → 在被打的人身上跳數字 */
  showDuelHit(hit, myId) {
    const toMe = hit.to === myId;
    const target = toMe ? this.player : this.remotes.get(hit.to);
    if (!target) return;
    const pos = target.group.position;
    this._number(pos, fmt(hit.dmg), toMe ? 'hurt' : hit.crit ? 'crit' : 'dmg');
    if (toMe) {
      this.shake = Math.max(this.shake, hit.dmg > 0 ? 0.12 : 0);
      vibrate(10);
    } else {
      this._ring(pos, 0.3, 1.6, 0.2, 0xffffff);
    }
  }

  _duelOpp() {
    return this.duel ? this.remotes.get(this.duel.oppId) : null;
  }

  /** 朋友出招 */
  remoteFx(id, kind, x, z, ry) {
    const a = this.remotes.get(id);
    if (!a || !this.map) return;
    if (Number.isFinite(x)) {
      a.group.position.set(x, this.gy(x, z), z); // 出招時把位置對齊，特效才會在正確位置
      a.facing = ry;
      a.group.rotation.y = ry;
    }
    if (kind === 'atk') this._attack(a);
    else if (kind === 'fever') { a.feverTime = FEVER_TIME; this._feverBurst(a); }
    else if (kind === 'basic' || this.skillDefs[kind]) this._skill(a, kind);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.getDelta();
    this.raf = requestAnimationFrame(this._loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  dispose() {
    this.qfx.dispose();
    this.stop();
    this.world?.dispose(this.scene);
    this.world = null;
    this.ro.disconnect();
    this.scene.traverse((o) => {
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => { m?.map?.dispose(); m?.dispose(); });
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.overlay.innerHTML = '';
  }

  // ── 招式（自己和朋友共用） ─────────────────
  /** 每秒對單隻怪的傷害（三種武器相同） */
  _dps(a) { return a.atk * a.dpsMul; }

  _later(delay, fn) { this.timers.push({ at: this.time + delay, fn }); }

  _attack(a) {
    const st = styleOf(a.wtype);
    const pos = a.group.position;
    triggerSwing(a.hero);
    const fever = a.feverTime > 0;
    if (a.wtype === 'staff') { // 星彈：從杖頭飛向最近的敵人，落點小範圍爆炸
      const t = this.targetsNear(a, st.radius + 0.5, 1)[0];
      if (!t) return;
      this._starBolt(a, t, this._dps(a) * st.interval, fever ? 0xffe08a : st.color, 2.2);
      return;
    }
    if (a.wtype === 'katana') {
      this._lineSlash(a, pos, a.facing, st.radius + 1.6, 2.2, this._dps(a) * st.interval, fever ? 0xffe08a : st.color, 0.18);
      this._crescent(pos, a.facing, st.radius * 0.8, fever ? 0xffe08a : st.color, 0.16, { arc: 1.6, sweep: 1.2, tilt: 0.3 });
    } else if (a.wtype === 'dual') {
      a.dualFlip = !a.dualFlip;
      const c = a.demonTime > 0 ? 0xff3030 : fever ? 0xffc040 : 0xff8a9a;
      this._crescent(pos, a.facing + (a.dualFlip ? 0.5 : -0.5), st.radius, c, 0.14, { arc: 2.4, sweep: a.dualFlip ? -1.6 : 1.6, tilt: a.dualFlip ? 0.4 : -0.4 });
    } else {
      this._crescent(pos, a.facing, st.radius, fever ? 0xffe08a : st.color, 0.24, { arc: 3.2, sweep: 2, tilt: -0.5 });
      this._ring(pos, 0.4, st.radius, 0.2, st.color);
    }
    this._damageArea(a, pos, st.radius, this._dps(a) * st.interval);
  }

  _skill(a, id) {
    if (id !== 'basic') return castSkillFx(this, a, id);
    const pos = a.group.position;
    const b = this._dps(a);
    if (a.wtype === 'staff') { // 星芒：同時射向最近 3 個敵人
      triggerSwing(a.hero);
      const ts = this.targetsNear(a, 9, 3);
      ts.forEach((t, i) => this._later(i * 0.05, () => this._starBolt(a, t, b * 0.6, 0xc9f2ff, 2.4)));
      if (!ts.length) this.qfx.flash(pos, 1.5, 0x9be7ff, 0.2, 1.4);
      return;
    }
    if (a.wtype === 'katana') { // 居合：前方一道長斬
      triggerSwing(a.hero);
      this._lineSlash(a, pos, a.facing, 7.5, 2.6, b * 0.65, 0xffffff, 0.28);
      this._streak(pos, { x: pos.x + Math.sin(a.facing) * 7.5, z: pos.z + Math.cos(a.facing) * 7.5 }, 0xc7f0ff, 0.25, 0.25);
    } else if (a.wtype === 'dual') { // 亂舞：四連擊
      for (let i = 0; i < 4; i++) this._later(i * 0.07, () => {
        triggerSwing(a.hero);
        this._crescent(pos, a.facing + (i % 2 ? 0.6 : -0.6), 3.4, 0xff7a8a, 0.13, { arc: 2.4, sweep: i % 2 ? -2 : 2, tilt: i % 2 ? 0.5 : -0.5 });
        this._damageArea(a, pos, 3.4, b * 0.13);
      });
    } else { // 大劍：斬擊
      triggerSwing(a.hero);
      this._crescent(pos, a.facing, 4.8, 0xffe7a3, 0.3, { arc: 3.2, sweep: 2.4, tilt: -0.6 });
      this._ring(pos, 0.5, 4.8, 0.25, 0xffe7a3);
      if (a.local) this._sparks(pos, 4, 0xffe7a3, 6, 0.4);
      this._damageArea(a, pos, 4.8, b * 0.8);
    }
  }

  // ── 給 skills.js 用的小工具 ──
  vib(p) { vibrate(p); }

  /** 只移動自己（技能瞬移 / 跳躍），會被地圖和競技場邊界擋住 */
  moveLocalTo(x, z) {
    const pos = this.player.group.position;
    if (this.world) this.world.teleport(pos, x, z);
    this._keepInArena(pos);
  }

  _keepInArena(pos) {
    if (!this.duel) return;
    const dx = pos.x - this.duel.cx, dz = pos.z - this.duel.cz;
    const r = Math.hypot(dx, dz), max = this.duel.radius - 0.8;
    if (r > max) { pos.x = this.duel.cx + (dx * max) / r; pos.z = this.duel.cz + (dz * max) / r; }
  }

  /** 附近的目標位置（怪物，決鬥時是對手） */
  targetsNear(a, radius, n) {
    if (this.duel) {
      const foe = a.local ? this._duelOpp()?.group.position : this.player.group.position;
      return foe ? [{ x: foe.x, z: foe.z }] : [];
    }
    const p = a.group.position;
    return this.mobs.filter((m) => m.alive && flat(m.group.position, p) < radius)
      .sort((m1, m2) => flat(m1.group.position, p) - flat(m2.group.position, p))
      .slice(0, n).map((m) => ({ x: m.group.position.x, z: m.group.position.z }));
  }

  _bigImpact(shake = 0.7) {
    this.shake = shake;
    this.flashEl.classList.remove('on'); void this.flashEl.offsetWidth; this.flashEl.classList.add('on');
    vibrate([60, 30, 120]);
  }

  _bolts(a, n, radius, dmg, color) {
    const pos = a.group.position;
    let targets;
    if (this.duel) { // 決鬥：雷落在對手身邊
      const foe = a.local ? this._duelOpp()?.group.position : this.player.group.position;
      if (foe) targets = Array.from({ length: Math.ceil(n / 2) }, () => new THREE.Vector3(foe.x + rand(-1.2, 1.2), 0, foe.z + rand(-1.2, 1.2)));
    }
    const near = this.mobs.filter((m) => m.alive && flat(m.group.position, pos) < 15)
      .sort(() => Math.random() - 0.5).slice(0, n);
    targets ??= near.length ? near.map((m) => m.group.position.clone())
      : Array.from({ length: 5 }, () => new THREE.Vector3(pos.x + rand(-6, 6), 0, pos.z + rand(-6, 6)));
    targets.forEach((p, i) => this._later(i * 0.07, () => {
      this._bolt(p, color, a.local);
      this._damageArea(a, p, radius, dmg);
    }));
  }

  _damageArea(a, center, radius, dmg) {
    let hits = 0;
    for (const m of this.mobs) {
      if (!m.alive) continue;
      if (flat(m.group.position, center) <= radius + m.radius) {
        this._hit(a, m, dmg);
        hits++;
      }
    }
    return hits;
  }

  /** 直線斬擊判定 + 一道發光刀光 */
  _lineSlash(a, origin, angle, length, width, dmg, color, life) {
    const dx = Math.sin(angle), dz = Math.cos(angle);
    for (const m of this.mobs) {
      if (!m.alive) continue;
      const rx = m.group.position.x - origin.x, rz = m.group.position.z - origin.z;
      const along = rx * dx + rz * dz;
      const side = Math.abs(rx * dz - rz * dx);
      if (along > -0.5 && along < length && side < width / 2 + m.radius) this._hit(a, m, dmg);
    }
    // 斬擊光帶（three.quarks）
    this.qfx.streak(origin, { x: origin.x + dx * length, z: origin.z + dz * length }, color, life, width * 0.6);
    this.qfx.sparks({ x: origin.x + dx * length * 0.6, z: origin.z + dz * length * 0.6 }, 3, color, 4, 0.3);
  }

  _hit(a, m, base) {
    const critRate = (a.wtype === 'katana' ? 0.3 : 0.2) + (a.buffs.crit > 0 ? 0.3 : 0);
    const crit = Math.random() < critRate;
    const buff = (a.buffs.dmg > 0 ? 1.3 : 1) * (a.buffs.venom > 0 ? 1.4 : 1) * (a.feverTime > 0 ? 1.25 : 1);
    const dmg = base * buff * rand(0.85, 1.15) * (crit ? 2 : 1);
    m.hp -= dmg;
    m.flash = 0.12;
    const p = a.group.position;
    if (!m.boss) {
      tmpV.set(m.group.position.x - p.x, 0, m.group.position.z - p.z).normalize().multiplyScalar(m.elite ? 0.1 : 0.35);
      if (this.world) this.world.move(m.group.position, tmpV.x, tmpV.z, m.radius);
    }
    if (a.local) m.touched = true; // 自己有打到 → 擊殺算自己一份
    m.bar.visible = true;
    if (m.boss && a.local) this.killReport[m.raid ? 'raidDmg' : 'bossDmg'] += dmg;
    if (a.local) {
      // 數字大小跟「這一下有多痛」走：普攻小、技能大、暴擊更大
      const ratio = dmg / Math.max(1, this._dps(this.player) * 0.8);
      const size = Math.min(2.1, Math.max(0.8, 0.8 + 0.32 * Math.log2(1 + ratio)));
      this._number(m.group.position, fmt(dmg), crit ? 'crit' : m.boss ? 'boss' : 'dmg', size);
      if (crit && Math.random() < 0.5) this._sparks(m.group.position, 2, 0xffd166, 5, 0.3);
    }
    else if (Math.random() < 0.35) this._number(m.group.position, fmt(dmg), 'ally');
    if (m.hp <= 0) this._kill(m, a.local);
  }

  _kill(m, byLocal) {
    m.alive = false;
    m.dying = 0.35;
    m.bar.visible = false;
    if (m.camp >= 0 && this.campState[m.camp]) this.campState[m.camp].count -= 1;
    if (m.touched && !this.duel && !this.map.town) {
      if (m.elite) this.killReport.elites += 1; else this.killReport.kills += 1;
    }
    if (byLocal) {
      this.combo++;
      this.comboTimer = 2.5;
      if (!this.duel && !this.map.town && this.feverTime <= 0) {
        this.fever = Math.min(1, this.fever + (m.elite ? FEVER_PER_ELITE : FEVER_PER_KILL));
        if (this.fever >= 1) this._feverStart();
      }
    }
    const pos = m.group.position;
    for (let i = 0; i < (m.elite ? 14 : 6); i++) this._particle(pos);
    const coins = m.elite ? 10 : Math.random() < 0.6 ? 2 : 1;
    for (let i = 0; i < coins; i++) this._coin(pos);
    if (m.elite) { if (byLocal) vibrate(40); this._ring(pos, 0.5, 4, 0.5, 0xffd166); }
  }

  // ── 怪物 ───────────────────────────────────
  _actors() {
    return [this.player, ...this.remotes.values()];
  }

  /** 在營地生一隻怪 */
  /** opt（魔物潮用）：{ x, z, elite, hpMul }，不屬於任何營地 */
  _spawnMob(campIdx, opt = null) {
    const camp = opt ? null : this.world.camps[campIdx];
    const st = opt ? null : this.campState[campIdx];
    if (st) st.spawned += 1;
    const elite = opt ? opt.elite : camp.elite ? st.spawned % 3 === 1 : st.spawned % 12 === 0;
    const { x, z } = opt ?? this.world.randomInCamp(camp);

    const g = new THREE.Group();
    // 有模型就用 Meshy 的巨魔（皮膚顏色跟著地圖換），沒有就用程式做的怪
    const model = monsterReady('troll') ? createMonster('troll', 1.85, this.mobColor) : null;
    const mat = model ? model.mats[0] : new THREE.MeshLambertMaterial({ color: this.mobColor, flatShading: true, emissive: elite ? 0x552200 : 0x000000 });
    const body = model ? model.root : new THREE.Mesh(this.mobGeo, mat);
    if (!model) body.position.y = 0.6;
    const face = new THREE.Group();
    face.position.set(0, 0.12, this.mobShape === 'beetle' ? 0.78 : 0.48);
    for (const sx of [-0.22, 0.22]) {
      const eye = new THREE.Mesh(this.eyeGeo, this.mobShape === 'beetle' ? this.partMat : this.eyeMat);
      eye.position.x = sx;
      const pupil = new THREE.Mesh(this.pupilGeo, this.pupilMat);
      pupil.position.set(sx, 0, 0.09);
      face.add(eye, pupil);
    }
    if (!model) body.add(face);
    const extras = [];
    if (model) { /* 模型怪不需要程式做的角 / 晶片 */ } else if (this.mobShape === 'beetle') { // 熔岩甲獸：兩根角
      for (const sx of [-0.3, 0.3]) {
        const horn = new THREE.Mesh(this.hornGeo, this.pupilMat);
        horn.position.set(sx, 0.45, 0.55);
        horn.rotation.x = 0.7;
        body.add(horn);
      }
    } else if (this.mobShape === 'spirit' || this.mobShape === 'sentinel') { // 冰靈 / 烈陽守衛：繞身晶片
      for (let i = 0; i < 3; i++) {
        const shard = new THREE.Mesh(this.shardGeo, mat);
        extras.push(shard);
        g.add(shard);
      }
    }
    const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    shadow.scale.setScalar(1.5);
    shadow.position.y = 0.02;

    const bar = new THREE.Group();
    bar.position.y = model ? 2.25 : 1.65;
    const bg = new THREE.Mesh(this.barGeo, this.barBgMat);
    const fill = new THREE.Mesh(this.barFillGeo, this.barFillMat);
    fill.position.set(-0.5, 0, 0.001);
    bg.renderOrder = fill.renderOrder = 10;
    bar.add(bg, fill);
    bar.visible = false;

    g.add(body, shadow, bar);
    const scale = elite ? 1.8 : rand(0.85, 1.1);
    g.scale.setScalar(scale);
    g.position.set(x, this.gy(x, z), z);
    g.rotation.y = rand(0, Math.PI * 2);
    this.scene.add(g);

    const hp = this.map.monsterHp * (elite ? 10 : 1) * (opt?.hpMul ?? 1);
    if (st) st.count += 1;
    this.mobs.push({
      group: g, body, mat, bar, fill, elite, alive: true, dying: 0, extras, camp: opt ? -1 : campIdx, model, trial: !!opt,
      hp, maxHp: hp, flash: 0, hop: rand(0, 6), speed: rand(1.2, 2), radius: 0.6 * scale,
      spawnT: 0, wander: null, wanderT: 0,
    });
  }

  _removeMob(m) {
    this.scene.remove(m.group);
    if (m.model) m.model.dispose(); else m.mat.dispose();
    m.tag?.remove();
    if (m === this.boss) this.boss = null;
    if (m === this.raidBoss) this.raidBoss = null;
  }

  // ── 特效 ───────────────────────────────────
  _ring(pos, from, to, life, color) { this.qfx.ring(pos, from, to, life, color); }

  _disc(pos, size, life, color) { this.qfx.disc(pos, size, life, color); }

  _bolt(pos, color = 0xbfe6ff, shake = true) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(this.boltGeo, mat);
    mesh.position.set(pos.x, this.gy(pos.x, pos.z), pos.z);
    this.scene.add(mesh);
    this.effects.push({ mesh, t: 0, life: 0.3, update: (e, k) => { mat.opacity = k < 0.3 ? 1 : 1 - k; mesh.scale.set(1 - k * 0.6, 1, 1 - k * 0.6); } });
    this._ring(pos, 0.3, 2.6, 0.35, color);
    if (shake) this.shake = Math.max(this.shake, 0.15);
  }

  _particle(pos, color) {
    const mat = color ? this._fxMat(color, 'solid') : this.partMat;
    const mesh = new THREE.Mesh(this.partGeo, mat);
    mesh.position.set(pos.x, this.gy(pos.x, pos.z) + 0.6, pos.z);
    this.scene.add(mesh);
    this.particles.push({ mesh, t: 0, life: 0.6, g: 22, spin: 10, v: new THREE.Vector3(rand(-4, 4), rand(4, 8), rand(-4, 4)) });
  }

  // ═══ 技能特效工具 ═══════════════════════════
  /** 星杖星彈：杖頭 → 目標的光帶 + 落點爆閃 + 範圍傷害 */
  _starBolt(a, t, dmg, color, radius) {
    const from = { x: a.group.position.x + Math.sin(a.facing) * 0.8, z: a.group.position.z + Math.cos(a.facing) * 0.8 };
    const to = { x: t.x, z: t.z };
    this.qfx.streak(from, to, color, 0.18, 0.45);
    this._later(0.06, () => {
      this.qfx.flash(to, 1.8, color, 0.25, 0.9);
      this.qfx.sparks(to, 4, color, 5, 0.3);
      this._damageArea(a, to, radius, dmg);
    });
  }

  /** 以下特效全部交給 three.quarks（quarksFx.js） */
  _glowFlash(pos, size, color, life, y = 1) { this.qfx.flash(pos, size, color, life, y); }

  /** 月牙刀光：以 angle 為中心的弧形，可以揮動（sweep）、傾斜（tilt） */
  _crescent(pos, angle, radius, color, life, opts) { this.qfx.crescent(pos, angle, radius, color, life, opts); }

  /** 衝擊波：往外擴散的光牆 */
  _wall(pos, from, to, height, color, life) { this.qfx.wall(pos, from, to, height, color, life); }

  /** 光柱（從地面往上） */
  _beam(pos, radius, height, color, life) { this.qfx.beam(pos, radius, height, color, life); }

  /** 地面竄出的岩刺 */
  _spike(pos, color, life = 0.7, size = 1) { this.qfx.spike(pos, color, life, size); }

  /** 發光火花：往外噴、慢慢落下 */
  _sparks(pos, n, color, speed = 6, life = 0.5, opts = {}) { if (n > 0) this.qfx.sparks(pos, n, color, speed, life, opts); }

  /** 花瓣：往外飄散、旋轉 */
  _petals(pos, n, color, speed = 7) { this.qfx.petals(pos, n, color, speed); }

  /** 拖曳光痕：從 from 到 to 的細長發光帶（瞬步 / 分身） */
  _streak(from, to, color, life, width = 0.5) { this.qfx.streak(from, to, color, life, width); }

  /** 地裂：沿直線一段一段裂開，裂縫發光 */
  _fissure(origin, angle, length, color, opts = {}) { this.qfx.fissure(origin, angle, length, color, { ...opts, later: (t, fn) => this._later(t, fn) }); }

  /** 全螢幕閃光（顏色可換） */
  _screenFlash(color = '255,210,140') {
    this.flashEl.style.setProperty('--flash', color);
    this.flashEl.classList.remove('on'); void this.flashEl.offsetWidth; this.flashEl.classList.add('on');
  }

  // ═══ 狂熱 ══════════════════════════════════
  _feverStart() {
    this.fever = 0;
    this.feverTime = FEVER_TIME;
    this.player.feverTime = FEVER_TIME;
    for (const k in this.cool) this.cool[k] = 0; // 進入狂熱：技能冷卻全部轉好
    this._feverBurst(this.player);
    this._number(this.player.group.position, 'FEVER!!', 'fever');
    this._screenFlash('255,224,138');
    this.shake = Math.max(this.shake, 0.4);
    vibrate([40, 30, 40, 30, 80]);
    this.onFx?.('fever');
  }

  _feverBurst(a) {
    const pos = a.group.position;
    this._glowFlash(pos, 7, 0xffe08a, 0.6, 1);
    this._beam(pos, 1.6, 12, 0xffd166, 0.8);
    this._wall(pos, 0.5, 7, 1.6, 0xffd166, 0.6);
    this._ring(pos, 0.5, 8, 0.7, 0xffe08a);
    this._sparks(pos, 24, 0xffe08a, 9, 0.8, { up: 1.4 });
  }

  _coin(pos) {
    if (this.coins.length > 80) return;
    const mesh = new THREE.Mesh(this.coinGeo, this.coinMat);
    const ground = this.gy(pos.x, pos.z);
    mesh.position.set(pos.x, ground + 0.5, pos.z);
    this.scene.add(mesh);
    this.coins.push({ mesh, ground, t: 0, v: new THREE.Vector3(rand(-3, 3), rand(5, 8), rand(-3, 3)) });
  }

  _number(pos, text, kind, size = 1) {
    if (this.numbers.length > 70) {
      const old = this.numbers.shift();
      old.el.remove();
    }
    const el = document.createElement('div');
    el.className = `dmg-num ${kind}`;
    el.textContent = text;
    this.overlay.appendChild(el);
    const big = kind === 'lvl' || kind === 'fever';
    this.numbers.push({
      el, t: 0, life: big ? 1.4 : kind === 'crit' ? 1.0 : 0.85, size, kind,
      pos: new THREE.Vector3(pos.x + rand(-0.5, 0.5), this.gy(pos.x, pos.z) + (big ? 2.4 : 1.6) + rand(0, 0.5), pos.z),
      dx: rand(-40, 40) * (kind === 'crit' ? 1.3 : 1), rot: kind === 'crit' ? rand(-10, 10) : 0,
    });
  }

  // ── 主迴圈 ─────────────────────────────────
  _loop() {
    if (!this.running) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    if (this.map) this._update(dt);
    this.renderer.render(this.scene, this.camera);
    this.partnerBuffT = Math.max(0, (this.partnerBuffT || 0) - dt);
    this._updateManor(dt);
    this.partner?.update(dt);
    this.pet?.update(dt);
    for (const a of this.remotes.values()) { a.partner?.update(dt); a.pet?.update(dt); }
    this.qfx.update(dt);
    if (this.dyingBosses?.length) {
      for (const d of this.dyingBosses) { d.tick(dt); d.t -= dt; if (d.t <= 0) { this.scene.remove(d.b.group); d.b.model.dispose(); } }
      this.dyingBosses = this.dyingBosses.filter((d) => d.t > 0);
    }
    this._updateNumbers(dt);
    this._updateTags();
    this.raf = requestAnimationFrame(this._loop);
  }

  _update(dt) {
    const P = this.player;
    const pos = P.group.position;
    const coolRate = this.feverTime > 0 ? 1.8 : 1;
    for (const k in this.cool) this.cool[k] = Math.max(0, this.cool[k] - dt * coolRate);

    // 排程中的連段招式
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.timers[i].at <= this.time) { const t = this.timers[i]; this.timers.splice(i, 1); t.fn(); }
    }

    // 營地補怪：只有自己或朋友附近的營地會刷
    const alive = this.mobs.filter((m) => m.alive).length;
    if (!this.duel && !this.map.town && this.world) {
      const actors = this._actors();
      this.world.camps.forEach((c, i) => {
        const st = this.campState[i];
        st.timer -= dt;
        if (st.timer > 0 || st.count >= c.n || this.mobs.length >= MAX_MOBS) return;
        if (this.trial) return; // 魔物潮期間營地暫停
        if (!actors.some((a) => Math.hypot(a.group.position.x - c.x, a.group.position.z - c.z) < CAMP_RANGE)) return;
        st.timer = st.count < c.n / 2 ? 0.12 : 0.35;
        this._spawnMob(i);
      });
    }

    if (this.trial) this._updateTrial(dt);

    // 目標：平常是最近的怪，決鬥時是對手
    let nearest = null, nd = Infinity;
    if (this.duel) {
      const opp = this._duelOpp();
      if (opp) { nearest = opp; nd = flat(opp.group.position, pos); }
    } else {
      for (const m of this.mobs) {
        if (!m.alive) continue;
        // 河對岸的怪要繞橋，距離算遠一點，優先打同一岸的
        let d = flat(m.group.position, pos);
        if (d > 6 && this.world?.crossesWater(pos.x, pos.z, m.group.position.x, m.group.position.z)) d += 25;
        if (d < nd) { nd = d; nearest = m; }
      }
      // 世界王在場：自動模式優先去打王（路上貼身的小怪順手砍）
      const bossT = this.raidBoss || this.boss;
      if (bossT && !(nearest && !nearest.boss && nd < 3)) nearest = bossT;
      if (nearest) nd = flat(nearest.group.position, pos);
    }
    this.stunT = Math.max(0, this.stunT - dt);
    const frozen = (this.duel && performance.now() < this.duel.startAt) || this.stunT > 0; // 決鬥倒數 / 暈眩中不能動

    // 走位：搖桿 > 自動尋怪
    let mx = 0, mz = 0, speed = MOVE_SPEED * (P.riding ? P.mountSpeed : 1);
    if (frozen) {
      // 倒數中原地不動
    } else if (this.joy.active) {
      mx = this.joy.x; mz = this.joy.y; speed *= 1.15;
      this.walkTarget = null;
    } else if (this.walkTarget) {
      const t = this.walkTarget.group.position;
      const d = flat(t, pos);
      if (d > 2.3) { const wp = this.world ? this.world.route(pos, t) : t; mx = wp.x - pos.x; mz = wp.z - pos.z; }
      else { const id = this.walkTarget.id; this.walkTarget = null; this.onNpcArrive?.(id); }
    } else if (this.auto && this.time > this.manualUntil && !this.map.town) {
      let goal = null;
      if (nearest && nd > (this.duel ? 3 : styleOf(P.wtype).keep ?? 2.4) + (nearest.boss ? nearest.radius : 0)) goal = nearest.group.position;
      else if (!nearest && !this.duel && this.world?.camps.length) {
        // 附近沒怪 → 走去最近的營地
        let bc = null, bd = Infinity;
        for (const c of this.world.camps) { const d = Math.hypot(c.x - pos.x, c.z - pos.z); if (d < bd && d > 3) { bd = d; bc = c; } }
        goal = bc;
      }
      if (goal) {
        const wp = this.world ? this.world.route(pos, goal) : goal;
        mx = wp.x - pos.x; mz = wp.z - pos.z;
      }
    }
    const len = Math.hypot(mx, mz);
    P.moving = len > 0.05;
    if (P.moving) {
      const k = Math.min(len, 1) / len;
      let sx = mx * k * speed * dt, sz = mz * k * speed * dt;
      if (this.world) {
        let moved = this.world.move(pos, sx, sz);
        // 被擋住 → 試著往左右偏一點繞過去
        if (moved < Math.hypot(sx, sz) * 0.3) {
          for (const turn of [0.8, -0.8, 1.5, -1.5]) {
            const c = Math.cos(turn), sn = Math.sin(turn);
            moved = this.world.move(pos, sx * c - sz * sn, sx * sn + sz * c);
            if (moved > Math.hypot(sx, sz) * 0.3) break;
          }
        }
      } else { pos.x += sx; pos.z += sz; }
      this._keepInArena(pos);
      P.facing = Math.atan2(mx, mz);
    } else if (nearest) {
      P.facing = Math.atan2(nearest.group.position.x - pos.x, nearest.group.position.z - pos.z);
    }
    let dr = P.facing - P.group.rotation.y;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    P.group.rotation.y += dr * Math.min(1, dt * 14);

    // 自動普攻（無硬直，邊走邊砍；鬼人化攻速 ×2）
    const st = styleOf(P.wtype);
    this.attackTimer -= dt;
    if (this.auto && !frozen && this.attackTimer <= 0 && nearest && nd < st.radius + 0.5 + (nearest.boss ? nearest.radius : 0)) {
      this.attackTimer = st.interval * (P.demonTime > 0 ? 0.5 : 1) * (this.feverTime > 0 ? 0.6 : 1) * (this.partnerBuffT > 0 ? 0.7 : 1);
      this._attack(P);
      this.onFx?.('atk');
      if (this.duel) this.onHit?.('atk');
    }

    // 自動放招
    if (this.auto && !frozen && nearest && nd < 6 + (nearest.boss ? nearest.radius : 0)) {
      const ready = this.loadout.find((id) => !(this.cool[id] > 0) && (this.duel || alive > 8 || (this.skillDefs[id]?.cd ?? 0) < 15));
      if (ready) this.castSkill(ready);
    }

    // 所有角色：持續型招式 + 動畫
    for (const a of this._actors()) this._updateActor(a, dt);

    // 村莊：NPC 待機動畫 + 靠近偵測
    if (this.npcs.length) {
      let near = null, best = 3.6;
      for (const n of this.npcs) {
        if (n.hero) animateHero(n.hero, this.time + n.x, dt, {});
        n.ring.material.opacity = 0.4 + Math.sin(this.time * 3 + n.x) * 0.2;
        const d = flat(n.group.position, pos);
        if (d < best) { best = d; near = n.id; }
      }
      if (near !== this.nearNpc) { this.nearNpc = near; this.onNpcNear?.(near); }
    }

    // 怪物：追最近的角色
    const actors = this._actors();
    const camQ = this.camera.quaternion;
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      if (m.boss) { this._updateBoss(m, dt); continue; }
      const g = m.group;
      if (!m.alive) {
        m.dying -= dt;
        const k = Math.max(0, m.dying / 0.35);
        g.scale.setScalar((m.elite ? 1.8 : 1) * k);
        g.rotation.y += dt * 20;
        if (m.dying <= 0) { this._removeMob(m); this.mobs.splice(i, 1); }
        continue;
      }
      m.spawnT = Math.min(1, m.spawnT + dt * 3);
      let tgt = null, td = Infinity;
      for (const a of actors) {
        const d = flat(g.position, a.group.position);
        if (d < td) { td = d; tgt = a.group.position; }
      }
      const camp = this.world.camps[m.camp];
      let goal = null, spd = m.speed;
      if (m.trial) { // 魔物潮：一律衝向玩家
        if (tgt && td > 1.4) { goal = tgt; spd = m.speed * 1.3; }
      } else if (tgt && td < AGGRO) {
        if (td > 1.4) goal = tgt; // 發現玩家 → 追
      } else {
        // 在營地裡閒晃
        m.wanderT -= dt;
        if (!m.wander || m.wanderT <= 0) { m.wander = this.world.randomInCamp(camp); m.wanderT = rand(2, 5); }
        if (flat(g.position, m.wander) > 0.8) { goal = m.wander; spd = m.speed * 0.45; }
      }
      if (goal) {
        tmpV.set(goal.x - g.position.x, 0, goal.z - g.position.z).normalize();
        this.world.move(g.position, tmpV.x * spd * dt, tmpV.z * spd * dt, m.radius);
        g.rotation.y = Math.atan2(tmpV.x, tmpV.z);
      }
      // 離營地太遠就慢慢回去（不會被拉著跑遍全圖）
      if (camp && Math.hypot(g.position.x - camp.x, g.position.z - camp.z) > camp.r + 18) m.wander = { x: camp.x, z: camp.z };
      g.position.y = this.gy(g.position.x, g.position.z);
      m.hop += dt * 8;
      if (m.model) { // 模型怪：追人用跑的、閒晃用走的、停下來就放慢
        m.model.play(goal && spd >= m.speed * 0.8 ? 'Running' : 'Walking');
        m.model.current.timeScale = goal ? (spd >= m.speed * 0.8 ? 1 : 0.8) : 0.25;
        m.model.mixer.update(dt);
        m.body.scale.setScalar(m.spawnT);
      } else if (this.mobShape === 'spirit' || this.mobShape === 'sentinel') { // 冰靈 / 守衛：漂浮 + 晶片繞身
        m.body.position.y = 0.9 + Math.sin(m.hop * 0.5) * 0.15;
        m.extras.forEach((e, k) => {
          const ang = m.hop * 0.4 + (k * Math.PI * 2) / 3;
          e.position.set(Math.cos(ang) * 0.9, 0.9 + Math.sin(ang * 2) * 0.2, Math.sin(ang) * 0.9);
          e.rotation.y = ang;
        });
        m.body.rotation.y += dt * 1.5;
        m.body.scale.setScalar(m.spawnT);
      } else if (this.mobShape === 'beetle') { // 甲獸：左右搖擺爬行
        m.body.position.y = 0.5 + Math.abs(Math.sin(m.hop * 1.3)) * 0.08;
        m.body.rotation.z = Math.sin(m.hop) * 0.12;
        m.body.scale.setScalar(m.spawnT);
      } else {
        m.body.position.y = 0.6 + Math.abs(Math.sin(m.hop)) * 0.25;
        m.body.scale.set(1, 0.9 + Math.abs(Math.cos(m.hop)) * 0.15, 1).multiplyScalar(m.spawnT);
      }
      m.flash = Math.max(0, m.flash - dt);
      const glowHex = m.flash > 0 ? 0xffffff : m.elite ? 0x552200 : 0x000000;
      if (m.model) m.model.setEmissive(glowHex); else m.mat.emissive.setHex(glowHex);
      if (m.bar.visible) {
        m.bar.quaternion.copy(camQ).premultiply(tmpQ.copy(g.quaternion).invert());
        m.fill.scale.x = Math.max(0, m.hp / m.maxHp);
      }
    }

    // 特效
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.t += dt;
      const k = Math.min(1, e.t / e.life);
      e.update(e, k);
      if (k >= 1) { this.scene.remove(e.mesh); if (!e.keepMat) e.mesh.material.dispose(); this.effects.splice(i, 1); }
    }

    // 碎片
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.t += dt;
      p.v.y -= (p.g ?? 22) * dt;
      if (p.drag) p.v.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.mesh.position.addScaledVector(p.v, dt);
      p.mesh.rotation.x += dt * (p.spin ?? 10);
      p.mesh.rotation.y += dt * (p.spin ?? 10) * 0.6;
      const k = p.t / p.life;
      p.mesh.scale.setScalar(p.noShrink ? (k > 0.7 ? (1 - k) / 0.3 : 1) : Math.max(0, 1 - k));
      if (p.t >= p.life) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }

    // 金幣：先噴出再吸到主角身上
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.t += dt;
      const m = c.mesh;
      m.rotation.x += dt * 9;
      if (c.t < 0.7) {
        c.v.y -= 25 * dt;
        m.position.addScaledVector(c.v, dt);
        if (m.position.y < c.ground + 0.2) { m.position.y = c.ground + 0.2; c.v.y *= -0.4; c.v.x *= 0.6; c.v.z *= 0.6; }
      } else {
        tmpV.set(pos.x, pos.y + 1, pos.z).sub(m.position);
        const dist = tmpV.length();
        m.position.addScaledVector(tmpV.normalize(), Math.min(dist, dt * (10 + (c.t - 0.7) * 40)));
        if (dist < 0.4) { this.scene.remove(m); this.coins.splice(i, 1); }
      }
    }

    // 連殺
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.combo = 0;
    this.combEl.style.opacity = this.combo >= 5 ? '1' : '0';
    if (this.combo >= 5) this.combEl.innerHTML = `<b>${fmt(this.combo)}</b><span>連殺</span>`;
    this._updateFever(dt);

    // 地形、環境動畫
    this.world?.update(this.time, dt, pos);
    this._drawMinimap(dt);

    // 鏡頭跟隨 + 震動（跟著地形高度）
    this.camFocus.lerp(pos, 1 - Math.exp(-dt * 6));
    // 太陽與陰影範圍跟著焦點移動（對齊陰影貼圖格子，移動時影子邊緣不會閃）
    const step = 60 / this.sun.shadow.mapSize.x;
    const fx = Math.round(this.camFocus.x / step) * step, fz = Math.round(this.camFocus.z / step) * step;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx + this.sunDir.x * 45, this.sunDir.y * 45, fz + this.sunDir.z * 45);
    this.fill.target.position.set(fx, 0, fz);
    this.fill.position.set(fx, 25, fz + 30);
    this.shadowT = (this.shadowT || 0) - dt;
    if (this.shadowT <= 0) {
      this.shadowT = 0.5;
      this._shadowify(this.player.group);
      for (const a of this.remotes.values()) this._shadowify(a.group);
      for (const m of this.mobs) this._shadowify(m.group);
      for (const n of this.npcs) this._shadowify(n.group);
    }
    this.camera.position.copy(this.camFocus).add(this.camOffset);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      const s = this.shake * 0.9;
      this.camera.position.x += rand(-s, s);
      this.camera.position.z += rand(-s, s);
    }
    this.camera.lookAt(this.camFocus.x, this.camFocus.y + 0.8, this.camFocus.z);
  }

  _updateFever(dt) {
    const hunting = !this.map.town && !this.duel;
    if (this.feverTime > 0) {
      this.feverTime = Math.max(0, this.feverTime - dt);
      this.player.feverTime = this.feverTime;
      this.feverAuraT = (this.feverAuraT || 0) - dt;
      if (this.feverAuraT <= 0) { // 狂熱中身上持續冒金光
        this.feverAuraT = 0.12;
        this._sparks(this.player.group.position, 2, 0xffe08a, 3, 0.6, { y: 0.4, up: 1.6 });
      }
    } else if (this.comboTimer <= 0) {
      this.fever = Math.max(0, this.fever - dt * 0.08); // 停手太久會慢慢流失
    }
    if (!hunting) this.fever = 0;
    const on = this.feverTime > 0;
    this.feverEl.style.opacity = hunting && (on || this.fever > 0.02) ? '1' : '0';
    this.feverEl.classList.toggle('on', on);
    this.feverFill.style.width = `${(on ? this.feverTime / FEVER_TIME : this.fever) * 100}%`;
    const label = on ? `狂熱中 ${this.feverTime.toFixed(1)}s` : `狂熱 ${Math.floor(this.fever * 100)}%`;
    if (this.feverLabel.textContent !== label) this.feverLabel.textContent = label;
    this.vignetteEl.classList.toggle('on', on);
  }

  /** 小地圖：底圖 + 怪物 / 朋友 / NPC / 自己 */
  _drawMinimap(dt) {
    this.miniT = (this.miniT || 0) - dt;
    if (this.miniT > 0 || !this.mini) return;
    this.miniT = 0.15;
    const g = this.miniEl.getContext('2d');
    const { canvas, toPx } = this.mini;
    const S = this.miniEl.width;
    g.clearRect(0, 0, S, S);
    g.drawImage(canvas, 0, 0, S, S);
    const k = S / canvas.width;
    const dot = (x, z, r, color, stroke) => {
      g.beginPath(); g.arc(toPx(x) * k, toPx(z) * k, r, 0, Math.PI * 2);
      g.fillStyle = color; g.fill();
      if (stroke) { g.lineWidth = 1.5; g.strokeStyle = stroke; g.stroke(); }
    };
    for (const m of this.mobs) if (m.alive && !m.boss) dot(m.group.position.x, m.group.position.z, m.elite ? 3.5 : 2, m.elite ? '#ff9a2e' : '#ff4d4d');
    if (this.boss) dot(this.boss.group.position.x, this.boss.group.position.z, 7, '#ff2a5c', '#fff');
    for (const n of this.npcs) dot(n.x, n.z, 4, '#f5c04a', '#000');
    for (const a of this.remotes.values()) dot(a.group.position.x, a.group.position.z, 3.5, '#5ad1ff', '#003');
    // 自己：箭頭
    const p = this.player.group.position;
    const x = toPx(p.x) * k, y = toPx(p.z) * k, f = this.player.facing;
    g.save();
    g.translate(x, y);
    g.rotate(-f + Math.PI);
    g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(0, 2.5); g.lineTo(-5, 5); g.closePath();
    g.fillStyle = '#ffffff'; g.fill();
    g.lineWidth = 1.5; g.strokeStyle = '#000'; g.stroke();
    g.restore();
  }

  _updateActor(a, dt) {
    const pos = a.group.position;

    // 朋友：平滑移動到網路位置
    if (!a.local && a.target) {
      const k = 1 - Math.exp(-dt * 10);
      const dx = a.target.x - pos.x, dz = a.target.z - pos.z;
      pos.x += dx * k;
      pos.z += dz * k;
      a.moving = a.netMoving || Math.hypot(dx, dz) > 0.15;
      a.facing = a.target.ry;
      let dr = a.facing - a.group.rotation.y;
      dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      a.group.rotation.y += dr * Math.min(1, dt * 12);
    }

    // 大劍：旋風斬
    if (a.whirlTime > 0) {
      a.whirlTime -= dt;
      a.whirlTick -= dt;
      a.rig.rotation.y += dt * 22;
      if (a.whirlTick <= 0) {
        a.whirlTick = 0.25;
        const ang = this.time * 22;
        this._crescent(pos, ang, 4.8, 0xbfe6ff, 0.25, { arc: 3.2, sweep: 3, follow: a, y: 0.8 });
        this._crescent(pos, ang + Math.PI, 4.4, 0x7dd3fc, 0.25, { arc: 2.4, sweep: 3, follow: a, y: 1.1 });
        this._ring(pos, 2, 4.8, 0.2, 0x7dd3fc);
        if (a.local) this._sparks(pos, 3, 0xbfe6ff, 7, 0.35);
        this._damageArea(a, pos, 4.8, this._dps(a) * 0.7);
      }
    } else if (a.frenzyTime > 0) {
      // 雙劍：鬼人亂舞
      a.frenzyTime -= dt;
      a.frenzyTick -= dt;
      a.rig.rotation.y += dt * 16;
      if (a.frenzyTick <= 0) {
        a.frenzyTick = 0.1;
        triggerSwing(a.hero);
        this._crescent(pos, rand(0, Math.PI * 2), rand(4, 5.5), Math.random() < 0.5 ? 0xff2a2a : 0xff6a4a, 0.16, { arc: 2.4, sweep: rand(-3, 3), tilt: rand(-0.8, 0.8), follow: a, y: rand(0.5, 1.4) });
        if (Math.random() < 0.5) this._ring(pos, 1, 5.5, 0.16, 0xff5c5c);
        if (a.local) this._sparks(pos, 2, 0xff7a7a, 8, 0.3);
        this._damageArea(a, pos, 5.5, this._dps(a) * 1.0);
      }
    } else {
      a.rig.rotation.y *= 0.8;
    }

    // 雙劍：迴旋刃
    if (a.bladesTime > 0) {
      a.bladesTime -= dt;
      a.bladesTick -= dt;
      if (a.bladesTick <= 0) {
        a.bladesTick = 0.2;
        const ang = this.time * 9;
        for (const o of [0, Math.PI]) this._sparks({ x: pos.x + Math.sin(ang + o) * 2.5, z: pos.z + Math.cos(ang + o) * 2.5 }, 2, 0xffc2e0, 2, 0.35);
        this._ring(pos, 3.6, 4, 0.18, 0xffc2e0);
        this._damageArea(a, pos, 4, this._dps(a) * 0.8);
      }
    }
    // 大劍：震地猛擊的跳躍
    if (a.leapT > 0) {
      a.leapT = Math.max(0, a.leapT - dt);
    }
    // 增益倒數
    for (const k in a.buffs) a.buffs[k] = Math.max(0, a.buffs[k] - dt);

    // 雙劍：鬼人化紅色氣場
    a.demonTime = Math.max(0, a.demonTime - dt);
    const auraColor = a.demonTime > 0 ? 0xff3b3b : a.feverTime > 0 ? 0xffd166 : null;
    if (auraColor !== null) {
      a.aura.material.color.setHex(auraColor);
      a.aura.material.opacity = 0.5 + Math.sin(this.time * 10) * 0.25;
      a.aura.scale.setScalar((1.3 + Math.sin(this.time * 6) * 0.15) * (a.riding ? 1.6 : 1));
    } else {
      a.aura.material.opacity = 0;
    }

    pos.y = this.gy(pos.x, pos.z);
    animateHero(a.hero, this.time, dt, { moving: a.moving, mounted: a.riding });
    if (a.riding) {
      animateMount(a.mount, this.time, dt, { moving: a.moving, speed: a.mountSpeed });
      if (a.mount.def.model === 'whale' && !a.moving) { a.idleFx = (a.idleFx || 0) - dt; if (a.idleFx <= 0) { a.idleFx = 0.3; this.qfx.auroraTrail(pos, 2.2, false); } }
      if ((a.mount.def.model === 'phoenix' || a.mount.def.model === 'qilin') && !a.moving) { // 停著也有火焰 / 電光
        a.idleFx = (a.idleFx || 0) - dt;
        if (a.idleFx <= 0) { a.idleFx = 0.25; if (a.mount.def.model === 'phoenix') this.qfx.fireTrail(pos, 1.9, false); else this.qfx.lightningTrail(pos, false); }
      }
      if (a.mount.def.model === 'dragon' && !a.moving) { // 神龍停著：龍珠周圍緩緩飄星光
        a.idleFx = (a.idleFx || 0) - dt;
        if (a.idleFx <= 0) { a.idleFx = 0.35; this.qfx.dragonTrail(pos, 1.8, false); }
      }
      // 跑起來腳下留下塵土 / 熔光 / 冰晶 / 星光
      if (a.moving) {
        a.trailT -= dt;
        if (a.trailT <= 0) {
          a.trailT = 0.09;
          const c = MOUNT_TRAIL[a.mount.def.model] ?? 0xb89a6a;
          const back = { x: pos.x - Math.sin(a.facing) * 0.9, z: pos.z - Math.cos(a.facing) * 0.9 };
          if (a.mount.def.model === 'whale') { // 星辰鯨：極光拖尾
            this.qfx.auroraTrail({ x: pos.x - Math.sin(a.facing) * 2.6, z: pos.z - Math.cos(a.facing) * 2.6 }, 1.8);
            a.trailT = 0.07;
          } else if (a.mount.def.model === 'phoenix') { // 鳳凰：火焰拖尾
            this.qfx.fireTrail({ x: pos.x - Math.sin(a.facing) * 1.4, z: pos.z - Math.cos(a.facing) * 1.4 }, 1.7);
            a.trailT = 0.06;
          } else if (a.mount.def.model === 'qilin') { // 麒麟：蹄下雷光
            this.qfx.lightningTrail(back);
            a.trailT = 0.07;
          } else if (a.mount.def.model === 'dragon') { // 神龍：身後捲起雲霧星光（three.quarks）
            const tail = { x: pos.x - Math.sin(a.facing) * 3.5, z: pos.z - Math.cos(a.facing) * 3.5 };
            this.qfx.dragonTrail(tail, 1.4);
            a.trailT = 0.06;
          } else if (a.mount.def.model === 'horse') this._particle(back, c);
          else this._sparks(back, 2, c, 1.5, 0.6, { y: 0.2, up: 0.8 });
        }
      }
    }
    if (a.feverTime > 0 && !a.local) a.feverTime = Math.max(0, a.feverTime - dt);
    const wg = a.hero.wings;
    if (wg?.glb) { // 聖羽之翼：身後持續飄落發光羽毛（three.quarks）
      a.wingT = (a.wingT || 0) - dt;
      if (a.wingT <= 0) {
        a.wingT = (a.moving ? 0.18 : 0.4) / (1 + wg.lv * 0.08);
        const back = { x: pos.x - Math.sin(a.facing) * 0.5, z: pos.z - Math.cos(a.facing) * 0.5 };
        this.qfx.feathers(back, 1 + (wg.lv >= 7 ? 1 : 0), 0xffffff, a.riding ? 2.6 : 1.7, wg.lv >= 4);
      }
    } else if (wg?.stars) { // 星河之翼：翅膀周圍一閃一閃的星光（three.quarks）
      a.wingT = (a.wingT || 0) - dt;
      if (a.wingT <= 0) {
        a.wingT = a.moving ? 0.12 : 0.25;
        const side = Math.random() < 0.5 ? -1 : 1;
        const back = { x: pos.x - Math.sin(a.facing) * 0.5 + Math.cos(a.facing) * side * rand(0.4, 1.4), z: pos.z - Math.cos(a.facing) * 0.5 - Math.sin(a.facing) * side * rand(0.4, 1.4) };
        this.qfx.flash(back, rand(0.4, 0.8), [0x9be7ff, 0xffffff, 0xc9a6ff][Math.floor(Math.random() * 3)], rand(0.4, 0.7), (a.riding ? 2.4 : 1.4) + rand(0, 0.6));
      }
    } else if (wg?.sparkle) {
      a.wingT = (a.wingT || 0) - dt;
      if (a.wingT <= 0) {
        a.wingT = a.moving ? 0.1 : 0.3;
        const back = { x: pos.x - Math.sin(a.facing) * 0.6 + rand(-0.6, 0.6), z: pos.z - Math.cos(a.facing) * 0.6 + rand(-0.6, 0.6) };
        this._sparks(back, 1, new THREE.Color(wg.def.accent).getHex(), 1, 1.1, { y: a.riding ? 2.4 : 1.5, up: 0.2 });
      }
    }
    updateSkillFx(this, a, dt);
    if (a.leapT > 0) a.rig.position.y += Math.sin((1 - a.leapT / 0.35) * Math.PI) * 1.6;
    a.ring.material.opacity = 0.35 + Math.sin(this.time * 4) * 0.15;
  }

  _updateNumbers(dt) {
    const w = this.width, h = this.height;
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      n.t += dt;
      const k = n.t / n.life;
      if (k >= 1) { n.el.remove(); this.numbers.splice(i, 1); continue; }
      tmpV.copy(n.pos).project(this.camera);
      // 拋物線：先快速往上彈，再慢慢往旁邊飄落
      const x = (tmpV.x * 0.5 + 0.5) * w + n.dx * k;
      const y = (-tmpV.y * 0.5 + 0.5) * h - (90 * k - 70 * k * k);
      // 出現時從 2 倍大「砸」下來，暴擊多一點回彈與晃動
      let pop;
      if (k < 0.08) pop = 2.2 - (k / 0.08) * 1.4;
      else if (k < 0.18) pop = 0.8 + ((k - 0.08) / 0.1) * 0.35;
      else pop = 1.15 - Math.min(0.15, (k - 0.18) * 0.4);
      const shake = n.kind === 'crit' && k < 0.2 ? rand(-3, 3) : 0;
      n.el.style.transform = `translate(${x + shake}px, ${y}px) translate(-50%, -50%) scale(${pop * n.size}) rotate(${n.rot * (1 - k)}deg)`;
      n.el.style.opacity = k > 0.65 ? String(1 - (k - 0.65) / 0.35) : '1';
    }
  }

  /** 朋友 / NPC 頭上的名字 */
  _updateTags() {
    const w = this.width, h = this.height;
    for (const n of this.npcs) {
      tmpV.set(n.group.position.x, n.group.position.y + (n.hero ? 2.8 : 3.6), n.group.position.z).project(this.camera);
      const off = tmpV.z > 1 || Math.abs(tmpV.x) > 1.1 || Math.abs(tmpV.y) > 1.1;
      n.tag.style.display = off ? 'none' : '';
      if (!off) n.tag.style.transform = `translate(${(tmpV.x * 0.5 + 0.5) * w}px, ${(-tmpV.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`;
    }
    for (const a of this.remotes.values()) {
      tmpV.set(a.group.position.x, a.group.position.y + 2.75, a.group.position.z).project(this.camera);
      const off = tmpV.z > 1 || Math.abs(tmpV.x) > 1.1 || Math.abs(tmpV.y) > 1.1;
      a.tag.style.display = off ? 'none' : '';
      if (!off) a.tag.style.transform = `translate(${(tmpV.x * 0.5 + 0.5) * w}px, ${(-tmpV.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`;
    }
  }

  _resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.width = w; this.height = h;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // 直式手機畫面比較窄，把鏡頭拉高一點讓視野夠
    const portrait = h > w;
    this.camera.fov = portrait ? 48 : 36;
    // 橫向畫面較矮，鏡頭拉近讓角色大一點
    if (portrait) this.camOffset.set(0, 20, 14.5);
    else this.camOffset.set(0, 16, 11.5);
    this.camera.updateProjectionMatrix();
  }
}
