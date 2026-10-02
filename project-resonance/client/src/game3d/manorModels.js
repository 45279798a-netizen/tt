// ─────────────────────────────────────────────
// 莊園建築模型（程式生成，跟村莊同風格）＋ 12 塊地的位置
// ─────────────────────────────────────────────
import * as THREE from 'three';

const lam = (color, o = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...o });
export const PLOT_POS = [-12, -4, 4, 12].flatMap((x) => [-8, 0, 8].map((z) => ({ x, z }))); // 4 × 3

const B = {
  goldmine(g, lv) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1, 0), lam('#6b5a4a'));
    rock.position.y = 0.7; rock.scale.set(1.3, 0.9, 1.1);
    g.add(rock);
    for (let i = 0; i < 3 + Math.min(lv, 7); i++) {
      const n = new THREE.Mesh(new THREE.OctahedronGeometry(0.18 + Math.random() * 0.1, 0), lam('#f5c04a', { emissive: '#f5c04a', emissiveIntensity: 0.5 }));
      const a = Math.random() * Math.PI * 2;
      n.position.set(Math.cos(a) * 0.9, 0.4 + Math.random() * 0.9, Math.sin(a) * 0.7);
      g.add(n);
    }
    const cart = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.5), lam('#5a3a22')); cart.position.set(1.3, 0.3, 0.6); g.add(cart);
  },
  essence(g, lv) {
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.15, 0.5, 12), lam('#8a8aa0')); basin.position.y = 0.25;
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.05, 16), new THREE.MeshBasicMaterial({ color: '#6cc8ff', transparent: true, opacity: 0.8 })); water.position.y = 0.48;
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.35 + lv * 0.03, 0), new THREE.MeshBasicMaterial({ color: '#9be7ff' }));
    crystal.position.y = 1.3; crystal.scale.y = 1.6; crystal.userData.spin = 1;
    g.add(basin, water, crystal);
  },
  warehouse(g) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 1.8), lam('#a0522d')); body.position.y = 0.7;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.75, 0.9, 4), lam('#6a2a1a')); roof.position.y = 1.85; roof.rotation.y = Math.PI / 4; roof.scale.z = 0.85;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.05), lam('#fff1d6')); door.position.set(0, 0.45, 0.91);
    g.add(body, roof, door);
    for (let i = 0; i < 3; i++) { const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), lam('#c9a06a')); box.position.set(1.4, 0.2 + i * 0.4, 0.3 - i * 0.1); g.add(box); }
  },
  tree(g, lv) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 1.2, 7), lam('#6a4426')); trunk.position.y = 0.6;
    g.add(trunk);
    for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8 + lv * 0.04 - i * 0.15, 0), lam(['#4f9a3e', '#5eb04a', '#6cc256'][i])); c.position.y = 1.5 + i * 0.5; g.add(c); }
  },
  flower(g) {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(2, 0.25, 1.4), lam('#6a4a2a')); bed.position.y = 0.12; g.add(bed);
    const cols = ['#ff6fa8', '#ffd166', '#c98cff', '#ff8a5c', '#ffffff'];
    for (let i = 0; i < 14; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), lam(cols[i % 5], { emissive: cols[i % 5], emissiveIntensity: 0.2 })); f.position.set(-0.8 + (i % 7) * 0.27, 0.4, -0.35 + Math.floor(i / 7) * 0.7); g.add(f); }
  },
  lantern(g) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.5), lam('#9a9a9a')); base.position.y = 0.15;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.9, 6), lam('#9a9a9a')); post.position.y = 0.75;
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.55), lam('#8a8a8a')); box.position.y = 1.4;
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.4), new THREE.MeshBasicMaterial({ color: '#ffd27a' })); light.position.y = 1.4;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.35, 4), lam('#7a7a7a')); cap.position.y = 1.8; cap.rotation.y = Math.PI / 4;
    g.add(base, post, box, light, cap);
  },
  sakura(g, lv) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, 1.4, 7), lam('#5a3a2a')); trunk.position.y = 0.7; g.add(trunk);
    for (let i = 0; i < 5; i++) { const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6 + lv * 0.03, 0), lam(['#ffb3d1', '#ff9fc8', '#ffd1e6'][i % 3], { emissive: '#ff9fc8', emissiveIntensity: 0.15 })); const a = (i / 5) * Math.PI * 2; c.position.set(Math.cos(a) * 0.6, 1.8 + (i % 2) * 0.3, Math.sin(a) * 0.6); g.add(c); }
  },
  fountain(g) {
    const pool = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.3, 0.4, 16), lam('#b0b0c0')); pool.position.y = 0.2;
    const water = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.05, 16), new THREE.MeshBasicMaterial({ color: '#7fd0ff', transparent: true, opacity: 0.75 })); water.position.y = 0.38;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.2, 8), lam('#c0c0d0')); pillar.position.y = 0.9;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.3, 0.2, 12), lam('#c0c0d0')); top.position.y = 1.5;
    g.add(pool, water, pillar, top);
  },
  statue(g) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 1.2), lam('#8a8aa0')); base.position.y = 0.3;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 1.4, 8), lam('#d8d8e8')); body.position.y = 1.3;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), lam('#d8d8e8')); head.position.y = 2.2;
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.25, 0), new THREE.MeshBasicMaterial({ color: '#ffe08a' })); star.position.y = 2.8; star.userData.spin = 1;
    g.add(base, body, head, star);
  },
};

/** 建立一塊地（土壤 + 建築）；回傳 group */
export function createPlot(b, idx) {
  const g = new THREE.Group();
  const p = PLOT_POS[idx];
  g.position.set(p.x, 0, p.z);
  const soil = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.12, 6.2), lam(b ? '#7a5a3a' : '#5a4a32'));
  soil.position.y = 0.06;
  g.add(soil);
  if (b && B[b.id]) {
    const inner = new THREE.Group();
    inner.position.y = 0.12;
    B[b.id](inner, b.lv);
    inner.scale.setScalar(1 + (b.lv - 1) * 0.04); // 等級越高越大
    g.add(inner);
  } else { // 空地：插一塊小木牌
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.05), lam('#c9a06a')); sign.position.set(0, 0.6, 0);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 5), lam('#6a4426')); post.position.y = 0.3;
    g.add(sign, post);
  }
  return g;
}
