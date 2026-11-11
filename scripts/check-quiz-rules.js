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

console.log('quiz-rules: all checks passed');
