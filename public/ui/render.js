import { computeLayout } from "./layout.js";
import { clampCamera } from "./camera.js";
import { drawCardSprite, drawCardProcedural, loadSpriteSheet, setCardArtMode, getCardArtMode, clearProceduralCache } from "./cardart.js";
import { rulesCheck } from "./rules.js";


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

// positionIndex → playerIndex mapping (fixed layout, never changes)
const FIXED_MAP = [1, 3, 0, 2];

// Noble tile cache: key → offscreen canvas. Cleared on resize.
const _nobleCache = new Map();

// Per-frame groupCardsByBonus cache: cards array ref → grouped object.
// WeakMap so we don't need explicit clearing — refs are per-state.
const _groupedCache = new WeakMap();

// Gem sprite cache: key → { canvas, size }
// Cleared on resize since DPR or layout may change.
const _gemCache = new Map();
let _dpr = 1; // updated by resize(), used by drawGemCached()

// --- Pure color helpers (hoisted from drawDevelopmentCard for allocation reuse) ---
const clamp01 = (t) => Math.max(0, Math.min(1, t));

const hexToRgb = (hex) => {
  const s = String(hex).replace("#", "").trim();
  const v = s.length === 3
    ? s.split("").map((c) => c + c).join("")
    : s.padEnd(6, "0").slice(0, 6);
  const n = parseInt(v, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

const mixRgb = (a, b, t) => {
  t = clamp01(t);
  return {
    r: Math.round(a.r * (1 - t) + b.r * t),
    g: Math.round(a.g * (1 - t) + b.g * t),
    b: Math.round(a.b * (1 - t) + b.b * t),
  };
};

const desaturate = (rgb, amt) => {
  amt = clamp01(amt);
  const gray = Math.round((rgb.r + rgb.g + rgb.b) / 3);
  return mixRgb(rgb, { r: gray, g: gray, b: gray }, amt);
};

const rgbToCss = (rgb, a = 1) => `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;

// Text width cache: font|text → width. Cleared on resize alongside _gemCache.
const _textWidthCache = new Map();

function measureTextCached(ctx, font, text) {
  const key = `${font}|${text}`;
  let w = _textWidthCache.get(key);
  if (w !== undefined) return w;
  ctx.font = font; // ensure correct font is set for measurement
  w = ctx.measureText(text).width;
  _textWidthCache.set(key, w);
  return w;
}

// Affordability cache: avoids 24 rulesCheck() calls on hover-only frames.
// Invalidated by state reference change.
let _affordState = null;
let _affordMyIdx = null;
const _affordCache = new Map(); // card.id → boolean

function isAffordable(state, uiState, card, tier, index) {
  const id = card.id;
  let result = _affordCache.get(id);
  if (result !== undefined) return result;
  result = rulesCheck({
    getState: () => state, uiState,
    pending: { tokens: {}, card: "" },
    action: "buyCard",
    card: { meta: card, tier, index }
  });
  _affordCache.set(id, result);
  return result;
}

// Card color cache: hex → { headerCss, spriteHeaderCss }
// Only ~6 unique bonus colors, geometry-independent — never needs clearing.
const _cardColorCache = new Map();
function getCardColors(hex) {
  let entry = _cardColorCache.get(hex);
  if (entry) return entry;
  const baseRgb = hexToRgb(hex);
  const cardRgb = desaturate(baseRgb, 0.35);
  const headerRgb = mixRgb(cardRgb, { r: 255, g: 255, b: 255 }, 0.55);
  entry = {
    headerCss: rgbToCss(headerRgb, 0.65),
    spriteHeaderCss: rgbToCss(mixRgb(baseRgb, { r: 0, g: 0, b: 0 }, 0.4), 0.65),
  };
  _cardColorCache.set(hex, entry);
  return entry;
}

function getCachedGem(color, r, label, dpr) {
  const key = `${color}|${r}|${label}|${dpr}`;
  let entry = _gemCache.get(key);
  if (entry) return entry;

  // Render gem to an offscreen canvas
  const pad = 4; // extra pixels for stroke and glow bleed
  const size = Math.ceil(r * 2.6) + pad * 2; // generous to contain all shapes
  const oc = document.createElement("canvas");
  oc.width = Math.ceil(size * dpr);
  oc.height = Math.ceil(size * dpr);
  const octx = oc.getContext("2d");
  octx.scale(dpr, dpr);
  drawGem(octx, size / 2, size / 2, r, color, label);
  entry = { canvas: oc, size };
  _gemCache.set(key, entry);
  return entry;
}

function drawGemCached(ctx, cx, cy, r, color, label = "") {
  const { canvas: oc, size } = getCachedGem(color, r, label, _dpr);
  ctx.drawImage(oc, cx - size / 2, cy - size / 2, size, size);
}

// Pip scale multiplier for "Granny Mode" — set at the start of each draw() call
let _pipScale = 1;

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
      _dpr = viewport.dpr || 1;
      layout = computeLayout({viewport});
      _gemCache.clear(); // DPR or layout may have changed
      _nobleCache.clear();
      _textWidthCache.clear();
      clearProceduralCache();

      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
    },

    getBounds() {
      return layout?.bounds ?? null;
    },

    draw(state, uiState) {
      if (!layout) return;

      const newPipScale = uiState.grannyMode ? 2 : 1;
      if (newPipScale !== _pipScale) {
        _pipScale = newPipScale;
        _nobleCache.clear();
      }

      // Invalidate affordability cache when state changes
      const myIdx = uiState.myPlayerIndex;
      if (state !== _affordState || myIdx !== _affordMyIdx) {
        _affordState = state;
        _affordMyIdx = myIdx;
        _affordCache.clear();
      }

      const cam = uiState.camera;
      if (!cam) throw new Error("uiState.camera missing (add to createUIState)");
      clampCamera(cam);

      // 1) Clear in DEVICE PIXELS (so it always clears fully)
      const canvas = ctx.canvas;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = uiState.lightMode ? "#c8c8ca" : "#3a3a3c";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 2) Set DPR transform so our units are CSS pixels
      const dpr = viewport.dpr ?? 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // 3) Apply camera (world -> screen)
      ctx.translate(-cam.x * cam.scale, -cam.y * cam.scale);
      ctx.scale(cam.scale, cam.scale);

      // Disable image smoothing for the whole frame (pixel-art sprites)
      ctx.imageSmoothingEnabled = false;

      // Rebuild clickable regions every frame
      hitRegions.length = 0;

      layout.slots.forEach(e => {

        // Resolve positionIndex → actual playerIndex for panel slots
        if (e.positionIndex != null) {
          if (uiState.simplifiedView) return; // hide panels in simplified view
          const numPlayers = state.players?.length ?? 0;
          // Fixed layout: posIdx 0=top-right→P2, 1=bottom-right→P4, 2=top-left→P1, 3=bottom-left→P3
          const playerIndex = FIXED_MAP[e.positionIndex];
          if (playerIndex >= numPlayers) return; // skip panels for absent players
          e.statePath[1] = playerIndex;
        }

        const stateObject = e.statePath ? getByStatePath(state, e.statePath) : {};
        if (!stateObject && e.kind !== "reserved") return;

        const objectDrawn = drawSelect(ctx, state, uiState, stateObject, e);

        if (!objectDrawn) return;

        // panel.bg is drawn but not clickable — skip hit region so it
        // doesn't swallow clicks on reserved cards, tokens, etc.
        if (e.kind === "panel.bg") return;

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

      // Remote cursors (world-space, drawn under camera transform)
      const cursors = uiState.remoteCursors;
      if (cursors && uiState.showCursors) {
        const now = Date.now();
        const s = 1 / cam.scale; // keep cursor a fixed screen size
        for (const id in cursors) {
          const c = cursors[id];
          const age = now - c.ts;
          if (age > 3000) continue;
          // Fade out during last second (2s–3s)
          const alpha = age > 2000 ? 1 - (age - 2000) / 1000 : 1;
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.translate(c.x, c.y);
          ctx.scale(s, s);
          // Arrow cursor (12×18 screen px)
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(0, 18);
          ctx.lineTo(5, 14);
          ctx.lineTo(9, 21);
          ctx.lineTo(12, 20);
          ctx.lineTo(8, 13);
          ctx.lineTo(13, 13);
          ctx.closePath();
          ctx.fillStyle = c.color;
          ctx.fill();
          ctx.strokeStyle = "#000";
          ctx.lineWidth = 1.2;
          ctx.stroke();
          // Name label
          if (c.name) {
            ctx.font = "bold 11px sans-serif";
            ctx.fillStyle = c.color;
            ctx.strokeStyle = "rgba(0,0,0,0.7)";
            ctx.lineWidth = 2.5;
            ctx.strokeText(c.name, 14, 14);
            ctx.fillText(c.name, 14, 14);
          }
          ctx.restore();
        }
      }

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
        ctx.font = `bold ${Math.max(28, Math.floor(w * 0.06))}px 'Plus Jakarta Sans', system-ui, sans-serif`;
        ctx.fillText(`${winnerName} wins!`, w / 2, h / 2 - 20);

        ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
        ctx.font = `${Math.max(16, Math.floor(w * 0.03))}px 'Plus Jakarta Sans', system-ui, sans-serif`;
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

function drawSelect(ctx, state, uiState, stateObject, { uiID, kind, color, tier, index, playerIndex, positionIndex, x, y, w, h, text, panelLayout }) {
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
    case "market.card": {
      //stateObject ? drawCard(ctx, { x, y, w, h } ) : null;

      drawCardShadow(ctx, { x, y, w, h }, {})

      const cardPending = uiState.pending?.card?.tier === tier && uiState.pending?.card?.index === index;

      // Dim unaffordable cards when it's the player's turn and idle
      const myTurn = typeof uiState.myPlayerIndex === "number"
        && uiState.myPlayerIndex === state.activePlayerIndex
        && !state.gameOver;
      const dimMarket = myTurn && (uiState.mode ?? "idle") === "idle" && stateObject
        && !isAffordable(state, uiState, stateObject, tier, index);

      if (!dimMarket && (isHovered(uiID, uiState) || cardPending)) { y -= 4 };
      if (dimMarket) ctx.globalAlpha = 0.7;

      stateObject ? drawDevelopmentCard(ctx, { x, y, w, h }, {
        id: stateObject.id,
        points: stateObject.points,
        bonus: stateObject.bonus,
        cost: stateObject.cost,
      }) : null;

      if (dimMarket) ctx.globalAlpha = 1.0;

      if (cardPending) {
        roundedRectPath(ctx, x - 2, y - 2, w + 4, h + 4, 16);
        ctx.strokeStyle = "#ffd700";
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      return true;
    }
    case "token": {

      drawTokenShadow(ctx, { x, y, w, h }, {});

      const tokenPending = uiID.startsWith("bank.") && (uiState.pending?.tokens?.[color] ?? 0) > 0;
      const isBank = uiID.startsWith("bank.");
      const canTakeToken = isBank && (tokenPending || rulesCheck({
        getState: () => state, uiState,
        pending: uiState.pending ?? { tokens: {}, card: "" },
        action: "takeToken", color
      }));
      if (canTakeToken && (isHovered(uiID, uiState) || tokenPending)) { y -= 4 };

      stateObject > 0 ? drawToken(ctx, color, { x, y, w, h }, {
        count: stateObject
      } ) : null;

      if (tokenPending) {
        const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2 + 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = "#ffd700";
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      return true;
    }
    case "noble":
      //stateObject ? drawCard(ctx, { x, y, w, h } ) : null // update this later to draw a noble card
      stateObject ? drawNobleCached(ctx, { color, x, y, w, h }, stateObject ) : null;
      return true;
    case "panel.bg": {
      const playerIndex = FIXED_MAP[positionIndex];
      const isMe = uiState.myPlayerIndex === playerIndex;
      const isActive = state.activePlayerIndex === playerIndex;
      const player = stateObject;
      const pad = panelLayout?.pad ?? 0;

      // Compute dynamic panel height based on actual content
      // Minimum always includes the card row (dashed placeholders visible)
      let drawH = h; // fallback to full PANEL_H
      if (panelLayout && player) {
        const { cardRowY, cardH, cardPeek, padding } = panelLayout;
        // Find max cards of a single color
        const cards = player.cards ?? [];
        const counts = {};
        for (const c of cards) { const b = c?.bonus; if (b) counts[b] = (counts[b] ?? 0) + 1; }
        const maxStack = Math.max(0, ...Object.values(counts));
        // Minimum: card row top + one base card height + padding (shows empty placeholders)
        const minH = cardRowY + cardH + padding;
        // If stacked cards exceed that, expand
        const stackH = maxStack > 1 ? cardRowY + cardH + cardPeek * (maxStack - 1) + padding : minH;
        drawH = Math.max(minH, stackH);
      }

      // Panel background with player color tint
      const accentColor = SEAT_ACCENT_COLORS[playerIndex] ?? "rgba(0,0,0,0.25)";
      ctx.save();
      roundedRectPath(ctx, x, y, w, drawH, 14);
      // Active panel: colored glow in accent color
      if (isActive) {
        ctx.shadowColor = accentColor;
        ctx.shadowBlur = 24;
        ctx.shadowOffsetY = 0;
      }
      ctx.fillStyle = "rgba(243, 243, 243, 0.85)";
      ctx.fill();
      // Clear shadow before stroke
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      // Player color tint overlay
      ctx.save();
      roundedRectPath(ctx, x, y, w, drawH, 14);
      ctx.clip();
      ctx.fillStyle = accentColor;
      ctx.globalAlpha = isActive ? 0.08 : 0.06;
      ctx.fillRect(x, y, w, drawH);
      ctx.globalAlpha = 1;
      ctx.restore();
      // Border — active player gets thicker
      roundedRectPath(ctx, x, y, w, drawH, 14);
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = isActive ? (isMe ? 5 : 4) : (isMe ? 3 : 1.5);
      ctx.stroke();

      // Token row background band
      if (panelLayout) {
        ctx.save();
        roundedRectPath(ctx, x, y, w, drawH, 14);
        ctx.clip();
        ctx.fillStyle = "rgba(0,0,0,0.10)";
        ctx.fillRect(x, y + panelLayout.tokenRowY, w, panelLayout.tokenRowH + pad);
        // Accent-colored top border
        const acRgb = hexToRgb(accentColor);
        ctx.strokeStyle = rgbToCss(acRgb, 0.25);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y + panelLayout.tokenRowY + 0.5);
        ctx.lineTo(x + w, y + panelLayout.tokenRowY + 0.5);
        ctx.stroke();
        ctx.restore();
      }

      // Player name + stats
      const name = player?.name ?? `Player ${playerIndex + 1}`;
      const fromCards  = (player?.cards ?? []).reduce((s, c) => s + (c.points ?? 0), 0);
      const fromNobles = (player?.nobles ?? []).reduce((s, n) => s + (n.points ?? 0), 0);
      const prestige = fromCards + fromNobles;
      const gems   = (player?.cards ?? []).filter(c => c.bonus).length;
      const tokens = Object.values(player?.tokens ?? {}).reduce((s, n) => s + n, 0);

      const headerCenterY = y + pad + (panelLayout?.headerH ?? 30) / 2;

      // Name (left-aligned, inset by pad)
      ctx.fillStyle = accentColor;
      const nameFont = `bold 16px 'Plus Jakarta Sans', system-ui, sans-serif`;
      ctx.font = nameFont;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";

      // Play triangle for active player
      let nameLeftX = x + pad + 12;
      if (isActive) {
        const triH = 12;                     // triangle height
        const triW = triH * 0.85;            // slightly narrower than equilateral
        const triX = nameLeftX;              // left edge of triangle
        const triCY = headerCenterY;         // vertically centered

        ctx.save();
        // Brilliant glow in player's accent color
        const acRgbTri = hexToRgb(accentColor);
        ctx.shadowColor = rgbToCss(acRgbTri, 0.9);
        ctx.shadowBlur = 14;
        ctx.fillStyle = accentColor;
        // Draw the play triangle (pointing right)
        ctx.beginPath();
        ctx.moveTo(triX, triCY - triH / 2);
        ctx.lineTo(triX + triW, triCY);
        ctx.lineTo(triX, triCY + triH / 2);
        ctx.closePath();
        ctx.fill();
        // Second fill pass to intensify the glow
        ctx.shadowBlur = 8;
        ctx.shadowColor = rgbToCss({ r: Math.min(255, acRgbTri.r + 80), g: Math.min(255, acRgbTri.g + 80), b: Math.min(255, acRgbTri.b + 80) }, 0.7);
        ctx.fill();
        ctx.restore();

        nameLeftX += triW + 6;               // shift name right to make room
      }

      ctx.fillText(name, nameLeftX, headerCenterY);

      // Stats drawn right-to-left: prestige, then tokens, then gems
      ctx.textAlign = "right";
      let rx = x + w - pad - 8;

      // Prestige
      ctx.fillStyle = prestige >= 15 ? "#d4a017" : "#555";
      const prestigeFont = `bold 14px 'Plus Jakarta Sans', system-ui, sans-serif`;
      ctx.font = prestigeFont;
      const prestigeText = `${prestige}pt`;
      ctx.fillText(prestigeText, rx, headerCenterY);
      rx -= measureTextCached(ctx, prestigeFont, prestigeText) + 10;

      // Token count (circle icon + number)
      ctx.fillStyle = "#555";
      const statFont = `13px 'Plus Jakarta Sans', system-ui, sans-serif`;
      ctx.font = statFont;
      const tokensText = String(tokens);
      ctx.fillText(tokensText, rx, headerCenterY);
      rx -= measureTextCached(ctx, statFont, tokensText) + 2;
      ctx.beginPath();
      ctx.arc(rx - 4, headerCenterY, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#aaa";
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 0.8;
      ctx.stroke();
      rx -= 18;

      // Gem count (diamond icon + number)
      ctx.fillStyle = "#555";
      ctx.font = statFont;
      ctx.textAlign = "right";
      const gemsText = String(gems);
      ctx.fillText(gemsText, rx, headerCenterY);
      rx -= measureTextCached(ctx, statFont, gemsText) + 2;
      drawGemCached(ctx, rx - 4, headerCenterY, 6, "#888", "");
      rx -= 18;

      // Noble crowns — one per noble, centered in header
      const nobles = (player?.nobles ?? []).length;
      if (nobles > 0) {
        const crownH = 30;
        const crownW = crownH * 1.2;
        const crownGap = 4;
        const totalCrownsW = nobles * crownW + (nobles - 1) * crownGap;
        const crownStartX = x + w / 2 - totalCrownsW / 2 + crownW / 2;
        const crownCenterY = y + (panelLayout?.headerH ?? 30) / 2;
        for (let i = 0; i < nobles; i++) {
          drawCrown(ctx, crownStartX + i * (crownW + crownGap), crownCenterY, crownH);
        }
      }

      ctx.restore();
      return true;
    }

    case "reserved": {
      if (!stateObject) {
        // Empty slot placeholder — dashed outline
        const inset = 2;
        roundedRectPath(ctx, x + inset, y + inset, w - inset * 2, h - inset * 2, 10);
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = "rgba(0,0,0,0.15)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
        return true;
      }
      drawReservedShadow(ctx, { x, y, w, h }, {});
      const resPending = uiState.pending?.card?.tier === tier && uiState.pending?.card?.index === index;

      // Dim unaffordable reserved cards (own cards only, when idle on my turn)
      const myTurnRes = typeof uiState.myPlayerIndex === "number"
        && uiState.myPlayerIndex === state.activePlayerIndex
        && !state.gameOver;
      const isMyReserved = uiState.myPlayerIndex === FIXED_MAP[positionIndex];
      const dimReserved = myTurnRes && isMyReserved
        && (uiState.mode ?? "idle") === "idle"
        && !isAffordable(state, uiState, stateObject, tier, index);

      if (isMyReserved && !dimReserved && (isHovered(uiID, uiState) || resPending)) { y -= 4 };
      if (dimReserved) ctx.globalAlpha = 0.7;

      drawReserved(ctx, { x, y, w, h }, stateObject);

      if (dimReserved) ctx.globalAlpha = 1.0;

      if (resPending) {
        roundedRectPath(ctx, x - 2, y - 2, w + 4, h + 4, 16);
        ctx.strokeStyle = "#ffd700";
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      return true;
    }
    case "fanned.cards": {
      let grouped = stateObject && _groupedCache.get(stateObject);
      if (!grouped) {
        grouped = groupCardsByBonus(stateObject, ["white","blue","green","red","black"]);
        if (stateObject) _groupedCache.set(stateObject, grouped);
      }
      const pile = grouped[color] ?? [];
      stateObject ? drawFannedCards(ctx, { color, x, y, w, h }, pile ) : null;
      return true;
    }
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
  drawGemCached(ctx, cx, cy, gemR, gemColorKeyOrHex, "");

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
    ctx.font = `700 ${Math.max(12, Math.floor(r * 0.55))}px 'Plus Jakarta Sans', system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(count), cx, cy);
  }
}

export { render, drawGem, loadSpriteSheet, drawCardSprite, drawCardProcedural, setCardArtMode, getCardArtMode, clearProceduralCache };


















/**
 rather messy Chat GPT code for drawing cards cards, clean up later
 */
const SEAT_ACCENT_COLORS = ["#2D6CDF", "#D94A4A", "#2E9B5F", "#D6B04C"];

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
  // Resolve color key to canonical key for shape selection
  const key = GEM_COLORS[color] ? color : Object.entries(GEM_COLORS).find(([, v]) => v === color)?.[0] ?? null;

  // Color palette from GEM_COLORS
  const baseHex = GEM_COLORS[key] ?? color ?? "#888";
  const GEM_PALETTE = {
    white:  { color: "#e8e8e8", dark: "#b0b0b0", accent: "#d4e4f4" },
    blue:   { color: "#2255cc", dark: "#1a3a88", accent: "#88bbff" },
    green:  { color: "#1a8a4a", dark: "#0d5a2d", accent: "#66dd99" },
    red:    { color: "#cc2233", dark: "#881122", accent: "#ff8899" },
    black:  { color: "#333333", dark: "#111111", accent: "#777777" },
    yellow: { color: "#d4a017", dark: "#8a6a0f", accent: "#ffe066" },
  };
  const pal = GEM_PALETTE[key] ?? { color: baseHex, dark: baseHex, accent: baseHex };

  ctx.save();

  // --- 1) Build shape path based on gem type ---
  if (key === "white") {
    // Octagonal brilliant-cut diamond
    const pts = 8;
    ctx.beginPath();
    for (let i = 0; i < pts; i++) {
      const a = (Math.PI * 2 * i / pts) - Math.PI / 2;
      ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    ctx.closePath();
  } else if (key === "green") {
    // Emerald step-cut rectangle
    const w = r * 1.9, h = r * 1.5;
    const corner = r * 0.4;
    const x = cx - w / 2, y = cy - h / 2;
    ctx.beginPath();
    ctx.moveTo(x + corner, y);
    ctx.lineTo(x + w - corner, y);
    ctx.lineTo(x + w, y + corner);
    ctx.lineTo(x + w, y + h - corner);
    ctx.lineTo(x + w - corner, y + h);
    ctx.lineTo(x + corner, y + h);
    ctx.lineTo(x, y + h - corner);
    ctx.lineTo(x, y + corner);
    ctx.closePath();
  } else if (key === "blue") {
    // Oval-cut sapphire
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 1.1, r * 0.85, 0, 0, Math.PI * 2);
  } else if (key === "black") {
    // Cushion-cut onyx
    const cr = r * 0.3;
    const s = r * 1.7;
    const x = cx - s / 2, y = cy - s / 2;
    ctx.beginPath();
    ctx.moveTo(x + cr, y);
    ctx.quadraticCurveTo(x + s, y, x + s, y + cr);
    ctx.lineTo(x + s, y + s - cr);
    ctx.quadraticCurveTo(x + s, y + s, x + s - cr, y + s);
    ctx.lineTo(x + cr, y + s);
    ctx.quadraticCurveTo(x, y + s, x, y + s - cr);
    ctx.lineTo(x, y + cr);
    ctx.quadraticCurveTo(x, y, x + cr, y);
    ctx.closePath();
  } else {
    // Round cut (ruby, gold, fallback)
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
  }

  // --- 2) Fill with radial gradient ---
  const g = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, 0, cx, cy, r * 1.1);
  g.addColorStop(0, pal.accent);
  g.addColorStop(0.5, pal.color);
  g.addColorStop(1, pal.dark);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // --- 3) Clip to shape, draw radial brilliance facets ---
  ctx.clip();

  const facets = 16;
  const ir = r * 0.35;
  const mr = r * 0.7;
  for (let i = 0; i < facets; i++) {
    const a1 = Math.PI * 2 * i / facets;
    const a2 = Math.PI * 2 * (i + 1) / facets;
    const am = (a1 + a2) / 2;
    // Outer facet triangles
    ctx.beginPath();
    ctx.moveTo(cx + r * 1.2 * Math.cos(a1), cy + r * 1.2 * Math.sin(a1));
    ctx.lineTo(cx + mr * Math.cos(am), cy + mr * Math.sin(am));
    ctx.lineTo(cx + r * 1.2 * Math.cos(a2), cy + r * 1.2 * Math.sin(a2));
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 0.4;
    ctx.stroke();
    // Inner facet triangles
    ctx.beginPath();
    ctx.moveTo(cx + mr * Math.cos(am), cy + mr * Math.sin(am));
    ctx.lineTo(cx + ir * Math.cos(a1), cy + ir * Math.sin(a1));
    ctx.lineTo(cx + ir * Math.cos(a2), cy + ir * Math.sin(a2));
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 0.3;
    ctx.stroke();
  }

  // Center table
  ctx.beginPath();
  ctx.arc(cx, cy, ir, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.stroke();

  // Specular highlight
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.15, cy - r * 0.3, r * 0.35, r * 0.13, -0.3, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fill();

  ctx.restore();

  // --- 4) Gold coin extras (outside clip) ---
  if (key === "yellow") {
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.78, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,230,100,0.3)";
    ctx.font = `bold ${r * 0.9}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("\u2726", cx, cy + 1);
  }

  // --- 5) Optional label ---
  if (label) {
    const isRound = (key === "red" || key === "yellow");
    const fontSize = isRound ? Math.max(10, Math.floor(r * 1.1)) : Math.max(10, Math.floor(r * 1.4));
    ctx.fillStyle = key === "white" ? "rgba(0,0,0,0.9)" : "#fff";
    ctx.font = `700 ${fontSize}px 'Plus Jakarta Sans', system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, cx, cy);
  }
}

function drawCrown(ctx, cx, cy, height) {
  const h = height;
  const w = h * 1.2;
  const x = cx - w / 2;
  const y = cy - h / 2;

  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x + w * 0.1, y + h * 0.3);
  ctx.lineTo(x + w * 0.3, y + h * 0.7);
  ctx.lineTo(x + w * 0.5, y);
  ctx.lineTo(x + w * 0.7, y + h * 0.7);
  ctx.lineTo(x + w * 0.9, y + h * 0.3);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fillStyle = "#D6B04C";
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 0.8;
  ctx.stroke();
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
  ctx.font = `700 ${Math.max(10, Math.floor(s * 0.55))}px 'Plus Jakarta Sans', system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(text), x + s / 2, y + s / 2);
}

function drawDevelopmentCard(ctx, { x, y, w, h }, card = {}) {
  const {
    id = "",
    points = 0,
    bonus = "white",
    cost = {},
    banner = "",
    bg = null, // optional override
  } = card;

  const pad = Math.max(4, Math.floor(Math.min(w, h) * 0.06));
  const headerH = Math.floor(h * 0.25 * _pipScale);

  // base color derived from bonus (or overridden via bg)
  const baseHex = bg || CARD_BACKGROUND_COLORS[bonus] || "#cccccc";
  const colors = getCardColors(baseHex);

  // Try sprite sheet first, fall back to flat color
  roundedRectPath(ctx, x, y, w, h);
  ctx.fillStyle = "#222";
  ctx.fill();

  ctx.save();
  roundedRectPath(ctx, x, y, w, h);
  ctx.clip();

  const hasArt = id && (drawCardSprite(ctx, x, y, w, h, id) || drawCardProcedural(ctx, x, y, w, h, id, bonus));

  if (hasArt) {
    // Semi-transparent header band — lighter for procedural, bonus-tinted for sprites
    ctx.fillStyle = (getCardArtMode() === 2) ? colors.spriteHeaderCss : "rgba(0,0,0,0.2)";
    ctx.fillRect(x, y, w, headerH);

    // Semi-transparent footer band for cost pips (sized to fit rows)
    const _fPip = Math.max(12, Math.floor(Math.min(w, h) * 0.192 * _pipScale));
    const _fGap = Math.max(3, Math.floor(_fPip * 0.18));
    const _fCols = Math.max(1, Math.floor((w - 2 * pad + _fGap) / (_fPip + _fGap)));
    const _fEntries = Object.values(cost).filter(n => n > 0).length;
    const _fRows = Math.max(1, Math.ceil(_fEntries / _fCols));
    const footerH = _fRows * _fPip + (_fRows - 1) * _fGap + 2 * pad;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(x, y + h - footerH, w, footerH);
  } else {
    // Flat color fallback
    ctx.fillStyle = CARD_BACKGROUND_COLORS[bonus];
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = colors.headerCss;
    ctx.fillRect(x, y, w, headerH);
  }

  ctx.restore();

  // --- outer black border only
  roundedRectPath(ctx, x, y, w, h);
  ctx.strokeStyle = "rgba(0,0,0,1)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // --- points (top-left)
  if (points > 0) {
    ctx.fillStyle = hasArt ? "#fff" : "rgba(0,0,0,.9)";
    ctx.font = `700 ${Math.max(12, Math.floor(h * 0.20))}px 'Plus Jakarta Sans', system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    if (hasArt) { ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 3; }
    ctx.fillText(String(points), x + pad, y + pad * 0.8);
    ctx.shadowBlur = 0;
  }

  // --- gem (top-right) — in granny mode, match cost pip size
  {
    const r = _pipScale > 1
      ? Math.max(12, Math.floor(Math.min(w, h) * 0.192 * _pipScale)) / 2
      : Math.max(6, Math.floor(Math.min(w, h) * 0.12));
    const cx = x + w - pad - r;
    const cy = y + pad + r;
    drawGemCached(ctx, cx, cy, r, bonus, "");
  }

  // --- optional banner
  if (banner) {
    if (banner === "RESERVED") {
      // Elegant wrapped sash through the center of the card
      const sashH = Math.max(14, Math.floor(h * 0.15));
      const foldSize = Math.max(4, Math.floor(sashH * 0.35));
      const ribbonColor = CARD_BACKGROUND_COLORS[bonus] || "#888";
      const rc = hexToRgb(ribbonColor);
      const angle = -Math.PI / 4;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const cx = x + w / 2, cy = y + h / 2;
      const sashW = Math.ceil(Math.hypot(w, h));

      // Clip to card bounds so the sash doesn't bleed outside rounded corners
      ctx.save();
      roundedRectPath(ctx, x, y, w, h);
      ctx.clip();

      // Shadow under the sash for depth
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = rgbToCss(rc, 0.92);
      ctx.fillRect(-sashW / 2, -sashH / 2, sashW, sashH);
      ctx.restore();

      // Main sash band with subtle gradient for a fabric-like sheen
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      const grad = ctx.createLinearGradient(0, -sashH / 2, 0, sashH / 2);
      grad.addColorStop(0, rgbToCss(rc, 0.75));
      grad.addColorStop(0.35, rgbToCss(rc, 0.95));
      grad.addColorStop(0.5, rgbToCss({ r: Math.min(255, rc.r + 40), g: Math.min(255, rc.g + 40), b: Math.min(255, rc.b + 40) }, 1));
      grad.addColorStop(0.65, rgbToCss(rc, 0.95));
      grad.addColorStop(1, rgbToCss(rc, 0.75));
      ctx.fillStyle = grad;
      ctx.fillRect(-sashW / 2, -sashH / 2, sashW, sashH);
      // Subtle top/bottom stitch lines
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(-sashW / 2, -sashH / 2 + 1.5);
      ctx.lineTo(sashW / 2, -sashH / 2 + 1.5);
      ctx.moveTo(-sashW / 2, sashH / 2 - 1.5);
      ctx.lineTo(sashW / 2, sashH / 2 - 1.5);
      ctx.stroke();
      ctx.setLineDash([]);
      // "RESERVED" text
      ctx.fillStyle = "#fff";
      ctx.font = `700 ${Math.max(8, Math.floor(sashH * 0.65))}px 'Plus Jakarta Sans', system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 2;
      ctx.fillText("RESERVED", 0, 0.5);
      ctx.shadowBlur = 0;
      ctx.restore();

      // Fold triangles at the card edges to simulate wrapping behind
      // The sash crosses the left edge and bottom edge of the card.
      // We find where the sash edges meet the card boundary and draw
      // small darkened triangles to give the "wrapping around" illusion.
      const halfH = sashH / 2;
      // Points where the sash edges intersect card left side (x)
      // In rotated coords, the left card edge is at dx = (x - cx), solve for sash edge
      // Instead, compute the 4 corner points of the sash at the card boundary
      const darkFold = rgbToCss({ r: Math.max(0, rc.r - 50), g: Math.max(0, rc.g - 50), b: Math.max(0, rc.b - 50) }, 0.9);

      // Bottom-left fold: where sash exits bottom edge
      {
        // Sash bottom-edge at card bottom: find x where rotated sash bottom = y+h
        // The sash bottom edge in world coords: P = (cx, cy) + R * (t, halfH)
        // Py = cy + t*sin + halfH*cos = y+h  =>  t = (y+h - cy - halfH*cos) / sin
        const tBot = (y + h - cy - halfH * cos) / sin;
        const bx = cx + tBot * cos - halfH * sin;
        const by = y + h;
        ctx.fillStyle = darkFold;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + foldSize * cos, by);
        ctx.lineTo(bx, by - foldSize * Math.abs(sin));
        ctx.closePath();
        ctx.fill();
      }

      // Top-right fold: where sash exits top edge
      {
        const tTop = (y - cy + halfH * cos) / sin;
        const tx = cx + tTop * cos + halfH * sin;
        const ty = y;
        ctx.fillStyle = darkFold;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx - foldSize * cos, ty);
        ctx.lineTo(tx, ty + foldSize * Math.abs(sin));
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore(); // card clip
    } else {
      // Generic centered banner text (e.g. deck card "Trevdor")
      ctx.fillStyle = hasArt ? "#fff" : ((bonus == "black") ? "#fff" : "rgba(0,0,0,1)");
      ctx.font = `600 ${Math.max(10, Math.floor(h * 0.10))}px 'Plus Jakarta Sans', system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (hasArt) { ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 3; }
      ctx.fillText(banner, x + w / 2, y + h * 0.52);
      ctx.shadowBlur = 0;
    }
  }

  // --- bottom cost pips
  const order = ["white", "blue", "green", "red", "black"];
  const entries = order
    .map((c) => [c, cost[c] ?? 0])
    .filter(([, n]) => n > 0);

  if (entries.length) {
    const pipSize = Math.max(12, Math.floor(Math.min(w, h) * 0.192 * _pipScale));
    const gap = Math.max(3, Math.floor(pipSize * 0.18));
    const startX = x + pad;
    const maxX = x + w - pad;

    // Determine how many fit per row
    const perRow = Math.max(1, Math.floor((maxX - startX + gap) / (pipSize + gap)));
    const rows = Math.ceil(entries.length / perRow);

    // Bottom row is the first (fullest) row; overflow row goes above
    // Split: bottom row gets perRow items, top row gets the remainder
    const bottomRowCount = Math.min(entries.length, perRow);
    const topRowCount = entries.length - bottomRowCount;
    const yBottomRow = y + h - pad - pipSize;
    const yTopRow = yBottomRow - pipSize - gap;

    // Draw top row (overflow) first, if any
    let cx = startX;
    for (let i = 0; i < topRowCount; i++) {
      const [c, n] = entries[i];
      const gemR = pipSize / 2;
      drawGemCached(ctx, cx + gemR, yTopRow + gemR, gemR, c, String(n));
      cx += pipSize + gap;
    }

    // Draw bottom row
    cx = startX;
    for (let i = topRowCount; i < entries.length; i++) {
      const [c, n] = entries[i];
      const gemR = pipSize / 2;
      drawGemCached(ctx, cx + gemR, yBottomRow + gemR, gemR, c, String(n));
      cx += pipSize + gap;
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
      ctx.font = `700 ${Math.max(10, Math.floor(h * 0.15))}px 'Plus Jakarta Sans', system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(banner, artX + artW / 2, artY + artH / 2);
    }
  }
}



function drawNobleCached(ctx, { x, y, w, h }, noble = {}) {
  const req = noble.req ?? {};
  const key = `${noble.points ?? 3}|${req.white ?? 0},${req.blue ?? 0},${req.green ?? 0},${req.red ?? 0},${req.black ?? 0}|${w}|${h}|${_dpr}|${_pipScale}`;
  let oc = _nobleCache.get(key);
  if (!oc) {
    oc = document.createElement("canvas");
    oc.width = Math.ceil(w * _dpr);
    oc.height = Math.ceil(h * _dpr);
    const octx = oc.getContext("2d");
    octx.scale(_dpr, _dpr);
    drawNoble(octx, { x: 0, y: 0, w, h }, noble);
    _nobleCache.set(key, oc);
  }
  ctx.drawImage(oc, 0, 0, oc.width, oc.height, x, y, w, h);
}

function drawNoble(ctx, { x, y, w, h }, noble = {}) {
  const {
    points = 3,
    req = {},      // noble requirements
    banner = "",   // optional center text
  } = noble;

  const pad = Math.max(4, Math.floor(Math.min(w, h) * 0.06));

  // Pip sizing (scaled by _pipScale for granny mode)
  const pipSize = Math.max(12, Math.floor(Math.min(w, h) * 0.192 * _pipScale));
  const gap = Math.max(3, Math.floor(pipSize * 0.18));

  // Points font: in granny mode, match market card size (h * 0.20 * _pipScale)
  const pointsFontSize = Math.max(12, Math.floor(h * 0.20 * _pipScale));

  // --- base card (light grey)
  roundedRectPath(ctx, x, y, w, h);
  ctx.fillStyle = "#E9EEF3";
  ctx.fill();

  // --- left solid white strip (25% default)
  ctx.save();
  roundedRectPath(ctx, x, y, w, h);
  ctx.clip();
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(x, y, Math.floor(w * 0.25), h);
  ctx.restore();

  // --- outer black border
  roundedRectPath(ctx, x, y, w, h);
  ctx.strokeStyle = "rgba(0,0,0,1)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // --- points (top-left)
  if (points > 0) {
    ctx.fillStyle = "rgba(0,0,0,0.9)";
    ctx.font = `700 ${pointsFontSize}px 'Plus Jakarta Sans', system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(String(points), x + pad, y + pad * 0.8);
  }

  // --- requirements: corner placement (avoiding top-left where points are)
  const order = ["white", "blue", "green", "red", "black"];
  const entries = order
    .map(c => [c, req[c] ?? 0])
    .filter(([, n]) => n > 0);

  if (entries.length) {
    const gemR = pipSize / 2;
    // Corner positions: bottom-left, bottom-right, top-right (never top-left)
    const corners = [
      { cx: x + pad + gemR,         cy: y + h - pad - gemR },   // bottom-left
      { cx: x + w - pad - gemR,     cy: y + h - pad - gemR },   // bottom-right
      { cx: x + w - pad - gemR,     cy: y + pad + gemR },       // top-right
    ];
    for (let i = 0; i < entries.length && i < corners.length; i++) {
      const [c, n] = entries[i];
      const pos = corners[i];
      drawGemCached(ctx, pos.cx, pos.cy, gemR, c, String(n));
    }
  }

  // --- optional banner (center-right)
  if (banner) {
    const sW = Math.floor(w * 0.25);
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.font = `600 ${Math.max(10, Math.floor(h * 0.14))}px 'Plus Jakarta Sans', system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      banner,
      x + sW + (w - sW) / 2,
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
      id: stateObject.id,
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
    drawNobleCached(ctx, { x, y: yy, w, h }, noble);
  }
}

function drawFannedCards(ctx, { color, x, y, w, h }, stateObject ) {


// ------------------------------------------------------------------
  // PURCHASED CARD STACKS (grouped by bonus)
  // ------------------------------------------------------------------
  //ctx.fillStyle = "rgba(0,0,0,.7)";
  //ctx.font = `600 ${11 * SCALE}px 'Plus Jakarta Sans', system-ui, sans-serif`;
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
    //ctx.font = `600 ${10 * SCALE}px 'Plus Jakarta Sans', system-ui, sans-serif`;
    //ctx.textAlign = "center";
    //ctx.textBaseline = "top";
    //ctx.fillText(`${pile.length}`, sx + CARD_WH.w / 2, stacksTop + CARD_WH.h + 2);

    //sx += CARD_WH.w + GAP;

}

// Draw a "stack" where only the top quarter of each below card shows
function drawStackWithPeek(ctx, cards, { color, x, y, w, h, peek }) {
  const n = cards?.length ?? 0;

  // Empty placeholder — dashed outline
  if (n === 0) {
    const inset = 2;
    roundedRectPath(ctx, x + inset, y + inset, w - inset * 2, h - inset * 2, 10);
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }

  // Draw from top -> bottom so the bottom-most (largest y) is drawn last
  // and naturally covers the lower portion of the card above it (painter's algorithm).
  for (let i = 0; i < n; i++) {
    const card = cards[i];
    const yy = y + (i * peek);
    drawDevelopmentCard(ctx, { x, y: yy, w, h }, card);
  }


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

