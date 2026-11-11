#!/usr/bin/env node
// Generates the banks/ folder from the per-topic sources in questions/*.json.
// Run this after editing (or adding) a file in questions/ instead of
// hand-editing anything under banks/.
//
// Output:
//   banks/index.json                  manifest [{ id, title, count }], sorted by title
//   banks/<id>.questions.json         [{ id, text, options }]   (NO answers)
//   banks/<id>.answers.json           { "<id>": "A".."D" }
//
// The questions/answers split stays exactly as documented in README.md: the
// browser only ever requests the .answers.json of the topic the host picked,
// and only once hosting starts.
'use strict';

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SOURCE_DIR = path.join(ROOT, 'questions');
const OUT_DIR = path.join(ROOT, 'banks');

const OPTION_KEYS = ['A', 'B', 'C', 'D'];
const TOPIC_ID_PATTERN = /^[a-z0-9-]+$/;

function fail(message) {
  console.error(`generate-questions: ${message}`);
  process.exit(1);
}

function loadTopics() {
  let files;
  try {
    files = readdirSync(SOURCE_DIR)
      .filter((name) => name.endsWith('.json'))
      .sort();
  } catch (err) {
    fail(`could not read ${SOURCE_DIR}: ${err.message}`);
  }
  if (files.length === 0) fail(`${SOURCE_DIR} has no *.json topic files`);

  return files.map((name) => {
    const file = path.join(SOURCE_DIR, name);
    let topic;
    try {
      topic = JSON.parse(readFileSync(file, 'utf8'));
    } catch (err) {
      fail(`questions/${name} is not valid JSON: ${err.message}`);
    }
    return { file: `questions/${name}`, topic };
  });
}

function validateQuestions(where, questions) {
  if (!Array.isArray(questions) || questions.length === 0) {
    fail(`${where}: "questions" must be a non-empty array`);
  }
  const seenIds = new Set();

  questions.forEach((q, index) => {
    const label = `${where}.questions[${index}] (id: ${q && q.id})`;
    if (!q || typeof q !== 'object') fail(`${label}: must be an object`);

    if (typeof q.id !== 'number' || !Number.isInteger(q.id)) {
      fail(`${label}: "id" must be an integer`);
    }
    if (seenIds.has(q.id)) {
      fail(`${label}: duplicate id ${q.id} within this topic`);
    }
    seenIds.add(q.id);

    if (typeof q.text !== 'string' || q.text.trim().length === 0) {
      fail(`${label}: "text" must be a non-empty string`);
    }

    if (!q.options || typeof q.options !== 'object') {
      fail(`${label}: "options" must be an object with keys A-D`);
    }
    OPTION_KEYS.forEach((key) => {
      if (typeof q.options[key] !== 'string' || q.options[key].trim().length === 0) {
        fail(`${label}: options.${key} must be a non-empty string`);
      }
    });

    if (!OPTION_KEYS.includes(q.correctAnswer)) {
      fail(`${label}: "correctAnswer" must be one of ${OPTION_KEYS.join('/')}, got ${JSON.stringify(q.correctAnswer)}`);
    }
  });
}

function validate(entries) {
  const seenTopicIds = new Set();
  entries.forEach(({ file, topic }) => {
    if (!topic || typeof topic !== 'object' || Array.isArray(topic)) {
      fail(`${file}: must be a JSON object { id, title, questions }`);
    }
    if (typeof topic.id !== 'string' || !TOPIC_ID_PATTERN.test(topic.id)) {
      fail(`${file}: "id" must be a slug matching ${TOPIC_ID_PATTERN}, got ${JSON.stringify(topic.id)}`);
    }
    if (seenTopicIds.has(topic.id)) {
      fail(`${file}: duplicate topic id "${topic.id}"`);
    }
    seenTopicIds.add(topic.id);
    if (typeof topic.title !== 'string' || topic.title.trim().length === 0) {
      fail(`${file}: "title" must be a non-empty string`);
    }
    validateQuestions(file, topic.questions);
  });
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function main() {
  const entries = loadTopics();
  validate(entries);

  // Start from a clean folder so a removed/renamed topic leaves no stale files.
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const manifest = entries
    .map(({ topic }) => ({ id: topic.id, title: topic.title, count: topic.questions.length }))
    .sort((a, b) => a.title.localeCompare(b.title, 'es'));

  entries.forEach(({ topic }) => {
    const publicQuestions = topic.questions.map((q) => ({ id: q.id, text: q.text, options: q.options }));
    const answers = {};
    topic.questions.forEach((q) => {
      answers[String(q.id)] = q.correctAnswer;
    });
    writeJson(path.join(OUT_DIR, `${topic.id}.questions.json`), publicQuestions);
    writeJson(path.join(OUT_DIR, `${topic.id}.answers.json`), answers);
  });
  writeJson(path.join(OUT_DIR, 'index.json'), manifest);

  writeFileSync(
    path.join(OUT_DIR, 'README.md'),
    'GENERATED FOLDER - do not edit by hand.\n\n' +
      'Edit the topic files in `questions/` and run `node scripts/generate-questions.mjs`; ' +
      'this folder is rebuilt from scratch every time.\n'
  );

  const total = manifest.reduce((sum, t) => sum + t.count, 0);
  console.log(`Generated banks/ for ${manifest.length} topic(s), ${total} question(s):`);
  manifest.forEach((t) => console.log(`  ${t.id}: ${t.count}`));
}

main();
