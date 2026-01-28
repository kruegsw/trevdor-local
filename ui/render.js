import { computeLayout } from "./layout.js";

/* ---------------------------------------------------------
   HIT TESTING HELPERS (Option A = rectangles / AABB)
   --------------------------------------------------------- */

/*
  Returns true if a point (px, py) lies inside rect.
  We treat edges as "inside" so clicking on the border works.
*/
function pointInRect(px, py, rect) {
  return (
    px >= rect.x &&
    px <= rect.x + rect.w &&
    py >= rect.y &&
    py <= rect.y + rect.h
  );
}

/*
  Returns true if rect A intersects rect B at all.
  Useful for region selection (drag box).
*/
function rectsIntersect(a, b) {
  return !(
    a.x + a.w < b.x ||
    a.x > b.x + b.w ||
    a.y + a.h < b.y ||
    a.y > b.y + b.h
  );
}

/*
  Optional: keep hit boxes inside the viewport.
  This prevents negative widths/heights and weird boxes.
*/
function clampRectToViewport(rect, viewport) {
  const x0 = Math.max(0, rect.x);
  const y0 = Math.max(0, rect.y);
  const x1 = Math.min(viewport.width, rect.x + rect.w);
  const y1 = Math.min(viewport.height, rect.y + rect.h);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

/* ---------------------------------------------------------
   RENDERER FACTORY
   --------------------------------------------------------- */

function render(ctx) {
  let viewport = { width: 0, height: 0 };
  let layout = null;

  /*
    hitRegions is rebuilt each frame.
    Each entry is a clickable thing: card, token, button, etc.

    Suggested shape:
      {
        id: "some stable id",
        kind: "card" | "token" | "button" | ...,
        x, y, w, h,
        z: number, // draw order (higher = on top)
        meta: {...} // anything you want: price, cardName, tokenValue, etc.
      }
  */
  let hitRegions = [];

  return {
    resize(nextViewport) {
      viewport = nextViewport;
      layout = computeLayout(viewport);

      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
    },

    draw(state, uiState) {
      if (!layout) return;

      // Clear visible canvas
      ctx.clearRect(0, 0, viewport.width, viewport.height);

      // Rebuild clickable regions every frame
      hitRegions.length = 0;

      /* ---------------------------------------------------------
         EXAMPLE OBJECTS (replace these with your real state later)
         --------------------------------------------------------- */

      
      layout.forEach(e => {
        const stateObject = e.statePath ? structuredClone( getByStatePath(state, e.statePath) ) : {};
        drawSelect(ctx, stateObject, e);
        
        hitRegions.push({
          id: e.id,           // stable identifier (later: state.cards[i].id)
          kind: e.kind,              // helps your click handler decide what it hit
          ...clampRectToViewport({ x: e.x, y: e.y, w: e.w, h: e.h }, viewport),
          //z: 10,                     // top-most priority when overlaps happen
          meta: stateObject
        });
        
      });

      // In a real game, you’d do something like:
      // for (const card of state.shopCards) { draw + push hit }
      // for (const token of state.tokens)    { draw + push hit }
    },

    /*
      PRIMARY API FOR A CLICK-BASED GAME:
      getHitAt(x, y) gives you the single best hit (top-most).
    */
    getHitAt(x, y) {
      // We want "top-most" item when overlaps occur.
      // Two ways to do that:
      //   A) store z and pick highest z
      //   B) rely on draw order and scan from end
      //
      // Here we do A) because it’s explicit and reliable.
      let best = null;
      for (const r of hitRegions) {
        if (!pointInRect(x, y, r)) continue;

        if (!best || (r.z ?? 0) > (best.z ?? 0)) {
          best = r;
        }
      }
      return best;
    },

    /*
      Secondary API:
      getHitsRegion(rect) returns ALL hits that overlap a selection box.
      (Not strictly needed if your game is click-only, but handy later.)
    */
    getHitsRegion(selectionRect) {
      const sel = clampRectToViewport(selectionRect, viewport);
      if (sel.w === 0 || sel.h === 0) return [];

      const hits = [];
      for (const r of hitRegions) {
        if (rectsIntersect(sel, r)) hits.push(r);
      }

      // Optional: return hits sorted by z (top-most first)
      hits.sort((a, b) => (b.z ?? 0) - (a.z ?? 0));
      return hits;
    },

    // Useful for debugging overlays, etc.
    getHitRegions() {
      return hitRegions;
    }
  };
}

/* ---------------------------------------------------------
   DRAWING HELPERS
   --------------------------------------------------------- */

function getByStatePath(state, statePath) {
  return statePath.reduce(
    (acc, key) => (acc == null ? undefined : acc[key]),
    state
  );
}

function drawSelect(ctx, stateObject, { id, kind, color, x, y, w, h }) {
  switch (kind) {
    case "decks.tier1":
      drawCard(ctx, { x, y, w, h } );
      break;
    case "decks.tier2":
      drawCard(ctx, { x, y, w, h } );
      break;
    case "decks.tier3":
      drawCard(ctx, { x, y, w, h } );
      break;
    case "market.card":
      stateObject ? drawCard(ctx, { x, y, w, h } ) : null;
      drawDevelopmentCard(ctx, { x, y, w, h }, {
        points: stateObject.points,
        bonus: stateObject.bonus,
        cost: stateObject.cost,
        //banner: stateObject.id
      });
      break;
    case "token":
      drawToken(ctx, color, { x, y, w, h } );
      break;
    case "noble":
      stateObject ? drawCard(ctx, { x, y, w, h } ) : null // update this later to draw a noble card
      break;
    // ... more cases ...
    default:
      // Code to execute if none of the cases match
  }
}

function roundedRectPath(ctx, x, y, w, h, r = 14) {
  ctx.beginPath();
  const radius = Math.min(r, w / 4, h / 4);
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y,     x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x,     y + h, radius);
  ctx.arcTo(x,     y + h, x,     y,     radius);
  ctx.arcTo(x,     y,     x + w, y,     radius);
  ctx.closePath();
}

function drawCard(ctx, { x, y, w, h }, fill = "#000000ff", stroke = "rgba(0,0,0,.12)") {
  roundedRectPath(ctx, x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
}

/*
  Simple token drawing (circle) for demo.
  Hitbox is still a rectangle from the token object in draw().
*/
function drawToken(ctx, color, { x, y, w, h }) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = Math.min(w, h) / 2;

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,.2)";
  ctx.stroke();
}

export { render };


/**
 * Draw a Splendor-like development card (simple):
 * - Base card filled with a low-sat-ish bonus color
 * - Top 1/4 header is a semi-transparent mix of (baseColor + white)
 * - Outer black border only
 * - Points top-left, bonus gem top-right
 * - Cost pips along the bottom
 */
const GEM_COLORS = {
  white: "#E9EEF3",
  blue:  "#2D6CDF",
  green: "#2E9B5F",
  red:   "#D94A4A",
  black: "#2B2B2B",
  //gold:  "#D6B04C",
  /*white: "white",
  blue: "blue",
  green: "green",
  red: "red",
  black: "black",
  yellow: "yellow",*/
};


function drawGem(ctx, cx, cy, r, color, label = "") {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // subtle outline
  ctx.strokeStyle = "rgba(0,0,0,.18)";
  ctx.lineWidth = 1;
  ctx.stroke();

  if (label) {
    ctx.fillStyle = (color === GEM_COLORS.black) ? "#fff" : "rgba(0,0,0,.75)";
    ctx.font = `${Math.max(10, Math.floor(r * 1.2))}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, cx, cy);
  }
}

function drawPip(ctx, x, y, s, color, text) {
  // rounded square pip (cost token)
  const r = Math.max(2, Math.floor(s * 0.18));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + s - r, y);
  ctx.quadraticCurveTo(x + s, y, x + s, y + r);
  ctx.lineTo(x + s, y + s - r);
  ctx.quadraticCurveTo(x + s, y + s, x + s - r, y + s);
  ctx.lineTo(x + r, y + s);
  ctx.quadraticCurveTo(x, y + s, x, y + s - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();

  ctx.fillStyle = color;
  ctx.fill();

  ctx.strokeStyle = "rgba(0,0,0,.18)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = (color === GEM_COLORS.black) ? "#fff" : "rgba(0,0,0,.85)";
  ctx.font = `${Math.max(10, Math.floor(s * 0.55))}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(text), x + s / 2, y + s / 2);
}

function drawDevelopmentCard(ctx, { x, y, w, h }, card = {}) {
  const {
    points = 0,
    bonus = "white",
    cost = {},
    banner = "",
    bg = null, // optional override
  } = card;

  // helpers local to this function (no extra deps)
  const clamp01 = (t) => Math.max(0, Math.min(1, t));

  // hex (#RRGGBB) -> {r,g,b}
  const hexToRgb = (hex) => {
    const s = String(hex).replace("#", "").trim();
    const v = s.length === 3
      ? s.split("").map((c) => c + c).join("")
      : s.padEnd(6, "0").slice(0, 6);
    const n = parseInt(v, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };

  // mix two rgb colors: a*(1-t) + b*t
  const mixRgb = (a, b, t) => {
    t = clamp01(t);
    return {
      r: Math.round(a.r * (1 - t) + b.r * t),
      g: Math.round(a.g * (1 - t) + b.g * t),
      b: Math.round(a.b * (1 - t) + b.b * t),
    };
  };

  // "less saturated" look without full HSL: mix toward gray
  const desaturate = (rgb, amt) => {
    amt = clamp01(amt);
    const gray = Math.round((rgb.r + rgb.g + rgb.b) / 3);
    return mixRgb(rgb, { r: gray, g: gray, b: gray }, amt);
  };

  const rgbToCss = (rgb, a = 1) => `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;

  const pad = Math.max(4, Math.floor(Math.min(w, h) * 0.06));
  const headerH = Math.floor(h * 0.25);

  // base color derived from bonus (or overridden via bg)
  const baseHex = bg || GEM_COLORS[bonus] || "#cccccc";
  const baseRgb = hexToRgb(baseHex);

  // make the whole card slightly less saturated so it reads "pastel"
  const cardRgb = desaturate(baseRgb, 0.35);

  // header is a mix of card color and white, plus alpha to feel translucent
  const headerRgb = mixRgb(cardRgb, { r: 255, g: 255, b: 255 }, 0.55);
  const headerAlpha = 0.65;

  // --- base card
  roundedRectPath(ctx, x, y, w, h);
  ctx.fillStyle = rgbToCss(cardRgb, 1);
  ctx.fill();

  // --- header strip (top quarter) clipped to the rounded card
  ctx.save();
  roundedRectPath(ctx, x, y, w, h);
  ctx.clip();
  ctx.fillStyle = rgbToCss(headerRgb, headerAlpha);
  ctx.fillRect(x, y, w, headerH);
  ctx.restore();

  // --- outer black border only
  roundedRectPath(ctx, x, y, w, h);
  ctx.strokeStyle = "rgba(0,0,0,1)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // --- points (top-left)
  if (points > 0) {
    ctx.fillStyle = "rgba(0,0,0,.9)";
    ctx.font = `700 ${Math.max(12, Math.floor(h * 0.20))}px system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(String(points), x + pad, y + pad * 0.8);
  }

  // --- bonus gem (top-right)
  {
    const r = Math.max(6, Math.floor(Math.min(w, h) * 0.12));
    const cx = x + w - pad - r;
    const cy = y + pad + r;
    drawGem(ctx, cx, cy, r, bonus || "#ccc", "");
  }

  // --- optional banner in the middle (very subtle)
  if (banner) {
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.font = `600 ${Math.max(10, Math.floor(h * 0.10))}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(banner, x + w / 2, y + h * 0.52);
  }

  // --- bottom cost pips
  const order = ["white", "blue", "green", "red", "black"];
  const entries = order
    .map((c) => [c, cost[c] ?? 0])
    .filter(([, n]) => n > 0);

  if (entries.length) {
    const pipSize = Math.max(12, Math.floor(Math.min(w, h) * 0.16));
    const gap = Math.max(3, Math.floor(pipSize * 0.18));
    const startX = x + pad;
    const yBottom = y + h - pad - pipSize;

    let cx = startX;
    for (const [c, n] of entries) {
      drawPip(ctx, cx, yBottom, pipSize, c || "#ccc", n);
      cx += pipSize + gap;
      if (cx > x + w - pad - pipSize) break;
    }
  }
}







/*

// Assumes you already have roundedRectPath(ctx, x, y, w, h)

const GEM_COLORS = {
  white: "#E9EEF3",
  blue:  "#2D6CDF",
  green: "#2E9B5F",
  red:   "#D94A4A",
  black: "#2B2B2B",
  gold:  "#D6B04C",
};

function drawGem(ctx, cx, cy, r, color, label = "") {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // subtle outline
  ctx.strokeStyle = "rgba(0,0,0,.18)";
  ctx.lineWidth = 1;
  ctx.stroke();

  if (label) {
    ctx.fillStyle = (color === GEM_COLORS.black) ? "#fff" : "rgba(0,0,0,.75)";
    ctx.font = `${Math.max(10, Math.floor(r * 1.2))}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, cx, cy);
  }
}

function drawPip(ctx, x, y, s, color, text) {
  // rounded square pip (cost token)
  const r = Math.max(2, Math.floor(s * 0.18));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + s - r, y);
  ctx.quadraticCurveTo(x + s, y, x + s, y + r);
  ctx.lineTo(x + s, y + s - r);
  ctx.quadraticCurveTo(x + s, y + s, x + s - r, y + s);
  ctx.lineTo(x + r, y + s);
  ctx.quadraticCurveTo(x, y + s, x, y + s - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();

  ctx.fillStyle = color;
  ctx.fill();

  ctx.strokeStyle = "rgba(0,0,0,.18)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = (color === GEM_COLORS.black) ? "#fff" : "rgba(0,0,0,.85)";
  ctx.font = `${Math.max(10, Math.floor(s * 0.55))}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(text), x + s / 2, y + s / 2);
}

function drawDevelopmentCard(ctx, { x, y, w, h }, card = {}) {
  const {
    points = 0,
    bonus = "white",
    cost = {},
    banner = "",
    bg = "#F6F2E8",
  } = card;

  // --- card base
  roundedRectPath(ctx, x, y, w, h);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,.18)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // inner inset
  const pad = Math.max(4, Math.floor(Math.min(w, h) * 0.06));
  roundedRectPath(ctx, x + pad, y + pad, w - pad * 2, h - pad * 2);
  ctx.strokeStyle = "rgba(0,0,0,.10)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // --- top-left: prestige points
  if (points > 0) {
    const px = x + pad * 1.2;
    const py = y + pad * 1.05;
    ctx.fillStyle = "rgba(0,0,0,.85)";
    ctx.font = `700 ${Math.max(12, Math.floor(h * 0.20))}px system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(String(points), px, py);
  }

  // --- top-right: bonus gem icon
  {
    const r = Math.max(6, Math.floor(Math.min(w, h) * 0.12));
    const cx = x + w - pad * 1.2 - r;
    const cy = y + pad * 1.2 + r;
    drawGem(ctx, cx, cy, r, GEM_COLORS[bonus] || "#ccc", "");
  }

  // --- middle area: faint "art" panel (placeholder)
  {
    const artX = x + pad * 1.2;
    const artY = y + pad * 2.2;
    const artW = w - pad * 2.4;
    const artH = h * 0.55;

    roundedRectPath(ctx, artX, artY, artW, artH);
    ctx.fillStyle = "rgba(0,0,0,.04)";
    ctx.fill();

    // optional banner text
    if (banner) {
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.font = `600 ${Math.max(10, Math.floor(h * 0.10))}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(banner, artX + artW / 2, artY + artH / 2);
    }
  }

  // --- bottom: cost pips (left-to-right like Splendor)
  // order commonly used visually (you can change)
  const order = ["white", "blue", "green", "red", "black"];
  const entries = order
    .map((c) => [c, cost[c] ?? 0])
    .filter(([, n]) => n > 0);

  if (entries.length) {
    const pipSize = Math.max(12, Math.floor(Math.min(w, h) * 0.16));
    const gap = Math.max(3, Math.floor(pipSize * 0.18));
    const startX = x + pad * 1.2;
    const yBottom = y + h - pad * 1.2 - pipSize;

    let cx = startX;
    for (const [c, n] of entries) {
      drawPip(ctx, cx, yBottom, pipSize, GEM_COLORS[c] || "#ccc", n);
      cx += pipSize + gap;
      // stop if we run out of space
      if (cx > x + w - pad - pipSize) break;
    }
  }
}

*/
