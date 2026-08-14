/**
 * Repaint the game's art in the design language.
 *
 * The original art is photographic: a sky with clouds behind the play field,
 * shaded candlestick blocks, drawn characters. None of it belongs beside a
 * flat, hard-edged console interface, and a background photograph in
 * particular fights every readout placed on top of it.
 *
 * Rather than replace the sprites - which would mean redoing every physics
 * body, collision box and placement in the scene - this overwrites the
 * textures those sprites already point at. Every key keeps its exact original
 * dimensions, so nothing in the game's geometry changes: the same 50x50 tiles
 * sit in the same places, collide the same way, and are destroyed by the same
 * code. Only what they look like changes.
 *
 * Call once, after loading finishes and before any scene draws.
 */

const INK = 0x14161a;
const BASE = 0x2a2d34;
const SURFACE = 0x22252b;
const WELL = 0x1b1e23;
const RED = 0xe94f37;
const YELLOW = 0xf6f740;
const BLUE = 0x3f88c5;
const WHITE = 0xffffff;

/** Every texture this module owns, at the size the original art used. */
const SIZES = {
  "game-background": [1200, 600],
  "ground-block": [50, 50],
  "green-candle": [50, 50],
  "red-candle": [50, 50],
  "dest-block": [50, 50],
  "dest2-block": [50, 50],
  "enemy-var1": [50, 50],
  "enemy-var2": [50, 50],
  "enemy-var3": [50, 50],
  "enemy-var4": [50, 50],
  rocket: [50, 50],
  // The launcher is two pieces, not one: the chassis stands still and only
  // the barrel turns. Drawn at the design's own measurements.
  "launcher-base": [132, 92],
  "launcher-barrel": [58, 26],
};

/**
 * Draw one texture and register it under an existing key.
 *
 * The old texture is removed first: Phaser will not overwrite a key that is
 * already in the cache, so without this the loaded PNG simply stays.
 */
function paint(scene, key, draw) {
  const [width, height] = SIZES[key];
  const g = scene.add.graphics();
  draw(g, width, height);
  if (scene.textures.exists(key)) scene.textures.remove(key);
  g.generateTexture(key, width, height);
  g.destroy();
}

/** A filled rectangle with the hard ink border every surface in this design has. */
function panel(g, x, y, w, h, fill, border = 3) {
  g.fillStyle(INK, 1);
  g.fillRect(x, y, w, h);
  g.fillStyle(fill, 1);
  g.fillRect(x + border, y + border, w - border * 2, h - border * 2);
}

export const DesignTextures = {
  /**
   * @param {Phaser.Scene} scene any scene that has finished loading
   */
  paintAll(scene) {
    // The field behind everything. Flat, so the readouts sitting over it stay
    // readable - the photograph it replaces put clouds behind white text.
    paint(scene, "game-background", (g, w, h) => {
      g.fillStyle(BASE, 1);
      g.fillRect(0, 0, w, h);
      // A faint grid, far enough back to read as depth rather than detail.
      g.lineStyle(1, 0x000000, 0.14);
      for (let x = 0; x <= w; x += 40) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, h);
        g.strokePath();
      }
      for (let y = 0; y <= h; y += 40) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.strokePath();
      }
    });

    // Ground. The design's strip is blue with a hard-stepped dash and a 4px
    // ink lid; the tile is 50 tall because that is what the scene lays out, so
    // the strip is drawn into the top of it and the rest is the dark below.
    paint(scene, "ground-block", (g, w, h) => {
      g.fillStyle(WELL, 1);
      g.fillRect(0, 0, w, h);
      g.fillStyle(BLUE, 1);
      g.fillRect(0, 0, w, 30);
      g.fillStyle(INK, 1);
      for (let x = 0; x < w; x += 28) g.fillRect(x, 0, 14, 30);
      g.fillRect(0, 0, w, 4);
    });

    // A rising candle. Yellow is what the player is chasing, and it is the
    // same yellow the score uses - the two are meant to read as connected.
    paint(scene, "green-candle", (g, w, h) => panel(g, 0, 0, w, h, YELLOW, 3));

    // A falling candle. Blue is the market speaking, everywhere in this design.
    paint(scene, "red-candle", (g, w, h) => panel(g, 0, 0, w, h, BLUE, 3));

    // Destructible blocks: plain surface, so they read as scenery rather than
    // as something to aim at.
    paint(scene, "dest-block", (g, w, h) => panel(g, 0, 0, w, h, SURFACE, 3));
    paint(scene, "dest2-block", (g, w, h) => panel(g, 0, 0, w, h, WELL, 3));

    // Enemies: red, because red is threat, with two ink eyes so a target is
    // still obviously a creature and not another block. The eyes are cut
    // straight out of the red rather than being white blocks with pupils -
    // at this size the extra ring of white just read as noise.
    const enemy = (eyeInset) => (g, w, h) => {
      panel(g, 3, 10, w - 6, h - 20, RED, 4);
      g.fillStyle(INK, 1);
      g.fillRect(15 + eyeInset, 22, 6, 6);
      g.fillRect(w - 21 - eyeInset, 22, 6, 6);
    };
    paint(scene, "enemy-var1", enemy(0));
    paint(scene, "enemy-var2", enemy(1));
    paint(scene, "enemy-var3", enemy(2));
    paint(scene, "enemy-var4", enemy(3));

    // The rocket, drawn NOSE RIGHT, exactly as the design draws it: a short
    // 22x14 red body with a two-step yellow exhaust trailing behind it.
    //
    // Right, not up. Sprite rotation is set from the velocity angle, and
    // atan2 measures from the positive x axis - so art that points right needs
    // no correction at all. The previous nose-up drawing only worked because
    // the scene added a quarter turn to compensate, and that quarter turn has
    // now been removed with it.
    paint(scene, "rocket", (g, w, h) => {
      // Exhaust, furthest and dimmest first, so the taper reads as thrust
      // coming out rather than as a shape attached to the back.
      g.fillStyle(YELLOW, 0.35);
      g.fillRect(0, 21, 12, 8);
      g.fillStyle(YELLOW, 0.6);
      g.fillRect(12, 20, 16, 10);
      // Body
      panel(g, 28, 18, 22, 14, RED, 3);
    });

    // The launcher: a red barrel on a white base, as the design draws it.
    /*
     * The launcher, to C-03: white chassis and three wheels on an ink track,
     * with a red barrel that pivots on the white mount block.
     *
     * It was a white bar and a red bar in a 50x50 square, rotated as one
     * piece - so the whole machine tipped over every time the player aimed,
     * wheels and all. Splitting it in two is what lets the barrel be the aim
     * feedback the design asks for while the cart stays on the ground.
     *
     * Design coordinates are measured from the bottom; these are converted
     * once here rather than scattered through the drawing.
     */
    paint(scene, "launcher-base", (g, w, h) => {
      const up = (bottom, height) => h - bottom - height;

      // Track first, wheels over it - the design stacks them in that order.
      g.fillStyle(INK, 1);
      g.fillRect(26, up(8, 12), 80, 12);

      for (const x of [22, 52, 82]) panel(g, x, up(0, 22), 22, 22, WHITE, 4);

      panel(g, 30, up(20, 18), 70, 18, WHITE, 4);
      panel(g, 54, up(34, 22), 22, 22, WHITE, 4);
    });

    // Barrel and muzzle share a centre line, so the taller muzzle overhangs
    // the barrel equally above and below.
    paint(scene, "launcher-barrel", (g) => {
      panel(g, 0, 3, 46, 20, RED, 4);
      panel(g, 46, 0, 12, 26, RED, 4);
    });
  },
};
