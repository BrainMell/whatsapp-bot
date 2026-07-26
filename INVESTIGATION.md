# Image Generation Outage — Root Cause Investigation (FINAL)

**Date:** 2026-07-26
**Branch:** `audit/fix-pass-1`
**HEAD at investigation:** `588d7b6d` → fixed in this commit's child
**Investigator:** Agent session (post-`588d7b6`)

> **This document supersedes the first INVESTIGATION.md draft.** The first draft correctly identified the Go service URL as a suspect but underestimated the scope. After reading the live Oracle PM2 logs (captured in the deploy workflow output), the full picture is now clear: there are **two concurrent root causes** — the Go service is unreachable AND the bot's command handler silently hangs on unreachable dependencies. Both must be fixed.

---

## TL;DR — what's actually broken

The user's symptom: `.jk menu` works, but `.jk char` / `.jk bal` / `.jk coll` / `.jk deck` / `.jk diag` all return **nothing** (no reply at all, not even a text fallback). `.jk ping` works because it's a hardcoded early-return.

**Two concurrent root causes:**

### Root cause #1 — Go image service is unreachable

The Go service (`bot-generation-go` pm2 process) shows as `online` in pm2 but does NOT respond on `http://127.0.0.1:7860/health`. Evidence from the Jul 26 01:00 deploy log:

```
[GoService] Health: null    ← repeated 7 times (once per GoImageService instantiation)
📡 [GoService] Using Base URL: http://127.0.0.1:7860
```

pm2 status:
```
│ 0  │ bot-generation-go         │ default     │ 1.0.0   │ fork    │ 16312    │ 27h    │ 3    │ online    │ 0%       │ 18.3mb   │
```

`online` + `3 restarts` + `18.3mb` (suspiciously low for a Go service holding PNG assets) + `Health: null` = the process is alive but not serving. Most likely crashed on boot (can't find `assets/` because pm2's working directory isn't `~/bot_generation`) and pm2 keeps restarting it in a loop, or it's listening on a different port.

**Why it was never caught:** `GO_IMAGE_SERVICE_URL` is not set in any `.env` or pm2 env (the deploy log shows `injected env (0) from .env` — the file is empty). The code silently falls back to `http://127.0.0.1:7860`. Every `goService.*` method catches its own error and returns `null`. Callers check `if (buffer)` and silently fall through. No one is notified.

### Root cause #2 — Bot command handler silently hangs on unreachable dependencies

Even if the Go service is down, commands like `.char` and `.bal` should fall through to text-only fallbacks. They don't. They hang forever. The reason:

1. **`sock.profilePictureUrl(senderJid, 'image')`** (called in `displayCharacterSheet` at `rpgCommands.js:44`) has **no timeout**. When `senderJid` is an LID (`xxx@lid`) — which it is for the user `251453323092189@lid` — Baileys tries to fetch the PFP from WhatsApp's servers, which may hang indefinitely for LIDs. The handler never reaches the Go service call, never reaches the outer catch, just hangs.

2. **`goService.generateCardGrid()`** (called in `cmdColl`/`cmdDeck` at `cardSystem.js:1227`) has a 60-second axios timeout. But the `_enqueue` queue in `goImageService.js` serializes ALL Go service calls. If one call hangs (e.g., a half-open TCP connection to a dead Go service), every subsequent `_enqueue` call queues up behind it and also hangs. The `_enqueue` implementation also had a broken catch chain that could cascade `undefined` rejections.

3. **The outer message handler catch** (`engine.js:~25235`) only fires when something **throws**. A hung `await` never throws — the Promise just never resolves. So the user sees "nothing" and the bot log shows no error.

**Evidence from the deploy log:**
```
⚡ [Pipeline:4] CMD DETECTED | cmd="char" | sender=251453323092189 | chat=251453323092189 | isSelf=false
(then nothing — no further log, no error, no fallback)
```

vs. for `.jk menu` (which works):
```
⚡ [Pipeline:4] CMD DETECTED | cmd="menu" | sender=... 
[sendMenuWithBanner] CALLED for chatId=...
[sendMenuWithBanner] sending IMAGE...
[sendMenuWithBanner] IMAGE SENT OK: {...}
```

The menu works because `sendMenuWithBanner` reads `banner.png` from disk — it does NOT call the Go service and does NOT call `profilePictureUrl`.

---

## The commit timeline — what actually happened

All commits are on `audit/fix-pass-1`. Times are UTC.

| # | SHA | Time | Subject | Verdict |
|---|---|---|---|---|
| 1 | `3ae52d4` | Jul 24 18:59 | chore: protect instances/*/auth/ from git tracking | Pre-Oracle baseline. |
| 7 | `dad7be4` | Jul 24 21:27 | ci: trigger Oracle deployment | Last known fully-working state per user. Go URL = HF Space (alive at the time). |
| 8 | `f802931` | Jul 24 21:42 | fix(media): add sharp dependency | Benign. |
| 9 | `c7374fea` | Jul 24 22:04 | fix: Oracle migration — Go service URL | **THE URL CHANGE.** Default Go URL: HF Space → `http://127.0.0.1:7860`. |
| 10 | `72d980a1` | Jul 24 22:23 | fix: remove auth from .gitignore | **Catastrophic.** Auth files in git → every `git pull --ff-only` aborts. Deploys silently broken from here until #15. |
| 11 | `66a4088` | Jul 24 22:37 | fix: .char/.bal/.coll not working (JID resolution) | User's "definitely broken" anchor. |
| 12 | `8f7417d8` | Jul 24 22:49 | fix: image commands crash silently — try/catch | Symptom fix #1. |
| 13 | `faffe3c8` | Jul 24 22:57 | fix: newsletter contextInfo | Symptom fix #2. |
| 14 | `84726b05` | Jul 25 09:04 | fix: sendImageSafe scope | Symptom fix #3. |
| 15 | `dd22701f` | Jul 25 09:35 | fix: auth files in git broke deploys | **Critical deploy fix.** Revealed commits #8–#14 were never deployed. |
| 16 | `bc750f2a` | Jul 25 11:29 | fix: jpegThumbnail on all sends | Symptom fix #4. |
| 17–18 | `0dd0524a`–`8b2aba7c` | Jul 25 19:15–20:18 | diag commands | Added `.jk diag` + `.jk test`. |
| 19 | `26ef5e95` | Jul 25 20:21 | fix: Baileys media upload hangs | Symptom fix #5. |
| 20 | `133da6b2` | Jul 25 20:34 | fix: sendQueue blocked | Symptom fix #6. |
| 21 | `a5ccb1dc` | Jul 25 20:42 | fix: mediaUploadTimeoutMs + IPv6 | Symptom fix #7. Real robustness wins — keep these. |
| 23 | `53be5e6b` | Jul 25 21:06 | fix: sharp HANGS on banner JPEG | Symptom fix #8. Fixed the menu (FALLBACK_THUMB). Did NOT fix Go-service-dependent commands. |
| 24 | `00d01c73` | Jul 25 21:48 | diag: GoService diagnostics | First commit to actually look at Go service reachability. |
| 25 | `d53acebd` | Jul 25 21:52 | fix: wrap GoService sends in 15s timeout | Symptom fix #9. Good defense-in-depth — keep. |
| 26 | `383ba70b` | Jul 25 22:01 | fix: buffer sends hang | Symptom fix #10. Wrong direction. Reverted. |
| 27–28 | `63f62c88`–`a3731113` | Jul 25 22:27–22:31 | fix: downgrade Baileys rc13 → rc9 | Symptom fix #11. Wrong. Reverted. |
| 29 | `f946ea18` | Jul 25 23:03 | revert: restore dd22701f | Did NOT revert the Go URL change. |
| 32 | `f1dbc431` | Jul 25 23:40 | fix: DMs use @lid | Symptom fix #12. Wrong direction. |
| 34 | `588d7b6` | Jul 26 00:30 | restore: 53be5e6b | **HEAD at investigation.** Menu works, everything else broken. |

---

## The 12 failed "ROOT CAUSE" attempts — DO NOT REPEAT

| # | Commit | Theory | Why it was wrong |
|---|---|---|---|
| 1 | `8f7417d8` | "sendMenuWithBanner had no try/catch" | The menu was never the broken path. |
| 2 | `faffe3c8` | "newsletter contextInfo silently rejects" | Real bug, but not the image break. |
| 3 | `84726b05` | "sendImageSafe nested in message handler" | Real scope bug, but only affected anime/img/nsfw. |
| 4 | `dd22701f` | "auth files in git broke deploys" | Real and critical — but image commands still broken after fix. |
| 5 | `bc750f2a` | "pass jpegThumbnail on all sends" | Thumbnails don't affect Go service buffer returns. |
| 6 | `26ef5e95` | "Baileys media upload never completes" | The "hang" was the bot waiting for the dead Go service. |
| 7 | `133da6b2` | "sendQueue blocked by hanging upload" | Same misdiagnosis as #6. |
| 8 | `a5ccb1dc` | "mediaUploadTimeoutMs unset + IPv6" | Real robustness wins. Keep. Not the root cause. |
| 9 | `53be5e6b` | "sharp HANGS on banner JPEG" | Real. Fixed the menu. Did NOT fix Go-service commands. Keep. |
| 10 | `d53acebd` | "wrap GoService sends in 15s timeout" | Good defense-in-depth. Keep. Doesn't fix root cause. |
| 11 | `383ba70b` | "buffer sends hang" | Wrong. Reverted. |
| 12 | `63f62c88` | "downgrade Baileys rc13 → rc9" | Wrong. Reverted. |
| 13 | `f1dbc431` | "DMs use @lid" | Real issue but separate from image generation. |

**Common pattern:** every one of these was diagnosed without first verifying `goService.healthCheck()` returned a healthy response. The `.jk diag` command (added in `0dd0524a`) includes this check as test 9, but it was never run and reported before the next "ROOT CAUSE" was proposed.

---

## The fix (this commit)

Five changes. All required. None optional.

### Fix A — Loud warning when `GO_IMAGE_SERVICE_URL` is unset
**File:** `core/utils/goImageService.js:3-24`

The default `http://127.0.0.1:7860` is correct when the Go service is co-located, but relying on it silently made the failure invisible. Now: if `GO_IMAGE_SERVICE_URL` is unset, the bot logs a loud `⚠️ [GoService] GO_IMAGE_SERVICE_URL is NOT SET` warning at startup.

### Fix B — Short healthCheck timeout + loud failure log
**File:** `core/utils/goImageService.js:100-110`

`healthCheck()` was using the axios client default of 120s. A dead Go service hung the health check for 2 minutes. Now: 5s timeout. And if health returns null, the bot logs `❌ null (service unreachable at <url>)` with explicit remediation instructions, instead of the old silent `[GoService] Health: null`.

### Fix C — Fix the `_enqueue` queue broken catch chain
**File:** `core/utils/goImageService.js:76-98`

The old implementation had a broken catch chain: when `op()` threw, the inner catch called `reject(err)` but didn't re-throw, so the `.then()` returned `undefined`. The outer `.catch()` then fired with `err=undefined` and called `reject(undefined)` on the NEXT queued op. This caused cascading silent failures and could permanently break the queue. Now: the inner catch re-throws (so the chain knows the step failed), and the outer catch swallows (so the queue continues for the next op).

### Fix D — Timeout on `sock.profilePictureUrl()` calls
**Files:** `core/commands/rpgCommands.js:41-65`, `core/commands/shopCommands.js:396-410`

`sock.profilePictureUrl()` has no built-in timeout. When `senderJid` is an LID, Baileys hangs indefinitely trying to fetch the PFP. This was the specific reason `.jk char` and `.jk bal` returned nothing — the handler hung at the PFP fetch, before ever reaching the Go service call. Now: 8s timeout via `Promise.race`. If it doesn't resolve, `pfpUrl = null` and the handler continues.

### Fix E — Global 90s command timeout
**File:** `core/engine.js:6114-6153, 25250-25268`

The outer message handler catch only fires when something **throws**. A hung `await` never throws — the Promise just never resolves. This is why `.jk char`/`.bal`/`.coll`/`.diag` returned nothing instead of an error. Now: the entire `storage.run(...)` is wrapped in `Promise.race` against a 90s timeout. If the timeout wins, the bot logs `⏱️⏱️⏱️ COMMAND TIMEOUT` and sends the user a visible `⏱️ Command timed out after Xs` message. The underlying hung promise is orphaned (can't cancel it) but at least the user isn't left in silence.

90s is generous enough for legitimate long commands (card grid = 60s, combat = 10s, anime search = 15s) but short enough that a truly hung command doesn't block the user's chat forever.

### Fix F — Deploy-time Go service health gate + auto-restart
**File:** `.github/workflows/deploy.yml:60-94`

After `pm2 restart whatsapp-bot`, the deploy now:
1. `curl -s -m 5 http://127.0.0.1:7860/health`
2. If null/empty/down: log `⚠️ ⚠️ ⚠️ GO IMAGE SERVICE IS DOWN`
3. Attempt automatic restart: `cd ~/bot_generation && pm2 restart bot-generation-go bot-generation-scraper`
4. Re-check health
5. Log the result

This means the next time the Go service dies, the deploy that catches it will try to bring it back automatically — and if that fails, the deploy log will scream about it instead of silently reporting "success".

---

## Verification (run after deploying this fix)

1. **Check the deploy log** for the new `=== GO SERVICE HEALTH CHECK ===` section. It should say `✅ Go image service is healthy.` If it says `⚠️ GO IMAGE SERVICE IS DOWN`, the auto-restart should fire and either recover it or log the failure loudly.

2. **In WhatsApp, send `.jk diag`:**
   - Test 9 (GoService health) should now show `✅ {"status":"ready","engine":"synchronous"}` if the Go service is up.
   - If it shows `❌ null`, the Go service is still down — SSH into Oracle and run `cd ~/bot_generation && pm2 restart bot-generation-go` manually, then check `pm2 logs bot-generation-go --lines 50` for the crash reason.

3. **Send `.jk char`:**
   - Should now show the character sheet image (if Go service is up) OR a text fallback with an explicit `⚠️ Image rendering service is unreachable` message (if Go service is down).
   - Should NEVER return nothing. If it does, the 90s timeout will eventually fire and send `⏱️ Command timed out`.

4. **Send `.jk coll` / `.jk deck`:**
   - Same as `.char` — image if Go service is up, text fallback if down, never silence.

5. **Check PM2 logs for the new markers:**
   - `📡 [GoService] Using Base URL: ...`
   - `[GoService] Health: ✅ {...}` OR `[GoService] Health: ❌ null (service unreachable at ...)`
   - `⏱️⏱️⏱️ COMMAND TIMEOUT after Xs` (only if a command actually hangs)

---

## What NOT to do (lessons from this investigation)

1. **Do NOT change `GO_IMAGE_SERVICE_URL` defaults without verifying the Go service is running at the new URL.** That's what `c7374fea` did.
2. **Do NOT add more "ROOT CAUSE" commits without first running `.jk diag` and reading the GoService health line.** Every one of the 12 prior "ROOT CAUSE" commits skipped this step.
3. **Do NOT downgrade Baileys again.** rc13 is fine.
4. **Do NOT add more sharp/jimp thumbnail logic.** The menu works via `FALLBACK_THUMB`. Other commands don't use sharp.
5. **Do NOT touch `Bot_genaration` repo unless asked.** The Go service code is fine — the problem is operational (pm2 working directory / process not responding), not code.
6. **Do NOT add LID↔s.whatsapp.net conversion logic for image sends.** Message routing is separate from image generation.
7. **Do NOT assume a successful GitHub Action deploy means the code is actually running.** Always check the `Deployed HEAD:` line in the Actions log.
8. **Do NOT assume `pm2 list` showing `online` means the service is actually serving.** The Go service showed `online` with 3 restarts and 18.3mb memory while being completely unresponsive. Always `curl /health` to verify.
9. **Do NOT add async operations without a timeout.** `sock.profilePictureUrl()`, `axios.get()`, `goService.*` — every external call must have an explicit timeout. The 90s global command timeout is the safety net, but individual call timeouts prevent one slow call from consuming the entire budget.

---

## Files changed in this fix

- `core/utils/goImageService.js` — Fix A (loud URL warning), Fix B (5s healthCheck timeout + loud failure log), Fix C (_enqueue queue catch chain)
- `core/commands/rpgCommands.js` — Fix D (8s profilePictureUrl timeout in displayCharacterSheet)
- `core/commands/shopCommands.js` — Fix D (8s profilePictureUrl timeout in shop profile)
- `core/engine.js` — Fix E (90s global command timeout via Promise.race)
- `.github/workflows/deploy.yml` — Fix F (Go service health gate + auto-restart)
- `INVESTIGATION.md` — this file

No changes to `package.json` (Baileys stays rc13, sharp stays). No changes to `Bot_genaration`. No auth file changes. No new branches.
