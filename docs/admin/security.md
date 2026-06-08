# Admin Subsystem: Security & Spam Controls

## What it is

The Security and Spam Controls subsystem intercepts group messages to enforce chat rules, detect links, block malicious status mentions, and apply auto-moderation penalties. It allows groups to prevent unauthorized external links, WhatsApp channel advertisements, group invite links, and broadcast/status mention exploits. When violations occur, the bot deletes the message and issues warnings or removes (kicks) the offending user based on group preferences.

---

## How it works

**Moderation Guard and Admin Bypass** — [`security.js` L11–50](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/utils/security.js#L11-L50)

```javascript
// core/utils/security.js L11–50
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

        // Get group metadata (prefer cached)
        const groupMetadata = cachedMetadata || await sock.groupMetadata(chatId).catch(() => null);
        if (!groupMetadata) return;

        const { jidNormalizedUser } = require('@whiskeysockets/baileys');
        const lidResolver = require('./lidResolver');
        const botConfig = require('../botConfig');
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
```

This entry point checks if the message was sent in a group chat with the `antilink` security setting enabled. It checks if the sender is an admin or the bot owner using an $O(1)$ pre-cached Set of administrator numbers. If they are an admin, the scanner immediately returns, bypassing security scans.

---

**Antilink & Status Mention Interceptor** — [`security.js` L102–143](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/utils/security.js#L102-L143)

```javascript
// core/utils/security.js L102–143
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
```

The message contents are flattened to raw strings and recursively searched. The algorithm checks text content, mentioned JIDs, and `externalAdReply` preview payloads to detect `@status` broadcast mentions or links. When regex patterns detect URLs, it classifies the violation (e.g. `group invite`, `channel link`, or `link`).

---

**Auto Action Penalties** — [`security.js` L149–180](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/utils/security.js#L149-L180)

```javascript
// core/utils/security.js L149–180
if (violations.length > 0) {
    const violationType = [...new Set(violations)].join(', ');
    const userName = resolvedSender.split('@')[0];
    const action = settings.antilinkAction || 'delete';

    // Delete first
    try { await sock.sendMessage(chatId, { delete: msg.key }); } catch {}

    // Warn/Kick logic
    let warningCount = 0;
    if (addWarning && getWarningCount) {
        warningCount = addWarning(resolvedSender, chatId, `Antilink violation: ${violationType}`);
    }

    const participantJid = groupMetadata.participants.find(
        p => lidResolver.resolveToPhone(jidNormalizedUser(p.id), authPath) === senderPhone
    )?.id || normalizedSender;

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
}
```

If violations are present, the bot issues a Baileys deletion command. It then queries the configured punishment action (`warn` or `kick`). The warn branch logs warnings to MongoDB and kicks the user on the 3rd strike, while the kick branch executes user removal immediately.

---

## How to modify it

**Whitelisting a specific domain:**
To prevent the antilink filter from triggering on links from a specific domain (e.g. `youtube.com` or `mywebsite.com`), add a bypass check in the link scanner block in `core/utils/security.js` at line 139:

```javascript
// BEFORE
if (linkRegex.test(allText)) {

// AFTER: Bypass checks if the message includes white-listed domains
if (linkRegex.test(allText) && !allText.includes('youtube.com') && !allText.includes('youtu.be')) {
```

**Changing the warn kick threshold:**
To change how many warnings are allowed before a user is removed under the `warn` action, modify line 176:

```javascript
// BEFORE
if (warningCount >= 3) { ... }

// AFTER: Allow 5 warnings instead of 3
if (warningCount >= 5) { ... }
```

---

## Common tasks

- **Change punishment type (delete/warn/kick)** — Edit the `antilinkAction` field inside group settings documents in MongoDB.
- **Whitelist a domain** — Add domain bypass checks at [security.js L139](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/utils/security.js#L139).
- **Modify status mention detection regex** — Edit the broadcast check conditionals at [security.js L106](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/utils/security.js#L106).
- **Configure anti-spam warn threshold** — Edit warning limit conditionals at [security.js L176](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/utils/security.js#L176).
- **Add custom warning text** — Modify `warnMsg` at [security.js L174](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/utils/security.js#L174).
