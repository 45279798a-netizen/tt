// ─────────────────────────────────────────────
// 夥伴：在村莊「酒館」招募、培養；平常待在酒館，帶出門就跟著你一起戰鬥
//  - 等級 1~MAX_LV：在酒館用金幣 + 精華培養，普攻和招式傷害都會成長
//  - 招式隨等級解鎖：Lv.1 貓爪亂舞 / Lv.10 流星貓拳 / Lv.20 貓神降臨（三招都是 three.quarks 特效）
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
  },
};

/** 培養到下一級的花費（金幣隨等級指數成長，跟著地圖進度走） */
export function partnerUpgradeCost(lv) {
  return { gold: Math.floor(4000 * 1.55 ** (lv - 1)), essence: Math.ceil(6 + lv * 4) };
}

/** 夥伴出戰時，伺服器防作弊上限放寬的倍率 */
export const partnerDpsBonus = (lv) => 0.6 + lv * 0.08;
