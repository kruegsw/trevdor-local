// ui/controller.js
import { Actions } from "../engine/actions.js";
import { handleClick } from "./handlers/handleClick.js"

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
  uiState.pendingAction ??= "";

  return {
    /**
     * Plug this into ui/events.js onAction
     */
    onUIAction(uiAction) {
      switch (uiAction.type) {
        case "click": {
          handleClick(getState, uiState, uiAction.hit);
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
      };
      requestDraw();
    },

    /**
     * Plug this into ui/events.js onUIChange
     * For now: just redraw on hover change / pointer changes
     */
    onUIChange() {
      requestDraw();
    },

    // Optional helpers if you want them elsewhere
    //clearPendingPicks,
    //totalPicks,
  };
}
