// In-memory room registry for the WebSocket relay.
// A room lives only as long as its host socket (or until it goes idle for
// IDLE_TIMEOUT_MS). No persistence, no game logic — see design.md decisions
// #3 (host disconnect) and #4 (room GC).

const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours since last frame
const HOST_DISCONNECT_CODE = 4001;

/** @type {Map<string, { hostSocket: import('ws').WebSocket, students: Map<import('ws').WebSocket, true>, lastSeenAt: number }>} */
const rooms = new Map();

/** @type {Map<import('ws').WebSocket, { roomId: string, role: 'host' | 'student' }>} */
const socketRooms = new Map();

function safeClose(socket, code, reason) {
  try {
    socket.close(code, reason);
  } catch {
    // Socket may already be closing/closed — best effort.
  }
}

/**
 * Registers a new room bound to the given host socket.
 * Rejects if the Room ID is already taken by an active room.
 */
export function createRoom(roomId, hostSocket) {
  if (rooms.has(roomId)) {
    return { ok: false, error: 'ROOM_TAKEN' };
  }

  rooms.set(roomId, {
    hostSocket,
    students: new Map(),
    lastSeenAt: Date.now(),
  });
  socketRooms.set(hostSocket, { roomId, role: 'host' });

  return { ok: true };
}

/**
 * Associates a student socket with an existing room.
 * Rejects if the room does not exist.
 */
export function joinRoom(roomId, studentSocket) {
  const room = rooms.get(roomId);
  if (!room) {
    return { ok: false, error: 'ROOM_NOT_FOUND' };
  }

  room.students.set(studentSocket, true);
  room.lastSeenAt = Date.now();
  socketRooms.set(studentSocket, { roomId, role: 'student' });

  return { ok: true };
}

/** Returns { roomId, role } for a registered socket, or undefined. */
export function getSocketInfo(socket) {
  return socketRooms.get(socket);
}

/** Returns the room entry for a roomId, or undefined. */
export function getRoom(roomId) {
  return rooms.get(roomId);
}

/** Marks a room as having seen activity just now (extends its idle budget). */
export function touchRoom(roomId) {
  const room = rooms.get(roomId);
  if (room) {
    room.lastSeenAt = Date.now();
  }
}

/** Deletes a room and closes every student socket in it with the given code. */
function closeRoom(roomId, code, reason) {
  const room = rooms.get(roomId);
  if (!room) return;

  rooms.delete(roomId);
  socketRooms.delete(room.hostSocket);

  for (const studentSocket of room.students.keys()) {
    socketRooms.delete(studentSocket);
    safeClose(studentSocket, code, reason);
  }
}

/**
 * Removes a socket from the registry.
 * - Student socket: removed from its room's student map only.
 * - Host socket: the whole room is deleted and every student socket in it
 *   is closed with code 4001 (design.md decision #3).
 */
export function dropSocket(socket) {
  const info = socketRooms.get(socket);
  if (!info) return;

  const { roomId, role } = info;

  if (role === 'host') {
    closeRoom(roomId, HOST_DISCONNECT_CODE, 'Host disconnected');
    return;
  }

  socketRooms.delete(socket);
  const room = rooms.get(roomId);
  if (room) {
    room.students.delete(socket);
  }
}

/**
 * Drops any room with no frame seen in the last IDLE_TIMEOUT_MS
 * (design.md decision #4 — hard idle cap of 2h).
 */
export function sweepIdle() {
  const now = Date.now();

  for (const [roomId, room] of rooms) {
    if (now - room.lastSeenAt > IDLE_TIMEOUT_MS) {
      safeClose(room.hostSocket, HOST_DISCONNECT_CODE, 'Room idle timeout');
      closeRoom(roomId, HOST_DISCONNECT_CODE, 'Room idle timeout');
    }
  }
}
