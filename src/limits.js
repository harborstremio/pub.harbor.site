export const PORT = Number(process.env.RELAY_PORT || 8080);
export const HOST = process.env.RELAY_HOST || "127.0.0.1";
export const UNIX_SOCKET = process.env.RELAY_UNIX_SOCKET || "";

export const RELAY_VERSION = 9;

export const ROOM_CODE_RE = /^[A-Z0-9]{4,8}$/;
export const ROOM_PATH_RE = /^\/r\/[A-Z0-9]{4,8}$/;

export const HELLO_PAYLOAD_MAX = 768 * 1024;
export const MSG_PAYLOAD_MAX = 32 * 1024;
export const MAX_BACKPRESSURE_BYTES = 1024 * 1024;

export const HELLO_TYPES = new Set(["hello", "profile"]);

export const AVATAR_MAX = 600_000;
export const PROFILE_AVATAR_MAX = 4096;
export const NAME_MAX = 32;
export const CHAT_MAX = 500;
export const CLIENT_ID_MAX = 128;
export const MEDIA_ID_MAX = 256;
export const MEDIA_TITLE_MAX = 300;
export const URL_FIELD_MAX = 2000;
export const POSITION_SECONDS_MAX = 360_000;
export const UPDATED_AT_SKEW_MS = 1000 * 60 * 60 * 24;
export const STROKE_ID_MAX = 64;
export const DRAW_COLOR_MAX = 32;
export const PATH_MAX = 4096;
export const LOCATION_MAX_BYTES = 4096;

export const PARTICIPANTS_PER_ROOM = 32;
export const CONNECTIONS_PER_IP = Number(process.env.RELAY_CONN_PER_IP || 16);
export const ROOMS_TOTAL_MAX = 50_000;
export const CONNECTIONS_TOTAL_MAX = Number(process.env.RELAY_CONN_MAX || 40_000);

export const HELLO_DEADLINE_MS = 10_000;

export const RATE_REFILL_PER_SEC = 40;
export const RATE_BURST = 80;
export const DRAW_REFILL_PER_SEC = 40;
export const DRAW_BURST = 60;
export const CURSOR_REFILL_PER_SEC = 30;
export const CURSOR_BURST = 45;
export const PRESENCE_REFILL_PER_SEC = 4;
export const PRESENCE_BURST = 8;
export const CHAT_REFILL_PER_SEC = 2;
export const CHAT_BURST = 5;
export const STATE_REFILL_PER_SEC = 8;
export const STATE_BURST = 12;
export const CONTROL_REFILL_PER_SEC = 4;
export const CONTROL_BURST = 8;
export const PROFILE_REFILL_PER_SEC = 1;
export const PROFILE_BURST = 3;

export const OUT_BYTES_REFILL_PER_SEC = 256 * 1024;
export const OUT_BYTES_BURST = 512 * 1024;

export const ROOM_DRAW_REFILL_PER_SEC = 600;
export const ROOM_DRAW_BURST = 900;

export const NONHOST_STATE_MIN_GAP_MS = 500;
export const NONHOST_STATE_STALE_MS = 2000;
export const ROOM_NONHOST_STATE_MIN_GAP_MS = 200;

export const VIOLATION_LIMIT = 30;
export const VIOLATION_DECAY_PER_SEC = 6;
export const SATURATION_STRIKE_WEIGHT = 0.5;
export const SATURATION_WINDOW_MS = 2000;

export const IDLE_TIMEOUT_SEC = 120;
export const IDLE_OCCUPIED_MS = 1000 * 60 * 60 * 6;
export const IDLE_EMPTY_MS = 1000 * 30;
export const SWEEP_INTERVAL_MS = 1000 * 30;
export const IP_SWEEP_INTERVAL_MS = 1000 * 60;

export const SUMMON_VIEWS = new Set(["home", "discover", "anime", "queue", "addons"]);
export const COMMAND_ACTIONS = new Set(["play", "pause", "seek"]);
export const DRAW_PHASES = new Set(["start", "point", "end"]);
