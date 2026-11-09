# ☠️ DEATH STILLS — static death images replace the animated death clips

Owner 2026-11-09: *"move away from deaths being animated to them being images …
remove all our current death animation implementation in favor of it, it should
also use premade art btw, research how to communicate enemy death in a static
image and all the different types for the different enemy types. I got this idea
from this explosive thing glm made for when enemies attack — that doesn't mean
look at it and use it for everything lol."*

The "explosive thing" is `hitFx.js` — the static HIT REACTION (2026-11-07,
owner: "can we get that feel with a still image?"): slash sprite + recoil
double-image + impact burst painted onto the still battle card. Death stills
apply the same philosophy to the kill moment — **not** by cloning the slash
look, but by giving every death type its own static visual language.

## 1. Research: how a static image communicates death

Classic turn-based RPGs read a kill in a still through four stacked signals.
Any one alone is ambiguous; together they are unmistakable:

| Signal | Convention | Why it works |
| --- | --- | --- |
| **The body** | OWNER DIRECTIVE v3 (2026-11-09): the KO'd sprite is a barely-noticeable GHOST at its exact fall position (α≈0.14, no contact shadow, no desaturation). v2's readable corpse (α≈0.97 + 0.38 shadow) read as "a sprite sleeping on the floor" and was rejected | The element stamp + ☠ DEFEATED chip carry the kill; the ghost only whispers where it fell |
| **The world reacts** | Element breakup art engulfing/replaceing the body: explosion, shards, splash, rubble, dissolve | The cause of death is visible in the corpse's state |
| **The UI confirms** | Zeroed/erased HP bar, ☠ DEFEATED chip where the bar was | System-level confirmation, zero ambiguity at a glance |
| **Absence of motion cues** | Nothing mid-swing; effects frozen at their PEAK frame, settled debris on the ground | A still frozen at the "after", not the "during", reads as concluded |

Peak-frame rule: every premade VFX sequence (12-frame fire bomb, dark bolt,
smoke puffs) contributes exactly ONE frame — the visually fullest one — never
an early/late frame that reads as "attack starting" or "nothing happened".

## 2. The six death types (classifyDeath, moved verbatim from skillVfx.js)

Element data wins first (element → type → family → category), name/id keyword
sweep is the fallback, `abyss_` id prefix forces VOID, everything else DUST.

| Kind | Premade art (core/rpgasset/vfx, all CC0 — see CREDITS.md) | Composition on the still |
| --- | --- | --- |
| **FIRE** | `fire2/blast_*` + `fire2/jet_*` + Kenney `sexp` smoke, `flash` core | Blast core mid-body, SOFT radial scorch + cinders (procedural — the kenney `ground_*` flat-bottom decal is banned, it read as "partly cut off clearly a png"), ember motes, smoke |
| **ICE** | procedural (no ice set in repo), painted once + cached | Shard spray around the body, frost patch on the ground, sparkle crosses |
| **WATER** | Kenney `puff` tinted (foam/mist) + procedural crown | Soft-gradient puddle (no outline), CROWN splash of 9 tapered spouts with a 3-stop value ramp (tall centre → short flanks), highlighted droplets — no drawn rings, no pancake, never a sprite-sheet strip drawn whole |
| **VOID** | `magic/Dark-Bolt*.png` peak + Kenney `gas` | Dark implosion frame, purple motes spiraling INWARD to the body's centre, dark wisps |
| **EARTH** | meteor `boulder_*` (partial tint keeps shading) + Kenney `p_dirt`, `bsmoke` + procedural | Flying chunks frozen at their ballistic peak, settled boulders sunk past the ground line, gradient polygon rubble, lit-edge radiating cracks + impact burst star |
| **DUST** | Kenney `bsmoke`, `puff` | Gray dissolve motes drifting up, settled puffs — the generic fallback |

### 2.5 Stamp design rules (v4 — written after the owner's third rejection)

Grounded in standard game-VFX practice (shape language first, value ranges,
color ramps, composition — the standard artistic VFX principles; crown-splash
construction for water; "explode into a cloud that resembles their shape" for
deaths) and in every failure v2 shipped:

1. **Silhouette first** — one dominant focal shape per kind (fireball, crown,
   rock burst); supports stay small and quiet.
2. **Ground marks are soft radial gradients, NEVER pasted decals.** The
   kenney `ground_*` sprites are flat-bottomed icon art — pasted raw they read
   as a cut-off PNG. Scorch, puddles, dirt shadows = `softBlob()` gradients.
3. **3-stop value ramps** on every drawn shape (core → mid → rim).
4. **Never draw a sprite sheet whole** — `attack*.png` are multi-frame strips;
   drawing one whole was the cyan smear.
5. **Partial tint only** (`source-atop` overlay) — full `source-in` tint
   flattens premades into donut blobs (the v2 earth boulders).
6. **Eyes-on gate**: full-res inspection of every panel of the
   `qa_death_visual.js` sheet before anything ships (owner rule:
   "always visually inspect").

Universal layer on every kind: ☠ **DEFEATED** chip where the erased HP bar
was; the fallen body as a GHOST (rotated ~100° around its feet, sunk to the
ground line, α≈0.14 — position/rotation/scale UNCHANGED from v2, owner
directive 2026-11-09). The v1/v2 white flash ring was removed in the art
pass (it washed the frame toward white). Group kills composite every fallen
body into the ONE still (group-as-unit, same rule the clips had).

## 3. Architecture

```
playEnemyDeaths(state)                        guildAdventure.js — now trivial
  └─ _deathScene(state)                       shared per-fight Go layers (UNCHANGED)
  └─ deathStill.renderDeathStill({
       layers, picks, deadIdx, chrome })
       ├─ scenePlateCanvas()                  survivors + erased bars + HUD (moved
       │                                      from deathOverlay.scenePlate, returns canvas)
       ├─ dead-state cutout per pick          rotate + ghost α≈0.14 (node canvas)
       ├─ death stamp per kind                PRE-PAINTED ONCE per (kind, boss) into a
       │                                      transparent PNG, disk+memory cached
       │                                      (os.tmpdir/death_stamps_v1) — the "premade"
       │                                      rule: no per-kill procedural repaint
       └─ jpeg export (q0.85, ~100-200KB)     one image message, sub-second
```

Performance: warm still ≈ 100-250ms of canvas work (vs 18-24s mp4 bakes);
first still in a fight pays the shared scene fetch the board already warmed.
No pre-bakes, no leashes, no held clips, no merges — the still renders at
delivery time because it is cheaper than the old machinery's bookkeeping.

## 4. Removed (the animated implementation)

- `guildAdventure.js`: `_concatMp4`, `_deathClipForCardKill`, `_bakeDeathClip`,
  `_bakeGroupDeathClip`, `_jpegDims`, `MERGE_W/H`, `_mergeOverlayMaterialsWithCardRaw`,
  `_mergeDeathClipsWithCard`, `_flushHeldDeathClips`, `_flushHeldTurnClips`,
  `startDeathBake`, the bake worker queue (`_deathQueue/_deathPump/_deathEnqueue`),
  `_hpSig`, held-clip fields (`state._heldDeathClips`, `_deathJob*`, `_deathBake`),
  the kill-turn merge block in nextTurn, the summon-card parallel death clip
  (§2.5) — card kills now get their still from the normal death delivery.
- `skillVfx.js`: `renderDeathVideo`, `classifyDeath`, `DEATH_RULES`,
  `DEATH_PALETTE` (the latter three moved to deathStill.js).
- `deathOverlay.js`: deleted (its overlay-frame cache served mp4 encodes; the
  still needs one stamp, not N frames). Old QA scripts
  `qa_overlay_cache_prune.js`, `qa_death_strike.js` removed with it.
- Kept: `_deathScene`, `_deathChrome`, `_deadEnemyIndices/_deadSetSig`,
  `_aliveSig` (scene cache key), `_deathCaption` (rewritten for the still item
  shape — same ☠️ lines + 📜 COMBAT LOG block), `hitFx.js` (attacks), the
  ultimate animation system (unrelated), Go renderer (unrelated).

## 5. Env / QA

- `DEATH_STILL_CHROME=0` skips the HUD chrome on the still (debug).
- `qa_death_stills.js`: synthetic-layer end-to-end — all 6 kinds render, stamp
  cache hits on second call, group still composites, JPEG validates, dead
  sprite provably present (pixel diff at the anchor).
- `qa_death_visual.js`: EYES-ON gate — renders all 6 kinds + a group kill
  through the REAL Go renderer into `/tmp/deathqa/sheet.png`. **No death-still
  change ships without visually inspecting the sheet panel by panel**
  (owner rule, 2026-11-09: "always visually inspect").
- `qa_ghost_probe.js`: liveness probe for the ghost pass — renders the same
  kill with the real cut vs a magenta stand-in cut; the fall region must
  pixel-diff, proving the α≈0.14 body pass is not a silent no-op.
