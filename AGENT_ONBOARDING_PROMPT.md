# Agent Onboarding Prompt - Mellow's WhatsApp Bot

> Paste this entire block into any AI agent (Claude, GPT, Gemini, Cursor, etc.) to give it instant working access to the codebase.

---

## ⚠️ CRITICAL RULES - READ BEFORE TOUCHING ANYTHING

1. **whatsapp-bot: NEVER create a new branch.** Push all whatsapp-bot updates directly to the existing `audit/fix-pass-1` branch. Don't branch off it, don't create a new one per task, and don't touch `main`. The user merges into `main` via PR themselves when ready.

2. **Bot_genaration (Go image service): push directly to `main`.** No branch workflow on this repo - commit and push straight to `main`. This is still subject to rule 5 below: don't touch this repo at all unless the user has specifically asked.

3. **NEVER force-push to `main`** on either repo unless the user explicitly says to.

4. **NEVER write Chinese characters into code, comments, or commit messages.** English only.

5. **NEVER touch the Go image service repo unless asked.** It's deployed live - a bad push breaks combat image rendering for all bot instances immediately. When you are asked to touch it, push straight to `main` per rule 2 above - no branch.

6. **Always cite file:line when proposing changes.** Show before/after. The user hates vague "should be higher" suggestions.

7. **Don't add features without asking.** Fix what's broken first.

8. **NEVER push this onboarding doc to ANY repo.** The user keeps it separate from the code. Do NOT commit `AGENT_ONBOARDING_PROMPT.md` or any onboarding file to `whatsapp-bot` or `Bot_genaration`. If you need to update it, give the updated file to the user directly - do NOT `git add` it.

9. **Commit messages: use conventional commits** (`fix:`, `feat:`, `docs:`, etc.). One logical change per commit. Don't bundle unrelated fixes.

10. **Backups before destructive ops.** When modifying `cards_data.json`, MongoDB collections, or any large data file, always save a `.before_<action>` backup first.

11. **NEVER reference `effect` inside `calculateDamage()`.** The function signature is `calculateDamage(attacker, target, power, type, element, chatId, isAbility)` - there is NO `effect` parameter. Referencing `effect` inside this function throws `ReferenceError: effect is not defined`, which silently breaks ALL combat.

12. **NEVER add `instances/*/auth/` to `.gitignore`.** Auth files MUST be tracked in git. A previous agent added them to `.gitignore` causing auth didn't survive across machines. If auth isn't in git, the bot can't be recovered after a session logout without manually re-scanning locally.

13. **NEVER call `sharp()` on Oracle.** Sharp crashes with a native `GLib-GObject-CRITICAL` error that kills the entire Node.js process. This is NOT a catchable JS error - it's a native segfault. See "The sharp crisis" section below for the full story and the fixes that must NOT be reverted.

14. **NEVER call `sock.updateProfilePicture()` on Oracle.** Same reason - it calls sharp internally. The `updateBotPFP` function is disabled. Do NOT re-enable it unless sharp is fixed or the box has more RAM.

15. **Pairing code is the DEFAULT login method.** QR code is the BACKUP. If you need to re-link the bot, use pairing code. The login menu has NO timeout - wait for the user to choose.

16. **The server has NO GitHub PAT.** Commits can be made on the server (git identity is set), but `git push` will fail with "could not read Username". The user pushes from their local machine. If you need to push, ask the user for a PAT or tell them to pull + push locally. **PATs expire every ~2 days - treat any PAT touched by a third-party chat interface as burned.**

17. **ALWAYS test with real evidence, not assumptions.** The user hates when agents say "should work" without testing. Capture screenshots, run actual commands, show VLM verification, and show pixel measurements. Code diffs alone are not proof - the user wants to see the rendered output. **Do NOT claim "VLM-verified" without showing the actual image or pasting the VLM response.**

18. **When fixing rendering bugs, check ALL render paths.** PvE, PvP-1v1, and PvP-summon each have separate (but shared) positioning logic. A fix in one path often doesn't carry to the others. Always verify against all three paths with screenshots.

19. **The `isPvPSummonDuel` flag gates a dedicated render path.** PvP-summon has its own sprite sizing (180px height), positioning (X=220/800), text labels (no portraits), and elliptical shadows. Don't mix these constants with PvE or PvP-1v1.

20. **`generateDuelImage()` must use FIXED slot order `[player1, player2]`.** NEVER use `[attacker, defender]` - that swaps the array each turn, causing sprites to swap positions/facing/HP bars. The turn indicator (`action.attackerIndex`) handles highlighting without reordering the array.

21. **`finishDuel()` returns `{ message: string }`, not a string.** Always extract `result.message` before string concatenation. Concatenating the object directly produces `[object Object]` in chat and corrupts combat state.

22. **Mute/ban/hardmute checks must run BEFORE the card system handler.** The card system (`cardSystem.handleCommand`) processes messages early in the pipeline. If mute checks are after it, muted users can use all card commands. Always place `isMuted`, `isBanned`, `isHardMuted` checks before line ~6878 in engine.js.

23. **`parseAdminArgs` must filter bare phone numbers/LIDs (10+ digits, no @).** Without this filter, typing a bare LID like `251453323092189` as a target gets parsed as the amount, giving 251 TRILLION Zeni instead of the intended amount.

24. **Cards on/off is card-mod only.** Only `isOwner`, `isMod` (global mod), and `isCardMod` can toggle the card system. NOT RPG mods, NOT WA group admins.

25. **⚠️ NEVER upload engine.js from a local/stale copy to the server.** This is the #1 mistake that caused 3 regressions in one session. The server's git history has commits that your local workspace doesn't. **ALWAYS restore from the server's latest commit before making changes:**
   ```bash
   # On the server:
   cd ~/whatsapp-bot && git checkout HEAD -- core/engine.js
   # Then make your changes directly on the server, or extract+apply diffs
   ```
   If you must upload from local, `git pull` on the server FIRST to sync. Uploading a stale engine.js WILL wipe out sibling prefix guards, hardmute fixes, compact UI, uptime persistence, and every other server-only commit.

26. **⚠️ Do NOT use Python to inject code into engine.js.** Python's Unicode handling (surrogate pairs, escape sequences) corrupts the 26K-line file. Use Node.js scripts or sed for targeted edits. For new features, create a SEPARATE module file (e.g., `core/rpg/broadcastHelpers.js`) and `require()` it from engine.js - this avoids touching the massive file entirely.

27. **⚠️ ALWAYS `git pull` on the server before making changes.** The server may have commits that aren't in your local repo. If you upload without pulling first, you overwrite those commits. This happened 3 times in one session and wiped out 5 features each time.

28. **⚠️ The Go service has an in-memory image cache.** When you add new sprite files to Box 2, you MUST `pm2 restart bot-generation-go` to clear the cache. Without restart, the old cached images (including broken spritesheets) will be served.

29. **⚠️ Enemy sprite files are GRID spritesheets, NOT single frames.** Files like `troll_0000_green.png` are 5×3 grids (15 frames), NOT single images. The old `EnemyNameSprites` map pointed to `_single.png` files that either didn't exist or were the full grid. This caused enemies to render as clusters of tiny figures ("goblin grid" bug). The fix was a 1:1 name-to-numbered-file mapping in `EnemyNameSprites`. Do NOT re-add `_single.png` references.

30. **⚠️ When the user asks for "standard combat commands" for a subsystem (Abyss, etc.), they mean ARCHITECTURAL UNIFICATION - not patching call sites.** Abyss combat already shares the standard `startCombat()` path, but floor-advancement logic (treasure, events, skip) has separate glue code that calls `startAbyssCombat()` at each transition. If any of these 3 handlers forgets to call it, the player gets "Not in combat!" on the next floor. All 3 handlers (processEventChoice, processTreasure, processSkip) + handleAbyssVictory + startRun must call `startAbyssCombat` when the next floor is combat.

31. **Card mod permissions: `t2edeck`, `setprice`, and `event` commands must include `isCardMod`.** They were originally gated with `isOwner || isMod` (global mod only), which blocked card mods. The fix adds `|| isCardMod` to each permission check in `cardSystem.js`.

32. **Sibling prefix collision: Jake's prefix `.jk` starts with Joker's prefix `.j`.** When Joker sees `.jk char`, it matches `.j` and tries to run `k char`. The sibling prefix guard loads all sibling bot configs at startup, collects their prefixes, and skips any message that starts with a SIBLING prefix (longest match wins). This guard lives in `engine.js` around line 6700.

33. **Hardmute requires the bot to be WA group admin to delete messages.** If `botAdmin=member`, the delete call returns success but WhatsApp silently ignores it. The hardmute code attempts the delete unconditionally (no pre-check) because the LID/phone admin check was unreliable. The log shows `Delete attempted` on success.

34. **Uptime resets on reconnect.** `botStartTime` was set unconditionally inside `initSocket()` which runs on every reconnect. The fix checks `if (!botStartTime)` and queries MongoDB for a previous heartbeat with matching PID - if same PID, it's a reconnect (keep original time); if different PID, it's a fresh process restart.

35. **Broadcast GC selection.** `.j updateall` now shows a numbered list of all GCs. Reply with `1,3,5` (specific), `1-5` (range), `1,3-5,8` (combo), `all`, or `cancel`. Selection expires after 5 minutes. Uses `core/rpg/broadcastHelpers.js` (separate module, not injected into engine.js).

---

## ⏩ STEP 0 - DO THIS FIRST, BEFORE ANYTHING ELSE

Before reading further, before proposing any fix, before touching any code: **clone both repos.** You cannot reason correctly about this codebase from the summaries below alone - go read the actual files.

```bash
# Bot
git clone https://github.com/BrainMell/whatsapp-bot.git
cd whatsapp-bot
git checkout audit/fix-pass-1
git pull --ff-only
git lfs install && git lfs pull   # cards_data.json + PNGs are LFS-tracked
npm install

# Go service (separate folder, sibling to whatsapp-bot)
cd ..
git clone https://github.com/BrainMell/Bot_genaration.git
```

Then create `whatsapp-bot/.env` using the values in the **Credentials** section below.

**SSH access to Oracle:** The bot runs on **two** Oracle Cloud boxes (split architecture). The SSH key is `ssh-key-2026-07-24.key` (provided by the user). Use `paramiko` (Python) for SSH since no `ssh` binary is available on the sandbox.

**Set your git identity:**
```bash
git config user.name "BrainMell"
git config user.email "brainmell@users.noreply.github.com"
```

---

## ⚠️ MISTAKES TO AVOID (learned the hard way, August 2026)

These are the specific mistakes that caused regressions. Read them BEFORE touching engine.js.

### Mistake 1: Uploading stale engine.js (happened 3 times)
**What happened:** The agent's local workspace was missing 5 server-only commits (sibling prefix, hardmute, compact UI, uptime fix, card mod perms). When the agent uploaded engine.js for Abyss fixes, the stale copy overwrote ALL 5 fixes.

**How to prevent:** Before uploading ANY file to the server:
1. `git pull` on the server to get the latest
2. OR make changes directly ON the server using `sed`/Node.js scripts
3. OR extract the specific diff and apply it as a patch with `git apply`
4. NEVER upload a file from your local workspace without first checking `git log --oneline` on BOTH local and server to verify they're in sync

### Mistake 2: Python Unicode corruption of engine.js
**What happened:** A Python script tried to inject Unicode emoji and escape sequences into the 26K-line engine.js. The surrogates crashed and wrote a truncated file (deleted 26,380 lines).

**How to prevent:** 
- Use Node.js scripts for patching engine.js (same language, no Unicode mismatch)
- Use `sed` for simple find-replace
- For new features, create a SEPARATE module file and `require()` it (e.g., `broadcastHelpers.js`)
- NEVER use Python to read+modify+write engine.js

### Mistake 3: Claiming "VLM-verified" without showing the image
**What happened:** The agent said "VLM-verified: STONE HULK renders as a large muscular figure" but the actual render showed a grid of 15 tiny goblin figures. The agent had run the VLM check on a different render and copy-pasted the result.

**How to prevent:**
- Always paste the ACTUAL VLM response (not a summary)
- Always show the file path so the user can open it
- If you claim "verified," show the raw VLM JSON or at minimum the `"content"` field
- The user can spot when you're describing what SHOULD be there vs what IS there

### Mistake 4: Removing functionality instead of fixing it
**What happened:** Enemy sprites were broken (grid-of-goblins bug). The agent's first fix was to DELETE all sprite mappings and fall back to a generic level-based pool. This meant every F-tier enemy rendered as the exact same `fire (5).png` - no name-specific sprites at all.

**How to prevent:**
- When a mapping is broken, FIX THE MAPPING - don't delete it
- If you can't fix it immediately, SAY SO: "I'm removing the mappings as a temporary measure, but each enemy will now show a generic sprite, not a name-specific one"
- Never present a scope reduction as a fix

### Mistake 5: Not checking all call sites
**What happened:** The Abyss "Not in combat!" bug was fixed for `processEventChoice` but the agent only checked that one handler. `processTreasure` and `processSkip` had the same bug but weren't checked until the user pushed back.

**How to prevent:**
- After fixing a bug, `grep` for ALL similar patterns in the codebase
- For Abyss: there are exactly 5 floor-advancing handlers (startRun, handleAbyssVictory, processEventChoice, processTreasure, processSkip). ALL must call `startAbyssCombat` when the next floor is combat.

### Mistake 6: Reinterpreting the user's question
**What happened:** The user asked "why did I see a goblin rendered as a stone hulk?" The agent reinterpreted this as "STONE_HULK shouldn't be on floor 1" and fixed the enemy POOL instead of the SPRITE MAPPING. The actual sprite bug wasn't touched until the user pushed back 3 more times.

**How to prevent:**
- Answer the question that was ASKED, not the question you know how to answer
- If the user says "goblin sprite with STONE HULK label," that's a sprite-lookup bug, not a difficulty balancing issue
- When in doubt, ask: "Do you mean X (sprite mismatch) or Y (enemy too strong)?"

### Mistake 7: Asserting completion without end-to-end proof
**What happened:** The agent claimed "full end-to-end test passed" but the test output was labeled "STEP 1, STEP 2, STEP 5" - steps 3 and 4 were missing (the actual original bug sequence: enter → floor 1 win → event → floor 3 → attack).

**How to prevent:**
- Paste the UNTRIMMED test output, including failures
- If a step was skipped because the random encounter didn't produce the right sequence, SAY SO: "Floor 1 was combat, not an event, so I couldn't test the event→combat transition. Here's what I tested instead."
- Replay the EXACT failing sequence from the user's bug report, not a different path that happens to pass

---

## The sharp crisis (READ THIS - it cost 30+ hours of debugging)

**Sharp is a native image processing library. On Oracle (954MB RAM, no GPU), it crashes with:**
```
GLib-GObject-CRITICAL **: cannot retrieve class for invalid (unclassed) type '<invalid>'
```
**This is a NATIVE segfault. It kills the entire Node.js process instantly. No try/catch can catch it.**

### What sharp was used for (and how each was fixed):

1. **Baileys thumbnail generation** - Every `sock.sendMessage({ image: buffer })` call WITHOUT a `jpegThumbnail` property caused Baileys to call sharp. **FIX:** Monkey-patched `sock.sendMessage` at connection.open to auto-inject `jpegThumbnail: FALLBACK_THUMB` (a 1×1 white JPEG) for ALL image AND video messages.

2. **`buildThumbnail()` function** - **FIX:** Returns `FALLBACK_THUMB` directly. No sharp, no jimp.

3. **`sock.updateProfilePicture()`** - **FIX:** `updateBotPFP()` is disabled entirely.

4. **`.jk diag` Test 3 (sharp test)** - **FIX:** Replaced with an info message.

### DO NOT:
- Re-enable `updateBotPFP()`
- Remove the `sock.sendMessage` monkey-patch
- Add `require('sharp')` anywhere in runtime code
- Call `sock.updateProfilePicture()` or `sock.updateProfileName()` with image data
- Re-add sharp/jimp calls to `buildThumbnail()`

---

## WhatsApp linking (session management)

### Current state (August 2026)
- **Three bot instances are active:**
  - **Jake** (`.jk` prefix, Adventure Time personality) - phone `2349133219812`
  - **Joker** (`.j` prefix, Persona 5 personality) - phone `233509676154`
  - **Subaru** (`.s` prefix, Re:Zero personality) - phone `2347076192459`
- Goten, Esdeath are disabled.
- Auth files are tracked in git at `instances/<BotName>/auth/`.

### Sibling prefix collision (IMPORTANT)
Jake's prefix is `.jk` and Joker's prefix is `.j`. Since `.jk` starts with `.j`, when Joker sees `.jk char` it matches its own prefix and tries to run `k char` → error. The sibling prefix guard (`siblingPrefixes` in engine.js ~line 1160) loads all sibling configs at startup and skips messages that start with a sibling's prefix (longest match wins). This guard MUST NOT be removed.

### How to re-link if session is logged out
1. Pull the latest code locally: `git pull origin audit/fix-pass-1`
2. Delete auth: `rm -rf instances/<BotName>/auth/*`
3. Run locally: `node index.js`
4. Choose pairing code (default) or QR code (backup)
5. Enter the generated 8-character code on your phone: WhatsApp → Settings → Linked Devices → Link a Device → "Link with phone number instead"
6. Commit the new auth and push

### Joker auth requires ALL files, not just creds.json
The auth folder contains `creds.json` PLUS pre-keys, sessions, lid-mappings, device-list, and identity-keys. Uploading only `creds.json` results in `401 / Session logged out`. Always upload the ENTIRE auth folder.

### PM2 mode (non-interactive)
If `pairingPhone` is set in `instances/<BotName>/botConfig.json`, the bot uses pairing code automatically in PM2 mode.

---

## Oracle Cloud infrastructure (SPLIT SERVER)

### Box 1 - Bot Server
- **Host:** `84.8.130.156` (user: `ubuntu`)
- **Private IP:** `10.0.1.247`
- **Shape:** `VM.Standard.E2.1.Micro` (AMD x86, 1/8 OCPU, 954 MB RAM)
- **Runs:** `whatsapp-bot` - Node.js bot (Jake + Joker + Subaru)
- **Swap:** 2 GB at `/swapfile` (permanent in `/etc/fstab`). Do NOT remove.

### Box 2 - Go Service Server
- **Host:** `92.4.134.161` (user: `ubuntu`)
- **Private IP:** `10.0.1.56`
- **Shape:** `VM.Standard.E2.1.Micro` (AMD x86, 1/8 OCPU, 954 MB RAM)
- **Runs:** `bot-generation-go` (port 7860), `bot-generation-scraper` (port 7861), `warp-proxy` (port 1080)
- **Swap:** 2 GB at `/swapfile`

### Network path
```
User → WhatsApp → Box 1 (84.8.130.156) → whatsapp-bot
                                                    ↓
                                              HTTP POST to Go service
                                                    ↓
                                              Box 2 (10.0.1.56:7860) via VCN private IP
                                                    ↓
                                              Go service renders → PNG/MP4 back
```

### SSH access (use paramiko - no ssh binary on sandbox)
```python
import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("84.8.130.156", username="ubuntu", key_filename="/tmp/ssh_key", timeout=15)
# OR for Box 2:
ssh.connect("92.4.134.161", username="ubuntu", key_filename="/tmp/ssh_key", timeout=15)
```

### Go service deploy (manual - no deploy script on sandbox)
```python
# Upload changed .go files via SFTP, then rebuild + restart:
stdin, stdout, stderr = ssh.exec_command("cd ~/bot_generation && export PATH=/usr/local/go/bin:$PATH && go build -o bot-generation . && pm2 restart bot-generation-go --update-env")
```

### Hourly cron for stuck debug processes
A cron job runs hourly to kill stuck `node -e` and `bash -c` debug processes:
```
0 * * * * pkill -f "bash -c cd /home/ubuntu/whatsapp-bot" 2>/dev/null; pkill -f "node -e" 2>/dev/null || true
```

---

## Credentials

```env
# .env (create this in whatsapp-bot/ root)

# MongoDB Atlas - production database (db name: "test")
MONGO_URI=mongodb+srv://admin:umtaSx2zu940HhKQ@cluster0.drpztk6.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0

# Groq - for the AI chat summary / context engine
GROQ_API_KEYS=<comma-separated list of gsk_ keys, rotates on rate-limit>
GROQ_MODEL=llama-3.3-70b-versatile

# Go image microservice (renders combat scenes + card images)
# Go service runs on Box 2 (92.4.134.161).
# Bot reaches it via VCN private IP (10.0.1.56), NOT localhost.
GO_IMAGE_SERVICE_URL=http://10.0.1.56:7860
```

### GitHub Personal Access Token
- Type: **Classic PAT**, `repo` scope (full read/write on both repos)
- Owner: `BrainMell`
- Used as: `https://x-access-token:<PAT>@github.com/BrainMell/whatsapp-bot.git`
- **The Oracle server does NOT have a PAT.** Commits can be made on the server, but `git push` will fail. The user pushes from their local machine.
- **PATs expire every ~2 days.** Treat any PAT touched by a third-party chat interface as burned.

### Oracle SSH
- Box 1 (bot): `84.8.130.156`
- Box 2 (Go service): `92.4.134.161`
- User: `ubuntu`
- Key: `ssh-key-2026-07-24.key` (provided by user)

---

## Repos

### Repo 1: WhatsApp Bot (Node.js)
```
GitHub:  https://github.com/BrainMell/whatsapp-bot
Branch:  audit/fix-pass-1 (active - all recent work is here, NOT on main yet)
```

### Repo 2: Go Image Service (separate repo - deployed live)
```
GitHub:  https://github.com/BrainMell/Bot_genaration
Branch:  main
Deploy:  Oracle Cloud Box 2 (92.4.134.161, port 7860)
```

The Go service renders combat scenes, card grids, profile cards, transaction cards, eShop decks, and game boards. The JS bot sends HTTP requests to `http://10.0.1.56:7860/api/...` and receives PNG/MP4 buffers back.

---

## Bot instances

| Bot | Prefix | Personality | Status |
|---|---|---|---|
| **Jake** | `.jk` | Jake the Dog from Adventure Time | ✅ ACTIVE |
| **Joker** | `.j` | Phantom Thieves leader | ✅ ACTIVE |
| **Subaru** | `.s` | Re:Zero Subaru Natsuki | ✅ ACTIVE |
| Goten | `.g` | Chill half-Saiyan | 🔇 Disabled |
| Esdeath | - | - | 🔇 Disabled |

---

## Combat renderer (Bot_genaration/pkg/combat/)

### Layout system (layout.go)
- **Slot tables:** `PlayerSlots`, `SummonSlots`, `EnemySlots` - 8 slots each, zigzag formation
- **4-column zigzag:** rows alternate between cols 1+3 and cols 2+4 (gaps)
- **Player zone:** X=80-300 (left edge), **Enemy zone:** X=730-900 (right edge)
- **Center gap:** 430px (X 300..730) - no sprites in the middle
- **Depth spacing:** 50px between rows, 150px tall player sprites
- **Sprite heights:** player=150px, summon=75px, enemy=170px, boss=210px
- **Crop-first-then-resize-by-height:** all sprites normalized to fixed height (not width)

### Z-order (painter's algorithm)
- Players: collected into `playerQueue`, sorted by feet Y (back to front), drawn in order
- Enemies: collected into `mobQueue`, sorted by Y, drawn in order
- Front-row sprites draw ON TOP of back-row (lower Y = further back = drawn first)

### Turn indicator
- `isAttacker()` falls back to `player[0]` when `req.Action` is nil (static PvE renders)
- Draws golden ellipse under the active attacker BEFORE the sprite (shadow → indicator → sprite)

### Nameplate pills
- `drawNameplatePill()` - translucent dark pill with white border above each entity's HP bar
- Player[0] also gets name inside the left UI panel (auto-shrinking font, same as PvP)

### Enemy sprite mapping (EnemyNameSprites in sprites.go)
- Each enemy name maps to a specific numbered sprite file (1:1 mapping)
- Element prefix = family type (fire/water/earth/ice/mutated/hybrides)
- Number = specific mob within that family
- **Do NOT use `_single.png` files** - they were multi-frame spritesheets that rendered as grids
- Boss sprites use `BossNameSprites` (all 33 `boss_N_N.png` / `boss_N_S.png` files exist and are verified)

### Case-insensitive class lookup
- `GetCharacterSpritePath` and `GetCharacterSpriteFile` uppercase the class before map lookup
- Was case-sensitive - "Fighter" or "fighter" fell back to FIGHTER for every class

---

## Abyss system (core/rpg/abyssSystem.js)

### Floor structure
- Floors 1-2: F-rank natural mobs (rats, bats, slimes)
- Floors 3-6: C-rank, stone hulks, golems, boss every 5th floor
- Floors 7-10: A-rank, storm callers, void harbingers
- Floors 11-20: S-rank, mini-boss every 3rd floor
- Floors 21-49: SS+ rank, boss every 5th floor
- Floors 50+: SSS rank, brutal
- Floor 100: The Abyssal God

### Combat flow
- `.j abyss enter` → starts run, calls `startAbyssCombat` if Floor 1 is combat
- `.j abyss choose <1/2>` → processes event, calls `startAbyssCombat` if next floor is combat
- `.j abyss collect` → processes treasure, calls `startAbyssCombat` if next floor is combat
- `.j abyss skip` → skips current floor, calls `startAbyssCombat` if next floor is combat
- `.j abyss resume` → restarts combat after disconnect
- `.j abyss retreat` (or `leave`/`exit`) → extracts with 100% loot

### ALL 5 floor-advancing handlers must call `startAbyssCombat`
1. `startRun` (engine.js) ✅
2. `handleAbyssVictory` (guildAdventure.js) ✅
3. `processEventChoice` (engine.js) ✅
4. `processTreasure` (engine.js) ✅
5. `processSkip` (engine.js) ✅

### Lore
The Abyss is a vast underground network. Before the Infection, natural creatures (bats, rats, slimes) lived there. When the Infection spread, it twisted some creatures (Infected Colossus, Corrupted Guardian) while others remained natural. Deeper floors hold ancient constructs and void-touched entities.

---

## Mod system

### Three-tier moderator system:
- **Global Mod** (`globalMods`) - all commands, all systems
- **RPG Mod** (`rpgMods`) - RPG commands only (combat, classes, items, dungeons, abyss, runes)
- **Cards Mod** (`cardsMods`) - Cards commands only (spawn, market, deck, eshop, espawn, t2edeck, setprice, event)
- Card system `isMod` flag = `overrideUsers || isGlobalMod` (NOT RPG mod)
- `isCardMod` = `isOwner || inst.modJids || isMod || isCardsMod`

### Hardmute
- Global, no expiry, owner-only
- Runs at the VERY START of the message handler (before MongoDB persist, before any command processing)
- Attempts delete on EVERY message from hard-muted users in GCs
- Does NOT check `botIsAdmin` before attempting (the check was unreliable due to LID/phone mismatch)
- WhatsApp silently ignores delete requests from non-admins - that's expected
- Log shows `Delete attempted` on success, `Delete FAILED` on failure

### Broadcast GC selection
- `.j updateall` shows numbered list of all GCs
- Reply with: `1,3,5` (specific), `1-5` (range), `1,3-5,8` (combo), `all`, or `cancel`
- Selection expires after 5 minutes
- Uses `core/rpg/broadcastHelpers.js` (separate module)

---

## Key design patterns

1. **Multi-tenant via AsyncLocalStorage** - `botConfig.js` resolves the active tenant from the call stack.

2. **JID normalization hell** - WhatsApp sends participant IDs in 3+ formats. `core/utils/lidResolver.js` is the canonical resolver. `resolveJidHelper()` in economy.js handles LID↔phone swap.

3. **In-memory `gameStates` Map** - all active dungeon/PvP/trial sessions live in a global Map keyed by `chatId` or `chatId_userId`.

4. **Go microservice for images** - combat scenes, card images, deck renders all go through `core/utils/goImageService.js` → `http://10.0.1.56:7860`.

5. **LFS for large assets** - `cards_data.json` (35K cards, ~16MB), all PNGs, TTF fonts are Git-LFS. Always run `git lfs pull` after cloning.

6. **`sock.sendMessage` monkey-patch** - auto-injects `jpegThumbnail: FALLBACK_THUMB` for all image/video messages. Prevents Baileys from calling sharp. Do NOT remove.

7. **System model: `systems` collection (plural)** - Mongoose pluralizes the model name. The `system` util (`core/utils/system.js`) uses `core/models/System.js` which maps to the `systems` collection. When querying MongoDB directly, use `db.collection('systems')` not `db.collection('system')`.

8. **Enemy sprite inventory (30 files, all 64×96 single-frame):**
   - fire: (5), (6), (7), (8), (11) - 5 files
   - water: (4), (6), (7) - 3 files
   - earth: (1), (2), (3), (4), (5) - 5 files
   - ice: (1), (2), (3) - 3 files
   - mutated: (1) through (7) - 7 files
   - hybrides: (1) through (7) - 7 files
   - Boss sprites: 33 files (`boss_N_N.png` / `boss_N_S.png`), all verified single-frame

9. **Gambling anti-abuse (3 layers):**
   - House edge: `min(0.03 + rounds * 0.001, 0.10)` - scales 3% → 10%
   - Daily profit cap: 2,000,000 Zeni net profit per day
   - Forced loss: `min(max((rounds - 20) * 0.005, 0), 0.10)` - starts after 20 rounds, caps at 10%

10. **Economy clamp:** `MAX_WALLET = 2,000,000,000` (2B), `MAX_BANK = 10,000,000,000` (10B). Applied on every user load via `clampWallet()`.

---

## Codebase layout (whatsapp-bot)

```
whatsapp-bot/
├── index.js                 # Bootstrap - loads instances, starts Baileys
├── botConfig.js             # Active-tenant resolver (AsyncLocalStorage)
├── db.js                    # Mongoose connector (maxPoolSize=10, minPoolSize=2)
├── core/
│   ├── engine.js            # Main message router (~26K lines) - ALL command handlers
│   ├── commands/            # Command entry points (rpg, shop, repair, admin, summon)
│   ├── rpg/                 # RPG subsystems
│   │   ├── economy.js       # Wallet, bank, daily, rob, transfers, premium tiers
│   │   ├── progression.js   # XP scaling, leveling, stat allocation
│   │   ├── guildAdventure.js # PvE combat, dungeons, Abyss integration, summon turns
│   │   ├── pvpSystem.js     # PvP duels (player + summon mode), stakes, flee penalties
│   │   ├── summonSystem.js  # Summon registry, deploy, deck/backlog, swap, dismiss
│   │   ├── abyssSystem.js   # Endless dungeon, floor rewards, fragment drops
│   │   ├── cardSystem.js    # Card collection, deck building, market, spawns
│   │   ├── broadcastHelpers.js # Broadcast GC selection (separate module)
│   │   ├── classEncounters.js # Enemy definitions with gold/XP rewards
│   │   └── ...              # 20+ other RPG subsystems
│   ├── models/              # Mongoose schemas (User, Summon, Guild, Bounty, etc.)
│   ├── utils/               # goImageService, lidResolver, security, pfpCache
│   ├── chat/                # AI context engine (Groq-powered)
│   ├── games/               # Minigames: chess, wordle, ludo, tictactoe
│   └── rpgasset/            # PNG assets (LFS-tracked)
├── instances/Jake/          # Per-tenant config, auth (TRACKED IN GIT)
├── instances/Joker/         # Per-tenant config, auth (TRACKED IN GIT)
├── instances/Subaru/        # Per-tenant config, auth (TRACKED IN GIT)
├── docs/                    # Developer documentation
└── package.json
```

---

## Common operations

### Check bot status (Box 1)
```python
ssh.exec_command("pm2 list")
ssh.exec_command("pm2 logs whatsapp-bot --lines 50 --nostream")
```

### Check Go service status (Box 2)
```python
ssh.exec_command("pm2 list")
ssh.exec_command("curl -s http://127.0.0.1:7860/health")
```

### Restart bot / Go service
```python
ssh.exec_command("pm2 restart whatsapp-bot --update-env")
ssh.exec_command("pm2 restart bot-generation-go --update-env")
```

### Deploy Go service
```python
# Upload .go files via SFTP, then:
ssh.exec_command("cd ~/bot_generation && export PATH=/usr/local/go/bin:$PATH && go build -o bot-generation . && pm2 restart bot-generation-go --update-env")
```

### VLM verification (for render testing)
```bash
z-ai vision -p "Describe what you see in this image" -i /path/to/image.png
```

### Pixel comparison (verify sprites are different)
```python
from PIL import Image
import numpy as np
img1 = np.array(Image.open("sprite1.png").convert("RGBA"))
img2 = np.array(Image.open("sprite2.png").convert("RGBA"))
# Compare enemy region (right side)
region1 = img1[200:500, 700:950, :3]
region2 = img2[200:500, 700:950, :3]
diff = np.abs(region1.astype(int) - region2.astype(int)).mean()
print(f"Mean diff: {diff:.1f} - {'DIFFERENT' if diff > 5 else 'SAME'}")
```

---

## What was fixed (August 2026 sessions)

### Combat renderer overhaul (Bot_genaration)
- **Zigzag formation:** 4-column layout with alternating rows (cols 1+3 / cols 2+4)
- **Slot tables:** `PlayerSlots`, `SummonSlots`, `EnemySlots` in `layout.go`
- **Center gap:** 430px between player and enemy formations
- **Crop-first-then-resize-by-height:** all sprites normalized to fixed height
- **Y-sorted z-order:** front-row draws on top of back-row (was backwards)
- **Turn indicator fallback:** `isAttacker()` falls back to `player[0]` when `req.Action` is nil
- **Nameplate pills:** translucent dark pills above HP bars
- **Abyss banner:** `Floor` field shows "FLOOR N" instead of rank
- **Case-insensitive class lookup:** `GetCharacterSpritePath` uppercases class before map lookup
- **1:1 enemy sprite mapping:** each enemy name → specific numbered sprite file (no generic fallback)

### Abyss system fixes (whatsapp-bot)
- **Missing return in enter handler:** was falling through to "Unknown Abyss command: enter"
- **Combat starts after events:** processEventChoice/processTreasure/processSkip now call `startAbyssCombat`
- **Boss variety:** multiple bosses per tier (was 1 per tier)
- **Boss floor pattern:** boss every 5th floor (was every floor 21+)
- **F-tier enemy pool:** RABID_RAT, CAVE_BAT, EMBER_SPAWN, FROST_WISP, SLIME (was STONE_HULK)
- **Leave/exit aliases:** `.j abyss leave` and `.j abyss exit` work as retreat aliases
- **Abyss auto-retreat fix:** `progression` and `economy` now `require()`d locally (were undefined)

### Mod system fixes (whatsapp-bot)
- **Hardmute auto-delete:** runs at message handler start, attempts delete on every message
- **Sibling prefix guard:** loads sibling configs, skips messages with sibling prefixes
- **Card mod permissions:** t2edeck, setprice, event now include `isCardMod`
- **Compact instances UI:** box-drawing borders, 2 lines per bot
- **Uptime persistence:** survives reconnects via PID check in MongoDB
- **Broadcast GC selection:** numbered list, bulk selection (1,3,5 / 1-5 / all / cancel)

### Joker instance
- **Enabled:** `botConfig.json` has `"enabled": true` + `"pairingPhone": "233509676154"`
- **Auth:** full auth folder (pre-keys, sessions, lid-mappings, not just creds.json)
- **Connected:** all three bots (Jake, Joker, Subaru) running simultaneously

---

## Known issues (August 2026)

1. **Animated combat disabled** - MP4 encoding too slow for Box 2 (6-27s per encode). Code is complete, just needs a bigger Go service instance.
2. **Box 1 RAM constrained** - 954MB total, bot uses 250-340MB. PM2 `max_memory_restart: 450M` prevents OOM.
3. **GitHub Actions deploy sometimes doesn't trigger** - Deploy manually via SSH when this happens.
4. **VLM (z-ai vision) can be unreliable for dark sprites** - Always ask detailed questions, not binary FLOATING/GROUNDED judgments.
5. **Render.com Go service suspended** - The `bot-genaration-iat6.onrender.com` URL returns 503. The Go service runs on Box 2 (Oracle) at `http://10.0.1.56:7860`, not Render. The Render URL in `.env` is a fallback that's currently broken.
6. **Enemy sprites are 64×96 pixel art** - small but valid. Not name-specific art (a CAVE BAT doesn't look like a bat), but each enemy gets a unique file within its element family. Boss sprites ARE name-specific.
7. **Abyss combat is still a parallel system** - shares `startCombat()` but has separate floor-advancement glue code. Not architecturally unified.

---

## Communication style

The owner (BrainMell / "Mellow") is hands-on, prefers concrete numbers, hates vague "should be higher" suggestions. Always cite file:line. Show before/after when proposing changes. Don't add features without asking - fix what's broken first. Code comments in English only. Ask before merging to `main` or pushing to the Go service repo. The server has no GitHub PAT - tell the user to push from their local machine.

**The user HATES when agents say "should work" without testing.** Always capture screenshots, run actual commands, show VLM verification, and show pixel measurements. Code diffs alone are not proof - the user wants to see the rendered output working.

**When fixing rendering bugs, check ALL render paths (PvE, PvP-1v1, PvP-summon).** A fix in one path often doesn't carry to the others. Always verify against all three with screenshots.

**The user can tell when you're papering over gaps.** If you removed functionality instead of fixing it, say so. If you only checked 3 out of 5 call sites, say so. If the test output is trimmed, say so. Honesty about limitations builds trust; hiding them destroys it.

**Never upload stale local files to the server.** Always `git pull` on the server first, or make changes directly on the server. This was the #1 cause of regressions.

---

## The RPG Card System (MANDATORY READING since 2026-09-16)

**Canonical spec: `docs/CARD-SYSTEM.md` in the repo.** Read it before creating or
modifying ANY RPG image card. The non-negotiables, summarized:

1. **`.j cardstyle` is a card SYSTEM theme, not a recolor.** The player's chosen style
   (1-10, stored as `cardStyle` on the user doc) drives EVERY general RPG presentation
   card: profile/character (Node, `profileCardRenderer.js` + `layouts.json`), and the Go
   portrait family (`RANK`, `ALLOCATE`, `ABILITIES` themed today; `SKILLUP`/`EQUIP`/`SHOP`
   accept `style` and are the roadmap). Style 7 = Royal Decree = baked-art baseline
   (`bg_*.png`); styles 1-6/8-10 render through `drawPortraitShell` + `cardTheme` roles
   in `pkg/combat/theme.go`.
2. **Never hardcode a color that has a theme role.** Roles: `Bg Bg2 Panel PanelEd Plate
   PlateTx Banner BannerTx BannerEdge Ink Muted Sub Gold PillBg PillTx Track Fill FillHi
   Done Seal SealTx Caption FrameStyle`. Decree values in `decreeTheme()` are byte-identical
   to the legacy literals - swapping literals to roles must not change the default render.
3. **Same universe, different purpose.** Card kinds keep their own composition; themes
   own palette/frame/motif/typography. Ten styles ≠ one card recolored ten times.
4. **Battle cards (DUEL/QUEST/TRIAL/ABYSS/combat-end) intentionally stay on baked Royal
   Decree art** for combat legibility - do not theme them without the owner's ask.
5. **Translucency rule:** translucent fills use `color.NRGBA`. `color.RGBA` with R/G/B
   greater than alpha is ILLEGAL premultiplied and Go garbles it into random hues (this
   was the Ludo mismatched-colors root cause).
6. **Effect runes** (abilities/skills): only the DejaVu-verified whitelist in
   `docs/CARD-SYSTEM.md` §6, derived from the REAL skill schema via `effectRunes()` -
   never claim an effect the engine does not apply. Cinzel/MedievalSharp have no symbol
   coverage; probe new glyphs before shipping them.
7. **Abilities codex identity** comes from the BEGINNER class (`lineage[last]`):
   FIGHTER→COMBAT CODEX, SCOUT→HUNTER'S LEDGER, APPRENTICE→ABILITY GRIMOIRE,
   ACOLYTE→PRACTITIONER'S CODEX (payload fields `docTitle`/`docQuote`).
8. **Pagination:** `.j abilities <page>` pattern - flatten, slice in Node (12 rows/page),
   global numbering preserved (`startNumber` to Go), page label top-right, nav hint in
   caption. Never render one enormous image for 20+ items.
9. **Cards = presentation, commands = interaction.** Every card command keeps a text
   fallback; never a dead end; never a giant command sheet inside an image.
10. **Test the render matrix** (at minimum styles 0,1,2,5,7,8,9,10 + empty payload +
    long names) before declaring a card done. The user wants rendered-output proof.

### Games forfeit rule (2026-09-16, established with Ludo)

Every player-abandonment path in a multiplayer game resolves as a FORFEIT with an
explicit announcement: voluntary leave (`.ludo leave`), `.ludo end` by a player, group
departure/kick (`group-participants.update` → `ludo.handleParticipantLeave`), inactivity
timeout (dissolved, no contest). Win-by-forfeit pays normal rewards. Game state is always
fully cleaned (`activeGames` delete + timer clear). Apply the same audit to any future
multiplayer game.
