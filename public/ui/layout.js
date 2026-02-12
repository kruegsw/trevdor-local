export function computeLayout(viewport = { width, height }) {

  const SCALE = 3;
  const MARGIN = 10 * SCALE;
  const GAP = 5 * SCALE;

  const CARD_W = 25 * SCALE;
  const CARD_WH  = { w: CARD_W, h: 35 * SCALE };
  const NOBLE_WH = { w: CARD_W, h: 25 * SCALE };
  const TOKEN_WH = { w: 15 * SCALE, h: 15 * SCALE };

  // ---- BOARD local geometry (0,0 is top-left of the board container)
  const BOARD = {
    x: MARGIN,            // <-- later you can move the whole board by changing this
    y: MARGIN,
    w: (CARD_W * 5) + (GAP * 4),
    h: (NOBLE_WH.h + GAP * 4 + CARD_WH.h * 3 + TOKEN_WH.h),
  };

  // local column X positions inside board
  const COL_X = [
    0,
    (GAP + CARD_W) * 1,
    (GAP + CARD_W) * 2,
    (GAP + CARD_W) * 3,
    (GAP + CARD_W) * 4,
  ];

  // local Y positions inside board
  const NOBLES_Y = 0;
  const TIER1_Y  = NOBLE_WH.h + GAP;
  const TIER2_Y  = NOBLE_WH.h + GAP * 2 + CARD_WH.h;
  const TIER3_Y  = NOBLE_WH.h + GAP * 3 + CARD_WH.h * 2;
  const BANK_Y   = NOBLE_WH.h + GAP * 4 + CARD_WH.h * 3;

  // ---- PLAYER PANEL container (positioned relative to board, but has its own local coords)
  const PLAYER_PANEL = {
    x: BOARD.x,                         // panel aligned with board by default
    y: BOARD.y + BOARD.h + GAP * 4,     // below board
    w: BOARD.w,
    h:
      (TOKEN_WH.h + GAP) +
      (CARD_WH.h + Math.floor(CARD_WH.h * 0.25) * 5) +
      (NOBLE_WH.h + GAP * 2),
  };

  // ---- SUMMARY container (right of board)
  const SUMMARY = {
    x: BOARD.x + BOARD.w + GAP * 4,
    y: BOARD.y,
    w: CARD_WH.w * 3 + GAP * 6,
    // 4 cards stacked, + gaps between
    h: (TOKEN_WH.h * 3 + GAP * 6) * 4 + GAP * 3,
  };

  const SUMMARY_CARD = {
    w: SUMMARY.w,
    h: TOKEN_WH.h * 2 + GAP * 3, // header + 2 rows + padding
  };

  const S = (dx, dy) => ({ x: SUMMARY.x + dx, y: SUMMARY.y + dy });
  const slotS = (obj) => ({ ...obj, ...S(obj.dx ?? 0, obj.dy ?? 0) });

  function summaryCardRect(i) {
    return {
      x: SUMMARY.x,
      y: SUMMARY.y + i * (SUMMARY_CARD.h + GAP),
      w: SUMMARY_CARD.w,
      h: SUMMARY_CARD.h,
    };
  }

  function SP(i, dx, dy) {
    const r = summaryCardRect(i);
    return { x: r.x + dx, y: r.y + dy };
  }
  const slotSP = (i, obj) => ({ ...obj, ...SP(i, obj.dx ?? 0, obj.dy ?? 0) });

  // ---- Layout inside each card (local coordinates)
  const PAD = GAP;                 // padding inside each card
  const HEADER_Y = PAD;
  const GEMS_Y   = PAD + TOKEN_WH.h;     // after header
  const TOKENS_Y = GEMS_Y + TOKEN_WH.h;      // below gems row



  // Column layout:
  const SUMMARY_GEM_WH = GAP * 2.5;
  const CELL_W = SUMMARY_GEM_WH;            // spacing between columns

  const LABEL_W = CELL_W;
  const COL0_X = GAP * 4 + LABEL_W;   // yellow token column
  const COL1_X = COL0_X + CELL_W; // white column starts after yellow

  // local helpers: convert (dx,dy) to absolute
  const B = (dx, dy) => ({ x: BOARD.x + dx, y: BOARD.y + dy });
  const P = (dx, dy) => ({ x: PLAYER_PANEL.x + dx, y: PLAYER_PANEL.y + dy });

  // small slot helper so you don’t repeat x/y merges
  const slot = (base, obj) => ({ ...obj, ...base(obj.dx ?? 0, obj.dy ?? 0) });

  // -----------------------------------------
  // Hard-coded slots (but now dx/dy are LOCAL)
  // -----------------------------------------
  const slots = [
    // --- container hit regions (super useful for hit testing / debug overlay)
    //{ uiID: "area.board", kind: "area.board", x: BOARD.x, y: BOARD.y, w: BOARD.w, h: BOARD.h },
    //{ uiID: "area.player.panel", kind: "area.player.panel", x: PLAYER_PANEL.x, y: PLAYER_PANEL.y, w: PLAYER_PANEL.w, h: PLAYER_PANEL.h },

    // --- decks (board-relative)
    slot(B, { uiID: "decks.tier1", kind: "decks.tier1", dx: COL_X[0], dy: TIER1_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["decks","tier1"] }),
    slot(B, { uiID: "decks.tier2", kind: "decks.tier2", dx: COL_X[0], dy: TIER2_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["decks","tier2"] }),
    slot(B, { uiID: "decks.tier3", kind: "decks.tier3", dx: COL_X[0], dy: TIER3_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["decks","tier3"] }),

    // --- nobles (board-relative)
    slot(B, { uiID: "market.nobles-1", kind: "noble", dx: COL_X[0], dy: NOBLES_Y, w: NOBLE_WH.w, h: NOBLE_WH.h, statePath: ["market","nobles",0] }),
    slot(B, { uiID: "market.nobles-2", kind: "noble", dx: COL_X[1], dy: NOBLES_Y, w: NOBLE_WH.w, h: NOBLE_WH.h, statePath: ["market","nobles",1] }),
    slot(B, { uiID: "market.nobles-3", kind: "noble", dx: COL_X[2], dy: NOBLES_Y, w: NOBLE_WH.w, h: NOBLE_WH.h, statePath: ["market","nobles",2] }),
    slot(B, { uiID: "market.nobles-4", kind: "noble", dx: COL_X[3], dy: NOBLES_Y, w: NOBLE_WH.w, h: NOBLE_WH.h, statePath: ["market","nobles",3] }),
    slot(B, { uiID: "market.nobles-5", kind: "noble", dx: COL_X[4], dy: NOBLES_Y, w: NOBLE_WH.w, h: NOBLE_WH.h, statePath: ["market","nobles",4] }),

    // --- tier 1 cards (board-relative)
    slot(B, { uiID: "market.cards.tier1-1", kind: "market.card", tier: 1, index: 0, dx: COL_X[1], dy: TIER1_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market","cards","tier1",0] }),
    slot(B, { uiID: "market.cards.tier1-2", kind: "market.card", tier: 1, index: 1, dx: COL_X[2], dy: TIER1_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market","cards","tier1",1] }),
    slot(B, { uiID: "market.cards.tier1-3", kind: "market.card", tier: 1, index: 2, dx: COL_X[3], dy: TIER1_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market","cards","tier1",2] }),
    slot(B, { uiID: "market.cards.tier1-4", kind: "market.card", tier: 1, index: 3, dx: COL_X[4], dy: TIER1_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market","cards","tier1",3] }),

    // --- tier 2 cards (board-relative)
    slot(B, { uiID: "market.cards.tier2-1", kind: "market.card", tier: 2, index: 0, dx: COL_X[1], dy: TIER2_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market","cards","tier2",0] }),
    slot(B, { uiID: "market.cards.tier2-2", kind: "market.card", tier: 2, index: 1, dx: COL_X[2], dy: TIER2_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market","cards","tier2",1] }),
    slot(B, { uiID: "market.cards.tier2-3", kind: "market.card", tier: 2, index: 2, dx: COL_X[3], dy: TIER2_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market","cards","tier2",2] }),
    slot(B, { uiID: "market.cards.tier2-4", kind: "market.card", tier: 2, index: 3, dx: COL_X[4], dy: TIER2_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market","cards","tier2",3] }),

    // --- tier 3 cards (board-relative)
    slot(B, { uiID: "market.cards.tier3-1", kind: "market.card", tier: 3, index: 0, dx: COL_X[1], dy: TIER3_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market","cards","tier3",0] }),
    slot(B, { uiID: "market.cards.tier3-2", kind: "market.card", tier: 3, index: 1, dx: COL_X[2], dy: TIER3_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market","cards","tier3",1] }),
    slot(B, { uiID: "market.cards.tier3-3", kind: "market.card", tier: 3, index: 2, dx: COL_X[3], dy: TIER3_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market","cards","tier3",2] }),
    slot(B, { uiID: "market.cards.tier3-4", kind: "market.card", tier: 3, index: 3, dx: COL_X[4], dy: TIER3_Y, w: CARD_WH.w, h: CARD_WH.h, statePath: ["market","cards","tier3",3] }),

    // --- bank tokens (board-relative) (keeps your spacing vibe, but local)
    slot(B, { uiID: "bank.yellow", color: "yellow", kind: "token", dx: GAP,                 dy: BANK_Y, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["market","bank","yellow"] }),
    slot(B, { uiID: "bank.green",  color: "green",  kind: "token", dx: GAP * 5 + TOKEN_WH.w, dy: BANK_Y, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["market","bank","green"] }),
    slot(B, { uiID: "bank.red",    color: "red",    kind: "token", dx: GAP * 6 + TOKEN_WH.w * 2, dy: BANK_Y, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["market","bank","red"] }),
    slot(B, { uiID: "bank.blue",   color: "blue",   kind: "token", dx: GAP * 7 + TOKEN_WH.w * 3, dy: BANK_Y, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["market","bank","blue"] }),
    slot(B, { uiID: "bank.black",  color: "black",  kind: "token", dx: GAP * 8 + TOKEN_WH.w * 4, dy: BANK_Y, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["market","bank","black"] }),
    slot(B, { uiID: "bank.white",  color: "white",  kind: "token", dx: GAP * 9 + TOKEN_WH.w * 5, dy: BANK_Y, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["market","bank","white"] }),

    // ---- player panel items (panel-relative)
    slot(P, { uiID: "player.nobles", kind: "fanned.nobles", dx: GAP * 5 + TOKEN_WH.w + CARD_WH.h * 3, dy: 0, w: NOBLE_WH.w, h: NOBLE_WH.h, statePath: ["players",0,"nobles"] }),
    slot(P, { uiID: "player.tokens.yellow", color: "yellow", kind: "token", dx: GAP, dy: 0, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["players",0,"tokens","yellow"] }),

    // reserved (still sideways)
    slot(P, { uiID: "player.reserved.1", kind: "reserved", tier: "reserved", index: 0, dx: GAP * 2 + TOKEN_WH.w,               dy: 0, w: CARD_WH.h, h: CARD_WH.w, statePath: ["players",0,"reserved",0] }),
    slot(P, { uiID: "player.reserved.2", kind: "reserved", tier: "reserved", index: 1, dx: GAP * 3 + TOKEN_WH.w + CARD_WH.h,   dy: 0, w: CARD_WH.h, h: CARD_WH.w, statePath: ["players",0,"reserved",1] }),
    slot(P, { uiID: "player.reserved.3", kind: "reserved", tier: "reserved", index: 2, dx: GAP * 4 + TOKEN_WH.w + CARD_WH.h*2, dy: 0, w: CARD_WH.h, h: CARD_WH.w, statePath: ["players",0,"reserved",2] }),

    // player token row 2 aligned to board columns BUT expressed as panel-local
    slot(P, { uiID: "player.tokens.green", color: "green", kind: "token", dx: COL_X[0] + GAP, dy: CARD_WH.w + GAP, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["players",0,"tokens","green"] }),
    slot(P, { uiID: "player.tokens.red",   color: "red",   kind: "token", dx: COL_X[1] + GAP, dy: CARD_WH.w + GAP, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["players",0,"tokens","red"] }),
    slot(P, { uiID: "player.tokens.blue",  color: "blue",  kind: "token", dx: COL_X[2] + GAP, dy: CARD_WH.w + GAP, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["players",0,"tokens","blue"] }),
    slot(P, { uiID: "player.tokens.black", color: "black", kind: "token", dx: COL_X[3] + GAP, dy: CARD_WH.w + GAP, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["players",0,"tokens","black"] }),
    slot(P, { uiID: "player.tokens.white", color: "white", kind: "token", dx: COL_X[4] + GAP, dy: CARD_WH.w + GAP, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["players",0,"tokens","white"] }),

    // fanned cards (same statePath)
    slot(P, { uiID: "player.cards.green", color: "green", kind: "fanned.cards", dx: COL_X[0], dy: CARD_WH.w + GAP*2 + TOKEN_WH.h, w: CARD_WH.w, h: CARD_WH.h, statePath: ["players",0,"cards"] }),
    slot(P, { uiID: "player.cards.red",   color: "red",   kind: "fanned.cards", dx: COL_X[1], dy: CARD_WH.w + GAP*2 + TOKEN_WH.h, w: CARD_WH.w, h: CARD_WH.h, statePath: ["players",0,"cards"] }),
    slot(P, { uiID: "player.cards.blue",  color: "blue",  kind: "fanned.cards", dx: COL_X[2], dy: CARD_WH.w + GAP*2 + TOKEN_WH.h, w: CARD_WH.w, h: CARD_WH.h, statePath: ["players",0,"cards"] }),
    slot(P, { uiID: "player.cards.black", color: "black", kind: "fanned.cards", dx: COL_X[3], dy: CARD_WH.w + GAP*2 + TOKEN_WH.h, w: CARD_WH.w, h: CARD_WH.h, statePath: ["players",0,"cards"] }),
    slot(P, { uiID: "player.cards.white", color: "white", kind: "fanned.cards", dx: COL_X[4], dy: CARD_WH.w + GAP*2 + TOKEN_WH.h, w: CARD_WH.w, h: CARD_WH.h, statePath: ["players",0,"cards"] }),

    // UI row (board-relative, since it lives under the bank on the board area)
    slot(B, {
      uiID: "ui.prompt",
      kind: "ui.prompt",
      dx: 0,
      dy: BANK_Y + TOKEN_WH.h + GAP,
      w: BOARD.w - (CARD_WH.w + GAP) * 2,
      h: TOKEN_WH.h + GAP,
    }),
    slot(B, {
      uiID: "ui.button.confirm",
      kind: "button.confirm",
      dx: BOARD.w - (CARD_WH.w + GAP) * 2,
      dy: BANK_Y + TOKEN_WH.h + GAP,
      w: CARD_WH.w,
      h: TOKEN_WH.h + GAP,
    }),
    slot(B, {
      uiID: "ui.button.cancel",
      kind: "button.cancel",
      dx: BOARD.w - (CARD_WH.w + GAP),
      dy: BANK_Y + TOKEN_WH.h + GAP,
      w: CARD_WH.w,
      h: TOKEN_WH.h + GAP,
    }),

    // reset button (screen absolute; leave as-is)
    { uiID: "ui.button.reset", kind: "button.reset", x: 0, y: 0, w: 100, h: 25 },

    // ---------------------------------------------------------
    // SUMMARY (right of board) — hard-coded slots (compact)
    // ---------------------------------------------------------

    // Container rect (not for hit testing)
    // { uiID: "summary.container", kind: "summary.container", x: SUMMARY.x, y: SUMMARY.y, w: SUMMARY.w, h: SUMMARY.h },

    // ---- Player 1 summary card (players[0])
    { uiID: "summary.p0.card", kind: "summary.card", ...summaryCardRect(0), playerIndex: 0 },

    slotSP(0, { uiID: "summary.p0.name",  kind: "summary.text.name",  playerIndex: 0, dx: PAD, dy: HEADER_Y, w: SUMMARY_CARD.w * 0.65, h: TOKEN_WH.h, text: "Player 1" }),
    slotSP(0, { uiID: "summary.p0.bonus", kind: "summary.text.bonus", playerIndex: 0, dx: SUMMARY_CARD.w - PAD - TOKEN_WH.w * 4, dy: HEADER_Y, w: TOKEN_WH.w * 4, h: TOKEN_WH.h, text: "BONUS 0" }),

    // Row labels (same row as pips; keeps card short)
    slotSP(0, { uiID: "summary.p0.label.gems",   kind: "summary.text.rowlabel", playerIndex: 0, dx: PAD, dy: GEMS_Y,   w: LABEL_W, h: TOKEN_WH.h, text: "Gems:" }),
    slotSP(0, { uiID: "summary.p0.label.tokens", kind: "summary.text.rowlabel", playerIndex: 0, dx: PAD, dy: TOKENS_Y, w: LABEL_W, h: TOKEN_WH.h, text: "Tokens:" }),

    // Gems row (no yellow; starts at COL1_X so white aligns with token white)
    slotSP(0, { uiID: "summary.p0.gems.white", kind: "summary.gems", playerIndex: 0, color: "white", dx: COL1_X + CELL_W * 0, dy: GEMS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(0, { uiID: "summary.p0.gems.blue",  kind: "summary.gems", playerIndex: 0, color: "blue",  dx: COL1_X + CELL_W * 1, dy: GEMS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(0, { uiID: "summary.p0.gems.green", kind: "summary.gems", playerIndex: 0, color: "green", dx: COL1_X + CELL_W * 2, dy: GEMS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(0, { uiID: "summary.p0.gems.red",   kind: "summary.gems", playerIndex: 0, color: "red",   dx: COL1_X + CELL_W * 3, dy: GEMS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(0, { uiID: "summary.p0.gems.black", kind: "summary.gems", playerIndex: 0, color: "black", dx: COL1_X + CELL_W * 4, dy: GEMS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),

    // Tokens row (yellow alone at COL0_X; others align under gems)
    slotSP(0, { uiID: "summary.p0.tokens.yellow", kind: "summary.tokens", playerIndex: 0, color: "yellow", dx: COL0_X,                dy: TOKENS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(0, { uiID: "summary.p0.tokens.white",  kind: "summary.tokens", playerIndex: 0, color: "white",  dx: COL1_X + CELL_W * 0, dy: TOKENS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(0, { uiID: "summary.p0.tokens.blue",   kind: "summary.tokens", playerIndex: 0, color: "blue",   dx: COL1_X + CELL_W * 1, dy: TOKENS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(0, { uiID: "summary.p0.tokens.green",  kind: "summary.tokens", playerIndex: 0, color: "green",  dx: COL1_X + CELL_W * 2, dy: TOKENS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(0, { uiID: "summary.p0.tokens.red",    kind: "summary.tokens", playerIndex: 0, color: "red",    dx: COL1_X + CELL_W * 3, dy: TOKENS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(0, { uiID: "summary.p0.tokens.black",  kind: "summary.tokens", playerIndex: 0, color: "black",  dx: COL1_X + CELL_W * 4, dy: TOKENS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),

    // ---- Player 2 summary card (players[1])
    { uiID: "summary.p1.card", kind: "summary.card", ...summaryCardRect(1), playerIndex: 1 },

    slotSP(1, { uiID: "summary.p1.name",  kind: "summary.text.name",  playerIndex: 1, dx: PAD, dy: HEADER_Y, w: SUMMARY_CARD.w * 0.65, h: TOKEN_WH.h, text: "Player 2" }),
    slotSP(1, { uiID: "summary.p1.bonus", kind: "summary.text.bonus", playerIndex: 1, dx: SUMMARY_CARD.w - PAD - TOKEN_WH.w * 4, dy: HEADER_Y, w: TOKEN_WH.w * 4, h: TOKEN_WH.h, text: "BONUS 0" }),

    slotSP(1, { uiID: "summary.p1.label.gems",   kind: "summary.text.rowlabel", playerIndex: 1, dx: PAD, dy: GEMS_Y,   w: LABEL_W, h: TOKEN_WH.h, text: "Gems:" }),
    slotSP(1, { uiID: "summary.p1.label.tokens", kind: "summary.text.rowlabel", playerIndex: 1, dx: PAD, dy: TOKENS_Y, w: LABEL_W, h: TOKEN_WH.h, text: "Tokens:" }),

    slotSP(1, { uiID: "summary.p1.gems.white", kind: "summary.gems", playerIndex: 1, color: "white", dx: COL1_X + CELL_W * 0, dy: GEMS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(1, { uiID: "summary.p1.gems.blue",  kind: "summary.gems", playerIndex: 1, color: "blue",  dx: COL1_X + CELL_W * 1, dy: GEMS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(1, { uiID: "summary.p1.gems.green", kind: "summary.gems", playerIndex: 1, color: "green", dx: COL1_X + CELL_W * 2, dy: GEMS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(1, { uiID: "summary.p1.gems.red",   kind: "summary.gems", playerIndex: 1, color: "red",   dx: COL1_X + CELL_W * 3, dy: GEMS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(1, { uiID: "summary.p1.gems.black", kind: "summary.gems", playerIndex: 1, color: "black", dx: COL1_X + CELL_W * 4, dy: GEMS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),

    slotSP(1, { uiID: "summary.p1.tokens.yellow", kind: "summary.tokens", playerIndex: 1, color: "yellow", dx: COL0_X,                dy: TOKENS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(1, { uiID: "summary.p1.tokens.white",  kind: "summary.tokens", playerIndex: 1, color: "white",  dx: COL1_X + CELL_W * 0, dy: TOKENS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(1, { uiID: "summary.p1.tokens.blue",   kind: "summary.tokens", playerIndex: 1, color: "blue",   dx: COL1_X + CELL_W * 1, dy: TOKENS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(1, { uiID: "summary.p1.tokens.green",  kind: "summary.tokens", playerIndex: 1, color: "green",  dx: COL1_X + CELL_W * 2, dy: TOKENS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(1, { uiID: "summary.p1.tokens.red",    kind: "summary.tokens", playerIndex: 1, color: "red",    dx: COL1_X + CELL_W * 3, dy: TOKENS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(1, { uiID: "summary.p1.tokens.black",  kind: "summary.tokens", playerIndex: 1, color: "black",  dx: COL1_X + CELL_W * 4, dy: TOKENS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),

    // ---- Player 3 summary card (players[2])
    { uiID: "summary.p2.card", kind: "summary.card", ...summaryCardRect(2), playerIndex: 2 },

    slotSP(2, { uiID: "summary.p2.name",  kind: "summary.text.name",  playerIndex: 2, dx: PAD, dy: HEADER_Y, w: SUMMARY_CARD.w * 0.65, h: TOKEN_WH.h, text: "Player 3" }),
    slotSP(2, { uiID: "summary.p2.bonus", kind: "summary.text.bonus", playerIndex: 2, dx: SUMMARY_CARD.w - PAD - TOKEN_WH.w * 4, dy: HEADER_Y, w: TOKEN_WH.w * 4, h: TOKEN_WH.h, text: "BONUS 0" }),

    slotSP(2, { uiID: "summary.p2.label.gems",   kind: "summary.text.rowlabel", playerIndex: 2, dx: PAD, dy: GEMS_Y,   w: LABEL_W, h: TOKEN_WH.h, text: "Gems:" }),
    slotSP(2, { uiID: "summary.p2.label.tokens", kind: "summary.text.rowlabel", playerIndex: 2, dx: PAD, dy: TOKENS_Y, w: LABEL_W, h: TOKEN_WH.h, text: "Tokens:" }),

    slotSP(2, { uiID: "summary.p2.gems.white", kind: "summary.gems", playerIndex: 2, color: "white", dx: COL1_X + CELL_W * 0, dy: GEMS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(2, { uiID: "summary.p2.gems.blue",  kind: "summary.gems", playerIndex: 2, color: "blue",  dx: COL1_X + CELL_W * 1, dy: GEMS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(2, { uiID: "summary.p2.gems.green", kind: "summary.gems", playerIndex: 2, color: "green", dx: COL1_X + CELL_W * 2, dy: GEMS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(2, { uiID: "summary.p2.gems.red",   kind: "summary.gems", playerIndex: 2, color: "red",   dx: COL1_X + CELL_W * 3, dy: GEMS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(2, { uiID: "summary.p2.gems.black", kind: "summary.gems", playerIndex: 2, color: "black", dx: COL1_X + CELL_W * 4, dy: GEMS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),

    slotSP(2, { uiID: "summary.p2.tokens.yellow", kind: "summary.tokens", playerIndex: 2, color: "yellow", dx: COL0_X,                dy: TOKENS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(2, { uiID: "summary.p2.tokens.white",  kind: "summary.tokens", playerIndex: 2, color: "white",  dx: COL1_X + CELL_W * 0, dy: TOKENS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(2, { uiID: "summary.p2.tokens.blue",   kind: "summary.tokens", playerIndex: 2, color: "blue",   dx: COL1_X + CELL_W * 1, dy: TOKENS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(2, { uiID: "summary.p2.tokens.green",  kind: "summary.tokens", playerIndex: 2, color: "green",  dx: COL1_X + CELL_W * 2, dy: TOKENS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(2, { uiID: "summary.p2.tokens.red",    kind: "summary.tokens", playerIndex: 2, color: "red",    dx: COL1_X + CELL_W * 3, dy: TOKENS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(2, { uiID: "summary.p2.tokens.black",  kind: "summary.tokens", playerIndex: 2, color: "black",  dx: COL1_X + CELL_W * 4, dy: TOKENS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),

    // ---- Player 4 summary card (players[3])
    { uiID: "summary.p3.card", kind: "summary.card", ...summaryCardRect(3), playerIndex: 3 },

    slotSP(3, { uiID: "summary.p3.name",  kind: "summary.text.name",  playerIndex: 3, dx: PAD, dy: HEADER_Y, w: SUMMARY_CARD.w * 0.65, h: TOKEN_WH.h, text: "Player 4" }),
    slotSP(3, { uiID: "summary.p3.bonus", kind: "summary.text.bonus", playerIndex: 3, dx: SUMMARY_CARD.w - PAD - TOKEN_WH.w * 4, dy: HEADER_Y, w: TOKEN_WH.w * 4, h: TOKEN_WH.h, text: "BONUS 0" }),

    slotSP(3, { uiID: "summary.p3.label.gems",   kind: "summary.text.rowlabel", playerIndex: 3, dx: PAD, dy: GEMS_Y,   w: LABEL_W, h: TOKEN_WH.h, text: "Gems:" }),
    slotSP(3, { uiID: "summary.p3.label.tokens", kind: "summary.text.rowlabel", playerIndex: 3, dx: PAD, dy: TOKENS_Y, w: LABEL_W, h: TOKEN_WH.h, text: "Tokens:" }),

    slotSP(3, { uiID: "summary.p3.gems.white", kind: "summary.gems", playerIndex: 3, color: "white", dx: COL1_X + CELL_W * 0, dy: GEMS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(3, { uiID: "summary.p3.gems.blue",  kind: "summary.gems", playerIndex: 3, color: "blue",  dx: COL1_X + CELL_W * 1, dy: GEMS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(3, { uiID: "summary.p3.gems.green", kind: "summary.gems", playerIndex: 3, color: "green", dx: COL1_X + CELL_W * 2, dy: GEMS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(3, { uiID: "summary.p3.gems.red",   kind: "summary.gems", playerIndex: 3, color: "red",   dx: COL1_X + CELL_W * 3, dy: GEMS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(3, { uiID: "summary.p3.gems.black", kind: "summary.gems", playerIndex: 3, color: "black", dx: COL1_X + CELL_W * 4, dy: GEMS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),

    slotSP(3, { uiID: "summary.p3.tokens.yellow", kind: "summary.tokens", playerIndex: 3, color: "yellow", dx: COL0_X,                dy: TOKENS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(3, { uiID: "summary.p3.tokens.white",  kind: "summary.tokens", playerIndex: 3, color: "white",  dx: COL1_X + CELL_W * 0, dy: TOKENS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(3, { uiID: "summary.p3.tokens.blue",   kind: "summary.tokens", playerIndex: 3, color: "blue",   dx: COL1_X + CELL_W * 1, dy: TOKENS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(3, { uiID: "summary.p3.tokens.green",  kind: "summary.tokens", playerIndex: 3, color: "green",  dx: COL1_X + CELL_W * 2, dy: TOKENS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(3, { uiID: "summary.p3.tokens.red",    kind: "summary.tokens", playerIndex: 3, color: "red",    dx: COL1_X + CELL_W * 3, dy: TOKENS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),
    slotSP(3, { uiID: "summary.p3.tokens.black",  kind: "summary.tokens", playerIndex: 3, color: "black",  dx: COL1_X + CELL_W * 4, dy: TOKENS_Y, w: TOKEN_WH.w + GAP, h: TOKEN_WH.h}),

  ];

  // If you want, you can also return { BOARD, PLAYER_PANEL, slots }
  // but keeping your existing "return slots" is fine.
  return slots;
}
