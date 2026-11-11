// Dependency-free check for quiz-rules.js. Run: node scripts/check-quiz-rules.js
const assert = require('node:assert/strict');
const Q = require('../quiz-rules.js');

// Alias rules
const any = Q.compileAliasRule({ mode: 'any' });
assert.ok(any.test('anything') && any.mode === 'any');
const prefix = Q.compileAliasRule({ mode: 'prefix', digits: 10 });
assert.ok(prefix.test('0000298552_Shadow'));
assert.ok(!prefix.test('Shadow'));
assert.ok(!prefix.test('298552_Shadow'));
assert.ok(!prefix.test('0000298552_'));
assert.ok(Q.compileAliasRule({ mode: 'prefix', digits: 8 }).test('12345678_x'));
assert.equal(Q.compileAliasRule({ mode: 'prefix', digits: 'abc' }).digits, 10);
const bad = Q.compileAliasRule({ mode: 'custom', regex: '(' });
assert.equal(bad.mode, 'any');
assert.ok(bad.warning && bad.test('whatever'));
assert.ok(Q.compileAliasRule({ mode: 'custom', regex: '' }).warning);
const custom = Q.compileAliasRule({ mode: 'custom', regex: String.raw`^[A-Z]{3}-\d+$` });
assert.ok(custom.test('ABC-12') && !custom.test('abc-12') && !custom.warning);

// Split
assert.deepEqual(Q.splitStudentId('0000298552_Shadow_X', prefix), { studentId: '0000298552', alias: 'Shadow_X' });
assert.deepEqual(Q.splitStudentId('0000298552_Shadow', any), { studentId: '0000298552', alias: 'Shadow' });
assert.deepEqual(Q.splitStudentId('Mock_1', any), { studentId: '', alias: 'Mock_1' });
assert.deepEqual(Q.splitStudentId('Shadow', prefix), { studentId: '', alias: 'Shadow' });

// Rows + CSV
const rows = Q.buildResultRows({
  finalRanking: [
    { studentId: '0000298552_Shadow', score: 5 },
    { studentId: '0000000001_=cmd', score: 5 },
    { studentId: 'Zero, "Q"', score: 0 },
  ],
  correctCounts: { '0000298552_Shadow': 2, '0000000001_=cmd': 1 },
  totalQuestions: 3,
  bonusStandings: [{ studentId: '0000298552_Shadow', score: 7 }],
  bonusChampions: ['0000298552_Shadow'],
  rule: prefix,
});
assert.deepEqual(rows.map((r) => r.rank), [1, 1, 3]);
assert.equal(rows[2].correctAnswers, 0);
assert.equal(rows[2].bonusScore, null);
const csv = Q.buildResultsCsv(rows);
assert.ok(csv.startsWith('﻿student_id,alias,correct_answers,total_questions,speed_points,rank,bonus_score,bonus_champion\r\n'));
const lines = csv.slice(1).split('\r\n');
assert.equal(lines[1], '"=""0000298552""",Shadow,2,3,5,1,7,yes');
assert.equal(lines[2], `"=""0000000001""",'=cmd,1,3,5,1,,no`);
assert.equal(lines[3], `,"Zero, ""Q""",0,3,0,3,,no`);
assert.equal(
  Q.buildResultsCsv([{ studentId: '', alias: '@x', correctAnswers: 0, totalQuestions: 0, speedPoints: 0, rank: 1, bonusChampion: false }]).split('\r\n')[1],
  `,'@x,0,0,0,1,,no`
);

// Persistence: round trip + bad input falls back to Any alias
const defaults = { mode: 'any', digits: 10, regex: '' };
const cfg = { mode: 'prefix', digits: 8, regex: 'x' };
assert.deepEqual(Q.parseAliasConfig(Q.serializeAliasConfig(cfg)), cfg);
[null, undefined, '', 'not json', '{', '42', 'null', '[]', '{"mode":"evil"}', '{"mode":5}'].forEach((badInput) =>
  assert.deepEqual(Q.parseAliasConfig(badInput), defaults)
);
assert.deepEqual(Q.parseAliasConfig('{"mode":"prefix","digits":99,"regex":7}'), { mode: 'prefix', digits: 10, regex: '' });
// A stored invalid custom regex restores, but compiles to Any with a warning
const restored = Q.compileAliasRule(Q.parseAliasConfig('{"mode":"custom","regex":"("}'));
assert.ok(restored.mode === 'any' && restored.warning);

// CSV with ranking AND bonus data together (as the bonus results view exports it)
const bonusLines = Q.buildResultsCsv(
  Q.buildResultRows({
    finalRanking: [
      { studentId: '0000000002_Ann', score: 3 },
      { studentId: '0000000003_Bob', score: 1 },
    ],
    correctCounts: { '0000000002_Ann': 2 },
    totalQuestions: 2,
    bonusStandings: [
      { studentId: '0000000003_Bob', score: 9 },
      { studentId: '0000000002_Ann', score: 0 },
    ],
    bonusChampions: ['0000000003_Bob'],
    rule: prefix,
  })
)
  .slice(1)
  .split('\r\n');
assert.equal(bonusLines[1], '"=""0000000002""",Ann,2,2,3,1,0,no');
assert.equal(bonusLines[2], '"=""0000000003""",Bob,0,2,1,2,9,yes');

// Bonus stall grace
const stall = (over) => Q.isFinalistStalled({ now: 100000, lastSeen: 100000, hasReported: false, staleMs: 5000, initialGraceMs: 20000, ...over });
assert.equal(stall({}), false);
assert.equal(stall({ lastSeen: 100000 - 6000 }), false); // never reported: 6s is within grace
assert.equal(stall({ lastSeen: 100000 - 19999 }), false);
assert.equal(stall({ lastSeen: 100000 - 20000 }), true);
assert.equal(stall({ hasReported: true, lastSeen: 100000 - 4999 }), false); // reported: 5s rule
assert.equal(stall({ hasReported: true, lastSeen: 100000 - 5000 }), true);

// Reconnect backoff / decision / targeting
assert.deepEqual([0, 1, 2, 3, 4, 5, 50].map((n) => Q.reconnectDelayMs(n)), [1000, 2000, 4000, 8000, 10000, 10000, 10000]);
assert.equal(Q.reconnectDelayMs(-1), 1000);
assert.equal(Q.reconnectDelayMs(NaN), 1000);
const dec = (o) => Q.reconnectDecision({ closeCode: 1006, stopped: false, fatal: false, hostCode: 4001, ...o });
assert.equal(dec({}), 'retry');
assert.equal(dec({ closeCode: 1000 }), 'retry');
assert.equal(dec({ closeCode: 4001 }), 'host-gone');
assert.equal(dec({ stopped: true }), 'stop');
assert.equal(dec({ fatal: true }), 'stop');
assert.equal(Q.isTargetedElsewhere({ targetStudentId: 'a' }, 'b'), true);
assert.equal(Q.isTargetedElsewhere({ targetStudentId: 'a' }, 'a'), false);
assert.equal(Q.isTargetedElsewhere({ finalists: [] }, 'a'), false);
assert.equal(Q.isTargetedElsewhere(undefined, 'a'), false);

// Auto-advance settings + decisions
const aaDefault = { enabled: true, dwellSec: 8 };
assert.deepEqual(Q.parseAutoAdvance(null), aaDefault);
assert.deepEqual(Q.parseAutoAdvance('garbage'), aaDefault);
assert.deepEqual(Q.parseAutoAdvance('[]'), aaDefault);
assert.deepEqual(Q.parseAutoAdvance(Q.serializeAutoAdvance({ enabled: false, dwellSec: 15 })), { enabled: false, dwellSec: 15 });
assert.deepEqual(Q.parseAutoAdvance('{"enabled":"yes","dwellSec":"x"}'), aaDefault);
assert.equal(Q.clampDwellSec(1), 3);
assert.equal(Q.clampDwellSec(999), 60);
assert.equal(Q.clampDwellSec('12'), 12);
assert.equal(Q.clampDwellSec(''), 8);
assert.equal(Q.parseAutoAdvance('{"enabled":true,"dwellSec":0}').dwellSec, 3);
assert.equal(Q.shouldScheduleAutoAdvance({ reason: 'timer', settings: aaDefault }), true);
assert.equal(Q.shouldScheduleAutoAdvance({ reason: 'manual', settings: aaDefault }), false);
assert.equal(Q.shouldScheduleAutoAdvance({ reason: 'timer', settings: { enabled: false, dwellSec: 8 } }), false);
assert.equal(Q.shouldFireAutoAdvance({ currentState: 'LEADERBOARD', settings: aaDefault }), true);
assert.equal(Q.shouldFireAutoAdvance({ currentState: 'SESSION_END', settings: aaDefault }), false);
assert.equal(Q.shouldFireAutoAdvance({ currentState: 'ACTIVE_QUESTION', settings: aaDefault }), false);
assert.equal(Q.shouldFireAutoAdvance({ currentState: 'LEADERBOARD', settings: { enabled: false, dwellSec: 8 } }), false);
assert.equal(Q.dwellRemainingSec(1000, 8000), 7);
assert.equal(Q.dwellRemainingSec(1000, 1001), 1);
assert.equal(Q.dwellRemainingSec(9000, 8000), 0);

console.log('quiz-rules: all checks passed');
