// ─────────────────────────────────────────────
// 職業技能：大劍 / 太刀 / 雙劍各「固定 4 招」，不能更換
// 換武器 = 換職業 = 換一整套技能
// 這裡是唯一來源：前端顯示名稱 / 圖示 / 冷卻，伺服器用 pvp 欄位判定決鬥傷害
//   pvp.mult  = 打中時造成「幾秒份」的傷害（0 = 增益技，不直接造成傷害）
//   pvp.range = 有效距離
// 實際的特效與打怪邏輯在 client/src/game3d/skills.js
//
// 平衡原則（固定技能後三職業必須一樣強）：
//   打怪：4 招平均每秒額外 ≈ 3 秒份單體傷害（大劍範圍大，略低）
//   PvP ：4 招平均每秒 ≈ 2.4 秒份傷害（太刀暴擊率高 → 倍率略低；雙劍有鬼人化加攻速）
//         星杖射程最遠（可以邊退邊打），總量壓在 ≈ 2.28
// ─────────────────────────────────────────────

export const SKILLS = {
  // ── 大劍：慢、重、範圍大 ──
  g_whirl:  { cls: 'great', name: '旋風斬', icon: '🌀', cd: 7,  desc: '原地旋轉 2 秒，持續砍周圍', pvp: { mult: 4.5, range: 6.5 } },
  g_quake:  { cls: 'great', name: '震地猛擊', icon: '🪨', cd: 8,  desc: '往前跳躍砸地，落點範圍爆炸', pvp: { mult: 5, range: 9 } },
  g_split:  { cls: 'great', name: '裂地斬', icon: '🗻', cd: 8,  desc: '向前劈出 12 公尺長的地裂', pvp: { mult: 5.5, range: 13 } },
  g_nova:   { cls: 'great', name: '天崩', icon: '💥', cd: 18, desc: '超大範圍衝擊波，震動全場', pvp: { mult: 8, range: 14 } },

  // ── 太刀：快、直線、暴擊 ──
  k_spirit: { cls: 'katana', name: '氣刃斬', icon: '🌙', cd: 5,  desc: '連續三道氣刃環斬', pvp: { mult: 3.5, range: 6.5 } },
  k_mikiri: { cls: 'katana', name: '見切', icon: '💨', cd: 8,  desc: '瞬步往前，斬過路徑上的敵人', pvp: { mult: 4, range: 10 } },
  k_iai:    { cls: 'katana', name: '居合·極', icon: '🗡️', cd: 10, desc: '蓄力 0.5 秒，放出超長一閃', pvp: { mult: 7, range: 15 } },
  k_sakura: { cls: 'katana', name: '櫻花一閃', icon: '🌸', cd: 16, desc: '六方向斬擊 + 花瓣爆散', pvp: { mult: 7.5, range: 13 } },

  // ── 雙劍：極快、貼身、連擊 ──
  d_demon:  { cls: 'dual', name: '鬼人化', icon: '👹', cd: 12, desc: '6 秒內攻速 ×2，紅色氣場', pvp: { mult: 0, range: 0 }, buff: true },
  d_shadow: { cls: 'dual', name: '影分身', icon: '👥', cd: 9,  desc: '連續瞬移斬過 4 個敵人', pvp: { mult: 6, range: 12 } },
  d_blades: { cls: 'dual', name: '迴旋刃', icon: '💫', cd: 10, desc: '雙刃繞身旋轉 3 秒', pvp: { mult: 6, range: 5 } },
  d_frenzy: { cls: 'dual', name: '鬼人亂舞', icon: '🔥', cd: 16, desc: '1.6 秒瘋狂旋斬', pvp: { mult: 10, range: 7 } },

  // ── 星杖：遠程、魔法、範圍（第四章起）──
  s_orb:    { cls: 'staff', name: '星彈連射', icon: '✨', cd: 5,  desc: '射出 5 顆追蹤星彈', pvp: { mult: 3.5, range: 12 } },
  s_meteor: { cls: 'staff', name: '隕星墜落', icon: '☄️', cd: 9,  desc: '前方降下 5 顆隕星', pvp: { mult: 5.5, range: 12 } },
  s_beam:   { cls: 'staff', name: '星河光束', icon: '🌠', cd: 11, desc: '向前持續放出 1.2 秒星光束', pvp: { mult: 6, range: 16 } },
  s_judge:  { cls: 'staff', name: '星界審判', icon: '🌌', cd: 20, desc: '巨大星陣 + 星雨 + 終焉崩落', pvp: { mult: 8.5, range: 14 } },
};

/** 每個職業的固定技能（順序 = 技能盤由下往上的位置） */
export const CLASS_SKILLS = {
  great: ['g_whirl', 'g_quake', 'g_split', 'g_nova'],
  katana: ['k_spirit', 'k_mikiri', 'k_iai', 'k_sakura'],
  dual: ['d_demon', 'd_shadow', 'd_blades', 'd_frenzy'],
  staff: ['s_orb', 's_meteor', 's_beam', 's_judge'],
};
