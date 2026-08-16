## Exploration: WebSocket Relay Backend

### Current State
`app.js` implements a star-topology transport entirely with PeerJS:

- **Host** (`initHostPeer`, ~line 1257): creates one `Peer(roomId, PEER_OPTIONS)`, listens for incoming `DataConnection`s (`handleIncomingConnection` → `handleHostMessage`), tracks them in `gameState.connections`.
- **Student** (`joinRoom`, ~line 1415): creates its own `Peer(PEER_OPTIONS)`, opens one `DataConnection` to the host's room ID, sends/receives via `handleClientMessage`.
- **ICE/TURN config** (`PEER_OPTIONS`, ~lines 1115-1136): STUN + Open Relay Project free TURN credentials — the piece already diagnosed as the failure point at 40 concurrent students (all traffic falls back to a shared free relay when students are on different networks or the WiFi has client isolation).
- **Game logic is already transport-agnostic**: `gameState`, `recordSubmission`, `computeLeaderboard`, `awardRoundPoints`, `startCountdown`, all rendering (`renderRoster`, `syncAvatarTokens`, `renderDashboard`) operate purely on already-decoded message payloads or local state — none of it references `Peer`/`DataConnection` directly.

**Message contract** (verified by reading the full file — the complete surface a relay must replicate):

| Type | Direction | Payload | Notes |
|---|---|---|---|
| `JOIN` | student → host (unicast) | `{studentId, avatar, avatarImage?}` | `avatarImage` optional base64 JPEG, up to ~80KB (`AVATAR_RESULT_MAX_BYTES`) — the one payload that isn't "tiny" |
| `JOIN_ACK` | host → student (unicast) | `{studentId, status}` | |
| `SUBMIT` | student → host (unicast) | `{questionId, studentId, choice, timeElapsedMs}` | Deliberately relative time (elapsed ms since `START_QUESTION` receipt), avoiding cross-device clock skew — transport-independent, doesn't need to change |
| `START_QUESTION` | host → all students (broadcast) | `{questionId, text, options, startedAt, durationMs}` | |
| `ROUND_END` | host → all students (broadcast) | `{leaderboard, totalScores}` | |
| `SESSION_END` | host → all students (broadcast) | `{finalRanking}` | |

There is **no student-to-student messaging** and **no disconnect/leave broadcast** today (README already documents "no robust disconnect handling" as a known limitation) — the current protocol is exactly host-unicast + host-broadcast, which maps directly onto a WS "room" abstraction with zero new fan-out patterns to invent.

### Affected Areas
- `app.js` — only the block explicitly labeled "P2P Network Protocol (PeerJS)" (~lines 1067-1445: `PEER_OPTIONS`, `initHostPeer`, `destroyHostPeer`, `handleIncomingConnection`, `handleHostMessage`, `registerRealStudent`, `broadcastToStudents`, `joinRoom`, `handleClientMessage`) is transport-coupled. Everything else (state machine, scoring, countdown, DOM rendering) is untouched under any option.
- `index.html:161` — `<script src="https://unpkg.com/peerjs@1.5.4/...">` gets removed; native `WebSocket` needs no library.
- `README.md` — the "Funciona 100% P2P vía PeerJS, sin backend propio" framing and the "Limitaciones conocidas" TURN/signaling caveat are both inaccurate under any option and need rewriting.
- `openspec/specs/avatar-board/spec.md:10,16` — hardcodes "PeerJS"/"peer-to-peer" in MUST-level requirement language; needs a spec delta.
- No test suite exists (`strict_tdd: false` in `openspec/config.yaml`) — no automated coverage to update; manual verification will be needed again as in the prior change.

### Approaches

1. **Self-hosted Node WS server (`ws` lib) on Render free tier**
   - Pros: Message-relay logic ports almost 1:1 from `handleHostMessage`/`handleClientMessage`; familiar local dev loop (`node server.js`); full control, no new runtime paradigm.
   - Cons: Render free web services spin down after 15 min idle with a 30-60s cold start — real live-classroom risk if a teacher clicks "Start Hosting" cold. (Fly.io's free tier no longer exists for new accounts as of 2026 — Render, with the spin-down caveat, is the realistic free option here.) In-memory room state is wiped on any server restart. Adds a real ops surface (deploys, env vars, logs) for a project currently maintained by editing a JS array in a text editor.
   - Effort: Medium.

2. **Cloudflare Workers + Durable Objects (1 DO per room)**
   - Pros: No idle spin-down / no cold-start risk (edge, on-demand execution). Free tier comfortably covers this load (a 40-student session is nowhere near Workers Free plan limits). One DO per room is a close structural match to today's "one Peer = one room" model.
   - Cons: Different platform/deploy model entirely (Cloudflare account, `wrangler`, Workers-specific WS APIs like `WebSocketPair`/hibernation) — more new concepts for a non-backend-engineer maintainer than plain Node. Vendor lock-in to Cloudflare's runtime.
   - Effort: Medium-High (new concepts, small actual logic).

3. **Managed realtime BaaS (PartyKit / Supabase Realtime)**
   - PartyKit was acquired by Cloudflare in 2024 and no longer a separate hosting platform — it now deploys onto your own Cloudflare Workers/Durable Objects account, so it's effectively a thinner DX layer over Option 2, not a genuinely distinct infrastructure choice.
   - Supabase Realtime is a real separate alternative: free tier = 200 concurrent connections, 2M messages/month — comfortably covers 40 students, but pulls in a full BaaS (dashboard, project, its own client SDK, channel/broadcast API, auth/Postgres surface even if unused) for a payload this simple.
   - Pros: Least hand-rolled connection bookkeeping.
   - Cons: Real third-party account/quota dependency; PartyKit doesn't actually reduce platform complexity vs. Option 2; Supabase adds the heaviest platform footprint of the three.
   - Effort: Low-Medium code, Medium dependency/operational risk.

### Cross-cutting notes
- **None of the 3 options preserve "100% static, no backend, GitHub Pages only."** GH Pages can still host the static frontend; some server-side process/service now exists regardless of choice — README and possibly the spec need reframing either way.
- All 3 eliminate ICE/TURN/DTLS entirely — a WS client is a single TLS connection to a known host, directly removing the diagnosed root cause (40 concurrent WebRTC handshakes collapsing onto an underpowered free TURN relay).
- GH Pages serves via HTTPS, so all options must use `wss://` (mixed-content blocks plain `ws://`) — satisfiable by all three, just a constraint to carry into design.
- Whatever "dumb relay" is chosen still needs, at minimum, a per-room connection registry (host socket + student sockets) server-side — game state/logic itself stays host-authoritative and unchanged.

### Recommendation
Deliberately not made here — this is for `sdd-propose`. The three options trade off along one axis worth carrying into that phase explicitly: operational simplicity/familiarity (Option 1) vs. zero cold-start + generous free tier but a new platform to learn (Option 2) vs. least code but heaviest third-party surface (Option 3, and note PartyKit ≈ Option 2 under the hood).

### Risks
- Free-tier terms shift over time (Fly.io's free tier already disappeared since this project started) — re-verify all three at proposal time before committing.
- Render's cold-start is a concrete live-classroom failure mode if Option 1 is chosen without mitigation (keep-alive ping, accept the delay, or a paid/no-spin-down tier).
- README/spec framing change is user-facing, not just code — needs explicit scope in the proposal, not an afterthought.
- No automated test coverage for this project — verification will be manual again.

### Ready for Proposal
Yes — the message contract and option trade-offs above are sufficient for `sdd-propose` to pick a direction.
