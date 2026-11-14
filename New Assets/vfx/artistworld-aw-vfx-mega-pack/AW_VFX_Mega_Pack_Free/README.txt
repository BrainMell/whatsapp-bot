AW - VFX MEGA PACK (FREE)
by artistworld

114 pixel-art VFX for any 2D game, in 10 categories, each in 2 sizes
(Small for ~48-64 px characters, Large for bosses / big characters), animated at 15 fps.
Full list with sizes and frame counts: asset_list.txt

------------------------------------------------------------
CATEGORIES
------------------------------------------------------------
01_Explosions           9   ground, air, small, energy, toxic, dark, debris, electric
02_Impacts             10   hit sparks, heavy, directional, critical, blunt, block, parry, fire, ice
03_Slashes             11   horizontal, vertical, diagonal, spin, X, heavy, wave, stab, claws, punch, dash
04_Spells              18   fire, ice, lightning, arcane, poison, holy, shadow, earth, wind, water
05_Charges              8   charge-up / charged hold / release for fire, ice, lightning, arcane
06_Heal_Shield_Buffs   11   heal, regen aura, shield (bubble / hit / break), buff, debuff, level up, teleport
07_Smoke_Dust           9   puffs, jump / land / run / dash dust, spawn poof, rising smoke, steam
08_Status              10   burn, freeze, poison, stun, sleep, shock, bleed, confuse, charm
09_Pickups_Sparkles    10   pickup flash, coin sparkle, collect ring, item shine, twinkle, XP orb,
                            chest coins, confetti, firework, sparkle trail
10_UI_Symbols          18   12 emote icons (! ? heart, broken heart, anger, sweat, dots, music, idea,
                            skull, check, cross) + 6 texts (LEVEL UP!, CRITICAL!, MISS, K.O.,
                            VICTORY!, GAME OVER)

------------------------------------------------------------
FOLDERS
------------------------------------------------------------
<Category>/<Effect>/<Small|Large>/<Effect>_<Size>_sheet.png   horizontal spritesheet (one row, equal cells)
<Category>/<Effect>/<Small|Large>/frames/                     same animation as single PNG frames
effects.json   machine-readable data for every effect and size:
               frame size, frame count, loop, pivot (anchor point in pixels), frame time (67 ms)

All sprites: PNG, transparent background, no semi-transparent pixels (crisp pixel art).
Directional effects (projectiles, slashes, muzzle) face RIGHT - flip horizontally for left.

------------------------------------------------------------
HOW TO USE (any engine: Godot, Unity, GameMaker, etc.)
------------------------------------------------------------
1. Import the sheet with nearest-neighbour / "point" filtering (no smoothing).
2. Slice by the cell size in asset_list.txt (cells are equal, 1 row).
3. Play at 15 fps (67 ms per frame). Effects marked LOOP loop seamlessly.
4. Place the effect at its pivot (effects.json). Ground effects (ground explosions, dust, pillars,
   heal, level up, teleport...) are anchored at the bottom center; the rest at the center.
5. Status effects are made to sit on a character: icons and stun / sleep / confuse / charm above the
   head, poison / bleed / shock on the body. UI symbols: hold the last frame as long as you need.

Make it feel great (optional, done in your engine, NOT part of the sprites)
- The preview GIFs use an additive glow / bloom and light on the background. That look comes
  from the game engine (an additive light or bloom pass), it is not baked into the sprites.
- Hit-stop: pause the game 30-50 ms on light hits, ~80 ms on heavy hits.
- Screen shake: 2-3 px for hits, 3-5 px for explosions.

License: see LICENSE.txt
