// ui/controller.js
import { Actions } from "../engine/actions.js";
import { applyAction } from "../engine/reducer.js";

/**
 * UI Controller:
 * - Receives UI events (hover/click)
 * - Updates uiState (hover, pending picks, etc.)
 * - Optionally commits game actions to state (confirm button)
 *
 * main.js stays as "wiring only".
 */
export function createUIController({ getState, uiState, requestDraw }) {
  if (!getState) throw new Error("createUIController: getState is required");
  if (!uiState) throw new Error("createUIController: uiState is required");
  if (!requestDraw) throw new Error("createUIController: requestDraw is required");

  // Ensure pendingPicks exists (UI-only)
  uiState.pendingPicks ??= {};

  function clearPendingPicks() {
    uiState.pendingPicks = {};
  }

  function totalPicks() {
    return Object.values(uiState.pendingPicks).reduce((s, n) => s + n, 0);
  }

  // Simple toggle: 0 -> 1 -> 0
  function togglePick(color) {
    const picks = uiState.pendingPicks;
    if (picks[color]) delete picks[color];
    else picks[color] = 1;
  }

  function handleClick(hit) {
    // 1) Clicked empty space => clear UI selection
    if (!hit) {
      clearPendingPicks();
      requestDraw();
      return;
    }

    // 2) Token pile => toggle UI-only picks (limit total to 3)
    if (hit.kind === "token") {
      togglePick(hit.color);

      if (totalPicks() > 3) {
        // undo (simple constraint)
        togglePick(hit.color);
      }

      requestDraw();
      return;
    }

    // 3) Confirm => commit picks to game state (real action)
    if (hit.kind === "button" && hit.id === "confirm") {
      if (totalPicks() > 0) {
        const action = Actions.takeTokens(uiState.pendingPicks);

        // reducer mutates state in place
        applyAction(getState(), action);

        clearPendingPicks();
      }

      requestDraw();
      return;
    }

    // 4) Cancel => clear UI-only picks
    if (hit.kind === "button" && hit.id === "cancel") {
      clearPendingPicks();
      requestDraw();
      return;
    }

    // 5) Later: cards, nobles, reserve, buy, etc.
    console.log("Clicked:", hit);
    requestDraw();
  }

  return {
    /**
     * Plug this into ui/events.js onAction
     */
    onUIAction(uiAction) {
      switch (uiAction.type) {
        case "click": {
          handleClick(uiAction.hit);
          break;
        }

        case "hover": {
          // Hover state is already updated in ui/events.js
          // You might later add tooltips, previews, etc.
          // For now, nothing to do.
          break;
        }

        case "pointer_down": {
          // Reserved for future drag / long-press behavior
          break;
        }

        case "pointer_up": {
          // Reserved for future drag end behavior
          break;
        }

        case "cancel": {
          // Pointer canceled (e.g. lost capture)
          // Safe default: clear UI-only transient state
          uiState.pendingPicks = {};
          break;
        }

        default: {
          console.warn("Unhandled UI action:", uiAction);
        }
      }
    },

    /**
     * Plug this into ui/events.js onUIChange
     * For now: just redraw on hover change / pointer changes
     */
    onUIChange() {
      requestDraw();
    },

    // Optional helpers if you want them elsewhere
    clearPendingPicks,
    totalPicks,
  };
}
