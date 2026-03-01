// Sprite sheet system for card background art
// Sheet: 10 cols × 9 rows, each sprite 100×140 px
// Layout: t1_01..t1_40 (rows 0-3), t2_01..t2_30 (rows 4-6), t3_01..t3_20 (rows 7-8)
//
// Card art modes: 0 = none (flat), 1 = procedural, 2 = pixel sprites

export const SPRITE_W = 100;
export const SPRITE_H = 140;
export const SHEET_COLS = 10;

// Build card ID → {col, row} map
const CARD_SPRITE_MAP = {};
for (let i = 1; i <= 40; i++) {
  const id = `t1_${String(i).padStart(2, "0")}`;
  CARD_SPRITE_MAP[id] = { col: (i - 1) % SHEET_COLS, row: Math.floor((i - 1) / SHEET_COLS) };
}
for (let i = 1; i <= 30; i++) {
  const id = `t2_${String(i).padStart(2, "0")}`;
  CARD_SPRITE_MAP[id] = { col: (i - 1) % SHEET_COLS, row: 4 + Math.floor((i - 1) / SHEET_COLS) };
}
for (let i = 1; i <= 20; i++) {
  const id = `t3_${String(i).padStart(2, "0")}`;
  CARD_SPRITE_MAP[id] = { col: (i - 1) % SHEET_COLS, row: 7 + Math.floor((i - 1) / SHEET_COLS) };
}

export { CARD_SPRITE_MAP };

let spriteSheet = null;
let spriteSheetReady = false;

// 0 = none (flat color), 1 = procedural, 2 = pixel sprites
let cardArtMode = 2;

export function setCardArtMode(mode) { cardArtMode = mode; }
export function getCardArtMode() { return cardArtMode; }

// Backwards-compat shim
export function setCardArtEnabled(v) { cardArtMode = v ? 2 : 0; }

export function loadSpriteSheet(basePath = "") {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      spriteSheet = img;
      spriteSheetReady = true;
      resolve(true);
    };
    img.onerror = () => {
      console.warn("Card sprite sheet not found — using fallback colors");
      resolve(false);
    };
    img.src = basePath + "/assets/cards.png";
  });
}

// Draw a card's sprite onto the canvas. Returns true if drawn, false if fallback needed.
export function drawCardSprite(ctx, x, y, w, h, cardId) {
  if (cardArtMode !== 2) return false;
  if (!spriteSheetReady || !spriteSheet) return false;
  const pos = CARD_SPRITE_MAP[cardId];
  if (!pos) return false;

  const sx = pos.col * SPRITE_W;
  const sy = pos.row * SPRITE_H;

  ctx.drawImage(spriteSheet, sx, sy, SPRITE_W, SPRITE_H, x, y, w, h);
  return true;
}

/* ---------------------------------------------------------
   Procedural card art (mode 1)
   Tier 1 = Aurora, Tier 2 = Gem Facet, Tier 3 = Art Deco
   --------------------------------------------------------- */

const CARD_BG = {
  white: "#E9EEF3", blue: "#2D6CDF", green: "#2E9B5F",
  red:   "#D94A4A", black: "#2B2B2B",
};
const GEM_PALETTE = {
  white:  { color: "#e8e8e8", dark: "#b0b0b0", accent: "#d4e4f4" },
  blue:   { color: "#2255cc", dark: "#1a3a88", accent: "#88bbff" },
  green:  { color: "#1a8a4a", dark: "#0d5a2d", accent: "#66dd99" },
  red:    { color: "#cc2233", dark: "#881122", accent: "#ff8899" },
  black:  { color: "#333333", dark: "#111111", accent: "#777777" },
};

// --- Color helpers ---
function hexToRgb(hex) {
  hex = hex.replace("#", "");
  return {
    r: parseInt(hex.substring(0, 2), 16),
    g: parseInt(hex.substring(2, 4), 16),
    b: parseInt(hex.substring(4, 6), 16),
  };
}
function rgb(c, a = 1) { return `rgba(${c.r},${c.g},${c.b},${a})`; }
function mix(a, b, t) {
  return { r: Math.round(a.r + (b.r - a.r) * t), g: Math.round(a.g + (b.g - a.g) * t), b: Math.round(a.b + (b.b - a.b) * t) };
}
function lighten(c, amt) { return mix(c, {r:255,g:255,b:255}, amt); }
function darken(c, amt) { return mix(c, {r:0,g:0,b:0}, amt); }

// --- Seeded RNG ---
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function parseTier(cardId) {
  if (!cardId) return 0;
  const m = cardId.match(/^t(\d)/);
  return m ? parseInt(m[1], 10) : 0;
}

function cardSeed(cardId) {
  const m = cardId.match(/\d+$/);
  return m ? parseInt(m[0], 10) : 0;
}

// --- Offscreen canvas cache ---
const _proceduralCache = new Map();

export function clearProceduralCache() {
  _proceduralCache.clear();
}

// Draw procedural card art. Returns true if drawn, false otherwise.
export function drawCardProcedural(ctx, x, y, w, h, cardId, bonus) {
  if (cardArtMode !== 1) return false;
  const tier = parseTier(cardId);
  if (!tier) return false;

  const dpr = (ctx.canvas?.width && ctx.canvas?.style?.width)
    ? ctx.canvas.width / parseFloat(ctx.canvas.style.width || ctx.canvas.width)
    : 1;
  const cacheKey = `${cardId}|${w}|${h}|${dpr}`;

  let cached = _proceduralCache.get(cacheKey);
  if (!cached) {
    // Render to offscreen canvas
    const oc = document.createElement("canvas");
    oc.width = Math.round(w * dpr);
    oc.height = Math.round(h * dpr);
    const octx = oc.getContext("2d");
    octx.scale(dpr, dpr);

    const rng = mulberry32(cardSeed(cardId) * 777 + tier * 42);
    const variant = rng() > 0.5 ? 1 : 0;

    if (tier === 1) drawTier1Aurora(octx, w, h, bonus, rng);
    else if (tier === 2) drawTier2Facet(octx, w, h, bonus, rng);
    else if (tier === 3) drawTier3ArtDeco(octx, w, h, bonus, rng, variant);

    cached = oc;
    _proceduralCache.set(cacheKey, cached);
  }

  ctx.drawImage(cached, x, y, w, h);
  return true;
}

// --- Tier 1: Aurora (soft overlapping radial gradients) ---
function drawTier1Aurora(ctx, w, h, bonus, rng) {
  const base = hexToRgb(CARD_BG[bonus] || "#cccccc");
  const pal = GEM_PALETTE[bonus] || GEM_PALETTE.white;
  const accent = hexToRgb(pal.accent);
  const dark = hexToRgb(pal.dark);

  // Dark base
  ctx.fillStyle = rgb(darken(base, 0.35));
  ctx.fillRect(0, 0, w, h);

  // Three overlapping radial gradient blobs
  const blobs = [
    { cx: w * (0.15 + rng() * 0.2), cy: h * (0.2 + rng() * 0.2), r: h * (0.4 + rng() * 0.15), color: accent, a: 0.35 },
    { cx: w * (0.6 + rng() * 0.2), cy: h * (0.5 + rng() * 0.2), r: h * (0.35 + rng() * 0.15), color: base, a: 0.4 },
    { cx: w * (0.3 + rng() * 0.2), cy: h * (0.7 + rng() * 0.15), r: h * (0.28 + rng() * 0.12), color: lighten(dark, 0.3), a: 0.3 },
  ];
  for (const b of blobs) {
    const g = ctx.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, b.r);
    g.addColorStop(0, rgb(b.color, b.a));
    g.addColorStop(0.6, rgb(b.color, b.a * 0.4));
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // Subtle sweep highlight
  const sweep = ctx.createLinearGradient(0, 0, w, h * 0.5);
  sweep.addColorStop(0, "rgba(255,255,255,0.08)");
  sweep.addColorStop(0.5, "rgba(255,255,255,0.02)");
  sweep.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sweep;
  ctx.fillRect(0, 0, w, h);
}

// --- Tier 2: Gem Facet / Stained Glass (triangulated facets) ---
function drawTier2Facet(ctx, w, h, bonus, rng) {
  const base = hexToRgb(CARD_BG[bonus] || "#cccccc");

  // Base fill
  ctx.fillStyle = rgb(darken(base, 0.15));
  ctx.fillRect(0, 0, w, h);

  // Generate triangular facets via jittered point grid
  const cols = 5, rows = 7;
  const pts = [];
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const jx = (r > 0 && r < rows && c > 0 && c < cols) ? (rng() - 0.5) * (w / cols) * 0.6 : 0;
      const jy = (r > 0 && r < rows && c > 0 && c < cols) ? (rng() - 0.5) * (h / rows) * 0.6 : 0;
      pts.push({ x: (c / cols) * w + jx, y: (r / rows) * h + jy });
    }
  }

  // Draw triangulated quads as pairs of triangles
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * (cols + 1) + c;
      const tl = pts[i], tr = pts[i + 1];
      const bl = pts[i + cols + 1], br = pts[i + cols + 2];

      const tris = [[tl, tr, bl], [tr, br, bl]];
      for (const tri of tris) {
        const shade = rng() * 0.4 - 0.15;
        const facetColor = shade > 0 ? lighten(base, shade) : darken(base, -shade);
        ctx.beginPath();
        ctx.moveTo(tri[0].x, tri[0].y);
        ctx.lineTo(tri[1].x, tri[1].y);
        ctx.lineTo(tri[2].x, tri[2].y);
        ctx.closePath();
        ctx.fillStyle = rgb(facetColor, 0.85);
        ctx.fill();
        ctx.strokeStyle = rgb(lighten(base, 0.25), 0.3);
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }
  }

  // Specular highlight top
  const sg = ctx.createLinearGradient(0, 0, 0, h * 0.35);
  sg.addColorStop(0, "rgba(255,255,255,0.18)");
  sg.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, w, h * 0.35);
}

// --- Tier 3: Art Deco Geometric (gold line work) ---
function drawTier3ArtDeco(ctx, w, h, bonus, rng, variant) {
  const base = hexToRgb(CARD_BG[bonus] || "#cccccc");
  const gold = hexToRgb("#d4a017");

  // Rich dark base gradient
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, rgb(darken(base, 0.1)));
  bg.addColorStop(0.5, rgb(darken(base, 0.25)));
  bg.addColorStop(1, rgb(darken(base, 0.35)));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2, cy = h / 2;

  if (variant === 0) {
    // Variant A: Sunburst radiating lines + concentric diamonds
    ctx.strokeStyle = rgb(gold, 0.25);
    ctx.lineWidth = 1;
    const rays = 24;
    for (let i = 0; i < rays; i++) {
      const angle = (Math.PI * 2 * i) / rays;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * w, cy + Math.sin(angle) * h);
      ctx.stroke();
    }

    // Concentric diamonds
    for (let s = 1; s <= 4; s++) {
      const sz = s * Math.min(w, h) * 0.12;
      ctx.beginPath();
      ctx.moveTo(cx, cy - sz);
      ctx.lineTo(cx + sz * 0.7, cy);
      ctx.lineTo(cx, cy + sz);
      ctx.lineTo(cx - sz * 0.7, cy);
      ctx.closePath();
      ctx.strokeStyle = rgb(gold, 0.15 + s * 0.06);
      ctx.lineWidth = 1 + s * 0.3;
      ctx.stroke();
    }

    // Central circle accent
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(w, h) * 0.08, 0, Math.PI * 2);
    ctx.fillStyle = rgb(gold, 0.2);
    ctx.fill();
    ctx.strokeStyle = rgb(gold, 0.5);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else {
    // Variant B: Chevron pattern + stepped frame
    const chevronCount = 8;
    ctx.strokeStyle = rgb(gold, 0.2);
    ctx.lineWidth = 1.2;
    for (let i = 1; i <= chevronCount; i++) {
      const offset = i * (h / (chevronCount + 1));
      ctx.beginPath();
      ctx.moveTo(0, offset);
      ctx.lineTo(cx, offset - h * 0.06);
      ctx.lineTo(w, offset);
      ctx.stroke();
    }

    // Stepped inner frame
    const inset = 12;
    const step = 6;
    ctx.strokeStyle = rgb(gold, 0.35);
    ctx.lineWidth = 1;
    ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
    // Corner steps
    for (const [sx, sy, dx, dy] of [
      [inset, inset, 1, 1],
      [w - inset, inset, -1, 1],
      [inset, h - inset, 1, -1],
      [w - inset, h - inset, -1, -1],
    ]) {
      ctx.beginPath();
      ctx.moveTo(sx, sy + dy * step * 3);
      ctx.lineTo(sx + dx * step, sy + dy * step * 3);
      ctx.lineTo(sx + dx * step, sy + dy * step);
      ctx.lineTo(sx + dx * step * 3, sy + dy * step);
      ctx.lineTo(sx + dx * step * 3, sy);
      ctx.strokeStyle = rgb(gold, 0.35);
      ctx.stroke();
    }

    // Horizontal divider with diamond
    const divY = h * 0.25;
    ctx.beginPath();
    ctx.moveTo(inset, divY);
    ctx.lineTo(cx - 8, divY);
    ctx.moveTo(cx + 8, divY);
    ctx.lineTo(w - inset, divY);
    ctx.strokeStyle = rgb(gold, 0.4);
    ctx.stroke();
    // Diamond accent
    ctx.beginPath();
    ctx.moveTo(cx, divY - 5);
    ctx.lineTo(cx + 6, divY);
    ctx.lineTo(cx, divY + 5);
    ctx.lineTo(cx - 6, divY);
    ctx.closePath();
    ctx.fillStyle = rgb(gold, 0.4);
    ctx.fill();
  }
}

/* ---------------------------------------------------------
   Noble tile art (modes 0/1/2)
   Mode 0 (plain) = Damask Wallpaper
   Mode 1 (procedural) = Constellation
   Mode 2 (pixel) = Royal Portrait
   --------------------------------------------------------- */

const GEM_HEX = {
  white: "#e8e8e8", blue: "#2255cc", green: "#1a8a4a",
  red: "#cc2233", black: "#444444",
};

function nobleSeed(noble) {
  const m = (noble.id || "").match(/\d+$/);
  return m ? parseInt(m[0], 10) : 1;
}

function nobleReqColors(noble) {
  const req = noble.req || {};
  return Object.keys(req).filter(c => req[c] > 0);
}

// --- Mode 0: Damask Wallpaper ---
export function drawNobleDamask(ctx, x, y, w, h, noble) {
  const cols = nobleReqColors(noble);
  const primary = hexToRgb(GEM_HEX[cols[0]] || "#888888");
  const secondary = hexToRgb(GEM_HEX[cols[1] || cols[0]] || "#888888");

  // Rich base gradient
  const bg = ctx.createLinearGradient(x, y, x + w, y + h);
  bg.addColorStop(0, rgb(darken(primary, 0.3)));
  bg.addColorStop(1, rgb(darken(secondary, 0.3)));
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);

  // Damask motifs — repeating diamond-scroll pattern
  const motifColor = rgb(lighten(mix(primary, secondary, 0.5), 0.2), 0.15);
  const cellW = w / 3, cellH = h / 3;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cx = x + col * cellW + cellW / 2;
      const cy = y + row * cellH + cellH / 2;
      const s = Math.min(cellW, cellH) * 0.35;

      ctx.strokeStyle = motifColor;
      ctx.fillStyle = motifColor;
      ctx.lineWidth = 1;

      // Central diamond
      ctx.beginPath();
      ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s * 0.5, cy);
      ctx.lineTo(cx, cy + s); ctx.lineTo(cx - s * 0.5, cy);
      ctx.closePath();
      ctx.fill();

      // Scroll curves
      ctx.beginPath();
      ctx.arc(cx - s * 0.4, cy - s * 0.4, s * 0.3, 0, Math.PI, false);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + s * 0.4, cy + s * 0.4, s * 0.3, Math.PI, 0, false);
      ctx.stroke();

      // Accent dots at cardinal points
      for (const [dx, dy] of [[0, -s * 0.7], [0, s * 0.7], [-s * 0.35, 0], [s * 0.35, 0]]) {
        ctx.beginPath();
        ctx.arc(cx + dx, cy + dy, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Radial vignette overlay
  const vig = ctx.createRadialGradient(x + w / 2, y + h / 2, w * 0.2, x + w / 2, y + h / 2, w * 0.8);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.25)");
  ctx.fillStyle = vig;
  ctx.fillRect(x, y, w, h);

  return true;
}

// --- Mode 1: Constellation ---
export function drawNobleProcedural(ctx, x, y, w, h, noble) {
  if (cardArtMode !== 1) return false;

  const cols = nobleReqColors(noble);
  const colors = cols.map(c => hexToRgb(GEM_HEX[c] || "#888888"));
  const rng = mulberry32(nobleSeed(noble) * 571 + 97);

  // Deep night sky gradient tinted by primary gem color
  const sky = ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, w * 0.9);
  sky.addColorStop(0, rgb(darken(colors[0], 0.25)));
  sky.addColorStop(0.6, "#0d0d1a");
  sky.addColorStop(1, "#080810");
  ctx.fillStyle = sky;
  ctx.fillRect(x, y, w, h);

  // Scattered background stars
  for (let i = 0; i < 50; i++) {
    const sx = x + rng() * w;
    const sy = y + rng() * h;
    const sr = 0.3 + rng() * 1.0;
    const alpha = 0.2 + rng() * 0.5;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fill();
  }

  // Constellation nodes
  const nodeCount = 6 + Math.floor(rng() * 3);
  const nodes = [];
  for (let i = 0; i < nodeCount; i++) {
    nodes.push({
      x: x + 18 + rng() * (w - 36),
      y: y + 18 + rng() * (h - 36),
    });
  }

  // Constellation lines
  ctx.strokeStyle = rgb(lighten(colors[0], 0.4), 0.3);
  ctx.lineWidth = 0.8;
  for (let i = 0; i < nodes.length - 1; i++) {
    ctx.beginPath();
    ctx.moveTo(nodes[i].x, nodes[i].y);
    ctx.lineTo(nodes[i + 1].x, nodes[i + 1].y);
    ctx.stroke();
  }
  // Extra connections
  if (nodes.length > 3) {
    ctx.beginPath();
    ctx.moveTo(nodes[0].x, nodes[0].y);
    ctx.lineTo(nodes[2].x, nodes[2].y);
    ctx.stroke();
  }
  if (nodes.length > 5) {
    ctx.beginPath();
    ctx.moveTo(nodes[1].x, nodes[1].y);
    ctx.lineTo(nodes[nodes.length - 1].x, nodes[nodes.length - 1].y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(nodes[3].x, nodes[3].y);
    ctx.lineTo(nodes[0].x, nodes[0].y);
    ctx.stroke();
  }

  // Draw nodes as bright stars with colored glow
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const ci = i % colors.length;
    // Glow
    const sg = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 10);
    sg.addColorStop(0, rgb(lighten(colors[ci], 0.5), 0.55));
    sg.addColorStop(0.4, rgb(colors[ci], 0.2));
    sg.addColorStop(1, rgb(colors[ci], 0));
    ctx.fillStyle = sg;
    ctx.fillRect(n.x - 10, n.y - 10, 20, 20);
    // Star dot
    ctx.beginPath();
    ctx.arc(n.x, n.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = rgb(lighten(colors[ci], 0.8));
    ctx.fill();
  }

  // Nebula washes per gem color
  for (let i = 0; i < colors.length; i++) {
    const nx = x + 20 + rng() * (w - 40);
    const ny = y + 20 + rng() * (h - 40);
    const nr = 25 + rng() * 35;
    const ng = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
    ng.addColorStop(0, rgb(colors[i], 0.1));
    ng.addColorStop(0.5, rgb(colors[i], 0.04));
    ng.addColorStop(1, rgb(colors[i], 0));
    ctx.fillStyle = ng;
    ctx.fillRect(nx - nr, ny - nr, nr * 2, nr * 2);
  }

  return true;
}

// --- Mode 2: Unique pixel art per noble (25×25) ---

const NOBLE_PX = 25;
const SKIN = "#e8c8a0";
const SKIN_DARK = "#c8a078";
const SKIN_SHADOW = "#a08060";
const N_GOLD = "#d4a017";
const N_GOLD_DARK = "#8a6a0f";
const N_GOLD_LIGHT = "#ffe066";

const GEM_DARK_HEX = {
  white: "#b0b0b0", blue: "#1a3a88", green: "#0d5a2d",
  red: "#881122", black: "#222222",
};
const GEM_LIGHT_HEX = {
  white: "#ffffff", blue: "#88bbff", green: "#66dd99",
  red: "#ff8899", black: "#777777",
};

// n_01: The Diplomat — hand raised in greeting, doublet with sash
function _drawDiplomat(px, pxRect, noble) {
  const cols = nobleReqColors(noble);
  const c1 = GEM_HEX[cols[0]], c2 = GEM_HEX[cols[1] || cols[0]];
  const d1 = GEM_DARK_HEX[cols[0]], d2 = GEM_DARK_HEX[cols[1] || cols[0]];

  pxRect(0, 0, NOBLE_PX, NOBLE_PX, d1);
  pxRect(0, 0, 12, NOBLE_PX, d2);
  // Body / doublet
  pxRect(8, 13, 8, 5, c1); pxRect(7, 15, 10, 4, c1);
  px(12, 14, N_GOLD); px(12, 16, N_GOLD); // buttons
  pxRect(10, 12, 5, 1, "#fff"); // collar
  // Raised arm
  pxRect(16, 8, 2, 5, c1); px(17, 7, SKIN); px(18, 7, SKIN); px(18, 6, SKIN);
  // Other arm
  pxRect(7, 14, 2, 4, c1); px(7, 18, SKIN);
  // Head
  pxRect(10, 6, 6, 6, SKIN);
  pxRect(10, 5, 6, 2, "#2a2a2a"); px(10, 7, "#2a2a2a");
  px(12, 8, "#222"); px(14, 8, "#222"); // eyes
  px(13, 9, SKIN_DARK); // nose
  px(12, 10, SKIN_DARK); px(13, 10, SKIN_DARK); // mouth
  // Sash
  px(9, 13, c2); px(10, 14, c2); px(11, 15, c2); px(12, 16, c2); px(13, 17, c2);
  px(9, 14, N_GOLD); // medal
}

// n_02: The Admiral — bicorn hat, epaulettes, stern face
function _drawAdmiral(px, pxRect, noble) {
  const cols = nobleReqColors(noble);
  const c1 = GEM_HEX[cols[0]], c2 = GEM_HEX[cols[1] || cols[0]];
  const d1 = GEM_DARK_HEX[cols[0]];

  pxRect(0, 0, NOBLE_PX, NOBLE_PX, "#0a1020");
  pxRect(0, 18, NOBLE_PX, 7, "#0a0a18");
  // Naval coat
  pxRect(8, 14, 9, 5, c1); pxRect(7, 16, 11, 4, c1);
  pxRect(11, 14, 2, 5, d1); // front
  px(10, 15, N_GOLD); px(10, 17, N_GOLD); px(13, 15, N_GOLD); px(13, 17, N_GOLD);
  // Epaulettes
  pxRect(7, 13, 3, 2, N_GOLD); pxRect(15, 13, 3, 2, N_GOLD);
  px(7, 15, N_GOLD_DARK); px(17, 15, N_GOLD_DARK);
  // High collar
  pxRect(9, 12, 7, 2, c2); pxRect(10, 12, 5, 1, N_GOLD);
  // Head
  pxRect(10, 6, 6, 6, SKIN);
  px(11, 8, "#222"); px(14, 8, "#222");
  pxRect(11, 7, 2, 1, SKIN_SHADOW); pxRect(13, 7, 2, 1, SKIN_SHADOW);
  px(12, 9, SKIN_DARK);
  pxRect(11, 10, 3, 1, SKIN_DARK);
  // Bicorn hat
  pxRect(9, 4, 8, 3, c1); pxRect(10, 3, 6, 1, c1);
  pxRect(9, 6, 8, 1, N_GOLD);
  px(13, 4, c2); px(12, 3, c2);
}

// n_03: The Duchess — updo, fan, pearls
function _drawDuchess(px, pxRect, noble) {
  const cols = nobleReqColors(noble);
  const c1 = GEM_HEX[cols[0]], c2 = GEM_HEX[cols[1] || cols[0]];
  const d1 = GEM_DARK_HEX[cols[0]], d2 = GEM_DARK_HEX[cols[1] || cols[0]];

  pxRect(0, 0, NOBLE_PX, NOBLE_PX, d2); pxRect(0, 0, NOBLE_PX, 12, d1);
  // Gown
  pxRect(6, 14, 13, 6, c1); pxRect(5, 17, 15, 4, c1);
  pxRect(10, 13, 5, 1, c1); pxRect(6, 14, 13, 1, c2);
  px(11, 12, "#ddd"); px(12, 12, "#ddd"); px(13, 12, "#ddd"); // lace
  px(10, 13, "#eee"); px(12, 13, "#eee"); px(14, 13, "#eee"); // pearls
  // Fan
  pxRect(17, 14, 3, 1, c2); pxRect(18, 13, 3, 1, c2); pxRect(19, 12, 2, 1, c2);
  px(17, 15, N_GOLD_DARK); px(16, 15, SKIN); px(17, 15, SKIN);
  // Left arm
  pxRect(6, 15, 2, 3, c1); px(6, 18, SKIN);
  // Head
  pxRect(10, 5, 6, 7, SKIN);
  pxRect(10, 3, 6, 3, "#5a3a1a"); pxRect(11, 2, 4, 2, "#5a3a1a");
  px(12, 1, "#5a3a1a"); px(13, 1, "#5a3a1a");
  px(10, 6, "#5a3a1a"); px(15, 6, "#5a3a1a");
  px(14, 2, N_GOLD); px(13, 2, c2); // hair ornament
  px(11, 8, "#222"); px(14, 8, "#222"); // eyes
  px(11, 7, "#333"); px(14, 7, "#333"); // lashes
  px(12, 10, "#c07070"); px(13, 10, "#c07070"); // lips
}

// n_04: The Cardinal — mitre, vestments, hands clasped
function _drawCardinal(px, pxRect, noble) {
  const cols = nobleReqColors(noble);
  const c1 = GEM_HEX[cols[0]], c2 = GEM_HEX[cols[1] || cols[0]];

  pxRect(0, 0, NOBLE_PX, NOBLE_PX, "#1a1018");
  // Arch
  px(4, 2, "#2a2028"); px(5, 1, "#2a2028"); pxRect(6, 0, 13, 1, "#2a2028");
  px(19, 1, "#2a2028"); px(20, 2, "#2a2028");
  pxRect(4, 3, 1, 21, "#2a2028"); pxRect(20, 3, 1, 21, "#2a2028");
  // Robes
  pxRect(8, 14, 9, 4, c1); pxRect(7, 17, 11, 4, c1); pxRect(6, 19, 13, 3, c1);
  pxRect(12, 14, 1, 8, N_GOLD); // center stripe
  pxRect(9, 13, 2, 6, c2); pxRect(14, 13, 2, 6, c2); // stole
  px(9, 19, N_GOLD); px(15, 19, N_GOLD); // cross ends
  pxRect(11, 16, 3, 2, SKIN); // clasped hands
  // Head
  pxRect(10, 7, 5, 6, SKIN);
  px(11, 9, "#222"); px(13, 9, "#222");
  px(12, 10, SKIN_DARK);
  px(11, 11, SKIN_DARK); px(12, 11, SKIN_DARK);
  // Mitre
  pxRect(10, 4, 5, 4, c2); pxRect(11, 2, 3, 3, c2); px(12, 1, c2);
  pxRect(10, 6, 5, 1, N_GOLD);
  px(12, 3, N_GOLD); px(11, 4, N_GOLD); px(12, 4, N_GOLD); px(13, 4, N_GOLD); // cross
}

// n_05: The Knight — armor, sword, plumed helm
function _drawKnight(px, pxRect, noble) {
  const cols = nobleReqColors(noble);
  const c1 = GEM_HEX[cols[0]], c2 = GEM_HEX[cols[1] || cols[0]];
  const d1 = GEM_DARK_HEX[cols[0]];

  pxRect(0, 0, NOBLE_PX, NOBLE_PX, "#2a2a2a");
  pxRect(0, 0, 6, 4, "#2e2e2e"); pxRect(8, 0, 5, 4, "#262626");
  pxRect(0, 5, 5, 4, "#282828"); pxRect(7, 5, 6, 4, "#2c2c2c");
  // Banner on wall
  pxRect(19, 1, 4, 8, c1); pxRect(19, 8, 4, 1, c2);
  px(20, 9, c1); px(21, 9, c1);
  // Armor
  pxRect(9, 12, 7, 6, "#888"); pxRect(8, 14, 9, 5, "#888");
  pxRect(12, 12, 1, 6, "#999");
  px(11, 13, "#777"); px(13, 13, "#777");
  // Tabard
  pxRect(10, 15, 5, 4, c1);
  px(12, 16, c2); px(11, 17, c2); px(12, 17, c2); px(13, 17, c2);
  // Sword
  pxRect(7, 3, 1, 14, "#aaa"); px(7, 2, "#ccc");
  pxRect(5, 10, 5, 1, N_GOLD); px(7, 17, N_GOLD_DARK);
  // Gauntlets
  px(6, 13, "#777"); px(8, 13, "#777"); px(6, 14, "#777"); px(8, 14, "#777");
  // Helmet
  pxRect(10, 5, 6, 7, "#999"); pxRect(11, 4, 4, 1, "#999");
  pxRect(11, 8, 4, 1, "#222"); pxRect(10, 9, 6, 1, "#777");
  pxRect(13, 2, 2, 3, c2); px(14, 1, c2); // plume
  // Pauldrons
  pxRect(8, 11, 2, 2, "#aaa"); pxRect(16, 11, 2, 2, "#aaa");
}

// n_06: The Scholar — spectacles, book, academic cap
function _drawScholar(px, pxRect, noble) {
  const cols = nobleReqColors(noble);
  const c1 = GEM_HEX[cols[0]], c2 = GEM_HEX[cols[1] || cols[0]];
  const c3 = cols[2] ? GEM_HEX[cols[2]] : c1;

  pxRect(0, 0, NOBLE_PX, NOBLE_PX, "#1a1510");
  // Bookshelf
  pxRect(1, 1, 5, 3, "#6a3a1a"); pxRect(1, 5, 5, 3, "#6a3a1a");
  px(2, 1, c1); px(3, 1, c2); px(4, 1, c3);
  px(2, 2, c1); px(3, 2, c2); px(4, 2, c3);
  px(2, 5, c2); px(3, 5, c1); px(4, 5, c3);
  px(2, 6, c2); px(3, 6, c1); px(4, 6, c3);
  pxRect(1, 4, 5, 1, "#5a2a0a"); pxRect(1, 8, 5, 1, "#5a2a0a");
  // Robe
  pxRect(9, 13, 8, 5, c1); pxRect(8, 16, 10, 5, c1);
  pxRect(9, 13, 8, 1, c2); pxRect(11, 12, 4, 1, "#ddd");
  // Arms / book
  pxRect(8, 14, 2, 4, c1); pxRect(16, 14, 2, 4, c1);
  px(9, 17, SKIN); px(16, 17, SKIN);
  pxRect(9, 17, 8, 4, "#eee"); pxRect(9, 17, 4, 4, "#f5f5e8");
  pxRect(13, 17, 1, 4, "#ccc");
  px(10, 18, "#888"); px(11, 18, "#888"); px(10, 19, "#888"); px(11, 19, "#888");
  px(14, 18, "#888"); px(15, 18, "#888"); px(14, 19, "#888"); px(15, 19, "#888");
  // Head
  pxRect(11, 5, 5, 7, SKIN);
  pxRect(11, 4, 5, 2, "#888888"); px(11, 6, "#888888"); px(15, 6, "#888888");
  px(12, 8, "#334"); px(14, 8, "#334"); px(13, 8, "#888"); // spectacles
  px(13, 9, SKIN_DARK); px(12, 10, SKIN_DARK); px(13, 10, SKIN_DARK);
  // Cap
  pxRect(11, 3, 5, 2, c2); pxRect(12, 2, 3, 1, c2);
  px(16, 3, N_GOLD); px(17, 4, N_GOLD); // tassel
}

// n_07: The Merchant — fur collar, scales
function _drawMerchant(px, pxRect, noble) {
  const cols = nobleReqColors(noble);
  const c1 = GEM_HEX[cols[0]], c2 = GEM_HEX[cols[1] || cols[0]];
  const c3 = cols[2] ? GEM_HEX[cols[2]] : c1;
  const d1 = GEM_DARK_HEX[cols[0]];

  pxRect(0, 0, NOBLE_PX, NOBLE_PX, "#1a1510");
  pxRect(0, 19, NOBLE_PX, 6, "#2a1a0a");
  // Rich coat
  pxRect(7, 13, 10, 6, c1); pxRect(6, 16, 12, 5, c1);
  pxRect(7, 12, 3, 2, "#ddd"); pxRect(14, 12, 3, 2, "#ddd"); // fur
  px(8, 14, "#ccc"); px(15, 14, "#ccc");
  pxRect(10, 14, 4, 4, c2); // vest
  px(10, 13, N_GOLD); px(11, 14, N_GOLD); px(13, 14, N_GOLD); px(14, 13, N_GOLD); // chain
  // Arm holding scales
  pxRect(17, 9, 2, 5, c1); px(18, 8, SKIN);
  pxRect(15, 8, 7, 1, N_GOLD); px(18, 7, N_GOLD);
  px(15, 9, c3); px(16, 9, N_GOLD_DARK); px(20, 9, N_GOLD_DARK); px(21, 9, c2);
  // Left arm
  pxRect(6, 14, 2, 4, c1); px(6, 18, SKIN);
  // Head
  pxRect(10, 5, 6, 7, SKIN);
  pxRect(10, 10, 6, 2, "#5a3a1a"); px(10, 9, "#5a3a1a"); px(15, 9, "#5a3a1a"); // beard
  pxRect(10, 4, 6, 2, "#5a3a1a"); px(10, 6, "#5a3a1a"); px(15, 6, "#5a3a1a"); // hair
  pxRect(10, 2, 6, 3, c1); pxRect(11, 1, 4, 1, c1); pxRect(10, 4, 6, 1, d1); // hat
  px(13, 3, N_GOLD); // badge
  px(11, 7, "#222"); px(14, 7, "#222");
  px(12, 8, SKIN_DARK); px(13, 8, SKIN_DARK);
}

// n_08: The Countess — tiara, pendant, hand at chin
function _drawCountess(px, pxRect, noble) {
  const cols = nobleReqColors(noble);
  const c1 = GEM_HEX[cols[0]], c2 = GEM_HEX[cols[1] || cols[0]];
  const c3 = cols[2] ? GEM_HEX[cols[2]] : c1;

  pxRect(0, 0, NOBLE_PX, NOBLE_PX, "#0a1a10");
  px(3, 2, "#aabbcc"); px(8, 1, "#aabbcc"); px(18, 3, "#aabbcc"); px(22, 1, "#aabbcc");
  // Gown
  pxRect(8, 14, 9, 3, c1); pxRect(6, 17, 13, 4, c1); pxRect(5, 20, 15, 3, c1);
  pxRect(10, 12, 5, 3, c2); // bodice
  pxRect(9, 14, 7, 1, N_GOLD); // sash
  pxRect(12, 17, 1, 5, c2);
  // Arms
  pxRect(8, 13, 2, 3, c1); pxRect(15, 13, 2, 3, c1);
  px(17, 14, c2); px(18, 15, c2); px(19, 16, c2); // shawl
  // Head
  pxRect(10, 5, 6, 7, SKIN);
  pxRect(10, 3, 6, 3, "#2a2a2a"); pxRect(11, 2, 4, 1, "#2a2a2a");
  px(10, 6, "#2a2a2a"); px(15, 6, "#2a2a2a");
  // Tiara
  px(11, 3, N_GOLD); px(12, 2, N_GOLD); px(13, 2, c1); px(14, 2, N_GOLD); px(13, 1, N_GOLD);
  // Necklace + pendant
  px(10, 12, "#eee"); px(11, 12, "#eee"); px(13, 12, "#eee"); px(14, 12, "#eee");
  px(12, 13, c3);
  // Eyes
  px(11, 7, "#222"); px(14, 7, "#222"); px(11, 8, "#556"); px(14, 8, "#556");
  px(12, 10, "#c07070"); px(13, 10, "#c07070"); // lips
  // Hand at chin
  px(9, 10, SKIN); px(9, 11, SKIN);
}

// n_09: The General — decorated uniform, sword at hip
function _drawGeneral(px, pxRect, noble) {
  const cols = nobleReqColors(noble);
  const c1 = GEM_HEX[cols[0]], c2 = GEM_HEX[cols[1] || cols[0]];
  const c3 = cols[2] ? GEM_HEX[cols[2]] : c1;
  const d1 = GEM_DARK_HEX[cols[0]];

  pxRect(0, 0, NOBLE_PX, NOBLE_PX, "#1a1a20");
  pxRect(0, 18, NOBLE_PX, 7, "#151518");
  // Uniform
  pxRect(8, 12, 9, 6, c1); pxRect(7, 15, 11, 6, c1);
  pxRect(12, 12, 1, 6, N_GOLD); // placket
  px(10, 13, N_GOLD); px(14, 13, N_GOLD); px(10, 15, N_GOLD); px(14, 15, N_GOLD);
  px(10, 17, N_GOLD); px(14, 17, N_GOLD);
  px(9, 13, c2); px(9, 14, c3); // medals
  px(15, 12, c2); px(14, 13, c2); px(13, 14, c2); // sash
  pxRect(10, 11, 5, 1, d1); // collar
  // Arms
  pxRect(7, 13, 2, 4, c1); pxRect(16, 13, 2, 4, c1);
  // Sword at hip
  pxRect(5, 16, 1, 6, "#aaa");
  px(5, 15, N_GOLD); px(4, 16, N_GOLD); px(6, 16, N_GOLD);
  // Head
  pxRect(10, 4, 6, 7, SKIN);
  px(11, 7, "#222"); px(14, 7, "#222");
  pxRect(11, 6, 2, 1, SKIN_SHADOW); pxRect(13, 6, 2, 1, SKIN_SHADOW);
  px(12, 8, SKIN_DARK);
  pxRect(10, 9, 6, 1, SKIN_DARK); pxRect(11, 9, 3, 1, SKIN_SHADOW);
  // Shako hat
  pxRect(10, 1, 6, 4, c1); pxRect(11, 0, 4, 1, c1);
  pxRect(11, 2, 4, 1, N_GOLD);
  px(16, 1, c2); px(16, 0, c2); px(17, 0, c2); // plume
}

// n_10: The Sage — long beard, staff with crystal
function _drawSage(px, pxRect, noble) {
  const cols = nobleReqColors(noble);
  const c1 = GEM_HEX[cols[0]], c2 = GEM_HEX[cols[1] || cols[0]];
  const c3 = cols[2] ? GEM_HEX[cols[2]] : c1;

  pxRect(0, 0, NOBLE_PX, NOBLE_PX, "#10101a");
  pxRect(19, 2, 3, 3, "#dde"); px(21, 2, "#10101a"); px(21, 3, "#10101a"); // moon
  // Robes
  pxRect(8, 13, 9, 4, c1); pxRect(7, 16, 11, 5, c1); pxRect(6, 19, 13, 4, c1);
  pxRect(7, 16, 11, 1, c2); // trim
  pxRect(8, 10, 3, 4, c1); pxRect(15, 10, 3, 4, c1); // hood
  px(12, 12, N_GOLD); // clasp
  // Staff
  pxRect(19, 4, 1, 18, "#8a6a3a");
  px(18, 3, c3); px(19, 2, c3); px(20, 3, c3); px(19, 4, c3); // crystal
  px(18, 2, GEM_LIGHT_HEX[cols[2] || cols[0]]); px(20, 2, GEM_LIGHT_HEX[cols[2] || cols[0]]);
  // Arms
  pxRect(16, 13, 3, 3, c1); px(18, 14, SKIN);
  pxRect(7, 13, 2, 4, c1); px(7, 17, SKIN);
  // Head
  pxRect(10, 4, 6, 7, SKIN);
  // Beard
  pxRect(11, 10, 4, 1, "#ccc"); pxRect(10, 11, 6, 2, "#ccc");
  pxRect(11, 13, 4, 2, "#ccc"); px(12, 15, "#ccc"); px(13, 15, "#ccc");
  px(11, 7, "#222"); px(14, 7, "#222"); // eyes
  px(11, 6, "#ccc"); px(14, 6, "#ccc"); // brows
  px(12, 8, SKIN_DARK); // nose
  // Pointed hat
  pxRect(10, 2, 6, 3, c2); pxRect(11, 1, 4, 1, c2); pxRect(12, 0, 2, 1, c2);
  pxRect(10, 4, 6, 1, N_GOLD);
  px(13, 2, N_GOLD); // star
}

const NOBLE_DRAW_FNS = {
  n_01: _drawDiplomat,
  n_02: _drawAdmiral,
  n_03: _drawDuchess,
  n_04: _drawCardinal,
  n_05: _drawKnight,
  n_06: _drawScholar,
  n_07: _drawMerchant,
  n_08: _drawCountess,
  n_09: _drawGeneral,
  n_10: _drawSage,
};

export function drawNoblePixel(ctx, x, y, w, h, noble) {
  if (cardArtMode !== 2) return false;

  const drawFn = NOBLE_DRAW_FNS[noble.id];
  if (!drawFn) return false;

  const oc = document.createElement("canvas");
  oc.width = NOBLE_PX;
  oc.height = NOBLE_PX;
  const pc = oc.getContext("2d");

  function setPx(px_x, px_y, color) {
    pc.fillStyle = color;
    pc.fillRect(px_x, px_y, 1, 1);
  }
  function setPxRect(px_x, px_y, pw, ph, color) {
    pc.fillStyle = color;
    pc.fillRect(px_x, px_y, pw, ph);
  }

  drawFn(setPx, setPxRect, noble);

  const prevSmoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(oc, x, y, w, h);
  ctx.imageSmoothingEnabled = prevSmoothing;

  return true;
}
