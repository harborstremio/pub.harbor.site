# Harbor Watch Together relay

This is the relay behind Harbor's public Watch Together (pub.harbor.site). tiny, stateless, yours to run.

It passes WT between people in the same room. play, pause, seek, chat, cursors, and drawings. that's all it touches. does not touch: accounts, streams, credentials, database, disk, and it never logs what people send. rooms live in memory and vanish when everyone leaves.

## Run it

Node 20+.

```
npm ci --omit=dev
```

Then run `src/server.js`. it can sit on a unix socket (`RELAY_UNIX_SOCKET`, behind nginx) or a plain TCP port (`RELAY_HOST` and `RELAY_PORT`). keep it alive with systemd, pm2, (or whatever you use).

Put nginx or Caddy in front for HTTPS and the WebSocket upgrade, then point a domain at the box. any DNS host works. if you want your server's IP hidden and free DDoS cover, run it behind a proxy like Cloudflare. otherwise a plain A record and certbot does the job.

Lock the box down like any server, key-only SSH and a firewall.

## Check it

```
curl -s https://your-domain/health
```

should say `{"ok":true,"service":"harbor-together-relay","version":9,...}`.

## Use it

Harbor, Settings, Harbor Relay, paste `wss://your-domain`. start a room, join from another device, make sure play, pause, and seek stay together.

## Knobs

limits are in `src/limits.js`. connections per IP, room size, total cap, rate limits. a few you can set on the service without touching code: `RELAY_CONN_MAX`, `RELAY_CONN_PER_IP`, `RELAY_UNIX_SOCKET`, `RELAY_TRUST_PROXY`.

## Locally

```
npm install
npm run dev        # 127.0.0.1:8080
npm test
```

MIT. 