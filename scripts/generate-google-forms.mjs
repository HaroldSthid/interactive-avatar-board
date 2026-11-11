#!/usr/bin/env node
// Generates google-forms/create-forms.gs (a Google Apps Script) from the same
// questions/*.json sources the game uses, so the backup Google Forms and the
// live quiz never drift apart.
//
// Usage:
//   node scripts/generate-google-forms.mjs            # teaching topics only
//   node scripts/generate-google-forms.mjs --all      # every topic
//   node scripts/generate-google-forms.mjs scrum herramientas   # chosen topics
//
// The generated script is pasted into https://script.google.com and run once
// from the teacher's own Google account; it creates one quiz Form per topic.
'use strict';

import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const QUESTIONS_DIR = path.join(ROOT, 'questions');
const OUT_DIR = path.join(ROOT, 'google-forms');
const OUT_PATH = path.join(OUT_DIR, 'create-forms.gs');
const OPTION_KEYS = ['A', 'B', 'C', 'D'];

// Topics that are part of the course; general culture is filler and is left
// out unless requested with --all or by name.
const DEFAULT_TOPICS = ['scrum', 'programacion', 'herramientas'];

function fail(message) {
  console.error(`generate-google-forms: ${message}`);
  process.exit(1);
}

function loadTopics() {
  const files = readdirSync(QUESTIONS_DIR).filter((name) => name.endsWith('.json')).sort();
  const topics = new Map();
  for (const file of files) {
    let topic;
    try {
      topic = JSON.parse(readFileSync(path.join(QUESTIONS_DIR, file), 'utf8'));
    } catch (err) {
      fail(`${file} is not valid JSON: ${err.message}`);
    }
    if (!topic || typeof topic.id !== 'string' || typeof topic.title !== 'string' || !Array.isArray(topic.questions)) {
      fail(`${file} must be an object with id, title and questions`);
    }
    topics.set(topic.id, topic);
  }
  return topics;
}

function pickTopics(all, args) {
  let ids;
  if (args.includes('--all')) ids = [...all.keys()];
  else if (args.length > 0) ids = args;
  else ids = DEFAULT_TOPICS;

  return ids.map((id) => {
    const topic = all.get(id);
    if (!topic) fail(`unknown topic "${id}". Available: ${[...all.keys()].join(', ')}`);
    topic.questions.forEach((q) => {
      OPTION_KEYS.forEach((key) => {
        if (typeof q.options?.[key] !== 'string' || q.options[key].trim() === '') {
          fail(`${id} question ${q.id}: option ${key} is missing`);
        }
      });
      if (!OPTION_KEYS.includes(q.correctAnswer)) fail(`${id} question ${q.id}: invalid correctAnswer`);
    });
    return {
      id: topic.id,
      title: topic.title,
      questions: topic.questions.map((q) => ({
        text: q.text,
        options: OPTION_KEYS.map((key) => q.options[key]),
        correctIndex: OPTION_KEYS.indexOf(q.correctAnswer),
      })),
    };
  });
}

function buildScript(topics) {
  const total = topics.reduce((sum, t) => sum + t.questions.length, 0);
  return `/**
 * GENERATED FILE - do not edit the questions by hand.
 * Regenerate with: node scripts/generate-google-forms.mjs
 *
 * Creates one Google Forms quiz per topic (${topics.length} forms, ${total} questions in total)
 * in the Google account that runs it.
 *
 * HOW TO USE
 * 1. Open https://script.google.com and create a new project.
 * 2. Replace the default code with this whole file and save.
 * 3. Pick the function "createAllForms" in the toolbar and press Run.
 * 4. Authorize the permissions the first time (it only needs to create Forms).
 * 5. Open View > Logs (or Execution log): it prints the edit and share link of
 *    every Form created. The Forms are saved in your Google Drive.
 *
 * Running it again creates NEW copies of the Forms (it never edits old ones).
 */

// Required format for the participant alias. The default matches
// "<10-digit student ID>_<alias>", for example 0000298552_Shadow.
// Set it to '' to accept any alias (other universities or companies).
var ALIAS_PATTERN = '^\\\\d{10}_.+$';
var ALIAS_HELP = 'Write your student ID, an underscore and your alias. Example: 0000298552_Shadow';

var POINTS_PER_QUESTION = 1;

var TOPICS = ${JSON.stringify(topics, null, 2)};

function createAllForms() {
  var links = TOPICS.map(createTopicForm_);
  Logger.log('Created ' + links.length + ' form(s):\\n' + links.join('\\n'));
}

function createTopicForm_(topic) {
  var form = FormApp.create(topic.title + ' - Quiz');
  form.setIsQuiz(true);
  form.setDescription('Quiz: ' + topic.title + '. Choose one answer per question.');
  form.setProgressBar(true);
  form.setShowLinkToRespondAgain(false);
  form.setConfirmationMessage('Thanks! Your answers were recorded.');

  var aliasItem = form.addTextItem();
  aliasItem.setTitle('Your alias (student ID + _ + alias)');
  aliasItem.setHelpText(ALIAS_HELP);
  aliasItem.setRequired(true);
  if (ALIAS_PATTERN) {
    aliasItem.setValidation(
      FormApp.createTextValidation()
        .setHelpText(ALIAS_HELP)
        .requireTextMatchesPattern(ALIAS_PATTERN)
        .build()
    );
  }

  topic.questions.forEach(function (question) {
    var item = form.addMultipleChoiceItem();
    item.setTitle(question.text);
    item.setPoints(POINTS_PER_QUESTION);
    item.setRequired(true);
    item.setChoices(
      question.options.map(function (text, index) {
        return item.createChoice(text, index === question.correctIndex);
      })
    );
  });

  return topic.title + ' (' + topic.questions.length + ' questions)\\n  edit:  ' +
    form.getEditUrl() + '\\n  share: ' + form.getPublishedUrl();
}
`;
}

function main() {
  const all = loadTopics();
  const topics = pickTopics(all, process.argv.slice(2));
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_PATH, buildScript(topics));
  const total = topics.reduce((sum, t) => sum + t.questions.length, 0);
  console.log(`Generated google-forms/create-forms.gs: ${topics.length} form(s), ${total} question(s):`);
  topics.forEach((t) => console.log(`  ${t.id}: ${t.questions.length}`));
}

main();
