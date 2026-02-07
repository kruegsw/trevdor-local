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
      
      layout.forEach(e => {
        const stateObject = e.statePath ? getByStatePath(state, e.statePath) : {};
        if (!stateObject) return;
        
        drawSelect(ctx, stateObject, e, uiState);
        
        hitRegions.push({
          uiID: e.uiID,           // stable identifier (later: state.cards[i].id)
          kind: e.kind,              // helps your click handler decide what it hit
          tier: e.tier ?? null,
          index: e.index ?? null,
          color: e.color ?? null,
          ...clampRectToViewport({ x: e.x, y: e.y, w: e.w, h: e.h }, viewport),
          //z: 10,                     // top-most priority when overlaps happen
          meta: stateObject
        });
        
      });

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

function drawSelect(ctx, stateObject, { uiID, kind, color, x, y, w, h }, uiState) {
  switch (kind) {
    case "decks.tier1":
      //drawCard(ctx, { x, y, w, h } );
      stateObject[0] ? drawDeckCard(ctx, { x, y, w, h }, {
        color: "green"
      } ) : null;
      break;
    case "decks.tier2":
      //drawCard(ctx, { x, y, w, h } );
      stateObject[0] ? drawDeckCard(ctx, { x, y, w, h }, {
        color: "yellow"
      } ) : null;
      break;
    case "decks.tier3":
      //drawCard(ctx, { x, y, w, h } );
      stateObject[0] ? drawDeckCard(ctx, { x, y, w, h }, {
        color: "blue"
      } ) : null;
      break;
    case "market.card":
      //stateObject ? drawCard(ctx, { x, y, w, h } ) : null;
      stateObject ? drawDevelopmentCard(ctx, { x, y, w, h }, {
        points: stateObject.points,
        bonus: stateObject.bonus,
        cost: stateObject.cost,
        //banner: stateObject.id
      }) : null;
      break;
    case "token":
      stateObject > 0 ? drawToken(ctx, color, { x, y, w, h }, {
        count: stateObject
      } ) : null;
      break;
    case "noble":
      //stateObject ? drawCard(ctx, { x, y, w, h } ) : null // update this later to draw a noble card
      stateObject ? drawNoble(ctx, { color, x, y, w, h }, stateObject ) : null;
      break;
    //case "player.panel.bottom":
    //  drawPlayerPanelBottom(ctx, { x, y, w, h }, stateObject);
    //  break;
    case "reserved":
      //drawDevelopmentCard(ctx, { x, y, w, h }, {
      //  points: stateObject.points,
      //  bonus: stateObject.bonus,
      //  cost: stateObject.cost,
      //  //banner: stateObject.id
      //});
      stateObject ? drawReserved(ctx, { x, y, w, h }, stateObject ) : null;
      break;
    case "fanned.cards":
      const grouped = groupCardsByBonus(stateObject, ["white","blue","green","red","black"]);
      const pile = grouped[color] ?? [];
      stateObject ? drawFannedCards(ctx, { color, x, y, w, h }, pile ) : null;
      break;

    ////////////////////////
    case "ui.prompt": {
      const pendingTokens = uiState?.pending?.tokens ?? {};
      const pendingCard = uiState?.pending?.card ?? {};
      const hasPendingToken = (
        Object.values(pendingTokens).some(n => n > 0)
      );
      const hasPendingCard = (
        pendingCard
      );
      if (!hasPendingToken && !hasPendingCard) break;
      let pendingText = "";
      if (hasPendingToken) { pendingText = pendingTokens }
      if (hasPendingCard) { pendingText = pendingCard}

      drawUIPanel(ctx, { x, y, w, h });

      ctx.save();
      ctx.fillStyle = "#111";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(
        `Pending: ${pendingTokensToText(pendingText)}`,
        x + 10,
        y + h / 2
      );
      ctx.restore();
      break;
    }

    case "button.confirm": {
      const pendingTokens = uiState?.pending?.tokens ?? {};
      const pendingCard = uiState?.pending?.card ?? {};
      const hasPendingToken = (
        Object.values(pendingTokens).some(n => n > 0)
      );
      const hasPendingCard = (
        pendingCard
      );
      if (!hasPendingToken && !hasPendingCard) break;

      const label = "Confirm";

      drawUIButton(ctx, { x, y, w, h }, label);
      break;
    }

    case "button.cancel": {
      const pendingTokens = uiState?.pending?.tokens ?? {};
      const pendingCard = uiState?.pending?.card ?? {};
      const hasPendingToken = (
        Object.values(pendingTokens).some(n => n > 0)
      );
      const hasPendingCard = (
        pendingCard
      );
      if (!hasPendingToken && !hasPendingCard) break;

      const label = "Cancel";

      drawUIButton(ctx, { x, y, w, h }, label);
      break;
    }
    ////////////////////////


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
function drawToken(ctx, color, { x, y, w, h }, { count } ) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = Math.min(w, h) / 2;

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,.2)";
  ctx.stroke();

  ctx.fillStyle = ( (color === "blue") || (color === "black") ) ? "#E9EEF3" : "rgba(0,0,0,.85)";
  ctx.font = `700 ${Math.max(12, Math.floor(r * 0.55))}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(count), cx, cy);
}

export { render };


















/**
 rather messy Chat GPT code for drawing cards cards, clean up later
 */
const GEM_COLORS = {
  white: "#fff",
  blue:  "#0000FF",
  green: "#2E9B5F",
  red:   "#D94A4A",
  black: "#2B2B2B",
  yellow:  "#D6B04C",
  /*white: "white",
  blue: "blue",
  green: "green",
  red: "red",
  black: "black",
  yellow: "yellow",*/
};

const CARD_BACKGROUND_COLORS = {
  white: "#E9EEF3",
  blue:  "#2D6CDF",
  green: "#2E9B5F",
  red:   "#D94A4A",
  black: "#2B2B2B",
  yellow:  "#D6B04C",
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

  /*
  if (label) {
    ctx.fillStyle = ( (color === GEM_COLORS.blue) || (color === GEM_COLORS.black) ) ? "#fff" : "rgba(0,0,0,.75)";
    ctx.font = `${Math.max(10, Math.floor(r * 1.2))}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, cx, cy);
  }
  */
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

  ctx.fillStyle = ( (color === GEM_COLORS.blue) || (color === GEM_COLORS.black) ) ? "#E9EEF3" : "rgba(0,0,0,1)";
  ctx.font = `700 ${Math.max(10, Math.floor(s * 0.55))}px system-ui, sans-serif`;
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
  const baseHex = bg || CARD_BACKGROUND_COLORS[bonus] || "#cccccc";
  const baseRgb = hexToRgb(baseHex);

  // make the whole card slightly less saturated so it reads "pastel"
  const cardRgb = desaturate(baseRgb, 0.35);

  // header is a mix of card color and white, plus alpha to feel translucent
  const headerRgb = mixRgb(cardRgb, { r: 255, g: 255, b: 255 }, 0.55);
  const headerAlpha = 0.65;

  // --- base card
  roundedRectPath(ctx, x, y, w, h);
  //ctx.fillStyle = rgbToCss(cardRgb, 1);
  //ctx.fill();
  ctx.fillStyle = CARD_BACKGROUND_COLORS[bonus];
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
    ctx.fillStyle = (bonus == "black") ? "#fff" : "rgba(0,0,0,1)";
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
      drawPip(ctx, cx, yBottom, pipSize, GEM_COLORS[c] || "#ccc", n);
      cx += pipSize + gap;
      if (cx > x + w - pad - pipSize) break;
    }
  }
}


function drawDeckCard(ctx, { x, y, w, h }, card = {}) {
  const {
    //points = 0,
    color = "white",
    //cost = {},
    banner = "Trevdor",
    bg = "white",
  } = card;

  // --- card base
  roundedRectPath(ctx, x, y, w, h);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,1)";
  ctx.lineWidth = 1;
  ctx.stroke();
  

  // inner inset
  const pad = Math.max(4, Math.floor(Math.min(w, h) * 0.06));
  roundedRectPath(ctx, x + pad, y + pad, w - pad * 2, h - pad * 2);
  ctx.fillStyle = CARD_BACKGROUND_COLORS[color];
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,.10)";
  ctx.lineWidth = 1;
  ctx.stroke();



  // --- middle area: faint "art" panel (placeholder)
  {
    const artX = x + pad * 1.2;
    const artY = y + pad * 2.2;
    const artW = w - pad * 2.4;
    const artH = h * 0.55;

    roundedRectPath(ctx, artX, artY, artW, artH);
    ctx.fillStyle = "rgba(0,0,0,.1)";
    ctx.fill();

    // optional banner text
    if (banner) {
      ctx.fillStyle = "rgba(0,0,0,1)";
      ctx.font = `700 ${Math.max(10, Math.floor(h * 0.15))}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(banner, artX + artW / 2, artY + artH / 2);
    }
  }
}



function drawNoble(ctx, { x, y, w, h }, noble = {}) {
  const {
    points = 3,
    req = {},      // noble requirements
    banner = "",   // optional center text
  } = noble;

  const pad = Math.max(4, Math.floor(Math.min(w, h) * 0.06));
  const stripW = Math.floor(w * 0.25);

    // --- helpers (local)
  const drawChickenWithCrown = (ctx, area) => {
    const { x, y, w, h } = area;

    // Fit icon inside area with some padding
    const p = Math.min(w, h) * 0.08;
    const ax = x + p, ay = y + p, aw = w - 2 * p, ah = h - 2 * p;
    const cx = ax + aw * 0.52;
    const cy = ay + ah * 0.58;

    // scale unit based on smallest dimension
    const u = Math.min(aw, ah);

    const bodyR = u * 0.28;
    const headR = u * 0.16;

    // colors
    const YELLOW = "#F2D34B";
    const YELLOW_DK = "rgba(0,0,0,0.18)";
    const ORANGE = "#E08A2E";
    const RED = "#D94A4A";
    const CROWN = "#D6B04C";

    // --- body (big circle)
    ctx.beginPath();
    ctx.arc(cx, cy, bodyR, 0, Math.PI * 2);
    ctx.fillStyle = YELLOW;
    ctx.fill();
    ctx.strokeStyle = YELLOW_DK;
    ctx.lineWidth = 1;
    ctx.stroke();

    // --- wing (small circle on left)
    ctx.beginPath();
    ctx.arc(cx - bodyR * 0.35, cy + bodyR * 0.05, bodyR * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fill();

    // --- head (circle above-right)
    const hx = cx + bodyR * 0.55;
    const hy = cy - bodyR * 0.55;
    ctx.beginPath();
    ctx.arc(hx, hy, headR, 0, Math.PI * 2);
    ctx.fillStyle = YELLOW;
    ctx.fill();
    ctx.strokeStyle = YELLOW_DK;
    ctx.stroke();

    // --- beak (triangle)
    ctx.beginPath();
    ctx.moveTo(hx + headR * 0.95, hy);
    ctx.lineTo(hx + headR * 1.55, hy - headR * 0.25);
    ctx.lineTo(hx + headR * 1.55, hy + headR * 0.25);
    ctx.closePath();
    ctx.fillStyle = ORANGE;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.stroke();

    // --- comb (3 bumps)
    const combY = hy - headR * 0.95;
    ctx.fillStyle = RED;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(hx - headR * 0.55 + i * headR * 0.45, combY, headR * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- eye (dot)
    ctx.beginPath();
    ctx.arc(hx + headR * 0.2, hy - headR * 0.1, Math.max(1.5, headR * 0.12), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.85)";
    ctx.fill();

    // --- crown (simple 3-point crown) on top of head
    const crownW = headR * 1.55;
    const crownH = headR * 0.9;
    const crownX = hx - crownW * 0.5;
    const crownY = hy - headR * 1.45;

    ctx.beginPath();
    ctx.moveTo(crownX, crownY + crownH);
    ctx.lineTo(crownX + crownW * 0.15, crownY + crownH * 0.35);
    ctx.lineTo(crownX + crownW * 0.35, crownY + crownH);
    ctx.lineTo(crownX + crownW * 0.5, crownY + crownH * 0.25);
    ctx.lineTo(crownX + crownW * 0.65, crownY + crownH);
    ctx.lineTo(crownX + crownW * 0.85, crownY + crownH * 0.35);
    ctx.lineTo(crownX + crownW, crownY + crownH);
    ctx.closePath();
    ctx.fillStyle = CROWN;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.stroke();

    // crown jewels (dots)
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    const jewelR = Math.max(1.5, headR * 0.12);
    const jy = crownY + crownH * 0.75;
    [0.25, 0.5, 0.75].forEach((t) => {
      ctx.beginPath();
      ctx.arc(crownX + crownW * t, jy, jewelR, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  // --- base card (light grey)
  roundedRectPath(ctx, x, y, w, h);
  ctx.fillStyle = "#E9EEF3";
  ctx.fill();

  // --- left solid white strip
  ctx.save();
  roundedRectPath(ctx, x, y, w, h);
  ctx.clip();
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(x, y, stripW, h);
  ctx.restore();

  // --- outer black border
  roundedRectPath(ctx, x, y, w, h);
  ctx.strokeStyle = "rgba(0,0,0,1)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // --- points (top of strip)
  if (points > 0) {
    ctx.fillStyle = "rgba(0,0,0,0.9)";
    ctx.font = `700 ${Math.max(12, Math.floor(h * 0.22))}px system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(String(points), x + pad, y + pad * 0.8);
  }

  // --- requirements stacked vertically
  const order = ["white", "blue", "green", "red", "black"];
  const entries = order
    .map(c => [c, req[c] ?? 0])
    .filter(([, n]) => n > 0);

  if (entries.length) {
    const pipSize = Math.max(12, Math.floor(Math.min(w, h) * 0.16));
    const gap = Math.max(3, Math.floor(pipSize * 0.18));

    let cy =
      y +
      pad +
      Math.max(16, Math.floor(h * 0.22)) +
      gap;

    for (const [c, n] of entries) {
      drawPip(ctx, x + pad, cy, pipSize, GEM_COLORS[c] || "#ccc", n);
      cy += pipSize + gap;

      if (cy > y + h - pad - pipSize) break;
    }
  }

  // --- chicken "art" on the right 3/4
  {
    const area = {
      x: x + stripW,
      y: y,
      w: w - stripW,
      h: h,
    };

    // clip to the noble rounded rect so the art doesn't spill
    ctx.save();
    roundedRectPath(ctx, x, y, w, h);
    ctx.clip();
    drawChickenWithCrown(ctx, area);
    ctx.restore();
  }

  // --- optional banner (center-right)
  if (banner) {
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.font = `600 ${Math.max(10, Math.floor(h * 0.14))}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      banner,
      x + stripW + (w - stripW) / 2,
      y + h / 2
    );
  }
}

function drawReserved(ctx, { x, y, w, h }, stateObject) {
    // Save the current canvas state (coordinate system)
    ctx.save();

    // Move the canvas origin (0,0) to the center of the object
    ctx.translate(x, y);

    // Rotate the context by 90 degrees (Math.PI / 2 radians)
    ctx.rotate(90 * Math.PI / 180); // or Math.PI / 2

    // Draw card, offset by height so top left corner of rotated card at intended location
    drawDevelopmentCard(ctx, { x: 0, y: -w, w: h, h: w }, {  // note y, w and h have been adjusted to draw card correctly but line up with layout.js coords
      points: stateObject.points,
      bonus: stateObject.bonus,
      cost: stateObject.cost,
      banner: "RESERVED"
    })

    // Restore the canvas to its original state before the translation and rotation
    ctx.restore();
}

function drawFannedCards(ctx, { color, x, y, w, h }, stateObject ) {


// ------------------------------------------------------------------
  // PURCHASED CARD STACKS (grouped by bonus)
  // ------------------------------------------------------------------
  //ctx.fillStyle = "rgba(0,0,0,.7)";
  //ctx.font = `600 ${11 * SCALE}px system-ui, sans-serif`;
  //ctx.fillText("Cards", innerX, cy);

  //const stacksTop = cy + (12 * SCALE);
  //const grouped = groupCardsByBonus(stateObject, ["white","blue","green","red","black"]);
  //console.log(grouped);

  //let sx = innerX;
  //for (const color of ["white","blue","green","red","black"]) {
  //  const pile = grouped[color] ?? [];
    

    drawStackWithPeek(ctx, stateObject, {
      x, //: sx,
      y, //: stacksTop,
      w,
      h,
      peek: Math.floor(h * 0.25),
      color,
    });

    //ctx.fillStyle = "rgba(0,0,0,.75)";
    //ctx.font = `600 ${10 * SCALE}px system-ui, sans-serif`;
    //ctx.textAlign = "center";
    //ctx.textBaseline = "top";
    //ctx.fillText(`${pile.length}`, sx + CARD_WH.w / 2, stacksTop + CARD_WH.h + 2);

    //sx += CARD_WH.w + GAP;

}

// Draw a "stack" where only the top quarter of each below card shows
function drawStackWithPeek(ctx, cards, { color, x, y, w, h, peek }) {
  const n = cards?.length ?? 0;

  // Draw from top -> bottom so the bottom-most (largest y) is drawn last and ends up on top.
  for (let i = 0; i < n; i++) {
    const card = cards[i];
    const yy = y + (i * peek);
    drawDevelopmentCard(ctx, { x, y: yy, w, h }, card);
  }

  // placeholder if empty
  //if (n === 0) {
  //  roundedRectPath(ctx, x, y, w, h, 10);
  //  ctx.strokeStyle = "rgba(0,0,0,.25)";
  //  ctx.lineWidth = 1;
  //  ctx.stroke();
  //}
}

function groupCardsByBonus(cards, colors) {
  const out = {};
  for (const c of colors) out[c] = [];
  for (const card of (cards ?? [])) {
    const b = card?.bonus ?? "white";
    (out[b] ??= []).push(card);
  }
  return out;
}

function drawUIPanel(ctx, r, { fill = "rgba(255,255,255,0.9)", stroke = "#111" } = {}) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.restore();
}

function drawUIButton(ctx, r, label, { fill = "#E9EEF3", stroke = "#111" } = {}) {
  drawUIPanel(ctx, r, { fill, stroke });
  ctx.save();
  ctx.fillStyle = "#111";
  ctx.font = "14px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2);
  ctx.restore();
}

function pendingTokensToText(picks) {
  if (!picks) return "";
  const parts = [];
  for (const [color, n] of Object.entries(picks)) {
    if (!n) continue;
    parts.push(`${color}:${n}`);
  }
  return parts.join("  ");
}


/*
function drawPlayerPanelBottom(ctx, { x, y, w, h }, player) {
  // --- Board piece sizes (must match layout.js)
  const SCALE = 3;
  const GAP = 5 * SCALE;
  const CARD_WH  = { w: 25 * SCALE, h: 35 * SCALE };
  const NOBLE_WH = { w: 25 * SCALE, h: 25 * SCALE };
  const TOKEN_WH = { w: 15 * SCALE, h: 15 * SCALE };

  // --- Panel frame
  roundedRectPath(ctx, x, y, w, h, 14);
  ctx.fillStyle = "rgba(245,245,245,1)";
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,1)";
  ctx.lineWidth = 1;
  ctx.stroke();

  const pad = GAP;
  const innerX = x + pad;
  const innerY = y + pad;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;

  // --- Title
  const title = player?.name ?? "Player 1";
  ctx.fillStyle = "rgba(0,0,0,.9)";
  ctx.font = `700 ${14 * SCALE}px system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(title, innerX, innerY);

  if (!player) return;

  const tokens   = player.tokens   ?? {};
  const cards    = player.cards    ?? [];
  const reserved = player.reserved ?? [];
  const nobles   = player.nobles   ?? [];

  let cy = innerY + (16 * SCALE) + GAP;

  // ------------------------------------------------------------------
  // TOKENS ROW (full-size tokens)
  // ------------------------------------------------------------------
  const tokenOrder = ["white", "blue", "green", "red", "black", "yellow"];
  let tx = innerX;

  for (const c of tokenOrder) {
    drawToken(ctx, c, { x: tx, y: cy, w: TOKEN_WH.w, h: TOKEN_WH.h }, {
      count: tokens[c] ?? 0
    });
    tx += TOKEN_WH.w + GAP;
  }

  // ------------------------------------------------------------------
  // RESERVED (full-size cards, fanned)
  // ------------------------------------------------------------------
  const reservedX = innerX + Math.min(
    Math.floor(innerW * 0.55),
    (TOKEN_WH.w + GAP) * tokenOrder.length + GAP
  );

  ctx.fillStyle = "rgba(0,0,0,.7)";
  ctx.font = `600 ${11 * SCALE}px system-ui, sans-serif`;
  ctx.textBaseline = "top";
  ctx.fillText("Reserved", reservedX, cy - (12 * SCALE));

  // ------------------------------------------------------------------
  // RESERVED (sideways, NOT stacked; laid out left-to-right)
  // ------------------------------------------------------------------
  const maxReserved = 3;

  ctx.fillStyle = "rgba(0,0,0,.7)";
  ctx.font = `600 ${11 * SCALE}px system-ui, sans-serif`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillText("Reserved", reservedX, cy - (12 * SCALE));

  // When rotated 90°, a card's bounding box becomes (CARD_WH.h wide) x (CARD_WH.w tall)
  const rotW = CARD_WH.h;
  const rotH = CARD_WH.w;

  for (let i = 0; i < maxReserved; i++) {
    const card = reserved[i]; // may be undefined if fewer than maxReserved

    const slotX = reservedX + i * (rotW + GAP);
    const slotY = cy;

    ctx.save();

    // Rotate around the center of this reserved "slot"
    ctx.translate(
      Math.round(slotX + rotW / 2),
      Math.round(slotY + rotH / 2)
    );
    ctx.rotate(Math.PI / 2);


    if (card) {
      // Draw the full-size card rotated
      drawDevelopmentCard(
        ctx,
        { x: -CARD_WH.w / 2, y: -CARD_WH.h / 2, w: CARD_WH.w, h: CARD_WH.h },
        card
      );
    } else {
      // Empty placeholder (so you always see 3 slots)
      roundedRectPath(ctx, -CARD_WH.w / 2, -CARD_WH.h / 2, CARD_WH.w, CARD_WH.h, 10);
      ctx.strokeStyle = "rgba(0,0,0,.25)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.restore();
  }

  cy += Math.max(TOKEN_WH.h, CARD_WH.h) + GAP;

  // ------------------------------------------------------------------
  // PURCHASED CARD STACKS (grouped by bonus)
  // ------------------------------------------------------------------
  ctx.fillStyle = "rgba(0,0,0,.7)";
  ctx.font = `600 ${11 * SCALE}px system-ui, sans-serif`;
  ctx.fillText("Cards", innerX, cy);

  const stacksTop = cy + (12 * SCALE);
  const grouped = groupCardsByBonus(cards, ["white","blue","green","red","black","yellow"]);

  let sx = innerX;
  for (const color of ["white","blue","green","red","black","yellow"]) {
    const pile = grouped[color] ?? [];

    drawStackWithPeek(ctx, pile, {
      x: sx,
      y: stacksTop,
      w: CARD_WH.w,
      h: CARD_WH.h,
      peek: Math.floor(CARD_WH.h * 0.25),
      maxVisible: 6,
    });

    ctx.fillStyle = "rgba(0,0,0,.75)";
    ctx.font = `600 ${10 * SCALE}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(`${pile.length}`, sx + CARD_WH.w / 2, stacksTop + CARD_WH.h + 2);

    sx += CARD_WH.w + GAP;
  }

  // ------------------------------------------------------------------
  // NOBLES ROW (full-size nobles)
  // ------------------------------------------------------------------
  const noblesLabelY = y + h - pad - NOBLE_WH.h - (12 * SCALE) - GAP;
  const noblesRowY = noblesLabelY + (12 * SCALE);

  ctx.fillStyle = "rgba(0,0,0,.7)";
  ctx.font = `600 ${11 * SCALE}px system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("Nobles", innerX, noblesLabelY);

  let nx = innerX;
  for (let i = 0; i < Math.min(3, nobles.length); i++) {
    drawNoble(ctx, { x: nx, y: noblesRowY, w: NOBLE_WH.w, h: NOBLE_WH.h }, nobles[i]);
    nx += NOBLE_WH.w + GAP;
  }
}

//   -----------------------
//   Helpers for the panel
//   ----------------------- 

function groupCardsByBonus(cards, colors) {
  const out = {};
  for (const c of colors) out[c] = [];
  for (const card of (cards ?? [])) {
    const b = card?.bonus ?? "white";
    (out[b] ??= []).push(card);
  }
  return out;
}

// Draw up to N cards, slightly offset (for reserved)
function drawFannedCards(ctx, cards, { x, y, w, h, max = 3, dx = 8, dy = 0 }) {
  const n = Math.min(max, cards?.length ?? 0);
  for (let i = 0; i < n; i++) {
    const card = cards[i];
    drawDevelopmentCard(ctx, { x: x + i * dx, y: y + i * dy, w, h }, card);
  }

  // If zero, draw placeholder outline
  if (n === 0) {
    roundedRectPath(ctx, x, y, w, h, 10);
    ctx.strokeStyle = "rgba(0,0,0,.25)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

// Draw a "stack" where only the top quarter of each below card shows
function drawStackWithPeek(ctx, cards, { x, y, w, h, peek, maxVisible = 6 }) {
  const n = Math.min(maxVisible, cards?.length ?? 0);

  // Draw from top -> bottom so the bottom-most (largest y) is drawn last and ends up on top.
  for (let i = 0; i < n; i++) {
    const card = cards[i];
    const yy = y + (i * peek);
    drawDevelopmentCard(ctx, { x, y: yy, w, h }, card);
  }

  // placeholder if empty
  if (n === 0) {
    roundedRectPath(ctx, x, y, w, h, 10);
    ctx.strokeStyle = "rgba(0,0,0,.25)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

*/
