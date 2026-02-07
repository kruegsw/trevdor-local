export function applyAction(state, action) {
  switch (action.type) {
    case "TAKE_TOKENS": {
      const picks = action.tokens; // {red:1, blue:1, green:1}

      // validate bank has enough
      for (const [color, n] of Object.entries(picks)) {
        if ((state.market.bank[color] ?? 0) < n) return state;
      }

      const player = state.players[state.activePlayerIndex];

      for (const [color, n] of Object.entries(picks)) {
        state.market.bank[color] -= n;
        player.tokens[color] = (player.tokens[color] ?? 0) + n;
      }

      state.currentPlayerIndex =
        (state.currentPlayerIndex + 1) % state.players.length;

      break;
    }

    default:
      break;
  };
  return state;
}
