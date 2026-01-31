export function createUIState() {
  return {
    pointer: {
      x: 0,
      y: 0,
      isDown: false,
      pointerId: null,
    },

    hovered: null,   // hitRegion | null
    pressed: null,   // hitRegion | null

    // UI-only selections (never sent to reducer/server)
    pendingPicks: {},

    // Future-proofing:
    mode: "idle", // "idle" | "pickingTokens" | "selectingCard" | etc
  };
}
