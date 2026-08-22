# Delta for Avatar Board

## MODIFIED Requirements

### Requirement: Leaderboard and Ranking
The Host board MUST calculate response speed as response timestamp minus question start timestamp, and MUST rank correct answers in ascending order of speed. After the session ends, the host MAY trigger a transition into a `BONUS_ROUND` state per the `bonus-round` capability; this transition MUST NOT retroactively alter the already-computed final quiz ranking or the announced quiz champion.
(Previously: `SESSION_END` was a terminal state with no defined next-phase transition.)

#### Scenario: Host compiles leaderboard
- GIVEN a question started at timestamp 1723400000000
- AND Student ID "STUDENT_A" submitted correct quadrant "A" at timestamp 1723400000500 (speed: 500ms)
- AND Student ID "STUDENT_B" submitted correct quadrant "A" at timestamp 1723400000200 (speed: 200ms)
- WHEN the Host processes round results
- THEN the leaderboard MUST rank "STUDENT_B" above "STUDENT_A"

#### Scenario: Host starts bonus round after session end
- GIVEN the session has ended and the final quiz ranking has been computed and announced
- WHEN the host triggers the bonus round transition
- THEN the system MUST enter `BONUS_ROUND` per the `bonus-round` capability
- AND the final quiz ranking and quiz champion display MUST remain unchanged

## Unchanged Requirements

The following requirements are unaffected by this change:

- Host Connection Setup
- Student Registration and Joining
- Real-time Answer Submission
- Real-time Visual Race Board
- Local Simulator Mode
