const initialState = () => ({
  players: [
    // example player shape:
    // {
    //   id: "p1",
    //   name: "Player 1",
    //   tokens: { black:0, blue:0, green:0, red:0, white:0, yellow:0 },
    //   bonuses: { black:0, blue:0, green:0, red:0, white:0 },
    //   reserved: [],   // cardIds
    //   purchased: [],  // cardIds
    //   score: 0
    // }
  ],

  market: {
    cards: {
      tier1: [], // cardIds visible in row
      tier2: [],
      tier3: [],
    },
    nobles: [], // nobleIds visible
    bank: { black: 0, blue: 0, green: 0, red: 0, white: 0, yellow: 0 },
  },

  // decks / supply (so refills are easy)
  decks: {
    tier1: [], // draw pile of cardIds
    tier2: [],
    tier3: [],
    nobles: [],
  },

  // turn control
  turn: 1,
  activePlayerIndex: 0,
  phase: "turn", // or "selectTokens", "buy", etc.

  // optional: helps debugging
  log: [],
});

const state = initialState();

export { state, initialState };
