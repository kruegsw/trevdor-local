// engine/actions.js
// Authoritative game actions ONLY (safe for server)

export const Actions = {
  // ----- turn flow -----
  endTurn: () => ({
    type: "END_TURN"
  }),

  // ----- tokens -----
  takeTokens: (picks) => ({
    type: "TAKE_TOKENS",
    picks, // { red:1, blue:1, green:1 }
  }),

  // ----- cards -----
  buyCard: (cardId) => ({
    type: "BUY_CARD",
    cardId
  }),

  reserveCard: (cardId) => ({
    type: "RESERVE_CARD",
    cardId
  })
};
