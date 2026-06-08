# Chat Subsystem: Context-Aware AI Engine & Summaries

## What it is
The Context-Aware AI Engine is designed to process and store chat memories, jokes, and facts about group participants, as well as generate automated summaries of group conversations. It operates by listening to all incoming text messages, buffering them in memory, and executing trigger scans to detect relevant facts or topics. The module integrates with the Groq API for large language model (LLM) completions. It stores its working memory state in circular buffers managed per-chat by `BufferManager`, and persists long-term extracted user and group facts to a MongoDB database (via economy modules and Mongoose schemas). It is triggered by incoming messages that hit specific keywords or commands (like `.j summary` or `.j recap`).

## How it works

**AI Group Summary Generation** — [engine.js L1131-L1185](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L1131-L1185)
```javascript
    // Create AI-powered summary with user mentions
    async function createGroupSummary(messages) {
      try {
        let chatContext = "";
        const nameToJid = new Map();

        // Build context using only actual names from THIS chat
        messages.forEach((msg) => {
          // Clean the name so the AI doesn’t get confused
          const cleanName = msg.senderName.replace(/[^a-zA-Z0-9]/g, "");
          nameToJid.set(cleanName, msg.sender);
          chatContext += `${cleanName}: ${msg.text}\n`;
        });

        const participants = Array.from(nameToJid.keys()).join(", ");

        const res = await groq.chat.completions.create({
          messages: [
            {
              role: "system",
              content:
                "You summarize chats. Stick to facts, keep it short, and use @Name when mentioning people. No roleplay, no extra fluff.",
            },
            {
              role: "user",
              content: `Participants: ${participants}

Chat:
${chatContext}

What to do:
1. Summarize the main points.
2. Call out key people using @Name.
3. Keep it direct.`,
            },
          ],
          model: "llama-3.1-8b-instant",
        });

        let summaryText = res.choices[0].message.content;
        const mentionedJids = [];

        // Swap @Name with real WhatsApp-style @numbers
        for (const [name, jid] of nameToJid.entries()) {
          const tag = `@${name}`;
          if (summaryText.includes(tag)) {
            const phone = jid.split("@")[0];
            summaryText = summaryText.split(tag).join(`@${phone}`);
            mentionedJids.push(jid);
          }
        }

        return { text: summaryText, mentions: mentionedJids };
      } catch (err) {
        return { text: "Summary failed.", mentions: [] };
      }
    }
```
This function aggregates recent chat messages, formats them into a dialogue script, and calls the Groq completion API to produce a structured summary. Once generated, it scans the response text for `@Name` placeholders and replaces them with WhatsApp-style telephone number mentions (e.g., `@1234567890`), gathering the associated JIDs to allow the Baileys WebSocket API to properly tag users.

---

**Context-Aware Memory Extraction Trigger** — [Engine.js L27-L65](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/src/context_engine/Engine.js#L27-L65)
```javascript
    async onMessage(rawMsg, body) {
        // 1. Normalize message
        const msg = {
            id: rawMsg.key.id,
            chatId: rawMsg.key.remoteJid,
            userId: jidNormalizedUser(rawMsg.key.participant || rawMsg.key.remoteJid),
            username: rawMsg.pushName || "Unknown",
            content: body || "",
            timestamp: new Date(),
            replyTo: rawMsg.message?.extendedTextMessage?.contextInfo?.stanzaId || null
        };

        if (!msg.content) return;

        // 2. Buffer message
        bufferManager.addMessage(msg);

        // 3. Detect Triggers
        const triggers = triggerDetector.detect(msg.content);

        if (triggers.length > 0) {
            // 4. Get Context
            const context = bufferManager.getContext(msg.chatId, msg.id, 15, 3);

            // 5. Segment Topics
            const segments = topicSegmenter.segmentConversation(context);
            const relevant = topicSegmenter.findRelevantSegment(msg.id, segments);

            // 6. Enqueue for batching
            const task = {
                timestamp: msg.timestamp,
                message: msg,
                context: relevant.length > 0 ? relevant : context,
                triggerTypes: triggers
            };

            await adaptiveProcessor.enqueue(task);
        }
    }
```
This method processes every incoming message by normalising raw data, updating the in-memory circular buffer via `BufferManager`, and scanning the message text with `TriggerDetector`. When context-relevant keywords are matched, it queries nearby buffered context, segments it by topic flow, and enqueues a memory extraction task in the batch queue.

---

**Saving Group-Wide Context Results** — [Engine.js L169-L222](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/src/context_engine/Engine.js#L169-L222)
```javascript
        // Save group-wide context
        const chatId = batch && batch.length > 0 ? batch[0].message.chatId : null;
        if (chatId && chatId.endsWith("@g.us") && data.group) {
            try {
                const GroupProfile = require('../../models/GroupProfile');
                let groupProfile = await GroupProfile.findOne({ chatId });
                if (!groupProfile) {
                    groupProfile = new GroupProfile({ chatId });
                }
                
                let groupChanges = 0;
                
                if (data.group.insideJokes && Array.isArray(data.group.insideJokes)) {
                    if (!groupProfile.insideJokes) groupProfile.insideJokes = [];
                    data.group.insideJokes.forEach(j => {
                        if (j.joke && j.joke.trim()) {
                            const exists = groupProfile.insideJokes.some(existing => existing.joke.toLowerCase() === j.joke.toLowerCase());
                            if (!exists) {
                                groupProfile.insideJokes.push({
                                    joke: j.joke.trim(),
                                    establishedBy: j.establishedBy || "Unknown",
                                    timestamp: new Date()
                                });
                                groupChanges++;
                            }
                        }
                    });
                }
                
                if (data.group.groupFacts && Array.isArray(data.group.groupFacts)) {
                    if (!groupProfile.groupFacts) groupProfile.groupFacts = [];
                    data.group.groupFacts.forEach(f => {
                        if (f.fact && f.fact.trim()) {
                            const exists = groupProfile.groupFacts.some(existing => existing.fact.toLowerCase() === f.fact.toLowerCase());
                            if (!exists) {
                                groupProfile.groupFacts.push({
                                    fact: f.fact.trim(),
                                    confidence: f.confidence || 1.0,
                                    timestamp: new Date()
                                });
                                groupChanges++;
                            }
                        }
                    });
                }
                
                if (groupChanges > 0) {
                    await groupProfile.save();
                }
            } catch (err) {
                console.error("❌ Brain: Failed to save group context results:", err.message);
            }
        }
```
This block is executed when a batch of processed items completes. It retrieves the active group profile from MongoDB using the Mongoose model `GroupProfile`. It checks the extracted inside jokes and group-wide facts, checks for duplicates, and saves any new entries back to the database.

## How to modify it
To modify the context engine's behavior, developers can adjust settings such as in-memory message history sizes or model preferences.

```javascript
// BEFORE (BufferManager.js L10)
this.maxSize = 50; // Buffer size from guide
```
```javascript
// AFTER (BufferManager.js L10)
this.maxSize = 100; // Increased buffer size to retain more chat history
```

```javascript
// BEFORE (engine.js L1166)
          model: "llama-3.1-8b-instant",
```
```javascript
// AFTER (engine.js L1166)
          model: "llama-3.3-70b-specdec",
```

## Common tasks
- **Change the maximum buffer size** — Adjust the maximum number of messages stored in the circular buffer in [BufferManager.js L10](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/src/context_engine/BufferManager.js#L10).
- **Modify the TTL for stale windows** — Adjust how long message history is cached in [BufferManager.js L11](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/src/context_engine/BufferManager.js#L11).
- **Change the Groq LLM model used for chat summaries** — Update the model identifier in [engine.js L1166](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L1166).
- **Adjust the summary context range size** — Modify how many preceding messages are fetched for context triggers in [Engine.js L49](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/src/context_engine/Engine.js#L49).
- **Modify the system instructions for summaries** — Edit the developer system prompt for Groq completions in [engine.js L1148-L1152](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/engine.js#L1148-L1152).
