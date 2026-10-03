# EXPLORATION GUIDE — Everything Implemented & Where to Find It

> Owner-facing map of the cosmology pass (commit 70f5684 + this pass's rulings).
> Every system, every command, and the exact place in the world where it lives.
> Prefix shown as `.j` — the real prefix follows `botConfig`.

---

## 0. THE ONE-LOOK TABLE — "I want to ___ , so I go to ___"

| You want to… | Command | Where in the world | Gate |
|---|---|---|---|
| See the whole cosmology | `.j world` | The First World (its own sheet) | none — open from the start |
| Chart the outer boundary | `.j world beyond` | The World Beyond | adventurer rank **S** |
| Chart the shore of the dead | `.j world afterlife` | The Afterlife | dead-soul reading (not taught yet → always locked for now) |
| Chart the descent | `.j world abyss` | The Abyss | **level 20 (CONFIRMED by owner, 2026-09-19)** |
| Dive a dungeon-world | `.j abyss enter` | beneath the circles, ring by ring | 12h cooldown + the universal 6h gate |
| Hunt corrupted worlds | `.j adventure` / `.j solo` / `.j raid` | all four quadrants of the First World | per-activity rules |
| Repair your gear | `.j repair <slot/#>`, `.j repair all`, `.j inspect` | the blacksmith | ZENI cost |
| Brew | `.j brew <potion_id>`, `.j recipes` | the brewery / anywhere brewing is allowed | ingredients |
| Buy / trade | `.j shop`, `.j buy`, `.j itemmarket`, `.j transfer`, `.j deposit`, `.j withdraw` | towns & the market | ZENI |
| Heal | `.j hospital` / `.j heal` | the hospital | ZENI |
| Socket & fuse runes | `.j rune …` | the enchanter | runes + ZENI |
| Read old lore on demand | `.j lore` | the archive | untouched — lore drops are a NEW, separate system |

---

## 1. THE WORLD CHARTS (`.j world` family)

Four live Royal Decree sheets (node-canvas), each rendering the exact pass-3
geometry with **live orbital status lines** under the image. Every render path
keeps a text fallback (house rule: cards never dead-end). Hard gate contract:
**a locked chart is never rendered — the reply names the requirement and nothing else.**

### The captions ARE exploration guides
Each sheet's caption tells you where to explore and what to find (or what finds
you) in that area:

- **First World** — the everyday world: guild hunts (`.j adventure`, `.j solo`,
  `.j raid`), corrupted worlds and dungeon-worlds in all four quadrants; the
  blacksmith, brewery, enchanter, shop and hospital are all here.
- **World Beyond** — the space the First World does not occupy; god-rank realm.
  Rank S earns the chart, not the crossing. Unnamed things are not found —
  they find you.
- **Afterlife** — the shore along its own circuit, where the dead arrive and
  some wait. Shut to the living until the dead-soul reading exists.
- **Abyss** — the descent: floor bands of what finds you (see §3), the 6h entry
  cycle, and the deep finds that feed the deep brews (see §5).

---

## 2. THE FOUR CLOCKS (`core/rpg/cosmology.js`)

**Four separate systems — never merged (design rule #16).** Pure functions of
wall time anchored at `T0`; restart-stable, zero persistence.

| Clock | Period | What it drives |
|---|---|---|
| **First World orbit** | 5 real hours, clockwise | 1 crossing = **5 game days** under its sky. Order/Presence sits at the FW center and rides with it. |
| **Abyss entry cycle** | 6 real hours | **5h locked + 1h open**. Gates ENTRY ONLY — the window closing never pulls anyone back out. |
| **Afterlife circuit** | ~2 real days | Its own path, sharing nothing with the First World's. |
| **Triune alignment** | recurs ~weekly by construction | A **checked state** (FW at its bottom link AND the Afterlife at its point). Renders as the wax-red beam on the sheets. |

**Triune ruling (owner, 2026-09-19): LATER PHASE.** The window fires and stays
flaggable (`cosmology.triuneWindow(t)`), but nothing is scheduled on it yet —
the consequence mechanic (ideas #13 candidates: veil-thins lore window /
multi-server encounter / cosmetic blessing / quest hook) is deliberately
deferred.

You can read all four clocks on any sheet's status lines, e.g.:
> the First World: 18% through its crossing (one orbit = 5 hours = 5 days under its sky)
> the abyss gate: locked 3h 5m
> the afterlife: 54% through its own circuit (~2 days)
> the three are not aligned (the alignment is read, not scheduled)

---

## 3. THE ABYSS — WHAT FINDS YOU, FLOOR BY FLOOR

Enter with `.j abyss enter` (12h cooldown; entry obeys the universal 6h gate).
Every entry generates a **new dungeon-world** — the count is endless.

| Depth band | Variant chance | Who you meet |
|---|---|---|
| **Floors 1–30** | 0% | regular creatures only |
| **Floors 31–49** | 12% | **WANDERER**s (other classes on player builds); **MIRROR**s can replace bosses (15%) |
| **Floors 50–89** | 20% | + **OTHER BANNER**s march (50/50 with wanderers) |
| **Floors 90+** | 25% | + **TIMELINE DRIFTER**s (40% share of variant spawns) |

- Variants reuse the existing MONSTER_ARCHETYPES ability tables — no new
  mechanics, pure identity horror.
- **Global dungeon swap:** 5% of standard dungeon encounters anywhere in the
  First World can include one WANDERER of your class family — same stats,
  different name/tag/sprite (data-level; balance untouched).
- **NPC sightings:** non-hostile floors can carry an 8% sighting beat.
- **Fixed sprite bug (UI-CB-15):** every abyss enemy now carries a real
  element-family sprite (was: everyone rendered as slot 0 — the bat).

**Deep finds:** abyss boss tiers pay guaranteed **void essence** (MYTHIC);
elite tables pay **ghost essence** and **obsidian chunk** — exactly what the
deep brews want (§5).

**Run controls:** `.j abyss resume` · `.j abyss collect` · `.j abyss choose <1/2>`
· `.j abyss skip` · `.j abyss status` · `.j abyss retreat` (extract with 100% loot).

---

## 4. LORE DROPS — WHERE THE WORLD MURMURS

Plain chat text in the `╒ *line* ╛` format. **Never baked into image cards,
never on failure paths, never two in one reply.** 30-min per user+chat
cooldown; a 10-line per-chat recent ring prevents repeats; "important" lines
weighted 0.4.

| Surface | Chance | Pool |
|---|---|---|
| Fight openers (abyss floor intros) | 10% | `encounters_opener` |
| Humanoid enemy barks | 15% | `encounters_bark` |
| Victory observations (abyss) | 12% | `encounters_env` (routed by variant tag + depth) |
| Pack-fight creature line | 10% | `abyss_unknown_creature` |
| NPC sightings | 8% | `encounters_npc` |
| Blacksmith repair success | 10–12% | `blacksmith` |
| Crafting / brewing / cooking / forging success | 10% | `crafting` / `brewing` |
| Rune socket / fuse / remove / destroy | 10% | `enchanting` |
| Hospital healing | 10% | `healing` |
| Trading (transfer / deposit / withdraw / buy) | 10% | `trading` |
| Potion use healing beats | 10% | `healing` |
| Menu tips slot | 1-in-6 | `general_world` |

The five abyss pools (`abyss_player`, `abyss_distorted_player`,
`abyss_timeline_person`, `abyss_self_variant`, `abyss_unknown_creature`) are
routed by variant tag first, depth heuristics second.

---

## 5. BREWING — THE DEEP BREWS

Command: `.j brew <potion_id>` · recipe list: `.j recipes`.
All three reuse existing effect ids and ingredient ids — they auto-registered
into the item DB through the existing injection (zero schema changes).

| Brew | Effect | Ingredients | Rarity |
|---|---|---|---|
| **Abyssal Tonic** (`abyssal_tonic`) | restores ALL Energy; "the color is not from any berry" | void_essence ×1 · mana_crystal ×2 · mana_dew ×2 | EPIC |
| **Warden's Broth** (`warden_broth`) | restores 60% Max HP; "hospital broth made the soldier way" | healing_herb ×8 · mana_dew ×2 · ghost_essence ×1 | RARE |
| **Banner Ale** (`banner_ale`) | +35% ATK and MAG for 3 turns (battle only); "forge-town courage in a cup" | strength_brew ×2 · obsidian_chunk ×2 | UNCOMMON |

**Where the ingredients come from:** void essence — abyss boss tiers (guaranteed
MYTHIC drops) and SS/SSS-rank tables; ghost essence + obsidian chunk — elite
enemy tables; mana crystal / mana dew / healing herb / strength brew — ordinary
shop and dungeon supply chains.

---

## 6. REPAIR — THE BLACKSMITH'S VOICE

Commands: `.j repair <slot_name/index>` · `.j repair all` · `.j inspect <#bag_index|slot>`
· `.j blacksmith` (full shop surface). Condition icons: 💔 BROKEN → 🟧 SEVERE →
🟨 MINOR → 🟩 GOOD. ZENI cost scales with damage. Success replies can carry a
blacksmith lore drop (10–12%).

---

## 7. GATES & UNLOCKS AT A GLANCE

| Thing | Opens at | Status |
|---|---|---|
| `.j world` (First World sheet) | day one | **open** |
| `.j world beyond` | rank S | **open** at rank S |
| `.j world abyss` | **level 20** | **CONFIRMED** (owner, 2026-09-19) — constant `ABYSS_MAP_UNLOCK`, still retunable |
| `.j world afterlife` | dead-soul reading | **locked** until the feature ships (never renders, by contract) |
| `.j abyss enter` | 12h cooldown + 6h universal gate | **live** |
| Variant enemies | floors 31 / 50 / 90 | **live** |
| Deep brews | ingredients | **live** |
| Triune consequence | — | **deferred** ("later", owner 2026-09-19) |

---

## 8. ENGINEERING NOTES (what "no bugs" means here)

- **QA suites:** `node scripts/qa_cosmology_pass.js` (clocks, geometry
  invariants, lore format/cooldown/routing, spawn policy, gate math) and
  `node scripts/qa_integration_pass.js` (mock-sock flows: locked = zero image
  bytes, all four sheets render, variants spawn, brews registered).
- **Visual review:** `node scripts/render_world_maps.js <outdir>` renders all
  four sheets for eyeball triple-checking.
- **Iron rules held:** `.j lore` untouched; zero Mongoose schema changes; no
  Go image-service changes; design-package docs and `superseded/` folders
  preserved; four clocks never merged.
- Tuning knobs live in `loreDrops.CONFIG`, `enemyVariants` constants,
  per-surface chances at call sites, and `worldMap.ABYSS_MAP_UNLOCK`.
