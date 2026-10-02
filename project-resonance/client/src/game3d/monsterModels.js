// ─────────────────────────────────────────────
// 怪物模型（Meshy 生成、已綁骨骼、有動畫）
//   troll.glb   一般怪：藍皮巨魔，1,746 面，動畫 Walking / Running
//               每張地圖依怪物顏色「只改皮膚的色相」（腰布、毛皮、紅眼不變）→ 森林綠、熔岩紅、霜雪藍、烈陽金
//   vampire.glb 世界王：吸血鬼領主，動畫 Alert（待機）/ Walking / Dead（被打倒）/ RunFast
// 載入失敗就沿用原本程式做的怪物
// ─────────────────────────────────────────────
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

const assets = {}; // troll / vampire → { scene, clips, height }
const variants = new Map(); // 依顏色快取的皮膚貼圖

export async function loadMonsterModels() {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  await Promise.all(['troll', 'vampire', 'partner', 'wing'].map(async (name) => {
    try {
      const g = await loader.loadAsync(`/models/${name}.glb`);
      // 量身高（用第一個動畫的第一格姿勢，免得 T-pose 量錯）
      const mixer = new THREE.AnimationMixer(g.scene);
      if (g.animations[0]) mixer.clipAction(g.animations[0]).play();
      mixer.update(0);
      g.scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(g.scene);
      mixer.stopAllAction();
      g.scene.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });
      assets[name] = { scene: g.scene, clips: Object.fromEntries(g.animations.map((a) => [a.name, a])), height: box.max.y - box.min.y };
    } catch (e) {
      console.warn(`[怪物模型] ${name} 載入失敗，改用預設怪物`, e);
    }
  }));
}
export const monsterReady = (name) => !!assets[name];

/**
 * 聖羽之翼（Meshy 模型）：沒有動畫，當成一般網格用；原點在兩片翅膀中間的底部
 * 回傳 { root, pivotL, pivotR }，翅膀左右各自一個軸心可以拍動
 */
export function createWingModel(width) {
  const a = assets.wing;
  if (!a) return null;
  // 原檔是帶骨架的網格，直接拿幾何會忽略骨架的旋轉（會躺平），所以整個複製再量尺寸
  const scene = SkeletonUtils.clone(a.scene);
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const s = width / (box.max.x - box.min.x);
  scene.scale.multiplyScalar(s);
  scene.position.set(-((box.min.x + box.max.x) / 2) * s, -((box.min.y + box.max.y) / 2) * s, -((box.min.z + box.max.z) / 2) * s);
  let mat = null;
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const src = o.material;
    o.material = mat ||= new THREE.MeshLambertMaterial({ map: src.map, side: THREE.DoubleSide, alphaTest: 0.3, emissive: 0xfff4d6, emissiveIntensity: 0.15, emissiveMap: src.map });
    o.frustumCulled = false;
  });
  const root = new THREE.Group();
  root.add(scene);
  return { root, mesh: scene, mat };
}

/** 只把「藍色皮膚」的像素轉成指定色相，其他顏色不動 */
function skinVariant(baseTex, colorHex) {
  const key = colorHex;
  if (variants.has(key)) return variants.get(key);
  const img = baseTex.image;
  const w = img.width, h = img.height;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, w, h);
  const px = data.data;
  const target = {};
  new THREE.Color(colorHex).getHSL(target);
  const c = new THREE.Color();
  const hsl = {};
  for (let i = 0; i < px.length; i += 4) {
    c.setRGB(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255);
    c.getHSL(hsl);
    // 原本的皮膚是藍色（色相約 0.5~0.65），而且有一定飽和度
    if (hsl.h > 0.47 && hsl.h < 0.68 && hsl.s > 0.25) {
      c.setHSL(target.h, Math.min(1, hsl.s * (0.6 + target.s * 0.5)), hsl.l);
      px[i] = c.r * 255; px[i + 1] = c.g * 255; px[i + 2] = c.b * 255;
    }
  }
  g.putImageData(data, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = baseTex.flipY;
  tex.colorSpace = baseTex.colorSpace;
  tex.wrapS = baseTex.wrapS; tex.wrapT = baseTex.wrapT;
  variants.set(key, tex);
  return tex;
}

/**
 * 建立一隻怪（每隻有自己的骨架、動畫、材質，方便各自被打中閃白）
 * @param name   'troll' | 'vampire'
 * @param height 想要的身高（世界單位）
 * @param color  只對 troll 有效：皮膚要轉成的顏色
 */
export function createMonster(name, height, color = null) {
  const a = assets[name];
  if (!a) return null;
  const scene = SkeletonUtils.clone(a.scene);
  const s = height / a.height;
  scene.scale.multiplyScalar(s);
  const mats = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    // 換成輕量的 Lambert 材質（跟場景其他東西一樣）：同時上百隻怪，PBR + 環境反射太吃效能
    const src = o.material;
    const map = color && name === 'troll' && src.map ? skinVariant(src.map, color) : src.map;
    const m = new THREE.MeshLambertMaterial({ map, emissiveMap: map, emissive: 0x000000, side: src.side });
    o.material = m;
    mats.push(m);
  });
  const root = new THREE.Group();
  root.add(scene);
  const mixer = new THREE.AnimationMixer(scene);
  const actions = {};
  for (const [k, clip] of Object.entries(a.clips)) actions[k] = mixer.clipAction(clip);
  const inst = {
    root, mixer, actions, mats, current: null,
    /** 切換動畫（淡入淡出） */
    play(nameKey, { fade = 0.2, once = false, speed = 1 } = {}) {
      const act = actions[nameKey];
      if (!act || inst.current === act) return;
      act.reset();
      act.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      act.clampWhenFinished = once;
      act.timeScale = speed;
      act.play();
      if (inst.current) inst.current.crossFadeTo(act, fade, false);
      inst.current = act;
    },
    /** 閃白 / 菁英光 */
    setEmissive(hex) {
      for (const m of mats) if (m.emissive.getHex() !== hex) m.emissive.setHex(hex);
    },
    dispose() {
      mixer.stopAllAction();
      for (const m of mats) m.dispose();
    },
  };
  // 每隻起始動作錯開，不會整群同步踏步
  const first = name === 'vampire' ? 'Alert' : 'Walking';
  inst.play(first, { fade: 0 });
  mixer.update(Math.random() * 2);
  return inst;
}
