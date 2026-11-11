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

  const api = { isFinalistStalled, serializeAliasConfig, parseAliasConfig, compileAliasRule, splitStudentId, buildResultsCsv, buildResultRows };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.QuizRules = api;
})(typeof window !== 'undefined' ? window : globalThis);
