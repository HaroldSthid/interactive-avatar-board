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

Las preguntas se editan en **un solo archivo**, `questions-source.json` — pregunta, opciones A-D y respuesta correcta juntos, todo en el mismo lugar:

```json
{
  "id": 9,
  "text": "¿Cuál es la capital de Francia?",
  "options": { "A": "Madrid", "B": "París", "C": "Roma", "D": "Berlín" },
  "correctAnswer": "B"
}
```

Después de editar `questions-source.json`, corré:

```bash
node scripts/generate-questions.mjs
```

Esto regenera `questions-public.js` y `answers.json` a partir de la fuente, validando de paso que no haya `id` duplicados, que las 4 opciones estén completas y que `correctAnswer` sea A/B/C/D — si algo está mal, el script corta con un mensaje señalando la pregunta exacta, en vez de dejarte con los dos archivos desincronizados.

**`questions-public.js`** y **`answers.json`** ahora son **archivos generados** (dice "GENERATED FILE" en el header de `questions-public.js`) — no hace falta editarlos a mano, y si lo hacés, el próximo `generate-questions.mjs` los va a pisar.

### ¿Por qué siguen siendo dos archivos separados?

`questions-public.js` (con el enunciado y las opciones) se carga en el navegador de **todos** — docente y estudiantes — apenas se abre la app. `answers.json` (con la respuesta correcta) **no** se carga automáticamente para nadie: solo se pide (`fetch`) desde el navegador del docente, recién al hacer click en "Start Hosting". Separar la respuesta correcta evita que cualquiera que abra la consola del navegador vea todas las respuestas de antemano.

**Ojo:** esto sigue siendo una mitigación, no seguridad real. Como es un sitio 100% estático sin backend, no hay forma de ocultarle un archivo a alguien que sepa pedirlo directamente por URL (un estudiante técnicamente decidido podría igual entrar a `.../answers.json` a mano). El generador no cambia esa garantía — solo evita que la separación se rompa por un error de tipeo al mantener los dos archivos a mano. Si el docente necesita una garantía real de que las respuestas no se puedan ver, hace falta un backend — eso queda fuera del alcance de este proyecto.

El juego arranca con **25 preguntas de ejemplo** (programación básica, SCRUM y cultura general). El orden es **aleatorio** (no repite ninguna hasta usar las 25), y recién ahí vuelve a mezclar el mazo para la siguiente vuelta — así que con una clase de 40 alumnos y varias rondas, no es tan predecible ni se repite tan rápido como con un orden fijo. Podés agregar todas las preguntas que quieras en `questions-source.json` siguiendo el mismo formato, sin tocar `app.js`.

## Limitaciones conocidas

- Depende de que el servidor relay (`server/`) esté levantado y accesible — si el relay se cae, se cae el juego entero para todos los conectados (host y estudiantes). Ya no hay dependencia de WiFi compartida, aislamiento de clientes, ni servidores TURN: todo el tráfico pasa por el relay, no por conexiones P2P directas entre dispositivos.
- El relay corre en el free tier de Render, que duerme la instancia tras un rato sin tráfico. El servidor se auto-hace ping cada 10 minutos para evitar ese cold start (ver `server/README.md`); si ese mecanismo falla o se desactiva, el primer host de la clase puede tardar hasta ~60s en conectar mientras la instancia se despierta.
- El relay está desplegado en `https://avatar-board-relay.onrender.com` (Render free tier) — ver `server/README.md` para redeploy o cambio de URL si hace falta.
- Si un estudiante real se une **después** de activar el simulador, el simulador no genera estudiantes mock nuevos (no se mezclan automáticamente).
- No hay manejo robusto de desconexión: si un estudiante pierde la conexión, su avatar no se limpia ni se marca automáticamente.
- La separación entre `questions-public.js` y `answers.json` es una mitigación contra exposición casual, no seguridad real (ver arriba) — no hay backend que pueda garantizar que las respuestas queden realmente ocultas.
- La ronda bonus (Husky Jump) es una feature nueva — probada con grupos chicos, todavía no con una clase completa jugándola en simultáneo. El arte del husky y los conos son formas simples dibujadas en canvas, no ilustraciones.
- Los efectos de sonido de la ronda bonus (salto/choque) dependen de que el navegador permita reproducir audio — algunos navegadores mobile lo bloquean sin una interacción previa del usuario en esa página; si no se escucha nada, revisá que el celular no esté en silencio antes de asumir que es un bug.
