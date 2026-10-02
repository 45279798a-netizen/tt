// ─────────────────────────────────────────────
// 即時連線（自動選擇方式）
//  1. 先試 WebSocket（最即時）
//  2. 連不上（被通道 / 防毒 / 瀏覽器擋掉）→ 自動改用 HTTP 輪詢「相容模式」
// status: { ok, mode: 'ws' | 'http', reason: '' | 'replaced' | 'unknown' | 'retry' }
// ─────────────────────────────────────────────
import { auth } from './api.js';
const POS_MS = 100;
const POLL_MS = 150;
const WS_OPEN_TIMEOUT = 4000;

export class Net {
  constructor({ getPos, onState, onFx, onEvent, onStatus } = {}) {
    this.onEvent = onEvent;
    this.getPos = getPos;
    this.onState = onState;
    this.onFx = onFx;
    this.onStatus = onStatus;
    this.closed = false;
    this.wsFails = 0;
    this.pending = []; // 相容模式下等著送出的訊息
    this.start();
  }

  status(s) { this.onStatus?.(s); }

  /** 重新開始（例如「這角色在別處登入」之後按重新連線） */
  start() {
    this.stopAll();
    this.closed = false;
    this.wsFails = 0;
    this.connectWs();
  }

  stopAll() {
    clearTimeout(this.retryTimer);
    clearTimeout(this.openTimer);
    clearInterval(this.posTimer);
    clearTimeout(this.pollTimer);
    this.polling = false;
    if (this.ws) { this.ws.onclose = null; this.ws.close(); this.ws = null; }
  }

  // ── WebSocket ─────────────────────────────
  connectWs() {
    if (this.closed) return;
    let ws;
    try {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws`);
    } catch {
      return this.startPolling();
    }
    this.ws = ws;
    let opened = false;
    this.openTimer = setTimeout(() => { if (!opened) { ws.onclose = null; ws.close(); this.wsFailed(); } }, WS_OPEN_TIMEOUT);

    ws.onopen = () => {
      opened = true;
      clearTimeout(this.openTimer);
      this.wsFails = 0;
      ws.send(JSON.stringify({ t: 'hello', token: auth.get() }));
      this.posTimer = setInterval(() => this.sendWs({ t: 'pos', ...this.getPos() }), POS_MS);
      this.status({ ok: true, mode: 'ws', reason: '' });
    };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      this.dispatch(m);
    };
    ws.onclose = (e) => {
      clearTimeout(this.openTimer);
      clearInterval(this.posTimer);
      this.onState?.([]);
      if (this.closed) return;
      if (e.code === 4000) return this.status({ ok: false, mode: 'ws', reason: 'replaced' });
      if (e.code === 4004) return this.status({ ok: false, mode: 'ws', reason: 'unknown' });
      this.wsFailed();
    };
  }

  wsFailed() {
    this.wsFails += 1;
    if (this.wsFails >= 2) return this.startPolling(); // 連兩次都失敗 → 改相容模式
    this.status({ ok: false, mode: 'ws', reason: 'retry' });
    this.retryTimer = setTimeout(() => this.connectWs(), 1500);
  }

  dispatch(m) {
    if (m.t === 'state') this.onState?.(m.players, m.boss ?? null);
    else if (m.t === 'fx') this.onFx?.(m);
    else this.onEvent?.(m); // 決鬥相關
  }

  /** 送任何訊息（決鬥邀請、出手判定…），兩種連線方式都通 */
  send(msg) {
    if (this.polling) { if (this.pending.length < 30) this.pending.push(msg); }
    else this.sendWs(msg);
  }

  sendWs(msg) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  // ── HTTP 輪詢（相容模式） ──────────────────
  startPolling() {
    if (this.closed || this.polling) return;
    this.polling = true;
    this.ws = null;
    const tick = async () => {
      if (!this.polling) return;
      const msgs = this.pending.splice(0);
      try {
        const res = await fetch('/api/rt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-token': auth.get() },
          body: JSON.stringify({ pos: this.getPos(), msgs }),
        });
        if (res.status === 401) { this.polling = false; return this.status({ ok: false, mode: 'http', reason: 'unknown' }); }
        if (!res.ok) throw new Error(res.status);
        const d = await res.json();
        this.onState?.(d.players, d.boss ?? null);
        d.events.forEach((m) => this.dispatch(m));
        this.status({ ok: true, mode: 'http', reason: '' });
      } catch {
        this.status({ ok: false, mode: 'http', reason: 'retry' });
      }
      if (this.polling) this.pollTimer = setTimeout(tick, POLL_MS);
    };
    tick();
  }

  // ── 出招 ──────────────────────────────────
  fx(kind) {
    if (!this.polling) this.sendWs({ t: 'pos', ...this.getPos() }); // 先送最新位置，特效才會出現在對的地方
    this.send({ t: 'fx', k: kind });
  }

  close() {
    this.closed = true;
    this.stopAll();
  }
}
