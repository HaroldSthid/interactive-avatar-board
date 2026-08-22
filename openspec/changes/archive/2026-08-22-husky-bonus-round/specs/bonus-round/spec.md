# Bonus Round Specification

## Purpose

Provides a post-session, skill-based endless-runner minigame for the top quiz finishers. Produces an independent "skill champion" title without altering the quiz's cumulative scoring or ranking.

## Requirements

### Requirement: Finalist Derivation
The system MUST derive the bonus-round finalist set from `gameState.finalRanking` by selecting the top 3 students by final cumulative quiz score, and MUST include every additional student tied with the 3rd-place score.

#### Scenario: No ties at 3rd place
- GIVEN `finalRanking` has distinct scores for the top 4 students
- WHEN the host starts the bonus round
- THEN exactly the top 3 students MUST become finalists

#### Scenario: Tie at 3rd place
- GIVEN 2 students are tied for 3rd place in `finalRanking`
- WHEN the host starts the bonus round
- THEN both tied students MUST become finalists, for a total of 4

---

### Requirement: Bonus Round Start
After `SESSION_END`, the host MUST be able to trigger a transition into a new `BONUS_ROUND` game state via a dedicated host control. On trigger, the host MUST broadcast `BONUS_START` carrying the finalist ID list to all connected clients.

#### Scenario: Host starts the bonus round
- GIVEN `gameState.current` is `SESSION_END`
- WHEN the host presses the bonus-round start control
- THEN `gameState.current` MUST transition to `BONUS_ROUND`
- AND `BONUS_START` MUST be broadcast to all clients with the finalist ID list

#### Scenario: Clients self-select on receipt
- GIVEN a client receives `BONUS_START`
- WHEN the client's student ID is in the finalist list
- THEN the client MUST enter player mode
- AND WHEN it is not, the client MUST enter spectator mode

---

### Requirement: Endless-Runner Game Mechanics
Each finalist's device MUST run an independent, canvas-rendered, delta-time-driven game loop, accept tap input to jump, and increase obstacle speed/frequency as elapsed run time increases, up to a maximum cap. No state is shared across finalist devices.

#### Scenario: Tap triggers jump
- GIVEN a finalist's husky is on the ground
- WHEN the finalist taps the canvas
- THEN the husky MUST begin a jump

#### Scenario: Difficulty ramps over time
- GIVEN a finalist's run has progressed further in elapsed time
- WHEN obstacle speed is evaluated
- THEN it MUST be greater than at an earlier elapsed time, bounded by a maximum

---

### Requirement: Collision Detection and Run End
The system MUST detect husky-obstacle collisions via AABB overlap, MUST end that finalist's run immediately on the first collision, and MUST compute the finalist's score from distance traveled / time survived.

#### Scenario: Collision ends the run
- GIVEN a finalist's husky bounding box overlaps an obstacle's bounding box
- WHEN the collision is detected
- THEN that finalist's run MUST end and the score MUST be fixed at that value

---

### Requirement: Score Reporting
While alive, a finalist's client MUST send `BONUS_SCORE {score, alive: true}` throttled to at most one message per 300ms. On collision, the client MUST send one unthrottled final `BONUS_SCORE {score, alive: false}`.

#### Scenario: Periodic update while alive
- GIVEN a finalist's run is active
- WHEN 300ms has elapsed since the last report
- THEN the client MUST send `BONUS_SCORE` with the current score and `alive: true`

#### Scenario: Final score on collision
- GIVEN a finalist's husky collides with an obstacle
- WHEN the run ends
- THEN the client MUST immediately send `BONUS_SCORE` with the final score and `alive: false`, bypassing the throttle

---

### Requirement: Live Host Leaderboard
The host board MUST render a live-updating leaderboard of finalist scores, sorted by current score descending, re-rendering as each `BONUS_SCORE` arrives.

#### Scenario: Leaderboard reorders on new score
- GIVEN the leaderboard is ranked by last known scores
- WHEN a `BONUS_SCORE` raises one finalist above another
- THEN the board MUST re-render with the updated order

---

### Requirement: Stalled Finalist Handling
The host MUST track time since the last `BONUS_SCORE` per finalist. WHEN 5 seconds elapse with no message, the host MUST mark that finalist `stalled` and freeze their last known score, which MUST continue to count toward standings and finalization.

#### Scenario: Finalist goes silent
- GIVEN a finalist last reported a score of 340
- WHEN 5 seconds elapse with no further message
- THEN the host MUST mark the finalist `stalled`
- AND the frozen score of 340 MUST remain counted

---

### Requirement: Round Finalization
The system MUST finalize the bonus round when ALL finalists are dead-or-stalled, OR 180 seconds have elapsed since `BONUS_START`, OR the host manually ends the round — whichever occurs first.

#### Scenario: All finalists finish naturally
- GIVEN every finalist is dead or stalled
- WHEN the last one transitions to that state
- THEN the round MUST finalize immediately

#### Scenario: Hard time cap reached
- GIVEN at least one finalist is still alive
- WHEN 180 seconds have elapsed since `BONUS_START`
- THEN the round MUST finalize regardless

#### Scenario: Host manually ends the round
- GIVEN the round is in progress
- WHEN the host presses the manual end-round control
- THEN the round MUST finalize using each finalist's last known score

---

### Requirement: Champion Reveal
On finalization, the host MUST broadcast `BONUS_END` to ALL connected clients (finalists and spectators), carrying final standings and the skill champion(s). The champion(s) MUST be the finalist(s) with the highest final score; ties at the highest score MUST all be declared co-champions.

#### Scenario: Single champion
- GIVEN one finalist has the strictly highest score
- WHEN `BONUS_END` is broadcast
- THEN that finalist MUST be named sole skill champion to all clients

#### Scenario: Tied highest score
- GIVEN 2 finalists share the highest final score
- WHEN `BONUS_END` is broadcast
- THEN both MUST be declared co-champions and displayed as winners on every client

---

### Requirement: Spectator Screen
WHILE `gameState.current` is `BONUS_ROUND`, non-finalist student clients MUST display a static informational message instead of a stale or blank screen.

#### Scenario: Non-finalist sees spectator message
- GIVEN a student client's ID is not in the finalist list
- WHEN it receives `BONUS_START`
- THEN it MUST display a static message stating the bonus round is in progress and results will appear on the board

---

### Requirement: Independence from Quiz Scoring
The bonus round MUST NOT alter `gameState.totalScores`, `gameState.finalRanking`, or the previously-announced quiz champion. The skill champion MUST be presented as a separate, additional title.

#### Scenario: Quiz ranking unchanged after bonus round
- GIVEN the quiz has ended with a computed `finalRanking` and quiz champion
- WHEN the bonus round completes and a skill champion is revealed
- THEN `finalRanking` and the quiz champion display MUST remain unchanged
- AND the skill champion MUST be shown as a separate title alongside it
