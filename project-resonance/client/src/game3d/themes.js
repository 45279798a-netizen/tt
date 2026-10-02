// 三張地圖的代表色（裝備圖示、素材顏色、套裝名稱顏色都用這個）
// 地形設計在 maps.js
export const THEMES = [
  { mob: '#7ed957', decoColors: ['#2f5a24', '#d8f27a'] }, // 0 翠綠森林
  { mob: '#ff6a2b', decoColors: ['#3a1a12', '#ffc04a'] }, // 1 熔岩峽谷
  { mob: '#6cc8ff', decoColors: ['#2a3f66', '#e8f6ff'] }, // 2 霜雪遺跡
  { mob: '#ffc94a', decoColors: ['#6a4a1a', '#fff1b0'] }, // 3 烈陽聖域
  { mob: '#b26cff', decoColors: ['#2a1a3a', '#e6c8ff'] }, // 4 幽影沼澤
  { mob: '#5ee7ff', decoColors: ['#14204a', '#d8f6ff'] }, // 5 星界天穹
];

// 村莊 NPC（位置要跟 maps.js 村莊的地標對齊）
export const NPCS = [
  { id: 'smith', name: '鍛造師·鐵錘', icon: '🔨', x: -9.5, z: -5, look: { weapon: 's1_weapon', helm: null, armor: 's1_armor', gloves: 's1_gloves', boots: 's1_boots' } },
  { id: 'portal', name: '傳送師·露娜', icon: '✨', x: 9, z: -5.5, look: { weapon: 's2_katana', helm: 's2_helm', armor: 's2_armor', gloves: 's2_gloves', boots: 's2_boots' } },
  { id: 'board', name: '冒險者告示板', icon: '📜', x: 0, z: -13.5, look: null },
  { id: 'tavern', name: '酒館老闆·大熊', icon: '🍺', x: -8.6, z: 5.6, look: { weapon: 's1_weapon', helm: null, armor: 's1_armor', gloves: 's1_gloves', boots: 's1_boots' } },
  { id: 'stable', name: '馬廄·阿蹄', icon: '🐎', x: 9.5, z: 4.5, look: { weapon: 's0_katana', helm: null, armor: 's0_armor', gloves: 's0_gloves', boots: 's0_boots' } },
];
