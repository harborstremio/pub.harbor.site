import { CONNECTIONS_PER_IP, IP_SWEEP_INTERVAL_MS } from "./limits.js";

const counts = new Map();

export function ipAtLimit(ip) {
  if (!ip) return false;
  return (counts.get(ip) ?? 0) >= CONNECTIONS_PER_IP;
}

export function ipAdd(ip) {
  if (!ip) return;
  counts.set(ip, (counts.get(ip) ?? 0) + 1);
}

export function ipRemove(ip) {
  if (!ip) return;
  const n = counts.get(ip);
  if (n == null) return;
  if (n <= 1) counts.delete(ip);
  else counts.set(ip, n - 1);
}

export function ipCount() {
  return counts.size;
}

export function startIpSweeper() {
  return setInterval(() => {
    for (const [ip, n] of counts) {
      if (n <= 0) counts.delete(ip);
    }
  }, IP_SWEEP_INTERVAL_MS).unref?.() ?? null;
}
