// ─────────────────────────────────────────────
// 翅膀模型（純外觀）：掛在角色背上（hero.rig），跟著身體轉
// 4 種造型：feather 羽翼 / bat 蝠翼 / butterfly 蝶翼 / crystal 冰晶翼
// 等級外觀：Lv.1 基本 → Lv.4 發光邊 → Lv.7 翅膀變大 + 飄落光點（BattleScene 負責）→ Lv.10 背後光環
// ─────────────────────────────────────────────
import * as THREE from 'three';
import { createWingModel } from './monsterModels.js';

const glowMat = (color, opacity) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
});

/** 羽翼：一層層的羽毛片，越外越長 */
function feather(def, side, mats, lv) {
  const g = new THREE.Group();
  const rows = lv >= 7 ? 3 : 2;
  for (let r = 0; r < rows; r++) {
    const n = 6 - r;
    for (let i = 0; i < n; i++) {
      const len = 0.55 + i * 0.13 - r * 0.12;
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.2, len), r === 0 ? mats.main : mats.alt);
      // 羽毛沿著翼骨往外排，越外面越往下垂
      f.position.set(side * (0.15 + i * 0.16), 0.3 - i * 0.07 - r * 0.12 - len * 0.3, -r * 0.03);
      f.rotation.z = side * -(0.6 + i * 0.28);
      g.add(f);
    }
  }
  return g;
}

/** 蝠翼：骨架 + 翼膜 */
function bat(def, side, mats) {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0.5, 0.45);
  shape.lineTo(1.15, 0.5);
  shape.quadraticCurveTo(1.0, 0.1, 1.2, -0.25);
  shape.quadraticCurveTo(0.85, -0.15, 0.8, -0.5);
  shape.quadraticCurveTo(0.5, -0.3, 0.35, -0.55);
  shape.quadraticCurveTo(0.2, -0.25, 0, -0.2);
  const geo = new THREE.ShapeGeometry(shape);
  const mem = new THREE.Mesh(geo, mats.main);
  mem.scale.x = side;
  g.add(mem);
  // 骨架：從肩膀連到每個翼尖
  for (const [x, y] of [[1.15, 0.5], [1.2, -0.25], [0.8, -0.5], [0.35, -0.55]]) {
    const vx = side * x, vy = y;
    const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, Math.hypot(vx, vy), 4), mats.edge);
    bone.position.set(vx / 2, vy / 2, 0.01);
    bone.rotation.z = -Math.atan2(vx, vy);
    g.add(bone);
  }
  return g;
}

/** 蝶翼：上下兩片半透明翅膀 + 花紋 */
function butterfly(def, side, mats) {
  const g = new THREE.Group();
  const up = new THREE.Mesh(new THREE.CircleGeometry(0.55, 18), mats.main);
  up.scale.set(1.2, 0.85, 1);
  up.position.set(side * 0.55, 0.25, 0);
  up.rotation.z = side * 0.4;
  const low = new THREE.Mesh(new THREE.CircleGeometry(0.38, 16), mats.alt);
  low.scale.set(1, 1.2, 1);
  low.position.set(side * 0.38, -0.3, 0.01);
  low.rotation.z = side * -0.3;
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.14, 12), mats.edge);
  dot.position.set(side * 0.7, 0.3, 0.02);
  g.add(up, low, dot);
  return g;
}

/** 冰晶翼：一片片尖晶 */
function crystal(def, side, mats, lv) {
  const g = new THREE.Group();
  const n = lv >= 7 ? 7 : 5;
  for (let i = 0; i < n; i++) {
    const len = 0.5 + i * 0.12;
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0).scale(1, len / 0.24, 0.4), i % 2 ? mats.alt : mats.main);
    const a = 0.5 + i * 0.22;
    c.position.set(side * Math.sin(a) * (0.25 + len * 0.5), 0.2 - Math.cos(a) * 0.1 - i * 0.05, -0.02 * i);
    c.rotation.z = side * -a;
    g.add(c);
  }
  return g;
}

// 星雲貼圖（共用一張）：深靛 → 紫的漸層、星雲雲氣、大小星點、邊緣青光
let nebulaTex = null;
function nebula() {
  if (nebulaTex) return nebulaTex;
  const S = 512, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const bg = g.createLinearGradient(0, 0, S, S);
  bg.addColorStop(0, '#0b0730'); bg.addColorStop(0.5, '#2a1470'); bg.addColorStop(1, '#5a1f8a');
  g.fillStyle = bg; g.fillRect(0, 0, S, S);
  const cloud = (x, y, r, c) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S); };
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i++) cloud(Math.random() * S, Math.random() * S, S * (0.15 + Math.random() * 0.25), ['rgba(90,140,255,.35)', 'rgba(200,90,255,.3)', 'rgba(80,230,255,.25)'][i % 3]);
  // 一條斜斜的銀河帶
  g.save(); g.translate(S / 2, S / 2); g.rotate(-0.6);
  const band = g.createLinearGradient(0, -S * 0.12, 0, S * 0.12);
  band.addColorStop(0, 'rgba(255,255,255,0)'); band.addColorStop(0.5, 'rgba(210,230,255,.45)'); band.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = band; g.fillRect(-S, -S * 0.12, S * 2, S * 0.24); g.restore();
  for (let i = 0; i < 500; i++) { // 星點
    const r = Math.random() < 0.06 ? 1.6 + Math.random() * 1.6 : 0.4 + Math.random() * 0.9;
    g.fillStyle = `rgba(255,255,255,${0.5 + Math.random() * 0.5})`;
    g.beginPath(); g.arc(Math.random() * S, Math.random() * S, r, 0, Math.PI * 2); g.fill();
  }
  nebulaTex = new THREE.CanvasTexture(cv);
  nebulaTex.colorSpace = THREE.SRGBColorSpace;
  return nebulaTex;
}

/** 星河之翼：大片流線型翼膜（像天使翅膀的輪廓，但是一整片半透明星雲）＋青色亮邊 */
function galaxy(def, side, mats) {
  const g = new THREE.Group();
  const sh = new THREE.Shape();
  sh.moveTo(0, 0.1);
  sh.bezierCurveTo(0.35, 0.75, 0.95, 0.95, 1.45, 0.7);   // 上緣往外上揚
  sh.bezierCurveTo(1.25, 0.45, 1.35, 0.15, 1.5, -0.1);  // 翼尖
  sh.bezierCurveTo(1.15, -0.05, 1.1, -0.35, 1.2, -0.6); // 第二道羽尖
  sh.bezierCurveTo(0.85, -0.45, 0.75, -0.75, 0.75, -0.95);
  sh.bezierCurveTo(0.5, -0.6, 0.3, -0.4, 0, -0.15);
  const geo = new THREE.ShapeGeometry(sh, 24);
  // UV：用形狀範圍攤平到 0~1，貼星雲
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 1.5, (pos.getY(i) + 0.95) / 1.9);
  const mem = new THREE.Mesh(geo, mats.main);
  mem.scale.x = side;
  // 亮邊：同形狀的線框輪廓
  const edgePts = sh.getPoints(60).map((p) => new THREE.Vector3(p.x * side, p.y, 0.01));
  const edge = new THREE.Line(new THREE.BufferGeometry().setFromPoints(edgePts), mats.edgeLine);
  g.add(mem, edge);
  return g;
}

const BUILDERS = { feather, bat, butterfly, crystal, galaxy };

/**
 * @param def 伺服器 config.wings[id]
 * @param lv  翅膀等級（決定大小與華麗程度）
 */
export function createWings(def, lv = 1) {
  if (def.model === 'glb') return createGlbWings(def, lv);
  const root = new THREE.Group();
  root.position.set(0, 1.25, -0.32);
  root.rotation.x = -0.45; // 往後仰，從上往下的鏡頭才看得到整片翅膀
  const translucent = def.model === 'butterfly' || def.model === 'crystal' || def.model === 'galaxy';
  if (def.model === 'galaxy') { // 星雲翼膜：自發光貼圖（不受場景光影響才看得到星星）
    const mats = {
      main: new THREE.MeshBasicMaterial({ map: nebula(), side: THREE.DoubleSide, transparent: true, opacity: 0.88, depthWrite: false }),
      edgeLine: new THREE.LineBasicMaterial({ color: def.accent, transparent: true, opacity: 0.9 }),
      alt: null, edge: null,
    };
    mats.main.emissiveIntensity = 0; // animateWings 會讀這個欄位
    const root = new THREE.Group();
    root.position.set(0, 1.3, -0.36);
    root.rotation.x = -0.85; // 往後仰：俯視鏡頭才看得到整片星雲翼膜
    const wings = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.x = side * 0.1;
      pivot.add(galaxy(def, side, mats));
      // Lv.4 起：外圈柔光
      if (lv >= 4) {
        const glow = galaxy(def, side, { main: glowMat(def.accent, 0.12), edgeLine: new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5 }) });
        glow.scale.setScalar(1.06); glow.position.z = -0.02;
        pivot.add(glow);
      }
      root.add(pivot);
      return { pivot, side };
    });
    root.scale.setScalar(0.95 + lv * 0.04);
    let halo = null;
    if (lv >= 10) { halo = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 40), glowMat(def.accent, 0.7)); halo.position.set(0, 0.55, -0.05); root.add(halo); }
    return { root, wings, mats, halo, def, lv, sparkle: true, stars: true };
  }
  const mats = {
    main: new THREE.MeshLambertMaterial({
      color: def.color, side: THREE.DoubleSide, flatShading: true,
      transparent: translucent, opacity: translucent ? 0.82 : 1,
      emissive: def.accent, emissiveIntensity: 0.08 + lv * 0.04,
    }),
    alt: new THREE.MeshLambertMaterial({
      color: new THREE.Color(def.color).lerp(new THREE.Color(def.accent), 0.35), side: THREE.DoubleSide, flatShading: true,
      transparent: translucent, opacity: translucent ? 0.75 : 1, emissive: def.accent, emissiveIntensity: 0.1 + lv * 0.05,
    }),
    edge: new THREE.MeshBasicMaterial({ color: def.accent }),
  };
  const make = BUILDERS[def.model] ?? feather;
  const wings = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.x = side * 0.12;
    const w = make(def, side, mats, lv);
    pivot.add(w);
    // Lv.4：發光邊（同造型放大一點、加法混色）
    if (lv >= 4) {
      const glow = make(def, side, { main: glowMat(def.accent, 0.25), alt: glowMat(def.accent, 0.2), edge: glowMat(def.accent, 0.5) }, lv);
      glow.scale.setScalar(1.08);
      glow.position.z = -0.02;
      pivot.add(glow);
    }
    root.add(pivot);
    return { pivot, side };
  });
  const size = 1.15 + lv * 0.04 + (lv >= 7 ? 0.15 : 0);
  root.scale.setScalar(size);
  // Lv.10：背後光環
  let halo = null;
  if (lv >= 10) {
    halo = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 40), glowMat(def.accent, 0.7));
    halo.position.set(0, 0.55, -0.05);
    root.add(halo);
  }
  return { root, wings, mats, halo, def, lv, sparkle: lv >= 7 };
}

/** 聖羽之翼：用 Meshy 模型，等級越高越大越亮（羽毛 / 閃光特效由 BattleScene 用 three.quarks 發） */
function createGlbWings(def, lv) {
  const m = createWingModel(2.6 + lv * 0.06);
  if (!m) return createWings({ ...def, model: 'feather' }, lv); // 模型沒載到就用程式羽翼
  const root = new THREE.Group();
  root.position.set(0, 1.35, -0.38);
  root.rotation.x = -0.8; // 往後仰比較多：俯視鏡頭才看得到整片翅膀
  root.add(m.root);
  m.mat.emissiveIntensity = 0.3 + lv * 0.04; // 微微發白光，等級越高越亮
  let halo = null;
  if (lv >= 10) {
    halo = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 40), glowMat(def.accent, 0.7));
    halo.position.set(0, 0.62, -0.05);
    root.add(halo);
  }
  return { root, wings: [], mats: { main: m.mat }, halo, def, lv, sparkle: true, glb: m };
}

/** 輕輕拍動（走路時拍快一點） */
export function animateWings(w, t, { moving = false } = {}) {
  if (w.glb) { // 模型翅膀：整對上下起伏 + 微微開合
    w.glb.root.position.y = Math.sin(t * (moving ? 6 : 2)) * 0.05;
    w.glb.root.scale.x = 1 + Math.sin(t * (moving ? 6 : 2)) * (moving ? 0.08 : 0.03);
    if (w.halo) { w.halo.rotation.z = t * 0.8; w.halo.material.opacity = 0.5 + Math.sin(t * 3) * 0.2; }
    return;
  }
  const speed = moving ? 7 : 2.2;
  const amp = moving ? 0.35 : 0.15;
  const flap = Math.sin(t * speed) * amp;
  for (const { pivot, side } of w.wings) pivot.rotation.y = side * (0.12 + flap * 0.6);
  if (w.halo) { w.halo.rotation.z = t * 0.8; w.halo.material.opacity = 0.5 + Math.sin(t * 3) * 0.2; }
  if (w.stars) { w.mats.main.opacity = 0.8 + Math.sin(t * 1.7) * 0.08; w.mats.edgeLine.opacity = 0.7 + Math.sin(t * 3) * 0.25; return; }
  w.mats.main.emissiveIntensity = 0.08 + w.lv * 0.04 + Math.sin(t * 2.5) * 0.04 * (w.lv / 10);
}

export function disposeWings(w) {
  if (w.glb) { w.glb.mat.dispose(); w.halo?.geometry.dispose(); w.halo?.material.dispose(); return; }
  w.root.traverse((o) => { o.geometry?.dispose(); });
  for (const m of Object.values(w.mats)) m?.dispose(); // material.dispose 不會釋放貼圖，共用的星雲貼圖不受影響
  w.root.traverse((o) => { if (o.material && !Object.values(w.mats).includes(o.material)) o.material.dispose(); });
}

/** 角色換翅膀：def = null 代表不戴 */
export function setHeroWings(hero, def, lv) {
  const key = def ? `${def.id}:${lv}` : '';
  if (hero.wingKey === key) return;
  hero.wingKey = key;
  if (hero.wings) { hero.rig.remove(hero.wings.root); disposeWings(hero.wings); hero.wings = null; }
  if (!def) return;
  hero.wings = createWings(def, lv);
  if (hero.skinned) { // 模型角色是寫實比例：背比較高、翅膀縮小一點
    hero.wings.root.position.set(0, 1.55, -0.08);
    hero.wings.root.scale.multiplyScalar(0.62);
  }
  hero.rig.add(hero.wings.root);
}
