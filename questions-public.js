'use strict';

/**
 * Interactive Avatar Board — questions-public.js
 * GENERATED FILE — do not edit by hand. Edit questions-source.json and run
 * `node scripts/generate-questions.mjs` instead (see README.md).
 *
 * Pre-configured question bank (PUBLIC part). Loaded before app.js (see
 * index.html) into EVERY visitor's browser (host and students alike).
 *
 * This file intentionally does NOT contain `correctAnswer` — that field
 * lives in the separate `answers.json` file, which is fetched only by the
 * host's code path, only once hosting actually starts (see initHostPeer()
 * in app.js). See README.md for why this is split and what it does/doesn't
 * protect against.
 */
const QUESTIONS_PUBLIC = [
  {
    id: 1,
    text: '¿Cuál es la función principal de HTML en un sitio web?',
    options: { A: 'Animaciones y efectos visuales.', B: 'Pagos y bases de datos.', C: 'Estructura y esqueleto del sitio.', D: 'Subir archivos a la nube.' },
  },
  {
    id: 2,
    text: '¿Qué aporta JavaScript (JS) a una aplicación web?',
    options: { A: 'Guardar fotos en el servidor.', B: 'Interactividad y comportamiento dinámico.', C: 'Formato de texto simple.', D: 'Reemplazar a HTML y CSS.' },
  },
  {
    id: 3,
    text: '¿Qué es SCRUM?',
    options: { A: 'Un lenguaje de programación.', B: 'Un marco de trabajo ágil para desarrollar productos.', C: 'Un tipo de base de datos.', D: 'Un sistema operativo.' },
  },
  {
    id: 4,
    text: '¿Cuáles son los tres roles de un equipo SCRUM?',
    options: { A: 'Product Owner, Scrum Master y Developers.', B: 'Jefe, Programador y Tester.', C: 'Cliente, Gerente y Diseñador.', D: 'Líder, Analista y Soporte.' },
  },
  {
    id: 5,
    text: 'En SCRUM, ¿qué es un Sprint?',
    options: { A: 'Una reunión diaria del equipo.', B: 'La lista de tareas del proyecto.', C: 'Un periodo fijo (máx. un mes) para crear un incremento.', D: 'El documento final del producto.' },
  },
  {
    id: 6,
    text: '¿Quién gestiona el Product Backlog y maximiza el valor del producto?',
    options: { A: 'El Scrum Master', B: 'Los Developers', C: 'El cliente', D: 'El Product Owner' },
  },
  {
    id: 7,
    text: '¿Cuánto dura como máximo la Daily Scrum?',
    options: { A: '15 minutos', B: '30 minutos', C: '1 hora', D: '4 horas' },
  },
  {
    id: 8,
    text: '¿Cuál es la función principal del Scrum Master?',
    options: { A: 'Escribir todo el código.', B: 'Decidir qué se construye.', C: 'Guiar al equipo en SCRUM y remover impedimentos.', D: 'Aprobar el presupuesto.' },
  },
  {
    id: 9,
    text: '¿Qué es el Product Backlog?',
    options: { A: 'Un informe de errores.', B: 'El calendario de reuniones.', C: 'El código fuente del proyecto.', D: 'Una lista ordenada de lo necesario para mejorar el producto.' },
  },
  {
    id: 10,
    text: '¿En qué evento el equipo reflexiona sobre cómo mejorar su forma de trabajar?',
    options: { A: 'Sprint Planning', B: 'Sprint Retrospective', C: 'Daily Scrum', D: 'Sprint Review' },
  },
  {
    id: 11,
    text: '¿Qué gas respiramos principalmente para vivir?',
    options: { A: 'Dióxido de carbono', B: 'Nitrógeno', C: 'Oxígeno', D: 'Hidrógeno' },
  },
  {
    id: 12,
    text: '¿Cuál es el resultado de la raíz cuadrada de 81?',
    options: { A: '7', B: '8', C: '9', D: '10' },
  },
  {
    id: 13,
    text: '¿Quién pintó la Mona Lisa?',
    options: { A: 'Pablo Picasso', B: 'Leonardo da Vinci', C: 'Vincent van Gogh', D: 'Miguel Ángel' },
  },
  {
    id: 14,
    text: '¿Cuál es el océano más grande del mundo?',
    options: { A: 'Atlántico', B: 'Índico', C: 'Pacífico', D: 'Ártico' },
  },
  {
    id: 15,
    text: '¿Cuánto es 12 x 6?',
    options: { A: '66', B: '72', C: '78', D: '84' },
  },
  {
    id: 16,
    text: '¿Quién escribió "Don Quijote de la Mancha"?',
    options: { A: 'Miguel de Cervantes', B: 'Gabriel García Márquez', C: 'Jorge Luis Borges', D: 'Pablo Neruda' },
  },
  {
    id: 17,
    text: '¿Cuál es el hueso más largo del cuerpo humano?',
    options: { A: 'Húmero', B: 'Fémur', C: 'Tibia', D: 'Radio' },
  },
  {
    id: 18,
    text: '¿En qué continente está Egipto?',
    options: { A: 'Asia', B: 'Europa', C: 'África', D: 'Oceanía' },
  },
  {
    id: 19,
    text: '¿Cuál es el resultado de 15 - 7?',
    options: { A: '6', B: '7', C: '8', D: '9' },
  },
  {
    id: 20,
    text: '¿Cuál es la moneda oficial de Japón?',
    options: { A: 'Yuan', B: 'Won', C: 'Yen', D: 'Ringgit' },
  },
  {
    id: 21,
    text: '¿Qué planeta es conocido como el planeta rojo?',
    options: { A: 'Venus', B: 'Marte', C: 'Júpiter', D: 'Saturno' },
  },
  {
    id: 22,
    text: '¿Cuántos lados tiene un hexágono?',
    options: { A: '5', B: '6', C: '7', D: '8' },
  },
  {
    id: 23,
    text: '¿Quién fue el primer presidente de Argentina?',
    options: { A: 'Bernardino Rivadavia', B: 'Domingo Sarmiento', C: 'Julio A. Roca', D: 'Justo José de Urquiza' },
  },
  {
    id: 24,
    text: '¿Cuál es el metal líquido a temperatura ambiente?',
    options: { A: 'Hierro', B: 'Mercurio', C: 'Aluminio', D: 'Plomo' },
  },
  {
    id: 25,
    text: '¿Cuánto es la mitad de 90?',
    options: { A: '40', B: '45', C: '35', D: '50' },
  },
];
