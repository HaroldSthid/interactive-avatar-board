# Proposal: Husky Bonus Round

## Intent

The quiz rewards speed: score comes from answering correctly, fast. That measures recall under pressure, not dexterity — and once `endSession()` fires the session simply stops on a static ranking screen. This adds a second, skill-based act: the top 3 finishers (ties for 3rd included) advance to an endless obstacle-jumping minigame — Chrome's offline dinosaur, re-themed with a Siberian Husky — played simultaneously, each finalist on their own phone, tap to jump. It produces a separate **skill champion** title alongside the existing quiz champion, so a class ends with two winners measured on two different axes. The stated goal is "medir más la habilidad": give the top performers a showcase that speed-scoring can't provide, and give the rest of the class something to watch.

## Scope

### In Scope
- New `BONUS_ROUND` game state in `GAME_STATES` (`app.js:165`) plus the first host-triggered transition out of `SESSION_END` — today `SESSION_END` is terminal, with no "next phase" hook.
- Finalist derivation from the existing `gameState.finalRanking` (`app.js:1029-1032`, already sorted descending): top 3 by score, and **every** student tied at 3rd place also advances (a tie can legitimately produce 4+ finalists).
- Client-side endless-runner engine: continuous game loop, obstacle spawning with difficulty/speed ramp over time, collision detection, run ends on collision, score = distance/time survived.
- Husky sprite animation (run cycle + jump frame) — new art assets, see Dependencies.
- Tap-to-jump input on the student controller, reusing the existing `click` listener pattern already proven on mobile by the A/B/C/D answer buttons.
- New WS message types on the existing relay: bonus-round start broadcast, finalist score reports (periodic while alive + final on death), skill-champion announcement.
- Host board UI: a live-updating finalist leaderboard during play, and the skill-champion reveal when the last run ends.
- Non-finalist controller state: a spectator/"session complete" screen so the other ~37 phones show something coherent.
- Spec delta on `avatar-board` for the post-session transition trigger.

### Out of Scope
- Any change to quiz scoring, `totalScores`, `finalRanking`, or the existing champion display. The bonus round **does not** feed back into the quiz ranking — the two titles are independent.
- Real-time multiplayer sync between finalists. Each device runs its own independent local loop; only score reports cross the wire. No shared obstacle seed, no ghost racers, no cross-device collision.
- Any change to `server/src/relay.js`. The relay routes by `.type` and never parses payloads, so new message types ride the existing room/socket infrastructure with zero server-side work. This is a pure client + host-board feature.
- Persistence, replays, cross-session bonus history, per-student best scores.
- Head-to-head tiebreaker mechanics *inside* the bonus round. **Decision: identical top bonus scores are declared co-champions** (shared title, both names shown). A tie on a continuous distance score is vanishingly unlikely, and a sudden-death rematch would cost more than it is worth.

## Capabilities

### New Capabilities
- `bonus-round`: post-session skill round — finalist qualification, round lifecycle, endless-runner mechanics, score reporting, live leaderboard, skill-champion determination.

### Modified Capabilities
- `avatar-board`: "Leaderboard and Ranking" gains MUST-language for the host-triggered transition out of `SESSION_END` into the bonus round, and for the non-finalist spectator state.

**Recommendation for `sdd-spec`**: name the capability `bonus-round`, not `husky-jump`. The husky is a theme; the capability is "a skill-based round after the quiz". If the character or the minigame is ever swapped, a theme-named capability becomes a lie in the spec tree. Keep the husky in the requirement prose and asset names.

## Approach

**Lifecycle.** `endSession()` keeps its current behaviour unchanged (computes `finalRanking`, broadcasts `SESSION_END`, renders the champion). A new host control appears on the `SESSION_END` screen; pressing it derives the finalist set, moves to `BONUS_ROUND`, and broadcasts the start message. Finalist controllers swap to the game canvas; everyone else swaps to the spectator screen. The round ends when every finalist has reported a final score; the host then reveals the skill champion.

**Transport.** Three new `MSG_TYPES` entries, no new server code:
- `BONUS_START` (host → all, broadcast) carrying the finalist ID list — receivers self-select as player or spectator.
- `BONUS_SCORE` (finalist → host, unicast) carrying `{ score, alive }`, throttled while running (a few reports per second at most) and sent once more with `alive: false` on collision. This is what drives the live leaderboard without shipping game state.
- `BONUS_END` (host → all, broadcast) carrying the final bonus standings and the champion(s).

**Rendering.** A single `<canvas>` on the controller is the recommended substrate and the design phase should confirm it. This codebase has **zero** canvas usage and zero game loops today — `requestAnimationFrame` appears exactly once, for a one-off FLIP transition. All existing motion is CSS `transition`/`@keyframes` fired by discrete state changes, which is the wrong tool for per-frame scrolling plus collision tests. Canvas keeps the loop, the obstacle list, and the hit test in one place instead of thrashing DOM nodes at 60fps.

**Sprites.** `avatars/` holds 4 static JPG portraits painted as a single CSS `background-image` — there is no sprite-sheet or frame system to extend. Pragmatic default: 3 hand-made or generated pixel-art frames (2-frame run cycle + 1 jump pose) in the same pixel-art register as the existing preset avatars, single small PNG each, swapped by index in the loop. No sprite-sheet tooling, no atlas, no animation library.

**Honest sizing.** This is the largest net-new piece of code in the project's history. The relay migration was large in diff but conceptually a port — it reused an existing 6-message contract and rewrote the plumbing under it. This has no precedent in the repo to port from: first game loop, first collision detection, first frame animation, first canvas. Plan it as new engineering, not as an add-on to the quiz.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app.js` `GAME_STATES` (~165) | Modified | New `BONUS_ROUND` state + transition guards |
| `app.js` `endSession()` (~1016) | Modified | Host control + finalist derivation from `finalRanking` |
| `app.js` `MSG_TYPES` (~1081) | Modified | `BONUS_START`, `BONUS_SCORE`, `BONUS_END` |
| `app.js` host/client handlers | Modified | Route the 3 new types; leaderboard + champion render |
| New game-engine module | New | Loop, obstacles, difficulty ramp, collision, sprite frames |
| `index.html` | Modified | Bonus canvas, finalist leaderboard, spectator view |
| `styles.css` | Modified | Bonus round layout, leaderboard, champion reveal |
| `assets/husky/` | New | Run + jump sprite frames |
| `server/` | **Untouched** | Relay is payload-agnostic |
| `openspec/specs/bonus-round/spec.md` | New | Capability spec |
| `openspec/specs/avatar-board/spec.md` | Modified | Post-session transition delta |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| New engineering territory — first loop/canvas/sprite code in this repo | High | Prototype the loop + collision standalone before wiring transport; keep the engine in its own module with a narrow interface |
| Mobile game-loop performance across a range of student phones | Med-High | Manual real-device verification only — an agent cannot validate frame pacing on a classroom's mix of phones. Cap the frame rate, keep obstacles few, avoid per-frame allocations |
| Husky sprites do not exist yet | High | Blocking asset dependency. Ship with a plain silhouette placeholder so code can land before final art |
| Score-report spam saturating the relay | Low | Throttle reports; payloads are tiny next to the ~80KB base64 avatars already in flight |
| Finalist never reports final score (drop/close) | Med | Host-side timeout finalizes the round on last known score |
| No automated test suite | High | Manual verification checklist, as with prior changes |

## Rollback Plan

Revert the frontend commit. `SESSION_END` returns to terminal and the quiz is untouched — the bonus round is strictly additive to session state and adds no server-side or persisted state to unwind. Sprite assets can stay in the tree harmlessly.

## Dependencies

- **Husky sprite frames (unresolved, blocking for final polish)**: run cycle + jump pose, pixel-art, matching the existing preset avatar style, lightweight. Not yet created. Code may land against a placeholder silhouette.
- No new libraries, no new services, no relay changes, no npm additions.

## Success Criteria

- [ ] After "Finalizar sesión", the host can start the bonus round; exactly the top 3 finishers plus anyone tied at 3rd receive the playable game.
- [ ] Finalists play simultaneously on their own phones with tap-to-jump; each run ends on collision with a score based on survival.
- [ ] The host board leaderboard updates live while finalists play, and names the skill champion (or co-champions) when the last run ends.
- [ ] Quiz cumulative scores, final ranking, and quiz champion display are byte-for-byte unchanged.
- [ ] `server/` has zero diff.
- [ ] Non-finalist students see a coherent spectator state, not a stale question screen.
