# Agent Onboarding Prompt — Mellow's WhatsApp Bot

> Paste this entire block into any AI agent (Claude, GPT, Gemini, Cursor, etc.) to give it instant working access to the codebase.

---

## ⚠️ CRITICAL RULES — READ BEFORE TOUCHING ANYTHING

1. **whatsapp-bot: NEVER create a new branch.** Push all whatsapp-bot updates directly to the existing `fix/<name>` or `audit/<name>` branch already in use for this work — reuse it, don't branch off it, don't create a new one per task, and don't create, touch, or modify `main` or any other branch. The user merges into `main` via PR themselves when ready. (Run `git branch -a` if you're unsure which fix/audit branch is currently active — as of July 2026 it's `audit/fix-pass-1`. If it looks stale or unrelated to the current task, confirm with the user before pushing to it.)

2. **Bot_genaration (Go image service): push directly to `main`.** No branch workflow on this repo — commit and push straight to `main`. This is still subject to rule 5 below: don't touch this repo at all unless the user has specifically asked.

3. **NEVER force-push to `main`** on either repo unless the user explicitly says to.

4. **NEVER write Chinese characters into code, comments, or commit messages.** English only.

5. **NEVER touch the Go image service repo unless asked.** It's deployed live to Render + HuggingFace Spaces — a bad push breaks combat image rendering for all 3 bot instances immediately. When you are asked to touch it, push straight to `main` per rule 2 above — no branch.

6. **Always cite file:line when proposing changes.** Show before/after. The user hates vague "should be higher" suggestions.

7. **Don't add features without asking.** Fix what's broken first.

8. **Commit messages: use conventional commits** (`fix:`, `feat:`, `docs:`, etc.). One logical change per commit. Don't bundle unrelated fixes.

9. **Backups before destructive ops.** When modifying `cards_data.json`, MongoDB collections, or any large data file, always save a `.before_<action>` backup first.

10. **NEVER reference `effect` inside `calculateDamage()`.** The function signature is `calculateDamage(attacker, target, power, type, element, chatId, isAbility)` — there is NO `effect` parameter. Referencing `effect` inside this function throws `ReferenceError: effect is not defined`, which silently breaks ALL combat.

11. **NEVER add `instances/*/auth/` to `.gitignore`.** Auth files MUST be tracked in git. A previous agent added them to `.gitignore` to solve a deploy problem (Baileys modifies them at runtime, causing `git pull` conflicts). That created a WORSE problem: auth didn't survive across machines, so when WhatsApp logged out the session, pulling fresh code couldn't restore it. The deploy workflow now uses `git reset --hard` + backup/restore around auth files, so tracking them is safe. If auth isn't in git, the bot can't be recovered after a session logout without manually re-scanning locally.

12. **NEVER call `sharp()` on Oracle.** Sharp crashes with a native `GLib-GObject-CRITICAL` error that kills the entire Node.js process. This is NOT a catchable JS error — it's a native segfault. See "The sharp crisis" section below for the full story and the fixes that must NOT be reverted.

13. **NEVER call `sock.updateProfilePicture()` on Oracle.** Same reason — it calls sharp internally. The `updateBotPFP` function is disabled (commit `cd8ba33e`). Do NOT re-enable it unless sharp is fixed or the box has more RAM.

14. **Pairing code is the DEFAULT login method.** QR code is the BACKUP. If you need to re-link the bot, use pairing code. The login menu has NO timeout — wait for the user to choose. See "WhatsApp linking" section below.

---

## ⏩ STEP 0 — DO THIS FIRST, BEFORE ANYTHING ELSE

Before reading further, before proposing any fix, before touching any code: **clone both repos.** You cannot reason correctly about this codebase from the summaries below alone — go read the actual files.

```bash
# Bot
git clone https://x-access-token:<PAT>@github.com/BrainMell/whatsapp-bot.git
cd whatsapp-bot
git checkout audit/fix-pass-1
git pull --ff-only
git lfs install && git lfs pull   # cards_data.json + PNGs are LFS-tracked
npm install

# Go service (separate folder, sibling to whatsapp-bot)
cd ..
git clone https://x-access-token:<PAT>@github.com/BrainMell/Bot_genaration.git
```

Then create `whatsapp-bot/.env` using the values in the **Credentials** section below.

**SSH access to Oracle:** The bot runs on Oracle Cloud at `84.8.130.156`. The SSH key is `ssh-key-2026-07-24.key` (provided by the user). Use `scripts/ssh_oracle.js` to run commands on Oracle directly:
```bash
node scripts/ssh_oracle.js "pm2 list"
node scripts/ssh_oracle.js "tail -50 ~/.pm2/logs/whatsapp-bot-out.log"
node scripts/ssh_oracle.js "pm2 restart whatsapp-bot"
```
This is FASTER than triggering deploys via GitHub Actions for debugging.

**Set your git identity:**
```bash
git config user.name "BrainMell"
git config user.email "<Mellow's GitHub-associated email>"
```

---

## The sharp crisis (READ THIS — it cost 30+ hours of debugging)

**Sharp is a native image processing library. On Oracle (954MB RAM, no GPU), it crashes with:**
```
GLib-GObject-CRITICAL **: cannot retrieve class for invalid (unclassed) type '<invalid>'
```
**This is a NATIVE segfault. It kills the entire Node.js process instantly. No try/catch can catch it. pm2 restarts the bot, but the operation that triggered it never completed.**

### What sharp was used for (and how each was fixed):

1. **Baileys thumbnail generation** — Every `sock.sendMessage({ image: buffer })` call WITHOUT a `jpegThumbnail` property caused Baileys to call sharp to generate a thumbnail. **FIX:** Monkey-patched `sock.sendMessage` at connection.open to auto-inject `jpegThumbnail: FALLBACK_THUMB` (a 1×1 white JPEG) for ALL image AND video messages. (commit `0bcd52af`, `388236d4`)

2. **`buildThumbnail()` function** — Called by `sendImageSafe` and `.jk diag`. **FIX:** `buildThumbnail()` now returns `FALLBACK_THUMB` directly. No sharp, no jimp. (commit `9eceedba`)

3. **`sock.updateProfilePicture()`** — Called on every boot to sync the bot's PFP. Baileys calls sharp internally to resize the image. This was the LAST sharp call causing a crash-loop (bot restarted every ~15s). **FIX:** `updateBotPFP()` is disabled entirely. The PFP stays as-is from the previous session. (commit `cd8ba33e`)

4. **`.jk diag` Test 3 (sharp test)** — Directly called `require('sharp')`. **FIX:** Replaced with an info message. (commit `9eceedba`)

### Why `.jk menu` worked but nothing else did:
`sendMenuWithBanner` passed `jpegThumbnail: FALLBACK_THUMB` (bypassing sharp). Every other image command (`.jk coll`, `.jk char`, `.jk bal`, `.jk deck`, combat images) sent images WITHOUT `jpegThumbnail`, so Baileys called sharp, which crashed the process.

### DO NOT:
- Re-enable `updateBotPFP()`
- Remove the `sock.sendMessage` monkey-patch
- Add `require('sharp')` anywhere in runtime code
- Call `sock.updateProfilePicture()` or `sock.updateProfileName()` with image data
- Re-add sharp/jimp calls to `buildThumbnail()`

---

## WhatsApp linking (session management)

### Current state
- The bot instance is **Jake** (`.jk` prefix, Adventure Time personality). NOT Joker — the onboarding doc was stale on this. Joker, Subaru, Goten, Esdeath are all disabled.
- The bot's phone number is `2349133219812`.
- Auth files are tracked in git at `instances/Jake/auth/`.

### How to re-link if session is logged out
WhatsApp periodically force-logs-out unofficial multi-device clients (Baileys). Symptoms: `Connection closed. Status code: 401` + `🔒 Session logged out. Delete this instance auth and re-scan.`

**To re-link:**
1. Pull the latest code locally: `git pull origin audit/fix-pass-1`
2. Delete auth: `rm -rf instances/Jake/auth/*`
3. Run locally: `node index.js`
4. The bot will prompt:
   ```
   1️⃣  Pairing Code (enter code on phone) [DEFAULT]
   2️⃣  QR Code (scan with phone camera) [BACKUP]
   Choose (1 or 2, default=1 for pairing code):
   ```
5. Press Enter (or type `1`) for pairing code. Type your phone number. Enter the generated 8-character code on your phone: WhatsApp → Settings → Linked Devices → Link a Device → "Link with phone number instead".
6. Once linked, commit the new auth and push:
   ```bash
   git add instances/Jake/auth/
   git commit -m "fix: relink Jake WhatsApp session (fresh auth)"
   git push origin audit/fix-pass-1
   ```
7. Pull onto Oracle: `node scripts/ssh_oracle.js "cd ~/whatsapp-bot && git fetch origin && git reset --hard origin/audit/fix-pass-1 && pm2 restart whatsapp-bot"`

### PM2 mode (non-interactive)
If `pairingPhone` is set in `instances/Jake/botConfig.json`, the bot uses pairing code automatically in PM2 mode. Otherwise it falls back to QR code (can't prompt for phone number without stdin).

---

## Oracle Cloud infrastructure

- **Host:** `84.8.130.156` (user: `ubuntu`)
- **RAM:** 954MB total, NO swap by default. **2GB swap was added** (`/swapfile`, permanent in `/etc/fstab`). Do NOT remove the swap — image commands need the overflow memory.
- **Processes (PM2):**
  - `bot-generation-go` — Go image service (port 7860)
  - `bot-generation-scraper` — Puppeteer scraper sidecar (port 7861)
  - `whatsapp-bot` — The Node.js bot
- **PM2 config saved:** `pm2 save` was run. Processes auto-start on reboot.

### Direct SSH access
Use `scripts/ssh_oracle.js`:
```bash
node scripts/ssh_oracle.js "command to run"
node scripts/ssh_oracle.js "pm2 logs whatsapp-bot --lines 50 --nostream"
node scripts/ssh_oracle.js "curl -s http://127.0.0.1:7860/health"
```
The SSH key must be at `~/.ssh/oracle_key` (copy from the uploaded `ssh-key-2026-07-24.key`).

### Monitoring
- `scripts/monitor_oracle.js` — streams PM2 logs live, filtered for relevant markers
- `scripts/test_direct_pipeline.js` — tests all Go service calls directly (bypasses WhatsApp)
- `scripts/test_cmdcoll_direct.js` — tests `cardSystem.handleCommand('.jk coll')` directly with real MongoDB data

---

## Credentials

```env
# .env (create this in whatsapp-bot/ root)

# MongoDB Atlas — production database (db name: "test")
MONGO_URI=mongodb+srv://admin:umtaSx2zu940HhKQ@cluster0.drpztk6.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0

# Groq — for the AI chat summary / context engine
GROQ_API_KEYS=<comma-separated list of gsk_ keys, rotates on rate-limit>
GROQ_MODEL=llama-3.3-70b-versatile

# Go image microservice (renders combat scenes + card images)
# On Oracle, the Go service runs locally on port 7860.
# If unset, the code defaults to http://127.0.0.1:7860 and logs a warning.
GO_IMAGE_SERVICE_URL=http://127.0.0.1:7860
```

### GitHub Personal Access Token
- Type: **Classic PAT**, `repo` scope (full read/write on both repos)
- Owner: `BrainMell`
- Used as: `https://x-access-token:<PAT>@github.com/BrainMell/whatsapp-bot.git`
- **Rotate regularly** (user rotates every ~2 days). Treat any PAT touched by a third-party chat interface as burned.

### Oracle SSH
- Host: `84.8.130.156`
- User: `ubuntu`
- Key: `ssh-key-2026-07-24.key` (provided by user)
- Use `scripts/ssh_oracle.js` to run commands

---

## Repos

### Repo 1: WhatsApp Bot (Node.js)
```
GitHub:  https://github.com/BrainMell/whatsapp-bot
Branch:  audit/fix-pass-1 (active — all recent work is here, NOT on main yet)
```

### Repo 2: Go Image Service (separate repo — deployed live)
```
GitHub:  https://github.com/BrainMell/Bot_genaration
Branch:  main
Deploy:  Oracle Cloud (same host as the bot, port 7860)
```

The Go service renders combat scenes, card grids, profile cards, transaction cards, eShop decks, and game boards (chess/ludo/ttt). The JS bot sends HTTP requests to `http://127.0.0.1:7860/api/...` and receives PNG buffers back.

---

## Bot instances

| Bot | Prefix | Personality | Status |
|---|---|---|---|
| **Jake** | `.jk` | Jake the Dog from Adventure Time | ✅ ACTIVE |
| Joker | `.j` | Phantom Thieves leader | 🔇 Disabled |
| Subaru | `.s` | Re:Zero Subaru | 🔇 Disabled |
| Goten | `.g` | Chill half-Saiyan | 🔇 Disabled |
| Esdeath | — | — | 🔇 Disabled |

Only Jake is running. To enable others, check `instances/*/botConfig.json` and `BOT_INSTANCES` env var.

---

## Codebase layout (whatsapp-bot)

```
whatsapp-bot/
├── index.js                 # Bootstrap — loads instances, starts Baileys
├── botConfig.js             # Active-tenant resolver (AsyncLocalStorage)
├── db.js                    # Mongoose connector (reads MONGO_URI)
├── core/
│   ├── engine.js            # Main message router (~25K lines) — ALL command handlers
│   ├── commands/            # Command entry points (rpg, shop, repair, admin)
│   ├── rpg/                 # RPG subsystems (economy, progression, combat, cards, etc.)
│   ├── models/              # Mongoose schemas (User, UserCard, Guild, etc.)
│   ├── utils/               # goImageService, lidResolver, security, profileHelper
│   ├── chat/                # AI context engine (Groq-powered)
│   ├── games/               # Minigames: chess, wordle, ludo, tictactoe
│   └── rpgasset/            # PNG assets (LFS-tracked)
├── instances/Jake/          # Per-tenant config, auth (TRACKED IN GIT), assets
├── scripts/
│   ├── ssh_oracle.js        # Run commands on Oracle via SSH
│   ├── monitor_oracle.js    # Stream PM2 logs live
│   ├── test_direct_pipeline.js  # Test Go service calls without WhatsApp
│   └── test_cmdcoll_direct.js   # Test cardSystem.handleCommand directly
├── reactions/               # Auto-reactions config + fallbacks
└── package.json
```

---

## Key design patterns

1. **Multi-tenant via AsyncLocalStorage** — `botConfig.js` resolves the active tenant from the call stack. `cardSystem.getInst()` uses `botConfig.getBotId()` to get the per-instance state.

2. **JID normalization hell** — WhatsApp sends participant IDs in 3+ formats: `<phone>@s.whatsapp.net`, `<phone>:1@s.whatsapp.net`, `<lid>@lid`. `core/utils/lidResolver.js` is the canonical resolver.

3. **In-memory `gameStates` Map** — all active dungeon/PvP/trial sessions live in a global Map keyed by `chatId` or `chatId_userId`.

4. **Go microservice for images** — combat scenes, card images, deck renders, profile cards all go through `core/utils/goImageService.js` → `http://127.0.0.1:7860`. JS sends `{name, isBoss, spriteIndex, hp, ...}`, Go renders and returns a PNG buffer.

5. **LFS for large assets** — `cards_data.json` (35K cards, ~16MB), all PNGs, TTF fonts, and MP4 intros are Git-LFS. Always run `git lfs pull` after cloning.

6. **`sock.sendMessage` monkey-patch** — At connection.open, `sock.sendMessage` is wrapped to auto-inject `jpegThumbnail: FALLBACK_THUMB` for all image/video messages. This prevents Baileys from calling sharp (which crashes on Oracle). Do NOT remove this patch.

7. **`FALLBACK_THUMB`** — A hardcoded 1×1 white JPEG (base64) at `core/engine.js:845`. Used as the jpegThumbnail for ALL image sends. WhatsApp displays it as the blur-preview placeholder; the actual image still sends and displays correctly.

---

## Common operations

### Check bot status via SSH
```bash
node scripts/ssh_oracle.js "pm2 list"
node scripts/ssh_oracle.js "tail -50 ~/.pm2/logs/whatsapp-bot-out.log"
node scripts/ssh_oracle.js "curl -s http://127.0.0.1:7860/health"
```

### Restart the bot
```bash
node scripts/ssh_oracle.js "pm2 restart whatsapp-bot"
```

### Deploy code to Oracle
```bash
# Push to audit/fix-pass-1, then:
node scripts/ssh_oracle.js "cd ~/whatsapp-bot && git fetch origin && git reset --hard origin/audit/fix-pass-1 && npm install && pm2 restart whatsapp-bot"
```

### Test Go service directly
```bash
node scripts/ssh_oracle.js "cd ~/whatsapp-bot && node scripts/test_direct_pipeline.js"
```

---

## Known open bugs (not yet fixed)

1. **`hasModPermission` not wired into existing command call sites** — the 3-tier mod system is defined but existing mod-gated commands still check `isGlobalMod` directly.
2. **`chainBounces` / `splitIntoHits` rune fields** — populated by runes but the damage-loop refactor to honor them is deferred.
3. **`summon` effect** — stub only.
4. **Card spawn "hive mind" across chats** — spawn timer is not scoped per-chat.
5. **Boss sprites NOT yet distinct** — Go service's `GetEnemySpritePath` only keys on `level`, not `name`.
6. **Guild system audit** — `.g guild info` and `.g guild leaderboard` disagree on level/XP/bank.

---

## What was fixed this session (July 26 2026)

### The sharp crisis (ROOT CAUSE of all image failures)
- **Monkey-patched `sock.sendMessage`** to auto-inject `jpegThumbnail: FALLBACK_THUMB` for all image/video sends — prevents Baileys from calling sharp (commit `0bcd52af`, `388236d4`)
- **Removed ALL sharp calls** from `buildThumbnail()`, `.jk diag`, and runtime code (commit `9eceedba`)
- **Disabled `updateBotPFP()`** — `sock.updateProfilePicture()` calls sharp internally, was causing crash-loop (commit `cd8ba33e`)

### GoImageService fixes
- **Fixed healthCheck constructor ordering** — `this.client` was used before being set, causing false "Health: null" logs (commit `dc7ea3ac`)
- **Fixed `_enqueue` queue catch chain** — broken catch was cascading undefined rejections (commit `59e4a919`)
- **Reduced `generateCardGrid` timeout** 60s → 15s to prevent queue backlog (commit `03cd891a`)
- **Loud warning** when `GO_IMAGE_SERVICE_URL` is unset (commit `59e4a919`)

### Command handler fixes
- **8s timeout on `sock.profilePictureUrl()`** — was hanging indefinitely on LID JIDs (commit `59e4a919`)
- **90s global command timeout** via `Promise.race` around `storage.run()` — prevents silent hangs (commit `59e4a919`)

### WhatsApp linking fixes
- **Pairing code is now DEFAULT** login method, QR is BACKUP (commit `0614709e`)
- **No timeouts** on login menu or phone number entry (was auto-skipping to QR after 5s)
- **Auth files tracked in git** (commit `bcfae896` by user) — removed from `.gitignore` so sessions survive across machines

### Oracle infrastructure
- **2GB swap file** created at `/swapfile`, permanent in `/etc/fstab`
- **PM2 config saved** (`pm2 save`) — processes auto-start on reboot
- **Direct SSH access** via `scripts/ssh_oracle.js`

### Deploy workflow
- **Go service health gate** — checks `/health` after bot restart, auto-restarts Go service if down
- **Go service render test** — POSTs to `/api/cards/profile` to verify actual rendering (not just `/health`)
- **Stripped to essentials** — was timing out at 10 min due to too many diagnostic steps

---

## What NOT to do (lessons from this session)

1. **Do NOT add `instances/*/auth/` to `.gitignore`.** Auth must be tracked.
2. **Do NOT call sharp anywhere.** It crashes the process natively.
3. **Do NOT call `sock.updateProfilePicture()`.** It calls sharp internally.
4. **Do NOT remove the `sock.sendMessage` monkey-patch.** It prevents sharp crashes.
5. **Do NOT remove the 2GB swap file.** Image commands need the overflow memory.
6. **Do NOT re-enable `updateBotPFP()`.** It calls sharp.
7. **Do NOT assume `[GoService] Health: null` means the Go service is down.** The healthCheck had a constructor ordering bug (now fixed). Always verify with `curl http://127.0.0.1:7860/health` via SSH.
8. **Do NOT trust PM2's "online" status alone.** The process can be "online" but crash-looping. Check restart count and uptime — if restart count is climbing and uptime is <30s, it's crash-looping.
9. **Do NOT chase "ROOT CAUSE" theories without checking the PM2 error log for `GLib-GObject-CRITICAL`.** That's the signature of a sharp crash.

---

## Communication style

The owner (BrainMell / "Mellow") is hands-on, prefers concrete numbers, hates vague "should be higher" suggestions. Always cite file:line. Show before/after when proposing changes. Don't add features without asking — fix what's broken first. Code comments in English only. Ask before merging to `main` or pushing to the Go service repo.
