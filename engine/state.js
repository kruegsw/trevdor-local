import { DEFS } from "./defs.js";
import { rules } from "./rules.js";

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

  // decks / supply (so refills are easy)
  decks: {
    tier1: shuffle(filterTier(DEFS.CARDS, 1)), // draw pile of cardIds
    tier2: shuffle(filterTier(DEFS.CARDS, 2)),
    tier3: shuffle(filterTier(DEFS.CARDS, 3)),
    nobles: shuffle(DEFS.NOBLES),
  },

  market: {
    cards: {
      tier1: [], // cardIds visible in row
      tier2: [],
      tier3: [],
    },
    nobles: [], // nobleIds visible
    bank: DEFS.TOKEN_POOL_BY_PLAYERS[2],
  },

  // turn control
  turn: 1,
  activePlayerIndex: 0,
  phase: "turn", // or "selectTokens", "buy", etc.

  // optional: helps debugging
  log: [],
});

function shuffle (arr) {
  let a = arr.slice();
  for ( let i = a.length - 1; i > 0; i-- ) {
    let j = Math.floor( Math.random() * (i + 1) );
    [ a[i], a[j] ] = [ a[j], a[i] ];
  }
  return a
};

function deal (deck, n) {
  return deck.splice(0, n);
};

function filterTier(deck, tier) {
  let filteredDeck =  deck.filter( card => card.tier == tier );
  return filteredDeck;
};

function create_player () {
  const player = {
    id: state.players.length +1,
    cards: [],
    reserved: [],
    nobles: [],
    tokens: {
      white: 0,
      blue: 0,
      green: 0,
      red: 0,
      black: 0,
      yellow: 0,
    }
  };
    // bonus will be calculated
    // victory points will be calculated
}

const state = initialState();

export { state, initialState };
