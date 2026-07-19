// ═══════════════════════════════════════════════════════════════════════════
// 🎛️ GM ADMIN CONSOLE — RPG Moderation Toolkit
// ═══════════════════════════════════════════════════════════════════════════
// Two distinct features:
//
// 1. MAIN-ACCOUNT CLASS SWITCH (.g modclass <name>)
//    Lightweight — lets RPG Mods switch their own class freely for testing.
//    Everything else about their character stays the same.
//
// 2. ADMIN ACCOUNT (.g admin <subcommand>)
//    Full GM console for moderating players and testing content.
//    Direct actions on any player's account + sandbox tools.
//
// Permission gate: isOwner || isGlobalMod || isRpgMod
// ═══════════════════════════════════════════════════════════════════════════

const economy = require('../rpg/economy');
const progression = require('../rpg/progression');
const classSystem = require('../rpg/classSystem');
const inventorySystem = require('../rpg/inventorySystem');
const lootSystem = require('../rpg/lootSystem');
const skillTree = require('../rpg/skillTree');

// ─── HELPER: resolve class by name or ID ───────────────────────────────────
function resolveClass(query) {
    if (!query) return null;
    const q = query.toUpperCase().trim();
    // Direct ID match
    const direct = classSystem.getClassById(q);
    if (direct) return direct;
    // Name match (case-insensitive)
    const all = classSystem.getAllClasses();
    for (const [id, cls] of Object.entries(all)) {
        if (cls.name.toUpperCase() === q || cls.name.toUpperCase().includes(q)) {
            return cls;
        }
    }
    return null;
}

// ─── HELPER: resolve skill by name or ID ───────────────────────────────────
function resolveSkill(query) {
    if (!query) return null;
    const q = query.toLowerCase().trim();
    const SK = skillTree.SKILL_TREES || skillTree;
    for (const [classId, tree] of Object.entries(SK)) {
        if (!tree.trees) continue;
        for (const [treeName, treeData] of Object.entries(tree.trees)) {
            if (!treeData.skills) continue;
            for (const [skillId, skill] of Object.entries(treeData.skills)) {
                if (skillId === q || (skill.name && skill.name.toLowerCase() === q)) {
                    return { ...skill, id: skillId, classId };
                }
            }
        }
    }
    return null;
}

// ─── HELPER: resolve item by name or ID ────────────────────────────────────
function resolveItem(query) {
    if (!query) return null;
    const q = query.toLowerCase().replace(/_/g, ' ').trim();
    // Try direct ID
    const direct = lootSystem.getItemInfo(query);
    if (direct && direct.name) return { id: query, ...direct };
    // Search by name
    const ITEM_DB = lootSystem.ITEM_DATABASE || {};
    for (const [id, item] of Object.entries(ITEM_DB)) {
        if (item.name && item.name.toLowerCase().replace(/_/g, ' ') === q) {
            return { id, ...item };
        }
    }
    // Partial match
    for (const [id, item] of Object.entries(ITEM_DB)) {
        if (item.name && item.name.toLowerCase().includes(q)) {
            return { id, ...item };
        }
    }
    return null;
}

// ─── HELPER: resolve player JID from mention/reply/self ───────────────────
// 💡 FIX: WhatsApp doesn't let you @mention yourself. So if no mention is
// provided, we check:
//   1. Is there a replied message? Use the sender of that message.
//   2. No reply? Default to the mod running the command (self-target).
// This means:
//   .g admin setlevel 50            → targets yourself (senderJid)
//   .g admin setlevel 50 (replying) → targets the replied message's sender
//   .g admin setlevel @friend 50    → targets @friend
function resolveTargetJid(getMentionOrReply, m, senderJid) {
    // 1. Try @mention first
    let target = getMentionOrReply(m);
    if (target) return target;

    // 2. Try replied message's sender
    const quotedCtx = m?.message?.extendedTextMessage?.contextInfo;
    if (quotedCtx?.participant) {
        const { jidNormalizedUser } = require('@whiskeysockets/baileys');
        return jidNormalizedUser(quotedCtx.participant);
    }

    // 3. Default to self (the mod running the command)
    return senderJid;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. MAIN-ACCOUNT CLASS SWITCH
// ═══════════════════════════════════════════════════════════════════════════

async function handleModClass(sock, chatId, senderJid, args, BOT_MARKER, prefix) {
    const query = args.join(' ').trim();
    if (!query) {
        const all = classSystem.getAllClasses();
        const classList = Object.values(all).map(c => `${c.icon} ${c.name} (\`${c.id}\`)`).join('\n');
        return await sock.sendMessage(chatId, {
            text: BOT_MARKER + `🎛️ *MOD CLASS SWITCH*\n\nSwitch your class freely (mod only).\n\nUsage: \`${prefix} modclass <name or ID>\`\nExample: \`${prefix} modclass Warlord\`\n\n*Available Classes:*\n${classList}`
        });
    }

    const targetClass = resolveClass(query);
    if (!targetClass) {
        return await sock.sendMessage(chatId, {
            text: BOT_MARKER + `❌ Class "${query}" not found. Use \`${prefix} modclass\` (no args) to see all classes.`
        });
    }

    const user = economy.getUser(senderJid);
    if (!user) {
        return await sock.sendMessage(chatId, { text: BOT_MARKER + '❌ Not registered.' });
    }

    const oldClass = economy.getUserClass(senderJid);
    const oldClassName = oldClass ? `${oldClass.icon} ${oldClass.name}` : 'None';

    // Switch class — bypass all evolution requirements
    user.class = targetClass.id;
    economy.scheduleSave(senderJid);

    return await sock.sendMessage(chatId, {
        text: BOT_MARKER + `✅ *CLASS SWITCHED (MOD)*\n\n👤 Your character: *${user.nickname}*\n🔄 *${oldClassName}* → ${targetClass.icon} *${targetClass.name}*\n📝 ${targetClass.desc || ''}\n\n_All other stats, items, and progress unchanged._`
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. ADMIN CONSOLE — Direct Actions
// ═══════════════════════════════════════════════════════════════════════════

async function handleAdmin(sock, chatId, senderJid, args, m, BOT_MARKER, prefix, getMentionOrReply) {
    const sub = args[0]?.toLowerCase();

    // 💡 HELPER: parse admin args. When there's an @mention, it's the first
    // arg. When there's no mention (self-target), the first arg IS the value.
    // This function strips any mention-like args and returns {target, remaining}.
    function parseAdminArgs(getMentionOrReply, m, senderJid, args) {
        const target = resolveTargetJid(getMentionOrReply, m, senderJid);
        // Filter out mention-like args (contain @ or are phone numbers)
        const remaining = args.filter(a => !a.includes('@') && !/^\d{10,}@/.test(a));
        const isSelfTarget = target === senderJid && !getMentionOrReply(m);
        return { target, remaining, isSelfTarget };
    }

    // No subcommand — show detailed help
    if (!sub || sub === 'help') {
        return await sock.sendMessage(chatId, {
            text: BOT_MARKER + `🎛️ *GM ADMIN CONSOLE — FULL GUIDE*\n\n` +
                `_Mod-only RPG moderation toolkit. RPG Mods, Global Mods, and Owner only._\n\n` +
                `━━━━━━━━━━━━━━━━━━━\n` +
                `🎯 *HOW TO TARGET PLAYERS*\n` +
                `━━━━━━━━━━━━━━━━━━━\n` +
                `All commands accept a target. 3 ways to specify:\n` +
                `1️⃣ **@mention** — tag the player: \`${prefix} admin setlevel @friend 50\`\n` +
                `2️⃣ **Reply** — reply to their message: \`${prefix} admin setlevel 50\`\n` +
                `3️⃣ **Self** — no mention/reply = targets YOU: \`${prefix} admin setlevel 50\`\n\n` +
                `━━━━━━━━━━━━━━━━━━━\n` +
                `👤 *PLAYER MANAGEMENT*\n` +
                `━━━━━━━━━━━━━━━━━━━\n` +
                `• \`${prefix} admin setlevel <@user> <1-100>\`\n` +
                `  Sets level directly. Recalculates XP + grants stat points.\n` +
                `  Example: \`${prefix} admin setlevel 75\` (sets YOUR level to 75)\n\n` +
                `• \`${prefix} admin setstat <@user> <stat> <value>\`\n` +
                `  Sets an individual stat (hp, atk, def, mag, spd, luck, crit).\n` +
                `  Example: \`${prefix} admin setstat @friend hp 5000\`\n\n` +
                `• \`${prefix} admin setwallet <@user> <amount>\`\n` +
                `  Sets wallet balance directly (overwrites current).\n` +
                `  Example: \`${prefix} admin setwallet 1000000\`\n\n` +
                `• \`${prefix} admin giveitem <@user> <item_name> [qty]\`\n` +
                `  Gives items by name (resolves automatically). Default qty = 1.\n` +
                `  Example: \`${prefix} admin giveitem @friend legendary_enhancement_stone 10\`\n\n` +
                `• \`${prefix} admin takeitem <@user> <item_name> [qty]\`\n` +
                `  Removes items from inventory.\n\n` +
                `• \`${prefix} admin giveskill <@user> <skill_name> [level]\`\n` +
                `  Grants any skill regardless of class/level requirements.\n` +
                `  Example: \`${prefix} admin giveskill @friend meteor 3\`\n\n` +
                `• \`${prefix} admin revokeskill <@user> <skill_name>\`\n` +
                `  Removes a skill from the player.\n\n` +
                `• \`${prefix} admin resetplayer <@user>\`\n` +
                `  Resets all stats to 0 and revokes all skills. Refunds stat points.\n` +
                `  Keeps level, wallet, and items.\n\n` +
                `• \`${prefix} admin forceevolve <@user> <class_name>\`\n` +
                `  Force-evolves to any class, bypassing all requirements.\n` +
                `  Example: \`${prefix} admin forceevolve @friend Warlord\`\n\n` +
                `• \`${prefix} admin givepoints <@user> <amount>\`\n` +
                `  Grants stat points (for compensation or testing).\n\n` +
                `• \`${prefix} admin givezeni <@user> <amount>\`\n` +
                `  Adds Zeni to wallet (does NOT overwrite — adds to existing).\n\n` +
                `• \`${prefix} admin setrank <@user> <F|E|D|C|B|A|S|SS|SSS|GOD>\`\n` +
                `  Sets adventurer rank directly.\n\n` +
                `• \`${prefix} admin unstick <@user>\`\n` +
                `  Clears stuck combat state (pendingActions, combatProcessing).\n` +
                `  Use when someone is locked out of combat.\n\n` +
                `• \`${prefix} admin inspect <@user>\`\n` +
                `  Full character inspection: stats, equipment, skills, wallet, rank.\n\n` +
                `━━━━━━━━━━━━━━━━━━━\n` +
                `🔧 *CONTENT TOOLS*\n` +
                `━━━━━━━━━━━━━━━━━━━\n` +
                `• \`${prefix} admin createskill\`\n` +
                `  Sends a fill-in-the-blank template. Reply to it with the filled\n` +
                `  version to create a real skill in the skill tree.\n\n` +
                `• \`${prefix} admin createclass\`\n` +
                `  Same template pattern for creating a new class.\n\n` +
                `• \`${prefix} admin disableskill <skill_name>\`\n` +
                `  Disables a skill (players can't learn it, equipped ones no-op).\n\n` +
                `• \`${prefix} admin enableskill <skill_name>\`\n` +
                `  Re-enables a disabled skill.\n\n` +
                `━━━━━━━━━━━━━━━━━━━\n` +
                `🎭 *MAIN-ACCOUNT CLASS SWITCH*\n` +
                `━━━━━━━━━━━━━━━━━━━\n` +
                `• \`${prefix} modclass <class_name>\`\n` +
                `  Switches YOUR class freely (bypasses evolution requirements).\n` +
                `  All other stats/items/progress unchanged.\n` +
                `  Example: \`${prefix} modclass Archmage\`\n` +
                `  Use \`${prefix} modclass\` (no args) to see all available classes.\n\n` +
                `_Non-mods cannot use any of these commands._`
        });
    }

    // ── SET LEVEL ──────────────────────────────────────────────────────────
    if (sub === 'setlevel') {
        const { target, remaining } = parseAdminArgs(getMentionOrReply, m, senderJid, args.slice(1));
        const level = parseInt(remaining[0]);
        if (!level || level < 1 || level > 100) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${prefix} admin setlevel <@user> <1-100>\`` });
        }
        const user = economy.getUser(target);
        if (!user) return await sock.sendMessage(chatId, { text: BOT_MARKER + '❌ User not found.' });
        const oldLevel = progression.getLevel(target);
        const xpForLevel = progression.getXPForLevel(level);
        user.progression = user.progression || {};
        user.progression.level = level;
        user.progression.xp = xpForLevel;
        user.progression.statPoints = (user.progression.statPoints || 0) + (level - oldLevel) * 2;
        economy.scheduleSave(target);
        return await sock.sendMessage(chatId, {
            text: BOT_MARKER + `✅ *LEVEL SET*\n\n👤 @${target.split('@')[0]}\n📊 Level: ${oldLevel} → *${level}*\n⚡ XP set to ${xpForLevel.toLocaleString()}\n💎 +${(level - oldLevel) * 2} stat points granted`,
            mentions: [target]
        });
    }

    // ── SET STAT ───────────────────────────────────────────────────────────
    if (sub === 'setstat') {
        const { target, remaining } = parseAdminArgs(getMentionOrReply, m, senderJid, args.slice(1));
        const statName = (remaining[0] || '').toLowerCase();
        const value = parseInt(remaining[1]);
        const validStats = ['hp', 'atk', 'def', 'mag', 'spd', 'luck', 'crit'];
        if (!target || !validStats.includes(statName) || isNaN(value)) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${prefix} admin setstat <@user> <hp|atk|def|mag|spd|luck|crit> <value>\`` });
        }
        const user = economy.getUser(target);
        if (!user) return await sock.sendMessage(chatId, { text: BOT_MARKER + '❌ User not found.' });
        user.progression = user.progression || {};
        user.progression.allocatedStats = user.progression.allocatedStats || {};
        const oldValue = user.progression.allocatedStats[statName] || 0;
        user.progression.allocatedStats[statName] = value;
        economy.scheduleSave(target);
        return await sock.sendMessage(chatId, {
            text: BOT_MARKER + `✅ *STAT SET*\n\n👤 @${target.split('@')[0]}\n📊 ${statName.toUpperCase()}: ${oldValue} → *${value}*`,
            mentions: [target]
        });
    }

    // ── SET WALLET ─────────────────────────────────────────────────────────
    if (sub === 'setwallet') {
        const { target, remaining } = parseAdminArgs(getMentionOrReply, m, senderJid, args.slice(1));
        const amount = parseInt(remaining[0]);
        if (!target || isNaN(amount) || amount < 0) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${prefix} admin setwallet <@user> <amount>\`` });
        }
        const user = economy.getUser(target);
        if (!user) return await sock.sendMessage(chatId, { text: BOT_MARKER + '❌ User not found.' });
        const oldWallet = user.wallet || 0;
        user.wallet = amount;
        economy.scheduleSave(target);
        return await sock.sendMessage(chatId, {
            text: BOT_MARKER + `✅ *WALLET SET*\n\n👤 @${target.split('@')[0]}\n💰 Wallet: ${oldWallet.toLocaleString()} → *${amount.toLocaleString()}*`,
            mentions: [target]
        });
    }

    // ── GIVE ITEM ──────────────────────────────────────────────────────────
    if (sub === 'giveitem') {
        const { target, remaining } = parseAdminArgs(getMentionOrReply, m, senderJid, args.slice(1));
        const itemName = remaining.join(' ').trim();
        // Try to parse "itemname qty" from the remaining args
        const parts = itemName.split(/\s+/);
        let qty = 1;
        const lastPart = parseInt(parts[parts.length - 1]);
        if (!isNaN(lastPart) && lastPart > 0) {
            qty = lastPart;
            parts.pop();
        }
        const itemQuery = parts.join(' ');
        if (!target || !itemQuery) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${prefix} admin giveitem <@user> <item_name> [qty]\`` });
        }
        const item = resolveItem(itemQuery);
        if (!item) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Item "${itemQuery}" not found. Try the item ID.` });
        }
        const result = economy.addItem(target, item.id, qty);
        if (!result) return await sock.sendMessage(chatId, { text: BOT_MARKER + '❌ Failed to add item.' });
        economy.scheduleSave(target);
        return await sock.sendMessage(chatId, {
            text: BOT_MARKER + `✅ *ITEM GIVEN*\n\n👤 @${target.split('@')[0]}\n📦 ${item.icon || '📦'} *${item.name}* ×${qty}\n🆔 \`${item.id}\``,
            mentions: [target]
        });
    }

    // ── TAKE ITEM ──────────────────────────────────────────────────────────
    if (sub === 'takeitem') {
        const { target, remaining } = parseAdminArgs(getMentionOrReply, m, senderJid, args.slice(1));
        const itemName = remaining.join(' ').trim();
        const parts = itemName.split(/\s+/);
        let qty = 1;
        const lastPart = parseInt(parts[parts.length - 1]);
        if (!isNaN(lastPart) && lastPart > 0) {
            qty = lastPart;
            parts.pop();
        }
        const itemQuery = parts.join(' ');
        if (!target || !itemQuery) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${prefix} admin takeitem <@user> <item_name> [qty]\`` });
        }
        const item = resolveItem(itemQuery);
        if (!item) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Item "${itemQuery}" not found.` });
        }
        const result = economy.removeItem(target, item.id, qty);
        if (!result) return await sock.sendMessage(chatId, { text: BOT_MARKER + '❌ Failed to remove item (not enough in inventory).' });
        economy.scheduleSave(target);
        return await sock.sendMessage(chatId, {
            text: BOT_MARKER + `✅ *ITEM REMOVED*\n\n👤 @${target.split('@')[0]}\n📦 ${item.icon || '📦'} *${item.name}* ×${qty}`,
            mentions: [target]
        });
    }

    // ── GIVE SKILL ─────────────────────────────────────────────────────────
    if (sub === 'giveskill') {
        const { target, remaining } = parseAdminArgs(getMentionOrReply, m, senderJid, args.slice(1));
        const skillQuery = remaining.join(' ').trim();
        const parts = skillQuery.split(/\s+/);
        let level = 1;
        const lastPart = parseInt(parts[parts.length - 1]);
        if (!isNaN(lastPart) && lastPart > 0) {
            level = lastPart;
            parts.pop();
        }
        const skillName = parts.join(' ');
        if (!target || !skillName) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${prefix} admin giveskill <@user> <skill_name> [level]\`` });
        }
        const skill = resolveSkill(skillName);
        if (!skill) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Skill "${skillName}" not found.` });
        }
        const user = economy.getUser(target);
        if (!user) return await sock.sendMessage(chatId, { text: BOT_MARKER + '❌ User not found.' });
        if (!user.skills) user.skills = {};
        const oldLevel = user.skills[skill.id] || 0;
        user.skills[skill.id] = level;
        economy.scheduleSave(target);
        return await sock.sendMessage(chatId, {
            text: BOT_MARKER + `✅ *SKILL GRANTED*\n\n👤 @${target.split('@')[0]}\n✨ *${skill.name}* (Lv.${oldLevel || 0} → *${level}*)\n🆔 \`${skill.id}\``,
            mentions: [target]
        });
    }

    // ── REVOKE SKILL ───────────────────────────────────────────────────────
    if (sub === 'revokeskill') {
        const { target, remaining } = parseAdminArgs(getMentionOrReply, m, senderJid, args.slice(1));
        const skillName = remaining.join(' ').trim();
        if (!target || !skillName) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${prefix} admin revokeskill <@user> <skill_name>\`` });
        }
        const skill = resolveSkill(skillName);
        if (!skill) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Skill "${skillName}" not found.` });
        }
        const user = economy.getUser(target);
        if (!user) return await sock.sendMessage(chatId, { text: BOT_MARKER + '❌ User not found.' });
        if (!user.skills || !user.skills[skill.id]) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ @${target.split('@')[0]} doesn't have that skill.`, mentions: [target] });
        }
        const oldLevel = user.skills[skill.id];
        delete user.skills[skill.id];
        economy.scheduleSave(target);
        return await sock.sendMessage(chatId, {
            text: BOT_MARKER + `✅ *SKILL REVOKED*\n\n👤 @${target.split('@')[0]}\n❌ *${skill.name}* (was Lv.${oldLevel})\n🆔 \`${skill.id}\``,
            mentions: [target]
        });
    }

    // ── RESET PLAYER ───────────────────────────────────────────────────────
    if (sub === 'resetplayer') {
        const { target } = parseAdminArgs(getMentionOrReply, m, senderJid, args.slice(1));
        if (!target) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${prefix} admin resetplayer <@user>\`` });
        }
        const user = economy.getUser(target);
        if (!user) return await sock.sendMessage(chatId, { text: BOT_MARKER + '❌ User not found.' });
        // Reset stats
        if (user.progression) {
            user.progression.allocatedStats = { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 };
            user.progression.allocatedStatPoints = { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 };
            const level = user.progression.level || 1;
            user.progression.statPoints = level * 2;
        }
        // Reset skills
        user.skills = {};
        economy.scheduleSave(target);
        return await sock.sendMessage(chatId, {
            text: BOT_MARKER + `✅ *PLAYER RESET*\n\n👤 @${target.split('@')[0]}\n📊 Stats reset to 0 (refunded ${user.progression?.level * 2 || 0} points)\n✨ All skills revoked\n💰 Wallet/level unchanged`,
            mentions: [target]
        });
    }

    // ── FORCE EVOLVE ───────────────────────────────────────────────────────
    if (sub === 'forceevolve') {
        const { target, remaining } = parseAdminArgs(getMentionOrReply, m, senderJid, args.slice(1));
        const className = remaining.join(' ').trim();
        if (!target || !className) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${prefix} admin forceevolve <@user> <class_name>\`` });
        }
        const targetClass = resolveClass(className);
        if (!targetClass) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Class "${className}" not found.` });
        }
        const user = economy.getUser(target);
        if (!user) return await sock.sendMessage(chatId, { text: BOT_MARKER + '❌ User not found.' });
        const oldClass = classSystem.getClassById(user.class);
        const oldName = oldClass ? `${oldClass.icon} ${oldClass.name}` : 'None';
        user.class = targetClass.id;
        economy.scheduleSave(target);
        return await sock.sendMessage(chatId, {
            text: BOT_MARKER + `✅ *FORCE EVOLVE*\n\n👤 @${target.split('@')[0]}\n🔄 ${oldName} → ${targetClass.icon} *${targetClass.name}*\n📝 ${targetClass.desc || ''}\n\n_All requirements bypassed. Stats/items unchanged._`,
            mentions: [target]
        });
    }

    // ── GIVE STAT POINTS ───────────────────────────────────────────────────
    if (sub === 'givepoints') {
        const { target, remaining } = parseAdminArgs(getMentionOrReply, m, senderJid, args.slice(1));
        const amount = parseInt(remaining[0]);
        if (!target || isNaN(amount) || amount <= 0) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${prefix} admin givepoints <@user> <amount>\`` });
        }
        const user = economy.getUser(target);
        if (!user) return await sock.sendMessage(chatId, { text: BOT_MARKER + '❌ User not found.' });
        user.progression = user.progression || {};
        const oldPoints = user.progression.statPoints || 0;
        user.progression.statPoints = oldPoints + amount;
        economy.scheduleSave(target);
        return await sock.sendMessage(chatId, {
            text: BOT_MARKER + `✅ *STAT POINTS GRANTED*\n\n👤 @${target.split('@')[0]}\n💎 Stat Points: ${oldPoints} → *${oldPoints + amount}* (+${amount})`,
            mentions: [target]
        });
    }

    // ── GIVE ZENI ──────────────────────────────────────────────────────────
    if (sub === 'givezeni') {
        const { target, remaining } = parseAdminArgs(getMentionOrReply, m, senderJid, args.slice(1));
        const amount = parseInt(remaining[0]);
        if (!target || isNaN(amount) || amount <= 0) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${prefix} admin givezeni <@user> <amount>\`` });
        }
        const user = economy.getUser(target);
        if (!user) return await sock.sendMessage(chatId, { text: BOT_MARKER + '❌ User not found.' });
        const oldWallet = user.wallet || 0;
        user.wallet = oldWallet + amount;
        economy.scheduleSave(target);
        return await sock.sendMessage(chatId, {
            text: BOT_MARKER + `✅ *ZENI GRANTED*\n\n👤 @${target.split('@')[0]}\n💰 Wallet: ${oldWallet.toLocaleString()} → *${(oldWallet + amount).toLocaleString()}* (+${amount.toLocaleString()})`,
            mentions: [target]
        });
    }

    // ── SET RANK ───────────────────────────────────────────────────────────
    if (sub === 'setrank') {
        const { target, remaining } = parseAdminArgs(getMentionOrReply, m, senderJid, args.slice(1));
        const rank = (remaining[0] || '').toUpperCase();
        const validRanks = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS', 'GOD'];
        if (!target || !validRanks.includes(rank)) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${prefix} admin setrank <@user> <F|E|D|C|B|A|S|SS|SSS|GOD>\`` });
        }
        const user = economy.getUser(target);
        if (!user) return await sock.sendMessage(chatId, { text: BOT_MARKER + '❌ User not found.' });
        const oldRank = user.adventurerRank || 'F';
        user.adventurerRank = rank;
        economy.scheduleSave(target);
        return await sock.sendMessage(chatId, {
            text: BOT_MARKER + `✅ *RANK SET*\n\n👤 @${target.split('@')[0]}\n🏆 Rank: ${oldRank} → *${rank}*`,
            mentions: [target]
        });
    }

    // ── UNSTICK (clear stuck combat state) ─────────────────────────────────
    if (sub === 'unstick') {
        const { target } = parseAdminArgs(getMentionOrReply, m, senderJid, args.slice(1));
        if (!target) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${prefix} admin unstick <@user>\`` });
        }
        const guildAdventure = require('../rpg/guildAdventure');
        const chatIdState = chatId;
        const soloKey = `${chatIdState}_${target}`;
        let cleared = 0;
        // Clear solo state
        if (guildAdventure.getGameState(soloKey)) {
            const state = guildAdventure.getGameState(soloKey);
            state.inCombat = false;
            state.active = false;
            state.combatProcessing = false;
            if (state.pendingActions) delete state.pendingActions[target];
            cleared++;
        }
        // Clear group state
        if (guildAdventure.getGameState(chatIdState)) {
            const state = guildAdventure.getGameState(chatIdState);
            if (state.pendingActions) delete state.pendingActions[target];
            state.combatProcessing = false;
            cleared++;
        }
        return await sock.sendMessage(chatId, {
            text: BOT_MARKER + `✅ *UNSTUCK*\n\n👤 @${target.split('@')[0]}\n🧹 Cleared ${cleared} combat state(s)\n_pendingActions cleared, combatProcessing reset_`,
            mentions: [target]
        });
    }

    // ── INSPECT (full character inspection) ────────────────────────────────
    if (sub === 'inspect') {
        const { target } = parseAdminArgs(getMentionOrReply, m, senderJid, args.slice(1));
        if (!target) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${prefix} admin inspect <@user>\`` });
        }
        const user = economy.getUser(target);
        if (!user) return await sock.sendMessage(chatId, { text: BOT_MARKER + '❌ User not found.' });
        const cls = economy.getUserClass(target);
        const level = progression.getLevel(target);
        const stats = progression.getBaseStats(target, user.class);
        const equipStats = inventorySystem.getEquipmentStats(target);
        const equipment = inventorySystem.getEquipment(target);

        let msg = `🔍 *CHARACTER INSPECTION*\n\n`;
        msg += `👤 *${user.nickname}*\n`;
        msg += `🆔 \`${target}\`\n`;
        msg += `${cls?.icon || '👤'} Class: *${cls?.name || 'None'}* (${cls?.tier || '?'})\n`;
        msg += `📊 Level: *${level}* | Rank: *${user.adventurerRank || 'F'}*\n`;
        msg += `💰 Wallet: ${(user.wallet || 0).toLocaleString()} | Bank: ${(user.bank || 0).toLocaleString()}\n`;
        msg += `💎 Stat Points: ${user.progression?.statPoints || 0}\n\n`;

        msg += `*Base Stats:*\n`;
        msg += `❤️ HP: ${stats.hp} | ⚡ EN: ${stats.maxEnergy}\n`;
        msg += `⚔️ ATK: ${stats.atk} | 🛡️ DEF: ${stats.def}\n`;
        msg += `🔮 MAG: ${stats.mag} | 💨 SPD: ${stats.spd}\n`;
        msg += `🍀 LUCK: ${stats.luck} | 💥 CRIT: ${stats.crit}%\n`;
        msg += `🛡️ Dmg Reduction: ${stats.dmgReduction || 0}% | 💨 Evasion: ${stats.evasion || 0}%\n\n`;

        msg += `*Equipment:*\n`;
        for (const [slot, item] of Object.entries(equipment || {})) {
            if (item) {
                const info = lootSystem.getItemInfo(item.id);
                msg += `${slot}: ${info?.name || item.id} ${item.enhancementLevel ? `(+${item.enhancementLevel})` : ''}\n`;
            }
        }

        msg += `\n*Skills:*\n`;
        if (user.skills && Object.keys(user.skills).length > 0) {
            for (const [skillId, level] of Object.entries(user.skills)) {
                msg += `  • ${skillId} (Lv.${level})\n`;
            }
        } else {
            msg += `  _None_\n`;
        }

        return await sock.sendMessage(chatId, {
            text: BOT_MARKER + msg,
            mentions: [target]
        });
    }

    // ── DISABLE SKILL ──────────────────────────────────────────────────────
    if (sub === 'disableskill') {
        const skillName = args.slice(1).join(' ').trim();
        if (!skillName) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${prefix} admin disableskill <skill_name>\`` });
        }
        const skill = resolveSkill(skillName);
        if (!skill) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Skill "${skillName}" not found.` });
        }
        // Find and disable in skillTree
        const SK = skillTree.SKILL_TREES || skillTree;
        if (SK[skill.classId]?.trees) {
            for (const treeData of Object.values(SK[skill.classId].trees)) {
                if (treeData.skills?.[skill.id]) {
                    treeData.skills[skill.id].disabled = true;
                    return await sock.sendMessage(chatId, {
                        text: BOT_MARKER + `✅ *SKILL DISABLED*\n\n❌ *${skill.name}* is now disabled.\n_Existing players keep it but it won't fire. New players can't learn it._`
                    });
                }
            }
        }
        return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Could not find skill in tree to disable.` });
    }

    // ── ENABLE SKILL ───────────────────────────────────────────────────────
    if (sub === 'enableskill') {
        const skillName = args.slice(1).join(' ').trim();
        if (!skillName) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${prefix} admin enableskill <skill_name>\`` });
        }
        const skill = resolveSkill(skillName);
        if (!skill) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Skill "${skillName}" not found.` });
        }
        const SK = skillTree.SKILL_TREES || skillTree;
        if (SK[skill.classId]?.trees) {
            for (const treeData of Object.values(SK[skill.classId].trees)) {
                if (treeData.skills?.[skill.id]) {
                    delete treeData.skills[skill.id].disabled;
                    return await sock.sendMessage(chatId, {
                        text: BOT_MARKER + `✅ *SKILL ENABLED*\n\n✨ *${skill.name}* is now active again.`
                    });
                }
            }
        }
        return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Could not find skill in tree.` });
    }

    // ── CREATE SKILL (template) ────────────────────────────────────────────
    if (sub === 'createskill') {
        const template = `📝 *SKILL CREATOR*\n\nReply to this message with the filled-in template:\n\n\`\`\`\nName: <skill name>\nIcon: <emoji>\nClass: <class name or ID>\nTree: <tree name e.g. FIRE>\nTier: <1-4>\nLevelReq: <required level>\nMaxLevel: <1-5>\nCost: <energy cost>\nCooldown: <turns>\nDamageType: <PHYSICAL|MAGICAL|TRUE>\nTargeting: <SINGLE|AOE|AOE_LARGE|ALL_ENEMIES|SELF|TEAM>\nDamageMult: <multiplier e.g. 2.5>\nDescription: <short description>\n\`\`\``;
        return await sock.sendMessage(chatId, { text: BOT_MARKER + template });
    }

    // ── CREATE CLASS (template) ────────────────────────────────────────────
    if (sub === 'createclass') {
        const template = `📝 *CLASS CREATOR*\n\nReply to this message with the filled-in template:\n\n\`\`\`\nName: <class name>\nIcon: <emoji>\nTier: <STARTER|EVOLVED|ASCENDED>\nRole: <TANK|DPS|MAGE|SUPPORT|HYBRID>\nHP: <base hp>\nATK: <base atk>\nDEF: <base def>\nMAG: <base mag>\nSPD: <base spd>\nLUCK: <base luck>\nCRIT: <base crit>\nDesc: <short description>\nEvolvesFrom: <parent class ID or NONE>\nPassiveName: <passive name>\nPassiveEffect: <all_stats|dodge_chance|magic_damage|etc>\nPassiveValue: <number>\n\`\`\``;
        return await sock.sendMessage(chatId, { text: BOT_MARKER + template });
    }

    // ── UNKNOWN SUBCOMMAND ──────────────────────────────────────────────────
    return await sock.sendMessage(chatId, {
        text: BOT_MARKER + `❌ Unknown admin command: \`${sub}\`\nUse \`${prefix} admin\` to see all commands.`
    });
}

// ─── HANDLE SKILL CREATION REPLY ───────────────────────────────────────────
async function handleSkillCreationReply(sock, chatId, senderJid, replyText, BOT_MARKER, prefix) {
    try {
        const lines = replyText.split('\n');
        const data = {};
        for (const line of lines) {
            const match = line.match(/^(\w+):\s*(.+)$/);
            if (match) data[match[1]] = match[2].trim();
        }

        if (!data.Name || !data.Class) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + '❌ Template incomplete. At minimum Name and Class are required.' });
        }

        const targetClass = resolveClass(data.Class);
        if (!targetClass) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Class "${data.Class}" not found.` });
        }

        const skillId = data.Name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const treeName = (data.Tree || 'CUSTOM').toUpperCase();

        const SK = skillTree.SKILL_TREES || skillTree;
        if (!SK[targetClass.id]) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Class ${targetClass.id} not found in skill tree.` });
        }
        if (!SK[targetClass.id].trees) SK[targetClass.id].trees = {};
        if (!SK[targetClass.id].trees[treeName]) {
            SK[targetClass.id].trees[treeName] = { name: treeName, icon: '✨', skills: {} };
        }

        const maxLevel = parseInt(data.MaxLevel) || 5;
        const dmgMult = parseFloat(data.DamageMult) || 1.0;
        const cost = parseInt(data.Cost) || 20;
        const cooldown = parseInt(data.Cooldown) || 1;
        const tier = parseInt(data.Tier) || 1;
        const reqLevel = parseInt(data.LevelReq) || 1;

        const newSkill = {
            id: skillId,
            name: data.Name,
            tier: tier,
            requiredLevel: reqLevel,
            maxLevel: maxLevel,
            energyCost: Array(maxLevel).fill(cost),
            cooldown: cooldown,
            damageMultiplier: Array(maxLevel).fill(dmgMult),
            damageType: data.DamageType || 'PHYSICAL',
            targeting: data.Targeting || 'SINGLE',
            description: data.Description || '',
            animation: data.Icon || '✨',
            skillPointCost: Array(maxLevel).fill(tier),
        };

        SK[targetClass.id].trees[treeName].skills[skillId] = newSkill;

        return await sock.sendMessage(chatId, {
            text: BOT_MARKER + `✅ *SKILL CREATED!*\n\n${data.Icon || '✨'} *${data.Name}*\n🆔 \`${skillId}\`\n📋 Class: ${targetClass.icon} ${targetClass.name}\n📊 Tier: ${tier} | Lv.${reqLevel}+ | Max Lv.${maxLevel}\n⚡ Cost: ${cost} | CD: ${cooldown}\n💥 ${data.DamageType || 'PHYSICAL'} ×${dmgMult} — ${data.Targeting || 'SINGLE'}\n📝 ${data.Description || ''}\n\n_Immediately usable. Players can learn it via skill tree._`
        });
    } catch (e) {
        return await sock.sendMessage(chatId, { text: BOT_MARKER + '❌ Parse error: ' + e.message });
    }
}

// ─── HANDLE CLASS CREATION REPLY ───────────────────────────────────────────
async function handleClassCreationReply(sock, chatId, senderJid, replyText, BOT_MARKER, prefix) {
    try {
        const lines = replyText.split('\n');
        const data = {};
        for (const line of lines) {
            const match = line.match(/^(\w+):\s*(.+)$/);
            if (match) data[match[1]] = match[2].trim();
        }

        if (!data.Name) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + '❌ Template incomplete. Name is required.' });
        }

        const classId = data.Name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
        const newClass = {
            id: classId,
            name: data.Name,
            icon: data.Icon || '✨',
            desc: data.Desc || 'A custom class.',
            tier: data.Tier || 'STARTER',
            role: data.Role || 'HYBRID',
            stats: {
                hp: parseInt(data.HP) || 100,
                atk: parseInt(data.ATK) || 10,
                def: parseInt(data.DEF) || 10,
                mag: parseInt(data.MAG) || 10,
                spd: parseInt(data.SPD) || 10,
                luck: parseInt(data.LUCK) || 10,
                crit: parseInt(data.CRIT) || 10,
            },
            evolves_into: [],
        };

        if (data.EvolvesFrom && data.EvolvesFrom !== 'NONE') {
            newClass.evolvedFrom = data.EvolvesFrom.toUpperCase();
        }

        if (data.PassiveName && data.PassiveEffect) {
            newClass.passive = {
                name: data.PassiveName,
                effect: data.PassiveEffect,
                value: parseFloat(data.PassiveValue) || 5,
            };
        }

        // Add to class system
        const allClasses = classSystem.getAllClasses();
        allClasses[classId] = newClass;

        // Add to skill tree
        const SK = skillTree.SKILL_TREES || skillTree;
        if (!SK[classId]) {
            SK[classId] = {
                name: data.Name,
                icon: data.Icon || '✨',
                skillPointsPerLevel: 2,
                trees: {
                    CUSTOM: { name: 'Custom Path', icon: '✨', skills: {} }
                }
            };
        }

        return await sock.sendMessage(chatId, {
            text: BOT_MARKER + `✅ *CLASS CREATED!*\n\n${data.Icon || '✨'} *${data.Name}*\n🆔 \`${classId}\`\n📊 Tier: ${data.Tier || 'STARTER'} | Role: ${data.Role || 'HYBRID'}\n❤️ HP: ${data.HP || 100} | ⚔️ ATK: ${data.ATK || 10} | 🛡️ DEF: ${data.DEF || 10}\n🔮 MAG: ${data.MAG || 10} | 💨 SPD: ${data.SPD || 10} | 🍀 LUCK: ${data.LUCK || 10}\n📝 ${data.Desc || ''}\n${data.PassiveName ? `✨ Passive: ${data.PassiveName} (${data.PassiveEffect} ${data.PassiveValue || 5})\n` : ''}_Immediately selectable via \`modclass ${data.Name}\` or \`admin forceevolve\`._`
        });
    } catch (e) {
        return await sock.sendMessage(chatId, { text: BOT_MARKER + '❌ Parse error: ' + e.message });
    }
}

module.exports = {
    handleAdmin,
    handleModClass,
    handleSkillCreationReply,
    handleClassCreationReply,
    resolveClass,
    resolveSkill,
    resolveItem,
};
