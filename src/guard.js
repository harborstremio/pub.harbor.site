import {
  RATE_REFILL_PER_SEC,
  RATE_BURST,
  DRAW_REFILL_PER_SEC,
  DRAW_BURST,
  CURSOR_REFILL_PER_SEC,
  CURSOR_BURST,
  PRESENCE_REFILL_PER_SEC,
  PRESENCE_BURST,
  CHAT_REFILL_PER_SEC,
  CHAT_BURST,
  STATE_REFILL_PER_SEC,
  STATE_BURST,
  CONTROL_REFILL_PER_SEC,
  CONTROL_BURST,
  PROFILE_REFILL_PER_SEC,
  PROFILE_BURST,
  OUT_BYTES_REFILL_PER_SEC,
  OUT_BYTES_BURST,
  HELLO_TYPES,
  HELLO_PAYLOAD_MAX,
  MSG_PAYLOAD_MAX,
  VIOLATION_LIMIT,
  VIOLATION_DECAY_PER_SEC,
  SATURATION_STRIKE_WEIGHT,
  SATURATION_WINDOW_MS,
} from "./limits.js";

function bucket(burst) {
  return { tokens: burst, last: Date.now() };
}

function take(b, refill, burst, now, cost = 1) {
  const elapsed = (now - b.last) / 1000;
  b.last = now;
  b.tokens = Math.min(burst, b.tokens + elapsed * refill);
  if (b.tokens < cost) return false;
  b.tokens -= cost;
  return true;
}

export function createLimiter() {
  const now = Date.now();
  return {
    global: bucket(RATE_BURST),
    draw: bucket(DRAW_BURST),
    cursor: bucket(CURSOR_BURST),
    presence: bucket(PRESENCE_BURST),
    chat: bucket(CHAT_BURST),
    state: bucket(STATE_BURST),
    control: bucket(CONTROL_BURST),
    profile: bucket(PROFILE_BURST),
    out: bucket(OUT_BYTES_BURST),
    violations: 0,
    violationsLast: now,
    saturatedSince: 0,
  };
}

const CLOCK_CRITICAL = new Set(["state", "cmd", "hello", "ping", "leave"]);

export function allowGlobal(l, now) {
  return take(l.global, RATE_REFILL_PER_SEC, RATE_BURST, now);
}

export function allowKind(l, kind, now) {
  switch (kind) {
    case "draw":
      return take(l.draw, DRAW_REFILL_PER_SEC, DRAW_BURST, now);
    case "cursor":
      return take(l.cursor, CURSOR_REFILL_PER_SEC, CURSOR_BURST, now);
    case "presence":
      return take(l.presence, PRESENCE_REFILL_PER_SEC, PRESENCE_BURST, now);
    case "chat":
      return take(l.chat, CHAT_REFILL_PER_SEC, CHAT_BURST, now);
    case "state":
    case "cmd":
      return take(l.state, STATE_REFILL_PER_SEC, STATE_BURST, now);
    case "profile":
      return take(l.profile, PROFILE_REFILL_PER_SEC, PROFILE_BURST, now);
    case "invite":
    case "summon":
    case "ready":
    case "claim-host":
    case "host-leaving":
    case "start":
      return take(l.control, CONTROL_REFILL_PER_SEC, CONTROL_BURST, now);
    default:
      return true;
  }
}

export function admit(l, kind, now) {
  if (CLOCK_CRITICAL.has(kind)) return allowKind(l, kind, now);
  if (!allowGlobal(l, now)) return false;
  return allowKind(l, kind, now);
}

export function allowOutBytes(l, bytes, now) {
  return take(l.out, OUT_BYTES_REFILL_PER_SEC, OUT_BYTES_BURST, now, bytes);
}

export function payloadCapFor(type) {
  return HELLO_TYPES.has(type) ? HELLO_PAYLOAD_MAX : MSG_PAYLOAD_MAX;
}

export function strike(l, now, weight = 1) {
  const elapsed = (now - l.violationsLast) / 1000;
  l.violationsLast = now;
  l.violations = Math.max(0, l.violations - elapsed * VIOLATION_DECAY_PER_SEC) + weight;
  return l.violations >= VIOLATION_LIMIT;
}

export function noteSaturation(l, dropped, now) {
  if (!dropped) {
    l.saturatedSince = 0;
    return false;
  }
  if (l.saturatedSince === 0) {
    l.saturatedSince = now;
    return false;
  }
  if (now - l.saturatedSince < SATURATION_WINDOW_MS) return false;
  l.saturatedSince = now;
  return strike(l, now, SATURATION_STRIKE_WEIGHT);
}
