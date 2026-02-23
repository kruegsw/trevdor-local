// engine/actions.js
// Authoritative game actions ONLY (safe for server)

export const Actions = {
  // ----- turn flow -----
  endTurn: () => ({
    type: "END_TURN"
  }),

  // ----- tokens -----
  takeTokens: (tokens) => ({
    type: "TAKE_TOKENS",
    tokens, // { red:1, blue:1, green:1 }
  }),

  // ----- cards -----
  buyCard: (card) => ({
    type: "BUY_CARD",
    card
  }),

  reserveCard: (card) => ({
    type: "RESERVE_CARD",
    card
  }),


};
