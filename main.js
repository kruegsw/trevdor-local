/*
  trevdor.js
  -----------
  Main entry point for the game.
*/

import { render } from "./ui/render.js";
import { initialState } from "./engine/state.js";
import { createUIEvents } from "./ui/events.js";
import { Actions } from "./engine/actions.js";
import { applyAction } from "./engine/reducer.js";

const numbersOfPlayers = 3;
let state = initialState(numbersOfPlayers);
console.log(state);

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
// ctx.imageSmoothingEnabled = false; // for pixel art, otherwise scaled sprites will blur

const renderer = render(ctx);

const ui = createUIEvents({
  canvas,
  renderer,
  enableHover: true,
  requireSameTargetForClick: false, // forgiving

  onAction(uiAction) {
    if (uiAction.type !== "click") return;

    // ---------------------------
    // UI-only pending token picks
    // (NOT part of game state; do not send to reducer/server)
    // ---------------------------
    ui.uiState.pendingPicks ??= {}; // ensure it exists

    const hit = uiAction.hit;

    const clearPendingPicks = () => {
      ui.uiState.pendingPicks = {};
    };

    const totalPicks = () =>
      Object.values(ui.uiState.pendingPicks).reduce((s, n) => s + n, 0);

    // Simple toggle: 0 -> 1 -> 0
    const togglePick = (color) => {
      const picks = ui.uiState.pendingPicks;
      if (picks[color]) delete picks[color];
      else picks[color] = 1;
    };

    // 1) Clicked empty space: clear pending picks
    if (!hit) {
      clearPendingPicks();
      renderer.draw(state, ui.uiState);
      return;
    }

    // 2) Clicked a token pile: update pending picks (UI-only)
    if (hit.kind === "token") {
      togglePick(hit.color);

      // Optional: limit to max 3 total pending picks
      if (totalPicks() > 3) {
        // undo
        togglePick(hit.color);
      }

      console.log("Clicked: token", hit);
      renderer.draw(state, ui.uiState);
      return;
    }

    // 3) Clicked confirm: commit the move to game state (server-safe action)
    if (hit.kind === "button" && hit.id === "confirm") {
      if (totalPicks() > 0) {
        const action = Actions.takeTokens(ui.uiState.pendingPicks);

        // Your reducer currently mutates `state` in-place
        applyAction(state, action);

        clearPendingPicks();
      }

      renderer.draw(state, ui.uiState);
      return;
    }

    // 4) Clicked cancel: clear pending picks (UI-only)
    if (hit.kind === "button" && hit.id === "cancel") {
      clearPendingPicks();
      renderer.draw(state, ui.uiState);
      return;
    }

    // 5) Other clicks (cards, nobles, etc. later)
    console.log("Clicked:", hit);
    renderer.draw(state, ui.uiState);
  },

  onUIChange() {
    // hover highlight redraw
    renderer.draw(state, ui.uiState);
  }
});

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);

  const sx = canvas.width / rect.width;
  const sy = canvas.height / rect.height;

  ctx.setTransform(sx, 0, 0, sy, 0, 0);

  renderer.resize({ width: rect.width, height: rect.height }, state);
  renderer.draw(state, ui.uiState);
}

// (You can delete resizeCanvas() if unused; keeping as-is)
function resizeCanvas() {
  const displayWidth = canvas.clientWidth;
  const displayHeight = canvas.clientHeight;

  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    canvas.width = displayWidth;
    canvas.height = displayHeight;
  }
}

// You can delete translateClickToGameAction() now (not used)

window.addEventListener("load", resize);
window.addEventListener("resize", resize);
