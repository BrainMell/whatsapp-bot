const bufferManager = require('./BufferManager');
const triggerDetector = require('./TriggerDetector');
const topicSegmenter = require('./TopicSegmenter');
const adaptiveProcessor = require('./AdaptiveProcessor');
const economy = require('../../economy'); // To interact with MongoDB users
const Baileys = require("@whiskeysockets/baileys");
const jidNormalizedUser = Baileys.jidNormalizedUser;

/**
 * Main Orchestrator for the Context Extraction System.
 */
class ContextEngine {
    constructor() {
        this.isRunning = false;
        
        // Setup storage callback
        adaptiveProcessor.setStorageCallback(async (result) => {
            await this.saveResults(result);
        });

        console.log("🚀 Context-Aware Extraction Engine Ready.");
    }

    /**
     * Entry point for every message from index.js
     */
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
            console.log(`🧠 Brain: High-value message detected from ${msg.username}!`);
            
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

    /**
     * Save extracted results to MongoDB
     */
    async saveResults(data) {
        if (!data || !data.users) return;

        for (const userData of data.users) {
            const jid = userData.userId;
            
            // Get user from economy cache/DB
            const user = economy.getUser(jid);
            if (!user) continue;

            if (!user.profile) {
                user.profile = { memories: { likes: [], dislikes: [], hobbies: [], personal: [] } };
            }

            // Map AI keys to User Model keys
            const map = {
                'preferences': 'likes',
                'experiences': 'personal',
                'interests': 'hobbies',
                'identity': 'personal'
            };

            // Process Preferences
            if (userData.preferences) {
                userData.preferences.forEach(p => {
                    const category = p.category === 'dislike' ? 'dislikes' : 'likes';
                    if (!user.profile.memories[category].includes(p.subject)) {
                        user.profile.memories[category].push(p.subject);
                    }
                });
            }

            // Process Experiences/Interests
            if (userData.experiences) {
                userData.experiences.forEach(e => {
                    const str = `${e.activity_type} ${e.subject}`;
                    if (!user.profile.memories.personal.includes(str)) {
                        user.profile.memories.personal.push(str);
                    }
                });
            }

            if (userData.interests) {
                userData.interests.forEach(i => {
                    if (!user.profile.memories.hobbies.includes(i.specific_interest)) {
                        user.profile.memories.hobbies.push(i.specific_interest);
                    }
                });
            }

            // Save back to DB
            economy.saveUser(jid);
            console.log(`🧠 Brain: Updated memory profile for ${user.nickname} (${jid})`);
        }
    }
}

// Singleton instance
module.exports = new ContextEngine();