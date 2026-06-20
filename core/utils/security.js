// security.js - ENHANCED for comprehensive link and status detection
const fs = require('fs');
const path = require('path');

function resolveLidToPhone(jid, authPath) {
    const lidResolver = require('./lidResolver');
    return lidResolver.resolveLidToPhone(jid, authPath);
}

module.exports = {
    handleSecurity: async function(sock, msg, groupSettings, addWarning, getWarningCount, cachedMetadata = null, cachedAdminSet = null) {
        try {
            if (!msg || !msg.message) return;
            const chatId = msg.key.remoteJid;
            const sender = msg.key.participant || msg.key.remoteJid;

            // Only work in group chats
            if (!chatId.endsWith('@g.us')) return;

            // Get group settings
            const settings = groupSettings.get(chatId);
            if (!settings || !settings.antilink) return;

            const violations = [];
            
            // 🎯 1. DIRECT STATUS MENTION (Baileys specific)
            if (msg.message.groupStatusMentionMessage) {
                violations.push('📢 group status mention');
            }

            // 🔍 2. RECURSIVE TEXT & CONTENT EXTRACTION
            const extractAllText = (obj) => {
                let found = [];
                if (!obj) return found;
                
                // Common text fields in WhatsApp messages
                const fields = [
                    'conversation', 'text', 'caption', 'contentText', 'description', 
                    'footerText', 'hydratedContentText', 'hydratedFooterText', 
                    'name', 'selectedDisplayText', 'title', 'subtitle', 'body'
                ];
                
                for (const field of fields) {
                    if (obj[field] && typeof obj[field] === 'string') {
                        found.push(obj[field]);
                    }
                }
                
                // Nested structures
                if (obj.extendedTextMessage) found.push(...extractAllText(obj.extendedTextMessage));
                if (obj.imageMessage) found.push(...extractAllText(obj.imageMessage));
                if (obj.videoMessage) found.push(...extractAllText(obj.videoMessage));
                if (obj.documentMessage) found.push(...extractAllText(obj.documentMessage));
                if (obj.templateMessage) found.push(...extractAllText(obj.templateMessage));
                if (obj.interactiveMessage) found.push(...extractAllText(obj.interactiveMessage));
                if (obj.buttonsMessage) found.push(...extractAllText(obj.buttonsMessage));
                if (obj.listMessage) found.push(...extractAllText(obj.listMessage));
                if (obj.viewOnceMessage) found.push(...extractAllText(obj.viewOnceMessage.message));
                if (obj.viewOnceMessageV2) found.push(...extractAllText(obj.viewOnceMessageV2.message));
                if (obj.ephemeralMessage) found.push(...extractAllText(obj.ephemeralMessage.message));
                // 💡 FIX: Add missing message types that can carry captions/text.
                // Previously audio, sticker, contact, and liveLocation messages
                // were not scanned — antilink could be bypassed by sending a
                // link in an audio/sticker caption.
                if (obj.audioMessage) found.push(...extractAllText(obj.audioMessage));
                if (obj.stickerMessage) found.push(...extractAllText(obj.stickerMessage));
                if (obj.contactMessage) found.push(...extractAllText(obj.contactMessage));
                if (obj.contactsArrayMessage) found.push(...extractAllText(obj.contactsArrayMessage));
                if (obj.liveLocationMessage) found.push(...extractAllText(obj.liveLocationMessage));
                if (obj.ptvMessage) found.push(...extractAllText(obj.ptvMessage));
                
                // Polls
                if (obj.pollCreationMessage || obj.pollCreationMessageV2 || obj.pollCreationMessageV3) {
                    const poll = obj.pollCreationMessage || obj.pollCreationMessageV2 || obj.pollCreationMessageV3;
                    found.push(poll.name || '');
                    if (poll.options) poll.options.forEach(o => found.push(o.optionName || ''));
                }

                return found;
            };

            const allText = extractAllText(msg.message).join(' ');
            const lowerText = allText.toLowerCase();

            // 🎯 3. STATUS CHECKS (Text & Mentioned JIDs)
            if (lowerText.includes('@status') || lowerText.includes('@broadcast') || lowerText.includes('status@broadcast')) {
                violations.push('📢 status mention');
            }

            const contextInfo = msg.message.extendedTextMessage?.contextInfo || 
                               msg.message.imageMessage?.contextInfo || 
                               msg.message.videoMessage?.contextInfo ||
                               msg.message.documentMessage?.contextInfo;

            if (contextInfo) {
                const mentionedJids = contextInfo.mentionedJid || [];
                if (mentionedJids.some(jid => jid.includes('status@broadcast') || jid.includes('broadcast'))) {
                    violations.push('📢 status mention');
                }
                
                // Group Mentions
                if (contextInfo.groupMentions?.some(gm => (gm.groupJid || gm) === chatId)) {
                    violations.push('📢 group status mention');
                }

                // Check externalAdReply (sometimes contains links)
                if (contextInfo.externalAdReply) {
                    const ad = contextInfo.externalAdReply;
                    const adText = (ad.title || '') + ' ' + (ad.body || '') + ' ' + (ad.sourceUrl || '');
                    if (/(https?:\/\/|www\.|chat\.whatsapp\.com|wa\.me|whatsapp\.com\/channel)/gi.test(adText)) {
                        violations.push('🔗 link (ad)');
                    }
                }
            }

            // 🎯 4. COMPREHENSIVE LINK DETECTION
            // This regex covers: http/https, www, group invites, wa.me, and channels
            const linkRegex = /(https?:\/\/|www\.|chat\.whatsapp\.com|wa\.me|whatsapp\.com\/channel\/)[^\s]{2,}/gi;
            if (linkRegex.test(allText)) {
                if (allText.includes('chat.whatsapp.com')) violations.push('👥 group invite');
                else if (allText.includes('whatsapp.com/channel')) violations.push('📺 channel link');
                else violations.push('🔗 link');
            }

            // If no violations detected, exit immediately (no network or database calls needed!)
            if (violations.length === 0) return;

            // Get group metadata (prefer cached)
            const groupMetadata = cachedMetadata || await sock.groupMetadata(chatId).catch(() => null);
            if (!groupMetadata) return;

            const { jidNormalizedUser } = require('@whiskeysockets/baileys');
            const lidResolver = require('./lidResolver');
            const botConfig = require('../../botConfig');
            const authPath = botConfig.getAuthPath();

            const normalizedSender = jidNormalizedUser(sender);
            const senderPhone = lidResolver.resolveToPhone(normalizedSender, authPath);
            const resolvedSender = lidResolver.resolveLidToPhone(normalizedSender, authPath);

            // O(1) admin check using pre-built Set from engine.js (avoids loop over 1k participants)
            let senderIsAdmin = false;
            if (cachedAdminSet) {
                senderIsAdmin = cachedAdminSet.has(senderPhone) || cachedAdminSet.has(normalizedSender);
            } else {
                // Fallback: linear scan (only if Set wasn't passed in)
                senderIsAdmin = groupMetadata.participants.some(
                    p => {
                        const normalizedParticipant = jidNormalizedUser(p.id);
                        return lidResolver.resolveToPhone(normalizedParticipant, authPath) === senderPhone && (p.admin === 'admin' || p.admin === 'superadmin');
                    }
                );
            }

            // Admins are exempt
            if (senderIsAdmin) return;

            // ============================================
            // ACTION PHASE
            // ============================================
            
            const violationType = [...new Set(violations)].join(', ');
            const action = settings.antilinkAction || 'delete';

            // Delete first
            try { await sock.sendMessage(chatId, { delete: msg.key }); } catch {}

                const participantJid = groupMetadata.participants.find(
                    p => lidResolver.resolveToPhone(jidNormalizedUser(p.id), authPath) === senderPhone
                )?.id || normalizedSender;
                const userName = participantJid.split('@')[0];

                // Warn/Kick logic
                let warningCount = 0;
                if (addWarning && getWarningCount) {
                    warningCount = addWarning(resolvedSender, chatId, `Antilink violation: ${violationType}`);
                }

                if (action === 'kick') {
                    const kickMsg = `*🚨 ANTILINK VIOLATION 🚨*\n\n*User:* @${userName}\n*Type:* ${violationType}\n*Action:* REMOVED`;
                    await sock.sendMessage(chatId, { text: kickMsg, contextInfo: { mentionedJid: [participantJid] } });
                    setTimeout(() => sock.groupParticipantsUpdate(chatId, [participantJid], 'remove').catch(() => {}), 1000);
                } 
                else if (action === 'warn') {
                    const strike = '⚠️'.repeat(Math.min(warningCount, 3));
                    const warnMsg = `*${strike} WARNING ${strike}*\n\n*User:* @${userName}\n*Type:* ${violationType}\n*Count:* ${warningCount}/3\n\n_Don't send links or mention status._`;
                    await sock.sendMessage(chatId, { text: warnMsg, contextInfo: { mentionedJid: [participantJid] } });
                    if (warningCount >= 3) {
                        setTimeout(() => sock.groupParticipantsUpdate(chatId, [participantJid], 'remove').catch(() => {}), 2000);
                    }
                }
        } catch (err) {
            console.error('[Security Error]', err.message);
        }
    },

    handleLinks: async function(sock, msg, groupSettings, addWarning, getWarningCount, cachedMetadata) {
        return this.handleSecurity(sock, msg, groupSettings, addWarning, getWarningCount, cachedMetadata);
    }
};