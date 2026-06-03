import {
  PARTICIPANTS_PER_ROOM,
  NAME_MAX,
  NONHOST_STATE_MIN_GAP_MS,
  NONHOST_STATE_STALE_MS,
  ROOM_NONHOST_STATE_MIN_GAP_MS,
  ROOM_DRAW_BURST,
  MAX_BACKPRESSURE_BYTES,
} from "./limits.js";
import { sanitizeAvatar, sanitizeProfileAvatar, sanitizeColor, clampName } from "./sanitize.js";
import { allowOutBytes, strike } from "./guard.js";
import { validState, validCommand } from "./validate.js";
import { onChat, onInvite, onSummon, onCursor, onDraw, onPresence } from "./relay-handlers.js";

export class Room {
  constructor(code) {
    this.code = code;
    this.peers = new Map();
    this.byClientId = new Map();
    this.syncState = null;
    this.hostClientId = null;
    this.started = false;
    this.lastActivity = Date.now();
    this.lastNonHostStateAt = 0;
    this.drawTokens = ROOM_DRAW_BURST;
    this.drawTokensAt = Date.now();
  }

  size() {
    return this.peers.size;
  }

  isFull() {
    return this.peers.size >= PARTICIPANTS_PER_ROOM;
  }

  touch() {
    this.lastActivity = Date.now();
  }

  dispatch(ws, msg, limiter) {
    this.touch();
    switch (msg.t) {
      case "hello":
        return this.onHello(ws, msg);
      case "profile":
        return this.onProfile(ws, msg, limiter);
      case "leave":
        return this.onLeave(ws);
      case "state":
        return this.onState(ws, msg, limiter);
      case "cmd":
        return this.onCommand(ws, msg);
      case "chat":
        return onChat(this, ws, msg, limiter);
      case "invite":
        return onInvite(this, ws, msg, limiter);
      case "ready":
        return this.onReady(ws, msg);
      case "host-leaving":
        return this.onHostLeaving(ws);
      case "claim-host":
        return this.onClaimHost(ws, msg);
      case "start":
        return this.onStart(ws);
      case "summon":
        return onSummon(this, ws, msg, limiter);
      case "cursor":
        return onCursor(this, ws, msg, limiter);
      case "draw":
        return onDraw(this, ws, msg, limiter);
      case "presence":
        return onPresence(this, ws, msg, limiter);
      case "ping":
        return this.send(ws, { t: "pong", srvAt: Date.now() });
    }
  }

  onHello(ws, msg) {
    const peer = this.peers.get(ws);
    if (!peer || peer.clientId) return;
    if (!msg.clientId || typeof msg.clientId !== "string" || msg.clientId.length > 128) {
      this.send(ws, { t: "error", code: "missing_client_id", message: "clientId required" });
      try { ws.end(1008, "missing_client_id"); } catch {}
      return;
    }
    const prev = this.byClientId.get(msg.clientId);
    if (prev && prev !== ws) {
      this.peers.delete(prev);
      try { prev.end(1000, "replaced"); } catch {}
    }

    peer.clientId = msg.clientId;
    peer.name = clampName(msg.name);
    peer.avatar = sanitizeAvatar(msg.avatar);
    peer.color = sanitizeColor(msg.color);
    peer.joinedAt = Date.now();
    peer.ready = false;
    peer.lastStateAt = 0;
    this.byClientId.set(msg.clientId, ws);

    const becameHost = !this.hostClientId;
    if (becameHost) this.hostClientId = peer.clientId;

    const participants = this.participants();
    this.send(ws, {
      t: "joined",
      room: "",
      participants,
      state: this.syncState,
      hostClientId: this.hostClientId,
      started: this.started,
      srvAt: Date.now(),
    });

    this.broadcast(
      {
        t: "participant-joined",
        participant: {
          id: peer.clientId,
          name: peer.name,
          joinedAt: peer.joinedAt,
          ready: false,
          avatar: peer.avatar,
          color: peer.color,
        },
      },
      ws,
    );
    if (becameHost) this.broadcast({ t: "host", hostClientId: this.hostClientId }, ws);
  }

  onProfile(ws, msg, limiter) {
    const peer = this.peers.get(ws);
    if (!peer || !peer.clientId) return;
    if (typeof msg.name === "string") peer.name = msg.name.slice(0, NAME_MAX);
    peer.avatar = sanitizeProfileAvatar(msg.avatar, peer.avatar);
    peer.color = sanitizeColor(msg.color);
    this.broadcast(
      {
        t: "participant-profile",
        participant: { id: peer.clientId, name: peer.name, avatar: peer.avatar, color: peer.color },
      },
      null,
      limiter,
    );
  }

  onReady(ws, msg) {
    const peer = this.peers.get(ws);
    if (!peer || !peer.clientId) return;
    peer.ready = !!msg.ready;
    this.broadcast({ t: "participant-ready", clientId: peer.clientId, ready: peer.ready });
  }

  onClaimHost(ws, msg) {
    const peer = this.peers.get(ws);
    if (!peer || !peer.clientId) return;
    if (this.hostClientId === peer.clientId && !msg.fresh) return;
    this.hostClientId = peer.clientId;
    this.broadcast({ t: "host", hostClientId: this.hostClientId });
    if (msg.fresh) {
      this.started = false;
      this.broadcast({ t: "started", started: false });
      for (const p of this.peers.values()) {
        if (!p.clientId || !p.ready) continue;
        p.ready = false;
        this.broadcast({ t: "participant-ready", clientId: p.clientId, ready: false });
      }
    }
  }

  onStart(ws) {
    const peer = this.peers.get(ws);
    if (!peer || !peer.clientId || this.hostClientId !== peer.clientId) return;
    this.started = true;
    this.broadcast({ t: "started", started: true });
  }

  onState(ws, msg, limiter) {
    const peer = this.peers.get(ws);
    if (!peer || !peer.clientId || !msg.state) return;
    if (!validState(msg.state, peer.clientId)) return;
    const isHostWrite = this.hostClientId != null && peer.clientId === this.hostClientId;
    if (this.hostClientId != null && !isHostWrite) return;
    const now = Date.now();
    if (!isHostWrite) {
      if (now - this.lastNonHostStateAt < ROOM_NONHOST_STATE_MIN_GAP_MS) return;
      if (now - peer.lastStateAt < NONHOST_STATE_MIN_GAP_MS) return;
      if (this.syncState && msg.state.updatedAt < this.syncState.updatedAt - NONHOST_STATE_STALE_MS) return;
      this.lastNonHostStateAt = now;
    }
    peer.lastStateAt = now;
    const stamped = { ...msg.state, hostClientId: this.hostClientId };
    this.syncState = stamped;
    this.broadcast({ t: "state", state: stamped, srvAt: now }, ws, limiter);
  }

  onCommand(ws, msg) {
    const peer = this.peers.get(ws);
    if (!peer || !peer.clientId || !validCommand(msg.command)) return;
    if (!this.hostClientId || peer.clientId === this.hostClientId) return;
    const hostWs = this.byClientId.get(this.hostClientId);
    if (hostWs) this.send(hostWs, { t: "cmd", from: peer.clientId, command: msg.command });
  }

  onHostLeaving(ws) {
    const peer = this.peers.get(ws);
    if (!peer || !peer.clientId || this.hostClientId !== peer.clientId) return;
    this.broadcast(
      { t: "host-leaving", from: peer.clientId, name: peer.name, at: Date.now() },
      ws,
    );
    this.reassignHost(peer.clientId);
  }

  onLeave(ws) {
    const peer = this.peers.get(ws);
    if (!peer) return;
    this.removePeer(ws, peer);
    try { ws.end(1000, "left"); } catch {}
  }

  onSocketClose(ws) {
    const peer = this.peers.get(ws);
    if (!peer) return;
    this.removePeer(ws, peer);
  }

  removePeer(ws, peer) {
    this.peers.delete(ws);
    if (!peer.clientId) return;
    if (this.byClientId.get(peer.clientId) === ws) this.byClientId.delete(peer.clientId);
    this.broadcast({ t: "participant-left", clientId: peer.clientId, name: peer.name });
    if (this.hostClientId === peer.clientId) this.reassignHost();
  }

  reassignHost(excludeClientId) {
    let next = null;
    for (const p of this.peers.values()) {
      if (!p.clientId) continue;
      if (excludeClientId && p.clientId === excludeClientId) continue;
      if (!next || p.joinedAt < next.joinedAt) next = p;
    }
    this.hostClientId = next ? next.clientId : null;
    this.broadcast({ t: "host", hostClientId: this.hostClientId });
  }

  participants() {
    const out = [];
    for (const p of this.peers.values()) {
      if (!p.clientId) continue;
      out.push({
        id: p.clientId,
        name: p.name,
        joinedAt: p.joinedAt,
        ready: !!p.ready,
        avatar: p.avatar ?? null,
        color: p.color ?? null,
      });
    }
    return out;
  }

  send(ws, msg) {
    try {
      if (ws.getBufferedAmount() > MAX_BACKPRESSURE_BYTES) {
        ws.end(1009, "backpressure");
        return;
      }
      ws.send(JSON.stringify(msg), false, false);
    } catch {}
  }

  broadcast(msg, except, limiter) {
    const fanout = this.peers.size - (except ? 1 : 0);
    if (fanout <= 0) return;
    const payload = JSON.stringify(msg);
    if (limiter && !allowOutBytes(limiter, payload.length * fanout, Date.now())) {
      if (strike(limiter, Date.now())) {
        try { except?.end?.(1008, "policy"); } catch {}
      }
      return;
    }
    const first = this.peers.keys().next().value;
    if (first && typeof first.cork === "function") first.cork(() => this.fan(payload, except));
    else this.fan(payload, except);
  }

  fan(payload, except) {
    for (const [s, p] of this.peers) {
      if (s === except || !p.clientId) continue;
      try {
        if (s.getBufferedAmount() > MAX_BACKPRESSURE_BYTES) {
          s.end(1009, "backpressure");
          continue;
        }
        s.send(payload, false, false);
      } catch {}
    }
  }
}
