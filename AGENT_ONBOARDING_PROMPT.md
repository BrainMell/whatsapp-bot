Agent Onboarding Prompt — Mellow's WhatsApp Bot
Paste this entire block into any AI agent (Claude, GPT, Gemini, Cursor, etc.) to give it instant working access to the codebase.
⚠️ CRITICAL RULES — READ BEFORE TOUCHING ANYTHING
NEVER merge to `main` without explicit user approval. Push your work to a feature branch (`audit/<name>` or `fix/<name>`) and let the user merge via PR. The user got burned by an agent merging `audit/fix-pass-1` → `main` and pushing without asking — that included 25+ unrelated commits the user hadn't reviewed.
NEVER force-push to `main` unless the user explicitly says to.
NEVER write Chinese characters into code, comments, or commit messages. English only. (This happened once by accident and was not appreciated.)
NEVER touch the Go image service repo unless asked. It's deployed live to Render + HuggingFace Spaces — a bad push breaks combat image rendering for all 3 bot instances immediately.
Always cite file:line when proposing changes. Show before/after. The user hates vague "should be higher" suggestions.
Don't add features without asking. Fix what's broken first.
Commit messages: use conventional commits (`fix:`, `feat:`, `docs:`, etc.). One logical change per commit. Don't bundle unrelated fixes. Keep subjects under 50 characters.
Backups before destructive ops. When modifying `cards_data.json`, MongoDB collections, or any large data file, always save a `.before_<action>` backup first.
⏩ STEP 0 — DO THIS FIRST, BEFORE ANYTHING ELSE
Before reading further, before proposing any fix, before touching any code: clone both repos. You cannot reason correctly about this codebase from the summaries below alone — go read the actual files.
# Bot
git clone https://x-access-token:<YOUR_GITHUB_PAT_HERE>@github.com/BrainMell/whatsapp-bot.git
cd whatsapp-bot
git lfs install && git lfs pull   # cards_data.json + PNGs are LFS-tracked — you WILL see 129-byte pointer files without this
npm install
# Go service (separate folder, sibling to whatsapp-bot)
cd ..
git clone https://x-access-token:<YOUR_GITHUB_PAT_HERE>@github.com/BrainMell/Bot_genaration.git
Then create `whatsapp-bot/.env` using the values in the Credentials section below, so you can actually run the bot and query MongoDB rather than working blind.
Only after both repos are cloned and `.env` is set up should you move on to reading the rest of this doc.
Who you are working on
A multi-tenant WhatsApp RPG bot built on Baileys + MongoDB + a Go rendering microservice. The bot runs 3 personas (Goten `.g`, Joker `.j`, Subaru `.s`) from a single Node.js process. Each tenant has its own auth session, prefix, and personality. The RPG engine has 23 subsystems (progression, classes, skills, PvP, guilds, crafting, cards, stocks, loans, dungeons F→SSS, etc.).
Repos
There are TWO repos — the bot itself and the Go image service that renders combat/card/profile images.
Repo 1: WhatsApp Bot (Node.js)
GitHub:  https://github.com/BrainMell/whatsapp-bot
Branch:  main (production — do NOT push directly without approval)
Auth:    x-access-token (PAT) — see "Credentials" below
Repo 2: Go Image Service (separate repo — deployed live)
GitHub:  https://github.com/BrainMell/Bot_genaration
Branch:  main
Auth:    same PAT as above
Deploy:  Render.com (24/7, lightweight rendering + orchestration)
         + HuggingFace Spaces (on-demand, heavy scrapes + GIF generation)
         Public URL: https://mellow2006-mellowbotbackend.hf.space
The Go service is what actually picks the sprite image for each enemy/boss in combat. The JS bot just sends `{name, isBoss, level, spriteIndex, ...}` and the Go service picks the PNG. If you want to change which sprite a boss uses, you have to edit `Bot_genaration/pkg/combat/sprites.go` — not the JS code.
Already cloned both repos? Good — that should've been Step 0, above. If not, go do that now before continuing.
Credentials
⚠️ Treat these as secrets. Do not commit any of them to git.
# .env (create this in whatsapp-bot/ root)
# MongoDB Atlas — production database (db name: "test")
MONGO_URI=mongodb+srv://admin:umtaSx2zu940HhKQ@cluster0.drpztk6.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0
# Groq — for the AI chat summary / context engine
GROQ_API_KEYS=<comma-separated list of gsk_ keys, rotates on rate-limit>
GROQ_MODEL=llama-3.3-70b-versatile
# Go image microservice (renders combat scenes + card images)
GO_IMAGE_SERVICE_URL=https://mellow2006-mellowbotbackend.hf.space
# Optional: limit which bot instances start
# BOT_INSTANCES=Joker,Subaru,Goten     # comma-separated
# BOT_ACTIVE=false                       # kill switch
GitHub Personal Access Token
<YOUR_GITHUB_PAT_HERE>
Type: Classic PAT, `repo` scope (full read/write on both repos)
Owner: `BrainMell`
Used as: `https://x-access-token:<YOUR_GITHUB_PAT_HERE>@github.com/BrainMell/whatsapp-bot.git` (same form works for `Bot_genaration`)
Why this replaced the old fine-grained PAT: the fine-grained token above kept returning 403 on push — its "Contents" repo permission was Read-only, and a regenerated fine-grained token hit the same wall. A classic `repo`-scope PAT was generated instead and confirmed working (HTTP 200, successful pushes to both repos).
⚠️ Rotate this token. As of July 2026 it has been pasted in plaintext into at least one external AI chat session (z.ai) outside your control, in addition to living in this doc. Generate a fresh classic PAT at https://github.com/settings/tokens, update this file, and revoke the old one at the same URL. Treat any PAT that's touched a third-party chat interface as burned.
Bot instances
| Bot|Prefix|Personality|Siblings|
| ---|---|---|---|
| Goten|.g|Chill half-Saiyan teenager, casual texting style|Joker, Subaru|
| Joker|.j|Quiet Phantom Thieves leader, ≤2 sentences, terse|Goten, Subaru|
| Subaru|.s|Loud Re:Zero Subaru, dramatic, never reveals Return by Death|Joker, Goten|
Each instance lives in `instances/<botId>/` with its own:
`botConfig.json` — prefix, name, personality prompt, siblings
`auth/` — Baileys session tokens (pre-keys, lid-mappings, device list)
`assets/` — pfp, banner, intro video, zeni icon
`stickers/` — per-instance sticker pack (.webp)
Codebase layout (whatsapp-bot)
whatsapp-bot/
 ├── index.js                 # Bootstrap — loads instances, starts Baileys
 ├── botConfig.js             # Active-tenant resolver (AsyncLocalStorage)
 ├── db.js                    # Mongoose connector (reads MONGO_URI)
 ├── core/
 │   ├── engine.js            # Main message router (~20K lines) — ALL command handlers
 │   ├── gambling.js          # 17 gambling games (coinflip, slots, blackjack, etc.)
 │   ├── commands/            # Command entry points (rpg, class, skill, shop, etc.)
 │   ├── rpg/                 # 23 RPG subsystems:
 │   │   ├── economy.js       # Central hub — wallet/bank, daily, transfer, membership
 │   │   ├── progression.js   # XP curve, leveling (cap 100), stat allocation, GP
 │   │   ├── classSystem.js   # Class catalog, evolution ladder, adventurer ranks F→GOD
 │   │   ├── skillTree.js     # Per-class skill trees (~5000 lines, largest file)
 │   │   ├── guildAdventure.js # Dungeon engine (F→SSS), boss fights, party quests
 │   │   ├── bossMechanics.js # Multi-phase boss AI, enrage timers, add spawning
 │   │   ├── classEncounters.js # Enemy pools, boss templates, stat scaling formulas
 │   │   ├── monsterSkills.js # Per-archetype monster skill library + AI
 │   │   ├── lootSystem.js    # Drop tables, ITEM_DATABASE, BOSS_DROPS
 │   │   ├── inventorySystem.js # 20→100 slots, equipment, enhance, use, sell
 │   │   ├── craftingSystem.js # Forge/brew/cook/mine/dismantle (~4000 lines)
 │   │   ├── durabilitySystem.js # Item wear, repair costs, condition
 │   │   ├── pvpSystem.js     # Phantom Standoff duels
 │   │   ├── cardSystem.js    # Gacha cards, deck, market, token events (~2700 lines)
 │   │   ├── guilds.js        # Guild lifecycle, bank, daily board, challenges
 │   │   ├── stockMarket.js   # 5 tickers (ARCH/CHAS/GUIL/VOID/ZENI)
 │   │   ├── investment.js    # Fixed deposits, 5-80% interest, risk tiers
 │   │   ├── loans.js         # P2P lending with settlement
 │   │   └── ...              # socialSystem, weaponSynergy, combatImageGenerator, etc.
 │   ├── models/              # Mongoose schemas (User, UserCard, Guild, Loan, etc.)
 │   ├── utils/               # lidResolver, goImageService, security, profileHelper
 │   ├── chat/                # AI context engine (Groq-powered summaries)
 │   ├── games/               # Minigames: chess, wordle, ludo, tictactoe, debate
 │   └── rpgasset/            # PNG assets (LFS-tracked): characters, enemies, UI, env
 ├── instances/<botId>/       # Per-tenant config, auth, assets, stickers
 ├── docs/                    # Per-command docs organized by category
 ├── scripts/                 # Test harness, scrapers, one-shot fix scripts
 ├── reactions/               # Auto-reactions config + fallbacks
 └── package.json
Codebase layout (Bot_genaration — Go image service)
Bot_genaration/
 ├── main.go                  # Gin HTTP server, routes, Redis caching, HF/Render split
 ├── Dockerfile               # Same image used for both Render + HF Spaces
 ├── deploy.sh                # Local build helper
 ├── config.yaml              # Pipeline config (HF Spaces metadata)
 ├── HYBRID_ARCHITECTURE.md   # Explains the Render(24/7) + HF(on-demand) split
 ├── pkg/
 │   ├── combat/
 │   │   ├── sprites.go       # ⚠️ SPRITE MAPPINGS LIVE HERE
 │   │   ├── renderer.go      # Combat scene rendering
 │   │   └── types.go
 │   ├── cards/               # Card image rendering (spawn, deck, eShop, market)
 │   ├── economy/             # Transaction renderer, balances
 │   ├── profile/             # User profile card renderer
 │   ├── chess/  ludo/  ttt/  # Game board renderers
 │   ├── scraper/             # Pinterest, PornPics, yt-dlp, powerscale, anikai
 │   └── utils/
 ├── assets/
 │   ├── rpgasset/
 │   │   ├── characters/      # ~90 PNGs (Fighter1, Paladin (1), archmage (1), etc.)
 │   │   ├── enemies/         # ~55 PNGs (fire (5), midlevelbosses (1), calamaties (1), etc.)
 │   │   ├── environment/     # env (1).png, env (2).png, env (3).png
 │   │   └── ui/              # HP bars, mana bars, banners, fantasy font
 │   └── chess/               # Chess piece icons
 └── node-client.js           # Example Node.js client (also see whatsapp-bot/core/utils/goImageService.js)
How sprites actually work (READ THIS before touching sprites)
The JS bot does NOT decide which PNG to use for a boss. The Go service does. Flow:
JS sends `POST /api/combat` with payload `{players: [...], enemies: [{name, isBoss, level, spriteIndex, ...}], ...}`
Go service calls `combat.GetEnemySpritePath(level, spriteIndex, isBoss, assetsPath)` in `pkg/combat/sprites.go`
That function picks from one of 3 maps based on `isBoss` + `level`:
Bosses (`isBoss=true`): `BossSprites["MID_BOSSES"]` if level ≤ 60, `["HIGH_BOSSES"]` if ≤ 90, `["CALAMITY"]` otherwise
Common enemies: 10 buckets by level (FIRE_LOW, WATER_LOW, EARTH_MID, ICE_MID, FIRE_HIGH, WATER_HIGH, EARTH_HIGH, MUTATED, HYBRID, FIRE_ELITE)
Within the bucket, `spriteIndex % len(list)` picks the specific PNG
Consequence: To give the new bosses (ELDER_CHAOS, VOID_TITAN, ABYSSAL_GOD) distinct sprites, you'd need to:
Add new sprite PNGs to `Bot_genaration/assets/rpgasset/enemies/`
Add new entries to `BossSprites` in `Bot_genaration/pkg/combat/sprites.go` (e.g. `"ELDER_CHAOS": {"elder_chaos.png"}`)
Modify `GetEnemySpritePath` to check the boss `name` field (currently it only uses `level`) — or add a `bossId` field to the JS payload
Rebuild + redeploy the Go service to Render (and HF Spaces if applicable)
The JS side currently sends `name: "Elder Chaos"` but the Go service ignores the name and picks based on `level + spriteIndex`. So today, the 3 new bosses render using whatever generic CALAMITY sprite the Go service picks.
Running
# Bot
cd whatsapp-bot
node index.js
# → Scans QR code per instance (one at a time on first run)
# → Once linked, sessions persist in instances/<botId>/auth/
# → Bot listens on all group + DM chats where the prefix matches
# Go service (local testing)
cd ../Bot_genaration
./deploy.sh         # builds ./image-service
./image-service     # runs on :7860 by default
Key design patterns
Multi-tenant via AsyncLocalStorage — `botConfig.js` resolves the active tenant from the call stack. Helpers do `require('./botConfig')` and get the right instance's config without explicit passing.
JID normalization hell — WhatsApp sends participant IDs in 3+ formats: `<phone>@s.whatsapp.net`, `<phone>:1@s.whatsapp.net` (device-suffixed), `<lid>@lid` (LID-privacy groups). `core/utils/lidResolver.js` is the canonical resolver — `canonicalRankKey(jid)` is the single source of truth for rank-map keys. Always use it; never roll your own normalization.
In-memory `gameStates` Map — all active dungeon/PvP/trial sessions live in a global Map keyed by `chatId` or `chatId_userId`. Persists only in memory; MongoDB stores user/economy state separately.
Go microservice for images — combat scenes, card images, deck renders, profile cards all go through `core/utils/goImageService.js` → Render/HF Space. JS sends `{name, isBoss, spriteIndex, hp, ...}`, Go renders and returns a PNG buffer. The Go service's sprite assets are in `Bot_genaration/assets/`, NOT in `whatsapp-bot/core/rpgasset/` — the latter are LFS pointers that were never pulled and aren't referenced by the JS code.
LFS for large assets — `cards_data.json` (35K cards, ~16MB), all PNGs, TTF fonts, and MP4 intros are Git-LFS in the whatsapp-bot repo. Always run `git lfs pull` after cloning or you'll see 129-byte pointer files. The Bot_genaration repo does NOT use LFS — PNGs are committed directly.
Card data lives at `core/data/cards_data.json` — 35,629 cards scraped from shoob.gg. Each card: `{id, imageUrl, detailUrl, cardName, creator, animeName, tier, page, scrapedAt}`. Tiers 1-6, S, E (event). IDs are `<tier>-NNNNN` (zero-padded, sequential per tier). All 911 previously-broken cards (with `new-*` IDs and `creator='shoob.gg'`) have been repaired as of June 2026.
MongoDB collections (db name: `test`):
`users` — player state (wallet, class, equipment, stats, etc.)
`usercards` — owned card instances (cardId references cards_data.json)
`cardstats` — per-card-id economy stats (totalSpawned, uniqueOwners, etc.)
`cardmarkets` — active sales/auctions
`carddecks` — custom named decks
`guilds` — guild records
`loans` — P2P loans
`systems` — key/value store (group settings, token events, rank ladders, etc.)
`lidmappings` — LID ↔ phone bi-directional map
`groupprofiles`, `chatmessages`, `chatactivities`, `activitylogs`, `errorlogs`, `metrics`
Common operations
Test a single subsystem (no DB needed)
cd whatsapp-bot
node scripts/smoke_imports.js     # verify all 23 RPG modules import cleanly
node scripts/test_progression.js  # 9 progression tests
node scripts/test_classSystem.js  # 10 class system tests
node --check core/engine.js       # syntax check after edits
Re-scrape cards from shoob.gg
node scripts/scrape_shoob_v2.js              # all tiers, 1→S
node scripts/scrape_shoob_v2.js --tiers 4,5  # specific tiers
node scripts/scrape_shoob_v2.js --smoke 5    # 5 cards per tier (test mode)
DO NOT use `scripts/scrape_shoob.js` — it's the buggy version that hardcoded `tier='1'`, defaulted `creator='shoob.gg'`, and used `new-<page>-<seq>` IDs. `scrape_shoob_v2.js` is the corrected replacement.
How to interact with the database
The DB is MongoDB Atlas, database name `test`, connection string is `MONGO_URI` (see Credentials). Two ways in:
A. Via mongosh (quick, read-heavy exploration)
mongosh "mongodb+srv://admin:umtaSx2zu940HhKQ@cluster0.drpztk6.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0"
# once connected:
show collections
db.users.findOne()                          # inspect a sample document's shape
db.users.countDocuments()
db.guilds.find({ name: "Valhalla" })
B. Via Node.js + mongoose (for anything scripted, or matching how the bot itself reads/writes)
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URI).then(async () => {
  const db = mongoose.connection.db;
  // Read example — inspect a collection
  const count = await db.collection('cardstats').countDocuments({ cardId: /^new-/ });
  console.log('Broken cardStats:', count);
  // Read example — pull one document to see live field names/shape
  const sampleUser = await db.collection('users').findOne();
  console.log(sampleUser);
  await mongoose.disconnect();
});
Run one-off scripts like this with `node -e "..."` for quick checks, or drop them in `scripts/` as a real file if you'll reuse it.
If the bot's own models exist (`core/models/*.js` — e.g. `AbyssRun.js`, `AbyssLeaderboard.js`, `User.js`, `Guild.js`), prefer requiring those Mongoose schemas directly instead of raw `db.collection(...)` calls when writing anything non-trivial — they carry validation and defaults the raw driver won't apply for you.
Before any write/update/delete, follow Critical Rule #8: dump the affected collection (or just the affected documents) to a local JSON backup file first, e.g.:
const docs = await db.collection('guilds').find({}).toArray();
require('fs').writeFileSync('guilds.before_<action>.json', JSON.stringify(docs, null, 2));
Collections you'll actually touch are listed above (point 7 in Key design patterns) —  `users` ,  `usercards` ,  `cardstats` ,  `cardmarkets` ,  `carddecks` ,  `guilds` ,  `loans` ,  `systems` ,  `lidmappings` , plus the logging/metrics collections.
Update MongoDB after card data changes
If you change card IDs in `cards_data.json`, you MUST also update MongoDB so existing `usercards`, `cardstats`, and `cardmarkets` records point to the new IDs. Use `/home/z/my-project/scripts/update_mongodb_v2.js` as a template — it fetches all old-ID docs + new-ID docs, builds bulk ops in memory, then executes via `bulkWrite` in chunks of 500.
Recent work (June–July 2026)
Major content waves — ALL SHIPPED, all with test coverage
An 8-phase content plan was executed across 4 "waves" and merged to `audit/fix-pass-1`. All phases below are marked complete and tested:
| Phase|Feature|Status|Tests|
| ---|---|---|---|
| 0|Boss splash screen (Go side)|✅|15|
| 1|Economy rebalance + wealth tax + smarter mob AI|✅|23|
| 2|Guild system polish|✅|47|
| 3|Runes / skill augments|✅|27|
| 4|Endless Dungeon ( "The Abyss ")|✅|28|
| 5|Weekly Avatar Raid|✅|35|
| 6|PvP Bounty System|✅|27|
| 7|Multi-Event Guild Wars|✅|31|
New models: `core/models/AbyssRun.js` (`{userId, currentFloor, monstersKilled, lootAccumulator, startedAt, status}`), `core/models/AbyssLeaderboard.js` (weekly-scoped). Abyss floors: F→A (1-10), S (11-20), SS+ (21-49), SSS (50+), Abyssal God (100). Boss rotation: Elder Chaos → Void Titan → Abyssal God → Ancient Dragon (4-week cycle). Admin commands added for both Abyss and Raid (`isOwner || isGlobalMod(senderJid)` pattern).
A separate pass — "Phase B: Bug Fixes" (19 critical bugs) and "Phase C: Features" (3 commits) — was also completed and pushed on top of the wave work.
Card rendering — rebuilt from scratch (multiple iterations)
The `.g coll` / `.g deck` grid image went through several broken states before landing on a working design:
Old GIF/Cloudinary-slideshow path failed constantly (500MB Cloudinary limit, broken fallback grid, caption rendering at half-width).
Current implementation: new Go endpoint `/api/cards/grid` renders a static PNG, 4 cols × 3 rows = 12 cards, 240×360 each, tier-colored borders, card name + tier badge per card, sent directly as `{image: buffer, caption}` (same pattern as `.g eshop`) — no more `sendCardMedia` wrapper, no GIF/MP4.
JPEG output (quality 85) replaced PNG for the collection grid specifically = 5–10x smaller files. `NearestNeighbor` resize replaced `Lanczos` = ~10x faster on 0.1 CPU. Placeholder "?" cards render for failed downloads instead of leaving gaps.
`generateCardGif()` (JS) and `sendCardMedia()` (JS) are legacy — still defined but no longer called anywhere. Don't build on them; they're dead code kept for safety, not a working path.
Route is registered in the always-on section of `main.go` (not gated behind `hf`/`full` mode).
Guild system — FULLY AUDITED AND FIXED
The guild system was fully audited and fixed in the latest pass:
- `.g guild info` and `.g guild leaderboard` now agree on level, XP, and bank balance (leaderboard now sorts by Level/XP instead of minigame wins).
- Building levels (Hall/Training/Treasury) now correctly display in `.g guild info`.
- `.g guild tag` now correctly normalizes JIDs and @-mentions members.
- Guild donation XP math is now balanced (1 XP per 1000 Zeni sold, instead of the broken 5% formula).
Baileys / WhatsApp linking — currently blocked, not a version issue
As of ~late June 2026, WhatsApp appears to have tightened enforcement around unofficial multi-device clients (Baileys, whatsmeow, whatsapp-web.js) at the device-linking step specifically — QR and pairing-code linking both hang and fail with a 401 shortly after scanning, even on a completely clean, never-used phone number, while the official WhatsApp Web client works fine on the same laptop/network. Confirmed via direct A/B test (official WA Web succeeded on two accounts; Baileys failed on both, same session).
Baileys was updated all the way to v7.0.0-rc13 — this did not fix it. Nothing in the rc10–rc13 changelog touches linking/registration behavior (it's memory leak fixes, a security patch in rc12, and a `fromMe` parsing fix in rc13).
No fix or maintainer response exists yet in the Baileys GitHub issues as of mid-July 2026 (issue #2672 and cluster #2688–2705 are open, unaddressed).
Don't spend time trying to fix this via config, proxies, or region changes — it reproduces identically regardless of IP/network. Any already-linked bot sessions should be left alone (don't force re-pairing); this only affects new linking attempts.
Separately, `.env`/config commits show Joker and Subaru were briefly disabled then Joker re-enabled — check `instances/*/botConfig.json` / `BOT_INSTANCES` against the table below before assuming all 3 are live.
Known open bugs (not yet fixed, no PR yet)
- `[Esdeath] Send queue: ... Invalid media type` → dropped after 3 retries — an invalid media payload is being constructed and entering the send queue; needs validation added before enqueue, not just more retries. (Note: Validation wrapper was added in `core/engine.js` in the latest pass, monitor if it still occurs).
- ~~`GoService Combat Error: timeout of 5000ms exceeded`~~ — **FIXED**: Root cause was `imaging.Lanczos` in `Bot_genaration/pkg/combat/renderer.go` choking 0.1 CPU instances. Changed to `imaging.NearestNeighbor`.
- T3 class-specific skills — a skill list was sent to a prior agent session but lost context; needs to be resent before implementation (currently scoped to Warlord/Akon only per explicit user instruction — do not implement for other classes yet).
- Bot disconnect pattern — investigation ongoing, tangled up with the Baileys linking block above; unclear yet whether it's the same root cause or separate.
Fixed this cycle
- **GoService Combat Timeout (5000ms)**: Fixed by changing `imaging.Lanczos` to `imaging.NearestNeighbor` in `Bot_genaration/pkg/combat/renderer.go`. Resizes were taking ~6s on 0.1 CPU, now <1s.
- **Guild System Full Audit**: Fixed `.g guild leaderboard` sorting (now uses Level/XP instead of minigame wins), fixed `.g guild tag` JID normalization (appends `@s.whatsapp.net`), added building levels to `.g guild info`, and balanced guild donation XP to 1 XP per 1000 Zeni.
- **Abyss Rune Overhaul**: Added `ABYSSAL` tier (guaranteed on Floor 100+, 25% on Floor 50+). Made Abyss the primary rune source (drops start on Floor 11+ S-rank bosses, added Rune Shrine treasure encounter).
- Abyss leaderboard showed raw phone number instead of nickname (`entry.userId.split('@')[0]` → now looks up `economy.getUser(entry.userId).nickname`).
- Dungeon end-of-run XP display only showed the completion bonus, not per-combat XP earned during the run — looked like massive XP loss but was purely a display bug; now shows `combat: X + bonus: Y` breakdown.
- Warlord skill cooldowns reduced across the board (Execute 5→2, Tactical Strike 2→1, Phalanx 5→3, Rallying Cry 6→3, Total War 10→6) — the "Execute doesn't work" report was very likely just hitting cooldown, not a broken skill.
- Warlord got a second skill tree (WARRIOR_PATH) with 3 AOE skills (Wide Cleave, Shockwave Stomp, Warbanner Charge) to address a lack of AOE options.
- Two Go compile errors in the card-grid rebuild (`splash.go` float64/int mismatch, `gif.go` MeasureString misuse) — fixed and pushed.
Prior (June 2026, still valid)
Card repair COMPLETE: All 911 broken cards repaired in `cards_data.json`. Each was re-scraped from its shoob.gg detail page to recover real tier (from breadcrumb pos 2), creator (via `/Card Maker:([^S]+?)See the Maker/` regex), anime (pos 3), name (pos 4), and CDN image URL (from og:image). IDs reassigned as `<tier>-NNNNN` continuing from existing max per tier. MongoDB `cardstats` collection updated to match (870 renames, 41 orphan `new-*` docs deleted).
Rank system fixes: `canonicalRankKey()` added to `lidResolver.js`; `getMemberRankLevel` now normalizes on read; `set rank` writes canonical + LID form; hierarchy guard treats unranked WA admins as `topRank - 1` for comparison. See `docs/rank-system.md` changelog.
Dungeon reward buffs: New bosses ELDER_CHAOS (S), VOID_TITAN (SS), ABYSSAL_GOD (SSS) with distinct stats/drops. Quadratic boss HP scaling restored. Exponential XP/gold scaling (`rankIndex^1.4` for enemies, `^1.5` for bosses). Rank-specific loot tables (S/SS/SSS_RANK_COMMON). Completion XP now `xpMult² × 100`. GP awarded from dungeons (1-100 per clear). S-rank clear goes from 1.15M XP → 19.3M XP.
⚠️ Boss sprites NOT yet distinct — the 3 new bosses use generic CALAMITY sprites because the Go service's `GetEnemySpritePath` only keys on `level`, not `name`. Fix requires changes to `Bot_genaration/pkg/combat/sprites.go` + new PNG assets + redeploy.
40 prior bug fixes documented in `CHANGES.md` (audit pass 1 — covered economy exploits, PvP state leaks, gambling NaN guards, etc.)
What to read first if you're new
`README.md` — 5-minute overview
`docs/rpg/guide.md` — central RPG handbook
`docs/rank-system.md` — group hierarchy system
`CHANGES.md` — 40 prior bug fixes (so you don't re-introduce them)
`core/rpg/economy.js` — the central hub; nearly every system depends it
`core/rpg/guildAdventure.js` — the dungeon orchestrator that wires 12 modules together
`Bot_genaration/HYBRID_ARCHITECTURE.md` — how the Render + HF Spaces split works
`Bot_genaration/pkg/combat/sprites.go` — how combat sprites are picked
Communication style
The owner (BrainMell / "Mellow") is hands-on, prefers concrete numbers, hates vague "should be higher" suggestions. Always cite file:line. Show before/after when proposing changes. Don't add features without asking — fix what's broken first. Code comments in English only. Ask before merging to `main` or pushing to the Go service repo.
Known gotchas
- **Sandbox Network Restrictions**: The sandbox environment frequently blocks `git clone` and `git push` via CLI (returns `Empty reply from server` or times out). **Do not waste time trying to fix the sandbox network or use local git.** Instead, bypass this entirely by using the **GitHub REST API** directly with the PAT. Use `fetch()` (Node) or `requests` (Python) to GET file contents, modify them in memory, and PUT/POST to `/repos/{owner}/{repo}/contents/{path}` to commit directly to a branch. This is the canonical, reliable way to push code in this environment.
- Fine-grained GitHub PATs have repeatedly failed to push for this project (Contents permission defaults to Read-only and editing it hasn't reliably fixed it) — a classic PAT with `repo` scope is what actually works. See Credentials section.
- `instances/Subaru/assets/{banner.png, pfp.png, subaru_rbd.mp4}` show as modified after LFS operations — this is just LFS pointer conversion, not real changes. Don't commit these unless you actually changed the assets.
- The `audit/fix-pass-1` branch contains 25+ commits of prior bug-fix work. If you're starting fresh, branch from `main` (which now has all that work merged in) — don't branch from `audit/fix-pass-1` thinking it's ahead.
- `core/data/cards_data.json.before_repair` is a local backup of the pre-repair file. Not committed. Don't delete it unless you're sure the repair is solid.
- The `MONGO_URI` env var name is `MONGO_URI` (not `MONGODB_URI`) — `db.js` reads `process.env.MONGO_URI`. Some scripts in `scripts/` use the hardcoded Atlas URI directly instead.
- New device linking to WhatsApp is currently blocked at the protocol level, not a bot/code/network issue — see "Baileys / WhatsApp linking" above. Don't burn time debugging this as if it's your code.
- `generateCardGif` and `sendCardMedia` (JS) are dead code — still defined, never called. The live path is `generateCardGrid` → `/api/cards/grid` → `{image, caption}`. Don't resurrect the old functions without checking why they were replaced.
