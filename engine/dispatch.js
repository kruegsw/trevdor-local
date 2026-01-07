import { state } from "./state.js";

export function dispatch(action) {
  // optional debug
  state.log?.push({ t: Date.now(), action });

  switch (action.type) {
    case "END_TURN": {
      state.activePlayerIndex = (state.activePlayerIndex + 1) % state.players.length;
      state.turn += 1;
      state.phase = "turn";
      return;
    }

    case "UI_CLICK": {
      if (action.kind === "token") {
        // example: take token
        // mutate state here only
        // state.market.bank[action.meta.currency] -= 1;
        return;
      }

      if (action.kind === "card") {
        // example: select card / buy / reserve depending on phase
        return;
      }

      if (action.kind === "button" && action.id === "button:endTurn") {
        // advance turn
        // state.activePlayerIndex = ...
        return;
      }

        // TODO: TAKE_TOKENS, BUY_CARD, RESERVE_CARD, etc.

      return;
    }

    default:
      console.warn("Unknown action:", action);
  }
}
