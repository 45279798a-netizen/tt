// ─────────────────────────────────────────────
// 可換裝的 3D 角色模型（戰鬥畫面與角色頁共用）
// 5 個部位依穿戴的套裝改變外觀，武器越高階越大越亮
// ─────────────────────────────────────────────
import * as THREE from 'three';
import { THEMES } from './themes.js';
import { animateWings } from './wingModel.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * 給場景加上「環境光反射」：模型的材質是金屬 PBR（盔甲、金飾），
 * 沒有環境可以反射就會變灰變暗、顏色消失。每個 renderer 各做一份（貼圖不能跨 renderer 共用）
 */
export function addEnvironment(renderer, scene) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = tex;
  return tex;
}

// ═══ 主角 3D 模型（Meshy 生成的「烈陽君王」，原始檔沒有骨骼） ═══
// 載入時用程式自動綁骨骼：依身體部位計算每個頂點跟著哪根骨頭動
//   髖 → 脊椎 → 左右手臂；髖 → 左右腿；披風、前擺掛在身體上，走路時不會被腿扯破
// 骨頭的旋轉直接沿用原本程式角色的動畫（armL / armR / legL / legR 的 rotation）
// 關節位置是量模型得到的（腳底 = 0，面向 +Z）：
const J = {
  hips: [0, 0.92, 0.08],
  spine: [0, 1.3, 0.08],
  shoulder: [0.2, 1.42, 0.08],  // ×左右
  hand: [0.62, 1.08, 0.1],
  hip: [0.13, 0.92, 0.08],
};
const ARM_DOWN = 0.55;
const HERO_SCALE = 1.15;           // 模型是 A-pose（手張很開），待機時把手放下來一點
let heroAsset = null;            // { geometry, material }

// 主角模型：原始檔 80 MB 壓縮成 2.2 MB（約 7 萬點、保留原始 2048 貼圖），臉部細節跟原檔幾乎一樣
export const HERO_MODEL_URL = '/models/hero.glb';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** 遊戲開始前呼叫一次；失敗就沿用原本的程式角色 */
export async function loadHeroModel(url = HERO_MODEL_URL) {
  try {
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
    let src = null;
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => { if (o.isMesh && !src) src = o; });
    if (!src) return false;
    // 量化過的座標轉回浮點數，再套用節點的位移 / 縮放
    const g = new THREE.BufferGeometry();
    for (const name of ['position', 'normal']) {
      const a = src.geometry.attributes[name];
      const out = new Float32Array(a.count * 3);
      for (let i = 0; i < a.count; i++) { out[i * 3] = a.getX(i); out[i * 3 + 1] = a.getY(i); out[i * 3 + 2] = a.getZ(i); }
      g.setAttribute(name, new THREE.BufferAttribute(out, 3));
    }
    g.setAttribute('uv', src.geometry.attributes.uv);
    g.setIndex(src.geometry.index);
    g.applyMatrix4(src.matrixWorld);
    g.computeBoundingBox();
    const bb = g.boundingBox;
    g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, 0);
    g.scale(1.9 / (bb.max.y - bb.min.y), 1.9 / (bb.max.y - bb.min.y), 1.9 / (bb.max.y - bb.min.y));
    skinWeights(g);
    const mat = src.material; // 保留模型原本的金屬 / 粗糙度，顏色靠場景的環境光（addEnvironment）呈現
    heroAsset = { geometry: g, material: mat };
    return true;
  } catch (e) {
    console.warn('[角色模型] 載入失敗，使用預設角色', e);
    return false;
  }
}
export const heroModelReady = () => !!heroAsset;

/** 自動綁骨骼：骨頭 0 髖 / 1 脊椎 / 2 左手 / 3 右手 / 4 左腿 / 5 右腿（右 = +X，跟程式角色一致） */
function skinWeights(g) {
  const pos = g.attributes.position;
  const n = pos.count;
  const idx = new Uint16Array(n * 4);
  const wts = new Float32Array(n * 4);
  const S = new THREE.Vector3(), H = new THREE.Vector3(), P = new THREE.Vector3(), D = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    P.set(x, y, z);
    const side = x >= 0 ? 1 : -1;
    // 手臂：肩→手的膠囊範圍內（披風在背後 z<0，不算）
    S.set(J.shoulder[0] * side, J.shoulder[1], J.shoulder[2]);
    H.set(J.hand[0] * side, J.hand[1], J.hand[2]);
    D.subVectors(H, S);
    const len2 = D.lengthSq();
    const t = Math.max(-0.3, Math.min(1.35, ((x - S.x) * D.x + (y - S.y) * D.y + (z - S.z) * D.z) / len2));
    const tc = Math.max(0, Math.min(1.2, t));
    const dist = Math.hypot(x - (S.x + D.x * tc), y - (S.y + D.y * tc), z - (S.z + D.z * tc));
    let arm = smooth(-0.05, 0.22, t) * smooth(0.2, 0.12, dist) * smooth(-0.06, 0.0, z);
    // 腿：髖以下、身體前半部；前擺（正中間）和兩側飄開的披風留給身體
    let leg = smooth(0.95, 0.72, y) * smooth(0.02, 0.07, Math.abs(x)) * smooth(0.3, 0.22, Math.abs(x)) * smooth(-0.02, 0.04, z);
    if (Math.abs(x) < 0.09 && z > 0.17) leg *= 0.15;
    arm = Math.min(arm, 1);
    leg = Math.min(leg, 1 - arm);
    const body = 1 - arm - leg;
    const core = y < J.hips[1] ? 0 : 1; // 髖以下的身體部分跟著髖，以上跟著脊椎
    idx[i * 4] = core; wts[i * 4] = body;
    idx[i * 4 + 1] = side > 0 ? 3 : 2; wts[i * 4 + 1] = arm;
    idx[i * 4 + 2] = side > 0 ? 5 : 4; wts[i * 4 + 2] = leg;
    idx[i * 4 + 3] = 0; wts[i * 4 + 3] = 0;
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wts, 4));
}

/** 幫一個角色建立自己的骨架 + 蒙皮模型（幾何、材質共用） */
function buildSkinned() {
  const v = (a, sx = 1) => new THREE.Vector3(a[0] * sx, a[1], a[2]);
  const hips = new THREE.Bone(); hips.position.copy(v(J.hips));
  const spine = new THREE.Bone(); spine.position.copy(v(J.spine).sub(v(J.hips)));
  const armL = new THREE.Bone(); armL.position.copy(v(J.shoulder, -1).sub(v(J.spine)));
  const armR = new THREE.Bone(); armR.position.copy(v(J.shoulder, 1).sub(v(J.spine)));
  const legL = new THREE.Bone(); legL.position.copy(v(J.hip, -1).sub(v(J.hips)));
  const legR = new THREE.Bone(); legR.position.copy(v(J.hip, 1).sub(v(J.hips)));
  hips.add(spine, legL, legR);
  spine.add(armL, armR);
  const mesh = new THREE.SkinnedMesh(heroAsset.geometry, heroAsset.material);
  mesh.add(hips);
  mesh.frustumCulled = false;
  mesh.scale.setScalar(HERO_SCALE); // 寫實比例的模型在俯視鏡頭下偏小，放大一點比較好認
  mesh.castShadow = false;
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([hips, spine, armL, armR, legL, legR]));
  return { mesh, hips, spine, armL, armR, legL, legR };
}

/** 程式角色 → 模型角色：藏起程式做的身體，武器移到模型的手上 */
function attachModel(hero) {
  const sk = buildSkinned();
  hero.rig.add(sk.mesh);
  hero.skinned = sk;
  hero.hipY = J.hips[1] * HERO_SCALE;
  const handAt = (side) => new THREE.Vector3((J.hand[0] - J.shoulder[0]) * side, J.hand[1] - J.shoulder[1], J.hand[2] - J.shoulder[2]);
  const holder = (bone, side) => {
    const h = new THREE.Group();
    h.position.copy(handAt(side));
    h.rotation.z = ARM_DOWN * side; // 抵消「手放下來」的角度，武器方向維持原本的設計
    bone.add(h);
    return h;
  };
  const hr = holder(sk.armR, 1), hl = holder(sk.armL, -1);
  for (const w of [hero.sword, hero.katana, hero.staff, hero.spear, hero.dual[0].g]) { w.position.set(0, 0, 0); hr.add(w); }
  for (const w of [hero.dual[1].g, hero.bow, hero.fists[1]]) { w.position.set(0, 0, 0); hl.add(w); }
  for (const w of [hero.scythe, hero.fists[0]]) { w.position.set(0, 0, 0); hr.add(w); }
  hideBody(hero);
}

function hideBody(hero) {
  for (const o of hero.bodyParts) o.visible = false;
}

/** 每幀：把程式角色關節的旋轉套到骨頭上 */
function syncBones(hero) {
  const sk = hero.skinned;
  const r = hero.armR.pivot.rotation, l = hero.armL.pivot.rotation;
  sk.armR.rotation.set(r.x, r.y, r.z - ARM_DOWN);
  sk.armL.rotation.set(l.x, l.y, l.z + ARM_DOWN);
  sk.legL.rotation.copy(hero.legL.rotation);
  sk.legR.rotation.copy(hero.legR.rotation);
  sk.spine.rotation.y = (hero.swing - hero.swingL) * 0.25; // 揮刀時上半身扭一下
}

const lam = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });

const SKIN = 0xf2d0b0;
const CLOTH = 0x3446c8;
const LEATHER = 0x6b4a2b;
const HAIR = 0x3b2a1e;

function setColors(set) {
  if (set < 0) return null;
  const t = THEMES[set % THEMES.length];
  return { main: new THREE.Color(t.mob), accent: new THREE.Color(t.decoColors[1]), dark: new THREE.Color(t.decoColors[0]) };
}

/** 建立角色骨架（不含裝備外觀，外觀由 applyEquipment 決定） */
/** opts.model = false：用程式角色（村莊 NPC） */
export function createHero(opts = {}) {
  const root = new THREE.Group();
  const rig = new THREE.Group(); // 整個身體，用來做走路起伏 / 旋風斬
  root.add(rig);

  const m = {
    torso: lam(CLOTH), belt: lam(LEATHER), skin: lam(SKIN, { emissive: 0x3a2418 }), hair: lam(HAIR),
    helm: lam(0xffffff), crest: lam(0xffffff), pad: lam(0xffffff),
    glove: lam(SKIN), bracer: lam(0xffffff), leg: lam(0x2a2f4a), boot: lam(LEATHER),
    cape: new THREE.MeshLambertMaterial({ color: 0xa3192a, side: THREE.DoubleSide }),
    blade: lam(0xffffff, { emissive: 0x000000 }), guard: lam(0xffffff), grip: lam(0x3b2a1e),
  };

  // 軀幹
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, 0.9, 8), m.torso);
  torso.position.y = 0.95;
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.12, 8), m.belt);
  belt.position.y = 0.58;
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.56, 0.25, 8), m.torso);
  skirt.position.y = 0.45;

  // 頭：Q 版大頭、平滑皮膚、動漫風大眼睛（眼白 + 彩色虹膜 + 瞳孔 + 兩個高光）、眉毛、嘴、腮紅、耳朵
  const skinSmooth = new THREE.MeshLambertMaterial({ color: SKIN, emissive: 0x3a2418 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 28, 20), skinSmooth);
  head.position.y = 1.64;
  head.scale.set(1, 0.95, 0.95);
  const eyes = new THREE.Group();
  eyes.position.set(0, 1.62, 0.315); // 貼在臉的表面
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const iris = new THREE.MeshBasicMaterial({ color: 0x3a7bd5 });
  const dark = new THREE.MeshBasicMaterial({ color: 0x14141f });
  const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const brows = [];
  for (const sx of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(sx * 0.125, 0, 0);
    eye.rotation.y = sx * 0.28; // 貼著臉的弧度
    const w = new THREE.Mesh(new THREE.CircleGeometry(0.075, 20), white); w.scale.set(0.85, 1.15, 1);
    const ir = new THREE.Mesh(new THREE.CircleGeometry(0.058, 20), iris); ir.position.set(0, -0.008, 0.002); ir.scale.set(0.85, 1.1, 1);
    const pu = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), dark); pu.position.set(0, -0.01, 0.004);
    const h1 = new THREE.Mesh(new THREE.CircleGeometry(0.018, 10), shine); h1.position.set(sx * 0.018, 0.028, 0.006);
    const h2 = new THREE.Mesh(new THREE.CircleGeometry(0.009, 8), shine); h2.position.set(-sx * 0.02, -0.03, 0.006);
    const lid = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.022), dark); lid.position.set(0, 0.085, 0.003); lid.rotation.z = -sx * 0.18; // 上睫毛
    eye.add(w, ir, pu, h1, h2, lid);
    eyes.add(eye);
    const brow = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.02), new THREE.MeshBasicMaterial({ color: HAIR }));
    brow.position.set(sx * 0.13, 0.13, 0.005); brow.rotation.set(0, sx * 0.28, -sx * 0.15);
    eyes.add(brow); brows.push(brow);
    const blush = new THREE.Mesh(new THREE.CircleGeometry(0.045, 16), new THREE.MeshBasicMaterial({ color: 0xff8a9a, transparent: true, opacity: 0.45, depthWrite: false }));
    blush.position.set(sx * 0.2, -0.09, -0.02); blush.rotation.y = sx * 0.55; blush.scale.y = 0.6;
    eyes.add(blush);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), skinSmooth);
    ear.position.set(sx * 0.33, 1.62, 0); ear.scale.set(0.5, 1, 0.8);
    eyes.userData.ears = (eyes.userData.ears || []).concat(ear);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 4, 12, Math.PI), dark);
  mouth.position.set(0, -0.12, 0.012); mouth.rotation.z = Math.PI; // 微笑
  eyes.add(mouth);
  // 頭髮：頭頂 + 瀏海（一撮撮）+ 兩側鬢髮 + 後腦 + 呆毛
  const hairMat = new THREE.MeshLambertMaterial({ color: HAIR });
  const hair = new THREE.Group();
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.37, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.52), hairMat);
  cap.position.y = 1.67; cap.rotation.x = -0.18;
  // 後腦：只做頭的後半圈（phi π~2π = 背面），不會包到下巴
  const back = new THREE.Mesh(new THREE.SphereGeometry(0.37, 18, 12, Math.PI, Math.PI, Math.PI * 0.3, Math.PI * 0.42), hairMat);
  back.position.set(0, 1.62, -0.03);
  hair.add(cap, back);
  for (let i = -3; i <= 3; i++) { // 瀏海
    const strand = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.24, 6), hairMat);
    strand.position.set(i * 0.085, 1.79 - Math.abs(i) * 0.012, 0.31 - Math.abs(i) * 0.035);
    strand.rotation.set(Math.PI - 0.35, 0, i * 0.12);
    hair.add(strand);
  }
  for (const sx of [-1, 1]) { // 鬢髮
    const side = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.36, 6), hairMat);
    side.position.set(sx * 0.34, 1.52, 0.02); side.rotation.set(Math.PI, 0, -sx * 0.08);
    hair.add(side);
  }
  for (let i = 0; i < 3; i++) { // 後腦翹髮
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 6), hairMat);
    tuft.position.set((i - 1) * 0.14, 1.5, -0.3); tuft.rotation.set(Math.PI + 0.6, 0, (i - 1) * 0.3);
    hair.add(tuft);
  }
  const ahoge = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.016, 4, 10, Math.PI * 1.2), hairMat); // 呆毛
  ahoge.position.set(0.02, 2.06, 0.02); ahoge.rotation.set(0, Math.PI / 2, 0.6);
  hair.add(ahoge, ...eyes.userData.ears);
  eyes.userData.blinkT = 2 + Math.random() * 3;

  // 頭盔（換裝時才顯示）
  const helm = new THREE.Group();
  const helmShell = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), m.helm); // 比頭髮大一圈，避免穿模
  helmShell.position.y = 1.64;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.12), m.crest);
  visor.position.set(0, 1.7, 0.3);
  helm.add(helmShell, visor);
  const crests = [ // 三種頭飾造型輪替：角、冠羽、尖刺冠
    (() => {
      const g = new THREE.Group();
      for (const s of [-1, 1]) {
        const h = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.45, 6), m.crest);
        h.position.set(0.24 * s, 1.95, 0);
        h.rotation.z = -0.6 * s;
        g.add(h);
      }
      return g;
    })(),
    (() => {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.6, 6), m.crest);
      c.position.set(0, 2.05, -0.12);
      c.rotation.x = -0.5;
      return c;
    })(),
    (() => {
      const g = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const s = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.25, 4), m.crest);
        s.position.set(Math.sin(a) * 0.26, 1.98, Math.cos(a) * 0.26);
        g.add(s);
      }
      return g;
    })(),
  ];
  crests.forEach((c) => helm.add(c));

  // 肩甲
  const pads = new THREE.Group();
  for (const s of [-1, 1]) {
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), m.pad);
    pad.position.set(0.44 * s, 1.3, 0);
    pad.rotation.z = -0.4 * s;
    pads.add(pad);
  }

  // 手臂（以肩膀為軸）
  const makeArm = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.47 * side, 1.3, 0);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.5, 6), m.torso);
    arm.position.y = -0.25;
    const bracer = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.2, 6), m.bracer);
    bracer.position.y = -0.4;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), m.glove);
    hand.position.y = -0.56;
    pivot.add(arm, bracer, hand);
    return { pivot, bracer };
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);

  // 腿（以髖關節為軸）
  const makeLeg = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.17 * side, 0.45, 0);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.35, 6), m.leg);
    leg.position.y = -0.17;
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.3), m.boot);
    boot.position.set(0, -0.37, 0.04);
    pivot.add(leg, boot);
    return pivot;
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  // 披風
  const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.0), m.cape);
  cape.position.set(0, 0.85, -0.38);
  cape.rotation.x = 0.22;

  // ── 武器：三種造型都先建好，換裝時切換顯示 ──
  // 大劍：寬厚、單手持（右手）
  const sword = new THREE.Group();
  sword.position.y = -0.56;
  sword.rotation.set(1.85, 0, -0.55); // 待機時斜向外下方，不擋臉
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.35, 6), m.grip);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.12), m.guard);
  guard.position.y = 0.2;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.06), m.blade);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.5, 4), m.blade);
  tip.rotation.y = Math.PI / 4;
  tip.scale.z = 0.1;
  sword.add(grip, guard, blade, tip);
  armR.pivot.add(sword);

  // 太刀：細長、圓形刀鐔、長柄、微彎
  const katana = new THREE.Group();
  katana.position.y = -0.56;
  katana.rotation.set(1.95, 0, -0.45);
  const kGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 6), m.grip);
  kGrip.position.y = -0.08;
  const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 12), m.guard);
  tsuba.position.y = 0.19;
  const kBladeA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.025), m.blade); // 下半段
  const kBladeB = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.025), m.blade); // 上半段（往後彎）
  const kTip = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 3), m.blade);
  kTip.scale.z = 0.05;
  katana.add(kGrip, tsuba, kBladeA, kBladeB, kTip);
  armR.pivot.add(katana);

  // 星杖：長杖身 + 頂端發光星晶 + 繞著星晶轉的光環
  const staff = new THREE.Group();
  staff.position.y = -0.56;
  staff.rotation.set(1.6, 0, -0.2);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.9, 8), lam('#3a2a5a'));
  shaft.position.y = 0.35;
  const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.018, 6, 12), lam('#f5c04a', { emissive: '#f5c04a', emissiveIntensity: 0.4 }));
  wrap.position.y = 1.15; wrap.rotation.x = Math.PI / 2;
  const sMat = new THREE.MeshBasicMaterial({ color: 0x9be7ff });
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), sMat);
  crystal.position.y = 1.42; crystal.scale.set(0.8, 1.4, 0.8);
  const sGlow = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), new THREE.MeshBasicMaterial({ color: 0x9be7ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
  sGlow.position.y = 1.42;
  const sRing = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.012, 6, 32), new THREE.MeshBasicMaterial({ color: 0xffe08a }));
  sRing.position.y = 1.42;
  staff.add(shaft, wrap, crystal, sGlow, sRing);
  staff.visible = false;
  armR.pivot.add(staff);

  // 長槍：長槍桿 + 雷光槍頭 + 紅纓
  const spear = new THREE.Group();
  spear.position.y = -0.56;
  spear.rotation.set(1.6, 0, -0.15);
  const pShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.038, 2.3, 8), m.grip);
  pShaft.position.y = 0.4;
  const pRing = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.016, 6, 12), m.guard);
  pRing.position.y = 1.5; pRing.rotation.x = Math.PI / 2;
  const pHead = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 4), m.blade);
  pHead.position.y = 1.8; pHead.scale.z = 0.35;
  const pWing = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 4), m.blade); // 槍頭兩側的小刃
  pWing.position.set(0, 1.56, 0); pWing.rotation.z = Math.PI; pWing.scale.set(3.2, 1, 0.3);
  const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 6), lam('#d0263a'));
  tassel.position.y = 1.36; tassel.rotation.x = Math.PI;
  spear.add(pShaft, pRing, pHead, pWing, tassel);
  spear.visible = false;
  armR.pivot.add(spear);

  // 長弓：左手握弓（弓臂 = 一段圓環），弓弦是細線，兩端有發光風晶
  const bow = new THREE.Group();
  bow.position.y = -0.56;
  bow.rotation.set(1.5, 0, 0.1);
  const limb = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.035, 6, 28, Math.PI * 0.82), m.guard);
  limb.rotation.z = Math.PI / 2 - Math.PI * 0.41; // 弧線開口朝向身體
  limb.position.x = -0.42;
  const chord = 2 * 0.72 * Math.sin(Math.PI * 0.41);
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, chord, 4), new THREE.MeshBasicMaterial({ color: 0xeaffef }));
  string.position.x = -0.42 + 0.72 * Math.cos(Math.PI * 0.41);
  const bGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.22, 6), m.grip);
  bGrip.position.x = 0.3;
  const bGemMat = new THREE.MeshBasicMaterial({ color: 0x8affc1 });
  const gems = [-1, 1].map((sy) => { const g = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), bGemMat); g.position.set(-0.42 + 0.72 * Math.cos(Math.PI * 0.41), sy * chord / 2, 0); return g; });
  bow.add(limb, string, bGrip, ...gems);
  bow.visible = false;
  armL.pivot.add(bow);

  // 鐮刀：長柄 + 彎月刃（刃用 blade 材質，會跟著階級變色）
  const scythe = new THREE.Group();
  scythe.position.y = -0.56;
  scythe.rotation.set(1.6, 0, -0.2);
  const scShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 2.1, 8), lam('#2a2030'));
  scShaft.position.y = 0.35;
  const scBlade = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 4, 20, Math.PI * 0.62), m.blade);
  scBlade.position.set(-0.62, 1.38, 0); scBlade.rotation.z = Math.PI * 0.08; scBlade.scale.set(1, 1, 0.5);
  const scTip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 4), m.blade);
  scTip.position.set(-1.12, 1.62, 0); scTip.rotation.z = 2.2;
  const scGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), new THREE.MeshBasicMaterial({ color: 0xa66bff }));
  scGem.position.y = 1.4;
  scythe.add(scShaft, scBlade, scTip, scGem);
  scythe.visible = false;
  armR.pivot.add(scythe);

  // 拳套：兩手各一隻包到前臂的鐵拳套，拳頭前面有火焰寶石
  const makeFist = () => {
    const g = new THREE.Group();
    g.position.y = -0.5;
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.28, 8), m.guard);
    cuff.position.y = 0.12;
    const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.2), m.blade);
    knuckle.position.y = -0.06;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), new THREE.MeshBasicMaterial({ color: 0xff8a3a }));
    gem.position.set(0, -0.06, 0.11);
    g.add(cuff, knuckle, gem);
    g.visible = false;
    return g;
  };
  const fistR = makeFist(), fistL = makeFist();
  armR.pivot.add(fistR); armL.pivot.add(fistL);

  // 雙劍：兩把短刃，左右手各一
  const makeShort = () => {
    const g = new THREE.Group();
    g.position.y = -0.56;
    const gr = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 6), m.grip);
    const gd = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.08), m.guard);
    gd.position.y = 0.12;
    const bl = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.04), m.blade);
    const tp = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 4), m.blade);
    tp.rotation.y = Math.PI / 4;
    tp.scale.z = 0.08;
    g.add(gr, gd, bl, tp);
    return { g, bl, tp };
  };
  const dualR = makeShort();
  dualR.g.rotation.set(1.6, 0, -0.35);
  armR.pivot.add(dualR.g);
  const dualL = makeShort();
  dualL.g.rotation.set(1.6, 0, 0.35);
  armL.pivot.add(dualL.g);

  rig.add(torso, belt, skirt, head, eyes, hair, helm, pads, armL.pivot, armR.pivot, legL, legR, cape);

  const hero = {
    root, rig, m, helm, crests, hair, eyes, pads, armL, armR, legL, legR, cape,
    sword, blade, tip, guard,
    katana, kBladeA, kBladeB, kTip,
    staff, sMat, sGlow, sRing, crystal,
    spear, pHead, pWing, bow, bGemMat, scythe, fists: [fistR, fistL],
    dual: [dualR, dualL],
    wtype: 'great', swing: 0, swingL: 0, flip: false, hipY: 0.45,
    bodyParts: [torso, belt, skirt, head, eyes, hair, helm, pads, cape, legL, legR,
      ...[armL, armR].flatMap((a) => a.pivot.children.filter((c) => c.isMesh))],
  };
  if (opts.model !== false && heroAsset) attachModel(hero);
  applyEquipment(hero, {}, {});
  return hero;
}

/**
 * 依裝備改外觀
 * @param equipped { weapon, helm, armor, gloves, boots } → itemId
 * @param items    config.items
 */
export function applyEquipment(hero, equipped, items) {
  const m = hero.m;
  const get = (slot) => items[equipped?.[slot]];

  // 武器：種類決定造型；階級越高越長、越寬、越亮
  const w = get('weapon');
  const tier = w && w.set >= 0 ? w.set : -1;
  const wtype = w?.wtype ?? 'great';
  hero.wtype = wtype;
  hero.sword.visible = wtype === 'great';
  hero.katana.visible = wtype === 'katana';
  hero.dual.forEach((d) => { d.g.visible = wtype === 'dual'; });
  hero.staff.visible = wtype === 'staff';
  hero.spear.visible = wtype === 'spear';
  hero.bow.visible = wtype === 'bow';
  hero.scythe.visible = wtype === 'scythe';
  hero.fists.forEach((f) => { f.visible = wtype === 'fist'; });
  if (wtype === 'spear') { const k = 1 + Math.max(0, tier) * 0.06; hero.pHead.scale.set(k, k, 0.35 * k); }
  if (wtype === 'bow') hero.bGemMat.color.set(['#8affc1', '#ff9a4a', '#9be7ff', '#ffd166', '#c98cff', '#8ff3ff'][Math.max(0, tier)] ?? '#8affc1');
  if (wtype === 'staff') { // 星晶顏色跟著階級
    const c = new THREE.Color(['#9be7ff', '#9be7ff', '#9be7ff', '#ffd166', '#c98cff', '#8ff3ff'][Math.max(0, tier)] ?? '#9be7ff');
    hero.sMat.color.copy(c); hero.sGlow.material.color.copy(c);
  }

  if (wtype === 'great') {
    const len = tier < 0 ? 0.9 : 1.3 + tier * 0.08;
    const wid = tier < 0 ? 0.13 : 0.2 + tier * 0.015;
    hero.blade.scale.set(wid, len, 1);
    hero.blade.position.y = 0.24 + len / 2;
    hero.tip.scale.set(wid * 2, 0.5 * Math.max(0.6, wid * 4), 0.12);
    hero.tip.position.y = 0.24 + len + 0.1;
  } else if (wtype === 'katana') {
    const len = 1.5 + Math.max(0, tier) * 0.06;
    const wid = 0.075 + Math.max(0, tier) * 0.004;
    const half = len / 2;
    hero.kBladeA.scale.set(wid, half, 1);
    hero.kBladeA.position.set(0, 0.21 + half / 2, 0);
    hero.kBladeB.scale.set(wid, half, 1);
    hero.kBladeB.position.set(0, 0.21 + half * 1.48, -0.035);
    hero.kBladeB.rotation.x = -0.09; // 微微反彎
    hero.kTip.scale.set(wid * 2, 0.22, 0.05);
    hero.kTip.position.set(0, 0.21 + len + 0.08, -0.08);
    hero.kTip.rotation.x = -0.15;
  } else if (wtype === 'dual') {
    const len = 0.75 + Math.max(0, tier) * 0.035;
    const wid = 0.11 + Math.max(0, tier) * 0.006;
    for (const d of hero.dual) {
      d.bl.scale.set(wid, len, 1);
      d.bl.position.y = 0.15 + len / 2;
      d.tp.scale.set(wid * 2, 0.2, 0.08);
      d.tp.position.y = 0.15 + len + 0.1;
    }
  }

  const wc = setColors(tier);
  if (wc) {
    m.blade.color.copy(wc.main).lerp(new THREE.Color(0xffffff), wtype === 'katana' ? 0.55 : 0.35);
    m.blade.emissive.copy(wc.main);
    m.blade.emissiveIntensity = 0.25 + tier * 0.06;
    m.guard.color.copy(wc.accent);
  } else {
    m.blade.color.set(0x9a6b3c); // 木劍
    m.blade.emissive.set(0x000000);
    m.guard.color.set(0x5a3d22);
  }

  // 頭盔
  const h = setColors(get('helm')?.set ?? -1);
  hero.helm.visible = !!h;
  hero.hair.visible = !h;
  if (h) {
    m.helm.color.copy(h.main);
    m.crest.color.copy(h.accent);
    const idx = get('helm').set % hero.crests.length;
    hero.crests.forEach((c, i) => { c.visible = i === idx; });
  }

  // 胸甲：軀幹、肩甲、披風
  const a = setColors(get('armor')?.set ?? -1);
  hero.pads.visible = !!a;
  if (a) {
    m.torso.color.copy(a.main).lerp(a.dark, 0.3);
    m.pad.color.copy(a.accent);
    m.cape.color.copy(a.dark);
  } else {
    m.torso.color.set(CLOTH);
    m.cape.color.set(0xa3192a);
  }

  // 護手
  const g = setColors(get('gloves')?.set ?? -1);
  hero.armL.bracer.visible = hero.armR.bracer.visible = !!g;
  if (g) {
    m.glove.color.copy(g.accent);
    m.bracer.color.copy(g.main);
  } else {
    m.glove.color.set(SKIN);
  }

  // 護腿
  const b = setColors(get('boots')?.set ?? -1);
  if (b) {
    m.leg.color.copy(b.dark);
    m.boot.color.copy(b.main);
  } else {
    m.leg.color.set(0x2a2f4a);
    m.boot.color.set(LEATHER);
  }
  if (hero.skinned) hideBody(hero); // 模型角色：裝備只換武器，身體外觀固定
}

/** 出手：雙劍左右手輪流 */
export function triggerSwing(hero) {
  if (hero.wtype === 'dual' || hero.wtype === 'fist') {
    if (hero.flip) hero.swingL = 1; else hero.swing = 1;
    hero.flip = !hero.flip;
  } else {
    hero.swing = 1;
  }
}

/** 每幀動畫：走路擺手腳、依武器種類揮砍 */
export function animateHero(hero, t, dt, { moving = false, mounted = false } = {}) {
  if (mounted) moving = false; // 騎乘中：腳不走路，改成跨坐姿勢
  const speed = hero.wtype === 'dual' || hero.wtype === 'fist' ? 8 : hero.wtype === 'katana' ? 5 : 4;
  hero.swing = Math.max(0, hero.swing - dt * speed);
  hero.swingL = Math.max(0, hero.swingL - dt * speed);
  const s = Math.sin(hero.swing * Math.PI);
  const sl = Math.sin(hero.swingL * Math.PI);
  const walk = moving ? Math.sin(t * 12) : 0;
  const idleArm = moving ? walk * 0.6 : -0.15 + Math.sin(t * 2) * 0.05;

  if (hero.wtype === 'katana') {
    // 太刀：橫向居合斬，左手跟著輔助
    hero.armR.pivot.rotation.x = -0.35 - s * 1.25;
    hero.armR.pivot.rotation.z = -0.15 - s * 1.5;
    hero.armL.pivot.rotation.x = s > 0.05 ? -0.35 - s * 1.0 : idleArm;
    hero.armL.pivot.rotation.z = 0.15 + s * 0.3;
  } else if (hero.wtype === 'spear') {
    // 長槍：雙手持槍往前刺
    hero.armR.pivot.rotation.x = -0.55 - s * 1.0;
    hero.armR.pivot.rotation.z = -0.1 + s * 0.15;
    hero.armL.pivot.rotation.x = -0.75 - s * 0.7;
    hero.armL.pivot.rotation.z = 0.35;
  } else if (hero.wtype === 'scythe') {
    // 鐮刀：雙手橫掃一大圈
    hero.armR.pivot.rotation.x = -0.5 - s * 0.9;
    hero.armR.pivot.rotation.z = -0.2 - s * 1.7;
    hero.armL.pivot.rotation.x = -0.6 - s * 0.6;
    hero.armL.pivot.rotation.z = 0.3 + s * 0.4;
  } else if (hero.wtype === 'fist') {
    // 拳套：左右直拳輪流（跟雙劍一樣用兩個揮擊計時）
    hero.armR.pivot.rotation.x = (moving ? -walk * 0.3 : -0.9) - s * 0.9;
    hero.armR.pivot.rotation.z = -0.25 + s * 0.2;
    hero.armL.pivot.rotation.x = (moving ? walk * 0.3 : -0.9) - sl * 0.9;
    hero.armL.pivot.rotation.z = 0.25 - sl * 0.2;
  } else if (hero.wtype === 'bow') {
    // 長弓：左手持弓往前伸，右手拉弦（出手時往後一拉再放）
    hero.armL.pivot.rotation.x = (moving ? -0.9 : -1.2) - s * 0.3;
    hero.armL.pivot.rotation.z = 0.15;
    hero.armR.pivot.rotation.x = -1.1 - s * 0.2;
    hero.armR.pivot.rotation.z = -0.3 - s * 0.5;
  } else if (hero.wtype === 'dual') {
    // 雙劍：左右快速交錯
    hero.armR.pivot.rotation.x = (moving ? -walk * 0.4 : -0.3) - s * 1.8;
    hero.armR.pivot.rotation.z = -0.2 - s * 0.6;
    hero.armL.pivot.rotation.x = (moving ? walk * 0.4 : -0.3) - sl * 1.8;
    hero.armL.pivot.rotation.z = 0.2 + sl * 0.6;
  } else {
    // 大劍：高舉劈下
    hero.armR.pivot.rotation.x = -0.35 - s * 2.3;
    hero.armR.pivot.rotation.z = -0.15 - s * 0.4;
    hero.armL.pivot.rotation.x = idleArm;
    hero.armL.pivot.rotation.z = 0.15;
  }
  if (mounted) {
    // 跨坐：大腿往前、往外張開
    hero.legL.rotation.set(-1.25, 0, -0.5);
    hero.legR.rotation.set(-1.25, 0, 0.5);
    hero.rig.position.y = 0;
  } else {
    hero.legL.rotation.set(walk * 0.7, 0, 0);
    hero.legR.rotation.set(-walk * 0.7, 0, 0);
    hero.rig.position.y = moving ? Math.abs(Math.sin(t * 12)) * 0.08 : Math.sin(t * 2) * 0.02;
  }
  if (hero.staff?.visible) { hero.sRing.rotation.x = t * 2; hero.sRing.rotation.y = t * 1.3; hero.crystal.rotation.y = t * 1.5; hero.sGlow.scale.setScalar(1 + Math.sin(t * 4) * 0.12); }
  if (hero.eyes) { // 眨眼
    const e = hero.eyes.userData;
    e.blinkT -= dt;
    if (e.blinkT <= 0) e.blinkT = 2.5 + Math.random() * 3;
    const closing = e.blinkT < 0.12;
    for (const c of hero.eyes.children) if (c.type === 'Group') c.scale.y = closing ? 0.12 : 1;
  }
  if (hero.wings) animateWings(hero.wings, t, { moving: moving || mounted });
  if (hero.skinned) syncBones(hero);
  hero.cape.rotation.x = 0.22 + (moving ? 0.25 + Math.abs(walk) * 0.1 : Math.sin(t * 1.5) * 0.04);
}
