# Verification Checklist: Interactive Avatar Board

Manual verification checklist for the `avatar-board` capability. No build tooling
or test framework exists in this project, so verification is performed by hand
in a real browser against `index.html` (open directly or serve statically —
PeerJS requires no backend).

Run through every section below before merging. Check each box `[x]` once
confirmed. Record the browser(s)/OS used at the bottom.

## 1. Host Room ID Generation (Requirement: Host Connection Setup)

- [ ] Open the app in Tab A, go to Setup, submit "Start Hosting".
- [ ] A Room ID in the form `ROOM-XXXX` appears in the Room ID field and in the
      `Room: ...` badge on the Board view.
- [ ] The app auto-navigates to the Board view (`#/board`) after the PeerJS
      peer opens.
- [ ] Reload and repeat 2-3 times — each run produces a different Room ID
      (no collisions / no stuck "Connecting..." state).
- [ ] Confirm no PeerJS errors in the browser console after room creation.

## 2. Student Join (Requirement: Student Registration and Joining)

- [ ] Open the app in Tab B (or a second device on the same network).
- [ ] On Setup, fill Room ID (copied from Tab A), a Student ID, and pick an
      avatar, then submit "Join Board".
- [ ] Tab B navigates to the Controller view and the status badge changes to
      `Student: <id> (connected)` after the `JOIN_ACK` round-trip.
- [ ] Tab A's board roster shows the new student's tag with the chosen avatar
      and Student ID.
- [ ] Tab A's starting line shows a new avatar token labeled with the first
      two characters of the Student ID.
- [ ] Hovering the avatar token in Tab A shows a tooltip with the full
      Student ID (before any submission).
- [ ] Repeat with a second/third student to confirm multiple concurrent
      joins are handled without overwriting each other in the roster.

## 3. Question Round & Answer Submission (Requirement: Real-time Answer Submission / Real-time Visual Race Board)

- [ ] On the Board (host), set "Correct Answer" (e.g. `A`).
- [ ] Click "Start Game". Board state badge shows `State: ACTIVE_QUESTION`
      and the quadrants show the Phase 4 pulsing glow animation.
- [ ] Tab B's controller shows the question text and enabled A/B/C/D buttons.
- [ ] Click a quadrant in Tab B. The button becomes disabled and the
      controller shows "Answer submitted! Waiting for round results…".
- [ ] Tab A's avatar token animates from the starting line into the selected
      quadrant's lane (FLIP transition, no console errors).
- [ ] The roster tag for that student switches to the "submitted" (green
      border) state.
- [ ] Hovering the avatar token now shows `<StudentID> — <N>ms` (exact
      response speed), not just the bare ID.
- [ ] Submit from a second student with a different (or same) quadrant and
      confirm both avatars land independently without visual overlap issues.

## 4. Leaderboard / Speed Ranking (Requirement: Leaderboard and Ranking)

- [ ] Click "End Question" on the host. Board state badge shows
      `State: LEADERBOARD` (yellow glow) and quadrants adopt the gold
      leaderboard styling.
- [ ] The leaderboard panel lists only students who chose the correct
      quadrant, each as `<StudentID> — <speed>ms`.
- [ ] Entries are sorted ascending by speed (fastest correct answer first);
      the top entry is visually highlighted (gold glow/bold).
- [ ] Avatars for correct submissions turn green; avatars for incorrect
      submissions turn red (and the red/green color also reflects in the
      tooltip's neon border on hover).
- [ ] Students who did not submit have no leaderboard entry and are not
      colored green/red.
- [ ] Tab B receives `ROUND_END` and shows "Round ended! Check the board for
      results." with options disabled.
- [ ] Click "Next Question" — a new round starts, avatars return to the
      starting line, tooltips reset to plain Student ID, and the board state
      returns to `ACTIVE_QUESTION`.

## 5. Simulator Mode (Requirement: Local Simulator Mode) — regression check

- [ ] From Setup/Board with no real students connected, toggle
      "Simulator: Off" -> "On". Mock students appear in the roster and
      starting line.
- [ ] Click "Start Game". Mock students submit random answers at random
      delays and animate into quadrants without manual interaction.
- [ ] Toggling the simulator off mid-round (or clicking Reset) clears any
      pending simulated submissions (no orphaned timers firing after reset).
- [ ] KNOWN LIMITATION: toggling the simulator "On" *after* a real student has
      already joined generates no mock students (both gate on
      `students.length === 0`). Confirm this is the expected/accepted
      behavior, not a regression, before sign-off.

## 7. Reset / Re-run Regression (added after CRITICAL fix)

- [ ] Run a full round (set Correct Answer, Start Game, get a submission,
      End Question) so the leaderboard is populated.
- [ ] Click "Reset". Confirm the "Correct Answer" dropdown visually returns
      to `--` (not left on the previous letter).
- [ ] Without touching the dropdown again, click "Start Game" then a
      submission, then "End Question" — the leaderboard should stay empty
      and the host should be prompted to pick a Correct Answer again, NOT
      silently show an empty leaderboard as if scoring ran.
- [ ] From the Board view, click "Exit" (back to Setup), then "Start Hosting"
      again in the same tab. Confirm only one active Room ID/Peer exists
      (old room no longer reachable) — no duplicate/leaked PeerJS session.

## 6. Visual/UX Polish Spot Check (Phase 4)

- [ ] Quadrants glow/pulse only during `ACTIVE_QUESTION`; no animation runs
      while in `LOBBY`.
- [ ] Buttons show a neon glow on hover (`Start Hosting`, `Join Board`,
      `Start Game`, controller quadrant buttons).
- [ ] Avatar hover tooltip is legible against the dark background and does
      not get clipped at the edges of the board on a standard desktop
      viewport (~1280px wide).
- [ ] No layout shift or overlap regressions introduced by the new glow/
      tooltip styles at common breakpoints (desktop + narrow/tablet width).

## Sign-off

| Field | Value |
| :--- | :--- |
| Browser(s) tested | |
| OS | |
| Tester | |
| Date | |
| Result | PASS / FAIL (list failures below) |

### Notes / Failures
