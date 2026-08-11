# Interactive Avatar Board

Juego de preguntas en vivo tipo "carrera de avatares": el docente hostea una sala, los estudiantes se conectan desde su celular o compu y compiten para responder más rápido. Funciona 100% P2P vía PeerJS, sin backend propio — se juega directo desde el navegador.

**Link en vivo**: https://haroldsthid.github.io/interactive-avatar-board/

## Instrucciones para el docente (host)

1. Abrí el link.
2. Click en **"Start Hosting"**.
3. Compartí el **Room ID** que se genera (decilo en voz alta o proyectalo) para que los estudiantes lo usen al unirse.
4. Opcional: click en **"Simulator: On"** para armar una demo/prueba rápida con estudiantes simulados, sin necesitar conexiones reales.
5. Click en **"Start Game"** para arrancar la primera pregunta del banco.
6. Click en **"Next Question"** para avanzar a la siguiente pregunta.
7. Click en **"Reset"** para reiniciar toda la sesión (vuelve al banco de preguntas desde el principio).

## Instrucciones para el estudiante

1. Abrí el mismo link, desde tu propio dispositivo.
2. Andá a **"Join a Board"**.
3. Pegá el **Room ID** que te pasó el docente.
4. Poné tu nombre o ID de estudiante.
5. Elegí un avatar de la lista **o** subí tu propia foto en JPG (opcional, hasta ~300KB).
6. Click en **"Join Board"**.
7. Esperá a que el docente arranque la pregunta.
8. Tocá A, B, C o D antes que el resto — la velocidad de respuesta define el ranking.

## Cómo editar el banco de preguntas

Las preguntas viven en `questions.js`, en un array llamado `QUESTIONS`. El docente puede editarlo a mano para adaptarlo a su clase, sin tocar `app.js`. Cada pregunta tiene esta forma:

```js
{
  id: 1,
  text: "¿Cuál es la capital de Francia?",
  options: { A: "Madrid", B: "París", C: "Roma", D: "Berlín" },
  correctAnswer: "B",
}
```

El juego recorre el array en orden (y vuelve al principio si se acaban) cada vez que arranca una nueva ronda. También se puede sobrescribir manualmente la "Correct Answer" desde el panel del docente después de arrancar la pregunta, si hace falta.

## Limitaciones conocidas

- Depende del servidor de señalización público de PeerJS (puede fallar o tener latencia si ese servicio tiene problemas).
- Si un estudiante real se une **después** de activar el simulador, el simulador no genera estudiantes mock nuevos (no se mezclan automáticamente).
- No hay manejo robusto de desconexión: si un estudiante pierde la conexión, su avatar no se limpia ni se marca automáticamente.
