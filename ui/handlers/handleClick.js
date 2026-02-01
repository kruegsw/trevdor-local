export function handleClick(uiState, hit) {

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

    // 1) Clicked empty space => clear UI selection
    if (!hit) {
        clearPending();
        return;
    }

    // 2) Token pile => toggle UI-only picks (limit total to 3)
    if (hit.kind === "token") {

        uiState.mode = "takeTokens";
        clearPendingCard();

        switch (key) {
            case value:
                
                break;
        
            default:
                break;
        }

        return;
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
