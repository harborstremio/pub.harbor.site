import { CHAT_MAX, DRAW_COLOR_MAX, PATH_MAX, ROOM_DRAW_REFILL_PER_SEC, ROOM_DRAW_BURST } from "./limits.js";
import { clampStr } from "./sanitize.js";
import { noteSaturation } from "./guard.js";
import { validInvite, validSummonTarget, validDrawPhase, validStrokeId, validLocation } from "./validate.js";

export function onChat(room, ws, msg, limiter) {
  const peer = room.peers.get(ws);
  if (!peer || !peer.clientId) return;
  const text = (typeof msg.text === "string" ? msg.text : "").trim().slice(0, CHAT_MAX);
  if (!text) return;
  room.broadcast({ t: "chat", from: peer.clientId, name: peer.name, text, at: Date.now() }, null, limiter);
}

export function onInvite(room, ws, msg, limiter) {
  const peer = room.peers.get(ws);
  if (!peer || !peer.clientId || !validInvite(msg.invite)) return;
  room.broadcast(
    { t: "invite", from: peer.clientId, name: peer.name, invite: msg.invite, at: Date.now() },
    ws,
    limiter,
  );
}

export function onSummon(room, ws, msg, limiter) {
  const peer = room.peers.get(ws);
  if (!peer || !peer.clientId || !validSummonTarget(msg.target)) return;
  room.broadcast(
    { t: "summon", from: peer.clientId, name: peer.name, target: msg.target, at: Date.now() },
    ws,
    limiter,
  );
}

export function onCursor(room, ws, msg, limiter) {
  const peer = room.peers.get(ws);
  if (!peer || !peer.clientId) return;
  if (typeof msg.x !== "number" || typeof msg.y !== "number") return;
  if (!Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
  room.broadcast(
    {
      t: "cursor",
      from: peer.clientId,
      name: peer.name,
      x: msg.x,
      y: msg.y,
      visible: !!msg.visible,
      path: clampStr(msg.path, PATH_MAX),
    },
    ws,
    limiter,
  );
}

export function drawAllowance(room, now) {
  const elapsed = (now - room.drawTokensAt) / 1000;
  room.drawTokensAt = now;
  room.drawTokens = Math.min(ROOM_DRAW_BURST, room.drawTokens + elapsed * ROOM_DRAW_REFILL_PER_SEC);
  const fanout = room.peers.size - 1;
  if (fanout <= 0) return false;
  if (room.drawTokens < fanout) return true;
  room.drawTokens -= fanout;
  return false;
}

export function onDraw(room, ws, msg, limiter) {
  const peer = room.peers.get(ws);
  if (!peer || !peer.clientId) return;
  if (!validStrokeId(msg.strokeId)) return;
  const phase = validDrawPhase(msg.phase);
  if (!phase) return;
  const now = Date.now();
  const starved = drawAllowance(room, now);
  if (limiter && noteSaturation(limiter, starved, now)) {
    try { ws.end(1008, "policy"); } catch {}
    return;
  }
  if (starved) return;
  room.broadcast(
    {
      t: "draw",
      from: peer.clientId,
      name: peer.name,
      strokeId: msg.strokeId,
      phase,
      x: typeof msg.x === "number" && Number.isFinite(msg.x) ? msg.x : undefined,
      y: typeof msg.y === "number" && Number.isFinite(msg.y) ? msg.y : undefined,
      color: typeof msg.color === "string" ? msg.color.slice(0, DRAW_COLOR_MAX) : undefined,
      path: clampStr(msg.path, PATH_MAX),
    },
    ws,
    limiter,
  );
}

export function onPresence(room, ws, msg, limiter) {
  const peer = room.peers.get(ws);
  if (!peer || !peer.clientId) return;
  room.broadcast(
    {
      t: "presence",
      from: peer.clientId,
      activeAt: Date.now(),
      location: validLocation(msg && msg.location),
    },
    ws,
    limiter,
  );
}
