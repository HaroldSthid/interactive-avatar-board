'use strict';

/**
 * Interactive Avatar Board — questions.js
 * Pre-configured question bank. Loaded before app.js (see index.html).
 *
 * Edit this array to adapt the demo to your own class: each item needs an
 * `id`, a `text` (the question shown to students), an `options` object with
 * A/B/C/D answer text, and a `correctAnswer` (one of "A", "B", "C", "D").
 * app.js cycles through QUESTIONS in order (wrapping back to the start) each
 * time the host starts a new round — no other code changes are required.
 */
const QUESTIONS = [
  {
    id: 1,
    text: '¿Cuál es la capital de Francia?',
    options: { A: 'Madrid', B: 'París', C: 'Roma', D: 'Berlín' },
    correctAnswer: 'B',
  },
  {
    id: 2,
    text: '¿Cuánto es 7 x 8?',
    options: { A: '54', B: '48', C: '56', D: '64' },
    correctAnswer: 'C',
  },
  {
    id: 3,
    text: '¿Cuál es el planeta más cercano al Sol?',
    options: { A: 'Venus', B: 'Tierra', C: 'Marte', D: 'Mercurio' },
    correctAnswer: 'D',
  },
  {
    id: 4,
    text: '¿En qué año se declaró la independencia de Argentina?',
    options: { A: '1810', B: '1816', C: '1853', D: '1880' },
    correctAnswer: 'B',
  },
  {
    id: 5,
    text: '¿Cuál es el río más largo del mundo?',
    options: { A: 'Nilo', B: 'Amazonas', C: 'Paraná', D: 'Misisipi' },
    correctAnswer: 'B',
  },
  {
    id: 6,
    text: '¿Qué gas respiramos principalmente para vivir?',
    options: { A: 'Dióxido de carbono', B: 'Nitrógeno', C: 'Oxígeno', D: 'Hidrógeno' },
    correctAnswer: 'C',
  },
  {
    id: 7,
    text: '¿Cuál es el resultado de la raíz cuadrada de 81?',
    options: { A: '7', B: '8', C: '9', D: '10' },
    correctAnswer: 'C',
  },
  {
    id: 8,
    text: '¿Quién pintó la Mona Lisa?',
    options: { A: 'Pablo Picasso', B: 'Leonardo da Vinci', C: 'Vincent van Gogh', D: 'Miguel Ángel' },
    correctAnswer: 'B',
  },
];
