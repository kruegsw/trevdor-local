// ui/controller.js
import { handleClick } from "./handlers/handleClick.js";
import { Intent } from "./intent.js";
import { rulesCheck } from "./rules.js"

/**
 * UI Controller
 * -------------
 * - Receives UI events
 * - Lets handleClick mutate uiState
 * - Uses Intent to decide when a real game action exists
 * - Dispatches that action (local now, server later)
 */
export function createUIController({ getState, uiState, requestDraw, dispatchGameAction }) {
  if (!getState) throw new Error("createUIController: getState is required");
  if (!uiState) throw new Error("createUIController: uiState is required");
  if (!requestDraw) throw new Error("createUIController: requestDraw is required");

  // Initialize UI intent state
  Intent.ensure(uiState);
  
  return {
    onUIAction(uiAction) {
      const state = getState();

      switch (uiAction.type) {
        case "click": {
          // UI-only mutations
          let actionRequested = handleClick({rulesCheck, getState, uiState, hit: uiAction.hit});

          // Confirm
          if (actionRequested) {
            const gameAction = Intent.buildCommitAction(state, uiState);
            if (gameAction) {
              dispatchGameAction(gameAction);
              Intent.clear(uiState);
            }
          }

          break;
        }

        case "hover":
          // hover already handled by events.js
          break;

        case "cancel":
          Intent.clear(uiState);
          break;

        case "pointer_down":
          break;

        case "pointer_up":
          break;

        default: {
          console.warn("Unhandled UI action:", uiAction);
        }
      }

      requestDraw();
    },

    onUIChange() {
      requestDraw();
    }
  };
}
