export function handleClick(getState, uiState, hit) {

    let state = getState();

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

    function rulesCheck({action, color = null, card = null}) {
        switch (action) {
            case "takeToken":
                return state.market.bank[color] > 0
            case "takeSecondColorToken":
                return ( state.market.bank[color] - uiState.pending.tokens[color] ) > 2
            default:
                break;
        }
    }

    // 1) Clicked empty space => clear UI selection
    if (!hit) {
        clearPending();
        uiState.mode = "idle";
        return;
    }

    // 2) Token pile => toggle UI-only picks (limit total to 3)
    if (hit.kind === "token") {

        // yellow token --> reserve card
        if (hit.color == "yellow") {
            clearPending();
            if ( rulesCheck({action: "takeToken", color: hit.color}) ) {
                addTokenToPending(hit.color);
                uiState.mode = "reserveCard";
            }
            return
        // red blue green black white --> take tokens
        } else {




            uiState.mode = "takeTokens";
            delete uiState.pending.tokens.yellow;
            clearPendingCard();

            if ( uiState.pending.tokens[hit.color] ) {
                // RULE:  cannot take > 2 tokens same color
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

            // RULE:  cannot take > 3 total tokens
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

        // yellow token --> reserve card
        if (uiState.mode === "reserveCard") {
            uiState.pending.card = card
        // 
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
