// ─────────────────────────────────────────────
// 坐騎模型（程式生成的低多邊形，跟角色同風格）
// 4 種造型：horse 小馬 / raptor 迅龍 / wolf 雪狼 / pegasus 天馬（小馬 + 翅膀 + 角 + 光）
// createMount(def) → { root, saddleY, ... }，animateMount() 每幀呼叫
// 角色騎上去：hero.root 掛在 mount.seat 底下
// ─────────────────────────────────────────────
import * as THREE from 'three';

const lam = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });
const glow = (color, opacity = 0.9) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });

/** 四隻腳：pivot 在髖 / 肩，往下長 */
function makeLeg(mat, hoofMat, len, thick, x, z, y) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(thick, thick * 0.75, len, 6), mat);
  upper.position.y = -len / 2;
  const hoof = new THREE.Mesh(new THREE.CylinderGeometry(thick * 0.8, thick * 0.9, len * 0.18, 6), hoofMat);
  hoof.position.y = -len + len * 0.05;
  pivot.add(upper, hoof);
  return pivot;
}

function horse(def, g) {
  const body = lam(def.color);
  const mane = lam(def.accent);
  const dark = lam(0x2a1d14);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.2, 4, 10).rotateX(Math.PI / 2), body);
  torso.position.y = 1.05;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.9, 8), body);
  neck.position.set(0, 1.5, 0.82);
  neck.rotation.x = 0.55;
  const head = new THREE.Group();
  head.position.set(0, 1.9, 1.1);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.7), body);
  skull.position.z = 0.15;
  skull.rotation.x = 0.35;
  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 0.24), dark);
  muzzle.position.set(0, -0.12, 0.47);
  const ears = [-1, 1].map((s) => {
    const e = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 4), body);
    e.position.set(0.1 * s, 0.24, -0.08);
    return e;
  });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const eyes = [-1, 1].map((s) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), eyeMat);
    e.position.set(0.16 * s, 0.06, 0.2);
    return e;
  });
  head.add(skull, muzzle, ...ears, ...eyes);
  // 鬃毛
  const maneMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.95, 0.18), mane);
  maneMesh.position.set(0, 1.62, 0.7);
  maneMesh.rotation.x = 0.55;
  const tail = new THREE.Group();
  tail.position.set(0, 1.15, -0.95);
  const tailMesh = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.9, 6), mane);
  tailMesh.position.set(0, -0.35, -0.12);
  tailMesh.rotation.x = -0.4;
  tail.add(tailMesh);
  // 馬鞍
  const saddle = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.12, 10, 1, false, 0, Math.PI), lam(0x7a2a1a));
  saddle.rotation.set(0, Math.PI / 2, Math.PI / 2);
  saddle.position.set(0, 1.42, -0.05);
  saddle.scale.set(1, 1, 0.9);
  g.add(torso, neck, head, maneMesh, tail, saddle);
  const legs = [
    makeLeg(body, dark, 0.95, 0.1, -0.24, 0.62, 0.95), makeLeg(body, dark, 0.95, 0.1, 0.24, 0.62, 0.95),
    makeLeg(body, dark, 0.95, 0.11, -0.24, -0.6, 0.95), makeLeg(body, dark, 0.95, 0.11, 0.24, -0.6, 0.95),
  ];
  g.add(...legs);
  return { legs, head, tail, saddleY: 1.48, phase: [0, Math.PI, Math.PI * 0.6, Math.PI * 1.6] };
}

function raptor(def, g) {
  const body = lam(def.color);
  const plate = lam(def.accent, { emissive: def.accent, emissiveIntensity: 0.35 });
  const dark = lam(0x1a0d0a);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.0, 4, 10).rotateX(Math.PI / 2), body);
  torso.position.set(0, 1.15, 0);
  torso.rotation.x = -0.12;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 0.8, 8), body);
  neck.position.set(0, 1.55, 0.78);
  neck.rotation.x = 0.9;
  const head = new THREE.Group();
  head.position.set(0, 1.85, 1.12);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.8), body);
  skull.position.z = 0.2;
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.6), dark);
  jaw.position.set(0, -0.18, 0.28);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffd23a });
  const eyes = [-1, 1].map((s) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), eyeMat);
    e.position.set(0.17 * s, 0.07, 0.1);
    return e;
  });
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 4), plate);
  horn.position.set(0, 0.2, 0.05);
  horn.rotation.x = -0.6;
  head.add(skull, jaw, ...eyes, horn);
  // 背甲：一排發光鱗片
  for (let i = 0; i < 6; i++) {
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 4), plate);
    sp.position.set(0, 1.62 - i * 0.03, 0.55 - i * 0.28);
    sp.rotation.x = -0.3;
    g.add(sp);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 1.2, -0.85);
  const t1 = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.6, 7).rotateX(-Math.PI / 2), body);
  t1.position.z = -0.75;
  tail.add(t1);
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.6), lam(0x3a2a20));
  saddle.position.set(0, 1.55, -0.05);
  g.add(torso, neck, head, tail, saddle);
  // 雙足 + 小手
  const legs = [
    makeLeg(body, dark, 1.0, 0.14, -0.28, -0.15, 1.0), makeLeg(body, dark, 1.0, 0.14, 0.28, -0.15, 1.0),
  ];
  const arms = [-1, 1].map((s) => {
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.35, 5), body);
    a.position.set(0.25 * s, 1.15, 0.65);
    a.rotation.x = 0.8;
    return a;
  });
  g.add(...legs, ...arms);
  return { legs, head, tail, saddleY: 1.6, phase: [0, Math.PI], biped: true, glowMat: plate };
}

function wolf(def, g) {
  const fur = lam(def.color);
  const dark = lam(0x8fa3b8);
  const ice = glow(def.accent, 0.8);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.1, 4, 10).rotateX(Math.PI / 2), fur);
  torso.position.y = 0.95;
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), fur);
  chest.position.set(0, 1.05, 0.55);
  chest.scale.set(1, 1, 0.9);
  const head = new THREE.Group();
  head.position.set(0, 1.4, 1.0);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), fur);
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.5, 6).rotateX(Math.PI / 2), dark);
  snout.position.set(0, -0.06, 0.35);
  const ears = [-1, 1].map((s) => {
    const e = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.28, 4), fur);
    e.position.set(0.15 * s, 0.28, -0.05);
    return e;
  });
  const eyeMat = new THREE.MeshBasicMaterial({ color: def.accent });
  const eyes = [-1, 1].map((s) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), eyeMat);
    e.position.set(0.13 * s, 0.07, 0.24);
    return e;
  });
  head.add(skull, snout, ...ears, ...eyes);
  // 背上的冰晶
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0).scale(0.6, 1.8, 0.6), ice);
    c.position.set((i % 2 ? 0.12 : -0.12), 1.4, 0.3 - i * 0.3);
    c.rotation.z = i % 2 ? -0.4 : 0.4;
    g.add(c);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 1.05, -0.85);
  const tailMesh = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.9, 7), fur);
  tailMesh.position.set(0, 0.15, -0.4);
  tailMesh.rotation.x = -1.1;
  tail.add(tailMesh);
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.1, 0.62), lam(0x34507a));
  saddle.position.set(0, 1.36, -0.05);
  g.add(torso, chest, head, tail, saddle);
  const legs = [
    makeLeg(fur, dark, 0.85, 0.1, -0.22, 0.55, 0.85), makeLeg(fur, dark, 0.85, 0.1, 0.22, 0.55, 0.85),
    makeLeg(fur, dark, 0.85, 0.11, -0.22, -0.55, 0.85), makeLeg(fur, dark, 0.85, 0.11, 0.22, -0.55, 0.85),
  ];
  g.add(...legs);
  return { legs, head, tail, saddleY: 1.42, phase: [0, 0.4, Math.PI, Math.PI + 0.4], bound: true };
}

function pegasus(def, g) {
  const base = horse(def, g);
  const gold = lam(def.accent, { emissive: def.accent, emissiveIntensity: 0.5 });
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.5, 6), gold);
  horn.position.set(0, 0.3, 0.3);
  horn.rotation.x = 0.7;
  base.head.add(horn);
  // 翅膀：以肩膀為軸，用扁平的扇形
  const wingMat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide, flatShading: true, emissive: 0x332a10 });
  const wings = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.3 * s, 1.4, 0.3);
    const feathers = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(1.4 - i * 0.22, 0.32), wingMat);
      f.position.set((0.7 - i * 0.11) * s, 0, -i * 0.22);
      f.rotation.x = -Math.PI / 2;
      feathers.add(f);
    }
    pivot.add(feathers);
    g.add(pivot);
    return { pivot, s };
  });
  // 腳下的光環
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.2, 32).rotateX(-Math.PI / 2), glow(def.accent, 0.5));
  halo.position.y = 0.06;
  g.add(halo);
  return { ...base, wings, halo, glowMat: gold };
}

/** 天穹神龍：東方長龍，一節節的身體在空中波浪擺動（雲霧、星光特效在 BattleScene 用 three.quarks 發） */
function dragon(def, g) {
  const scale = lam(def.color, { emissive: def.color, emissiveIntensity: 0.12 });
  const belly = lam('#fff2c8');
  const gold = lam('#f5c04a', { emissive: '#f5c04a', emissiveIntensity: 0.4 });
  const mane = lam(def.accent, { emissive: def.accent, emissiveIntensity: 0.5 });
  const segs = [];
  const N = 12;
  for (let i = 0; i < N; i++) {
    const r = 0.42 * (1 - i / (N + 2)) + 0.08;
    const seg = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), scale);
    ball.scale.set(1, 0.9, 1.25);
    const under = new THREE.Mesh(new THREE.SphereGeometry(r * 0.8, 8, 6), belly);
    under.position.y = -r * 0.35; under.scale.set(0.9, 0.6, 1.2);
    seg.add(ball, under);
    if (i % 2 === 0 && i < N - 1) { // 背上的鬃毛
      const fin = new THREE.Mesh(new THREE.ConeGeometry(r * 0.35, r * 1.2, 4), mane);
      fin.position.set(0, r * 0.9, 0); fin.rotation.x = -0.5;
      seg.add(fin);
    }
    if (i === 2 || i === 7) { // 兩對龍爪
      for (const sx of [-1, 1]) {
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5, 4), gold);
        claw.position.set(sx * r * 0.9, -r * 0.8, 0.1); claw.rotation.set(0.6, 0, sx * 0.5);
        seg.add(claw);
      }
    }
    seg.userData.r = r;
    g.add(seg);
    segs.push(seg);
  }
  // 尾鰭
  const tailFin = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.8, 4).rotateX(-Math.PI / 2), mane);
  tailFin.position.z = -0.4;
  segs[N - 1].add(tailFin);
  // 龍頭
  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.48, 0.8), scale);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.3, 0.55), scale);
  snout.position.set(0, -0.06, 0.6);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.6), belly);
  jaw.position.set(0, -0.26, 0.5);
  const eyeMat = new THREE.MeshBasicMaterial({ color: def.accent });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), eyeMat);
    eye.position.set(sx * 0.28, 0.1, 0.25);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.75, 5), gold);
    horn.position.set(sx * 0.2, 0.42, -0.25); horn.rotation.set(-0.9, 0, sx * 0.25);
    const whisker = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.008, 1.1, 4), gold);
    whisker.position.set(sx * 0.35, -0.08, 0.75); whisker.rotation.set(1.2, 0, sx * 1.1);
    head.add(eye, horn, whisker);
  }
  const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshBasicMaterial({ color: def.accent }));
  pearl.position.set(0, -0.15, 1.1); // 龍珠
  head.add(skull, snout, jaw, pearl);
  g.add(head);
  return { legs: [], head, tail: null, saddleY: 1.55, phase: [], segs, dragonHead: head, glowMat: mane, pearl, hover: 1.25 };
}

/** 炎煌鳳凰：火焰色的神鳥，大翅膀 + 長尾羽（火焰拖尾在 BattleScene 用 three.quarks） */
function phoenix(def, g) {
  const body = lam(def.color, { emissive: def.color, emissiveIntensity: 0.35 });
  const gold = lam(def.accent, { emissive: def.accent, emissiveIntensity: 0.6 });
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), body);
  torso.scale.set(0.9, 0.8, 1.4); torso.position.y = 1.5;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 0.7, 8), body);
  neck.position.set(0, 1.85, 0.7); neck.rotation.x = 0.6;
  const head = new THREE.Group(); head.position.set(0, 2.15, 1.0);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), body);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 5).rotateX(Math.PI / 2), gold); beak.position.z = 0.25;
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xfff1a8 });
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), eyeMat); e.position.set(sx * 0.12, 0.05, 0.12); head.add(e); }
  for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.35, 4), gold); c.position.set((i - 1) * 0.07, 0.25, -0.05); c.rotation.x = -0.5 - i * 0.1; head.add(c); } // 冠羽
  head.add(skull, beak);
  // 翅膀：一片片火羽
  const wingMat = new THREE.MeshLambertMaterial({ color: '#ff8a2a', emissive: '#ff5a1f', emissiveIntensity: 0.6, side: THREE.DoubleSide });
  const wings = [-1, 1].map((sx) => {
    const pivot = new THREE.Group(); pivot.position.set(sx * 0.35, 1.65, 0.1);
    for (let i = 0; i < 6; i++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(1.7 - i * 0.18, 0.34), i % 2 ? wingMat : gold);
      f.position.set(sx * (0.85 - i * 0.07), 0, -i * 0.2); f.rotation.x = -Math.PI / 2; f.rotation.z = sx * 0.1;
      pivot.add(f);
    }
    g.add(pivot);
    return { pivot, s: sx };
  });
  // 尾羽
  const tail = new THREE.Group(); tail.position.set(0, 1.45, -0.7);
  for (let i = 0; i < 5; i++) {
    const t = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 1.6), i % 2 ? gold : wingMat);
    t.position.set((i - 2) * 0.1, 0, -0.75); t.rotation.set(-Math.PI / 2 + 0.25, 0, (i - 2) * 0.18);
    tail.add(t);
  }
  g.add(torso, neck, head, tail);
  return { legs: [], head, tail, saddleY: 1.92, phase: [], wings, glowMat: body, hoverBird: true };
}

/** 雷光麒麟：鹿角、鱗甲、雲紋蹄，身上流竄青色電光 */
function qilin(def, g) {
  const base = horse({ ...def, color: def.color, accent: def.accent }, g);
  const elec = lam(def.accent, { emissive: def.accent, emissiveIntensity: 0.8 });
  const gold = lam('#f5c04a', { emissive: '#f5c04a', emissiveIntensity: 0.4 });
  for (const sx of [-1, 1]) { // 鹿角
    const antler = new THREE.Group(); antler.position.set(sx * 0.12, 0.25, -0.05);
    const a1 = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.5, 5), gold); a1.position.y = 0.25; a1.rotation.z = -sx * 0.4;
    const a2 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.25, 5), gold); a2.position.set(sx * 0.15, 0.38, 0); a2.rotation.z = -sx * 1.1;
    antler.add(a1, a2); base.head.add(antler);
  }
  for (let i = 0; i < 5; i++) { // 背上的電光鬃
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 4), elec);
    sp.position.set(0, 1.5 - i * 0.02, 0.5 - i * 0.28); sp.rotation.x = -0.4;
    g.add(sp);
  }
  for (const leg of base.legs) { const cloud = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), elec); cloud.position.y = -0.92; cloud.scale.set(1.3, 0.5, 1.3); leg.add(cloud); }
  return { ...base, glowMat: elec };
}

/** 星辰鯨：雲海中的巨鯨，背上有星點、腹部發光、尾鰭擺動（極光拖尾在 BattleScene） */
function whale(def, g) {
  const skin = lam(def.color, { emissive: def.color, emissiveIntensity: 0.2 });
  const belly = lam('#cfe8ff', { emissive: def.accent, emissiveIntensity: 0.35 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.9, 18, 12), skin);
  body.scale.set(0.95, 0.75, 2); body.position.y = 1.45;
  const under = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 10), belly);
  under.scale.set(0.85, 0.5, 1.8); under.position.set(0, 1.2, 0.1);
  const starMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  for (let i = 0; i < 18; i++) { const st = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 4), starMat); const a = Math.random() * Math.PI - Math.PI / 2; st.position.set(Math.sin(a) * 0.7, 1.75 + Math.random() * 0.2, -1.4 + Math.random() * 2.8); g.add(st); }
  const fins = [-1, 1].map((s) => { const f = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.45), skin); f.position.set(s * 0.95, 1.2, 0.4); f.rotation.z = -s * 0.3; g.add(f); return f; });
  const tail = new THREE.Group(); tail.position.set(0, 1.45, -1.75);
  const fluke = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.5), skin); fluke.position.z = -0.35;
  tail.add(fluke);
  const eyeMat = new THREE.MeshBasicMaterial({ color: def.accent });
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), eyeMat); e.position.set(s * 0.72, 1.4, 1.2); g.add(e); }
  g.add(body, under, tail);
  return { legs: [], head: null, tail, saddleY: 2.05, phase: [], fins, glowMat: belly, swimmer: true };
}

const BUILDERS = { horse, raptor, wolf, pegasus, dragon, phoenix, qilin, whale };

/**
 * @param def 伺服器 config.mounts[id]
 */
export function createMount(def) {
  const root = new THREE.Group();
  const body = new THREE.Group(); // 跑步起伏
  root.add(body);
  const parts = (BUILDERS[def.model] ?? horse)(def, body);
  const seat = new THREE.Group();
  seat.position.y = parts.saddleY;
  body.add(seat);
  return { root, body, seat, def, gait: 0, ...parts };
}

/** 每幀動畫：跑步（四足 / 雙足）、頭尾擺動、天馬拍翅 */
export function animateMount(m, t, dt, { moving = false, speed = 1 } = {}) {
  const target = moving ? 1 : 0;
  m.gait += (target - m.gait) * Math.min(1, dt * 8);
  if (m.swimmer) { // 星辰鯨：在空中慢慢游，胸鰭與尾鰭擺動
    const sw = moving ? 4 : 1.6;
    m.body.position.y = 0.3 + Math.sin(t * sw * 0.5) * 0.15;
    m.body.rotation.x = Math.sin(t * sw * 0.5) * 0.04;
    m.tail.rotation.x = Math.sin(t * sw) * 0.35;
    m.fins.forEach((f, i) => { f.rotation.x = Math.sin(t * sw + i) * 0.25; });
    m.glowMat.emissiveIntensity = 0.3 + Math.sin(t * 2) * 0.12;
    return;
  }
  if (m.hoverBird) { // 鳳凰：浮空、翅膀大幅拍動、尾羽飄
    const flap = Math.sin(t * (moving ? 7 : 3)) * (moving ? 0.7 : 0.35);
    for (const w of m.wings) w.pivot.rotation.z = (0.15 + flap) * w.s;
    m.body.position.y = 0.35 + Math.sin(t * (moving ? 7 : 3)) * 0.12;
    m.tail.rotation.x = Math.sin(t * 2.5) * 0.15;
    m.glowMat.emissiveIntensity = 0.35 + Math.sin(t * 5) * 0.15;
    return;
  }
  if (m.segs) { // 神龍：身體沿著波浪排列，往後越擺越大；整隻在空中上下飄
    const w = moving ? 7 : 2.5, amp = moving ? 0.35 : 0.18;
    m.body.position.y = Math.sin(t * 1.8) * 0.12;
    const base = m.hover;
    m.segs.forEach((seg, i) => {
      const z = 0.7 - i * 0.42;
      const ph = t * w - i * 0.55;
      seg.position.set(Math.sin(ph) * amp * (i / 6), base + Math.cos(ph * 0.8) * amp * 0.8 * (i / 5), z);
      seg.rotation.y = Math.cos(ph) * amp * 0.6;
    });
    m.dragonHead.position.set(0, base + 0.2 + Math.sin(t * w) * 0.05, 1.25);
    m.dragonHead.rotation.x = Math.sin(t * 1.3) * 0.08 - 0.1;
    m.glowMat.emissiveIntensity = 0.45 + Math.sin(t * 4) * 0.15;
    return;
  }
  const f = (m.biped ? 13 : 11) * Math.max(1, speed * 0.8);
  m.legs.forEach((leg, i) => {
    const swing = Math.sin(t * f + m.phase[i]);
    leg.rotation.x = swing * (m.biped ? 0.9 : 0.75) * m.gait;
  });
  const bob = m.bound ? Math.abs(Math.sin(t * f * 0.5)) * 0.16 : Math.abs(Math.sin(t * f)) * 0.08;
  m.body.position.y = bob * m.gait + Math.sin(t * 2) * 0.015 * (1 - m.gait);
  m.body.rotation.x = (m.bound ? Math.sin(t * f * 0.5) * 0.08 : Math.sin(t * f) * 0.03) * m.gait;
  if (m.head) m.head.rotation.x = Math.sin(t * f) * 0.08 * m.gait + Math.sin(t * 1.3) * 0.05 * (1 - m.gait);
  if (m.tail) m.tail.rotation.y = Math.sin(t * (moving ? 9 : 2)) * (moving ? 0.35 : 0.15);
  if (m.wings) {
    const flap = moving ? Math.sin(t * 9) * 0.55 : Math.sin(t * 1.6) * 0.12 - 0.15;
    for (const w of m.wings) w.pivot.rotation.z = (0.35 + flap) * w.s;
  }
  if (m.halo) {
    m.halo.material.opacity = 0.35 + Math.sin(t * 3) * 0.15;
    m.halo.rotation.y += dt;
  }
  if (m.glowMat) m.glowMat.emissiveIntensity = 0.35 + Math.sin(t * 4) * 0.15;
}

export function disposeMount(m) {
  m.root.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
}
