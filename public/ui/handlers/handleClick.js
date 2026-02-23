import { DEBUG } from "../../debug.js";

export function handleClick({rulesCheck, getState, uiState, hit}) {

    let state = getState();

    const currentPlayer = state.players[state.activePlayerIndex];

    function clearPendingTokens() {
        uiState.pending.tokens = {};
    }

    function clearPendingCard() {
        uiState.pending.card = "";
    }

    function clearPending() {
        clearPendingTokens();
        clearPendingCard();
    }

    function addTokenToPending(color) {
        if (uiState.pending.tokens[color]) { uiState.pending.tokens[color] += 1 } else { uiState.pending.tokens[color] = 1 }
    }

    function addCardToPending(card) {
        uiState.pending.card = card
    }

    // 1) Clicked empty space => clear UI selection
    if (!hit) {
        clearPending();
        uiState.mode = "idle";
        return;
    }

    if (DEBUG) console.log(hit);

    // 2) Token pile => toggle UI-only picks (limit total to 3)
    if (hit.kind === "token") {

        // yellow token --> reserve card
        if (hit.color == "yellow") {
            clearPending();
            if ( rulesCheck({getState, uiState, pending: uiState.pending, action: "takeToken", color: hit.color}) ) {
                addTokenToPending(hit.color);
                uiState.mode = "reserveCard";
            }
        // red blue green black white --> take tokens
        } else {
            delete uiState.pending.tokens.yellow;
            clearPendingCard();
            if ( rulesCheck({getState, uiState, pending: uiState.pending, action: "takeToken", color: hit.color}) ) {
                addTokenToPending(hit.color);
                uiState.mode = "takeTokens";
            }
        }
        if (DEBUG) console.log(uiState);
        return;
    }

    if (hit.kind === "market.card") {

        const card = {meta: hit.meta, tier: hit.tier, index: hit.index};

        // yellow token --> reserve card
        if (uiState.mode === "reserveCard") {
            if ( rulesCheck({getState, uiState, pending: uiState.pending, action: "reserveCard", card}) ) {
                addCardToPending(card);
                uiState.mode = "reserveCard";
            }
        } else {
            if ( rulesCheck({getState, uiState, pending: uiState.pending, action: "buyCard", card}) ) {
                uiState.mode = "buyCard";
                clearPending();
                addCardToPending(card);
            }
        }

        if (DEBUG) console.log(uiState);
        return;
    }

    if (hit.kind === "reserved") {

        const card = {meta: hit.meta, tier: hit.tier, index: hit.index};

        if ( rulesCheck({getState, uiState, pending: uiState.pending, action: "buyCard", card}) ) {
            uiState.mode = "buyCard";
            clearPending();
            addCardToPending(card);
        }
        if (DEBUG) console.log(uiState);
    }

    // Confirm => commit picks to game state (triggered by HTML overlay button)
    if (hit.kind === "button.confirm") {
        return true;  // action requested
    }
}
