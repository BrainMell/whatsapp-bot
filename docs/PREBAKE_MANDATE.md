# Mandate: speed pass on the RPG image / animation pipeline

**Any agent working on this: you are expected to build new infrastructure, not tweak. Read this whole file first.**

## Hard rules
- Output dimensions unchanged (stills 1024x687, clips 768x516). Quality equal or better — compare frames and LOOK at them.
- Every fast path has a live-render fallback and an env kill switch. Boxes have ~1GB RAM: every cache is capped.
- Measure generation and WhatsApp upload SEPARATELY. (2026-11-08 live test: gens 0.26-5s, uploads 6-21s, summon GIF Go render 17-35s.)
- Don't deploy via local commits on box2 (an auto-reset eats them); deploy from origin.

## What is already built (2026-11-09 measurements, local 2-core)
| Piece | State | Cost |
|---|---|---|
| Combat still | Node composite on cached Go layers (`LAYERS_CACHE`, HP-insensitive key) | tens of ms warm, Go layers 1-5s cold |
| Death clip (single/group) | overlay frames baked to disk at fight start (plain + basic-attack variant, weakest first), composite + 1 raw-pipe x264 encode at kill time | **0.4s warm**, 2.4-6.4s cold (overlay paint ~2.5s + chrome/fonts first time) |
| Card-play scene | Node, raw-pipe ffmpeg, cached ribbon/shadow | ~0.95s |
| Overlay cache | `joker_deathov` in os.tmpdir, now LRU-capped (`DEATH_OV_MAX_MB`, default 320) | was unbounded (disk + RAM if /tmp is tmpfs) |

## Research notes (how older games / pipelines do it)
- Classic pre-rendered-sprite games bake **sprite-local effect frames with alpha** and composite at runtime at an anchor; they never bake the scene. Same here: the overlay is sprite-local, the plate (bg + survivors) is the only per-fight piece.
- MP4/H.264 has no alpha, so a "layer" must be stored as an image sequence (what the overlay cache is) and flattened by ONE encode at the end. Encode is the irreducible step (~0.3-0.5s locally; x10 on a slow box). Already `ultrafast`, baseline, raw pipe, 2 threads.
- ffmpeg-user threads on overlay performance: overlaying PNG series is decode-bound — we avoid it by compositing in node-canvas and piping raw BGRA (done). Segment-concat without re-encode only works for GOP-aligned segments that share a background, which these clips do not.

## Next steps, in value order (do NOT premake what the numbers don't justify)
1. **Send the still first, clip after** (async) on kill turns — perceived speed, zero quality cost.
2. **Warm hit-rate:** overlay key = hash of the live cut PNG. Verify on the live Go output that the same enemy yields byte-identical cuts across fights (scale may depend on roster size). If it doesn't, normalise the key (sprite id + size bucket) or bake per roster size.
3. **Prebake job** (only after 2): background, `nice`, one-at-a-time, walks the bestiary, asks Go for a 1-enemy layers payload per enemy, calls `getOverlay` for plain + atk. Output goes in the capped cache dir, NOT git (≈1-4MB per overlay x ~110 enemies x variants would bloat the repo).
4. **Summon card GIF (Go, 17-35s):** finite key (25 cards x variants) → per-card result cache (other agent started this), then prebake on deploy.
5. Cold overlay paint (~80ms/frame in `ultimateFx`) — profile before touching; PNG compression level was tested and is NOT the cost.
6. Live verification: Joker-only GC first, then add Subaru and re-measure under dual-bot load using each bot to watch the other. Report p50/p95 per stage.

## Verification checklist
identical dimensions · frame diff vs live render · visual review of frames · dual-bot load test · RSS under load · docs updated.

## 2026-11-09 coverage pass: generic static-render memo
`goImageService.js` now wraps every pure-payload Go still (boss splash, end screen, economy/transaction/portrait/profile cards, eShop deck, chess/ttt boards, card grid, hunt card) with a content-hash memo + in-flight dedupe (TTL 120s, 24MB cap, `GO_STATIC_MEMO=0` to disable). Identical JSON => identical bytes, instantly; concurrent identical requests share one render.
Still NOT covered (need live profiling): skill/ult clips, Go summon GIF cold path, Node-only menu/homestead/world/guildwar canvases (already serialized by renderQueue), WhatsApp upload time.
