# Rocket Candle — Design Brief

A structural description of the product as it exists today, written for a designer
who has never seen the code.

**What this document deliberately does not contain:** colours, palettes, fonts, type
scales, spacing values, corner radii, shadows, or any other design token. Those are
yours to decide. Everything here is layout, content, hierarchy, state and behaviour —
the things a design has to account for in order to be buildable.

**How this gets used:** you produce the design (layouts and HTML). It gets reviewed,
then implemented against the structures described here.

---

## 1. What the product is

A physics game where the levels are built out of real financial market data.

The player aims a launcher and fires a rocket across the screen to destroy enemies
perched on top of barriers. Each barrier is one candlestick from a real trading
market — its height comes from how far that price moved, and it is drawn in one of
two variants depending on whether the price closed up or down. So the shape of every
level is a picture of what a real market actually did.

There are 7 levels per run, each one a different slice of market history.

On top of that sits an optional layer: the player can put real money into the market
they are playing. Their stake buys the token, and it sells back when the run ends.
While a position is open, the live market intrudes on the game — real trades shake
the screen, a thin order book makes explosions bigger, and if the price breaks the
level's own high or low, that wall physically collapses.

There is also a practice mode with no wallet and no money at stake.

### The audience problem worth designing against

Two very different people arrive here:

- Someone who wants to play a game and does not care about markets.
- Someone evaluating the exchange's capabilities and does not care about games.

The current design serves neither clearly.

---

## 2. Hard constraints a design must respect

These are facts about how the thing is built, not opinions about how it looks.

### 2.1 The game runs in a fixed-size canvas

The game is drawn into a single `<canvas>` element with an internal resolution of
**1200 × 600 pixels** — a 2:1 letterbox shape. Every position in the game is a
literal pixel number against that space. There is no grid, no anchoring, no layout
system.

The canvas is placed inside a wrapper box that is allowed to shrink in width on
narrow screens, but whose height stays pinned near 600px. So on any screen narrower
than 1200px the wrapper stops being 2:1, the game picture is shrunk to fit inside it
without distorting, and centred — leaving uncovered strips of the wrapper above and
below. **Those strips are the empty bars.** They are the wrapper's own background
showing through, not anything the game draws.

Two consequences for design:

1. If the design wants the game to fill its space edge-to-edge, the canvas must be
   allowed to change shape, and every position inside the game has to be re-derived
   as a proportion of width and height. That is a full relayout of the play field,
   not a resize. It is doable, but it should be a deliberate decision, not an
   assumption.
2. If the design keeps a fixed shape, the area around the canvas is design surface
   and should be treated as such rather than left as dead space.

### 2.2 Two rendering worlds

Everything on screen is one of two kinds of thing, and they cannot be styled the
same way:

- **HTML** — the header, panels, buttons, forms, leaderboard, toasts. Ordinary web
  markup. Fully designable with normal tools.
- **Canvas** — everything inside the game frame, including all the in-game text
  readouts, the sliders and the two on-screen buttons. These are drawn by the game
  engine. They cannot be targeted with stylesheets; changing them means changing
  game code and assets.

Section 7.4 lists exactly what currently lives on the canvas side, and section 8
covers the choice of whether some of it should move.

### 2.3 Barrier heights have only three possible values

Each barrier is a vertical stack of blocks that are 30px wide and 50px tall. A
barrier's total height is clamped between 50 and 150 pixels. So every candlestick in
the game becomes a stack of exactly one, two, or three blocks.

This is why levels can look flat and repetitive regardless of what the market did.
Any design that wants terrain to read as varied needs either finer height steps or a
different way of expressing magnitude.

### 2.4 Input was built around a keyboard

The core interaction is: adjust something, which arms an 8-second countdown; then
either wait for it to fire automatically or interrupt it. This was designed around
holding a key down.

Touch is not blocked — the engine treats mouse and finger identically, so the sliders
and buttons already respond to taps and drags. But nothing is designed for it: the
slider handles are 8-pixel-radius dots, and the arm-a-countdown model has no touch
idiom. Section 7.6 describes the full interaction so it can be redesigned.

### 2.5 Download weight

The site currently ships about 10.5 MB of assets, roughly 91% of which is audio, and
7.6 MB of that is a single uncompressed menu music file. This is worth knowing before
adding image-heavy design elements.

---

## 3. Site map

| Route | Purpose | Wallet required |
|---|---|---|
| `/` | Landing — pitch, connect, how to play | No |
| `/game` | The real game, with trading and score submission | Yes (redirects away if not connected) |
| `/practice` | Same game, no wallet, nothing recorded | No |
| `/scores` | Weekly leaderboard and personal history | Yes (redirects away if not connected) |

A persistent top navigation bar appears on `/`, `/game` and `/scores`. It is
deliberately absent on `/practice`, which is a stripped-down standalone entry point.

A decorative background layer of floating emoji (4 rockets, 4 candles) is mounted
behind every page.

---

## 4. Page: `/` — Landing

**Purpose:** pitch the game, get the visitor to connect a wallet or start a practice
run, and explain how to play.

```
┌──────────────────────────────────────────────┐
│ Navigation bar (fixed to top, full width)     │
├──────────────────────────────────────────────┤
│  HERO                                         │
│    brand mark                                 │
│    page title                                 │
│    one-paragraph pitch                        │
│    ┌────────────────────────────────────┐    │
│    │ Call to action block (state-driven)│    │
│    └────────────────────────────────────┘    │
│    "no wallet? practice run" escape line      │
├──────────────────────────────────────────────┤
│  FEATURES — 4 cards                           │
│  [ card ] [ card ] [ card ] [ card ]          │
│  (reflows to fewer columns, then 1)           │
├──────────────────────────────────────────────┤
│  HOW TO PLAY — 6 cards in a grid              │
│  [ Controls   ] [ Objectives ] [ Scoring  ]   │
│  [ Tokens     ] [ Tips       ] [ Modes    ]   │
│  closing encouragement line                   │
├──────────────────────────────────────────────┤
│  Footer — sound attribution credit             │
└──────────────────────────────────────────────┘
```

### Contents in order

1. **Navigation bar** — see section 6.1.
2. **Hero**: brand mark, page title, one-paragraph pitch, the call-to-action block,
   and a line offering a practice run. The practice line is always present regardless
   of wallet state — it is the only route into the product that asks for nothing.
3. **Features** — four static cards, each an icon, a short title and one sentence.
   No data, no interaction. They cover: the physics gameplay, the market-derived
   levels, the blockchain integration, and competing on the leaderboard.
4. **How to play** — six static cards:
   - *Game Controls* — five rows, each pairing a small key-cap image (W, S, A, D,
     Space) or an icon with a one-line description.
   - *Game Objectives* — three rows, each pairing small game sprites (enemies,
     candlestick blocks, the rocket) with a title and one sentence.
   - *Scoring System* — a five-row table of point values, one of which is negative
     and is marked as such.
   - *WICK Tokens* — three sub-blocks: how tokens are earned, a four-item bullet
     list of what they are for, and a note on where they are stored.
   - *Pro Tips & Strategy* — five numbered tips, each a title and one sentence.
   - *Game Modes* — three rows; one is active, two carry a "Coming Soon" tag.
   - A closing encouragement line beneath the grid.
5. **Footer** — a sound-effect attribution line with two external links.

### States

Only the call-to-action block changes:

| State | What is shown |
|---|---|
| Not connected | A prompt heading, one primary "connect" button, and a line of helper text below it. |
| Connecting | The same button, replaced by a small spinner and a "connecting" label. |
| Connected | A confirmation heading, the wallet's display name, and two side-by-side buttons: start the game, and jump to the how-to-play section. |

There is no visible failure state on this page — a failed connection currently
produces nothing on screen. **Worth designing one.**

---

## 5. Page: `/game`

**Purpose:** the gameplay screen. Hosts the canvas, the trading panel, the score
submission flow, and a control reminder.

### An ordering problem to decide deliberately

In the markup, the blocks appear in this order:

```
navigation
toast notification stack
the game canvas          ← first
the trading panel        ← second
the page header          ← third  (title, player stats, back button)
the instructions block   ← fourth
```

So the header sits *after* the game in the document, and whatever visual order
appears on screen comes from each block's own positioning rather than from the
document. The redesign should state the intended order explicitly rather than
inherit this.

```
┌──────────────────────────────────────────────┐
│ Navigation bar (fixed)                        │
├──────────────────────────────────────────────┤
│ [ toast stack — floats over everything ]      │
│                                                │
│   ┌────────────────────────────────────────┐ │
│   │ status strip: dot + game-ready label,   │ │
│   │              dot + wallet label         │ │
│   ├────────────────────────────────────────┤ │
│   │                                          │ │
│   │        THE GAME CANVAS (2:1)             │ │
│   │   (empty bars appear here, see 2.1)      │ │
│   │                                          │ │
│   └────────────────────────────────────────┘ │
│                                                │
│   ┌────────────────────────────────────────┐ │
│   │ TRADING PANEL — "play for keeps"        │ │
│   └────────────────────────────────────────┘ │
│                                                │
│   ┌────────────────────────────────────────┐ │
│   │ HEADER: title + subtitle | stat cards   │ │
│   │         | back button                   │ │
│   └────────────────────────────────────────┘ │
│                                                │
│   ┌────────────────────────────────────────┐ │
│   │ INSTRUCTIONS: control reminder text     │ │
│   └────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

### Contents

1. **Toast stack** — see section 6.5. Renders nothing when empty.
2. **Status strip** — two small status indicators above the canvas: a dot plus a
   loading/ready label for the game, and a dot plus a connected/disconnected label
   for the wallet. Note the ready indicator flips as soon as the game object is
   constructed, which is slightly before it is actually playable.
3. **The canvas** — see section 7.
4. **Trading panel** — see section 6.4.
5. **Header** — a title, a one-line subtitle, a stat card showing the player's
   display name, a second stat card showing their token balance (absent until that
   value loads), and a back button.
6. **Instructions** — a small heading and two lines of static text restating the
   controls and the attempt limit.

### States

- **Not connected** — the entire page is replaced by a two-line "authentication
  required / redirecting" message, then the browser navigates away. Visible for an
  instant. **Currently unstyled as a real screen; worth deciding whether it should
  exist at all.**
- **Game loading** — a placeholder box with a loading label stands in for the canvas
  until the game object mounts.
- **Token balance not yet loaded** — the second stat card is simply absent. There is
  no skeleton or placeholder; the layout changes shape when it arrives.
- **Score submission** — a sequence of toasts fires in order as a run's score is
  recorded: preparing, getting the run signed (this may prompt a wallet signature),
  confirming in the wallet, waiting for confirmation, then either success plus a
  confirmation toast, or one of a dozen distinct error toasts. The full catalogue is
  in section 6.5.

---

## 6. Components

### 6.1 Navigation bar

Present on `/`, `/game`, `/scores`. Not on `/practice`.

```
[ mark ][ product name        ]   [ Home  Play  Leaderboard ]   [ wallet ]
        [ network name        ]                                  [   ☰   ]
```

- **Left** — a brand mark plus a two-line title: the product name and the network
  name beneath it.
- **Centre** — three navigation links: home, play, leaderboard. The play link is
  disabled (genuinely disabled, not merely styled) when no wallet is connected.
- **Right, not connected** — a single connect button, which becomes a spinner and a
  connecting label while in progress.
- **Right, connected** — a button showing a status dot, the player's display name, a
  shortened wallet address, and a disclosure arrow. Opening it reveals a dropdown
  containing three stat rows (games played, best score, token balance — only when
  loaded), a divider, and a disconnect button.
- **A hamburger toggle** appears at narrow widths, opening a panel that repeats the
  three links as full-width buttons plus, when connected, the same three stats and a
  disconnect button.

One thing to know: the wallet dropdown and the mobile menu currently share a single
open/closed flag, so they cannot be open independently.

### 6.2 Hero block

Brand mark, title, pitch paragraph, the call-to-action block, and the practice link.
All copy static except the call-to-action.

### 6.3 Feature and how-to-play cards

Static content only. Note that the four feature card titles and the call-to-action
heading are styled containers rather than real heading elements, so the page outline
currently has holes in it — see section 11.

### 6.4 Trading panel — "play for keeps"

The most complex component, and the one carrying the most explanation. It lets a
player opt into trading real money alongside their run.

**Always shown:** a heading and an introductory paragraph explaining that the stake
buys the token for real, sells back when the run ends, and can be exited mid-run with
a key press. The key is rendered as a key-cap element inline in the sentence.

**Before trading is enabled:**

- A labelled number input for the stake amount.
- A list of four facts, each one or two sentences: what the browser's trading key can
  and cannot do; that there are three signatures up front and none afterwards; how
  the automatic sell-out floor works and where it is watched from; and that trading
  fees are zero with the only cost being the buy/sell gap — this last one gains a
  live estimated figure once a quote loads.
- A single action button whose label changes through five distinct in-progress
  states as the setup proceeds through its steps.

**After trading is enabled:**

- A confirmation line naming the browser's trading key by a shortened address.
- **A stop-loss sub-panel**, shown only when a position is actually open. It has two
  states: not yet resting (an explanatory note about the cost and behaviour, plus a
  button to place it) and resting (a confirmation line, plus a button to remove it).
  Each has its own in-progress label and can show an inline error.
- A row of two actions: withdraw, and revoke the trading key. Revoke has an
  in-progress label.
- A closing note about the order to do things in.
- An inline error line when something fails.

This component has, in total, **eleven distinct visual states**. It is the densest
information design problem on the site.

### 6.5 Toast notification stack

A floating stack of dismissable messages. Each has an icon indicating one of four
kinds (success, error, warning, information), a title, a message, and a close button.

- Each auto-dismisses after a duration, most commonly five seconds, some as long as
  eight.
- Dismissal plays a 300ms exit transition before the item is removed.
- The stack renders nothing at all when empty.

**What triggers them:** wallet connected, wallet disconnected, wrong network
detected, network switch in progress, transaction submitted, transaction confirmed,
score submitted, plus a step-by-step sequence during score submission (preparing,
verifying the run, confirming in wallet, waiting for confirmation) and a set of
distinct failures (not authenticated, wallet not connected, bad contract
configuration, score validation failed, rate-limited, run not verified, submission
failed, transaction failed, receipt error).

That is a lot of individual messages, several of which fire in quick succession
during a single submission. **How they stack, queue, or collapse is a real design
question.**

### 6.6 Brand mark

A single letter drawn with markup rather than an image, in three sizes, with an
optional animation.

### 6.7 Practice banner

A single full-width strip: a bold label, a sentence clarifying that nothing is
recorded and nothing is earned, and a link back to connect a wallet.

---

## 7. The game screen

### 7.1 Canvas setup

Internal resolution 1200 × 600, fixed. Scaling preserves the 2:1 shape and centres
the result. Physics has downward gravity. See section 2.1 for why bars appear.

### 7.2 The four scenes, in the order a player meets them

**Loading screen.** A star field, the game title with a pulsing effect, a
"loading market data" subtitle, a horizontal progress bar with a percentage
readout, one randomly-chosen tip from a set of five, a bobbing rocket that leaves a
trail, and a "ready" line that fades in at the end. Runs for a fixed ~1.5 seconds
then fades out. Not skippable.

```
        ·   ·      ·        ·     ·   ·      ·
                  GAME TITLE  (pulsing)
                Loading Market Data...

          [ ███████████░░░░░░░░░░░░░ ]
                      62%

   🚀                 one rotating tip line
              Ready to Launch!  (fades in at end)
```

**Menu.** A denser star field plus drifting decorative emoji. Title, subtitle, then a
player-stats block, then a market picker, then the play button, then two lines of
instructions.

```
        ·  ·    ·     ·   ·      ·    ·   ·
                    GAME TITLE
          Destroy enemies in candlestick markets!

              [ player stats — 1 or 3 lines ]

                 CHOOSE YOUR MARKET
   [ Stablecoin ] [ Somnia ] [ Ether ] [ Bitcoin ]
     blurb          blurb      blurb     blurb
              market status / provenance line

                  (  PLAY GAME  )

              two lines of control hints
```

The **player-stats block** is one of four mutually exclusive things: a prompt to
connect; three stacked lines showing last score, best score and games played; a
prompt to play a first game; or a load-failure line.

The **market picker** is four chips side by side, each with a name and a wrapped
blurb line beneath. The selected chip is drawn differently from the others. Note
these four chips sit at a fixed 220px spacing across the full width — they do not
wrap.

The **market status line** states where the level data came from: still loading,
simulated because the exchange was unreachable, or a summary naming the market, how
many of the seven stages came from real trading, and whether the data is live on this
network or mirrored from the main network. This line is one of the clearest
expressions of what makes the product interesting, and it is currently a single small
line of text.

The **play button** changes its label while market data is still loading.

**Gameplay.** See 7.3–7.6.

**End of run.** Star field and floating decoration, a title that differs between a
win and a loss, four stat lines (final score, levels completed, attempts used, and an
efficiency rating chosen from six possible words), a best-score comparison line that
arrives asynchronously and may show either a new-record celebration or the existing
best, and two side-by-side buttons: play again, and back to the menu. A win also
triggers three particle fountains across the top for three seconds.

```
        ·   ·     ·      ·    ·       ·   ·
                  VICTORY!  /  GAME OVER
                   Final Score: 1,240
                  Levels Completed: 5
                 Total Attempts Used: 12
                    Efficiency: Good
                  [ best score line ]

           (  PLAY AGAIN  )    (  MAIN MENU  )
```

### 7.3 The play field

```
┌──────────────────────────────────────────────────────────────┐
│ Score                    Level                    Enemies     │
│ Total                 terrain caption                         │
│ Attempt              market ticker line                       │
│ position line                                                 │
│ fee counter                                                   │
│                                                                │
│                 ( auto-launch countdown )                     │
│                 ( key hint line        )                      │
│                                                                │
│ Angle Power                                          ▣ enemy  │
│  │     │        · · · · ·  trajectory preview     ▤ ▣ ▤ tower │
│  ◉     ◉                                    ▣        ▤        │
│  │     │   ╱ launcher                    ▤▤  ▤▤  ▤▤  ▤▤  ▤▤   │
│ 45°   50%                                barriers (1–3 blocks)│
│(LAUNCH)(END GAME)                                             │
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ground strip ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
└──────────────────────────────────────────────────────────────┘
```

A single full-canvas background image sits behind everything. The ground is a strip
of 24 tiles across the bottom. The launcher sits on the left at a fixed point and
rotates in place to show the current aim. Barriers begin partway across and repeat at
a fixed spacing to the right edge.

### 7.4 Everything drawn inside the canvas as text

This is the full list, and it is the key input to the decision in section 8.

**Top-left stack** — six readouts within about 100 vertical pixels:

| Readout | Content | Updates | When shown |
|---|---|---|---|
| Score | running score | on any score change | always |
| Total attempts | cumulative launches | every launch | always |
| Level attempts | used against a limit of three | every launch, resets per level | always |
| Position line | stake, current value, profit or loss in both absolute and percentage terms, the auto-sell threshold, and two key hints | every 4 seconds, plus immediately on any trading action | only during a trading run |
| Fee counter | orders placed and fees paid | with the position poll | only during a trading run |

The position line is the single longest string in the game — it packs six separate
facts and two key hints into one line. It also currently overlaps the same region as
the attempts readouts.

**Top-centre** — three stacked readouts:

| Readout | Content | Updates |
|---|---|---|
| Level | current level number | on level change |
| Terrain caption | which market, which timeframe, which date, and whether mirrored | on level change |
| Market ticker | a live heartbeat: connecting, waiting, or the last trade with its size and price plus commentary on book thinness and spread | on every incoming trade or book update |

**Top-right** — enemies remaining.

**Centre** — an auto-launch countdown and a key-hint line, both appearing only once
the countdown is armed and hidden again on firing.

**Beside the sliders** — a label and a live value for angle, and the same for power.

**Transient overlays:**

- A trajectory preview: a row of dots along the predicted flight path, covering only
  the first three-quarters of the arc so the landing point is hinted rather than
  given. Appears for 1.5 seconds after each adjustment.
- Action notices, centred and rising as they fade over about three seconds: ejecting,
  buying firepower, or being sold out at the floor.
- Breakout notices when a live price breaks the level's own high or low.
- A small rising score popup above each destroyed enemy.
- A level-transition banner: a full-canvas dimming overlay with the level number, the
  level's name, and a difficulty line, held for two seconds.

**Interactive canvas controls:** two vertical sliders with small circular handles
(angle and power), and two buttons (launch, end game).

### 7.5 How the game's art is constructed

- **Barriers** — one per candlestick, each a vertical stack of 1 to 3 blocks that are
  30 wide by 50 tall, drawn in one of two variants for a rising or falling price.
  Placed at a fixed spacing across the field.
- **Towers** — most barriers carry a stack of 2 to 7 smaller pieces on top, each 30
  by 20. The lowest is always a plain block; the ones above are randomly either
  blocks or enemies, with enemies becoming more likely the further from the launcher
  a tower stands. This is the difficulty curve made visible.
- **Enemies** — one of four sprite variants at random, roughly 40 pixels square,
  entirely stationary.
- **Launcher** — a single sprite, slightly enlarged and mirrored to face right,
  rotating to match the aim.
- **Explosions** — an expanding ring that fades over 400ms, about eighteen particles
  flung outward over 500ms, and a camera shake. The blast radius grows up to double
  when the market's order book is thin or the player has staked more.
- **Block breaks** — a small four-particle burst before the block disappears.
- **Enemy deaths** — an expanding ring, a rising score popup, and a sound.
- **Rocket trail** — a fading line following the rocket's last second of movement.
- **Barrier collapse** — when a live price breaks the level's recorded high or low,
  that wall's blocks fade, drop and rotate away in a staggered sequence over half a
  second, with a stronger camera shake.
- **Market tremor** — every incoming live trade shakes the camera briefly, scaled to
  how large the trade was. Suppressed while a rocket is in the air.

### 7.6 The interaction model

Step by step, as it works today:

1. Angle is changed either by dragging a small circular handle on a vertical slider,
   or by holding one of two keys which nudge it in 2° steps.
2. Power works identically on a second slider, in 5% steps.
3. **Any** adjustment arms an 8-second countdown, displayed at top-centre. If the
   player does nothing more, the rocket fires by itself when it expires.
4. The player can fire immediately at any time with a key or the on-screen button.
5. While a rocket is in the air all aiming input is locked out until it resolves.

Two further keys exist during a trading run: one sells the position without ending
the game, and one adds to the position, which makes explosions bigger.

Both sliders and both buttons already respond to touch, because the engine does not
distinguish finger from mouse. What does not exist is any touch *design*: the handles
are 8-pixel dots, and the arm-a-countdown model has no natural touch idiom.

### 7.7 The run, as a flow

```
Loading  →  Menu  →  Play  →  End
                      │
                      ├─ Aiming ──(adjust, or countdown expires)──→ Firing
                      │     ↑                                          │
                      │     │                                          ▼
                      │     └──── Impact ←──── In flight ──────────────┘
                      │              │
                      │              ├─ enemies remain, attempts left → Aiming
                      │              ├─ all enemies cleared → Level complete → next level
                      │              └─ attempts exhausted → Level failed
                      │
                      ├─ (trading only) Position open → Ejected, or Sold out at the floor
                      └─ player ends the run manually
```

Seven levels per run, three attempts per level.

---

## 8. A decision to make: where should the readouts live?

The text listed in section 7.4 currently sits inside the canvas. It could stay there,
or it could move into HTML layered on top of the game frame. This affects what you
can design, so it is worth deciding early. Both options are real.

**Option A — keep the readouts inside the game.**

They stay part of the game art and are specified alongside it.

- They sit in the same visual world as the game, so they can never drift out of
  alignment with it, and they scale with the canvas automatically.
- Anything anchored to a moving thing in the world — a score popping above an enemy,
  a notice above a collapsing wall — genuinely belongs here and is awkward anywhere
  else.
- But: text drawn into a canvas has a much narrower range of typographic control, and
  every adjustment is a code change rather than a stylesheet change. Positioning is
  by absolute pixel with no layout system, so a dense stack like the top-left cluster
  has to be hand-placed and hand-checked against every state.

**Option B — move the fixed readouts out into HTML on top.**

The score, attempts, level, terrain caption, market ticker, position line, fee
counter and enemy count become ordinary markup positioned over the game frame.

- Full typographic and layout control, real text wrapping, real animation, and they
  can be redesigned without touching game code.
- The dense top-left cluster becomes a layout problem with normal tools rather than
  six hand-placed strings.
- They can be made accessible to screen readers, which canvas text can never be.
- But: they must be kept aligned with the canvas as it scales, they are a second
  thing to position responsively, and values have to be published outward from the
  game rather than drawn where they are computed. That is real implementation work.

**A middle path** is available and probably worth considering: move the stable
informational readouts out (the stacks in the corners), and keep in the canvas only
what is genuinely anchored to something moving in the world (score popups, notices
tied to a specific wall, the trajectory preview).

The design should state which option it assumes.

---

## 9. Every piece of user-facing copy

Collected so the voice is visible in one place. The voice is currently inconsistent —
the marketing pages are exclamatory and emoji-heavy, while the trading panel is plain,
careful and precise. Worth resolving deliberately.

### Navigation and shell
Rocket Candle · Somnia Blockchain · Home · Play · Leaderboard · Connect ·
Connecting… · Disconnect · Disconnect Wallet

### Landing — hero
Rocket Candle · "Blast through candlestick barriers and earn WICK tokens on the
Somnia blockchain! Master physics-based gameplay in this revolutionary Web3 gaming
experience." · Ready to Play? · Connect Wallet · "Connect your wallet to start earning
WICK tokens" · Wallet Connected · Start Game · How to Play · "No wallet? Play a
practice run — real markets, nothing recorded."

### Landing — features
Physics Puzzle Game / "Master trajectory and timing to destroy enemies hidden in
market data structures." · Market-Based Levels / "Navigate through 7 procedurally
generated levels based on candlestick patterns." · Blockchain Integration / "Scores
stored on Somnia blockchain with WICK token rewards for achievements." · Compete &
Earn / "Climb the leaderboard and earn rewards for your gameplay skills."

### Landing — how to play
How to Play Rocket Candle · "Adjust launch power up/down" · "Adjust rocket angle" ·
"Launch rocket" · "Mouse — Aim launcher direction" · "Sliders — Fine-tune angle &
power" · Destroy All Enemies / "Eliminate all enemy characters to complete the
level" · Navigate Barriers / "Use candlestick barriers strategically or avoid them
entirely" · Beat Market Volatility / "Complete all 7 levels based on real market
patterns" · Enemy destroyed · Bonus for accuracy · Level completed · Perfect level
(no missed shots) · Each missed shot · Earning Tokens / "Complete levels and achieve
high scores to earn WICK tokens" · Token Uses / "Purchase power-ups and upgrades" /
"Unlock special rocket designs" / "Buy extra attempts per level" / "Access premium
game modes" · "All WICK tokens are stored securely on the Somnia blockchain" · Plan
Your Shots / "Study the level layout before firing - you have limited attempts!" ·
Use Physics / "Rockets bounce off walls and barriers - use this to reach hidden
enemies" · Master the Sliders / "Fine-tune your shots with the angle and power sliders
for precision" · Watch the Trail / "Follow your rocket's trail to understand
trajectory patterns" · Market Patterns / "Each level represents different market
volatility - adapt your strategy!" · Classic Mode / "Progress through 7 levels of
increasing difficulty based on market patterns" · Time Attack (Coming Soon) / "Race
against the clock to destroy enemies as fast as possible" · Precision Mode (Coming
Soon) / "Limited shots with maximum accuracy challenges" · "Ready to start your
journey? Connect your wallet and begin earning WICK tokens while having fun!" ·
"Sound Effect by freesound_community from Pixabay"

### Game page
Rocket Candle · "Destroy enemies, earn WICK tokens!" · Back · How to Play ·
"Controls: W/S keys to adjust angle, A/D keys to adjust power, SPACE to launch
rocket" · "Destroy all enemies to complete each level. You have 3 attempts per
level." · "Your scores will be saved to the blockchain!" · Loading Game… · Loading… ·
Game Ready · Wallet Connected · Wallet Disconnected · Player · WICK Tokens

### Trading panel
Play for keeps · "Your stake buys the token you are playing, for real, on DreamDEX.
It sells back when the run ends, and you can eject at any time with E without ending
your game." · Stake (USDso) · "This browser gets its own trading key. It can place and
cancel orders and can never withdraw your money." · "Three signatures now, then none —
no wallet popups between shots." · "If your position falls 10%, it sells and you play
on. This page watches that floor while it is open, and once a position exists you can
also rest the same floor on the exchange so it holds even with the tab closed." ·
"Trading fees are zero. The only cost is the gap between the buy and sell price,
crossed twice — about N USDso on this stake." · Enable trading · "Moving fills to the
exchange vault…" · "Approving USDso…" · "Depositing your stake…" · "Authorising this
browser to trade…" · "Trading is on. This browser's key … can trade for you, and
nothing else." · "Rest your 10% floor on the exchange itself and it keeps working with
the tab closed. Costs one wallet signature and a N STT deposit, refunded when you lift
it. It sells at whatever the book offers, within N% of the trigger." · Rest my stop on
chain · "Resting the stop…" · "A stop is resting on the exchange. If the price falls
10% below what you paid, your position sells itself — whether or not this page is
open." · Lift the stop · "Lifting…" · "There is no open position to protect yet." ·
"The stop could not be lifted — try again." · Withdraw N USDso · Revoke this key ·
"Revoking…" · "Revoking stops the key immediately, on chain. Withdraw first — the
money is yours and only your wallet can move it."

### Inside the game
Score · Total · Attempt · Level · Enemies · "Auto-launch in: Ns" · "W/S: Power | A:
Right | D: Left | SPACE: Launch" · Angle · Power · LAUNCH · END GAME · "Loading Market
Data…" · "Ready to Launch!" · "Destroy enemies in candlestick markets!" · CHOOSE YOUR
MARKET · "Reading the market…" · "Simulated market - exchange unreachable" · "{market}
- N of 7 stages from real trading, live on this network / mirrored from mainnet" ·
PLAY GAME · LOADING MARKET · "Use sliders to aim, LAUNCH to fire!" · "Limited attempts
per level - make them count!" · "market: connecting" · "market: live, waiting for a
trade" · "BOUGHT {qty} @ {price} · thin market, blasts reach further · wide spread,
strong drift" · "Staked N USDso · now N · +N (+N%) · auto-sell at -10% [E] eject [F]
+0.5 firepower" · "Position closed - playing on" · "orders placed: N · fees paid:
$0.00" · "Ejected - you keep N USDso (+N)" · "Floor broken at -10% - selling your
position" · "Bigger position, bigger blast - radius now Npx" · "PRICE BROKE THE
CEILING - the wall came down" · "PRICE BROKE THE FLOOR - the wall came down" · VICTORY!
· GAME OVER · Final Score · Levels Completed · Total Attempts Used · Efficiency
(Excellent / Good / Average / Poor / Needs Improvement) · NEW BEST SCORE! · Best Score
· PLAY AGAIN · MAIN MENU

### Leaderboard page
Leaderboard & Scores · "Weekly rankings and your game history" · Weekly Leaderboard ·
Week N · "No scores yet this week!" · "Be the first to play and earn tokens!" ·
Refresh · Your Game History · "No games played yet!" · "Start playing to see your
history here." · "Showing latest 10 games" · Total Games · Best Score · Total WICK ·
Avg Tokens/Game · You

### Practice page
Practice · "real markets, real interruptions. Nothing is recorded and no WICK is
earned." · "Connect a wallet to play for keeps"

### System messages
Wallet Connected · Wallet Disconnected · "Your wallet has been disconnected" · Network
Error · "Please switch to Somnia Network to play the game" · Network Switch ·
"Switching to Somnia network…" · Transaction Submitted · Transaction Confirmed · Score
Submitted! · Game Error · Blockchain Submission · "Preparing blockchain transaction…" ·
Verifying Run · "Getting your run signed…" · Wallet Confirmation · "Confirming
transaction in wallet…" · Blockchain Confirmation · "Waiting for blockchain
confirmation…" · Authentication Error · "User not authenticated" · Wallet Error ·
"Wallet not connected" · Contract Error · "Invalid contract configuration" ·
Validation Error · "Score validation failed" · Slow Down · Run Not Verified ·
Submission Failed · "Transaction was rejected by user" · "Failed to submit to
blockchain. Please try again." · Transaction Failed · Receipt Error · Authentication
Required · "Redirecting to home page…"

---

## 10. Page: `/scores` and `/practice`

### `/scores`

```
┌──────────────────────────────────────────────┐
│ Navigation bar                                │
├──────────────────────────────────────────────┤
│ HEADER: title + subtitle | 3 stat cards |     │
│         back button                           │
├──────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌───────────────────┐  │
│  │ WEEKLY          │  │ YOUR GAME HISTORY │  │
│  │ LEADERBOARD     │  │                   │  │
│  │ week label      │  │ up to 10 rows:    │  │
│  │ rows: rank,     │  │ level, date, score│  │
│  │ address, score  │  │                   │  │
│  │ (own row marked)│  │ "showing latest   │  │
│  │ [ refresh ]     │  │  10" footnote     │  │
│  └─────────────────┘  └───────────────────┘  │
├──────────────────────────────────────────────┤
│  [ tile ] [ tile ] [ tile ] [ tile ]          │
│  four lifetime stat tiles                     │
└──────────────────────────────────────────────┘
```

Three header stat cards: player name, best score, token balance. The latter two are
absent until data loads.

Both cards have empty states with their own copy. The player's own row in the
leaderboard is marked distinctly and shows "You" instead of an address.

The four lifetime tiles are absent entirely until data loads. There is no error state
for a failed data read — a failure simply leaves the sections permanently absent.
**Worth designing for.**

### `/practice`

No navigation bar. A single banner strip above the game frame, then the game. Two
elements total.

---

## 11. Responsive behaviour and structure

The existing behaviour, described as reflow rather than as values:

- **Wide** — full navigation row visible, multi-column grids throughout.
- **Around 1200px and below** — the game-info grid loosens from fixed columns to
  flexible ones.
- **Around 1024px and below** — the navigation links collapse into a hamburger menu;
  several multi-column grids drop to a single column; the wallet button loses its
  text and arrow, leaving only the status dot.
- **Around 768px and below** — the brand's two-line title disappears, leaving the
  mark alone; button rows stack instead of sitting side by side; large buttons go
  full width; the feature and how-to-play grids become single column; icon-beside-text
  rows become stacked.
- **Around 480px and below** — spacing tightens further, the stats grid becomes
  single column, small icons shrink.
- **Landscape on a short screen** — the navigation bar hides entirely to reclaim
  vertical space, the game frame is forced to fill the viewport height, and the
  leaderboard and history cards are forced into two columns rather than stacking.
- **Reduced-motion preference** — all animation is suppressed. Relevant, since the
  floating background, the brand mark and several hover effects all animate.

### Accessibility structure as it stands

- Landmarks exist for navigation, the page headers and the landing footer. The game
  and leaderboard pages have no main landmark around their primary content, and the
  practice page has no headings at all.
- Heading order has gaps: on the landing page, the four feature titles and the
  call-to-action heading are styled containers rather than heading elements, so they
  are invisible to anyone navigating by structure.
- Images all carry descriptive alternative text, though two different enemy sprites
  share the same description.
- Only one element in the entire application carries an explicit accessible label:
  the toast close button. The toast stack has no live region, so new messages are
  never announced — notable given that the entire score-submission flow communicates
  exclusively through toasts.
- No focus is moved when the wallet dropdown or the mobile menu opens, and neither
  traps focus.
- Everything drawn inside the game canvas is invisible to assistive technology by
  nature. This is one of the strongest arguments for option B in section 8.

---

## 12. Class name hooks that already exist

Names only — useful if the design wants to map onto existing structure. Grouped by
area.

**Shell:** landing-container, content-section, floating-rockets, floating-rocket,
floating-candle, somnia-logo, glass-card, glass-morphism

**Navigation:** navbar, navbar-container, navbar-brand, navbar-logo, navbar-title,
navbar-title-main, navbar-subtitle, navbar-nav, nav-link, navbar-wallet,
wallet-connected, wallet-info-dropdown, wallet-button, wallet-avatar,
status-indicator, wallet-details, wallet-name, wallet-address, dropdown-arrow,
wallet-dropdown, wallet-stats, stat-row, dropdown-divider, disconnect-button,
mobile-menu-toggle, hamburger, mobile-menu, mobile-nav-links, mobile-nav-link,
mobile-wallet-info, mobile-stats, mobile-stat, mobile-disconnect

**Hero and call to action:** hero-section, hero-title, hero-subtitle, hero-practice,
wallet-section, auth-text, auth-title, auth-subtitle, play-button

**Buttons:** btn, btn-primary, btn-success, btn-glass, btn-large, btn-back,
loading-spinner-small

**Features:** features, feature-card, feature-icon, feature-title

**How to play:** how-to-play-section, how-to-play-container, how-to-play-title,
how-to-play-grid, how-to-play-card, card-header, card-icon, controls-list,
control-item, key-combo, key-icon, small-key, space-key, objectives-list,
objective-item, objective-icon-group, target-icon, small-sprite, objective-icon,
scoring-details, score-item, negative, score-points, token-details, token-item,
token-header, token-icon, tips-list, tip-item, tip-number, modes-list, mode-item,
mode-header, mode-icon, coming-soon, how-to-play-footer, footer-tip, tip-icon

**Game page:** game-header, game-header-content, game-title-section, game-title,
game-subtitle, game-header-stats, stat-card, stat-label, stat-value, highlight,
game-instructions, instructions-title, instructions-content, game-info-section,
game-mechanics-panel, game-container, game-notifications-container, game-stats-section

**Toasts:** notification-item, notification-success, notification-error,
notification-warning, notification-info, visible, removing, notification-content,
notification-icon, notification-message, notification-title, notification-text,
notification-close

**Trading panel:** trading-setup, trading-setup-blurb, trading-setup-field,
trading-setup-facts, trading-setup-ready, trading-setup-note, trading-setup-error,
trading-setup-stop, trading-setup-actions

**Practice:** practice-page, practice-banner, practice-banner-link

**Leaderboard:** dashboard-container, dashboard-games-section, dashboard-card,
dashboard-header, dashboard-title, leaderboard-container, leaderboard-item,
current-player, leaderboard-info, leaderboard-rank, leaderboard-address,
leaderboard-score, empty-state, stats-grid, stat-item

---

## 13. What the design needs to deliver

To be implementable, the design should cover:

1. **Every state**, not just the happy path. The trading panel alone has eleven; the
   leaderboard has empty, loading and populated versions of two separate lists; the
   score submission has a dozen distinct failure messages.
2. **A decision on the canvas** — fixed shape with designed surroundings, or a
   reshaping canvas with the play field relaid out.
3. **A decision on the readouts** — section 8.
4. **A touch interaction model** for aiming and firing, if phones are in scope.
5. **A position for the toast stack** and a rule for what happens when several fire
   in quick succession.
6. **A resolution of the two voices** — the exclamatory marketing copy and the plain,
   careful trading copy currently read as two different products.
