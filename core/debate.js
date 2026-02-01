// ============================================
// DEBATE TRACKER - AI JUDGE SYSTEM
// ============================================

const fs = require('fs');
const path = require('path');
const botConfig = require('../botConfig');
const system = require('./system'); // NEW: Database System Module

// Active debates storage
let activeDebates = {};

// Load debates from system cache
function loadDebates() {
    activeDebates = system.get('active_debates', {});
}

// Save debates to MongoDB
function saveDebates() {
    system.set('active_debates', activeDebates);
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

        const judgePrompt = `You are a professional debate judge analyzing a debate between two people.

DEBATE TOPIC: ${debate.topic}

DEBATER 1 (@${debater1Name}):
${debater1Args}

DEBATER 2 (@${debater2Name}):
${debater2Args}

Analyze this debate and provide:
1. Winner (Debater 1 or Debater 2)
2. Score (0-100 for each)
3. Reasoning (2-3 sentences)
4. Best argument from each side

Respond ONLY in this JSON format:
{
  "winner": "Debater 1" or "Debater 2",
  "debater1_score": <number>,
  "debater2_score": <number>,
  "reasoning": "<text>",
  "best_arg_d1": "<text>",
  "best_arg_d2": "<text>"
}`;

        try {
            // Get AI judgment
            const completion = await smartGroqCall({
                model: MODELS.SMART,
                messages: [
                    { role: "system", content: "You are a professional debate judge. Respond only in JSON format." },
                    { role: "user", content: judgePrompt }
                ]
            });

            let judgeResponse = completion.choices[0].message.content.trim();
            
            // Clean JSON
            judgeResponse = judgeResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            
            const verdict = JSON.parse(judgeResponse);

            // Determine winner JID
            const winnerJid = verdict.winner === "Debater 1" ? debate.debater1 : debate.debater2;
            const loserJid = verdict.winner === "Debater 1" ? debate.debater2 : debate.debater1;

            // Build verdict message
            const verdictMessage = BOT_MARKER + `━━━━━━━━━━━━━━━━━━━━
⚖️ *DEBATE VERDICT* ⚖️
━━━━━━━━━━━━━━━━━━━━

📌 *Topic:* ${debate.topic}

🏆 *WINNER:* @${winnerJid.split('@')[0]}

📊 *SCORES:*
@${debater1Name}: ${verdict.debater1_score}/100
@${debater2Name}: ${verdict.debater2_score}/100

💭 *REASONING:*
${verdict.reasoning}

🔥 *BEST ARGUMENTS:*

📌 @${debater1Name}:
"${verdict.best_arg_d1}"

📌 @${debater2Name}:
"${verdict.best_arg_d2}"

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
    }
};
