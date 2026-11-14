# Guild War Conquest (flag: `GW_CONQUEST=1`)

Code: `core/rpg/systems/guildwar/conquest/`. Off by default; with the flag unset nothing here is reached.
Hooks (4 small edits): `guildwar/dmRouter.js` (`cq …` verbs), `guildwar/state.js` tick (`conquest/ticker.js`), `commands/rpgCommands.js` mine (Aether Seam), `summonCards/system.js` (`gem_shop` source), `models/User.js` (`gems`).

## World
Seeded (per war eventId), regenerated identically on every instance; DB stores only overlays. 5 realms x 12 provinces x 25 tiles = 1,500 tiles.
Kinds: plain, village, forest, pass, ruins (ritual), shrine (treaty), gem_vein, fortress (siege), ley_gate, titan, keep. Realm gates bridge realms in a ring. ~30 keeps (guild starts, spread across realms), 5 titan lairs, ~32 finite gem vein tiles.

## Orders
- Solo march (master/officer), Muster (join window, up to 12, one army), Detachments (`send`; target must `accept`, or has `auto on`).
- In transit/in a fight = locked (`engine.locked`); non-combat commands still work. ETA = tiles x 45s, clamped 20s-8min. `recall` forfeits the claim.
- Officers have an hourly order budget. Power warning before a hopeless send.
- War Writs: master-only teleport; cost = base + distance/5 + heads/3; only to held Ley Gates or one tile past the border; one Skyfall deep strike per war (8 writs).

## Claiming
skirmish (undefended: instant), siege (Wall Breach), ritual (glyph puzzle, 4 tries), treaty (supplies / treasury gems / oath), titan (3-golem boss, buffed). Fresh conquests shield 5 min; failed assaults rest the garrison 90s but wall damage persists.

## Defences (held tiles; paid in supplies, buffs in gems)
Wall wood/stone/runed (upgrade/repair), golems clay/stone/iron/rune (max 6), turrets ballista/flame/arc/frost (max 4, mounted on towers), `upgrade` to lvl 4, `buff atk|hp` x3 stacks of +15%. A conquered tile loses its defences (the winner must rebuild).

## Wall Breach encounter (`breach.js`, `envCards.js`)
Wall = gate 40% / left tower 20% / right tower 20% / curtain 20%. Each round (75s, or when all have acted) one of 29 environment cards is drawn (biome-weighted, no repeats) and re-prices every siege tool: ram, ladder, sapper (2-round mine), fire (burn 3 rounds), rune (ignores wall type, strips wards), shield, scout (weak point +40%). Towers carry the turrets: destroy a tower, silence its turrets. Gate falls -> golem phase (strike/guard/shatter/lure/rally); curtain + ladders = escalade (-10% HP, still faces golems). Combos: kindled ram on wood, focus fire, oil/tar ignition.

## Gems
`user.gems` is the persistent balance (name: Aether Gems, distinct from the `rare_gem` item). In war: mine finite veins (`cq mine`, speed/yield from the **Mines building level**, the live mining progression), ore is carried (max 400, lose half if beaten), `cq bank` at a held Keep/Ley Gate (15% tithe to guild treasury, 1,500/war cap). Peacetime: 0.4% Aether Seam per `mine` command. Summon shop: `cq shop` / `cq buy <card>`; commons/uncommons always, 3 rares daily, 1 legendary weekly.

## Load model
One Mongo doc per war, optimistic version retry; ~30-40 KB at end of a 6-guild sim. No rendering in the hot path (text interface). Tick runs under the existing flow lease.

## Art & images (`sprites.js`, `render.js`, `art.js`)
No hand-drawn placeholders. Siege scenes use: the bot's biome backdrops (`environment/cards/*.jpg`), baked CC0 DCSS walls/floors/gates/statue turrets (`rpgasset/guildwar/conquest/`, bake script `scripts/conquest/bake_assets.py`, logged in `rpgasset/ASSET_LICENSES.md`), the bot's own enemy sprites as golems/Titans, bot FX (fire) for burning, and **each invader's real character sprite** (same class/spriteIndex resolver as ruins and profile cards, stored on the player at registration, drawn with foot alignment). The realm map tiles real floors, places DCSS keep/fortress/ruins sprites and the realm Titan, and marks the viewer with their character portrait. Weather particles per environment card are the only procedural layer. Rendered in the renderWorker child (`type:'conquest'`), memory-gated; failure falls back to text.

## Not built yet (planned)
Research tree, pacts/tribute, scouts/decoys, group announcements, bespoke per-kind golem art (kinds currently reuse/regrade the bot's earth/ice elementals). Balance numbers are unplaytested live (sims only): see `CFG`.
