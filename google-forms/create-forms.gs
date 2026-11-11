/**
 * GENERATED FILE - do not edit the questions by hand.
 * Regenerate with: node scripts/generate-google-forms.mjs
 *
 * Creates one Google Forms quiz per topic (3 forms, 49 questions in total)
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
var ALIAS_PATTERN = '^\\d{10}_.+$';
var ALIAS_HELP = 'Write your student ID, an underscore and your alias. Example: 0000298552_Shadow';

var POINTS_PER_QUESTION = 1;

var TOPICS = [
  {
    "id": "scrum",
    "title": "SCRUM",
    "questions": [
      {
        "text": "¿Qué reunión sirve para planificar el trabajo del Sprint?",
        "options": [
          "Daily Scrum",
          "Sprint Planning",
          "Sprint Review",
          "Sprint Retrospective"
        ],
        "correctIndex": 1
      },
      {
        "text": "¿En qué reunión se muestra el Incremento a los interesados?",
        "options": [
          "Sprint Planning",
          "Daily Scrum",
          "Sprint Retrospective",
          "Sprint Review"
        ],
        "correctIndex": 3
      },
      {
        "text": "¿Cuánto dura un Sprint como máximo?",
        "options": [
          "Un mes",
          "Dos meses",
          "Tres meses",
          "Seis meses"
        ],
        "correctIndex": 0
      },
      {
        "text": "¿Cuánto dura como máximo el Daily Scrum?",
        "options": [
          "5 minutos",
          "10 minutos",
          "15 minutos",
          "30 minutos"
        ],
        "correctIndex": 2
      },
      {
        "text": "¿En qué reunión el equipo revisa cómo trabajó y planea mejoras?",
        "options": [
          "Daily Scrum",
          "Sprint Review",
          "Sprint Retrospective",
          "Sprint Planning"
        ],
        "correctIndex": 2
      },
      {
        "text": "¿En qué reunión los Developers ajustan su plan para lograr el Sprint Goal?",
        "options": [
          "Daily Scrum",
          "Sprint Planning",
          "Sprint Review",
          "Sprint Retrospective"
        ],
        "correctIndex": 0
      },
      {
        "text": "¿Qué es el Sprint?",
        "options": [
          "Una reunión para planificar el trabajo del equipo",
          "Una lista ordenada de todo lo que necesita el producto",
          "Una reunión para revisar cómo trabajó el equipo",
          "Un período de trabajo de un mes o menos de duración"
        ],
        "correctIndex": 3
      },
      {
        "text": "¿Qué es el Sprint Backlog?",
        "options": [
          "La lista ordenada de todo lo que necesita el producto",
          "Los elementos elegidos para el Sprint y su plan de trabajo",
          "El resultado terminado y usable del trabajo del Sprint",
          "La descripción de cuándo un trabajo se considera terminado"
        ],
        "correctIndex": 1
      },
      {
        "text": "¿Qué es el Sprint Goal?",
        "options": [
          "La lista ordenada de todo lo que necesita el producto",
          "El resultado terminado y usable del trabajo del Sprint",
          "La meta de largo plazo que busca lograr todo el producto",
          "El objetivo único que se busca lograr en el Sprint"
        ],
        "correctIndex": 3
      },
      {
        "text": "¿Cómo se llama la lista ordenada de todo lo que necesita el producto?",
        "options": [
          "Sprint Backlog",
          "Product Backlog",
          "Product Goal",
          "Definition of Done"
        ],
        "correctIndex": 1
      },
      {
        "text": "¿Qué es el Incremento?",
        "options": [
          "El plan de trabajo que el equipo arma para el Sprint",
          "La descripción de cuándo un trabajo se considera terminado",
          "El resultado terminado y usable del trabajo del Sprint",
          "La lista ordenada de todo lo que necesita el producto"
        ],
        "correctIndex": 2
      },
      {
        "text": "¿Quién es responsable de ordenar el Product Backlog?",
        "options": [
          "El Product Owner",
          "El Scrum Master",
          "Los Developers",
          "Los interesados del producto"
        ],
        "correctIndex": 0
      },
      {
        "text": "¿Qué rol ayuda al equipo a entender y aplicar Scrum?",
        "options": [
          "El Scrum Master",
          "El Product Owner",
          "Los Developers",
          "Los interesados del producto"
        ],
        "correctIndex": 0
      },
      {
        "text": "¿Quiénes crean el Incremento durante el Sprint?",
        "options": [
          "El Scrum Master",
          "Los interesados del producto",
          "Los Developers",
          "El Product Owner"
        ],
        "correctIndex": 2
      },
      {
        "text": "¿Qué se define en la Sprint Planning?",
        "options": [
          "Cómo mejorar la forma de trabajar del equipo",
          "Qué trabajo hacer en el Sprint y cómo hacerlo",
          "Qué se logró y qué cambia en el Product Backlog",
          "Qué hizo cada Developer desde el día anterior"
        ],
        "correctIndex": 1
      },
      {
        "text": "¿Para qué sirve la Sprint Retrospective?",
        "options": [
          "Para mostrar el Incremento a los interesados",
          "Para decidir qué trabajo entra en el Sprint",
          "Para ajustar el plan de trabajo de cada día",
          "Para mejorar la forma de trabajar del equipo"
        ],
        "correctIndex": 3
      }
    ]
  },
  {
    "id": "programacion",
    "title": "Fundamentos de programación",
    "questions": [
      {
        "text": "¿Qué hace HTML en una página web?",
        "options": [
          "Define los colores, las letras y el diseño visual",
          "Hace que la página reaccione cuando alguien hace clic",
          "Define la estructura y el contenido de la página",
          "Guarda en un lugar seguro todos los datos de los usuarios"
        ],
        "correctIndex": 2
      },
      {
        "text": "¿Qué hace CSS en una página web?",
        "options": [
          "Define el aspecto visual: colores, letras y posición",
          "Define la estructura y el contenido de la página",
          "Hace que la página reaccione cuando alguien hace clic",
          "Guarda en un lugar seguro todos los datos de los usuarios"
        ],
        "correctIndex": 0
      },
      {
        "text": "¿Qué hace JavaScript en una página web?",
        "options": [
          "Define la estructura y el contenido de la página",
          "Define el aspecto visual: colores, letras y posición",
          "Guarda en un lugar seguro todos los datos de los usuarios",
          "Agrega interactividad: la página responde al usuario"
        ],
        "correctIndex": 3
      },
      {
        "text": "¿Qué es un navegador web?",
        "options": [
          "Una computadora que guarda y envía páginas a otras",
          "Un programa que se usa para abrir y ver páginas web",
          "Un lugar donde se guardan todos los datos de una empresa",
          "Un lenguaje con reglas para dar instrucciones"
        ],
        "correctIndex": 1
      },
      {
        "text": "¿Qué es un servidor?",
        "options": [
          "Un programa que se usa para abrir y ver páginas web",
          "Una computadora que guarda y envía información a otras",
          "Un conjunto ordenado de pasos para resolver un problema",
          "Un lenguaje con reglas para dar instrucciones"
        ],
        "correctIndex": 1
      },
      {
        "text": "¿Qué es el frontend de una aplicación?",
        "options": [
          "La parte que trabaja detrás, procesando datos",
          "El texto con las instrucciones del programa",
          "Una lista de pasos ordenados para resolver un problema",
          "La parte que ve y usa la persona en su pantalla"
        ],
        "correctIndex": 3
      },
      {
        "text": "¿Qué es el backend de una aplicación?",
        "options": [
          "La parte que trabaja detrás, procesando y guardando datos",
          "La parte que la persona ve y usa en su pantalla",
          "El programa con el que se abren las páginas web de internet",
          "Un conjunto ordenado de pasos para resolver un problema"
        ],
        "correctIndex": 0
      },
      {
        "text": "¿Para qué sirve una base de datos?",
        "options": [
          "Para definir los colores y el diseño de una página web",
          "Para abrir y mostrar páginas web en una pantalla",
          "Para guardar información ordenada y poder consultarla",
          "Para escribir las instrucciones que sigue un programa"
        ],
        "correctIndex": 2
      },
      {
        "text": "¿Qué es un algoritmo?",
        "options": [
          "Una lista de pasos ordenados para resolver un problema",
          "Un error que hace que el programa funcione mal",
          "Un espacio con nombre donde se guarda un valor",
          "Un lugar donde se guardan todos los datos de una empresa"
        ],
        "correctIndex": 0
      },
      {
        "text": "¿Qué es una variable en programación?",
        "options": [
          "Una lista de pasos ordenados para resolver un problema",
          "Un error que hace que el programa funcione mal",
          "Un espacio con nombre donde se guarda un dato cambiante",
          "El texto con las instrucciones que escribe quien programa"
        ],
        "correctIndex": 2
      },
      {
        "text": "¿Qué es un lenguaje de programación?",
        "options": [
          "Un programa que se usa para abrir y ver páginas web",
          "Una computadora que guarda y envía información a otras",
          "Una lista de pasos ordenados para resolver un problema",
          "Un conjunto de reglas para darle órdenes a una computadora"
        ],
        "correctIndex": 3
      },
      {
        "text": "¿Qué es un bug?",
        "options": [
          "Una lista de pasos ordenados para resolver un problema",
          "Un error en el código que hace fallar al programa",
          "Un espacio con nombre donde se guarda un dato cambiante",
          "Un programa que se usa para abrir y ver páginas web"
        ],
        "correctIndex": 1
      },
      {
        "text": "Quieres cambiar el color de los títulos de una página. ¿Qué usas?",
        "options": [
          "HTML",
          "JavaScript",
          "Un servidor",
          "CSS"
        ],
        "correctIndex": 3
      },
      {
        "text": "Quieres agregar un párrafo nuevo con texto a una página. ¿Qué usas?",
        "options": [
          "HTML",
          "CSS",
          "JavaScript",
          "Un navegador"
        ],
        "correctIndex": 0
      },
      {
        "text": "Quieres que aparezca un mensaje cuando alguien toca un botón. ¿Qué usas?",
        "options": [
          "HTML",
          "CSS",
          "JavaScript",
          "Un servidor"
        ],
        "correctIndex": 2
      },
      {
        "text": "Quieres cambiar el tipo y el tamaño de las letras de una página. ¿Qué usas?",
        "options": [
          "JavaScript",
          "CSS",
          "HTML",
          "Un navegador"
        ],
        "correctIndex": 1
      },
      {
        "text": "Quieres crear los títulos y las listas con el contenido de una página. ¿Qué usas?",
        "options": [
          "CSS",
          "JavaScript",
          "Un servidor",
          "HTML"
        ],
        "correctIndex": 3
      },
      {
        "text": "Quieres que la página muestre un reloj que cambia cada segundo. ¿Qué usas?",
        "options": [
          "JavaScript",
          "HTML",
          "CSS",
          "Un navegador"
        ],
        "correctIndex": 0
      }
    ]
  },
  {
    "id": "herramientas",
    "title": "Herramientas (CodePen, Colab y GitHub)",
    "questions": [
      {
        "text": "¿Qué es CodePen?",
        "options": [
          "Un programa para escribir documentos y presentaciones de texto",
          "Un lugar para guardar proyectos y ver el historial de cambios",
          "Un sitio para escribir HTML, CSS y JS y ver el resultado",
          "Un entorno para escribir y ejecutar código de Python por celdas"
        ],
        "correctIndex": 2
      },
      {
        "text": "Copiaste reglas de CSS (colores y letras) de un ejemplo. ¿En qué panel de CodePen las pegas?",
        "options": [
          "HTML",
          "CSS",
          "JS",
          "El panel del resultado"
        ],
        "correctIndex": 1
      },
      {
        "text": "Copiaste código que hace que un botón responda al hacer clic. ¿En qué panel de CodePen lo pegas?",
        "options": [
          "HTML",
          "CSS",
          "El panel del resultado",
          "JS"
        ],
        "correctIndex": 3
      },
      {
        "text": "Pegaste solo reglas de CSS dentro del panel de HTML. ¿Qué suele pasar?",
        "options": [
          "Se muestran como texto y los colores no cambian",
          "Los colores cambian igual que si estuvieran en CSS",
          "CodePen las mueve solo al panel correcto",
          "Se borra todo el proyecto guardado"
        ],
        "correctIndex": 0
      },
      {
        "text": "En CodePen cambias un color, miras el resultado y ajustas otra vez. ¿Cómo se llama este ciclo?",
        "options": [
          "Clonar el proyecto a otra cuenta",
          "Iterar: probar, mirar y ajustar",
          "Ejecutar un script de Python completo",
          "Crear un repositorio nuevo en la nube"
        ],
        "correctIndex": 1
      },
      {
        "text": "¿Qué conviene saber antes de pegar código copiado en CodePen?",
        "options": [
          "Que funciona igual en cualquier panel",
          "Que CodePen lo corrige solo si está mal ubicado",
          "Qué hace y en qué panel debe ir",
          "Que el resultado siempre se verá bien"
        ],
        "correctIndex": 2
      },
      {
        "text": "¿Qué es Google Colab?",
        "options": [
          "Un entorno en el navegador para ejecutar Python por celdas",
          "Un sitio para armar páginas web y ver el resultado al instante",
          "Un lugar para guardar proyectos y ver su historial de cambios",
          "Un programa para editar fotos y videos en la computadora"
        ],
        "correctIndex": 0
      },
      {
        "text": "¿Qué es un script de Python?",
        "options": [
          "Una página web con su estructura y su diseño",
          "Un error que detiene el funcionamiento del programa",
          "Una copia de un proyecto que pertenece a otra persona",
          "Un conjunto de instrucciones escritas en Python"
        ],
        "correctIndex": 3
      },
      {
        "text": "En Colab, ¿cómo se ejecuta el código de una celda?",
        "options": [
          "Guardando el archivo en el navegador",
          "Con el botón de reproducir de esa celda",
          "Subiéndolo antes a un repositorio",
          "Esperando que Colab lo ejecute solo al escribirlo"
        ],
        "correctIndex": 1
      },
      {
        "text": "Cuando ejecutas código en Colab, ¿dónde se ejecuta realmente?",
        "options": [
          "En tu propia computadora o en tu celular",
          "En el repositorio de GitHub donde lo subiste",
          "En computadoras de Google, en la nube",
          "En el panel de resultado de CodePen"
        ],
        "correctIndex": 2
      },
      {
        "text": "¿Qué es GitHub?",
        "options": [
          "Un sitio para guardar proyectos de código y su historial",
          "Un sitio para escribir HTML, CSS y JS y ver el resultado al instante",
          "Un entorno para ejecutar código Python por celdas en el navegador",
          "Un lenguaje de programación para crear páginas web"
        ],
        "correctIndex": 0
      },
      {
        "text": "¿Qué es un repositorio en GitHub?",
        "options": [
          "Una celda de Colab donde se escribe y ejecuta Python",
          "Un panel de CodePen donde se pega código",
          "Un error que aparece al subir un archivo a la nube",
          "La carpeta de un proyecto con sus archivos"
        ],
        "correctIndex": 3
      },
      {
        "text": "¿Para qué se crea un repositorio al subir un ejercicio?",
        "options": [
          "Para que el ejercicio se ejecute solo en la nube",
          "Para convertir el código de Python en una página HTML",
          "Para guardarlo, compartirlo y conservar sus versiones",
          "Porque Colab no funciona si no existe uno en GitHub"
        ],
        "correctIndex": 2
      },
      {
        "text": "Ves un repositorio de otra persona en GitHub. ¿Qué puedes hacer normalmente?",
        "options": [
          "Cambiar sus archivos directamente aunque no seas el dueño",
          "Verlo y copiarlo a tu cuenta, sin cambiar el original",
          "Borrarlo para que no lo vea nadie más en GitHub",
          "Hacerlo tuyo sin necesidad de copiarlo antes"
        ],
        "correctIndex": 1
      },
      {
        "text": "¿Qué significa hacer un fork de un repositorio?",
        "options": [
          "Copiarlo a tu cuenta para trabajar en tu propia versión",
          "Borrar el original y quedarte solo con tu propia versión",
          "Ejecutar su código en la nube de Google Colab",
          "Cambiar el original sin pedir permiso al dueño"
        ],
        "correctIndex": 0
      }
    ]
  }
];

function createAllForms() {
  var links = TOPICS.map(createTopicForm_);
  Logger.log('Created ' + links.length + ' form(s):\n' + links.join('\n'));
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

  return topic.title + ' (' + topic.questions.length + ' questions)\n  edit:  ' +
    form.getEditUrl() + '\n  share: ' + form.getPublishedUrl();
}
