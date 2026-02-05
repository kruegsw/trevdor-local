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
      bank: {},
    },
    // turn control
    turn: 1,
    activePlayerIndex: 0,
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

function createPlayer (number) {
  const player = {
    id: `p${number}`,
    name: `Player ${number}`,
    cards: [{ id: "t2_17", tier: 2, bonus: "blue",  points: 1, cost: { green: 3, blue: 2, black: 3 } },
      { id: "t2_17", tier: 2, bonus: "blue",  points: 1, cost: { green: 3, blue: 2, black: 3 } },
      { id: "t1_35", tier: 1, bonus: "black", points: 1, cost: { blue: 4 } },
      { id: "t1_36", tier: 1, bonus: "green", points: 0, cost: { red: 3 } },
      { id: "t1_37", tier: 1, bonus: "black", points: 0, cost: { green: 2, white: 2 } },
      { id: "t1_38", tier: 1, bonus: "black", points: 0, cost: { green: 2, red: 1 } },
      { id: "t1_39", tier: 1, bonus: "black", points: 0, cost: { green: 1, black: 1, red: 3 } },
      { id: "t1_40", tier: 1, bonus: "blue",  points: 0, cost: { black: 3 } },
      { id: "t1_34", tier: 1, bonus: "white", points: 0, cost: { green: 1, blue: 1, black: 1, red: 1 } }
    ],
    reserved: [
      { id: "t2_17", tier: 2, bonus: "blue",  points: 1, cost: { green: 3, blue: 2, black: 3 } },
      { id: "t1_39", tier: 1, bonus: "black", points: 0, cost: { green: 1, black: 1, red: 3 } },
    ],
    nobles: [],
    tokens: { white: 1, blue: 3, green: 0, red: 0, black: 0, yellow: 0 },
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
