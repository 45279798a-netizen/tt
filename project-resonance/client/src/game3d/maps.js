// ─────────────────────────────────────────────
// 地圖設計資料：3 張狩獵地圖 + 村莊
// 座標：x 往右、z 往下（畫面下方 = 南），地圖中心 (0,0)
// 想改地形、移動營地、加橋，都只要改這個檔案
//
//  R         可走範圍半徑（正方形 -R ~ R）
//  spawn     進地圖的出生點        arena  決鬥場（中心、半徑）
//  hills     山丘 / 窪地 { x, z, r, h }
//  paths     小路（地面換顏色）{ pts, w }
//  rivers    河流 / 熔岩河 { pts, w, kind: 'water' | 'lava' }（不能走，要過橋）
//  lakes     湖 { x, z, r, kind }
//  bridges   橋：{ river, at: 0~1 沿河位置 } 或 { x, z, angle, len }
//  camps     怪物營地 { x, z, r, n 數量, elite 菁英營 }
//  scatter   散佈的裝飾 { type, n, band:[內,外] 只放在邊緣帶, collide 碰撞半徑 }
//  landmarks 地標 { type, x, z, s 大小, collide }
// ─────────────────────────────────────────────

export const MAP_DEFS = {
  // ── 第 1 區：翠綠森林 ─────────────────────
  0: {
    name: '翠綠森林',
    R: 48,
    sky: '#9fd3e6', fog: ['#b9e0c8', 30, 70],
    hemi: ['#f4fff0', '#3d5a2a', 1.4], sun: ['#fff4d6', 1.8],
    ground: { a: '#4f8a35', b: '#68a043', c: '#3e6f2a', path: '#a98a5a', bank: '#7a6a42', edge: '#2f5a24' },
    edgeRise: 0.18,
    spawn: { x: 0, z: 38 },
    arena: { x: 0, z: 18, r: 12 },
    hills: [
      { x: -34, z: 26, r: 12, h: 2.2 }, { x: 36, z: 32, r: 10, h: 1.8 },
      { x: -32, z: -34, r: 14, h: 2.6 }, { x: 34, z: -32, r: 12, h: 2.0 },
      { x: 0, z: -42, r: 9, h: 1.4 },
    ],
    paths: [
      { pts: [[0, 56], [0, 30], [0, 18]], w: 4 },
      { pts: [[0, 18], [-10, 10], [-21, 3]], w: 3 },
      { pts: [[0, 18], [10, 8], [19, -1]], w: 3 },
      { pts: [[-22, -12], [-24, -26], [-12, -36], [0, -40]], w: 3 },
      { pts: [[20, -16], [26, -28], [12, -38], [0, -40]], w: 3 },
    ],
    rivers: [{ pts: [[-64, -4], [-40, 2], [-20, -6], [0, -2], [20, -10], [40, -4], [64, -10]], w: 7, kind: 'water' }],
    bridges: [{ river: 0, at: 0.34, style: 'wood' }, { river: 0, at: 0.66, style: 'wood' }],
    camps: [
      { x: -26, z: 22, r: 8, n: 7 }, { x: 26, z: 24, r: 8, n: 7 },
      { x: -26, z: -24, r: 9, n: 9 }, { x: 26, z: -26, r: 9, n: 9 },
      { x: 0, z: -40, r: 6, n: 5, elite: true },
      { x: -10, z: -20, r: 6, n: 7 }, { x: 10, z: -21, r: 6, n: 7 },
    ],
    scatter: [
      { type: 'tree', n: 170, band: [42, 70], collide: 1.1 },
      { type: 'tree', n: 26, collide: 1.1 },
      { type: 'rock', n: 26, collide: 0.9 },
      { type: 'bush', n: 70 },
      { type: 'mushroom', n: 22, collide: 0.4 },
      { type: 'grass', n: 420 },
      { type: 'flower', n: 160 },
    ],
    landmarks: [
      { type: 'giantTree', x: -38, z: 6, s: 1, collide: 4 },
      { type: 'mushroomRing', x: 36, z: 6, s: 1, collide: 0 },
      { type: 'stoneArch', x: 0, z: -48, s: 1, collide: 0 },
    ],
    ambient: 'fireflies',
    mob: { shape: 'slime', color: '#7ed957' },
  },

  // ── 第 2 區：熔岩峽谷 ─────────────────────
  1: {
    name: '熔岩峽谷',
    R: 48,
    sky: '#2a0f0b', fog: ['#4a1a10', 28, 66],
    hemi: ['#ffb08a', '#2a0a06', 1.2], sun: ['#ff9a5a', 1.5],
    ground: { a: '#3a2a26', b: '#4a3530', c: '#2a1f1c', path: '#6a5048', bank: '#ff5a1f', edge: '#1a1210' },
    edgeRise: 0.45,
    spawn: { x: -24, z: 40 },
    arena: { x: -24, z: 6, r: 11 },
    hills: [
      { x: 30, z: 0, r: 10, h: 3 }, { x: -36, z: -30, r: 10, h: 2.6 },
      { x: 34, z: 36, r: 9, h: 2.2 }, { x: -38, z: 24, r: 7, h: 2 },
    ],
    paths: [
      { pts: [[-24, 56], [-24, 40], [-24, 6]], w: 4 },
      { pts: [[-24, 6], [-14, -6], [-8, -18]], w: 3 },
      { pts: [[-24, 6], [-14, 20], [-6, 26]], w: 3 },
      { pts: [[6, -22], [24, -24]], w: 3 },
      { pts: [[6, 26], [24, 22]], w: 3 },
    ],
    rivers: [{ pts: [[6, -64], [-4, -38], [7, -12], [-4, 12], [5, 38], [-3, 64]], w: 7, kind: 'lava' }],
    bridges: [{ river: 0, at: 0.36, style: 'stone' }, { river: 0, at: 0.67, style: 'stone' }],
    camps: [
      { x: -26, z: -22, r: 8, n: 8 }, { x: -30, z: 24, r: 6, n: 6 },
      { x: 24, z: -24, r: 9, n: 9 }, { x: 24, z: 20, r: 9, n: 9 },
      { x: 18, z: -42, r: 6, n: 5, elite: true },
      { x: 36, z: -4, r: 6, n: 7 }, { x: -14, z: -36, r: 6, n: 7 },
    ],
    scatter: [
      { type: 'basalt', n: 120, band: [40, 70], collide: 1.2 },
      { type: 'basalt', n: 18, collide: 1.2 },
      { type: 'rock', n: 30, collide: 1 },
      { type: 'obsidian', n: 30, collide: 0.6 },
      { type: 'deadTree', n: 18, collide: 0.5 },
      { type: 'vent', n: 45 },
      { type: 'ash', n: 260 },
    ],
    landmarks: [
      { type: 'volcano', x: 0, z: -92, s: 1, collide: 0 },
      { type: 'spire', x: -38, z: -6, s: 1, collide: 3 },
      { type: 'skull', x: 38, z: 8, s: 1, collide: 4 },
    ],
    ambient: 'embers',
    mob: { shape: 'beetle', color: '#ff6a2b' },
  },

  // ── 第 3 區：霜雪遺跡 ─────────────────────
  2: {
    name: '霜雪遺跡',
    R: 48,
    sky: '#cfe4f2', fog: ['#e6f1f8', 28, 68],
    hemi: ['#ffffff', '#8aa0b4', 1.5], sun: ['#ffffff', 1.4],
    ground: { a: '#d6e2ec', b: '#f2f7fc', c: '#9fb6ca', path: '#8e9aa6', bank: '#7fb2d4', edge: '#a6bccd' },
    edgeRise: 0.25,
    spawn: { x: 0, z: 40 },
    arena: { x: 0, z: 23, r: 11 },
    hills: [
      { x: -34, z: -30, r: 12, h: 2.4 }, { x: 34, z: -34, r: 12, h: 2.4 },
      { x: -36, z: 30, r: 10, h: 1.8 }, { x: 36, z: 30, r: 10, h: 1.8 },
    ],
    paths: [
      { pts: [[0, 56], [0, 40], [0, 23]], w: 4 },
      { pts: [[-22, -6], [-30, -24]], w: 3 },
      { pts: [[22, -6], [30, -26]], w: 3 },
      { pts: [[0, 12], [-22, 22]], w: 3 },
      { pts: [[0, 12], [24, 20]], w: 3 },
    ],
    rivers: [{ pts: [[12, -6], [30, -14], [64, -10]], w: 5, kind: 'water' }],
    lakes: [{ x: 0, z: -6, r: 13, kind: 'water' }],
    bridges: [
      { x: 0, z: -6, angle: 0, len: 32, style: 'stone' },
      { river: 0, at: 0.42, style: 'stone' },
    ],
    camps: [
      { x: -28, z: -24, r: 9, n: 9 }, { x: 30, z: -30, r: 9, n: 9 },
      { x: -28, z: 24, r: 8, n: 7 }, { x: 28, z: 22, r: 8, n: 7 },
      { x: 0, z: -40, r: 6, n: 5, elite: true },
      { x: -40, z: -6, r: 6, n: 7 }, { x: 20, z: -44, r: 6, n: 7 },
    ],
    scatter: [
      { type: 'pine', n: 170, band: [42, 70], collide: 1.1 },
      { type: 'pine', n: 22, collide: 1.1 },
      { type: 'iceCrystal', n: 32, collide: 0.6 },
      { type: 'snowRock', n: 26, collide: 0.9 },
      { type: 'snowMound', n: 60 },
    ],
    landmarks: [
      { type: 'pillarRing', x: 0, z: -6, s: 1, collide: 0 },
      { type: 'frozenStatue', x: 0, z: -47, s: 1, collide: 3.5 },
      { type: 'ruinGate', x: -34, z: 6, s: 1, collide: 0 },
      { type: 'ruinWall', x: 34, z: 8, s: 1, collide: 0 },
    ],
    ambient: 'snow',
    mob: { shape: 'spirit', color: '#6cc8ff' },
  },

  // ── 第 4 區：烈陽聖域（沙漠中的太陽神殿遺跡） ─────
  3: {
    name: '烈陽聖域',
    R: 48,
    sky: '#f2cf8f', fog: ['#f3d9a6', 30, 72],
    hemi: ['#fff3d6', '#8a6a3a', 1.5], sun: ['#fff0c8', 1.9],
    ground: { a: '#e2c58f', b: '#ecd3a0', c: '#cfae72', path: '#b8935a', bank: '#d9c08a', edge: '#c9a46a' },
    edgeRise: 0.35,
    spawn: { x: 0, z: 40 },
    arena: { x: 0, z: 20, r: 11 },
    hills: [
      { x: -34, z: -30, r: 13, h: 2.6 }, { x: 34, z: -32, r: 12, h: 2.2 },
      { x: -38, z: 30, r: 10, h: 2 }, { x: 38, z: 30, r: 10, h: 1.8 }, { x: 20, z: 6, r: 8, h: 1.2 },
    ],
    paths: [
      { pts: [[0, 56], [0, 40], [0, 20]], w: 4 },
      { pts: [[0, 20], [0, -10], [0, -40]], w: 3.5 },
      { pts: [[0, 0], [-24, -20]], w: 3 },
      { pts: [[0, 0], [26, -22]], w: 3 },
    ],
    rivers: [],
    lakes: [{ x: -28, z: 2, r: 8, kind: 'water' }], // 綠洲
    bridges: [],
    camps: [
      { x: -26, z: -24, r: 9, n: 9 }, { x: 28, z: -26, r: 9, n: 9 },
      { x: -24, z: 26, r: 8, n: 7 }, { x: 26, z: 24, r: 8, n: 7 },
      { x: 14, z: -8, r: 6, n: 7 }, { x: -12, z: -36, r: 6, n: 7 },
      { x: 0, z: -42, r: 6, n: 5, elite: true },
    ],
    scatter: [
      { type: 'rock', n: 140, band: [42, 70], collide: 1.1 },
      { type: 'rock', n: 26, collide: 0.9 },
      { type: 'deadTree', n: 22, collide: 0.5 },
      { type: 'bush', n: 26 },
    ],
    landmarks: [
      { type: 'stoneArch', x: 0, z: -50, s: 1.3, collide: 0 },
      { type: 'pillarRing', x: 30, z: 4, s: 1, collide: 0 },
      { type: 'ruinGate', x: -38, z: -8, s: 1, collide: 0 },
      { type: 'ruinWall', x: 38, z: 12, s: 1, collide: 0 },
    ],
    ambient: 'sunmotes',
    mob: { shape: 'sentinel', color: '#ffc94a' },
  },

  // ── 第 5 區：幽影沼澤（紫霧籠罩的腐沼，巨菇與枯木） ─────
  4: {
    name: '幽影沼澤',
    R: 48,
    sky: '#2a1f3d', fog: ['#3a2a52', 26, 64],
    hemi: ['#c9b6ff', '#2a2036', 1.3], sun: ['#e0c8ff', 1.4],
    ground: { a: '#3e4a34', b: '#4a5538', c: '#353f2c', path: '#5a4a3a', bank: '#3a3a2a', edge: '#2e3826' },
    edgeRise: 0.3,
    spawn: { x: 0, z: 40 },
    arena: { x: 0, z: 20, r: 11 },
    hills: [{ x: -30, z: -28, r: 12, h: 1.6 }, { x: 32, z: -30, r: 11, h: 1.4 }, { x: -36, z: 26, r: 10, h: 1.2 }, { x: 36, z: 28, r: 10, h: 1.2 }],
    paths: [{ pts: [[0, 56], [0, 20]], w: 4 }, { pts: [[0, 20], [-6, -10], [0, -40]], w: 3.2 }, { pts: [[-6, -10], [28, -24]], w: 3 }],
    rivers: [{ pts: [[-64, -4], [-30, 2], [-10, -2], [10, 4], [30, -2], [64, 2]], w: 5, kind: 'water' }],
    lakes: [{ x: 26, z: 10, r: 7, kind: 'water' }, { x: -26, z: -14, r: 6, kind: 'water' }],
    bridges: [{ river: 0, at: 0.48 }],
    camps: [
      { x: -26, z: -26, r: 9, n: 9 }, { x: 28, z: -28, r: 9, n: 9 },
      { x: -24, z: 24, r: 8, n: 7 }, { x: 26, z: 26, r: 8, n: 7 },
      { x: 12, z: -14, r: 6, n: 7 }, { x: -14, z: -38, r: 6, n: 7 },
      { x: 0, z: -42, r: 6, n: 5, elite: true },
    ],
    scatter: [
      { type: 'deadTree', n: 150, band: [42, 70], collide: 0.9 },
      { type: 'mushroom', n: 30, collide: 0.6 },
      { type: 'deadTree', n: 26, collide: 0.5 },
      { type: 'bush', n: 40 },
      { type: 'rock', n: 18, collide: 0.8 },
    ],
    landmarks: [
      { type: 'ruinGate', x: 0, z: -50, s: 1.2, collide: 0 },
      { type: 'pillarRing', x: -34, z: 6, s: 1, collide: 0 },
      { type: 'spire', x: 38, z: -8, s: 1, collide: 3 },
    ],
    ambient: 'spores',
    mob: { shape: 'slime', color: '#b26cff' },
  },

  // ── 第 6 區：星界天穹（漂浮在星空中的水晶平台） ─────
  5: {
    name: '星界天穹',
    R: 48,
    sky: '#0b1030', fog: ['#16205a', 30, 72],
    hemi: ['#bfe9ff', '#1a1a4a', 1.4], sun: ['#e8f6ff', 1.6],
    ground: { a: '#2e3a6e', b: '#36458a', c: '#283466', path: '#6a7ad0', bank: '#3a4a8a', edge: '#1e2650' },
    edgeRise: 0.5,
    spawn: { x: 0, z: 40 },
    arena: { x: 0, z: 20, r: 11 },
    hills: [{ x: -32, z: -30, r: 12, h: 2.4 }, { x: 34, z: -28, r: 12, h: 2.2 }, { x: -36, z: 28, r: 10, h: 1.8 }, { x: 36, z: 26, r: 10, h: 1.8 }],
    paths: [{ pts: [[0, 56], [0, 20]], w: 4 }, { pts: [[0, 20], [0, -42]], w: 3.4 }, { pts: [[0, -4], [-28, -22]], w: 3 }, { pts: [[0, -4], [28, -22]], w: 3 }],
    rivers: [],
    lakes: [{ x: -24, z: 4, r: 7, kind: 'water' }, { x: 26, z: 4, r: 7, kind: 'water' }],
    bridges: [],
    camps: [
      { x: -26, z: -26, r: 9, n: 9 }, { x: 28, z: -26, r: 9, n: 9 },
      { x: -26, z: 26, r: 8, n: 7 }, { x: 26, z: 26, r: 8, n: 7 },
      { x: -12, z: -12, r: 6, n: 7 }, { x: 14, z: -38, r: 6, n: 7 },
      { x: 0, z: -44, r: 6, n: 5, elite: true },
    ],
    scatter: [
      { type: 'iceCrystal', n: 150, band: [42, 70], collide: 1 },
      { type: 'iceCrystal', n: 30, collide: 0.8 },
      { type: 'obsidian', n: 24, collide: 0.7 },
      { type: 'snowRock', n: 16, collide: 0.9 },
    ],
    landmarks: [
      { type: 'stoneArch', x: 0, z: -52, s: 1.4, collide: 0 },
      { type: 'pillarRing', x: 36, z: 6, s: 1.1, collide: 0 },
      { type: 'pillarRing', x: -36, z: -6, s: 1, collide: 0 },
    ],
    ambient: 'stardust',
    mob: { shape: 'spirit', color: '#5ee7ff' },
  },

  // ── 緣起村（和平區） ──────────────────────
  // ── 莊園（每個人自己的，peaceful）─────────────
  manor: {
    name: '莊園',
    R: 26,
    sky: '#bfe3f7', fog: ['#d8eef8', 34, 72],
    hemi: ['#ffffff', '#6b6355', 1.5], sun: ['#fff1d6', 1.7],
    ground: { a: '#6aaa48', b: '#78b852', c: '#5c9a40', path: '#c9b98a', bank: '#7a6a42', edge: '#4a7a32' },
    edgeRise: 0.25,
    spawn: { x: 0, z: 17 },
    arena: null,
    hills: [],
    paths: [{ pts: [[0, 30], [0, -16]], w: 3 }, { pts: [[-16, -4], [16, -4]], w: 2 }, { pts: [[-16, 4], [16, 4]], w: 2 }],
    rivers: [], bridges: [], lakes: [], camps: [],
    scatter: [{ type: 'tree', n: 70, band: [22, 40], collide: 1 }, { type: 'flower', n: 50, band: [17, 24] }, { type: 'grass', n: 80 }],
    landmarks: [{ type: 'tavern', x: 0, z: -19, s: 1.1, rot: 0, collide: 3 }],
    ambient: 'fireflies',
    mob: { shape: 'slime', color: '#7ed957' },
  },

  town: {
    name: '緣起村',
    R: 30,
    town: true,
    sky: '#a9d6f5', fog: ['#cfe6f5', 34, 70],
    hemi: ['#ffffff', '#6b6355', 1.5], sun: ['#fff1d6', 1.7],
    ground: { a: '#5e9a3e', b: '#6fae48', c: '#4f8a35', path: '#b9b2a2', bank: '#7a6a42', edge: '#3e6f2a' },
    edgeRise: 0.2,
    spawn: { x: 0, z: 10 },
    arena: null,
    plaza: { x: 0, z: -2, r: 11, color: '#c4bcab' },
    hills: [{ x: -24, z: -24, r: 8, h: 1.5 }, { x: 24, z: 24, r: 8, h: 1.2 }],
    paths: [
      { pts: [[0, 40], [0, -40]], w: 5 },
      { pts: [[-40, -2], [40, -2]], w: 5 },
    ],
    rivers: [],
    bridges: [],
    camps: [],
    scatter: [
      { type: 'tree', n: 70, band: [27, 50], collide: 1.1 },
      { type: 'bush', n: 30 },
      { type: 'flower', n: 140 },
      { type: 'grass', n: 200 },
    ],
    landmarks: [
      { type: 'fountain', x: 0, z: -2, s: 1, collide: 3.4 },
      { type: 'forge', x: -12.5, z: -8, s: 1, collide: 2.4 },
      { type: 'portal', x: 12, z: -8, s: 1, collide: 1.6 },
      { type: 'board', x: 0, z: -15.5, s: 1, collide: 1.2 },
      { type: 'stable', x: 12.5, z: 7, s: 1, rot: -0.6, collide: 2.2 },
      { type: 'tavern', x: -13, z: 7.5, s: 1, rot: 0.6, collide: 2.6 },
      { type: 'house', x: -18, z: -18, s: 1, rot: 0.2, collide: 3.4 },
      { type: 'house', x: -19, z: 9, s: 1.1, rot: -0.1, collide: 3.6 },
      { type: 'house', x: 18, z: 10, s: 1, rot: 0.15, collide: 3.4 },
      { type: 'house', x: 19, z: -18, s: 1.15, rot: -0.2, collide: 3.7 },
      { type: 'house', x: -9, z: 20, s: 0.9, rot: 0.05, collide: 3 },
      { type: 'house', x: 10, z: 21, s: 0.95, rot: -0.1, collide: 3 },
      { type: 'lamp', x: 4, z: 8, s: 1, collide: 0.3 }, { type: 'lamp', x: -4, z: 8, s: 1, collide: 0.3 },
      { type: 'lamp', x: 4, z: -12, s: 1, collide: 0.3 }, { type: 'lamp', x: -4, z: -12, s: 1, collide: 0.3 },
      { type: 'lamp', x: 13, z: 2, s: 1, collide: 0.3 }, { type: 'lamp', x: -13, z: 2, s: 1, collide: 0.3 },
      { type: 'well', x: -22, z: -3, s: 1, collide: 1.3 },
      { type: 'fence', x: 0, z: 0, s: 1, collide: 0 },
    ],
    ambient: null,
    mob: { shape: 'slime', color: '#ffffff' },
  },
};

// ─────────────────────────────────────────────
// 地圖放大：上面的設計圖用「原始尺寸」寫，這裡統一放大 MAP_SCALE 倍
// 位置、範圍都放大；寬度（河、路、橋寬）、地標大小不變；裝飾數量依面積增加；營地怪物數 ×CAMP_MOBS
// 想調地圖大小或怪物密度改這兩個數字就好
// ─────────────────────────────────────────────
export const MAP_SCALE = 1.45;
export const CAMP_MOBS = 1.7;

function scaleMap(def, k) {
  const pt = ([x, z]) => [x * k, z * k];
  const xz = (o) => ({ ...o, x: o.x * k, z: o.z * k });
  return {
    ...def,
    R: def.R * k,
    spawn: xz(def.spawn),
    arena: def.arena && xz(def.arena),
    hills: (def.hills || []).map((h) => ({ ...xz(h), r: h.r * k })),
    paths: (def.paths || []).map((p) => ({ ...p, pts: p.pts.map(pt) })),
    rivers: (def.rivers || []).map((r) => ({ ...r, pts: r.pts.map(pt) })),
    lakes: (def.lakes || []).map((l) => ({ ...xz(l), r: l.r * k })),
    bridges: (def.bridges || []).map((b) => (b.river != null ? b : { ...xz(b), len: b.len * k })),
    camps: (def.camps || []).map((c) => ({ ...xz(c), r: c.r * Math.sqrt(k) * 1.1, n: Math.round(c.n * CAMP_MOBS) })),
    scatter: (def.scatter || []).map((sc) => ({ ...sc, n: Math.round(sc.n * k * k), band: sc.band && sc.band.map((v) => v * k) })),
    landmarks: (def.landmarks || []).map(xz),
  };
}
for (const id of [0, 1, 2, 3, 4, 5]) MAP_DEFS[id] = scaleMap(MAP_DEFS[id], MAP_SCALE);
