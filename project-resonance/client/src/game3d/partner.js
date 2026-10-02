// ─────────────────────────────────────────────
// 夥伴（粉貓·米米）的 3D 行為
//  - 'home'：在村莊酒館門口待著（還沒帶出門時）
//  - 'follow'：跟在主人左後方，附近有怪就衝過去打
//      普攻：每 0.75 秒範圍攻擊（粉色月牙，three.quarks）
//      招式（隨等級解鎖，全部 three.quarks）：
//        Lv.1  貓爪亂舞：魔法陣 → 三道迴旋爪痕 → 花瓣爆散
//        Lv.10 流星貓拳：6 顆流星從天砸向附近的怪
//        Lv.20 貓神降臨：巨大雙層魔法陣 + 光柱 + 全場衝擊，主人 6 秒攻速提升
//  - 傷害只有「自己的夥伴」會算（記在主人名下回報伺服器）；朋友的夥伴只播特效
// ─────────────────────────────────────────────
import * as THREE from 'three';
import { createMonster, monsterReady } from './monsterModels.js';

const PINK = 0xff7ab8;
const rand = (a, b) => a + Math.random() * (b - a);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class Partner {
  /**
   * @param S     BattleScene
   * @param def   伺服器 config.partners[id]
   * @param owner 主人（actor）；home 模式可以是 null
   * @param mode  'follow' | 'home'
   * @param home  home 模式站的位置
   */
  constructor(S, def, owner, mode = 'follow', home = null, lv = 1) {
    this.S = S; this.def = def; this.owner = owner; this.mode = mode; this.home = home;
    this.lv = lv;
    this.dmgMul = def.dmg.base + def.dmg.per * (lv - 1);
    this.power = 1 + lv * 0.05; // 招式傷害成長
    this.skills = def.skills.filter((k) => lv >= k.unlock).map((k, i) => ({ ...k, t: 2 + i * 2.5 }));
    this.inst = monsterReady(def.model) ? createMonster(def.model, 1.85) : null;
    this.group = new THREE.Group();
    if (this.inst) this.group.add(this.inst.root);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: PINK, transparent: true, opacity: 0.6, depthWrite: false }));
    ring.position.y = 0.04;
    this.ring = ring;
    this.group.add(ring);
    const start = mode === 'home' ? home : owner.group.position;
    this.group.position.set(start.x + 1.5, 0, start.z + 1.5);
    this.facing = mode === 'home' ? Math.PI * 0.75 : 0;
    S.scene.add(this.group);
    this.atkT = 1;
    this.target = null;
    this.retargetT = 0;
    if (mode === 'follow') this._poof();
  }

  get local() { return !!this.owner?.local; }

  _poof() {
    const p = this.group.position;
    this.S.qfx.flash(p, 2.4, PINK, 0.35, 0.9);
    this.S.qfx.petals(p, 10, 0xffb3d1, 4);
    this.S.qfx.shock(p, 1.8, PINK, 0.35);
  }

  update(dt) {
    const S = this.S, g = this.group, p = g.position;
    g.visible = !S.duel;
    if (!g.visible) return;
    let goal = null, speed = 0;

    if (this.mode === 'home') {
      // 酒館門口：偶爾左右踱步
      this.retargetT -= dt;
      if (this.retargetT <= 0) { this.retargetT = rand(3, 6); this.wander = { x: this.home.x + rand(-1.5, 1.5), z: this.home.z + rand(-1, 1) }; }
      if (this.wander && flat(p, this.wander) > 0.3) { goal = this.wander; speed = 1.6; }
    } else {
      const o = this.owner.group.position;
      const dOwner = flat(p, o);
      if (dOwner > 16) { // 跟丟了 → 瞬移回主人身邊
        p.set(o.x - Math.sin(this.owner.facing) * 1.5 + 1, 0, o.z - Math.cos(this.owner.facing) * 1.5);
        this._poof();
      }
      // 找怪：自己附近、而且不能離主人太遠
      this.retargetT -= dt;
      if (this.retargetT <= 0 || (this.target && !this.target.alive)) {
        this.retargetT = 0.4;
        this.target = null;
        if (!S.map?.town) {
          let best = 7;
          for (const m of S.mobs) {
            if (!m.alive) continue;
            const d = flat(m.group.position, p);
            if (d < best && flat(m.group.position, o) < 14) { best = d; this.target = m; }
          }
        }
      }
      const ownerSpeed = 6.5 * (this.owner.riding ? this.owner.mountSpeed : 1);
      if (this.target) {
        const tp = this.target.group.position;
        if (flat(tp, p) > 1.8 + (this.target.boss ? this.target.radius : 0)) { goal = tp; speed = ownerSpeed + 1; }
      } else {
        // 站在主人左後方
        const f = this.owner.facing;
        const spot = { x: o.x - Math.sin(f) * 1.8 - Math.cos(f) * 1.2, z: o.z - Math.cos(f) * 1.8 + Math.sin(f) * 1.2 };
        const d = flat(p, spot);
        if (d > 0.6) { goal = spot; speed = d > 4 ? ownerSpeed + 1.5 : Math.min(ownerSpeed, 2 + d * 2); }
      }
      this._combat(dt);
    }

    // 移動 + 面向
    let moving = false;
    if (goal) {
      const dx = goal.x - p.x, dz = goal.z - p.z, len = Math.hypot(dx, dz) || 1;
      const step = Math.min(len, speed * dt);
      if (S.world) S.world.move(p, (dx / len) * step, (dz / len) * step, 0.4); else { p.x += (dx / len) * step; p.z += (dz / len) * step; }
      this.facing = Math.atan2(dx, dz);
      moving = true;
    } else if (this.target) {
      const tp = this.target.group.position;
      this.facing = Math.atan2(tp.x - p.x, tp.z - p.z);
    }
    p.y = S.gy(p.x, p.z);
    let dr = this.facing - g.rotation.y;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    g.rotation.y += dr * Math.min(1, dt * 10);
    if (this.inst) {
      const run = moving && speed > 4;
      this.inst.play(run ? 'Running' : 'Walking');
      this.inst.current.timeScale = moving ? (run ? 1 : 0.9) : 0.12;
      this.inst.mixer.update(dt);
      this.inst.root.position.y = this.hop > 0 ? Math.sin((1 - this.hop / 0.25) * Math.PI) * 0.35 : 0;
      this.hop = Math.max(0, (this.hop || 0) - dt);
    }
    this.ring.material.opacity = 0.45 + Math.sin(S.time * 4) * 0.15;
  }

  _combat(dt) {
    const S = this.S, p = this.group.position, Q = S.qfx;
    const t = this.target;
    this.atkT -= dt;
    for (const k of this.skills) k.t -= dt;
    if (!t || flat(t.group.position, p) > 2.8 + (t.boss ? t.radius : 0)) return;
    const b = S._dps(this.owner) * this.dmgMul;
    if (this.atkT <= 0) { // 普攻：粉色月牙 + 小火花
      this.atkT = 0.75;
      this.hop = 0.25;
      this.flip = !this.flip;
      Q.crescent(p, this.facing + (this.flip ? 0.4 : -0.4), 2.6, PINK, 0.2, { arc: 2.4, sweep: this.flip ? 2 : -2, tilt: this.flip ? 0.5 : -0.5, y: 0.8 });
      Q.sparks(t.group.position, 3, 0xffb3d1, 4, 0.3);
      if (this.local) S._damageArea(this.owner, p, 2.6, b * 0.75);
    }
    // 招式：大招優先
    for (const k of [...this.skills].reverse()) {
      if (k.t > 0) continue;
      k.t = k.cd;
      if (k.id === 'goddess') this._goddess(b, k);
      else if (k.id === 'meteor') this._meteor(b, k);
      else this._skill(b, k);
      break;
    }
  }

  /** 流星貓拳：鎖定附近最多 6 隻怪，流星一顆顆砸下 */
  _meteor(b, k) {
    const S = this.S, Q = S.qfx, p = this.group.position;
    Q.rune(p, 2.5, 0xffd166, 0.8, 5);
    Q.flash(p, 2.4, 0xffd166, 0.3, 1.8);
    this.hop = 0.25;
    const targets = S.mobs.filter((m) => m.alive && flat(m.group.position, p) < 10).slice(0, k.hits);
    while (targets.length < k.hits) targets.push({ group: { position: { x: p.x + rand(-5, 5), z: p.z + rand(-5, 5) } } });
    targets.forEach((m, i) => S._later(0.1 + i * 0.13, () => {
      const at = { x: m.group.position.x, z: m.group.position.z };
      Q.meteor(at, i % 2 ? PINK : 0xffd166, () => {
        if (this.local) S._damageArea(this.owner, at, k.radius, b * k.mult * this.power);
        if (this.local && i === 0) S.shake = Math.max(S.shake, 0.2);
      });
    }));
  }

  /** 貓神降臨：雙層魔法陣 + 光柱蓄力 → 全場衝擊 + 主人攻速提升 */
  _goddess(b, k) {
    const S = this.S, Q = S.qfx;
    const c0 = { x: this.group.position.x, z: this.group.position.z };
    Q.rune(c0, k.radius, 0xffd166, 1.4, 1.5);
    Q.rune(c0, k.radius * 0.55, PINK, 1.4, -3);
    Q.converge(c0, 30, 0xfff1c4, 5, 0.55, 1);
    Q.beam(c0, 1.4, 14, 0xffd166, 0.9);
    this.hop = 0.25;
    S._later(0.6, () => {
      const c = this.group.position;
      Q.flash(c, 10, 0xffd166, 0.55, 1.2);
      Q.light(c, 0xffd166, 70, 0.8, 26, 2);
      Q.shock(c, k.radius + 1, 0xfff1c4, 0.6);
      Q.shock(c, k.radius * 0.6, PINK, 0.45);
      Q.wall(c, 0.5, k.radius, 2, 0xffd166, 0.6);
      Q.petals(c, this.local ? 50 : 20, 0xffb3d1, 10);
      Q.embers(c, 30, 0xffd166, k.radius * 0.7, 1.8);
      Q.feathers(c, 10, 0xffffff, 2.2);
      if (this.local) {
        S._damageArea(this.owner, c, k.radius, b * k.mult * this.power);
        S.partnerBuffT = k.buff; // 主人攻速提升
        S._number(S.player.group.position, '攻速提升！', 'lvl', 0.8);
        S.shake = Math.max(S.shake, 0.35);
      }
    });
  }

  /** 貓爪亂舞：魔法陣 → 三道迴旋爪痕 → 花瓣爆散 + 光源 */
  _skill(b, def) {
    const S = this.S, Q = S.qfx;
    const p = { x: this.group.position.x, z: this.group.position.z };
    Q.rune(p, def.radius * 0.8, PINK, 1, 4);
    Q.converge(p, 16, 0xffd1e6, 2.5, 0.3, 0.9);
    [0, 1, 2].forEach((i) => S._later(0.15 + i * 0.12, () => {
      const c = this.group.position;
      this.hop = 0.25;
      Q.crescent(c, this.facing + i * 2.1, def.radius, i === 2 ? 0xffffff : PINK, 0.28, { arc: 3.2, sweep: 3, tilt: [-0.5, 0.4, 0][i], y: 0.8 });
      Q.sparks(c, 6, 0xffb3d1, 8, 0.4);
    }));
    S._later(0.5, () => {
      const c = this.group.position;
      Q.flash(c, 4, PINK, 0.4, 0.9);
      Q.light(c, PINK, 35, 0.45, 14);
      Q.shock(c, def.radius + 0.5, 0xffb3d1, 0.45);
      Q.petals(c, this.local ? 24 : 10, 0xffb3d1, 7);
      Q.embers(c, 12, PINK, 2, 1.3);
      if (this.local) S._damageArea(this.owner, c, def.radius, b * def.mult * this.power);
    });
  }

  dispose() {
    this.S.scene.remove(this.group);
    this.inst?.dispose();
    this.ring.geometry.dispose();
    this.ring.material.dispose();
  }
}
