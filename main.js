/*
  trevdor.js
  -----------
  Main entry point for the game.

  - Runs in ES module mode (strict by default)
  - No globals leaked to window
  - Safe to split into multiple modules later
*/

import { render } from "./ui/render.js";
import { initialState } from "./engine/state.js";
import { createUIEvents } from "./ui/events.js";

const numbersOfPlayers = 2;
let state = initialState(numbersOfPlayers);
console.log(state);

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d")
//ctx.imageSmoothingEnabled = false; // for pixel art, otherwise scaled sprites will blur

const renderer = render(ctx);

const ui = createUIEvents({
  canvas,
  renderer,
  enableHover: true,
  requireSameTargetForClick: false, // forgiving

  onAction(action) {

    // So onAction should typically do:
    // map the click hit → a domain action (BUY_CARD / TAKE_TOKENS / SELECT_CARD, etc.)
    // call dispatch(state, domainAction)
    // redraw
    
    if (action.type === "click") {
      console.log("Clicked:", action.hit);
      // your game logic: select/buy/etc
    }

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
    console.log(rect);
    console.log(canvas.clientWidth);
    console.log(canvas.clientHeight);
    console.log(canvas.parentElement);

    canvas.width  = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr); // rect.height does not match browser height
    console.log(canvas.width);
    console.log(canvas.height);
    console.log(window.innerWidth);
    console.log(window.innerHeight);

    const sx = canvas.width  / rect.width;
    const sy = canvas.height / rect.height;

    ctx.setTransform(sx, 0, 0, sy, 0, 0);

    renderer.resize({ width: rect.width, height: rect.height }, state);
    renderer.draw(state, ui);
}

function resizeCanvas() {
  // Use clientWidth and clientHeight to get the element's actual CSS display size
  const displayWidth = canvas.clientWidth;
  const displayHeight = canvas.clientHeight;

  // Check if the canvas buffer size needs to be updated to match the display size
  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    // Set the canvas buffer size
    canvas.width = displayWidth;
    canvas.height = displayHeight;
  }
}

window.addEventListener("load", resize);
window.addEventListener("resize", resize);
