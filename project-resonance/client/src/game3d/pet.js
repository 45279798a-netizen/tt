// ─────────────────────────────────────────────
// 寵物：跟在主人肩膀旁邊飄 / 跳，身邊帶一點 three.quarks 光點
// 15 種造型（程式生成、Q 版）：小狐、雪兔、水母、貓頭鷹、小龍崽、小鳳凰
//   v0.6 新增：史萊姆、苔蘚龜、企鵝、蝙蝠、南瓜幽靈、水晶魔像、獨角獸、麒麟、星辰小鯨
// ─────────────────────────────────────────────
import * as THREE from 'three';

const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...o });
const eyes = (g, y, z, sx = 0.09, r = 0.045) => {
  const w = new THREE.MeshBasicMaterial({ color: 0x14141f }), h = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), w); e.position.set(s * sx, y, z);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(r * 0.35, 6, 4), h); hl.position.set(s * sx + 0.012, y + 0.015, z + r * 0.8);
    g.add(e, hl);
  }
};

const BUILD = {
  fox(d, g) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), lam(d.color)); b.scale.set(1, 0.9, 1.15);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), lam(d.color)); head.position.set(0, 0.18, 0.18);
    for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4), lam(d.color)); ear.position.set(s * 0.09, 0.36, 0.16); g.add(ear); }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 6), lam(d.accent, { emissive: d.accent, emissiveIntensity: 0.4 })); tail.position.set(0, 0.08, -0.32); tail.rotation.x = -1.1;
    g.add(b, head, tail); eyes(g, 0.2, 0.33);
    return { tail };
  },
  bunny(d, g) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), lam(d.color));
    for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.22, 3, 6), lam(d.color)); ear.position.set(s * 0.08, 0.34, -0.02); ear.rotation.z = -s * 0.2; g.add(ear); }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), lam('#ff9fb8')); nose.position.set(0, 0.02, 0.24);
    g.add(b, nose); eyes(g, 0.07, 0.2);
    return {};
  },
  jelly(d, g) {
    const mat = new THREE.MeshLambertMaterial({ color: d.color, transparent: true, opacity: 0.75, emissive: d.color, emissiveIntensity: 0.5 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    const tents = [];
    for (let i = 0; i < 5; i++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.008, 0.35, 4), new THREE.MeshBasicMaterial({ color: d.accent })); const a = (i / 5) * Math.PI * 2; t.position.set(Math.cos(a) * 0.14, -0.17, Math.sin(a) * 0.14); g.add(t); tents.push(t); }
    g.add(dome); eyes(g, 0.1, 0.2, 0.08, 0.035);
    return { tents };
  },
  owl(d, g) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), lam(d.color)); b.scale.set(1, 1.1, 0.9);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.05), new THREE.MeshBasicMaterial({ color: d.accent })); visor.position.set(0, 0.08, 0.22);
    const wings = [-1, 1].map((s) => { const w = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.22), lam('#8a6a3a')); w.position.set(s * 0.25, 0, 0); g.add(w); return w; });
    for (const s of [-1, 1]) { const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 4), lam(d.color)); tuft.position.set(s * 0.12, 0.28, 0); g.add(tuft); }
    g.add(b, visor);
    return { wings };
  },
  babydragon(d, g) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), lam(d.color));
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), lam('#fff2c8')); belly.position.set(0, -0.04, 0.1);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), lam(d.color)); head.position.set(0, 0.2, 0.12);
    for (const s of [-1, 1]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4), lam(d.accent)); horn.position.set(s * 0.07, 0.36, 0.08); g.add(horn); }
    const wings = [-1, 1].map((s) => { const w = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.25, 3), lam(d.accent, { emissive: d.accent, emissiveIntensity: 0.3 })); w.position.set(s * 0.22, 0.1, -0.08); w.rotation.z = -s * 1.2; g.add(w); return w; });
    g.add(b, belly, head); eyes(g, 0.23, 0.26, 0.07, 0.04);
    return { wings };
  },
  phoenixling(d, g) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), lam(d.color, { emissive: d.color, emissiveIntensity: 0.5 }));
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 4).rotateX(Math.PI / 2), lam(d.accent)); beak.position.set(0, 0.02, 0.22);
    for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.14, 4), lam(d.accent, { emissive: d.accent, emissiveIntensity: 0.6 })); c.position.set((i - 1) * 0.04, 0.24, 0); g.add(c); }
    const wings = [-1, 1].map((s) => { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.14), new THREE.MeshLambertMaterial({ color: d.accent, emissive: d.color, emissiveIntensity: 0.5, side: THREE.DoubleSide })); w.position.set(s * 0.22, 0.05, 0); g.add(w); return w; });
    g.add(b, beak); eyes(g, 0.07, 0.17, 0.07, 0.035);
    return { wings };
  },
  // ── v0.6 新寵物 ──
  slime(d, g) {
    const mat = new THREE.MeshLambertMaterial({ color: d.color, transparent: true, opacity: 0.85, emissive: d.color, emissiveIntensity: 0.25 });
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), mat); b.scale.set(1.1, 0.8, 1.1);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ color: d.accent })); shine.position.set(-0.1, 0.12, 0.14);
    g.add(b, shine); eyes(g, 0.03, 0.22);
    return { squish: b };
  },
  turtle(d, g) {
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), lam(d.color)); shell.scale.set(1, 0.8, 1.1);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.05, 8), lam(d.accent)); rim.position.y = -0.01;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), lam('#a6c98a')); head.position.set(0, 0.04, 0.3);
    for (let i = 0; i < 4; i++) { const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 4), lam('#5ee08a')); leaf.position.set(Math.cos(i * 1.6) * 0.1, 0.2, Math.sin(i * 1.6) * 0.1); g.add(leaf); }
    g.add(shell, rim, head); eyes(g, 0.08, 0.38, 0.05, 0.025);
    return {};
  },
  penguin(d, g) {
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.18, 4, 10), lam(d.color));
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), lam('#ffffff')); belly.scale.set(1, 1.3, 0.6); belly.position.set(0, -0.03, 0.1);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 4).rotateX(Math.PI / 2), lam('#ffb340')); beak.position.set(0, 0.12, 0.2);
    const wings = [-1, 1].map((s) => { const w = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.1), lam(d.color)); w.position.set(s * 0.19, 0, 0); g.add(w); return w; });
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 6, 12).rotateX(Math.PI / 2), lam(d.accent, { emissive: d.accent, emissiveIntensity: 0.3 })); scarf.position.y = 0.05;
    g.add(b, belly, beak, scarf); eyes(g, 0.17, 0.15, 0.06, 0.03);
    return { flap: wings };
  },
  bat(d, g) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), lam(d.color));
    for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 4), lam(d.color)); ear.position.set(s * 0.08, 0.18, 0); g.add(ear); }
    const wings = [-1, 1].map((s) => { const w = new THREE.Mesh(new THREE.CircleGeometry(0.22, 3), new THREE.MeshLambertMaterial({ color: '#2a2040', side: THREE.DoubleSide })); w.position.set(s * 0.25, 0.02, 0); w.rotation.y = Math.PI / 2; g.add(w); return w; });
    const eyeMat = new THREE.MeshBasicMaterial({ color: d.accent });
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), eyeMat); e.position.set(s * 0.06, 0.04, 0.14); g.add(e); }
    g.add(b);
    return { wings };
  },
  ghost(d, g) {
    const pump = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), lam(d.color)); pump.scale.set(1.1, 0.85, 1.1); pump.position.y = 0.12;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.08, 5), lam('#5a7a2a')); stem.position.y = 0.32;
    const cloth = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.32, 10, 1, true), new THREE.MeshLambertMaterial({ color: '#f4f0ff', transparent: true, opacity: 0.8, side: THREE.DoubleSide })); cloth.position.y = -0.1; cloth.rotation.x = Math.PI;
    const glow = new THREE.MeshBasicMaterial({ color: d.accent });
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.05, 3), glow); e.position.set(s * 0.07, 0.15, 0.2); e.rotation.x = Math.PI / 2; g.add(e); }
    g.add(pump, stem, cloth);
    return { tents: [cloth] };
  },
  golem(d, g) {
    const crys = lam(d.color, { emissive: d.color, emissiveIntensity: 0.35 });
    const b = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), crys); b.scale.set(1, 1.2, 1);
    const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.11), crys); head.position.y = 0.3;
    const arms = [-1, 1].map((s) => { const a = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), lam(d.accent, { emissive: d.accent, emissiveIntensity: 0.4 })); a.position.set(s * 0.26, 0.02, 0); g.add(a); return a; });
    g.add(b, head); eyes(g, 0.31, 0.09, 0.045, 0.025);
    return { orbit: arms };
  },
  unicorn(d, g) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), lam(d.color)); b.scale.set(0.9, 0.85, 1.2);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), lam(d.color)); head.position.set(0, 0.18, 0.2);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.18, 6), lam('#ffe08a', { emissive: '#ffe08a', emissiveIntensity: 0.6 })); horn.position.set(0, 0.36, 0.24); horn.rotation.x = 0.3;
    const mane = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.04, 6, 10, Math.PI), lam(d.accent)); mane.position.set(0, 0.24, 0.1); mane.rotation.y = Math.PI / 2;
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.25, 6), lam(d.accent)); tail.position.set(0, 0.05, -0.28); tail.rotation.x = -1;
    g.add(b, head, horn, mane, tail); eyes(g, 0.2, 0.32, 0.06, 0.03);
    return { tail };
  },
  kirin(d, g) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), lam(d.color, { emissive: d.color, emissiveIntensity: 0.25 })); b.scale.set(0.9, 0.85, 1.2);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), lam(d.color)); head.position.set(0, 0.2, 0.2);
    for (const s of [-1, 1]) { const antler = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.2, 4), lam(d.accent, { emissive: d.accent, emissiveIntensity: 0.6 })); antler.position.set(s * 0.07, 0.38, 0.16); antler.rotation.z = -s * 0.4; g.add(antler); }
    const flames = [];
    for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 5), new THREE.MeshBasicMaterial({ color: d.accent, transparent: true, opacity: 0.8 })); f.position.set((i - 1) * 0.1, -0.18, -0.05 + i * 0.05); f.rotation.x = Math.PI; g.add(f); flames.push(f); }
    g.add(b, head); eyes(g, 0.23, 0.33, 0.06, 0.03);
    return { tents: flames };
  },
  starwhale(d, g) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), lam(d.color, { emissive: d.color, emissiveIntensity: 0.3 })); b.scale.set(0.85, 0.75, 1.35);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), lam('#c8d8ff')); belly.scale.set(0.8, 0.5, 1.2); belly.position.y = -0.07;
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.2, 3), lam(d.color)); tail.position.set(0, 0.04, -0.38); tail.rotation.x = -Math.PI / 2;
    const stars = [];
    for (let i = 0; i < 5; i++) { const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.025), new THREE.MeshBasicMaterial({ color: d.accent })); st.position.set((Math.random() - 0.5) * 0.3, 0.12 + Math.random() * 0.08, (Math.random() - 0.5) * 0.4); g.add(st); stars.push(st); }
    g.add(b, belly, tail); eyes(g, 0.04, 0.27, 0.11, 0.03);
    return { tail, orbit: stars };
  },
};

export class Pet {
  constructor(S, def, owner, lv = 1) {
    this.S = S; this.def = def; this.owner = owner; this.lv = lv;
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.parts = (BUILD[def.id] ?? BUILD.fox)(def, this.body);
    this.body.scale.setScalar(1 + lv * 0.015);
    this.group.add(this.body);
    const p = owner.group.position;
    this.group.position.set(p.x + 1, 1.6, p.z);
    S.scene.add(this.group);
    this.fxT = 0;
    this.t = Math.random() * 10;
  }

  update(dt) {
    const S = this.S, o = this.owner, p = this.group.position;
    this.group.visible = !S.duel;
    this.t += dt;
    // 跟在主人右後方肩膀高度，平滑追上
    const f = o.facing;
    const tx = o.group.position.x - Math.sin(f) * 0.8 + Math.cos(f) * 1.1;
    const tz = o.group.position.z - Math.cos(f) * 0.8 - Math.sin(f) * 1.1;
    const ty = S.gy(tx, tz) + (o.riding ? 2.6 : 1.7) + Math.sin(this.t * 3) * 0.12;
    const k = 1 - Math.exp(-dt * 5);
    p.x += (tx - p.x) * k; p.z += (tz - p.z) * k; p.y += (ty - p.y) * k;
    this.group.rotation.y += (Math.atan2(tx - p.x, tz - p.z) * 0 + f - this.group.rotation.y) * Math.min(1, dt * 4);
    const parts = this.parts;
    if (parts.wings) parts.wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * (0.6 + Math.sin(this.t * 14) * 0.5); });
    if (parts.tail) parts.tail.rotation.y = Math.sin(this.t * 6) * 0.4;
    if (parts.tents) parts.tents.forEach((t, i) => { t.rotation.x = Math.sin(this.t * 4 + i) * 0.3; });
    if (parts.squish) parts.squish.scale.set(1.1 + Math.sin(this.t * 6) * 0.08, 0.8 - Math.sin(this.t * 6) * 0.08, 1.1 + Math.sin(this.t * 6) * 0.08);
    if (parts.flap) parts.flap.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * (0.3 + Math.sin(this.t * 10) * 0.35); });
    if (parts.orbit) parts.orbit.forEach((o, i) => { const a = this.t * 2 + i * (Math.PI * 2 / parts.orbit.length); o.position.x = Math.cos(a) * 0.28; o.position.z = Math.sin(a) * 0.28; o.rotation.y += 0.05; });
    this.body.rotation.z = Math.sin(this.t * 2.2) * 0.08;
    // 身邊的光點（three.quarks）
    this.fxT -= dt;
    if (this.fxT <= 0) {
      this.fxT = o.moving ? 0.18 : 0.45;
      const c = new THREE.Color(this.def.accent).getHex();
      S.qfx.sparks({ x: p.x, z: p.z, y: p.y - 0.1 }, 1, c, 1.2, 0.8, { y: 0, up: 0.3 });
      if (this.def.rarity >= 3 && Math.random() < 0.4) S.qfx.flash({ x: p.x, z: p.z, y: p.y }, 0.6, c, 0.35, 0);
    }
  }

  dispose() {
    this.S.scene.remove(this.group);
    this.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
  }
}
