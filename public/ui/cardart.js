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

// --- Mode 2: Royal Portrait (25×25 pixel art) ---
export function drawNoblePixel(ctx, x, y, w, h, noble) {
  if (cardArtMode !== 2) return false;

  const PX = 25;
  const cols = nobleReqColors(noble);
  const c1 = GEM_HEX[cols[0]] || "#888888";
  const c2 = GEM_HEX[cols[1] || cols[0]] || "#888888";
  const d1 = (GEM_PALETTE[cols[0]] || GEM_PALETTE.white).dark;
  const d2 = (GEM_PALETTE[cols[1] || cols[0]] || GEM_PALETTE.white).dark;
  const rng = mulberry32(nobleSeed(noble) * 311);

  // Create offscreen canvas at native pixel resolution
  const oc = document.createElement("canvas");
  oc.width = PX;
  oc.height = PX;
  const pc = oc.getContext("2d");

  function px(px_x, px_y, color) {
    pc.fillStyle = color;
    pc.fillRect(px_x, px_y, 1, 1);
  }
  function pxRect(px_x, px_y, pw, ph, color) {
    pc.fillStyle = color;
    pc.fillRect(px_x, px_y, pw, ph);
  }

  const GOLD = "#d4a017";
  const GOLD_DARK = "#8a6a0f";

  // Background — split field
  pxRect(0, 0, PX, PX, d1);
  pxRect(0, 0, Math.floor(PX / 2), PX, d2);

  // Crown (top center)
  const crownY = 3;
  const crownX = 8;
  pxRect(crownX, crownY, 9, 3, GOLD);
  // Crown points
  px(crownX + 1, crownY - 1, GOLD);
  px(crownX + 4, crownY - 2, GOLD);
  px(crownX + 4, crownY - 1, GOLD);
  px(crownX + 7, crownY - 1, GOLD);
  // Jewels on crown
  px(crownX + 1, crownY, c1);
  px(crownX + 4, crownY, c2);
  px(crownX + 7, crownY, cols[2] ? GEM_HEX[cols[2]] : c1);
  // Crown band highlight
  pxRect(crownX, crownY + 2, 9, 1, GOLD_DARK);

  // Face
  const faceX = 9, faceY = 7;
  const skin = "#e8c8a0";
  const skinDark = "#c8a078";
  pxRect(faceX, faceY, 7, 7, skin);
  // Hair
  const hairCol = rng() > 0.5 ? "#5a3a1a" : "#2a2a2a";
  pxRect(faceX, faceY, 7, 2, hairCol);
  px(faceX, faceY + 2, hairCol);
  px(faceX + 6, faceY + 2, hairCol);
  // Eyes
  px(faceX + 2, faceY + 3, "#222");
  px(faceX + 4, faceY + 3, "#222");
  // Mouth
  px(faceX + 2, faceY + 5, skinDark);
  px(faceX + 3, faceY + 5, skinDark);
  px(faceX + 4, faceY + 5, skinDark);

  // Collar / robe
  pxRect(8, 14, 9, 3, c1);
  pxRect(7, 16, 11, 2, c1);
  // Collar trim
  pxRect(10, 14, 5, 1, GOLD);

  // Border frame
  pxRect(0, 0, PX, 1, "#111");
  pxRect(0, PX - 1, PX, 1, "#111");
  pxRect(0, 0, 1, PX, "#111");
  pxRect(PX - 1, 0, 1, PX, "#111");

  // Stamp onto target context with crisp upscaling
  const prevSmoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(oc, x, y, w, h);
  ctx.imageSmoothingEnabled = prevSmoothing;

  return true;
}
