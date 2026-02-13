export function handleHover({getState, uiState, hit}) {

    let state = getState();

    const currentPlayer = state.players[state.activePlayerIndex];

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
        console.log(uiState.playerPanelPlayerIndex)
        return;
    }

}
