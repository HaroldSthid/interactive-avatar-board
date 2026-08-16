# Delta for Avatar Board

## MODIFIED Requirements

### Requirement: Host Connection Setup
The system MUST generate a unique Room ID on host initialization and MUST establish a WebSocket connection to the relay server, registering the generated Room ID with it to accept incoming client connections.
(Previously: established peer-to-peer listeners using PeerJS instead of a relay-server WebSocket connection.)

#### Scenario: Host initializes room
- GIVEN the Host application is loaded
- WHEN the Host triggers room initialization
- THEN the system SHALL generate a unique Room ID
- AND the Host MUST open a WebSocket connection to the relay server and register that Room ID with it

---

### Requirement: Student Registration and Joining
A student client MUST join an active room by providing a valid Room ID, a traceable Student ID, and selecting a unique hero character avatar. Joining MUST occur via a WebSocket connection to the relay server, which routes the student into the room identified by the Room ID.
(Previously: student client connected directly to the host peer via PeerJS instead of via a relay-server WebSocket room.)

#### Scenario: Student joins room successfully
- GIVEN the Host has initialized a room with Room ID "ROOM123" registered with the relay server
- WHEN a Student client connects to the relay server via WebSocket and submits "ROOM123", Student ID "STUDENT_A", and selects "Hero-Knight"
- THEN the relay server MUST route the join to the host for room "ROOM123"
- AND the host board MUST register "STUDENT_A" with the "Hero-Knight" avatar

## Unchanged Requirements

The following requirements are unaffected by this change — their GIVEN/WHEN/THEN language does not reference the transport layer, only message content and client/host behavior already routed through the relay:

- Real-time Answer Submission
- Real-time Visual Race Board
- Leaderboard and Ranking
- Local Simulator Mode
