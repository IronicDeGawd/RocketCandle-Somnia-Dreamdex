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
  launcher: [50, 50],
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
      g.fillRect(0, 0, w, 26);
      g.fillStyle(INK, 1);
      for (let x = 0; x < w; x += 24) g.fillRect(x, 0, 12, 26);
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

    // Enemies: red, because red is threat, with two white eyes so a target is
    // still obviously a creature and not another block.
    const enemy = (eyeInset) => (g, w, h) => {
      panel(g, 4, 8, w - 8, h - 16, RED, 3);
      g.fillStyle(WHITE, 1);
      g.fillRect(12 + eyeInset, 20, 7, 7);
      g.fillRect(w - 19 - eyeInset, 20, 7, 7);
      g.fillStyle(INK, 1);
      g.fillRect(14 + eyeInset, 22, 3, 3);
      g.fillRect(w - 17 - eyeInset, 22, 3, 3);
    };
    paint(scene, "enemy-var1", enemy(0));
    paint(scene, "enemy-var2", enemy(1));
    paint(scene, "enemy-var3", enemy(2));
    paint(scene, "enemy-var4", enemy(3));

    // The rocket, drawn NOSE UP. The scene turns it to face its own velocity
    // by adding a quarter turn, which only lands correctly if the art starts
    // pointing up - drawn pointing right it flies permanently sideways.
    paint(scene, "rocket", (g, w, h) => {
      // body
      panel(g, 19, 8, 12, 34, RED, 3);
      // nose
      g.fillStyle(INK, 1);
      g.fillRect(21, 2, 8, 6);
      g.fillStyle(YELLOW, 1);
      g.fillRect(22, 3, 6, 4);
      // exhaust
      g.fillStyle(YELLOW, 1);
      g.fillRect(22, 42, 6, 5);
    });

    // The launcher: a red barrel on a white base, as the design draws it.
    paint(scene, "launcher", (g, w, h) => {
      panel(g, 3, 32, w - 6, 15, WHITE, 3);
      panel(g, 8, 14, 30, 14, RED, 3);
    });
  },
};
