// Sprite sheet system for card background art
// Sheet: 10 cols × 9 rows, each sprite 100×140 px
// Layout: t1_01..t1_40 (rows 0-3), t2_01..t2_30 (rows 4-6), t3_01..t3_20 (rows 7-8)

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

export function loadSpriteSheet() {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      spriteSheet = img;
      spriteSheetReady = true;
      resolve(true);
    };
    img.onerror = () => {
      console.warn("Card sprite sheet not found at /assets/cards.png — using fallback colors");
      resolve(false);
    };
    img.src = "/assets/cards.png";
  });
}

// Draw a card's sprite onto the canvas. Returns true if drawn, false if fallback needed.
export function drawCardSprite(ctx, x, y, w, h, cardId) {
  if (!spriteSheetReady || !spriteSheet) return false;
  const pos = CARD_SPRITE_MAP[cardId];
  if (!pos) return false;

  const sx = pos.col * SPRITE_W;
  const sy = pos.row * SPRITE_H;

  const prevSmoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(spriteSheet, sx, sy, SPRITE_W, SPRITE_H, x, y, w, h);
  ctx.imageSmoothingEnabled = prevSmoothing;
  return true;
}
