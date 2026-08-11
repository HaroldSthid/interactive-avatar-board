'use strict';

/**
 * Interactive Avatar Board — questions-public.js
 * Pre-configured question bank (PUBLIC part). Loaded before app.js (see
 * index.html) into EVERY visitor's browser (host and students alike).
 *
 * This file intentionally does NOT contain `correctAnswer` — that field
 * lives in the separate `answers.json` file, which is fetched only by the
 * host's code path, only once hosting actually starts (see initHostPeer()
 * in app.js). See README.md for why this is split and what it does/doesn't
 * protect against.
 *
 * Edit this array to adapt the demo to your own class: each item needs an
 * `id`, a `text` (the question shown to students), and an `options` object
 * with A/B/C/D answer text. The `id` here MUST match the `id` key you use
 * in answers.json for the same question.
 * app.js cycles through QUESTIONS_PUBLIC in order (wrapping back to the
 * start) each time the host starts a new round — no other code changes are
 * required.
 */
const QUESTIONS_PUBLIC = [
  {
    id: 1,
    text: '¿Cuál es la capital de Francia?',
    options: { A: 'Madrid', B: 'París', C: 'Roma', D: 'Berlín' },
  },
  {
    id: 2,
    text: '¿Cuánto es 7 x 8?',
    options: { A: '54', B: '48', C: '56', D: '64' },
  },
  {
    id: 3,
    text: '¿Cuál es el planeta más cercano al Sol?',
    options: { A: 'Venus', B: 'Tierra', C: 'Marte', D: 'Mercurio' },
  },
  {
    id: 4,
    text: '¿En qué año se declaró la independencia de Argentina?',
    options: { A: '1810', B: '1816', C: '1853', D: '1880' },
  },
  {
    id: 5,
    text: '¿Cuál es el río más largo del mundo?',
    options: { A: 'Nilo', B: 'Amazonas', C: 'Paraná', D: 'Misisipi' },
  },
  {
    id: 6,
    text: '¿Qué gas respiramos principalmente para vivir?',
    options: { A: 'Dióxido de carbono', B: 'Nitrógeno', C: 'Oxígeno', D: 'Hidrógeno' },
  },
  {
    id: 7,
    text: '¿Cuál es el resultado de la raíz cuadrada de 81?',
    options: { A: '7', B: '8', C: '9', D: '10' },
  },
  {
    id: 8,
    text: '¿Quién pintó la Mona Lisa?',
    options: { A: 'Pablo Picasso', B: 'Leonardo da Vinci', C: 'Vincent van Gogh', D: 'Miguel Ángel' },
  },
];
