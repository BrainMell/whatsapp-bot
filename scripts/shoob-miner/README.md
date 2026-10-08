# wa-miner — shoob.gg card miner (Box 1)

Lightweight (no Chromium) mining loop that keeps the fleet's event-card
database current with shoob.gg and archives every card's media asset.

- **Scraper**: `shoob-event-scraper.js` — zero-dep Node 18+, SSR + crawler-UA
  trick (see the full write-up in the standalone repo copy). One cycle =
  discover events → listing pages → detail pages → exact-9-field-schema
  records → id-preserving merge → media mirror.
- **Supervisor**: `miner.js` — runs a cycle every `MINER_INTERVAL_MIN`
  (default 45), then publishes results to the **shared Mongo** so the
  `.j mentoring` command (any box, e.g. Joker on Box 2) can display them.

## What gets written where

| Path | Content |
|---|---|
| `output/event_cards.json` | mined event block (exact production schema) |
| `output/cards_data_merged.json` | full DB (regular cards from live ref + mined event block) |
| `output/event_cards.report.json` | per-cycle counts (scraped / new / tombstoned) |
| `output/.detail_cache.json` | crash-safe detail cache — re-cycles never re-fetch |
| `media/<event>/<E-id>_<name>.<ext>` | mirrored gif/webm/jpg assets (idempotent) |
| `media/manifest.json` | archive index (id → file/bytes/url/status) |

Mongo `System` keys (shared across boxes):

| Key | Content |
|---|---|
| `shoob_miner_status` | miner identity, last cycle result, media stats, next run |
| `shoob_miner_newcards` | cumulative mined cards **not yet in the live DB** (cap 500) |
| `shoob_miner_eventblock` | full mined event block — source for `.j mentoring promote` |

## Why ids are safe

The scraper loads the **live** `core/data/cards_data.json` as its reference
every cycle: known mongoIds keep their `E-#####`, new cards append after the
live max, rotated-out cards are kept as tombstones. `UserCard.cardId`
references therefore never break.

## Ops

```bash
pm2 start ecosystem.config.js && pm2 save   # start + persist
pm2 logs wa-miner --lines 100              # watch a cycle
pm2 stop wa-miner                          # pause mining (outputs kept)
```

Media disk floor: mirroring stops gracefully at `MINER_DISK_FLOOR_MB`
(default 5120MB free) — JSON outputs are never affected. Full archive for
~3.3k cards is roughly 10GB (webm-heavy), so size the disk or raise the floor
accordingly.
