# Avatar Board Relay Server

WebSocket relay for the interactive avatar board. It has no game logic and no
database — it only registers rooms and forwards frames between one host and
its students. See `openspec/changes/websocket-relay-backend/design.md` for
the full protocol and architecture.

> Room registry (`rooms.js`) and message dispatch (`relay.js`) ship in PR 3.
> This scaffold provides the HTTP + WebSocket transport, the `/health`
> endpoint, and the cold-start self-ping only.

## Local Development

```bash
cd server
npm install
npm start
```

The server listens on `process.env.PORT`, defaulting to `8080`. Once
running:

- `GET http://localhost:8080/health` → `200 ok`
- WebSocket clients connect to `ws://localhost:8080`

No `RENDER_EXTERNAL_URL` is set locally, so the self-ping keep-alive is
skipped automatically.

## Deploying to Render

1. Push this repo (or connect it) to Render as a **Web Service** using the
   root `render.yaml` blueprint (`rootDir: server`, `npm install` /
   `npm start`, free plan).
2. Render auto-injects `RENDER_EXTERNAL_URL` for the deployed service — no
   manual env var configuration is required. The server uses it to self-ping
   `/health` every 10 minutes so the free-tier instance doesn't cold-sleep
   between classes.
3. After the first deploy, confirm `GET {RENDER_EXTERNAL_URL}/health` returns
   `200`, then update the client's `RELAY_URL` (in `app.js`) to the
   deployed `wss://` URL.

## Environment Variables

| Variable | Source | Purpose |
|---|---|---|
| `PORT` | Render (auto) | Port the HTTP + WS server binds to |
| `RENDER_EXTERNAL_URL` | Render (auto) | Base URL used by the self-ping keep-alive; absent locally |
