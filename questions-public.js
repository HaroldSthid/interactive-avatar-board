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
    text: '¿Cuál es la función principal de HTML en un sitio web?',
    options: { A: 'Animaciones y efectos visuales.', B: 'Pagos y bases de datos.', C: 'Estructura y esqueleto del sitio.', D: 'Subir archivos a la nube.' },
  },
  {
    id: 2,
    text: '¿Qué lenguaje usas para modificar colores, fuentes y espacios visuales?',
    options: { A: 'CSS', B: 'Python', C: 'HTML', D: 'JavaScript' },
  },
  {
    id: 3,
    text: '¿Qué aporta JavaScript (JS) a una aplicación web?',
    options: { A: 'Guardar fotos en el servidor.', B: 'Interactividad y comportamiento dinámico.', C: 'Formato de texto simple.', D: 'Reemplazar a HTML y CSS.' },
  },
  {
    id: 4,
    text: 'En "Onepage", ¿por qué subir el screenshot y la bitácora de prompts?',
    options: { A: 'Demostrar memorización del código.', B: 'Evitar subir archivos a GitHub.', C: 'Ocultar errores de la prueba.', D: 'Dejar evidencia visible del aprendizaje.' },
  },
  {
    id: 5,
    text: '¿Ventaja práctica de usar Google Colab en lugar de programas pesados?',
    options: { A: 'Reproducir música en streaming.', B: 'Correr Python en la nube desde el navegador.', C: 'Procesar únicamente cartas de texto.', D: 'Crear animaciones 3D.' },
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
  {
    id: 9,
    text: '¿Cuál es el océano más grande del mundo?',
    options: { A: 'Atlántico', B: 'Índico', C: 'Pacífico', D: 'Ártico' },
  },
  {
    id: 10,
    text: '¿Cuánto es 12 x 6?',
    options: { A: '66', B: '72', C: '78', D: '84' },
  },
  {
    id: 11,
    text: '¿Quién escribió "Don Quijote de la Mancha"?',
    options: { A: 'Miguel de Cervantes', B: 'Gabriel García Márquez', C: 'Jorge Luis Borges', D: 'Pablo Neruda' },
  },
  {
    id: 12,
    text: '¿Cuál es el hueso más largo del cuerpo humano?',
    options: { A: 'Húmero', B: 'Fémur', C: 'Tibia', D: 'Radio' },
  },
  {
    id: 13,
    text: '¿En qué continente está Egipto?',
    options: { A: 'Asia', B: 'Europa', C: 'África', D: 'Oceanía' },
  },
  {
    id: 14,
    text: '¿Cuál es el resultado de 15 - 7?',
    options: { A: '6', B: '7', C: '8', D: '9' },
  },
  {
    id: 15,
    text: '¿Cuál es la moneda oficial de Japón?',
    options: { A: 'Yuan', B: 'Won', C: 'Yen', D: 'Ringgit' },
  },
  {
    id: 16,
    text: '¿Qué planeta es conocido como el planeta rojo?',
    options: { A: 'Venus', B: 'Marte', C: 'Júpiter', D: 'Saturno' },
  },
  {
    id: 17,
    text: '¿Cuántos lados tiene un hexágono?',
    options: { A: '5', B: '6', C: '7', D: '8' },
  },
  {
    id: 18,
    text: '¿Quién fue el primer presidente de Argentina?',
    options: { A: 'Bernardino Rivadavia', B: 'Domingo Sarmiento', C: 'Julio A. Roca', D: 'Justo José de Urquiza' },
  },
  {
    id: 19,
    text: '¿Cuál es el metal líquido a temperatura ambiente?',
    options: { A: 'Hierro', B: 'Mercurio', C: 'Aluminio', D: 'Plomo' },
  },
  {
    id: 20,
    text: '¿Cuánto es la mitad de 90?',
    options: { A: '40', B: '45', C: '35', D: '50' },
  },
];
