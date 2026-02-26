export function computeLayout(viewport = { width, height }) {

  const SCALE = 3;
  const MARGIN = 10 * SCALE;
  const GAP = 5 * SCALE;

  const CARD_W = 25 * SCALE;
  const CARD_WH  = { w: CARD_W, h: 35 * SCALE };
  const NOBLE_WH = { w: CARD_W, h: 25 * SCALE };
  const TOKEN_WH = { w: 15 * SCALE, h: 15 * SCALE };
  const PANEL_PAD = 3 * SCALE; // 9px inner margin within player panels

  // ---- Full panel dimensions (same internal layout as old single player panel)
  const PANEL_W = (CARD_W * 5) + (GAP * 4) + 2 * PANEL_PAD;
  const HEADER_H = GAP * 2 + 20; // name header row height (padding + text)
  const PANEL_H =
    2 * PANEL_PAD +                                          // top + bottom padding
    HEADER_H + GAP +                                         // name header + gap below header
    (TOKEN_WH.h + GAP) +                                    // row 0: yellow token + reserved + nobles
    (CARD_WH.h + Math.floor(CARD_WH.h * 0.25) * 5) +       // row 2: fanned card stacks
    (NOBLE_WH.h + GAP * 2);                                 // bottom padding
  const GAP_TO_BOARD = GAP * 2; // 30

  // ---- BOARD local geometry (0,0 is top-left of the board container)
  const BOARD = {
    x: MARGIN + PANEL_W + GAP_TO_BOARD,
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

  // ---- 4 panel positions around the board
  // 0=top-right (P2), 1=bottom-right (P4), 2=top-left (P1), 3=bottom-left (P3)
  const panelPositions = [
    { x: BOARD.x + BOARD.w + GAP_TO_BOARD, y: BOARD.y },                          // right
    { x: BOARD.x + BOARD.w + GAP_TO_BOARD, y: BOARD.y + BOARD.h + GAP_TO_BOARD }, // below-right
    { x: MARGIN,                           y: BOARD.y },                           // left
    { x: MARGIN,                           y: BOARD.y + BOARD.h + GAP_TO_BOARD },  // below-left
  ];

  // local helpers: convert (dx,dy) to absolute
  const B = (dx, dy) => ({ x: BOARD.x + dx, y: BOARD.y + dy });

  // small slot helper so you don't repeat x/y merges
  const slot = (base, obj) => ({ ...obj, ...base(obj.dx ?? 0, obj.dy ?? 0) });

  // -----------------------------------------
  // Hard-coded slots (but now dx/dy are LOCAL)
  // -----------------------------------------
  const slots = [

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

  ];

  // ---- Generate 4 full player panels around the board
  // Each panel has the same internal layout as the old single player panel.
  // positionIndex: 0=right(you), 1=below-right(+1), 2=left(+2), 3=below-left(+3)
  function generatePanelSlots(posIdx, px, py) {
    const P  = (dx, dy) => ({ x: px + dx, y: py + dy });                           // panel origin (for bg)
    const Pc = (dx, dy) => ({ x: px + PANEL_PAD + dx, y: py + PANEL_PAD + dy });   // padded content
    const pSlot = (obj) => ({ ...obj, ...P(obj.dx ?? 0, obj.dy ?? 0) });
    const cSlot = (obj) => ({ ...obj, ...Pc(obj.dx ?? 0, obj.dy ?? 0) });
    const pre = `panel.${posIdx}`;
    const H = HEADER_H + GAP; // vertical offset for content below name header (includes gap after header)

    return [
      // Panel background + name header (drawn first, behind everything)
      // Includes layout metrics so render.js can compute dynamic height
      pSlot({ uiID: `${pre}.bg`, positionIndex: posIdx, kind: "panel.bg", dx: 0, dy: 0, w: PANEL_W, h: PANEL_H, statePath: ["players", 0],
        panelLayout: {
          headerH: HEADER_H,
          pad: PANEL_PAD,
          tokenRowY: PANEL_PAD + HEADER_H + GAP + CARD_WH.w + GAP,
          tokenRowH: TOKEN_WH.h,
          cardRowY: PANEL_PAD + HEADER_H + GAP + CARD_WH.w + GAP * 2 + TOKEN_WH.h, // Y offset where fanned cards start
          cardH: CARD_WH.h,
          cardPeek: Math.floor(CARD_WH.h * 0.25),
          padding: GAP + PANEL_PAD,
        }
      }),

      // Row 0: yellow token, 3 reserved (sideways)
      cSlot({ uiID: `${pre}.tokens.yellow`, positionIndex: posIdx, color: "yellow", kind: "token", dx: GAP, dy: H, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["players", 0, "tokens", "yellow"] }),

      // reserved (sideways)
      cSlot({ uiID: `${pre}.reserved.1`, positionIndex: posIdx, kind: "reserved", tier: "reserved", index: 0, dx: GAP * 2 + TOKEN_WH.w,               dy: H, w: CARD_WH.h, h: CARD_WH.w, statePath: ["players", 0, "reserved", 0] }),
      cSlot({ uiID: `${pre}.reserved.2`, positionIndex: posIdx, kind: "reserved", tier: "reserved", index: 1, dx: GAP * 3 + TOKEN_WH.w + CARD_WH.h,   dy: H, w: CARD_WH.h, h: CARD_WH.w, statePath: ["players", 0, "reserved", 1] }),
      cSlot({ uiID: `${pre}.reserved.3`, positionIndex: posIdx, kind: "reserved", tier: "reserved", index: 2, dx: GAP * 4 + TOKEN_WH.w + CARD_WH.h*2, dy: H, w: CARD_WH.h, h: CARD_WH.w, statePath: ["players", 0, "reserved", 2] }),

      // Row 1: 5 color tokens aligned to board columns
      cSlot({ uiID: `${pre}.tokens.green`, positionIndex: posIdx, color: "green", kind: "token", dx: COL_X[0] + GAP, dy: H + CARD_WH.w + GAP, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["players", 0, "tokens", "green"] }),
      cSlot({ uiID: `${pre}.tokens.red`,   positionIndex: posIdx, color: "red",   kind: "token", dx: COL_X[1] + GAP, dy: H + CARD_WH.w + GAP, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["players", 0, "tokens", "red"] }),
      cSlot({ uiID: `${pre}.tokens.blue`,  positionIndex: posIdx, color: "blue",  kind: "token", dx: COL_X[2] + GAP, dy: H + CARD_WH.w + GAP, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["players", 0, "tokens", "blue"] }),
      cSlot({ uiID: `${pre}.tokens.black`, positionIndex: posIdx, color: "black", kind: "token", dx: COL_X[3] + GAP, dy: H + CARD_WH.w + GAP, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["players", 0, "tokens", "black"] }),
      cSlot({ uiID: `${pre}.tokens.white`, positionIndex: posIdx, color: "white", kind: "token", dx: COL_X[4] + GAP, dy: H + CARD_WH.w + GAP, w: TOKEN_WH.w, h: TOKEN_WH.h, statePath: ["players", 0, "tokens", "white"] }),

      // Row 2: fanned card stacks by color
      cSlot({ uiID: `${pre}.cards.green`, positionIndex: posIdx, color: "green", kind: "fanned.cards", dx: COL_X[0], dy: H + CARD_WH.w + GAP*2 + TOKEN_WH.h, w: CARD_WH.w, h: CARD_WH.h, statePath: ["players", 0, "cards"] }),
      cSlot({ uiID: `${pre}.cards.red`,   positionIndex: posIdx, color: "red",   kind: "fanned.cards", dx: COL_X[1], dy: H + CARD_WH.w + GAP*2 + TOKEN_WH.h, w: CARD_WH.w, h: CARD_WH.h, statePath: ["players", 0, "cards"] }),
      cSlot({ uiID: `${pre}.cards.blue`,  positionIndex: posIdx, color: "blue",  kind: "fanned.cards", dx: COL_X[2], dy: H + CARD_WH.w + GAP*2 + TOKEN_WH.h, w: CARD_WH.w, h: CARD_WH.h, statePath: ["players", 0, "cards"] }),
      cSlot({ uiID: `${pre}.cards.black`, positionIndex: posIdx, color: "black", kind: "fanned.cards", dx: COL_X[3], dy: H + CARD_WH.w + GAP*2 + TOKEN_WH.h, w: CARD_WH.w, h: CARD_WH.h, statePath: ["players", 0, "cards"] }),
      cSlot({ uiID: `${pre}.cards.white`, positionIndex: posIdx, color: "white", kind: "fanned.cards", dx: COL_X[4], dy: H + CARD_WH.w + GAP*2 + TOKEN_WH.h, w: CARD_WH.w, h: CARD_WH.h, statePath: ["players", 0, "cards"] }),
    ];
  }

  for (let posIdx = 0; posIdx < 4; posIdx++) {
    const pos = panelPositions[posIdx];
    slots.push(...generatePanelSlots(posIdx, pos.x, pos.y));
  }

  // Total canvas dimensions
  const totalW = BOARD.x + BOARD.w + GAP_TO_BOARD + PANEL_W + MARGIN;
  const totalH = BOARD.y + BOARD.h + GAP_TO_BOARD + PANEL_H + MARGIN;

  return {
    slots,
    bounds: {
      width: totalW,
      height: totalH,
      boardRight: BOARD.x + BOARD.w,
      boardRect: { x: BOARD.x, y: BOARD.y, w: BOARD.w, h: BOARD.h },
      panelRects: panelPositions.map(p => ({ x: p.x, y: p.y, w: PANEL_W, h: PANEL_H })),
    }
  };
}
