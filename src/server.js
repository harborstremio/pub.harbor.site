import uWS from "uWebSockets.js";
import {
  PORT,
  HOST,
  UNIX_SOCKET,
  RELAY_VERSION,
  ROOM_CODE_RE,
  HELLO_PAYLOAD_MAX,
  MSG_PAYLOAD_MAX,
  MAX_BACKPRESSURE_BYTES,
  HELLO_DEADLINE_MS,
  IDLE_TIMEOUT_SEC,
  CONNECTIONS_TOTAL_MAX,
  ROOM_PATH_RE,
} from "./limits.js";
import {
  getOrCreateRoom,
  getRoom,
  dropRoomIfEmpty,
  roomCount,
  connectionCount,
  incConnections,
  decConnections,
  startSweeper,
} from "./rooms.js";
import { ipAtLimit, ipAdd, ipRemove, ipCount, startIpSweeper } from "./ipcap.js";
import { createLimiter, admit, payloadCapFor, strike } from "./guard.js";

const decoder = new TextDecoder();
const STARTED_AT = Date.now();
const TRUST_PROXY = process.env.RELAY_TRUST_PROXY !== "0";

function clientIp(res, req) {
  let socketIp = "";
  try {
    socketIp = decoder.decode(res.getRemoteAddressAsText());
  } catch {
    socketIp = "";
  }
  const loopback = socketIp === "" || socketIp === "127.0.0.1" || socketIp === "::1" || socketIp === "::ffff:127.0.0.1";
  if (TRUST_PROXY && loopback) {
    const cf = req.getHeader("cf-connecting-ip");
    if (cf) return cf;
    const xreal = req.getHeader("x-real-ip");
    if (xreal) return xreal;
    const xff = req.getHeader("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim();
  }
  return socketIp;
}

function jsonHeaders(res) {
  res.writeHeader("content-type", "application/json");
  res.writeHeader("access-control-allow-origin", "*");
}

const app = uWS.App();

app.get("/", (res) => {
  jsonHeaders(res);
  res.end(JSON.stringify({ ok: true, service: "harbor-together-relay", version: RELAY_VERSION }));
});

app.get("/health", (res) => {
  jsonHeaders(res);
  res.end(
    JSON.stringify({
      ok: true,
      service: "harbor-together-relay",
      version: RELAY_VERSION,
      rooms: roomCount(),
      connections: connectionCount(),
      ips: ipCount(),
      rssMb: Math.round(process.memoryUsage().rss / 1048576),
      uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
    }),
  );
});

app.ws("/r/:code", {
  compression: uWS.DISABLED,
  maxPayloadLength: HELLO_PAYLOAD_MAX,
  maxBackpressure: MAX_BACKPRESSURE_BYTES,
  idleTimeout: IDLE_TIMEOUT_SEC,
  maxLifetime: 0,
  closeOnBackpressureLimit: true,
  sendPingsAutomatically: true,

  upgrade: (res, req, context) => {
    const code = req.getParameter(0);
    if (!code || !ROOM_CODE_RE.test(code)) {
      res.writeStatus("404 Not Found").end("not found");
      return;
    }
    const ip = clientIp(res, req);
    const key = req.getHeader("sec-websocket-key");
    const proto = req.getHeader("sec-websocket-protocol");
    const ext = req.getHeader("sec-websocket-extensions");

    if (connectionCount() >= CONNECTIONS_TOTAL_MAX) {
      res.writeStatus("503 Service Unavailable").end("relay full");
      return;
    }
    if (ipAtLimit(ip)) {
      res.writeStatus("429 Too Many Requests").end("too many connections");
      return;
    }
    const room = getOrCreateRoom(code);
    if (!room) {
      res.writeStatus("503 Service Unavailable").end("relay full");
      return;
    }
    if (room.isFull()) {
      res.writeStatus("503 Service Unavailable").end("room full");
      return;
    }
    res.upgrade({ code, ip, room: null, limiter: null, counted: false, sawFrame: false }, key, proto, ext, context);
  },

  open: (ws) => {
    const data = ws.getUserData();
    const room = getRoom(data.code);
    if (!room || room.isFull()) {
      try { ws.end(1013, "unavailable"); } catch {}
      return;
    }
    ipAdd(data.ip);
    incConnections();
    data.counted = true;
    data.room = room;
    data.limiter = createLimiter();
    room.peers.set(ws, {
      clientId: null,
      name: "Guest",
      joinedAt: 0,
      ready: false,
      avatar: null,
      color: null,
      lastStateAt: 0,
    });
    setTimeout(() => {
      const peer = room.peers.get(ws);
      if (peer && !peer.clientId) try { ws.end(1008, "no_hello"); } catch {}
    }, HELLO_DEADLINE_MS).unref?.();
  },

  message: (ws, message, isBinary) => {
    const data = ws.getUserData();
    const now = Date.now();
    if (!data.room) return;
    if (isBinary) {
      if (strike(data.limiter, now)) try { ws.end(1008, "policy"); } catch {}
      return;
    }
    const peer = data.room.peers.get(ws);
    const helloed = peer && peer.clientId;
    const cap = !helloed && !data.sawFrame ? HELLO_PAYLOAD_MAX : MSG_PAYLOAD_MAX;
    data.sawFrame = true;
    if (message.byteLength > cap) {
      if (strike(data.limiter, now)) try { ws.end(1008, "policy"); } catch {}
      return;
    }
    let msg;
    try {
      msg = JSON.parse(decoder.decode(message));
    } catch {
      if (strike(data.limiter, now)) try { ws.end(1008, "policy"); } catch {}
      return;
    }
    if (!msg || typeof msg.t !== "string") {
      if (strike(data.limiter, now)) try { ws.end(1008, "policy"); } catch {}
      return;
    }
    if (message.byteLength > payloadCapFor(msg.t)) {
      if (strike(data.limiter, now)) try { ws.end(1008, "policy"); } catch {}
      return;
    }
    if (!helloed && msg.t !== "hello") return;
    if (!admit(data.limiter, msg.t, now)) return;
    data.room.dispatch(ws, msg, data.limiter);
  },

  close: (ws) => {
    const data = ws.getUserData();
    if (data.counted) {
      ipRemove(data.ip);
      decConnections();
      data.counted = false;
    }
    if (data.room) {
      data.room.onSocketClose(ws);
      dropRoomIfEmpty(data.room.code);
      data.room = null;
    }
  },
});

app.any("/*", (res, req) => {
  if (ROOM_PATH_RE.test(req.getUrl())) {
    res.writeStatus("426 Upgrade Required").end("expected websocket upgrade");
    return;
  }
  res.writeStatus("404 Not Found").end("not found");
});

startSweeper();
startIpSweeper();

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));

const listenCb = (token) => {
  const where = UNIX_SOCKET ? UNIX_SOCKET : `${HOST}:${PORT}`;
  if (token) {
    process.stdout.write(`harbor-together-relay v${RELAY_VERSION} listening on ${where}\n`);
  } else {
    process.stderr.write(`failed to listen on ${where}\n`);
    process.exit(1);
  }
};

if (UNIX_SOCKET) {
  app.listen_unix(listenCb, UNIX_SOCKET);
} else {
  app.listen(HOST, PORT, listenCb);
}
