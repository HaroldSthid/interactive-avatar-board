import http from 'node:http';
import { WebSocketServer } from 'ws';
import { handleConnection } from './relay.js';
import { dropSocket, sweepIdle, getSocketInfo } from './rooms.js';

const PORT = process.env.PORT || 8080;
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL;

const SELF_PING_INTERVAL_MS = 10 * 60_000; // 10 minutes
const LIVENESS_SWEEP_INTERVAL_MS = 30_000; // 30 seconds
// A socket that keeps answering pings but never sends HELLO is invisible to
// both the liveness sweep (only drops failed-pong sockets) and sweepIdle
// (only iterates registered rooms) — it would otherwise sit in wss.clients
// forever. Give it a short window to register.
const HELLO_TIMEOUT_MS = 10_000; // 10 seconds

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

  const helloTimer = setTimeout(() => {
    if (!getSocketInfo(socket)) {
      socket.terminate();
    }
  }, HELLO_TIMEOUT_MS);
  socket.on('close', () => clearTimeout(helloTimer));

  handleConnection(socket);
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

// 30s ping/pong liveness sweep (standard `ws` isAlive pattern). A socket that
// missed the previous pong is terminated and dropped from the room registry
// (frees a dead host's room + closes its students with code 4001, or removes
// a dead student from its room). Also runs the 2h idle-room cap sweep.
setInterval(() => {
  for (const socket of wss.clients) {
    if (socket.isAlive === false) {
      socket.terminate();
      dropSocket(socket);
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }

  sweepIdle();
}, LIVENESS_SWEEP_INTERVAL_MS);

server.listen(PORT, () => {
  console.log(`Relay server listening on port ${PORT}`);
});
