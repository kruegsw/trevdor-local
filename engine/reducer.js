import { rulesCheck } from "./rules.js"

export function applyAction(state, action) {

  //////////////////////////////////////////////
  ///////////////// NEW HELPERS ////////////////
  //////////////////////////////////////////////
  const COLORS = ["white","blue","green","red","black"];
  const WILD = "yellow";

  function cardId(card) {
    return card?.id;
  }

  function cardTier(card) {
    return card?.tier ?? card?.tier;
  }

  function cardCost(card) {
    return card?.cost ?? {};
  }

  function cardBonus(card) {
    return card?.bonus;
  }

  function bonusByColor(purchasedCards) {
    const bonus = { white:0, blue:0, green:0, red:0, black:0 };
    for (const c of purchasedCards ?? []) {
      const b = cardBonus(c);
      if (bonus[b] != null) bonus[b] += 1;
    }
    return bonus;
  }

  /** Find in market by id (robust even if indices changed) */
  function findMarketSlotById(state, id) {
    for (const rowKey of ["tier1","tier2","tier3"]) {
      const row = state.market.cards[rowKey];
      const idx = row.findIndex(c => c?.id === id);
      if (idx !== -1) return { rowKey, idx };
    }
    return null;
  }

  /** Optional: verify tier/index claim */
  function findMarketSlotByTierIndex(state, tier, index) {
    const rowKey = tier === 1 ? "tier1" : tier === 2 ? "tier2" : "tier3";
    const row = state.market.cards[rowKey];
    const c = row?.[index];
    return c ? { rowKey, idx: index } : null;
  }

  function drawFromDeckIntoMarketSlot(state, rowKey, idx) {
    const deck = state.decks[rowKey];
    const next = deck.length ? deck.splice(0, 1)[0] : null; // top at index 0
    state.market.cards[rowKey][idx] = next;

    // If you rely on runtime fields for hit-testing, refresh them:
    if (next) {
      next.tier = rowKey === "tier1" ? 1 : rowKey === "tier2" ? 2 : 3;
      next.index = idx;
    }
  }

  function computePayment(card, player) {
    const cost = cardCost(card);
    const bonus = bonusByColor(player.cards);

    const pay = { white:0, blue:0, green:0, red:0, black:0, yellow:0 };
    let wildNeeded = 0;

    for (const color of COLORS) {
      const need = Math.max(0, (cost[color] ?? 0) - (bonus[color] ?? 0));
      const have = player.tokens[color] ?? 0;

      const use = Math.min(have, need);
      pay[color] = use;
      wildNeeded += (need - use);
    }

    const wildHave = player.tokens[WILD] ?? 0;
    if (wildHave < wildNeeded) return { ok: false, pay: null };

    pay[WILD] = wildNeeded;
    return { ok: true, pay };
  }
  //////////////////////////////////////////////
  //////////////////////////////////////////////
  //////////////////////////////////////////////

  function implementAction(state, action) {
    switch (action.type) {

      case "TAKE_TOKENS": {
        const picks = action.tokens ?? {};
        const player = state.players[state.activePlayerIndex];

        // validate bank has enough
        for (const [color, n] of Object.entries(picks)) {
          if ((state.market.bank[color] ?? 0) < n) return state;
        }

        // mutate
        for (const [color, n] of Object.entries(picks)) {
          state.market.bank[color] -= n;
          player.tokens[color] = (player.tokens[color] ?? 0) + n;
        }

        break;
      }

      case "RESERVE_CARD": {
        const player = state.players[state.activePlayerIndex];
        const id = cardId(action.card.meta);
        if (!id) return state;

        // max 3 reserved
        if ((player.reserved?.length ?? 0) >= 3) return state;

        // find in market (by id is safest)
        const slot = findMarketSlotById(state, id);
        if (!slot) return state;

        // move card to reserved
        const reservedCard = state.market.cards[slot.rowKey][slot.idx];
        player.reserved.push(reservedCard);

        // take gold if available
        if ((state.market.bank[WILD] ?? 0) > 0) {
          state.market.bank[WILD] -= 1;
          player.tokens[WILD] = (player.tokens[WILD] ?? 0) + 1;
        }

        // refill the market slot
        drawFromDeckIntoMarketSlot(state, slot.rowKey, slot.idx);

        break;
      }

      case "BUY_CARD": {
        const player = state.players[state.activePlayerIndex];
        const id = cardId(action.card.meta);

        if (!id) return state;

        // source: reserved first, else market
        const reservedIdx = player.reserved.findIndex(c => c?.id === id);
        const fromReserved = reservedIdx !== -1;

        let marketSlot = null;
        if (!fromReserved) {
          marketSlot = findMarketSlotById(state, id);
          if (!marketSlot) return state;
        }

        // card object we’re actually buying (from the real location)
        const buyingCard = fromReserved
          ? player.reserved[reservedIdx]
          : state.market.cards[marketSlot.rowKey][marketSlot.idx];

        // validate affordability
        const payment = computePayment(buyingCard, player);
        if (!payment.ok) return state;

        // pay tokens to bank
        for (const [color, n] of Object.entries(payment.pay)) {
          if (!n) continue;
          player.tokens[color] -= n;
          state.market.bank[color] = (state.market.bank[color] ?? 0) + n;
        }

        // gain card
        player.cards.push(buyingCard);

        // remove from source + refill if market
        if (fromReserved) {
          player.reserved.splice(reservedIdx, 1);
        } else {
          drawFromDeckIntoMarketSlot(state, marketSlot.rowKey, marketSlot.idx);
        }

        break;
      }

      default:
        break;
    }

    return state;
  }


  function endTurn() {
    state.currentPlayerIndex =
        (state.currentPlayerIndex + 1) % state.players.length;
  }
  
  /*
  function implementAction(action) {
    switch (action.type) {
      case "TAKE_TOKENS":
        
        const picks = action.tokens;

        for (const [color, n] of Object.entries(picks)) {
          if ((state.market.bank[color] ?? 0) < n) return state;
        }

        const player = state.players[state.activePlayerIndex];

        for (const [color, n] of Object.entries(picks)) {
          state.market.bank[color] -= n;
          player.tokens[color] = (player.tokens[color] ?? 0) + n;
        }

        break;

      case "BUY_CARD":

        const card = action.card;


        
        break;

      case "RESERVE_CARD":
        
        break;
    
      default:
        break;
    }
  }

  */

  if ( rulesCheck({state, action}) ) {
    implementAction(state, action);
    //endTurn();
  } else {}

  /*
  switch (action.type) {
    case "TAKE_TOKENS": {

      if ( rulesCheck({state, action}) ) {
        implementAction(action);
        endTurn();
      }

      break;
    }

    case "BUY_CARD": {

      if ( rulesCheck({state, action}) ) {
        implement_BUY_CARD(action);
        endTurn();
      }

      break;
    }

    case "RESERVE_CARD": {

      if ( rulesCheck({state, action}) ) {
        implement_RESERVE_CARD(action);
        endTurn();
      }

      break;
    }

    default:
      break;
  };
  */

  return state;
}

/////////////// NEED TO INCORPORATE RULES ON SERVER SIDE IN THE FUTURE, RIGHT NOW IMPLEMENTED ON CLIENT SIDE ONLY
