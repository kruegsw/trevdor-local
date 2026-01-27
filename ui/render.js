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
        const stateObject = e.statePath ? getByStatePath(state, e.statePath) : null;
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
