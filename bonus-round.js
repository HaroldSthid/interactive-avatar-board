'use strict';

/**
 * Interactive Avatar Board — bonus-round.js
 *
 * Husky Bonus Round: headless endless-runner engine + canvas rendering.
 *
 * PR 1: physics, difficulty ramp, obstacle spawning, AABB collision, and the
 * public start/stop surface.
 * PR 2: canvas drawing (husky, ground, obstacles). Still zero socket/DOM
 * (outside an optional click listener on the passed-in canvas) knowledge —
 * that arrives in PR 3 (see openspec/changes/husky-bonus-round/tasks.md).
 *
 * Sprite note: design.md §4 originally called for 4 PNG image files loaded
 * via `<img>`/`drawImage()`. That shipped first as placeholder SVGs (no
 * raster-art tool was available), then had to be abandoned entirely after
 * real-device testing: across three separate fixes (decode() -> onload/
 * onerror, larger draw size, bolder art) the sprite still wouldn't render on
 * at least one real browser, with zero errors in DevTools to chase — while
 * the traffic-cone obstacles (pure canvas draws, no image involved) worked
 * correctly first try in that same environment. The husky is now drawn the
 * same way as the cones: plain canvas shape calls (see drawHuskyShape/
 * huskyPose below), no image loading, no async gate, no failure mode left to
 * debug. Real art later would mean re-deriving these shapes as a sprite
 * sheet or replacing drawHuskyShape's calls with drawImage — a bigger change
 * than a file swap now, but a known, deliberate tradeoff for reliability.
 *
 * Public surface (per design.md §1 Technical Approach):
 *   window.BonusRound.start({ canvas, onScore, onEnd })
 *   window.BonusRound.stop()
 *
 * `onScore(score)` fires on a ~300ms throttle while the run is alive.
 * `onEnd(score)` fires exactly once, immediately, on collision.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Logical world size (design.md §3 Game Loop) — scaled to element size and
// devicePixelRatio once at start, so tuning constants below are
// device-independent.
const WORLD_WIDTH = 480;
const WORLD_HEIGHT = 160;

// Difficulty ramp — originally 320->700 px/s per design.md §3/tasks.md 1.3,
// eased after real-device playtesting showed the reaction window (time from
// an obstacle spawning at the world edge to reaching the husky) too short to
// reliably time a jump. Slower start, gentler ramp, lower cap.
const BASE_SPEED = 220; // px/s at elapsed = 0
const RAMP_PER_SECOND = 8; // px/s gained per second of elapsed run time
const MAX_SPEED = 560; // px/s cap

// Husky vertical physics — NOT specified by design.md; eased after real-
// device playtesting (same pass as the speed constants above) — the
// original ~49px peak left only ~5px of clearance over the tallest 44px
// obstacle, which read as "couldn't time the jump" rather than a fair
// challenge. These values produce a ~0.61s hangtime and ~70px peak, a much
// wider timing window over the same obstacle sizes.
const GRAVITY = 1500; // px/s^2, downward (positive Y is down)
const JUMP_VELOCITY = -460; // px/s, upward impulse applied on jump

// Husky visual bounds — NOT specified by design.md; sized relative to the
// 480x160 world and the 64x64 source sprites (drawn scaled down in PR 2).
const HUSKY_X = 60; // fixed horizontal screen position
const HUSKY_WIDTH = 36;
const HUSKY_HEIGHT = 36;
const GROUND_Y = 130; // world Y where the husky's feet rest when grounded

// Collision hitbox inset — design.md Decision #3: "hitboxes inset ~15% from
// sprite bounds". Interpreted as 15% of each dimension removed from each
// side (so the hitbox is 70% of the visual box on each axis), which is what
// makes a near-miss read as fair.
const HITBOX_INSET_RATIO = 0.15;

// Obstacle sizing — NOT specified by design.md; varied traffic-cone heights
// (see drawObstacles()) so the ramp also reads as visually harder, not just
// faster.
const OBSTACLE_MIN_WIDTH = 18;
const OBSTACLE_MAX_WIDTH = 32;
const OBSTACLE_MIN_HEIGHT = 20;
const OBSTACLE_MAX_HEIGHT = 44;

// Spawn gap expressed in *time* (seconds), then converted to a distance
// delta via the *current* speed at spawn time — design.md §3 Game Loop:
// "gap in time, not px, so the ramp never makes a jump physically
// impossible". A fixed pixel gap would shrink in reaction-time terms as
// speed ramps up; this keeps the reaction window constant.
const MIN_GAP_SECONDS = 1.3;
const MAX_GAP_SECONDS = 2.2;

// Frame-independence clamp — design.md Decision #2: 50ms max per step, so a
// backgrounded-tab stall degrades to slow motion instead of a phantom
// teleport through an obstacle.
const MAX_DT = 0.05;

// Score-report throttle — design.md §3 Game Loop / §5 Protocol Schema.
// The engine itself throttles onScore(); app.js (PR 3) just forwards it.
const SCORE_REPORT_INTERVAL = 0.3;

// Distance (world px) travelled per run-frame swap — NOT specified by
// design.md, only the alternation rule (`run[floor(distance/RUN_FRAME_PX)%2]`,
// tasks.md 2.3). Chosen so the leg cycle reads as running rather than
// flickering at BASE_SPEED, and naturally quickens as speed ramps up since
// distance accrues faster per real second.
const RUN_FRAME_PX = 40;

// ---------------------------------------------------------------------------
// Canvas palette — mirrors the neon custom properties in style.css (:root).
// Duplicated here because canvas 2D fill/stroke styles can't read CSS custom
// properties; keep in sync with style.css by hand if that palette changes.
// ---------------------------------------------------------------------------

const COLOR_BG = '#0a0a14';
const COLOR_NEON_CYAN = '#00f0ff';
const COLOR_NEON_MAGENTA = '#ff00c8';
const COLOR_TEXT = '#e6e6f0';
const COLOR_CONE_ORANGE = '#ff8c1a';
const COLOR_CONE_STRIPE = '#f5f5f5';
const COLOR_CONE_BASE = '#1a1a24';
const COLOR_HUSKY_BODY = '#eef0f5';
const COLOR_HUSKY_SADDLE = '#3c4250';

// Procedural scrolling-ground dash pattern — NOT specified by design.md
// beyond "scrolling dashed line" (design.md §3 Game Loop draw block).
const GROUND_DASH_LENGTH = 14;
const GROUND_DASH_GAP = 10;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * Shrinks a box by HITBOX_INSET_RATIO on each axis, centered.
 */
function insetBox(box) {
  const insetX = box.width * HITBOX_INSET_RATIO;
  const insetY = box.height * HITBOX_INSET_RATIO;
  return {
    x: box.x + insetX,
    y: box.y + insetY,
    width: box.width - insetX * 2,
    height: box.height - insetY * 2,
  };
}

function aabbOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/**
 * Creates a fresh, independent run state. Exposed internally so a manual
 * test script (tasks.md 1.8) can drive the simulation without a DOM.
 */
function createBonusRoundState() {
  return {
    phase: 'idle', // 'idle' | 'running' | 'dead'
    elapsed: 0,
    distance: 0,
    score: 0,
    speed: BASE_SPEED,
    huskyY: GROUND_Y - HUSKY_HEIGHT,
    huskyVy: 0,
    grounded: true,
    obstacles: [],
    nextSpawnAt: 0,
    scoreAccum: 0,
    rafId: null,
    last: 0,
    canvas: null,
    ctx: null,
    onScore: null,
    onEnd: null,
    handlers: null,
  };
}

function huskyBox(state) {
  return { x: HUSKY_X, y: state.huskyY, width: HUSKY_WIDTH, height: HUSKY_HEIGHT };
}

function spawnObstacle(state) {
  const width = randRange(OBSTACLE_MIN_WIDTH, OBSTACLE_MAX_WIDTH);
  const height = randRange(OBSTACLE_MIN_HEIGHT, OBSTACLE_MAX_HEIGHT);
  state.obstacles.push({ x: WORLD_WIDTH, y: GROUND_Y - height, width, height });
}

function jump(state) {
  if (state.phase !== 'running' || !state.grounded) return;
  state.huskyVy = JUMP_VELOCITY;
  state.grounded = false;
}

function die(state) {
  if (state.phase !== 'running') return;
  state.phase = 'dead';
  if (state.rafId !== null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(state.rafId);
  }
  state.rafId = null;
  if (typeof state.onEnd === 'function') state.onEnd(state.score);
}

/**
 * Advances `state` by `dt` seconds (already clamped by the caller). Pure
 * with respect to everything except `state`, which it mutates in place.
 * This is the function the manual verification script (tasks.md 1.8) drives
 * directly with synthetic fixed dt steps.
 */
function stepBonusRound(state, dt) {
  if (state.phase !== 'running') return;

  state.elapsed += dt;
  state.speed = Math.min(BASE_SPEED + RAMP_PER_SECOND * state.elapsed, MAX_SPEED);

  // Husky vertical physics (gravity integration + ground clamp).
  state.huskyVy += GRAVITY * dt;
  state.huskyY += state.huskyVy * dt;
  const groundedY = GROUND_Y - HUSKY_HEIGHT;
  if (state.huskyY >= groundedY) {
    state.huskyY = groundedY;
    state.huskyVy = 0;
    state.grounded = true;
  }

  // Distance / score.
  state.distance += state.speed * dt;
  state.score = Math.floor(state.distance / 10);

  // Obstacles: scroll left, drop once fully off-screen.
  for (const obstacle of state.obstacles) {
    obstacle.x -= state.speed * dt;
  }
  state.obstacles = state.obstacles.filter((obstacle) => obstacle.x + obstacle.width > 0);

  // Spawn — gap computed in time, converted to a distance delta via the
  // current speed (see MIN_GAP_SECONDS/MAX_GAP_SECONDS comment above).
  if (state.distance >= state.nextSpawnAt) {
    spawnObstacle(state);
    state.nextSpawnAt = state.distance + randRange(MIN_GAP_SECONDS, MAX_GAP_SECONDS) * state.speed;
  }

  // Collision — AABB overlap on inset hitboxes.
  const insetHusky = insetBox(huskyBox(state));
  for (const obstacle of state.obstacles) {
    if (aabbOverlap(insetHusky, insetBox(obstacle))) {
      die(state);
      return;
    }
  }

  // Score-report throttle.
  state.scoreAccum += dt;
  if (state.scoreAccum >= SCORE_REPORT_INTERVAL) {
    state.scoreAccum = 0;
    if (typeof state.onScore === 'function') state.onScore(state.score);
  }
}

// ---------------------------------------------------------------------------
// Draw (design.md §3 Game Loop draw block; tasks.md 2.3, 2.4)
// ---------------------------------------------------------------------------

// Husky silhouette: drawn procedurally in local 64x64 units (ctx.scale()'d
// into place by drawHusky below), the same shapes/coordinates originally
// authored as 4 separate SVG files. Switched from `<img>`-loaded SVGs to
// direct canvas calls after three rounds of real-device testing (screenshots
// + a live DevTools console check showing zero load/decode errors) still
// couldn't get `sprite.complete && naturalWidth > 0` to pass on at least one
// real browser — meanwhile the equally-new traffic-cone obstacles, which
// were ALWAYS pure canvas draws with no image involved, worked correctly on
// the first try in that same environment. Procedural drawing removes image
// loading as a failure mode entirely, matching what's already proven
// reliable for the obstacles. It also removes the async 'loading' phase
// gate in start() — nothing here needs to finish loading before the round
// can begin.
function drawHuskyShape(ctx, { legFront, legBack, bodyDy, outlineColor, eyesX }) {
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 3;

  // Tail.
  ctx.fillStyle = COLOR_HUSKY_BODY;
  ctx.beginPath();
  ctx.moveTo(14, 26 + bodyDy);
  ctx.lineTo(0, 19 + bodyDy);
  ctx.lineTo(5, 44 + bodyDy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Body + saddle patch.
  ctx.beginPath();
  ctx.ellipse(30, 34 + bodyDy, 21, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COLOR_HUSKY_SADDLE;
  ctx.beginPath();
  ctx.ellipse(27, 26 + bodyDy, 18, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs — plain rect (not ctx.roundRect(): newer API, avoided after this
  // session's run of real-device rendering surprises with less-common APIs).
  ctx.fillStyle = COLOR_HUSKY_BODY;
  ctx.beginPath();
  ctx.rect(legFront.x, legFront.y, 7, legFront.h);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.rect(legBack.x, legBack.y, 7, legBack.h);
  ctx.fill();
  ctx.stroke();

  // Head.
  ctx.beginPath();
  ctx.arc(48, 24 + bodyDy, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Ears.
  ctx.fillStyle = COLOR_HUSKY_SADDLE;
  ctx.beginPath();
  ctx.moveTo(38, 20 + bodyDy);
  ctx.lineTo(45, 2 + bodyDy);
  ctx.lineTo(52, 18 + bodyDy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(46, 18 + bodyDy);
  ctx.lineTo(53, 2 + bodyDy);
  ctx.lineTo(60, 20 + bodyDy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Eye (dot) or hit-frame X-eyes.
  if (eyesX) {
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(51, 22 + bodyDy);
    ctx.lineTo(55, 26 + bodyDy);
    ctx.moveTo(55, 22 + bodyDy);
    ctx.lineTo(51, 26 + bodyDy);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#0a0a14';
    ctx.beginPath();
    ctx.arc(53, 23 + bodyDy, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Picks the leg pose + body offset + outline color for the current run state. */
function huskyPose(state) {
  if (state.phase === 'dead') {
    return {
      legFront: { x: 47, y: 46, h: 10 },
      legBack: { x: 11, y: 46, h: 10 },
      bodyDy: 2,
      outlineColor: '#ff3860',
      eyesX: true,
    };
  }
  if (!state.grounded) {
    return {
      legFront: { x: 45, y: 40, h: 6 },
      legBack: { x: 16, y: 40, h: 6 },
      bodyDy: -2,
      outlineColor: COLOR_NEON_CYAN,
      eyesX: false,
    };
  }
  const frameIndex = Math.floor(state.distance / RUN_FRAME_PX) % 2;
  return frameIndex === 0
    ? {
        legFront: { x: 45, y: 44, h: 14 },
        legBack: { x: 16, y: 40, h: 8 },
        bodyDy: 0,
        outlineColor: COLOR_NEON_CYAN,
        eyesX: false,
      }
    : {
        legFront: { x: 45, y: 40, h: 8 },
        legBack: { x: 16, y: 44, h: 14 },
        bodyDy: 0,
        outlineColor: COLOR_NEON_CYAN,
        eyesX: false,
      };
}

function drawGround(ctx, distance) {
  const period = GROUND_DASH_LENGTH + GROUND_DASH_GAP;
  const offset = distance % period;
  ctx.strokeStyle = COLOR_NEON_CYAN;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = -offset; x < WORLD_WIDTH; x += period) {
    ctx.moveTo(x, GROUND_Y);
    ctx.lineTo(x + GROUND_DASH_LENGTH, GROUND_Y);
  }
  ctx.stroke();
}

/**
 * Draws each obstacle as a traffic cone (triangle body + stripe + base
 * plate) sized to its existing hitbox bounding box — purely a redraw of the
 * same `obstacle.{x,y,width,height}` the AABB collision in stepBonusRound()
 * already uses, so difficulty/fairness is untouched. Varied obstacle sizes
 * (OBSTACLE_MIN/MAX_WIDTH/HEIGHT) now read as visibly different cone sizes.
 */
function drawObstacles(ctx, obstacles) {
  ctx.save();
  for (const obstacle of obstacles) {
    const { x, y, width, height } = obstacle;
    const baseHeight = Math.max(3, height * 0.18);
    const bodyBottom = y + height - baseHeight;

    ctx.fillStyle = COLOR_CONE_ORANGE;
    ctx.strokeStyle = COLOR_NEON_MAGENTA;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + width / 2, y);
    ctx.lineTo(x + width, bodyBottom);
    ctx.lineTo(x, bodyBottom);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const stripeY = y + (bodyBottom - y) * 0.55;
    const stripeHalfWidth = (width / 2) * ((stripeY - y) / (bodyBottom - y));
    ctx.fillStyle = COLOR_CONE_STRIPE;
    ctx.fillRect(x + width / 2 - stripeHalfWidth, stripeY, stripeHalfWidth * 2, Math.max(2, height * 0.08));

    ctx.fillStyle = COLOR_CONE_BASE;
    ctx.fillRect(x, bodyBottom, width, baseHeight);
  }
  ctx.restore();
}

// Sprites render larger than the (unchanged) collision hitbox — 36x36 world
// px reads as an illegible blob on a phone screen at this world's ~0.8x CSS
// display scale (confirmed via real-device screenshot: the multi-shape
// silhouette came through as visual noise, not a recognizable dog). Purely
// a draw-size multiplier, centered on the same hitbox center — physics and
// collision (huskyBox/insetBox) are untouched.
const SPRITE_DRAW_SCALE = 1.6;

function drawHusky(ctx, state) {
  const box = huskyBox(state);
  const drawWidth = box.width * SPRITE_DRAW_SCALE;
  const drawHeight = box.height * SPRITE_DRAW_SCALE;
  const drawX = box.x + box.width / 2 - drawWidth / 2;
  const drawY = box.y + box.height - drawHeight; // feet stay planted on the ground line
  const pose = huskyPose(state);

  ctx.save();
  ctx.translate(drawX, drawY);
  ctx.scale(drawWidth / 64, drawHeight / 64); // shapes are authored in 64x64 local units
  drawHuskyShape(ctx, pose);
  ctx.restore();
}

function drawFinalScoreOverlay(ctx, score) {
  ctx.save();
  ctx.fillStyle = 'rgba(10, 10, 20, 0.55)';
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  ctx.fillStyle = COLOR_TEXT;
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`Score: ${score}`, WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
  ctx.restore();
}

/**
 * Clears and redraws the full frame. No-op when `state.ctx` is absent
 * (headless run — preserves PR 1's DOM-free testability, tasks.md 1.8).
 */
function draw(state) {
  const ctx = state.ctx;
  if (!ctx) return;
  ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  drawGround(ctx, state.distance);
  drawObstacles(ctx, state.obstacles);
  drawHusky(ctx, state);
  if (state.phase === 'dead') drawFinalScoreOverlay(ctx, state.score);
}

// ---------------------------------------------------------------------------
// rAF loop + public interface
// ---------------------------------------------------------------------------

function frame(state, now) {
  const dt = Math.min((now - state.last) / 1000, MAX_DT);
  state.last = now;
  stepBonusRound(state, dt);
  draw(state);
  if (state.phase === 'running') {
    state.rafId = requestAnimationFrame((nextNow) => frame(state, nextNow));
  }
}

/**
 * Sets up the canvas's backing-store size and DPR transform. No drawing
 * happens here or anywhere else in this file — sprite/procedural rendering
 * is PR 2. `canvas` is optional; the engine runs headlessly without one.
 */
function initCanvas(state, canvas) {
  state.canvas = canvas || null;
  if (!canvas || typeof canvas.getContext !== 'function') return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  canvas.width = WORLD_WIDTH * dpr;
  canvas.height = WORLD_HEIGHT * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  state.ctx = ctx;
}

function attachInputHandlers(state) {
  const onJump = () => jump(state);
  const onKeydown = (event) => {
    if (event.code === 'Space' || event.key === ' ') {
      event.preventDefault();
      onJump();
    }
  };
  // visibilitychange -> hidden pauses the rAF loop; on resume, `last` is
  // reset so the next frame's dt isn't a phantom multi-second spike.
  const onVisibilityChange = () => {
    if (typeof document === 'undefined') return;
    if (document.hidden) {
      if (state.rafId !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(state.rafId);
      }
      state.rafId = null;
    } else if (state.phase === 'running' && state.rafId === null) {
      state.last = typeof performance !== 'undefined' ? performance.now() : Date.now();
      state.rafId = requestAnimationFrame((now) => frame(state, now));
    }
  };

  if (state.canvas && typeof state.canvas.addEventListener === 'function') {
    state.canvas.addEventListener('click', onJump);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  state.handlers = { onJump, onKeydown, onVisibilityChange };
}

function detachInputHandlers(state) {
  if (!state.handlers) return;
  const { onJump, onKeydown, onVisibilityChange } = state.handlers;
  if (state.canvas && typeof state.canvas.removeEventListener === 'function') {
    state.canvas.removeEventListener('click', onJump);
  }
  if (typeof document !== 'undefined') {
    document.removeEventListener('keydown', onKeydown);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  }
  state.handlers = null;
}

let activeBonusRoundState = null;

/**
 * Begins a new run. Cancels any previously active run first (defensive —
 * app.js, PR 3, is expected to call stop() before a new start()).
 *
 * No loading gate: the husky/obstacles are drawn procedurally (see the
 * "Husky silhouette" comment above drawHuskyShape), so there's nothing
 * asynchronous to wait on before the round can begin. Still deferred one
 * microtask (rather than starting the rAF loop synchronously inline) so a
 * `stop()` called immediately after `start()` — e.g. app.js superseding a
 * just-started round — can still win the race via the `activeBonusRoundState
 * !== state` check below, same shape as before this was sprite-loading-gated.
 * @param {{canvas?: HTMLCanvasElement, onScore?: (score:number)=>void, onEnd?: (score:number)=>void}} options
 */
function start(options) {
  const { canvas, onScore, onEnd } = options || {};
  if (activeBonusRoundState) stop();

  const state = createBonusRoundState();
  state.onScore = onScore;
  state.onEnd = onEnd;
  state.phase = 'loading';
  initCanvas(state, canvas);
  attachInputHandlers(state);
  activeBonusRoundState = state;

  Promise.resolve().then(() => {
    if (activeBonusRoundState !== state) return;
    state.phase = 'running';
    state.last = typeof performance !== 'undefined' ? performance.now() : Date.now();
    state.rafId = requestAnimationFrame((now) => frame(state, now));
  });

  return state;
}

function stop() {
  if (!activeBonusRoundState) return;
  if (activeBonusRoundState.rafId !== null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(activeBonusRoundState.rafId);
  }
  activeBonusRoundState.rafId = null;
  detachInputHandlers(activeBonusRoundState);
  activeBonusRoundState.phase = 'idle';
  activeBonusRoundState = null;
}

// Narrow public surface (design.md §1): only start/stop reach `window`.
const bonusRoundPublicApi = { start, stop };

// Richer surface for the throwaway Node manual-verification script
// (tasks.md 1.8) and future headless testing — never assigned to `window`.
const bonusRoundTestApi = Object.assign({}, bonusRoundPublicApi, {
  _internal: {
    createBonusRoundState,
    stepBonusRound,
    insetBox,
    aabbOverlap,
    huskyBox,
    spawnObstacle,
    jump,
    die,
    huskyPose,
    draw,
    constants: {
      WORLD_WIDTH,
      WORLD_HEIGHT,
      BASE_SPEED,
      RAMP_PER_SECOND,
      MAX_SPEED,
      GRAVITY,
      JUMP_VELOCITY,
      HUSKY_X,
      HUSKY_WIDTH,
      HUSKY_HEIGHT,
      GROUND_Y,
      HITBOX_INSET_RATIO,
      MIN_GAP_SECONDS,
      MAX_GAP_SECONDS,
      MAX_DT,
      SCORE_REPORT_INTERVAL,
      RUN_FRAME_PX,
    },
  },
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = bonusRoundTestApi;
}
if (typeof window !== 'undefined') {
  window.BonusRound = bonusRoundPublicApi;
}
