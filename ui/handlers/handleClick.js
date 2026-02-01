export function handleClick(getState, uiState, hit) {

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

    function countPendingTokens(tokens) {
        return Object.values(tokens).reduce((sum, n) => sum + n, 0);
    }

    // 1) Clicked empty space => clear UI selection
    if (!hit) {
        clearPending();
        uiState.mode = "idle";
        return;
    }

    // 2) Token pile => toggle UI-only picks (limit total to 3)
    if (hit.kind === "token") {

        if (hit.color == "yellow") {
                uiState.mode = "reserveCard";
                clearPending();
                addTokenToPending(hit.color);
                return
        } else {
            uiState.mode = "takeTokens";
            delete uiState.pending.tokens.yellow;
            clearPendingCard();

            if ( uiState.pending.tokens[hit.color] ) {
                if ( countPendingTokens(uiState.pending.tokens) > 1 ) {
                    clearPending();
                    uiState.mode = "idle";
                    throw new Error("You may only take two of the same color token.");
                    return
                } else {
                    addTokenToPending(hit.color)
                    return
                }
            }

            if ( countPendingTokens(uiState.pending.tokens) < 3 ) {
                addTokenToPending(hit.color);
                return
            } else {
                clearPending();
                uiState.mode = "idle";
                throw new Error("You may only take three total tokens.");
                return
            }
        }

        return;
    }

    if (hit.kind === "market.card") {

        const card = {meta: hit.meta, tier: hit.tier, index: hit.index};

        if (uiState.mode === "reserveCard") {
            uiState.pending.card = card
        } else {
            uiState.mode = "buyCard";
            clearPending();
            addCardToPending(card);
        }

    }

    // 3) Confirm => commit picks to game state (real action)
    if (hit.kind === "button" && hit.id === "confirm") {

        if (totalPicks() > 0) {
            const action = Actions.takeTokens(uiState.pendingPicks);

            // reducer mutates state in place
            applyAction(getState(), action);

            clearPendingPicks();
        }

        return;
    }

    // 4) Cancel => clear UI-only picks
    if (hit.kind === "button" && hit.id === "cancel") {
      clearPendingPicks();
      return;
    }

    // 5) Later: cards, nobles, reserve, buy, etc.
}
