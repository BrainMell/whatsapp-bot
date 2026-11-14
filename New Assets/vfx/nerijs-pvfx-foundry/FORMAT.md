# PVFX Foundry format 1

## Stability

`pack.json` uses `pvfx.asset-pack/1` with pack ID `pvfx.foundry`. Effect IDs
(`<family>/<effect>`) are stable. Patch releases do not intentionally change
canonical pixels; any intentional pixel, timing, or layout change gets a new
minor version and a changelog entry.

## Directory contract

```text
effects/<family>/<effect>/lit/grid/{sprite-sheet.png,manifest.json}
effects/<family>/<effect>/lit/packed/{sprite-sheet.png,manifest.json}
effects/<family>/<effect>/strict/grid/{sprite-sheet.png,manifest.json}
effects/<family>/<effect>/strict/packed/{sprite-sheet.png,manifest.json}
legacy/0.10.0/                 the 0.10.0 release, unchanged
```

`pack.json` lists every effect with its artifacts and their SHA-256 hashes.
`CHECKSUMS.sha256` binds every other file in the payload, the legacy files
included.

## Export manifest

Each manifest uses `pvfx.fx.export-manifest/1` and is written by the canonical
Pixel VFX Studio exporter. It records the program and tier, renderer and
revision identities, the seed, canvas size and pivot, loop mode, and for every
frame its exact duration, visible and trim bounds, trimmed pivot, sheet
placement, and a canonical raw-RGBA pixel hash.

Grid and packed manifests of one effect and tier agree on every canonical fact;
only placements differ. The two tiers of one effect share timing, canvas and
pivot, and differ in pixels.

## Provenance

`PROVENANCE.json` records the source commit, renderer, export profile hashes,
and the hash of the legacy payload's checksum inventory.
