// ui/controller.js
import { handleClick } from "./handlers/handleClick.js";
import { handleHover } from "./handlers/handleHover.js";
import { Intent } from "./intent.js";
import { rulesCheck } from "./rules.js";
import { DEBUG } from "../debug.js";

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

        // If we don't have state yet, ignore
        if (!state) return;

        // TURN GATING:
        // Only allow click-driven game actions if it's my turn.
        // Hover is always allowed (UI-only).
        const my = uiState.myPlayerIndex;
        const active = state.activePlayerIndex;

        const isMyTurn = (typeof my === "number") && (my === active);

        if (uiAction.type === "click") {
          // Game over — block all clicks (hover still works)
          if (state.gameOver) return;
          // If we're a spectator or it's not our turn, ignore clicks that could mutate intent
          if (!isMyTurn) return;
        }

      switch (uiAction.type) {
        case "click": {
          // UI-only mutations
          let actionRequested = handleClick({rulesCheck, getState, uiState, hit: uiAction.hit});

          // Confirm
          if (actionRequested) {
            const gameAction = Intent.buildCommitAction(state, uiState);
            if (gameAction) {
              if (DEBUG) console.log(gameAction);
              dispatchGameAction(gameAction);
              Intent.clear(uiState);
            }
          }

          break;
        }

        case "hover": {
          if (DEBUG) console.log("hover");
          handleHover({getState, uiState, hit: uiAction.hit});
          break;
        }

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
