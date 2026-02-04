export function computeLayout({ width, height }) {
  const SCALE = 3;
  const MARGIN = 10 * SCALE; // edge of board to tokens
  const CARD_W = 25 * SCALE;
  const NOBLE_WH = { w: CARD_W, h: 25 * SCALE };
  const CARD_WH  = { w: CARD_W, h: 35 * SCALE };
  const TOKEN_WH = { w: 15 * SCALE, h: 15 * SCALE };
  const GAP = 5 * SCALE; // between cards nobles etc

  // Board column X positions (5 columns)
  const ROW_CARD_NOBLE_XY = [
    MARGIN,
    MARGIN + GAP + CARD_W,
    MARGIN + GAP * 2 + CARD_W * 2,
    MARGIN + GAP * 3 + CARD_W * 3,
    MARGIN + GAP * 4 + CARD_W * 4,
  ];

  // Y positions on board
  const BOARD_TOP_Y = MARGIN;
  const TIER1_Y = MARGIN + NOBLE_WH.h + GAP;
  const TIER2_Y = MARGIN + NOBLE_WH.h + GAP * 2 + CARD_WH.h;
  const TIER3_Y = MARGIN + NOBLE_WH.h + GAP * 3 + CARD_WH.h * 2;

  const BANK_TOKEN_Y = MARGIN + GAP * 4 + NOBLE_WH.h + CARD_WH.h * 3;

  // Board bounds (for positioning player panels around it)
  const board = {
    x: ROW_CARD_NOBLE_XY[0],
    y: BOARD_TOP_Y,
    w: (CARD_W * 5) + (GAP * 4),                      // 5 columns wide
    h: (NOBLE_WH.h + GAP * 4 + CARD_WH.h * 3 + TOKEN_WH.h), // nobles + 3 tiers + gaps + token row
  };

  // --- Player panel (bottom) hard-coded slot ---
  // Make it as wide as the board, taller than a card row so it can show stacks.
  const PLAYER_PANEL = {
    x: board.x,
    y: board.y + board.h + GAP * 4,
    w: board.w,
    h: (TOKEN_WH.h + GAP) + (CARD_WH.h + Math.floor(CARD_WH.h * 0.25) * 5) + (NOBLE_WH.h + GAP * 2),

  };

  return [
    // --- decks
    { id: "decks.tier1", kind: "decks.tier1", x: ROW_CARD_NOBLE_XY[0], y: TIER1_Y, w: CARD_WH.w, h: CARD_WH.h },
    { id: "decks.tier2", kind: "decks.tier2", x: ROW_CARD_NOBLE_XY[0], y: TIER2_Y, w: CARD_WH.w, h: CARD_WH.h },
    { id: "decks.tier3", kind: "decks.tier3", x: ROW_CARD_NOBLE_XY[0], y: TIER3_Y, w: CARD_WH.w, h: CARD_WH.h },

    // --- nobles
    { id: "market.nobles-1", kind: "noble", x: ROW_CARD_NOBLE_XY[0], y: BOARD_TOP_Y, w: NOBLE_WH.w, h: NOBLE_WH.h, statePath: ["market", "nobles", 0] },
    { id: "market.nobles-2", kind: "noble", x: ROW_CARD_NOBLE_XY[1], y: BOARD_TOP_Y, w: NOBLE_WH.w, h: NOBLE_WH.h, statePath: ["market", "nobles", 1] },
    { id: "market.nobles-3", kind: "noble", x: ROW_CARD_NOBLE_XY[2], y: BOARD_TOP_Y, w: NOBLE_WH.w, h: NOBLE_WH.h, statePath: ["market", "nobles", 2] },
    { id: "market.nobles-4", kind: "noble", x: ROW_CARD_NOBLE_XY[3], y: BOARD_TOP_Y, w: NOBLE_WH.w, h: NOBLE_WH.h, statePath: ["market", "nobles", 3] },
    { id: "market.nobles-5", kind: "noble", x: ROW_CARD_NOBLE_XY[4], y: BOARD_TOP_Y, w: NOBLE_WH.w, h: NOBLE_WH.h, statePath: ["market", "nobles", 4] },

    // --- tier 1
    { id: "market.cards.tier1-1", kind: "market.card", tier: 1, index: 0, x: ROW_CARD_NOBLE_XY[1], y: TIER1_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market", "cards", "tier1", 0] },
    { id: "market.cards.tier1-2", kind: "market.card", tier: 1, index: 1, x: ROW_CARD_NOBLE_XY[2], y: TIER1_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market", "cards", "tier1", 1] },
    { id: "market.cards.tier1-3", kind: "market.card", tier: 1, index: 2, x: ROW_CARD_NOBLE_XY[3], y: TIER1_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market", "cards", "tier1", 2] },
    { id: "market.cards.tier1-4", kind: "market.card", tier: 1, index: 3, x: ROW_CARD_NOBLE_XY[4], y: TIER1_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market", "cards", "tier1", 3] },

    // --- tier 2
    { id: "market.cards.tier2-1", kind: "market.card", tier: 2, index: 0, x: ROW_CARD_NOBLE_XY[1], y: TIER2_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market", "cards", "tier2", 0] },
    { id: "market.cards.tier2-2", kind: "market.card", tier: 2, index: 1, x: ROW_CARD_NOBLE_XY[2], y: TIER2_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market", "cards", "tier2", 1] },
    { id: "market.cards.tier2-3", kind: "market.card", tier: 2, index: 2, x: ROW_CARD_NOBLE_XY[3], y: TIER2_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market", "cards", "tier2", 2] },
    { id: "market.cards.tier2-4", kind: "market.card", tier: 2, index: 3, x: ROW_CARD_NOBLE_XY[4], y: TIER2_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market", "cards", "tier2", 3] },

    // --- tier 3
    { id: "market.cards.tier3-1", kind: "market.card", tier: 3, index: 0, x: ROW_CARD_NOBLE_XY[1], y: TIER3_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market", "cards", "tier3", 0] },
    { id: "market.cards.tier3-2", kind: "market.card", tier: 3, index: 1, x: ROW_CARD_NOBLE_XY[2], y: TIER3_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market", "cards", "tier3", 1] },
    { id: "market.cards.tier3-3", kind: "market.card", tier: 3, index: 2, x: ROW_CARD_NOBLE_XY[3], y: TIER3_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market", "cards", "tier3", 2] },
    { id: "market.cards.tier3-4", kind: "market.card", tier: 3, index: 3, x: ROW_CARD_NOBLE_XY[4], y: TIER3_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market", "cards", "tier3", 3] },

    // --- bank tokens
    { id: "bank.yellow", color: "yellow", kind: "token", x: MARGIN + GAP,                 y: BANK_TOKEN_Y, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["market", "bank", "yellow"] },
    { id: "bank.green",  color: "green",  kind: "token", x: MARGIN + GAP * 5 + TOKEN_WH.w, y: BANK_TOKEN_Y, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["market", "bank", "green"] },
    { id: "bank.red",    color: "red",    kind: "token", x: MARGIN + GAP * 6 + TOKEN_WH.w * 2, y: BANK_TOKEN_Y, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["market", "bank", "red"] },
    { id: "bank.blue",   color: "blue",   kind: "token", x: MARGIN + GAP * 7 + TOKEN_WH.w * 3, y: BANK_TOKEN_Y, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["market", "bank", "blue"] },
    { id: "bank.black",  color: "black",  kind: "token", x: MARGIN + GAP * 8 + TOKEN_WH.w * 4, y: BANK_TOKEN_Y, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["market", "bank", "black"] },
    { id: "bank.white",  color: "white",  kind: "token", x: MARGIN + GAP * 9 + TOKEN_WH.w * 5, y: BANK_TOKEN_Y, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["market", "bank", "white"] },

    // --- NEW: player panel slot (Player 1 below board)
    //{ id: "players.0.panel.bottom", kind: "player.panel.bottom", x: PLAYER_PANEL.x, y: PLAYER_PANEL.y, w: PLAYER_PANEL.w, h: PLAYER_PANEL.h, statePath: ["players", 0] },
    { id: "player.tokens.yellow", color: "yellow", kind: "token", x: PLAYER_PANEL.x + GAP, y: PLAYER_PANEL.y, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["players", 0, "tokens", "yellow"]},
    { id: "player.bottom.reserved.1", kind: "reserved", x: PLAYER_PANEL.x + GAP * 2 + TOKEN_WH.w, y: PLAYER_PANEL.y, w: CARD_WH.h, h: CARD_WH.w, statePath: ["players", 0, "reserved", 0] }, // notice w h reversed
    { id: "player.bottom.reserved.2", kind: "reserved", x: PLAYER_PANEL.x + GAP * 3 + TOKEN_WH.w + CARD_WH.h, y: PLAYER_PANEL.y, w: CARD_WH.h, h: CARD_WH.w, statePath: ["players", 0, "reserved", 1] }, // notice w h reversed
    { id: "player.bottom.reserved.3", kind: "reserved", x: PLAYER_PANEL.x + GAP * 4 + TOKEN_WH.w + CARD_WH.h * 2, y: PLAYER_PANEL.y, w: CARD_WH.h, h: CARD_WH.w, statePath: ["players", 0, "reserved", 2] }, // notice w h reversed
    { id: "playyer.bottom.token.green", color: "green", kind: "token", x: ROW_CARD_NOBLE_XY[0] + GAP, y: PLAYER_PANEL.y + CARD_WH.w + GAP, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["players", 0, "tokens", "green"]},
    { id: "playyer.bottom.token.red", color: "red", kind: "token", x: ROW_CARD_NOBLE_XY[1] + GAP, y: PLAYER_PANEL.y + CARD_WH.w + GAP, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["players", 0, "tokens", "red"]},
    { id: "playyer.bottom.token.blue", color: "blue", kind: "token", x: ROW_CARD_NOBLE_XY[2] + GAP, y: PLAYER_PANEL.y + CARD_WH.w + GAP, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["players", 0, "tokens", "blue"]},
    { id: "playyer.bottom.token.black", color: "black", kind: "token", x: ROW_CARD_NOBLE_XY[3] + GAP, y: PLAYER_PANEL.y + CARD_WH.w + GAP, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["players", 0, "tokens", "black"]},
    { id: "playyer.bottom.token.white", color: "white", kind: "token", x: ROW_CARD_NOBLE_XY[4] + GAP, y: PLAYER_PANEL.y + CARD_WH.w + GAP, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["players", 0, "tokens", "white"]},
    { id: "player.cards.green", color: "green", kind: "fanned.cards", x: ROW_CARD_NOBLE_XY[0], y: PLAYER_PANEL.y + CARD_WH.w + GAP*2 + TOKEN_WH.h, w: CARD_WH.w, h: CARD_WH.h, statePath: ["players", 0, "cards"]},
    { id: "player.cards.red", color: "red", kind: "fanned.cards", x: ROW_CARD_NOBLE_XY[1], y: PLAYER_PANEL.y + CARD_WH.w + GAP*2 + TOKEN_WH.h, w: CARD_WH.w, h: CARD_WH.h, statePath: ["players", 0, "cards"]},
    { id: "player.cards.blue", color: "blue", kind: "fanned.cards", x: ROW_CARD_NOBLE_XY[2], y: PLAYER_PANEL.y + CARD_WH.w + GAP*2 + TOKEN_WH.h, w: CARD_WH.w, h: CARD_WH.h, statePath: ["players", 0, "cards"]},
    { id: "player.cards.black", color: "black", kind: "fanned.cards", x: ROW_CARD_NOBLE_XY[3], y: PLAYER_PANEL.y + CARD_WH.w + GAP*2 + TOKEN_WH.h, w: CARD_WH.w, h: CARD_WH.h, statePath: ["players", 0, "cards"]},
    { id: "player.cards.white", color: "white", kind: "fanned.cards", x: ROW_CARD_NOBLE_XY[4], y: PLAYER_PANEL.y + CARD_WH.w + GAP*2 + TOKEN_WH.h, w: CARD_WH.w, h: CARD_WH.h, statePath: ["players", 0, "cards"]},
  ];
}
