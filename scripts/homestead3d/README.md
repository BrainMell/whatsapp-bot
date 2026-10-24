# homestead3d - whole-room 3D interior renderer (prototype)

Owner request 2026-10-24: make the `.home` interior more 3D and able to recreate the
reference cutaway room (timber frame, loft, stairs, layered furniture).

`iso3d.py` renders a WHOLE ROOM in one pass (numpy + Pillow + trimesh, no GPU):
visibility z-buffer -> sun shadow map -> per-pixel textured Lambert shading. Because the
room is one scene, the loft shadows the stairs/furniture and everything occludes correctly,
which per-item sprite baking cannot do.

`room_proof.py` builds the reference room from the house-builder pack GLBs in `pack_models/`
(walls, window, door, hearth, bed, desk, table...) plus box primitives (foundation, loft posts,
planks, stairs, rugs) and writes a PNG:

    python3 scripts/homestead3d/room_proof.py out.png      # ~13 s, 9k triangles

Proof render: `docs/homestead3d/interior_proof.jpg`.

NOT wired into `.home` yet (brief: owner approves proof renders first). Next steps:
scene from the Homestead document (item ids -> GLB map, grid cell -> world xy), bake to a
mediaCache key that includes the renderer version, keep the 2D renderer behind a flag.
