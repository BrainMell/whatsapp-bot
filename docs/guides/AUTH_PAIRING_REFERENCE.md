# WhatsApp Bot Pairing & Authentication Reference Guide

> **CRITICAL RULE**: NEVER use `node index.js` to pair a bot. Always use `scripts/pair.js`.

---

## 1. Why `node index.js` Fails for New Pairing

When pairing a bot for the first time or re-pairing an expired session:

1. **The Normal 515 Handshake**:
   - When a phone number enters the pairing code on WhatsApp, WhatsApp's servers immediately terminate the initial socket with status code `515 (Stream Errored / restart required)`.
   - This status `515` is **normal and expected Baileys behavior** — WhatsApp requires the client to reconnect immediately to exchange and store the permanent encryption keys.

2. **The `index.js` Trap (401 Logged Out)**:
   - When `engine.js` restarts after code `515`, it kicks off its full boot sequence:
     - Connecting to MongoDB and loading 5,500+ users.
     - Loading 7,000+ LID mappings.
     - Rehydrating active games (Murder Mystery watchdogs, Chess, RPG).
     - Running guild, loan, news scraping, and economy checks.
   - This massive workload blocks Node's event loop for 30–60+ seconds.
   - WhatsApp's server handshake deadline expires while Node is busy with MongoDB queries.
   - WhatsApp aborts the session with **`401 Logged Out`**, corrupting the newly paired auth.

3. **Multi-Instance Interference**:
   - Starting multiple unauthenticated bots at once (e.g., `BOT_INSTANCES=Joker,Subaru node index.js`) causes WhatsApp's gateway to drop the unauthenticated QR/pairing noise packets due to connection throttling from a single IP.

---

## 2. The Solution: `scripts/pair.js`

`scripts/pair.js` is a standalone, lightweight authenticator built specifically for generating pairing codes and saving auth files.

- **0 Database**: No MongoDB connection.
- **0 Schedulers**: No cron, no news scrapers, no RAM traps.
- **0 Game Logic**: No Murder Mystery, no cards, no RPG.
- Boots in **< 1 second**, requests pairing code in **< 5 seconds**, handles code `515` restart in **2 seconds**, flushes all session keys to disk, and exits cleanly with code `0`.

---

## 3. Step-by-Step Pairing Workflow

### Step 1: Wipe the stale auth folder for the target bot
```bash
rm -rf instances/<BotName>/auth && mkdir -p instances/<BotName>/auth
```

### Step 2: Run the standalone authenticator
```bash
node scripts/pair.js <BotName>
# Examples:
node scripts/pair.js Joker
node scripts/pair.js Subaru
```
*(Optionally pass a phone number if different from `botConfig.json`: `node scripts/pair.js Joker 233509676154`)*

### Step 3: Enter the code on WhatsApp
- The terminal will display:
  ```text
  ╔══════════════════════════════════════════════════╗
  ║  🔑 PAIRING CODE FOR [Joker   ]: ABC12345        ║
  ╚══════════════════════════════════════════════════╝
  ```
- On the phone: **WhatsApp → Settings → Linked Devices → Link a Device → "Link with phone number instead" → Enter code**.

### Step 4: Let the script finish and exit automatically
- You will see:
  ```text
  ⚠️ Connection closed. Status code: 515 (Stream Errored (restart required))
  🔄 Normal post-pairing restart (515). Reconnecting in 2 seconds to finalize session...
  🎉🎉🎉 [SUCCESS] Joker is officially authenticated and connected! 🎉🎉🎉
  💾 Writing final session files to disk...
  ✅ Auth files completely saved in .../instances/Joker/auth.
  🏁 Exiting standalone authenticator cleanly.
  ```

### Step 5: Commit and push ONLY the auth folder
```bash
git add -f instances/<BotName>/auth/
git commit -m "feat(auth): add fresh authenticated session files for <BotName>"
git push -4 origin audit/fix-pass-1
```
*(Always use `-4` with git to force IPv4 and prevent GitHub timeouts).*
