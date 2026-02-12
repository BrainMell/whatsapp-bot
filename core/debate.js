// ============================================
// DEBATE TRACKER - AI JUDGE SYSTEM
// ============================================

const fs = require('fs');
const path = require('path');
const botConfig = require('../botConfig');
const system = require('./system'); // NEW: Database System Module

// Active debates storage
let activeDebates = {};
let debateLeaderboard = {};
let spectators = new Map(); // chatId -> Map(userId -> { expiry, msgCount })

// Load debates and leaderboard from system cache
function loadDebates() {
    activeDebates = system.get('active_debates', {});
    debateLeaderboard = system.get('debate_leaderboard', {});
}

// Save data to MongoDB
function saveDebates() {
    system.set('active_debates', activeDebates);
}

function saveLeaderboard() {
    system.set('debate_leaderboard', debateLeaderboard);
}

// Update leaderboard stats
function updateLeaderboard(winnerJid, score) {
    if (!debateLeaderboard[winnerJid]) {
        debateLeaderboard[winnerJid] = { wins: 0, totalScore: 0, debates: 0 };
    }
    debateLeaderboard[winnerJid].wins += 1;
    debateLeaderboard[winnerJid].totalScore += score;
    debateLeaderboard[winnerJid].debates += 1;
    saveLeaderboard();
}

function recordParticipation(jid, score) {
    if (!debateLeaderboard[jid]) {
        debateLeaderboard[jid] = { wins: 0, totalScore: 0, debates: 0 };
    }
    debateLeaderboard[jid].totalScore += score;
    debateLeaderboard[jid].debates += 1;
    saveLeaderboard();
}

// Initial load
loadDebates();

module.exports = {
    startDebate: async (sock, chatId, topic, debater1Jid, debater2Jid, groupMetadata, BOT_MARKER, smartGroqCall, MODELS) => {
        // Check if debate already active
        if (activeDebates[chatId]) {
            return { 
                success: false, 
                message: BOT_MARKER + "❌ A debate is already in progress! Use `${botConfig.getPrefix()} judge` to end it." 
            };
        }

        // Check if debaters were already admins
        const debater1WasAdmin = groupMetadata.participants.some(p => p.id === debater1Jid && (p.admin === 'admin' || p.admin === 'superadmin'));
        const debater2WasAdmin = groupMetadata.participants.some(p => p.id === debater2Jid && (p.admin === 'admin' || p.admin === 'superadmin'));

        // Create debate session
        const DEBATE_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours
        const expirationTime = Date.now() + DEBATE_DURATION_MS;

        activeDebates[chatId] = {
            topic: topic,
            debater1: debater1Jid,
            debater2: debater2Jid,
            debater1WasAdmin: debater1WasAdmin,
            debater2WasAdmin: debater2WasAdmin,
            arguments: [],
            startTime: Date.now(),
            expirationTime: expirationTime, // Store expiration time
            locked: true,
            timeoutId: setTimeout(() => module.exports.handleDebateTimeout(sock, chatId, BOT_MARKER), DEBATE_DURATION_MS) // Set timeout
        };

        saveDebates();

        try {
            // Lock group settings (announcements only)
            await sock.groupSettingUpdate(chatId, 'announcement');

            // Make debaters admins
            await sock.groupParticipantsUpdate(chatId, [debater1Jid], 'promote');
            await sock.groupParticipantsUpdate(chatId, [debater2Jid], 'promote');

            const message = BOT_MARKER + `━━━━━━━━━━━━━━━━━
🎭 *DEBATE STARTED* 🎭
━━━━━━━━━━━━━━━━━

📌 *Topic:* ${topic}

⚔️ *Debaters:*
@${debater1Jid.split('@')[0]} vs @${debater2Jid.split('@')[0]}

━━━━━━━━━━━━━━━━━
🔒 Group locked for debate
👑 Debaters promoted to admin
🤖 AI is recording arguments

📣 Make your points!
Type \`${botConfig.getPrefix()} judge\` when ready for verdict!
━━━━━━━━━━━━━━━━━`;

            await sock.sendMessage(chatId, {
                text: message,
                contextInfo: { mentionedJid: [debater1Jid, debater2Jid] }
            });

            return { success: true };
        } catch (err) {
            console.error('Debate start error:', err);
            delete activeDebates[chatId];
            saveDebates();
            return { 
                success: false, 
                message: BOT_MARKER + "❌ Failed to start debate. Make sure bot is admin!" 
            };
        }
    },

    recordArgument: (chatId, senderJid, message) => {
        const debate = activeDebates[chatId];
        if (!debate) return;

        // Only record arguments from debaters
        if (senderJid !== debate.debater1 && senderJid !== debate.debater2) {
            return;
        }

        // Record the argument
        debate.arguments.push({
            debater: senderJid,
            message: message,
            timestamp: Date.now()
        });

        saveDebates();
    },

    judgeDebate: async (sock, chatId, BOT_MARKER, smartGroqCall, MODELS) => {
        const debate = activeDebates[chatId];
        
        if (!debate) {
            return { 
                success: false, 
                message: BOT_MARKER + "❌ No active debate in this group!" 
            };
        }

        if (debate.arguments.length < 2) {
            return {
                success: false,
                message: BOT_MARKER + "❌ Not enough arguments recorded! Both debaters must make at least 1 point."
            };
        }

        // Build AI prompt for judging
        const debater1Name = debate.debater1.split('@')[0];
        const debater2Name = debate.debater2.split('@')[0];

        // Organize arguments by debater
        const debater1Args = debate.arguments
            .filter(arg => arg.debater === debate.debater1)
            .map(arg => arg.message)
            .join('\n\n');
        
        const debater2Args = debate.arguments
            .filter(arg => arg.debater === debate.debater2)
            .map(arg => arg.message)
            .join('\n\n');

        const judgePrompt = `You are a highly analytical and professional debate judge. 
Analyze the following debate deeply, looking for logical consistency, use of evidence, rhetorical skill, and overall persuasiveness.

DEBATE TOPIC: ${debate.topic}

DEBATER 1 (@${debater1Name}):
${debater1Args}

DEBATER 2 (@${debater2Name}):
${debater2Args}

Provide a comprehensive verdict:
1. Winner (Debater 1 or Debater 2).
2. Scores (0-100) based on logic, rhetoric, and evidence.
3. Detailed Reasoning (4-5 sentences) covering why the winner won.
4. Logical fallacies detected (if any) for each side.
5. Best argument from each side and why it was effective.

Respond ONLY in this JSON format:
{
  "winner": "Debater 1" or "Debater 2",
  "debater1_score": <number>,
  "debater2_score": <number>,
  "reasoning": "<detailed_text>",
  "fallacies": {
    "d1": "<text>",
    "d2": "<text>"
  },
  "best_arg_d1": { "text": "<text>", "impact": "<text>" },
  "best_arg_d2": { "text": "<text>", "impact": "<text>" }
}`;

        try {
            // Get AI judgment
            const completion = await smartGroqCall({
                model: MODELS.SMART,
                messages: [
                    { role: "system", content: "You are a professional debate judge. Respond only in valid JSON format." },
                    { role: "user", content: judgePrompt }
                ]
            });

            let judgeResponse = completion.choices[0].message.content.trim();
            judgeResponse = judgeResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            
            const verdict = JSON.parse(judgeResponse);

            // Determine winner JID
            const winnerJid = verdict.winner === "Debater 1" ? debate.debater1 : debate.debater2;
            const loserJid = verdict.winner === "Debater 1" ? debate.debater2 : debate.debater1;
            const winnerScore = verdict.winner === "Debater 1" ? verdict.debater1_score : verdict.debater2_score;
            const loserScore = verdict.winner === "Debater 1" ? verdict.debater2_score : verdict.debater1_score;

            // Update leaderboard
            updateLeaderboard(winnerJid, winnerScore);
            recordParticipation(loserJid, loserScore);

            // Build verdict message
            const verdictMessage = BOT_MARKER + `━━━━━━━━━━━━━━━━━━━━
⚖️ *DEBATE VERDICT* ⚖️
━━━━━━━━━━━━━━━━━━━━

📌 *Topic:* ${debate.topic}

🏆 *WINNER:* @${winnerJid.split('@')[0]}

📊 *SCORES:*
@${debater1Name}: ${verdict.debater1_score}/100
@${debater2Name}: ${verdict.debater2_score}/100

💭 *ANALYSIS:*
${verdict.reasoning}

🚫 *LOGICAL FALLACIES:*
📌 @${debater1Name}: ${verdict.fallacies.d1}
📌 @${debater2Name}: ${verdict.fallacies.d2}

🔥 *BEST ARGUMENTS:*

📌 @${debater1Name}:
"${verdict.best_arg_d1.text}"
*Impact:* ${verdict.best_arg_d1.impact}

📌 @${debater2Name}:
"${verdict.best_arg_d2.text}"
*Impact:* ${verdict.best_arg_d2.impact}

━━━━━━━━━━━━━━━━━━━━
Total Arguments: ${debate.arguments.length}
Duration: ${Math.round((Date.now() - debate.startTime) / 60000)} minutes
━━━━━━━━━━━━━━━━━━━━`;

            // Unlock group and demote debaters if they weren't admins before
            try {
                await sock.groupSettingUpdate(chatId, 'not_announcement');
                if (!debate.debater1WasAdmin) {
                    await sock.groupParticipantsUpdate(chatId, [debate.debater1], 'demote');
                }
                if (!debate.debater2WasAdmin) {
                    await sock.groupParticipantsUpdate(chatId, [debate.debater2], 'demote');
                }
            } catch (err) {
                console.log('⚠️ Error unlocking group:', err.message);
            }

            // Clear the timeout for the debate as it's ending
            clearTimeout(debate.timeoutId);

            // Clear debate
            delete activeDebates[chatId];
            saveDebates();

            await sock.sendMessage(chatId, {
                text: verdictMessage,
                contextInfo: { mentionedJid: [debate.debater1, debate.debater2, winnerJid] }
            });

            return { success: true };

        } catch (err) {
            console.error('Judging error:', err);
            return {
                success: false,
                message: BOT_MARKER + "❌ Failed to judge debate: " + err.message
            };
        }
    },

    isDebateActive: (chatId) => {
        return !!activeDebates[chatId];
    },

    getDebateLeaderboard: (BOT_MARKER) => {
        if (Object.keys(debateLeaderboard).length === 0) {
            return BOT_MARKER + "📊 *DEBATE LEADERBOARD*\n\nNo records yet! Start a debate to appear here.";
        }

        const sorted = Object.entries(debateLeaderboard)
            .map(([jid, stats]) => ({ jid, ...stats }))
            .sort((a, b) => b.wins - a.wins || b.totalScore - a.totalScore)
            .slice(0, 10);

        let msg = BOT_MARKER + "🏆 *DEBATE LEADERBOARD* 🏆\n\n";
        sorted.forEach((u, i) => {
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "👤";
            msg += `${medal} @${u.jid.split('@')[0]}\n`;
            msg += `   Wins: ${u.wins} | Avg Score: ${Math.round(u.totalScore / u.debates)}\n\n`;
        });

        return { text: msg, mentions: sorted.map(u => u.jid) };
    },

    getActiveDebate: (chatId) => {
        return activeDebates[chatId] || null;
    },

    cancelDebate: async (sock, chatId, BOT_MARKER) => {
        const debate = activeDebates[chatId];
        
        if (!debate) {
            return { success: false, message: BOT_MARKER + "❌ No active debate!" };
        }

        clearTimeout(debate.timeoutId); // Clear the timeout

        try {
            // Unlock and demote if they weren't admins before
            await sock.groupSettingUpdate(chatId, 'not_announcement');
            if (!debate.debater1WasAdmin) {
                await sock.groupParticipantsUpdate(chatId, [debate.debater1], 'demote');
            }
            if (!debate.debater2WasAdmin) {
                await sock.groupParticipantsUpdate(chatId, [debate.debater2], 'demote');
            }
        } catch (err) {
            console.log('⚠️ Error during cleanup:', err.message);
        }

        delete activeDebates[chatId];
        saveDebates();

        return { 
            success: true, 
            message: BOT_MARKER + "✅ Debate cancelled and group unlocked!" 
        };
    },

    handleDebateTimeout: async (sock, chatId, BOT_MARKER) => {
        const debate = activeDebates[chatId];
        if (!debate) return; // Debate might have been cleared already

        console.log(`Debate for chat ${chatId} timed out.`);

        // Perform cleanup similar to cancelDebate
        try {
            await sock.groupSettingUpdate(chatId, 'not_announcement');
            if (!debate.debater1WasAdmin) {
                await sock.groupParticipantsUpdate(chatId, [debate.debater1], 'demote');
            }
            if (!debate.debater2WasAdmin) {
                await sock.groupParticipantsUpdate(chatId, [debate.debater2], 'demote');
            }
            
            // Cleanup spectators
            if (spectators.has(chatId)) {
                const groupSpectators = spectators.get(chatId);
                for (const [jid, data] of groupSpectators.entries()) {
                    if (!data.wasAdmin) {
                        await sock.groupParticipantsUpdate(chatId, [jid], 'demote').catch(() => {});
                    }
                }
                spectators.delete(chatId);
            }
        } catch (err) {
            console.log('⚠️ Error during timeout cleanup:', err.message);
        }

        // Send timeout message
        await sock.sendMessage(chatId, { 
            text: BOT_MARKER + "⌛ *DEBATE TIMEOUT!* ⌛\n\nThe debate has ended due to inactivity. No verdict was reached." 
        });

        // Clear debate
        delete activeDebates[chatId];
        saveDebates();
    },

    addSpectator: async (sock, chatId, userId, wasAdmin, BOT_MARKER) => {
        const debate = activeDebates[chatId];
        if (!debate) return;

        if (!spectators.has(chatId)) {
            spectators.set(chatId, new Map());
        }

        const groupSpectators = spectators.get(chatId);
        
        // Prevent spam adding
        if (groupSpectators.has(userId)) return;

        // Limit active spectators to 5
        if (groupSpectators.size >= 5) {
            return { success: false, message: "❌ Too many active spectators. Wait for someone to finish." };
        }

        const expiry = Date.now() + (2 * 60 * 1000); // 2 minutes to respond
        
        groupSpectators.set(userId, { 
            expiry, 
            msgCount: 0, 
            wasAdmin,
            timeout: setTimeout(async () => {
                await module.exports.removeSpectator(sock, chatId, userId, BOT_MARKER, "Time expired");
            }, 2 * 60 * 1000)
        });

        if (!wasAdmin) {
            try {
                await sock.groupParticipantsUpdate(chatId, [userId], 'promote');
            } catch (e) {
                groupSpectators.delete(userId);
                return { success: false, message: "❌ Failed to grant permissions." };
            }
        }

        return { 
            success: true, 
            message: `🎫 @${userId.split('@')[0]} is now a temporary spectator! You have 2 minutes to contribute 1 relevant message.` 
        };
    },

    removeSpectator: async (sock, chatId, userId, BOT_MARKER, reason = "") => {
        if (!spectators.has(chatId)) return;
        const groupSpectators = spectators.get(chatId);
        const data = groupSpectators.get(userId);
        
        if (!data) return;

        clearTimeout(data.timeout);
        
        if (!data.wasAdmin) {
            await sock.groupParticipantsUpdate(chatId, [userId], 'demote').catch(() => {});
        }

        groupSpectators.delete(userId);
        if (groupSpectators.size === 0) spectators.delete(chatId);

        if (reason) {
            await sock.sendMessage(chatId, { 
                text: BOT_MARKER + `🎫 @${userId.split('@')[0]}'s spectator pass revoked: ${reason}`,
                contextInfo: { mentionedJid: [userId] }
            });
        }
    },

    isSpectator: (chatId, userId) => {
        if (!spectators.has(chatId)) return false;
        return spectators.get(chatId).has(userId);
    },

    logModeration: (chatId, userId, content, approved, reasoning) => {
        const logs = system.get('debate_moderation_logs', []);
        logs.push({
            chatId,
            userId,
            content,
            approved,
            reasoning,
            timestamp: Date.now()
        });
        // Keep only last 1000 logs
        if (logs.length > 1000) logs.shift();
        system.set('debate_moderation_logs', logs);
    },

    checkRelevance: async (prompt, debate, smartGroqCall, MODELS) => {
        const checkPrompt = `Compare this spectator comment to the current debate.
TOPIC: ${debate.topic}
DEBATERS: ${debate.debater1} and ${debate.debater2}

COMMENT: "${prompt}"

Is this comment relevant to the debate topic or current arguments?
Respond with a JSON object:
{
  "relevant": boolean,
  "reasoning": "brief explanation"
}`;

        try {
            const completion = await smartGroqCall({
                model: MODELS.SMART,
                messages: [
                    { role: "system", content: "You are a debate moderator evaluating relevance. Respond only in JSON." },
                    { role: "user", content: checkPrompt }
                ]
            });

            let response = completion.choices[0].message.content.trim();
            response = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            return JSON.parse(response);
        } catch (e) {
            console.error("Relevance check error:", e);
            return { relevant: true }; // Default to true on error to avoid blocking valid input
        }
    }
};
