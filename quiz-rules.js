// Pure helpers for the alias rule and the results CSV export.
//
// Classic script (no modules): loaded by index.html before app.js and exposed
// as `window.QuizRules`; also `require()`-able from Node so
// scripts/check-quiz-rules.js can exercise it without a browser. Nothing here
// touches the DOM or gameState.

(function (root) {
  const DEFAULT_PREFIX_DIGITS = 10;
  const MAX_PREFIX_DIGITS = 20;
  const CSV_HEADER = [
    'student_id',
    'alias',
    'correct_answers',
    'total_questions',
    'speed_points',
    'rank',
    'bonus_score',
    'bonus_champion',
  ];
  const UTF8_BOM = '﻿';

  function normalizeDigits(value) {
    const n = Number.parseInt(value, 10);
    if (!Number.isInteger(n) || n < 1 || n > MAX_PREFIX_DIGITS) return DEFAULT_PREFIX_DIGITS;
    return n;
  }

  /**
   * Compiles the host's alias-rule config into a validator.
   * @param {{mode?: 'any'|'prefix'|'custom', digits?: number|string, regex?: string}} config
   * @returns {{mode: string, digits: number, test: (alias: string) => boolean,
   *   description: string, message: string, warning: string|null}}
   *   `mode` is the EFFECTIVE mode: an empty/invalid custom regex falls back to
   *   'any' and sets `warning`.
   */
  function compileAliasRule(config) {
    const cfg = config || {};
    const digits = normalizeDigits(cfg.digits);
    const anyRule = (warning) => ({
      mode: 'any',
      digits,
      test: () => true,
      description: 'Any alias is accepted.',
      message: '',
      warning: warning || null,
    });

    if (cfg.mode === 'prefix') {
      const pattern = new RegExp(`^\\d{${digits}}_.+$`);
      const example = `${'0'.repeat(Math.max(0, digits - 1))}1_Shadow`;
      return {
        mode: 'prefix',
        digits,
        test: (alias) => pattern.test(alias),
        description: `Alias must be ${digits} digits, "_", then an alias (e.g. ${example}).`,
        message: `Your alias must start with your ${digits}-digit student ID followed by an underscore, e.g. ${example}.`,
        warning: null,
      };
    }

    if (cfg.mode === 'custom') {
      const source = String(cfg.regex || '').trim();
      if (!source) return anyRule('Custom regex is empty - falling back to "Any alias".');
      let pattern;
      try {
        pattern = new RegExp(source);
      } catch (err) {
        return anyRule(`Invalid regex (${err.message}) - falling back to "Any alias".`);
      }
      return {
        mode: 'custom',
        digits,
        test: (alias) => pattern.test(alias),
        description: `Alias must match /${source}/.`,
        message: 'Your alias does not match the format required for this session. Ask your teacher for the expected format.',
        warning: null,
      };
    }

    return anyRule(null);
  }

  /**
   * Splits "<id>_<alias>" on the first "_" ONLY when a prefix/custom rule is
   * active or the value starts with `rule.digits` digits + "_". Otherwise the
   * whole value is the alias and the id is empty.
   * @returns {{studentId: string, alias: string}}
   */
  function splitStudentId(value, rule) {
    const text = String(value);
    const digits = rule && rule.digits ? rule.digits : DEFAULT_PREFIX_DIGITS;
    const idx = text.indexOf('_');
    const ruleActive = Boolean(rule) && rule.mode !== 'any';
    const looksLikeId = new RegExp(`^\\d{${digits}}_`).test(text);
    if (idx > 0 && (ruleActive || looksLikeId)) {
      return { studentId: text.slice(0, idx), alias: text.slice(idx + 1) };
    }
    return { studentId: '', alias: text };
  }

  /** Neutralizes CSV/spreadsheet formula injection: values that would start a
   *  formula get a leading single quote. */
  function neutralizeFormula(text) {
    return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  }

  /** RFC 4180 escaping: quote when the cell has a quote, comma or newline. */
  function escapeCsvCell(text) {
    const s = String(text);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  /**
   * student_id is written as the Excel/Sheets text-formula `="0000298552"` so
   * leading zeros survive (a plain digits cell would be coerced to a number).
   * Only used for pure-digit ids; anything else is plain text (formula-safe).
   */
  function formatStudentIdCell(studentId) {
    if (!studentId) return '';
    if (/^\d+$/.test(studentId)) return escapeCsvCell(`="${studentId}"`);
    return escapeCsvCell(neutralizeFormula(studentId));
  }

  /**
   * @param {Array<{studentId: string, alias: string, correctAnswers: number,
   *   totalQuestions: number, speedPoints: number, rank: number,
   *   bonusScore: number|null|undefined, bonusChampion: boolean}>} rows
   * @returns {string} CSV text with a UTF-8 BOM and CRLF line endings
   */
  function buildResultsCsv(rows) {
    const lines = [CSV_HEADER.join(',')];
    (rows || []).forEach((row) => {
      const hasBonus = row.bonusScore !== null && row.bonusScore !== undefined;
      lines.push(
        [
          formatStudentIdCell(row.studentId),
          escapeCsvCell(neutralizeFormula(String(row.alias))),
          row.correctAnswers,
          row.totalQuestions,
          row.speedPoints,
          row.rank,
          hasBonus ? row.bonusScore : '',
          row.bonusChampion ? 'yes' : 'no',
        ].join(',')
      );
    });
    return UTF8_BOM + lines.join('\r\n') + '\r\n';
  }

  /**
   * Builds CSV rows from session state. Rank = position in finalRanking, with
   * ties sharing the rank of the first tied entry (1, 1, 3, ...).
   * @param {{finalRanking: Array<{studentId: string, score: number}>,
   *   correctCounts: Object<string, number>, totalQuestions: number,
   *   bonusStandings?: Array<{studentId: string, score: number}>,
   *   bonusChampions?: string[], rule?: object}} state
   */
  function buildResultRows(state) {
    const { finalRanking = [], correctCounts = {}, totalQuestions = 0, bonusStandings = [], bonusChampions = [], rule } = state;
    const bonusById = new Map(bonusStandings.map((entry) => [entry.studentId, entry.score]));
    const champions = new Set(bonusChampions);
    return finalRanking.map((entry, index) => {
      const firstTied = finalRanking.findIndex((other) => other.score === entry.score);
      const { studentId, alias } = splitStudentId(entry.studentId, rule);
      return {
        studentId,
        alias,
        correctAnswers: correctCounts[entry.studentId] || 0,
        totalQuestions,
        speedPoints: entry.score,
        rank: (firstTied === -1 ? index : firstTied) + 1,
        bonusScore: bonusById.has(entry.studentId) ? bonusById.get(entry.studentId) : null,
        bonusChampion: champions.has(entry.studentId),
      };
    });
  }

  /** Serializes the rule config for storage (only the known fields). */
  function serializeAliasConfig(config) {
    const cfg = config || {};
    return JSON.stringify({ mode: cfg.mode, digits: cfg.digits, regex: cfg.regex });
  }

  /**
   * Restores a stored rule config. Anything missing, malformed or with an
   * unknown mode yields the default Any alias config; fields are sanitized.
   * @returns {{mode: 'any'|'prefix'|'custom', digits: number, regex: string}}
   */
  function parseAliasConfig(raw) {
    const fallback = { mode: 'any', digits: DEFAULT_PREFIX_DIGITS, regex: '' };
    if (typeof raw !== 'string') return fallback;
    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      return fallback;
    }
    if (!data || typeof data !== 'object' || !['any', 'prefix', 'custom'].includes(data.mode)) return fallback;
    return {
      mode: data.mode,
      digits: normalizeDigits(data.digits),
      regex: typeof data.regex === 'string' ? data.regex.slice(0, 200) : '',
    };
  }

  /**
   * Stall decision for one bonus finalist. A finalist that has never reported
   * gets initialGraceMs (counted from lastSeen, seeded at BONUS_START); once
   * it has reported, the shorter staleMs applies.
   * @returns {boolean} true when the finalist should be marked stalled
   */
  function isFinalistStalled({ now, lastSeen, hasReported, staleMs, initialGraceMs }) {
    const limit = hasReported ? staleMs : Math.max(staleMs, initialGraceMs);
    return now - lastSeen >= limit;
  }

  /** Exponential backoff for student reconnects: 1s, 2s, 4s, 8s, then capped (10s). */
  function reconnectDelayMs(attempt, baseMs = 1000, capMs = 10000) {
    const n = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 0;
    return Math.min(baseMs * 2 ** Math.min(n, 30), capMs);
  }

  /**
   * What to do when a student socket closes.
   * 'host-gone' (close code hostCode: terminal), 'stop' (deliberate close or
   * fatal relay error), otherwise 'retry'.
   */
  function reconnectDecision({ closeCode, stopped, fatal, hostCode }) {
    if (closeCode === hostCode) return 'host-gone';
    if (stopped || fatal) return 'stop';
    return 'retry';
  }

  /** True when a host payload targets a different student than studentId. */
  function isTargetedElsewhere(payload, studentId) {
    return Boolean(payload) && payload.targetStudentId !== undefined && payload.targetStudentId !== studentId;
  }

  const AUTO_ADVANCE_MIN_SEC = 3;
  const AUTO_ADVANCE_MAX_SEC = 60;
  const AUTO_ADVANCE_DEFAULT = { enabled: true, dwellSec: 8 };

  /** Clamps the leaderboard dwell to 3-60 whole seconds (invalid -> default 8). */
  function clampDwellSec(value) {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n)) return AUTO_ADVANCE_DEFAULT.dwellSec;
    return Math.min(AUTO_ADVANCE_MAX_SEC, Math.max(AUTO_ADVANCE_MIN_SEC, n));
  }

  function serializeAutoAdvance(settings) {
    const s = settings || {};
    return JSON.stringify({ enabled: s.enabled !== false, dwellSec: clampDwellSec(s.dwellSec) });
  }

  /** Restores stored auto-advance settings; anything invalid -> defaults (ON, 8s). */
  function parseAutoAdvance(raw) {
    const fallback = { ...AUTO_ADVANCE_DEFAULT };
    if (typeof raw !== 'string') return fallback;
    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      return fallback;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return fallback;
    return {
      enabled: typeof data.enabled === 'boolean' ? data.enabled : AUTO_ADVANCE_DEFAULT.enabled,
      dwellSec: clampDwellSec(data.dwellSec),
    };
  }

  /** Round just ended: start a dwell only if the TIMER expired and auto-advance is on. */
  function shouldScheduleAutoAdvance({ reason, settings }) {
    return reason === 'timer' && Boolean(settings) && settings.enabled === true;
  }

  /** Dwell elapsed: advance only if still on the leaderboard and still enabled. */
  function shouldFireAutoAdvance({ currentState, settings }) {
    return currentState === 'LEADERBOARD' && Boolean(settings) && settings.enabled === true;
  }

  /** Whole seconds left in the dwell (never negative). */
  function dwellRemainingSec(now, endsAt) {
    return Math.max(0, Math.ceil((endsAt - now) / 1000));
  }

  // ---- Topic banks -------------------------------------------------------
  const ALL_TOPICS = '*'; // select value for "All topics (mixed)"; not a valid slug, so it can't collide
  const TOPIC_ID_PATTERN = /^[a-z0-9-]+$/;
  const ROOM_PREFIX_MAX = 40; // keep the Room ID well under the relay's 64-char limit

  /**
   * Validates banks/index.json. Returns only well-formed entries
   * ({id: slug, title: non-empty string, count: positive integer}); returns
   * null when the manifest isn't an array or has no valid entry.
   */
  function parseManifest(raw) {
    if (!Array.isArray(raw)) return null;
    const seen = new Set();
    const topics = [];
    raw.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const { id, title, count } = entry;
      if (typeof id !== 'string' || !TOPIC_ID_PATTERN.test(id) || seen.has(id)) return;
      if (typeof title !== 'string' || title.trim() === '') return;
      if (!Number.isInteger(count) || count < 1) return;
      seen.add(id);
      topics.push({ id, title, count });
    });
    return topics.length > 0 ? topics : null;
  }

  /** Question ids can collide across topics, so internal keys are "<topic>:<id>". */
  function namespaceId(topicId, id) {
    return topicId + ':' + id;
  }

  /**
   * Merges loaded topics into one bank.
   * @param {Array<{id: string, questions: Array<{id: number, text: string, options: object}>, answers: Object<string,string>}>} topics
   * @returns {{questions: Array<{key: string, text: string, options: object}>, answerKey: Object<string,string>}}
   * @throws if a question has no valid A-D answer or a key repeats
   */
  function buildBank(topics) {
    const questions = [];
    const answerKey = {};
    (topics || []).forEach((topic) => {
      if (!Array.isArray(topic.questions)) throw new Error('Topic "' + topic.id + '" has no questions');
      topic.questions.forEach((q) => {
        const key = namespaceId(topic.id, q.id);
        const answer = topic.answers && topic.answers[String(q.id)];
        if (!['A', 'B', 'C', 'D'].includes(answer)) throw new Error('No valid answer for ' + key);
        if (Object.prototype.hasOwnProperty.call(answerKey, key)) throw new Error('Duplicate question ' + key);
        answerKey[key] = answer;
        questions.push({ key, text: q.text, options: q.options });
      });
    });
    return { questions, answerKey };
  }

  /** "SCRUM-4821" for a topic, "ROOM-4821" for mixed/no topic (today's format). */
  function buildRoomId(topicId, suffix) {
    if (typeof topicId !== 'string' || !TOPIC_ID_PATTERN.test(topicId)) return 'ROOM-' + suffix;
    return topicId.slice(0, ROOM_PREFIX_MAX).toUpperCase() + '-' + suffix;
  }

  /** Restores the remembered topic choice: a manifest id or ALL_TOPICS; anything else -> ALL_TOPICS. */
  function parseStoredTopic(raw, manifest) {
    if (typeof raw !== 'string' || !Array.isArray(manifest)) return ALL_TOPICS;
    return manifest.some((topic) => topic.id === raw) ? raw : ALL_TOPICS;
  }

  const api = { ALL_TOPICS, parseManifest, namespaceId, buildBank, buildRoomId, parseStoredTopic, clampDwellSec, serializeAutoAdvance, parseAutoAdvance, shouldScheduleAutoAdvance, shouldFireAutoAdvance, dwellRemainingSec, reconnectDelayMs, reconnectDecision, isTargetedElsewhere, isFinalistStalled, serializeAliasConfig, parseAliasConfig, compileAliasRule, splitStudentId, buildResultsCsv, buildResultRows };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.QuizRules = api;
})(typeof window !== 'undefined' ? window : globalThis);
