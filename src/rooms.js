import { Room } from "./room.js";
import {
  ROOMS_TOTAL_MAX,
  IDLE_OCCUPIED_MS,
  IDLE_EMPTY_MS,
  SWEEP_INTERVAL_MS,
} from "./limits.js";

const rooms = new Map();
let liveConnections = 0;

export function getRoom(code) {
  return rooms.get(code) ?? null;
}

export function getOrCreateRoom(code) {
  let r = rooms.get(code);
  if (r) return r;
  if (rooms.size >= ROOMS_TOTAL_MAX) return null;
  r = new Room(code);
  rooms.set(code, r);
  return r;
}

export function dropRoomIfEmpty(code) {
  const r = rooms.get(code);
  if (r && r.size() === 0) rooms.delete(code);
}

export function incConnections() {
  liveConnections += 1;
}

export function decConnections() {
  if (liveConnections > 0) liveConnections -= 1;
}

export function roomCount() {
  return rooms.size;
}

export function connectionCount() {
  return liveConnections;
}

export function startSweeper() {
  return setInterval(() => {
    const now = Date.now();
    for (const [code, r] of rooms) {
      if (r.size() === 0) {
        if (now - r.lastActivity > IDLE_EMPTY_MS) rooms.delete(code);
        continue;
      }
      if (now - r.lastActivity > IDLE_OCCUPIED_MS) {
        for (const [s] of r.peers) {
          try { s.end(1000, "idle"); } catch {}
        }
        r.peers.clear();
        rooms.delete(code);
      }
    }
  }, SWEEP_INTERVAL_MS).unref?.() ?? null;
}
