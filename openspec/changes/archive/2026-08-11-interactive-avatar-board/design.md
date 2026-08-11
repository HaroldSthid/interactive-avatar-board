# Technical Design: Interactive Avatar Board

## 1. Technical Approach
The application is a single-page application (SPA) featuring a dual-view system, toggleable between **Teacher View** (Dashboard/Host) and **Student View** (Client/Player). 
- **Routing**: Local hash-based routing (`#/teacher`, `#/student`) handles views.
- **State Management**: Simple reactive state store built in vanilla JS, driving dynamic DOM rendering.

## 2. Architecture Decisions

| Decision | Selection | Rationale |
| :--- | :--- | :--- |
| **P2P Networking** | PeerJS | Zero-config, direct client-to-client communication. Removes backend complexity. |
| **Offline Mode** | Simulated Local Clients | Local stub objects mock socket traffic, allowing testing without multiple devices. |
| **Animations** | CSS Transitions & Transforms | Hardware-accelerated, lightweight rendering of moving avatars on a scoreboard/grid. |

## 3. Data Flow

```text
[Teacher Host]                 [Student Peer]
      |                               |
      | ----- 1. Host ID Ready -----> | (Shared out-of-band)
      | <---- 2. PeerJS Connect ----- | (Sends JOIN message)
      | ----- 3. Ack Connection ----> | (Confirms registration)
      |                               |
      | === Host starts question === |
      | ----- 4. START_QUESTION ----> | (Question data payload)
      | <---- 5. SUBMIT (Answer) ---- | (Includes choice + timestamp)
      |                               |
      | === Round finishes ===        |
      | ----- 6. ROUND_END ---------> | (Includes scoreboard results)
```

## 4. File Changes

- **`index.html`** (Create): Core HTML structure, loads Google Fonts (cyberpunk vibe), PeerJS library from CDN, container nodes for dynamic views, and Tailwind/Vanilla CSS integrations.
- **`style.css`** (Create): Neon-cyberpunk design, grid layout, animations for avatar movements, theme styles, and utility classes.
- **`app.js`** (Create): Orchestration logic: State Machine (Lobby, Active Question, Leaderboard), PeerJS host/client event loop, offline simulator, scoring calculation (accuracy + speed).

## 5. P2P Communication Protocol

All messages are JSON objects matching this format:

```json
{
  "type": "MESSAGE_TYPE",
  "payload": {}
}
```

### Protocol Schema

- **`JOIN`**: Sent by student.
  - Payload: `{ "peerId": "str", "name": "str", "avatar": "str" }`
- **`START_QUESTION`**: Sent by host.
  - Payload: `{ "questionId": 1, "text": "str", "options": ["A", "B"], "duration": 15 }`
- **`SUBMIT`**: Sent by student.
  - Payload: `{ "questionId": 1, "choice": "A", "timeElapsedMs": 3450 }`
- **`ROUND_END`**: Sent by host.
  - Payload: `{ "leaderboard": [ { "name": "str", "score": 1200, "position": [x, y] } ] }`

## 6. Testing Strategy

1. **Host-Client Connection Check**:
   - Open two browser tabs: one as Teacher Host, one as Student.
   - Paste Host ID into student connection input. Verify connection state.
2. **Answer Submission Verification**:
   - Submit correct/incorrect options. Check points computed on Teacher dashboard.
3. **Simulated Offline Verification**:
   - Turn on mock simulator toggle. Verify simulated players join, answer randomly, and move on board.
