import { computeLayout } from "./layout.js";
import { state } from "../engine/state.js";

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

      // Example card (like a shop card or hand card)
      const card = { x: 20, y: 20, w: 220, h: 120 };
      drawCard(ctx, card);

      // Register this card as clickable
      hitRegions.push({
        id: "card:test",           // stable identifier (later: state.cards[i].id)
        kind: "card",              // helps your click handler decide what it hit
        ...clampRectToViewport(card, viewport),
        z: 10,                     // top-most priority when overlaps happen
        meta: {
          // put any gameplay info you want here
          // e.g. cost: 3, name: "Sword", canBuy: true
        }
      });

      // Example token (like a coin / resource token)
      // NOTE: tokens might be circular visually, but Option A uses rectangles for hit.
      const token = { x: 280, y: 40, w: 48, h: 48 };
      drawToken(ctx, token);

      hitRegions.push({
        id: "token:gold-1",
        kind: "token",
        ...clampRectToViewport(token, viewport),
        z: 20, // if token overlaps card, make token win
        meta: {
          value: 1,
          currency: "gold"
        }
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
function drawToken(ctx, { x, y, w, h }) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = Math.min(w, h) / 2;

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 215, 0, 0.9)"; // gold-ish
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,.2)";
  ctx.stroke();
}

export { render };
