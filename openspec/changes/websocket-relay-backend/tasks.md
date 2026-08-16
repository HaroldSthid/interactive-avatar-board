# Implementation Tasks: WebSocket Relay Backend

## Review Workload Forecast
Chained PRs recommended: Yes
400-line budget risk: High
Decision needed before apply: Yes
Estimated changed lines: ~850-1100 lines (server/ ~350-450 new; app.js P2P block rewrite ~450-550 changed; index.html/README/spec/config ~80-120 changed)
Chain strategy: Not yet chosen — orchestrator must ask the user (`stacked-to-main` vs `feature-branch-chain`) before `sdd-apply` starts Phase 2+. Phase 1 (spec-only) is safe to land regardless of the chosen strategy.

Rationale: this change has two independently reviewable halves — a brand-new `server/` (backend, ~350-450 LOC) and a rewrite of `app.js`'s existing P2P block (~378 lines touched at minimum, plus scattered call-site edits). Neither half alone risks 400 lines, but landing them as one PR would. Each work unit below is designed to be a standalone commit and a candidate PR boundary.

---

## Phase 1: Spec Alignment (PR 1 — docs only, no code)

- [x] Task 1: Update `openspec/changes/websocket-relay-backend/specs/relay-server/spec.md` — "Student Room Join" requirement and its two scenarios currently say the student "sends `JOIN` with Room ID" as the registration act. Rewrite to match `design.md` §1/§5: the student first sends a `HELLO` control-plane frame (`{type:'HELLO', payload:{role:'student', roomId}}`), the relay validates the room and replies `HELLO_ACK` or `ERROR`, and only after `HELLO_ACK` does the client send the existing `JOIN` game-plane message which the relay unicasts to the host. Update the requirement text and both scenarios ("Student joins an existing room" / "Student attempts to join a non-existent room") to name `HELLO`/`HELLO_ACK`/`ERROR` explicitly as the registration step, keeping `JOIN` as the subsequent game-plane message.
  - Satisfies: `specs/relay-server/spec.md` — Student Room Join (resolves the spec/design conflict noted in `design.md` §8 Open Questions)
  - Depends on: nothing
  - Parallelizable: yes (independent of all other tasks; must land or at least be correct in working tree before Phase 3+ implementation begins, since implementers should read a spec that matches what they're building)

- [x] Task 2: Verify "Room Registration" and "Message Relay Routing" requirements in the same spec file don't need matching edits (they already describe the room registry / unicast-broadcast behavior in transport-agnostic terms and don't reference `JOIN` as the identity step) — no changes expected, confirm by re-read.
  - Satisfies: `specs/relay-server/spec.md` consistency check
  - Depends on: Task 1
  - Parallelizable: no (trivial, sequential confirmation)

---

## Phase 2: Server Scaffold (PR 2)

- [x] Task 3: Create `server/package.json` — `{"type":"module"}`, dependency `ws`, `"start": "node src/index.js"`, `engines.node >= 20`.
  - Satisfies: `design.md` §4 File Changes
  - Depends on: nothing (can start in parallel with Phase 1)
  - Parallelizable: yes

- [x] Task 4: Create `server/src/index.js` — `http.createServer` serving `GET /health` → 200, `new WebSocketServer({server})`, binds `process.env.PORT`, wires the self-ping interval (`fetch(RENDER_EXTERNAL_URL + '/health')` every 10 min, skipped when `RENDER_EXTERNAL_URL` is absent) and starts the 30s liveness sweep from `rooms.js`.
  - Satisfies: `specs/relay-server/spec.md` — Cold-Start Self-Ping
  - Depends on: Task 3
  - Parallelizable: no

- [x] Task 5: Create `render.yaml` — `type: web`, `rootDir: server`, `buildCommand: npm install`, `startCommand: npm start`, free plan.
  - Satisfies: `proposal.md` Affected Areas (`server/` deployment)
  - Depends on: Task 3
  - Parallelizable: yes (independent of Task 4)

- [x] Task 6: Create `server/README.md` — local dev steps (`npm start`, default port) and Render deploy steps (service creation, env vars, `RENDER_EXTERNAL_URL`).
  - Satisfies: `proposal.md` Affected Areas (deployment documentation)
  - Depends on: Task 4, Task 5
  - Parallelizable: no

---

## Phase 3: Server Room Registry & Relay Logic (PR 3)

- [x] Task 7: Create `server/src/rooms.js` — `Map<roomId, {hostSocket, students: Map<socket,true>, lastSeenAt}>` with `createRoom(roomId, hostSocket)` (rejects if `roomId` already taken), `joinRoom(roomId, studentSocket)` (rejects if room doesn't exist), `dropSocket(socket)` (removes a student, or deletes the room + closes all students with code `4001` if it was the host), and `sweepIdle()` (drops rooms with no frame in 2h).
  - Satisfies: `specs/relay-server/spec.md` — Room Registration, In-Memory-Only State; `design.md` decisions #3 (host disconnect), #4 (room GC)
  - Depends on: Task 4
  - Parallelizable: no

- [x] Task 8: Create `server/src/relay.js` — `on('connection')` handler; dispatcher on `on('message')`: a `HELLO` frame registers role+room via `rooms.js` and replies `HELLO_ACK` or `ERROR` (`ROOM_TAKEN` / `ROOM_NOT_FOUND` / `BAD_HELLO`); any other frame is unicast to the room's host (if sender is a student) or broadcast to the room's students (if sender is the host), payload passed through unmodified — the dispatcher only ever reads `.type`, never validates game-plane shape.
  - Satisfies: `specs/relay-server/spec.md` — Student Room Join (post-Task-1 wording), Message Relay Routing; `design.md` §5 Interfaces/Contracts (control plane)
  - Depends on: Task 7, Task 1 (implements the corrected HELLO/JOIN flow)
  - Parallelizable: no

- [x] Task 9: Wire the 30s `ping`/`pong` `isAlive` liveness sweep into `server/src/index.js` (or `rooms.js`, whichever owns the socket set) per the standard `ws` heartbeat pattern, terminating dead sockets and triggering `dropSocket`.
  - Satisfies: `design.md` decision #4 (Room GC — liveness sweep)
  - Depends on: Task 7, Task 8
  - Parallelizable: no

- [x] Task 10: Manual verification — run `node server/src/index.js` locally, confirm `/health` returns 200, and drive `rooms.js` behavior from a scratch script or two WS client tabs: duplicate host Room ID rejected, join-unknown-room rejected, host drop deletes the room and closes students with `4001`.
  - Satisfies: `design.md` §6 Testing Strategy — Server unit layer
  - Depends on: Task 8, Task 9
  - Parallelizable: no

---

## Phase 4: Client Transport Swap (PR 4)

- [ ] Task 11: Add the `RELAY_URL` constant near the top of `app.js`'s network section — `wss://` production URL with a `location.hostname`-based `ws://localhost:8080` dev override (per `design.md` decision #5).
  - Satisfies: `design.md` §5 (client code block)
  - Depends on: nothing (can start once Phase 3 server contract is stable; does not require the server to be deployed yet)
  - Parallelizable: yes

- [ ] Task 12: Rewrite `initHostPeer(attempt)` → `initHostSocket(attempt)` (app.js ~1257-1310 area): open a `WebSocket` to `RELAY_URL`, send `HELLO{role:'host', roomId}` on `open`, `navigateTo('board')` on `HELLO_ACK`, retry with a new Room ID (respecting `HOST_ID_RETRY_LIMIT`) on `ERROR{code:'ROOM_TAKEN'}`. Delete `PEER_OPTIONS` and the `new Peer(...)` call.
  - Satisfies: `specs/avatar-board/spec.md` — Host Connection Setup; `specs/relay-server/spec.md` — Room Registration
  - Depends on: Task 8, Task 11
  - Parallelizable: no

- [ ] Task 13: Rewrite `destroyHostPeer()` → `destroyHostSocket()`: `socket.close()`, clear `gameState.hostSocket`/`roomId`. Delete `handleIncomingConnection(conn)` entirely (no longer needed — one socket, no per-peer wiring).
  - Satisfies: `design.md` §5 Client function mapping
  - Depends on: Task 12
  - Parallelizable: no

- [ ] Task 14: Rewrite `handleHostMessage(conn, message)` → `handleHostMessage(message)` (app.js ~1337-1399): drop the `conn` parameter from the signature and all call sites; switch body on `message.type` stays identical (still only handles the 6 existing game message types, never sees `HELLO`).
  - Satisfies: `specs/avatar-board/spec.md` — unchanged game-plane requirements (Real-time Answer Submission, etc.); `proposal.md` non-goal "no new game message types"
  - Depends on: Task 12
  - Parallelizable: no

- [ ] Task 15: Rewrite `registerRealStudent(conn, ...)` → `registerRealStudent(studentId, avatar, avatarImage)` — `JOIN_ACK` is sent back through the relay socket instead of a per-connection `conn.send`.
  - Satisfies: `specs/avatar-board/spec.md` — Student Registration and Joining
  - Depends on: Task 14
  - Parallelizable: no

- [ ] Task 16: Rewrite `broadcastToStudents(message)` (app.js ~1399-1414, plus call sites at 564, 617, 1041): single `hostSocket.send(JSON.stringify(message))` — the server now fans out to students, so the client no longer iterates `gameState.connections`. Remove the `gameState.connections.forEach(...)` reset block at app.js ~629-636 (replace with clearing `gameState.hostSocket`/`relaySocket` as appropriate).
  - Satisfies: `specs/relay-server/spec.md` — Message Relay Routing (host-to-students broadcast)
  - Depends on: Task 14
  - Parallelizable: no

- [ ] Task 17: Rewrite `joinRoom(roomId, studentId, avatar, avatarImage)` (app.js ~1415-1450): same call signature, but internally opens a `WebSocket` to `RELAY_URL`, sends `HELLO{role:'student', roomId}`, and on `HELLO_ACK` sends the existing `JOIN` message (per the corrected Task-1 spec flow); on `ERROR{code:'ROOM_NOT_FOUND'}` surfaces the existing "room not found" UI state.
  - Satisfies: `specs/avatar-board/spec.md` — Student Registration and Joining; `specs/relay-server/spec.md` — Student Room Join
  - Depends on: Task 8, Task 11
  - Parallelizable: yes (independent of Tasks 12-16 — host and student code paths don't share state)

- [ ] Task 18: Rewrite `handleClientMessage(message)` (app.js ~1451+): unchanged switch body, now fed `JSON.parse(event.data)` from the relay socket's `message` event instead of a PeerJS `DataConnection`'s `data` event.
  - Satisfies: `specs/avatar-board/spec.md` — unchanged game-plane requirements
  - Depends on: Task 17
  - Parallelizable: no

- [ ] Task 19: Update the submit guard at app.js ~1570-1580 from `if (!gameState.hostConnection || !gameState.hostConnection.open) return;` / `gameState.hostConnection.send({...})` to a `readyState === WebSocket.OPEN` check and `JSON.stringify` + `send`. Rename `gameState.peer`/`studentPeer`/`hostConnection`/`connections` fields (app.js ~225-229) to `gameState.hostSocket` and `gameState.relaySocket`.
  - Satisfies: `design.md` §4 File Changes (app.js 629-636, 1570); §5 gameState field mapping
  - Depends on: Task 18
  - Parallelizable: no

- [ ] Task 20: Delete the PeerJS CDN `<script>` tag at `index.html:160-161`.
  - Satisfies: `proposal.md` In Scope — remove PeerJS CDN tag
  - Depends on: nothing
  - Parallelizable: yes

- [ ] Task 21: Add the host-side "connecting/waking" UI state: after 3s without `HELLO_ACK`, show "Waking server… up to 60s"; after 90s, show an error state (per `design.md` §5 Cold start).
  - Satisfies: `proposal.md` — cold-start mitigation UI
  - Depends on: Task 12
  - Parallelizable: no

- [ ] Task 22: Manual verification — 2-device smoke test: host + one student tab against `ws://localhost:8080` (needs Phase 3 server running locally), devtools WS frame inspector to confirm all 6 game message types round-trip with unmodified payload shapes; also confirm `HELLO`/`HELLO_ACK` never reach `handleHostMessage`/`handleClientMessage`.
  - Satisfies: `design.md` §6 Testing Strategy — Transport layer; `proposal.md` Success Criteria (all 6 message types round-trip)
  - Depends on: Task 10, Task 19, Task 20
  - Parallelizable: no

---

## Phase 5: Documentation & Spec Cleanup (PR 5)

- [ ] Task 23: Rewrite `README.md:3` — drop "Funciona 100% P2P vía PeerJS, sin backend propio"; describe the relay-backed architecture instead.
  - Satisfies: `proposal.md` In Scope — rewrite README.md:3
  - Depends on: Phase 4 complete (describes the shipped architecture)
  - Parallelizable: yes (can be drafted earlier, but should land after Phase 4 to avoid describing unshipped behavior)

- [ ] Task 24: Rewrite `README.md:76-78` "Limitaciones conocidas" — remove the PeerJS signaling-server / same-WiFi / client-isolation / TURN-backup limitation; add the relay-server-dependency and cold-start limitation (with the pre-class warm-up guidance from `proposal.md`).
  - Satisfies: `proposal.md` In Scope — rewrite known-limitations section
  - Depends on: Task 23
  - Parallelizable: no

- [ ] Task 25: Update `openspec/config.yaml:4-5` context block — stack description moves from "PeerJS (CDN), ... P2P sync via WebRTC" to "WebSocket relay (`server/`, Node + `ws`)".
  - Satisfies: `proposal.md` Affected Areas — openspec/config.yaml
  - Depends on: nothing
  - Parallelizable: yes

- [ ] Task 26: Grep the full repo (`app.js`, `index.html`, `README.md`, `openspec/specs/**`) for any remaining `peerjs`, `PeerJS`, `WebRTC`, `TURN`, `DataConnection` references and remove/update them.
  - Satisfies: `proposal.md` Success Criteria — no PeerJS/WebRTC/TURN references remain
  - Depends on: Task 24, Task 25, Task 22
  - Parallelizable: no

---

## Phase 6: End-to-End Manual Verification (PR 5, same slice as Phase 5, or standalone follow-up)

- [ ] Task 27: Cross-network test (the actual bug this change fixes) — host on home WiFi laptop, student phone joins on mobile data (WiFi off); confirm join, answer, and `ROUND_END` all succeed.
  - Satisfies: `proposal.md` Success Criteria — 40 concurrent students on mixed networks; `design.md` §6 Testing Strategy — Cross-network layer
  - Depends on: Task 22, and a deployed (or tunneled) relay server reachable from outside localhost
  - Parallelizable: no

- [ ] Task 28: Fan-out test — script N headless `ws` clients (or use N phone/tabs) sending `HELLO`+`JOIN`+`SUBMIT`; confirm the host roster shows all N students and no submissions are dropped, at N≈40.
  - Satisfies: `proposal.md` Success Criteria — 40 concurrent students without drops; `design.md` §6 Testing Strategy — Fan-out layer
  - Depends on: Task 27
  - Parallelizable: no

- [ ] Task 29: Payload test — join with a real phone JPG avatar (~80KB base64); confirm it renders on the board after relay.
  - Satisfies: `design.md` §6 Testing Strategy — Payload layer
  - Depends on: Task 22
  - Parallelizable: yes (independent of Task 27/28)

- [ ] Task 30: Cold-start test — leave the deployed Render service idle 20+ minutes, then click "Start Hosting": with self-ping active, connect should be under 5s (proposal Success Criteria); temporarily disable self-ping once to confirm the "Waking server…" UI (Task 21) appears instead of a hang.
  - Satisfies: `proposal.md` Success Criteria — host connects in under 5s when warm; `design.md` §6 Testing Strategy — Cold start layer
  - Depends on: Phase 2 deployed to Render, Task 21
  - Parallelizable: yes (independent of Task 27-29)

- [ ] Task 31: Lifecycle test — close the host tab; every connected student must show "Host disconnected" (close code `4001`); re-registering the same Room ID afterward must succeed.
  - Satisfies: `design.md` decision #3 (Host disconnect); §6 Testing Strategy — Lifecycle layer
  - Depends on: Task 27
  - Parallelizable: no

- [ ] Task 32: Regression check — run offline simulator mode and a full 5-question hosted session; confirm scoring, countdown, leaderboard, and final ranking behave exactly as before this change (proposal Non-Goals: no changes to scoring/timer/avatar/question-bank logic).
  - Satisfies: `design.md` §6 Testing Strategy — Regression layer; `proposal.md` Out of Scope
  - Depends on: Task 22
  - Parallelizable: yes (independent of Task 27-30)

---

## Task-to-Requirement Traceability Summary

| Spec Requirement | Tasks |
|---|---|
| `relay-server` — Room Registration | 7, 10 |
| `relay-server` — Student Room Join (post-alignment) | 1, 8, 17, 22 |
| `relay-server` — Message Relay Routing | 8, 16, 22 |
| `relay-server` — Cold-Start Self-Ping | 4, 30 |
| `relay-server` — In-Memory-Only State | 7 |
| `avatar-board` — Host Connection Setup | 12, 21 |
| `avatar-board` — Student Registration and Joining | 15, 17, 18 |
| `avatar-board` — Unchanged requirements (regression) | 32 |
