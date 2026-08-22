# Interactive Avatar Board

Juego de preguntas en vivo tipo "carrera de avatares": el docente hostea una sala, los estudiantes se conectan desde su celular o compu y compiten para responder más rápido. El frontend sigue siendo estático (se sirve desde GitHub Pages), pero ahora sincroniza a los jugadores a través de un servidor relay propio por WebSocket (`server/`, desplegado en Render) en vez de conexiones P2P directas.

**Link en vivo**: https://haroldsthid.github.io/interactive-avatar-board/

## Instrucciones para el docente (host)

1. Abrí el link.
2. Click en **"Start Hosting"**.
3. Compartí el **Room ID** que se genera (decilo en voz alta o proyectalo) para que los estudiantes lo usen al unirse.
4. Opcional: click en **"Simulator: On"** para armar una demo/prueba rápida con estudiantes simulados, sin necesitar conexiones reales.
5. Click en **"Start Game"** para arrancar la primera pregunta del banco. Cada pregunta tiene un **cronómetro de 20 segundos** (barra que se va vaciando, con tick-tock y alarma) — si llega a 0, la ronda termina sola, con el mismo efecto que clickear "Next Question" a mano.
6. Click en **"Next Question"** para avanzar a la siguiente pregunta (también corta el cronómetro si todavía estaba corriendo).
7. Click en **"Finalizar sesión"** en cualquier momento (excepto en LOBBY) para cerrar la sesión y mostrar el ranking final acumulado, tanto en el board como en el celular de cada estudiante.
8. Click en **"Reset"** para reiniciar toda la sesión (vuelve al banco de preguntas desde el principio y borra el puntaje acumulado), incluso después de "Finalizar sesión".

## Instrucciones para el estudiante

1. Abrí el mismo link, desde tu propio dispositivo.
2. Andá a **"Join a Board"**.
3. Pegá el **Room ID** que te pasó el docente.
4. Poné tu nombre o ID de estudiante.
5. Elegí uno de los 4 avatares pixel-art (diseños originales tipo héroe tech, ver previsualización al lado del selector) **o** subí tu propia foto en JPG (opcional, tiene prioridad sobre el avatar elegido si la subís). Cualquier foto real sacada con el celular sirve — se achica y comprime automáticamente en el navegador antes de enviarse, así que no hay que preocuparse por el tamaño del archivo original.
6. Click en **"Join Board"**.
7. Esperá a que el docente arranque la pregunta.
8. Tocá A, B, C o D antes que el resto — la velocidad de respuesta define el ranking.

## Puntaje acumulado y ranking final

Además del ranking de velocidad de cada ronda (que se muestra y se descarta en cada vuelta), el juego lleva un **puntaje acumulado por estudiante** a lo largo de toda la sesión.

**Regla de puntaje** (simple, fácil de explicar en clase): en cada ronda, entre los estudiantes que respondieron **correcto**, si hubo `N` respuestas correctas, el más rápido se lleva `N` puntos, el segundo más rápido `N-1`, y así hasta el último correcto, que se lleva `1` punto. Quien respondió mal o no respondió, `0` puntos esa ronda. Esos puntos se suman al total acumulado del estudiante en toda la sesión.

Al clickear **"Finalizar sesión"**, el docente cierra la sesión y se muestra el **ranking final** (ordenado de mayor a menor puntaje acumulado, con el ganador destacado) tanto en el board del docente como en la pantalla de cada estudiante conectado. Los estudiantes que nunca sumaron puntos igual aparecen en el ranking (al final), para que el docente vea el panorama completo de la clase, no solo a los que puntuaron.

## Ronda bonus: Husky Jump

Al terminar el quiz, el docente puede lanzar una **ronda extra de habilidad** para los mejores puntajes — pensada como algo aparte de la velocidad para responder, más parecida a reflejos/timing.

1. Con la sesión en estado "Finalizar sesión" (después del ranking final), aparece el botón **"Start Bonus Round"** en el board del docente.
2. Clasifican los **3 mejores puntajes acumulados** del quiz — si hay empate en el 3er puesto, entran todos los empatados (puede terminar siendo "top 4" o más ese día, nadie queda afuera por un empate).
3. Cada finalista juega en **su propio celular**, al mismo tiempo que los demás (no hace falta turnarse). El juego es tipo "el dinosaurio de Chrome sin internet", pero con un husky: tocá la pantalla para saltar y esquivar los conos de tránsito que van apareciendo. La dificultad sube gradualmente cuanto más dura la partida.
4. El resto de la clase (los que no clasificaron) ve un mensaje simple avisando que hay una ronda bonus en curso — el resultado se sigue en el board del docente, que muestra el **puntaje de cada finalista actualizándose en vivo** mientras juegan.
5. Cuando todos terminan (o se agota el tiempo, o el docente corta la ronda a mano con **"Finalizar ronda bonus"**), se anuncia un **campeón de habilidad** — separado del campeón del quiz, no modifica el ranking acumulado. Si hay empate en el puntaje más alto, se anuncian co-campeones.

**Ojo con el arte del husky:** es una silueta simple dibujada en el canvas (no una ilustración detallada) — suficiente para reconocer al personaje corriendo/saltando, pero no busques un dibujo realista.

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

- Depende de que el servidor relay (`server/`) esté levantado y accesible — si el relay se cae, se cae el juego entero para todos los conectados (host y estudiantes). Ya no hay dependencia de WiFi compartida, aislamiento de clientes, ni servidores TURN: todo el tráfico pasa por el relay, no por conexiones P2P directas entre dispositivos.
- El relay corre en el free tier de Render, que duerme la instancia tras un rato sin tráfico. El servidor se auto-hace ping cada 10 minutos para evitar ese cold start (ver `server/README.md`); si ese mecanismo falla o se desactiva, el primer host de la clase puede tardar hasta ~60s en conectar mientras la instancia se despierta.
- El relay está desplegado en `https://avatar-board-relay.onrender.com` (Render free tier) — ver `server/README.md` para redeploy o cambio de URL si hace falta.
- Si un estudiante real se une **después** de activar el simulador, el simulador no genera estudiantes mock nuevos (no se mezclan automáticamente).
- No hay manejo robusto de desconexión: si un estudiante pierde la conexión, su avatar no se limpia ni se marca automáticamente.
- La separación entre `questions-public.js` y `answers.json` es una mitigación contra exposición casual, no seguridad real (ver arriba) — no hay backend que pueda garantizar que las respuestas queden realmente ocultas.
- La ronda bonus (Husky Jump) es una feature nueva — probada con grupos chicos, todavía no con una clase completa jugándola en simultáneo. El arte del husky y los conos son formas simples dibujadas en canvas, no ilustraciones.
- Los efectos de sonido de la ronda bonus (salto/choque) dependen de que el navegador permita reproducir audio — algunos navegadores mobile lo bloquean sin una interacción previa del usuario en esa página; si no se escucha nada, revisá que el celular no esté en silencio antes de asumir que es un bug.
