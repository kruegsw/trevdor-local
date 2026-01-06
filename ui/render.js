import { computeLayout } from "./layout.js";

function render(ctx) {

    //ctx.clearRect(0, 0, W, H);

    let viewport = { width: 0, height: 0 };
    let layout = null;
    let hitRegions = [];
    let fontsReady = false;
    let assets = {};

    return {
        resize(nextViewport) {
            viewport = nextViewport;

            // Compute and cache all geometry here
            layout = computeLayout(viewport);

            // Optional: set text baseline defaults, etc.
            ctx.textBaseline = "alphabetic";
            ctx.textAlign = "left";
        },
        draw(state, uiState) {
            if (!layout) return; // guard
            ctx.clearRect(0, 0, viewport.width, viewport.height);


            // more customization here//
            drawCard(ctx, 20, 20, 20, 20)
            // more customization here//


            
        },
        getHitRegions() { return hitRegions; }
    };
}

function roundedRectPath(ctx, x, y, w, h, r = 14) {
    /*
      Draws a rounded rectangle path.
      This function ONLY creates the path — it does not fill or stroke.
    */
    ctx.beginPath();
    const radius = Math.min(r, w / 4, h / 4);
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y,     x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x,     y + h, radius);
    ctx.arcTo(x,     y + h, x,     y,     radius);
    ctx.arcTo(x,     y,     x + w, y,     radius);
    ctx.closePath();
}

function drawCard(ctx, x, y, w, h, fill = "#000000ff", stroke = "rgba(0,0,0,.12)") {
    /*
      Draws a soft-edged card or tile
    */
    roundedRectPath(ctx, x, y, w, h);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
}

export { render };
