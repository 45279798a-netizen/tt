// 戰鬥畫面 → 掛機同步之間的橋：把畫面上真的打倒的怪交給伺服器
let source = null;

export function setKillSource(fn) { source = fn; }

export function takeKills() {
  return source ? source() : { kills: 0, elites: 0, bossDmg: 0, raidDmg: 0 };
}
