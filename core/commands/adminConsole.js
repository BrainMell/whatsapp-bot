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

    // 💡 MOD CLASS UNLOCK: auto-grant ALL skills from the new class's tree
    // at max level. Mods are testing — they shouldn't have to grind skills
    // to test a class. This sets every skill in the class's skill tree to
    // maxLevel so the mod can immediately use all abilities.
    let unlockedCount = 0;
    try {
        const skillTree = require('../rpg/skillTree');
        const progression = require('../rpg/progression');
        const level = progression.getLevel(senderJid);
        const SK = skillTree.SKILL_TREES || skillTree;
        const tree = SK[targetClass.id.toUpperCase()];
        if (tree && tree.trees) {
            if (!user.skills) user.skills = {};
            for (const [, treeData] of Object.entries(tree.trees)) {
                if (!treeData.skills) continue;
                for (const [skillId, skill] of Object.entries(treeData.skills)) {
                    // Skip ascended skills (tier 4) unless mod explicitly wants them
                    // — actually for mod testing, unlock everything
                    user.skills[skillId] = skill.maxLevel || 1;
                    unlockedCount++;
                }
            }
            // Also grant bonus skill points so they can respec if needed
            user.skillPoints = (user.skillPoints || 0) + 20;
            economy.saveUser(senderJid);
        }
    } catch (e) {
        console.error('[ModClass] skill unlock failed:', e.message);
    }

    return await sock.sendMessage(chatId, {
        text: BOT_MARKER + `✅ *CLASS SWITCHED (MOD)*\n\n👤 Your character: *${user.nickname}*\n🔄 *${oldClassName}* → ${targetClass.icon} *${targetClass.name}*\n📝 ${targetClass.desc || ''}\n\n✨ *All ${unlockedCount} class skills unlocked at max level!*\n💎 +20 bonus skill points granted\n\n_All other stats, items, and progress unchanged._`
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. ADMIN CONSOLE — Direct Actions
// ═══════════════════════════════════════════════════════════════════════════

async function handleAdmin(sock, chatId, senderJid, args, m, BOT_MARKER, prefix, getMentionOrReply) {
    const sub = args[0]?.toLowerCase();

    // 💡 LIVE MESSAGE EDITING: send a message, then edit it in-place as
    // actions complete. Baileys supports this via { edit: messageKey }.
    // Usage: const msgKey = await sendLive("Processing..."); then
    //        await editLive(msgKey, "Done! Result: ...");
    async function sendLive(text) {
        const sent = await sock.sendMessage(chatId, { text: BOT_MARKER + text });
        return sent?.key || null;
    }
    async function editLive(key, text) {
        if (!key) return;
        try {
            await sock.sendMessage(chatId, { text: BOT_MARKER + text, edit: key });
        } catch (e) {
            // Edit failed (old message, permissions, etc.) — send new message
            try { await sock.sendMessage(chatId, { text: BOT_MARKER + text }); } catch (e2) {}
        }
    }

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
                `  Grants STAT points (for HP/ATK/DEF allocation).\n\n` +
                `• \`${prefix} admin setskillpoints <@user> <amount>\`\n` +
                `  Sets RPG SKILL points directly (for ability tree).\n\n` +
                `• \`${prefix} admin giveskillpoints <@user> <amount>\`\n` +
                `  Adds RPG SKILL points (does NOT overwrite).\n\n` +
                `• \`${prefix} admin fightenemy <bossId|name>\`\n` +
                `  Fight any boss for testing. Use \`admin enemy list\` to find IDs.\n\n` +
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
                `👹 *ENEMY EDITOR (NEW)*\n` +
                `━━━━━━━━━━━━━━━━━━━\n` +
                `• \`${prefix} admin enemy list\`\n` +
                `  Lists all bosses with HP/ATK/DEF/XP/Gold.\n\n` +
                `• \`${prefix} admin enemy info <bossId>\`\n` +
                `  Full stat block for one boss. Use list to find IDs.\n\n` +
                `• \`${prefix} admin enemy setstat <bossId> <stat> <value>\`\n` +
                `  Edit any stat (hp/atk/def/mag/spd/luck/crit). Applies immediately.\n\n` +
                `• \`${prefix} admin enemy sethp|setatk|setdef <bossId> <value>\`\n` +
                `  Shortcuts for the most-edited stats.\n\n` +
                `• \`${prefix} admin enemy setxp <bossId> <value>\`\n` +
                `  Set XP reward.\n\n` +
                `• \`${prefix} admin enemy setgold <bossId> <min> <max>\`\n` +
                `  Set gold reward range.\n\n` +
                `• \`${prefix} admin enemy reset\`\n` +
                `  Discards all runtime edits, reloads from source.\n\n` +
                `_Edits are in-memory only — a restart reverts them. For permanent changes, edit classEncounters.js._\n\n` +
                `━━━━━━━━━━━━━━━━━━━\n` +
                `⚡ *ENEMY SKILL EDITOR (NEW)*\n` +
                `━━━━━━━━━━━━━━━━━━━\n` +
                `• \`${prefix} admin enemyskills [archetype]\`\n` +
                `  Lists all 63 monster skills across 12 archetypes with IDs.\n\n` +
                `• \`${prefix} admin enemyskill info <archetype> <skillId>\`\n` +
                `  Full skill details (cost, level req, type, chain).\n\n` +
                `• \`${prefix} admin enemyskill setcost <arch> <skillId> <value>\`\n` +
                `  Edit skill mana cost.\n\n` +
                `• \`${prefix} admin enemyskill setlevel <arch> <skillId> <level>\`\n` +
                `  Edit skill level requirement.\n\n` +
                `• \`${prefix} admin enemyskill setname <arch> <skillId> <name>\`\n` +
                `  Edit skill display name.\n\n` +
                `• \`${prefix} admin enemyskill reset\`\n` +
                `  Reload all monster skills from source.\n\n` +
                `━━━━━━━━━━━━━━━━━━━\n` +
                `🧪 *SANDBOX MODE (FULL RPG TESTING)*\n` +
                `━━━━━━━━━━━━━━━━━━━\n` +
                `Fully stacked test character — Lv100, GOD rank, 1B Zeni, all trials done.\n` +
                `When ON, ALL your commands use the sandbox account. Your real account is safe.\n\n` +
                `*CORE:*\n` +
                `• \`${prefix} admin sandbox on\` — activate (swap to sandbox character)\n` +
                `• \`${prefix} admin sandbox off\` — deactivate (save + restore real account)\n` +
                `• \`${prefix} admin sandbox\` — show status (active/inactive + stats)\n` +
                `• \`${prefix} admin sandbox save\` — save sandbox data without turning off\n` +
                `• \`${prefix} admin sandbox reset\` — wipe to fresh stacked state\n\n` +
                `*COMBAT:*\n` +
                `• \`${prefix} admin godmode on/off\` — 99999 dmg per hit, 0 dmg taken\n` +
                `• \`${prefix} admin sandbox fightboss <bossId>\` — fight any boss\n\n` +
                `*CLASS & SKILLS:*\n` +
                `• \`${prefix} admin sandbox evolve <class>\` — switch to ANY class + unlock all skills\n` +
                `• \`${prefix} admin sandbox giveskillsall\` — unlock ALL skills from ALL classes\n` +
                `• \`${prefix} admin sandbox giveskill <skill> [level]\` — grant a specific skill\n\n` +
                `*STATS:*\n` +
                `• \`${prefix} admin sandbox maxstats\` — set all stats to 99999/9999\n` +
                `• \`${prefix} admin sandbox setlevel <1-100>\`\n` +
                `• \`${prefix} admin sandbox setrank <F-SSS|GOD>\`\n` +
                `• \`${prefix} admin sandbox setstat <stat> <value>\`\n\n` +
                `*ECONOMY:*\n` +
                `• \`${prefix} admin sandbox setwallet <amount>\`\n` +
                `• \`${prefix} admin sandbox givezeni <amount>\`\n\n` +
                `*INVENTORY:*\n` +
                `• \`${prefix} admin sandbox giveall\` — grant 99× all stones, keys + every equipment\n` +
                `• \`${prefix} admin sandbox giveitem <item> [qty]\`\n` +
                `• \`${prefix} admin sandbox clearinv\` — clear sandbox inventory\n` +
                `• \`${prefix} admin sandbox unequipall\` — unequip all equipment\n` +
                `• \`${prefix} admin sandbox setclass <name>\`\n\n` +
                `_Auto-saves after every command. Data persists in separate DB collection._\n\n` +
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
            text: BOT_MARKER + `✅ *LEVEL SET*\n\n👤 @${economy.getDisplayName(target)}\n📊 Level: ${oldLevel} → *${level}*\n⚡ XP set to ${xpForLevel.toLocaleString()}\n💎 +${(level - oldLevel) * 2} stat points granted`,
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
            text: BOT_MARKER + `✅ *STAT SET*\n\n👤 @${economy.getDisplayName(target)}\n📊 ${statName.toUpperCase()}: ${oldValue} → *${value}*`,
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
            text: BOT_MARKER + `✅ *WALLET SET*\n\n👤 @${economy.getDisplayName(target)}\n💰 Wallet: ${oldWallet.toLocaleString()} → *${amount.toLocaleString()}*`,
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
            text: BOT_MARKER + `✅ *ITEM GIVEN*\n\n👤 @${economy.getDisplayName(target)}\n📦 ${item.icon || '📦'} *${item.name}* ×${qty}\n🆔 \`${item.id}\``,
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
            text: BOT_MARKER + `✅ *ITEM REMOVED*\n\n👤 @${economy.getDisplayName(target)}\n📦 ${item.icon || '📦'} *${item.name}* ×${qty}`,
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
            text: BOT_MARKER + `✅ *SKILL GRANTED*\n\n👤 @${economy.getDisplayName(target)}\n✨ *${skill.name}* (Lv.${oldLevel || 0} → *${level}*)\n🆔 \`${skill.id}\``,
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
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ @${economy.getDisplayName(target)} doesn't have that skill.`, mentions: [target] });
        }
        const oldLevel = user.skills[skill.id];
        delete user.skills[skill.id];
        economy.scheduleSave(target);
        return await sock.sendMessage(chatId, {
            text: BOT_MARKER + `✅ *SKILL REVOKED*\n\n👤 @${economy.getDisplayName(target)}\n❌ *${skill.name}* (was Lv.${oldLevel})\n🆔 \`${skill.id}\``,
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
            text: BOT_MARKER + `✅ *PLAYER RESET*\n\n👤 @${economy.getDisplayName(target)}\n📊 Stats reset to 0 (refunded ${user.progression?.level * 2 || 0} points)\n✨ All skills revoked\n💰 Wallet/level unchanged`,
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
            text: BOT_MARKER + `✅ *FORCE EVOLVE*\n\n👤 @${economy.getDisplayName(target)}\n🔄 ${oldName} → ${targetClass.icon} *${targetClass.name}*\n📝 ${targetClass.desc || ''}\n\n_All requirements bypassed. Stats/items unchanged._`,
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
            text: BOT_MARKER + `✅ *STAT POINTS GRANTED*\n\n👤 @${economy.getDisplayName(target)}\n💎 Stat Points: ${oldPoints} → *${oldPoints + amount}* (+${amount})`,
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
            text: BOT_MARKER + `✅ *ZENI GRANTED*\n\n👤 @${economy.getDisplayName(target)}\n💰 Wallet: ${oldWallet.toLocaleString()} → *${(oldWallet + amount).toLocaleString()}* (+${amount.toLocaleString()})`,
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
            text: BOT_MARKER + `✅ *RANK SET*\n\n👤 @${economy.getDisplayName(target)}\n🏆 Rank: ${oldRank} → *${rank}*`,
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
            text: BOT_MARKER + `✅ *UNSTUCK*\n\n👤 @${economy.getDisplayName(target)}\n🧹 Cleared ${cleared} combat state(s)\n_pendingActions cleared, combatProcessing reset_`,
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

    // ═══════════════════════════════════════════════════════════════════════
    // ── ENEMY EDITOR (Item #12 — deeper admin console integration) ─────────
    // ═══════════════════════════════════════════════════════════════════════
    // Lets GMs inspect and edit boss/enemy stats at runtime. Changes apply
    // to the in-memory BOSS_ENCOUNTERS registry (classEncounters.js), so
    // they take effect immediately for all subsequent encounters. They are
    // NOT persisted to MongoDB — a restart reverts them. This is by design:
    // the editor is for live-tuning and testing, not permanent overrides.
    // Permanent changes should go in the source file.
    //
    // Subcommands:
    //   admin enemy list [pool]            — list all bosses (or one pool)
    //   admin enemy info <bossId>          — show full boss stat block
    //   admin enemy setstat <bossId> <stat> <value> — edit one stat
    //   admin enemy sethp <bossId> <value> — shortcut for HP
    //   admin enemy setatk <bossId> <value> — shortcut for ATK
    //   admin enemy setxp <bossId> <value> — set XP reward
    //   admin enemy setgold <bossId> <min> <max> — set gold reward range
    //   admin enemy reset                  — reset all edits (reload from source)
    if (sub === 'enemy') {
        const classEncounters = require('../rpg/classEncounters');
        const enemySub = (args[1] || '').toLowerCase();
        const bossId = args[2]?.toUpperCase();
        const { BOSS_ENCOUNTERS } = classEncounters;

        // ── enemy list [pool] ──
        if (!enemySub || enemySub === 'list') {
            const poolFilter = (args[1] || '').toUpperCase();
            let msg = `👹 *BOSS REGISTRY*\n\n`;
            const pools = Object.keys(BOSS_ENCOUNTERS);
            for (const pool of pools) {
                if (poolFilter && pool !== poolFilter && poolFilter !== 'LIST') continue;
                msg += `━ *${pool}* (${BOSS_ENCOUNTERS[pool].length} bosses) ━\n`;
                for (const boss of BOSS_ENCOUNTERS[pool]) {
                    msg += `  • ${boss.icon} *${boss.name}* — \`${boss.id}\`\n`;
                    msg += `    ❤️ ${boss.stats.hp} | ⚔️ ${boss.stats.atk} | 🛡️ ${boss.stats.def}\n`;
                    msg += `    ⭐ XP ${boss.xpReward} | 💰 ${(boss.goldReward?.[0] || 0)}-${(boss.goldReward?.[1] || 0)}\n`;
                }
                msg += `\n`;
            }
            msg += `_Edit with: \`${prefix} admin enemy setstat <bossId> <stat> <value>\`_\n`;
            msg += `_Reset all edits: \`${prefix} admin enemy reset\`_`;
            return await sock.sendMessage(chatId, { text: BOT_MARKER + msg });
        }

        // ── enemy reset ──
        if (enemySub === 'reset') {
            // Force-reload the module from source
            try {
                delete require.cache[require.resolve('../rpg/classEncounters')];
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `✅ *ENEMY EDITS RESET*\n\nAll boss stats reloaded from source. Runtime edits discarded.` });
            } catch (e) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Reset failed: ${e.message}` });
            }
        }

        // ── enemy info <bossId> ──
        if (enemySub === 'info') {
            if (!bossId) return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${prefix} admin enemy info <bossId>\`` });
            let boss = null;
            for (const pool of Object.values(BOSS_ENCOUNTERS)) {
                const found = pool.find(b => b.id === bossId);
                if (found) { boss = found; break; }
            }
            if (!boss) return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Boss \`${bossId}\` not found. Use \`${prefix} admin enemy list\` to see IDs.` });
            let msg = `${boss.icon} *${boss.name}*\n🆔 \`${boss.id}\`\n\n`;
            msg += `📊 *Stats:*\n`;
            for (const [stat, val] of Object.entries(boss.stats)) {
                msg += `  • ${stat.toUpperCase()}: ${val}\n`;
            }
            msg += `\n⭐ XP: ${boss.xpReward}\n`;
            msg += `💰 Gold: ${(boss.goldReward?.[0] || 0)}-${(boss.goldReward?.[1] || 0)}\n`;
            msg += `🎯 Level Range: ${(boss.levelRange?.[0] || '?')}-${(boss.levelRange?.[1] || '?')}\n`;
            if (boss.skills) msg += `⚡ Skills: ${boss.skills.join(', ')}\n`;
            if (boss.phases) msg += `🎭 Phases: ${boss.phases.join(' → ')}\n`;
            msg += `\n_Edit: \`${prefix} admin enemy setstat ${boss.id} <stat> <value>\`_`;
            return await sock.sendMessage(chatId, { text: BOT_MARKER + msg });
        }

        // ── enemy setstat <bossId> <stat> <value> ──
        if (enemySub === 'setstat') {
            const statName = (args[3] || '').toLowerCase();
            const value = parseInt(args[4]);
            if (!bossId || !statName || isNaN(value)) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${prefix} admin enemy setstat <bossId> <hp|atk|def|mag|spd|luck|crit> <value>\`` });
            }
            let boss = null;
            for (const pool of Object.values(BOSS_ENCOUNTERS)) {
                const found = pool.find(b => b.id === bossId);
                if (found) { boss = found; break; }
            }
            if (!boss) return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Boss \`${bossId}\` not found.` });
            const validStats = ['hp', 'atk', 'def', 'mag', 'spd', 'luck', 'crit'];
            if (!validStats.includes(statName)) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Invalid stat. Valid: ${validStats.join(', ')}` });
            }
            const oldValue = boss.stats[statName] || 0;
            boss.stats[statName] = value;
            return await sock.sendMessage(chatId, {
                text: BOT_MARKER + `✅ *BOSS STAT UPDATED*\n\n${boss.icon} *${boss.name}*\n📊 ${statName.toUpperCase()}: ${oldValue} → *${value}*\n\n_Applies immediately to all new encounters. Use \`${prefix} admin enemy reset\` to revert._`
            });
        }

        // ── enemy sethp <bossId> <value> ── (shortcut)
        if (enemySub === 'sethp' || enemySub === 'setatk' || enemySub === 'setdef') {
            const statMap = { sethp: 'hp', setatk: 'atk', setdef: 'def' };
            const statName = statMap[enemySub];
            const value = parseInt(args[3]);
            if (!bossId || isNaN(value)) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${prefix} admin enemy ${enemySub} <bossId> <value>\`` });
            }
            let boss = null;
            for (const pool of Object.values(BOSS_ENCOUNTERS)) {
                const found = pool.find(b => b.id === bossId);
                if (found) { boss = found; break; }
            }
            if (!boss) return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Boss \`${bossId}\` not found.` });
            const oldValue = boss.stats[statName] || 0;
            boss.stats[statName] = value;
            return await sock.sendMessage(chatId, {
                text: BOT_MARKER + `✅ ${boss.icon} *${boss.name}*: ${statName.toUpperCase()} ${oldValue} → *${value}*`
            });
        }

        // ── enemy setxp <bossId> <value> ──
        if (enemySub === 'setxp') {
            const value = parseInt(args[3]);
            if (!bossId || isNaN(value)) return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${prefix} admin enemy setxp <bossId> <value>\`` });
            let boss = null;
            for (const pool of Object.values(BOSS_ENCOUNTERS)) {
                const found = pool.find(b => b.id === bossId);
                if (found) { boss = found; break; }
            }
            if (!boss) return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Boss \`${bossId}\` not found.` });
            const oldValue = boss.xpReward || 0;
            boss.xpReward = value;
            return await sock.sendMessage(chatId, {
                text: BOT_MARKER + `✅ ${boss.icon} *${boss.name}*: XP ${oldValue} → *${value}*`
            });
        }

        // ── enemy setgold <bossId> <min> <max> ──
        if (enemySub === 'setgold') {
            const min = parseInt(args[3]);
            const max = parseInt(args[4]);
            if (!bossId || isNaN(min) || isNaN(max)) return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${prefix} admin enemy setgold <bossId> <min> <max>\`` });
            let boss = null;
            for (const pool of Object.values(BOSS_ENCOUNTERS)) {
                const found = pool.find(b => b.id === bossId);
                if (found) { boss = found; break; }
            }
            if (!boss) return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Boss \`${bossId}\` not found.` });
            const oldGold = boss.goldReward || [0, 0];
            boss.goldReward = [min, max];
            return await sock.sendMessage(chatId, {
                text: BOT_MARKER + `✅ ${boss.icon} *${boss.name}*: Gold ${oldGold[0]}-${oldGold[1]} → *${min}-${max}*`
            });
        }

        return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Unknown enemy subcommand: \`${enemySub}\`\nUse \`${prefix} admin enemy list\` to see bosses.` });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ── ENEMY SKILL VIEWER/EDITOR ─────────────────────────────────────────
    // .g admin enemyskills [archetype]
    // .g admin enemyskill info <archetype> <skillId>
    // .g admin enemyskill setcost <archetype> <skillId> <value>
    // .g admin enemyskill setlevel <archetype> <skillId> <levelReq>
    // .g admin enemyskill setname <archetype> <skillId> <new name>
    // .g admin enemyskill reset
    // ═══════════════════════════════════════════════════════════════════════
    if (sub === 'enemyskills' || sub === 'enemyskill') {
        const monsterSkills = require('../rpg/monsterSkills');
        const { MONSTER_ARCHETYPES } = monsterSkills;

        // ── enemyskills [archetype] — list all skills ──
        if (sub === 'enemyskills') {
            const archFilter = (args[1] || '').toUpperCase();
            let msg = `👹 *ENEMY SKILL DATABASE*\n\n`;
            const archetypes = Object.entries(MONSTER_ARCHETYPES);
            for (const [archId, arch] of archetypes) {
                if (archFilter && archId !== archFilter) continue;
                const skillIds = Object.keys(arch.skills);
                msg += `━ *${archId}* (${arch.name}) — ${skillIds.length} skills ━\n`;
                for (const [sid, s] of Object.entries(arch.skills)) {
                    msg += `  • \`${sid}\` — ${s.name} [${s.type}, cost=${s.cost}, lvl=${s.levelReq}]\n`;
                }
                msg += `\n`;
            }
            msg += `_Edit: \`${prefix} admin enemyskill info <arch> <skillId>\`\n_`;
            msg += `_Reset: \`${prefix} admin enemyskill reset\`_`;
            return await sock.sendMessage(chatId, { text: BOT_MARKER + msg });
        }

        // ── enemyskill <subcommand> ──
        const skillSub = (args[1] || '').toLowerCase();
        const archetype = (args[2] || '').toUpperCase();
        const skillId = args[3]?.toLowerCase();
        const arch = MONSTER_ARCHETYPES[archetype];

        // ── enemyskill info <arch> <skillId> ──
        if (skillSub === 'info') {
            if (!archetype || !skillId) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${prefix} admin enemyskill info <archetype> <skillId>\`\n\nExample: \`${prefix} admin enemyskill info TANK harden\`` });
            }
            if (!arch) return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Archetype \`${archetype}\` not found. Use \`${prefix} admin enemyskills\` to see all.` });
            const skill = arch.skills[skillId];
            if (!skill) return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Skill \`${skillId}\` not found in ${archetype}.` });

            let msg = `⚡ *ENEMY SKILL INFO*\n\n`;
            msg += `📛 Name: ${skill.name}\n`;
            msg += `🆔 ID: \`${skill.id}\`\n`;
            msg += `📁 Archetype: ${archetype} (${arch.name})\n`;
            msg += `📊 Type: ${skill.type}\n`;
            msg += `💎 Mana Cost: ${skill.cost}\n`;
            msg += `📈 Level Req: ${skill.levelReq}\n`;
            msg += `📝 Message: _${skill.msg}_\n`;
            if (skill.cooldown) msg += `⏳ Cooldown: ${skill.cooldown}\n`;
            if (skill.nextSkill) msg += `🔗 Chains to: \`${skill.nextSkill}\`\n`;
            msg += `\n_Edit cost: \`${prefix} admin enemyskill setcost ${archetype} ${skillId} <value>\`\n_`;
            msg += `_Edit level req: \`${prefix} admin enemyskill setlevel ${archetype} ${skillId} <level>\`\n_`;
            msg += `_Edit name: \`${prefix} admin enemyskill setname ${archetype} ${skillId} <new name>\`_`;
            return await sock.sendMessage(chatId, { text: BOT_MARKER + msg });
        }

        // ── enemyskill setcost <arch> <skillId> <value> ──
        if (skillSub === 'setcost') {
            const value = parseInt(args[4]);
            if (!arch || !skillId || isNaN(value) || value < 0) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${prefix} admin enemyskill setcost <archetype> <skillId> <value>\`` });
            }
            const skill = arch.skills[skillId];
            if (!skill) return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Skill \`${skillId}\` not found in ${archetype}.` });
            const oldCost = skill.cost;
            skill.cost = value;
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `✅ ${archetype}.${skillId} (${skill.name}): cost ${oldCost} → *${value}*` });
        }

        // ── enemyskill setlevel <arch> <skillId> <level> ──
        if (skillSub === 'setlevel') {
            const value = parseInt(args[4]);
            if (!arch || !skillId || isNaN(value) || value < 1) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${prefix} admin enemyskill setlevel <archetype> <skillId> <level>\`` });
            }
            const skill = arch.skills[skillId];
            if (!skill) return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Skill \`${skillId}\` not found in ${archetype}.` });
            const oldLvl = skill.levelReq;
            skill.levelReq = value;
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `✅ ${archetype}.${skillId} (${skill.name}): level req ${oldLvl} → *${value}*` });
        }

        // ── enemyskill setname <arch> <skillId> <new name> ──
        if (skillSub === 'setname') {
            const newName = args.slice(4).join(' ');
            if (!arch || !skillId || !newName) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${prefix} admin enemyskill setname <archetype> <skillId> <new name>\`` });
            }
            const skill = arch.skills[skillId];
            if (!skill) return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Skill \`${skillId}\` not found in ${archetype}.` });
            const oldName = skill.name;
            skill.name = newName;
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `✅ ${archetype}.${skillId}: name "${oldName}" → *"${newName}"*` });
        }

        // ── enemyskill reset ──
        if (skillSub === 'reset') {
            try {
                delete require.cache[require.resolve('../rpg/monsterSkills')];
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `✅ *ENEMY SKILLS RESET*\n\nAll monster skill edits reloaded from source.` });
            } catch (e) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Reset failed: ${e.message}` });
            }
        }

        return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Unknown enemyskill subcommand. Use \`${prefix} admin enemyskills\` to list all.` });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ── SET SKILL POINTS (admin gives RPG skill points to any account) ───
    // ═══════════════════════════════════════════════════════════════════════
    if (sub === 'setskillpoints') {
        const { target, remaining } = parseAdminArgs(getMentionOrReply, m, senderJid, args.slice(1));
        const amount = parseInt(remaining[0]);
        if (!target || isNaN(amount) || amount < 0) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${prefix} admin setskillpoints <@user> <amount>\`\n\n_Sets RPG skill points (used to unlock abilities). Use \`givepoints\` for stat points._` });
        }
        const user = economy.getUser(target);
        if (!user) return await sock.sendMessage(chatId, { text: BOT_MARKER + '❌ User not found.' });
        const oldPoints = user.skillPoints || 0;
        user.skillPoints = amount;
        economy.saveUser(target);
        return await sock.sendMessage(chatId, {
            text: BOT_MARKER + `✅ *SKILL POINTS SET*\n\n👤 @${economy.getDisplayName(target)}\n💎 Skill Points: ${oldPoints} → *${amount}*\n\n_Use \`${prefix} skill tree\` to spend them on abilities._`,
            mentions: [target]
        });
    }

    // ── GIVE SKILL POINTS (admin adds RPG skill points) ───────────────────
    if (sub === 'giveskillpoints') {
        const { target, remaining } = parseAdminArgs(getMentionOrReply, m, senderJid, args.slice(1));
        const amount = parseInt(remaining[0]);
        if (!target || isNaN(amount) || amount <= 0) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${prefix} admin giveskillpoints <@user> <amount>\`` });
        }
        const user = economy.getUser(target);
        if (!user) return await sock.sendMessage(chatId, { text: BOT_MARKER + '❌ User not found.' });
        const oldPoints = user.skillPoints || 0;
        user.skillPoints = oldPoints + amount;
        economy.saveUser(target);
        return await sock.sendMessage(chatId, {
            text: BOT_MARKER + `✅ *SKILL POINTS GRANTED*\n\n👤 @${economy.getDisplayName(target)}\n💎 Skill Points: ${oldPoints} → *${oldPoints + amount}* (+${amount})`,
            mentions: [target]
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ── FIGHT ANY ENEMY (mod testing tool) ───────────────────────────────
    // .g admin fightenemy <bossId|enemyName>
    // Starts a solo trial fight against a specific boss. Used for testing
    // enemy stats after editing them with `admin enemy setstat`.
    // ═══════════════════════════════════════════════════════════════════════
    if (sub === 'fightenemy') {
        const query = args.slice(1).join(' ').trim();
        if (!query) {
            return await sock.sendMessage(chatId, {
                text: BOT_MARKER + `❌ Usage: \`${prefix} admin fightenemy <bossId|name>\`\n\nExample: \`${prefix} admin fightenemy LEVIATHAN\`\nExample: \`${prefix} admin fightenemy ancient_dragon_boss\`\n\n_Use \`${prefix} admin enemy list\` to see all boss IDs._`
            });
        }

        try {
            const classEncounters = require('../rpg/classEncounters');
            const guildAdventure = require('../rpg/guildAdventure');

            // Find the boss by ID or name
            let bossId = null;
            const { BOSS_ENCOUNTERS } = classEncounters;
            const allBosses = [];
            for (const pool of Object.values(BOSS_ENCOUNTERS)) {
                for (const b of pool) allBosses.push(b);
            }
            const queryUpper = query.toUpperCase().replace(/ /g, '_');
            for (const b of allBosses) {
                if (b.id && (b.id.toUpperCase() === queryUpper || b.id.toUpperCase() === query.toUpperCase())) {
                    bossId = b.id;
                    break;
                }
            }
            // Also check bossMechanics registry (lowercase IDs)
            if (!bossId) {
                try {
                    const bossMechanics = require('../rpg/bossMechanics');
                    if (bossMechanics.BOSS_REGISTRY) {
                        for (const key of Object.keys(bossMechanics.BOSS_REGISTRY)) {
                            if (key.toLowerCase() === query.toLowerCase() || key.toUpperCase() === queryUpper) {
                                bossId = key;
                                break;
                            }
                        }
                    }
                } catch (e) {}
            }

            if (!bossId) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Enemy "${query}" not found.\nUse \`${prefix} admin enemy list\` to see all boss IDs.` });
            }

            // Start a TRIAL-mode adventure with this boss
            const result = await guildAdventure.initAdventure(
                sock, chatId, null, 'TRIAL', true, null, senderJid, null,
                {
                    trialBoss: bossId,
                    targetClass: economy.getUserClass(senderJid)?.id || 'FIGHTER',
                    stoneId: 'evolution_stone',
                    cost: 0,
                }
            );

            if (result && result.msg) {
                await sock.sendMessage(chatId, { text: BOT_MARKER + result.msg });
            }
            return;
        } catch (e) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Failed to start fight: ${e.message}` });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ── ADMIN SANDBOX (Item #11 — isolated test character) ───────────────
    // ═══════════════════════════════════════════════════════════════════════
    // Each mod gets ONE sandbox test character stored in a separate MongoDB
    // collection (adminsandboxes). It has its own wallet, stats, class,
    // skills, inventory — fully isolated from real player data. Mods can
    // test combat/dungeons/evolutions/economy without risking real accounts.
    //
    // Subcommands:
    //   admin sandbox                     — show your sandbox status
    //   admin sandbox reset               — wipe sandbox to level-1 fresh state
    //   admin sandbox setlevel <1-100>    — set sandbox level (recalcs XP)
    //   admin sandbox setclass <name>     — set sandbox class (bypasses reqs)
    //   admin sandbox setrank <F-SSS>     — set sandbox adventurer rank
    //   admin sandbox setwallet <amount>  — set sandbox wallet
    //   admin sandbox givezeni <amount>   — add Zeni to sandbox wallet
    //   admin sandbox setstat <stat> <v>  — set a sandbox stat
    //   admin sandbox giveitem <item> [n] — add items to sandbox inventory
    //   admin sandbox giveskill <skill> [lvl] — grant a skill to sandbox
    if (sub === 'sandbox') {
        const AdminSandbox = require('../models/AdminSandbox');
        const senderName = m?.pushName || economy.getDisplayName(senderJid);
        const sandboxSub = (args[1] || '').toLowerCase();

        // ── sandbox on — activate sandbox mode ──
        if (sandboxSub === 'on') {
            try {
                const engine = require('../engine');
                const sb = await engine.enableSandbox(senderJid, senderName);
                return await sock.sendMessage(chatId, {
                    text: BOT_MARKER + `🧪 *SANDBOX MODE ON*\n\nYou are now using your sandbox test character.\n\n📊 Level: ${sb.progression?.level || 1}\n🏷️ Class: ${sb.class || 'FIGHTER'}\n💰 Wallet: ${(sb.wallet || 0).toLocaleString()} Zeni\n\n_All commands (.char, .bank, .solo, etc.) now use the sandbox account._\n_Use \`${prefix} admin sandbox off\` to return to your real account._`
                });
            } catch (e) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Failed to enable sandbox: ${e.message}` });
            }
        }

        // ── sandbox off — deactivate sandbox mode ──
        if (sandboxSub === 'off') {
            try {
                const engine = require('../engine');
                const result = await engine.disableSandbox(senderJid);
                if (result) {
                    return await sock.sendMessage(chatId, {
                        text: BOT_MARKER + `✅ *SANDBOX MODE OFF*\n\nYou are back on your real account. Sandbox data has been saved.\n\n_Use \`${prefix} admin sandbox on\` to test again, or \`${prefix} admin sandbox reset\` to wipe._`
                    });
                } else {
                    return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Sandbox mode is not currently active.` });
                }
            } catch (e) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Failed to disable sandbox: ${e.message}` });
            }
        }

        // ── sandbox status (no args) — show status ──
        if (!sandboxSub || sandboxSub === 'status') {
            try {
                const engine = require('../engine');
                const isActive = engine.getSandboxJid(senderJid) !== null;
                const sb = await AdminSandbox.getOrCreate(senderJid, senderName);
                let msg = `🧪 *SANDBOX TEST CHARACTER*\n\n`;
                msg += `🔄 Status: ${isActive ? '🟢 ACTIVE (commands use sandbox)' : '🔴 OFF (commands use real account)'}\n\n`;
                msg += `📛 Name: ${sb.name}\n`;
                msg += `📊 Level: ${sb.progression?.level || 1} | XP: ${(sb.progression?.xp || 0).toLocaleString()}\n`;
                msg += `🏷️ Class: ${sb.class || 'FIGHTER'} | Rank: ${sb.adventurerRank || 'F'}\n`;
                msg += `❤️ HP: ${sb.stats?.hp || 100}/${sb.stats?.maxHp || 100}\n`;
                msg += `💰 Wallet: ${(sb.wallet || 0).toLocaleString()} Zeni\n`;
                msg += `🏦 Bank: ${(sb.bank || 0).toLocaleString()} Zeni\n`;
                msg += `💎 Skill Points: ${sb.skillPoints || 0}\n`;
                msg += `🔄 Resets: ${sb.resetCount || 0}\n\n`;
                msg += `_Toggle: \`${prefix} admin sandbox on/off\`_\n`;
                msg += `_Save: \`${prefix} admin sandbox save\`_\n`;
                msg += `_Reset: \`${prefix} admin sandbox reset\`_`;
                return await sock.sendMessage(chatId, { text: BOT_MARKER + msg });
            } catch (e) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Failed to load sandbox: ${e.message}` });
            }
        }

        // ── sandbox save — save sandbox data to DB without turning off ──
        if (sandboxSub === 'save') {
            try {
                const engine = require('../engine');
                const sandboxJid = engine.getSandboxJid(senderJid);
                if (!sandboxJid) {
                    return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Sandbox mode is not active. Use \`${prefix} admin sandbox on\` first.` });
                }
                const economy = require('../rpg/economy');
                const sandboxUser = economy.economyData.get(sandboxJid);
                if (!sandboxUser) {
                    return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Sandbox user data not found in cache.` });
                }
                await AdminSandbox.patch(senderJid, {
                    wallet: sandboxUser.wallet,
                    bank: sandboxUser.bank,
                    class: sandboxUser.class,
                    adventurerRank: sandboxUser.adventurerRank,
                    spriteIndex: sandboxUser.spriteIndex,
                    stats: sandboxUser.stats,
                    statBonuses: sandboxUser.statBonuses,
                    skillPoints: sandboxUser.skillPoints,
                    skills: sandboxUser.skills,
                    completedTrials: sandboxUser.completedTrials,
                    evolutionHistory: sandboxUser.evolutionHistory,
                    evolvedAt: sandboxUser.evolvedAt,
                    inventory: sandboxUser.inventory,
                    equipment: sandboxUser.equipment,
                    progression: sandboxUser.progression,
                    questsCompleted: sandboxUser.questsCompleted,
                    questsWon: sandboxUser.questsWon,
                    questsFailed: sandboxUser.questsFailed,
                    bossesDefeated: sandboxUser.bossesDefeated,
                    dragonsKilled: sandboxUser.dragonsKilled,
                    pvpWins: sandboxUser.pvpWins,
                    pvpLosses: sandboxUser.pvpLosses,
                });
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `✅ *Sandbox data saved.* Your progress has been persisted to the database.` });
            } catch (e) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Save failed: ${e.message}` });
            }
        }

        // ── sandbox reset — wipe to fresh state ──
        if (sandboxSub === 'reset') {
            try {
                // If sandbox is currently active, disable first so data is saved
                const engine = require('../engine');
                const isActive = engine.getSandboxJid(senderJid) !== null;
                if (isActive) {
                    await engine.disableSandbox(senderJid);
                }
                // Ensure it exists first
                await AdminSandbox.getOrCreate(senderJid, senderName);
                const sb = await AdminSandbox.reset(senderJid);
                // If it was active, re-enable with fresh data
                if (isActive) {
                    await engine.enableSandbox(senderJid, senderName);
                }
                return await sock.sendMessage(chatId, {
                    text: BOT_MARKER + `🧹 *SANDBOX RESET*\n\nSandbox character wiped to fresh stacked state.\n\n📊 Level: 100\n💰 Wallet: 999,999,999 Zeni\n🏦 Bank: 999,999,999 Zeni\n🏷️ Class: WARLORD\n🏆 Rank: GOD\n\n_Reset count: ${sb.resetCount}_`
                });
            } catch (e) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Reset failed: ${e.message}` });
            }
        }

        // ── sandbox giveall — grant all enhancement stones + key items ──
        if (sandboxSub === 'giveall') {
            try {
                const engine = require('../engine');
                const sandboxJid = engine.getSandboxJid(senderJid);
                if (!sandboxJid) {
                    return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Sandbox mode is not active. Use \`${prefix} admin sandbox on\` first.` });
                }
                const economy = require('../rpg/economy');
                const inventorySystem = require('../rpg/inventorySystem');
                const lootSystem = require('../rpg/lootSystem');

                // Grant all enhancement stones
                const stones = ['minor_enhancement_stone', 'rare_enhancement_stone', 'legendary_enhancement_stone'];
                // Grant key items
                const keyItems = ['dragon_key', 'dragon_key_reusable', 'evolution_stone', 'ascension_stone', 'dragon_seal_ring'];
                // Grant all equipment from ITEM_DATABASE
                const allItems = { ...lootSystem.ITEM_DATABASE };
                const equipItems = Object.entries(allItems).filter(([id, item]) => item.type === 'EQUIPMENT');

                let granted = 0;
                for (const stone of stones) {
                    await inventorySystem.addItem(sandboxJid, stone, 99, { source: 'sandbox_giveall' });
                    granted += 99;
                }
                for (const item of keyItems) {
                    await inventorySystem.addItem(sandboxJid, item, 99, { source: 'sandbox_giveall' });
                    granted += 99;
                }
                for (const [itemId, itemData] of equipItems) {
                    await inventorySystem.addItem(sandboxJid, itemId, 1, { source: 'sandbox_giveall' });
                    granted++;
                }

                return await sock.sendMessage(chatId, {
                    text: BOT_MARKER + `🎁 *SANDBOX GIVEALL*\n\nGranted ${granted} items to sandbox:\n• 99× each enhancement stone\n• 99× dragon keys + seal ring\n• 99× evolution/ascension stones\n• 1× every equipment in the database\n\n_Use \`${prefix} inventory\` to see them._`
                });
            } catch (e) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Giveall failed: ${e.message}` });
            }
        }

        // ── sandbox evolve — switch to any class without trial/stones/Zeni ──
        if (sandboxSub === 'evolve') {
            try {
                const engine = require('../engine');
                const sandboxJid = engine.getSandboxJid(senderJid);
                if (!sandboxJid) {
                    return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Sandbox mode is not active. Use \`${prefix} admin sandbox on\` first.` });
                }
                const className = args.slice(2).join(' ').trim();
                if (!className) {
                    const classSystem = require('../rpg/classSystem');
                    const all = classSystem.getAllClasses();
                    const classList = Object.values(all)
                        .filter(c => c.tier !== 'STARTER')
                        .map(c => `${c.icon} ${c.name} (\`${c.id}\`)`)
                        .join('\n');
                    return await sock.sendMessage(chatId, {
                        text: BOT_MARKER + `🧬 *SANDBOX EVOLVE*\n\nUsage: \`${prefix} admin sandbox evolve <class name or ID>\`\n\n*Available Classes:*\n${classList}`
                    });
                }
                const targetClass = resolveClass(className);
                if (!targetClass) {
                    return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Class "${className}" not found.` });
                }
                const economy = require('../rpg/economy');
                const user = economy.getUser(sandboxJid);
                if (!user) return await sock.sendMessage(chatId, { text: BOT_MARKER + '❌ Sandbox user not found.' });
                const oldClassName = user.class || 'None';
                user.class = targetClass.id;
                // Also unlock all skills for the new class
                try {
                    const skillTree = require('../rpg/skillTree');
                    const SK = skillTree.SKILL_TREES || skillTree;
                    const tree = SK[targetClass.id.toUpperCase()];
                    if (tree && tree.trees) {
                        if (!user.skills) user.skills = {};
                        for (const [, treeData] of Object.entries(tree.trees)) {
                            if (!treeData.skills) continue;
                            for (const [skillId, skill] of Object.entries(treeData.skills)) {
                                user.skills[skillId] = skill.maxLevel || 1;
                            }
                        }
                    }
                } catch (e) {}
                return await sock.sendMessage(chatId, {
                    text: BOT_MARKER + `🧬 *SANDBOX EVOLVED*\n\n🔄 ${oldClassName} → ${targetClass.icon} *${targetClass.name}*\n✨ All class skills unlocked at max level!\n\n_No trials, stones, or Zeni required in sandbox._`
                });
            } catch (e) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Evolve failed: ${e.message}` });
            }
        }

        // ── sandbox maxstats — set all stats to max ──
        if (sandboxSub === 'maxstats') {
            try {
                const engine = require('../engine');
                const sandboxJid = engine.getSandboxJid(senderJid);
                if (!sandboxJid) {
                    return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Sandbox mode is not active.` });
                }
                const economy = require('../rpg/economy');
                const user = economy.getUser(sandboxJid);
                if (!user) return await sock.sendMessage(chatId, { text: BOT_MARKER + '❌ Sandbox user not found.' });
                user.statBonuses = { hp: 99999, atk: 9999, def: 9999, mag: 9999, spd: 9999, luck: 9999, crit: 999 };
                user.stats.maxHp = 99999;
                user.stats.hp = 99999;
                return await sock.sendMessage(chatId, {
                    text: BOT_MARKER + `💪 *SANDBOX MAX STATS*\n\nAll stats set to maximum for testing.\n❤️ HP: 99999\n⚔️ ATK: 9999\n🛡️ DEF: 9999\n🔮 MAG: 9999\n💨 SPD: 9999\n🍀 LUCK: 9999\n💥 CRIT: 999`
                });
            } catch (e) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Failed: ${e.message}` });
            }
        }

        // ── sandbox setlevel <1-100> ──
        if (sandboxSub === 'setlevel') {
            const level = parseInt(args[2]);
            if (!level || level < 1 || level > 100) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${prefix} admin sandbox setlevel <1-100>\`` });
            }
            try {
                await AdminSandbox.getOrCreate(senderJid, senderName);
                const progression = require('../rpg/progression');
                const xpForLevel = progression.getXPForLevel(level);
                const sb = await AdminSandbox.patch(senderJid, {
                    'progression.level': level,
                    'progression.xp': xpForLevel,
                    'progression.statPoints': (level - 1) * 2,
                    'stats.level': level,
                    'stats.xp': xpForLevel,
                    'stats.maxHp': 100 + (level - 1) * 15,
                    'stats.hp': 100 + (level - 1) * 15,
                });
                return await sock.sendMessage(chatId, {
                    text: BOT_MARKER + `✅ *SANDBOX LEVEL SET*\n\n📊 Level: ${level}\n⚡ XP: ${xpForLevel.toLocaleString()}\n💎 Stat Points: ${(level - 1) * 2}\n❤️ Max HP: ${100 + (level - 1) * 15}`
                });
            } catch (e) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Failed: ${e.message}` });
            }
        }

        // ── sandbox setclass <name> ──
        if (sandboxSub === 'setclass') {
            const className = args[2];
            if (!className) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${prefix} admin sandbox setclass <class name or ID>\`` });
            }
            const cls = resolveClass(className);
            if (!cls) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Class "${className}" not found.` });
            }
            try {
                await AdminSandbox.getOrCreate(senderJid, senderName);
                const sb = await AdminSandbox.patch(senderJid, {
                    class: cls.id,
                    'stats.maxHp': cls.stats?.hp || 100,
                    'stats.hp': cls.stats?.hp || 100,
                });
                return await sock.sendMessage(chatId, {
                    text: BOT_MARKER + `✅ *SANDBOX CLASS SET*\n\n${cls.icon} *${cls.name}*\n🆔 \`${cls.id}\`\n📊 Tier: ${cls.tier || 'STARTER'}\n\n_Sandbox now has this class for testing. No requirements were checked._`
                });
            } catch (e) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Failed: ${e.message}` });
            }
        }

        // ── sandbox setrank <F-SSS|GOD> ──
        if (sandboxSub === 'setrank') {
            const rank = (args[2] || '').toUpperCase();
            const validRanks = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS', 'GOD'];
            if (!validRanks.includes(rank)) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Invalid rank. Valid: ${validRanks.join(', ')}` });
            }
            try {
                await AdminSandbox.getOrCreate(senderJid, senderName);
                await AdminSandbox.patch(senderJid, { adventurerRank: rank });
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `✅ Sandbox rank set to *${rank}*` });
            } catch (e) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Failed: ${e.message}` });
            }
        }

        // ── sandbox setwallet <amount> ──
        if (sandboxSub === 'setwallet') {
            const amount = parseInt(args[2]);
            if (isNaN(amount) || amount < 0) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${prefix} admin sandbox setwallet <amount>\`` });
            }
            try {
                await AdminSandbox.getOrCreate(senderJid, senderName);
                await AdminSandbox.patch(senderJid, { wallet: amount });
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `✅ Sandbox wallet set to *${amount.toLocaleString()}* Zeni` });
            } catch (e) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Failed: ${e.message}` });
            }
        }

        // ── sandbox givezeni <amount> ──
        if (sandboxSub === 'givezeni') {
            const amount = parseInt(args[2]);
            if (isNaN(amount) || amount <= 0) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${prefix} admin sandbox givezeni <amount>\`` });
            }
            try {
                const sb = await AdminSandbox.getOrCreate(senderJid, senderName);
                const newWallet = (sb.wallet || 0) + amount;
                await AdminSandbox.patch(senderJid, { wallet: newWallet });
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `✅ Added *${amount.toLocaleString()}* Zeni to sandbox wallet.\n💰 New wallet: ${newWallet.toLocaleString()}` });
            } catch (e) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Failed: ${e.message}` });
            }
        }

        // ── sandbox setstat <stat> <value> ──
        if (sandboxSub === 'setstat') {
            const statName = (args[2] || '').toLowerCase();
            const value = parseInt(args[3]);
            const validStats = ['hp', 'atk', 'def', 'mag', 'spd', 'luck', 'crit'];
            if (!validStats.includes(statName) || isNaN(value)) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${prefix} admin sandbox setstat <${validStats.join('|')}> <value>\`` });
            }
            try {
                await AdminSandbox.getOrCreate(senderJid, senderName);
                // Use Mongoose nested-path update
                const update = {};
                update[`statBonuses.${statName}`] = value;
                if (statName === 'hp') {
                    update['stats.maxHp'] = 100 + value;
                    update['stats.hp'] = 100 + value;
                }
                await AdminSandbox.patch(senderJid, update);
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `✅ Sandbox ${statName.toUpperCase()} set to *${value}*` });
            } catch (e) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Failed: ${e.message}` });
            }
        }

        // ── sandbox giveitem <item> [qty] ──
        if (sandboxSub === 'giveitem') {
            const itemName = args[2];
            const qty = parseInt(args[3]) || 1;
            if (!itemName) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${prefix} admin sandbox giveitem <item_name> [qty]\`` });
            }
            const item = resolveItem(itemName);
            if (!item) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Item "${itemName}" not found.` });
            }
            try {
                const sb = await AdminSandbox.getOrCreate(senderJid, senderName);
                const inventory = sb.inventory || {};
                const existing = inventory[item.id] || { id: item.id, name: item.name, qty: 0, rarity: item.rarity || 'COMMON' };
                existing.qty = (existing.qty || 0) + qty;
                inventory[item.id] = existing;
                await AdminSandbox.patch(senderJid, { inventory });
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `✅ Added *${qty}× ${item.name}* to sandbox inventory.\n🎒 ${Object.keys(inventory).length}/${sb.inventorySlots || 50} slots used` });
            } catch (e) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Failed: ${e.message}` });
            }
        }

        // ── sandbox giveskill <skill> [level] ──
        if (sandboxSub === 'giveskill') {
            const skillName = args[2];
            const skillLvl = parseInt(args[3]) || 1;
            if (!skillName) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${prefix} admin sandbox giveskill <skill_name> [level]\`` });
            }
            const skill = resolveSkill(skillName);
            if (!skill) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Skill "${skillName}" not found.` });
            }
            try {
                const sb = await AdminSandbox.getOrCreate(senderJid, senderName);
                const skills = sb.skills || {};
                skills[skill.id] = skillLvl;
                await AdminSandbox.patch(senderJid, { skills });
                return await sock.sendMessage(chatId, {
                    text: BOT_MARKER + `✅ *SANDBOX SKILL GRANTED*\n\n${skill.icon || '✨'} *${skill.name}*\n🆔 \`${skill.id}\`\n📊 Level: ${skillLvl}\n📋 Class: ${skill.classId || 'unknown'}\n\n_Sandbox now has this skill for testing. No requirements were checked._`
                });
            } catch (e) {
                return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Failed: ${e.message}` });
            }
        }

        return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Unknown sandbox subcommand: \`${sandboxSub}\`\nUse \`${prefix} admin sandbox\` to see status.` });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ── SANDBOX GODMODE — combat cheats for testing ──────────────────────
    // .g admin godmode [on|off]
    // When on: sandbox user deals 99999 damage per hit and takes 0 damage.
    // Implemented via a global flag that calculateDamage() checks.
    // ═══════════════════════════════════════════════════════════════════════
    if (sub === 'godmode') {
        const engine = require('../engine');
        const godSub = (args[1] || '').toLowerCase();
        const sandboxJid = engine.getSandboxJid(senderJid);

        if (godSub === 'on') {
            if (!sandboxJid) return await sock.sendMessage(chatId, { text: BOT_MARKER + '❌ Enable sandbox mode first: `' + prefix + ' admin sandbox on`' });
            if (!global.godModeUsers) global.godModeUsers = new Set();
            global.godModeUsers.add(sandboxJid);
            return await sock.sendMessage(chatId, { text: BOT_MARKER + '⚡ *GODMODE ON*\n\nSandbox user now deals 99999 damage per hit and takes 0 damage.\n\n_Use `' + prefix + ' admin godmode off` to disable._' });
        }
        if (godSub === 'off') {
            if (global.godModeUsers) global.godModeUsers.delete(sandboxJid || senderJid);
            return await sock.sendMessage(chatId, { text: BOT_MARKER + '⚡ *GODMODE OFF*\n\nCombat damage normalized.' });
        }
        const isActive = global.godModeUsers && global.godModeUsers.has(sandboxJid || senderJid);
        return await sock.sendMessage(chatId, { text: BOT_MARKER + `⚡ *GODMODE: ${isActive ? '🟢 ON' : '🔴 OFF'}*\n\n_Toggle: \`${prefix} admin godmode on/off\`_` });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ── SANDBOX GIVESKILLSALL — unlock ALL skills from ALL classes ───────
    // .g admin sandbox giveskillsall
    // ═══════════════════════════════════════════════════════════════════════
    if (sub === 'sandbox' && (args[1] || '').toLowerCase() === 'giveskillsall') {
        try {
            const engine = require('../engine');
            const sandboxJid = engine.getSandboxJid(senderJid);
            if (!sandboxJid) return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Sandbox mode is not active.` });
            const economy = require('../rpg/economy');
            const skillTree = require('../rpg/skillTree');
            const SK = skillTree.SKILL_TREES || skillTree;
            const user = economy.getUser(sandboxJid);
            if (!user) return await sock.sendMessage(chatId, { text: BOT_MARKER + '❌ Sandbox user not found.' });
            if (!user.skills) user.skills = {};
            let count = 0;
            for (const [classId, tree] of Object.entries(SK)) {
                if (!tree.trees) continue;
                for (const [, treeData] of Object.entries(tree.trees)) {
                    if (!treeData.skills) continue;
                    for (const [skillId, skill] of Object.entries(treeData.skills)) {
                        user.skills[skillId] = skill.maxLevel || 1;
                        count++;
                    }
                }
            }
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `🔮 *ALL SKILLS UNLOCKED*\n\nGranted ${count} skills from all classes at max level.\n\n_Note: skills outside your current class lineage won't be usable in combat, but are saved for testing._` });
        } catch (e) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Failed: ${e.message}` });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ── SANDBOX CLEARINV — clear sandbox inventory ───────────────────────
    // ═══════════════════════════════════════════════════════════════════════
    if (sub === 'sandbox' && (args[1] || '').toLowerCase() === 'clearinv') {
        try {
            const engine = require('../engine');
            const sandboxJid = engine.getSandboxJid(senderJid);
            if (!sandboxJid) return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Sandbox mode is not active.` });
            const economy = require('../rpg/economy');
            const user = economy.getUser(sandboxJid);
            if (!user) return await sock.sendMessage(chatId, { text: BOT_MARKER + '❌ Sandbox user not found.' });
            user.inventory = {};
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `🧹 *Sandbox inventory cleared.*` });
        } catch (e) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Failed: ${e.message}` });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ── SANDBOX UNEQUIPALL — unequip all equipment ───────────────────────
    // ═══════════════════════════════════════════════════════════════════════
    if (sub === 'sandbox' && (args[1] || '').toLowerCase() === 'unequipall') {
        try {
            const engine = require('../engine');
            const sandboxJid = engine.getSandboxJid(senderJid);
            if (!sandboxJid) return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Sandbox mode is not active.` });
            const economy = require('../rpg/economy');
            const user = economy.getUser(sandboxJid);
            if (!user) return await sock.sendMessage(chatId, { text: BOT_MARKER + '❌ Sandbox user not found.' });
            user.equipment = {};
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `🛡️ *All sandbox equipment unequipped.*` });
        } catch (e) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Failed: ${e.message}` });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ── SANDBOX FIGHTBOSS — instantly fight any boss (shortcut) ──────────
    // .g admin sandbox fightboss <bossId>
    // ═══════════════════════════════════════════════════════════════════════
    if (sub === 'sandbox' && (args[1] || '').toLowerCase() === 'fightboss') {
        const bossQuery = args.slice(2).join(' ').trim();
        if (!bossQuery) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${prefix} admin sandbox fightboss <bossId|name>\`\n\nExample: \`${prefix} admin sandbox fightboss LEVIATHAN\`` });
        }
        // Delegate to the existing fightenemy command
        args[1] = 'fightenemy';
        args[2] = bossQuery;
        sub = 'fightenemy';
    }

    // Re-check if we redirected to fightenemy from sandbox fightboss
    if (sub === 'fightenemy') {
        // Fall through to the existing fightenemy handler above by re-checking
        // Actually, the fightenemy handler is earlier in the function. We need
        // to NOT fall through to unknown subcommand. Just return a redirect message.
        return await sock.sendMessage(chatId, { text: BOT_MARKER + `💡 Use \`${prefix} admin fightenemy ${args[2] || '<bossId>'}\` to fight a boss.\n\n_Or enable sandbox first with \`${prefix} admin sandbox on\` then use \`${prefix} solo\` to test combat._` });
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
