/*

STRAIGHT UP COPIED FROM CHATGPT AND IS NOT INTEGRATED


  layout.js
  ----------
  Pure layout computation.

  Input:
    - viewport size in CSS pixels

  Output:
    - rectangles describing WHERE things go on screen
    - no canvas, no ctx, no drawing, no state mutation

  This file is:
    • deterministic
    • testable
    • reusable
*/

export function computeLayout({ width, height }) {
  // ─────────────────────────────────────────────
  // Constants (tweakable design values)
  // ─────────────────────────────────────────────

  const MARGIN = 24;
  const GAP = 16;

  const CARD_W = 120;
  const CARD_H = 160;

  const TOKEN_W = 80;
  const TOKEN_H = 48;

  const NOBLE_W = 140;
  const NOBLE_H = 80;

  // ─────────────────────────────────────────────
  // Market bounding box (centered)
  // ─────────────────────────────────────────────

  const marketWidth =
    CARD_W * 4 + GAP * 3 + 80; // deck + 4 cards

  const marketHeight =
    NOBLE_H +
    GAP +
    CARD_H * 3 +
    GAP * 2 +
    TOKEN_H;

  const marketX = Math.round((width - marketWidth) / 2);
  const marketY = Math.round((height - marketHeight) / 2);

  const market = {
    x: marketX,
    y: marketY,
    w: marketWidth,
    h: marketHeight,
  };

  // ─────────────────────────────────────────────
  // Nobles row
  // ─────────────────────────────────────────────

  const nobles = [];
  const noblesY = marketY;

  for (let i = 0; i < 4; i++) {
    nobles.push({
      x: marketX + i * (NOBLE_W + GAP),
      y: noblesY,
      w: NOBLE_W,
      h: NOBLE_H,
      type: "noble",
      index: i,
    });
  }

  // ─────────────────────────────────────────────
  // Card tiers (3 rows)
  // ─────────────────────────────────────────────

  const tiers = [];

  let tierY = noblesY + NOBLE_H + GAP;

  for (let tier = 0; tier < 3; tier++) {
    const deck = {
      x: marketX,
      y: tierY,
      w: 80,
      h: CARD_H,
      type: "deck",
      tier: 3 - tier, // tier 3 at top
    };

    const cards = [];
    for (let i = 0; i < 4; i++) {
      cards.push({
        x: deck.x + deck.w + GAP + i * (CARD_W + GAP),
        y: tierY,
        w: CARD_W,
        h: CARD_H,
        type: "card",
        tier: deck.tier,
        index: i,
      });
    }

    tiers.push({ deck, cards });
    tierY += CARD_H + GAP;
  }

  // ─────────────────────────────────────────────
  // Token row
  // ─────────────────────────────────────────────

  const tokens = [];
  const tokenY = marketY + marketHeight - TOKEN_H;

  for (let i = 0; i < 6; i++) {
    tokens.push({
      x: marketX + i * (TOKEN_W + GAP),
      y: tokenY,
      w: TOKEN_W,
      h: TOKEN_H,
      type: "token",
      index: i,
    });
  }

  // ─────────────────────────────────────────────
  // Return full layout object
  // ─────────────────────────────────────────────

  return {
    viewport: { width, height },
    market,
    nobles,
    tiers,
    tokens,
  };
}
