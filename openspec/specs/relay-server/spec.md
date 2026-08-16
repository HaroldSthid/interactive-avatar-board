# Relay Server Specification

## Purpose

Provides a self-hosted Node.js WebSocket relay that routes messages between one host socket and N student sockets per room, replacing the PeerJS/WebRTC transport. The relay is a dumb router: it holds an in-memory connection registry and forwards JSON payloads unmodified; it does not implement or alter game logic, scoring, or state.

## Requirements

### Requirement: Room Registration
The relay server MUST accept a WebSocket connection from a host client and MUST register the host-generated Room ID against that socket in an in-memory room registry.

#### Scenario: Host registers a new room
- GIVEN a host client has generated Room ID "ROOM123"
- WHEN the host opens a WebSocket connection to the relay and registers "ROOM123"
- THEN the relay MUST create a room entry for "ROOM123" bound to that host socket

#### Scenario: Host registers a Room ID already in use
- GIVEN a room "ROOM123" is already registered to an active host socket
- WHEN a second WebSocket connection attempts to register "ROOM123" as host
- THEN the relay MUST reject the registration with an error
- AND the existing room's host socket MUST remain unaffected

---

### Requirement: Student Room Join
The relay server MUST accept a WebSocket connection from a student client and register that socket against a room via a `HELLO` control-plane handshake before any game-plane message is relayed. On `open`, the student client MUST send `HELLO` with `{role:'student', roomId}`; the relay MUST validate the Room ID and reply with either `HELLO_ACK` (registration succeeded) or `ERROR` (registration rejected). Only after receiving `HELLO_ACK` MUST the student client send the game-plane `JOIN` message, which the relay MUST unicast to the room's host socket unmodified.

#### Scenario: Student joins an existing room
- GIVEN a room "ROOM123" is registered with an active host socket
- WHEN a student client connects via WebSocket and sends `HELLO` with `{role:'student', roomId:'ROOM123'}`
- THEN the relay MUST associate that student socket with room "ROOM123" and reply `HELLO_ACK`
- AND WHEN the student client then sends the game-plane `JOIN` message
- THEN the relay MUST unicast the `JOIN` message to the room's host socket

#### Scenario: Student attempts to join a non-existent room
- GIVEN no room is registered under Room ID "ROOM999"
- WHEN a student client connects via WebSocket and sends `HELLO` with `{role:'student', roomId:'ROOM999'}`
- THEN the relay MUST reject the handshake and reply `ERROR`
- AND the relay MUST NOT create a room or associate the student socket with any room
- AND the relay MUST NOT accept a subsequent `JOIN` message from that socket

---

### Requirement: Message Relay Routing
The relay server MUST unicast student-originated messages to the room's host socket, and MUST broadcast host-originated messages to all student sockets currently associated with that room, preserving message type and payload shape unmodified.

#### Scenario: Student-to-host unicast
- GIVEN a student socket is associated with room "ROOM123"
- WHEN the student sends a `SUBMIT` message with `{questionId, studentId, choice, timeElapsedMs}`
- THEN the relay MUST forward that exact payload only to the host socket of room "ROOM123"

#### Scenario: Host-to-students broadcast
- GIVEN room "ROOM123" has 3 student sockets associated with it
- WHEN the host sends a `START_QUESTION`, `ROUND_END`, or `SESSION_END` message
- THEN the relay MUST forward that exact payload to all 3 student sockets
- AND the relay MUST NOT alter, drop, or reorder fields in the payload

---

### Requirement: Cold-Start Self-Ping
To mitigate free-tier host idle spin-down, the relay server MUST periodically send an HTTP request to its own health endpoint while running.

#### Scenario: Server stays warm during idle periods
- GIVEN the relay server has been running with no active WebSocket connections
- WHEN the self-ping interval elapses
- THEN the relay server MUST issue an HTTP request to its own `/health` endpoint
- AND the endpoint MUST respond successfully, resetting the host's idle timer

---

### Requirement: In-Memory-Only State
The relay server MUST hold all room and connection state in memory only, with no persistence layer, so that a server restart clears all rooms.

#### Scenario: Server restart clears rooms
- GIVEN room "ROOM123" is registered with an active host and student sockets
- WHEN the relay server process restarts
- THEN room "ROOM123" MUST no longer exist
- AND any client MUST reconnect and re-register/re-join to resume, matching today's reset-on-host-reload behavior
