Avramania Asset Library - Castle & Siege
Free edition - 14 models - 2026-10-22
Made by Avramania - contact@avramania.com - https://www.avramania.com/

WHAT'S IN THIS ZIP
  glTF/      one .glb per model, texture inside. Best for Godot and most engines.
  FBX/       one .fbx per model, for Unity and Unreal.
  Textures/  mdvl_palette.png, the one texture every model uses.
  Contents.csv  every item: name, group, size, triangles.
  License.txt

HOW THE MODELS ARE MADE
- 1 unit = 1 metre. A person is 1.8 m tall.
- Every model uses one material and one 256 x 256 palette texture, the same one
  across the whole library, so they all share a single material in your game.
- Flat shaded: each face is one flat colour. Keep it that way on import.
- Each model's origin is where you place it: on the ground for most, at a grid
  corner for pieces that snap together, at the hand grip for tools and weapons,
  and where it fixes to a wall for things that hang.

IMPORTING
Godot 4: drag the glTF folder in. The texture comes with each model.
Unity: drag the FBX folder and Textures in. Make one material with
  mdvl_palette.png as its base map and give it to the models. On the texture,
  set Filter Mode to Point and Compression to None. On the models, set Normals
  to Calculate and Smoothing Angle to 0.
Unreal 5: import the FBX files and the texture. Make one material with the
  texture into Base Color, Roughness about 0.85, and set the texture's filter
  to Nearest.
On any engine: nearest (no smoothing) filtering keeps the colours crisp.

BUILDING A CASTLE
Every piece goes at the origin of the piece it belongs to, turned the same
way. All heights are in metres.
- Walls are 2 m bays, 1.60 m thick, with the outside face on y=0. Lay them
  along x: (0,0,0), (2,0,0), (4,0,0)... A wall running up the other side is
  the same bay turned -90 with its origin 2 m along: (0,4,0), (0,6,0)...
- curtain_corner_01 turns a run through 90 degrees: outside faces on x=0
  and y=0, the next bays at (2,0,0) and (0,4,0) turned -90.
- The wall-walk is at 3.60. A stair, ramp, moat tile or stable goes at the
  origin of the wall bay it stands against or in front of.
- Stairs and ramps climb along their own +x from their origin, which is
  at the foot. To climb the other way, mirror one along its own x (a
  scale of -1 on x) and put its origin where the foot should be.
- Gates: the portcullis and the drawbridge go at the gate point, the doors
  at the back point. curtain_gate_01: (2,0,0) and (2,1.6,0).
  gatehouse_01: (3,0,0) and (3,4,0).
- A barbican joined to a gate across the moat: two sections of covered
  passage, murder_hole_01, at the gate point and 2 m out. With
  gatehouse_01 at (0,0,0): the passage at (3,0,0) and (3,-2,0), barbican_01
  at (0.40,-8.605,0) and its portcullis at (3,-8.765,0). Leave out the
  moat tile under the passage: its walls go down under the moat's bed.
- Siege: a ladder's origin is its foot; stand it 1.66 m out from the wall's
  outside face and it hooks over the merlons. Stand the siege tower with
  its middle 2 m out and its bridge rests on them.
- Round towers stack: base at 0, then door or middle segments of 2.40,
  top at 7.20, roof at 9.20. In a wall run, centre the tower on the wall's
  outside face and use tower_round_door_01, so the walk goes through it.
  On a corner, centre it on the corner's outer angle with
  tower_round_door_02, turned with the corner; tower_round_foot_01 goes
  under the base where it stands in the moat.
- The open round tower has a spiral stair you can climb: base at 0, door
  section at 2.40, top at 7.20, and tower_open_roof_01 at 9.70 or no roof;
  each tower_open_mid_01 put in under the top raises both by 2.40.
  Stand it inside the walls with its centre 2.95 m in from the wall's
  outside face, turned 180 on a run laid along x. On a corner, use
  curtain_corner_02 and tower_open_base_02, turned 45 degrees less than
  the corner. Its doors: tower_open_leaf_01 for the walk door, at the door
  section's origin 1.20 up, turned with the tower; tower_open_leaf_02 for
  the ground door, at the tower's origin, turned 225 degrees more.

MODELS THAT MOVE
These models carry bones and an animation that loops: flames that flicker,
some with sparks rising from them. Each is still one mesh with one material.
Godot 4: use the glTF files. The animation's name ends in "loop", so
  Godot imports it looping; play it from the model's AnimationPlayer.
Unity: in the FBX import settings set Rig to Generic, and on the clip
  tick Loop Time.
Unreal 5: import the skeleton and the animation with the FBX, and set the
  animation to loop where you play it.

mdvl_castle_brazier_01
  Bones: root, flame_0 to flame_5 (each with a _tip), spark_0 to spark_3.
  Animation: burn_loop.

MODELS THAT OPEN, RAISE OR FIRE
These models carry bones and one animation that plays once, from rest to the
end of the move: a door opening, a portcullis or a drawbridge going up, an
engine firing. Play it backwards to put it back. Each is still one mesh with
one material.
Godot 4: use the glTF files and play the animation from the model's
  AnimationPlayer; play it backwards to shut or lower it again.
Unity: in the FBX import settings set Rig to Generic, and leave Loop
  Time off on the clip.
Unreal 5: import the skeleton and the animation with the FBX.

mdvl_castle_gate_doors_01
  Its clip 'open' swings both leaves through ninety degrees in two and a half
  seconds; play it backwards to shut them. A game that drives them itself
  turns the bones 'leaf_left' and 'leaf_right' about the upright, each on its
  own hinge line.
mdvl_castle_portcullis_01
  Its clip 'raise' winds it 2.50 m up into the room over the gate in four
  seconds; play it backwards to drop it. A game that drives it itself moves
  the bone 'grid' straight up.

QUESTIONS, OR MORE PACKS
Write to contact@avramania.com. Every pack is at https://www.avramania.com/

HOW THESE WERE MADE
Every model here was built by Python scripts in Blender, written with the help of an AI coding assistant. None was generated by an AI 3D or image tool.

LICENCE
CC0 - use them for anything, no credit needed.
The full terms are in License.txt.
