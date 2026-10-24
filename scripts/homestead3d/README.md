# Homestead 3D asset and proof pipeline

This directory holds proof-render scripts and selected upstream GLB source assets. The live `.home` / `.house` interior uses the Node renderer in `core/rpg/interior3d/`.

## Runtime model source of truth

- `core/rpgasset/interior3d/models/arch/`: wall tiers, doors, windows, loft, stairs, raised platforms and railings.
- `core/rpgasset/interior3d/models/floors/`: floors used by theme mappings.
- `core/rpgasset/interior3d/models/furniture/`: a GLB per ID in `core/rpgasset/homestead/catalog.json`, including beds used in the room and shop/inventory thumbnails.
- `core/rpgasset/interior3d/models/walls/`: theme wall models and variants.

The live path is `core/rpg/homesteadRenderer.js` → `core/rpg/interior3d/index.js` → `core/rpg/interior3d/scene.js`. Do not use this proof script as evidence that live rendering is visually verified; inspect the actual `.home house` output.

## Proof renders and checks

`room_proof.py` composes a reference room from source GLBs in `pack_models/` plus geometry helpers. It is useful for source asset/layout experiments, not the live bot renderer.

Run the static asset audit:

```sh
node scripts/qa_homestead_glb.js
```

Run the runtime/database suite only in an authorized test environment with its required `.env` and dependencies:

```sh
node scripts/qa_homestead_v2.js
```

The runtime 3D cache version is `core/rpg/interior3d/index.js`'s `VERSION`; bump it whenever camera, model, geometry or texture output changes. Legacy 2D fallback is explicit emergency-only via `HOMESTEAD_3D_LEGACY_FALLBACK=1`.
