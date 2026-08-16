# Technical Design: WebSocket Relay Backend

## 1. Technical Approach

Swap the transport, keep the topology. Today PeerJS gives the host N `DataConnection` objects; after this change the host holds **one** socket to a relay and the server does the fan-out. Game logic stays 100% host-authoritative and untouched.

- **Server** (`server/`, new): Node + `ws`. A `Map<roomId, Room>` in memory, an `on('connection')` handler, and a dispatcher that routes by socket role. No game state, no DB, no auth.
- **Client** (`app.js` ~1067-1445): the "P2P Network Protocol" block is rewritten onto native `WebSocket`, preserving function names and call sites so the state machine, scoring, countdown, and rendering are not edited at all.
- **Two planes**: a *control plane* (`HELLO` / `HELLO_ACK` / `ERROR`, consumed by the socket layer only) and the existing *game plane* (the 6 message types, passed through the relay byte-for-byte). `handleHostMessage` / `handleClientMessage` never see a control frame, so the game protocol genuinely gains zero new types.

## 2. Architecture Decisions

| # | Decision | Choice | Alternatives rejected | Rationale |
|---|---|---|---|---|
| 1 | Room ID generation | **Client (host)** — keep `generateRoomId()` as-is; server validates uniqueness and rejects a taken ID | Server-assigned ID returned in `HELLO_ACK` | Zero UX change (teacher reads `ROOM-XXXX` off screen), zero rendering change, and the existing `HOST_ID_RETRY_LIMIT = 5` collision-retry loop ports 1:1. Server-side generation would buy nothing at 4-char/1.6M keyspace with one live room. |
| 2 | Socket identity | **`HELLO` frame sent immediately on `open`**: `{type:'HELLO', payload:{role:'host'\|'student', roomId}}`, answered with `HELLO_ACK` or `ERROR` | roomId in the URL query (`?room=X&role=host`); infer role from first game message | Raw WS has no peer identity — PeerJS gave it for free. An explicit frame keeps role/room binding symmetric for both sides, is inspectable in devtools, and lets the server reply with a real error code instead of only a close code. |
| 3 | Host disconnect | Server **deletes the room and closes every student socket with code `4001`** | Broadcast a `HOST_LEFT` message; keep the room orphaned awaiting reconnect | A close code is transport-level, so no new game message type is introduced (proposal constraint). Students already have no reconnection story; today a host reload kills the session the same way. |
| 4 | Room GC | Room dies with its host socket. Plus a 30s `ping`/`pong` liveness sweep (standard `ws` `isAlive` pattern) and a hard idle cap of **2h since last frame** | TTL-only expiry; no sweep | Half-open TCP (phone sleeps, WiFi drops) never fires `close`, so without a heartbeat a dead host holds its Room ID hostage. 2h comfortably exceeds a ~1h class. |
| 5 | Relay URL delivery | **Constant in `app.js`** with a hostname-based dev override | `config.js` global + extra `<script>`; `fetch('config.json')` at boot | Static site, no build step, no env injection. A constant is one line to edit, adds no request and no async boot ordering; the hostname check keeps `node server/src/index.js` + local page working unchanged. |
| 6 | Student disconnect | Remove socket from the room's student map; **host is not notified** | Emit a leave event to the host | Matches today's documented limitation ("no robust disconnect handling"). Explicitly out of proposal scope. |

```js
// app.js — decision 5
const RELAY_URL = ['localhost', '127.0.0.1'].includes(location.hostname)
  ? 'ws://localhost:8080'
  : 'wss://avatar-board-relay.onrender.com';
```

## 3. Data Flow

```text
[Host browser]              [Relay: server/]                [Student browser]
      |                            |                                |
      |-- HELLO{host, ROOM-A1} --->| rooms.set('ROOM-A1', {...})    |
      |<------- HELLO_ACK ---------|                                |
      |                            |<--- HELLO{student, ROOM-A1} ---|
      |                            |---------- HELLO_ACK ---------->|
      |                            |<--------- JOIN ----------------|
      |<-------- JOIN (unicast) ---|   (room lookup, no mutation)   |
      |--- JOIN_ACK ------------->|----------- JOIN_ACK ----------->|
      |                            |                                |
      |-- START_QUESTION --------->|===== broadcast to N students ==>|
      |                            |<--------- SUBMIT --------------|
      |<------ SUBMIT (unicast) ---|                                |
      |-- ROUND_END / SESSION_END >|===== broadcast to N students ==>|
      |                            |                                |
      X host socket closes         |-> delete room, close(4001) --->| "Host disconnected"
```

Scoring, leaderboard, and countdown all still run on the host between the `SUBMIT` and `ROUND_END` arrows — the relay is stateless with respect to them.

## 4. File Changes

| File | Action | Description |
|---|---|---|
| `server/package.json` | Create | `{type:'module'}`, dep `ws`, `start: node src/index.js`, `engines.node >=20` (for global `fetch`) |
| `server/src/index.js` | Create | `http.createServer` → `GET /health` → 200; `new WebSocketServer({server})`; binds `process.env.PORT`; starts self-ping + liveness sweep |
| `server/src/rooms.js` | Create | `Map<roomId, {hostSocket, students: Map<socket,true>, lastSeenAt}>` + `createRoom` / `joinRoom` / `dropSocket` / `sweepIdle` |
| `server/src/relay.js` | Create | `on('connection')`, `on('message')` dispatcher: `HELLO` → register; any other frame → unicast to host (student sender) or broadcast to students (host sender). Payloads never parsed beyond `.type` |
| `server/README.md` | Create | Local dev (`npm start`) + Render deploy steps |
| `render.yaml` | Create | `type: web`, `rootDir: server`, `buildCommand: npm install`, `startCommand: npm start`, free plan |
| `app.js` ~1067-1445 | Modify | See §5; `PEER_OPTIONS` deleted, transport functions rewritten |
| `app.js` 629-636, 1570 | Modify | `gameState.connections` removed from `resetGame()`; submit guard becomes `readyState === WebSocket.OPEN` |
| `index.html:161` | Delete | PeerJS CDN `<script>` |
| `README.md:3, 76-78` | Modify | Drop "100% P2P sin backend"; document the relay + cold start |
| `openspec/config.yaml:4-5` | Modify | Stack context: WebSocket relay, not PeerJS/WebRTC |

## 5. Interfaces / Contracts

**Control plane** (relay ↔ client only; never reaches game handlers):

```json
{"type":"HELLO","payload":{"role":"host","roomId":"ROOM-A1"}}
{"type":"HELLO_ACK","payload":{"roomId":"ROOM-A1","role":"host"}}
{"type":"ERROR","payload":{"code":"ROOM_TAKEN|ROOM_NOT_FOUND|BAD_HELLO"}}
```
Close codes: `4001` host left, `4002` protocol violation.

**Game plane**: `JOIN`, `JOIN_ACK`, `SUBMIT`, `START_QUESTION`, `ROUND_END`, `SESSION_END` — payload shapes unchanged from the exploration's contract table, including the ~80KB base64 `avatarImage` (relayed as a single text frame; `ws` handles fragmentation).

**Client function mapping** (same shapes, same call sites at `app.js:92, 133, 143, 149, 564, 617, 1041`):

| Today | After |
|---|---|
| `initHostPeer(attempt)` | `initHostSocket(attempt)` — open WS, send `HELLO`, `navigateTo('board')` on `HELLO_ACK`, retry on `ROOM_TAKEN` |
| `destroyHostPeer()` | `destroyHostSocket()` — `socket.close()`, clear `gameState.hostSocket` / `roomId` |
| `handleIncomingConnection(conn)` | *deleted* — one socket, no per-peer wiring |
| `handleHostMessage(conn, msg)` | `handleHostMessage(msg)` — `conn` param dropped, switch body identical |
| `registerRealStudent(conn, ...)` | `registerRealStudent(studentId, avatar, avatarImage)` — `JOIN_ACK` goes back through the relay |
| `broadcastToStudents(msg)` | `broadcastToStudents(msg)` — now a single `send(JSON.stringify(msg))`; server fans out |
| `joinRoom(roomId, ...)` | same signature — open WS, `HELLO{student}`, then `JOIN` on `HELLO_ACK` |
| `handleClientMessage(msg)` | unchanged body; fed `JSON.parse(event.data)` |

`gameState.peer` / `studentPeer` / `hostConnection` / `connections` → `gameState.hostSocket` and `gameState.relaySocket`.

**Cold start**: `setInterval(() => fetch(RENDER_EXTERNAL_URL + '/health'), 10 * 60_000)`, skipped when `RENDER_EXTERNAL_URL` is absent (local dev). Host UI: after 3s without `HELLO_ACK`, `setHostStatus('Waking server… up to 60s')`; after 90s, an error state.

## 6. Testing Strategy

No test framework exists (`strict_tdd: false`) — verification is manual and layered.

| Layer | What to verify | How |
|---|---|---|
| Server unit | Room registry behavior | `node --test` optional; otherwise drive `rooms.js` from a scratch script: duplicate host ID rejected, join-unknown-room rejected, host drop deletes room |
| Transport | All 6 types round-trip unmodified | Host tab + student tab against `ws://localhost:8080`; devtools WS frame inspector — compare each frame to the contract table |
| Cross-network (the actual bug) | **No same-WiFi requirement** | Laptop hosts on home WiFi; phone joins on **mobile data** (WiFi off). Must join, answer, and see `ROUND_END`. This is the case that failed under PeerJS/TURN |
| Fan-out | 40 concurrent students | Script N headless `ws` clients (or N phone tabs) sending `HELLO`+`JOIN`+`SUBMIT`; confirm host roster shows all N and no dropped submissions |
| Payload | 80KB avatar photo | Join with a real phone JPG; confirm it renders on the board after relay |
| Cold start | Render idle wake | Leave the service untouched 20+ min, then click Start Hosting: with self-ping the connect should be <5s; disable self-ping once to confirm the "Waking server…" UI appears instead of a hang |
| Lifecycle | Host disconnect | Close the host tab; every student must show "Host disconnected" (close `4001`), and re-registering the same Room ID must succeed |
| Regression | Simulator + scoring untouched | Run offline simulator mode and a full 5-question session; leaderboard and final ranking must behave exactly as before |

## 7. Migration / Rollout

No data migration — state is ephemeral on both sides. Deploy order: (1) `server/` to Render and confirm `/health`, (2) update `RELAY_URL`, (3) ship the `app.js` + `index.html` commit to GH Pages. Rollback is a single frontend revert per the proposal; the Render service can be left running.

## 8. Open Questions

- [ ] `specs/relay-server/spec.md` describes the student registering via "`JOIN` with Room ID". This design registers via `HELLO` and then relays `JOIN` unchanged. `sdd-tasks` should include a one-line spec-wording alignment so the spec names the `HELLO` frame explicitly.
- [ ] Render service name (drives the final `wss://` URL) is not chosen yet — pinned at apply time.
