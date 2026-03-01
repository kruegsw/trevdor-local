import { DEBUG } from "../../debug.js";

export function handleClick({rulesCheck, getState, uiState, hit}) {

    let state = getState();

    const currentPlayer = state.players[state.activePlayerIndex];

    function clearPending() {
        uiState.pending.tokens = {};
        uiState.pending.card = "";
        uiState.mode = "idle";
    }

    function addTokenToPending(color) {
        if (uiState.pending.tokens[color]) { uiState.pending.tokens[color] += 1 } else { uiState.pending.tokens[color] = 1 }
    }

    function addCardToPending(card) {
        uiState.pending.card = card;
    }

    // 1) Clicked empty space => clear UI selection
    if (!hit) {
        clearPending();
        return;
    }

    if (DEBUG) console.log(hit);

    // 2) Token pile click
    if (hit.kind === "token") {

        // Yellow token → reserve card flow
        if (hit.color === "yellow") {
            // If already in reserveCard mode (yellow already grabbed), clear instead
            if (uiState.mode === "reserveCard") {
                clearPending();
                return;
            }
            // Starting fresh reserve: clear any previous pending
            clearPending();
            if ( rulesCheck({getState, uiState, pending: uiState.pending, action: "takeToken", color: hit.color}) ) {
                addTokenToPending(hit.color);
                uiState.mode = "reserveCard";
            }
            if (DEBUG) console.log(uiState);
            return;
        }

        // Non-yellow token → takeTokens flow
        if (uiState.mode === "takeTokens") {
            // Clicking a color already in pending → try taking 2 of same (bank ≥4),
            // otherwise clear (user is "undoing")
            if (uiState.pending.tokens[hit.color]) {
                if ( rulesCheck({getState, uiState, pending: uiState.pending, action: "takeToken", color: hit.color}) ) {
                    addTokenToPending(hit.color);
                } else {
                    clearPending();
                }
                if (DEBUG) console.log(uiState);
                return;
            }
            // Try to add to current pending
            if ( rulesCheck({getState, uiState, pending: uiState.pending, action: "takeToken", color: hit.color}) ) {
                addTokenToPending(hit.color);
            } else {
                // Doesn't fit current pending → clear and start fresh
                clearPending();
                if ( rulesCheck({getState, uiState, pending: uiState.pending, action: "takeToken", color: hit.color}) ) {
                    addTokenToPending(hit.color);
                    uiState.mode = "takeTokens";
                }
            }
        } else {
            // Not in takeTokens mode → clear and start fresh
            clearPending();
            if ( rulesCheck({getState, uiState, pending: uiState.pending, action: "takeToken", color: hit.color}) ) {
                addTokenToPending(hit.color);
                uiState.mode = "takeTokens";
            }
        }
        if (DEBUG) console.log(uiState);
        return;
    }

    // 3) Market card click
    if (hit.kind === "market.card") {

        const card = {meta: hit.meta, tier: hit.tier, index: hit.index};

        if (uiState.mode === "reserveCard") {
            // In reserve mode (yellow grabbed) → try to complete the reserve
            if ( rulesCheck({getState, uiState, pending: uiState.pending, action: "reserveCard", card}) ) {
                addCardToPending(card);
            } else {
                clearPending();
            }
        } else {
            // Any other mode → clear and try buy
            clearPending();
            if ( rulesCheck({getState, uiState, pending: uiState.pending, action: "buyCard", card}) ) {
                uiState.mode = "buyCard";
                addCardToPending(card);
            }
        }

        if (DEBUG) console.log(uiState);
        return;
    }

    // 4) Reserved card click → buy
    if (hit.kind === "reserved") {

        const card = {meta: hit.meta, tier: hit.tier, index: hit.index};

        // Clear any pending and try to buy reserved card
        clearPending();
        if ( rulesCheck({getState, uiState, pending: uiState.pending, action: "buyCard", card}) ) {
            uiState.mode = "buyCard";
            addCardToPending(card);
        }
        if (DEBUG) console.log(uiState);
        return;
    }

    // Confirm => commit picks to game state (triggered by HTML overlay button)
    if (hit.kind === "button.confirm") {
        return true;  // action requested
    }
}
