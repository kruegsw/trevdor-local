// engine/rules.js
// Authoritative rules validation (server + reducer)
// Return true => action is legal, false => reject

export function rulesCheck({ state, action }) {
  if (!state || !action || !action.type) return false;

  const COLORS = ["white", "blue", "green", "red", "black"];
  const WILD = "yellow";

  const currentPlayer = state.players?.[state.activePlayerIndex];
  if (!currentPlayer) return false;

  const bank = state.market?.bank ?? {};

  // -------------------------
  // Helpers
  // -------------------------

  function countTokens(obj) {
    return Object.values(obj ?? {}).reduce((s, n) => s + (Number(n) || 0), 0);
  }

  function maxPerColor(obj) {
    return Math.max(0, ...Object.values(obj ?? {}).map(n => Number(n) || 0));
  }

  function isOnlyColors(obj, allowed) {
    for (const k of Object.keys(obj ?? {})) {
      if (!allowed.includes(k)) return false;
    }
    return true;
  }

  function bonusByColor(purchasedCards) {
    const bonus = { white:0, blue:0, green:0, red:0, black:0 };
    for (const c of purchasedCards ?? []) {
      const b = c?.bonus;
      if (bonus[b] != null) bonus[b] += 1;
    }
    return bonus;
  }

  function cardIdFromActionCard(actionCard) {
    // UI sends { meta: hit.meta, tier, index }
    // Engine state cards are { id, points, bonus, cost, tier, index, ... }
    return actionCard?.meta?.id ?? actionCard?.id ?? null;
  }

  function findMarketCardById(id) {
    for (const rowKey of ["tier1", "tier2", "tier3"]) {
      const row = state.market?.cards?.[rowKey] ?? [];
      const idx = row.findIndex(c => c?.id === id);
      if (idx !== -1) return { rowKey, idx, card: row[idx] };
    }
    return null;
  }

  function findReservedCardById(player, id) {
    const idx = (player.reserved ?? []).findIndex(c => c?.id === id);
    if (idx === -1) return null;
    return { idx, card: player.reserved[idx] };
  }

  function computePaymentOk(card, player) {
    const cost = card?.cost ?? {};
    const bonus = bonusByColor(player.cards);
    const tokens = player.tokens ?? {};

    let wildNeeded = 0;

    for (const color of COLORS) {
      const need = Math.max(0, (cost[color] ?? 0) - (bonus[color] ?? 0));
      const have = tokens[color] ?? 0;
      const use = Math.min(have, need);
      wildNeeded += (need - use);
    }

    const wildHave = tokens[WILD] ?? 0;
    return wildHave >= wildNeeded;
  }

  // -------------------------
  // Rule checks per action
  // -------------------------

  switch (action.type) {
    case "RESET_GAME":
      return true; // allow (you can tighten later: host only, etc.)

    case "END_TURN":
      return true; // placeholder for later turn logic

    case "TAKE_TOKENS": {
      const picks = action.tokens ?? {};
      if (typeof picks !== "object") return false;

      // In Splendor: you cannot TAKE yellow (gold). Gold comes from reserving.
      if (!isOnlyColors(picks, COLORS)) return false;

      const total = countTokens(picks);
      const maxOne = maxPerColor(picks);

      // must be exactly 3 different OR exactly 2 same
      const okShape =
        (total === 3 && maxOne === 1) ||
        (total === 2 && maxOne === 2);

      if (!okShape) return false;

      // bank must have enough for each requested color
      for (const [color, nRaw] of Object.entries(picks)) {
        const n = Number(nRaw) || 0;
        if (n <= 0) return false;
        if ((bank[color] ?? 0) < n) return false;
      }

      // if taking 2 same, bank must have >=4 of that color
      if (total === 2) {
        const color = Object.keys(picks)[0];
        if (!color) return false;
        if ((bank[color] ?? 0) < 4) return false;
      }

      // token hand limit (your simplified version: cannot exceed 10 after taking)
      const playerTotal = countTokens(currentPlayer.tokens);
      if (playerTotal + total > 10) return false;

      return true;
    }

    case "RESERVE_CARD": {
      const id = cardIdFromActionCard(action.card);
      if (!id) return false;

      // max 3 reserved
      const reservedCount = (currentPlayer.reserved ?? []).length;
      if (reservedCount >= 3) return false;

      // must exist in market (for now — reserving from top of deck can be added later)
      const slot = findMarketCardById(id);
      if (!slot?.card) return false;

      return true;
    }

    case "BUY_CARD": {
      const id = cardIdFromActionCard(action.card);
      if (!id) return false;

      // can buy from reserved or from market
      const fromRes = findReservedCardById(currentPlayer, id);
      const fromMkt = findMarketCardById(id);

      const card = fromRes?.card ?? fromMkt?.card;
      if (!card) return false;

      // must be affordable (incl wild)
      if (!computePaymentOk(card, currentPlayer)) return false;

      return true;
    }

    default:
      return false;
  }
}
