// ui/intent.js
import { Actions } from "../../engine/actions.js";

/**
 * Intent module
 * -------------
 * Owns all logic for:
 * - initializing UI intent state
 * - determining when a move is commit-ready
 * - building a single authoritative game action
 *
 * This module knows NOTHING about rendering or DOM events.
 */
export const Intent = {
  ensure(uiState) {  // one-time initialization of UI state without overwriting anything the UI already set
    uiState.mode ??= "idle"; // idle | takeTokens | reserveCard | buyCard
    uiState.pending ??= { tokens: {}, card: "" };
    uiState.pending.tokens ??= {};
    uiState.pending.card ??= "";
  },

  clear(uiState) {
    this.ensure(uiState);
    uiState.pending.tokens = {};
    uiState.pending.card = "";
    uiState.mode = "idle";
  },

  totalTokens(uiState) {
    this.ensure(uiState);
    return Object.values(uiState.pending.tokens).reduce((s, n) => s + n, 0);
  },

  maxPerColor(uiState) {
    this.ensure(uiState);
    return Object.values(uiState.pending.tokens).reduce(
      (m, n) => Math.max(m, n),
      0
    );
  },

  isCommitReady(state, uiState) {
    this.ensure(uiState);

    const t = uiState.pending.tokens;
    const total = this.totalTokens(uiState);
    const maxOne = this.maxPerColor(uiState);
    const hasCard = !!uiState.pending.card;

    switch (uiState.mode) {
      case "takeTokens":
        // 3 different OR 2 same
        return (
          (total === 3 && maxOne === 1) ||
          (total === 2 && maxOne === 2)
        );

      case "reserveCard":
        return (t.yellow ?? 0) === 1 && hasCard;

      case "buyCard":
        return hasCard;

      default:
        return false;
    }
  },

  buildCommitAction(state, uiState) {
    if (!this.isCommitReady(state, uiState)) return null;

    console.log("uiState.mode = " + uiState.mode)

    switch (uiState.mode) {
      case "takeTokens":
        console.log({ ...uiState.pending.tokens });  // {red: 2}
        return Actions.takeTokens({ ...uiState.pending.tokens });

      case "reserveCard":
        // if card is an object, switch to uiState.pending.card.id
        return Actions.reserveCard(uiState.pending.card);

      case "buyCard":
        return Actions.buyCard(uiState.pending.card);

      default:
        return null;
    }
  }
};
