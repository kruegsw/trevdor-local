export function handleHover({getState, uiState, hit}) {

    let state = getState();

    const currentPlayer = state.players[state.activePlayerIndex];

    hit ? uiState.isHovered = hit : uiState.isHovered = null;

    console.log(`hovered hit is : ${JSON.stringify(hit)}`)

    if (!hit) {
        uiState.hovered = null;
        uiState.playerPanelPlayerIndex =
            (typeof uiState.myPlayerIndex === "number")
                ? uiState.myPlayerIndex
                : state.activePlayerIndex; // by default, if active player see my stuff otherwise see active player stuff
        return;
    }

    if (hit?.kind === "summary.card") {
        uiState.hovered = hit;
        uiState.playerPanelPlayerIndex = hit.playerIndex;
        return;
    }

    //if (hit?.kind === "market.card") {
    //    uiState.hovered = hit;
    //    uiState.playerPanelPlayerIndex = hit.playerIndex;
    //    return;
    //}

}
