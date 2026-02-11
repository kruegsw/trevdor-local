export function handleHover({getState, uiState, hit}) {

    let state = getState();

    const currentPlayer = state.players[state.activePlayerIndex];

    if (!hit) {
        uiState.hovered = null;
        uiState.playerPanelPlayerIndex = state.activePlayerIndex;
        return;
    }

    if (hit?.kind === "summary.card") {
        uiState.hovered = hit;
        uiState.playerPanelPlayerIndex = hit.playerIndex;
        console.log(uiState.playerPanelPlayerIndex)
        return;
    }

}