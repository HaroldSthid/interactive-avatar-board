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
5. Elegí un avatar de la lista **o** subí tu propia foto en JPG (opcional). Cualquier foto real sacada con el celular sirve — se achica y comprime automáticamente en el navegador antes de enviarse, así que no hay que preocuparse por el tamaño del archivo original.
6. Click en **"Join Board"**.
7. Esperá a que el docente arranque la pregunta.
8. Tocá A, B, C o D antes que el resto — la velocidad de respuesta define el ranking.

## Cómo editar el banco de preguntas

Las preguntas están divididas en **dos archivos** que hay que editar juntos:

- **`questions-public.js`** — array `QUESTIONS_PUBLIC`, con el `id`, el `text` (enunciado) y las `options` (A/B/C/D) de cada pregunta. Este archivo se carga en el navegador de **todos** — docente y estudiantes — apenas se abre la app.
- **`answers.json`** — objeto plano que mapea cada `id` de pregunta a su respuesta correcta, por ejemplo `{"1": "B", "2": "C", ...}`. Este archivo **no** se carga automáticamente para nadie: solo se pide (`fetch`) desde el navegador del docente, y recién en el momento en que hace click en "Start Hosting".

### ¿Por qué está separado?

Antes, `questions.js` tenía todo junto (pregunta + respuesta correcta) y se cargaba en el navegador de cada estudiante apenas abría la app — cualquiera que abriera la consola del navegador podía ver todas las respuestas correctas de antemano. Separando la respuesta correcta en `answers.json`, y pidiéndola solo desde el código del docente, evitamos esa exposición casual/automática por defecto.

**Ojo:** esto es una mitigación, no seguridad real. Como es un sitio 100% estático sin backend, no hay forma de ocultarle un archivo a alguien que sepa pedirlo directamente por URL (por ejemplo, un estudiante técnicamente decidido podría igual entrar a `.../answers.json` a mano, o ver el archivo si tiene acceso al dispositivo que hostea). Si el docente necesita una garantía real de que las respuestas no se puedan ver, hace falta un backend — eso queda fuera del alcance de este proyecto.

### Cómo agregar o cambiar una pregunta

Hay que editar **los dos archivos**, usando el **mismo `id`** en ambos:

1. En `questions-public.js`, agregá o editá el item dentro de `QUESTIONS_PUBLIC`:

   ```js
   {
     id: 9,
     text: "¿Cuál es la capital de Francia?",
     options: { A: "Madrid", B: "París", C: "Roma", D: "Berlín" },
   }
   ```

2. En `answers.json`, agregá o editá la entrada correspondiente **con el mismo `id`** (como string, porque es una clave JSON):

   ```json
   {
     "9": "B"
   }
   ```

3. Si el `id` no coincide entre los dos archivos, esa pregunta no va a tener respuesta correcta cargada automáticamente (el dropdown "Correct Answer" del panel del docente queda vacío para esa ronda, pero se puede elegir a mano igual).

El juego arranca con **20 preguntas de ejemplo**. El orden es **aleatorio** (no repite ninguna hasta usar las 20), y recién ahí vuelve a mezclar el mazo para la siguiente vuelta — así que con una clase de 40 alumnos y varias rondas, no es tan predecible ni se repite tan rápido como con un orden fijo. Podés agregar todas las preguntas que quieras siguiendo el mismo formato, sin tocar `app.js`.

## Limitaciones conocidas

- Depende del servidor de señalización público de PeerJS (puede fallar o tener latencia si ese servicio tiene problemas). Si tenés estudiantes en redes distintas (WiFi de la escuela + datos móviles) o el WiFi tiene "aislamiento de clientes", agregamos un servidor TURN de respaldo — probá primero con pocos dispositivos antes de la clase completa.
- Si un estudiante real se une **después** de activar el simulador, el simulador no genera estudiantes mock nuevos (no se mezclan automáticamente).
- No hay manejo robusto de desconexión: si un estudiante pierde la conexión, su avatar no se limpia ni se marca automáticamente.
- La separación entre `questions-public.js` y `answers.json` es una mitigación contra exposición casual, no seguridad real (ver arriba) — no hay backend que pueda garantizar que las respuestas queden realmente ocultas.
