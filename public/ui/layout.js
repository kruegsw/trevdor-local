export function computeLayout({ width, height }) {

  /*
  
  |<----  w  ---->|<----  w  ---->|<----  w  ---->|
  ________________________________________________
  |               |               |               |
  |   PLAYER 1    |    SUMMARY    |   PLAYER 2    |
  |               |_______________|               |
  |               |               |               |
  |               |     BOARD     |               |
  |_______________|               |_______________|
  |               |               |               |
  |   PLAYER 4    |               |   PLAYER 3    |
  |               |_______________|               |
  |               |               |               |
  |               | NOTIFICATION  |               |
  |_______________|_______________|_______________|

  */
  
  const SCALE = 3;
  const MARGIN = 10 * SCALE; // edge of board to tokens
  const CARD_W = 25 * SCALE;
  const NOBLE_WH = { w: CARD_W, h: 25 * SCALE };
  const CARD_WH  = { w: CARD_W, h: 35 * SCALE };
  const TOKEN_WH = { w: 15 * SCALE, h: 15 * SCALE };
  const GAP = 5 * SCALE; // between cards nobles etc

  // Board column X positions (5 columns)
  const ROW_CARD_NOBLE_XY = [
    0,
    GAP + CARD_W,
    GAP * 2 + CARD_W * 2,
    GAP * 3 + CARD_W * 3,
    GAP * 4 + CARD_W * 4,
  ];

  // Y positions on board relative to top of BOARD
  const TIER1_Y = NOBLE_WH.h + GAP;
  const TIER2_Y = NOBLE_WH.h + GAP * 2 + CARD_WH.h;
  const TIER3_Y = NOBLE_WH.h + GAP * 3 + CARD_WH.h * 2;

  const BANK_TOKEN_Y = MARGIN + GAP * 4 + NOBLE_WH.h + CARD_WH.h * 3;

  const BOX_WH = {
    w: (CARD_W * 5) + (GAP * 4), // 5 columns wide
    h: (NOBLE_WH.h + GAP * 4 + CARD_WH.h * 3 + TOKEN_WH.h) // nobles + 3 tiers + gaps + token row
  }

  // Board bounds (for positioning player panels around it)
  const BOARD = {
    x: MARGIN*2 + BOX_WH.w,
    y: MARGIN + BOX_WH.h / 2,
    w: BOX_WH.w,                      // 5 columns wide
    h: BOX_WH.h, // nobles + 3 tiers + gaps + token row
  };

  // --- Player panel (bottom) hard-coded slot ---
  // Make it as wide as the board, taller than a card row so it can show stacks.
  const PLAYER_PANEL = [
    {
      x: MARGIN,
      y: MARGIN,
      w: BOARD.w,
      h: BOARD.h //(TOKEN_WH.h + GAP) + (CARD_WH.h + Math.floor(CARD_WH.h * 0.25) * 5) + (NOBLE_WH.h + GAP * 2),
    },
    {
      x: MARGIN*2 + BOARD.w,
      y: MARGIN,
      w: BOARD.w,
      h: BOARD.h
    },
    {
      x: MARGIN*2 + BOARD.w,
      y: BOARD.y + BOARD.h + GAP * 4,
      w: BOARD.w,
      h: BOARD.h
    },
    {
      x: MARGIN,
      y: BOARD.y + BOARD.h + GAP * 4,
      w: BOARD.w,
      h: BOARD.h
    },
  ];

  return [
    // --- decks
    { uiID: "decks.tier1", kind: "decks.tier1", x: BOARD.x, y: BOARD.y + TIER1_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["decks", "tier1"] },
    { uiID: "decks.tier2", kind: "decks.tier2", x: BOARD.x, y: BOARD.y + TIER2_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["decks", "tier2"] },
    { uiID: "decks.tier3", kind: "decks.tier3", x: BOARD.x, y: BOARD.y + TIER3_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["decks", "tier3"] },

    // --- nobles
    { uiID: "market.nobles-1", kind: "noble", x: BOARD.x + ROW_CARD_NOBLE_XY[0], y: BOARD.y, w: NOBLE_WH.w, h: NOBLE_WH.h, statePath: ["market", "nobles", 0] },
    { uiID: "market.nobles-2", kind: "noble", x: BOARD.x + ROW_CARD_NOBLE_XY[1], y: BOARD.y, w: NOBLE_WH.w, h: NOBLE_WH.h, statePath: ["market", "nobles", 1] },
    { uiID: "market.nobles-3", kind: "noble", x: BOARD.x + ROW_CARD_NOBLE_XY[2], y: BOARD.y, w: NOBLE_WH.w, h: NOBLE_WH.h, statePath: ["market", "nobles", 2] },
    { uiID: "market.nobles-4", kind: "noble", x: BOARD.x + ROW_CARD_NOBLE_XY[3], y: BOARD.y, w: NOBLE_WH.w, h: NOBLE_WH.h, statePath: ["market", "nobles", 3] },
    { uiID: "market.nobles-5", kind: "noble", x: BOARD.x + ROW_CARD_NOBLE_XY[4], y: BOARD.y, w: NOBLE_WH.w, h: NOBLE_WH.h, statePath: ["market", "nobles", 4] },

    // --- tier 1
    { uiID: "market.cards.tier1-1", kind: "market.card", tier: 1, index: 0, x: BOARD.x + ROW_CARD_NOBLE_XY[1], y: BOARD.y + TIER1_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market", "cards", "tier1", 0] },
    { uiID: "market.cards.tier1-2", kind: "market.card", tier: 1, index: 1, x: BOARD.x + ROW_CARD_NOBLE_XY[2], y: BOARD.y + TIER1_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market", "cards", "tier1", 1] },
    { uiID: "market.cards.tier1-3", kind: "market.card", tier: 1, index: 2, x: BOARD.x + ROW_CARD_NOBLE_XY[3], y: BOARD.y + TIER1_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market", "cards", "tier1", 2] },
    { uiID: "market.cards.tier1-4", kind: "market.card", tier: 1, index: 3, x: BOARD.x + ROW_CARD_NOBLE_XY[4], y: BOARD.y + TIER1_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market", "cards", "tier1", 3] },

    // --- tier 2
    { uiID: "market.cards.tier2-1", kind: "market.card", tier: 2, index: 0, x: BOARD.x + ROW_CARD_NOBLE_XY[1], y: BOARD.y + TIER2_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market", "cards", "tier2", 0] },
    { uiID: "market.cards.tier2-2", kind: "market.card", tier: 2, index: 1, x: BOARD.x + ROW_CARD_NOBLE_XY[2], y: BOARD.y + TIER2_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market", "cards", "tier2", 1] },
    { uiID: "market.cards.tier2-3", kind: "market.card", tier: 2, index: 2, x: BOARD.x + ROW_CARD_NOBLE_XY[3], y: BOARD.y + TIER2_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market", "cards", "tier2", 2] },
    { uiID: "market.cards.tier2-4", kind: "market.card", tier: 2, index: 3, x: BOARD.x + ROW_CARD_NOBLE_XY[4], y: BOARD.y + TIER2_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market", "cards", "tier2", 3] },

    // --- tier 3
    { uiID: "market.cards.tier3-1", kind: "market.card", tier: 3, index: 0, x: BOARD.x + ROW_CARD_NOBLE_XY[1], y: BOARD.y + TIER3_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market", "cards", "tier3", 0] },
    { uiID: "market.cards.tier3-2", kind: "market.card", tier: 3, index: 1, x: BOARD.x + ROW_CARD_NOBLE_XY[2], y: BOARD.y + TIER3_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market", "cards", "tier3", 1] },
    { uiID: "market.cards.tier3-3", kind: "market.card", tier: 3, index: 2, x: BOARD.x + ROW_CARD_NOBLE_XY[3], y: BOARD.y + TIER3_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market", "cards", "tier3", 2] },
    { uiID: "market.cards.tier3-4", kind: "market.card", tier: 3, index: 3, x: BOARD.x + ROW_CARD_NOBLE_XY[4], y: BOARD.y + TIER3_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market", "cards", "tier3", 3] },

    // --- bank tokens
    { uiID: "bank.yellow", color: "yellow", kind: "token", x: BOARD.x + GAP, y: BOARD.y + BANK_TOKEN_Y, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["market", "bank", "yellow"] },
    { uiID: "bank.green",  color: "green",  kind: "token", x: BOARD.x + GAP * 5 + TOKEN_WH.w, y: BOARD.y + BANK_TOKEN_Y, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["market", "bank", "green"] },
    { uiID: "bank.red",    color: "red",    kind: "token", x: BOARD.x + GAP * 6 + TOKEN_WH.w * 2, y: BOARD.y + BANK_TOKEN_Y, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["market", "bank", "red"] },
    { uiID: "bank.blue",   color: "blue",   kind: "token", x: BOARD.x + GAP * 7 + TOKEN_WH.w * 3, y: BOARD.y + BANK_TOKEN_Y, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["market", "bank", "blue"] },
    { uiID: "bank.black",  color: "black",  kind: "token", x: BOARD.x + GAP * 8 + TOKEN_WH.w * 4, y: BOARD.y + BANK_TOKEN_Y, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["market", "bank", "black"] },
    { uiID: "bank.white",  color: "white",  kind: "token", x: BOARD.x + GAP * 9 + TOKEN_WH.w * 5, y: BOARD.y + BANK_TOKEN_Y, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["market", "bank", "white"] },

    // --- NEW: player panel slot (Player 1 below board)
    //{ id: "players.0.panel.bottom", kind: "player.panel.bottom", x: PLAYER_PANEL.x, y: PLAYER_PANEL.y, w: PLAYER_PANEL.w, h: PLAYER_PANEL.h, statePath: ["players", 0] },
    { uiID: "player.bottom.nobles.1", kind: "noble", x: PLAYER_PANEL[0].x + ROW_CARD_NOBLE_XY[0], y: PLAYER_PANEL[0].y, w: NOBLE_WH.w, h: NOBLE_WH.h, statePath: ["players", 0, "nobles", 0]},
    { uiID: "player.bottom.nobles.2", kind: "noble", x: PLAYER_PANEL[0].x + ROW_CARD_NOBLE_XY[1], y: PLAYER_PANEL[0].y, w: NOBLE_WH.w, h: NOBLE_WH.h, statePath: ["players", 0, "nobles", 1]},
    { uiID: "player.bottom.tokens.yellow", color: "yellow", kind: "token", x: PLAYER_PANEL[0].x + GAP, y: PLAYER_PANEL[0].y, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["players", 0, "tokens", "yellow"]},
    { uiID: "player.bottom.reserved.1", kind: "reserved", tier: "reserved", index: 0, x: PLAYER_PANEL[0].x + GAP * 2 + TOKEN_WH.w, y: PLAYER_PANEL[0].y, w: CARD_WH.h, h: CARD_WH.w, statePath: ["players", 0, "reserved", 0] }, // notice w h reversed
    { uiID: "player.bottom.reserved.2", kind: "reserved", tier: "reserved", index: 1, x: PLAYER_PANEL[0].x + GAP * 3 + TOKEN_WH.w + CARD_WH.h, y: PLAYER_PANEL[0].y, w: CARD_WH.h, h: CARD_WH.w, statePath: ["players", 0, "reserved", 1] }, // notice w h reversed
    { uiID: "player.bottom.reserved.3", kind: "reserved", tier: "reserved", index: 2, x: PLAYER_PANEL[0].x + GAP * 4 + TOKEN_WH.w + CARD_WH.h * 2, y: PLAYER_PANEL[0].y, w: CARD_WH.h, h: CARD_WH.w, statePath: ["players", 0, "reserved", 2] }, // notice w h reversed
    { uiID: "playyer.bottom.token.green", color: "green", kind: "token", x: ROW_CARD_NOBLE_XY[0] + GAP, y: PLAYER_PANEL[0].y + CARD_WH.w + GAP, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["players", 0, "tokens", "green"]},
    { uiID: "playyer.bottom.token.red", color: "red", kind: "token", x: ROW_CARD_NOBLE_XY[1] + GAP, y: PLAYER_PANEL[0].y + CARD_WH.w + GAP, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["players", 0, "tokens", "red"]},
    { uiID: "playyer.bottom.token.blue", color: "blue", kind: "token", x: ROW_CARD_NOBLE_XY[2] + GAP, y: PLAYER_PANEL[0].y + CARD_WH.w + GAP, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["players", 0, "tokens", "blue"]},
    { uiID: "playyer.bottom.token.black", color: "black", kind: "token", x: ROW_CARD_NOBLE_XY[3] + GAP, y: PLAYER_PANEL[0].y + CARD_WH.w + GAP, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["players", 0, "tokens", "black"]},
    { uiID: "playyer.bottom.token.white", color: "white", kind: "token", x: ROW_CARD_NOBLE_XY[4] + GAP, y: PLAYER_PANEL[0].y + CARD_WH.w + GAP, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["players", 0, "tokens", "white"]},
    { uiID: "player.bottom.cards.green", color: "green", kind: "fanned.cards", x: ROW_CARD_NOBLE_XY[0], y: PLAYER_PANEL[0].y + CARD_WH.w + GAP*2 + TOKEN_WH.h, w: CARD_WH.w, h: CARD_WH.h, statePath: ["players", 0, "cards"]},
    { uiID: "player.bottom.cards.red", color: "red", kind: "fanned.cards", x: ROW_CARD_NOBLE_XY[1], y: PLAYER_PANEL[0].y + CARD_WH.w + GAP*2 + TOKEN_WH.h, w: CARD_WH.w, h: CARD_WH.h, statePath: ["players", 0, "cards"]},
    { uiID: "player.bottom.cards.blue", color: "blue", kind: "fanned.cards", x: ROW_CARD_NOBLE_XY[2], y: PLAYER_PANEL[0].y + CARD_WH.w + GAP*2 + TOKEN_WH.h, w: CARD_WH.w, h: CARD_WH.h, statePath: ["players", 0, "cards"]},
    { uiID: "player.bottom.cards.black", color: "black", kind: "fanned.cards", x: ROW_CARD_NOBLE_XY[3], y: PLAYER_PANEL[0].y + CARD_WH.w + GAP*2 + TOKEN_WH.h, w: CARD_WH.w, h: CARD_WH.h, statePath: ["players", 0, "cards"]},
    { uiID: "player.bottom.cards.white", color: "white", kind: "fanned.cards", x: ROW_CARD_NOBLE_XY[4], y: PLAYER_PANEL[0].y + CARD_WH.w + GAP*2 + TOKEN_WH.h, w: CARD_WH.w, h: CARD_WH.h, statePath: ["players", 0, "cards"]},

    //{ uiID: "player.nobles.1", kind: "noble", x: ROW_CARD_NOBLE_XY[0], y: BOARD.y, w: NOBLE_WH.w, h: NOBLE_WH.h, statePath: ["market", "nobles", 0] },
    { uiID: "player.rightTop.tokens.yellow", color: "yellow", kind: "token", x: PLAYER_PANEL[0].x + GAP, y: PLAYER_PANEL[0].y, w: TOKEN_WH.w * 0.5, h: TOKEN_WH.h * 0.5, statePath: ["players", 1, "tokens", "yellow"]},
    { uiID: "player.rightTop.reserved.1", kind: "reserved", tier: "reserved", index: 0, x: PLAYER_PANEL[0].x + GAP * 2 + TOKEN_WH.w, y: PLAYER_PANEL[0].y, w: CARD_WH.h * 0.5, h: CARD_WH.w * 0.5, statePath: ["players", 2, "reserved", 0] }, // notice w h reversed
    { uiID: "player.rightTop.reserved.2", kind: "reserved", tier: "reserved", index: 1, x: PLAYER_PANEL[0].x + GAP * 3 + TOKEN_WH.w + CARD_WH.h, y: PLAYER_PANEL[0].y, w: CARD_WH.h * 0.5, h: CARD_WH.w * 0.5, statePath: ["players", 1, "reserved", 1] }, // notice w h reversed
    { uiID: "player.rightTop.reserved.3", kind: "reserved", tier: "reserved", index: 2, x: PLAYER_PANEL[0].x + GAP * 4 + TOKEN_WH.w + CARD_WH.h * 2, y: PLAYER_PANEL[0].y, w: CARD_WH.h * 0.5, h: CARD_WH.w * 0.5, statePath: ["players", 1, "reserved", 2] }, // notice w h reversed
    { uiID: "playyer.rightTop.token.green", color: "green", kind: "token", x: ROW_CARD_NOBLE_XY[0] + GAP, y: PLAYER_PANEL[0].y + CARD_WH.w + GAP, w: TOKEN_WH.w * 0.5, h: TOKEN_WH.h * 0.5, statePath: ["players", 1, "tokens", "green"]},
    { uiID: "playyer.rightTop.token.red", color: "red", kind: "token", x: ROW_CARD_NOBLE_XY[1] + GAP, y: PLAYER_PANEL[0].y + CARD_WH.w + GAP, w: TOKEN_WH.w * 0.5, h: TOKEN_WH.h * 0.5, statePath: ["players", 1, "tokens", "red"]},
    { uiID: "playyer.rightTop.token.blue", color: "blue", kind: "token", x: ROW_CARD_NOBLE_XY[2] + GAP, y: PLAYER_PANEL[0].y + CARD_WH.w + GAP, w: TOKEN_WH.w * 0.5, h: TOKEN_WH.h * 0.5, statePath: ["players", 1, "tokens", "blue"]},
    { uiID: "playyer.rightTop.token.black", color: "black", kind: "token", x: ROW_CARD_NOBLE_XY[3] + GAP, y: PLAYER_PANEL[0].y + CARD_WH.w + GAP, w: TOKEN_WH.w * 0.5, h: TOKEN_WH.h * 0.5, statePath: ["players", 1, "tokens", "black"]},
    { uiID: "playyer.rightTop.token.white", color: "white", kind: "token", x: ROW_CARD_NOBLE_XY[4] + GAP, y: PLAYER_PANEL[0].y + CARD_WH.w + GAP, w: TOKEN_WH.w * 0.5, h: TOKEN_WH.h * 0.5, statePath: ["players", 1, "tokens", "white"]},
    { uiID: "player.rightTop.cards.green", color: "green", kind: "fanned.cards", x: ROW_CARD_NOBLE_XY[0], y: PLAYER_PANEL[0].y + CARD_WH.w + GAP*2 + TOKEN_WH.h, w: CARD_WH.w * 0.5, h: CARD_WH.h * 0.5, statePath: ["players", 1, "cards"]},
    { uiID: "player.rightTop.cards.red", color: "red", kind: "fanned.cards", x: ROW_CARD_NOBLE_XY[1], y: PLAYER_PANEL[0].y + CARD_WH.w + GAP*2 + TOKEN_WH.h, w: CARD_WH.w * 0.5, h: CARD_WH.h * 0.5, statePath: ["players", 1, "cards"]},
    { uiID: "player.rightTop.cards.blue", color: "blue", kind: "fanned.cards", x: ROW_CARD_NOBLE_XY[2], y: PLAYER_PANEL[0].y + CARD_WH.w + GAP*2 + TOKEN_WH.h, w: CARD_WH.w * 0.5, h: CARD_WH.h * 0.5, statePath: ["players", 1, "cards"]},
    { uiID: "player.rightTop.cards.black", color: "black", kind: "fanned.cards", x: ROW_CARD_NOBLE_XY[3], y: PLAYER_PANEL[0].y + CARD_WH.w + GAP*2 + TOKEN_WH.h, w: CARD_WH.w * 0.5, h: CARD_WH.h * 0.5, statePath: ["players", 1, "cards"]},
    { uiID: "player.rightTop.cards.white", color: "white", kind: "fanned.cards", x: ROW_CARD_NOBLE_XY[4], y: PLAYER_PANEL[0].y + CARD_WH.w + GAP*2 + TOKEN_WH.h, w: CARD_WH.w * 0.5, h: CARD_WH.h * 0.5, statePath: ["players", 1, "cards"]},

    {
      uiID: "ui.prompt",
      kind: "ui.prompt",
      x: BOARD.x,
      y: BOARD.y + BANK_TOKEN_Y + TOKEN_WH.h + GAP,
      w: BOARD.w - (CARD_WH.w + GAP) * 2,
      h: TOKEN_WH.h + GAP
    },
    {
      uiID: "ui.button.confirm",
      kind: "button.confirm",
      //id: "confirm",
      x: BOARD.x + BOARD.w - (CARD_WH.w + GAP) * 2,
      y: BOARD.y + BANK_TOKEN_Y + TOKEN_WH.h + GAP,
      w: CARD_WH.w,
      h: TOKEN_WH.h + GAP
    },
    {
      uiID: "ui.button.cancel",
      kind: "button.cancel",
      //id: "cancel",
      x: BOARD.x + BOARD.w - (CARD_WH.w + GAP),
      y: BOARD.y + BANK_TOKEN_Y + TOKEN_WH.h + GAP,
      w: CARD_WH.w,
      h: TOKEN_WH.h + GAP
    },
    {
      uiID: "ui.button.reset",  // temporary button to rest state on server
      kind: "button.reset",
      x: 0,
      y: 0,
      w: 100,
      h: 25
    }
  ];
}
