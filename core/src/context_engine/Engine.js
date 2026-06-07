const bufferManager = require('./BufferManager');
const triggerDetector = require('./TriggerDetector');
const topicSegmenter = require('./TopicSegmenter');
const adaptiveProcessor = require('./AdaptiveProcessor');
const economy = require('../../economy'); // To interact with MongoDB users
const Baileys = require("@whiskeysockets/baileys");
const jidNormalizedUser = Baileys.jidNormalizedUser;

/*
 * Main Orchestrator for the Context Extraction System.
 */
class ContextEngine {
    constructor() {
        this.isRunning = false;
        
        // Setup storage callback
        adaptiveProcessor.setStorageCallback(async (result, batch) => {
            await this.saveResults(result, batch);
        });

        console.log("🚀 Context-Aware Extraction Engine Ready.");
    }

    /*
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

    /*
     * Save extracted results to MongoDB
     */
    async saveResults(data, batch) {
        if (!data) return;

        // Save individual user details
        if (data.users) {

        for (const userData of data.users) {
            const jid = userData.userId;
            
            // 1. Resolve JID (if AI returned a name instead of JID, which it shouldn`t but safety first)
            let finalJid = jid;
            if (!jid.includes('@')) {
                // Fuzzy match name to JID from our economy cache
                const users = economy.economyData || new Map();
                for (const [uJid, uData] of users.entries()) {
                    if (uData.nickname?.toLowerCase() === jid.toLowerCase()) {
                        finalJid = uJid;
                        break;
                    }
                }
            }

            // 2. Ensure user exists
            if (!economy.isRegistered(finalJid)) {
                // economy.initializeClass(finalJid); // Only init if we actually have something to save
            }
            
            const user = economy.getUser(finalJid);
            if (!user) continue;

            if (!user.profile) {
                user.profile = { 
                    memories: { likes: [], dislikes: [], hobbies: [], personal: [], other: [] },
                    stats: { messageCount: 0, firstSeen: new Date(), lastSeen: new Date() },
                    notes: []
                };
            }
            
            if (!user.profile.memories) {
                user.profile.memories = { likes: [], dislikes: [], hobbies: [], personal: [], other: [] };
            }

            let changes = 0;

            // Process Preferences
            if (userData.preferences) {
                userData.preferences.forEach(p => {
                    const category = p.category === 'dislike' ? 'dislikes' : 'likes';
                    if (!user.profile.memories[category]) user.profile.memories[category] = [];
                    if (!user.profile.memories[category].includes(p.subject)) {
                        user.profile.memories[category].push(p.subject);
                        changes++;
                    }
                });
            }

            // Process Experiences
            if (userData.experiences) {
                if (!user.profile.memories.personal) user.profile.memories.personal = [];
                userData.experiences.forEach(e => {
                    const str = `${e.activity_type} ${e.subject}`;
                    if (!user.profile.memories.personal.includes(str)) {
                        user.profile.memories.personal.push(str);
                        changes++;
                    }
                });
            }

            // Process Interests
            if (userData.interests) {
                if (!user.profile.memories.hobbies) user.profile.memories.hobbies = [];
                userData.interests.forEach(i => {
                    if (!user.profile.memories.hobbies.includes(i.specific_interest)) {
                        user.profile.memories.hobbies.push(i.specific_interest);
                        changes++;
                    }
                });
            }

            // Process Other Facts (Identity etc)
            if (userData.identity || userData.other) {
                const others = [...(userData.identity || []), ...(userData.other || [])];
                if (!user.profile.memories.other) user.profile.memories.other = [];
                others.forEach(o => {
                    const str = typeof o === 'string' ? o : (o.fact || o.trait || JSON.stringify(o));
                    if (!user.profile.memories.other.includes(str)) {
                        user.profile.memories.other.push(str);
                        changes++;
                    }
                });
            }

            // Save back to DB
            if (changes > 0) {
                economy.saveUser(finalJid);
            }
        }
        }

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
    }
}

// Singleton instance
module.exports = new ContextEngine();