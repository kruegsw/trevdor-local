import { DEFS } from "./defs.js";
import { rules } from "./rules.js";

const initialState = (numbersOfPlayers) => {
  const state = {
    players: [],

    decks: {
      tier1: [],
      tier2: [],
      tier3: [],
      nobles: [],
    },

    market: {
      cards: {
        tier1: [],
        tier2: [],
        tier3: [],
      },
      nobles: [],
      bank: [],
    },
    // turn control
    turn: 1,
    activePlayerIndex: 0,
    phase: "turn", // or "selectTokens", "buy", etc.
    log: [], // optional: helps debugging
  };

  state.players = createPlayers(numbersOfPlayers);
  state.decks.tier1 = shuffle(filterTier(DEFS.CARDS, 1));
  state.decks.tier2 = shuffle(filterTier(DEFS.CARDS, 2));
  state.decks.tier3 = shuffle(filterTier(DEFS.CARDS, 3));
  state.decks.nobles = shuffle([...DEFS.NOBLES]);
  state.market.cards.tier1 = deal(state.decks.tier1, 4);
  state.market.cards.tier2 = deal(state.decks.tier2, 4);
  state.market.cards.tier3 = deal(state.decks.tier3, 4);
  state.market.nobles = deal(state.decks.nobles, DEFS.NUMBER_NOBLES_BY_PLAYERS[numbersOfPlayers]);
  state.market.bank = structuredClone(DEFS.TOKEN_POOL_BY_PLAYERS[numbersOfPlayers]);
  
  return state;
};

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

function filterTier (deck, tier) {
  let filteredDeck =  deck.filter( card => card.tier == tier );
  return filteredDeck;
};

function createPlayer (index) {
  const player = {
    id: `p${index + 1}`,
    name: `Player ${index + 1}`,
    cards: [],
    reserved: [],
    nobles: [],
    tokens: { white: 0, blue: 0, green: 0, red: 0, black: 0, yellow: 0 },
  };
  return player;
    // bonus will be calculated
    // victory points will be calculated
}

function createPlayers (numbersOfPlayers) {
    const players = [];
    for (let i = 0; i < numbersOfPlayers; i++) {
      players.push(createPlayer(i+1));
    }
    return players
}

export { initialState };
