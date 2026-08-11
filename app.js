'use strict';

/**
 * Interactive Avatar Board — app.js
 * Phase 1 (Foundation): view router + view toggles.
 * Phase 2 (Offline Simulation Engine): local state machine, teacher dashboard
 * controls, mock client generator, and random submission simulator.
 * Phase 3 (P2P Connection & Dynamic Animation): PeerJS host/client wiring,
 * Room ID generation, JOIN/SUBMIT/START_QUESTION/ROUND_END network protocol,
 * avatar-token movement between the starting line and quadrant lanes, and
 * the speed ranking (leaderboard) engine.
 *
 * Phase 4 (Verification & Polish): dynamic `data-state` wiring for the
 * cyberpunk glow/active-state CSS, avatar hover tooltips (Student ID +
 * exact response speed), and the manual verification checklist
 * (see openspec/changes/interactive-avatar-board/verification-checklist.md).
 */

// ---------------------------------------------------------------------------
// View Router
// ---------------------------------------------------------------------------

const VIEWS = ['setup', 'board', 'controller'];
const DEFAULT_VIEW = 'setup';

/**
 * Reads the current view name from the URL hash (e.g. "#/board" -> "board").
 * Falls back to DEFAULT_VIEW if the hash is empty or unrecognized.
 */
function getViewFromHash() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  return VIEWS.includes(hash) ? hash : DEFAULT_VIEW;
}

/**
 * Shows the requested view section and hides the others.
 * @param {string} viewName - one of VIEWS
 */
function showView(viewName) {
  const target = VIEWS.includes(viewName) ? viewName : DEFAULT_VIEW;

  VIEWS.forEach((name) => {
    const section = document.getElementById(`view-${name}`);
    if (!section) return;
    section.hidden = name !== target;
  });
}

/**
 * Navigates to a view by updating the hash (triggers hashchange -> showView).
 * @param {string} viewName - one of VIEWS
 */
function navigateTo(viewName) {
  if (!VIEWS.includes(viewName)) return;
  window.location.hash = `/${viewName}`;
}

function initRouter() {
  window.addEventListener('hashchange', () => {
    showView(getViewFromHash());
  });

  showView(getViewFromHash());
}

// ---------------------------------------------------------------------------
// View toggle wiring (Setup <-> Board <-> Controller)
// ---------------------------------------------------------------------------

function initViewToggles() {
  const formHost = document.getElementById('form-host');
  const formStudent = document.getElementById('form-student');
  const btnBackToSetupBoard = document.getElementById('btn-back-to-setup-board');
  const btnBackToSetupController = document.getElementById('btn-back-to-setup-controller');

  // Host form: initializes the PeerJS host peer (Room ID + listener) and
  // navigates to the Board view once the connection is open.
  if (formHost) {
    formHost.addEventListener('submit', (event) => {
      event.preventDefault();
      setHostStatus('Connecting...');
      initHostPeer();
    });
  }

  // Student form: joins the host's room via PeerJS (JOIN handshake) and
  // navigates to the Controller view.
  if (formStudent) {
    formStudent.addEventListener('submit', (event) => {
      event.preventDefault();

      const roomInput = document.getElementById('input-join-room');
      const studentIdInput = document.getElementById('input-student-id');
      const avatarInput = document.getElementById('input-avatar');

      const roomId = roomInput ? roomInput.value.trim() : '';
      const studentId = studentIdInput ? studentIdInput.value.trim() : '';
      const avatar = avatarInput ? avatarInput.value : MOCK_AVATARS[0];

      if (!roomId || !studentId) return;

      setControllerStatus(`Student: ${studentId} (connecting...)`);
      navigateTo('controller');
      joinRoom(roomId, studentId, avatar);
    });
  }

  if (btnBackToSetupBoard) {
    btnBackToSetupBoard.addEventListener('click', () => {
      destroyHostPeer();
      navigateTo('setup');
    });
  }

  if (btnBackToSetupController) {
    btnBackToSetupController.addEventListener('click', () => navigateTo('setup'));
  }
}

// ---------------------------------------------------------------------------
// State Machine (LOBBY / ACTIVE_QUESTION / LEADERBOARD)
// ---------------------------------------------------------------------------

const GAME_STATES = {
  LOBBY: 'LOBBY',
  ACTIVE_QUESTION: 'ACTIVE_QUESTION',
  LEADERBOARD: 'LEADERBOARD',
};

const QUADRANTS = ['A', 'B', 'C', 'D'];
const MOCK_AVATARS = ['hero-knight', 'shadow-ninja', 'cyber-mage', 'star-ranger'];
const MOCK_NAME_POOL = [
  'Aiko', 'Bram', 'Cass', 'Dex', 'Enzo', 'Fina', 'Goro', 'Hana',
  'Ivo', 'Juno', 'Kade', 'Lira', 'Milo', 'Nyx', 'Ori', 'Piko',
];
const SIMULATOR_STUDENT_COUNT = 6;
const SIMULATOR_MIN_DELAY_MS = 500;
const SIMULATOR_MAX_DELAY_MS = 4000;

/**
 * Local (offline) game state. `students`/`submissions` mock what will later
 * arrive over PeerJS in Phase 3; the shape mirrors the JOIN/SUBMIT payloads
 * documented in the design's P2P protocol so Phase 3 can plug in network
 * events instead of the simulator with minimal changes.
 */
const gameState = {
  current: GAME_STATES.LOBBY,
  simulatorEnabled: false,
  students: [], // { id, name, avatar, isMock }
  questionStartedAt: null,
  questionId: 0,
  correctAnswer: null, // host-designated correct quadrant for the active question
  submissions: [], // { studentId, choice, timestamp }
  lastLeaderboard: [], // [{ studentId, speedMs }], ranked ascending, correct answers only
  pendingTimers: [],

  // --- PeerJS (Phase 3) ---
  peer: null, // host: this device's PeerJS Peer instance
  roomId: null, // host: the Room ID this peer is listening on
  connections: [], // host: [{ conn, studentId }] for connected students
  studentPeer: null, // student: this device's PeerJS Peer instance
  hostConnection: null, // student: DataConnection to the host
  studentId: null, // student: this device's Student ID
  controllerQuestionStartedAt: null, // student: local clock ref for elapsed time
  controllerCurrentQuestionId: null, // student: questionId of the active question
  controllerHasSubmitted: false, // student: guards against double submission
};

/**
 * Transitions the state machine and re-renders dashboard controls.
 * @param {string} nextState - one of GAME_STATES
 */
function setGameState(nextState) {
  if (!Object.values(GAME_STATES).includes(nextState)) return;
  gameState.current = nextState;
  renderDashboard();
}

/**
 * Generates a unique mock student ID not already present in gameState.students.
 */
function generateUniqueMockId() {
  let candidate;
  do {
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    candidate = `SIM-${suffix}`;
  } while (gameState.students.some((student) => student.id === candidate));
  return candidate;
}

/**
 * Mock client generator: populates the active board with simulated students,
 * each with a unique ID and a randomly selected hero avatar.
 * @param {number} count
 */
function generateMockClients(count = SIMULATOR_STUDENT_COUNT) {
  for (let i = 0; i < count; i += 1) {
    const id = generateUniqueMockId();
    const name = MOCK_NAME_POOL[Math.floor(Math.random() * MOCK_NAME_POOL.length)];
    const avatar = MOCK_AVATARS[Math.floor(Math.random() * MOCK_AVATARS.length)];
    gameState.students.push({ id, name, avatar, isMock: true });
  }
  renderRoster();
}

/**
 * Clears any scheduled simulator submission timers (used on reset/toggle-off
 * and when a question round ends early).
 */
function clearPendingSimulatorTimers() {
  gameState.pendingTimers.forEach((timerId) => window.clearTimeout(timerId));
  gameState.pendingTimers = [];
}

/**
 * Random submission simulator: schedules a randomized quadrant choice and a
 * high-resolution response timestamp for each mock student currently on the
 * board, at a random delay within the simulator window.
 */
function scheduleSimulatedSubmissions() {
  clearPendingSimulatorTimers();

  gameState.students
    .filter((student) => student.isMock)
    .forEach((student) => {
      const delay = SIMULATOR_MIN_DELAY_MS + Math.random() * (SIMULATOR_MAX_DELAY_MS - SIMULATOR_MIN_DELAY_MS);
      const timerId = window.setTimeout(() => {
        recordSubmission(student.id, QUADRANTS[Math.floor(Math.random() * QUADRANTS.length)]);
      }, delay);
      gameState.pendingTimers.push(timerId);
    });
}

/**
 * Records a submission (choice + timestamp) for a student against the
 * current question, ignored outside ACTIVE_QUESTION.
 * @param {string} studentId
 * @param {string} choice - one of QUADRANTS
 * @param {number} [timestamp] - defaults to Date.now() (simulator); real P2P
 *   submissions pass a host-clock-relative timestamp derived from the
 *   student's reported elapsed time to avoid cross-device clock skew.
 */
function recordSubmission(studentId, choice, timestamp = Date.now()) {
  if (gameState.current !== GAME_STATES.ACTIVE_QUESTION) return;
  if (gameState.submissions.some((sub) => sub.studentId === studentId)) return;
  gameState.submissions.push({ studentId, choice, timestamp });
  renderRoster();
}

// ---------------------------------------------------------------------------
// Teacher dashboard controls (start game / next question / reset / simulator)
// ---------------------------------------------------------------------------

/**
 * Starts a fresh ACTIVE_QUESTION round: resets submissions/avatar positions,
 * broadcasts START_QUESTION to connected students, and (re-)arms the
 * simulator when enabled. Shared by startGame() and the LEADERBOARD ->
 * ACTIVE_QUESTION branch of nextQuestion().
 */
function startNewQuestionRound() {
  gameState.questionId += 1;
  gameState.questionStartedAt = Date.now();
  gameState.submissions = [];
  gameState.lastLeaderboard = [];
  resetAvatarPositions();
  setGameState(GAME_STATES.ACTIVE_QUESTION);

  if (gameState.simulatorEnabled) {
    scheduleSimulatedSubmissions();
  }

  broadcastToStudents({
    type: MSG_TYPES.START_QUESTION,
    payload: {
      questionId: gameState.questionId,
      text: 'New question! Choose your answer.',
      options: QUADRANTS,
      startedAt: gameState.questionStartedAt,
    },
  });

  renderRoster();
}

function startGame() {
  if (gameState.current !== GAME_STATES.LOBBY) return;

  if (gameState.simulatorEnabled && gameState.students.length === 0) {
    generateMockClients();
  }

  startNewQuestionRound();
}

function nextQuestion() {
  if (gameState.current === GAME_STATES.ACTIVE_QUESTION) {
    clearPendingSimulatorTimers();
    const leaderboard = computeLeaderboard();
    gameState.lastLeaderboard = leaderboard;
    markRoundResults(leaderboard);
    setGameState(GAME_STATES.LEADERBOARD);
    broadcastToStudents({ type: MSG_TYPES.ROUND_END, payload: { leaderboard } });
    return;
  }

  if (gameState.current === GAME_STATES.LEADERBOARD) {
    startNewQuestionRound();
  }
}

function resetGame() {
  clearPendingSimulatorTimers();
  gameState.connections.forEach(({ conn }) => {
    try {
      conn.close();
    } catch (err) {
      // ignore — connection may already be closed
    }
  });
  gameState.connections = [];
  gameState.students = [];
  gameState.submissions = [];
  gameState.lastLeaderboard = [];
  gameState.questionStartedAt = null;
  gameState.questionId = 0;
  gameState.correctAnswer = null;
  const selectCorrectAnswer = document.getElementById('input-correct-answer');
  if (selectCorrectAnswer) {
    selectCorrectAnswer.value = '';
  }
  document.querySelectorAll('.avatar-token').forEach((token) => token.remove());
  setGameState(GAME_STATES.LOBBY);
  renderRoster();
}

function toggleSimulator() {
  gameState.simulatorEnabled = !gameState.simulatorEnabled;

  if (gameState.simulatorEnabled && gameState.students.length === 0) {
    generateMockClients();
  }

  if (!gameState.simulatorEnabled) {
    clearPendingSimulatorTimers();
  }

  renderDashboard();
}

// ---------------------------------------------------------------------------
// Dashboard rendering
// ---------------------------------------------------------------------------

function renderDashboard() {
  const stateLabel = document.getElementById('board-state');
  const btnStart = document.getElementById('btn-start-game');
  const btnNext = document.getElementById('btn-next-question');
  const btnSimulator = document.getElementById('btn-toggle-simulator');
  const boardTrack = document.getElementById('board-track');

  if (stateLabel) {
    stateLabel.textContent = `State: ${gameState.current}`;
    stateLabel.dataset.state = gameState.current;
  }

  // Drives the Phase 4 cyberpunk active-state CSS (pulsing quadrant glow
  // while a question is active, gold glow while the leaderboard is shown).
  if (boardTrack) {
    boardTrack.dataset.state = gameState.current;
  }

  if (btnStart) {
    btnStart.disabled = gameState.current !== GAME_STATES.LOBBY;
  }

  if (btnNext) {
    btnNext.disabled = gameState.current === GAME_STATES.LOBBY;
    btnNext.textContent = gameState.current === GAME_STATES.LEADERBOARD ? 'Next Question' : 'End Question';
  }

  if (btnSimulator) {
    btnSimulator.textContent = `Simulator: ${gameState.simulatorEnabled ? 'On' : 'Off'}`;
  }

  renderLeaderboardPanel();
}

/**
 * Renders (or hides, outside LEADERBOARD) the ranked list of correct
 * submissions for the round that just ended.
 */
function renderLeaderboardPanel() {
  const panel = document.getElementById('board-leaderboard');
  if (!panel) return;

  if (gameState.current !== GAME_STATES.LEADERBOARD) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }

  panel.hidden = false;
  panel.innerHTML = '';

  if (gameState.lastLeaderboard.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'leaderboard__empty';
    empty.textContent = 'No correct answers this round.';
    panel.appendChild(empty);
    return;
  }

  const list = document.createElement('ol');
  list.className = 'leaderboard__list';
  gameState.lastLeaderboard.forEach((entry) => {
    const item = document.createElement('li');
    item.textContent = `${entry.studentId} — ${entry.speedMs}ms`;
    list.appendChild(item);
  });
  panel.appendChild(list);
}

/**
 * Renders the roster of connected (or mock) students, marking each with
 * whether they have submitted an answer for the current question.
 */
function renderRoster() {
  const roster = document.getElementById('board-roster');
  if (!roster) return;

  roster.innerHTML = '';

  gameState.students.forEach((student) => {
    const hasSubmitted = gameState.submissions.some((submission) => submission.studentId === student.id);
    const tag = document.createElement('span');
    tag.className = 'badge roster-tag';
    tag.dataset.avatar = student.avatar;
    tag.dataset.submitted = String(hasSubmitted);
    tag.title = student.id;
    tag.textContent = `${student.name} (${student.id})`;
    roster.appendChild(tag);
  });

  syncAvatarTokens();
}

// ---------------------------------------------------------------------------
// Avatar-token animation (starting line -> quadrant lane)
// ---------------------------------------------------------------------------

/**
 * Ensures every student in gameState.students has a corresponding avatar
 * token on the board, and moves any token whose owner has just submitted
 * from the starting line into their chosen quadrant lane.
 */
function syncAvatarTokens() {
  const startingLine = document.getElementById('board-starting-line');
  if (!startingLine) return;

  gameState.students.forEach((student) => {
    let token = document.querySelector(`.avatar-token[data-student-id="${student.id}"]`);
    if (!token) {
      token = document.createElement('div');
      token.className = 'avatar-token';
      token.dataset.studentId = student.id;
      token.dataset.avatar = student.avatar;
      token.dataset.submitted = 'false';
      token.title = student.id;
      token.dataset.tooltip = student.id;
      token.textContent = student.id.slice(0, 2).toUpperCase();
      startingLine.appendChild(token);
    }

    const submission = gameState.submissions.find((sub) => sub.studentId === student.id);
    if (submission && token.dataset.submitted !== 'true') {
      moveAvatarToken(student.id, submission.choice);
    }

    if (submission) {
      updateAvatarTooltip(student.id, submission);
    }
  });
}

/**
 * Updates an avatar token's hover tooltip (`title` + `data-tooltip`) to show
 * the Student ID and the exact response speed (submission timestamp minus
 * question start timestamp), once that student has submitted an answer.
 * @param {string} studentId
 * @param {{timestamp: number}} submission
 */
function updateAvatarTooltip(studentId, submission) {
  const token = document.querySelector(`.avatar-token[data-student-id="${studentId}"]`);
  if (!token || gameState.questionStartedAt === null) return;

  const speedMs = submission.timestamp - gameState.questionStartedAt;
  const label = `${studentId} — ${speedMs}ms`;
  token.title = label;
  token.dataset.tooltip = label;
}

/**
 * Moves a student's avatar token into the given quadrant's lane, using the
 * FLIP technique (First/Last/Invert/Play) so the CSS `transform` transition
 * animates the perceived movement even though the token is reparented.
 * @param {string} studentId
 * @param {string} quadrant - one of QUADRANTS
 */
function moveAvatarToken(studentId, quadrant) {
  const token = document.querySelector(`.avatar-token[data-student-id="${studentId}"]`);
  const laneEl = document.querySelector(`.quadrant[data-quadrant="${quadrant}"] .quadrant__lane`);
  if (!token || !laneEl) return;

  const firstRect = token.getBoundingClientRect();

  laneEl.appendChild(token);
  token.dataset.submitted = 'true';

  const lastRect = token.getBoundingClientRect();
  const deltaX = firstRect.left - lastRect.left;
  const deltaY = firstRect.top - lastRect.top;

  token.style.transition = 'none';
  token.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

  requestAnimationFrame(() => {
    token.style.transition = '';
    token.style.transform = '';
  });
}

/**
 * Returns every avatar token to the starting line (used when a new question
 * round begins). Correctness styling is cleared as part of the reset.
 */
function resetAvatarPositions() {
  const startingLine = document.getElementById('board-starting-line');
  if (!startingLine) return;

  document.querySelectorAll('.avatar-token').forEach((token) => {
    token.dataset.submitted = 'false';
    token.removeAttribute('data-correct');
    const studentId = token.dataset.studentId;
    token.title = studentId;
    token.dataset.tooltip = studentId;
    startingLine.appendChild(token);
  });
}

/**
 * Colors each submitted avatar token green (correct) or red (incorrect)
 * based on the computed leaderboard for the round that just ended.
 * @param {Array<{studentId: string}>} leaderboard
 */
function markRoundResults(leaderboard) {
  const correctIds = new Set(leaderboard.map((entry) => entry.studentId));
  gameState.submissions.forEach((sub) => {
    const token = document.querySelector(`.avatar-token[data-student-id="${sub.studentId}"]`);
    if (!token) return;
    token.dataset.correct = String(correctIds.has(sub.studentId));
  });
}

// ---------------------------------------------------------------------------
// Speed ranking engine
// ---------------------------------------------------------------------------

/**
 * Ranks correct submissions for the current question in ascending order of
 * speed (submission timestamp minus question start timestamp). Submissions
 * that do not match gameState.correctAnswer are excluded.
 * @returns {Array<{studentId: string, speedMs: number}>}
 */
function computeLeaderboard() {
  if (!gameState.correctAnswer || gameState.questionStartedAt === null) return [];

  return gameState.submissions
    .filter((sub) => sub.choice === gameState.correctAnswer)
    .map((sub) => ({
      studentId: sub.studentId,
      speedMs: sub.timestamp - gameState.questionStartedAt,
    }))
    .sort((a, b) => a.speedMs - b.speedMs);
}

function initDashboardControls() {
  const btnStart = document.getElementById('btn-start-game');
  const btnNext = document.getElementById('btn-next-question');
  const btnReset = document.getElementById('btn-reset-game');
  const btnSimulator = document.getElementById('btn-toggle-simulator');
  const selectCorrectAnswer = document.getElementById('input-correct-answer');

  if (btnStart) btnStart.addEventListener('click', startGame);
  if (btnNext) btnNext.addEventListener('click', nextQuestion);
  if (btnReset) btnReset.addEventListener('click', resetGame);
  if (btnSimulator) btnSimulator.addEventListener('click', toggleSimulator);
  if (selectCorrectAnswer) {
    selectCorrectAnswer.addEventListener('change', () => {
      gameState.correctAnswer = selectCorrectAnswer.value || null;
    });
  }

  renderDashboard();
  renderRoster();
}

// ---------------------------------------------------------------------------
// P2P Network Protocol (PeerJS) — Room ID generation, host/client wiring,
// and the JOIN / SUBMIT / START_QUESTION / ROUND_END message protocol.
//
// Message shape: { type: 'JOIN' | 'JOIN_ACK' | 'SUBMIT' | 'START_QUESTION' |
// 'ROUND_END', payload: {} }
//
// SUBMIT carries `timeElapsedMs` (student-clock elapsed time since it
// received START_QUESTION) rather than an absolute timestamp, so the host
// can derive a timestamp on its own clock (questionStartedAt + timeElapsedMs)
// and avoid cross-device clock-skew when computing speed rankings.
// ---------------------------------------------------------------------------

const MSG_TYPES = {
  JOIN: 'JOIN',
  JOIN_ACK: 'JOIN_ACK',
  SUBMIT: 'SUBMIT',
  START_QUESTION: 'START_QUESTION',
  ROUND_END: 'ROUND_END',
};

const HOST_ID_RETRY_LIMIT = 5;

/**
 * Generates a short, human-shareable Room ID suitable as a PeerJS peer ID.
 */
function generateRoomId() {
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ROOM-${suffix}`;
}

function setHostStatus(text) {
  const input = document.getElementById('input-host-room');
  if (input) input.value = text;
}

function setControllerStatus(text) {
  const tag = document.getElementById('controller-student-tag');
  if (tag) tag.textContent = text;
}

/**
 * Initializes the host's PeerJS Peer with a generated Room ID and opens a
 * listener for incoming student connections. Retries with a new Room ID on
 * an `unavailable-id` collision, up to HOST_ID_RETRY_LIMIT attempts.
 * @param {number} [attempt]
 */
function initHostPeer(attempt = 0) {
  if (typeof Peer === 'undefined') {
    setHostStatus('PeerJS unavailable');
    return;
  }

  const roomId = generateRoomId();
  const peer = new Peer(roomId);

  peer.on('open', (id) => {
    gameState.peer = peer;
    gameState.roomId = id;
    setHostStatus(id);
    const badge = document.getElementById('board-room-id');
    if (badge) badge.textContent = `Room: ${id}`;
    navigateTo('board');
  });

  peer.on('connection', handleIncomingConnection);

  peer.on('error', (err) => {
    if (err && err.type === 'unavailable-id' && attempt < HOST_ID_RETRY_LIMIT) {
      peer.destroy();
      initHostPeer(attempt + 1);
      return;
    }
    console.error('PeerJS host error:', err);
    setHostStatus(`Connection error: ${(err && err.type) || 'unknown'}`);
  });
}

/**
 * Tears down the host's PeerJS peer (and its signaling connection) so
 * leaving the Board without a page reload doesn't leak a stale room that
 * `initHostPeer()` would otherwise duplicate on the next "Start Hosting".
 */
function destroyHostPeer() {
  if (gameState.peer) {
    gameState.peer.destroy();
    gameState.peer = null;
  }
  gameState.roomId = null;
  gameState.connections = [];
}

/**
 * Wires a newly-opened incoming DataConnection to the host message handler.
 * @param {DataConnection} conn
 */
function handleIncomingConnection(conn) {
  conn.on('data', (data) => handleHostMessage(conn, data));

  conn.on('close', () => {
    gameState.connections = gameState.connections.filter((entry) => entry.conn !== conn);
  });

  conn.on('error', (err) => {
    console.error('PeerJS host connection error:', err);
  });
}

/**
 * Handles an incoming message from a student's DataConnection.
 * @param {DataConnection} conn
 * @param {{type: string, payload: object}} message
 */
function handleHostMessage(conn, message) {
  if (!message || typeof message.type !== 'string') return;

  switch (message.type) {
    case MSG_TYPES.JOIN: {
      const { studentId, avatar } = message.payload || {};
      if (!studentId) return;
      registerRealStudent(conn, studentId, avatar);
      break;
    }
    case MSG_TYPES.SUBMIT: {
      const { studentId, choice, timeElapsedMs } = message.payload || {};
      if (!studentId || !choice) return;
      const timestamp = (gameState.questionStartedAt || Date.now()) + (timeElapsedMs || 0);
      recordSubmission(studentId, choice, timestamp);
      break;
    }
    default:
      break;
  }
}

/**
 * Registers a real (network-connected) student on the board, reusing the
 * same students/roster/avatar-token pipeline as the offline simulator, then
 * acknowledges the JOIN back to the student.
 * @param {DataConnection} conn
 * @param {string} studentId
 * @param {string} [avatar]
 */
function registerRealStudent(conn, studentId, avatar) {
  const alreadyRegistered = gameState.students.some((student) => student.id === studentId);
  if (!alreadyRegistered) {
    gameState.students.push({
      id: studentId,
      name: studentId,
      avatar: avatar || MOCK_AVATARS[0],
      isMock: false,
    });
  }

  const alreadyTracked = gameState.connections.some((entry) => entry.conn === conn);
  if (!alreadyTracked) {
    gameState.connections.push({ conn, studentId });
  }

  if (conn.open) {
    conn.send({ type: MSG_TYPES.JOIN_ACK, payload: { studentId, status: 'ok' } });
  } else {
    conn.on('open', () => conn.send({ type: MSG_TYPES.JOIN_ACK, payload: { studentId, status: 'ok' } }));
  }

  renderRoster();
}

/**
 * Sends a message to every connected (open) student DataConnection.
 * @param {{type: string, payload: object}} message
 */
function broadcastToStudents(message) {
  gameState.connections.forEach(({ conn }) => {
    if (conn.open) conn.send(message);
  });
}

/**
 * Initializes the student's PeerJS Peer and connects to the host's Room ID,
 * sending a JOIN message once the connection is open.
 * @param {string} roomId
 * @param {string} studentId
 * @param {string} avatar
 */
function joinRoom(roomId, studentId, avatar) {
  if (typeof Peer === 'undefined') {
    setControllerStatus('PeerJS unavailable');
    return;
  }

  gameState.studentId = studentId;
  const peer = new Peer();
  gameState.studentPeer = peer;

  peer.on('open', () => {
    const conn = peer.connect(roomId, { reliable: true });
    gameState.hostConnection = conn;

    conn.on('open', () => {
      conn.send({ type: MSG_TYPES.JOIN, payload: { studentId, avatar } });
    });

    conn.on('data', (data) => handleClientMessage(data));

    conn.on('error', (err) => {
      console.error('PeerJS connection error:', err);
      setControllerStatus(`Student: ${studentId} (connection failed)`);
    });
  });

  peer.on('error', (err) => {
    console.error('PeerJS student error:', err);
    setControllerStatus(`Student: ${studentId} (connection failed)`);
  });
}

/**
 * Handles an incoming message from the host on the student's connection.
 * @param {{type: string, payload: object}} message
 */
function handleClientMessage(message) {
  if (!message || typeof message.type !== 'string') return;

  switch (message.type) {
    case MSG_TYPES.JOIN_ACK: {
      setControllerStatus(`Student: ${gameState.studentId} (connected)`);
      break;
    }
    case MSG_TYPES.START_QUESTION: {
      gameState.controllerQuestionStartedAt = Date.now();
      gameState.controllerCurrentQuestionId = message.payload && message.payload.questionId;
      gameState.controllerHasSubmitted = false;
      setControllerQuestionText((message.payload && message.payload.text) || 'Choose your answer!');
      setControllerOptionsEnabled(true);
      break;
    }
    case MSG_TYPES.ROUND_END: {
      setControllerOptionsEnabled(false);
      setControllerQuestionText('Round ended! Check the board for results.');
      break;
    }
    default:
      break;
  }
}

function setControllerQuestionText(text) {
  const el = document.getElementById('controller-question-text');
  if (el) el.textContent = text;
}

function setControllerOptionsEnabled(enabled) {
  document.querySelectorAll('.controller-option').forEach((btn) => {
    btn.disabled = !enabled;
  });
}

/**
 * Wires each controller quadrant button to send a SUBMIT message with the
 * chosen quadrant and the elapsed time since START_QUESTION was received.
 */
function initControllerOptions() {
  document.querySelectorAll('.controller-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (gameState.controllerHasSubmitted) return;
      if (!gameState.hostConnection || !gameState.hostConnection.open) return;

      const choice = btn.dataset.choice;
      const timeElapsedMs = Date.now() - (gameState.controllerQuestionStartedAt || Date.now());

      gameState.hostConnection.send({
        type: MSG_TYPES.SUBMIT,
        payload: {
          questionId: gameState.controllerCurrentQuestionId,
          studentId: gameState.studentId,
          choice,
          timeElapsedMs,
        },
      });

      gameState.controllerHasSubmitted = true;
      setControllerOptionsEnabled(false);
      setControllerQuestionText(`Answer "${choice}" submitted! Waiting for round results…`);
    });
  });
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

function init() {
  initRouter();
  initViewToggles();
  initDashboardControls();
  initControllerOptions();
}

document.addEventListener('DOMContentLoaded', init);
