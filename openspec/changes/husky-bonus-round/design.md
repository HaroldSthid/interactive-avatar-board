# Technical Design: Husky Bonus Round

## 1. Technical Approach

A self-contained game engine in a **new global module** (`bonus-round.js`, loaded before `app.js`) that knows nothing about sockets, and an `app.js` layer that owns transport and the state machine. The engine's entire surface is:

```js
window.BonusRound = {
  start({ canvas, onScore, onEnd }), // begins the rAF loop
  stop(),                             // cancels the loop (host abort / exit)
};
```

`onScore(score)` fires on a throttle; `onEnd(score)` fires once on collision. `app.js` turns those into `BONUS_SCORE` frames. This is the "narrow interface" the proposal's top risk asked for: the loop can be prototyped and tuned standalone with a scratch HTML page before any wiring exists.

The round is host-authoritative like everything else: the host derives finalists, broadcasts start, aggregates scores, decides when the round is over, and broadcasts the result. Finalist devices only run a loop and report a number. `server/` gets zero diff — the relay routes by `.type` and never parses payloads.

## 2. Architecture Decisions

| # | Decision | Choice | Alternatives rejected | Rationale |
|---|---|---|---|---|
| 1 | **Rendering substrate** | **`<canvas>` 2D + `requestAnimationFrame`** | CSS `transform`/`@keyframes` on DOM obstacle nodes | This is the genre's proven-correct answer — Chrome's own dino game is a canvas loop. A runner needs per-frame position updates plus a hit test against a live obstacle list; CSS keyframes are declarative and fire on discrete state changes, so a DOM version means reading `getBoundingClientRect()` per obstacle per frame (forced synchronous layout, the single worst thing to do at 60fps on a mid-tier Android). Yes, the repo has zero canvas precedent — that is a one-file learning cost paid once, against a per-frame reflow cost paid on ~40 students' phones. **Consequence for `sdd-spec`: requirements are written in terms of canvas draw state, world coordinates, and rectangle overlap — not DOM elements, classes, or CSS transitions.** |
| 2 | **Frame independence** | Delta-time integration, `dt` clamped to **50ms** | Fixed per-frame step (assume 60fps) | Student phones will run 30/60/90/120Hz. A fixed step makes a 30Hz phone move at half speed — unfair by hardware. The clamp matters as much as the delta: when a phone sleeps or the tab backgrounds, `rAF` stalls and the next `dt` is huge; unclamped, the husky teleports through an obstacle. Clamping degrades to "slight slow-motion" instead of a phantom death. |
| 3 | **Collision** | **AABB overlap**, hitboxes inset ~15% from sprite bounds | Per-pixel masks; circle-vs-rect | Standard and sufficient for this genre. The inset is the whole trick: it makes near-misses read as fair rather than as "I clearly jumped it". Nothing here justifies more. |
| 4 | **Sprite delivery** | **4 separate PNGs**, preloaded into `Image[]`, round start gated on all decoding | Single sprite sheet + atlas; CSS-drawn shapes | Follows the proposal, and no build tooling exists to slice a sheet. The usual sheet argument (avoid half-loaded frames) is handled directly by the preload gate. No atlas coordinate constants means the real art later is a straight file-for-file swap with no code edit. |
| 5 | **`BONUS_END` direction** | **Host → all (broadcast)**, carrying standings + champion(s). The finalist's death report is an immediate, unthrottled `BONUS_SCORE` with `alive: false` | A finalist→host `BONUS_END` plus a 4th type for the announcement | Resolves an ambiguity in the intake brief. Three types total, per the proposal. The death report is already a score report — reusing `BONUS_SCORE` costs nothing and keeps one code path. `BONUS_END` as a broadcast is what lets the ~37 spectators and the finalists all see the champion reveal; a finalist→host-only variant would leave them with no ending. |
| 6 | **Round states** | Two new `GAME_STATES`: **`BONUS_ROUND`** and **`BONUS_RESULTS`** (new terminal state) | One `BONUS_ROUND` state + a `bonusFinished` sub-flag | `renderDashboard()`/panel renderers gate purely on `gameState.current === X` today. A sub-flag turns every one of those checks into a compound condition. Two flat states keep the existing idiom. Per-device play states (`running`/`dead`/`spectating`) stay local to `bonus-round.js` — they are not session state and are deliberately *not* modelled in `GAME_STATES`. |
| 7 | **Input** | `click` on the canvas + `keydown Space` for desktop debugging | `touchstart`/`pointerdown` | `click` is already proven on this project's real device mix by the A/B/C/D buttons. `touchstart` would shave ~50-100ms of tap latency on old browsers but introduces a double-fire path with the mouse fallback. Revisit only if real-device testing shows jump latency hurting fairness. |

## 3. Game Loop

Logical world is a fixed **480×160** coordinate space, scaled to element size and `devicePixelRatio` once at start (`ctx.setTransform`), so tuning constants are device-independent.

```text
tick(now):
  dt = min((now - last)/1000, 0.05)
  speed   = min(BASE_SPEED + RAMP * elapsed, MAX_SPEED)   // 320 → 700 px/s, +12 px/s per second
  vy     += GRAVITY * dt;  huskyY += vy * dt              // ground clamp cancels vy
  distance += speed * dt;  score = floor(distance / 10)
  obstacles: x -= speed*dt; drop when x < -w
  spawn: when distance >= nextSpawnAt →
         nextSpawnAt += rand(MIN_GAP, MAX_GAP) scaled by speed  // gap in *time*, not px,
                                                                // so the ramp never makes a
                                                                // jump physically impossible
  for each obstacle: if aabb(huskyBox, obsBox) → die()
  draw: ground (procedural scrolling dashes), obstacles (neon rects, no assets),
        husky frame = airborne ? jump : run[floor(distance/RUN_FRAME_PX) % 2]
  scoreAccum += dt; if scoreAccum >= 0.3 → onScore(score); scoreAccum = 0
  rafId = requestAnimationFrame(tick)

die():
  cancelAnimationFrame(rafId); phase = 'dead'
  draw hit frame + final-score overlay
  onEnd(score)        // → immediate BONUS_SCORE { alive:false }, unthrottled
```

`visibilitychange → hidden` calls `stop()`-style pause and resets `last` on resume, so a backgrounded tab never accrues a phantom frame.

## 4. Sprite Plan

| File | Frame | Notes |
|---|---|---|
| `assets/husky/run-1.png` | Run cycle A | 64×64, transparent PNG |
| `assets/husky/run-2.png` | Run cycle B | legs in opposite phase |
| `assets/husky/jump.png` | Airborne | legs tucked |
| `assets/husky/hit.png` | Collision | shown on the death frame; may temporarily reuse `jump.png` |

Placeholder art is a flat two-tone silhouette in the existing preset-avatar pixel-art register (grey/white husky, neon outline). Ground and obstacles are **drawn procedurally** — no assets, and they inherit the cyberpunk palette from constants in `bonus-round.js`. Final art swaps the four files at the same dimensions with no code change.

## 5. Protocol Schema

Existing `{ type, payload }` convention; three new `MSG_TYPES` entries.

```json
{"type":"BONUS_START","payload":{"finalists":["S-01","S-07","S-12"],"maxDurationMs":180000}}
{"type":"BONUS_SCORE","payload":{"studentId":"S-07","score":432,"alive":true}}
{"type":"BONUS_END","payload":{"standings":[{"studentId":"S-07","score":871}],"champions":["S-07"]}}
```

- `BONUS_START` — host → all (broadcast). Receivers self-select: `finalists.includes(gameState.studentId)` → player, else spectator.
- `BONUS_SCORE` — finalist → host (unicast via relay). Throttled at **300ms** while alive; sent immediately with `alive: false` on collision. 300ms because: ~3.3 msg/s × 4 finalists ≈ 13 tiny frames/s against a relay that already ships 80KB base64 avatars, and a leaderboard refreshing faster than ~500ms already reads as continuous to the eye. Faster buys no perceived smoothness; slower makes the board look laggy against what students see on their own screens.
- `BONUS_END` — host → all (broadcast). `champions` is an array: identical top scores yield co-champions, per the proposal.

## 6. Data Flow

```text
[Host board]                    [Relay]                 [Finalist phone]   [Spectator phone]
 SESSION_END (terminal today)
 click "Ronda Bonus"
 derive finalists from finalRanking
 setGameState(BONUS_ROUND)
      |-- BONUS_START ---------->|===== broadcast ========>| canvas view    | spectator text
      |                          |<-- BONUS_SCORE(alive) --| every 300ms
      |<-- BONUS_SCORE (unicast)-|                         |
      |  live leaderboard re-render, sorted desc           |
      |                          |<-- BONUS_SCORE(dead) ---| collision
      |  all finalists dead-or-stalled → finalize          |
 setGameState(BONUS_RESULTS)
      |-- BONUS_END ------------>|===== broadcast ========>| standings      | champion reveal
```

**Finalist disconnect mid-run.** The relay never notifies the host of a student drop (relay design decision 6), so a timeout is the only available signal. The host keeps `lastSeenAt` per finalist: no `BONUS_SCORE` for **5s** (`BONUS_STALE_MS`, >16× the report interval) marks that finalist `stalled` on the board and freezes its last known score. The round finalizes when every finalist is dead **or** stalled, with a hard cap of **180s** (`BONUS_MAX_MS`) from `BONUS_START`. A stalled finalist's frozen score still counts — dropping at 900 points shouldn't erase the run. A manual "Finalizar ronda bonus" host button is the escape hatch, consistent with the existing host-authoritative controls.

## 7. File Changes

| File | Action | Description |
|---|---|---|
| `bonus-round.js` | Create | The engine: loop, physics, spawn/ramp, AABB collision, sprite preload + draw. Exposes `window.BonusRound.start/stop`. Zero socket/DOM-outside-canvas knowledge. New file rather than appending to a ~1630-line `app.js`: separate concern, separate lifecycle, and it must be tunable standalone |
| `assets/husky/run-1.png`, `run-2.png`, `jump.png`, `hit.png` | Create | Placeholder pixel-art frames, 64×64 |
| `index.html:160` | Modify | `<script src="bonus-round.js">` **before** `app.js` (plain scripts, no modules) |
| `index.html` board view | Modify | `#board-bonus-leaderboard` panel + `#btn-start-bonus` / `#btn-end-bonus` controls |
| `index.html` controller view | Modify | `#controller-bonus` wrapper with `<canvas id="bonus-canvas">`, hidden by default |
| `app.js:165` | Modify | `BONUS_ROUND`, `BONUS_RESULTS` in `GAME_STATES` |
| `app.js:197` | Modify | `gameState.bonusFinalists`, `bonusScores`, `bonusLastSeen`, `bonusTimers` |
| `app.js:1016` | Modify | `endSession()` unchanged; new `startBonusRound()` derives finalists from `finalRanking` (top 3 + all ties at 3rd) |
| `app.js:1081` | Modify | `BONUS_START`, `BONUS_SCORE`, `BONUS_END` in `MSG_TYPES` |
| `app.js:1348` | Modify | `handleHostMessage`: `BONUS_SCORE` → update store, refresh leaderboard, check completion |
| `app.js:1477` | Modify | `handleClientMessage`: `BONUS_START` → play or spectate; `BONUS_END` → results text |
| `app.js:672` | Modify | `renderDashboard()` guards for the two new states + `renderBonusLeaderboard()` |
| `style.css` | Modify | Bonus canvas sizing, leaderboard panel, champion reveal (reuses `.leaderboard__list`, `.panel__title`) |
| `openspec/specs/bonus-round/spec.md` | Create | New capability |
| `openspec/specs/avatar-board/spec.md` | Modify | Post-`SESSION_END` transition delta |

Spectator screen costs **zero new markup**: reuse `setControllerQuestionText()` — `"Ronda bonus en curso — N finalistas están jugando. Mirá el pizarrón."`, then the champion line on `BONUS_END`.

## 8. Testing Strategy

No test framework (`strict_tdd: false`) — manual and layered, as with prior changes.

| Layer | What to verify | How |
|---|---|---|
| Engine (isolated) | Loop, ramp, spawn, collision | Scratch HTML page loading only `bonus-round.js`. Verify: jump clears every spawned obstacle at max speed; no obstacle pair is closer than a jump arc; score rises monotonically |
| Collision correctness | No phantom or missed hits | Temporarily draw hitbox outlines (debug flag). Deliberately clip an obstacle corner — must register. Jump with ~50ms of clearance — must **not** register |
| Frame independence | 30Hz vs 60Hz parity | Chrome DevTools CPU throttle 6×; distance-per-second must stay within a few percent. Background the tab 10s, return — husky must not teleport or die |
| Difficulty feel | Ramp is fair, not punishing | Human playtest: a first-timer should survive ~15-30s; run the same seedless build 5× and confirm the curve doesn't spike |
| **Mobile frame rate + tap latency** | **Requires real devices** | An agent cannot validate frame pacing or touch responsiveness. Test on at least one low-end Android and one iPhone: jump must fire on the first tap and feel immediate. **Flag as a hard human-verification gate** |
| Simultaneous play | 3-4 finalists don't slow the relay/host | Three phones + host board at once. Board leaderboard must update smoothly; devtools WS panel should show ~13 small frames/s, no backpressure |
| Co-champions | Tie renders both names | Force it: hand-edit two `BONUS_SCORE` payloads to identical scores in devtools; `BONUS_END.champions` must carry both and the reveal must name both |
| Disconnect mid-run | Timeout finalizes | Airplane-mode one finalist mid-run. Within 5s it shows `stalled` with its frozen score; the round still finalizes and the champion is still announced |
| Regression | Quiz path untouched | Full 5-question session: cumulative scores, `finalRanking`, and the quiz champion display must be byte-for-byte identical. `git diff --stat server/` must be empty |

## 9. Migration / Rollout

No migration — all state is ephemeral. Ship as one frontend commit; rollback is a revert, after which `SESSION_END` is terminal again. Sprite assets are harmless if left in the tree.

## 10. Open Questions

- [ ] **Unseeded obstacle sequences.** The proposal puts a shared seed out of scope, so each finalist gets a different obstacle layout — a real (if small) fairness variance for a competition. Adding `seed` to `BONUS_START` and a ~5-line LCG would make the runs identical. Deferred deliberately; `sdd-tasks` may raise it if playtesting shows the variance is noticeable.
- [ ] Final husky art is still an unresolved blocking dependency for polish. Code lands against placeholders.
- [ ] The proposal names the stylesheet `styles.css`; the actual file is **`style.css`**. Spec and tasks should use `style.css`.
