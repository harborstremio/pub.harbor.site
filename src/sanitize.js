import { AVATAR_MAX, PROFILE_AVATAR_MAX } from "./limits.js";

const AVATAR_RE = /^data:image\/(png|webp|jpeg|gif);base64,/i;
const HTTP_RE = /^https?:\/\//i;
const COLOR_RE = /^#[0-9a-f]{6}$/i;

export function sanitizeAvatar(v) {
  if (typeof v !== "string") return null;
  if (v.length === 0 || v.length > AVATAR_MAX) return null;
  if (!AVATAR_RE.test(v) && !HTTP_RE.test(v)) return null;
  return v;
}

export function sanitizeProfileAvatar(v, prev) {
  if (typeof v !== "string") return null;
  if (v.length === 0) return null;
  if (HTTP_RE.test(v)) return v.length <= PROFILE_AVATAR_MAX ? v : null;
  if (v === prev) return v;
  if (AVATAR_RE.test(v) && v.length <= PROFILE_AVATAR_MAX) return v;
  return prev ?? null;
}

export function sanitizeColor(v) {
  if (typeof v !== "string") return null;
  if (!COLOR_RE.test(v)) return null;
  return v.toLowerCase();
}

export function clampName(v) {
  return (typeof v === "string" && v ? v : "Guest").toString().slice(0, 32);
}

export function clampStr(v, max) {
  return typeof v === "string" ? v.slice(0, max) : "";
}

export function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}
