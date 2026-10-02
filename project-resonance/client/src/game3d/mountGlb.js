// ─────────────────────────────────────────────
// 坐騎 3D 模型（Meshy 生成、已綁骨骼，放在 public/models/mounts/）
//   horse    草原小馬（披甲戰馬）
//   whale    星辰鯨
//   wyvern   赤翼魔龍（新坐騎）
//   frostfox 冰霜坤（新坐騎，模型自帶跑步動畫）
//
// 只有冰霜坤有動畫，其他三隻只有骨架 → 這裡自動「看骨架」找出腳、尾巴、翅膀、頭，
// 用程式擺動骨頭做出跑步 / 拍翅 / 擺尾（不用另外做動畫檔）。
// 模型是背景載入的：還沒載好時先顯示原本的程式坐騎，載好的那一幀自動換成模型（mountModel.js）
// ─────────────────────────────────────────────
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * forward：模型原本的「頭朝向」（換成遊戲的 +Z）
 * length：放進遊戲後的身長；seat / seatZ：鞍座的高度比例、前後位置比例
 * hover：離地高度（會飛 / 會游的）；gait：程式動畫種類
 */
export const MOUNT_GLB = {
  horse: { file: 'horse', forward: '-x', length: 2.7, seat: 0.6, seatZ: -0.02, gait: 'trot' },
  whale: { file: 'whale', forward: '+z', length: 4.4, seat: 0.78, seatZ: 0.02, hover: 1.1, gait: 'swim' },
  wyvern: { file: 'wyvern', forward: '+z', length: 3.8, seat: 0.56, seatZ: 0.05, hover: 0.9, gait: 'fly' },
  frostfox: { file: 'frostfox', forward: '+z', length: 2.9, seat: 0.66, seatZ: -0.02, gait: 'clip' },
};

const templates = {}; // key → { scene, clip, height }
const loading = {};
let loader = null;

export const glbReady = (key) => !!templates[key];

/** 背景載入（重複呼叫只會載一次） */
export function loadMountGlb(key) {
  const cfg = MOUNT_GLB[key];
  if (!cfg) return Promise.resolve(null);
  if (loading[key]) return loading[key];
  loader ||= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  loading[key] = loader.loadAsync(`/models/mounts/${cfg.file}.glb`).then((g) => {
    templates[key] = normalize(g, cfg);
    return templates[key];
  }).catch((e) => {
    console.warn(`[坐騎模型] ${key} 載入失敗，沿用程式坐騎`, e);
    return null;
  });
  return loading[key];
}

/** 轉成「頭朝 +Z、腳踩 y=0、身長 = cfg.length」 */
function normalize(g, cfg) {
  const inner = g.scene;
  const yaw = { '+z': 0, '-z': Math.PI, '+x': -Math.PI / 2, '-x': Math.PI / 2 }[cfg.forward] ?? 0;
  const turn = new THREE.Group();
  turn.rotation.y = yaw;
  turn.add(inner);
  const clip = g.animations[0] ?? null;
  // 有動畫的先擺到第一格再量（T-pose 量出來會不準）
  let mixer = null;
  if (clip) { mixer = new THREE.AnimationMixer(inner); mixer.clipAction(clip).play(); mixer.update(0); }
  turn.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(turn, true);
  mixer?.stopAllAction();
  const size = box.getSize(new THREE.Vector3());
  const s = cfg.length / Math.max(size.z, 0.0001);
  turn.scale.setScalar(s);
  turn.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s);
  const scene = new THREE.Group();
  scene.add(turn);
  inner.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false; // 骨架動畫會讓包圍盒失準，乾脆不剔除
    o.castShadow = true;
    o.userData.shared = true; // 幾何 / 材質是共用的，換坐騎時不能 dispose
    if (o.material) o.material.userData.shared = true;
  });
  return { scene, clip, height: size.y * s, length: cfg.length, width: size.x * s };
}

/** 做一隻實體：複製骨架 + 分析骨頭 */
export function createGlbMount(key) {
  const tpl = templates[key];
  const cfg = MOUNT_GLB[key];
  if (!tpl) return null;
  const obj = SkeletonUtils.clone(tpl.scene);
  obj.updateMatrixWorld(true);
  const out = { obj, cfg, height: tpl.height, length: tpl.length, gait: cfg.gait };
  if (cfg.gait === 'clip' && tpl.clip) {
    out.mixer = new THREE.AnimationMixer(obj);
    out.action = out.mixer.clipAction(tpl.clip);
    out.action.play();
  } else {
    out.rig = analyzeRig(obj, tpl);
  }
  out.seatY = tpl.height * cfg.seat + (cfg.hover ?? 0);
  out.seatZ = tpl.length * (cfg.seatZ ?? 0);
  return out;
}

// ── 自動骨架分析 ─────────────────────────────
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

function analyzeRig(obj, tpl) {
  const bones = [];
  obj.traverse((o) => { if (o.isBone) bones.push(o); });
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  const pos = new Map(), kids = new Map();
  for (const b of bones) {
    pos.set(b, b.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv));
    kids.set(b, b.children.filter((c) => c.isBone));
  }
  const H = tpl.height, L = tpl.length, W = tpl.width;
  const isBranch = (b) => !b.parent?.isBone || kids.get(b.parent).length > 1;
  /** 從末端往上找到分岔點，回傳 [根 → 末端] 的骨頭鏈 */
  const chainOf = (leaf) => {
    const chain = [leaf];
    let b = leaf;
    while (b.parent?.isBone && !isBranch(b) && chain.length < 8) { b = b.parent; chain.unshift(b); }
    return chain;
  };
  const leaves = bones.filter((b) => kids.get(b).length === 0);
  const used = new Set();
  const take = (filter) => leaves.filter((b) => !used.has(b) && filter(pos.get(b))).map((b) => { used.add(b); return chainOf(b); });

  const legs = take((p) => p.y < H * 0.18 && p.z > -L * 0.36); // 太後面的低點是垂下來的尾巴，不是腳
  const wings = take((p) => Math.abs(p.x) > W * 0.32 && p.y > H * 0.3);
  const tails = take((p) => p.z < -L * 0.3);
  const heads = take((p) => p.z > L * 0.28 && p.y > H * 0.3);

  // 每根要動的骨頭：記住原本姿勢 + 把「坐騎座標的旋轉軸」換算到它父骨頭的座標
  const prep = (chain, axisName) => chain.map((b) => {
    const parentQ = b.parent.getWorldQuaternion(new THREE.Quaternion());
    const objQ = obj.getWorldQuaternion(new THREE.Quaternion());
    const rel = objQ.invert().multiply(parentQ); // 父骨頭相對坐騎根的旋轉
    return { b, rest: b.quaternion.clone(), axis: AX[axisName].clone().applyQuaternion(rel.invert()).normalize() };
  });
  const zMid = legs.length ? legs.reduce((n, c) => n + pos.get(c.at(-1)).z, 0) / legs.length : 0;
  return {
    legs: legs.map((c) => {
      const foot = pos.get(c.at(-1));
      const front = foot.z > zMid, left = foot.x > 0;
      return { j: prep(c.slice(0, 3), 'x'), phase: (front !== left ? Math.PI : 0) + (front ? 0 : 0.35) };
    }),
    wings: wings.map((c) => ({ j: prep(c.slice(0, 4), 'z'), side: Math.sign(pos.get(c.at(-1)).x) || 1 })),
    tails: tails.map((c) => ({ jy: prep(c, 'y'), jx: prep(c, 'x') })),
    heads: heads.map((c) => ({ j: prep(c.slice(0, 3), 'x') })),
  };
}

const rot = (j, angle) => { j.b.quaternion.copy(_q.setFromAxisAngle(j.axis, angle)).multiply(j.rest); };

/**
 * 每幀：依步態擺動骨頭
 * @returns 身體要多加的上下起伏（給 mountModel 用）
 */
export function animateGlbMount(g, t, dt, gait01, speed = 1) {
  if (g.mixer) { // 冰霜坤：模型自帶跑步動畫，停下來就放慢成踱步
    g.action.timeScale = 0.25 + gait01 * (1.1 * Math.max(1, speed * 0.8) - 0.25);
    g.mixer.update(dt);
    return Math.sin(t * 2) * 0.02 * (1 - gait01);
  }
  const R = g.rig;
  if (g.gait === 'swim') { // 鯨：胸鰭划水、尾鰭上下拍
    const w = 1.6 + gait01 * 2.4;
    R.wings.forEach((wg) => wg.j.forEach((j, i) => rot(j, wg.side * Math.sin(t * w - i * 0.5) * 0.22)));
    R.legs.forEach((l) => l.j.forEach((j, i) => rot(j, Math.sin(t * w + l.phase - i * 0.5) * 0.2))); // 低垂的胸鰭當成槳划
    R.tails.forEach((tl) => tl.jx.forEach((j, i) => rot(j, Math.sin(t * w - i * 0.7) * 0.18)));
    R.heads.forEach((h) => rot(h.j[0], Math.sin(t * w * 0.5) * 0.04));
    return Math.sin(t * w * 0.5) * 0.15;
  }
  if (g.gait === 'fly') { // 飛龍：大翅膀拍動，腳收起來晃，尾巴甩
    const w = 2.6 + gait01 * 4;
    const flap = Math.sin(t * w);
    R.wings.forEach((wg) => wg.j.forEach((j, i) => rot(j, wg.side * (flap * (0.55 - i * 0.08) + 0.1) * (i ? 0.6 : 1))));
    R.legs.forEach((l) => l.j.forEach((j, i) => rot(j, (i ? -0.35 : 0.3) * gait01 + Math.sin(t * 1.5 + l.phase) * 0.06)));
    R.tails.forEach((tl) => tl.jy.forEach((j, i) => rot(j, Math.sin(t * 2.2 - i * 0.6) * 0.16)));
    R.heads.forEach((h) => h.j.forEach((j, i) => rot(j, Math.sin(t * w * 0.5 - i) * 0.05)));
    return -flap * 0.18;
  }
  // 四足小跑：對角腳同步，膝蓋抬起
  const f = 9 * Math.max(1, speed * 0.8);
  R.legs.forEach((l) => {
    const s = Math.sin(t * f + l.phase);
    rot(l.j[0], s * 0.5 * gait01);
    if (l.j[1]) rot(l.j[1], -Math.max(0, -s) * 0.7 * gait01);
    if (l.j[2]) rot(l.j[2], Math.max(0, s) * 0.3 * gait01);
  });
  R.tails.forEach((tl) => tl.jy.forEach((j, i) => rot(j, Math.sin(t * (gait01 > 0.5 ? 8 : 2) - i * 0.5) * (0.1 + gait01 * 0.15))));
  R.heads.forEach((h) => rot(h.j[0], Math.sin(t * f) * 0.06 * gait01 + Math.sin(t * 1.3) * 0.04 * (1 - gait01)));
  return Math.abs(Math.sin(t * f)) * 0.07 * gait01;
}

/** 坐騎在預覽 / 商店要變成剪影時用 */
export function silhouette(obj) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.material = new THREE.MeshBasicMaterial({ color: 0x111018 });
    o.userData.shared = false;
  });
}
