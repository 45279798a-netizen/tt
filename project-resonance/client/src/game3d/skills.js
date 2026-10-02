// ─────────────────────────────────────────────
// 職業技能的「演出 + 打怪」實作（名稱 / 冷卻 / PvP 數值在伺服器 skills.js）
// S = BattleScene，a = 出招的角色（自己或朋友），b = 每秒傷害
//
// 傷害倍率（b × N）是平衡過的，改特效時不要動到：
//   大劍 旋風斬 5.6 / 震地 6 / 裂地 6 / 天崩 12
//   太刀 氣刃 4.2 / 見切 5 / 居合 8 / 櫻花 線 2×6 + 範圍 9
//   雙劍 鬼人化 攻速×2 / 影分身 3×4 / 迴旋刃 12 / 亂舞 16
//   星杖 星彈 3.6×5 / 隕星 3.2×5 / 光束 1.5×6 / 審判 星雨 2×10 + 崩落 10
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
  const b = S._dps(a);
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
    default:
  }
}

// ── 持續型特效 ───────────────────────────────
// 迴旋刃的刀刃改由 three.quarks 的 OrbitOverLife 處理（quarksFx.orbitBlades），這裡保留介面
function spawnOrbitBlades(S, a, dur) { S.qfx.orbitBlades(a, dur, 0xff8fc8); }
export function removeOrbitBlades() {}
export function updateSkillFx() {}
