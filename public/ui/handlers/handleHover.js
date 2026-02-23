import { DEBUG } from "../../debug.js";

export function handleHover({getState, uiState, hit}) {

    hit ? uiState.isHovered = hit : uiState.isHovered = null;

    if (DEBUG) console.log(`hovered hit is : ${JSON.stringify(hit)}`);

    if (!hit) {
        uiState.hovered = null;
        return;
    }

}
