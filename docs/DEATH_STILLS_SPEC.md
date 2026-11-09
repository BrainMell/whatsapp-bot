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
| **The body** | KO'd pose: knocked off its stance, lying on the ground line, desaturated/darkened | Pose does most of the work — a standing sprite can never read as dead (JRPG faint convention) |
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
| **FIRE** | `magic/Fire-bomb*.png` peak + `fire2/blast_*.png` + Kenney `p_scorch`, `bsmoke` | Fireball peak engulfing the body, scorch mark at the feet, ember specks, smoke wisp rising |
| **ICE** | procedural (no ice set in repo), painted once + cached | Shard spray around the body, frost patch on the ground, sparkle crosses |
| **WATER** | Kenney `puff` tinted + procedural | Splash ring, droplet spray, ground puddle under the body |
| **VOID** | `magic/Dark-Bolt*.png` peak + Kenney `gas` | Dark implosion frame, purple motes spiraling INWARD to the body's centre, dark wisps |
| **EARTH** | Kenney `p_dirt`, `bsmoke` + procedural rubble | Dirt/debris chunks settled around the body, dust cloud, ground cracks |
| **DUST** | Kenney `bsmoke`, `puff` | Gray dissolve motes drifting up, settled puffs — the generic fallback |

Universal layer on every kind: soft white impact flash ring at the body's
centre; ☠ **DEFEATED** chip where the erased HP bar was; the fallen body
(rotated ~100° around its feet, sunk to the ground line, desaturated ~65%,
darkened, α≈0.92). Group kills composite every fallen body into the ONE still
(group-as-unit, same rule the clips had).

## 3. Architecture

```
playEnemyDeaths(state)                        guildAdventure.js — now trivial
  └─ _deathScene(state)                       shared per-fight Go layers (UNCHANGED)
  └─ deathStill.renderDeathStill({
       layers, picks, deadIdx, chrome })
       ├─ scenePlateCanvas()                  survivors + erased bars + HUD (moved
       │                                      from deathOverlay.scenePlate, returns canvas)
       ├─ dead-state cutout per pick          rotate/desaturate/darken (node canvas)
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
