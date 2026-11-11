/**
 * Procedural maps for the vacuum-sealed foil pouch.
 *
 * Everything is generated once in the browser (no image assets):
 *   - a height field: flat raised panel in the middle (the QR card "inside"),
 *     crumpled foil around it, pleats pulling away from the panel, heat-seal
 *     bands on the left and right edges
 *   - a normal map and displacement map derived from that height field
 *   - a pincushion silhouette with flared corners (alpha)
 *   - base colour + roughness/metalness, onto which the label text is printed
 *
 * Coordinates: p = (x, y) in [-1, 1] across the whole texture, y up.
 */

/** Half-size of the flat panel, in p units. The QR card maps onto this. */
export const PANEL = 0.56;
/** Half-size of the pouch body (before corner flare), in p units. */
const BODY = 0.8;
/** Displacement depth as a fraction of the plane size. */
export const DEPTH = 0.055;
/** Extra punch for the shading normals. */
const NORMAL_GAIN = 1.2;

export type FoilMaps = {
  size: number;
  normal: HTMLCanvasElement;
  displacement: HTMLCanvasElement;
  baseColor: ImageData;
  baseOrm: ImageData;
};

export type FoilLabel = {
  storeName: string;
  orderNumber: number;
  /** CSS font-family strings, e.g. from next/font variables. */
  displayFont: string;
  monoFont: string;
};

/* ------------------------------------------------------------------ noise */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 2D simplex noise, returns roughly [-1, 1]. */
function makeNoise(seed: number) {
  const rand = mulberry32(seed);
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const GX = [1, -1, 1, -1, 1, -1, 0, 0];
  const GY = [1, 1, -1, -1, 0, 0, 1, -1];
  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const G2 = (3 - Math.sqrt(3)) / 6;

  return (x: number, y: number) => {
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    let n = 0;
    let a = 0.5 - x0 * x0 - y0 * y0;
    if (a > 0) {
      const g = perm[ii + perm[jj]] & 7;
      a *= a;
      n += a * a * (GX[g] * x0 + GY[g] * y0);
    }
    a = 0.5 - x1 * x1 - y1 * y1;
    if (a > 0) {
      const g = perm[ii + i1 + perm[jj + j1]] & 7;
      a *= a;
      n += a * a * (GX[g] * x1 + GY[g] * y1);
    }
    a = 0.5 - x2 * x2 - y2 * y2;
    if (a > 0) {
      const g = perm[ii + 1 + perm[jj + 1]] & 7;
      a *= a;
      n += a * a * (GX[g] * x2 + GY[g] * y2);
    }
    return 70 * n;
  };
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Signed distance to a rounded box centred on the origin. */
function sdRoundBox(x: number, y: number, half: number, r: number) {
  const qx = Math.abs(x) - half + r;
  const qy = Math.abs(y) - half + r;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

/**
 * Lets the browser paint between chunks of work. Uses a message channel
 * because timers get slowed down (to once a second) in background tabs.
 */
function yieldToMain() {
  return new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

/* -------------------------------------------------------------- generator */

/** How far each corner "ear" flares out. Uneven on purpose. */
const CORNER_FLARE = [1.0, 0.82, 1.14, 0.9];

/**
 * Builds all the maps. Yields to the browser every few milliseconds so the
 * idle QR animation never stutters while this runs.
 */
export async function generateFoilMaps(size = 1024): Promise<FoilMaps> {
  const noise = makeNoise(11);
  const count = size * size;
  const height = new Float32Array(count);
  const alpha = new Float32Array(count);
  const rough = new Float32Array(count);

  let lastYield = performance.now();

  for (let row = 0; row < size; row++) {
    const y = 1 - (2 * (row + 0.5)) / size;
    for (let col = 0; col < size; col++) {
      const x = (2 * (col + 0.5)) / size - 1;
      const idx = row * size + col;

      /* silhouette: pincushion with flared, slightly crumpled corners */
      const ax = Math.abs(x);
      const ay = Math.abs(y);
      const m = Math.max(ax, ay);
      const corner = 1 - Math.abs(ax - ay) / (ax + ay + 1e-6);
      const theta = Math.atan2(y, x);
      const quad = (x >= 0 ? 1 : 0) + (y >= 0 ? 2 : 0);
      const flare = 0.27 * corner * corner * corner * CORNER_FLARE[quad];
      const wobble =
        0.026 * noise(Math.cos(theta) * 1.6 + 5, Math.sin(theta) * 1.6 + 2) +
        0.02 * noise(Math.cos(theta) * 5.5 + 9, Math.sin(theta) * 5.5) * (0.35 + corner);
      const edge = BODY * (1 - 0.075 + flare + wobble);
      const inset = 1 - m / edge; // > 0 inside, 0 on the outline

      if (inset < -0.02) continue; // well outside: leave everything at 0
      alpha[idx] = smoothstep(0, 0.007, inset);

      /* crumple: domain-warped noise with sharp ridges and creases */
      const wx = noise(x * 1.3 + 11.3, y * 1.3 - 4.1);
      const wy = noise(x * 1.3 - 7.7, y * 1.3 + 37.2);
      const qx = x + 0.3 * wx;
      const qy = y + 0.3 * wy;
      // few octaves, fast falloff: broad folds with sharp edges, not glitter
      let crumple = 0;
      let amp = 1;
      let freq = 1.75;
      for (let o = 0; o < 4; o++) {
        const v = Math.abs(noise(qx * freq + o * 17.1, qy * freq - o * 9.3));
        crumple += amp * (o % 2 === 0 ? 1 - v : v);
        amp *= 0.4;
        freq *= 2.1;
      }
      crumple /= 1.62;

      /* the flat product panel, and pleats pulled tight around it */
      const dBox = sdRoundBox(x, y, PANEL, 0.05);
      const plateau = 1 - smoothstep(0, 0.085, dBox);
      const near = dBox > 0 ? Math.exp(-dBox * 5) : 1;
      // sampled on a circle so the pattern has no seam at theta = ±PI
      const pleatN =
        1 -
        Math.abs(
          noise(Math.cos(theta) * 4.6 + dBox * 1.3 + 3, Math.sin(theta) * 4.6 - dBox * 1.3),
        );
      const pleat = pleatN * pleatN * near;

      const micro = 0.05 * crumple + 0.035 * noise(x * 1.2 + 2, y * 1.2 - 6);
      const inner = 0.62 + micro;
      const outer = 0.1 + 0.52 * crumple + 0.3 * pleat;
      let h = mix(outer, inner, plateau);

      /* the two foil sheets meet at the outline */
      h *= Math.pow(smoothstep(0, 0.17, inset), 0.8);

      /* heat-seal bands down the left and right edges */
      const side = smoothstep(-0.02, 0.07, ax - ay);
      const band = smoothstep(0.865, 0.885, ax / edge) * side;
      if (band > 0) {
        const ribs = 0.04 * (0.5 + 0.5 * Math.sin(y * Math.PI * 2 * 30));
        h = mix(h, 0.04 + 0.22 * h + ribs, band);
      }
      height[idx] = clamp01(h);

      /* roughness: smears and fine grain, a touch softer on the panel */
      const smear = 0.5 + 0.5 * noise(x * 2.4 + 40, y * 1.1 - 12);
      const grain = noise(x * 46, y * 46);
      rough[idx] = clamp01(
        0.16 + 0.08 * plateau + 0.11 * smear * smear + 0.03 * grain + 0.14 * band,
      );
    }

    if (performance.now() - lastYield > 10) {
      await yieldToMain();
      lastYield = performance.now();
    }
  }

  /* --- bake to 8-bit images --- */
  const normalData = new ImageData(size, size);
  const dispData = new ImageData(size, size);
  const baseColor = new ImageData(size, size);
  const baseOrm = new ImageData(size, size);
  const slopeScale = size * DEPTH * NORMAL_GAIN * 0.5;

  for (let row = 0; row < size; row++) {
    const up = row > 0 ? row - 1 : row;
    const down = row < size - 1 ? row + 1 : row;
    for (let col = 0; col < size; col++) {
      const left = col > 0 ? col - 1 : col;
      const right = col < size - 1 ? col + 1 : col;
      const idx = row * size + col;
      const o = idx * 4;

      const dCol = (height[row * size + right] - height[row * size + left]) * slopeScale;
      const dRow = (height[down * size + col] - height[up * size + col]) * slopeScale;
      // v runs up while rows run down, so the y slope flips sign
      let nx = -dCol;
      let ny = dRow;
      const inv = 1 / Math.hypot(nx, ny, 1);
      nx *= inv;
      ny *= inv;
      normalData.data[o] = Math.round((nx * 0.5 + 0.5) * 255);
      normalData.data[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normalData.data[o + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      normalData.data[o + 3] = 255;

      const h8 = Math.round(height[idx] * 255);
      dispData.data[o] = h8;
      dispData.data[o + 1] = h8;
      dispData.data[o + 2] = h8;
      dispData.data[o + 3] = 255;

      // aluminium-bright silver; alpha carries the pouch outline
      baseColor.data[o] = 243;
      baseColor.data[o + 1] = 244;
      baseColor.data[o + 2] = 246;
      baseColor.data[o + 3] = Math.round(alpha[idx] * 255);

      // three.js reads roughness from G and metalness from B
      baseOrm.data[o] = 255;
      baseOrm.data[o + 1] = Math.round(rough[idx] * 255);
      baseOrm.data[o + 2] = 255;
      baseOrm.data[o + 3] = 255;
    }
  }

  const toCanvas = (data: ImageData) => {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    c.getContext("2d")!.putImageData(data, 0, 0);
    return c;
  };

  return {
    size,
    normal: toCanvas(normalData),
    displacement: toCanvas(dispData),
    baseColor,
    baseOrm,
  };
}

/* ------------------------------------------------------------------ label */

const TURKISH_LETTERS = /[çğıöşüÇĞİÖŞÜ]/;

function upper(name: string) {
  // Turkish upper-casing turns "i" into "İ", which is wrong for English names.
  return TURKISH_LETTERS.test(name) ? name.toLocaleUpperCase("tr") : name.toUpperCase();
}

/** Splits words into `k` consecutive lines, keeping the longest line short. */
function partitions(words: string[], k: number): string[][] {
  if (k === 1) return [[words.join(" ")]];
  const out: string[][] = [];
  const walk = (start: number, left: number, acc: string[]) => {
    if (left === 1) {
      out.push([...acc, words.slice(start).join(" ")]);
      return;
    }
    for (let end = start + 1; end <= words.length - (left - 1); end++) {
      walk(end, left - 1, [...acc, words.slice(start, end).join(" ")]);
    }
  };
  walk(0, k, []);
  return out;
}

function paintText(
  ctx: CanvasRenderingContext2D,
  size: number,
  label: FoilLabel,
  fill: string,
) {
  const panel = PANEL * size; // full panel width in px
  const cx = size / 2;
  const cy = size / 2;
  const innerW = panel * 0.8;
  const top = cy - panel * 0.4;
  const bottom = cy + panel * 0.4;

  ctx.save();
  ctx.fillStyle = fill;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  const monoSize = Math.round(size * 0.0225);
  const setTracking = (px: number) => {
    if ("letterSpacing" in ctx) {
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
    }
  };

  /* top line */
  ctx.font = `500 ${monoSize}px ${label.monoFont}`;
  setTracking(1.5);
  ctx.fillText(
    `Sipariş ${label.orderNumber}  /  Order ${label.orderNumber}`,
    cx,
    top + monoSize,
  );

  /* bottom lines */
  const smallSize = Math.round(size * 0.019);
  ctx.font = `500 ${smallSize}px ${label.monoFont}`;
  setTracking(0.8);
  ctx.fillText("Hazır olunca haber vereceğiz.", cx, bottom - smallSize * 1.55);
  ctx.fillText("We'll buzz you when it's ready.", cx, bottom - smallSize * 0.15);

  /* the big name: pick the line split that allows the largest type */
  setTracking(0);
  const words = upper(label.storeName.trim() || "QReader").split(/\s+/);
  const areaTop = top + monoSize * 2.1;
  const areaBottom = bottom - smallSize * 3.4;
  const areaH = areaBottom - areaTop;
  // Line box as a multiple of font size. Roomy enough that a cedilla (Ç, Ş)
  // on one line clears the dots (İ, Ö, Ü) on the next.
  const LINE = 1.14;
  const CAP = 0.86; // visual height of capitals in em, incl. Turkish dots

  ctx.font = `400 100px ${label.displayFont}`;
  let best = { fontSize: 0, lines: [words.join(" ")] };
  for (let k = 1; k <= Math.min(3, words.length); k++) {
    for (const lines of partitions(words, k)) {
      const widest = Math.max(...lines.map((l) => ctx.measureText(l).width)) / 100;
      const blockEm = (k - 1) * LINE + CAP;
      const fontSize = Math.min(innerW / widest, areaH / blockEm);
      if (fontSize > best.fontSize) best = { fontSize, lines };
    }
  }

  const fs = best.fontSize;
  ctx.font = `400 ${fs}px ${label.displayFont}`;
  const blockH = ((best.lines.length - 1) * LINE + CAP) * fs;
  let baseline = areaTop + (areaH - blockH) / 2 + CAP * fs;
  for (const line of best.lines) {
    ctx.fillText(line, cx, baseline);
    baseline += LINE * fs;
  }
  ctx.restore();
}

/**
 * Prints the label onto the foil: black ink in the colour map, and matte,
 * non-metal ink in the roughness/metalness map so it does not mirror.
 */
export function paintLabel(
  maps: FoilMaps,
  colorCanvas: HTMLCanvasElement,
  ormCanvas: HTMLCanvasElement,
  label: FoilLabel,
) {
  const color = colorCanvas.getContext("2d")!;
  color.globalCompositeOperation = "source-over";
  color.putImageData(maps.baseColor, 0, 0);
  color.globalCompositeOperation = "source-atop";
  paintText(color, maps.size, label, "#0b0b0d");

  const orm = ormCanvas.getContext("2d")!;
  orm.putImageData(maps.baseOrm, 0, 0);
  // G = roughness 0.6, B = metalness 0.08
  paintText(orm, maps.size, label, "rgb(255, 153, 20)");
}
