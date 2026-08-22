'use strict';

/**
 * Interactive Avatar Board — app.js
 * Phase 1 (Foundation): view router + view toggles.
 * Phase 2 (Offline Simulation Engine): local state machine, teacher dashboard
 * controls, mock client generator, and random submission simulator.
 * Phase 3 (P2P Connection & Dynamic Animation): host/client wiring, Room ID
 * generation, JOIN/SUBMIT/START_QUESTION/ROUND_END network protocol,
 * avatar-token movement between the starting line and quadrant lanes, and
 * the speed ranking (leaderboard) engine. Originally built on PeerJS
 * (WebRTC); Phase 4 swapped the transport to a WebSocket relay server
 * (`server/`) — see the "WebSocket Relay Network Protocol" section below.
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
  const avatarSelect = document.getElementById('input-avatar');
  const avatarPreview = document.getElementById('avatar-preview');

  // Live-updates the pixel-art preview image as the student browses presets.
  if (avatarSelect && avatarPreview) {
    avatarSelect.addEventListener('change', () => {
      const path = AVATAR_IMAGE_PATHS[avatarSelect.value];
      if (path) avatarPreview.src = path;
    });
  }

  // Host form: opens the relay socket (Room ID + HELLO handshake) and
  // navigates to the Board view once the relay confirms with HELLO_ACK.
  if (formHost) {
    formHost.addEventListener('submit', (event) => {
      event.preventDefault();
      setHostStatus('Connecting...');
      initHostSocket();
    });
  }

  // Student form: joins the host's room via the relay (HELLO + JOIN
  // handshake) and navigates to the Controller view.
  if (formStudent) {
    formStudent.addEventListener('submit', (event) => {
      event.preventDefault();

      const roomInput = document.getElementById('input-join-room');
      const studentIdInput = document.getElementById('input-student-id');
      const avatarInput = document.getElementById('input-avatar');
      const avatarUploadInput = document.getElementById('input-avatar-upload');

      const roomId = roomInput ? roomInput.value.trim() : '';
      const studentId = studentIdInput ? studentIdInput.value.trim() : '';
      const avatar = avatarInput ? avatarInput.value : MOCK_AVATARS[0];
      const uploadedFile = avatarUploadInput && avatarUploadInput.files ? avatarUploadInput.files[0] : null;

      if (!roomId || !studentId) return;

      if (uploadedFile) {
        const validationError = validateAvatarUploadFile(uploadedFile);
        if (validationError) {
          setAvatarUploadStatus(validationError);
          return;
        }
        setAvatarUploadStatus('');
        resizeAvatarImageToDataUrl(uploadedFile)
          .then((resizedDataUrl) => {
            // Sanity check: the resize step should always produce a small
            // payload, but if it somehow doesn't, fall back to the preset
            // avatar rather than blocking the join.
            let avatarImage = resizedDataUrl;
            if (estimateDataUrlBytes(resizedDataUrl) > AVATAR_RESULT_MAX_BYTES) {
              avatarImage = undefined;
              setAvatarUploadStatus('No se pudo achicar la foto lo suficiente, se usa el avatar por defecto.');
            }
            setControllerStatus(`Student: ${studentId} (connecting...)`);
            navigateTo('controller');
            joinRoom(roomId, studentId, avatar, avatarImage);
          })
          .catch(() => {
            setAvatarUploadStatus('No se pudo leer la foto. Probá de nuevo.');
          });
        return;
      }

      setControllerStatus(`Student: ${studentId} (connecting...)`);
      navigateTo('controller');
      joinRoom(roomId, studentId, avatar);
    });
  }

  if (btnBackToSetupBoard) {
    btnBackToSetupBoard.addEventListener('click', () => {
      destroyHostSocket();
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
  SESSION_END: 'SESSION_END',
  // Husky Bonus Round (see openspec/changes/husky-bonus-round) — two flat
  // states rather than one state + a sub-flag, per design.md Decision #6, so
  // the existing `renderDashboard()`/panel-renderer idiom of gating purely
  // on `gameState.current === X` keeps working unchanged.
  BONUS_ROUND: 'BONUS_ROUND',
  BONUS_RESULTS: 'BONUS_RESULTS',
};

const QUADRANTS = ['A', 'B', 'C', 'D'];
const MOCK_AVATARS = ['hero-knight', 'shadow-ninja', 'cyber-mage', 'star-ranger'];
// Preset pixel-art avatar images (original tech-hero designs, see avatars/
// folder) — one per MOCK_AVATARS id. Used for both the offline simulator's
// mock students and real students who didn't upload their own JPG photo.
const AVATAR_IMAGE_PATHS = {
  'hero-knight': 'avatars/hero-knight.jpg',
  'shadow-ninja': 'avatars/shadow-ninja.jpg',
  'cyber-mage': 'avatars/cyber-mage.jpg',
  'star-ranger': 'avatars/star-ranger.jpg',
};
const MOCK_NAME_POOL = [
  'Aiko', 'Bram', 'Cass', 'Dex', 'Enzo', 'Fina', 'Goro', 'Hana',
  'Ivo', 'Juno', 'Kade', 'Lira', 'Milo', 'Nyx', 'Ori', 'Piko',
];
const SIMULATOR_STUDENT_COUNT = 6;
const SIMULATOR_MIN_DELAY_MS = 500;
const SIMULATOR_MAX_DELAY_MS = 4000;

/**
 * Local (offline) game state. `students`/`submissions` mock what also
 * arrives over the WebSocket relay; the shape mirrors the JOIN/SUBMIT
 * payloads documented in the network protocol above so the simulator and
 * real network events share the same downstream rendering/scoring code.
 */
const gameState = {
  current: GAME_STATES.LOBBY,
  simulatorEnabled: false,
  students: [], // { id, name, avatar, avatarImage, isMock }
  questionStartedAt: null,
  questionId: 0,
  // Shuffle-bag ordering over QUESTIONS_PUBLIC: questionOrder holds a
  // shuffled permutation of bank indices, questionPointer advances through
  // it. Every question is shown exactly once before any repeats, and the
  // bag reshuffles (with a fresh random order) once exhausted — see
  // drawNextQuestion(). Avoids the same fixed 1,2,3...N,1,2,3 repeat cycle
  // a plain index would produce, which becomes predictable/repetitive fast
  // in a real class with more rounds than questions in the bank.
  questionOrder: [],
  questionPointer: 0,
  correctAnswer: null, // host-designated correct quadrant for the active question
  submissions: [], // { studentId, choice, timestamp }
  lastLeaderboard: [], // [{ studentId, speedMs }], ranked ascending, correct answers only
  pendingTimers: [],
  // Cumulative session score per student (studentId -> number). Awarded
  // round-by-round in nextQuestion() — see the scoring rule documented
  // there — and reset alongside the rest of the session in resetGame().
  totalScores: {},
  finalRanking: [], // [{ studentId, score }], set by endSession(), descending by score

  // --- WebSocket relay (Phase 4) ---
  hostSocket: null, // host: this device's WebSocket connection to the relay
  roomId: null, // host: the Room ID registered with the relay
  // Correct-answer key ({ [questionId]: 'A'|'B'|'C'|'D' }), fetched lazily
  // from answers.json ONLY on the host code path (see initHostSocket()), so
  // students never load it just by opening the app. null until fetched.
  answerKey: null,
  relaySocket: null, // student: this device's WebSocket connection to the relay
  studentId: null, // student: this device's Student ID
  controllerQuestionStartedAt: null, // student: local clock ref for elapsed time
  controllerCurrentQuestionId: null, // student: questionId of the active question
  controllerHasSubmitted: false, // student: guards against double submission

  // --- Per-question countdown (timer bar + tick/alarm audio) ---
  hostCountdownStop: null, // host: stop() returned by startCountdown() for the board's timer
  controllerCountdownStop: null, // student: stop() returned by startCountdown() for the controller's timer

  // --- Husky Bonus Round (Phase 3 — see openspec/changes/husky-bonus-round)
  // Deliberately separate from finalRanking/totalScores/questionOrder above
  // — "Independence from Quiz Scoring" (specs/bonus-round/spec.md) requires
  // the bonus round to never read from or write back into quiz scoring
  // state. Every field below is bonus-round-only. ---
  bonusFinalists: [], // host: finalist studentIds, derived by deriveBonusFinalists()
  bonusScores: {}, // host: studentId -> { score, alive, stalled }
  bonusLastSeen: {}, // host: studentId -> Date.now() of the last BONUS_SCORE received (stall detection)
  bonusStartedAt: null, // host: Date.now() when BONUS_START was broadcast (180s hard-cap reference)
  bonusStandings: [], // host: [{ studentId, score }] sorted desc, set by endBonusRound()
  bonusChampions: [], // host: studentId(s) with the highest final score (co-champions on a tie)
  bonusTimers: { stallCheckId: null, maxCapTimeoutId: null }, // host: interval/timeout handles, cleared on finalize/reset
  bonusRole: null, // client: 'player' | 'spectator' | null, set on BONUS_START receipt
  bonusResult: null, // client: { standings, champions } stored on BONUS_END for later rendering (PR 4/5)
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
 * @param {number} [timestamp] - defaults to Date.now() (simulator); real
 *   relay submissions pass a host-clock-relative timestamp derived from the
 *   student's reported elapsed time to avoid cross-device clock skew.
 */
function recordSubmission(studentId, choice, timestamp = Date.now()) {
  if (gameState.current !== GAME_STATES.ACTIVE_QUESTION) return;
  if (gameState.submissions.some((sub) => sub.studentId === studentId)) return;
  gameState.submissions.push({ studentId, choice, timestamp });
  renderRoster();
}

// ---------------------------------------------------------------------------
// Countdown Audio (Web Audio API) — synthesized tick-tock + alarm, no
// external audio files (keeps the app dependency-free and avoids any
// licensing concerns). The AudioContext is created lazily, on first actual
// playback, rather than at module load — browsers block AudioContext
// creation without a prior user gesture, and the first playback always
// happens after the user has already clicked "Start Hosting" or "Join
// Board", so there's no autoplay-policy issue in practice.
// ---------------------------------------------------------------------------

let sharedAudioContext = null;

/**
 * Lazily creates (or resumes, if suspended) the single shared AudioContext
 * used for all tick/alarm playback.
 * @returns {AudioContext|null} null if the Web Audio API is unavailable
 */
function getAudioContext() {
  if (!sharedAudioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    sharedAudioContext = new AudioContextClass();
  }
  if (sharedAudioContext.state === 'suspended') {
    sharedAudioContext.resume().catch(() => {});
  }
  return sharedAudioContext;
}

/**
 * Plays a short, click-free beep: a plain oscillator with an exponential
 * gain ramp-down (avoids the audible "pop" a hard stop would cause).
 * @param {number} freq - frequency in Hz
 * @param {number} durationSec
 * @param {number} [volume] - peak gain, 0-1
 */
function playTick(freq, durationSec, volume = 0.15) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'square';
  oscillator.frequency.value = freq;

  const now = ctx.currentTime;
  gain.gain.setValueAtTime(volume, now);
  // exponentialRampToValueAtTime can't ramp to exactly 0, hence 0.0001.
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

  oscillator.connect(gain);
  gain.connect(ctx.destination);

  oscillator.start(now);
  oscillator.stop(now + durationSec);
}

/**
 * Two-tone "buzzer" alarm (two quick low-pitched tones in sequence), played
 * once when a countdown hits 0.
 */
function playAlarm() {
  playTick(220, 0.22, 0.2);
  window.setTimeout(() => playTick(160, 0.25, 0.2), 200);
}

// ---------------------------------------------------------------------------
// Countdown Controller — per-question timer with a depleting progress bar
// and tick/alarm audio. Shared by the host board and the student controller:
// each device runs its own local countdown, deriving the deadline from the
// `startedAt` timestamp already broadcast in START_QUESTION, so there's no
// need for a separate networked "tick" message.
// ---------------------------------------------------------------------------

// How often the label/audio-trigger interval re-checks the remaining time.
// The bar's own animation is a single CSS transition set once per round (see
// startCountdown below), NOT driven by this interval — this is only for the
// numeric seconds label and for triggering tick sounds at the right moments.
const COUNTDOWN_TICK_INTERVAL_MS = 200;
// Last stretch of the countdown: ticks speed up (500ms boundaries instead of
// 1s) and rise in pitch for tension.
const COUNTDOWN_URGENT_THRESHOLD_MS = 5000;

/**
 * Starts a local countdown against `startedAt + durationMs`.
 * @param {object} opts
 * @param {HTMLElement} [opts.barFill] - the depleting fill element
 * @param {HTMLElement} [opts.countLabel] - element showing seconds remaining
 * @param {HTMLElement} [opts.container] - the timer bar wrapper (toggled via `hidden`)
 * @param {number} opts.startedAt - epoch ms the round started (this device's clock ref)
 * @param {number} opts.durationMs - total countdown duration
 * @param {() => void} opts.onExpire - called once, when the countdown reaches 0
 * @returns {() => void} stop() — cancels the countdown WITHOUT calling onExpire
 *   or playing the alarm; used for manual round-end / reset, so a still-running
 *   countdown never double-fires.
 */
function startCountdown({ barFill, countLabel, container, startedAt, durationMs, onExpire }) {
  const deadline = startedAt + durationMs;
  let expired = false;
  // Seconds bucket already ticked (1s boundaries normally, 500ms boundaries
  // in the last COUNTDOWN_URGENT_THRESHOLD_MS) — compared each interval tick
  // to avoid firing the same tick sound twice.
  let lastTickBucket = null;

  if (container) container.hidden = false;

  if (barFill) {
    barFill.classList.remove('timer-bar__fill--urgent');
    // Instantly full, no transition...
    barFill.style.transition = 'none';
    barFill.style.width = '100%';
    // ...force a reflow so the browser registers that instant state...
    void barFill.offsetWidth;
    // ...then animate to empty over exactly however much time is actually
    // left (accounts for any delay — e.g. network latency — between
    // `startedAt` and this function actually running on the student side).
    const remainingAtStart = Math.max(0, deadline - Date.now());
    barFill.style.transition = `width ${remainingAtStart}ms linear`;
    barFill.style.width = '0%';
  }

  function stopInternal(hide) {
    window.clearInterval(intervalId);
    if (barFill) {
      barFill.style.transition = 'none';
      barFill.classList.remove('timer-bar__fill--urgent');
      if (hide) barFill.style.width = '0%';
    }
    if (container && hide) container.hidden = true;
  }

  const intervalId = window.setInterval(() => {
    if (expired) return;

    const remaining = Math.max(0, deadline - Date.now());
    const secondsRemaining = Math.ceil(remaining / 1000);
    if (countLabel) countLabel.textContent = String(secondsRemaining);

    const urgent = remaining > 0 && remaining <= COUNTDOWN_URGENT_THRESHOLD_MS;
    if (barFill) barFill.classList.toggle('timer-bar__fill--urgent', urgent);

    const tickBucket = urgent ? Math.ceil(remaining / 500) : Math.ceil(remaining / 1000);
    if (remaining > 0 && tickBucket !== lastTickBucket) {
      lastTickBucket = tickBucket;
      // Calmer/lower tick most of the countdown, faster/higher-pitched tick
      // for the last few seconds' tension ramp.
      if (urgent) {
        playTick(880, 0.08, 0.12);
      } else {
        playTick(523, 0.09, 0.1);
      }
    }

    if (remaining <= 0) {
      expired = true;
      stopInternal(true);
      playAlarm();
      onExpire();
    }
  }, COUNTDOWN_TICK_INTERVAL_MS);

  return function stop() {
    if (expired) return;
    stopInternal(true);
  };
}

// ---------------------------------------------------------------------------
// Teacher dashboard controls (start game / next question / reset / simulator)
// ---------------------------------------------------------------------------

/**
 * Fisher-Yates shuffle, returns a new array (does not mutate the input).
 * @param {Array} array
 */
function shuffleArray(array) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Draws the next question from QUESTIONS_PUBLIC using a shuffle bag: a
 * freshly shuffled permutation of bank indices is consumed one at a time,
 * guaranteeing every question appears exactly once before any repeats. Once
 * the bag is exhausted (or the bank size changed, e.g. after editing
 * questions-public.js), it's reshuffled with a new random order.
 * @returns {object|null} the next question object, or null if the bank is empty/missing
 */
function drawNextQuestion() {
  const bank = typeof QUESTIONS_PUBLIC !== 'undefined' && QUESTIONS_PUBLIC.length > 0 ? QUESTIONS_PUBLIC : null;
  if (!bank) return null;

  if (gameState.questionOrder.length !== bank.length || gameState.questionPointer >= gameState.questionOrder.length) {
    gameState.questionOrder = shuffleArray(bank.map((_, i) => i));
    gameState.questionPointer = 0;
  }

  const bankIndex = gameState.questionOrder[gameState.questionPointer];
  gameState.questionPointer += 1;
  return bank[bankIndex];
}

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

  // Pull the next question from the pre-configured public bank
  // (questions-public.js) via the shuffle bag (drawNextQuestion), and
  // pre-fill the host's "Correct Answer" select by looking up the answer key
  // (answers.json, fetched lazily in initHostSocket()) — still overridable
  // manually afterwards.
  const question = drawNextQuestion();

  if (question) {
    const correctAnswer = gameState.answerKey ? gameState.answerKey[question.id] : undefined;
    if (!gameState.answerKey) {
      console.warn('Answer key not loaded yet — Correct Answer will not auto-populate this round.');
    }
    gameState.correctAnswer = correctAnswer || null;
    const selectCorrectAnswer = document.getElementById('input-correct-answer');
    if (selectCorrectAnswer) {
      selectCorrectAnswer.value = correctAnswer || '';
    }
  }

  if (gameState.simulatorEnabled) {
    scheduleSimulatedSubmissions();
  }

  broadcastToStudents({
    type: MSG_TYPES.START_QUESTION,
    payload: {
      questionId: gameState.questionId,
      text: question ? question.text : 'New question! Choose your answer.',
      options: question ? question.options : QUADRANTS,
      startedAt: gameState.questionStartedAt,
      durationMs: QUESTION_DURATION_MS,
    },
  });

  renderRoster();

  gameState.hostCountdownStop?.();
  gameState.hostCountdownStop = startCountdown({
    barFill: document.getElementById('board-timer-fill'),
    countLabel: document.getElementById('board-timer-count'),
    container: document.getElementById('board-timer'),
    startedAt: gameState.questionStartedAt,
    durationMs: QUESTION_DURATION_MS,
    onExpire: () => {
      // If the host already ended the round manually (or reset/ended the
      // session) before the clock ran out, gameState.current has already
      // moved on — don't double-fire nextQuestion()'s round-end logic.
      if (gameState.current === GAME_STATES.ACTIVE_QUESTION) nextQuestion();
    },
  });
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
    // Cancel the pending auto-end countdown BEFORE doing the round-end work,
    // so a manual "End Question" click never leaves a stray timer running
    // that could later fire its own onExpire (already guarded by the
    // gameState.current check there too, but stopping cleanly here also
    // avoids a stray alarm sound / interval).
    gameState.hostCountdownStop?.();
    clearPendingSimulatorTimers();
    const leaderboard = computeLeaderboard();
    gameState.lastLeaderboard = leaderboard;
    markRoundResults(leaderboard);
    awardRoundPoints(leaderboard);
    setGameState(GAME_STATES.LEADERBOARD);
    broadcastToStudents({ type: MSG_TYPES.ROUND_END, payload: { leaderboard, totalScores: gameState.totalScores } });
    return;
  }

  if (gameState.current === GAME_STATES.LEADERBOARD) {
    startNewQuestionRound();
  }
}

function resetGame() {
  gameState.hostCountdownStop?.();
  clearPendingSimulatorTimers();
  // Note: the host no longer holds individual student sockets (the relay
  // server owns those and fans out broadcasts) — Reset Game only clears
  // local roster/score state, it can't force-disconnect students.
  gameState.students = [];
  gameState.submissions = [];
  gameState.lastLeaderboard = [];
  gameState.questionStartedAt = null;
  gameState.questionId = 0;
  gameState.questionOrder = [];
  gameState.questionPointer = 0;
  gameState.correctAnswer = null;
  // Full session reset wipes cumulative scores too, same as the question
  // cycling state above — Reset always means "start a completely new
  // session", even when triggered from SESSION_END.
  gameState.totalScores = {};
  gameState.finalRanking = [];
  // Bonus-round state is ephemeral per session too (design.md §9 Migration /
  // Rollout) — stop any pending host-side timers before wiping the fields so
  // a stray stall check or 180s cap from a previous session can't fire into
  // a freshly-reset LOBBY.
  stopBonusStallCheck();
  stopBonusMaxCapTimer();
  gameState.bonusFinalists = [];
  gameState.bonusScores = {};
  gameState.bonusLastSeen = {};
  gameState.bonusStartedAt = null;
  gameState.bonusStandings = [];
  gameState.bonusChampions = [];
  gameState.bonusRole = null;
  gameState.bonusResult = null;
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
  const btnEndSession = document.getElementById('btn-end-session');
  const btnStartBonus = document.getElementById('btn-start-bonus');
  const btnEndBonus = document.getElementById('btn-end-bonus');
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
    // Session is over: only Reset should be usable to start a fresh one.
    btnNext.disabled = gameState.current === GAME_STATES.LOBBY || gameState.current === GAME_STATES.SESSION_END;
    btnNext.textContent = gameState.current === GAME_STATES.LEADERBOARD ? 'Next Question' : 'End Question';
  }

  if (btnSimulator) {
    btnSimulator.textContent = `Simulator: ${gameState.simulatorEnabled ? 'On' : 'Off'}`;
  }

  if (btnEndSession) {
    // Usable any time except LOBBY (nothing to end yet) and SESSION_END
    // (already ended).
    btnEndSession.disabled = gameState.current === GAME_STATES.LOBBY || gameState.current === GAME_STATES.SESSION_END;
  }

  if (btnStartBonus) {
    btnStartBonus.disabled = gameState.current !== GAME_STATES.SESSION_END;
  }

  if (btnEndBonus) {
    // Manual "Finalizar ronda bonus" escape hatch (specs/bonus-round/spec.md
    // — Round Finalization) — only meaningful while the round is in flight.
    btnEndBonus.disabled = gameState.current !== GAME_STATES.BONUS_ROUND;
  }

  renderLeaderboardPanel();
  renderFinalRankingPanel();
  renderBonusLeaderboard();
  renderBonusChampionReveal();
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
 * Renders (or hides, outside SESSION_END) the final cumulative ranking for
 * the whole session, computed by endSession(). Mirrors the round
 * leaderboard's markup/styling patterns (an <ol> reusing `.leaderboard__list`
 * so the winner-highlight CSS applies), with a trophy prefix on the #1 entry.
 */
function renderFinalRankingPanel() {
  const panel = document.getElementById('board-final-ranking');
  if (!panel) return;

  if (gameState.current !== GAME_STATES.SESSION_END) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }

  panel.hidden = false;
  panel.innerHTML = '';

  const heading = document.createElement('h2');
  heading.className = 'panel__title';
  heading.textContent = 'Final Ranking';
  panel.appendChild(heading);

  if (gameState.finalRanking.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'leaderboard__empty';
    empty.textContent = 'No scores recorded this session.';
    panel.appendChild(empty);
    return;
  }

  const list = document.createElement('ol');
  list.className = 'leaderboard__list';
  gameState.finalRanking.forEach((entry, index) => {
    const item = document.createElement('li');
    const prefix = index === 0 ? '\u{1F3C6} ' : '';
    item.textContent = `${prefix}${entry.studentId} — ${entry.score} pts`;
    list.appendChild(item);
  });
  panel.appendChild(list);
}

/**
 * Renders (or hides, outside BONUS_ROUND) the live Husky Bonus Round
 * leaderboard: each finalist's current score, sorted descending, with
 * stalled finalists visibly dimmed and labeled but still counted (their
 * score is frozen, not removed). Re-renders on every `BONUS_SCORE` (see
 * `handleHostMessage()`) and every stall-check tick (see
 * `startBonusStallCheck()`), both of which call `renderDashboard()`.
 *
 * Shares its DOM panel (`#board-bonus-leaderboard`) with
 * `renderBonusChampionReveal()` below. `BONUS_ROUND` and `BONUS_RESULTS`
 * are mutually exclusive states, so ownership is split cleanly: this
 * function renders when `current === BONUS_ROUND`, no-ops (leaves the
 * panel alone) when `current === BONUS_RESULTS` so it doesn't clobber the
 * champion reveal, and hides/clears the panel for every other state. Call
 * order between the two functions in `renderDashboard()` doesn't matter as
 * a result — each only ever touches the panel for its own state.
 * @satisfies specs/bonus-round/spec.md — Live Host Leaderboard, Stalled Finalist Handling
 */
function renderBonusLeaderboard() {
  const panel = document.getElementById('board-bonus-leaderboard');
  if (!panel) return;

  if (gameState.current === GAME_STATES.BONUS_RESULTS) return; // owned by renderBonusChampionReveal()

  if (gameState.current !== GAME_STATES.BONUS_ROUND) {
    panel.hidden = true;
    panel.removeAttribute('data-phase');
    panel.innerHTML = '';
    return;
  }

  panel.hidden = false;
  panel.dataset.phase = 'live';
  panel.innerHTML = '';

  const heading = document.createElement('h2');
  heading.className = 'panel__title';
  heading.textContent = 'Bonus Round — Live';
  panel.appendChild(heading);

  if (gameState.bonusFinalists.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'leaderboard__empty';
    empty.textContent = 'No finalists.';
    panel.appendChild(empty);
    return;
  }

  const standings = gameState.bonusFinalists
    .map((studentId) => ({
      studentId,
      ...(gameState.bonusScores[studentId] || { score: 0, alive: true, stalled: false }),
    }))
    .sort((a, b) => b.score - a.score);

  const list = document.createElement('ol');
  list.className = 'leaderboard__list';
  standings.forEach((entry) => {
    const item = document.createElement('li');
    item.className = 'bonus-leaderboard__item';
    item.dataset.stalled = String(!!entry.stalled);
    item.textContent = entry.stalled
      ? `${entry.studentId} — ${entry.score} pts (stalled)`
      : `${entry.studentId} — ${entry.score} pts`;
    list.appendChild(item);
  });
  panel.appendChild(list);
}

/**
 * Renders (or hides, outside BONUS_RESULTS) the champion-reveal screen once
 * `endBonusRound()` has populated `gameState.bonusStandings`/`bonusChampions`:
 * the champion name(s) — supports co-champions on a tie, per the spec — and
 * the final standings, reusing `.leaderboard__list`/`.panel__title`.
 *
 * Shares `#board-bonus-leaderboard` with `renderBonusLeaderboard()` above;
 * see that function's header comment for the ownership split.
 * @satisfies specs/bonus-round/spec.md — Champion Reveal
 */
function renderBonusChampionReveal() {
  const panel = document.getElementById('board-bonus-leaderboard');
  if (!panel) return;

  if (gameState.current !== GAME_STATES.BONUS_RESULTS) return; // owned by renderBonusLeaderboard()

  panel.hidden = false;
  panel.dataset.phase = 'results';
  panel.innerHTML = '';

  const heading = document.createElement('h2');
  heading.className = 'panel__title';
  heading.textContent = gameState.bonusChampions.length > 1 ? '\u{1F3C6} Co-Champions!' : '\u{1F3C6} Champion!';
  panel.appendChild(heading);

  const champLine = document.createElement('p');
  champLine.className = 'bonus-champion__names';
  champLine.textContent =
    gameState.bonusChampions.length > 0 ? gameState.bonusChampions.join('  •  ') : 'No finalist scored.';
  panel.appendChild(champLine);

  if (gameState.bonusStandings.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'leaderboard__empty';
    empty.textContent = 'No standings recorded.';
    panel.appendChild(empty);
    return;
  }

  const list = document.createElement('ol');
  list.className = 'leaderboard__list';
  gameState.bonusStandings.forEach((entry) => {
    const item = document.createElement('li');
    const prefix = gameState.bonusChampions.includes(entry.studentId) ? '\u{1F3C6} ' : '';
    item.textContent = `${prefix}${entry.studentId} — ${entry.score} pts`;
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

      // Precedence: a student's own uploaded JPG photo, then the pixel-art
      // preset image matching their chosen avatar, then (only if neither is
      // available) the plain initials badge as a last-resort fallback.
      const presetImage = AVATAR_IMAGE_PATHS[student.avatar];
      const imageSrc = student.avatarImage || presetImage;
      if (imageSrc) {
        token.classList.add('avatar-token--photo');
        token.style.backgroundImage = `url("${imageSrc}")`;
      } else {
        token.textContent = student.id.slice(0, 2).toUpperCase();
      }

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

  // Independent "submission registered" feedback (box-shadow/outline pulse,
  // not `transform`, so it never fights the FLIP animation above) — plays
  // regardless of how far the token actually traveled, so a submission to
  // a quadrant visually close to the starting line still gives a clear
  // confirmation that the click was registered.
  token.classList.remove('avatar-token--submit-pop');
  // Force reflow so the class can be re-added to replay the animation on a
  // future submission (irrelevant per-round since tokens reset, but keeps
  // the helper correct if ever called twice on the same token).
  void token.offsetWidth;
  token.classList.add('avatar-token--submit-pop');
  token.addEventListener(
    'animationend',
    () => token.classList.remove('avatar-token--submit-pop'),
    { once: true }
  );
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

/**
 * Cumulative scoring rule: awards points for the round that just ended,
 * ranked by speed among CORRECT submissions only (leaderboard is already
 * sorted fastest-first by computeLeaderboard()). With N correct submissions
 * this round, the fastest gets N points, the 2nd fastest gets N-1, ...,
 * down to 1 point for the last correct submission. Incorrect or
 * non-submissions get 0 points that round. Points accumulate into
 * gameState.totalScores across the whole session (reset only by
 * resetGame()).
 * @param {Array<{studentId: string}>} leaderboard - this round's ranked,
 *   correct-only leaderboard (see computeLeaderboard())
 */
function awardRoundPoints(leaderboard) {
  leaderboard.forEach((entry, index) => {
    const points = leaderboard.length - index;
    gameState.totalScores[entry.studentId] = (gameState.totalScores[entry.studentId] || 0) + points;
  });
}

/**
 * Ends the session: stops any pending simulator timers, transitions to
 * SESSION_END, computes the final ranking from the cumulative totalScores,
 * broadcasts it to every connected student, and renders it on the host
 * board. Usable any time except LOBBY (nothing to end yet) — see
 * renderDashboard()'s btnEndSession wiring.
 *
 * Judgment call: students with a total score of 0 (never answered
 * correctly) ARE included in the final ranking, at the bottom — a teacher
 * running this with ~40 students likely wants to see who never scored, not
 * just a shortened winners list.
 */
function endSession() {
  if (gameState.current === GAME_STATES.LOBBY) return;

  // "Finalizar sesión" can be clicked mid-round (ACTIVE_QUESTION) — cancel
  // any pending auto-end countdown so it can't fire nextQuestion() after the
  // session has already moved to SESSION_END.
  gameState.hostCountdownStop?.();
  clearPendingSimulatorTimers();

  // Built from the full roster (not just Object.entries(totalScores)) so
  // students who never scored a correct answer — never getting a key in
  // totalScores at all — still show up at 0 points instead of silently
  // disappearing from the final ranking.
  const finalRanking = gameState.students
    .map((student) => ({ studentId: student.id, score: gameState.totalScores[student.id] || 0 }))
    .sort((a, b) => b.score - a.score);
  gameState.finalRanking = finalRanking;

  setGameState(GAME_STATES.SESSION_END);

  broadcastToStudents({ type: MSG_TYPES.SESSION_END, payload: { finalRanking } });
}

function initDashboardControls() {
  const btnStart = document.getElementById('btn-start-game');
  const btnNext = document.getElementById('btn-next-question');
  const btnReset = document.getElementById('btn-reset-game');
  const btnSimulator = document.getElementById('btn-toggle-simulator');
  const btnEndSession = document.getElementById('btn-end-session');
  const btnStartBonus = document.getElementById('btn-start-bonus');
  const btnEndBonus = document.getElementById('btn-end-bonus');
  const selectCorrectAnswer = document.getElementById('input-correct-answer');

  if (btnStart) btnStart.addEventListener('click', startGame);
  if (btnNext) btnNext.addEventListener('click', nextQuestion);
  if (btnReset) btnReset.addEventListener('click', resetGame);
  if (btnSimulator) btnSimulator.addEventListener('click', toggleSimulator);
  if (btnEndSession) btnEndSession.addEventListener('click', endSession);
  if (btnStartBonus) btnStartBonus.addEventListener('click', startBonusRound);
  if (btnEndBonus) btnEndBonus.addEventListener('click', endBonusRound);
  if (selectCorrectAnswer) {
    selectCorrectAnswer.addEventListener('change', () => {
      gameState.correctAnswer = selectCorrectAnswer.value || null;
    });
  }

  renderDashboard();
  renderRoster();
}

// ---------------------------------------------------------------------------
// WebSocket Relay Network Protocol — Room ID generation, host/client wiring,
// and the JOIN / SUBMIT / START_QUESTION / ROUND_END message protocol.
//
// Message shape: { type: 'JOIN' | 'JOIN_ACK' | 'SUBMIT' | 'START_QUESTION' |
// 'ROUND_END', payload: {} }
//
// SUBMIT carries `timeElapsedMs` (student-clock elapsed time since it
// received START_QUESTION) rather than an absolute timestamp, so the host
// can derive a timestamp on its own clock (questionStartedAt + timeElapsedMs)
// and avoid cross-device clock-skew when computing speed rankings.
//
// Two planes flow over the same socket: a control plane (HELLO / HELLO_ACK /
// ERROR — consumed here, at the socket layer, to establish role + room) and
// the game plane above (the 6 message types, relayed byte-for-byte by the
// server). handleHostMessage()/handleClientMessage() never see a control
// frame — see CONTROL_TYPES below.
// ---------------------------------------------------------------------------

const MSG_TYPES = {
  JOIN: 'JOIN',
  JOIN_ACK: 'JOIN_ACK',
  SUBMIT: 'SUBMIT',
  START_QUESTION: 'START_QUESTION',
  ROUND_END: 'ROUND_END',
  SESSION_END: 'SESSION_END',
  // Husky Bonus Round protocol (design.md §5 Protocol Schema) — same
  // { type, payload } convention, relayed byte-for-byte like every type
  // above. BONUS_START/BONUS_END are host -> all (broadcast); BONUS_SCORE
  // is finalist -> host (unicast via the relay).
  BONUS_START: 'BONUS_START',
  BONUS_SCORE: 'BONUS_SCORE',
  BONUS_END: 'BONUS_END',
};

// Control-plane message types exchanged with the relay server to establish
// role/room identity. Handled entirely inside initHostSocket()/joinRoom() —
// never forwarded to handleHostMessage()/handleClientMessage().
const CONTROL_TYPES = {
  HELLO: 'HELLO',
  HELLO_ACK: 'HELLO_ACK',
  ERROR: 'ERROR',
};

const HOST_ID_RETRY_LIMIT = 5;

// Per-question countdown duration — a single named constant so it's trivial
// to tweak later. When it hits 0, the round ends automatically (same effect
// as the host clicking "End Question" — see startNewQuestionRound()'s
// startCountdown() call and nextQuestion()).
const QUESTION_DURATION_MS = 20000;

/**
 * WebSocket relay server URL. This is a static site with no build step and
 * no env injection, so the URL is a plain constant with a hostname-based dev
 * override — `node server/src/index.js` plus a locally-served index.html
 * keep working unchanged, no config file or extra request needed.
 * Confirmed deployed at https://avatar-board-relay.onrender.com (health
 * check returns 200) as of 2026-08-15.
 */
const RELAY_URL = ['localhost', '127.0.0.1'].includes(location.hostname)
  ? 'ws://localhost:8080'
  : 'wss://avatar-board-relay.onrender.com';

// Cold-start UX: Render's free tier can take up to ~60s to wake an idle
// service. The server self-pings to avoid this in practice, but the host UI
// still needs a fallback so "Connecting..." doesn't look hung — show a
// "waking server" hint after HOST_WAKE_HINT_MS without HELLO_ACK, and give
// up with an error after HOST_WAKE_TIMEOUT_MS.
const HOST_WAKE_HINT_MS = 3000;
const HOST_WAKE_TIMEOUT_MS = 90000;

/**
 * Generates a short, human-shareable Room ID used to register with the
 * relay server.
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

// ---------------------------------------------------------------------------
// Optional JPG avatar upload (student join form)
// ---------------------------------------------------------------------------

// Real phone-camera JPGs are typically 1-8MB, so we no longer gate on the
// original file's byte size (that used to reject almost every real photo).
// Instead we resize/compress client-side via <canvas> to a small fixed
// thumbnail — the RESULT is what has to be small, not the upload.
const AVATAR_UPLOAD_MAX_SOURCE_BYTES = 15 * 1024 * 1024; // ~15MB: only reject truly absurd files, to avoid hanging the browser on decode
const AVATAR_THUMBNAIL_SIZE = 160; // px, square, cover-cropped
const AVATAR_JPEG_QUALITY = 0.7;
const AVATAR_RESULT_MAX_BYTES = 80 * 1024; // ~80KB sanity check on the resized data URL

function setAvatarUploadStatus(text) {
  const el = document.getElementById('avatar-upload-status');
  if (el) el.textContent = text;
}

/**
 * Client-side validation for the optional avatar photo upload: must be a
 * JPEG, and not an absurdly large source file (the resize step below is
 * what guarantees the final payload is small, not this check).
 * @param {File} file
 * @returns {string|null} an error message, or null if the file is valid
 */
function validateAvatarUploadFile(file) {
  if (file.type !== 'image/jpeg') {
    return 'La foto debe ser un archivo JPG.';
  }
  if (file.size > AVATAR_UPLOAD_MAX_SOURCE_BYTES) {
    return 'La foto es demasiado pesada. Probá con otra.';
  }
  return null;
}

/**
 * Estimates the decoded byte size of a base64 data URL (used for the
 * post-resize sanity check).
 * @param {string} dataUrl
 * @returns {number}
 */
function estimateDataUrlBytes(dataUrl) {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.ceil((base64.length * 3) / 4);
}

/**
 * Resizes/compresses an uploaded JPG File into a small, fixed-size,
 * cover-cropped square thumbnail suitable as an avatar, via an off-screen
 * <canvas>. This guarantees a small payload regardless of the original
 * file's dimensions/size (real phone photos are often several MB).
 * @param {File} file
 * @returns {Promise<string>} a small base64 JPEG data URL
 */
function resizeAvatarImageToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      try {
        const size = AVATAR_THUMBNAIL_SIZE;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Cover-crop: scale so the shorter side fills the square, then
        // center-crop the overflow on the longer side.
        const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight);
        const drawWidth = img.naturalWidth * scale;
        const drawHeight = img.naturalHeight * scale;
        const offsetX = (size - drawWidth) / 2;
        const offsetY = (size - drawHeight) / 2;

        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

        const dataUrl = canvas.toDataURL('image/jpeg', AVATAR_JPEG_QUALITY);
        resolve(dataUrl);
      } catch (err) {
        reject(err);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Image failed to load'));
    };

    img.src = objectUrl;
  });
}

/**
 * Opens the host's WebSocket connection to the relay server and sends a
 * HELLO control frame with a freshly generated Room ID. Moves to the Board
 * view once the relay confirms with HELLO_ACK; retries with a new Room ID on
 * an ERROR{code:'ROOM_TAKEN'} reply, up to HOST_ID_RETRY_LIMIT attempts
 * (mirrors the previous PeerJS `unavailable-id` collision retry loop).
 * @param {number} [attempt]
 */
function initHostSocket(attempt = 0) {
  // Lazily fetch the correct-answer key — ONLY on the host code path, ONLY
  // when hosting actually starts, and only once per session (not on every
  // question). Students never trigger this fetch just by opening the app.
  if (!gameState.answerKey) {
    fetch('answers.json')
      .then((response) => response.json())
      .then((data) => {
        gameState.answerKey = data;
      })
      .catch((err) => {
        console.error('Failed to load answers.json:', err);
      });
  }

  const roomId = generateRoomId();
  const socket = new WebSocket(RELAY_URL);

  const wakeHintTimer = setTimeout(() => {
    setHostStatus('Waking server… up to 60s');
  }, HOST_WAKE_HINT_MS);
  const wakeTimeoutTimer = setTimeout(() => {
    setHostStatus('Connection error: relay server unreachable');
    socket.close();
  }, HOST_WAKE_TIMEOUT_MS);
  const clearWakeTimers = () => {
    clearTimeout(wakeHintTimer);
    clearTimeout(wakeTimeoutTimer);
  };

  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({ type: CONTROL_TYPES.HELLO, payload: { role: 'host', roomId } }));
  });

  socket.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (err) {
      return;
    }
    if (!message || typeof message.type !== 'string') return;

    if (message.type === CONTROL_TYPES.HELLO_ACK) {
      clearWakeTimers();
      gameState.hostSocket = socket;
      gameState.roomId = roomId;
      setHostStatus(roomId);
      const badge = document.getElementById('board-room-id');
      if (badge) badge.textContent = `Room: ${roomId}`;
      navigateTo('board');
      return;
    }

    if (message.type === CONTROL_TYPES.ERROR) {
      const code = message.payload && message.payload.code;
      if (code === 'ROOM_TAKEN' && attempt < HOST_ID_RETRY_LIMIT) {
        clearWakeTimers();
        socket.close();
        initHostSocket(attempt + 1);
        return;
      }
      clearWakeTimers();
      console.error('Relay host error:', code);
      setHostStatus(`Connection error: ${code || 'unknown'}`);
      return;
    }

    handleHostMessage(message);
  });

  socket.addEventListener('error', (err) => {
    console.error('Relay host socket error:', err);
  });

  socket.addEventListener('close', () => {
    clearWakeTimers();
  });
}

/**
 * Closes the host's relay socket so leaving the Board without a page reload
 * doesn't leak a stale connection that `initHostSocket()` would otherwise
 * duplicate on the next "Start Hosting".
 */
function destroyHostSocket() {
  if (gameState.hostSocket) {
    gameState.hostSocket.close();
    gameState.hostSocket = null;
  }
  gameState.roomId = null;
}

/**
 * Handles an incoming game-plane message relayed to the host socket. The
 * relay server never forwards control frames (HELLO/HELLO_ACK/ERROR) here —
 * those are consumed by initHostSocket()'s own message listener.
 * @param {{type: string, payload: object}} message
 */
function handleHostMessage(message) {
  if (!message || typeof message.type !== 'string') return;

  switch (message.type) {
    case MSG_TYPES.JOIN: {
      const { studentId, avatar, avatarImage } = message.payload || {};
      if (!studentId) return;
      registerRealStudent(studentId, avatar, avatarImage);
      break;
    }
    case MSG_TYPES.SUBMIT: {
      const { studentId, choice, timeElapsedMs } = message.payload || {};
      if (!studentId || !choice) return;
      const timestamp = (gameState.questionStartedAt || Date.now()) + (timeElapsedMs || 0);
      recordSubmission(studentId, choice, timestamp);
      break;
    }
    case MSG_TYPES.BONUS_SCORE: {
      const { studentId, score, alive } = message.payload || {};
      // Ignore anything from a studentId that isn't a tracked finalist
      // (stray/late message, or a spectator whose client somehow sent one) —
      // `bonusScores` is only ever seeded with finalist IDs in
      // startBonusRound().
      if (!studentId || !gameState.bonusScores[studentId]) return;
      const entry = gameState.bonusScores[studentId];
      entry.score = typeof score === 'number' ? score : entry.score;
      entry.alive = alive !== false;
      // Hearing from a finalist again un-stalls them — the 5s timeout is the
      // only disconnect signal available (design.md "Finalist disconnect
      // mid-run"), so a late-arriving message after a brief stall just means
      // they're back.
      entry.stalled = false;
      gameState.bonusLastSeen[studentId] = Date.now();
      renderDashboard(); // re-renders renderBonusLeaderboard() with the updated score
      checkBonusRoundFinalization();
      break;
    }
    default:
      break;
  }
}

/**
 * Registers a real (network-connected) student on the board, reusing the
 * same students/roster/avatar-token pipeline as the offline simulator, then
 * acknowledges the JOIN back through the relay (the relay server fans out
 * every host-sent message to all students currently in the room).
 * @param {string} studentId
 * @param {string} [avatar]
 * @param {string} [avatarImage] - optional base64 data URL uploaded by the
 *   student; when present, rendering prefers it over the preset `avatar`.
 */
function registerRealStudent(studentId, avatar, avatarImage) {
  const alreadyRegistered = gameState.students.some((student) => student.id === studentId);
  if (!alreadyRegistered) {
    gameState.students.push({
      id: studentId,
      name: studentId,
      avatar: avatar || MOCK_AVATARS[0],
      avatarImage: avatarImage || null,
      isMock: false,
    });
  }

  broadcastToStudents({ type: MSG_TYPES.JOIN_ACK, payload: { studentId, status: 'ok' } });

  renderRoster();
}

/**
 * Sends a message to the relay server over the host's single WebSocket; the
 * relay server fans it out to every student socket currently in the room.
 * @param {{type: string, payload: object}} message
 */
function broadcastToStudents(message) {
  if (!gameState.hostSocket || gameState.hostSocket.readyState !== WebSocket.OPEN) return;
  gameState.hostSocket.send(JSON.stringify(message));
}

/**
 * Opens the student's WebSocket connection to the relay server, sends a
 * HELLO control frame for the given Room ID, and — once the relay confirms
 * with HELLO_ACK — sends the existing JOIN message. On an ERROR reply (e.g.
 * ROOM_NOT_FOUND), surfaces the same "connection failed" status the app has
 * always shown for an invalid Room ID.
 * @param {string} roomId
 * @param {string} studentId
 * @param {string} avatar
 * @param {string} [avatarImage] - optional base64 data URL of an uploaded
 *   JPG photo; takes precedence over `avatar` on the rendering side when
 *   present.
 */
function joinRoom(roomId, studentId, avatar, avatarImage) {
  gameState.studentId = studentId;
  const socket = new WebSocket(RELAY_URL);
  gameState.relaySocket = socket;

  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({ type: CONTROL_TYPES.HELLO, payload: { role: 'student', roomId } }));
  });

  socket.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (err) {
      return;
    }
    if (!message || typeof message.type !== 'string') return;

    if (message.type === CONTROL_TYPES.HELLO_ACK) {
      socket.send(JSON.stringify({ type: MSG_TYPES.JOIN, payload: { studentId, avatar, avatarImage } }));
      return;
    }

    if (message.type === CONTROL_TYPES.ERROR) {
      console.error('Relay student error:', message.payload && message.payload.code);
      setControllerStatus(`Student: ${studentId} (connection failed)`);
      return;
    }

    handleClientMessage(message);
  });

  socket.addEventListener('error', (err) => {
    console.error('Relay student socket error:', err);
    setControllerStatus(`Student: ${studentId} (connection failed)`);
  });

  // The relay closes every student socket in a room with this code (see
  // server/src/rooms.js's HOST_DISCONNECT_CODE) when its host disconnects —
  // without this, a student's screen is left showing a stale question with
  // no indication the session is dead. A generic close (network drop,
  // student navigating away) is already covered by the 'error' listener
  // above and shouldn't be relabeled as a host disconnect.
  const HOST_DISCONNECT_CODE = 4001;
  socket.addEventListener('close', (event) => {
    if (event.code !== HOST_DISCONNECT_CODE) return;
    setControllerStatus(`Student: ${studentId} (host disconnected)`);
    setControllerQuestionText('Host disconnected. Ask your teacher to restart the session.');
    setControllerOptionsEnabled(false);
    gameState.controllerCountdownStop?.();
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
      setControllerOptionLabels(message.payload && message.payload.options);
      setControllerOptionsEnabled(true);

      gameState.controllerCountdownStop?.();
      gameState.controllerCountdownStop = startCountdown({
        barFill: document.getElementById('controller-timer-fill'),
        countLabel: document.getElementById('controller-timer-count'),
        container: document.getElementById('controller-timer'),
        startedAt: gameState.controllerQuestionStartedAt,
        durationMs: (message.payload && message.payload.durationMs) || QUESTION_DURATION_MS,
        // The student doesn't drive round-end — the host does, via
        // ROUND_END — so this is purely visual/audio flavor. If the host
        // ends the round early, ROUND_END's handler below stops this
        // countdown before it would ever expire on its own.
        onExpire: () => {},
      });
      break;
    }
    case MSG_TYPES.ROUND_END: {
      setControllerOptionsEnabled(false);
      setControllerQuestionText('Round ended! Check the board for results.');
      gameState.controllerCountdownStop?.();
      break;
    }
    case MSG_TYPES.SESSION_END: {
      setControllerOptionsEnabled(false);
      const finalRanking = (message.payload && message.payload.finalRanking) || [];
      setControllerQuestionText(buildFinalResultsText(finalRanking));
      gameState.controllerCountdownStop?.();
      break;
    }
    case MSG_TYPES.BONUS_START: {
      const finalists = (message.payload && message.payload.finalists) || [];
      const isFinalist = finalists.includes(gameState.studentId);
      gameState.bonusRole = isFinalist ? 'player' : 'spectator';
      gameState.controllerCountdownStop?.();

      if (!isFinalist) {
        // Spectator Screen (specs/bonus-round/spec.md) — the actual
        // dedicated spectator markup is PR 5; this reuses the existing
        // question-text slot exactly like buildFinalResultsText() above, so
        // there's no stale/blank screen in the meantime.
        setControllerQuestionText('Ronda bonus en curso — los finalistas están jugando. Mirá el pizarrón.');
        break;
      }

      setControllerQuestionText('Ronda bonus: ¡sos finalista! Tocá la pantalla para saltar.');

      // Swap the quiz answer grid for the game canvas — index.html/style.css
      // wiring, tasks.md 5.2/5.4. Both elements are optional-chained so this
      // still no-ops gracefully if index.html hasn't landed them.
      document.getElementById('controller-grid')?.setAttribute('hidden', '');
      document.getElementById('controller-bonus')?.removeAttribute('hidden');

      if (!window.BonusRound || typeof window.BonusRound.start !== 'function') {
        // Defensive guard: bonus-round.js failed to load or hasn't executed
        // yet. Shouldn't happen once index.html wires the <script> tag
        // (tasks.md 5.1), but this keeps handleClientMessage() from throwing.
        break;
      }

      window.BonusRound.start({
        canvas: document.getElementById('bonus-canvas'),
        onScore: (score) => sendBonusScore(score, true),
        onEnd: (score) => sendBonusScore(score, false),
      });
      break;
    }
    case MSG_TYPES.BONUS_END: {
      const standings = (message.payload && message.payload.standings) || [];
      const champions = (message.payload && message.payload.champions) || [];
      gameState.bonusResult = { standings, champions };
      if (gameState.bonusRole === 'player' && window.BonusRound && typeof window.BonusRound.stop === 'function') {
        window.BonusRound.stop();
      }
      // Champion line for everyone (players and spectators alike) — Spectator
      // Screen spec, tasks.md 5.3. The canvas (if any) is left visible under
      // this text so a finalist still sees their own death frame/score.
      setControllerQuestionText(buildBonusResultsText(standings, champions));
      break;
    }
    default:
      break;
  }
}

/**
 * Sends this device's current bonus-round score to the host over the
 * existing student -> host relay socket. Mirrors the SUBMIT send pattern in
 * initControllerOptions() below. Called by bonus-round.js's `onScore`
 * (throttled ~300ms, `alive: true`) and `onEnd` (immediate, unthrottled,
 * `alive: false`) callbacks — see design.md §5 Protocol Schema.
 * @param {number} score
 * @param {boolean} alive
 */
function sendBonusScore(score, alive) {
  if (!gameState.relaySocket || gameState.relaySocket.readyState !== WebSocket.OPEN) return;
  gameState.relaySocket.send(JSON.stringify({
    type: MSG_TYPES.BONUS_SCORE,
    payload: { studentId: gameState.studentId, score, alive },
  }));
}

/**
 * Builds the simple text summary shown on the student/controller view once
 * the host ends the session — reuses the existing status-text pattern
 * (setControllerQuestionText) rather than a dedicated results UI. Shows the
 * student's own score/rank when found in finalRanking, plus a top-3 list;
 * falls back to a plain "session ended" message if this device never scored
 * (not present in finalRanking) or the ranking is empty.
 * @param {Array<{studentId: string, score: number}>} finalRanking - already
 *   sorted descending by score (see endSession())
 * @returns {string}
 */
function buildFinalResultsText(finalRanking) {
  if (finalRanking.length === 0) {
    return 'Sesion terminada! No hubo puntajes registrados.';
  }

  const winner = finalRanking[0];
  const myIndex = finalRanking.findIndex((entry) => entry.studentId === gameState.studentId);

  let ownResultText;
  if (myIndex === -1) {
    ownResultText = 'No sumaste puntos esta sesion.';
  } else {
    const place = myIndex + 1;
    ownResultText = `Tu puntaje: ${finalRanking[myIndex].score} (${place}° lugar)`;
  }

  const top3 = finalRanking
    .slice(0, 3)
    .map((entry, index) => `${index + 1}. ${entry.studentId} (${entry.score})`)
    .join(' | ');

  return `Sesion terminada! Ganador: ${winner.studentId} con ${winner.score} pts. ${ownResultText} Top 3: ${top3}`;
}

/**
 * Builds the champion-reveal text shown on the student/controller view once
 * `BONUS_END` arrives — mirrors `buildFinalResultsText()`'s pattern (reuse
 * `setControllerQuestionText()`, no dedicated results UI, per design.md §7
 * "Spectator screen costs zero new markup"). Shown to finalists and
 * spectators alike; a finalist also sees the champion line under their own
 * death frame still drawn on `#bonus-canvas`.
 * @param {Array<{studentId: string, score: number}>} standings - already
 *   sorted descending by score (see endBonusRound())
 * @param {Array<string>} champions - one entry, or several on a tie
 * @returns {string}
 */
function buildBonusResultsText(standings, champions) {
  if (!champions || champions.length === 0) {
    return 'Ronda bonus terminada! No hubo puntajes registrados.';
  }

  const champLine =
    champions.length > 1 ? `Co-Campeones: ${champions.join(' y ')}` : `Campeon: ${champions[0]}`;

  const myEntry = (standings || []).find((entry) => entry.studentId === gameState.studentId);
  const ownResultText = myEntry ? ` Tu puntaje: ${myEntry.score} pts.` : '';

  return `Ronda bonus terminada! ${champLine}.${ownResultText}`;
}

function setControllerQuestionText(text) {
  const el = document.getElementById('controller-question-text');
  if (el) el.textContent = text;
}

/**
 * Renders the real per-quadrant answer text on the controller's A/B/C/D
 * buttons when the host broadcasts a question-bank question (an `options`
 * object shaped like `{ A: 'text', B: 'text', ... }`). Falls back to the
 * bare quadrant letter when `options` is missing or is the legacy
 * QUADRANTS array shape.
 * @param {object|Array<string>} [options]
 */
function setControllerOptionLabels(options) {
  document.querySelectorAll('.controller-option').forEach((btn) => {
    const choice = btn.dataset.choice;
    const label = options && !Array.isArray(options) ? options[choice] : null;
    btn.textContent = label ? `${choice}. ${label}` : choice;
  });
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
      if (!gameState.relaySocket || gameState.relaySocket.readyState !== WebSocket.OPEN) return;

      const choice = btn.dataset.choice;
      const timeElapsedMs = Date.now() - (gameState.controllerQuestionStartedAt || Date.now());

      gameState.relaySocket.send(JSON.stringify({
        type: MSG_TYPES.SUBMIT,
        payload: {
          questionId: gameState.controllerCurrentQuestionId,
          studentId: gameState.studentId,
          choice,
          timeElapsedMs,
        },
      }));

      gameState.controllerHasSubmitted = true;
      setControllerOptionsEnabled(false);
      setControllerQuestionText(`Answer "${choice}" submitted! Waiting for round results…`);
    });
  });
}

// ---------------------------------------------------------------------------
// Husky Bonus Round — message contract + host-side state machine wiring
// (openspec/changes/husky-bonus-round). Host-authoritative like everything
// else in this file: the host derives finalists, broadcasts BONUS_START,
// aggregates BONUS_SCORE, decides when the round is over, and broadcasts
// BONUS_END. Finalist devices only run bonus-round.js's loop and report a
// number back — see the BONUS_START/BONUS_END handling in
// handleClientMessage() above.
//
// Deliberately does not read or write gameState.totalScores,
// gameState.finalRanking, or anything already broadcast as the quiz
// champion (specs/bonus-round/spec.md — Independence from Quiz Scoring).
// ---------------------------------------------------------------------------

// 5s of silence from a finalist marks them `stalled` (design.md "Finalist
// disconnect mid-run" — the relay never notifies the host of a drop, so a
// timeout is the only available signal; >16x the 300ms report interval).
const BONUS_STALE_MS = 5000;
// Hard cap on round length from BONUS_START, regardless of how many
// finalists are still alive (specs/bonus-round/spec.md — Round Finalization).
const BONUS_MAX_MS = 180000;
// How often the host polls bonusLastSeen for newly-stalled finalists.
const BONUS_STALL_CHECK_INTERVAL_MS = 1000;

/**
 * Derives the bonus-round finalist set from the already-computed, descending
 * final quiz ranking: the top 3 students, plus every additional student tied
 * with the 3rd-place score (specs/bonus-round/spec.md — Finalist Derivation).
 * Pure function of its input — does not read or mutate gameState.
 * @param {Array<{studentId: string, score: number}>} finalRanking - sorted
 *   descending by score (see endSession())
 * @returns {Array<string>} finalist studentIds
 */
function deriveBonusFinalists(finalRanking) {
  if (!Array.isArray(finalRanking) || finalRanking.length === 0) return [];
  if (finalRanking.length <= 3) return finalRanking.map((entry) => entry.studentId);

  const thirdPlaceScore = finalRanking[2].score;
  return finalRanking
    .filter((entry, index) => index < 3 || entry.score === thirdPlaceScore)
    .map((entry) => entry.studentId);
}

/**
 * Host action: transitions SESSION_END -> BONUS_ROUND, derives finalists
 * from the already-broadcast final quiz ranking, seeds per-finalist
 * score/alive/stalled tracking, and broadcasts BONUS_START to all connected
 * clients. Receivers self-select player vs spectator by finalist-list
 * membership (see handleClientMessage()'s BONUS_START case) — the relay
 * only supports broadcastToStudents(), it has no per-client targeting, so
 * the finalist list travels in the payload instead.
 * @satisfies specs/bonus-round/spec.md — Finalist Derivation, Bonus Round Start
 */
function startBonusRound() {
  if (gameState.current !== GAME_STATES.SESSION_END) return;

  const finalists = deriveBonusFinalists(gameState.finalRanking);
  // No scored students to promote (e.g. a session ended with nobody
  // answering) — nothing to play, so stay in SESSION_END rather than
  // entering a bonus round that can never auto-finalize.
  if (finalists.length === 0) return;

  gameState.bonusFinalists = finalists;
  gameState.bonusScores = {};
  gameState.bonusLastSeen = {};
  gameState.bonusStandings = [];
  gameState.bonusChampions = [];

  const startedAt = Date.now();
  gameState.bonusStartedAt = startedAt;

  finalists.forEach((studentId) => {
    gameState.bonusScores[studentId] = { score: 0, alive: true, stalled: false };
    gameState.bonusLastSeen[studentId] = startedAt;
  });

  setGameState(GAME_STATES.BONUS_ROUND);

  broadcastToStudents({
    type: MSG_TYPES.BONUS_START,
    payload: { finalists, maxDurationMs: BONUS_MAX_MS },
  });

  startBonusStallCheck();
  startBonusMaxCapTimer();
}

/**
 * Polls gameState.bonusLastSeen every BONUS_STALL_CHECK_INTERVAL_MS and
 * marks any finalist `stalled` once BONUS_STALE_MS has passed since their
 * last BONUS_SCORE — their last known score stays frozen and still counts
 * toward finalization (specs/bonus-round/spec.md — Stalled Finalist Handling).
 */
function startBonusStallCheck() {
  stopBonusStallCheck();
  gameState.bonusTimers.stallCheckId = window.setInterval(() => {
    const now = Date.now();
    let changed = false;

    gameState.bonusFinalists.forEach((studentId) => {
      const entry = gameState.bonusScores[studentId];
      if (!entry || entry.alive === false || entry.stalled) return;
      const lastSeen = gameState.bonusLastSeen[studentId] || 0;
      if (now - lastSeen >= BONUS_STALE_MS) {
        entry.stalled = true;
        changed = true;
      }
    });

    if (changed) renderDashboard();
    checkBonusRoundFinalization();
  }, BONUS_STALL_CHECK_INTERVAL_MS);
}

function stopBonusStallCheck() {
  if (gameState.bonusTimers.stallCheckId === null) return;
  window.clearInterval(gameState.bonusTimers.stallCheckId);
  gameState.bonusTimers.stallCheckId = null;
}

/**
 * Schedules the 180s hard cap (specs/bonus-round/spec.md — Round
 * Finalization: "OR 180 seconds have elapsed since BONUS_START ... whichever
 * occurs first"). endBonusRound() is itself idempotent-guarded on
 * gameState.current, so this firing after the round already finalized by
 * another path is harmless.
 */
function startBonusMaxCapTimer() {
  stopBonusMaxCapTimer();
  gameState.bonusTimers.maxCapTimeoutId = window.setTimeout(() => {
    endBonusRound();
  }, BONUS_MAX_MS);
}

function stopBonusMaxCapTimer() {
  if (gameState.bonusTimers.maxCapTimeoutId === null) return;
  window.clearTimeout(gameState.bonusTimers.maxCapTimeoutId);
  gameState.bonusTimers.maxCapTimeoutId = null;
}

/**
 * Checks the "all finalists dead-or-stalled" finalization condition
 * (specs/bonus-round/spec.md — Round Finalization) and ends the round if it
 * holds. Called after every BONUS_SCORE update and every stall-check tick —
 * the other two finalization triggers (180s cap, manual host end) call
 * endBonusRound() directly instead of going through this check.
 */
function checkBonusRoundFinalization() {
  if (gameState.current !== GAME_STATES.BONUS_ROUND) return;
  if (gameState.bonusFinalists.length === 0) return;

  const allDoneOrStalled = gameState.bonusFinalists.every((studentId) => {
    const entry = gameState.bonusScores[studentId];
    return !entry || entry.alive === false || entry.stalled;
  });

  if (allDoneOrStalled) endBonusRound();
}

/**
 * Finalizes the bonus round: stops both host-side timers, computes final
 * standings + champion(s) from each finalist's last known score (frozen
 * scores from stalled finalists still count), transitions to BONUS_RESULTS,
 * and broadcasts BONUS_END to ALL connected clients — finalists and
 * spectators alike (design.md Decision #5: host -> all broadcast, not
 * finalist -> host, specifically so spectators also see the champion
 * reveal). Ties at the highest score all become co-champions, no tiebreaker
 * (specs/bonus-round/spec.md — Champion Reveal).
 *
 * Reachable via three paths, whichever fires first: checkBonusRoundFinalization()
 * (all dead-or-stalled), startBonusMaxCapTimer()'s 180s timeout, or the
 * manual "Finalizar ronda bonus" host control wired in initDashboardControls().
 * Guarded on gameState.current so a second caller (e.g. the 180s timer
 * firing just after the manual button was clicked) is a safe no-op.
 */
function endBonusRound() {
  if (gameState.current !== GAME_STATES.BONUS_ROUND) return;

  stopBonusStallCheck();
  stopBonusMaxCapTimer();

  const standings = gameState.bonusFinalists
    .map((studentId) => ({ studentId, score: (gameState.bonusScores[studentId] || {}).score || 0 }))
    .sort((a, b) => b.score - a.score);

  const topScore = standings.length > 0 ? standings[0].score : 0;
  const champions = standings
    .filter((entry) => entry.score === topScore)
    .map((entry) => entry.studentId);

  gameState.bonusStandings = standings;
  gameState.bonusChampions = champions;

  setGameState(GAME_STATES.BONUS_RESULTS);

  broadcastToStudents({ type: MSG_TYPES.BONUS_END, payload: { standings, champions } });
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
