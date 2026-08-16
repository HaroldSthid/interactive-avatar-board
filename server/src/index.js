import http from 'node:http';
import { WebSocketServer } from 'ws';

// PR 3 (Task 7/8/9) will introduce ./rooms.js and ./relay.js:
//   - rooms.js: the in-memory room registry (createRoom/joinRoom/dropSocket/sweepIdle)
//   - relay.js: the HELLO/JOIN dispatcher and message routing (host<->students)
// This scaffold wires the HTTP + WebSocket transport, the health endpoint, and
// the cold-start self-ping. Connection/message handling is stubbed until PR 3.

const PORT = process.env.PORT || 8080;
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL;

const SELF_PING_INTERVAL_MS = 10 * 60_000; // 10 minutes
const LIVENESS_SWEEP_INTERVAL_MS = 30_000; // 30 seconds

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (socket) => {
  socket.isAlive = true;
  socket.on('pong', () => {
    socket.isAlive = true;
  });

  // TODO(PR 3 / Task 8): dispatch through relay.js — HELLO registers
  // role+roomId via rooms.js and replies HELLO_ACK/ERROR; any other frame is
  // unicast to the room's host or broadcast to the room's students.
  socket.on('message', (_data) => {
    // Stub: no room registry or relay logic yet.
  });

  socket.on('close', () => {
    // TODO(PR 3 / Task 7): call rooms.dropSocket(socket) once the registry exists.
  });
});

// Cold-Start Self-Ping: keep the Render free-tier instance warm.
// Skipped entirely when RENDER_EXTERNAL_URL is absent (local dev).
if (RENDER_EXTERNAL_URL) {
  setInterval(() => {
    fetch(`${RENDER_EXTERNAL_URL}/health`).catch(() => {
      // Best-effort keep-alive; a failed self-ping is not fatal.
    });
  }, SELF_PING_INTERVAL_MS);
}

// 30s ping/pong liveness sweep (standard `ws` isAlive pattern).
// TODO(PR 3 / Task 9): on terminate, also call rooms.dropSocket(socket) so a
// dead host's room is freed and its students are dropped with code 4001.
setInterval(() => {
  for (const socket of wss.clients) {
    if (socket.isAlive === false) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, LIVENESS_SWEEP_INTERVAL_MS);

server.listen(PORT, () => {
  console.log(`Relay server listening on port ${PORT}`);
});
