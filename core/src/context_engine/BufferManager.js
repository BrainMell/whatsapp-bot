const botConfig = require('../../../botConfig');

/*
 * Manages conversational context buffers per chat.
 * Ported from WhatsApp Context Bot Guide (JS Implementation)
 */
class BufferManager {
    constructor() {
        this.windows = new Map(); // chatId -> { messages: [], lastUpdate: Date }
        this.maxSize = 50; // Buffer size from guide
        this.ttlMs = 30 * 60 * 1000; // 30 minutes TTL

        console.log('🧠 Context Buffer Manager initialized (Size: 50, TTL: 30m)');

        // Start periodic cleanup
        setInterval(() => this.cleanupStaleWindows(), 60000);
    }

    /*
     * Add a message to the chat's context window
     */
    addMessage(msg) {
        if (!msg.chatId) return;

        // Use Bot ID + Chat ID to isolate contexts in multi-tenant mode
        const contextKey = `${botConfig.getBotId()}_${msg.chatId}`;

        if (!this.windows.has(contextKey)) {
            this.windows.set(contextKey, {
                chatId: msg.chatId,
                botId: botConfig.getBotId(),
                messages: [],
                lastUpdate: new Date()
            });
        }

        const window = this.windows.get(contextKey);
        window.messages.push(msg);
        window.lastUpdate = new Date();

        // Maintain circular buffer size
        if (window.messages.length > this.maxSize) {
            window.messages.shift();
        }
    }

    /*
     * Get context around a specific message
     */
    getContext(chatId, aroundMsgId, before = 15, after = 5) {
        const contextKey = `${botConfig.getBotId()}_${chatId}`;
        const window = this.windows.get(contextKey);
        if (!window) return [];

        const messages = window.messages;
        const idx = messages.findIndex(m => m.id === aroundMsgId);

        if (idx === -1) {
            // Fallback to most recent messages if ID not found
            return messages.slice(-before);
        }

        const start = Math.max(0, idx - before);
        const end = Math.min(messages.length, idx + after + 1);
        return messages.slice(start, end);
    }

    /*
     * Remove stale conversation windows
     */
    cleanupStaleWindows() {
        const now = Date.now();
        let deleted = 0;

        for (const [chatId, window] of this.windows.entries()) {
            if (now - window.lastUpdate.getTime() > this.ttlMs) {
                this.windows.delete(chatId);
                deleted++;
            }
        }

        if (deleted > 0) {
            // console.log(`🧹 Buffer Manager: Cleaned up ${deleted} stale windows.`);
        }
    }

    getStats() {
        let totalMsgs = 0;
        this.windows.forEach(w => totalMsgs += w.messages.length);
        return {
            activeChats: this.windows.size,
            totalMessages: totalMsgs
        };
    }
}

// Singleton instance
module.exports = new BufferManager();