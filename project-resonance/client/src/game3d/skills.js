// ─────────────────────────────────────────────
// 職業技能的「演出 + 打怪」實作（名稱 / 冷卻 / PvP 數值在伺服器 skills.js）
// S = BattleScene，a = 出招的角色（自己或朋友），b = 每秒傷害
//
// 傷害倍率（b × N）是平衡過的，改特效時不要動到：
//   大劍 旋風斬 5.6 / 震地 6 / 裂地 6 / 天崩 12
//   太刀 氣刃 4.2 / 見切 5 / 居合 8 / 櫻花 線 2×6 + 範圍 9
//   雙劍 鬼人化 攻速×2 / 影分身 3×4 / 迴旋刃 12 / 亂舞 16
//   星杖 星彈 3.6×5 / 隕星 3.2×5 / 光束 1.5×6 / 審判 星雨 2×10 + 崩落 10
//   長槍 突刺 0.9×5 / 龍騰 6 / 螺旋 1.5×4 / 天龍 8 + 落雷 1.5×6 + 雷爆 4（≈ 3.0）
//   鐮刀 收割 4.5 / 鎖鏈 6 / 亡靈潮 2.5×3 / 月蝕 14（範圍大，≈ 2.8）
//   v0.5 新招（每招 ≈ 0.6~0.75 秒份 / 秒，跟原本 4 招互換時平衡）：
//   衝鋒斬 5/7、劍刃風暴 1.66×6/14、新月斬 5/7、千本櫻 1.2×12 + 6/15、毒刃 +40% 6 秒、十字斬 2.5×2/7
//   星爆 5.5/8、重力井 1.5×5 + 3/14、橫掃 4.8/7、雷槍雨 2×8 散落/12、狙擊 7/9（單體）、陷阱 6.5/10
//   靈魂收割 6/10、冥界之門 1.6×6/16、迅雷步 4/6、鬥氣爆發 攻速×2 6 秒 + 3/18
//   拳套 百裂 0.45×10 / 昇龍 6 / 掌風 6 / 天拳 12（貼身，≈ 3.0）
//   長弓 散射 1.8×7 扇形 / 穿雲 7 / 箭雨 1.4×12 + 風爆 3.5 / 千矢 1×30 + 龍捲 8（遠程 ≈ 2.6）
// 平衡調整（每秒對「一隻怪」的額外傷害，單位 = 秒份）：
//   大劍 ≈ 2.97、太刀 ≈ 2.95、雙劍 ≈ 3.0（原本影分身每隻只吃 1.6，≈ 2.85）
//   星杖 ≈ 2.65（原本 ≈ 2.27 明顯最弱；遠程比近戰安全，所以留一點差距）
// 特效工具（_crescent 月牙、_wall 衝擊波、_glowFlash 光暈、_sparks 火花…）在 BattleScene.js
// ─────────────────────────────────────────────
import { triggerSwing } from './heroModel.js';

const rand = (x, y) => x + Math.random() * (y - x);
const at = (p) => ({ x: p.x, z: p.z }); // 複製位置（延遲的特效不要跟著角色跑）
const ahead = (p, ang, d) => ({ x: p.x + Math.sin(ang) * d, z: p.z + Math.cos(ang) * d });

/** 往前跳 / 瞬移（只有自己會真的移動，朋友的位置由網路同步） */
function moveForward(S, a, d) {
  const p = a.group.position;
  const x = p.x + Math.sin(a.facing) * d, z = p.z + Math.cos(a.facing) * d;
  if (a.local) S.moveLocalTo(x, z);
  return { x: a.local ? p.x : x, z: a.local ? p.z : z };
}

export function castSkillFx(S, a, id) {
  const pos = a.group.position;
  const b = S._dps(a) * (a.skillMul || 1); // 轉職：技能傷害加成
  const local = a.local;
  const f = a.facing;
  const Q = S.qfx; // three.quarks 特效庫（quarksFx.js）

  switch (id) {
    // ══ 大劍：厚重、大範圍、地面破壞 ═══════════════
    case 'g_whirl': { // 旋風斬：腳下颶風魔法陣 + 氣流牆，之後每 0.25 秒的刀光在 BattleScene
      a.whirlTime = 2.0; a.whirlTick = 0;
      Q.rune(pos, 5, 0x7dd3fc, 2.2, 4);
      Q.flash(pos, 3.5, 0x9fdcff, 0.3, 1);
      Q.wall(pos, 1, 5, 1.4, 0x7dd3fc, 0.45);
      Q.sparks(pos, 14, 0xbfe6ff, 9, 0.5);
      Q.smoke(pos, 6, 0xcfe8ff, 2.2, 0.9, 2.5);
      Q.vortex(pos, 3.2, 0xbfe6ff, 2, { n: 60, rise: 3, spin: 10, follow: a }); // 颶風氣旋
      if (local) S.vib(20);
      break;
    }
    case 'g_quake': { // 震地猛擊：躍起 → 砸地：光源、衝擊波、放射地裂、岩刺、碎石、塵土
      a.leapT = 0.35;
      Q.sparks(pos, 8, 0xd9a066, 4, 0.4, { y: 0.2 });
      Q.smoke(pos, 4, 0xb9a58a, 1.8, 0.6, 0.8);
      const land = moveForward(S, a, 5);
      S._later(0.3, () => {
        triggerSwing(a.hero);
        Q.flash(land, 6, 0xffc070, 0.45, 0.6);
        Q.light(land, 0xffa040, 55, 0.5, 20, 1);
        Q.crack(land, 6.5, 0xff8a2a, 1.6);
        Q.shock(land, 7, 0xffd08a, 0.5);
        Q.wall(land, 0.5, 6.5, 1.6, 0xd9a066, 0.5);
        for (let i = 0; i < 6; i++) S._fissure(land, (i / 6) * Math.PI * 2 + rand(-0.2, 0.2), 4, 0xff9a3a, { step: 1.1, delay: 0.02, spikes: false });
        for (let i = 0; i < 7; i++) Q.spike(ahead(land, (i / 7) * Math.PI * 2, rand(2.6, 3.6)), 0x6b5a4a, 0.8, rand(0.85, 1.25));
        Q.debris(land, 0x8b6b4a, 16, 9);
        Q.embers(land, 14, 0xff9a3a, 3, 1.6);
        S._damageArea(a, land, 6, b * 6);
        if (local) { S.shake = Math.max(S.shake, 0.45); S.vib(40); }
      });
      break;
    }
    case 'g_split': { // 裂地斬：重劈 → 熔光地縫一路裂向前方，盡頭爆開
      triggerSwing(a.hero);
      const o = at(pos);
      S._lineSlash(a, o, f, 12, 3, b * 6, 0xffb347, 0.35);
      Q.crescent(o, f, 4.2, 0xffb347, 0.28, { arc: 2.4, sweep: 0.9, tilt: -1.2 });
      Q.flash(ahead(o, f, 1.5), 3, 0xffc070, 0.25, 0.6);
      S._fissure(o, f, 12.5, 0xff8a2a, { step: 1.1, delay: 0.022 });
      S._later(0.28, () => {
        const end = ahead(o, f, 12);
        Q.flash(end, 4.5, 0xffb347, 0.4, 0.5);
        Q.shock(end, 3.5, 0xffd08a, 0.4);
        Q.debris(end, 0x8b6b4a, 8, 7);
      });
      if (local) S.shake = Math.max(S.shake, 0.28);
      break;
    }
    case 'g_nova': { // 天崩：魔法陣展開 + 蓄力聚光 → 光柱 → 全場雙層衝擊波、岩刺林立
      const o = at(pos);
      Q.rune(o, 6, 0xffb347, 0.9, 2.5);
      Q.rune(o, 3.5, 0xffffff, 0.9, -4);
      Q.converge(o, 34, 0xffd08a, 4.5, 0.35, 1);
      Q.flash(o, 2.5, 0xffb347, 0.4, 1.2);
      Q.beam(o, 1.3, 15, 0xffb347, 0.7);
      if (local) S.vib([10, 20, 10]);
      S._later(0.35, () => {
        const c = at(a.group.position);
        Q.flash(c, 14, 0xffc070, 0.6, 1);
        Q.light(c, 0xffb347, 70, 0.8, 30, 2);
        Q.crack(c, 12, 0xff8a2a, 2);
        Q.shock(c, 15, 0xffd08a, 0.7);
        Q.shock(c, 10, 0xffffff, 0.45);
        Q.wall(c, 0.5, 14, 2.4, 0xffb347, 0.7);
        for (let i = 0; i < 14; i++) Q.spike(ahead(c, (i / 14) * Math.PI * 2 + rand(-0.2, 0.2), rand(5, 11)), 0x6b5a4a, 1, rand(1, 1.5));
        Q.sparks(c, 36, 0xffd08a, 15, 0.8, { up: 1.3 });
        Q.embers(c, 30, 0xff9a3a, 8, 2);
        Q.smoke(c, 10, 0xb9a58a, 4, 1.4, 6);
        S._damageArea(a, c, 13, b * 12);
        if (local) { S._bigImpact(); S._screenFlash('255,190,110'); }
      });
      break;
    }

    // ══ 太刀：銳利、直線、一閃 ═══════════════════
    case 'k_spirit': { // 氣刃斬：三道角度不同的月牙環斬，最後一刀白光
      Q.rune(pos, 3, 0x7dd3fc, 0.6, 5);
      [0, 2.1, -2.1].forEach((off, i) => S._later(i * 0.15, () => {
        triggerSwing(a.hero);
        Q.crescent(pos, a.facing + off, 5.5, i === 2 ? 0xffffff : 0x7dd3fc, 0.24, { arc: 3.2, sweep: i % 2 ? -3.2 : 3.2, tilt: [-0.3, 0.5, -0.6][i], follow: a });
        Q.shock(pos, 5.5, 0x9fdcff, 0.3);
        if (local) Q.sparks(pos, 6, 0xc7f0ff, 9, 0.35);
        S._damageArea(a, pos, 5.5, b * 1.4);
      }));
      if (local) S.vib(20);
      break;
    }
    case 'k_mikiri': { // 見切：瞬步殘光 → 0.18 秒後路徑上浮現交叉斬痕
      const from = at(pos);
      S._lineSlash(a, from, f, 8, 3, b * 5, 0xc7f0ff, 0.3);
      Q.flash(from, 2.5, 0x9fdcff, 0.3, 1);
      const to = at(moveForward(S, a, 7));
      Q.streak(from, to, 0x7dd3fc, 0.5, 1.4);
      Q.flash(to, 2.4, 0xffffff, 0.25, 1);
      Q.light(to, 0x9fdcff, 25, 0.3, 10);
      triggerSwing(a.hero);
      S._later(0.18, () => {
        for (let d = 1.5; d < 7; d += 2) {
          const p = ahead(from, f, d);
          Q.crescent(p, f + 0.8, 1.7, 0xffffff, 0.24, { arc: 1.6, sweep: 1.6, tilt: 0.9 });
          Q.crescent(p, f - 0.8, 1.7, 0x7dd3fc, 0.24, { arc: 1.6, sweep: -1.6, tilt: -0.9 });
          if (local) Q.sparks(p, 4, 0xc7f0ff, 6, 0.35);
        }
      });
      if (local) S.vib(25);
      break;
    }
    case 'k_iai': { // 居合·極：收刀蓄力（魔法陣 + 聚光）→ 極長白光一閃 → 延遲的二段斬裂
      const o = at(pos);
      Q.rune(o, 2.6, 0xc7f0ff, 0.7, -6);
      Q.converge(o, 20, 0xffffff, 3.5, 0.45, 1);
      Q.flash(o, 1.8, 0xc7f0ff, 0.5, 1.1);
      S._later(0.5, () => {
        const p = at(a.group.position), ang = a.facing;
        const end = ahead(p, ang, 15);
        triggerSwing(a.hero);
        S._lineSlash(a, p, ang, 15, 3.2, b * 8, 0xffffff, 0.4);
        Q.streak(p, end, 0x9fdcff, 0.6, 2.4);
        Q.comet(p, end, 0xc7f0ff, 0.14, { width: 1.1, length: 12, head: 2.2 }); // 刀氣彗星
        Q.flash(p, 3, 0xffffff, 0.25, 1);
        Q.flash(end, 3.5, 0xffffff, 0.3, 0.9);
        Q.light(ahead(p, ang, 7), 0xc7f0ff, 45, 0.4, 18);
        S._later(0.12, () => {
          for (let d = 2; d <= 14; d += 3) Q.sparks(ahead(p, ang, d), 5, 0xffffff, 8, 0.45);
          Q.streak(ahead(p, ang, 0.5), end, 0xffffff, 0.35, 0.9);
        });
        if (local) { S.shake = Math.max(S.shake, 0.3); S.vib(50); S._screenFlash('220,240,255'); }
      });
      break;
    }
    case 'k_sakura': { // 櫻花一閃：櫻色魔法陣 + 六向斬擊 + 迴旋花弧 + 漫天花瓣
      const o = at(pos);
      Q.rune(o, 7, 0xff6fa8, 1.1, 2);
      for (let i = 0; i < 6; i++) S._lineSlash(a, o, f + (i * Math.PI) / 3, 12, 2.4, b * 2, 0xc8407a, 0.5);
      [0, 1, 2].forEach((i) => S._later(i * 0.08, () => Q.crescent(o, f + i * 2.1, 4.5 + i, 0xff5a9a, 0.38, { arc: 3.2, sweep: 3, tilt: [-0.4, 0.3, 0][i] })));
      Q.flash(o, 5, 0xff5a9a, 0.45, 1);
      Q.light(o, 0xff6fa8, 40, 0.6, 18);
      Q.shock(o, 11, 0xffb3d1, 0.6);
      Q.petals(o, local ? 46 : 20, 0xffb3d1, 9);
      Q.embers(o, 18, 0xff8fbf, 5, 1.6);
      S._damageArea(a, o, 10, b * 9);
      if (local) S._bigImpact(0.5);
      break;
    }

    // ══ 雙劍：鬼氣、瞬移、連斬 ═══════════════════
    case 'd_demon': { // 鬼人化：紅色鬼氣衝天 + 腳下血色魔法陣
      a.demonTime = 6;
      Q.rune(pos, 3.5, 0xff3b3b, 1.2, -3);
      Q.beam(pos, 1.3, 8, 0xff3b3b, 0.7);
      Q.flash(pos, 4, 0xff4d4d, 0.45, 1);
      Q.shock(pos, 4.5, 0xff5c5c, 0.5);
      Q.sparks(pos, 20, 0xff5c5c, 7, 0.7, { y: 0.3, up: 1.6 });
      Q.embers(pos, 16, 0xff3b3b, 1.5, 1.6);
      Q.vortex(pos, 1.8, 0xff3b3b, 1.4, { n: 50, rise: 7, spin: -9, follow: a }); // 鬼氣捲上身
      if (local) S.vib([30, 30, 30]);
      break;
    }
    case 'd_shadow': { // 影分身：連續瞬移，每段留下紫色殘影光帶 + 十字斬
      const targets = S.targetsNear(a, 12, 4);
      if (!targets.length) targets.push(ahead(pos, f, 4));
      let prev = at(pos);
      Q.flash(prev, 2.4, 0xb98cff, 0.3, 1);
      Q.smoke(prev, 4, 0x6a4aa8, 1.6, 0.7, 0.6);
      targets.forEach((t, i) => S._later(i * 0.12, () => {
        const dest = { x: t.x + rand(-0.8, 0.8), z: t.z + rand(-0.8, 0.8) };
        if (a.local) S.moveLocalTo(dest.x, dest.z);
        Q.streak(prev, dest, 0xb98cff, 0.45, 0.9);
        prev = dest;
        triggerSwing(a.hero);
        const ang = rand(0, Math.PI);
        Q.crescent(t, ang, 2.3, 0xd8b4fe, 0.22, { arc: 1.6, sweep: 2, tilt: 0.8 });
        Q.crescent(t, ang + Math.PI / 2, 2.3, 0x7c3aed, 0.22, { arc: 1.6, sweep: -2, tilt: -0.8 });
        Q.flash(t, 2.2, 0xb98cff, 0.25, 0.9);
        Q.sparks(t, local ? 6 : 3, 0xd8b4fe, 6, 0.35);
        S._damageArea(a, t, 2.5, b * 3);
      }));
      break;
    }
    case 'd_blades': { // 迴旋刃：兩把發光刀刃繞身 3 秒（quarks OrbitOverLife）
      a.bladesTime = 3; a.bladesTick = 0;
      spawnOrbitBlades(S, a, 3);
      Q.flash(pos, 3, 0xffc2e0, 0.3, 1);
      Q.shock(pos, 3, 0xff8fc8, 0.35);
      break;
    }
    case 'd_frenzy': { // 鬼人亂舞：1.6 秒狂亂刀光（每 0.1 秒一刀在 BattleScene），最後爆開
      a.frenzyTime = 1.6; a.frenzyTick = 0;
      Q.rune(pos, 4, 0xff3b3b, 1.8, 6);
      Q.beam(pos, 1, 6, 0xff3b3b, 0.5);
      if (local) S._bigImpact(0.4);
      S._later(1.6, () => {
        const c = a.group.position;
        Q.flash(c, 6, 0xff4d4d, 0.4, 1);
        Q.light(c, 0xff3b3b, 50, 0.5, 18);
        Q.shock(c, 7, 0xff7a7a, 0.45);
        Q.wall(c, 0.5, 6, 1.4, 0xff5c5c, 0.4);
        Q.sparks(c, 20, 0xff7a7a, 11, 0.5);
        Q.embers(c, 14, 0xff3b3b, 3, 1.4);
      });
      break;
    }
    // ══ 星杖：星辰魔法、遠程範圍 ═══════════════════
    case 's_orb': { // 星彈連射：杖頭聚光 → 5 顆星彈依序追向附近敵人
      Q.converge(ahead(pos, f, 0.8), 12, 0x9be7ff, 1.6, 0.25, 1.4);
      Q.rune(pos, 2.2, 0x9be7ff, 0.8, 6);
      const ts = S.targetsNear(a, 12, 5);
      while (ts.length < 5) ts.push(ahead(pos, f + rand(-0.6, 0.6), rand(5, 9)));
      ts.forEach((t, i) => S._later(0.12 + i * 0.09, () => {
        triggerSwing(a.hero);
        S._starBolt(a, t, b * 3.6, i % 2 ? 0xffffff : 0x9be7ff, 2.4);
        Q.flash(ahead(a.group.position, a.facing, 0.8), 1.2, 0x9be7ff, 0.15, 1.4);
      }));
      if (local) S.vib(15);
      break;
    }
    case 's_meteor': { // 隕星墜落：前方星陣 → 5 顆隕星從天而降
      const c = ahead(pos, f, 6);
      Q.rune(c, 4.5, 0xc98cff, 1.4, 2);
      Q.rune(c, 2.6, 0x9be7ff, 1.4, -3);
      triggerSwing(a.hero);
      for (let i = 0; i < 5; i++) S._later(0.15 + i * 0.12, () => {
        const at = { x: c.x + rand(-3, 3), z: c.z + rand(-3, 3) };
        Q.meteor(at, i % 2 ? 0xc98cff : 0x9be7ff, () => {
          S._damageArea(a, at, 3, b * 3.2);
          if (local && i === 4) S.shake = Math.max(S.shake, 0.3);
        });
      });
      break;
    }
    case 's_beam': { // 星河光束：腳下星陣 + 1.2 秒持續光束（每 0.2 秒一段傷害），盡頭不斷爆星
      const o = at(pos);
      Q.rune(o, 2.8, 0x9be7ff, 1.6, 5);
      Q.converge(ahead(o, f, 1), 18, 0xffffff, 2.2, 0.3, 1.2);
      for (let i = 0; i < 6; i++) S._later(0.3 + i * 0.2, () => {
        const p = at(a.group.position), ang = a.facing;
        const end = ahead(p, ang, 16);
        triggerSwing(a.hero);
        S._lineSlash(a, p, ang, 16, 3, b * 1.5, 0x9be7ff, 0.25);
        Q.streak(ahead(p, ang, 0.6), end, 0xc9f2ff, 0.28, 1.6);
        Q.streak(ahead(p, ang, 0.6), end, 0xffffff, 0.22, 0.5);
        Q.flash(end, 2.6, 0x9be7ff, 0.25, 1);
        Q.sparks(ahead(p, ang, rand(4, 15)), 5, 0xc9f2ff, 6, 0.4);
        if (i % 2 === 0) Q.light(ahead(p, ang, 8), 0x9be7ff, 35, 0.3, 18);
      });
      if (local) S.vib([20, 40, 20]);
      break;
    }
    case 's_judge': { // 星界審判：巨大雙層星陣 + 光柱 → 10 顆星雨 → 終焉崩落
      const c = at(pos);
      Q.rune(c, 9, 0xc98cff, 2.6, 1.2);
      Q.rune(c, 5.5, 0x9be7ff, 2.6, -2.5);
      Q.rune(c, 2.5, 0xffffff, 2.6, 4);
      Q.beam(c, 1.4, 16, 0x9be7ff, 2.2);
      Q.converge(c, 40, 0xc9f2ff, 6, 0.5, 1.2);
      Q.vortex(c, 6, 0xc98cff, 1.8, { n: 70, rise: 4, spin: 3, size: 0.4 }); // 星雲漩渦
      triggerSwing(a.hero);
      for (let i = 0; i < 10; i++) S._later(0.3 + i * 0.12, () => {
        const ang = rand(0, Math.PI * 2), r = rand(2, 9);
        const at2 = { x: c.x + Math.cos(ang) * r, z: c.z + Math.sin(ang) * r };
        Q.meteor(at2, [0x9be7ff, 0xc98cff, 0xffffff][i % 3], () => S._damageArea(a, at2, 3, b * 2));
      });
      S._later(1.8, () => {
        Q.flash(c, 15, 0xc9f2ff, 0.7, 1.2);
        Q.light(c, 0x9be7ff, 80, 0.9, 30, 2);
        Q.shock(c, 12, 0xc98cff, 0.7);
        Q.shock(c, 8, 0xffffff, 0.5);
        Q.wall(c, 0.5, 11, 3, 0x9be7ff, 0.8);
        Q.crack(c, 10, 0x9be7ff, 1.8);
        Q.embers(c, 40, 0xc9f2ff, 9, 2.2);
        Q.sparks(c, 40, 0xffffff, 16, 0.8, { up: 1.5 });
        S._damageArea(a, c, 10, b * 10);
        if (local) { S._bigImpact(); S._screenFlash('180,220,255'); }
      });
      break;
    }
    // ══ 長槍：雷龍、直線貫穿 ═══════════════════
    case 'sp_thrust': { // 連環突刺：5 段快速突刺，左右微微錯開，最後一槍最亮
      Q.rune(pos, 2.4, 0x7df9ff, 0.9, 6);
      for (let i = 0; i < 5; i++) S._later(i * 0.09, () => {
        triggerSwing(a.hero);
        const p = at(a.group.position);
        S._thrust(a, p, a.facing + (i % 2 ? 0.12 : -0.12) * (i < 4 ? 1 : 0), 9, 2.4, b * 0.9, i === 4 ? 0xffffff : 0x7df9ff, i === 4);
      });
      if (local) S.vib([10, 10, 10, 10, 30]);
      break;
    }
    case 'sp_leap': { // 龍騰槍：躍起 → 槍插地：雷光炸裂、放射電弧、落雷
      a.leapT = 0.35;
      Q.vortex(pos, 1.2, 0x7df9ff, 0.5, { n: 30, rise: 8, spin: 10 });
      const land = moveForward(S, a, 6);
      S._later(0.32, () => {
        triggerSwing(a.hero);
        Q.lightning(land, 0xbff8ff, 11);
        Q.flash(land, 6, 0x7df9ff, 0.4, 0.6);
        Q.light(land, 0x7df9ff, 60, 0.5, 20, 1);
        Q.shock(land, 6, 0xbff8ff, 0.5);
        Q.wall(land, 0.5, 5.5, 1.8, 0x7df9ff, 0.45);
        Q.crack(land, 5.5, 0x7df9ff, 1.4);
        for (let i = 0; i < 3; i++) { const p = ahead(land, rand(0, Math.PI * 2), rand(2, 4)); S._later(0.08 + i * 0.07, () => Q.lightning(p, 0x7df9ff, 8)); }
        Q.sparks(land, 24, 0xbff8ff, 11, 0.5, { up: 1.4 });
        S._damageArea(a, land, 5, b * 6);
        if (local) { S.shake = Math.max(S.shake, 0.45); S.vib(45); }
      });
      break;
    }
    case 'sp_drill': { // 螺旋穿雲：擲出高速旋轉的槍氣，0.8 秒鑽 14 公尺，每段都有傷害
      triggerSwing(a.hero);
      const o = at(pos), ang = f;
      Q.converge(ahead(o, ang, 1), 16, 0xbff8ff, 2, 0.25, 1);
      Q.drill(o, ang, 14, 0x7df9ff, 0.8);
      for (let i = 0; i < 4; i++) S._later(0.1 + i * 0.2, () => {
        const p = ahead(o, ang, 1 + i * 3.2);
        S._damageArea(a, p, 2.6, b * 1.5);
        Q.shock(p, 2.6, 0x7df9ff, 0.3);
      });
      if (local) S.vib([20, 20, 20]);
      break;
    }
    case 'sp_dragon': { // 天龍破：雷陣 + 蓄力 → 雷龍貫穿 16 公尺，沿路落雷，盡頭雷爆
      const o = at(pos), ang = f;
      Q.rune(o, 5, 0x7df9ff, 1.2, 3);
      Q.rune(o, 3, 0xffe08a, 1.2, -4);
      Q.converge(o, 30, 0xbff8ff, 4, 0.4, 1.2);
      Q.beam(o, 1, 10, 0x7df9ff, 0.6);
      S._later(0.4, () => {
        triggerSwing(a.hero);
        const p = at(a.group.position);
        const end = ahead(p, ang, 16);
        Q.thunderDragon(p, ang, 16, 0x7df9ff, 0.45);
        S._thrust(a, p, ang, 16, 5, b * 8, 0xbff8ff, true);
        for (let i = 0; i < 6; i++) S._later(0.08 + i * 0.06, () => {
          const q = ahead(ahead(p, ang, 3 + i * 2.2), ang + Math.PI / 2, rand(-2, 2));
          Q.lightning(q, 0x7df9ff, 9);
          S._damageArea(a, q, 2.5, b * 1.5);
        });
        S._later(0.45, () => {
          Q.flash(end, 9, 0x7df9ff, 0.5, 1);
          Q.light(end, 0x7df9ff, 70, 0.7, 26, 2);
          Q.shock(end, 8, 0xbff8ff, 0.6);
          Q.wall(end, 0.5, 7, 2.2, 0x7df9ff, 0.6);
          Q.sparks(end, 30, 0xffffff, 13, 0.7, { up: 1.4 });
          S._damageArea(a, end, 6, b * 4);
          if (local) { S._bigImpact(); S._screenFlash('170,240,255'); }
        });
      });
      break;
    }

    // ══ 長弓：風、遠程、箭雨 ═══════════════════
    case 'b_multi': { // 扇形散射：7 支箭呈 60° 扇形射出
      triggerSwing(a.hero);
      Q.flash(ahead(pos, f, 0.8), 1.8, 0x8affc1, 0.2, 1.2);
      Q.converge(ahead(pos, f, 0.8), 10, 0xc8ffe0, 1.2, 0.18, 1.2);
      for (let i = 0; i < 7; i++) S._arrowShot(a, f + (i - 3) * 0.17, 11, b * 1.8, i === 3 ? 0xffffff : 0x8affc1, 1.4);
      if (local) S.vib(20);
      break;
    }
    case 'b_pierce': { // 穿雲箭：蓄力（風陣 + 聚氣）→ 一支巨箭貫穿 20 公尺
      const o = at(pos);
      Q.rune(o, 2.6, 0x8affc1, 0.6, -6);
      Q.converge(ahead(o, f, 1), 24, 0xffffff, 2.6, 0.4, 1.2);
      Q.vortex(o, 1.4, 0x8affc1, 0.5, { n: 30, rise: 4, spin: 10 });
      S._later(0.4, () => {
        triggerSwing(a.hero);
        const p = at(a.group.position), ang = a.facing;
        const end = ahead(p, ang, 20);
        S._arrowShot(a, ang, 20, b * 7, 0xffffff, 2.6);
        Q.comet(ahead(p, ang, 0.6), end, 0x8affc1, 0.22, { width: 1.6, length: 24, head: 2.4, y0: 1.1, y1: 1.1 });
        Q.streak(p, end, 0xc8ffe0, 0.4, 1.6);
        Q.light(ahead(p, ang, 8), 0x8affc1, 45, 0.4, 20);
        S._later(0.22, () => { Q.flash(end, 4, 0x8affc1, 0.35, 1); Q.shock(end, 4, 0xc8ffe0, 0.4); });
        if (local) { S.shake = Math.max(S.shake, 0.3); S.vib(50); S._screenFlash('200,255,220'); }
      });
      break;
    }
    case 'b_rain': { // 箭雨：前方風陣，1.2 秒內 12 支箭從天而降，最後一陣風爆
      const c = ahead(pos, f, 8);
      Q.rune(c, 5, 0x8affc1, 1.8, 1.5);
      triggerSwing(a.hero);
      Q.comet(at(pos), { x: pos.x + Math.sin(f) * 2, y: S.gy(pos.x, pos.z) + 9, z: pos.z + Math.cos(f) * 2 }, 0xc8ffe0, 0.2, { width: 0.4, head: 1 });
      for (let i = 0; i < 12; i++) S._later(0.25 + i * 0.08, () => {
        const ang = rand(0, Math.PI * 2), r = rand(0, 4.5);
        const p = { x: c.x + Math.cos(ang) * r, z: c.z + Math.sin(ang) * r };
        const gy = S.gy(p.x, p.z);
        Q.arrow({ x: p.x - 1.2, y: gy + 9, z: p.z - 0.6 }, { x: p.x, y: gy + 0.2, z: p.z }, i % 3 ? 0x8affc1 : 0xffffff, 0.16);
        S._later(0.16, () => S._damageArea(a, p, 1.8, b * 1.4));
      });
      S._later(1.4, () => {
        Q.tornado(c, 3, 0x8affc1, 0.9);
        Q.shock(c, 5.5, 0xc8ffe0, 0.5);
        S._damageArea(a, c, 5, b * 3.5);
      });
      break;
    }
    case 'b_storm': { // 千矢星落：三層風陣 + 光柱 → 30 支星矢落下 → 中央龍捲收尾
      const c = at(pos);
      Q.rune(c, 9, 0x8affc1, 2.6, 1.2);
      Q.rune(c, 5.5, 0xffe08a, 2.6, -2.5);
      Q.rune(c, 2.6, 0xffffff, 2.6, 4);
      Q.beam(c, 1.2, 16, 0x8affc1, 2);
      Q.converge(c, 36, 0xc8ffe0, 6, 0.5, 1.2);
      triggerSwing(a.hero);
      for (let i = 0; i < 30; i++) S._later(0.3 + i * 0.045, () => {
        const ang = rand(0, Math.PI * 2), r = rand(1.5, 9);
        const p = { x: c.x + Math.cos(ang) * r, z: c.z + Math.sin(ang) * r };
        const gy = S.gy(p.x, p.z);
        Q.arrow({ x: p.x + rand(-2, 2), y: gy + 11, z: p.z - 1.5 }, { x: p.x, y: gy + 0.2, z: p.z }, [0x8affc1, 0xffe08a, 0xffffff][i % 3], 0.18, { width: 0.3, head: 1 });
        S._later(0.18, () => { S._damageArea(a, p, 2, b); if (i % 3 === 0) Q.shock(p, 2, 0x8affc1, 0.3); });
      });
      S._later(1.8, () => {
        Q.tornado(c, 4.5, 0x8affc1, 1.4);
        Q.flash(c, 12, 0xc8ffe0, 0.6, 1.2);
        Q.light(c, 0x8affc1, 75, 0.9, 30, 2);
        Q.shock(c, 11, 0x8affc1, 0.7);
        Q.wall(c, 0.5, 10, 2.8, 0x8affc1, 0.8);
        Q.petals(c, local ? 30 : 12, 0xc8ffe0, 10);
        S._damageArea(a, c, 9, b * 8);
        if (local) { S._bigImpact(); S._screenFlash('200,255,220'); }
      });
      break;
    }
    // ══ 鐮刀：暗影、大範圍 ═══════════════════
    case 'sc_reap': { // 死神收割：兩圈反向的大弧斬 + 暗影氣旋
      triggerSwing(a.hero);
      Q.rune(pos, 4, 0xa66bff, 0.8, -4);
      Q.crescent(pos, f, 5.8, 0xa66bff, 0.36, { arc: 6.2, sweep: 4, tilt: 0.15, follow: a });
      S._later(0.12, () => Q.crescent(pos, f + Math.PI, 5.2, 0xe0d0ff, 0.3, { arc: 6.2, sweep: -4, tilt: -0.2, follow: a }));
      Q.vortex(pos, 3, 0x6a3ab0, 0.9, { n: 50, rise: 3, spin: 10, follow: a });
      Q.smoke(pos, 6, 0x2a1a3a, 2.2, 0.8, 3);
      S._damageArea(a, pos, 5.5, b * 4.5);
      if (local) S.vib(30);
      break;
    }
    case 'sc_chain': { // 冥魂鎖鏈：鎖住 10 公尺內 6 隻怪拉到面前，再一刀斬斷
      const o = at(pos);
      Q.rune(o, 3, 0xa66bff, 0.9, 5);
      const grab = S.mobs.filter((m) => m.alive && !m.boss && Math.hypot(m.group.position.x - o.x, m.group.position.z - o.z) < 10).slice(0, 6);
      grab.forEach((m) => {
        Q.chain(ahead(o, rand(0, 6), 0.6), at(m.group.position), 0xa66bff, 0.16);
        const from = at(m.group.position), to = ahead(o, Math.atan2(from.x - o.x, from.z - o.z), 1.8);
        for (let i = 1; i <= 5; i++) S._later(0.16 + i * 0.04, () => { if (m.alive) { m.group.position.x = from.x + (to.x - from.x) * (i / 5); m.group.position.z = from.z + (to.z - from.z) * (i / 5); } });
      });
      S._later(0.45, () => {
        triggerSwing(a.hero);
        Q.crescent(o, f, 4.2, 0xe0d0ff, 0.3, { arc: 6.2, sweep: 3, tilt: 0.3 });
        Q.flash(o, 4, 0xa66bff, 0.3, 1);
        Q.shock(o, 4.5, 0xc8b0ff, 0.35);
        S._damageArea(a, o, 4.2, b * 6);
        if (local) S.shake = Math.max(S.shake, 0.3);
      });
      break;
    }
    case 'sc_tide': { // 亡靈潮汐：三波亡靈往前湧
      const o = at(pos), ang = f;
      Q.rune(o, 3.2, 0x8a5aff, 1.2, 3);
      for (let i = 0; i < 3; i++) S._later(i * 0.25, () => {
        triggerSwing(a.hero);
        Q.ghostWave(o, ang, 14, i % 2 ? 0xc8b0ff : 0x8a5aff, 0.55);
        S._later(0.15, () => S._lineSlash(a, o, ang, 14, 4, b * 2.5, 0x8a5aff, 0.3));
      });
      if (local) S.vib([20, 30, 20]);
      break;
    }
    case 'sc_eclipse': { // 月蝕審判：黑月降臨 → 全場崩落
      const c = at(pos);
      Q.rune(c, 10, 0x6a3ab0, 2.4, 1);
      Q.rune(c, 6, 0xc8b0ff, 2.4, -2);
      triggerSwing(a.hero);
      Q.darkMoon(c, 9, 1.2, 0x8a5aff, () => {
        S._damageArea(a, c, 10, b * 14);
        if (local) { S._bigImpact(); S._screenFlash('170,120,255'); }
      });
      break;
    }

    // ══ 拳套：烈火、貼身連打 ═══════════════════
    case 'f_combo': { // 百裂拳：1.2 秒 10 拳，最後一拳爆開
      for (let i = 0; i < 10; i++) S._later(i * 0.12, () => {
        triggerSwing(a.hero);
        const p = at(a.group.position);
        const hit = ahead(p, a.facing + rand(-0.4, 0.4), rand(1.4, 2.4));
        Q.punch(hit, i === 9 ? 0xffffff : 0xff8a3a);
        S._damageArea(a, hit, 3.2, b * 0.45);
        if (i === 9) { Q.flash(hit, 3, 0xffb35a, 0.3, 1); Q.shock(hit, 3.5, 0xff8a3a, 0.35); if (local) S.shake = Math.max(S.shake, 0.25); }
      });
      if (local) S.vib([10, 10, 10, 10, 10, 10, 40]);
      break;
    }
    case 'f_rise': { // 昇龍拳：往前一步上勾拳，火柱衝天
      a.leapT = 0.3;
      const p = at(pos), hit = ahead(p, f, 1.8);
      triggerSwing(a.hero);
      Q.flamePillar(hit, 0xff6a2a);
      Q.light(hit, 0xff6a2a, 50, 0.5, 16, 2);
      S._damageArea(a, hit, 4, b * 6);
      if (local) { S.shake = Math.max(S.shake, 0.35); S.vib(40); }
      break;
    }
    case 'f_wave': { // 烈火掌風：雙掌推出一道寬火焰
      const o = at(pos), ang = f;
      Q.converge(ahead(o, ang, 1), 18, 0xffd08a, 1.8, 0.25, 1);
      S._later(0.2, () => {
        triggerSwing(a.hero);
        const end = ahead(o, ang, 10);
        Q.comet(ahead(o, ang, 1), end, 0xff6a2a, 0.3, { width: 3.2, length: 22, head: 3 });
        Q.comet(ahead(o, ang, 1), end, 0xffd08a, 0.3, { width: 1.2, length: 18, head: 0.1 });
        for (let d = 2; d <= 10; d += 2) S._later(d * 0.025, () => Q.fireTrail(ahead(o, ang, d), 1, true, 0xff6a2a));
        S._lineSlash(a, o, ang, 10, 5, b * 6, 0xff8a3a, 0.3);
        Q.light(ahead(o, ang, 5), 0xff6a2a, 45, 0.4, 18);
        if (local) S.vib(35);
      });
      break;
    }
    case 'f_burst': { // 爆裂天拳：跳起 → 巨大火拳從天砸下
      a.leapT = 0.45;
      const land = at(moveForward(S, a, 4));
      Q.vortex(pos, 1.4, 0xff8a3a, 0.5, { n: 30, rise: 9, spin: 10 });
      Q.rune(ahead(pos, f, 4), 6, 0xff6a2a, 1.2, 3);
      S._later(0.3, () => {
        Q.meteor(land, 0xff6a2a, () => {
          triggerSwing(a.hero);
          Q.flash(land, 9, 0xffb35a, 0.5, 1);
          Q.light(land, 0xff6a2a, 75, 0.7, 26, 2);
          Q.shock(land, 9, 0xffd08a, 0.6);
          Q.wall(land, 0.5, 8, 2.4, 0xff6a2a, 0.6);
          Q.crack(land, 8, 0xff6a2a, 1.6);
          Q.debris(land, 0x5a3a2a, 14, 10);
          Q.embers(land, 30, 0xff8a3a, 5, 2);
          S._damageArea(a, land, 8, b * 12);
          if (local) { S._bigImpact(); S._screenFlash('255,170,90'); }
        });
      });
      break;
    }
    // ══ v0.5 新增：每把武器 2 招（6 招選 4）═══════════
    case 'g_charge': { // 衝鋒斬：往前衝 8 公尺，路上的都劈開
      const from = at(pos), ang = f;
      Q.rune(from, 2.5, 0xffb347, 0.6, 5);
      const to = at(moveForward(S, a, 8));
      triggerSwing(a.hero);
      S._lineSlash(a, from, ang, 9, 3.2, b * 5, 0xffb347, 0.35);
      Q.comet(from, to, 0xffd08a, 0.18, { width: 1.4, length: 16, head: 2 });
      for (let d = 1; d <= 8; d += 2) Q.dust(ahead(from, ang, d), 0xb9a58a, 2);
      S._later(0.18, () => { Q.crescent(to, ang, 4, 0xffb347, 0.3, { arc: 3.2, sweep: 2.4, tilt: -0.5 }); Q.shock(to, 4, 0xffd08a, 0.35); });
      if (local) { S.shake = Math.max(S.shake, 0.3); S.vib(30); }
      break;
    }
    case 'g_storm': { // 劍刃風暴：3 秒旋轉，6 次範圍傷害
      Q.rune(pos, 6.5, 0xffb347, 3.2, 3);
      Q.vortex(pos, 5, 0xffd08a, 3, { n: 120, rise: 2, spin: 12, follow: a, size: 0.4 });
      for (let i = 0; i < 6; i++) S._later(i * 0.5, () => {
        triggerSwing(a.hero);
        const p = at(a.group.position);
        Q.crescent(p, rand(0, 6.28), 6, i % 2 ? 0xffffff : 0xffb347, 0.4, { arc: 6.2, sweep: 4, tilt: rand(-0.3, 0.3), follow: a });
        S._damageArea(a, p, 6, b * 1.66);
      });
      if (local) S.vib([20, 40, 20, 40, 20]);
      break;
    }
    case 'k_moon': { // 新月斬：一道往前飛 12 公尺的巨大月牙
      triggerSwing(a.hero);
      const o = at(pos), ang = f;
      Q.crescent(o, ang, 4.5, 0xc7f0ff, 0.25, { arc: 3, sweep: 2.6, tilt: -0.3 });
      Q.comet(ahead(o, ang, 1), ahead(o, ang, 13), 0x9fdcff, 0.4, { width: 4.5, length: 18, head: 3 });
      Q.comet(ahead(o, ang, 1), ahead(o, ang, 13), 0xffffff, 0.4, { width: 1.5, length: 14, head: 0.1 });
      S._later(0.12, () => S._lineSlash(a, o, ang, 13, 5, b * 5, 0xc7f0ff, 0.3));
      if (local) S.vib(30);
      break;
    }
    case 'k_thousand': { // 千本櫻：四周亂斬 12 刀 + 花瓣爆散
      const o = at(pos);
      Q.rune(o, 8, 0xff6fa8, 1.8, 2);
      for (let i = 0; i < 12; i++) S._later(i * 0.1, () => {
        const p = ahead(o, rand(0, 6.28), rand(1.5, 7));
        triggerSwing(a.hero);
        Q.crescent(p, rand(0, 6.28), 2.4, i % 3 ? 0xff5a9a : 0xffffff, 0.22, { arc: 2, sweep: 2.4, tilt: rand(-0.8, 0.8) });
        Q.petals(p, local ? 6 : 3, 0xffb3d1, 4);
        S._damageArea(a, p, 2.5, b * 1.2);
      });
      S._later(1.3, () => { Q.flash(o, 8, 0xff5a9a, 0.5, 1); Q.shock(o, 9, 0xffb3d1, 0.5); Q.petals(o, local ? 40 : 16, 0xffb3d1, 10); S._damageArea(a, o, 8, b * 6); if (local) S._bigImpact(0.4); });
      break;
    }
    case 'd_venom': { // 毒刃：6 秒傷害 +40% + 毒霧
      a.buffs.venom = 6;
      Q.rune(pos, 3, 0x7ed957, 1, -4);
      Q.vortex(pos, 1.6, 0x7ed957, 1.2, { n: 40, rise: 5, spin: 8, follow: a });
      Q.smoke(pos, 8, 0x4a8a3a, 2.4, 1.4, 3);
      Q.sparks(pos, 16, 0xa6ff7a, 7, 0.6, { up: 1.5 });
      S._damageArea(a, pos, 4, b * 2);
      if (local) S.vib([20, 20, 20]);
      break;
    }
    case 'd_xcut': { // 十字斬：前方交叉兩道斬擊
      const o = at(pos);
      for (const [i, off] of [[0, 0.5], [1, -0.5]]) S._later(i * 0.1, () => {
        triggerSwing(a.hero);
        const ang = a.facing + off, from = ahead(o, ang + Math.PI, 1.5);
        S._lineSlash(a, from, ang, 8, 2.6, b * 2.5, i ? 0xff8a9a : 0xffffff, 0.35);
        Q.comet(from, ahead(from, ang, 8), 0xff5c7a, 0.15, { width: 1, length: 10, head: 1.2 });
      });
      S._later(0.22, () => { const c = ahead(o, f, 2.5); Q.flash(c, 3, 0xff5c7a, 0.3, 1); Q.sparks(c, 12, 0xffc2c2, 8, 0.4); });
      break;
    }
    case 's_nova': { // 星爆：身邊炸開一圈星光
      Q.converge(pos, 24, 0xc9f2ff, 4, 0.3, 1);
      S._later(0.3, () => {
        const c = at(a.group.position);
        Q.flash(c, 7, 0x9be7ff, 0.4, 1);
        Q.shock(c, 6.5, 0xc9f2ff, 0.45);
        Q.wall(c, 0.5, 6, 1.8, 0x9be7ff, 0.45);
        Q.sparks(c, 30, 0xffffff, 12, 0.6, { up: 1.3 });
        for (let i = 0; i < 6; i++) Q.comet(c, ahead(c, (i / 6) * 6.28, 6), 0x9be7ff, 0.2, { width: 0.4, length: 8, head: 1 });
        S._damageArea(a, c, 6, b * 5.5);
        if (local) S.shake = Math.max(S.shake, 0.3);
      });
      break;
    }
    case 's_gravity': { // 重力井：黑洞吸怪 1.5 秒，最後爆開
      const c = ahead(pos, f, 7);
      Q.rune(c, 5, 0xc98cff, 2, -3);
      Q.vortex(c, 5, 0x6a3ab0, 1.8, { n: 100, rise: 0.5, spin: -10, size: 0.45 });
      Q.converge(c, 50, 0xc98cff, 6, 1.4, 1);
      triggerSwing(a.hero);
      for (let i = 0; i < 5; i++) S._later(0.2 + i * 0.3, () => {
        for (const m of S.mobs) {
          if (!m.alive || m.boss || m.dummy) continue;
          const dx = c.x - m.group.position.x, dz = c.z - m.group.position.z, d = Math.hypot(dx, dz);
          if (d < 6 && d > 0.6) { m.group.position.x += dx * 0.25; m.group.position.z += dz * 0.25; }
        }
        S._damageArea(a, c, 5, b * 1.5);
      });
      S._later(1.8, () => { Q.flash(c, 8, 0xc98cff, 0.5, 1); Q.shock(c, 7, 0xffffff, 0.5); Q.light(c, 0xc98cff, 60, 0.6, 20); S._damageArea(a, c, 5.5, b * 3); if (local) S._bigImpact(0.4); });
      break;
    }
    case 'sp_sweep': { // 橫掃千軍：長槍大弧度橫掃
      triggerSwing(a.hero);
      Q.crescent(pos, f, 6.2, 0x7df9ff, 0.35, { arc: 4.7, sweep: 3.6, tilt: 0.1, follow: a });
      S._later(0.08, () => Q.crescent(pos, f, 5.8, 0xffffff, 0.25, { arc: 4.7, sweep: 3.6, tilt: -0.1, follow: a }));
      Q.sparks(pos, 18, 0xbff8ff, 9, 0.4);
      Q.lightning(ahead(pos, f, 4), 0x7df9ff, 7);
      S._damageArea(a, pos, 6, b * 4.8);
      if (local) S.vib(30);
      break;
    }
    case 'sp_rain': { // 雷槍雨：8 支雷槍落在附近的敵人身上
      const ts = S.targetsNear(a, 12, 8);
      while (ts.length < 8) ts.push(ahead(pos, f + rand(-1, 1), rand(3, 10)));
      Q.beam(pos, 0.8, 10, 0x7df9ff, 0.5);
      triggerSwing(a.hero);
      ts.forEach((t, i) => S._later(0.15 + i * 0.08, () => {
        const gy = S.gy(t.x, t.z);
        Q.comet({ x: t.x + 0.5, y: gy + 12, z: t.z - 1 }, { x: t.x, y: gy + 0.2, z: t.z }, 0x7df9ff, 0.15, { width: 0.5, length: 10, head: 1.3 });
        S._later(0.15, () => { Q.lightning(t, 0xbff8ff, 6); S._damageArea(a, t, 2.5, b * 2); });
      }));
      break;
    }
    case 'b_snipe': { // 狙擊：瞄準最遠的敵人射出致命一箭
      const all = S.targetsNear(a, 18, 30);
      const t = all.length ? all[all.length - 1] : ahead(pos, f, 16);
      Q.converge(ahead(pos, f, 0.8), 14, 0xffffff, 1.6, 0.4, 1.2);
      S._later(0.4, () => {
        triggerSwing(a.hero);
        const p = at(a.group.position);
        Q.comet(ahead(p, Math.atan2(t.x - p.x, t.z - p.z), 0.6), t, 0xffffff, 0.12, { width: 0.5, length: 18, head: 1.6 });
        Q.streak(p, t, 0x8affc1, 0.3, 0.6);
        S._later(0.12, () => { Q.flash(t, 3.5, 0x8affc1, 0.3, 1); Q.shock(t, 2.5, 0xffffff, 0.3); S._damageArea(a, t, 2, b * 7); });
        if (local) S.vib(40);
      });
      break;
    }
    case 'b_trap': { // 爆裂陷阱：放在前方，0.8 秒後爆炸
      const c = ahead(pos, f, 6);
      triggerSwing(a.hero);
      Q.arrow(at(pos), c, 0xffb347, 0.2);
      Q.rune(c, 2.2, 0xff8a3a, 1, 6);
      S._later(0.8, () => {
        Q.flash(c, 6, 0xffb347, 0.4, 0.8); Q.shock(c, 4.8, 0xff8a3a, 0.45); Q.debris(c, 0x6a4a2a, 10, 9);
        Q.fireTrail(c, 1, true, 0xff6a2a); Q.embers(c, 20, 0xff8a3a, 3, 1.6); Q.light(c, 0xff8a3a, 50, 0.5, 16);
        S._damageArea(a, c, 4.5, b * 6.5);
        if (local) S.shake = Math.max(S.shake, 0.35);
      });
      break;
    }
    case 'sc_soul': { // 靈魂收割：化成魂影穿過前方 8 公尺
      const from = at(pos), ang = f;
      Q.smoke(from, 6, 0x2a1a3a, 2, 0.7, 1);
      const to = at(moveForward(S, a, 8));
      Q.comet(from, to, 0x8a5aff, 0.2, { width: 1.2, length: 16, head: 1.6 });
      S._lineSlash(a, from, ang, 9, 3.2, b * 6, 0xa66bff, 0.35);
      S._later(0.2, () => { Q.crescent(to, ang + Math.PI, 3.6, 0xc8b0ff, 0.3, { arc: 4, sweep: 3, tilt: 0.2 }); Q.vortex(to, 1.4, 0x8a5aff, 0.6, { n: 24, rise: 6, spin: 10 }); });
      if (local) S.vib(30);
      break;
    }
    case 'sc_grave': { // 冥界之門：亡靈持續撕咬 2 秒
      const c = ahead(pos, f, 6);
      triggerSwing(a.hero);
      Q.rune(c, 5, 0x6a3ab0, 2.4, 2);
      Q.rune(c, 3, 0xc8b0ff, 2.4, -3);
      Q.beam(c, 2, 8, 0x8a5aff, 2);
      for (let i = 0; i < 6; i++) S._later(0.2 + i * 0.33, () => {
        const p = ahead(c, rand(0, 6.28), rand(0.5, 4));
        Q.comet({ x: c.x, y: S.gy(c.x, c.z) + 3, z: c.z }, p, i % 2 ? 0xc8b0ff : 0x8a5aff, 0.2, { width: 0.6, length: 10, head: 1.2 });
        Q.smoke(p, 2, 0x2a1a3a, 1.6, 0.6, 0.6);
        S._damageArea(a, c, 5, b * 1.6);
      });
      break;
    }
    case 'f_dash': { // 迅雷步：瞬間衝刺 + 一拳爆開
      const from = at(pos);
      const to = at(moveForward(S, a, 6));
      Q.comet(from, to, 0xffd08a, 0.12, { width: 1, length: 12, head: 1.4 });
      Q.lightning(to, 0xffd08a, 6);
      S._later(0.12, () => {
        triggerSwing(a.hero);
        const hit = ahead(to, f, 1.5);
        Q.punch(hit, 0xffffff); Q.flash(hit, 4, 0xffb35a, 0.3, 1); Q.shock(hit, 3.5, 0xff8a3a, 0.35);
        S._damageArea(a, hit, 3.5, b * 4);
      });
      if (local) S.vib(30);
      break;
    }
    case 'f_aura': { // 鬥氣爆發：6 秒攻速 ×2 + 衝擊
      a.demonTime = 6;
      Q.beam(pos, 1.4, 10, 0xff6a2a, 0.8);
      Q.vortex(pos, 1.8, 0xff8a3a, 1.4, { n: 60, rise: 8, spin: 12, follow: a });
      Q.shock(pos, 5, 0xffd08a, 0.5);
      Q.flash(pos, 5, 0xff8a3a, 0.4, 1);
      S._damageArea(a, pos, 5, b * 3);
      if (local) { S.vib([30, 30, 60]); S.shake = Math.max(S.shake, 0.3); }
      break;
    }
    default:
  }
}

// ── 持續型特效 ───────────────────────────────
// 迴旋刃的刀刃改由 three.quarks 的 OrbitOverLife 處理（quarksFx.orbitBlades），這裡保留介面
function spawnOrbitBlades(S, a, dur) { S.qfx.orbitBlades(a, dur, 0xff8fc8); }
export function removeOrbitBlades() {}
export function updateSkillFx() {}
