'use strict';

/**
 * Interactive Avatar Board — bonus-round.js
 *
 * Husky Bonus Round: headless endless-runner engine + canvas rendering.
 *
 * PR 1: physics, difficulty ramp, obstacle spawning, AABB collision, and the
 * public start/stop surface.
 * PR 2 (this file, current state): sprite preload/decode gate and canvas
 * drawing (husky sprite frame-swap, procedural ground/obstacles). Still zero
 * socket/DOM (outside an optional click listener on the passed-in canvas)
 * knowledge — that arrives in PR 3 (see
 * openspec/changes/husky-bonus-round/tasks.md).
 *
 * Sprite note: design.md §4 Sprite Plan specifies 4 PNGs. This build ships
 * placeholder art as SVG instead (no raster/bitmap image-generation
 * capability was available while implementing PR 2) — `HTMLImageElement`
 * loads and `drawImage()`s SVGs into canvas exactly like PNGs, and
 * `.decode()` works on them too, so the preload/decode-gate architecture
 * below is unchanged. Swapping in real PNG art later is a file swap only
 * (same dimensions, update `SPRITE_FILES` extensions) — no code edit needed
 * beyond that one constant. See design.md §4 and §10 Open Questions.
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

// Difficulty ramp — explicit in design.md §3 / tasks.md 1.3:
// speed = min(320 + 12*elapsed, 700) px/s.
const BASE_SPEED = 320; // px/s at elapsed = 0
const RAMP_PER_SECOND = 12; // px/s gained per second of elapsed run time
const MAX_SPEED = 700; // px/s cap

// Husky vertical physics — NOT specified by design.md; chosen to produce a
// ~0.47s hangtime and ~49px peak jump height, which clears the obstacle
// sizes below with comfortable margin at both BASE_SPEED and MAX_SPEED.
const GRAVITY = 1800; // px/s^2, downward (positive Y is down)
const JUMP_VELOCITY = -420; // px/s, upward impulse applied on jump

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

// Obstacle sizing — NOT specified by design.md; varied cactus-style heights
// so the ramp also reads as visually harder, not just faster.
const OBSTACLE_MIN_WIDTH = 18;
const OBSTACLE_MAX_WIDTH = 32;
const OBSTACLE_MIN_HEIGHT = 20;
const OBSTACLE_MAX_HEIGHT = 44;

// Spawn gap expressed in *time* (seconds), then converted to a distance
// delta via the *current* speed at spawn time — design.md §3 Game Loop:
// "gap in time, not px, so the ramp never makes a jump physically
// impossible". A fixed pixel gap would shrink in reaction-time terms as
// speed ramps up; this keeps the reaction window constant.
const MIN_GAP_SECONDS = 1.0;
const MAX_GAP_SECONDS = 1.8;

// Frame-independence clamp — design.md Decision #2: 50ms max per step, so a
// backgrounded-tab stall degrades to slow motion instead of a phantom
// teleport through an obstacle.
const MAX_DT = 0.05;

// Score-report throttle — design.md §3 Game Loop / §5 Protocol Schema.
// The engine itself throttles onScore(); app.js (PR 3) just forwards it.
const SCORE_REPORT_INTERVAL = 0.3;

// ---------------------------------------------------------------------------
// Sprite plan (design.md §4) — see file header for the PNG-to-SVG placeholder
// substitution note.
// ---------------------------------------------------------------------------

const SPRITE_DIR = 'assets/husky/';
const SPRITE_FILES = {
  run1: 'run-1.svg',
  run2: 'run-2.svg',
  jump: 'jump.svg',
  hit: 'hit.svg',
};

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
// Sprite preload (design.md §2 Decision 4; tasks.md 2.2)
// ---------------------------------------------------------------------------

// Module-level so sprites load once and are reused across rounds (repeated
// `start()` calls on the same device, e.g. host restarting a stuck run).
let spriteImages = null; // { run1, run2, jump, hit } HTMLImageElement, once loaded
let spritesReadyPromise = null;

/**
 * Creates the 4 sprite `Image`s and returns a promise that resolves once
 * every one has decoded (or failed to — a broken/missing sprite must not
 * hang the round forever, so decode failures are tolerated and fall back to
 * the flat-rect placeholder in `drawHusky`).
 * No-ops (resolves with `null`) outside a DOM (headless/Node manual test).
 */
function loadSprites() {
  if (spritesReadyPromise) return spritesReadyPromise;
  if (typeof Image === 'undefined') {
    spritesReadyPromise = Promise.resolve(null);
    return spritesReadyPromise;
  }

  const images = {};
  const decodePromises = Object.keys(SPRITE_FILES).map((key) => {
    const img = new Image();
    img.src = SPRITE_DIR + SPRITE_FILES[key];
    images[key] = img;
    if (typeof img.decode === 'function') {
      // decode() rejects on load failure — tolerated, see doc comment above.
      return img.decode().catch(() => {});
    }
    // Fallback for environments without decode(): resolve on load/error.
    return new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve;
    });
  });

  spriteImages = images;
  spritesReadyPromise = Promise.all(decodePromises).then(() => images);
  return spritesReadyPromise;
}

// ---------------------------------------------------------------------------
// Draw (design.md §3 Game Loop draw block; tasks.md 2.3, 2.4)
// ---------------------------------------------------------------------------

function huskySprite(state) {
  if (!spriteImages) return null;
  if (state.phase === 'dead') return spriteImages.hit;
  if (!state.grounded) return spriteImages.jump;
  const frameIndex = Math.floor(state.distance / RUN_FRAME_PX) % 2;
  return frameIndex === 0 ? spriteImages.run1 : spriteImages.run2;
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

function drawObstacles(ctx, obstacles) {
  ctx.save();
  ctx.fillStyle = COLOR_NEON_MAGENTA;
  ctx.shadowColor = COLOR_NEON_MAGENTA;
  ctx.shadowBlur = 6;
  for (const obstacle of obstacles) {
    ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
  }
  ctx.restore();
}

function drawHusky(ctx, state) {
  const sprite = huskySprite(state);
  const box = huskyBox(state);
  // `complete && naturalWidth > 0` guards against drawing a sprite that
  // errored (decode() tolerated the failure above but left a broken image).
  if (sprite && sprite.complete && sprite.naturalWidth > 0) {
    ctx.drawImage(sprite, box.x, box.y, box.width, box.height);
  } else {
    // Fallback while sprites are still loading (shouldn't normally be
    // visible — start() gates on the decode promise) or if one failed to
    // load: a flat rect keeps the run visibly alive instead of blank.
    ctx.fillStyle = state.phase === 'dead' ? COLOR_NEON_MAGENTA : COLOR_NEON_CYAN;
    ctx.fillRect(box.x, box.y, box.width, box.height);
  }
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
 * Round start is gated on sprite decode (design.md §2 Decision 4; tasks.md
 * 2.2) whenever a drawable canvas was supplied: `state.phase` stays
 * `'loading'` — input handlers are attached but `jump()`/collision are
 * no-ops outside `'running'` — until all 4 sprites resolve, then the rAF
 * loop begins. Headless calls (no canvas, e.g. the manual-verification
 * script from tasks.md 1.8) skip the gate entirely and start immediately.
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

  const readyPromise = state.ctx ? loadSprites() : Promise.resolve(null);
  readyPromise.then(() => {
    // A stop() (or a superseding start()) may have run while sprites were
    // still decoding — don't resurrect a stale, already-discarded state.
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
    loadSprites,
    huskySprite,
    draw,
    getSpriteImages: () => spriteImages,
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
      SPRITE_DIR,
      SPRITE_FILES,
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
