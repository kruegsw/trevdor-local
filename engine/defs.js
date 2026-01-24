// Central “definitions” file:
//
// - CARDS: immutable card definitions (base game)
// - NOBLES: immutable noble definitions (base game)
//
// Your runtime game state should only reference these by id,
// e.g. state.market.cards.tier1 = ["c_t1_001", ...]
//
// Why?
// - Save/load stays small (just ids + token counts + per-player arrays)
// - Rendering can look up full data by id at draw time
// - Game logic can validate using a single source of truth

/* ------------------------------------------------------------------
   Shared schema notes (plain objects, no classes)
   ------------------------------------------------------------------ */

/**
 * GemColor:
 *   "white" | "blue" | "green" | "red" | "black" | "yellow"
 *
 * In Splendor:
 * - white/blue/green/red/black are “real” gems
 * - yellow is gold (joker), only used as a token, never a card bonus
 */

/**
 * CardDef schema:
 * {
 *   id: string,
 *   tier: 1 | 2 | 3,
 *   bonus: "white"|"blue"|"green"|"red"|"black", // permanent discount color
 *   points: number, // prestige points printed on card (0..5)
 *   cost: { white?:number, blue?:number, green?:number, red?:number, black?:number }
 * }
 */

/**
 * NobleDef schema:
 * {
 *   id: string,
 *   points: 3,
 *   req: { white?:number, blue?:number, green?:number, red?:number, black?:number }
 * }
 */

export const COLORS = /** @type {const} */ ({
  white: "white",
  blue: "blue",
  green: "green",
  red: "red",
  black: "black",
  yellow: "yellow",
});

export const TOKEN_POOL_BY_PLAYERS = /** @type {const} */ ({
  // Official rulebook setup:
  // - 4 gems/color for 2p
  // - 5 gems/color for 3p
  // - 7 gems/color for 4p
  // - gold stays 5 always :contentReference[oaicite:1]{index=1}
  2: { white: 4, blue: 4, green: 4, red: 4, black: 4, yellow: 5 },
  3: { white: 5, blue: 5, green: 5, red: 5, black: 5, yellow: 5 },
  4: { white: 7, blue: 7, green: 7, red: 7, black: 7, yellow: 5 },
});

export const NUMBER_NOBLES_BY_PLAYERS = /** @type {const} */ ({
  // Official rulebook setup:
  // - 4 gems/color for 2p
  // - 5 gems/color for 3p
  // - 7 gems/color for 4p
  // - gold stays 5 always :contentReference[oaicite:1]{index=1}
  2: 3,
  3: 4,
  4: 5,
});

/* ------------------------------------------------------------------
   NOBLES (base game, 10 tiles)
   ------------------------------------------------------------------
   Note: the official rulebook explains *how* nobles work and how many
   to reveal, but doesn’t print the full list. :contentReference[oaicite:2]{index=2}

   These 10 requirement patterns are the standard base-game set:
   - 5 “4 + 4” nobles (two colors)
   - 5 “3 + 3 + 3” nobles (three colors)
*/

export const NOBLES = [
  { id: "n_01", points: 3, req: { white: 4, blue: 4 } },
  { id: "n_02", points: 3, req: { blue: 4, green: 4 } },
  { id: "n_03", points: 3, req: { green: 4, red: 4 } },
  { id: "n_04", points: 3, req: { red: 4, black: 4 } },
  { id: "n_05", points: 3, req: { black: 4, white: 4 } },
  { id: "n_06", points: 3, req: { white: 3, blue: 3, green: 3 } },
  { id: "n_07", points: 3, req: { blue: 3, green: 3, red: 3 } },
  { id: "n_08", points: 3, req: { green: 3, red: 3, black: 3 } },
  { id: "n_09", points: 3, req: { red: 3, black: 3, white: 3 } },
  { id: "n_10", points: 3, req: { black: 3, white: 3, blue: 3 } },
];

/*
Card schema:
{
  id: string,
  tier: 1 | 2 | 3,
  bonus: "white" | "blue" | "green" | "red" | "black",
  points: number,
  cost: { white?:number, blue?:number, green?:number, red?:number, black?:number }
}
*/

export const CARDS = [
  /* =========================================================
     TIER 1 — 40 cards
     ========================================================= */

  { id: "t1_01", tier: 1, bonus: "green", points: 0, cost: { green: 1, blue: 1, black: 1 } },
  { id: "t1_02", tier: 1, bonus: "white", points: 1, cost: { green: 4 } },
  { id: "t1_03", tier: 1, bonus: "red",   points: 0, cost: { white: 3 } },
  { id: "t1_04", tier: 1, bonus: "blue",  points: 0, cost: { green: 1, white: 1, black: 1, red: 1 } },
  { id: "t1_05", tier: 1, bonus: "blue",  points: 0, cost: { green: 3, blue: 1, red: 1 } },
  { id: "t1_06", tier: 1, bonus: "blue",  points: 0, cost: { white: 1, black: 2 } },
  { id: "t1_07", tier: 1, bonus: "white", points: 0, cost: { blue: 3 } },
  { id: "t1_08", tier: 1, bonus: "red",   points: 0, cost: { green: 1, white: 2, black: 2 } },
  { id: "t1_09", tier: 1, bonus: "red",   points: 0, cost: { white: 1, black: 3, red: 1 } },
  { id: "t1_10", tier: 1, bonus: "green", points: 0, cost: { blue: 1, black: 2, red: 2 } },

  { id: "t1_11", tier: 1, bonus: "red",   points: 0, cost: { green: 1, white: 2, blue: 1, black: 1 } },
  { id: "t1_12", tier: 1, bonus: "green", points: 0, cost: { blue: 2, red: 2 } },
  { id: "t1_13", tier: 1, bonus: "blue",  points: 0, cost: { green: 2, black: 2 } },
  { id: "t1_14", tier: 1, bonus: "blue",  points: 0, cost: { green: 1, white: 1, black: 1, red: 2 } },
  { id: "t1_15", tier: 1, bonus: "black", points: 0, cost: { white: 2, blue: 2, red: 1 } },
  { id: "t1_16", tier: 1, bonus: "green", points: 1, cost: { black: 4 } },
  { id: "t1_17", tier: 1, bonus: "green", points: 0, cost: { white: 1, blue: 1, black: 1, red: 1 } },
  { id: "t1_18", tier: 1, bonus: "red",   points: 0, cost: { green: 1, white: 1, blue: 1, black: 1 } },
  { id: "t1_19", tier: 1, bonus: "red",   points: 1, cost: { white: 4 } },
  { id: "t1_20", tier: 1, bonus: "red",   points: 0, cost: { white: 2, red: 2 } },

  { id: "t1_21", tier: 1, bonus: "white", points: 0, cost: { green: 2, blue: 1, black: 1, red: 1 } },
  { id: "t1_22", tier: 1, bonus: "white", points: 0, cost: { blue: 2, black: 2 } },
  { id: "t1_23", tier: 1, bonus: "white", points: 0, cost: { white: 3, blue: 1, black: 1 } },
  { id: "t1_24", tier: 1, bonus: "blue",  points: 0, cost: { green: 2, white: 1, red: 2 } },
  { id: "t1_25", tier: 1, bonus: "blue",  points: 1, cost: { red: 4 } },
  { id: "t1_26", tier: 1, bonus: "black", points: 0, cost: { green: 1, white: 1, blue: 1, red: 1 } },
  { id: "t1_27", tier: 1, bonus: "black", points: 0, cost: { green: 3 } },
  { id: "t1_28", tier: 1, bonus: "red",   points: 0, cost: { green: 1, blue: 2 } },
  { id: "t1_29", tier: 1, bonus: "white", points: 0, cost: { black: 1, red: 2 } },
  { id: "t1_30", tier: 1, bonus: "green", points: 0, cost: { white: 2, blue: 1 } },

  { id: "t1_31", tier: 1, bonus: "black", points: 0, cost: { green: 1, white: 1, blue: 2, red: 1 } },
  { id: "t1_32", tier: 1, bonus: "green", points: 0, cost: { green: 1, white: 1, blue: 3 } },
  { id: "t1_33", tier: 1, bonus: "white", points: 0, cost: { green: 2, blue: 2, black: 1 } },
  { id: "t1_34", tier: 1, bonus: "white", points: 0, cost: { green: 1, blue: 1, black: 1, red: 1 } },
  { id: "t1_35", tier: 1, bonus: "black", points: 1, cost: { blue: 4 } },
  { id: "t1_36", tier: 1, bonus: "green", points: 0, cost: { red: 3 } },
  { id: "t1_37", tier: 1, bonus: "black", points: 0, cost: { green: 2, white: 2 } },
  { id: "t1_38", tier: 1, bonus: "black", points: 0, cost: { green: 2, red: 1 } },
  { id: "t1_39", tier: 1, bonus: "black", points: 0, cost: { green: 1, black: 1, red: 3 } },
  { id: "t1_40", tier: 1, bonus: "blue",  points: 0, cost: { black: 3 } },

  /* =========================================================
     TIER 2 — 30 cards
     ========================================================= */

  { id: "t2_01", tier: 2, bonus: "red",   points: 2, cost: { black: 5 } },
  { id: "t2_02", tier: 2, bonus: "white", points: 2, cost: { black: 3, red: 5 } },
  { id: "t2_03", tier: 2, bonus: "black", points: 3, cost: { black: 6 } },
  { id: "t2_04", tier: 2, bonus: "green", points: 1, cost: { green: 2, white: 3, red: 3 } },
  { id: "t2_05", tier: 2, bonus: "red",   points: 1, cost: { white: 2, black: 3, red: 2 } },
  { id: "t2_06", tier: 2, bonus: "green", points: 2, cost: { white: 4, blue: 2, black: 1 } },
  { id: "t2_07", tier: 2, bonus: "white", points: 1, cost: { white: 2, blue: 3, red: 3 } },
  { id: "t2_08", tier: 2, bonus: "blue",  points: 1, cost: { green: 2, blue: 2, red: 3 } },
  { id: "t2_09", tier: 2, bonus: "blue",  points: 2, cost: { white: 5, blue: 3 } },
  { id: "t2_10", tier: 2, bonus: "black", points: 1, cost: { green: 2, white: 3, blue: 2 } },

  { id: "t2_11", tier: 2, bonus: "black", points: 2, cost: { white: 5 } },
  { id: "t2_12", tier: 2, bonus: "green", points: 2, cost: { green: 3, blue: 5 } },
  { id: "t2_13", tier: 2, bonus: "white", points: 1, cost: { green: 3, black: 2, red: 2 } },
  { id: "t2_14", tier: 2, bonus: "blue",  points: 2, cost: { white: 2, black: 4, red: 1 } },
  { id: "t2_15", tier: 2, bonus: "red",   points: 2, cost: { green: 2, white: 1, blue: 4 } },
  { id: "t2_16", tier: 2, bonus: "red",   points: 2, cost: { white: 3, black: 5 } },
  { id: "t2_17", tier: 2, bonus: "blue",  points: 1, cost: { green: 3, blue: 2, black: 3 } },
  { id: "t2_18", tier: 2, bonus: "white", points: 2, cost: { green: 1, black: 2, red: 4 } },
  { id: "t2_19", tier: 2, bonus: "white", points: 2, cost: { red: 5 } },
  { id: "t2_20", tier: 2, bonus: "red",   points: 1, cost: { blue: 3, black: 3, red: 2 } },

  { id: "t2_21", tier: 2, bonus: "green", points: 2, cost: { green: 5 } },
  { id: "t2_22", tier: 2, bonus: "green", points: 1, cost: { white: 2, blue: 3, black: 2 } },
  { id: "t2_23", tier: 2, bonus: "green", points: 3, cost: { green: 6 } },
  { id: "t2_24", tier: 2, bonus: "red",   points: 3, cost: { red: 6 } },
  { id: "t2_25", tier: 2, bonus: "black", points: 2, cost: { green: 5, red: 3 } },
  { id: "t2_26", tier: 2, bonus: "blue",  points: 3, cost: { blue: 6 } },
  { id: "t2_27", tier: 2, bonus: "white", points: 3, cost: { white: 6 } },
  { id: "t2_28", tier: 2, bonus: "blue",  points: 2, cost: { blue: 5 } },
  { id: "t2_29", tier: 2, bonus: "black", points: 1, cost: { green: 3, white: 3, black: 2 } },
  { id: "t2_30", tier: 2, bonus: "black", points: 2, cost: { green: 4, blue: 1, red: 2 } },

  /* =========================================================
     TIER 3 — 20 cards
     ========================================================= */

  { id: "t3_01", tier: 3, bonus: "white", points: 3, cost: { green: 3, blue: 3, black: 3, red: 5 } },
  { id: "t3_02", tier: 3, bonus: "black", points: 4, cost: { green: 3, black: 3, red: 6 } },
  { id: "t3_03", tier: 3, bonus: "blue",  points: 4, cost: { white: 7 } },
  { id: "t3_04", tier: 3, bonus: "blue",  points: 4, cost: { white: 6, blue: 3, black: 3 } },
  { id: "t3_05", tier: 3, bonus: "green", points: 4, cost: { green: 3, white: 3, blue: 6 } },
  { id: "t3_06", tier: 3, bonus: "green", points: 3, cost: { white: 5, blue: 3, black: 3, red: 3 } },
  { id: "t3_07", tier: 3, bonus: "blue",  points: 3, cost: { green: 3, white: 3, black: 5, red: 3 } },
  { id: "t3_08", tier: 3, bonus: "red",   points: 3, cost: { green: 3, white: 3, blue: 5, black: 3 } },
  { id: "t3_09", tier: 3, bonus: "blue",  points: 5, cost: { white: 7, blue: 3 } },
  { id: "t3_10", tier: 3, bonus: "white", points: 4, cost: { black: 7 } },

  { id: "t3_11", tier: 3, bonus: "red",   points: 4, cost: { green: 6, blue: 3, red: 3 } },
  { id: "t3_12", tier: 3, bonus: "black", points: 3, cost: { green: 5, white: 3, blue: 3, red: 3 } },
  { id: "t3_13", tier: 3, bonus: "black", points: 4, cost: { red: 7 } },
  { id: "t3_14", tier: 3, bonus: "white", points: 5, cost: { white: 3, black: 7 } },
  { id: "t3_15", tier: 3, bonus: "white", points: 4, cost: { white: 3, black: 6, red: 3 } },
  { id: "t3_16", tier: 3, bonus: "red",   points: 5, cost: { green: 7, red: 3 } },
  { id: "t3_17", tier: 3, bonus: "red",   points: 4, cost: { green: 7 } },
  { id: "t3_18", tier: 3, bonus: "green", points: 4, cost: { blue: 7 } },
  { id: "t3_19", tier: 3, bonus: "black", points: 5, cost: { black: 3, red: 7 } },
  { id: "t3_20", tier: 3, bonus: "green", points: 5, cost: { green: 3, blue: 7 } }
];

export const DEFS = {
  CARDS,
  NOBLES,
  TOKEN_POOL_BY_PLAYERS,
  COLORS
};
