import { computeLayout } from "./layout.js";
import { clampCamera } from "./camera.js";


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
  let viewport = { width: 0, height: 0, dpr: 1 };
  let layout = null;

  /*
    hitRegions is rebuilt each frame.
    Each entry is a clickable thing: card, token, button, etc.
  */
  let hitRegions = [];

  return {
    resize(nextViewport) {
      viewport = nextViewport;
      layout = computeLayout({viewport});

      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
    },

    getBounds() {
      return layout?.bounds ?? null;
    },

    draw(state, uiState) {
      if (!layout) return;

      const cam = uiState.camera;
      if (!cam) throw new Error("uiState.camera missing (add to createUIState)");
      clampCamera(cam);

      // 1) Clear in DEVICE PIXELS (so it always clears fully)
      const canvas = ctx.canvas;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 2) Set DPR transform so our units are CSS pixels
      const dpr = viewport.dpr ?? 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // 3) Apply camera (world -> screen)
      ctx.translate(-cam.x * cam.scale, -cam.y * cam.scale);
      ctx.scale(cam.scale, cam.scale);

      // Rebuild clickable regions every frame
      hitRegions.length = 0;

      layout.slots.forEach(e => {

        // Resolve positionIndex → actual playerIndex for panel slots
        if (e.positionIndex != null) {
          const numPlayers = state.players?.length ?? 0;
          if (e.positionIndex >= numPlayers) return; // skip panels for absent players
          const my = typeof uiState.myPlayerIndex === "number" ? uiState.myPlayerIndex : 0;
          const playerIndex = (my + e.positionIndex) % numPlayers;
          e.statePath[1] = playerIndex;
        }

        const stateObject = e.statePath ? getByStatePath(state, e.statePath) : {};
        if (!stateObject) return;

        const objectDrawn = drawSelect(ctx, state, uiState, stateObject, e);

        if (!objectDrawn) return;

        hitRegions.push({
          uiID: e.uiID,
          kind: e.kind,
          tier: e.tier ?? null,
          index: e.index ?? null,
          playerIndex: e.playerIndex ?? null,
          positionIndex: e.positionIndex ?? null,
          color: e.color ?? null,

          // World-space hit rect (NO CLAMPING)
          x: e.x, y: e.y, w: e.w, h: e.h,

          meta: stateObject,
        });
        
      });

      // Game-over overlay
      if (state.gameOver && typeof state.winner === "number") {
        // Reset to screen space (undo camera transform)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const w = viewport.width;
        const h = viewport.height;

        // Dim the board
        ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
        ctx.fillRect(0, 0, w, h);

        // Winner banner
        const winnerName = state.players[state.winner]?.name ?? `Player ${state.winner + 1}`;
        const prestige = (state.players[state.winner]?.cards ?? []).reduce((s, c) => s + (c.points ?? 0), 0)
          + (state.players[state.winner]?.nobles ?? []).reduce((s, n) => s + (n.points ?? 0), 0);

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        ctx.fillStyle = "#ffd700";
        ctx.font = `bold ${Math.max(28, Math.floor(w * 0.06))}px system-ui, sans-serif`;
        ctx.fillText(`${winnerName} wins!`, w / 2, h / 2 - 20);

        ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
        ctx.font = `${Math.max(16, Math.floor(w * 0.03))}px system-ui, sans-serif`;
        ctx.fillText(`${prestige} prestige points`, w / 2, h / 2 + 20);
      }

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

function isHovered(uiID, uiState) {
  return uiState.isHovered?.uiID === uiID;
}

function drawSelect(ctx, state, uiState, stateObject, { uiID, kind, color, playerIndex, positionIndex, x, y, w, h, text }) {
  switch (kind) {
    case "decks.tier1":
      //drawCard(ctx, { x, y, w, h } );
      stateObject[0] ? drawDeckCard(ctx, { x, y, w, h }, {
        color: "green"
      } ) : null;
      return true;
    case "decks.tier2":
      //drawCard(ctx, { x, y, w, h } );
      stateObject[0] ? drawDeckCard(ctx, { x, y, w, h }, {
        color: "yellow"
      } ) : null;
      return true;
    case "decks.tier3":
      //drawCard(ctx, { x, y, w, h } );
      stateObject[0] ? drawDeckCard(ctx, { x, y, w, h }, {
        color: "blue"
      } ) : null;
      return true;
    case "market.card":
      //stateObject ? drawCard(ctx, { x, y, w, h } ) : null;

      drawCardShadow(ctx, { x, y, w, h }, {})

      if (isHovered(uiID, uiState)) { y -= 4 };

      stateObject ? drawDevelopmentCard(ctx, { x, y, w, h }, {
        points: stateObject.points,
        bonus: stateObject.bonus,
        cost: stateObject.cost,
        //banner: stateObject.id
      }) : null;

      return true;
    case "token":

      drawTokenShadow(ctx, { x, y, w, h }, {});

      if (isHovered(uiID, uiState)) { y -= 4 };

      stateObject > 0 ? drawToken(ctx, color, { x, y, w, h }, {
        count: stateObject
      } ) : null;
      return true;
    case "noble":
      //stateObject ? drawCard(ctx, { x, y, w, h } ) : null // update this later to draw a noble card
      stateObject ? drawNoble(ctx, { color, x, y, w, h }, stateObject ) : null;
      return true;
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
      return true;
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
      return true;
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
      return true;
    }

    case "panel.bg": {
      const numPlayers = state.players?.length ?? 0;
      const my = typeof uiState.myPlayerIndex === "number" ? uiState.myPlayerIndex : 0;
      const playerIndex = (my + positionIndex) % numPlayers;
      const isMe = uiState.myPlayerIndex === playerIndex;
      const isActive = state.activePlayerIndex === playerIndex;
      const player = stateObject;

      // Panel background
      ctx.save();
      roundedRectPath(ctx, x, y, w, h, 14);
      ctx.fillStyle = isActive ? "rgba(255, 215, 0, 0.12)" : "rgba(243, 243, 243, 0.85)";
      ctx.fill();
      ctx.strokeStyle = isMe ? "#111" : "rgba(0,0,0,0.25)";
      ctx.lineWidth = isMe ? 3 : 1.5;
      ctx.stroke();

      // Active turn accent line at top
      if (isActive) {
        ctx.beginPath();
        const accentR = 14;
        ctx.moveTo(x + accentR, y);
        ctx.arcTo(x + w, y, x + w, y + accentR, accentR);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x, y);
        ctx.closePath();
        ctx.fillStyle = "rgba(255, 215, 0, 0.5)";
        ctx.fill();
      }

      // Player name
      const name = player?.name ?? `Player ${playerIndex + 1}`;
      const fromCards  = (player?.cards ?? []).reduce((s, c) => s + (c.points ?? 0), 0);
      const fromNobles = (player?.nobles ?? []).reduce((s, n) => s + (n.points ?? 0), 0);
      const prestige = fromCards + fromNobles;

      ctx.fillStyle = "#111";
      ctx.font = `${isMe ? "bold " : ""}16px system-ui, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(name, x + 12, y + 22);

      // Prestige points (right-aligned)
      ctx.textAlign = "right";
      ctx.fillStyle = prestige >= 15 ? "#d4a017" : "#555";
      ctx.font = `bold 15px system-ui, sans-serif`;
      ctx.fillText(`${prestige} pt`, x + w - 12, y + 22);
      ctx.restore();
      return true;
    }

    case "reserved":
      drawReservedShadow(ctx, { x, y, w, h }, {});
      if (isHovered(uiID, uiState)) { y -= 4 };
      stateObject ? drawReserved(ctx, { x, y, w, h }, stateObject ) : null;
      return true;
    case "fanned.cards": {
      const grouped = groupCardsByBonus(stateObject, ["white","blue","green","red","black"]);
      const pile = grouped[color] ?? [];
      stateObject ? drawFannedCards(ctx, { color, x, y, w, h }, pile ) : null;
      return true;
    }
    case "fanned.nobles":
      stateObject ? drawFannedNobles(ctx, { color, x, y, w, h }, stateObject ) : null;
      return true;

    default:
      // Code to execute if none of the cases match
      return false
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

function getTextColor(backgroundColor) {
  //return ( (backgroundColor === GEM_COLORS.blue) || (backgroundColor === GEM_COLORS.black) ) ? "#E9EEF3" : "rgba(0,0,0,1)";
  return (backgroundColor === GEM_COLORS.white || backgroundColor === "white" || backgroundColor === GEM_COLORS.yellow || backgroundColor === "yellow")
    ? "rgba(0,0,0,1)"
    : "#E9EEF3";
}

function drawCard(ctx, { x, y, w, h }, fill = "#000000ff", stroke = "rgba(0,0,0,.12)") {
  roundedRectPath(ctx, x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawTokenShadow(ctx, { x, y, w, h }, {}) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = Math.min(w, h) / 2;

  // Support either a color key ("red") or a hex string ("#D94A4A")
  const shadowColor = "rgba(0,0,0,0.25)";

  // --- 1) outer rim (colored)
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = shadowColor;
  ctx.fill();
}

/*
  Simple token drawing (circle) for demo.
  Hitbox is still a rectangle from the token object in draw().
*/
function drawToken(ctx, color, { x, y, w, h }, { count }) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = Math.min(w, h) / 2;

  // Support either a color key ("red") or a hex string ("#D94A4A")
  const rimFill = GEM_COLORS[color] ?? color ?? "#888";

  // Geometry
  const rimThickness = Math.max(2, r * 0.18);      // thickness of colored rim
  const innerR = Math.max(0, r - rimThickness);    // cream center radius
  const gemR = r * 0.50;                           // gem is half the token diameter => radius = 0.5r

  // --- 1) outer rim (colored)
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = rimFill;
  ctx.fill();

  // --- 2) inner center (cream)
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.fillStyle = "#e0d3b2"; // off-white / cream
  ctx.fill();

  // --- 3) center gem (reuse your faceted diamond gem)
  // pass the KEY if possible so drawGem can pick GEM_COLORS
  const gemColorKeyOrHex = (GEM_COLORS[color] ? color : rimFill);
  drawGem(ctx, cx, cy, gemR, gemColorKeyOrHex, "");

  // --- 4) outline (subtle black)
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // --- 5) count text
  if (count != null) {
    // If rim is dark (blue/black), use light text; otherwise dark text
    //const isDarkKey = (color === "blue" || color === "black");
    ctx.fillStyle = getTextColor(color);
    ctx.font = `700 ${Math.max(12, Math.floor(r * 0.55))}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(count), cx, cy);
  }
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
  // --- helpers ---
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const hexToRgb = (hex) => {
    const s0 = String(hex).trim().replace("#", "");
    const s = (s0.length === 3)
      ? s0.split("").map(c => c + c).join("")
      : s0.slice(0, 6);

    const n = parseInt(s, 16);
    if (!Number.isFinite(n)) return null;

    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };

  const rgbToCss = (rgb, a = 1) => `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;

  const lighten = (rgb, amt) => ({
    r: clamp(Math.round(rgb.r + (255 - rgb.r) * amt), 0, 255),
    g: clamp(Math.round(rgb.g + (255 - rgb.g) * amt), 0, 255),
    b: clamp(Math.round(rgb.b + (255 - rgb.b) * amt), 0, 255),
  });

  const darken = (rgb, amt) => ({
    r: clamp(Math.round(rgb.r * (1 - amt)), 0, 255),
    g: clamp(Math.round(rgb.g * (1 - amt)), 0, 255),
    b: clamp(Math.round(rgb.b * (1 - amt)), 0, 255),
  });

  // --- resolve "color" to an RGB object ---
  // If you pass "red" -> use GEM_COLORS.red
  // If you pass "#D94A4A" -> use that
  // If you pass {r,g,b} -> use that
  let baseRgb = null;

  if (color && typeof color === "object" && Number.isFinite(color.r)) {
    baseRgb = { r: color.r, g: color.g, b: color.b };
  } else {
    const keyOrHex = GEM_COLORS[color] ?? color; // key -> hex, hex -> hex
    baseRgb = hexToRgb(keyOrHex);
  }

  // Fallback (avoid invalid fillStyle => black)
  if (!baseRgb) baseRgb = { r: 80, g: 80, b: 80 };

  const light = lighten(baseRgb, 0.35);
  const midLight = lighten(baseRgb, 0.18);
  const dark = darken(baseRgb, 0.35);
  const dark2 = darken(baseRgb, 0.20);

  // --- outer diamond ---
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();

  ctx.fillStyle = rgbToCss(baseRgb);
  ctx.fill();

  // --- facet geometry (Option 2) ---
  const innerTopY = cy - r * 0.25;
  const innerBottomY = cy + r * 0.25;

  // top-left facet
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx - r * 0.55, cy);
  ctx.lineTo(cx, innerTopY);
  ctx.closePath();
  ctx.fillStyle = rgbToCss(light);
  ctx.fill();

  // top-right facet
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r * 0.55, cy);
  ctx.lineTo(cx, innerTopY);
  ctx.closePath();
  ctx.fillStyle = rgbToCss(midLight);
  ctx.fill();

  // bottom-left facet
  ctx.beginPath();
  ctx.moveTo(cx, cy + r);
  ctx.lineTo(cx - r * 0.55, cy);
  ctx.lineTo(cx, innerBottomY);
  ctx.closePath();
  ctx.fillStyle = rgbToCss(dark);
  ctx.fill();

  // bottom-right facet
  ctx.beginPath();
  ctx.moveTo(cx, cy + r);
  ctx.lineTo(cx + r * 0.55, cy);
  ctx.lineTo(cx, innerBottomY);
  ctx.closePath();
  ctx.fillStyle = rgbToCss(dark2);
  ctx.fill();

  // subtle ridge highlight
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx, cy + r);
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.stroke();

  // outline
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // optional label
  if (label) {
    // IMPORTANT: compare against the key, not the hex
    const isDark = (color === "blue" || color === "black");
    ctx.fillStyle = isDark ? "#E9EEF3" : "rgba(0,0,0,0.9)";
    ctx.font = `700 ${Math.max(10, Math.floor(r * 1.1))}px system-ui, sans-serif`;
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

  ctx.fillStyle = getTextColor(color);//( (color === GEM_COLORS.blue) || (color === GEM_COLORS.black) ) ? "#E9EEF3" : "rgba(0,0,0,1)";
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

  // --- gem (top-right)
  {
    const r = Math.max(6, Math.floor(Math.min(w, h) * 0.12));
    const cx = x + w - pad - r;
    const cy = y + pad + r;
    drawGem(ctx, cx, cy, r, bonus, "");
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

function drawCardShadow(ctx, { x, y, w, h }, card = {}) {
  
  const shadowColor = "rgba(0,0,0,0.25)";
  //const shadowBlur = 12;
  const shadowOffsetY = 6;

  // --- base card
  roundedRectPath(ctx, x, y, w, h);
  //ctx.fillStyle = rgbToCss(cardRgb, 1);
  //ctx.fill();
  ctx.fillStyle = shadowColor;
  ctx.fill();
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

function drawReservedShadow(ctx, { x, y, w, h }, stateObject) {
    // Save the current canvas state (coordinate system)
    ctx.save();

    // Move the canvas origin (0,0) to the center of the object
    ctx.translate(x, y);

    // Rotate the context by 90 degrees (Math.PI / 2 radians)
    ctx.rotate(90 * Math.PI / 180); // or Math.PI / 2

    // Draw card, offset by height so top left corner of rotated card at intended location
    drawCardShadow(ctx, { x: 0, y: -w, w: h, h: w }, {  // note y, w and h have been adjusted to draw card correctly but line up with layout.js coords
    })

    // Restore the canvas to its original state before the translation and rotation
    ctx.restore();
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

function drawFannedNobles(ctx, { color, x, y, w, h }, stateObject ) {

  const peek = Math.floor(h * 0.30);
  const n = stateObject?.length ?? 0;

  // Draw from top -> bottom so the bottom-most (largest y) is drawn last and ends up on top.
  for (let i = 0; i < n; i++) {
    const noble = stateObject[i];
    const yy = y + (i * peek);
    drawNoble(ctx, { x, y: yy, w, h }, noble);
  }
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


//////////////////////////////////////////////
//////////// FOR SUMMARY CARDS ///////////////
//////////////////////////////////////////////

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawSummaryCard(ctx, { x, y, w, h }, makeOutlineBold, highlightedCenter) {
  ctx.save();
  roundRectPath(ctx, x, y, w, h, 10);
  ctx.fillStyle = highlightedCenter ? "yellow" : "#f3f3f3";
  ctx.fill();
  ctx.strokeStyle = "#111";
  ctx.lineWidth = makeOutlineBold ? 4 : 2;
  ctx.stroke();
  ctx.restore();
}

const COLOR_FILL = {
  yellow: "#D6B04C",
  green:  "#2E9B5F",
  red:    "#D94A4A",
  blue:   "#2E6BE6",
  black:  "#2B2B2B",
  white:  "#E9EEF3",
};

function drawPipValue(ctx, color, { x, y, w, h }, value = "0") {
  const cx = x - w/2;
  const cy = y - h/2;
  //const r = Math.min(h * 0.35);
  drawToken(ctx, color, { x: cx, y: cy, w, h}, { count: value })

  /*
  ctx.save();
  // pip
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = COLOR_FILL[color] ?? "#ccc";
  ctx.fill();
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // text
  if (color == "black") { ctx.fillStyle = "#ccc"} else { ctx.fillStyle = "#111"};
  ctx.font = "14px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(valueText ?? ""), cx, cy);
  ctx.restore();
  */
}

