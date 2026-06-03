import {
  COMMAND_ACTIONS,
  DRAW_PHASES,
  SUMMON_VIEWS,
  MEDIA_ID_MAX,
  MEDIA_TITLE_MAX,
  URL_FIELD_MAX,
  STROKE_ID_MAX,
  POSITION_SECONDS_MAX,
  UPDATED_AT_SKEW_MS,
  LOCATION_MAX_BYTES,
} from "./limits.js";
import { isFiniteNumber } from "./sanitize.js";

export function validState(s, clientId) {
  if (!s || typeof s !== "object") return false;
  if (!isFiniteNumber(s.positionSeconds) || s.positionSeconds < 0 || s.positionSeconds > POSITION_SECONDS_MAX) return false;
  if (!isFiniteNumber(s.updatedAt)) return false;
  if (Math.abs(s.updatedAt - Date.now()) > UPDATED_AT_SKEW_MS) return false;
  if (typeof s.playing !== "boolean") return false;
  if (s.mediaId != null && typeof s.mediaId !== "string") return false;
  if (s.mediaTitle != null && typeof s.mediaTitle !== "string") return false;
  if (s.posterUrl != null && typeof s.posterUrl !== "string") return false;
  if (
    s.episode != null &&
    !(typeof s.episode === "object" && isFiniteNumber(s.episode.season) && isFiniteNumber(s.episode.episode))
  )
    return false;
  if (typeof s.updatedBy !== "string" || s.updatedBy !== clientId) return false;
  if (typeof s.mediaId === "string" && s.mediaId.length > MEDIA_ID_MAX) return false;
  if (typeof s.mediaTitle === "string" && s.mediaTitle.length > MEDIA_TITLE_MAX) return false;
  if (typeof s.posterUrl === "string" && s.posterUrl.length > URL_FIELD_MAX) return false;
  return true;
}

export function validLocation(loc) {
  if (!loc || typeof loc !== "object") return undefined;
  let serialized;
  try {
    serialized = JSON.stringify(loc);
  } catch {
    return undefined;
  }
  if (serialized.length > LOCATION_MAX_BYTES) return undefined;
  return loc;
}

export function validCommand(c) {
  if (!c || typeof c.action !== "string" || !COMMAND_ACTIONS.has(c.action)) return false;
  if (c.action === "seek" && (!isFiniteNumber(c.positionSeconds) || c.positionSeconds < 0)) return false;
  return true;
}

export function validInvite(inv) {
  if (!inv || typeof inv.mediaId !== "string" || inv.mediaId.length === 0) return false;
  if (inv.mediaId.length > MEDIA_ID_MAX) return false;
  if ((inv.posterUrl?.length ?? 0) > URL_FIELD_MAX) return false;
  if ((inv.backgroundUrl?.length ?? 0) > URL_FIELD_MAX) return false;
  if ((inv.logoUrl?.length ?? 0) > URL_FIELD_MAX) return false;
  if ((inv.mediaTitle?.length ?? 0) > MEDIA_TITLE_MAX) return false;
  return true;
}

export function validSummonTarget(t) {
  if (!t || typeof t !== "object") return false;
  const okMeta = typeof t.mediaId === "string" && t.mediaId.length > 0 && t.mediaId.length <= MEDIA_ID_MAX;
  const okView = typeof t.view === "string" && SUMMON_VIEWS.has(t.view);
  return okMeta || okView;
}

export function validDrawPhase(p) {
  return typeof p === "string" && DRAW_PHASES.has(p) ? p : null;
}

export function validStrokeId(id) {
  return typeof id === "string" && id.length > 0 && id.length <= STROKE_ID_MAX;
}
