import { rulesCheck } from "./rules.js";

export function applyAction(prev, action) {
  // 1) Reject early (keep prev reference)
  if (!rulesCheck({ state: prev, action })) return prev;

  // 2) Work on a clone so we never mutate authoritative state
  const state = structuredClone(prev);

  const COLORS = ["white","blue","green","red","black"];
  const WILD = "yellow";

  function cardId(card) { return card?.id; }
  function cardCost(card) { return card?.cost ?? {}; }
  function cardBonus(card) { return card?.bonus; }

  function bonusByColor(purchasedCards) {
    const bonus = { white:0, blue:0, green:0, red:0, black:0 };
    for (const c of purchasedCards ?? []) {
      const b = cardBonus(c);
      if (bonus[b] != null) bonus[b] += 1;
    }
    return bonus;
  }

  function findMarketSlotById(state, id) {
    for (const rowKey of ["tier1","tier2","tier3"]) {
      const row = state.market.cards[rowKey];
      const idx = row.findIndex(c => c?.id === id);
      if (idx !== -1) return { rowKey, idx };
    }
    return null;
  }

  function drawFromDeckIntoMarketSlot(state, rowKey, idx) {
    const deck = state.decks[rowKey];
    const nextCard = deck.length ? deck.splice(0, 1)[0] : null; // top at index 0
    state.market.cards[rowKey][idx] = nextCard;

    if (nextCard) {
      nextCard.tier = rowKey === "tier1" ? 1 : rowKey === "tier2" ? 2 : 3;
      nextCard.index = idx;
    }
  }

  function computePayment(card, player) {
    const cost = cardCost(card);
    const bonus = bonusByColor(player.cards);

    const tokens = player.tokens ?? (player.tokens = {});
    const pay = { white:0, blue:0, green:0, red:0, black:0, yellow:0 };

    let wildNeeded = 0;

    for (const color of COLORS) {
      const need = Math.max(0, (cost[color] ?? 0) - (bonus[color] ?? 0));
      const have = tokens[color] ?? 0;

      const use = Math.min(have, need);
      pay[color] = use;
      wildNeeded += (need - use);
    }

    const wildHave = tokens[WILD] ?? 0;
    if (wildHave < wildNeeded) return { ok: false, pay: null };

    pay[WILD] = wildNeeded;
    return { ok: true, pay };
  }

  function nobleCost(noble) {
    // support either {cost:{...}} or {meta:{cost:{...}}}
    return noble?.cost ?? noble?.meta?.cost ?? {};
  }

  function canClaimNoble(player, noble) {
    const need = nobleCost(noble);
    const bonus = bonusByColor(player.cards);

    for (const color of ["white","blue","green","red","black"]) {
      if ((bonus[color] ?? 0) < (need[color] ?? 0)) return false;
    }
    return true;
  }

  function claimOneEligibleNoble(state, player) {
    // Market nobles live here (based on your state shape earlier)
    const nobles = state.market?.nobles ?? [];
    if (!nobles.length) return false;

    // Find all eligible
    const eligible = [];
    for (let i = 0; i < nobles.length; i++) {
      const n = nobles[i];
      if (n && canClaimNoble(player, n)) eligible.push({ i, n });
    }
    if (!eligible.length) return false;

    // Deterministic pick: lowest id (or fallback to left-to-right)
    eligible.sort((a, b) => String(a.n?.id ?? "").localeCompare(String(b.n?.id ?? "")));

    const pick = eligible[0];
    const claimed = nobles.splice(pick.i, 1)[0];

    player.nobles ??= [];
    player.nobles.push(claimed);

    return true;
  }

  function implementAction(state, action) {
    switch (action.type) {
      case "TAKE_TOKENS": {
        const picks = action.tokens ?? {};
        const player = state.players[state.activePlayerIndex];
        player.tokens ??= {};

        for (const [color, n] of Object.entries(picks)) {
          if ((state.market.bank[color] ?? 0) < n) return false; // shouldn't happen if rulesCheck is good
        }

        for (const [color, n] of Object.entries(picks)) {
          state.market.bank[color] -= n;
          player.tokens[color] = (player.tokens[color] ?? 0) + n;
        }
        return true;
      }

      case "RESERVE_CARD": {
        const player = state.players[state.activePlayerIndex];
        player.tokens ??= {};
        player.reserved ??= [];

        const id = cardId(action.card?.meta);
        if (!id) return false;

        if (player.reserved.length >= 3) return false;

        const slot = findMarketSlotById(state, id);
        if (!slot) return false;

        const reservedCard = state.market.cards[slot.rowKey][slot.idx];
        if (!reservedCard) return false;

        player.reserved.push(reservedCard);

        if ((state.market.bank[WILD] ?? 0) > 0) {
          state.market.bank[WILD] -= 1;
          player.tokens[WILD] = (player.tokens[WILD] ?? 0) + 1;
        }

        drawFromDeckIntoMarketSlot(state, slot.rowKey, slot.idx);
        return true;
      }

      case "BUY_CARD": {
        const player = state.players[state.activePlayerIndex];
        player.tokens ??= {};
        player.reserved ??= [];
        player.cards ??= [];

        const id = cardId(action.card?.meta);
        if (!id) return false;

        const reservedIdx = player.reserved.findIndex(c => c?.id === id);
        const fromReserved = reservedIdx !== -1;

        let marketSlot = null;
        if (!fromReserved) {
          marketSlot = findMarketSlotById(state, id);
          if (!marketSlot) return false;
        }

        const buyingCard = fromReserved
          ? player.reserved[reservedIdx]
          : state.market.cards[marketSlot.rowKey][marketSlot.idx];

        if (!buyingCard) return false;

        const payment = computePayment(buyingCard, player);
        if (!payment.ok) return false;

        for (const [color, n] of Object.entries(payment.pay)) {
          if (!n) continue;
          player.tokens[color] -= n;
          state.market.bank[color] = (state.market.bank[color] ?? 0) + n;
        }

        player.cards.push(buyingCard);

        if (fromReserved) {
          player.reserved.splice(reservedIdx, 1);
        } else {
          drawFromDeckIntoMarketSlot(state, marketSlot.rowKey, marketSlot.idx);
        }

        return true;
      }

      default:
        return false;
    }
  }

  const changed = implementAction(state, action);

  // If something went sideways, preserve reducer contract: invalid => prev
  if (!changed) return prev;

    // End-of-turn noble claim (Splendor-style: at most 1 noble per turn)
  const endsTurn = (action.type === "TAKE_TOKENS" ||
    action.type === "RESERVE_CARD" ||
    action.type === "BUY_CARD"
  );

  if (endsTurn) {
    const player = state.players[state.activePlayerIndex];
    claimOneEligibleNoble(state, player);
  };

  return state;
}
