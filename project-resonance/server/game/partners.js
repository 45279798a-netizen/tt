// ─────────────────────────────────────────────
// 夥伴：在村莊「酒館」招募、培養；平常待在酒館，帶出門就跟著你一起戰鬥
//  - 等級 1~MAX_LV：在酒館用金幣 + 精華培養，普攻和招式傷害都會成長
//  - 招式隨等級解鎖：Lv.1 範圍招 / Lv.10 流星招 / Lv.20 大招（三招都是 three.quarks 特效）
//  - v0.6：1 位 → 5 位（米米、咕嚕、小雪、小黑、莉莉絲），要先到過指定地圖才能招募；帶出門有被動加成
//  - 傷害記在主人名下；伺服器防作弊上限會依夥伴等級放寬
// 行為與特效：client/src/game3d/partner.js
// ─────────────────────────────────────────────
export const PARTNER_MAX_LV = 30;

export const PARTNERS = {
  mimi: {
    id: 'mimi', name: '粉貓·米米', icon: '🐱', model: 'partner',
    desc: '在酒館打工的貓耳學生，聽說很會打架。培養越久越強',
    // 普攻 = 主人單體秒傷 × (base + per × (Lv-1))
    dmg: { base: 0.35, per: 0.04 },
    // 招式：mult = 幾秒份傷害（也隨等級 × (1 + Lv × 0.05)）
    skills: [
      { id: 'claw', name: '貓爪亂舞', unlock: 1, cd: 7, mult: 6, radius: 4.5, desc: '三道迴旋爪痕 + 花瓣爆散' },
      { id: 'meteor', name: '流星貓拳', unlock: 10, cd: 12, mult: 3, hits: 6, radius: 3, desc: '召喚 6 顆流星砸向附近的怪' },
      { id: 'goddess', name: '貓神降臨', unlock: 20, cd: 22, mult: 16, radius: 9, buff: 6, desc: '巨大魔法陣 + 全場衝擊，主人 6 秒攻速提升' },
    ],
    cost: { gold: 3000 },
    reqMap: 0, color: '#ff7ab8', accent: '#ffb3d1', gold: '#ffd166',
    passive: { critRate: 2 }, passiveText: '暴擊率 +2%',
  },
  // ── v0.6 新夥伴（招式 kind：area 範圍 / meteor 流星 / ult 大招＋主人攻速提升）──
  grom: {
    id: 'grom', name: '岩石巨魔·咕嚕', icon: '🗿', model: 'troll', tint: '#8a9a6a', height: 2.3,
    desc: '住在熔岩峽谷的溫和巨魔，力氣很大但動作慢一點',
    dmg: { base: 0.3, per: 0.035 },
    skills: [
      { id: 'g_slam', kind: 'area', name: '震地重拳', unlock: 1, cd: 8, mult: 7, radius: 5, desc: '雙拳砸地，周圍一圈震波' },
      { id: 'g_rocks', kind: 'meteor', name: '落石雨', unlock: 10, cd: 13, mult: 3.2, hits: 6, radius: 3.2, desc: '6 顆巨石從天而降' },
      { id: 'g_quake', kind: 'ult', name: '山崩地裂', unlock: 20, cd: 24, mult: 17, radius: 9.5, buff: 6, desc: '大地崩裂 + 全場衝擊，主人 6 秒攻速提升' },
    ],
    cost: { gold: 130_000, essence: 120 }, reqMap: 1, color: '#9acd6a', accent: '#d8c49a', gold: '#ffb340',
    passive: { hpPct: 10, defPct: 10 }, passiveText: '生命、防禦 +10%',
  },
  yuki: {
    id: 'yuki', name: '雪狐巫女·小雪', icon: '❄️', model: 'partner', tint: '#9be7ff',
    desc: '霜雪遺跡的巫女，會召喚冰晶與雪花',
    dmg: { base: 0.32, per: 0.04 },
    skills: [
      { id: 'y_bloom', kind: 'area', name: '冰花綻放', unlock: 1, cd: 7, mult: 6, radius: 4.8, desc: '冰晶花瓣迴旋爆開' },
      { id: 'y_shard', kind: 'meteor', name: '冰晶雨', unlock: 10, cd: 11, mult: 3, hits: 7, radius: 3, desc: '7 根冰柱砸向附近的怪' },
      { id: 'y_storm', kind: 'ult', name: '雪女降臨', unlock: 20, cd: 22, mult: 16, radius: 9.5, buff: 6, desc: '暴風雪席捲全場，主人 6 秒攻速提升' },
    ],
    cost: { gold: 2_900_000, essence: 300 }, reqMap: 2, color: '#6cc8ff', accent: '#e0f6ff', gold: '#ffffff',
    passive: { skillDmg: 8 }, passiveText: '技能傷害 +8%',
  },
  kuro: {
    id: 'kuro', name: '黑貓忍者·小黑', icon: '🐈‍⬛', model: 'partner', tint: '#5a4a7a',
    desc: '米米的雙胞胎妹妹，是個沉默的忍者，出手又快又準',
    dmg: { base: 0.4, per: 0.045 },
    skills: [
      { id: 'k_claw', kind: 'area', name: '影爪', unlock: 1, cd: 6, mult: 5.5, radius: 4.2, desc: '一瞬間三道紫色爪痕' },
      { id: 'k_kunai', kind: 'meteor', name: '手裡劍雨', unlock: 10, cd: 10, mult: 2.8, hits: 8, radius: 2.6, desc: '8 枚手裡劍落向附近的怪' },
      { id: 'k_clone', kind: 'ult', name: '影分身之術', unlock: 20, cd: 20, mult: 15, radius: 9, buff: 6, desc: '分身齊攻全場，主人 6 秒攻速提升' },
    ],
    cost: { gold: 64_000_000, essence: 800 }, reqMap: 3, color: '#b98cff', accent: '#e6d4ff', gold: '#ff5a7a',
    passive: { critDmg: 15 }, passiveText: '暴擊傷害 +15%',
  },
  lilith: {
    id: 'lilith', name: '血族公主·莉莉絲', icon: '🧛‍♀️', model: 'vampire', height: 1.9,
    desc: '深淵吸血鬼公爵的女兒，離家出走後在酒館當駐唱',
    dmg: { base: 0.42, per: 0.05 },
    skills: [
      { id: 'l_blade', kind: 'area', name: '血刃迴旋', unlock: 1, cd: 7, mult: 6.5, radius: 5, desc: '血色月牙繞身迴旋' },
      { id: 'l_moon', kind: 'meteor', name: '血月流星', unlock: 10, cd: 12, mult: 3.4, hits: 6, radius: 3.2, desc: '6 顆血月墜落' },
      { id: 'l_night', kind: 'ult', name: '夜之女王', unlock: 20, cd: 24, mult: 18, radius: 10, buff: 6, desc: '黑夜籠罩全場，主人 6 秒攻速提升' },
    ],
    cost: { gold: 1_400_000_000, essence: 2000 }, reqMap: 4, color: '#ff3b5c', accent: '#ffb3c0', gold: '#7a0018',
    passive: { atkPct: 8 }, passiveText: '攻擊 +8%',
  },
};

/** 帶出門的夥伴給主人的被動加成（小數） */
export function partnerPassive(p) {
  const d = p.partnerOut && p.partners?.[p.partnerOut] ? PARTNERS[p.partnerOut] : null;
  const out = {};
  for (const [k, v] of Object.entries(d?.passive || {})) out[k] = v / 100;
  return out;
}

/** 培養到下一級的花費（金幣隨等級指數成長，跟著地圖進度走） */
export function partnerUpgradeCost(lv) {
  return { gold: Math.floor(4000 * 1.55 ** (lv - 1)), essence: Math.ceil(6 + lv * 4) };
}

/** 夥伴出戰時，伺服器防作弊上限放寬的倍率 */
export const partnerDpsBonus = (lv) => 0.6 + lv * 0.08;
