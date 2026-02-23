import { rulesCheck } from "./rules.js";

/**
 * applyAction(prev, action)
 * ------------------------
 * Authoritative reducer:
 * - Validates action (rulesCheck) against prev (no mutation)
 * - structuredClone(prev) to avoid mutating the authoritative state reference
 * - Applies the action
 * - Runs end-of-turn side effects (noble claim, turn advance)
 * - Returns NEW state reference if valid; otherwise returns prev
 */
export function applyAction(prev, action) {
  // 1) Reject early (keep prev reference to signal "no-op / invalid")
  if (!rulesCheck({ state: prev, action })) return prev;

  // 2) Work on a clone so we never mutate authoritative state
  const state = structuredClone(prev);

  const COLORS = ["white", "blue", "green", "red", "black"];
  const WILD = "yellow";

  function cardId(card) {
    return card?.id;
  }
  function cardCost(card) {
    return card?.cost ?? {};
  }
  function cardBonus(card) {
    return card?.bonus;
  }

  function bonusByColor(purchasedCards) {
    const bonus = { white: 0, blue: 0, green: 0, red: 0, black: 0 };
    for (const c of purchasedCards ?? []) {
      const b = cardBonus(c);
      if (bonus[b] != null) bonus[b] += 1;
    }
    return bonus;
  }

  // Finds a card in the market rows by id, returns which row + index.
  function findMarketSlotById(state, id) {
    for (const rowKey of ["tier1", "tier2", "tier3"]) {
      const row = state.market.cards[rowKey];
      const idx = row.findIndex((c) => c?.id === id);
      if (idx !== -1) return { rowKey, idx };
    }
    return null;
  }

  // Pulls from the deck into a specific market slot to refill the row.
  function drawFromDeckIntoMarketSlot(state, rowKey, idx) {
    const deck = state.decks[rowKey];
    const nextCard = deck.length ? deck.splice(0, 1)[0] : null; // top at index 0
    state.market.cards[rowKey][idx] = nextCard;

    // Optional metadata for UI convenience
    if (nextCard) {
      nextCard.tier = rowKey === "tier1" ? 1 : rowKey === "tier2" ? 2 : 3;
      nextCard.index = idx;
    }
  }

  /**
   * computePayment(card, player)
   * ----------------------------
   * Computes how many tokens of each color the player will pay,
   * using discounts from purchased cards as bonuses and using gold (yellow) as wilds.
   */
  function computePayment(card, player) {
    const cost = cardCost(card);
    const bonus = bonusByColor(player.cards);

    const tokens = player.tokens ?? (player.tokens = {});
    const pay = { white: 0, blue: 0, green: 0, red: 0, black: 0, yellow: 0 };

    let wildNeeded = 0;

    for (const color of COLORS) {
      const need = Math.max(0, (cost[color] ?? 0) - (bonus[color] ?? 0));
      const have = tokens[color] ?? 0;

      const use = Math.min(have, need);
      pay[color] = use;
      wildNeeded += need - use;
    }

    const wildHave = tokens[WILD] ?? 0;
    if (wildHave < wildNeeded) return { ok: false, pay: null };

    pay[WILD] = wildNeeded;
    return { ok: true, pay };
  }

  // --- Nobles

  function nobleCost(noble) {
    // support either {req:{...}} or {meta:{req:{...}}}
    return noble?.req ?? noble?.meta?.req ?? {};
  }

  function canClaimNoble(player, noble) {
    const need = nobleCost(noble);
    const bonus = bonusByColor(player.cards);

    for (const color of COLORS) {
      if ((bonus[color] ?? 0) < (need[color] ?? 0)) return false;
    }
    return true;
  }

  /**
   * claimOneEligibleNoble(state, player)
   * -----------------------------------
   * Splendor rule: at most 1 noble is claimed at end of your turn, if eligible.
   * Deterministic selection so all servers/clients agree:
   * - pick lowest id (fallback left-to-right if ids missing)
   */
  function claimOneEligibleNoble(state, player) {
    const nobles = state.market?.nobles ?? [];
    if (!nobles.length) return false;

    const eligible = [];
    for (let i = 0; i < nobles.length; i++) {
      const n = nobles[i];
      if (n && canClaimNoble(player, n)) eligible.push({ i, n });
    }
    if (!eligible.length) return false;

    eligible.sort((a, b) =>
      String(a.n?.id ?? "").localeCompare(String(b.n?.id ?? ""))
    );

    const pick = eligible[0];
    const claimed = nobles.splice(pick.i, 1)[0];

    player.nobles ??= [];
    player.nobles.push(claimed);

    return true;
  }

  // --- Turn advance

  /**
   * advanceTurn(state)
   * ------------------
   * For now: rotate through all players in state.players (usually 4).
   * Later (true multiplayer seats): you can store seat occupancy in state
   * and skip empty seats here.
   */
  function advanceTurn(state) {
    const n = state.players?.length ?? 0;
    if (n <= 0) return;

    const cur = state.activePlayerIndex ?? 0;
    state.activePlayerIndex = (cur + 1) % n;

    // Optional: increment turn counter when wrap-around happens
    if (state.activePlayerIndex === 0) {
      state.turn = (state.turn ?? 1) + 1;
    }
  }

  // --- Main action implementation

  function implementAction(state, action) {
    switch (action.type) {
      case "TAKE_TOKENS": {
        const picks = action.tokens ?? {};
        const player = state.players[state.activePlayerIndex];
        player.tokens ??= {};

        // Safety check (should be redundant with rulesCheck)
        for (const [color, n] of Object.entries(picks)) {
          if ((state.market.bank[color] ?? 0) < n) return false;
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

        // Move card to reserved
        player.reserved.push(reservedCard);

        // Take 1 gold if available
        if ((state.market.bank[WILD] ?? 0) > 0) {
          state.market.bank[WILD] -= 1;
          player.tokens[WILD] = (player.tokens[WILD] ?? 0) + 1;
        }

        // Refill market
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

        const reservedIdx = player.reserved.findIndex((c) => c?.id === id);
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

        // Pay tokens back to bank
        for (const [color, n] of Object.entries(payment.pay)) {
          if (!n) continue;
          player.tokens[color] -= n;
          state.market.bank[color] = (state.market.bank[color] ?? 0) + n;
        }

        // Gain card
        player.cards.push(buyingCard);

        // Remove from source + refill if needed
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

  // Game is over — reject all further actions
  if (state.gameOver) return prev;

  // Apply action
  const changed = implementAction(state, action);

  // Invalid => preserve reducer contract: return prev reference
  if (!changed) return prev;

  // End-of-turn effects for "commit" actions
  const endsTurn =
    action.type === "TAKE_TOKENS" ||
    action.type === "RESERVE_CARD" ||
    action.type === "BUY_CARD";

  if (endsTurn) {
    // 1) Claim at most one noble
    const player = state.players[state.activePlayerIndex];
    claimOneEligibleNoble(state, player);

    // 2) Check if this player triggered the final round (>= 15 prestige)
    if (!state.finalRound && playerPrestige(player) >= 15) {
      state.finalRound = true;
    }

    // 3) Advance to next player's turn
    advanceTurn(state);

    // 4) If final round and we've wrapped back to player 0, the game is over
    if (state.finalRound && state.activePlayerIndex === 0) {
      state.gameOver = true;
      state.winner = determineWinner(state.players);
    }
  }

  return state;
}

function playerPrestige(player) {
  const fromCards  = (player.cards  ?? []).reduce((sum, c) => sum + (c.points ?? 0), 0);
  const fromNobles = (player.nobles ?? []).reduce((sum, n) => sum + (n.points ?? 0), 0);
  return fromCards + fromNobles;
}

function determineWinner(players) {
  let best = -1;
  let bestIdx = 0;
  let bestCards = Infinity;

  for (let i = 0; i < players.length; i++) {
    const p = playerPrestige(players[i]);
    const cards = (players[i].cards ?? []).length;
    if (p > best || (p === best && cards < bestCards)) {
      best = p;
      bestIdx = i;
      bestCards = cards;
    }
  }
  return bestIdx;
}
