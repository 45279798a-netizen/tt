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

  // ── 長槍：中距離、直線穿刺、雷龍 ──
  sp_thrust: { cls: 'spear', name: '連環突刺', icon: '🔱', cd: 5,  desc: '向前連續 5 段突刺', pvp: { mult: 3.5, range: 9 } },
  sp_leap:   { cls: 'spear', name: '龍騰槍', icon: '🐉', cd: 8,  desc: '躍起後把槍插進地面，雷光炸裂', pvp: { mult: 5, range: 10 } },
  sp_drill:  { cls: 'spear', name: '螺旋穿雲', icon: '🌪️', cd: 10, desc: '擲出螺旋槍氣，一路往前鑽', pvp: { mult: 6, range: 14 } },
  sp_dragon: { cls: 'spear', name: '天龍破', icon: '⚡', cd: 18, desc: '喚出雷龍直線貫穿，沿路落雷', pvp: { mult: 8, range: 16 } },

  // ── 長弓：遠程、射手、風 ──
  b_multi:  { cls: 'bow', name: '扇形散射', icon: '🏹', cd: 5,  desc: '一次射出 7 支扇形箭', pvp: { mult: 3.2, range: 12 } },
  b_pierce: { cls: 'bow', name: '穿雲箭', icon: '🎯', cd: 8,  desc: '蓄力後射出貫穿一切的巨箭', pvp: { mult: 5.5, range: 20 } },
  b_rain:   { cls: 'bow', name: '箭雨', icon: '🌧️', cd: 11, desc: '前方降下 1.2 秒箭雨', pvp: { mult: 5.5, range: 13 } },
  b_storm:  { cls: 'bow', name: '千矢星落', icon: '🌠', cd: 18, desc: '巨大風陣 + 漫天星矢 + 龍捲收尾', pvp: { mult: 8, range: 14 } },

  // ── 鐮刀：中距離、大範圍、暗影（v0.4）──
  sc_reap:    { cls: 'scythe', name: '死神收割', icon: '☠️', cd: 6,  desc: '360° 暗影橫掃', pvp: { mult: 4.5, range: 6.5 } },
  sc_chain:   { cls: 'scythe', name: '冥魂鎖鏈', icon: '⛓️', cd: 9,  desc: '鎖鏈把附近的怪拉過來，再一刀斬斷', pvp: { mult: 5, range: 10 } },
  sc_tide:    { cls: 'scythe', name: '亡靈潮汐', icon: '💀', cd: 11, desc: '三波亡靈潮往前湧', pvp: { mult: 6.5, range: 14 } },
  sc_eclipse: { cls: 'scythe', name: '月蝕審判', icon: '🌘', cd: 20, desc: '黑月降臨，全場崩落', pvp: { mult: 9.5, range: 12 } },

  // ── 拳套：超近距離、極快連打、烈火（v0.4）──
  f_combo: { cls: 'fist', name: '百裂拳', icon: '👊', cd: 5,  desc: '1.2 秒內打出 10 拳', pvp: { mult: 4, range: 5 } },
  f_rise:  { cls: 'fist', name: '昇龍拳', icon: '🐲', cd: 8,  desc: '火焰昇龍上勾拳', pvp: { mult: 5, range: 5 } },
  f_wave:  { cls: 'fist', name: '烈火掌風', icon: '🔥', cd: 10, desc: '向前推出一道火焰掌風', pvp: { mult: 6, range: 11 } },
  f_burst: { cls: 'fist', name: '爆裂天拳', icon: '☄️', cd: 16, desc: '躍起從天砸下巨大火拳', pvp: { mult: 7.5, range: 9 } },
};

/** 每個職業的固定技能（順序 = 技能盤由下往上的位置） */
export const CLASS_SKILLS = {
  great: ['g_whirl', 'g_quake', 'g_split', 'g_nova'],
  katana: ['k_spirit', 'k_mikiri', 'k_iai', 'k_sakura'],
  dual: ['d_demon', 'd_shadow', 'd_blades', 'd_frenzy'],
  staff: ['s_orb', 's_meteor', 's_beam', 's_judge'],
  spear: ['sp_thrust', 'sp_leap', 'sp_drill', 'sp_dragon'],
  bow: ['b_multi', 'b_pierce', 'b_rain', 'b_storm'],
  scythe: ['sc_reap', 'sc_chain', 'sc_tide', 'sc_eclipse'],
  fist: ['f_combo', 'f_rise', 'f_wave', 'f_burst'],
};
