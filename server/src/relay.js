// Control-plane handshake (HELLO/HELLO_ACK/ERROR) and game-plane pass-through
// relay. The dispatcher only ever reads `.type` — it never parses or
// validates game-plane payload shape (proposal non-goal: no game logic here).

import { createRoom, joinRoom, dropSocket, getSocketInfo, getRoom, touchRoom } from './rooms.js';

function send(socket, message) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function sendError(socket, code) {
  send(socket, { type: 'ERROR', payload: { code } });
}

function handleHello(socket, payload) {
  const role = payload && payload.role;
  const roomId = payload && payload.roomId;

  const validRole = role === 'host' || role === 'student';
  const validRoomId = typeof roomId === 'string' && roomId.length > 0;

  if (!validRole || !validRoomId) {
    sendError(socket, 'BAD_HELLO');
    return;
  }

  const result = role === 'host' ? createRoom(roomId, socket) : joinRoom(roomId, socket);

  if (!result.ok) {
    sendError(socket, result.error);
    return;
  }

  send(socket, { type: 'HELLO_ACK', payload: { roomId, role } });
}

function relayMessage(info, message) {
  const room = getRoom(info.roomId);
  if (!room) return;

  touchRoom(info.roomId);

  if (info.role === 'student') {
    send(room.hostSocket, message);
    return;
  }

  for (const studentSocket of room.students.keys()) {
    send(studentSocket, message);
  }
}

/** Wires the HELLO handshake + game-plane relay onto a freshly connected socket. */
export function handleConnection(socket) {
  socket.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      return; // malformed frame — silently ignored, no game logic to validate against
    }

    if (!message || typeof message.type !== 'string') return;

    const info = getSocketInfo(socket);

    if (message.type === 'HELLO') {
      if (info) return; // already registered — ignore a duplicate HELLO
      handleHello(socket, message.payload);
      return;
    }

    if (!info) return; // game-plane message arrived before a successful HELLO

    relayMessage(info, message);
  });

  socket.on('close', () => {
    dropSocket(socket);
  });
}
