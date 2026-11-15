================================================================================
SEAHILL DUNGEON - STYLIZED MODULAR CRYPT PACK (COMPLETE EDITION)
================================================================================
Creator: See Hiong
Studio:  Seahill Studio (https://seahill.studio)
Store:   https://seehiong.itch.io
License: Creative Commons Zero (CC0 1.0 Universal) - Public Domain Dedication
================================================================================

Thank you for supporting Seahill Dungeon!
The Complete Edition holds all 60 handcrafted, low-poly modular pieces,
including the starter crypt set: four paired floor and wall materials, platforms,
stairs, pools, drains, burial niches, timber guard towers, furniture and torches.

--------------------------------------------------------------------------------
1. PACK CONTENTS (60 UNIQUE MODELS)
--------------------------------------------------------------------------------
Models/GLB/
├── Floors (1m tiles):
│   ├── floor.glb                   (Flagstone Floor)
│   ├── floor_a.glb                 (Cracked Flagstone Floor)
│   ├── floor_b.glb                 (Shattered Flagstone Floor)
│   ├── floor_wood.glb              (Nailed Wood Planks)
│   ├── floor_sand.glb              (Drifted Sand)
│   ├── floor_mud.glb               (Trodden Mud with a puddle)
│   ├── floor_pool.glb              (Pool Bed: silt, pebbles and algae)
│   ├── floor_drain.glb             (Flagstone Floor with a round drain)
│   ├── floor_grate.glb             (Drain Grate over a 1m water shaft)
│   └── floor_grate_end / _straight / _corner / _tee / _cross.glb
│                                    (Drain Channel pieces, open on 1-4 sides,
│                                     that join into one running drain)
├── Walls (1m long, 1m tall, 25cm thick; stack two for 2m):
│   ├── wall.glb                    (Brick Wall)
│   ├── wall_cracked.glb            (Brick Wall with a jade-lit crack)
│   ├── wall_wood.glb               (Timber Plank Wall)
│   ├── wall_earth.glb              (Rammed Earth Wall with fieldstones)
│   ├── wall_corner.glb             (Outer Corner Pillar, brick)
│   ├── wall_corner_wood.glb        (Outer Corner Post, iron-banded timber)
│   ├── wall_corner_earth.glb       (Outer Corner Pillar, fieldstone)
│   ├── wall_top.glb                (Wall Coping Slab, capstone)
│   ├── wall_top_wood.glb           (Wall Coping Slab, dark boards)
│   ├── wall_top_earth.glb          (Wall Coping Slab, packed mud)
│   ├── wall_niche.glb              (2m Burial Niche, coffin-sized recess)
│   └── wall_niche_small.glb        (Arched Shelf Niche)
├── Platforms, Stairs & Water:
│   ├── block.glb                   (1m Brick Platform Cube)
│   ├── block_cracked.glb           (Platform Cube with a jade-lit crack)
│   ├── block_cap.glb               (Wall-Top Cube with a capstone)
│   ├── stairs.glb                  (Stone Stairs, four 25cm steps)
│   ├── stairs_narrow.glb           (Stairwell Stairs between capped rails)
│   ├── pool_bank.glb               (Kerbed Pool Bank, 0.5m drop)
│   ├── pool_bank_corner.glb        (Pool Bank Outer Corner Pier)
│   └── pillar.glb                  (2m Stone Pillar)
├── Timber Guard Tower:
│   ├── scaffold.glb                (1m Open Timber Frame, stacks)
│   ├── platform_deck.glb           (Plank Deck, corners notched round posts)
│   ├── platform_deck_hatch.glb     (Plank Deck with an open trapdoor)
│   ├── platform_post.glb           (Stilt Post on a cell corner, stacks)
│   ├── platform_post_top.glb       (Stilt Post top with knee braces)
│   ├── platform_beam.glb           (Bearer under a deck edge)
│   ├── platform_bracket.glb        (Gallery Bracket for a wall)
│   ├── platform_rail.glb           (Guard Rail, 1m high)
│   ├── platform_rail_corner.glb    (Guard Rail Corner Post)
│   ├── platform_parapet.glb        (Breastwork with an arrow slit)
│   ├── ladder.glb                  (Ship's Ladder, 1m rise)
│   └── stairs_wood.glb             (Open Timber Stairs)
├── Burial:
│   ├── coffin.glb                  (Wooden Coffin, closed)
│   ├── coffin_open.glb             (Wooden Coffin, open with a skull)
│   ├── sarcophagus.glb             (Stone Sarcophagus with gabled lid)
│   ├── sarcophagus_open.glb        (Stone Sarcophagus, lid slid open)
│   ├── skeleton.glb                (Lying Skeleton)
│   └── bone_pile.glb               (Pile of Bones)
└── Furniture & Light:
    ├── altar.glb                   (Brick Altar with jade inlay and candles)
    ├── stone_table.glb             (Stone Table on two pedestals)
    ├── stone_chair.glb             (Stone Chair)
    ├── stone_bench.glb             (Stone Bench)
    ├── urn.glb                     (Funeral Urn)
    ├── candles.glb                 (Cluster of Candles)
    ├── floor_torch.glb             (Standing Torch)
    └── wall_torch.glb              (Wall Torch on a Bracket)

Textures/crypt-atlas.png   Shared color atlas
VERSION.txt                Pack version and build date
Godot_Showcase/            A crypt hall built from all 60 pieces: a timber guard
                           room, a guard tower, walkway, wall gallery and
                           lookout over a drain network, an altar dais, burial
                           niches and a pool (open the folder in Godot 4 and
                           press F5)
Previews/                  A render of the showcase hall

--------------------------------------------------------------------------------
2. TECHNICAL SPECIFICATIONS
--------------------------------------------------------------------------------
- Format:             glTF 2.0 Binary (.glb), textures embedded
- Geometry:           Stylized low-poly, 272 - 7,884 triangles per asset
                      (the platform beam at the low end, the 2m burial niche
                      at the high end)
- Textures:           One shared 1024x1024 color atlas. Each .glb embeds its own
                      copy so it works standalone; Textures/crypt-atlas.png is
                      the same atlas for re-texturing or custom materials.
- Materials:          The shared atlas material on every asset, plus glowing
                      flame and ember materials on the torches, candles and
                      altar, and silt and water materials on the pool bed.
                      Give the lit pieces a light in your engine; lay your own
                      water surface over floor_pool.
- Metric Scale:       1 Unit = 1 Meter; floors, walls, blocks and scaffolds are
                      1m modules on a 1m grid
- Pivot Points:       Floors sit with their top at the origin. A wall's face
                      lies on the origin's plane with its body behind it, so
                      it stands on a cell edge; a corner pillar's pivot is the
                      outer corner. Props stand centred on the ground.
- Colliders:          Ready to generate simple box / convex hull colliders in-engine

--------------------------------------------------------------------------------
3. ENGINE INTEGRATION GUIDE
--------------------------------------------------------------------------------
[GODOT 4 - OPEN AS A PROJECT]
1. In the Godot Project Manager, click Import and select this folder's
   "project.godot". Built and tested with Godot 4.7.
2. Press F5 to walk the showcase hall, or open
   "Godot_Showcase/seahill_dungeon_complete.tscn" and preview CameraIsometric.

[GODOT 4 - ADD TO AN EXISTING PROJECT]
1. Copy the "Models", "Textures" and "Godot_Showcase" folders into one folder
   of your project. Leave "project.godot" out: Godot skips any folder that
   contains its own project.godot.
2. Godot automatically imports .glb files as 3D scenes. The showcase scene
   loads the models from "../Models/GLB/", so keep those folders side by side.
3. Snap floors, walls and blocks on a 1m grid. Put a wall_corner on each outer
   corner and lay a wall_top over the wall cell at the wall's height.
4. For a guard tower, stack scaffolds per cell, lay a platform_deck on the top
   one, edge it with rails or parapets and corner posts, and chain one ladder
   or stairs_wood per metre of rise up one side. For a stilt deck, stand
   platform_posts on its corners (a platform_post_top as the top module) and
   hang a platform_beam under each edge; for a gallery, bolt a
   platform_bracket to the wall under each cell.

[UNITY]
1. Install a glTF importer from the Package Manager: glTFast
   (com.unity.cloud.gltfast) or UnityGLTF. Unity does not import .glb without one.
2. Drag the "Models/GLB" folder into your Assets folder.
3. If using Universal Render Pipeline (URP), ensure materials are assigned to
   URP/Lit or URP/Simple Lit.

[UNREAL ENGINE 5]
1. In the Content Browser, click Import and select the .glb files
   (UE 5.1+ imports glTF natively through Interchange).
2. Check "Import Materials" and "Import Textures".

[BLENDER]
1. Go to File > Import > glTF 2.0 (.glb/.gltf).
2. Select any model to inspect, modify, or extend.

Explore all collections at: https://seahill.studio
