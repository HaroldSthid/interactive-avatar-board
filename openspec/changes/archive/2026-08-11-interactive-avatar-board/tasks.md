# Implementation Tasks: Interactive Avatar Board

## Review Workload Forecast
Chained PRs recommended: Yes
400-line budget risk: High
Decision needed before apply: No
Estimated changed lines: 600-800 lines
Chain strategy: stacked-to-main

## Phase 1: Foundation (PR 1)
- [x] Create core HTML structure in `index.html` with views container, CDN links (Google Fonts, PeerJS), and viewport meta tag.
- [x] Implement initial CSS layout in `style.css` featuring dark/cyberpunk layout variables, base typography, and view display wrappers.
- [x] Implement view router and view toggles (Setup, Board, Controller) in `app.js`.
- [x] Render base visual containers: setup forms, avatar board quadrants, student input areas.

## Phase 2: Offline Simulation Engine (PR 1/2)
- [x] Implement local state machine in `app.js` with states: LOBBY, ACTIVE_QUESTION, LEADERBOARD.
- [x] Create teacher dashboard control controls (start game, next question, reset) and the simulator toggle button.
- [x] Implement mock client generator: programmatically populate active board with simulated students, unique IDs, and selected hero avatars.
- [x] Code random submission simulator: automatically generate simulated answers and random response times (timestamps) when simulator mode is enabled.

## Phase 3: P2P Connection & Dynamic Animation (PR 2/3)
- [x] Integrate PeerJS library on host and client. Write Room ID generator and connection listeners.
- [x] Add student connection form (Room ID, Student ID, Avatar select) and verify host acknowledgment.
- [x] Design real-time network message protocol (`JOIN`, `SUBMIT`, `START_QUESTION`, `ROUND_END`).
- [x] Implement CSS transition styles in `style.css` for animating avatars from starting line to selected quadrants.
- [x] Implement speed ranking engine calculating speed (timestamp minus question start) and sorting correct students.

## Phase 4: Verification & Polish (PR 3)
- [x] Apply cyberpunk glow effects, neon borders, and dynamic active states to the UI.
- [x] Add tooltips showing Student ID and exact response speed on avatar hover.
- [x] Create automated/manual testing script/verification checklist validating Host Room ID generation, Student Join, submission, and correct leaderboard sorting.
