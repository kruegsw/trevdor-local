/*
  trevdor.js
  -----------
  Main entry point for the game.

  - Runs in ES module mode (strict by default)
  - No globals leaked to window
  - Safe to split into multiple modules later
*/

import { render } from "./ui/render.js";
import { state } from "./engine/state.js";
const ui = []; // status of hovering, selections, etc... later

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d")
//ctx.imageSmoothingEnabled = false; // for pixel art, otherwise scaled sprites will blur

const renderer = render(ctx);







function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width  = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);

    const sx = canvas.width  / rect.width;
    const sy = canvas.height / rect.height;

    ctx.setTransform(sx, 0, 0, sy, 0, 0);

    renderer.resize({ width: rect.width, height: rect.height });
    renderer.draw(state, ui);
}

window.addEventListener("load", resize);
window.addEventListener("resize", resize);
