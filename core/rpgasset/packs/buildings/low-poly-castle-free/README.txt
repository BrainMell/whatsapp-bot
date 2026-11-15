Low Poly Castle Free
====================

16 low-poly castle props taken from Low Poly Castle (159 props: curtain walls and their stairs,
round and square towers, a gatehouse with its drawbridge and portcullis, the keep and the great
hall with their furniture, a training ground, siege engines, the moat, and a castle to walk):
https://heyheythere.itch.io/low-poly-castle
A round tower a storey at a time, from its doorway to its slate roof; curtain walls 8 m high with
their wall walk and battlements, with arrow slits, and a finished end; a red banner, a wall torch
that burns, a training dummy, archery butts, a catapult that throws, a barrel, a crate, a chest
whose lid opens, and grass. One 2048x2048 texture atlas filtered with mipmaps, the occlusion baked
into vertex colours, real-world scale (1 unit = 1 metre).

What's in the zip
-----------------
glb/        one file per prop, with its animations (the best format for Godot, Blender, three.js)
fbx/        one file per prop, with its animations as takes (Unreal, Unity, most 3D apps)
obj/        one file per prop, still (any 3D app)
textures/   atlas.png, the one texture every prop uses, its glow map, and the seamless textures
            it tiles from, 128x128 a metre, for your own geometry
icons/      an icon per prop, 256x256 PNG with transparency
props.json  every prop: title, group, size, triangles, parts, animations and its "use"
blender/    every prop in one .blend, the atlas packed in
addons/     the Godot addon, low_poly_castle/: this folder is a Godot 4.3 to 4.7 project that
            opens on its gallery (.gdignore keeps Godot out of the other folders)

The grid
--------
Everything sits on a 2 m grid, its outside facing -Y in Blender (+Z in Godot). A curtain piece
fills one 2 m cell, its pivot at the cell's middle, 8 m high, its walk on top behind the parapet
on its -Y side. The tower stands on 3 x 3 cells (6 m), its pivot at its middle, a storey 4 m: the
door storey on the ground, the upper storey at 4 m, the walk storey at 8 m where the curtains meet
its sides flush (the walk passes through it along X), and the roof at 12 m. The grass is 4 m
squares, their pivots at their centres. A torch or a banner has its pivot on the wall's face, at
the floor.

Godot 4.3 to 4.7
----------------
Copy addons/low_poly_castle/ into your project's addons/ folder. Each prop is a scene in props/:
drag it into your level and turn on grid snapping at 1 m. It has a box collider (StaticBody3D)
on each of its parts, none on the grass, the moving parts' colliders moving with them, and a prop
with animations has an AnimationPlayer. The catapult and the chest have machine.gd on their scene
root: use() works them, and they signal it:

    chest_cs.switched.connect(func(on): print("chest open ", on))
    chest_cs.use()                            # what the player's use key calls

demo/gallery.tscn shows every prop: drag to turn, arrows to browse, A for all of them.
Low Poly Castle uses the same addon folder: it installs over this one.
The props use one material, props.tres: the atlas times the vertex colours, lit, with the glow
map.

Other engines and apps
----------------------
Use fbx/, glb/ or obj/ with textures/atlas.png, filtered, with mipmaps, multiplied by the vertex
colours (the baked occlusion) in your material; textures/atlas_glow.png is what lights itself.

License: CC BY 4.0, see LICENSE.txt for the credit line. Made by heyheythere:
https://heyheythere.itch.io
