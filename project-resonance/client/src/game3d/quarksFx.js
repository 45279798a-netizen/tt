// ─────────────────────────────────────────────
// 技能特效（three.quarks 粒子系統）— 精緻版
// 所有技能 / 普攻 / 狂熱的演出都是 quarks ParticleSystem，搭配：
//   ・專用程式貼圖：刀光弧、衝擊波環、魔法陣、地裂、煙霧、火花條、星芒、花瓣
//   ・動態光源脈衝：固定 3 盞點光源輪流使用（不會新增燈 → 不會重新編譯 shader 卡頓）
//   ・多層疊加：閃光 → 光源 → 衝擊波 → 火花 → 餘燼 → 煙 → 地面印記
//   ・拖尾（RenderMode.Trail）：星彈、隕星是真正的彗星光帶，不再只是一串光點
//   ・螺旋氣流（OrbitOverLife）：升級、旋風斬、鬼人化、狂熱的上升光旋
//   ・打擊感：命中火花 / 暴擊星芒、怪物倒下的碎光與魂火、閃電、首領預警與倒下演出
//   ・特效預算：小特效（命中、擊殺）每秒有上限，一次掃到一大群怪也不會掉幀；手機自動減量
// 相同材質的粒子由 BatchedRenderer 合併成一次繪製；非迴圈系統 autoDestroy 播完自動清除
// ─────────────────────────────────────────────
import * as THREE from 'three';
import {
  BatchedRenderer, ParticleSystem, RenderMode,
  ConstantValue, IntervalValue, ConstantColor, ColorOverLife, Gradient, SizeOverLife, PiecewiseBezier, Bezier,
  ApplyForce, RotationOverLife, Noise, SpeedOverLife, OrbitOverLife, AxisAngleGenerator,
  PointEmitter, SphereEmitter, CircleEmitter, HemisphereEmitter, ConeEmitter, WidthOverLength,
  Vector3 as QV3, Vector4 as QV4,
} from 'three.quarks';

const rand = (a, b) => a + Math.random() * (b - a);
const c3 = (hex) => { const c = new THREE.Color(hex); return new QV3(c.r, c.g, c.b); };
const c4 = (hex, a = 1) => { const c = new THREE.Color(hex); return new QV4(c.r, c.g, c.b, a); };
const WHITE = 0xffffff;
const fade = (hex, hold = 0.2) => new Gradient([[c3(hex), 0], [c3(hex), 1]], [[1, 0], [1, hold], [0, 1]]);
/** 白熱 → 指定顏色 → 淡出 */
const hot = (hex, hold = 0.25) => new Gradient([[c3(WHITE), 0], [c3(hex), 0.3], [c3(hex), 1]], [[1, 0], [1, hold], [0, 1]]);
/** 淡入再淡出 */
const inout = (hex, peak = 0.2) => new Gradient([[c3(hex), 0], [c3(hex), 1]], [[0, 0], [1, peak], [0, 1]]);
const curve = (a, b, c, d) => new PiecewiseBezier([[new Bezier(a, b, c, d), 0]]);
const DOWN = new QV3(0, -1, 0);
const UP = new QV3(0, 1, 0);
const burst = (n, time = 0) => [{ time, count: new ConstantValue(n), cycle: 1, interval: 0.01, probability: 1 }];

function tex(size, draw) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeTextures() {
  const radial = (g, s, stops) => {
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    for (const [o, c] of stops) grd.addColorStop(o, c);
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
  };
  const W = (a) => `rgba(255,255,255,${a})`;
  return {
    glow: tex(128, (g, s) => radial(g, s, [[0, W(1)], [0.12, W(0.9)], [0.35, W(0.35)], [1, W(0)]])),
    spark: tex(64, (g, s) => {
      const grd = g.createLinearGradient(0, 0, s, 0);
      grd.addColorStop(0, W(0)); grd.addColorStop(0.5, W(1)); grd.addColorStop(1, W(0));
      g.fillStyle = grd;
      g.beginPath(); g.ellipse(s / 2, s / 2, s * 0.5, s * 0.09, 0, 0, Math.PI * 2); g.fill();
    }),
    flare: tex(128, (g, s) => {
      g.translate(s / 2, s / 2);
      for (let i = 0; i < 6; i++) {
        g.rotate(Math.PI / 3);
        const grd = g.createLinearGradient(0, 0, s / 2, 0);
        grd.addColorStop(0, W(1)); grd.addColorStop(1, W(0));
        g.fillStyle = grd;
        const w = s * (i % 2 ? 0.012 : 0.022);
        g.beginPath(); g.moveTo(0, -w); g.lineTo(s / 2, 0); g.lineTo(0, w); g.fill();
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      radial(g, s, [[0, W(1)], [0.08, W(0.8)], [0.2, W(0)], [1, W(0)]]);
    }),
    ring: tex(256, (g, s) => radial(g, s, [[0, W(0)], [0.62, W(0)], [0.86, W(0.35)], [0.95, W(1)], [1, W(0)]])),
    slash: tex(256, (g, s) => radial(g, s, [[0, W(0)], [0.16, W(0)], [0.36, W(0.12)], [0.46, W(0.55)], [0.493, W(1)], [0.5, W(0)]])),
    rune: tex(256, (g, s) => {
      const c = s / 2;
      g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round';
      g.shadowColor = '#fff'; g.shadowBlur = 6;
      g.lineWidth = s * 0.018; g.beginPath(); g.arc(c, c, s * 0.46, 0, Math.PI * 2); g.stroke();
      g.lineWidth = s * 0.008; g.beginPath(); g.arc(c, c, s * 0.4, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(c, c, s * 0.2, 0, Math.PI * 2); g.stroke();
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2, r1 = s * 0.405, r2 = s * (i % 4 ? 0.425 : 0.455);
        g.lineWidth = s * (i % 4 ? 0.005 : 0.01);
        g.beginPath(); g.moveTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1); g.lineTo(c + Math.cos(a) * r2, c + Math.sin(a) * r2); g.stroke();
      }
      g.lineWidth = s * 0.009;
      for (const off of [0, Math.PI / 3]) {
        g.beginPath();
        for (let i = 0; i <= 3; i++) { const a = off + (i / 3) * Math.PI * 2 - Math.PI / 2; const x = c + Math.cos(a) * s * 0.39, y = c + Math.sin(a) * s * 0.39; i ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
      }
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.beginPath(); g.arc(c + Math.cos(a) * s * 0.3, c + Math.sin(a) * s * 0.3, s * 0.018, 0, Math.PI * 2); g.fill(); }
    }),
    crack: tex(256, (g, s) => {
      const c = s / 2;
      g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
      g.shadowColor = '#fff'; g.shadowBlur = 8;
      const branch = (x, y, a, len, w, depth) => {
        let px = x, py = y;
        g.lineWidth = w; g.beginPath(); g.moveTo(px, py);
        for (let i = 1; i <= 5; i++) {
          a += rand(-0.5, 0.5);
          px += Math.cos(a) * (len / 5); py += Math.sin(a) * (len / 5);
          g.lineTo(px, py);
          if (depth > 0 && Math.random() < 0.35) { g.stroke(); branch(px, py, a + rand(-1, 1), len * 0.45, w * 0.6, depth - 1); g.lineWidth = w; g.beginPath(); g.moveTo(px, py); }
        }
        g.stroke();
      };
      for (let i = 0; i < 9; i++) branch(c, c, (i / 9) * Math.PI * 2 + rand(-0.2, 0.2), s * rand(0.3, 0.46), s * 0.022, 2);
      const grd = g.createRadialGradient(c, c, 0, c, c, s * 0.22);
      grd.addColorStop(0, W(0.9)); grd.addColorStop(1, W(0));
      g.shadowBlur = 0; g.fillStyle = grd; g.fillRect(0, 0, s, s);
    }),
    smoke: tex(128, (g, s) => {
      for (let i = 0; i < 14; i++) {
        const x = s / 2 + rand(-s * 0.18, s * 0.18), y = s / 2 + rand(-s * 0.18, s * 0.18), r = s * rand(0.14, 0.3);
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, W(0.35)); grd.addColorStop(1, W(0));
        g.fillStyle = grd; g.fillRect(0, 0, s, s);
      }
    }),
    petal: tex(64, (g, s) => {
      const grd = g.createLinearGradient(0, 0, 0, s);
      grd.addColorStop(0, '#ffffff'); grd.addColorStop(1, '#ffd6e6');
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(s / 2, s * 0.04);
      g.bezierCurveTo(s * 0.98, s * 0.32, s * 0.78, s * 0.92, s / 2, s * 0.96);
      g.bezierCurveTo(s * 0.22, s * 0.92, s * 0.02, s * 0.32, s / 2, s * 0.04); g.fill();
    }),
    feather: tex(64, (g, s) => {
      g.translate(s / 2, s / 2); g.rotate(-0.5);
      const grd = g.createLinearGradient(0, -s * 0.45, 0, s * 0.45);
      grd.addColorStop(0, W(1)); grd.addColorStop(1, W(0.75));
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(0, -s * 0.45);
      g.bezierCurveTo(s * 0.2, -s * 0.2, s * 0.16, s * 0.25, 0, s * 0.42);
      g.bezierCurveTo(-s * 0.14, s * 0.25, -s * 0.18, -s * 0.2, 0, -s * 0.45); g.fill();
      g.strokeStyle = W(0.6); g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(0, -s * 0.42); g.lineTo(0, s * 0.48); g.stroke();
    }),
    vfade: tex(64, (g, s) => {
      const grd = g.createLinearGradient(0, s, 0, 0);
      grd.addColorStop(0, W(1)); grd.addColorStop(0.35, W(0.55)); grd.addColorStop(1, W(0));
      g.fillStyle = grd; g.fillRect(0, 0, s, s);
    }),
    // 拖尾：u = 尾 → 頭（越靠頭越亮），v = 寬度方向（中間白熱）
    trail: tex(128, (g, s) => {
      const v = g.createLinearGradient(0, 0, 0, s);
      v.addColorStop(0, W(0)); v.addColorStop(0.3, W(0.35)); v.addColorStop(0.5, W(1)); v.addColorStop(0.7, W(0.35)); v.addColorStop(1, W(0));
      g.fillStyle = v; g.fillRect(0, 0, s, s);
      g.globalCompositeOperation = 'destination-in';
      const u = g.createLinearGradient(0, 0, s, 0);
      u.addColorStop(0, 'rgba(0,0,0,0)'); u.addColorStop(0.6, 'rgba(0,0,0,0.7)'); u.addColorStop(1, 'rgba(0,0,0,1)');
      g.fillStyle = u; g.fillRect(0, 0, s, s);
    }),
    // 閃電：三種隨機分岔的鋸齒，輪流用
    bolts: [0, 1, 2].map(() => tex(256, (g, s) => {
      g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
      g.shadowColor = '#fff'; g.shadowBlur = 10;
      const zig = (x, y, len, w, depth) => {
        g.lineWidth = w; g.beginPath(); g.moveTo(x, y);
        const steps = 9;
        for (let i = 1; i <= steps; i++) {
          x = Math.min(s * 0.9, Math.max(s * 0.1, x + rand(-s * 0.06, s * 0.06)));
          y += len / steps;
          g.lineTo(x, y);
          if (depth > 0 && Math.random() < 0.22) { g.stroke(); zig(x, y, len * 0.35, w * 0.55, depth - 1); g.lineWidth = w; g.beginPath(); g.moveTo(x, y); }
        }
        g.stroke();
      };
      zig(s / 2, 0, s, s * 0.022, 2);
    })),
    band: tex(128, (g, s) => {
      const grd = g.createLinearGradient(0, 0, s, 0);
      grd.addColorStop(0, W(0)); grd.addColorStop(0.42, W(0.5)); grd.addColorStop(0.5, W(1)); grd.addColorStop(0.58, W(0.5)); grd.addColorStop(1, W(0));
      g.fillStyle = grd; g.fillRect(0, 0, s, s);
      g.globalCompositeOperation = 'destination-in';
      const v = g.createLinearGradient(0, 0, 0, s);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.15, 'rgba(0,0,0,1)'); v.addColorStop(0.85, 'rgba(0,0,0,1)'); v.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = v; g.fillRect(0, 0, s, s);
    }),
  };
}

export class QuarksFx {
  constructor(scene, gy) {
    this.scene = scene;
    this.gy = gy;
    this.batch = new BatchedRenderer();
    scene.add(this.batch);
    this.tweens = [];
    this.t = makeTextures();
    const add = (map, side = THREE.FrontSide) => new THREE.MeshBasicMaterial({ map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side });
    this.mat = {
      glow: add(this.t.glow), spark: add(this.t.spark), flare: add(this.t.flare),
      ring: add(this.t.ring), rune: add(this.t.rune), crack: add(this.t.crack),
      slash: add(this.t.slash, THREE.DoubleSide), vfade: add(this.t.vfade, THREE.DoubleSide), band: add(this.t.band, THREE.DoubleSide),
      trail: add(this.t.trail, THREE.DoubleSide),
      smoke: new THREE.MeshBasicMaterial({ map: this.t.smoke, transparent: true, depthWrite: false }),
      feather: new THREE.MeshBasicMaterial({ map: this.t.feather, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
      petal: new THREE.MeshBasicMaterial({ map: this.t.petal, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
      rock: new THREE.MeshStandardMaterial({ color: WHITE, roughness: 0.95, metalness: 0, flatShading: true }),
      solid: add(null, THREE.DoubleSide),
    };
    this.boltMats = this.t.bolts.map((t) => add(t, THREE.DoubleSide));
    this.geo = {
      spike: new THREE.ConeGeometry(0.35, 1.4, 5).translate(0, 0.7, 0),
      rock: new THREE.DodecahedronGeometry(0.16, 0),
      blade: new THREE.ConeGeometry(0.14, 1.5, 4).rotateX(Math.PI / 2).scale(1, 0.35, 1),
    };
    this.geoCache = new Map();
    // 動態光源池：固定 3 盞輪流用（燈數不變 → shader 不用重新編譯）
    this.lights = Array.from({ length: 3 }, () => {
      const l = new THREE.PointLight(WHITE, 0, 16, 1.6);
      scene.add(l);
      return { l, t: 1, life: 1, peak: 0 };
    });
    this.lightIdx = 0;
    // 小特效預算（命中、擊殺）：每秒補充，用完就略過，避免一次 AoE 打到 30 隻怪時生出上百個粒子系統
    this.lite = !!window.matchMedia?.('(pointer: coarse)').matches;
    this.budgetMax = this.lite ? 8 : 16;
    this.budgetRate = this.lite ? 18 : 40;
    this.budget = this.budgetMax;
  }

  _spend(cost) {
    if (this.budget < cost) return false;
    this.budget -= cost;
    return true;
  }

  _geo(key, make) {
    if (!this.geoCache.has(key)) this.geoCache.set(key, make());
    return this.geoCache.get(key);
  }

  _play(params, at, { y = 0, behaviors = [], rotX = 0, rotY = 0, local = false } = {}) {
    const ps = new ParticleSystem({
      duration: 0.1, looping: false, autoDestroy: true, worldSpace: !local,
      emissionOverTime: new ConstantValue(0), renderMode: RenderMode.BillBoard,
      ...params,
    });
    for (const b of behaviors) ps.addBehavior(b);
    const e = ps.emitter;
    e.position.set(at.x, (at.y ?? this.gy(at.x, at.z)) + y, at.z);
    e.rotation.order = 'YXZ';
    e.rotation.y = rotY;
    e.rotation.x = rotX;
    this.scene.add(e);
    this.batch.addSystem(ps);
    return ps;
  }

  update(dt) {
    this.budget = Math.min(this.budgetMax, this.budget + dt * this.budgetRate);
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.life);
      tw.fn(k, dt);
      if (k >= 1) this.tweens.splice(i, 1);
    }
    for (const L of this.lights) {
      if (L.t >= L.life) { if (L.l.intensity) L.l.intensity = 0; continue; }
      L.t += dt;
      const k = Math.min(1, L.t / L.life);
      L.l.intensity = L.peak * (k < 0.1 ? k / 0.1 : (1 - k) ** 1.6);
    }
    this.batch.update(dt);
  }

  // ═══ 基本元件 ════════════════════════════════

  /** 動態光源脈衝：真的把地面、角色照亮 */
  light(pos, color, intensity = 30, life = 0.35, distance = 16, y = 1.5) {
    const L = this.lights[this.lightIdx++ % this.lights.length];
    L.l.color.set(color);
    L.l.distance = distance;
    L.l.position.set(pos.x, (pos.y ?? this.gy(pos.x, pos.z)) + y, pos.z);
    L.t = 0; L.life = life; L.peak = intensity;
  }

  /** 爆閃：柔光 + 旋轉星芒（大的會帶光源） */
  flash(pos, size, color, life, y = 1) {
    this._play({
      startLife: new ConstantValue(life), startSpeed: new ConstantValue(0), startSize: new ConstantValue(size),
      startColor: new ConstantColor(c4(color)), material: this.mat.glow, shape: new PointEmitter(), emissionBursts: burst(1),
    }, pos, { y, behaviors: [new SizeOverLife(curve(0.3, 1.05, 1.1, 1.2)), new ColorOverLife(hot(color, 0.1))] });
    this._play({
      startLife: new ConstantValue(life * 0.8), startSpeed: new ConstantValue(0), startSize: new ConstantValue(size * 0.9),
      startColor: new ConstantColor(c4(color)), material: this.mat.flare, shape: new PointEmitter(),
      startRotation: new IntervalValue(0, Math.PI), emissionBursts: burst(1),
    }, pos, { y, behaviors: [new SizeOverLife(curve(0.1, 1.3, 1, 0.5)), new ColorOverLife(hot(color, 0.05)), new RotationOverLife(new ConstantValue(1.5))] });
    if (size >= 2.5) this.light(pos, color, Math.min(60, size * 7), life * 1.2, size * 3, y);
  }

  /** 火花：白熱的細長光條往外噴，受重力 */
  sparks(pos, n, color, speed = 6, life = 0.5, { y = 0.9, up = 1, inward = false } = {}) {
    if (inward) return this.converge(pos, n, color, speed * life, life, y);
    this._play({
      startLife: new IntervalValue(life * 0.5, life * 1.2), startSpeed: new IntervalValue(speed * 0.35, speed),
      startSize: new IntervalValue(0.18, 0.34), startColor: new ConstantColor(c4(color)),
      material: this.mat.spark, renderMode: RenderMode.StretchedBillBoard, speedFactor: 0.07,
      shape: up > 1 ? new HemisphereEmitter({ radius: 0.3 }) : new SphereEmitter({ radius: 0.3 }), emissionBursts: burst(n),
    }, pos, {
      y, rotX: up > 1 ? -Math.PI / 2 : 0,
      behaviors: [new ApplyForce(DOWN, new ConstantValue(10 / Math.max(0.5, up))), new SpeedOverLife(curve(1, 0.6, 0.35, 0.15)), new ColorOverLife(hot(color, 0.3)), new SizeOverLife(curve(1, 0.9, 0.6, 0.2))],
    });
  }

  /** 蓄力：光點從外圍吸進中心 */
  converge(pos, n, color, radius = 3, life = 0.4, y = 1) {
    this._play({
      startLife: new ConstantValue(life), startSpeed: new ConstantValue(-radius / life),
      startSize: new IntervalValue(0.2, 0.4), startColor: new ConstantColor(c4(color)),
      material: this.mat.spark, renderMode: RenderMode.StretchedBillBoard, speedFactor: 0.06,
      shape: new SphereEmitter({ radius, thickness: 0 }), emissionBursts: burst(n),
    }, pos, { y, behaviors: [new ColorOverLife(new Gradient([[c3(color), 0], [c3(WHITE), 1]], [[0, 0], [1, 0.3], [1, 1]]))] });
  }

  /** 餘燼：往上飄、被氣流擾動的光點 */
  embers(pos, n, color, radius = 1.5, life = 1.4) {
    this._play({
      startLife: new IntervalValue(life * 0.6, life), startSpeed: new IntervalValue(0.5, 2),
      startSize: new IntervalValue(0.1, 0.22), startColor: new ConstantColor(c4(color)), material: this.mat.glow,
      shape: new CircleEmitter({ radius }), emissionBursts: burst(n),
    }, pos, { y: 0.3, rotX: -Math.PI / 2, behaviors: [new ApplyForce(UP, new ConstantValue(2.5)), new Noise(new ConstantValue(0.8), new ConstantValue(1.5)), new ColorOverLife(hot(color, 0.5))] });
  }

  /** 煙塵：柔和煙團，擴散變淡 */
  smoke(pos, n, color, size = 2, life = 1, radius = 1) {
    this._play({
      startLife: new IntervalValue(life * 0.7, life), startSpeed: new IntervalValue(0.5, 2),
      startSize: new IntervalValue(size * 0.6, size), startColor: new ConstantColor(c4(color, 0.8)),
      startRotation: new IntervalValue(0, Math.PI * 2), material: this.mat.smoke,
      shape: new CircleEmitter({ radius }), emissionBursts: burst(n),
    }, pos, { y: 0.4, rotX: -Math.PI / 2, behaviors: [new SizeOverLife(curve(0.5, 1, 1.3, 1.6)), new ColorOverLife(inout(color, 0.15)), new RotationOverLife(new IntervalValue(-0.6, 0.6)), new ApplyForce(UP, new ConstantValue(0.6))] });
  }

  /** 衝擊波：貼地擴散的光環 */
  shock(pos, radius, color, life = 0.45, y = 0.12) {
    this._play({
      startLife: new ConstantValue(life), startSpeed: new ConstantValue(0), startSize: new ConstantValue(radius * 2),
      startColor: new ConstantColor(c4(color)), material: this.mat.ring, renderMode: RenderMode.HorizontalBillBoard,
      shape: new PointEmitter(), emissionBursts: burst(1),
    }, pos, { y, behaviors: [new SizeOverLife(curve(0.08, 0.75, 0.95, 1)), new ColorOverLife(hot(color, 0.2))] });
  }

  /** 魔法陣：地面上旋轉的符文圈 */
  rune(pos, radius, color, life = 0.8, spin = 1.5, y = 0.1) {
    this._play({
      startLife: new ConstantValue(life), startSpeed: new ConstantValue(0), startSize: new ConstantValue(radius * 2),
      startColor: new ConstantColor(c4(color)), material: this.mat.rune, renderMode: RenderMode.HorizontalBillBoard,
      startRotation: new IntervalValue(0, Math.PI), shape: new PointEmitter(), emissionBursts: burst(1),
    }, pos, { y, behaviors: [new SizeOverLife(curve(0.6, 1.02, 1, 1.08)), new ColorOverLife(inout(color, 0.15)), new RotationOverLife(new ConstantValue(spin))] });
  }

  /** 地裂印記：發光裂縫慢慢冷卻 */
  crack(pos, radius, color, life = 1.2) {
    this._play({
      startLife: new ConstantValue(life), startSpeed: new ConstantValue(0), startSize: new ConstantValue(radius * 2),
      startColor: new ConstantColor(c4(color)), material: this.mat.crack, renderMode: RenderMode.HorizontalBillBoard,
      startRotation: new IntervalValue(0, Math.PI * 2), shape: new PointEmitter(), emissionBursts: burst(1),
    }, pos, { y: 0.08, behaviors: [new SizeOverLife(curve(0.7, 1, 1, 1)), new ColorOverLife(new Gradient([[c3(WHITE), 0], [c3(color), 0.2], [c3(color), 1]], [[1, 0], [0.9, 0.4], [0, 1]]))] });
  }

  // ═══ BattleScene / skills.js 用的介面 ═══════════

  ring(pos, from, to, life, color) {
    if (Math.abs(to - from) < 0.01) { // 固定大小的圈（世界王預警）
      this._play({
        startLife: new ConstantValue(life), startSpeed: new ConstantValue(0), startSize: new ConstantValue(to * 2),
        startColor: new ConstantColor(c4(color)), material: this.mat.ring, renderMode: RenderMode.HorizontalBillBoard,
        shape: new PointEmitter(), emissionBursts: burst(1),
      }, pos, { y: 0.12, behaviors: [new ColorOverLife(fade(color, 0.8))] });
      return;
    }
    this.shock(pos, to, color, life);
    if (to - from > 2.5) {
      this._play({
        startLife: new ConstantValue(life), startSpeed: new ConstantValue((to - from) / life),
        startSize: new IntervalValue(0.15, 0.3), startColor: new ConstantColor(c4(color)),
        material: this.mat.spark, renderMode: RenderMode.StretchedBillBoard, speedFactor: 0.05,
        shape: new CircleEmitter({ radius: Math.max(from, 0.2), thickness: 0 }), emissionBursts: burst(Math.min(40, Math.round(to * 4))),
      }, pos, { y: 0.25, rotX: -Math.PI / 2, behaviors: [new SpeedOverLife(curve(1.3, 1, 0.8, 0.5)), new ColorOverLife(hot(color, 0.4))] });
    }
  }

  wall(pos, from, to, height, color, life) {
    const ratio = Math.round((height / Math.max(to, 0.5)) * 20) / 20;
    const geo = this._geo(`wall:${ratio}`, () => new THREE.CylinderGeometry(1, 1, ratio, 48, 1, true).translate(0, ratio / 2, 0));
    this._play({
      startLife: new ConstantValue(life), startSpeed: new ConstantValue(0), startSize: new ConstantValue(to),
      startColor: new ConstantColor(c4(color)), material: this.mat.vfade, renderMode: RenderMode.Mesh, instancingGeometry: geo,
      startRotation: new AxisAngleGenerator(UP, new ConstantValue(0)), shape: new PointEmitter(), emissionBursts: burst(1),
    }, pos, { behaviors: [new SizeOverLife(curve(from / to, 0.8, 0.96, 1)), new ColorOverLife(hot(color, 0.15))] });
  }

  beam(pos, radius, height, color, life) {
    const mk = (r, h) => {
      const ratio = Math.round((h / r) * 2) / 2;
      return this._geo(`beam:${ratio}`, () => new THREE.CylinderGeometry(1, 0.75, ratio, 24, 1, true).translate(0, ratio / 2, 0));
    };
    const col = (r, h, c, l, sizeCurve) => this._play({
      startLife: new ConstantValue(l), startSpeed: new ConstantValue(0), startSize: new ConstantValue(r),
      startColor: new ConstantColor(c4(c)), material: this.mat.vfade, renderMode: RenderMode.Mesh, instancingGeometry: mk(r, h),
      startRotation: new AxisAngleGenerator(UP, new ConstantValue(0)), shape: new PointEmitter(), emissionBursts: burst(1),
    }, pos, { behaviors: [new SizeOverLife(sizeCurve), new ColorOverLife(hot(c, 0.3))] });
    col(radius, height, color, life, curve(0.3, 1.15, 1, 0.2));
    col(radius * 0.35, height * 1.1, WHITE, life * 0.8, curve(0.2, 1, 0.9, 0.1));
    this.rune(pos, radius * 2.2, color, life * 1.2, 2);
    this._play({
      startLife: new IntervalValue(life * 0.4, life), startSpeed: new IntervalValue(height * 0.8, height * 1.8),
      startSize: new IntervalValue(0.2, 0.4), startColor: new ConstantColor(c4(color)), material: this.mat.spark,
      renderMode: RenderMode.StretchedBillBoard, speedFactor: 0.05, shape: new CircleEmitter({ radius: radius * 0.9 }), emissionBursts: burst(26),
    }, pos, { rotX: -Math.PI / 2, behaviors: [new ColorOverLife(hot(color, 0.3))] });
    this.light(pos, color, 45, life, 18, height * 0.3);
  }

  /** 月牙刀光：外層彩色弧 + 內層白熱刃線，揮動、可跟著角色，刃尖噴火花 */
  crescent(pos, angle, radius, color, life, { arc = 2.4, sweep = 1.5, tilt = 0, y = 0.9, follow = null } = {}) {
    const geo = this._geo(`cr:${arc}`, () => new THREE.RingGeometry(0.3, 1, 40, 1, -Math.PI / 2 - arc / 2, arc).rotateX(-Math.PI / 2));
    const layer = (c, size, l) => {
      const ps = this._play({
        startLife: new ConstantValue(l), startSpeed: new ConstantValue(0), startSize: new ConstantValue(size),
        startColor: new ConstantColor(c4(c)), material: this.mat.slash, renderMode: RenderMode.Mesh, instancingGeometry: geo,
        startRotation: new AxisAngleGenerator(UP, new ConstantValue(0)), shape: new PointEmitter(), emissionBursts: burst(1),
      }, follow ? follow.group.position : pos, { y, local: true, behaviors: [new SizeOverLife(curve(0.82, 0.97, 1, 1.02)), new ColorOverLife(hot(c, 0.25))] });
      const e = ps.emitter;
      e.rotation.z = tilt;
      this.tweens.push({ t: 0, life: l, fn: (k) => {
        e.rotation.y = angle - sweep / 2 + sweep * (1 - (1 - k) ** 2.5);
        if (follow) { const p = follow.group.position; e.position.set(p.x, p.y + y, p.z); }
      } });
    };
    layer(color, radius, life);
    layer(WHITE, radius * 0.97, life * 0.7);
    if (radius > 2.5) {
      const base = follow ? follow.group.position : pos;
      const tipA = angle + sweep / 2;
      const tip = { x: base.x + Math.sin(tipA) * radius * 0.95, z: base.z + Math.cos(tipA) * radius * 0.95 };
      this._play({
        duration: life, startLife: new IntervalValue(0.2, 0.45), startSpeed: new IntervalValue(2, 6), startSize: new IntervalValue(0.15, 0.3),
        startColor: new ConstantColor(c4(color)), material: this.mat.spark, renderMode: RenderMode.StretchedBillBoard, speedFactor: 0.06,
        shape: new SphereEmitter({ radius: 0.3 }), emissionBursts: burst(6, life * 0.45),
      }, tip, { y, behaviors: [new ApplyForce(DOWN, new ConstantValue(6)), new ColorOverLife(hot(color, 0.3))] });
    }
  }

  spike(pos, color, life = 0.7, size = 1) {
    this._play({
      startLife: new ConstantValue(life), startSpeed: new ConstantValue(0), startSize: new ConstantValue(size),
      startColor: new ConstantColor(c4(color)), material: this.mat.rock, renderMode: RenderMode.Mesh, instancingGeometry: this.geo.spike,
      startRotation: new AxisAngleGenerator(new QV3(rand(-0.3, 0.3), 1, rand(-0.3, 0.3)).normalize(), new IntervalValue(0, Math.PI * 2)),
      shape: new PointEmitter(), emissionBursts: burst(1),
    }, pos, { y: -0.1, behaviors: [new SizeOverLife(curve(0, 1.35, 1, 0))] });
    if (Math.random() < 0.5) this.smoke(pos, 2, 0xb9a58a, 1.2 * size, 0.7, 0.4);
  }

  debris(pos, color, n = 8, speed = 6) {
    this._play({
      startLife: new IntervalValue(0.5, 0.9), startSpeed: new IntervalValue(speed * 0.5, speed),
      startSize: new IntervalValue(0.6, 1.3), startColor: new ConstantColor(c4(color)), material: this.mat.rock,
      renderMode: RenderMode.Mesh, instancingGeometry: this.geo.rock,
      startRotation: new AxisAngleGenerator(new QV3(1, 1, 0).normalize(), new IntervalValue(0, 6)),
      shape: new HemisphereEmitter({ radius: 0.6 }), emissionBursts: burst(n),
    }, pos, { y: 0.3, rotX: -Math.PI / 2, behaviors: [new ApplyForce(DOWN, new ConstantValue(24)), new SizeOverLife(curve(1, 1, 0.8, 0))] });
    this.smoke(pos, Math.ceil(n / 2), 0xb9a58a, 2.4, 1.1, 1.2);
  }

  petals(pos, n, color, speed = 7) {
    const sys = (count, mat, c, sz) => this._play({
      startLife: new IntervalValue(1, 1.8), startSpeed: new IntervalValue(speed * 0.3, speed),
      startSize: new IntervalValue(sz * 0.6, sz), startColor: new ConstantColor(c4(c)),
      startRotation: new IntervalValue(0, Math.PI * 2), material: mat, shape: new SphereEmitter({ radius: 0.8 }), emissionBursts: burst(count),
    }, pos, { y: 1.2, behaviors: [new ApplyForce(DOWN, new ConstantValue(1.4)), new SpeedOverLife(curve(1, 0.35, 0.2, 0.15)), new RotationOverLife(new IntervalValue(-6, 6)), new Noise(new ConstantValue(0.7), new ConstantValue(1.4)), new ColorOverLife(fade(c, 0.7))] });
    sys(n, this.mat.petal, color, 0.5);
    sys(Math.ceil(n / 3), this.mat.glow, color, 0.35);
  }

  /** 光帶：中心白熱、頭尾淡出 */
  streak(from, to, color, life, width = 0.5) {
    const dx = to.x - from.x, dz = to.z - from.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.1) return;
    const ratio = Math.max(0.02, Math.round((width / len) * 50) / 50);
    const geo = this._geo(`streak:${ratio}`, () => new THREE.PlaneGeometry(ratio, 1).rotateX(-Math.PI / 2));
    const mid = { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 };
    const rot = Math.atan2(dx, dz);
    for (const [c, s, l] of [[color, len, life], [WHITE, len * 0.98, life * 0.6]]) {
      this._play({
        startLife: new ConstantValue(l), startSpeed: new ConstantValue(0), startSize: new ConstantValue(s),
        startColor: new ConstantColor(c4(c)), material: this.mat.band, renderMode: RenderMode.Mesh, instancingGeometry: geo,
        startRotation: new AxisAngleGenerator(UP, new ConstantValue(rot)), shape: new PointEmitter(), emissionBursts: burst(1),
      }, mid, { y: 0.9, behaviors: [new SizeOverLife(curve(1, 1, 0.97, 0.9)), new ColorOverLife(hot(c, 0.2))] });
    }
  }

  fissure(origin, angle, length, color, { step = 1.2, delay = 0.025, spikes = true, later } = {}) {
    const dx = Math.sin(angle), dz = Math.cos(angle);
    for (let d = 0.8, i = 0; d <= length; d += step, i++) {
      const p = { x: origin.x + dx * d, z: origin.z + dz * d };
      later(i * delay, () => {
        if (i % 2 === 0) this.crack(p, step * 0.9, color, 0.75); // 隔段才留裂縫印記，避免整片地面都是紅線
        this.sparks(p, 3, color, 3.5, 0.5, { y: 0.1, up: 2 });
        if (i % 3 === 0) this.embers(p, 4, color, 0.5, 1.2);
        if (spikes && i % 2 === 0) this.spike({ x: p.x + rand(-0.6, 0.6), z: p.z + rand(-0.6, 0.6) }, 0x6b5a4a, 0.85, rand(0.7, 1.15));
      });
    }
  }

  /** 神龍拖尾：金白雲霧 + 星光 + 青色餘燼（騎乘移動時持續呼叫） */
  dragonTrail(pos, y = 1.6, moving = true) {
    this._play({
      startLife: new IntervalValue(0.8, 1.4), startSpeed: new IntervalValue(0.2, 0.8),
      startSize: new IntervalValue(1, 1.8), startColor: new ConstantColor(c4(0xfff1c4, 0.7)),
      startRotation: new IntervalValue(0, Math.PI * 2), material: this.mat.smoke,
      shape: new SphereEmitter({ radius: 0.5 }), emissionBursts: burst(moving ? 2 : 1),
    }, pos, { y, behaviors: [new SizeOverLife(curve(0.4, 1, 1.4, 1.8)), new ColorOverLife(inout(0xfff1c4, 0.15)), new RotationOverLife(new IntervalValue(-0.5, 0.5))] });
    this._play({
      startLife: new IntervalValue(0.5, 0.9), startSpeed: new IntervalValue(0.3, 1.5), startSize: new IntervalValue(0.15, 0.3),
      startColor: new ConstantColor(c4(0x8ff3ff)), material: this.mat.flare, startRotation: new IntervalValue(0, Math.PI),
      shape: new SphereEmitter({ radius: 0.8 }), emissionBursts: burst(moving ? 2 : 1),
    }, pos, { y, behaviors: [new SizeOverLife(curve(0, 1.2, 0.8, 0)), new RotationOverLife(new ConstantValue(3)), new ColorOverLife(hot(0x5ee7ff, 0.3))] });
  }

  /** 極光拖尾（星辰鯨）：青綠紫三色的柔光帶 + 星點 */
  auroraTrail(pos, y = 1.6, moving = true) {
    const cols = [0x6dffb4, 0x8ff3ff, 0xc98cff];
    this._play({
      startLife: new IntervalValue(0.9, 1.5), startSpeed: new IntervalValue(0.1, 0.5), startSize: new IntervalValue(0.9, 1.6),
      startColor: new ConstantColor(c4(cols[Math.floor(Math.random() * 3)])), material: this.mat.glow,
      shape: new SphereEmitter({ radius: 0.8 }), emissionBursts: burst(moving ? 3 : 1),
    }, pos, { y, behaviors: [new ApplyForce(UP, new ConstantValue(0.6)), new Noise(new ConstantValue(0.4), new ConstantValue(0.6)), new SizeOverLife(curve(0.4, 1, 1.1, 0.6)), new ColorOverLife(inout(cols[Math.floor(Math.random() * 3)], 0.2))] });
    if (Math.random() < 0.5) this.flash(pos, 0.5, 0xffffff, 0.4, y + rand(-0.3, 0.6));
  }

  /** 鳳凰火焰拖尾：火焰團 + 往上竄的火星 + 偶爾一根燃燒羽毛 */
  fireTrail(pos, y = 1.6, moving = true) {
    this._play({
      startLife: new IntervalValue(0.4, 0.8), startSpeed: new IntervalValue(0.5, 1.5),
      startSize: new IntervalValue(0.6, 1.2), startColor: new ConstantColor(c4(0xff7a2a)), material: this.mat.glow,
      shape: new SphereEmitter({ radius: 0.6 }), emissionBursts: burst(moving ? 4 : 2),
    }, pos, { y, behaviors: [new ApplyForce(UP, new ConstantValue(2)), new SizeOverLife(curve(1, 0.8, 0.4, 0)), new ColorOverLife(new Gradient([[c3(0xfff1a8), 0], [c3(0xff7a2a), 0.4], [c3(0xc0201a), 1]], [[1, 0], [0.8, 0.5], [0, 1]]))] });
    this.embers(pos, moving ? 3 : 1, 0xffb347, 0.6, 1);
    if (Math.random() < 0.15) this.feathers(pos, 1, 0xffb347, y, false);
  }

  /** 麒麟雷光：蹄下電弧火花 + 青色閃光 */
  lightningTrail(pos, moving = true) {
    this._play({
      startLife: new IntervalValue(0.1, 0.25), startSpeed: new IntervalValue(3, 8), startSize: new IntervalValue(0.12, 0.25),
      startColor: new ConstantColor(c4(0x7df9ff)), material: this.mat.spark, renderMode: RenderMode.StretchedBillBoard, speedFactor: 0.12,
      shape: new SphereEmitter({ radius: 0.6 }), emissionBursts: burst(moving ? 6 : 2),
    }, pos, { y: 0.3, behaviors: [new ColorOverLife(hot(0x7df9ff, 0.2))] });
    if (Math.random() < 0.35) this.flash(pos, 1.2, 0x7df9ff, 0.12, rand(0.4, 1.6));
  }

  /** 流星：從天上斜斜砸下（彗星拖尾 + 火光），落地爆炸，onHit 在落地瞬間呼叫 */
  meteor(target, color, onHit) {
    const gyT = this.gy(target.x, target.z);
    const from = { x: target.x - 5, y: gyT + 11, z: target.z - 3 };
    const life = 0.42;
    this.comet(from, { x: target.x, y: gyT + 0.3, z: target.z }, color, life, { width: 0.9, length: 22, head: 1.6 });
    const trail = this._play({
      duration: life, emissionOverTime: new ConstantValue(this.lite ? 40 : 80), startLife: new IntervalValue(0.25, 0.45), startSpeed: new ConstantValue(0.5),
      startSize: new IntervalValue(0.4, 0.8), startColor: new ConstantColor(c4(color)), material: this.mat.glow, shape: new SphereEmitter({ radius: 0.3 }),
    }, from, { behaviors: [new SizeOverLife(curve(1, 0.7, 0.3, 0)), new ColorOverLife(hot(color, 0.2))] });
    this.tweens.push({ t: 0, life, fn: (k) => {
      trail.emitter.position.set(from.x + (target.x - from.x) * k, from.y + (gyT + 0.3 - from.y) * k, from.z + (target.z - from.z) * k);
      if (k >= 1) {
        this.flash(target, 3.2, color, 0.35, 0.5);
        this.shock(target, 3.2, color, 0.4);
        this.crack(target, 2.4, color, 0.9);
        this.sparks(target, 10, color, 8, 0.45, { y: 0.3, up: 2 });
        this.embers(target, 6, color, 1, 1);
        this.smoke(target, 2, 0x8a7f9a, 1.6, 0.7, 0.6);
        onHit?.();
      }
    } });
  }

  // ═══ 新增：拖尾 / 打擊感 / 演出 ══════════════════

  /**
   * 彗星：一顆發光彈頭從 from 直線飛到 to，身後拖著 RenderMode.Trail 光帶
   * from / to 可以帶 y（絕對高度）；沒帶就用地面高度 + y0 / y1
   */
  comet(from, to, color, life = 0.2, { width = 0.45, length = 14, head = 1, y0 = 0.9, y1 = 0.9 } = {}) {
    const fy = from.y ?? this.gy(from.x, from.z) + y0;
    const ty = to.y ?? this.gy(to.x, to.z) + y1;
    const dx = to.x - from.x, dy = ty - fy, dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.05) return;
    const at = { x: from.x, y: fy, z: from.z };
    const aim = { rotY: Math.atan2(dx, dz), rotX: -Math.asin(dy / len) };
    const shot = () => ({ startLife: new ConstantValue(life), startSpeed: new ConstantValue(len / life), shape: new ConeEmitter({ radius: 0.001, angle: 0 }), emissionBursts: burst(1) });
    this._play({
      ...shot(), startSize: new ConstantValue(width), startColor: new ConstantColor(c4(color)), material: this.mat.trail,
      renderMode: RenderMode.Trail, rendererEmitterSettings: { startLength: new ConstantValue(length), followLocalOrigin: false },
    }, at, { ...aim, behaviors: [new WidthOverLength(curve(1, 0.85, 0.45, 0)), new ColorOverLife(hot(color, 0.7))] });
    this._play({
      ...shot(), startSize: new ConstantValue(head), startColor: new ConstantColor(c4(color)), material: this.mat.flare,
      startRotation: new IntervalValue(0, Math.PI),
    }, at, { ...aim, behaviors: [new RotationOverLife(new ConstantValue(8)), new ColorOverLife(hot(color, 0.8))] });
  }

  /** 命中：一般 = 小爆光 + 幾道火花；暴擊 = 旋轉星芒 + 金色火花 + 小衝擊環（有預算上限） */
  hit(pos, color, crit = false) {
    if (!this._spend(crit ? 1.5 : 1)) return;
    if (crit) {
      this._play({
        startLife: new ConstantValue(0.26), startSpeed: new ConstantValue(0), startSize: new ConstantValue(2.2),
        startColor: new ConstantColor(c4(0xffd166)), material: this.mat.flare, startRotation: new IntervalValue(0, Math.PI),
        shape: new PointEmitter(), emissionBursts: burst(1),
      }, pos, { y: 1.1, behaviors: [new SizeOverLife(curve(0.2, 1.4, 1, 0.3)), new RotationOverLife(new ConstantValue(4)), new ColorOverLife(hot(0xffd166, 0.1))] });
      this.sparks(pos, this.lite ? 4 : 7, 0xffd166, 7, 0.35, { y: 1 });
      this.shock(pos, 1.4, 0xffe08a, 0.22, 0.5);
      return;
    }
    this._play({
      startLife: new ConstantValue(0.14), startSpeed: new ConstantValue(0), startSize: new ConstantValue(1.1),
      startColor: new ConstantColor(c4(color)), material: this.mat.glow, shape: new PointEmitter(), emissionBursts: burst(1),
    }, pos, { y: 1, behaviors: [new SizeOverLife(curve(0.4, 1, 1, 0.6)), new ColorOverLife(hot(color, 0.1))] });
    this.sparks(pos, 3, color, 5, 0.25, { y: 1 });
  }

  /** 怪物倒下：彩色碎光往外噴再落地 + 魂火往上飄 + 一小團煙；菁英多一圈金光與光柱 */
  death(pos, color, elite = false) {
    if (!elite && !this._spend(2)) return false;
    this._play({
      startLife: new IntervalValue(0.35, 0.65), startSpeed: new IntervalValue(3, 7.5), startSize: new IntervalValue(0.16, 0.34),
      startColor: new ConstantColor(c4(color)), material: this.mat.glow, shape: new HemisphereEmitter({ radius: 0.4 }),
      emissionBursts: burst(elite ? 22 : this.lite ? 6 : 10),
    }, pos, { y: 0.5, rotX: -Math.PI / 2, behaviors: [new ApplyForce(DOWN, new ConstantValue(14)), new SizeOverLife(curve(1, 1, 0.6, 0)), new ColorOverLife(hot(color, 0.4))] });
    this._play({
      startLife: new IntervalValue(0.7, 1.15), startSpeed: new IntervalValue(0.2, 0.8), startSize: new IntervalValue(0.3, 0.6),
      startColor: new ConstantColor(c4(0xe6f3ff)), material: this.mat.glow, shape: new SphereEmitter({ radius: 0.35 }),
      emissionBursts: burst(elite ? 7 : this.lite ? 2 : 3),
    }, pos, { y: 0.8, behaviors: [new ApplyForce(UP, new ConstantValue(3)), new Noise(new ConstantValue(0.6), new ConstantValue(1.2)), new SizeOverLife(curve(0.5, 1, 0.7, 0)), new ColorOverLife(inout(0xdff0ff, 0.2))] });
    this.smoke(pos, elite ? 5 : 2, 0xd8d0c8, elite ? 2 : 1.2, 0.6, 0.4);
    if (elite) {
      this.flash(pos, 3.5, 0xffd166, 0.4, 1);
      this.shock(pos, 4.5, 0xffd166, 0.5);
      this.beam(pos, 0.7, 7, 0xffd166, 0.5);
      this.sparks(pos, 18, 0xffe08a, 9, 0.6, { up: 1.5 });
    }
    return true;
  }

  /** 閃電：從天劈下的分岔電光（VerticalBillBoard 閃爍兩下）+ 落點爆光、火花、衝擊環 */
  lightning(pos, color = 0xbfe6ff, height = 10) {
    const mat = this.boltMats[Math.floor(Math.random() * this.boltMats.length)];
    const flicker = (c) => new Gradient([[c3(WHITE), 0], [c3(c), 0.4], [c3(c), 1]], [[1, 0], [0.25, 0.25], [1, 0.4], [0.6, 0.6], [0, 1]]);
    for (const [c, size, l] of [[color, height, 0.3], [WHITE, height * 0.96, 0.2]]) {
      this._play({
        startLife: new ConstantValue(l), startSpeed: new ConstantValue(0), startSize: new ConstantValue(size),
        startColor: new ConstantColor(c4(c)), material: mat, renderMode: RenderMode.VerticalBillBoard,
        shape: new PointEmitter(), emissionBursts: burst(1),
      }, pos, { y: height / 2, behaviors: [new ColorOverLife(flicker(c))] });
    }
    this.flash(pos, 2.6, color, 0.25, 0.4);
    this.shock(pos, 2.8, color, 0.35);
    this.sparks(pos, 8, color, 7, 0.35, { y: 0.2, up: 2 });
    this.crack(pos, 1.8, color, 0.6);
  }

  /** 螺旋氣流：光點繞著中心旋轉上升（OrbitOverLife），follow = 跟著角色走 */
  vortex(pos, radius, color, life = 1, { n = 40, rise = 5, spin = 7, follow = null, size = 0.3 } = {}) {
    const dur = life * 0.6;
    const ps = this._play({
      duration: dur, emissionOverTime: new ConstantValue((this.lite ? n * 0.5 : n) / dur),
      startLife: new IntervalValue(life * 0.4, life * 0.6), startSpeed: new ConstantValue(-radius * 0.4),
      startSize: new IntervalValue(size * 0.6, size), startColor: new ConstantColor(c4(color)), material: this.mat.glow,
      shape: new CircleEmitter({ radius, thickness: 0.3 }),
    }, follow ? follow.group.position : pos, {
      y: 0.2, local: true, rotX: -Math.PI / 2,
      behaviors: [
        new OrbitOverLife(new ConstantValue(spin), new QV3(0, 0, 1)),
        new ApplyForce(new QV3(0, 0, 1), new ConstantValue(rise * 2)),
        new SizeOverLife(curve(0.4, 1, 0.8, 0)), new ColorOverLife(hot(color, 0.5)),
      ],
    });
    if (follow) this.tweens.push({ t: 0, life, fn: () => { const p = follow.group.position; ps.emitter.position.set(p.x, p.y + 0.2, p.z); } });
  }

  /** 首領砸地預警：越來越大的紅色魔法陣 + 外圈往內吸的火點（life 秒後砸下） */
  telegraph(pos, radius, life, color = 0xff2a2a) {
    this._play({
      startLife: new ConstantValue(life), startSpeed: new ConstantValue(0), startSize: new ConstantValue(radius * 2),
      startColor: new ConstantColor(c4(color)), material: this.mat.rune, renderMode: RenderMode.HorizontalBillBoard,
      startRotation: new IntervalValue(0, Math.PI), shape: new PointEmitter(), emissionBursts: burst(1),
    }, pos, { y: 0.11, behaviors: [new SizeOverLife(curve(0.15, 0.8, 1, 1)), new ColorOverLife(new Gradient([[c3(color), 0], [c3(WHITE), 1]], [[0, 0], [0.9, 0.3], [1, 1]])), new RotationOverLife(new ConstantValue(2.5))] });
    this._play({
      duration: life * 0.8, emissionOverTime: new ConstantValue(this.lite ? 14 : 30), startLife: new ConstantValue(0.45),
      startSpeed: new ConstantValue(-radius / 0.45), startSize: new IntervalValue(0.15, 0.3), startColor: new ConstantColor(c4(color)),
      material: this.mat.spark, renderMode: RenderMode.StretchedBillBoard, speedFactor: 0.05,
      shape: new CircleEmitter({ radius, thickness: 0 }),
    }, pos, { y: 0.25, rotX: -Math.PI / 2, behaviors: [new ColorOverLife(hot(color, 0.5))] });
  }

  /** 首領倒下：雙層魔法陣、光柱、魂火漩渦、衝擊波、灰燼 */
  bossDeath(pos, color = 0xff3b5c) {
    this.rune(pos, 7, color, 2.4, 1.2);
    this.rune(pos, 4, WHITE, 2.4, -2);
    this.beam(pos, 2.2, 18, color, 1.6);
    this.vortex(pos, 4, color, 2.4, { n: 70, rise: 6, spin: 4, size: 0.5 });
    this.flash(pos, 10, color, 0.9, 2);
    this.light(pos, color, 80, 1.4, 30, 3);
    this.shock(pos, 14, color, 0.8);
    this.shock(pos, 9, WHITE, 0.5);
    this.wall(pos, 0.5, 11, 2.6, color, 0.8);
    this.sparks(pos, 36, 0xff8fa3, 12, 1, { up: 1.5 });
    this.embers(pos, 40, color, 4, 2.4);
    this.smoke(pos, 10, 0x4a3040, 4, 1.8, 3);
  }

  /** 升級：金色光旋從腳下捲上來 + 光柱 + 魔法陣 + 星芒 */
  levelUp(actor) {
    const pos = actor.group.position;
    this.vortex(pos, 1.6, 0xffd166, 1.4, { n: 60, rise: 6, spin: 8, follow: actor, size: 0.35 });
    this.rune(pos, 3.2, 0xf5c04a, 1.4, 2.5);
    this.beam(pos, 1.1, 12, 0xf5c04a, 0.9);
    this.flash(pos, 4, 0xffe08a, 0.5, 1.4);
    this.sparks(pos, 22, 0xffe08a, 8, 0.8, { up: 1.6 });
    this.shock(pos, 6, 0xffd166, 0.7);
  }

  /** 狂熱中身上持續冒的金光（每 0.12 秒呼叫） */
  feverAura(pos) {
    this.sparks(pos, 2, 0xffe08a, 3, 0.6, { y: 0.4, up: 1.6 });
    if (Math.random() < 0.4) {
      this._play({
        startLife: new IntervalValue(0.4, 0.7), startSpeed: new IntervalValue(0.5, 1.5), startSize: new IntervalValue(0.3, 0.55),
        startColor: new ConstantColor(c4(0xffd166)), material: this.mat.flare, startRotation: new IntervalValue(0, Math.PI),
        shape: new CircleEmitter({ radius: 0.8 }), emissionBursts: burst(1),
      }, pos, { y: 0.3, rotX: -Math.PI / 2, behaviors: [new ApplyForce(UP, new ConstantValue(3)), new SizeOverLife(curve(0, 1.2, 0.8, 0)), new RotationOverLife(new ConstantValue(3))] });
    }
  }

  /** 塵土：跑步、上下坐騎時腳下揚起的一小團 */
  dust(pos, color = 0xb89a6a, n = 2) {
    this._play({
      startLife: new IntervalValue(0.4, 0.7), startSpeed: new IntervalValue(0.5, 1.6), startSize: new IntervalValue(0.5, 1),
      startColor: new ConstantColor(c4(color, 0.7)), startRotation: new IntervalValue(0, Math.PI * 2), material: this.mat.smoke,
      shape: new HemisphereEmitter({ radius: 0.3 }), emissionBursts: burst(n),
    }, pos, { y: 0.15, rotX: -Math.PI / 2, behaviors: [new ApplyForce(DOWN, new ConstantValue(2)), new SizeOverLife(curve(0.6, 1, 1.3, 1.5)), new ColorOverLife(inout(color, 0.1)), new RotationOverLife(new IntervalValue(-1, 1))] });
  }

  /** 羽毛：慢慢飄落、翻轉、被風吹（聖羽之翼），旁邊帶一點閃光 */
  feathers(pos, n, color, y = 1.6, glint = true) {
    this._play({
      startLife: new IntervalValue(1.6, 2.6), startSpeed: new IntervalValue(0.3, 1.2),
      startSize: new IntervalValue(0.28, 0.45), startColor: new ConstantColor(c4(color)),
      startRotation: new IntervalValue(0, Math.PI * 2), material: this.mat.feather,
      shape: new SphereEmitter({ radius: 0.7 }), emissionBursts: burst(n),
    }, pos, { y, behaviors: [new ApplyForce(DOWN, new ConstantValue(0.7)), new RotationOverLife(new IntervalValue(-2.5, 2.5)), new Noise(new ConstantValue(0.5), new ConstantValue(0.9)), new ColorOverLife(fade(color, 0.6))] });
    if (glint) {
      this._play({
        startLife: new IntervalValue(0.3, 0.6), startSpeed: new ConstantValue(0), startSize: new IntervalValue(0.25, 0.5),
        startColor: new ConstantColor(c4(0xfff1c4)), material: this.mat.flare, startRotation: new IntervalValue(0, Math.PI),
        shape: new SphereEmitter({ radius: 0.9 }), emissionBursts: burst(Math.max(1, Math.round(n / 2))),
      }, pos, { y, behaviors: [new SizeOverLife(curve(0, 1.2, 0.8, 0)), new RotationOverLife(new ConstantValue(2))] });
    }
  }

  disc(pos, radius, life, color) {
    this._play({
      startLife: new ConstantValue(life), startSpeed: new ConstantValue(0), startSize: new ConstantValue(radius * 2.2),
      startColor: new ConstantColor(c4(color)), material: this.mat.glow, renderMode: RenderMode.HorizontalBillBoard,
      shape: new PointEmitter(), emissionBursts: burst(1),
    }, pos, { y: 0.12, behaviors: [new SizeOverLife(curve(0.4, 1, 1, 1)), new ColorOverLife(hot(color, 0.25))] });
  }

  /** 迴旋刃：兩把發光刀刃繞身 + 拖尾光點 + 腳下魔法陣 */
  orbitBlades(actor, dur, color) {
    const follow = (ps, y) => this.tweens.push({ t: 0, life: dur, fn: () => {
      const p = actor.group.position;
      ps.emitter.position.set(p.x, p.y + y, p.z);
    } });
    const orbit = () => new OrbitOverLife(new ConstantValue(9), new QV3(0, 0, 1));
    const blades = this._play({
      duration: dur, startLife: new ConstantValue(dur), startSpeed: new ConstantValue(0), startSize: new ConstantValue(1.2),
      startColor: new ConstantColor(c4(WHITE)), material: this.mat.solid, renderMode: RenderMode.Mesh, instancingGeometry: this.geo.blade,
      startRotation: new AxisAngleGenerator(UP, new ConstantValue(0)), shape: new CircleEmitter({ radius: 2.5, thickness: 0 }), emissionBursts: burst(2),
    }, actor.group.position, { y: 0.9, local: true, rotX: -Math.PI / 2, behaviors: [orbit(), new ColorOverLife(fade(color, 0.85))] });
    follow(blades, 0.9);
    for (const [rate, mat, sz, l] of [[70, this.mat.glow, [0.35, 0.6], 0.3], [25, this.mat.spark, [0.2, 0.35], 0.45]]) {
      const trail = this._play({
        duration: dur, emissionOverTime: new ConstantValue(rate), startLife: new ConstantValue(l), startSpeed: new ConstantValue(0),
        startSize: new IntervalValue(...sz), startColor: new ConstantColor(c4(color)), material: mat,
        shape: new CircleEmitter({ radius: 2.5, thickness: 0 }),
      }, actor.group.position, { y: 0.9, local: true, rotX: -Math.PI / 2, behaviors: [orbit(), new SizeOverLife(curve(1, 0.7, 0.3, 0)), new ColorOverLife(hot(color, 0.2))] });
      follow(trail, 0.9);
    }
    this.rune(actor.group.position, 3, color, dur, 3);
  }

  dispose() {
    this.scene.remove(this.batch);
    this.batch.dispose?.();
    for (const L of this.lights) this.scene.remove(L.l);
    for (const m of Object.values(this.mat)) m.dispose();
    for (const m of this.boltMats) m.dispose();
    for (const t of Object.values(this.t)) (Array.isArray(t) ? t : [t]).forEach((x) => x.dispose());
    for (const g of Object.values(this.geo)) g.dispose();
    for (const g of this.geoCache.values()) g.dispose();
  }
}
