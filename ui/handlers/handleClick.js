export function handleClick(getState, uiState, hit) {

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

    function countPendingTokens(tokens) {
        return Object.values(tokens).reduce((sum, n) => sum + n, 0);
    }

    function countMaxPerColor(tokens) {
        return Object.values(tokens).reduce((max, n) => Math.max(max, n), 0);
    }

    function countBonusColorFromCards(cards, color) { 
        const grouped = bonusByColor(cards, ["white","blue","green","red","black"]);
        return grouped[color];
    }
    
    function bonusByColor(cards, colors) {
        const out = {};
        for (const c of colors) out[c] = 0;
            for (const card of (cards ?? [])) {
                const b = card?.bonus;
                (out[b]++);
            }
        return out;
    }

    function availableFundsForCard(card) {
        const check = true;
        const cost = card.meta.cost;
        console.log(cost)
        console.log(Object.values(cost))
        const bonus = bonusByColor(currentPlayer.cards, ["white","blue","green","red","black"]);
        const short = 0;
        for (const c of cost) {
            if ( bonus[c] + currentPlayer.tokens[c] < cost[c]) {
                short += cost[c] - bonus[c] - currentPlayer.tokens[c];
            }
        }
        if (currentPlayer.token["yellow"] < short) {check = false};
        return check
    }

    function rulesCheck({action, color, card}) {
        console.log({action, color, card});
        let check = true
        switch (action) {
            case "takeToken":
                if (state.market.bank[color] < 1) {check = false} // bank has at least one token of that color
                if (countPendingTokens(uiState.pending.tokens) > 2) {check = false} // cannot take more than 3 tokens
                if (countMaxPerColor(uiState.pending.tokens) > 1) {check = false} // cannot have two tokens of the same color in-hand
                if (uiState.pending.tokens[color] &&  // if taking a second token of the same color already pending ...
                    countPendingTokens(uiState.pending.tokens) > 1 && // ... the first token must be the only other token in pending
                    state.market.bank[color] > 3 // ... and the bank must have 4 tokens of that color
                ) {check = false}
                if ( (countPendingTokens(currentPlayer.tokens) + countPendingTokens(uiState.pending.tokens)) > 9
                ) {check = false} // prevent player from picking up more than 10 tokens
                break;
            case "buyCard":
                if (!availableFundsForCard(card)) {check = false} // player has sufficient bonus and tokens to buy card
                break;
            case "reserveCard":
                // if card exists
                // must have yellow token pending
                // max 3 reserved cards
                break;
            default:
                break;
        }
        return check
    }

    // 1) Clicked empty space => clear UI selection
    if (!hit) {
        clearPending();
        uiState.mode = "idle";
        return;
    }

    console.log(hit);

    // 2) Token pile => toggle UI-only picks (limit total to 3)
    if (hit.kind === "token") {

        // yellow token --> reserve card
        if (hit.color == "yellow") {
            clearPending();
            if ( rulesCheck({action: "takeToken", color: hit.color}) ) {
                addTokenToPending(hit.color);
                uiState.mode = "reserveCard";
            }
        // red blue green black white --> take tokens
        } else {
            delete uiState.pending.tokens.yellow;
            clearPendingCard();
            if ( rulesCheck({action: "takeToken", color: hit.color}) ) {
                addTokenToPending(hit.color);
                uiState.mode = "takeTokens";
            }
        }
        console.log(uiState);
        return;
    }

    if (hit.kind === "market.card") {

        const card = {meta: hit.meta, tier: hit.tier, index: hit.index};

        // yellow token --> reserve card
        if (uiState.mode === "reserveCard") {
            if ( rulesCheck({action: "reserveCard", card}) ) {
                addCardToPending(card);
                uiState.mode = "reserveCard";
            }
        } else {
            if ( rulesCheck({action: "buyCard", card}) ) {
                uiState.mode = "buyCard";
                clearPending();
                addCardToPending(card);
            }
        }

        console.log(uiState);
        return;
    }

    if (hit.kind === "reserved") {

        const card = {meta: hit.meta, tier: hit.tier, index: hit.index};

        if ( rulesCheck({action: "buyCard", card}) ) {
            uiState.mode = "buyCard";
            clearPending();
            addCardToPending(card);
        }
        console.log(uiState);
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
