const DOT_SPACING = 24;
const DOT_RADIUS = 1;
const MAX_CONCURRENT_WAVES = 3;
const SPAWN_MIN_MS = 1800;
const SPAWN_MAX_MS = 4200;
const WAVE_INTENSITY = 0.45; // dampens how bright/dark a wave can push a dot

// Slow constant drift of the whole grid, down and to the right, at ~35°
// below the rightward horizontal.
const DRIFT_ANGLE_DEG = 35;
const DRIFT_SPEED = 6; // px/sec — noticeable without being distracting
const DRIFT_DX = Math.cos((DRIFT_ANGLE_DEG * Math.PI) / 180);
const DRIFT_DY = Math.sin((DRIFT_ANGLE_DEG * Math.PI) / 180);

interface Wave {
  dx: number;
  dy: number;
  startProj: number;
  speed: number;
  width: number;
  sign: 1 | -1;
  duration: number;
  startTime: number;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * Animates the dot-grid background: soft bands of brightness ("waves")
 * sweep across the dots from random directions at random intervals,
 * randomly lightening or darkening whatever they pass under. Purely
 * decorative — respects prefers-reduced-motion by rendering the static
 * grid once and never starting the animation loop.
 */
export function initBackground(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const baseColor = readColor("--grid-dot", { r: 27, g: 42, b: 71 });
  const lightColor = readColor("--accent-primary", { r: 61, g: 139, b: 255 });
  const darkColor = readColor("--bg-base", { r: 7, g: 11, b: 20 });

  let width = 0;
  let height = 0;
  // Dots are stored as grid cell positions, not final screen positions —
  // the drift offset (computed per frame) is added at draw time. One
  // extra cell of padding on every side means a dot drifting off one edge
  // already has its "next" copy waiting just off the opposite edge, so
  // the wrap never leaves a visible gap.
  let cells: { x: number; y: number }[] = [];
  const waves: Wave[] = [];
  let nextSpawn = 0;
  let driftStart = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

    cells = [];
    for (let y = -DOT_SPACING; y < height + DOT_SPACING * 2; y += DOT_SPACING) {
      for (let x = -DOT_SPACING; x < width + DOT_SPACING * 2; x += DOT_SPACING) {
        cells.push({ x: x + DOT_SPACING / 2, y: y + DOT_SPACING / 2 });
      }
    }
  }

  // Picks a random travel direction, then finds the range of that
  // direction's projection across the viewport's corners so the wave's
  // start/end always fully clears the screen no matter which way it's
  // heading — this is what lets waves enter "from any direction".
  function spawnWave(now: number) {
    const theta = Math.random() * Math.PI * 2;
    const dx = Math.cos(theta);
    const dy = Math.sin(theta);
    const corners = [
      [0, 0],
      [width, 0],
      [0, height],
      [width, height],
    ];
    const projections = corners.map(([x, y]) => x * dx + y * dy);
    const minP = Math.min(...projections);
    const maxP = Math.max(...projections);
    const bandWidth = 70 + Math.random() * 50;
    const speed = 160 + Math.random() * 120;
    const startProj = minP - bandWidth;
    const totalDist = maxP + bandWidth - startProj;

    waves.push({
      dx,
      dy,
      startProj,
      speed,
      width: bandWidth,
      sign: Math.random() < 0.5 ? 1 : -1,
      duration: totalDist / speed,
      startTime: now,
    });
  }

  function draw(now: number) {
    if (!reducedMotion) {
      if (now >= nextSpawn && waves.length < MAX_CONCURRENT_WAVES) {
        spawnWave(now);
        nextSpawn = now + SPAWN_MIN_MS + Math.random() * (SPAWN_MAX_MS - SPAWN_MIN_MS);
      }
      for (let i = waves.length - 1; i >= 0; i--) {
        if ((now - waves[i].startTime) / 1000 > waves[i].duration) waves.splice(i, 1);
      }
    }

    ctx!.clearRect(0, 0, width, height);

    const driftElapsed = reducedMotion ? 0 : (now - driftStart) / 1000;
    const offsetX = wrapMod(DRIFT_DX * DRIFT_SPEED * driftElapsed, DOT_SPACING);
    const offsetY = wrapMod(DRIFT_DY * DRIFT_SPEED * driftElapsed, DOT_SPACING);

    for (const cell of cells) {
      const x = cell.x + offsetX;
      const y = cell.y + offsetY;

      let intensity = 0;
      for (const w of waves) {
        const elapsed = (now - w.startTime) / 1000;
        const frontProj = w.startProj + elapsed * w.speed;
        const d = x * w.dx + y * w.dy - frontProj;
        if (Math.abs(d) < w.width) {
          // Cosine bump: peaks at the wave's leading edge, tapers to 0 at
          // the band's outer limits, so it reads as a soft pulse rather
          // than a hard-edged bar sweeping across the grid.
          intensity += Math.cos((d / w.width) * (Math.PI / 2)) * w.sign;
        }
      }
      intensity = Math.max(-1, Math.min(1, intensity)) * WAVE_INTENSITY;

      const color = intensity >= 0 ? lerp(baseColor, lightColor, intensity) : lerp(baseColor, darkColor, -intensity);
      ctx!.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
      ctx!.beginPath();
      ctx!.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
      ctx!.fill();
    }

    if (!reducedMotion) requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener("resize", resize);
  driftStart = performance.now();
  requestAnimationFrame(draw);
}

/** Wraps `v` into [0, m) — used so the drift offset loops seamlessly. */
function wrapMod(v: number, m: number): number {
  return ((v % m) + m) % m;
}

function readColor(varName: string, fallback: Rgb): Rgb {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return parseHex(raw) ?? fallback;
}

function parseHex(hex: string): Rgb | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function lerp(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}
