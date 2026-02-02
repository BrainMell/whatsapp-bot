// security.js - FIXED for groupStatusMentionMessage detection
module.exports = {
    handleSecurity: async function(sock, msg, groupSettings, addWarning, getWarningCount) {
        try {
            if (!msg || !msg.message) return;
            const chatId = msg.key.remoteJid;
            const sender = msg.key.participant || msg.key.remoteJid;

            // Only work in group chats
            if (!chatId.endsWith('@g.us')) {
                return;
            }

            // Get group settings - check if antilink is enabled
            const settings = groupSettings.get(chatId);
            if (!settings) {
                // console.log(`[Security] No settings for group ${chatId}`);
                return;
            }
            
            if (!settings.antilink) {
                // console.log(`[Security] Antilink disabled for ${chatId}`);
                return;
            }

            // Get group metadata to check if sender is admin
            const groupMetadata = await sock.groupMetadata(chatId);
            const senderIsAdmin = groupMetadata.participants.some(
                p => p.id === sender && (p.admin === 'admin' || p.admin === 'superadmin')
            );

            // Admins are exempt from antilink
            if (senderIsAdmin) {
                return;
            }

            console.log(`[Security] Checking message from ${sender} in ${chatId}...`);
            const violations = [];
            
            // ============================================
            // 🎯 STATUS MENTION DETECTION - THE REAL WAY!
            // ============================================
            
            // Check for groupStatusMentionMessage (when someone mentions this group in their status)
            if (msg.message?.groupStatusMentionMessage) {
                console.log('🎯 GROUP STATUS MENTION DETECTED!');
                violations.push('📢 group status mention');
            }

            // ============================================
            // Regular content checks (links, invites, etc.)
            // ============================================
            
            let text = '';
            let contextInfo = null;
            
            if (msg.message) {
                // Extract text from various message types
                text = msg.message.conversation || 
                       msg.message.extendedTextMessage?.text || 
                       msg.message.imageMessage?.caption || 
                       msg.message.videoMessage?.caption || 
                       '';
                
                // Extract ContextInfo
                contextInfo = msg.message.extendedTextMessage?.contextInfo ||
                             msg.message.imageMessage?.contextInfo ||
                             msg.message.videoMessage?.contextInfo ||
                             null;
            }

            // Check text for violations
            if (text) {
                // Links (HTTP, HTTPS, WWW)
                const linkRegex = /((https?:\/\/)|(www\.))[^\s]+/gi;
                if (text.match(linkRegex)) {
                    violations.push('🔗 link');
                }

                // Group invites
                const groupInviteRegex = /(https?:\/\/)?(chat\.whatsapp\.com|wa\.me\/invite)\/[^\s]+/gi;
                if (text.match(groupInviteRegex)) {
                    violations.push('👥 group invite');
                }

                // Channel links
                const channelRegex = /(https?:\/\/)?(whatsapp\.com\/channel)\/[^\s]+/gi;
                if (text.match(channelRegex)) {
                    violations.push('📺 channel link');
                }

                // @status text mentions
                const statusTextRegex = /@(status|broadcast)/gi;
                if (text.match(statusTextRegex)) {
                    violations.push('📢 status text mention');
                }
            }

            // Check ContextInfo for additional violations
            if (contextInfo) {
                // Check for status@broadcast in mentionedJid
                const mentionedJids = contextInfo.mentionedJid || [];
                const hasStatusMention = mentionedJids.some(jid => 
                    jid.includes('status@broadcast') || jid.includes('broadcast')
                );
                
                if (hasStatusMention && !violations.includes('📢 status text mention')) {
                    violations.push('📢 status text mention');
                }

                // Check for groupMentions (secondary check, though groupStatusMentionMessage is primary)
                const groupMentions = contextInfo.groupMentions || [];
                if (groupMentions.length > 0) {
                    const thisGroupMentioned = groupMentions.some(gm => {
                        const mentionedGroupJid = gm.groupJid || gm;
                        return mentionedGroupJid === chatId;
                    });
                    
                    if (thisGroupMentioned && !violations.includes('📢 group status mention')) {
                        violations.push('📢 group status mention');
                    }
                }
            }

            // ============================================
            // Take action if violations detected
            // ============================================
            
            if (violations.length > 0) {
                const violationType = violations.join(', ');
                const userName = sender.split('@')[0];
                console.log(`🚨 Non-admin ${userName} sent prohibited content: ${violationType}`);
                
                const action = settings.antilinkAction || 'delete';

                // Delete the message
                try {
                    await sock.sendMessage(chatId, { delete: msg.key });
                    console.log(`🗑️ Deleted message from ${userName}`);
                } catch (delErr) {
                    console.log('Failed to delete message:', delErr.message);
                }

                // Get current warnings (PER GROUP)
                let warningCount = 0;
                if (addWarning && getWarningCount) {
                    warningCount = addWarning(sender, chatId, `Antilink violation: ${violationType}`);
                }

                // Take action based on settings
                switch (action) {
                    case 'kick':
                        const kickMsg = `
╔═══════════════════════╗
   ⚠️  *ANTILINK VIOLATION*  ⚠️
╚═══════════════════════╝

*User:* @${userName}
*Violation:* ${violationType}
*Action:* Removed from group

━━━━━━━━━━━━━━━━━━
🛡️ This group has antilink protection enabled.
`.trim();

                        await sock.sendMessage(chatId, {
                            text: kickMsg,
                            contextInfo: { mentionedJid: [sender] }
                        });

                        setTimeout(async () => {
                            try {
                                await sock.groupParticipantsUpdate(chatId, [sender], 'remove');
                                console.log(`✅ Kicked ${userName} for: ${violationType}`);
                            } catch (err) {
                                console.log('Failed to remove participant:', err.message);
                            }
                        }, 1000);
                        break;

                    case 'warn':
                        const strikeEmoji = warningCount === 1 ? '⚠️' : warningCount === 2 ? '⚠️⚠️' : '⚠️⚠️⚠️';
                        const warnMsg = `
╔═══════════════════════╗
   ${strikeEmoji}  *WARNING*  ${strikeEmoji}
╚═══════════════════════╝

*User:* @${userName}
*Violation:* ${violationType}
*Warnings:* ${warningCount}/3

${warningCount >= 3 ? '🔴 *Final warning!* Next violation = removal.' : 
  warningCount === 2 ? '🟡 *Be careful!* One more strike and you\'re out.' : 
  '🟢 *First warning.* Avoid prohibited content.'}

━━━━━━━━━━━━━━━━━━
🛡️ Prohibited: Links • Group invites • Status mentions • Channels
`.trim();

                        await sock.sendMessage(chatId, {
                            text: warnMsg,
                            contextInfo: { mentionedJid: [sender] }
                        });
                        
                        console.log(`✅ Warned ${userName} (${warningCount}/3) for: ${violationType}`);

                        if (warningCount >= 3) {
                            setTimeout(async () => {
                                try {
                                    await sock.groupParticipantsUpdate(chatId, [sender], 'remove');
                                    console.log(`✅ Auto-kicked ${userName} after 3 warnings`);
                                    
                                    await sock.sendMessage(chatId, {
                                        text: `🔴 @${userName} has been removed after 3 warnings.`,
                                        contextInfo: { mentionedJid: [sender] }
                                    });
                                } catch (err) {
                                    console.log('Failed to auto-kick:', err.message);
                                }
                            }, 2000);
                        }
                        break;

                    case 'delete':
                    default:
                        console.log(`✅ Silently deleted message from ${userName} for: ${violationType}`);
                        break;
                }
            }
        } catch (err) {
            console.log('Error in security handler:', err.message);
            console.error(err);
        }
    },

    handleLinks: async function(sock, msg, groupSettings, addWarning, getWarningCount) {
        return this.handleSecurity(sock, msg, groupSettings, addWarning, getWarningCount);
    }
};
