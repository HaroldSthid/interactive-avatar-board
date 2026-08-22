# Implementation Tasks: Husky Bonus Round

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~750-950 lines (`bonus-round.js` ~300-350 new; `app.js` ~280-350 changed across 7+ locations; `index.html` ~70-140 changed; `style.css` ~130-220 changed; 4 placeholder PNGs add files but negligible diff lines) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 → PR 5 (PR 6 is verification-only, no diff) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending — orchestrator must ask the user (`stacked-to-main` vs `feature-branch-chain`) before `sdd-apply` starts Phase 2 |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

Rationale: per `design.md` "Honest sizing" — this is the largest net-new piece of code in the project's history (first game loop, first canvas, first collision detection, first frame animation). No existing code to port from, unlike the relay migration. Five independently reviewable and testable slices: headless engine physics/collision, canvas rendering + sprite assets, the `app.js` transport/state-machine wiring (the largest single unit, ~280-350 lines, still under 400 alone), host UI, and spectator/canvas wiring. Landing all five as one PR would clear 750+ lines.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Engine core: loop, physics, difficulty ramp, AABB collision — headless, testable via scratch HTML | PR 1 | Independent of app.js; base for PR 2 |
| 2 | Canvas rendering + sprite assets (preload gate, frame draw, procedural ground/obstacles) | PR 2 | Depends on PR 1's engine state |
| 3 | Message contract (`BONUS_START/SCORE/END`) + `app.js` state machine wiring (finalist derivation, stalled timeout, finalization, champion logic) | PR 3 | Depends on PR 1/2 exposing `window.BonusRound.start/stop` |
| 4 | Host leaderboard + champion-reveal UI | PR 4 | Depends on PR 3's `bonusScores`/`bonusFinalists`/finalization state |
| 5 | Spectator screen + `index.html`/`style.css` canvas wrapper wiring | PR 5 | Depends on PR 3 (message handling) and PR 2 (canvas element target) |
| 6 | Full manual verification pass (frame independence, difficulty feel, mobile spot check, disconnect, regression) | PR 6 (no diff, or folds into PR 5's tail) | Depends on PR 1-5 all merged |

---

## Phase 1: Engine Core — Physics, Loop, Collision (PR 1)

- [x] 1.1 Create `bonus-round.js` with world constants (480×160 logical size, `ctx.setTransform` DPR scaling done once at start) and module state (husky position/velocity, ground Y, elapsed time, obstacles array, distance, score, `rafId`, phase).
  - Satisfies: `specs/bonus-round/spec.md` — Endless-Runner Game Mechanics
  - Depends on: nothing
  - Parallelizable: yes

- [x] 1.2 Implement `tick(now)`: `dt` clamped to 50ms, gravity/velocity integration for husky Y with ground clamp, distance accumulation, `score = floor(distance/10)`.
  - Satisfies: `design.md` §3 Game Loop
  - Depends on: 1.1
  - Parallelizable: no

- [x] 1.3 Implement difficulty ramp: `speed = min(320 + 12*elapsed, 700)` px/s.
  - Satisfies: `specs/bonus-round/spec.md` — Endless-Runner Game Mechanics (difficulty ramps over time)
  - Depends on: 1.2
  - Parallelizable: no

- [x] 1.4 Implement obstacle spawn/scroll: obstacles move left at `speed*dt`, dropped off-screen, spawn gap computed in time (scaled by speed) via `nextSpawnAt` so the ramp never makes a jump physically impossible.
  - Satisfies: `design.md` §3 Game Loop (spawn logic)
  - Depends on: 1.3
  - Parallelizable: no

- [x] 1.5 Implement AABB collision with ~15% hitbox inset on husky and obstacle boxes; call `die()` on overlap, cancel `rafId`.
  - Satisfies: `specs/bonus-round/spec.md` — Collision Detection and Run End
  - Depends on: 1.4
  - Parallelizable: no

- [x] 1.6 Implement public interface `window.BonusRound.start({canvas, onScore, onEnd})` / `.stop()`; wire `click` on canvas + `keydown Space` to trigger jump when grounded.
  - Satisfies: `design.md` §1 Technical Approach; `specs/bonus-round/spec.md` — Endless-Runner Game Mechanics (tap triggers jump)
  - Depends on: 1.5
  - Parallelizable: no

- [x] 1.7 Implement `visibilitychange → hidden` pause (stop rAF loop) and reset `last` timestamp on resume, preventing a phantom huge `dt`.
  - Satisfies: `design.md` §3 Game Loop (frame independence)
  - Depends on: 1.6
  - Parallelizable: no

- [x] 1.8 Manual verification: scratch HTML page loading only `bonus-round.js`. Confirm jump clears every spawned obstacle at max speed, no obstacle pair is closer than a jump arc, score rises monotonically.
  - Satisfies: `design.md` §8 Testing Strategy — Engine (isolated) layer
  - Depends on: 1.7
  - Parallelizable: no

---

## Phase 2: Canvas Rendering + Sprite Assets (PR 2)

- [ ] 2.1 Create `assets/husky/run-1.png`, `run-2.png`, `jump.png`, `hit.png` — 64×64 transparent PNG, flat two-tone silhouette placeholder in the existing preset-avatar pixel-art register.
  - Satisfies: `design.md` §4 Sprite Plan
  - Depends on: nothing
  - Parallelizable: yes

- [ ] 2.2 Add sprite preload in `bonus-round.js`: load the 4 images into `Image[]`, gate `start()` on all `.decode()` promises resolving.
  - Satisfies: `design.md` §2 Decision 4 (sprite delivery)
  - Depends on: 1.6, 2.1
  - Parallelizable: no

- [ ] 2.3 Implement husky sprite draw: airborne → `jump.png`, grounded → `run[floor(distance/RUN_FRAME_PX)%2]`, `hit.png` + final-score overlay on the death frame.
  - Satisfies: `design.md` §3 Game Loop (draw block); §8 Testing Strategy — Collision correctness (visual)
  - Depends on: 2.2
  - Parallelizable: no

- [ ] 2.4 Implement procedural ground (scrolling dashed line) and procedural obstacle rendering (neon rects) using palette constants — no assets for these.
  - Satisfies: `design.md` §4 Sprite Plan (ground/obstacles drawn procedurally)
  - Depends on: 2.3
  - Parallelizable: no

- [ ] 2.5 Manual verification: confirm sprites decode before round start, frame swap alternates visually during a run, `hit.png` shows on collision.
  - Satisfies: `design.md` §8 Testing Strategy — Engine layer (visual)
  - Depends on: 2.4
  - Parallelizable: no

---

## Phase 3: Message Contract + app.js State Machine Wiring (PR 3)

- [ ] 3.1 Add `BONUS_ROUND`, `BONUS_RESULTS` to `GAME_STATES` (`app.js:165`).
  - Satisfies: `design.md` §2 Decision 6 (round states)
  - Depends on: nothing (can start once PR 1/2 expose `window.BonusRound`)
  - Parallelizable: yes

- [ ] 3.2 Add `gameState.bonusFinalists`, `bonusScores`, `bonusLastSeen`, `bonusTimers` fields (`app.js:197`).
  - Satisfies: `design.md` §7 File Changes
  - Depends on: 3.1
  - Parallelizable: no

- [ ] 3.3 Add `BONUS_START`, `BONUS_SCORE`, `BONUS_END` to `MSG_TYPES` (`app.js:1081`).
  - Satisfies: `design.md` §5 Protocol Schema
  - Depends on: 3.1
  - Parallelizable: yes

- [ ] 3.4 Implement `startBonusRound()`: derive finalists from `gameState.finalRanking` (top 3 + all ties at 3rd), set `gameState.current = BONUS_ROUND`, broadcast `BONUS_START{finalists, maxDurationMs:180000}`, init `bonusLastSeen` per finalist (`app.js` near 1016).
  - Satisfies: `specs/bonus-round/spec.md` — Finalist Derivation, Bonus Round Start; `specs/avatar-board/spec.md` — Leaderboard and Ranking (host starts bonus round after session end)
  - Depends on: 3.2, 3.3
  - Parallelizable: no

- [ ] 3.5 Add host control on the `SESSION_END` screen invoking `startBonusRound()`.
  - Satisfies: `specs/bonus-round/spec.md` — Bonus Round Start
  - Depends on: 3.4
  - Parallelizable: no

- [ ] 3.6 Extend `handleHostMessage` (`app.js:1348`): on `BONUS_SCORE`, update `gameState.bonusScores[studentId]`, refresh `bonusLastSeen[studentId]`, trigger leaderboard re-render, check finalization conditions.
  - Satisfies: `specs/bonus-round/spec.md` — Score Reporting, Live Host Leaderboard
  - Depends on: 3.4
  - Parallelizable: no

- [ ] 3.7 Implement stalled-finalist detection: periodic check of `bonusLastSeen`, mark `stalled` after 5s silence (`BONUS_STALE_MS`), freeze last known score (still counted).
  - Satisfies: `specs/bonus-round/spec.md` — Stalled Finalist Handling
  - Depends on: 3.6
  - Parallelizable: no

- [ ] 3.8 Implement round-finalization logic: finalize when all finalists dead-or-stalled, OR 180s elapsed since `BONUS_START` (`BONUS_MAX_MS`), OR host manual end — whichever first; compute champion(s) as highest-score finalist(s), ties → co-champions array.
  - Satisfies: `specs/bonus-round/spec.md` — Round Finalization, Champion Reveal
  - Depends on: 3.7
  - Parallelizable: no

- [ ] 3.9 Implement `endBonusRound()`: set `gameState.current = BONUS_RESULTS`, broadcast `BONUS_END{standings, champions}`.
  - Satisfies: `specs/bonus-round/spec.md` — Champion Reveal
  - Depends on: 3.8
  - Parallelizable: no

- [ ] 3.10 Add manual "Finalizar ronda bonus" host control invoking `endBonusRound()` early.
  - Satisfies: `specs/bonus-round/spec.md` — Round Finalization (host manually ends the round)
  - Depends on: 3.9
  - Parallelizable: no

- [ ] 3.11 Extend `handleClientMessage` (`app.js:1477`): on `BONUS_START`, self-select player vs spectator by finalist-list membership; for players, call `window.BonusRound.start(...)` wiring `onScore` → throttled `BONUS_SCORE{alive:true}` every 300ms and `onEnd` → unthrottled `BONUS_SCORE{alive:false}`; on `BONUS_END`, store standings/champion(s) for rendering.
  - Satisfies: `specs/bonus-round/spec.md` — Bonus Round Start (client self-select), Score Reporting
  - Depends on: 3.9, 1.6
  - Parallelizable: no

- [ ] 3.12 Manual verification: host tab + 3-4 finalist tabs. Confirm finalist self-selection on `BONUS_START`, `BONUS_SCORE` throttling (~13 small frames/s across finalists via devtools WS panel), stalled detection via airplane mode, finalization on all-dead.
  - Satisfies: `design.md` §8 Testing Strategy — Simultaneous play, Disconnect mid-run layers
  - Depends on: 3.11
  - Parallelizable: no

---

## Phase 4: Host Leaderboard + Champion-Reveal UI (PR 4)

- [ ] 4.1 Add `#board-bonus-leaderboard` panel and `#btn-start-bonus`/`#btn-end-bonus` controls to `index.html` board view.
  - Satisfies: `design.md` §7 File Changes (index.html board view)
  - Depends on: 3.5, 3.10
  - Parallelizable: yes

- [ ] 4.2 Implement `renderBonusLeaderboard()` in `app.js`: finalist list sorted descending by score, stalled indicator; called from `renderDashboard()` gated on `gameState.current === BONUS_ROUND`.
  - Satisfies: `specs/bonus-round/spec.md` — Live Host Leaderboard
  - Depends on: 3.6, 4.1
  - Parallelizable: no

- [ ] 4.3 Implement champion-reveal render (supports co-champions) in `app.js`, called from `renderDashboard()` gated on `gameState.current === BONUS_RESULTS`, reusing `.leaderboard__list`/`.panel__title` classes.
  - Satisfies: `specs/bonus-round/spec.md` — Champion Reveal
  - Depends on: 3.9, 4.1
  - Parallelizable: no

- [ ] 4.4 Add `renderDashboard()` guards for `BONUS_ROUND`/`BONUS_RESULTS` (`app.js:672`).
  - Satisfies: `design.md` §2 Decision 6 (state-gated rendering idiom)
  - Depends on: 4.2, 4.3
  - Parallelizable: no

- [ ] 4.5 Add `style.css` rules for the bonus leaderboard panel and champion-reveal screen.
  - Satisfies: `design.md` §7 File Changes (style.css)
  - Depends on: 4.1
  - Parallelizable: yes

- [ ] 4.6 Manual verification: force two identical `BONUS_SCORE` payloads via devtools; confirm `BONUS_END.champions` carries both and both names render on the reveal.
  - Satisfies: `design.md` §8 Testing Strategy — Co-champions layer
  - Depends on: 4.4, 4.5
  - Parallelizable: no

---

## Phase 5: Spectator Screen + Canvas Wiring (PR 5)

- [ ] 5.1 Add `<script src="bonus-round.js">` to `index.html`, before the `app.js` script tag.
  - Satisfies: `design.md` §7 File Changes (index.html:160)
  - Depends on: 1.6
  - Parallelizable: yes

- [ ] 5.2 Add `#controller-bonus` wrapper with `<canvas id="bonus-canvas">` to `index.html` controller view, hidden by default.
  - Satisfies: `design.md` §7 File Changes (controller view)
  - Depends on: 5.1
  - Parallelizable: no

- [ ] 5.3 Wire spectator text via existing `setControllerQuestionText()`: bonus-in-progress message for non-finalists on `BONUS_START`, champion line on `BONUS_END`. No new markup.
  - Satisfies: `specs/bonus-round/spec.md` — Spectator Screen
  - Depends on: 3.11, 5.2
  - Parallelizable: no

- [ ] 5.4 Add `style.css` rules for `#bonus-canvas` sizing/responsive scaling on the controller view.
  - Satisfies: `design.md` §7 File Changes (style.css)
  - Depends on: 5.2
  - Parallelizable: yes

- [ ] 5.5 Manual verification: non-finalist phone shows spectator text on `BONUS_START` and the champion line on `BONUS_END`, existing question-screen markup untouched.
  - Satisfies: `specs/bonus-round/spec.md` — Spectator Screen
  - Depends on: 5.3, 5.4
  - Parallelizable: no

---

## Phase 6: Full Manual Verification Pass (PR 6 — no diff, or folds into PR 5's tail)

- [ ] 6.1 Frame independence: Chrome DevTools 6× CPU throttle, confirm distance-per-second stays within a few percent of unthrottled; background the tab 10s, confirm no teleport/phantom death.
  - Satisfies: `design.md` §8 Testing Strategy — Frame independence layer
  - Depends on: Phase 1-5 merged
  - Parallelizable: yes

- [ ] 6.2 Difficulty-feel playtest: confirm a first-timer survives ~15-30s; run 5× and confirm the curve doesn't spike.
  - Satisfies: `design.md` §8 Testing Strategy — Difficulty feel layer
  - Depends on: Phase 1-5 merged
  - Parallelizable: yes

- [ ] 6.3 Mobile frame-rate + tap-latency spot check on at least one low-end Android and one iPhone.
  - Satisfies: `design.md` §8 Testing Strategy — Mobile layer (hard human-verification gate; not agent-verifiable)
  - Depends on: Phase 1-5 merged
  - Parallelizable: yes
  - **Requires real devices — flag for the user, not an agent task.**

- [ ] 6.4 Disconnect mid-run: airplane-mode one finalist mid-run, confirm `stalled` within 5s with frozen score, round still finalizes and champion still announced.
  - Satisfies: `design.md` §8 Testing Strategy — Disconnect mid-run layer
  - Depends on: Phase 3 merged
  - Parallelizable: yes

- [ ] 6.5 Regression check: full 5-question quiz session; confirm `totalScores`, `finalRanking`, and quiz champion display are byte-for-byte unchanged; `git diff --stat server/` must be empty.
  - Satisfies: `specs/bonus-round/spec.md` — Independence from Quiz Scoring; `proposal.md` Success Criteria
  - Depends on: Phase 1-5 merged
  - Parallelizable: yes

---

## Task-to-Requirement Traceability Summary

| Spec Requirement | Tasks |
|---|---|
| `bonus-round` — Finalist Derivation | 3.4 |
| `bonus-round` — Bonus Round Start | 3.4, 3.5, 3.11 |
| `bonus-round` — Endless-Runner Game Mechanics | 1.1-1.7, 2.2-2.4 |
| `bonus-round` — Collision Detection and Run End | 1.5, 2.3 |
| `bonus-round` — Score Reporting | 3.11, 3.12 |
| `bonus-round` — Live Host Leaderboard | 4.2, 4.4 |
| `bonus-round` — Stalled Finalist Handling | 3.7, 6.4 |
| `bonus-round` — Round Finalization | 3.8, 3.9, 3.10 |
| `bonus-round` — Champion Reveal | 3.8, 3.9, 4.3, 4.6 |
| `bonus-round` — Spectator Screen | 5.3, 5.5 |
| `bonus-round` — Independence from Quiz Scoring | 6.5 |
| `avatar-board` — Leaderboard and Ranking (delta) | 3.4, 3.5 |
