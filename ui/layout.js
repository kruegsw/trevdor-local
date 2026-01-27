export function computeLayout({ width, height }) {

  const SCALE = 3
  const MARGIN = 10 * SCALE; // edge of board to tokens
  const CARD_W = 25 * SCALE;
  const NOBLE_WH = { w: CARD_W, h: 25 * SCALE};
  const CARD_WH = { w: CARD_W, h: 35 * SCALE};
  const TOKEN_WH = { w: 15 * SCALE, h: 15 * SCALE};
  const GAP = 5 * SCALE; // between cards nobles etc
  const ROW_CARD_NOBLE_XY = [ MARGIN, MARGIN + GAP + CARD_W, MARGIN + GAP*2 + CARD_W*2, MARGIN + GAP*3 + CARD_W*3, MARGIN + GAP*4 + CARD_W*4 ];
  const BANK_TOKEN_Y = MARGIN + GAP*4 + NOBLE_WH.h + CARD_WH.h*3;

  const board = { x: 0, y: 0, w: 165, h: 175 };
  
  return [
    { id: "decks.tier1", kind: "card", x: ROW_CARD_NOBLE_XY[0], y: MARGIN + NOBLE_WH.h + GAP, w: CARD_WH.w, h: CARD_WH.h },
    { id: "decks.tier2", kind: "card", x: ROW_CARD_NOBLE_XY[0], y: MARGIN + NOBLE_WH.h + GAP*2 + CARD_WH.h, w: CARD_WH.w, h: CARD_WH.h },
    { id: "decks.tier3", kind: "card", x: ROW_CARD_NOBLE_XY[0], y: MARGIN + NOBLE_WH.h + GAP*3 + CARD_WH.h*2, w: CARD_WH.w, h: CARD_WH.h },
    { id: "market.nobles-1", kind: "noble", x: ROW_CARD_NOBLE_XY[0], y: MARGIN, w: NOBLE_WH.w, h: NOBLE_WH.h },
    { id: "market.nobles-2", kind: "noble", x: ROW_CARD_NOBLE_XY[1], y: MARGIN, w: NOBLE_WH.w, h: NOBLE_WH.h },
    { id: "market.nobles-3", kind: "noble", x: ROW_CARD_NOBLE_XY[2], y: MARGIN, w: NOBLE_WH.w, h: NOBLE_WH.h },
    { id: "market.nobles-4", kind: "noble", x: ROW_CARD_NOBLE_XY[3], y: MARGIN, w: NOBLE_WH.w, h: NOBLE_WH.h },
    { id: "market.nobles-5", kind: "noble", x: ROW_CARD_NOBLE_XY[4], y: MARGIN, w: NOBLE_WH.w, h: NOBLE_WH.h },
    { id: "market.cards.tier1-1", kind: "card", x: ROW_CARD_NOBLE_XY[1], y: MARGIN + NOBLE_WH.h + GAP, w: CARD_WH.w, h: CARD_WH.h },
    { id: "market.cards.tier1-2", kind: "card", x: ROW_CARD_NOBLE_XY[2], y: MARGIN + NOBLE_WH.h + GAP, w: CARD_WH.w, h: CARD_WH.h },
    { id: "market.cards.tier1-3", kind: "card", x: ROW_CARD_NOBLE_XY[3], y: MARGIN + NOBLE_WH.h + GAP, w: CARD_WH.w, h: CARD_WH.h },
    { id: "market.cards.tier1-4", kind: "card", x: ROW_CARD_NOBLE_XY[4], y: MARGIN + NOBLE_WH.h + GAP, w: CARD_WH.w, h: CARD_WH.h },
    { id: "market.cards.tier2-1", kind: "card", x: ROW_CARD_NOBLE_XY[1], y: MARGIN + NOBLE_WH.h + GAP*2 + CARD_WH.h, w: CARD_WH.w, h: CARD_WH.h },
    { id: "market.cards.tier2-2", kind: "card", x: ROW_CARD_NOBLE_XY[2], y: MARGIN + NOBLE_WH.h + GAP*2 + CARD_WH.h, w: CARD_WH.w, h: CARD_WH.h },
    { id: "market.cards.tier2-3", kind: "card", x: ROW_CARD_NOBLE_XY[3], y: MARGIN + NOBLE_WH.h + GAP*2 + CARD_WH.h, w: CARD_WH.w, h: CARD_WH.h },
    { id: "market.cards.tier2-4", kind: "card", x: ROW_CARD_NOBLE_XY[4], y: MARGIN + NOBLE_WH.h + GAP*2 + CARD_WH.h, w: CARD_WH.w, h: CARD_WH.h },
    { id: "market.cards.tier3-1", kind: "card", x: ROW_CARD_NOBLE_XY[1], y: MARGIN + NOBLE_WH.h + GAP*3 + CARD_WH.h*2, w: CARD_WH.w, h: CARD_WH.h },
    { id: "market.cards.tier3-2", kind: "card", x: ROW_CARD_NOBLE_XY[2], y: MARGIN + NOBLE_WH.h + GAP*3 + CARD_WH.h*2, w: CARD_WH.w, h: CARD_WH.h },
    { id: "market.cards.tier3-3", kind: "card", x: ROW_CARD_NOBLE_XY[3], y: MARGIN + NOBLE_WH.h + GAP*3 + CARD_WH.h*2, w: CARD_WH.w, h: CARD_WH.h },
    { id: "market.cards.tier3-4", kind: "card", x: ROW_CARD_NOBLE_XY[4], y: MARGIN + NOBLE_WH.h + GAP*3 + CARD_WH.h*2, w: CARD_WH.w, h: CARD_WH.h },
    { id: "bank.yellow", kind: "token", color: "yellow", x: MARGIN + GAP, y: BANK_TOKEN_Y, w: TOKEN_WH.w, h: TOKEN_WH.h },
    { id: "bank.green", kind: "token", color: "green", x: MARGIN + GAP*5 + TOKEN_WH.w, y: BANK_TOKEN_Y, w: TOKEN_WH.w, h: TOKEN_WH.h },
    { id: "bank.red", kind: "token", color: "red", x: MARGIN + GAP*6 + TOKEN_WH.w*2, y: BANK_TOKEN_Y, w: TOKEN_WH.w, h: TOKEN_WH.h },
    { id: "bank.blue", kind: "token", color: "blue", x: MARGIN + GAP*7 + TOKEN_WH.w*3, y: BANK_TOKEN_Y, w: TOKEN_WH.w, h: TOKEN_WH.h },
    { id: "bank.black", kind: "token", color: "black", x: MARGIN + GAP*8 + TOKEN_WH.w*4, y: BANK_TOKEN_Y, w: TOKEN_WH.w, h: TOKEN_WH.h },
    { id: "bank.white", kind: "token", color: "white", x: MARGIN + GAP*9 + TOKEN_WH.w*5, y: BANK_TOKEN_Y, w: TOKEN_WH.w, h: TOKEN_WH.h }
  ]
}

/*


export function computeLayout({ width, height }) {

  const MARGIN = 10; // edge of board to tokens
  const CARD_W = 25;
  const NOBLE_WH = { w: CARD_W, h: 25};
  const CARD_WH = { w: CARD_W, h: 35};
  const TOKEN_WH = { w: 15, h: 15};
  const GAP = 5; // between cards nobles etc
  const ROW_CARD_NOBLE_XY = [ MARGIN, MARGIN + GAP + CARD_W, MARGIN + GAP*2 + CARD_W*2, MARGIN + GAP*3 + CARD_W*3, MARGIN + GAP*4 + CARD_W*4 ];
  const BANK_TOKEN_Y = MARGIN + GAP*4 + NOBLE_WH.h + TOKEN_WH.h*3;

  const board = { x: 0, y: 0, w: 165, h: 175 };
  const decks = {
    tier1: { id: "decks.tier1", kind: "card", x: ROW_CARD_NOBLE_XY[0], y: MARGIN + NOBLE_WH.h + GAP, w: CARD_WH.w, h: CARD_WH.h },
    tier2: { id: "decks.tier2", kind: "card", x: ROW_CARD_NOBLE_XY[0], y: MARGIN + NOBLE_WH.h + GAP*2 + CARD_WH.h, w: CARD_WH.w, h: CARD_WH.h },
    tier3: { id: "decks.tier3", kind: "card", x: ROW_CARD_NOBLE_XY[0], y: MARGIN + NOBLE_WH.h + GAP*3 + CARD_WH.h*2, w: CARD_WH.w, h: CARD_WH.h },
  };
  const market = {
    nobles: [
      { id: "market.nobles-1", kind: "noble", x: ROW_CARD_NOBLE_XY[0], y: MARGIN, w: NOBLE_WH.w, h: NOBLE_WH.h },
      { id: "market.nobles-2", kind: "noble", x: ROW_CARD_NOBLE_XY[1], y: MARGIN, w: NOBLE_WH.w, h: NOBLE_WH.h },
      { id: "market.nobles-3", kind: "noble", x: ROW_CARD_NOBLE_XY[2], y: MARGIN, w: NOBLE_WH.w, h: NOBLE_WH.h },
      { id: "market.nobles-4", kind: "noble", x: ROW_CARD_NOBLE_XY[3], y: MARGIN, w: NOBLE_WH.w, h: NOBLE_WH.h },
      { id: "market.nobles-5", kind: "noble", x: ROW_CARD_NOBLE_XY[4], y: MARGIN, w: NOBLE_WH.w, h: NOBLE_WH.h },
    ],
    cards: {
      tier1: [
        { id: "market.cards.tier1-1", kind: "card", x: ROW_CARD_NOBLE_XY[1], y: MARGIN + NOBLE_WH.h + GAP, w: CARD_WH.w, h: CARD_WH.h },
        { id: "market.cards.tier1-2", kind: "card", x: ROW_CARD_NOBLE_XY[2], y: MARGIN + NOBLE_WH.h + GAP, w: CARD_WH.w, h: CARD_WH.h },
        { id: "market.cards.tier1-3", kind: "card", x: ROW_CARD_NOBLE_XY[3], y: MARGIN + NOBLE_WH.h + GAP, w: CARD_WH.w, h: CARD_WH.h },
        { id: "market.cards.tier1-4", kind: "card", x: ROW_CARD_NOBLE_XY[4], y: MARGIN + NOBLE_WH.h + GAP, w: CARD_WH.w, h: CARD_WH.h }
      ],
      tier2: [
        { id: "market.cards.tier2-1", kind: "card", x: ROW_CARD_NOBLE_XY[1], y: MARGIN + NOBLE_WH.h + GAP*2 + CARD_WH.h, w: CARD_WH.w, h: CARD_WH.h },
        { id: "market.cards.tier2-2", kind: "card", x: ROW_CARD_NOBLE_XY[2], y: MARGIN + NOBLE_WH.h + GAP*2 + CARD_WH.h, w: CARD_WH.w, h: CARD_WH.h },
        { id: "market.cards.tier2-3", kind: "card", x: ROW_CARD_NOBLE_XY[3], y: MARGIN + NOBLE_WH.h + GAP*2 + CARD_WH.h, w: CARD_WH.w, h: CARD_WH.h },
        { id: "market.cards.tier2-4", kind: "card", x: ROW_CARD_NOBLE_XY[4], y: MARGIN + NOBLE_WH.h + GAP*2 + CARD_WH.h, w: CARD_WH.w, h: CARD_WH.h }
      ],
      tier3: [
        { id: "market.cards.tier3-1", kind: "card", x: ROW_CARD_NOBLE_XY[1], y: MARGIN + NOBLE_WH.h + GAP*3 + CARD_WH.h*2, w: CARD_WH.w, h: CARD_WH.h },
        { id: "market.cards.tier3-2", kind: "card", x: ROW_CARD_NOBLE_XY[2], y: MARGIN + NOBLE_WH.h + GAP*3 + CARD_WH.h*2, w: CARD_WH.w, h: CARD_WH.h },
        { id: "market.cards.tier3-3", kind: "card", x: ROW_CARD_NOBLE_XY[3], y: MARGIN + NOBLE_WH.h + GAP*3 + CARD_WH.h*2, w: CARD_WH.w, h: CARD_WH.h },
        { id: "market.cards.tier3-4", kind: "card", x: ROW_CARD_NOBLE_XY[4], y: MARGIN + NOBLE_WH.h + GAP*3 + CARD_WH.h*2, w: CARD_WH.w, h: CARD_WH.h }
      ],
    },
    bank: {
      white: { id: "bank.white", kind: "token", x: MARGIN + GAP, y: BANK_TOKEN_Y, w: TOKEN_WH.w, h: TOKEN_WH.h },
      blue: { id: "bank.blue", kind: "token", x: MARGIN + GAP*2 + TOKEN_WH.w, y: BANK_TOKEN_Y, w: TOKEN_WH.w, h: TOKEN_WH.h },
      green: { id: "bank.green", kind: "token", x: MARGIN + GAP*3 + TOKEN_WH.w*2, y: BANK_TOKEN_Y, w: TOKEN_WH.w, h: TOKEN_WH.h },
      red: { id: "bank.red", kind: "token", x: MARGIN + GAP*4 + TOKEN_WH.w*3, y: BANK_TOKEN_Y, w: TOKEN_WH.w, h: TOKEN_WH.h },
      black: { id: "bank.black", kind: "token", x: MARGIN + GAP*5 + TOKEN_WH.w*4, y: BANK_TOKEN_Y, w: TOKEN_WH.w, h: TOKEN_WH.h },
      yellow: { id: "bank.yellow", kind: "token", x: MARGIN + GAP*6 + TOKEN_WH.w*5, y: BANK_TOKEN_Y, w: TOKEN_WH.w, h: TOKEN_WH.h }
    },
  };

  

  return { board, decks, market }
}








  const MARGIN = 24;
  const GAP = 16;

  const CARD_W = 120;
  const CARD_H = 160;

  const DECK_W = 80;
  const DECK_H = CARD_H;

  const NOBLE_W = 140;
  const NOBLE_H = 80;

  const TOKEN_W = 80;
  const TOKEN_H = 48;

  // Splendor-like default
  const CARDS_PER_TIER = 4;

  // Visual order: tier3 at top, then tier2, then tier1
  const TIERS_TOP_TO_BOTTOM = ["tier3", "tier2", "tier1"];

  // Colors (must match your bank keys exactly)
  const TOKEN_COLORS = ["white", "blue", "green", "red", "black", "yellow"];

  // ─────────────────────────────────────────────
  // Read dynamic counts from state
  // ─────────────────────────────────────────────
  const nobleSlots = state?.market?.nobles?.length ?? 0;

  // If bank exists, we draw 6 piles in fixed order.
  // (Even if some counts are 0, we still keep the slot clickable.)
  const hasBank = !!state?.market?.bank;

  // ─────────────────────────────────────────────
  // Row widths (for centering)
  // ─────────────────────────────────────────────
  const rowCardsW =
    DECK_W +
    GAP +
    (CARD_W * CARDS_PER_TIER) +
    (GAP * (CARDS_PER_TIER - 1));

  const noblesW =
    nobleSlots <= 0
      ? 0
      : (NOBLE_W * nobleSlots) + (GAP * (nobleSlots - 1));

  const tokensW =
    (TOKEN_W * TOKEN_COLORS.length) + (GAP * (TOKEN_COLORS.length - 1));

  const marketWidth = Math.max(rowCardsW, noblesW, tokensW);

  const marketHeight =
    (nobleSlots > 0 ? NOBLE_H + GAP : 0) +
    (CARD_H * 3) +
    (GAP * 2) +
    (hasBank ? GAP + TOKEN_H : 0);

  const marketX = Math.round(Math.max(MARGIN, (width - marketWidth) / 2));
  const marketY = Math.round(Math.max(MARGIN, (height - marketHeight) / 2));

  const marketBox = { x: marketX, y: marketY, w: marketWidth, h: marketHeight };

  const centeredRowX = (rowW) => Math.round(marketX + (marketWidth - rowW) / 2);

  // ─────────────────────────────────────────────
  // Nobles row (slots map to state.market.nobles[i])
  // ─────────────────────────────────────────────
  const nobles = [];
  let cursorY = marketY;

  if (nobleSlots > 0) {
    const noblesRowX = centeredRowX(noblesW);
    for (let i = 0; i < nobleSlots; i++) {
      nobles.push({
        id: `market.nobles[${i}]`,
        kind: "nobleSlot",
        index: i,
        x: noblesRowX + i * (NOBLE_W + GAP),
        y: cursorY,
        w: NOBLE_W,
        h: NOBLE_H,
      });
    }
    cursorY += NOBLE_H + GAP;
  }

  // ─────────────────────────────────────────────
  // Tier rows + decks (slots map to state.market.cards[tier][i])
  // ─────────────────────────────────────────────
  const decks = {};
  const cards = { tier1: [], tier2: [], tier3: [] };

  for (const tierKey of TIERS_TOP_TO_BOTTOM) {
    const rowX = centeredRowX(rowCardsW);

    decks[tierKey] = {
      id: `decks.${tierKey}`,
      kind: "deck",
      tier: tierKey,
      x: rowX,
      y: cursorY,
      w: DECK_W,
      h: DECK_H,
    };

    for (let i = 0; i < CARDS_PER_TIER; i++) {
      cards[tierKey].push({
        id: `market.cards.${tierKey}[${i}]`,
        kind: "cardSlot",
        tier: tierKey,
        index: i,
        x: rowX + DECK_W + GAP + i * (CARD_W + GAP),
        y: cursorY,
        w: CARD_W,
        h: CARD_H,
      });
    }

    cursorY += CARD_H + GAP;
  }

  // Remove extra GAP after last tier row
  cursorY -= GAP;

  // ─────────────────────────────────────────────
  // Token row (slots map to state.market.bank[color])
  // ─────────────────────────────────────────────
  const tokens = {};

  if (hasBank) {
    cursorY += GAP; // spacing before tokens
    const tokensRowX = centeredRowX(tokensW);

    TOKEN_COLORS.forEach((color, i) => {
      tokens[color] = {
        id: `market.bank.${color}`,
        kind: "tokenSlot",
        color,
        x: tokensRowX + i * (TOKEN_W + GAP),
        y: cursorY,
        w: TOKEN_W,
        h: TOKEN_H,
      };
    });
  }

  // ─────────────────────────────────────────────
  // Return
  // ─────────────────────────────────────────────
  return {
    viewport: { width, height },
    market: {
      box: marketBox,
      nobles,  // array slots
      decks,   // object decks.tier1/tier2/tier3
      cards,   // object cards.tier1/tier2/tier3 each array length 4
      tokens,  // object tokens.white/blue/green/red/black/yellow
      meta: {
        cardsPerTier: CARDS_PER_TIER,
        nobleSlots,
        tokenColors: TOKEN_COLORS.slice(),
        tiersTopToBottom: TIERS_TOP_TO_BOTTOM.slice(),
      },
    },
  };
}

*/
