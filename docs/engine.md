# Core System: Engine

## What it is
The Engine system is the central brain of the WhatsApp bot. It initializes the Baileys WA socket library, authenticates via multi-file storage, listens to network connection events, and intercepts incoming messages via a hot-path listener. It parses raw messaging payloads (extracting sender JID, group JID, body text, and quoted references), verifies command prefixes, handles multi-tenant instances via thread-local state, and routes execution to appropriate command modules.

## How it works

### Snippet 1: Authentication and Socket Initialization
```javascript
// File: core/engine.js (Lines 3557-3575)
        const { state, saveCreds } = await useMultiFileAuthState(
          configInstance.getAuthPath(),
        );
        const { version } = await fetchLatestBaileysVersion();
        sock = makeWASocket({
          version,
          auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(
              state.keys,
              P({ level: "silent" }),
            ),
          },
          logger: P({ level: "silent" }),
          experimentalStore: true,
          syncFullHistory: false,       // skip loading old message history on boot
          shouldSyncHistoryMessage: () => false, // ⚡ SKIP downloading/decrypting history sync messages
          markOnlineOnConnect: true,    // broadcast online status to keep connection active and warm
        });
```
* **Explanation**: Initializes the connection using Baileys. It loads the auth state from a dynamic path corresponding to the active tenant instance, fetches the latest WhatsApp web protocol version, creates a cached credentials store, and turns off chat history syncing to speed up the boot cycle.
* **DB Calls**: None (uses file-system-based multi-file auth state).
* **External HTTP Calls**: Fetches latest version info from WhatsApp API servers.
* **Baileys API Used**: `useMultiFileAuthState()`, `fetchLatestBaileysVersion()`, `makeWASocket()`, `makeCacheableSignalKeyStore()`.

### Snippet 2: Event Listener and JID Extraction
```javascript
// File: core/engine.js (Lines 4084-4107)
        sock.ev.on("messages.upsert", async ({ messages, type }) => {
          if (type !== "notify" && type !== "append") return;
          if (isRekeying) return;

          // Process batch in parallel so one slow group doesn't block the bot
          await Promise.all(
            messages.map(async (m) => {
              if (!m.message) return;

              // Skip stale backlog messages sent while the bot was offline (older than 45 seconds)
              const msgTime = (typeof m.messageTimestamp === 'number' ? m.messageTimestamp : m.messageTimestamp?.low || m.messageTimestamp) * 1000;
              if (msgTime && (Date.now() - msgTime > 45000)) {
                return;
              }

              await botConfig.storage.run(configInstance, async () => {
                try {
                  const rawChatId = m.key.remoteJid;
                  const chatId = jidNormalizedUser(rawChatId);
                  let senderJid = jidNormalizedUser(
                    m.key.participant || rawChatId,
                  );
                  senderJid = resolveLidToPhone(senderJid, configInstance.getAuthPath());
                  const isGroupChat = chatId.endsWith("@g.us");
```
* **Explanation**: Listens for incoming WhatsApp events. For each message in parallel, it filters out stale backlog items (older than 45 seconds), establishes the multi-tenant thread storage run context, and normalizes both the conversation JID and the sender's phone number JID.
* **DB Calls**: None.
* **External HTTP Calls**: None.
* **Baileys API Used**: `sock.ev.on('messages.upsert')`, `jidNormalizedUser()`.

### Snippet 3: Command Prefix Verification and Splitting
```javascript
// File: core/engine.js (Lines 4574-4581)
                  const currentPrefix = botConfig.getPrefix().toLowerCase();

                  if (lowerTxt.startsWith(currentPrefix)) {
                    const cmdBody = lowerTxt
                      .substring(currentPrefix.length)
                      .trim();
                    const cmdArgs = cmdBody.split(" ");
                    const primaryCmd = cmdArgs[0];
```
* **Explanation**: Extracts the tenant-specific command prefix, checks if the trimmed message text begins with it, strips the prefix, splits the remaining text by whitespaces, and extracts the primary command token.
* **DB Calls**: None.
* **External HTTP Calls**: None.
* **Baileys API Used**: None.

### Snippet 4: Outgoing Message Helpers
```javascript
// File: core/engine.js (Lines 4114-4121)
                  const reply = async (content, options = {}) => {
                    if (typeof content === "string")
                      content = { text: BOT_MARKER + content };
                    return await sock.sendMessage(chatId, content, {
                      quoted: m,
                      ...options,
                    });
                  };
```
* **Explanation**: Binds a scoped `reply` helper function for each incoming message execution frame, appending a standard bot identifier watermark to all text replies and passing the quoted message reference back to Baileys.
* **DB Calls**: None.
* **External HTTP Calls**: None.
* **Baileys API Used**: `sock.sendMessage()`.

## How to modify it

To register a new command directly within the core engine router:
1. Open [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js).
2. Locate the command dispatch block inside the `messages.upsert` handler (around line 4600).
3. Add a routing check for your custom command token and link it to your response execution.

### Before
```javascript
// File: core/engine.js (Around Line 4627)
                    if (primaryCmd === "menu" || primaryCmd === "help") {
                      // Menu response logic here
                    }
```

### After
```javascript
// File: core/engine.js (Around Line 4627)
                    if (primaryCmd === "hello") {
                      return reply(`Hello! @${senderJid.split('@')[0]}`, { mentions: [senderJid] });
                    }
                    if (primaryCmd === "menu" || primaryCmd === "help") {
                      // Menu response logic here
                    }
```
*Note: After defining a command, also add its descriptor entry to [core/commandRegistry.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/commandRegistry.js) to list it in the automated bot menu.*

## Common tasks

* **Add a new command route**: Add a conditional statement targeting the `primaryCmd` token inside the command intercept block of [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L4600).
* **Change the message age filter**: Edit the staleness limit check comparison value (default: `45000` milliseconds) inside [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L4095).
* **Modify default bot text reply watermark**: Edit the prefix prefixing the body inside the `reply` helper function within [core/engine.js](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L4115).
