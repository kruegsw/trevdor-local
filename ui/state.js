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
    pending: {
      tokens: { /*white: 0, blue: 0, green: 0, red: 0, black: 0, yellow: 0*/ },
      card: null
    },

    // Future-proofing:
    mode: "idle", // "idle" | "takeTokens" | "buyCard" | etc
  };
}
