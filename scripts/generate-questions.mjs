#!/usr/bin/env node
// Generates questions-public.js and answers.json from the single source of
// truth questions-source.json. Run this after editing questions-source.json
// instead of hand-editing the two generated files.
//
// The split between questions-public.js (loaded by every browser) and
// answers.json (fetched only by the host, only once hosting starts) stays
// exactly as documented in README.md — this script just automates keeping
// both in sync with one edit instead of two.
'use strict';

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SOURCE_PATH = path.join(ROOT, 'questions-source.json');
const PUBLIC_PATH = path.join(ROOT, 'questions-public.js');
const ANSWERS_PATH = path.join(ROOT, 'answers.json');

const OPTION_KEYS = ['A', 'B', 'C', 'D'];

function fail(message) {
  console.error(`generate-questions: ${message}`);
  process.exit(1);
}

function loadSource() {
  let raw;
  try {
    raw = readFileSync(SOURCE_PATH, 'utf8');
  } catch (err) {
    fail(`could not read ${SOURCE_PATH}: ${err.message}`);
  }

  let questions;
  try {
    questions = JSON.parse(raw);
  } catch (err) {
    fail(`${SOURCE_PATH} is not valid JSON: ${err.message}`);
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    fail(`${SOURCE_PATH} must be a non-empty JSON array of questions`);
  }

  return questions;
}

function validate(questions) {
  const seenIds = new Set();

  questions.forEach((q, index) => {
    const where = `questions-source.json[${index}] (id: ${q && q.id})`;

    if (typeof q.id !== 'number' || !Number.isInteger(q.id)) {
      fail(`${where}: "id" must be an integer`);
    }
    if (seenIds.has(q.id)) {
      fail(`${where}: duplicate id ${q.id}`);
    }
    seenIds.add(q.id);

    if (typeof q.text !== 'string' || q.text.trim().length === 0) {
      fail(`${where}: "text" must be a non-empty string`);
    }

    if (!q.options || typeof q.options !== 'object') {
      fail(`${where}: "options" must be an object with keys A-D`);
    }
    OPTION_KEYS.forEach((key) => {
      if (typeof q.options[key] !== 'string' || q.options[key].trim().length === 0) {
        fail(`${where}: options.${key} must be a non-empty string`);
      }
    });

    if (!OPTION_KEYS.includes(q.correctAnswer)) {
      fail(`${where}: "correctAnswer" must be one of ${OPTION_KEYS.join('/')}, got ${JSON.stringify(q.correctAnswer)}`);
    }
  });
}

function jsStringLiteral(value) {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function buildQuestionsPublicJs(questions) {
  const entries = questions
    .map((q) => {
      const options = OPTION_KEYS.map((key) => `${key}: ${jsStringLiteral(q.options[key])}`).join(', ');
      return `  {\n    id: ${q.id},\n    text: ${jsStringLiteral(q.text)},\n    options: { ${options} },\n  },`;
    })
    .join('\n');

  return `'use strict';

/**
 * Interactive Avatar Board — questions-public.js
 * GENERATED FILE — do not edit by hand. Edit questions-source.json and run
 * \`node scripts/generate-questions.mjs\` instead (see README.md).
 *
 * Pre-configured question bank (PUBLIC part). Loaded before app.js (see
 * index.html) into EVERY visitor's browser (host and students alike).
 *
 * This file intentionally does NOT contain \`correctAnswer\` — that field
 * lives in the separate \`answers.json\` file, which is fetched only by the
 * host's code path, only once hosting actually starts (see initHostPeer()
 * in app.js). See README.md for why this is split and what it does/doesn't
 * protect against.
 */
const QUESTIONS_PUBLIC = [
${entries}
];
`;
}

function buildAnswersJson(questions) {
  const answers = {};
  questions.forEach((q) => {
    answers[String(q.id)] = q.correctAnswer;
  });
  return `${JSON.stringify(answers, null, 2)}\n`;
}

function main() {
  const questions = loadSource();
  validate(questions);

  writeFileSync(PUBLIC_PATH, buildQuestionsPublicJs(questions));
  writeFileSync(ANSWERS_PATH, buildAnswersJson(questions));

  console.log(`Generated questions-public.js and answers.json from ${questions.length} question(s).`);
}

main();
