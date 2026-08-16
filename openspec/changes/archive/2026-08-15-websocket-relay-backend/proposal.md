# Proposal: WebSocket Relay Backend

## Intent

The PeerJS/WebRTC transport collapsed in a real class of 40 students: one browser tab cannot sustain 40 concurrent WebRTC connections, and cross-network students fall back onto a shared free TURN relay that saturates. Replace the P2P transport with a self-hosted Node.js WebSocket relay so a session is N independent TLS sockets to a known host — removing ICE/TURN/DTLS, the same-WiFi dependency, and the fan-out ceiling — while leaving the already transport-agnostic game logic untouched.

## Scope

### In Scope
- New `server/` directory in this repo: Node.js + `ws` relay, per-room registry (1 host socket + N student sockets), in-memory only, deployed to Render free tier over `wss://`.
- Rewrite the "P2P Network Protocol" block in `app.js` (~1067-1445) onto `WebSocket`, preserving the existing 6-message contract exactly.
- Remove the PeerJS CDN tag (`index.html:161`); use native `WebSocket`.
- Cold-start mitigation (see below) plus a host-side "connecting/waking" UI state.
- Rewrite `README.md:3` ("100% P2P sin backend") and `README.md:76-78` known limitations.
- Spec delta for `avatar-board` requirements that hardcode PeerJS.

### Out of Scope
- Game logic, scoring, countdown, question bank, avatar system, rendering, simulator mode.
- Auth, persistence, reconnection/disconnect broadcasts, room passwords, student-to-student messaging.
- Any protocol change: no new message types, no server-side game state.

## Capabilities

### New Capabilities
- `relay-server`: WebSocket room relay — connection registry, host/student roles, unicast + broadcast routing, health endpoint.

### Modified Capabilities
- `avatar-board`: "Host Connection Setup" and "Student Registration" MUST-language moves from PeerJS/peer-to-peer to WebSocket relay room semantics.

## Approach

Server is a dumb router: sockets identify as host or student for a `roomId`; student→host frames are unicast to that room's host socket, host→students frames are broadcast. JSON payloads pass through unmodified (including ~80KB base64 avatars). `handleHostMessage`/`handleClientMessage` port near 1:1 — only the connect/send/receive plumbing changes. Chosen over Cloudflare Durable Objects and Supabase Realtime for minimal new-concept load on a solo maintainer.

**Cold start**: Render free tier sleeps after 15 min idle (30-60s wake). Mitigation, both: (1) primary — server self-pings its own `/health` on an interval to stay warm, cheap and invisible to the teacher; (2) secondary — README instructs the teacher to open the host page a few minutes before class, plus a visible "waking server" state so a cold click is legible, not a hang.

**Accepted cost**: this ends the "100% static, zero backend, GitHub Pages only" property. The frontend stays on GitHub Pages, but a Node process now must be deployed, monitored, and kept alive. That is a real, deliberate tradeoff for surviving 40 students.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `server/` | New | `ws` relay, room registry, `/health`, Render config |
| `app.js` ~1067-1445 | Modified | PeerJS block → WebSocket client |
| `index.html:161` | Removed | PeerJS CDN script |
| `README.md` | Modified | Reframe architecture + limitations |
| `openspec/specs/avatar-board/spec.md` | Modified | Delta on transport requirements |
| `openspec/config.yaml` | Modified | Context: stack no longer PeerJS-only |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Render cold start mid-class | Med | Self-ping keep-alive + pre-class guidance + wake UI |
| Server restart wipes rooms | Low | Matches today's host-reload reset; session is short-lived |
| Free-tier terms change | Med | Relay is ~200 LOC and portable to any Node host |
| No test suite | High | Manual verification: 2-device smoke, then simulated fan-out |

## Rollback Plan

Revert the frontend commit — the PeerJS transport returns intact from git history (`index.html` CDN tag + `app.js` block). The Render service can be left running or deleted; nothing else depends on it.

## Dependencies

- Render account with a free web service; `ws` npm package; GitHub Pages continues serving the frontend over HTTPS (`wss://` required).

## Success Criteria

- [ ] 40 concurrent students on mixed networks (school WiFi + mobile data) complete a full session without drops.
- [ ] All 6 message types round-trip with unchanged payload shapes.
- [ ] No PeerJS/WebRTC/TURN references remain in `app.js`, `index.html`, `README.md`, or specs.
- [ ] Host page connects in under 5s when the server is warm.
