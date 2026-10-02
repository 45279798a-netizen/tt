// ─────────────────────────────────────────────
// 世界：把 maps.js 的設計資料蓋成 3D 場景
//  - 有高低起伏的地形（頂點著色：草地 / 小路 / 河岸 / 崖壁）
//  - 河流 / 熔岩河 / 湖（不能走），橋（可以走、拱起來）
//  - 碰撞：樹、石頭、房子、地標都擋路
//  - 尋路：要過河會自動找最近的橋
//  - 營地、地標、散佈裝飾、環境粒子（螢火蟲 / 火星 / 雪）
//  - 小地圖底圖
// 同一張地圖用固定亂數種子，所有玩家看到的地形完全一樣
// ─────────────────────────────────────────────
import * as THREE from 'three';
import { createHero } from './heroModel.js';

// ── 小工具 ──────────────────────────────────
function hash(x, z, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, z, s) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi, s), b = hash(xi + 1, zi, s), c = hash(xi, zi + 1, s), d = hash(xi + 1, zi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
function distSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
function distPoly(px, pz, pts) {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, distSeg(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  return d;
}
/** 折線上 0~1 位置的點與切線 */
function pointOnPoly(pts, f) {
  const lens = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    lens.push(l); total += l;
  }
  let target = total * f;
  for (let i = 0; i < lens.length; i++) {
    if (target <= lens[i] || i === lens.length - 1) {
      const t = Math.min(1, target / lens[i]);
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, tx: (bx - ax) / lens[i], tz: (bz - az) / lens[i] };
    }
    target -= lens[i];
  }
  return null;
}
function strSeed(s) {
  let h = 2166136261;
  for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}
const col = (c) => new THREE.Color(c);
const lam = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });

export const WATER_Y = -0.45;
const DECK_W = 3.4;

export class World {
  constructor(def) {
    this.def = def;
    this.R = def.R;
    this.seed = strSeed(def.name);
    this.rivers = (def.rivers || []).map((r) => ({ ...r, half: r.w / 2 }));
    this.lakes = def.lakes || [];
    this.camps = def.camps || [];
    this.bridges = (def.bridges || []).map((b) => {
      if (b.river !== undefined) {
        const r = this.rivers[b.river];
        const p = pointOnPoly(r.pts, b.at);
        return { x: p.x, z: p.z, ax: -p.tz, az: p.tx, len: r.w + 7, w: DECK_W, style: b.style };
      }
      return { x: b.x, z: b.z, ax: Math.cos(b.angle), az: Math.sin(b.angle), len: b.len, w: DECK_W, style: b.style };
    });
    this.obstacles = [];
    this.grid = new Map();
    this.anims = [];
    this.marks = []; // 小地圖上的地標
  }

  // ── 地形查詢 ─────────────────────────────
  /** 離水面多遠的「下陷」程度 0~1 */
  _waterSink(x, z) {
    let f = 0;
    for (const r of this.rivers) {
      const d = distPoly(x, z, r.pts);
      f = Math.max(f, smooth(1 - d / (r.half + 2.6)));
    }
    for (const l of this.lakes) {
      const d = Math.hypot(x - l.x, z - l.z);
      f = Math.max(f, smooth(1 - Math.max(0, d - (l.r - 4)) / 6.6));
    }
    return f;
  }

  _rawHeight(x, z) {
    const s = this.seed;
    let h = (vnoise(x * 0.05, z * 0.05, s) - 0.5) * 1.1 + (vnoise(x * 0.14, z * 0.14, s + 1) - 0.5) * 0.35;
    for (const k of this.def.hills || []) {
      const d = Math.hypot(x - k.x, z - k.z);
      if (d < k.r) h += k.h * smooth(1 - d / k.r);
    }
    if (this.def.plaza) {
      const p = this.def.plaza;
      const d = Math.hypot(x - p.x, z - p.z);
      h *= smooth((d - p.r) / 4); // 廣場是平的
    }
    const e = Math.max(Math.abs(x), Math.abs(z)) - (this.R - 4);
    if (e > 0) h += e * e * this.def.edgeRise;
    const f = this._waterSink(x, z);
    if (f > 0) h = h * (1 - f) - 1.6 * f;
    return h;
  }

  height(x, z) {
    let h = this._rawHeight(x, z);
    const b = this.bridgeAt(x, z, 0.4);
    if (b) h = Math.max(h, this._deckY(b.along, b.len));
    return h;
  }

  _deckY(along, len) {
    return 0.12 + 0.55 * Math.cos((along / len) * Math.PI);
  }

  bridgeAt(x, z, pad = 0) {
    for (const b of this.bridges) {
      const lx = x - b.x, lz = z - b.z;
      const along = lx * b.ax + lz * b.az;
      const across = Math.abs(-lx * b.az + lz * b.ax);
      if (Math.abs(along) <= b.len / 2 && across <= b.w / 2 + pad) return { ...b, along };
    }
    return null;
  }

  /** 這點是水 / 熔岩嗎（pad = 往外多算一點） */
  waterAt(x, z, pad = 0) {
    for (const r of this.rivers) if (distPoly(x, z, r.pts) < r.half + pad) return r.kind;
    for (const l of this.lakes) if (Math.hypot(x - l.x, z - l.z) < l.r + pad) return l.kind;
    return null;
  }

  blockedWater(x, z, r = 0.4) {
    return !!this.waterAt(x, z, r * 0.6) && !this.bridgeAt(x, z, -0.2);
  }

  // ── 碰撞 ─────────────────────────────────
  addObstacle(x, z, r) {
    const o = { x, z, r };
    this.obstacles.push(o);
    const cx = Math.floor(x / 6), cz = Math.floor(z / 6);
    const reach = Math.ceil(r / 6);
    for (let i = -reach; i <= reach; i++) for (let j = -reach; j <= reach; j++) {
      const k = `${cx + i},${cz + j}`;
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(o);
    }
  }

  _near(x, z) {
    const cx = Math.floor(x / 6), cz = Math.floor(z / 6);
    const out = new Set();
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const o of this.grid.get(`${cx + i},${cz + j}`) || []) out.add(o);
    }
    return out;
  }

  hitsObstacle(x, z, r) {
    for (const o of this._near(x, z)) if (Math.hypot(x - o.x, z - o.z) < o.r + r) return true;
    return false;
  }

  _pushOut(x, z, r) {
    for (let it = 0; it < 2; it++) {
      for (const o of this._near(x, z)) {
        const dx = x - o.x, dz = z - o.z;
        const d = Math.hypot(dx, dz), min = o.r + r;
        if (d < min) {
          if (d < 1e-4) { x += min; continue; }
          x += (dx / d) * (min - d);
          z += (dz / d) * (min - d);
        }
      }
    }
    return [x, z];
  }

  walkable(x, z, r = 0.5) {
    const R = this.R;
    return Math.abs(x) <= R && Math.abs(z) <= R && !this.blockedWater(x, z, r) && !this.hitsObstacle(x, z, r);
  }

  /** 移動並處理碰撞（會沿著障礙物滑開）；回傳實際走了多遠 */
  move(pos, dx, dz, r = 0.55) {
    const R = this.R;
    const clamp = (v) => Math.max(-R, Math.min(R, v));
    const tryAt = (x, z) => {
      const [px, pz] = this._pushOut(clamp(x), clamp(z), r);
      return this.blockedWater(px, pz, r) ? null : [clamp(px), clamp(pz)];
    };
    const p = tryAt(pos.x + dx, pos.z + dz) || tryAt(pos.x + dx, pos.z) || tryAt(pos.x, pos.z + dz);
    if (!p) return 0;
    const moved = Math.hypot(p[0] - pos.x, p[1] - pos.z);
    pos.x = p[0]; pos.z = p[1];
    return moved;
  }

  /** 瞬移：目的地不能站就退回到路線上最遠能站的點 */
  teleport(pos, x, z, r = 0.55) {
    const sx = pos.x, sz = pos.z;
    for (let k = 1; k >= 0; k -= 0.1) {
      const tx = sx + (x - sx) * k, tz = sz + (z - sz) * k;
      if (this.walkable(tx, tz, r)) { pos.x = tx; pos.z = tz; return; }
    }
  }

  crossesWater(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(d / 1.2);
    for (let i = 1; i < n; i++) {
      const x = ax + ((bx - ax) * i) / n, z = az + ((bz - az) * i) / n;
      if (this.waterAt(x, z) && !this.bridgeAt(x, z, 0.3)) return true;
    }
    return false;
  }

  /** 走向 to 的下一個路點：要過河就先走到橋 */
  route(from, to) {
    if (!this.bridges.length || !this.crossesWater(from.x, from.z, to.x, to.z)) return to;
    const ends = (b) => {
      const k = b.len / 2 + 1.2;
      return [{ x: b.x + b.ax * k, z: b.z + b.az * k }, { x: b.x - b.ax * k, z: b.z - b.az * k }];
    };
    const onB = this.bridgeAt(from.x, from.z, 0.6);
    if (onB) {
      const [e1, e2] = ends(onB);
      return Math.hypot(e1.x - to.x, e1.z - to.z) < Math.hypot(e2.x - to.x, e2.z - to.z) ? e1 : e2;
    }
    let best = null, bestCost = Infinity;
    for (const b of this.bridges) {
      const [e1, e2] = ends(b);
      for (const [near, far] of [[e1, e2], [e2, e1]]) {
        const cost = Math.hypot(near.x - from.x, near.z - from.z) + b.len + Math.hypot(far.x - to.x, far.z - to.z);
        if (cost < bestCost) { bestCost = cost; best = { near, far }; }
      }
    }
    if (!best) return to;
    return Math.hypot(best.near.x - from.x, best.near.z - from.z) < 1.6 ? best.far : best.near;
  }

  randomInCamp(c, rnd = Math.random) {
    for (let i = 0; i < 12; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * c.r;
      const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      if (this.walkable(x, z, 0.7)) return { x, z };
    }
    return { x: c.x, z: c.z };
  }

  // ── 顏色 ─────────────────────────────────
  groundColor(x, z, h, out = new THREE.Color()) {
    const g = this.def.ground;
    const s = this.seed;
    this._ca ??= col(g.a); this._cb ??= col(g.b); this._cc ??= col(g.c);
    this._cp ??= col(g.path); this._cbank ??= col(g.bank); this._ce ??= col(g.edge);
    out.copy(this._ca).lerp(this._cb, vnoise(x * 0.09, z * 0.09, s + 3));
    const n2 = vnoise(x * 0.21, z * 0.21, s + 5);
    if (n2 > 0.62) out.lerp(this._cc, (n2 - 0.62) * 2.2);

    // 營地：踩出來的泥土
    for (const c of this.camps) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < c.r) out.lerp(this._cp, 0.35 * smooth(1 - d / c.r));
    }
    // 小路
    let pd = Infinity;
    for (const p of this.def.paths || []) pd = Math.min(pd, distPoly(x, z, p.pts) - p.w / 2);
    if (pd < 1.2) out.lerp(this._cp, smooth(1 - (pd + 0.6) / 1.8) * (0.85 + vnoise(x * 0.7, z * 0.7, s) * 0.15));
    // 廣場石板
    if (this.def.plaza) {
      const p = this.def.plaza;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r) {
        this._cplz ??= col(p.color);
        out.lerp(this._cplz, smooth((p.r - d) / 1.5));
        if ((Math.floor(x / 1.6) + Math.floor(z / 1.6)) % 2 === 0) out.multiplyScalar(0.94);
      }
    }
    // 河岸 / 熔岩邊
    const sink = this._waterSink(x, z);
    if (sink > 0.05) out.lerp(this._cbank, Math.min(1, sink * (this.rivers.some((r) => r.kind === 'lava') ? 1.6 : 1.2)));
    // 崖壁
    const e = Math.max(Math.abs(x), Math.abs(z)) - (this.R - 2);
    if (e > 0) out.lerp(this._ce, Math.min(1, e / 8));
    // 高處稍亮、低處稍暗，讓起伏看得出來
    out.multiplyScalar(0.92 + Math.max(-0.1, Math.min(0.14, h * 0.05)));
    return out;
  }

  // ── 蓋場景 ───────────────────────────────
  build(scene, items) {
    this.items = items;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.rng = mulberry32(this.seed);
    this._buildGround();
    this._buildWater();
    this._buildBridges();
    for (const l of this.def.landmarks || []) this._landmark(l);
    this._buildCamps();
    this._buildScatter();
    this._buildAmbient();
  }

  _buildGround() {
    const size = (this.R + 34) * 2;
    const seg = 150;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this._rawHeight(x, z);
      pos.setY(i, h);
      this.groundColor(x, z, h, c);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    // 細節紋理（灰階雜點，疊在頂點顏色上）
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 2600; i++) {
      const v = 200 + Math.floor(this.rng() * 55);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(this.rng() * 128, this.rng() * 128, 1 + this.rng() * 2, 1 + this.rng() * 2);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(size / 5, size / 5);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: tex });
    this.group.add(new THREE.Mesh(geo, mat));
  }

  _waterMaterial(kind) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    if (kind === 'lava') {
      g.fillStyle = '#ff5a14'; g.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 70; i++) {
        g.fillStyle = this.rng() < 0.5 ? '#ffb02e' : '#c2280c';
        g.beginPath(); g.arc(this.rng() * 64, this.rng() * 64, 2 + this.rng() * 6, 0, Math.PI * 2); g.fill();
      }
    } else {
      const ice = this.def.ambient === 'snow';
      g.fillStyle = ice ? '#7fb6d4' : '#3f8fd0'; g.fillRect(0, 0, 64, 64);
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.5;
      for (let i = 0; i < 9; i++) {
        const y = this.rng() * 64;
        g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(20, y - 4, 40, y + 4, 64, y); g.stroke();
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = kind === 'lava'
      ? new THREE.MeshBasicMaterial({ map: tex })
      : new THREE.MeshLambertMaterial({ map: tex, transparent: true, opacity: 0.88 });
    this.anims.push((t) => { tex.offset.y = -t * (kind === 'lava' ? 0.08 : 0.25); });
    return { mat, tex };
  }

  _buildWater() {
    for (const r of this.rivers) {
      const { mat, tex } = this._waterMaterial(r.kind);
      // 沿著河道每 1.5 公尺取樣做成一條帶子
      const samples = [];
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
        const l = Math.hypot(bx - ax, bz - az);
        const n = Math.max(1, Math.ceil(l / 1.5));
        for (let k = 0; k < n; k++) samples.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
      }
      samples.push(r.pts[r.pts.length - 1]);
      const half = r.half + 1.4;
      const verts = [], uvs = [], idx = [];
      let v = 0;
      samples.forEach(([x, z], i) => {
        const [px, pz] = samples[Math.max(0, i - 1)], [nx, nz] = samples[Math.min(samples.length - 1, i + 1)];
        let tx = nx - px, tz = nz - pz;
        const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        verts.push(x - tz * half, WATER_Y, z + tx * half, x + tz * half, WATER_Y, z - tx * half);
        uvs.push(0, v, 1, v);
        v += 1.5 / 6;
        if (i > 0) { const b = (i - 1) * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.material.side = THREE.DoubleSide;
      this.group.add(mesh);
      tex.repeat.set(1, 1);
      if (r.kind === 'lava') { // 熔岩的熱光
        const glow = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff7a2f, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
        glow.position.y = 0.05;
        this.group.add(glow);
        this.anims.push((t) => { glow.material.opacity = 0.18 + Math.sin(t * 2) * 0.08; });
      }
    }
    for (const l of this.lakes) {
      const { mat, tex } = this._waterMaterial(l.kind);
      tex.repeat.set(4, 4);
      const lake = new THREE.Mesh(new THREE.CircleGeometry(l.r + 1.4, 48).rotateX(-Math.PI / 2), mat);
      lake.position.set(l.x, WATER_Y, l.z);
      this.group.add(lake);
      // 浮冰
      if (this.def.ambient === 'snow') {
        for (let i = 0; i < 9; i++) {
          const a = this.rng() * Math.PI * 2, d = 3 + this.rng() * (l.r - 4);
          const floe = new THREE.Mesh(new THREE.CylinderGeometry(0.8 + this.rng(), 1 + this.rng(), 0.2, 6), lam('#eef6fb'));
          floe.position.set(l.x + Math.cos(a) * d, WATER_Y + 0.05, l.z + Math.sin(a) * d);
          this.group.add(floe);
        }
      }
    }
  }

  _buildBridges() {
    for (const b of this.bridges) {
      const g = new THREE.Group();
      g.position.set(b.x, 0, b.z);
      g.rotation.y = Math.atan2(-b.az, b.ax);
      const deckCol = { wood: '#8a5a32', stone: this.def.ambient === 'embers' ? '#4a403c' : '#9a958d' }[b.style] ?? '#8a5a32';
      const railCol = b.style === 'wood' ? '#5e3c20' : '#6e6a64';
      const n = Math.ceil(b.len / 0.9);
      const plankGeo = new THREE.BoxGeometry(b.len / n + 0.02, 0.22, b.w);
      const plankMat = lam(deckCol);
      for (let i = 0; i < n; i++) {
        const along = -b.len / 2 + (i + 0.5) * (b.len / n);
        const p = new THREE.Mesh(plankGeo, plankMat);
        p.position.set(along, this._deckY(along, b.len) - 0.08, 0);
        p.rotation.z = -Math.sin((along / b.len) * Math.PI) * 0.18;
        g.add(p);
      }
      const postGeo = new THREE.BoxGeometry(0.22, 0.9, 0.22);
      const railMat = lam(railCol);
      const posts = Math.ceil(b.len / 2.2);
      for (let i = 0; i <= posts; i++) {
        const along = -b.len / 2 + (i * b.len) / posts;
        for (const side of [-1, 1]) {
          const post = new THREE.Mesh(postGeo, railMat);
          post.position.set(along, this._deckY(along, b.len) + 0.4, side * (b.w / 2 - 0.1));
          g.add(post);
          if (i < posts) {
            const a2 = -b.len / 2 + ((i + 1) * b.len) / posts;
            const y1 = this._deckY(along, b.len) + 0.8, y2 = this._deckY(a2, b.len) + 0.8;
            const rail = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(a2 - along, y2 - y1), 0.12, 0.14), railMat);
            rail.position.set((along + a2) / 2, (y1 + y2) / 2, side * (b.w / 2 - 0.1));
            rail.rotation.z = Math.atan2(y2 - y1, a2 - along);
            g.add(rail);
          }
        }
      }
      this.group.add(g);
    }
  }

  // ── 營地 ─────────────────────────────────
  _buildCamps() {
    const mobCol = this.def.mob.color;
    for (const c of this.camps) {
      const g = new THREE.Group();
      const h = this.height(c.x, c.z);
      g.position.set(c.x, h, c.z);
      // 圍成一圈的石頭
      const stoneMat = lam(this.def.ambient === 'snow' ? '#c9d6e2' : this.def.ambient === 'embers' ? '#2a2220' : '#8a8578');
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const sx = c.x + Math.cos(a) * (c.r + 0.6), sz = c.z + Math.sin(a) * (c.r + 0.6);
        if (this.blockedWater(sx, sz, 1)) continue;
        const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45 + this.rng() * 0.3, 0), stoneMat);
        st.position.set(sx - c.x, this.height(sx, sz) - h + 0.15, sz - c.z);
        g.add(st);
      }
      // 營火 / 旗幟
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 3.2, 6), lam('#5a3d22'));
      pole.position.y = 1.6;
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), new THREE.MeshLambertMaterial({ color: c.elite ? '#c81e1e' : mobCol, side: THREE.DoubleSide }));
      flag.position.set(0.72, 2.7, 0);
      g.add(pole, flag);
      const fire = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 6), new THREE.MeshBasicMaterial({ color: '#ffa53a' }));
      fire.position.set(1.4, 0.45, 1.2);
      const logs = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.2, 7), lam('#4a3020'));
      logs.position.set(1.4, 0.1, 1.2);
      g.add(fire, logs);
      this.anims.push((t) => {
        flag.rotation.y = Math.sin(t * 2 + c.x) * 0.3;
        fire.scale.set(1, 0.85 + Math.sin(t * 12 + c.z) * 0.15, 1);
      });
      if (c.elite) { // 菁英營：骷髏柱
        const skull = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), lam('#e8e2d0'));
        skull.position.y = 3.4;
        g.add(skull);
      }
      this.group.add(g);
      this.addObstacle(c.x, c.z, 0.3);
      this.marks.push({ kind: c.elite ? 'elite' : 'camp', x: c.x, z: c.z, r: c.r });
    }
  }

  // ── 散佈裝飾（樹、石頭、草…） ─────────────
  _reserved(x, z, pad) {
    const d = this.def;
    if (this.waterAt(x, z, 2.2 + pad)) return true;
    if (this.bridgeAt(x, z, 2.5)) return true;
    for (const p of d.paths || []) if (distPoly(x, z, p.pts) < p.w / 2 + 0.6 + pad) return true;
    if (d.arena && Math.hypot(x - d.arena.x, z - d.arena.z) < d.arena.r + 1 + pad) return true;
    if (Math.hypot(x - d.spawn.x, z - d.spawn.z) < 6) return true;
    for (const c of this.camps) if (Math.hypot(x - c.x, z - c.z) < c.r + pad) return true;
    if (d.plaza && Math.hypot(x - d.plaza.x, z - d.plaza.z) < d.plaza.r + 1 + pad) return true;
    if (this.hitsObstacle(x, z, pad + 0.2)) return true;
    return false;
  }

  _buildScatter() {
    for (const sc of this.def.scatter || []) {
      const parts = DECOR[sc.type]?.(this.def);
      if (!parts) continue;
      const placed = [];
      const collide = sc.collide || 0;
      const lim = this.R + 30;
      for (let tries = 0; placed.length < sc.n && tries < sc.n * 12; tries++) {
        let x, z;
        if (sc.band) {
          // 在邊緣帶：先選一個方向，再選距離（正方形邊界）
          const a = this.rng() * Math.PI * 2;
          const d = sc.band[0] + this.rng() * (sc.band[1] - sc.band[0]);
          const k = d / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
          x = Math.cos(a) * k; z = Math.sin(a) * k;
          if (Math.abs(x) > lim || Math.abs(z) > lim) continue;
        } else {
          x = (this.rng() * 2 - 1) * (this.R - 3);
          z = (this.rng() * 2 - 1) * (this.R - 3);
        }
        const s = 0.75 + this.rng() * 0.6;
        if (this._reserved(x, z, collide ? collide * s : 0)) continue;
        if (collide && Math.max(Math.abs(x), Math.abs(z)) < this.R + 1) this.addObstacle(x, z, collide * s);
        placed.push({ x, z, s, ry: this.rng() * Math.PI * 2, t: this.rng() });
      }
      this._instance(parts, placed);
      if (collide) for (const p of placed) if (Math.max(Math.abs(p.x), Math.abs(p.z)) < this.R + 2) this.marks.push({ kind: 'obstacle', x: p.x, z: p.z, r: collide * p.s });
    }
  }

  _instance(parts, placed) {
    if (!placed.length) return;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const c = new THREE.Color();
    for (const part of parts) {
      const mat = new THREE.MeshLambertMaterial({
        color: '#ffffff', flatShading: true,
        emissive: part.emissive ?? '#000000', emissiveIntensity: part.emissiveIntensity ?? 1,
      });
      if (part.basic) { mat.dispose(); }
      const material = part.basic ? new THREE.MeshBasicMaterial({ color: '#ffffff' }) : mat;
      const im = new THREE.InstancedMesh(part.geo, material, placed.length);
      placed.forEach((p, i) => {
        q.setFromAxisAngle(up, p.ry);
        m4.compose(new THREE.Vector3(p.x, this.height(p.x, p.z) - 0.05, p.z), q, new THREE.Vector3(p.s, p.s * (part.yScale ? 0.7 + p.t * part.yScale : 1), p.s));
        im.setMatrixAt(i, m4);
        const palette = part.colors;
        c.set(palette ? palette[Math.floor(p.t * palette.length) % palette.length] : part.color);
        if (part.jitter) c.offsetHSL((p.t - 0.5) * part.jitter, 0, (p.t - 0.5) * part.jitter);
        im.setColorAt(i, c);
      });
      this.group.add(im);
    }
  }

  // ── 地標 ─────────────────────────────────
  _landmark(l) {
    const make = LANDMARKS[l.type];
    if (!make) return;
    const g = new THREE.Group();
    g.position.set(l.x, this.height(l.x, l.z), l.z);
    g.rotation.y = l.rot || 0;
    g.scale.setScalar(l.s || 1);
    const extra = make(g, this, l) || {};
    this.group.add(g);
    if (l.collide) this.addObstacle(l.x, l.z, l.collide * (l.s || 1));
    for (const o of extra.obstacles || []) this.addObstacle(o.x, o.z, o.r);
    if (extra.anim) this.anims.push(extra.anim);
    if (l.collide) this.marks.push({ kind: l.type === 'house' ? 'house' : 'landmark', x: l.x, z: l.z, r: l.collide * (l.s || 1) });
    for (const o of extra.obstacles || []) this.marks.push({ kind: 'obstacle', x: o.x, z: o.z, r: o.r });
  }

  // ── 環境粒子 ─────────────────────────────
  _buildAmbient() {
    const kind = this.def.ambient;
    if (!kind) return;
    const N = kind === 'snow' ? 420 : 220;
    const pos = new Float32Array(N * 3);
    const seeds = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 60;
      pos[i * 3 + 1] = Math.random() * (kind === 'snow' ? 16 : 6);
      pos[i * 3 + 2] = (Math.random() - 0.5) * 50;
      seeds[i] = Math.random() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const cv = document.createElement('canvas');
    cv.width = cv.height = 32;
    const g = cv.getContext('2d');
    const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.4, 'rgba(255,255,255,.6)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
    const mat = new THREE.PointsMaterial({
      size: kind === 'snow' ? 0.35 : kind === 'embers' ? 0.3 : 0.4,
      map: new THREE.CanvasTexture(cv),
      color: { fireflies: '#d9ff7a', embers: '#ff8a3a', snow: '#ffffff', sunmotes: '#ffe08a', spores: '#c98cff', stardust: '#8ff3ff', bubbles: '#9ff6ff', ashfall: '#d8a890' }[kind],
      transparent: true, depthWrite: false,
      blending: kind === 'snow' ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, mat);
    this.group.add(pts);
    this.ambient = pts;
    this.anims.push((t, dt, focus) => {
      pts.position.set(focus.x, this.height(focus.x, focus.z), focus.z);
      const a = geo.attributes.position.array;
      for (let i = 0; i < N; i++) {
        const s = seeds[i];
        if (kind === 'fireflies' || kind === 'sunmotes' || kind === 'spores' || kind === 'stardust') {
          a[i * 3] += Math.sin(t * 0.7 + s) * dt * 0.6;
          a[i * 3 + 1] = 0.6 + (Math.sin(t * 0.5 + s * 2) + 1) * 1.6;
          a[i * 3 + 2] += Math.cos(t * 0.6 + s) * dt * 0.6;
        } else if (kind === 'bubbles') { // 沉沒王都：氣泡慢慢往上飄、左右搖
          a[i * 3 + 1] += dt * (0.8 + (s % 1) * 1.4);
          a[i * 3] += Math.sin(t * 2 + s) * dt * 0.4;
          if (a[i * 3 + 1] > 8) a[i * 3 + 1] = 0;
        } else if (kind === 'embers') {
          a[i * 3 + 1] += dt * (1.2 + (s % 1) * 2);
          a[i * 3] += Math.sin(t + s) * dt * 0.5;
          if (a[i * 3 + 1] > 9) a[i * 3 + 1] = 0;
        } else {
          a[i * 3 + 1] -= dt * (1 + (s % 1) * 1.2);
          a[i * 3] += Math.sin(t * 0.8 + s) * dt * 0.6;
          if (a[i * 3 + 1] < 0) a[i * 3 + 1] = 16;
        }
        // 跟著鏡頭繞圈，超出範圍就從另一邊回來
        if (a[i * 3] > 30) a[i * 3] -= 60; else if (a[i * 3] < -30) a[i * 3] += 60;
        if (a[i * 3 + 2] > 25) a[i * 3 + 2] -= 50; else if (a[i * 3 + 2] < -25) a[i * 3 + 2] += 50;
      }
      geo.attributes.position.needsUpdate = true;
      if (kind === 'fireflies' || kind === 'sunmotes' || kind === 'spores' || kind === 'stardust') mat.opacity = 0.6 + Math.sin(t * 3) * 0.3;
    });
  }

  update(t, dt, focus) {
    for (const f of this.anims) f(t, dt, focus);
  }

  // ── 小地圖底圖 ───────────────────────────
  minimapBase(size = 192) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d');
    const E = this.R + 2;
    const step = 2;
    const c = new THREE.Color();
    const waterCol = this.rivers.some((r) => r.kind === 'lava') ? '#ff6a1a' : this.def.ambient === 'snow' ? '#6fa9c9' : '#3f8fd0';
    for (let py = 0; py < size; py += step) {
      for (let px = 0; px < size; px += step) {
        const x = (px / size) * 2 * E - E, z = (py / size) * 2 * E - E;
        if (this.bridgeAt(x, z)) g.fillStyle = '#b08850';
        else if (this.waterAt(x, z)) g.fillStyle = this.lakes.length && this.waterAt(x, z) && !this.rivers.some((r) => distPoly(x, z, r.pts) < r.half) ? '#6fa9c9' : waterCol;
        else {
          this.groundColor(x, z, this._rawHeight(x, z), c);
          g.fillStyle = `#${c.getHexString()}`;
        }
        g.fillRect(px, py, step, step);
      }
    }
    const toPx = (v) => ((v + E) / (2 * E)) * size;
    const s = size / (2 * E);
    for (const m of this.marks) {
      if (m.kind === 'obstacle' || m.kind === 'house' || m.kind === 'landmark') {
        g.fillStyle = m.kind === 'house' ? 'rgba(120,70,50,.9)' : m.kind === 'landmark' ? 'rgba(40,30,20,.75)' : 'rgba(20,30,20,.55)';
        g.beginPath(); g.arc(toPx(m.x), toPx(m.z), Math.max(1, m.r * s), 0, Math.PI * 2); g.fill();
      }
    }
    for (const m of this.marks) {
      if (m.kind === 'camp' || m.kind === 'elite') {
        g.strokeStyle = m.kind === 'elite' ? '#ff3b3b' : 'rgba(255,90,90,.85)';
        g.lineWidth = m.kind === 'elite' ? 2 : 1.4;
        g.setLineDash([3, 2]);
        g.beginPath(); g.arc(toPx(m.x), toPx(m.z), m.r * s, 0, Math.PI * 2); g.stroke();
        g.setLineDash([]);
        if (m.kind === 'elite') { g.fillStyle = '#ff3b3b'; g.font = 'bold 10px sans-serif'; g.textAlign = 'center'; g.fillText('☠', toPx(m.x), toPx(m.z) + 4); }
      }
    }
    const a = this.def.arena;
    if (a) {
      g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1; g.setLineDash([2, 3]);
      g.beginPath(); g.arc(toPx(a.x), toPx(a.z), a.r * s, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    }
    g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 2;
    g.strokeRect(toPx(-this.R), toPx(-this.R), this.R * 2 * s, this.R * 2 * s);
    return { canvas: cv, toPx, scale: s };
  }

  dispose(scene) {
    if (!this.group) return;
    scene.remove(this.group);
    this.group.traverse((o) => {
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => { m?.map?.dispose(); m?.dispose(); });
    });
  }
}

// ─────────────────────────────────────────────
// 裝飾物（用 InstancedMesh 大量擺放）
// ─────────────────────────────────────────────
const DECOR = {
  tree: () => [
    { geo: new THREE.CylinderGeometry(0.25, 0.38, 1.8, 6).translate(0, 0.9, 0), color: '#6b4a2b', jitter: 0.1 },
    { geo: new THREE.IcosahedronGeometry(1.5, 0).translate(0, 2.7, 0), colors: ['#3f8f3a', '#4fa04a', '#2f7a34', '#5aa83e'], jitter: 0.08 },
    { geo: new THREE.IcosahedronGeometry(1.05, 0).translate(0.5, 3.7, 0.2), colors: ['#4fa04a', '#62b552', '#3d8c3c'], jitter: 0.08 },
  ],
  pine: () => [
    { geo: new THREE.CylinderGeometry(0.2, 0.3, 1.0, 6).translate(0, 0.5, 0), color: '#5a4535' },
    { geo: new THREE.ConeGeometry(1.4, 2.3, 7).translate(0, 2.0, 0), colors: ['#2f6a4a', '#2a5f45', '#356f50'], jitter: 0.05 },
    { geo: new THREE.ConeGeometry(1.0, 1.9, 7).translate(0, 3.1, 0), color: '#e8f2f8' },
    { geo: new THREE.ConeGeometry(0.6, 1.1, 7).translate(0, 4.1, 0), color: '#ffffff' },
  ],
  rock: (d) => [{ geo: new THREE.DodecahedronGeometry(1, 0).scale(1, 0.7, 1).translate(0, 0.35, 0), colors: d.ambient === 'embers' ? ['#3a2e2a', '#4a3a34'] : ['#8a8a86', '#7a7a74', '#9a968c'], jitter: 0.06 }],
  snowRock: () => [
    { geo: new THREE.DodecahedronGeometry(1, 0).scale(1, 0.7, 1).translate(0, 0.35, 0), color: '#8d96a0' },
    { geo: new THREE.DodecahedronGeometry(0.8, 0).scale(1.05, 0.35, 1.05).translate(0, 0.78, 0), color: '#ffffff' },
  ],
  bush: () => [{ geo: new THREE.IcosahedronGeometry(0.75, 0).scale(1, 0.75, 1).translate(0, 0.45, 0), colors: ['#3d7a32', '#4a8a3a', '#356d2c'], jitter: 0.06 }],
  mushroom: () => [
    { geo: new THREE.CylinderGeometry(0.14, 0.2, 0.7, 6).translate(0, 0.35, 0), color: '#f1e6cf' },
    { geo: new THREE.SphereGeometry(0.55, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.62, 0), colors: ['#d63c3c', '#e07a2a', '#b84ad6'] },
  ],
  grass: () => [{ geo: new THREE.ConeGeometry(0.09, 0.55, 3).translate(0, 0.27, 0), colors: ['#5fa03e', '#6fb84a', '#4e8a34'], jitter: 0.1, yScale: 0.8 }],
  flower: () => [{ geo: new THREE.OctahedronGeometry(0.13, 0).translate(0, 0.22, 0), colors: ['#ffe066', '#ff8fb8', '#ffffff', '#b79cff'] }],
  basalt: () => [
    { geo: new THREE.CylinderGeometry(0.75, 0.85, 3.2, 6).translate(0, 1.6, 0), colors: ['#2a2220', '#332825', '#241c1a'], yScale: 1.3 },
    { geo: new THREE.CylinderGeometry(0.5, 0.6, 1.6, 6).translate(0.9, 0.8, 0.4), color: '#2e2522' },
  ],
  obsidian: () => [{ geo: new THREE.OctahedronGeometry(0.6, 0).scale(0.5, 1.7, 0.5).translate(0, 0.9, 0), color: '#241a2c', emissive: '#3a1050', emissiveIntensity: 0.6 }],
  deadTree: () => [
    { geo: new THREE.CylinderGeometry(0.16, 0.3, 2.4, 5).translate(0, 1.2, 0), color: '#2e221c' },
    { geo: new THREE.CylinderGeometry(0.07, 0.12, 1.3, 4).rotateZ(0.9).translate(0.5, 1.7, 0), color: '#2e221c' },
  ],
  vent: () => [{ geo: new THREE.CircleGeometry(0.6, 8).rotateX(-Math.PI / 2).translate(0, 0.08, 0), color: '#ff7a2a', basic: true }],
  ash: () => [{ geo: new THREE.DodecahedronGeometry(0.16, 0).translate(0, 0.05, 0), colors: ['#5a4a44', '#3a302c'] }],
  iceCrystal: () => [
    { geo: new THREE.OctahedronGeometry(0.7, 0).scale(0.5, 2.1, 0.5).translate(0, 1.3, 0), color: '#a8e6ff', emissive: '#3a8fd0', emissiveIntensity: 0.45 },
    { geo: new THREE.OctahedronGeometry(0.4, 0).scale(0.5, 1.6, 0.5).rotateZ(0.5).translate(0.6, 0.6, 0.2), color: '#c8f0ff', emissive: '#3a8fd0', emissiveIntensity: 0.35 },
  ],
  // 沉沒王都：珊瑚、海草
  coral: () => [
    { geo: new THREE.CylinderGeometry(0.12, 0.22, 1.4, 5).translate(0, 0.7, 0), colors: ['#ff6f91', '#ff9f6a', '#c86bff'] },
    { geo: new THREE.CylinderGeometry(0.08, 0.14, 0.9, 5).rotateZ(0.7).translate(0.35, 1.1, 0), colors: ['#ff6f91', '#ff9f6a', '#c86bff'] },
    { geo: new THREE.CylinderGeometry(0.08, 0.14, 0.8, 5).rotateZ(-0.8).translate(-0.3, 0.9, 0.1), colors: ['#ffb3c6', '#ffd29a', '#e0a8ff'] },
  ],
  kelp: () => [{ geo: new THREE.ConeGeometry(0.18, 2.6, 4).translate(0, 1.3, 0), colors: ['#2f8f6a', '#3aa37a', '#24735a'], jitter: 0.08, yScale: 1.2 }],
  // 龍骨荒原：地上插著的骨刺
  bone: () => [
    { geo: new THREE.ConeGeometry(0.28, 2.4, 6).rotateZ(0.25).translate(0.2, 1.1, 0), colors: ['#e8dcc4', '#d9ccb0', '#f0e6d2'] },
    { geo: new THREE.SphereGeometry(0.35, 6, 5).scale(1, 0.6, 1).translate(0, 0.1, 0), color: '#cdbf9e' },
  ],
  snowMound: () => [{ geo: new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.4, 0.45, 1.1), color: '#f4f8fc' }],
};

// ─────────────────────────────────────────────
// 地標（每張地圖獨一無二的大物件）
// make(group, world, def) → { obstacles?, anim? }
// ─────────────────────────────────────────────
const LANDMARKS = {
  // 森林：千年古樹
  giantTree(g) {
    const bark = lam('#5a3a22');
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.6, 10, 9), bark);
    trunk.position.y = 5;
    g.add(trunk);
    for (let i = 0; i < 5; i++) {
      const root = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.7, 4, 6), bark);
      const a = (i / 5) * Math.PI * 2;
      root.position.set(Math.cos(a) * 2.4, 0.6, Math.sin(a) * 2.4);
      root.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
      g.add(root);
    }
    const leaf = ['#2f7a34', '#3f8f3a', '#4fa04a'];
    [[0, 11.5, 0, 5], [3.5, 10, 1.5, 3.5], [-3.2, 10.5, -1, 3.6], [0.5, 9.5, -3.4, 3.2], [-1, 13.5, 1, 3.2]].forEach(([x, y, z, r], i) => {
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), lam(leaf[i % 3]));
      c.position.set(x, y, z);
      g.add(c);
    });
    const glow = new THREE.Mesh(new THREE.CircleGeometry(6, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#d9ff7a', transparent: true, opacity: 0.12, depthWrite: false }));
    glow.position.y = 0.1;
    g.add(glow);
    return { anim: (t) => { glow.material.opacity = 0.1 + Math.sin(t) * 0.05; } };
  },
  // 森林：巨菇圈
  mushroomRing(g, w, l) {
    const obstacles = [];
    const caps = ['#d63c3c', '#b84ad6', '#e07a2a'];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const x = Math.cos(a) * 5, z = Math.sin(a) * 5;
      const s = 0.8 + (i % 3) * 0.25;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.45 * s, 0.6 * s, 2.8 * s, 8), lam('#f1e6cf'));
      stem.position.set(x, 1.4 * s, z);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(1.7 * s, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), lam(caps[i % 3], { emissive: caps[i % 3], emissiveIntensity: 0.15 }));
      cap.position.set(x, 2.7 * s, z);
      g.add(stem, cap);
      obstacles.push({ x: l.x + x, z: l.z + z, r: 0.8 * s });
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(2, 2.6, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#c8ff9a', transparent: true, opacity: 0.4 }));
    ring.position.y = 0.12;
    g.add(ring);
    return { obstacles, anim: (t) => { ring.rotation.y = t * 0.3; ring.material.opacity = 0.3 + Math.sin(t * 2) * 0.15; } };
  },
  // 森林：古老石門
  stoneArch(g, w, l) {
    const st = lam('#8a8a80');
    const moss = lam('#4f8a35');
    for (const x of [-3, 3]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.4, 6, 1.4), st);
      p.position.set(x, 3, 0);
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 1.5), moss);
      m.position.set(x, 0.3, 0);
      g.add(p, m);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(8.4, 1.2, 1.8), st);
    top.position.y = 6.5;
    g.add(top);
    return { obstacles: [{ x: l.x - 3, z: l.z, r: 1 }, { x: l.x + 3, z: l.z, r: 1 }] };
  },
  // 熔岩：遠方火山
  volcano(g) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(30, 30, 18, 1, true), lam('#2a1a16'));
    cone.position.y = 13;
    const crater = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5, 1, 18), new THREE.MeshBasicMaterial({ color: '#ff7a2a' }));
    crater.position.y = 27.5;
    g.add(cone, crater);
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.35;
      const flow = new THREE.Mesh(new THREE.BoxGeometry(1.2, 24, 0.3), new THREE.MeshBasicMaterial({ color: '#ff5a14' }));
      flow.position.set(Math.cos(a) * 11, 14, Math.sin(a) * -11 + 2);
      flow.rotation.set(0.75 * Math.sin(-a), 0, 0.75 * Math.cos(a));
      g.add(flow);
    }
    const smoke = new THREE.Mesh(new THREE.SphereGeometry(7, 10, 8), new THREE.MeshBasicMaterial({ color: '#3a2a26', transparent: true, opacity: 0.6 }));
    smoke.position.y = 34;
    g.add(smoke);
    return { anim: (t) => { crater.material.color.setHSL(0.06, 1, 0.5 + Math.sin(t * 2) * 0.08); smoke.position.y = 34 + Math.sin(t * 0.4) * 1.5; } };
  },
  // 熔岩：黑曜石尖塔
  spire(g) {
    const mat = lam('#1e1620', { emissive: '#4a1060', emissiveIntensity: 0.35 });
    [[0, 0, 2.6, 15], [2.4, 1, 1.4, 8], [-2, -1.5, 1.2, 7], [0.6, -2.5, 1, 5]].forEach(([x, z, r, h]) => {
      const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), mat);
      c.position.set(x, h / 2, z);
      g.add(c);
    });
    const crack = new THREE.Mesh(new THREE.BoxGeometry(0.15, 9, 0.15), new THREE.MeshBasicMaterial({ color: '#ff5a1f' }));
    crack.position.set(0.9, 4.5, 1.2);
    crack.rotation.z = 0.1;
    g.add(crack);
  },
  // 熔岩：巨獸骸骨
  skull(g) {
    const bone = lam('#d8cfb8');
    const head = new THREE.Mesh(new THREE.SphereGeometry(3.6, 12, 10), bone);
    head.scale.set(1, 0.85, 1.1);
    head.position.y = 2.4;
    g.add(head);
    for (const x of [-1.3, 1.3]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff5a1f' }));
      eye.position.set(x, 2.8, -3.3);
      g.add(eye);
    }
    for (const x of [-2.4, 2.4]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.7, 4, 6), bone);
      horn.position.set(x, 5.2, 0);
      horn.rotation.z = x > 0 ? -0.6 : 0.6;
      g.add(horn);
    }
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(4, 0.8, 3), bone);
    jaw.position.set(0, 0.4, -1.8);
    g.add(jaw);
  },
  // 霜雪：湖邊石柱環
  pillarRing(g, w, l) {
    const obstacles = [];
    const st = lam('#a9b6c2');
    const snow = lam('#ffffff');
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      if (Math.abs(Math.sin(a)) < 0.3) continue; // 留出石橋與河道的位置
      const x = Math.cos(a) * 17.5, z = Math.sin(a) * 17.5;
      const h = 3 + (i % 3) * 1.6;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.95, h, 8), st);
      p.position.set(x, h / 2, z);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.85, 0.35, 8), snow);
      cap.position.set(x, h + 0.15, z);
      g.add(p, cap);
      obstacles.push({ x: l.x + x, z: l.z + z, r: 1 });
    }
    return { obstacles };
  },
  // 霜雪：冰封巨像（用角色模型放大）
  frozenStatue(g) {
    const ped = new THREE.Mesh(new THREE.BoxGeometry(6, 1.6, 6), lam('#a9b6c2'));
    ped.position.y = 0.8;
    g.add(ped);
    const hero = createHero({ model: false });
    hero.root.traverse((o) => {
      if (o.isMesh) o.material = new THREE.MeshLambertMaterial({ color: '#bfe6ff', emissive: '#3a7fb0', emissiveIntensity: 0.25, flatShading: true, transparent: true, opacity: 0.92 });
    });
    hero.armR.pivot.rotation.x = -2.6;
    hero.root.scale.setScalar(3.4);
    hero.root.position.y = 1.6;
    hero.root.rotation.y = 0;
    g.add(hero.root);
    return { anim: (t) => { hero.root.rotation.y = Math.sin(t * 0.2) * 0.05; } };
  },
  // 霜雪：殘破拱門
  ruinGate(g, w, l) {
    const st = lam('#9aa6b2');
    const snow = lam('#ffffff');
    for (const z of [-3.2, 3.2]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.4, z < 0 ? 6.5 : 4.2, 1.4), st);
      p.position.set(0, z < 0 ? 3.25 : 2.1, z);
      g.add(p);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1, 5), st);
    lintel.position.set(0, 6.5, -1.4);
    lintel.rotation.x = 0.25;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.3, 5.1), snow);
    cap.position.set(0, 7.05, -1.4);
    cap.rotation.x = 0.25;
    g.add(lintel, cap);
    return { obstacles: [{ x: l.x, z: l.z - 3.2, r: 1 }, { x: l.x, z: l.z + 3.2, r: 1 }] };
  },
  // 霜雪：倒塌城牆
  ruinWall(g, w, l) {
    const st = lam('#8d99a5');
    const obstacles = [];
    [[-4, 0, 8, 3], [3, -3, 1.5, 2], [3, 3.5, 1.5, 4]].forEach(([x, z, len, h], i) => {
      const box = new THREE.Mesh(new THREE.BoxGeometry(i === 0 ? 1.4 : len, h, i === 0 ? len : 1.4), st);
      box.position.set(x, h / 2, z);
      g.add(box);
      if (i === 0) for (let k = -3; k <= 3; k += 1.5) obstacles.push({ x: l.x + x, z: l.z + z + k, r: 0.9 });
      else obstacles.push({ x: l.x + x, z: l.z + z, r: 1 });
    });
    return { obstacles };
  },

  // ── 村莊 ──
  fountain(g) {
    const stone = lam('#cfc8b8');
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.3, 0.7, 20), stone);
    basin.position.y = 0.35;
    const water = new THREE.Mesh(new THREE.CircleGeometry(2.7, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#5fb4ff', transparent: true, opacity: 0.85 }));
    water.position.y = 0.66;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 2.4, 10), lam('#e4ddcc'));
    pillar.position.y = 1.6;
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 10), lam('#f5c04a', { emissive: '#4a3500' }));
    orb.position.y = 3.1;
    const spray = new THREE.Mesh(new THREE.ConeGeometry(1.2, 1.8, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    spray.position.y = 1.7;
    spray.rotation.x = Math.PI;
    g.add(basin, water, pillar, orb, spray);
    return { anim: (t) => { orb.position.y = 3.1 + Math.sin(t * 2) * 0.12; spray.scale.set(1 + Math.sin(t * 6) * 0.05, 1, 1 + Math.cos(t * 6) * 0.05); } };
  },
  forge(g) {
    const wall = lam('#6a4a3a');
    const house = new THREE.Mesh(new THREE.BoxGeometry(4, 2.6, 3.2), wall);
    house.position.y = 1.3;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.2, 1.6, 4), lam('#3a3a42'));
    roof.position.y = 3.4; roof.rotation.y = Math.PI / 4;
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.4, 0.8), lam('#5a4a44'));
    chimney.position.set(1.2, 4, -0.6);
    const fire = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1, 0.1), new THREE.MeshBasicMaterial({ color: '#ff7a2f' }));
    fire.position.set(0, 0.9, 1.62);
    const anvil = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.6), lam('#4b4f5c'));
    anvil.position.set(2.2, 0.55, 2.6);
    const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), new THREE.MeshBasicMaterial({ color: '#888', transparent: true, opacity: 0.5 }));
    g.add(house, roof, chimney, fire, anvil, smoke);
    return { anim: (t) => {
      fire.material.color.setHSL(0.06, 1, 0.5 + Math.sin(t * 9) * 0.08);
      const k = (t * 0.6) % 1;
      smoke.position.set(1.2, 5.4 + k * 3, -0.6);
      smoke.scale.setScalar(0.6 + k * 1.4);
      smoke.material.opacity = 0.5 * (1 - k);
    } };
  },
  portal(g) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.2, 10, 40), new THREE.MeshBasicMaterial({ color: '#c084fc' }));
    ring.position.y = 2.1;
    const core = new THREE.Mesh(new THREE.CircleGeometry(1.5, 32), new THREE.MeshBasicMaterial({ color: '#7c3aed', transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
    core.position.y = 2.1;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 0.4, 16), lam('#8d8aa8'));
    base.position.y = 0.2;
    g.add(ring, core, base);
    return { anim: (t) => { ring.rotation.z = t * 1.5; core.material.opacity = 0.4 + Math.sin(t * 3) * 0.15; } };
  },
  board(g) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.4, 0.2), lam('#6b4a2b'));
    post.position.y = 1.2;
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.6, 0.14), lam('#9a6b3c'));
    b.position.y = 2.1;
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshBasicMaterial({ color: '#f3ead2' }));
    paper.position.set(0, 2.1, 0.08);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.2, 0.7), lam('#5a3a22'));
    roof.position.set(0, 3, 0.1);
    g.add(post, b, paper, roof);
  },
  // 酒館：兩層木屋 + 招牌（啤酒杯）+ 門口燈籠 + 酒桶
  tavern(g) {
    const wall = lam('#c9a06a'), wood = lam('#6a4426'), roofM = lam('#8a3a2a');
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.6, 3.6), wall);
    body.position.y = 1.3;
    const top = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.6, 3.8), lam('#d8b07a'));
    top.position.y = 3.4;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.8, 4), roofM);
    roof.position.y = 5.1; roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.85);
    for (const x of [-2.25, 2.25]) for (const z of [-1.85, 1.85]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.22, 4.3, 0.22), wood);
      beam.position.set(x, 2.15, z); g.add(beam);
    }
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.8, 0.1), wood);
    door.position.set(0, 0.9, 1.85);
    const win = new THREE.MeshBasicMaterial({ color: '#ffd27a' });
    for (const x of [-1.4, 1.4]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.08), win); w.position.set(x, 1.6, 1.84); g.add(w); }
    for (const x of [-1.2, 1.2]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.08), win); w.position.set(x, 3.4, 1.94); g.add(w); }
    // 招牌：木板 + 啤酒杯
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.1), wood); arm.position.set(2.7, 2.6, 1.9);
    const sign = new THREE.Group(); sign.position.set(3.1, 2.15, 1.9);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.08), lam('#3a2414'));
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.34, 10), lam('#f5c04a', { emissive: '#f5c04a', emissiveIntensity: 0.3 }));
    mug.position.z = 0.08; mug.rotation.x = Math.PI / 2;
    sign.add(board, mug);
    // 酒桶
    for (const [x, z] of [[-2.9, 2.2], [-2.6, 1.3], [2.8, 0.4]]) {
      const keg = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.85, 10), wood);
      keg.position.set(x, 0.42, z); g.add(keg);
    }
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffb347' }));
    lantern.position.set(-0.9, 2.2, 2.05);
    g.add(body, top, roof, door, arm, sign, lantern);
    return { anim: (t) => { sign.rotation.x = Math.sin(t * 1.2) * 0.08; lantern.scale.setScalar(1 + Math.sin(t * 6) * 0.06); } };
  },
  // 馬廄：木頭棚子 + 圍欄 + 乾草堆 + 一匹在吃草的小馬
  stable(g) {
    const wood = lam('#8a5a32');
    const dark = lam('#5a3a22');
    for (const [x, z] of [[-1.6, -1.2], [1.6, -1.2], [-1.6, 1.2], [1.6, 1.2]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.6, 0.22), dark);
      post.position.set(x, 1.3, z);
      g.add(post);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4, 0.18, 3.2), lam('#a8743a'));
    roof.position.y = 2.7;
    roof.rotation.x = 0.12;
    const back = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.6, 0.12), wood);
    back.position.set(0, 0.8, -1.2);
    // 圍欄
    for (const x of [-2.6, 2.6]) {
      for (const y of [0.45, 0.9]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 3), wood);
        rail.position.set(x, y, 0.4);
        g.add(rail);
      }
    }
    const hay = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1, 10).rotateZ(Math.PI / 2), lam('#e2c35a'));
    hay.position.set(-0.9, 0.6, -0.4);
    const hay2 = hay.clone();
    hay2.position.set(-0.3, 0.6, -0.7);
    const trough = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 0.5), dark);
    trough.position.set(0.9, 0.3, 0.9);
    // 小馬（簡化版）
    const pony = new THREE.Group();
    const bodyMat = lam('#b07a45');
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.9, 3, 8).rotateX(Math.PI / 2), bodyMat);
    torso.position.y = 0.85;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 0.7, 6), bodyMat);
    neck.position.set(0, 0.95, 0.6);
    neck.rotation.x = 1.6;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.5), bodyMat);
    head.position.set(0, 0.62, 0.95);
    for (const [x, z] of [[-0.18, 0.45], [0.18, 0.45], [-0.18, -0.45], [0.18, -0.45]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.7, 5), bodyMat);
      leg.position.set(x, 0.35, z);
      pony.add(leg);
    }
    pony.add(torso, neck, head);
    pony.position.set(0.9, 0, 0);
    pony.rotation.y = 0.3;
    g.add(roof, back, hay, hay2, trough, pony);
    return { anim: (t) => { head.position.y = 0.62 + Math.sin(t * 1.5) * 0.05; neck.rotation.x = 1.6 + Math.sin(t * 1.5) * 0.05; } };
  },
  house(g, w, l) {
    const palette = ['#e8dcc4', '#d9c7a8', '#f0e6d2', '#cfd8c4'];
    const roofs = ['#b5523b', '#7a4a8a', '#3a6a9a', '#a8743a'];
    const k = Math.abs(Math.round(l.x * 7 + l.z * 3)) % 4;
    const body = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 4.2), lam(palette[k]));
    body.position.y = 1.5;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 2.4, 4), lam(roofs[k]));
    roof.position.y = 4.2; roof.rotation.y = Math.PI / 4; roof.scale.set(1.15, 1, 0.95);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.8), lam('#5a3a22'));
    door.position.set(0, 0.9, 2.12);
    const winMat = new THREE.MeshBasicMaterial({ color: '#ffe8a3' });
    for (const x of [-1.6, 1.6]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), winMat);
      win.position.set(x, 1.8, 2.12);
      g.add(win);
    }
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, 0.6), lam('#7a6a5e'));
    chimney.position.set(1.4, 4.6, -0.8);
    g.add(body, roof, door, chimney);
  },
  // 龍骨荒原：巨龍肋骨拱（一排彎曲的骨頭）
  ribcage(g) {
    const bone = lam('#e8dcc4');
    for (let i = 0; i < 7; i++) {
      for (const s of [-1, 1]) {
        const rib = new THREE.Mesh(new THREE.TorusGeometry(4.2 - Math.abs(i - 3) * 0.35, 0.28, 6, 14, Math.PI * 0.55), bone);
        rib.position.set(s * 0.6, 0, -6 + i * 2);
        rib.rotation.set(0, s > 0 ? 0 : Math.PI, Math.PI * 0.2);
        g.add(rib);
      }
    }
    const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 14, 8).rotateX(Math.PI / 2), bone);
    spine.position.y = 4.1;
    const skull = new THREE.Mesh(new THREE.DodecahedronGeometry(1.8, 0).scale(1, 0.8, 1.5), lam('#d9ccb0'));
    skull.position.set(0, 1.4, 9);
    const eyeMat = new THREE.MeshBasicMaterial({ color: '#ff4a2a' });
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), eyeMat); e.position.set(s * 0.7, 1.9, 10.6); g.add(e); }
    g.add(spine, skull);
    return { anim: (t) => { eyeMat.color.setHSL(0.03, 1, 0.45 + Math.sin(t * 3) * 0.12); } };
  },
  // 沉沒王都：發光珊瑚塔 + 沉沒的王座
  coralSpire(g) {
    const glowMat = new THREE.MeshBasicMaterial({ color: '#7df9ff' });
    const stone = lam('#4a6a78');
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.6, 1.2, 8), stone);
    base.position.y = 0.6;
    g.add(base);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.5, 4 + i * 0.6, 6), lam(['#ff6f91', '#c86bff', '#ff9f6a', '#6fe0c8', '#ff6f91'][i]));
      c.position.set(Math.cos(a) * 1.6, 2.6 + i * 0.3, Math.sin(a) * 1.6);
      c.rotation.set(Math.cos(a) * 0.2, 0, -Math.sin(a) * 0.2);
      g.add(c);
    }
    const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 12), glowMat);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 12), new THREE.MeshBasicMaterial({ color: '#7df9ff', transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(pearl, halo);
    return { anim: (t) => { pearl.position.y = 6 + Math.sin(t * 1.4) * 0.4; halo.position.y = pearl.position.y; halo.scale.setScalar(1 + Math.sin(t * 3) * 0.15); } };
  },
  // 村莊北邊：轉職殿堂（白石階梯平台 + 六根石柱 + 圓頂 + 漂浮的轉職水晶 + 地上發光法陣）
  temple(g) {
    const stone = lam('#e8e2d4'), dark = lam('#b9b0a0'), gold = lam('#f5c04a', { emissive: '#5a4000' });
    for (let i = 0; i < 3; i++) {
      const step = new THREE.Mesh(new THREE.CylinderGeometry(6.2 - i * 0.8, 6.4 - i * 0.8, 0.35, 8), i % 2 ? dark : stone);
      step.position.y = 0.17 + i * 0.35;
      g.add(step);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.42, 5, 10), stone);
      col.position.set(Math.cos(a) * 4, 3.55, Math.sin(a) * 4);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1, 0.3, 1), gold);
      cap.position.set(col.position.x, 6.1, col.position.z);
      g.add(col, cap);
    }
    const ringTop = new THREE.Mesh(new THREE.TorusGeometry(4, 0.3, 6, 24), stone);
    ringTop.rotation.x = Math.PI / 2; ringTop.position.y = 6.3;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(4.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), lam('#7fa8d8'));
    dome.position.y = 6.3; dome.scale.y = 0.55;
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.6, 6), gold);
    spire.position.y = 9.4;
    const crystalMat = new THREE.MeshBasicMaterial({ color: '#c9a6ff' });
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), crystalMat);
    crystal.scale.set(0.8, 1.5, 0.8);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 12), new THREE.MeshBasicMaterial({ color: '#c9a6ff', transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
    const circle = new THREE.Mesh(new THREE.RingGeometry(2.4, 2.8, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#d8c4ff', transparent: true, opacity: 0.7 }));
    circle.position.y = 1.07;
    const inner = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.55, 6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.7 }));
    inner.position.y = 1.08;
    g.add(ringTop, dome, spire, crystal, glow, circle, inner);
    return {
      // 石柱要擋路，中間可以走進去
      obstacles: Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        return { x: g.position.x + Math.cos(a) * 4, z: g.position.z + Math.sin(a) * 4, r: 0.6 };
      }),
      anim: (t) => {
        crystal.position.y = 3.4 + Math.sin(t * 1.5) * 0.3;
        glow.position.y = crystal.position.y;
        crystal.rotation.y = t * 0.8;
        glow.scale.setScalar(1 + Math.sin(t * 3) * 0.1);
        crystalMat.color.setHSL(0.75 + Math.sin(t * 0.5) * 0.08, 0.9, 0.78);
        circle.rotation.y = t * 0.3; inner.rotation.y = -t * 0.5;
      },
    };
  },
  // 市集攤位：木桌 + 條紋布棚 + 貨物
  stall(g, w, l) {
    const k = Math.abs(Math.round(l.x * 3 + l.z * 5)) % 4;
    const cloth = ['#d9534f', '#3a8fd9', '#e6b422', '#5cb85c'][k];
    const wood = lam('#8a5a32');
    const table = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.2, 1.3), wood);
    table.position.y = 0.95;
    const front = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.85, 0.1), wood);
    front.position.set(0, 0.45, 0.6);
    g.add(table, front);
    for (const [x, z] of [[-1.2, -0.55], [1.2, -0.55], [-1.2, 0.55], [1.2, 0.55]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), wood);
      post.position.set(x, 1.3, z);
      g.add(post);
    }
    for (let i = 0; i < 4; i++) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 1.7), lam(i % 2 ? '#f6f0e4' : cloth));
      stripe.position.set(-1.08 + i * 0.72, 2.65, 0.1);
      stripe.rotation.x = -0.18;
      g.add(stripe);
    }
    const goods = [['#ff7a5a', 0.22], ['#ffd166', 0.2], ['#7ed957', 0.24], ['#9be7ff', 0.18]];
    goods.forEach(([c, r], i) => {
      const m = new THREE.Mesh(i % 2 ? new THREE.SphereGeometry(r, 8, 6) : new THREE.BoxGeometry(r * 2, r * 2, r * 2), lam(c));
      m.position.set(-0.9 + i * 0.6, 1.05 + r, 0.05);
      g.add(m);
    });
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.8), lam('#a8743a'));
    crate.position.set(1.7, 0.35, -0.3);
    g.add(crate);
  },
  // 訓練場木人樁
  dummy(g) {
    const wood = lam('#9a6a3a'), straw = lam('#d9b85c');
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 2.2, 6), wood);
    post.position.y = 1.1;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.38, 1, 8), straw);
    body.position.y = 1.3;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), straw);
    head.position.y = 2.1;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.14, 0.14), wood);
    arm.position.y = 1.6;
    const target = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), new THREE.MeshBasicMaterial({ color: '#d0263a' }));
    target.position.set(0, 1.35, 0.43);
    g.add(post, body, head, arm, target);
    return { anim: (t) => { g.rotation.z = Math.sin(t * 1.3 + g.position.x) * 0.03; } };
  },
  // 訓練場 / 市集的旗幟
  banner(g, w, l) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.2, 6), lam('#4a3a2a'));
    pole.position.y = 2.1;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.6, 6, 1), lam(l.color || '#c9a6ff', { side: THREE.DoubleSide }));
    flag.position.set(0.62, 3.3, 0);
    g.add(pole, flag);
    const pos = flag.geometry.attributes.position;
    const base = Float32Array.from(pos.array);
    return { anim: (t) => {
      for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(t * 4 + base[i * 3] * 3) * 0.12 * (base[i * 3] + 0.6));
      pos.needsUpdate = true;
    } };
  },
  lamp(g) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 3, 6), lam('#2e2e36'));
    pole.position.y = 1.5;
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffe08a' }));
    light.position.y = 3.1;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.35, 6), lam('#2e2e36'));
    cap.position.y = 3.45;
    g.add(pole, light, cap);
  },
  well(g) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.9, 12, 1, true), lam('#9a958a', { side: THREE.DoubleSide }));
    ring.position.y = 0.45;
    const water = new THREE.Mesh(new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#3f6f9a' }));
    water.position.y = 0.3;
    g.add(ring, water);
    for (const x of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.2, 0.15), lam('#6b4a2b'));
      p.position.set(x, 1.1, 0);
      g.add(p);
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.9, 4), lam('#b5523b'));
    roof.position.y = 2.5; roof.rotation.y = Math.PI / 4;
    g.add(roof);
  },
  fence(g, w) {
    const R = w.R + 1;
    const geo = new THREE.BoxGeometry(0.2, 1.1, 0.2);
    const mat = lam('#8a6a42');
    const pts = [];
    for (let v = -R; v <= R; v += 2) {
      for (const [x, z] of [[v, -R], [v, R], [-R, v], [R, v]]) {
        if (Math.abs(x) < 4 || Math.abs(z + 2) < 4) continue; // 路口留空
        pts.push([x, z]);
      }
    }
    const im = new THREE.InstancedMesh(geo, mat, pts.length);
    const m4 = new THREE.Matrix4();
    pts.forEach(([x, z], i) => { m4.makeTranslation(x, w.height(x, z) + 0.55, z); im.setMatrixAt(i, m4); });
    g.add(im);
    g.position.set(0, 0, 0);
  },
};
