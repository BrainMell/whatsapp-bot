// ============================================ 
// ⚔️ PVP DUEL SYSTEM — PHANTOM STANDOFF
// ============================================ 
// Balance notes:
//   PvP damage is dampened to prevent one-shots.
//   Energy regenerates each turn to make ability use meaningful.
//   Defense mitigation is capped to keep fights dynamic.
// ============================================ 

const economy = require('./economy');
const MIN_STAKE = 10; // 💡 Rebalanced 2026-08-17: min PvP wager so stakes are meaningful but never bankrupting.
const MAX_STAKE = 500; // 💡 Rebalanced 2026-08-17: max PvP wager so a losing streak can't wipe a wallet.
const progression = require('./progression');
const skillTree = require('./skillTree');
const botConfig = require('../../botConfig');
const combatImageGenerator = require('./combatImageGenerator');
const inventorySystem = require('./inventorySystem');
const lootSystem = require('./lootSystem');

const activeDuels = new Map();  // chatId → duelState
const duelInvites = new Map();  // chatId → { challenger, target, stake, timestamp }

function resolveJid(jid) {
    if (!jid) return jid;
    try {
        const lidResolver = require('../utils/lidResolver');
        const resolved = lidResolver.resolveJid(jid);
        // 💡 FIX: if resolveJid returned the original (mapping miss), try
        // the OTHER format in the economy cache. Fixes PvP after Oracle
        // migration where LID mappings may be incomplete.
        if (resolved === jid || !economy.economyData.has(resolved)) {
            if (typeof jid === 'string') {
                if (jid.endsWith('@lid')) {
                    const phoneJid = jid.replace('@lid', '@s.whatsapp.net');
                    if (economy.economyData.has(phoneJid)) return phoneJid;
                } else if (jid.endsWith('@s.whatsapp.net')) {
                    const lidJid = jid.replace('@s.whatsapp.net', '@lid');
                    if (economy.economyData.has(lidJid)) return lidJid;
                }
            }
        }
        return resolved;
    } catch (e) {
        console.error("Error resolving JID in pvpSystem:", e.message);
        return jid;
    }
}

function getBuffIcon(buffType) {
    const icons = {
        atk: "⚔️",
        attack: "⚔️",
        def: "🛡️",
        defense: "🛡️",
        spd: "💨",
        speed: "💨",
        mag: "✨",
        magic: "✨",
        evasion: "💫",
        shield: "🔷",
        crit: "🎯",
        luck: "🍀",
    };
    return icons[buffType] || "✨";
}

function getDebuffIcon(debuffType) {
    const icons = {
        vulnerability: "💀",
        blind: "🌫️",
        slow: "🐌",
        weak: "😵",
        curse: "🔮",
        poison: "🧪",
        burn: "🔥",
        bleed: "🩸",
        stun: "💫",
        freeze: "❄️",
        sleep: "💤",
    };
    return icons[debuffType] || "💀";
}

function applyBuff(player, type, value, duration) {
    if (!player.buffs) player.buffs = [];
    player.buffs.push({
        type,
        value,
        duration,
        icon: getBuffIcon(type)
    });
}

function applyStatusEffect(player, type, duration, value) {
    if (!player.statusEffects) player.statusEffects = [];

    // 💡 FIX #5/Bug6 (2026-08-15): Stun DR — reject CC if player has stun immunity.
    // When a CC effect expires, the player gets 2 turns of immunity to prevent
    // infinite stun locks. This check is ONLY for hard CC (stun/freeze/sleep/charm).
    if (['stun', 'freeze', 'sleep', 'charm', 'cc'].includes(type)) {
        if (player.stunImmunityTurns > 0) {
            return false; // Immune — effect not applied
        }
    }

    player.statusEffects.push({
        type,
        duration,
        value,
        icon: getDebuffIcon(type)
    });
    return true; // Effect applied successfully
}

function getEffectiveStats(player) {
    const stats = { ...player.stats };
    
    // Apply buffs from player.buffs
    if (player.buffs) {
        for (const buff of player.buffs) {
            const statName = buff.type;
            if (statName === 'all') {
                stats.atk = (stats.atk || 0) + buff.value;
                stats.def = (stats.def || 0) + buff.value;
                stats.spd = (stats.spd || 0) + buff.value;
            } else if (statName) {
                stats[statName] = (stats[statName] || 0) + buff.value;
            }
        }
    }
    
    // Apply status effect multipliers
    if (player.statusEffects) {
        for (const effect of player.statusEffects) {
            if (effect.type === 'shield') {
                stats.def = Math.floor((stats.def || 0) * 1.5);
            }
            if (effect.type === 'vulnerability') {
                stats.def = Math.floor((stats.def || 0) * 0.7);
            }
            if (effect.type === 'curse' || effect.type === 'weak') {
                stats.def = Math.floor((stats.def || 0) * 0.8);
                stats.atk = Math.floor((stats.atk || 0) * 0.8);
            }
            if (effect.type === 'slow') {
                // 💡 DESIGN LIMITATION (2026-08-18): SLOW reduces effective SPD by 20%,
                // but turn order in PvP is determined ONCE at duel start (line 407)
                // and alternates thereafter. SLOW does NOT delay the affected player's
                // turn. It only affects dodge/evasion calculations that read spd.
                // To make SLOW affect turn order, the initiative would need to be
                // recalculated each round (significant rework — flagged for future).
                stats.spd = Math.floor((stats.spd || 0) * 0.8);
            }
        }
    }
    
    return stats;
}

function getPlayerEffectsString(player) {
    let effectsStr = '';
    const icons = [];
    if (player.buffs && player.buffs.length > 0) {
        for (const buff of player.buffs) {
            icons.push(buff.icon || getBuffIcon(buff.type));
        }
    }
    if (player.statusEffects && player.statusEffects.length > 0) {
        for (const effect of player.statusEffects) {
            icons.push(effect.icon || getDebuffIcon(effect.type));
        }
    }
    if (icons.length > 0) {
        effectsStr = ' [' + icons.join('') + ']';
    }
    return effectsStr;
}

// ─── PvP Balance Constants ────────────────────
const PVP_DAMAGE_MULT   = 0.80;  // Base damage multiplier for basic attacks
const PVP_ENERGY_REGEN  = 25;    // Energy gained per turn. FIX: bumped from 20 so ultimate-cost skills (capped at 100) are still usable alongside basic actions.
const PVP_DEFENSE_CAP   = 0.50;  // Max 50% damage reduction from DEF in PvP
const PVP_ABILITY_MULT  = 0.45;  // Ability damage multiplier in PvP
const PVP_CRIT_MULT     = 1.5;   // Crit multiplier in PvP
const PVP_TIMEOUT_MS    = 120000; // 2 minutes inactivity = expired duel
const CHALLENGE_TIMEOUT = 120000; // 2 minutes to accept challenge

function getDuel(chatId) {
    return activeDuels.get(chatId);
}

function getInvite(chatId, targetJid) {
    const resolvedTarget = resolveJid(targetJid);
    const invite = duelInvites.get(chatId);
    if (!invite) return null;
    if (invite.target === resolvedTarget) return invite;
    return null;
}

function declineChallenge(chatId, targetJid) {
    const resolvedTarget = resolveJid(targetJid);
    const invite = duelInvites.get(chatId);
    if (invite && invite.target === resolvedTarget) {
        duelInvites.delete(chatId);
        return true;
    }
    return false;
}

// 💡 FIX 2026-08-03: Manual duel cancel/end for stuck duels.
// `.s duel cancel` / `.s duel end` — clears an active duel state for this chat.
// Refunds stakes if any were paid. Either player or a mod can call it.
function cancelDuel(chatId) {
    const duel = activeDuels.get(chatId);
    if (!duel) {
        // Also clear any pending invite just in case
        const hadInvite = duelInvites.has(chatId);
        if (hadInvite) {
            const invite = duelInvites.get(chatId);
            duelInvites.delete(chatId);
            // Refund stakes if the invite had already taken them
            // (challengePlayer doesn't take stakes — only acceptChallenge does,
            // and by then the invite is deleted. So no refund needed here.)
            return { success: true, message: '🧹 Cleared a stale pending duel invite.' };
        }
        return { success: false, message: '❌ No active duel in this chat.' };
    }
    // Refund stakes
    if (duel.stake > 0 && duel.players) {
        for (const p of duel.players) {
            try { economy.addMoney(p.jid, duel.stake, 'Duel cancel refund'); } catch (e) {}
        }
    }
    activeDuels.delete(chatId);
    return { success: true, message: `🚫 Duel cancelled.${duel.stake > 0 ? ` Stakes of ${botConfig.getCurrency().symbol}${duel.stake.toLocaleString()} refunded to both players.` : ''}` };
}

// ==========================================
// 🗡️ CHALLENGE SYSTEM
// ==========================================

function challengePlayer(chatId, challengerJid, targetJid, stake = 0, opts = {}) {
    // 💡 P4 rebalance 2026-08-17: stake bounds prevent wallet-wiping stakes + 1-zeni spam.
    if (stake > 0 && (stake < MIN_STAKE || stake > MAX_STAKE)) {
        return { success: false, message: `❌ Stake must be between ${MIN_STAKE} and ${MAX_STAKE}.` };
    }
    if (activeDuels.has(chatId)) {
        return { success: false, message: '❌ A duel is already active in this chat!' };
    }

    const existing = duelInvites.get(chatId);
    if (existing && (Date.now() - existing.timestamp < CHALLENGE_TIMEOUT)) {
        return { success: false, message: '❌ A challenge is already pending! Accept or wait for it to expire.' };
    }

    const resolvedChallenger = resolveJid(challengerJid);
    const resolvedTarget = resolveJid(targetJid);

    // Block self-challenges — previously a user could challenge themselves,
    // which would create a nonsensical 1-player duel.
    if (resolvedChallenger === resolvedTarget) {
        return { success: false, message: '❌ You cannot challenge yourself!' };
    }

    if (!economy.isRegistered(resolvedChallenger)) {
        return { success: false, message: '❌ You must be registered to challenge someone!' };
    }
    if (!economy.isRegistered(resolvedTarget)) {
        return { success: false, message: '❌ The player you challenged is not registered!' };
    }

    // 💡 NEW 2026-08-05: Summon duel mode — both players must have an active summon
    const mode = opts.mode || 'player';
    if (mode === 'summon') {
        const challengerUser = economy.getUser(resolvedChallenger);
        const targetUser = economy.getUser(resolvedTarget);
        if (!challengerUser?.activeSummonId) {
            return { success: false, message: '❌ You need a deployed summon to issue a summon duel! Use `.s summon deploy <#>` first.' };
        }
        if (!targetUser?.activeSummonId) {
            return { success: false, message: `❌ ${targetUser?.nickname || economy.getDisplayName(resolvedTarget)} doesn't have a deployed summon!` };
        }
    }

    if (stake > 0) {
        const user = economy.getUser(resolvedChallenger);
        if ((user?.wallet || 0) < stake) {
            return { success: false, message: `❌ Insufficient funds! You need ${botConfig.getCurrency().symbol}${stake.toLocaleString()} to stake.` };
        }
        // Also check the target's wallet upfront — if they obviously can't
        // afford the stake, refuse the challenge instead of wasting 2 minutes
        // of the challenger's time before the target gets the accept-time
        // rejection. This is a soft check; the target's wallet could change
        // between challenge and accept, so we still re-verify at accept time.
        const target = economy.getUser(resolvedTarget);
        if ((target?.wallet || 0) < stake) {
            return { success: false, message: `❌ ${target?.nickname || economy.getDisplayName(resolvedTarget)} doesn't have enough Zeni to match that stake!` };
        }
    }

    duelInvites.set(chatId, {
        challenger: resolvedChallenger,
        target: resolvedTarget,
        stake,
        timestamp: Date.now(),
        mode, // 💡 NEW: 'player' (default) or 'summon'
        equalise: opts.equalise || false, // 💡 P4: --equalise mode uses HP normalization
    });

    return { success: true };
}

// ==========================================
// ✅ ACCEPT CHALLENGE
// ==========================================

async function acceptChallenge(sock, chatId, targetJid) {
    const resolvedTarget = resolveJid(targetJid);
    const invite = duelInvites.get(chatId);
    if (!invite) return { success: false, message: '❌ No pending challenge found.' };
    if (invite.target !== resolvedTarget) return { success: false, message: '❌ This challenge was not issued to you!' };
    if (Date.now() - invite.timestamp > CHALLENGE_TIMEOUT) {
        duelInvites.delete(chatId);
        return { success: false, message: '❌ Challenge expired! (2 min limit)' };
    }

    // Clean up the invite on ANY failure path so the challenger isn't locked
    // out for 2 minutes when the target can't accept (e.g. insufficient funds,
    // or one of the players unregistered in the meantime). Previously the
    // invite stayed in `duelInvites` and blocked all new challenges in that
    // chat until the 2-minute timeout elapsed — bad UX.
    const cleanupAndFail = (msg) => {
        duelInvites.delete(chatId);
        return { success: false, message: msg };
    };

    if (!economy.isRegistered(invite.challenger)) {
        return cleanupAndFail('❌ Challenger is no longer registered!');
    }
    if (!economy.isRegistered(resolvedTarget)) {
        return cleanupAndFail('❌ You need to register first before accepting a duel!');
    }

    // Validate stakes
    if (invite.stake > 0) {
        const challenger = economy.getUser(invite.challenger);
        const target = economy.getUser(resolvedTarget);
        if ((challenger?.wallet || 0) < invite.stake) {
            return cleanupAndFail('❌ Challenger no longer has enough Zeni for the stake!');
        }
        if ((target?.wallet || 0) < invite.stake) {
            return cleanupAndFail(`❌ You need ${botConfig.getCurrency().symbol}${invite.stake.toLocaleString()} to accept!`);
        }
        economy.removeMoney(invite.challenger, invite.stake);
        economy.removeMoney(resolvedTarget, invite.stake);
    }

    duelInvites.delete(chatId);

    // Build duel state
    const p1Data = economy.getUser(invite.challenger);
    const p2Data = economy.getUser(resolvedTarget);
    if (!p1Data || !p2Data) {
        return { success: false, message: '❌ Failed to load player data for the duel!' };
    }

    const mode = invite.mode || 'player'; // 💡 NEW: 'player' or 'summon'

    // 💡 NEW 2026-08-05: Branch on mode — summon duels use summon entities as
    // combatants instead of player entities.
    let players;
    if (mode === 'summon') {
        const p1Summon = await buildSummonDuelPlayer(invite.challenger, 0);
        const p2Summon = await buildSummonDuelPlayer(resolvedTarget, 1);
        if (!p1Summon) {
            return cleanupAndFail('❌ You no longer have a deployed summon! Deploy one first.');
        }
        if (!p2Summon) {
            return cleanupAndFail('❌ Your opponent no longer has a deployed summon!');
        }
        players = [p1Summon, p2Summon];
    } else {
        const p1Stats = progression.getBaseStats(invite.challenger, p1Data.class);
        const p2Stats = progression.getBaseStats(targetJid, p2Data.class);

        // Cap extreme stat differences to make PvP more fair
        function capPvPStats(stats) {
            return {
                ...stats,
                atk:  Math.min(stats.atk,  1200),
                def:  Math.min(stats.def,  500),
                mag:  Math.min(stats.mag,  1200),
                spd:  Math.min(stats.spd,  200),
                crit: Math.min(stats.crit, 80),
                evasion: Math.min(stats.evasion || 0, 55),
            };
        }

        players = [
            buildDuelPlayer(invite.challenger, p1Data, capPvPStats(p1Stats), 0, invite.equalise),
            buildDuelPlayer(targetJid, p2Data, capPvPStats(p2Stats), 1, invite.equalise),
        ];
    }

    const duelState = {
        chatId,
        stake: invite.stake,
        mode, // 💡 NEW: stored on duelState so handlePvPAction + finishDuel can branch
        equalise: invite.equalise || false, // 💡 P4: track mode for display
        round: 1,
        // 💡 FIX #8 (2026-08-16): Speed-based initiative — faster player goes
        // first. Was always turn: 0 (P1 always first). Now compare SPD.
        turn: (players[0].stats?.spd || 0) >= (players[1].stats?.spd || 0) ? 0 : 1,
        lastAction: Date.now(),
        history: [],
        players,
    };

    activeDuels.set(chatId, duelState);

    // 💡 NEW 2026-08-05: Skip deployPvPSummons in summon mode — the summons
    // ARE the combatants now, not decorative support units.
    if (mode !== 'summon') {
        // 💡 FIX 2026-08-04: Deploy summons for both players BEFORE rendering the
        // image. Summons are mandatory — the duel image must show them. The 3s
        // timeout that was here before was too aggressive (DB queries for 2 players
        // can briefly exceed 3s under load) and caused summons to be silently
        // skipped, leaving the duel image without them. 8s is a generous safety
        // net; normal deploy is <1s.
        try {
            await Promise.race([
                deployPvPSummons(duelState),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Summon deploy timeout (8s)')), 8000)),
            ]);
        } catch (e) {
            console.error('[PvP] Summon deploy failed:', e.message);
            // Continue — duel still works, summons just won't appear in the image.
        }
    } // end if (mode !== 'summon')

    // 💡 FIX 2026-08-05: Health-gate the image gen. If the Go service is
    // known-down (cached health check), skip image gen entirely — don't waste
    // 10s on an axios timeout. The duel starts text-only immediately.
    let image = null;
    try {
        const goService = require('../utils/goImageService');
        if (await goService.isHealthy()) {
            image = await generateDuelImage(duelState);
        } else {
            console.log('[PvP] Skipping duel image — Go service unhealthy');
        }
    } catch (imgErr) {
        console.error('[PvP] Duel image failed:', imgErr.message);
        image = null;
    }

    const p1 = duelState.players[0];
    const p2 = duelState.players[1];

    // 💡 NEW 2026-08-05: Summon duel start message — different header + commands
    const isSummonDuel = duelState.mode === 'summon';
    const isEqualise = duelState.equalise === true;
    const header = isSummonDuel ? `🐉 *SUMMON DUEL* 🐉` : `🏟️ *PHANTOM STANDOFF* 🏟️`;
    const modeTag = isEqualise ? ` ⚖️ *EQUALISED*` : ``;
    const fleeWarning = isSummonDuel
        ? `🏃 \`${botConfig.getPrefix()} combat flee\` *(⚠️ Summon loses 10 loyalty!)*`
        : `🏃 \`${botConfig.getPrefix()} combat flee\` *(⚠️ Deducts 20% XP, 10% Wallet (max 5K), and 1 random item!)*`;

    let startMsg =
        `${header}${modeTag}\n` +
        `———————————\n` +
        `🔴 *${p1.name}* \`Lv.${p1.level}\` (${p1.class?.name || (isSummonDuel ? p1.archetype : 'Fighter')})\n` +
        `   ↳ ❤️ HP: \`${Math.floor(p1.hp)}/${Math.floor(p1.maxHp)}\` · ⚡ EN: \`${Math.floor(p1.energy)}/${Math.floor(p1.maxEnergy)}\`\n` +
        `🔵 *${p2.name}* \`Lv.${p2.level}\` (${p2.class?.name || (isSummonDuel ? p2.archetype : 'Fighter')})\n` +
        `   ↳ ❤️ HP: \`${Math.floor(p2.hp)}/${Math.floor(p2.maxHp)}\` · ⚡ EN: \`${Math.floor(p2.energy)}/${Math.floor(p2.maxEnergy)}\`\n`;

    // Show deployed summons (player mode only — summon mode IS the summons)
    if (!isSummonDuel && duelState.summons && duelState.summons.length > 0) {
        startMsg += `\n🐉 *SUMMONS DEPLOYED:*\n`;
        for (const s of duelState.summons) {
            const owner = duelState.players[s.summonerIndex || 0];
            startMsg += `${owner === p1 ? '🔴' : '🔵'} ${s.icon || '🐉'} ${s.name} (HP: ${Math.floor(s.currentHP)}/${Math.floor(s.maxHP)})\n`;
        }
    }

    startMsg += `\n🎯 *${duelState.players[duelState.turn].name}* claims the initiative!\n` + // 💡 FIX 2026-08-18: was hardcoded to p1.name even when turn=1 (P2 has higher SPD)
        `———————————\n` +
        `🗡️ \`${botConfig.getPrefix()} combat attack\`\n` +
        `🔮 \`${botConfig.getPrefix()} combat ability <n>\`\n` +
        (isSummonDuel
            ? `💊 \`${botConfig.getPrefix()} combat item\` *(Summon Healing Pill)*\n`
            : `🎒 \`${botConfig.getPrefix()} combat item\`\n`) +
        fleeWarning;

    return { success: true, duel: duelState, image, message: startMsg };
}

function buildDuelPlayer(jid, userData, stats, idx, equalise = false) {
    const classData = economy.getUserClass(jid);
    const progData = progression.getUser(jid);
    const maxEnergy = stats.maxEnergy || 200;
    // 💡 P4 (2026-08-16): PvP HP mode split.
    // Regular PvP: use raw player HP (stats.maxHp) — reverts Fix #7's global normalization.
    // --equalise PvP: use normalized HP (5000 + level × 30) — the Fix #7 formula.
    // This gives players a choice: raw stats for high-level players who want their
    // full HP pool, or equalised for fair fights regardless of level gap.
    const playerHp = equalise
        ? (5000 + (progData?.level || 1) * 30)
        : (stats.maxHp || stats.hp || 5000);
    const player = {
        jid,
        name: userData.nickname || economy.getDisplayName(jid),
        hp: playerHp,
        maxHp: playerHp,
        energy: maxEnergy,
        maxEnergy: maxEnergy,
        stats,
        level: progData?.level || 1,
        class: classData,
        spriteIndex: userData.spriteIndex || idx,
        statusEffects: [],
        buffs: [],
        cooldowns: {},
    };
    return player;
}

// 💡 NEW 2026-08-05: Build a summon-as-duelist entity for summon PvP mode.
// Wraps summonSystem.buildCombatEntity() so the entity satisfies the
// handlePvPAction player-entity contract (jid, name, level, class, hp,
// maxHp, energy, maxEnergy, stats, statusEffects, buffs, cooldowns).
async function buildSummonDuelPlayer(ownerJid, idx) {
    const summonSystem = require('./summonSystem');
    const user = economy.getUser(ownerJid);
    if (!user?.activeSummonId) return null;

    const summonDoc = await summonSystem.getActiveSummon(user);
    if (!summonDoc) return null;

    // Reuse the existing builder — produces stats, statusEffects, buffs, etc.
    const entity = summonSystem.buildCombatEntity(summonDoc, ownerJid);
    if (!entity) return null;

    const species = require('./summonRegistry').getSpecies(summonDoc.species);

    // Shape it to satisfy handlePvPAction's player-entity contract
    return {
        ...entity,
        jid:         ownerJid,                    // owner is the actor for turn checks
        name:        entity.name,
        level:       summonDoc.level || 1,
        class:       { id: 'summon', name: summonDoc.archetype || 'Summon' },
        spriteIndex: idx,
        // Normalize HP/energy fields for handlePvPAction reads
        hp:          entity.currentHP || entity.maxHp,
        maxHp:       entity.maxHp,
        energy:      entity.mana || 100,
        maxEnergy:   entity.maxMana || 100,
        // 💡 NEW 2026-08-05: mode + species for Go service sprite rendering
        mode:        'summon',
        species:     summonDoc.species,
        // Summon-specific (for finishDuel rewards + loyalty/CP)
        _summonDoc:  summonDoc,
        _isSummon:   true,
        _speciesIcon: species?.icon || '🐉',
        _speciesName: species?.name || summonDoc.species,
    };
}

// 💡 NEW 2026-08-05: Get abilities for a summon duelist.
// Uses monsterSkills.getSkillsForMonster(archetype, level) instead of
// the player's class skill tree.
function getSummonAbilities(player) {
    if (!player.archetype) return [];
    try {
        const monsterSkills = require('./monsterSkills');
        const skills = monsterSkills.getSkillsForMonster(player.archetype, player.level || 1);
        return skills.map(s => ({
            id:        s.id,
            name:      s.name,
            animation: '✨',
            cooldown:  0,
            _summonSkill: s,
        }));
    } catch (e) {
        return [];
    }
}

// 💡 Deploy summons for both PvP players.
// Called after buildDuelPlayer — adds each player's active summon to the duel.
async function deployPvPSummons(duelState) {
    const summonSystem = require('./summonSystem');
    duelState.summons = [];

    for (let i = 0; i < duelState.players.length; i++) {
        const player = duelState.players[i];
        try {
            const user = economy.getUser(player.jid);
            if (!user || !user.activeSummonId) continue;

            const summonDoc = await summonSystem.getActiveSummon(user);
            if (!summonDoc) continue;

            const summonEntity = summonSystem.buildCombatEntity(summonDoc, player.jid);
            if (summonEntity) {
                summonEntity.summonerIndex = i;
                // 💡 FIX 2026-08-03: Go service's Summon struct expects `ownerIndex`
                // (not `summonerIndex`). Without this, the Go service can't
                // position summons relative to their owner.
                summonEntity.ownerIndex = i;
                duelState.summons.push(summonEntity);
            }
        } catch (e) {
            console.error('[PvP] Summon deploy failed for', player.jid, ':', e.message);
        }
    }
}

// ==========================================
// ⚔️ HANDLE PVP ACTION
// ==========================================

async function handlePvPAction(sock, chatId, senderJid, action, target, m) {
    const resolvedSender = resolveJid(senderJid);
    const duel = activeDuels.get(chatId);
    if (!duel) return { success: false, message: '❌ No active duel here!' };

    const currentPlayer = duel.players[duel.turn];
    const opponent = duel.players[1 - duel.turn];
    
    if (currentPlayer.jid !== resolvedSender) {
        return { success: false, message: `⏳ It's not your turn! Waiting on *${currentPlayer.name}*...` };
    }

    // Tick current player's status effects at the beginning of their turn
    let statusLog = [];
    let skipTurn = false;

    // 💡 FIX #5/Bug6: Decrement stun immunity each turn
    if (currentPlayer.stunImmunityTurns > 0) {
        currentPlayer.stunImmunityTurns--;
    }

    if (currentPlayer.statusEffects && currentPlayer.statusEffects.length > 0) {
        for (let i = currentPlayer.statusEffects.length - 1; i >= 0; i--) {
            const effect = currentPlayer.statusEffects[i];
            
            // Damage over time: poison, burn, bleed
            if (effect.type === 'poison' || effect.type === 'burn' || effect.type === 'bleed') {
                const dmg = effect.dotDamage || (effect.type === 'poison' ? 10 : effect.type === 'burn' ? 15 : 12);
                currentPlayer.hp = Math.max(0, currentPlayer.hp - dmg);
                statusLog.push(`🩸 *${effect.type.toUpperCase()}* dealt *${dmg}* damage to *${currentPlayer.name}*!`);
            }
            // Regen
            else if (effect.type === 'regen') {
                const heal = effect.value || 15;
                currentPlayer.hp = Math.min(currentPlayer.maxHp, currentPlayer.hp + heal);
                statusLog.push(`💚 *REGEN* healed *${currentPlayer.name}* for *${heal}* HP!`);
            }
            // Stun / Freeze / Sleep
            else if (effect.type === 'stun' || effect.type === 'freeze' || effect.type === 'sleep') {
                skipTurn = true;
                statusLog.push(`💫 *${effect.type.toUpperCase()}* active! *${currentPlayer.name}*'s turn is skipped!`);
            }
            
            effect.duration--;
            if (effect.duration <= 0) {
                currentPlayer.statusEffects.splice(i, 1);
                statusLog.push(`✨ *${effect.type.toUpperCase()}* has worn off.`);
                // 💡 FIX #5/Bug6: Set stun immunity after CC expires (2 turns).
                // This prevents infinite stun locks where a player is repeatedly
                // CC'd before they can act. The 2-turn immunity gives them a
                // window to fight back.
                if (['stun', 'freeze', 'sleep', 'charm', 'cc'].includes(effect.type)) {
                    currentPlayer.stunImmunityTurns = 2;
                    statusLog.push(`🛡️ *${currentPlayer.name}* is immune to CC for 2 turns!`);
                }
            }
        }
    }

    // Tick buffs
    if (currentPlayer.buffs && currentPlayer.buffs.length > 0) {
        for (let i = currentPlayer.buffs.length - 1; i >= 0; i--) {
            const buff = currentPlayer.buffs[i];
            buff.duration--;
            if (buff.duration <= 0) {
                currentPlayer.buffs.splice(i, 1);
                statusLog.push(`✨ *${buff.type.toUpperCase()}* buff has worn off.`);
            }
        }
    }

    if (currentPlayer.hp <= 0) {
        currentPlayer.hp = 0;
        const statusMsg = statusLog.join('\n');
        const result = await finishDuel(chatId, duel, opponent, currentPlayer);
        activeDuels.delete(chatId);
        const resultMsg = (result && result.message) ? result.message : (typeof result === 'string' ? result : '');
        return { success: true, finished: true, message: statusMsg + '\n\n💀 *' + currentPlayer.name + '* died from status effects!\n\n' + resultMsg };
    }

    if (skipTurn) {
        // Tick cooldowns
        for (const [skillId, cd] of Object.entries(currentPlayer.cooldowns)) {
            currentPlayer.cooldowns[skillId] = cd - 1;
            if (currentPlayer.cooldowns[skillId] <= 0) delete currentPlayer.cooldowns[skillId];
        }
        
        // Advance turn
        duel.turn = 1 - duel.turn;
        if (duel.turn === 0) duel.round++;
        duel.lastAction = Date.now();
        
        // Energy regen
        currentPlayer.energy = Math.min(currentPlayer.maxEnergy, currentPlayer.energy + PVP_ENERGY_REGEN);
        
        const nextPlayer = duel.players[duel.turn];
        // 💡 FIX 2026-08-04: generateDuelImage now bypasses _enqueue and uses a
        // direct axios call with its own 10s timeout. No outer Promise.race
        // needed — the image renders on its own schedule. Text-only is only a
        // fallback for a genuinely unreachable Go service.
        let imageResult = null;
        try {
            imageResult = await generateDuelImage(duel);
        } catch (imgErr) {
            console.error('[PvP] Turn image failed:', imgErr.message);
            imageResult = null;
        }
        
        const statusMsg = statusLog.join('\n');
        let roundMsg = `⚔️ *PVP DUEL · ROUND ${duel.round}*\n` +
                        `———————————\n` +
                        `${statusMsg}\n\n` +
                        `🔴 *${currentPlayer.name}*${getPlayerEffectsString(currentPlayer)}: \`${Math.max(0, currentPlayer.hp)}/${currentPlayer.maxHp}\` HP · \`${Math.floor(currentPlayer.energy)}\` EN\n` +
                        `🔵 *${opponent.name}*${getPlayerEffectsString(opponent)}: \`${Math.max(0, opponent.hp)}/${opponent.maxHp}\` HP · \`${Math.floor(opponent.energy)}\` EN\n\n` +
                        `🎯 *@${economy.getDisplayName(nextPlayer.jid)}* — It's your turn!\n` +
                        `———————————\n` +
                        `🗡️ \`${botConfig.getPrefix()} combat attack\`\n` +
                        `🔮 \`${botConfig.getPrefix()} combat ability <n>\`\n` +
                        `🎒 \`${botConfig.getPrefix()} combat item\`\n` +
                        `🏃 \`${botConfig.getPrefix()} combat flee\``;

        return {
            success: true,
            finished: false,
            message: roundMsg,
            image: imageResult,
            mentions: [nextPlayer.jid],
        };
    }

    let actionResult = '';
    let damage = 0;
    let healing = 0;
    let isCrit = false;
    let missed = false;
    let abilityObj = null;

    if (action === 'attack') {
        const result = resolveBasicAttack(currentPlayer, opponent);
        damage = result.damage;
        isCrit = result.isCrit;
        missed = result.missed;
        
        if (missed) {
            actionResult = `💨 *MISS!* ${opponent.name} dodged the attack!`;
        } else if (isCrit) {
            opponent.hp -= damage;
            actionResult = `⚔️ *${currentPlayer.name}* attacks *${opponent.name}*!\n💢 ★ *CRITICAL HIT!* ★ — ${damage} damage!`;
        } else {
            opponent.hp -= damage;
            actionResult = `⚔️ *${currentPlayer.name}* attacks *${opponent.name}*! — *${damage}* damage`;
        }

    } else if (action === 'ability') {
        // 💡 FIX 2026-08-06: Check silence status — silenced players can't use abilities.
        if ((currentPlayer.statusEffects || []).some(e => e.type === 'silence')) {
            return {
                success: false,
                message: `🤐 *${currentPlayer.name}* is SILENCED and cannot use abilities! Use \`${botConfig.getPrefix()} combat attack\` instead.`
            };
        }
        if (!target || isNaN(parseInt(target))) {
            return { success: false, message: `❌ Please specify a valid ability number! Example: \`${require('../../botConfig').getPrefix()} combat ability 1\`` };
        }
        const abilityIndex = parseInt(target) - 1;

        // 💡 NEW 2026-08-05: Branch ability lookup on duel mode.
        // Summon mode: use monsterSkills.getSkillsForMonster(archetype, level).
        // Player mode: use getLearnedAbilities(jid, classId) as before.
        let learned;
        let effect;
        let energyCost;
        let cooldownVal;

        if (duel.mode === 'summon') {
            learned = getSummonAbilities(currentPlayer);
            abilityObj = learned[abilityIndex];
            if (!abilityObj) return { success: false, message: `❌ Ability #${parseInt(target)} not found! Use \`${require('../../botConfig').getPrefix()} summon abilities\` to see your summon's kit.` };

            // Summon skills: effect is in _summonSkill.currentEffect (already computed by getSkillsForMonster)
            effect = abilityObj._summonSkill?.currentEffect || abilityObj._summonSkill?.effect || {};
            energyCost = abilityObj._summonSkill?.cost || 20;

            // 💡 Flat 2-turn cooldown on all summon abilities in PvP (prevents spam)
            cooldownVal = 2;
        } else {
            learned = getLearnedAbilities(currentPlayer.jid, currentPlayer.class?.id);
            abilityObj = learned[abilityIndex];
            if (!abilityObj) return { success: false, message: `❌ Ability #${parseInt(target)} not found! Use \`${require('../../botConfig').getPrefix()} abilities\` to see your list.` };

            const skillLevel = economy.getUser(currentPlayer.jid)?.skills?.[abilityObj.id] || 1;
            effect = skillTree.getSkillEffect(abilityObj, skillLevel);

            // 💡 FIX 2026-08-06: Apply rune modifiers in PvP (was missing entirely).
            // Without this, socketed runes had zero effect in PvP — no silence,
            // no damage mult, no element conversion, no lifesteal, nothing.
            try {
                const runeSystem = require('./runeSystem');
                const socketedRunes = await runeSystem.getSocketedRunes(currentPlayer.jid, abilityObj.id);
                if (socketedRunes && socketedRunes.length > 0) {
                    effect = runeSystem.applyRuneModifiers(effect, socketedRunes);
                }
            } catch (e) {
                // Rune system is optional — fall through with unmodified effect
            }

            energyCost = effect?.cost || 20;
            cooldownVal = effect?.cooldown !== undefined ? effect.cooldown : abilityObj.cooldown;
        }

        const ability = abilityObj; // keep old variable name for downstream code

        if (currentPlayer.energy < energyCost) {
            return { success: false, message: `❌ Not enough energy! Need ${energyCost}, have ${Math.floor(currentPlayer.energy)}.` };
        }

        // Check cooldown
        if (currentPlayer.cooldowns[ability.id]) {
            return { success: false, message: `⏱️ *${ability.name}* is on cooldown! (${currentPlayer.cooldowns[ability.id]} turns left)` };
        }

        currentPlayer.energy -= energyCost;
        // 💡 FIX 2026-08-06: Apply cooldown rune modifiers (COOLDOWN, QUICK_CAST).
        // cooldownMult: multiply base cooldown (0.5 = half cooldown).
        // cooldownFlatReduction: subtract flat turns (QUICK_CAST).
        const runeCooldownMult = Number(effect?.cooldownMult) || 1;
        const runeCooldownFlat = Number(effect?.cooldownFlatReduction) || 0;
        const effectiveCooldown = cooldownVal
            ? Math.max(0, Math.ceil(cooldownVal * runeCooldownMult) - runeCooldownFlat)
            : cooldownVal;
        if (effectiveCooldown) currentPlayer.cooldowns[ability.id] = effectiveCooldown;

        let hasResolved = false;
        const attackerStats = getEffectiveStats(currentPlayer);
        const defenderStats = getEffectiveStats(opponent);

        if (effect?.type === 'damage' || effect?.type === 'aoe' || effect?.type === 'damage_dot' || effect?.type === 'multi_hit' || effect?.type === 'damage_heal') {
            const statBase = (effect.damageType === 'magic' || effect.damageType === 'TRUE' ? attackerStats.mag : attackerStats.atk) || attackerStats.atk;
            damage = Math.floor(statBase * (effect.multiplier || 1.2) * PVP_ABILITY_MULT);
            // 💡 FIX 2026-08-06: Rune ignoreDefense / TRUE damage — skip/reduce DEF mitigation
            const ignoreDefPct = Math.min(100, Number(effect.ignoreDefense) || 0);
            const isTrueDamage = String(effect.damageType).toUpperCase() === 'TRUE';
            let defReduction;
            if (isTrueDamage || ignoreDefPct >= 100) {
                defReduction = 0; // TRUE damage or 100% ignore = no mitigation
            } else {
                const fullDef = Math.min(defenderStats.def * 0.2, damage * PVP_DEFENSE_CAP);
                defReduction = Math.floor(fullDef * (1 - ignoreDefPct / 100));
            }
            damage = Math.max(20, Math.floor(damage - defReduction));
            // 💡 FIX 2026-08-06: Rune guaranteedCrit — force crit
            isCrit = effect.guaranteedCrit || (Math.random() * 100 < (attackerStats.crit || 5));
            if (isCrit) damage = Math.floor(damage * PVP_CRIT_MULT);
            opponent.hp -= damage;
            if (isCrit) {
                actionResult = `${ability.animation || '✨'} *${currentPlayer.name}* used *${ability.name}*!\n💢 ★ *CRITICAL HIT!* ★ — Deals *${damage}* damage to *${opponent.name}*!`;
            } else {
                actionResult = `${ability.animation || '✨'} *${currentPlayer.name}* used *${ability.name}*!\n💥 Deals *${damage}* damage to *${opponent.name}*!`;
            }
            // 💡 FIX 2026-08-06: Rune lifestealPercent — heal attacker
            if (effect.lifestealPercent && damage > 0) {
                const healAmt = Math.floor(damage * effect.lifestealPercent / 100);
                if (healAmt > 0) {
                    currentPlayer.hp = Math.min(currentPlayer.maxHp, currentPlayer.hp + healAmt);
                    actionResult += `\n🩸 ${currentPlayer.name} drains ${healAmt} HP!`;
                }
            }
            // 💡 FIX 2026-08-06: Rune executeThreshold + executeBonus — bonus damage on low HP targets
            if (effect.executeThreshold && effect.executeBonus > 1) {
                const hpPct = (opponent.hp / opponent.maxHp) * 100;
                if (hpPct > 0 && hpPct <= effect.executeThreshold) {
                    const execBonus = Math.floor(damage * (effect.executeBonus - 1));
                    opponent.hp -= execBonus;
                    actionResult += `\n⚡ *EXECUTE!* +${execBonus} bonus damage!`;
                }
            }
        } else if (effect?.type === 'execute') {
            const hpPercent = (opponent.hp / opponent.maxHp) * 100;
            const mult = hpPercent <= (effect.threshold || 30) ? 2.5 : 1.0;
            const statBase = (effect.damageType === 'magic' ? attackerStats.mag : attackerStats.atk) || attackerStats.atk;
            damage = Math.floor(statBase * (effect.multiplier || 1.2) * mult * PVP_ABILITY_MULT);
            const defReduction = Math.min(defenderStats.def * 0.2, damage * PVP_DEFENSE_CAP);
            damage = Math.max(20, Math.floor(damage - defReduction));
            // Crit Check
            isCrit = Math.random() * 100 < (attackerStats.crit || 5);
            if (isCrit) damage = Math.floor(damage * PVP_CRIT_MULT);
            opponent.hp -= damage;
            if (isCrit) {
                actionResult = `${ability.animation || '✨'} *${currentPlayer.name}* used *${ability.name}*!\n💢 ★ *CRITICAL HIT!* ★ — Deals *${damage}* damage to *${opponent.name}*!`;
            } else {
                actionResult = `${ability.animation || '✨'} *${currentPlayer.name}* used *${ability.name}*!\n💥 Deals *${damage}* damage to *${opponent.name}*!`;
            }
            if (mult > 1.0) {
                actionResult += `\n⚡ *EXECUTE THRESHOLD TRIGGERED!* ⚡`;
            }
        } else if (effect?.type === 'damage_cc') {
            const statBase = attackerStats.atk;
            damage = Math.floor(statBase * (effect.multiplier || 1.0) * PVP_ABILITY_MULT);
            damage = Math.max(15, damage - Math.floor(defenderStats.def * 0.15));
            // Crit Check
            isCrit = Math.random() * 100 < (attackerStats.crit || 5);
            if (isCrit) damage = Math.floor(damage * PVP_CRIT_MULT);
            opponent.hp -= damage;
            if (isCrit) {
                actionResult = `${ability.animation || '✨'} *${currentPlayer.name}* used *${ability.name}*!\n💢 ★ *CRITICAL HIT!* ★ — *${damage}* damage`;
            } else {
                actionResult = `${ability.animation || '✨'} *${currentPlayer.name}* used *${ability.name}*!\n💥 *${damage}* damage`;
            }
        } else {
            actionResult = `${ability.animation || '✨'} *${currentPlayer.name}* used *${ability.name}*!`;
        }

        // Process resolved effects
        if (effect?.resolvedEffects && Object.keys(effect.resolvedEffects).length > 0) {
            hasResolved = true;
            for (const [effId, effData] of Object.entries(effect.resolvedEffects)) {
                if (effId === 'heal' || effId === 'heal_team' || effId === 'heal_self') {
                    const healVal = effData.value || 80;
                    const healAmt = Math.min(healVal, currentPlayer.maxHp - currentPlayer.hp);
                    currentPlayer.hp += healAmt;
                    actionResult += `\n💚 Restored *${healAmt}* HP! (${currentPlayer.hp}/${currentPlayer.maxHp})`;
                }
                else if (effId === 'buff_self' || effId === 'buff_team' || effId === 'buff_target' || effId === 'shield' || effId === 'evasion' || effId === 'critBuff') {
                    const rawStat = effData.stat || (effId === 'shield' ? 'defense' : effId === 'critBuff' ? 'crit' : effId === 'evasion' ? 'evasion' : 'atk');
                    const statName = rawStat === 'attack' ? 'atk' : rawStat === 'defense' ? 'def' : rawStat === 'speed' ? 'spd' : rawStat === 'magic' ? 'mag' : rawStat;
                    const buffVal = Math.floor((effData.value || 20) * 0.5); // Half buffs in PvP
                    applyBuff(currentPlayer, statName, buffVal, effData.duration || 2);
                    actionResult += `\n✨ +${buffVal} ${statName.toUpperCase()} for ${effData.duration || 2} turns!`;
                }
                else if (effId === 'stun' || effId === 'freeze' || effId === 'sleep' || effId === 'charm' || effId === 'cc') {
                    const chance = effData.chance || 100;
                    if (Math.random() * 100 < chance) {
                        applyStatusEffect(opponent, effId, effData.duration || 1);
                        actionResult += `\n💫 *${effId.toUpperCase()}* applied to *${opponent.name}* for ${effData.duration || 1} turn!`;
                    }
                }
                else if (effId === 'dot' || effId === 'burn' || effId === 'poison' || effId === 'bleed') {
                    applyStatusEffect(opponent, effId, effData.duration || 3, effData.value || 10);
                    actionResult += `\n🔥 *${effId.toUpperCase()}* applied to *${opponent.name}* for ${effData.duration || 3} turns!`;
                }
                else if (effId === 'haste') {
                    const buffVal = Math.floor((effData.value || 20) * 0.5);
                    applyBuff(currentPlayer, 'spd', buffVal, effData.duration || 3);
                    actionResult += `\n⚡ Haste applied! +${buffVal} SPD for ${effData.duration || 3} turns!`;
                }
            }
        }

        // Fallbacks for legacy/flattened root effects
        if (!hasResolved) {
            if (effect?.type === 'damage_dot' && effect.dot) {
                applyStatusEffect(opponent, effect.dot, effect.dotDuration || 2, effect.dotDamage || 10);
                actionResult += `\n🔥 *${effect.dot.toUpperCase()}* applied to *${opponent.name}* for ${effect.dotDuration || 2} turns!`;
            }
            if (effect?.type === 'damage_heal') {
                const healVal = Math.floor(damage * (effect.healPercent || 30) / 100);
                currentPlayer.hp = Math.min(currentPlayer.maxHp, currentPlayer.hp + healVal);
                actionResult += `\n💚 Healed self for *${healVal}* HP!`;
            }
            if (effect?.type === 'heal' || effect?.type === 'heal_team' || effect?.type === 'heal_self') {
                healing = Math.floor(effect.value || 80);
                currentPlayer.hp = Math.min(currentPlayer.maxHp, currentPlayer.hp + healing);
                actionResult += `\n💚 Restored *${healing}* HP! (${currentPlayer.hp}/${currentPlayer.maxHp})`;
            }
            if (effect?.type === 'buff_self') {
                const statName = effect.buffType || 'atk';
                const buffVal = Math.floor((effect.value || 20) * 0.5); // Half buffs in PvP
                applyBuff(currentPlayer, statName, buffVal, effect.duration || 2);
                actionResult += `\n✨ +${buffVal} ${statName.toUpperCase()} for ${effect.duration || 2} turns!`;
            }
            if (effect?.type === 'damage_cc') {
                if (Math.random() * 100 < (effect.ccChance || 30)) {
                    applyStatusEffect(opponent, effect.cc, effect.ccDuration || 1);
                    actionResult += ` + *${effect.cc?.toUpperCase()}* applied!`;
                }
            }
        }

        // 💡 NEW 2026-08-06: Apply rune addStatuses (silence, poison, bleed, etc.)
        // These come from SILENCE_INFUSION, POISON_INFUSION, BLEED_INFUSION, etc.
        // runes via applyRuneModifiers (called above in the ability branch).
        // Without this, socketed infusion runes had zero effect in PvP.
        if (effect?.addStatuses && effect.addStatuses.length > 0) {
            for (const statusDef of effect.addStatuses) {
                // Roll chance if defined
                if (statusDef.chance !== undefined && Math.random() * 100 >= statusDef.chance) continue;
                applyStatusEffect(opponent, statusDef.type, statusDef.duration || 1, statusDef.value || 0);
                actionResult += `\n✨ *${statusDef.type.toUpperCase()}* applied to *${opponent.name}* for ${statusDef.duration || 1} turn(s)!`;
            }
        }

    } else if (action === 'flee') {
        // 💡 NEW 2026-08-05: Summon duel flee — CP penalty instead of player XP/wallet/item loss.
        // Fleeing summon loses CP (combat power) rating via temporary loyalty reduction.
        if (duel.mode === 'summon') {
            const summonSystem = require('./summonSystem');
            // CP penalty: reduce summon's effectiveness by dropping loyalty 10 points
            // (loyalty gates stats: ≥75=100%, ≥50=85%, ≥25=60%, ≥1=30%)
            const cpPenalty = 10;
            if (currentPlayer._summonDoc) {
                currentPlayer._summonDoc.loyalty = Math.max(0, (currentPlayer._summonDoc.loyalty || 0) - cpPenalty);
                try { await currentPlayer._summonDoc.save(); } catch (e) {}
            }
            const oldCP = summonSystem.computeCP(currentPlayer._summonDoc);
            const fleeMsg = `🏃 *${currentPlayer._speciesName}* fled the summon duel!\n\n` +
                           `⚠️ *Flee Penalty:* ${currentPlayer._speciesName} lost *${cpPenalty}* loyalty (CP reduced).\n` +
                           `Current CP: ${oldCP}\n\n` +
                           `🏆 *${opponent._speciesName}* wins by forfeit!`;
            activeDuels.delete(chatId);
            return { success: true, finished: true, fled: true, message: fleeMsg };
        }

        // Player who flees gets penalized, opponent wins.
        const fleeingJid = currentPlayer.jid;
        const stayingJid = opponent.jid;

        const fleeingUser = economy.getUser(fleeingJid);
        const stayingUser = economy.getUser(stayingJid);

        // Calculate and apply Flee Penalties:
        // 1. XP Loss: 20% of total XP (capped to level minimum)
        let xpLost = 0;
        if (fleeingUser && fleeingUser.progression) {
            const prog = fleeingUser.progression;
            const minXP = progression.getXPForLevel(prog.level);
            xpLost = Math.floor((prog.xp || 0) * 0.20);
            if (xpLost > 0) {
                const oldXP = prog.xp;
                prog.xp = Math.max(minXP, prog.xp - xpLost);
                xpLost = oldXP - prog.xp; // actual XP lost after clamp
                prog.totalXPEarned = Math.max(0, (prog.totalXPEarned || 0) - xpLost);
            }
        }

        // 2. Money Loss: 10% of wallet (max 5K) — rebalanced 2026-08-17
        let moneyLost = 0;
        if (fleeingUser) {
            moneyLost = Math.min(5000, Math.floor((fleeingUser.wallet || 0) * 0.10)); // 💡 Rebalanced 2026-08-17: 50% of wallet was brutal. Now 10% capped at 5K.
            if (moneyLost > 0) {
                economy.removeMoney(fleeingJid, moneyLost, "PvP Flee Penalty");
            }
        }

        // 3. Random Item Loss: 1 item from bag
        let itemLostName = "None (Bag Empty)";
        const inventory = inventorySystem.getInventory(fleeingJid);
        const itemKeys = Object.keys(inventory || {}).filter(key => {
            const val = inventory[key];
            const qty = typeof val === 'number' ? val : (val?.quantity || 0);
            return qty > 0;
        });
        if (itemKeys.length > 0) {
            const randomKey = itemKeys[Math.floor(Math.random() * itemKeys.length)];
            const itemInfo = lootSystem.getItemInfo(randomKey);
            itemLostName = itemInfo?.name || randomKey;
            inventorySystem.removeItem(fleeingJid, randomKey, 1);
        }

        // Update PvP wins/losses
        if (stayingUser) {
            stayingUser.pvpWins = (stayingUser.pvpWins || 0) + 1;
            economy.saveUser(stayingJid);
            // 💡 Phase 2: Award guild XP + war points for PvP win
            try {
                const guildPerks = require('./guildPerks');
                guildPerks.awardGuildXp(stayingJid, 5, 'PvP win');
                guildPerks.awardWarPoints(stayingJid, 5, 'pvp');
            } catch (e) {}
            // 💡 Phase 6: Check if the loser had an active bounty — claim it
            // (bounty message stored and appended to rewardMsg below)
            duel._bountyClaimMsg = '';
            try {
                const bountySystem = require('./bountySystem');
                const bountyCheck = await bountySystem.getBountiesOnTarget(fleeingJid);
                if (bountyCheck.length > 0) {
                    const claimResult = await bountySystem.claimBounty(stayingJid, fleeingJid);
                    if (claimResult.claimed) {
                        duel._bountyClaimMsg = '\n\n' + claimResult.message;
                    }
                }
            } catch (e) {
                console.error('[BountyClaim] Failed:', e.message);
            }
        }
        if (fleeingUser) {
            fleeingUser.pvpLosses = (fleeingUser.pvpLosses || 0) + 1;
            economy.saveUser(fleeingJid);
            // 💡 AUDIT FIX 2026-08-01 (Round 1): call failedHuntPenalty in the
            // FLEE scenario too. If the player who STAYED had an active bounty
            // and the FLEEING player was the hunter, the fleeing hunter pays
            // the penalty + the stayer's defendersWon increments.
            try {
                const bountySystem = require('./bountySystem');
                const bountyCheckOnStayer = await bountySystem.getBountiesOnTarget(stayingJid);
                if (bountyCheckOnStayer.length > 0) {
                    const penaltyResult = await bountySystem.failedHuntPenalty(fleeingJid, stayingJid);
                    if (penaltyResult.success && penaltyResult.penaltyPaid > 0) {
                        let fleePenaltyMsg = `\n\n💸 *BOUNTY HUNT FAILED:* ${fleeingUser.nickname || economy.getDisplayName(fleeingJid)} paid ${penaltyResult.penaltyPaid.toLocaleString()} ${ZENI} penalty for fleeing.`;
                        if (penaltyResult.defendedBounties && penaltyResult.defendedBounties.length > 0) {
                            fleePenaltyMsg += `\n🛡️ *BOUNTY DEFENDED!* 3 challengers defeated — bounty cleared!`;
                        }
                        duel._bountyClaimMsg = (duel._bountyClaimMsg || '') + fleePenaltyMsg;
                    }
                }
            } catch (e) {
                console.error('[FailedHuntPenalty flee] Failed:', e.message);
            }
        }

        // Give the standard win rewards to the staying player
        const ZENI = botConfig.getCurrency().symbol;
        let rewardMsg = '';
        if (duel.stake > 0) {
            const pot = duel.stake * 2;
            economy.addMoney(stayingJid, pot);
            rewardMsg = `💰 Won ${ZENI}${pot.toLocaleString()} (staked pot)`;
        } else {
            const goldBonus = Math.floor(150 + (currentPlayer.level * 40));
            economy.addMoney(stayingJid, goldBonus);
            rewardMsg = `💰 ${ZENI}${goldBonus.toLocaleString()} prize`;
        }

        const xpGain = Math.floor(80 + (currentPlayer.level * 15));
        progression.addXP(stayingJid, xpGain, 'PvP Victory (Opponent Fled)');

        activeDuels.delete(chatId);

        let fleeMsg = `🏃 *${currentPlayer.name}* has fled from the duel!\n\n` +
                      `⚠️ *Flee Penalties Applied to ${currentPlayer.name}:*\n` +
                      `   ↳ ⭐ XP Lost: \`-${xpLost}\` XP (capped at level minimum)\n` +
                      `   ↳ 💵 Wallet Lost: \`-${ZENI}${moneyLost.toLocaleString()}\` (50% of wallet)\n` +
                      `   ↳ 🎒 Item Lost: \`${itemLostName}\` (random item from bag)\n\n` +
                      `👑 *Winner:* *${opponent.name}* by forfeit!\n` +
                      `🎁 *Rewards for ${opponent.name}:*\n` +
                      `   ↳ ${rewardMsg}\n` +
                      `   ↳ ⭐ +${xpGain} XP` +
                      (duel._bountyClaimMsg || '');

        return { 
            success: true, 
            finished: true, 
            fled: true,
            message: fleeMsg 
        };
    } else if (action === 'item') {
        // 💡 NEW 2026-08-05: In summon duel mode, items are disabled (summons
        // have no inventory). Owner can use a Summon Healing Pill from the
        // summon store if they have one — handled via 'item summon_pill'.
        if (duel.mode === 'summon') {
            // Check for summon healing pill in owner's inventory
            const inventory = inventorySystem.formatInventory(currentPlayer.jid);
            const pillItem = inventory.items?.find(it => it.id === 'summon_healing_pill' || it.id === 'summon_pill');
            if (!pillItem) {
                return { success: false, message: '❌ Summons have no combat bag. Buy a *Summon Healing Pill* from the summon store to heal mid-battle.\n\nAvailable commands: `attack`, `ability <n>`, `flee`' };
            }
            // Use the pill — heal 30% of max HP
            const healAmount = Math.floor(currentPlayer.maxHp * 0.30);
            currentPlayer.hp = Math.min(currentPlayer.maxHp, currentPlayer.hp + healAmount);
            // Consume the pill
            try { await inventorySystem.removeItem(currentPlayer.jid, pillItem.id, 1); } catch (e) {}
            actionResult = `💊 ${currentPlayer.name} swallows a *Summon Healing Pill*! Restored *${healAmount}* HP!`;
        } else {
        const inventory = inventorySystem.formatInventory(currentPlayer.jid);
        if (inventory.isEmpty) {
            return { success: false, message: '❌ Your combat bag is empty!' };
        }
        
        const { CONSUMABLES } = require('./guildAdventure');
        const usableItems = inventory.items.filter((item) => {
            const info = lootSystem.getItemInfo(item.id);
            return (info && info.usable) || !!CONSUMABLES[item.id];
        });
        
        if (usableItems.length === 0) {
            return { success: false, message: '❌ You have no usable items in your bag!' };
        }
        
        if (!target || target.trim() === '') {
            // List usable combat items (does not consume turn)
            let msg = `🎒 *${currentPlayer.name}'s COMBAT BAG* 🎒\n━━━━━━━━━━━━━━━━\n`;
            usableItems.forEach((item, i) => {
                const info = lootSystem.getItemInfo(item.id);
                msg += `*${i + 1}.* ${info.name} x${item.quantity}\n_${info.description || ''}_\n\n`;
            });
            msg += `━━━━━━━━━━━━━━━━\n💡 *Usage:* \`${botConfig.getPrefix()} combat item <number>\` (e.g. \`combat item 1\`)`;
            return { success: true, message: msg };
        }
        
        const itemIndex = parseInt(target) - 1;
        if (isNaN(itemIndex) || itemIndex < 0 || itemIndex >= usableItems.length) {
            return { success: false, message: `❌ Invalid item number! Type \`${botConfig.getPrefix()} combat item\` to see all usable items.` };
        }
        
        const selectedItem = usableItems[itemIndex];
        const itemKey = selectedItem.id;
        const itemInfo = lootSystem.getItemInfo(itemKey);
        const shopInfo = CONSUMABLES[itemKey] || {};
        const item = {
            ...itemInfo,
            ...shopInfo,
            usable: (itemInfo && itemInfo.usable) || !!shopInfo
        };
        
        if (!item || !item.usable) {
            return { success: false, message: '❌ This item is not usable in combat!' };
        }

        // Remove 1 item — verify removal succeeded BEFORE applying the effect.
        // Previously the return value was ignored, so a failed removeItem
        // (e.g. item already gone) would silently let the player use the
        // item's effect for free.
        const removeResult = inventorySystem.removeItem(currentPlayer.jid, itemKey, 1);
        if (!removeResult.success) {
            return { success: false, message: `❌ Failed to use item: ${removeResult.message || 'insufficient quantity'}` };
        }

        actionResult = `🎒 *${currentPlayer.name}* used *${item.name}*!`;
        
        const isNegative = [
            "damage_aoe",
            "aoe_damage",
            "aoe_debuff_damage",
            "apply_poison",
            "freeze_enemy",
            "percent_hp_damage"
        ].includes(item.effect);
        
        const itemTarget = isNegative ? opponent : currentPlayer;
        
        switch (item.effect) {
            case "heal":
                const healVal = item.effectValue || 0.35;
                const healAmt = Math.floor(itemTarget.maxHp * healVal);
                const actualHeal = Math.min(healAmt, itemTarget.maxHp - itemTarget.hp);
                itemTarget.hp += actualHeal;
                actionResult += `\n💖 Restored *${actualHeal}* HP! (${Math.round(healVal * 100)}%)`;
                
                if (itemKey === "elixir" || item.cureStatus) {
                    if (itemTarget.statusEffects && itemTarget.statusEffects.length > 0) {
                        const negativeEffects = ["poison", "burn", "bleed", "freeze", "stun", "sleep", "root", "slow", "curse", "weak", "vulnerability"];
                        const beforeCount = itemTarget.statusEffects.length;
                        itemTarget.statusEffects = itemTarget.statusEffects.filter(s => !negativeEffects.includes(s.type));
                        const clearedCount = beforeCount - itemTarget.statusEffects.length;
                        if (clearedCount > 0) {
                            actionResult += `\n✨ Cured *${clearedCount}* status effects!`;
                        }
                    }
                }
                break;
            case "cure_status":
                if (itemTarget.statusEffects && itemTarget.statusEffects.length > 0) {
                    const negativeEffects = ["poison", "burn", "bleed", "freeze", "stun", "sleep", "root", "slow", "curse", "weak", "vulnerability"];
                    const beforeCount = itemTarget.statusEffects.length;
                    itemTarget.statusEffects = itemTarget.statusEffects.filter(s => !negativeEffects.includes(s.type));
                    const clearedCount = beforeCount - itemTarget.statusEffects.length;
                    if (clearedCount > 0) {
                        actionResult += `\n✨ Cured *${clearedCount}* status effects!`;
                    } else {
                        actionResult += `\n(No negative status effects to cure)`;
                    }
                } else {
                    actionResult += `\n(No negative status effects to cure)`;
                }
                break;
            case "regen":
                const regVal = item.effectValue || 0.1;
                const regAmt = Math.floor(itemTarget.maxHp * regVal);
                if (!itemTarget.statusEffects) itemTarget.statusEffects = [];
                itemTarget.statusEffects.push({ type: 'regen', duration: item.duration || 3, value: regAmt });
                actionResult += `\n🧴 Applied regeneration! (+${regAmt} HP/turn)`;
                break;
            case "restore_energy":
                const enVal = item.effectValue || 0.4;
                const enAmt = Math.floor(itemTarget.maxEnergy * enVal);
                itemTarget.energy = Math.min(itemTarget.maxEnergy, itemTarget.energy + enAmt);
                actionResult += `\n⚡ Restored *${enAmt}* energy! (${Math.round(enVal * 100)}%)`;
                break;
            case "buff_atk": {
                const buffVal = Math.floor((item.effectValue || 20) * 0.5);
                applyBuff(itemTarget, 'atk', buffVal, item.duration || 3);
                actionResult += `\n💪 Buffed attack! (+${buffVal} ATK)`;
                break;
            }
            case "buff_def": {
                const buffVal = Math.floor((item.effectValue || 20) * 0.5);
                applyBuff(itemTarget, 'def', buffVal, item.duration || 3);
                actionResult += `\n🛡️ Buffed defense! (+${buffVal} DEF)`;
                break;
            }
            case "buff_spd": {
                const buffVal = Math.floor((item.effectValue || 20) * 0.5);
                applyBuff(itemTarget, 'spd', buffVal, item.duration || 3);
                actionResult += `\n⚡ Buffed speed! (+${buffVal} SPD)`;
                break;
            }
            case "buff_luck": {
                const buffVal = Math.floor((item.effectValue || 20) * 0.5);
                applyBuff(itemTarget, 'luck', buffVal, item.duration || 3);
                actionResult += `\n🍀 Buffed luck! (+${buffVal} LUCK)`;
                break;
            }
            case "buff_all": {
                applyBuff(itemTarget, 'atk', 10, item.duration || 3);
                applyBuff(itemTarget, 'def', 10, item.duration || 3);
                applyBuff(itemTarget, 'spd', 10, item.duration || 3);
                actionResult += `\n✨ Overflowing with power! (+10 to All Stats)`;
                break;
            }
            case "buff_all_damage": {
                applyBuff(itemTarget, 'atk', 20, item.duration || 3);
                actionResult += `\n💥 Enters a BERSERKER RAGE! (+20 ATK)`;
                break;
            }
            case "shield_max":
                applyStatusEffect(itemTarget, 'shield', 5, 100);
                actionResult += `\n🛡️ Encased in a massive energy barrier!`;
                break;
            case "damage_aoe":
            case "aoe_damage":
            case "aoe_debuff_damage":
                const dmg = item.effectValue || 80;
                itemTarget.hp = Math.max(0, itemTarget.hp - dmg);
                actionResult += `\n💥 Deals *${dmg}* damage to *${itemTarget.name}*!`;
                if (item.effect === "aoe_debuff_damage") {
                    if (!itemTarget.statusEffects) itemTarget.statusEffects = [];
                    itemTarget.statusEffects.push({ type: 'vulnerability', duration: 3, value: 20 });
                    actionResult += ` and weakened them!`;
                }
                break;
            case "percent_hp_damage":
                const finalDmg = Math.floor(itemTarget.maxHp * (item.effectValue || 0.25));
                itemTarget.hp = Math.max(0, itemTarget.hp - finalDmg);
                actionResult += `\n💥 Deals *${finalDmg}* TRUE damage to *${itemTarget.name}*!`;
                break;
            case "flee":
                actionResult += `\n💨 Used smoke bomb! Escape from PvP is not allowed this way (use regular flee).`;
                break;
            default:
                actionResult += `\n(Item effect activated)`;
        }
        } // end else (non-summon item path)
    } else {
        return { success: false, message: `❌ Unknown action. Use: \`attack\`, \`ability <n>\`, \`item\`, or \`flee\`` };
    }

    if (statusLog.length > 0) {
        actionResult = statusLog.join('\n') + '\n\n' + actionResult;
    }

    // 💡 FIX #5 (2026-08-15): PvP summon participation — after the player acts,
    // their summon auto-attacks the opponent. This makes summons actively
    // participate in PvP instead of being passive stat sticks. The summon
    // uses a simplified attack formula (not the full PvE summonAI which
    // depends on gameStates/sock.sendMessage).
    if (duel.summons && duel.summons.length > 0 && action !== 'flee') {
        const playerSummon = duel.summons.find(s =>
            s.summonerIndex === duel.turn && !s.isDead && s.stats?.hp > 0
        );
        if (playerSummon && opponent.hp > 0) {
            // Simplified summon attack: summon ATK vs opponent DEF
            const summonAtk = playerSummon.stats?.atk || 20;
            const oppDef = opponent.stats?.def || opponent.def || 10;
            let summonDmg = Math.max(1, Math.floor(summonAtk * (100 / (100 + oppDef))));
            // 15% crit chance for summons
            const summonCrit = Math.random() < 0.15;
            if (summonCrit) summonDmg = Math.floor(summonDmg * 1.5);
            // 10% miss chance
            if (Math.random() < 0.10) {
                actionResult += `\n🐉 ${playerSummon.icon || '🐲'} ${playerSummon.name} attacks but *MISSES*!`;
            } else {
                opponent.hp = Math.max(0, opponent.hp - summonDmg);
                actionResult += `\n${playerSummon.icon || '🐲'} ${playerSummon.name} attacks *${opponent.name}* for 💥 ${summonDmg} damage${summonCrit ? ' (CRIT!)' : ''}!`;
                if (opponent.hp <= 0) {
                    actionResult += `\n💀 ${opponent.name} was defeated by ${playerSummon.name}!`;
                }
            }
        }
    }

    // ── Check for win ─────────────────────────────
    if (opponent.hp <= 0 || currentPlayer.hp <= 0) {
        let winner = currentPlayer;
        let loser = opponent;
        if (currentPlayer.hp <= 0 && opponent.hp > 0) {
            winner = opponent;
            loser = currentPlayer;
        } else if (currentPlayer.hp <= 0 && opponent.hp <= 0) {
            winner = opponent;
            loser = currentPlayer;
        }
        loser.hp = 0;
        const result = await finishDuel(chatId, duel, winner, loser);
        activeDuels.delete(chatId);
        const resultMsg = (result && result.message) ? result.message : (typeof result === 'string' ? result : '');
        return { success: true, finished: true, message: actionResult + '\n\n' + resultMsg };
    }

    // ── Advance turn ──────────────────────────────
    duel.turn = 1 - duel.turn;
    if (duel.turn === 0) duel.round++;
    duel.lastAction = Date.now();

    // Energy regen for attacker
    currentPlayer.energy = Math.min(currentPlayer.maxEnergy, currentPlayer.energy + PVP_ENERGY_REGEN);

    // Tick cooldowns
    for (const [skillId, cd] of Object.entries(currentPlayer.cooldowns)) {
        if (action === 'ability' && abilityObj && skillId === abilityObj.id) {
            continue; // Do not decrement cooldown on the turn it is applied
        }
        currentPlayer.cooldowns[skillId] = cd - 1;
        if (currentPlayer.cooldowns[skillId] <= 0) delete currentPlayer.cooldowns[skillId];
    }

    const nextPlayer = duel.players[duel.turn];

    // 💡 FIX 2026-08-04: generateDuelImage now bypasses _enqueue and uses a
    // direct axios call with its own 10s timeout. No outer Promise.race needed.
    let imageResult = null;
    try {
        imageResult = await generateDuelImage(duel);
    } catch (imgErr) {
        console.error('[PvP] Turn image failed:', imgErr.message);
        imageResult = null;
    }
    
    let statusMsg = `⚔️ *PVP DUEL · ROUND ${duel.round}*\n` +
                    `———————————\n` +
                    `${actionResult}\n\n` +
                    `🔴 *${currentPlayer.name}*${getPlayerEffectsString(currentPlayer)}: \`${Math.max(0, currentPlayer.hp)}/${currentPlayer.maxHp}\` HP · \`${Math.floor(currentPlayer.energy)}\` EN\n` +
                    `🔵 *${opponent.name}*${getPlayerEffectsString(opponent)}: \`${Math.max(0, opponent.hp)}/${opponent.maxHp}\` HP · \`${Math.floor(opponent.energy)}\` EN\n\n` +
                    `🎯 *@${economy.getDisplayName(nextPlayer.jid)}* — It's your turn!\n` +
                    `———————————\n` +
                    `🗡️ \`${botConfig.getPrefix()} combat attack\`\n` +
                    `🔮 \`${botConfig.getPrefix()} combat ability <n>\`\n` +
                    `🎒 \`${botConfig.getPrefix()} combat item\`\n` +
                    `🏃 \`${botConfig.getPrefix()} combat flee\` *(⚠️ Deducts 20% XP, 50% Wallet, and 1 random item!)*`;

    return {
        success: true,
        finished: false,
        message: statusMsg,
        image: imageResult,
        mentions: [nextPlayer.jid],
    };
}

// ==========================================
// 🔧 COMBAT HELPERS
// ==========================================

function resolveBasicAttack(attacker, defender) {
    const attackerStats = getEffectiveStats(attacker);
    const defenderStats = getEffectiveStats(defender);

    // Evasion check
    if (Math.random() * 100 < (defenderStats.evasion || 0)) {
        return { damage: 0, isCrit: false, missed: true };
    }

    let damage = Math.floor(attackerStats.atk * (0.85 + Math.random() * 0.3) * PVP_DAMAGE_MULT);
    
    // Crit
    const isCrit = Math.random() * 100 < (attackerStats.crit || 5);
    if (isCrit) damage = Math.floor(damage * PVP_CRIT_MULT);

    // Defense reduction (capped)
    const defReduction = Math.min(
        Math.floor(defenderStats.def * 0.25),
        Math.floor(damage * PVP_DEFENSE_CAP)
    );
    damage = Math.max(15, damage - defReduction);

    return { damage, isCrit, missed: false };
}

function getLearnedAbilities(userId, classId) {
    const user = economy.getUser(userId);
    if (!user?.skills) return [];
    
    const classSystem = require('./classSystem');
    const userClassData = economy.getUserClass(userId);
    const lineage = classSystem.getLineage(userClassData?.id || classId || '');
    
    const learned = [];
    const seen = new Set();
    
    for (const cId of lineage) {
        const tree = skillTree.SKILL_TREES[cId.toUpperCase()];
        if (!tree) continue;
        for (const [, treeData] of Object.entries(tree.trees)) {
            for (const [sId, skill] of Object.entries(treeData.skills)) {
                if (!seen.has(sId) && (user.skills[sId] || 0) > 0) {
                    seen.add(sId);
                    learned.push({ id: sId, ...skill });
                }
            }
        }
    }
    
    // Add mirrored skills
    if (user.borrowedSkills) {
        for (const s of user.borrowedSkills) {
            if (!seen.has(s.id)) {
                seen.add(s.id);
                learned.push(s);
            }
        }
    }
    
    return learned;
}

// ==========================================
// 🏆 FINISH DUEL
// ==========================================

// 💡 NEW 2026-08-05: Finish a summon-vs-summon duel.
// Rewards: summon XP (scaled to opponent level), loyalty cost (winner -1, loser -2),
// ELO (summonStats.arenaWins/Losses), stakes (owner pays). No player XP/Zeni/bounty.
async function finishSummonDuel(chatId, duel, winner, loser) {
    const ZENI = botConfig.getCurrency().symbol;
    const summonSystem = require('./summonSystem');
    const summonAI = require('./summonAI');

    let rewardMsg = `🐉 *SUMMON DUEL OVER!*\n`;

    // Stakes (owner pays — same as player PvP)
    if (duel.stake > 0) {
        const pot = duel.stake * 2;
        economy.addMoney(winner.jid, pot);
        rewardMsg += `💰 ${ZENI}${pot.toLocaleString()} staked pot won by ${winner._speciesName}!\n`;
    }

    // Summon XP: winner gets XP scaled to loser's level
    const summonXP = Math.max(20, Math.floor(50 + (loser.level * 10)));
    try {
        if (winner._summonDoc) {
            const xpResult = summonSystem.addSummonXP(winner._summonDoc, summonXP);
            rewardMsg += `\n✨ ${winner._speciesIcon} ${winner._speciesName} gained *${summonXP}* XP!`;
            if (xpResult.leveledUp) {
                rewardMsg += `\n📈 Leveled up to L${xpResult.newLevel}!`;
            }
            if (xpResult.newlyUnlockedAbilities && xpResult.newlyUnlockedAbilities.length > 0) {
                rewardMsg += `\n🔓 *NEW ABILITIES UNLOCKED:*`;
                for (const ab of xpResult.newlyUnlockedAbilities) {
                    rewardMsg += `\n   • *${ab.name}* (Lv.${ab.levelReq}+${ab.cost > 0 ? `, ${ab.cost} EN` : ''})`;
                }
            }
            // Persist winner summon
            summonAI.persistSummonChanges(winner).catch(() => {});
        }
    } catch (e) {
        console.error('[SummonDuel] Winner XP award failed:', e.message);
    }

    // Loyalty cost: winner -1, loser -2
    try {
        if (winner._summonDoc) {
            winner._summonDoc.loyalty = Math.max(0, (winner._summonDoc.loyalty || 0) - 1);
        }
        if (loser._summonDoc) {
            loser._summonDoc.loyalty = Math.max(0, (loser._summonDoc.loyalty || 0) - 2);
        }
        rewardMsg += `\n💖 Loyalty: ${winner._speciesName} -1, ${loser._speciesName} -2`;
    } catch (e) {}

    // ELO: summonStats.arenaWins/Losses
    try {
        const winnerUser = economy.getUser(winner.jid);
        const loserUser = economy.getUser(loser.jid);
        if (winnerUser) {
            winnerUser.summonStats = winnerUser.summonStats || {};
            winnerUser.summonStats.arenaWins = (winnerUser.summonStats.arenaWins || 0) + 1;
            economy.saveUser(winner.jid);
        }
        if (loserUser) {
            loserUser.summonStats = loserUser.summonStats || {};
            loserUser.summonStats.arenaLosses = (loserUser.summonStats.arenaLosses || 0) + 1;
            economy.saveUser(loser.jid);
        }
    } catch (e) {}

    activeDuels.delete(chatId);

    const finalMsg = `🏆 *${winner._speciesName}* wins the summon duel!\n\n${rewardMsg}`;

    // Send final message
    try {
        const engine = require('../engine');
        const sock = engine.getSock();
        if (sock) {
            await sock.sendMessage(chatId, { text: BOT_MARKER + finalMsg });
        }
    } catch (e) {}

    return { success: true, finished: true, message: finalMsg };
}

async function finishDuel(chatId, duel, winner, loser) {
    const ZENI = botConfig.getCurrency().symbol;

    // 💡 NEW 2026-08-05: Summon duel mode — different reward structure.
    // - Summon gets XP (scaled to opponent summon's level)
    // - Loyalty: winner -1, loser -2
    // - ELO: summonStats.arenaWins/Losses
    // - Stakes: owner pays (same as player PvP)
    // - Skip: player XP, Zeni prize, bounty, guild war points
    if (duel.mode === 'summon') {
        return await finishSummonDuel(chatId, duel, winner, loser);
    }

    const xpGain = Math.floor(80 + (loser.level * 15));

    let rewardMsg = '';
    if (duel.stake > 0) {
        const pot = duel.stake * 2;
        economy.addMoney(winner.jid, pot);
        rewardMsg = `💰 Won ${ZENI}${pot.toLocaleString()} (staked pot)`;
    } else {
        const goldBonus = Math.floor(150 + (loser.level * 40));
        economy.addMoney(winner.jid, goldBonus);
        rewardMsg = `💰 ${ZENI}${goldBonus.toLocaleString()} prize`;
    }

    progression.addXP(winner.jid, xpGain, 'PvP Victory');

    // 💡 FIX 2026-08-03 (bug report #3): Award summon XP to the winner's
    // deployed summon. PvP combat doesn't go through recordEnemyKill (no
    // 'enemy' entity — both combatants are players), so we award XP here
    // at duel end based on the loser's level.
    try {
        if (duel.summons && duel.summons.length > 0) {
            const summonSystem = require('./summonSystem');
            const summonAI = require('./summonAI');
            // Winner's summon gets XP based on loser's level (same as player XP)
            const summonXP = Math.max(10, Math.floor(xpGain * 0.5));
            for (const summonEntity of duel.summons) {
                if (summonEntity && !summonEntity.isDead && summonEntity._summonDoc &&
                    summonEntity.summonerJid === winner.jid) {
                    const xpResult = summonSystem.addSummonXP(summonEntity._summonDoc, summonXP);
                    if (xpResult.leveledUp) {
                        rewardMsg += `\n✨ ${summonEntity.icon} ${summonEntity.name} leveled up to L${xpResult.newLevel}!`;
                    }
                    // 💡 NEW 2026-08-05: Notify newly unlocked abilities
                    if (xpResult.newlyUnlockedAbilities && xpResult.newlyUnlockedAbilities.length > 0) {
                        rewardMsg += `\n🔓 *NEW ABILITIES UNLOCKED* for ${summonEntity.name}:`;
                        for (const ab of xpResult.newlyUnlockedAbilities) {
                            rewardMsg += `\n   • *${ab.name}* (Lv.${ab.levelReq}+${ab.cost > 0 ? `, ${ab.cost} EN` : ''})`;
                        }
                    }
                    // Persist async
                    summonAI.persistSummonChanges(summonEntity).catch(() => {});
                }
            }
        }
    } catch (e) {
        console.error('[PvP] Summon XP award failed:', e.message);
    }

    // Update PvP stats
    const winnerUser = economy.getUser(winner.jid);
    const loserUser = economy.getUser(loser.jid);
    let bountyClaimMsg = '';
    if (winnerUser) {
        winnerUser.pvpWins = (winnerUser.pvpWins || 0) + 1;
        economy.saveUser(winner.jid);
        // 💡 Phase 2: Award guild XP + war points for PvP win
        try {
            const guildPerks = require('./guildPerks');
            guildPerks.awardGuildXp(winner.jid, 5, 'PvP win');
            guildPerks.awardWarPoints(winner.jid, 5, 'pvp');
        } catch (e) {}
        // 💡 Phase 6: Check if loser had an active bounty — claim it
        try {
            const bountySystem = require('./bountySystem');
            const bountyCheck = await bountySystem.getBountiesOnTarget(loser.jid);
            if (bountyCheck.length > 0) {
                const claimResult = await bountySystem.claimBounty(winner.jid, loser.jid);
                if (claimResult.claimed) {
                    bountyClaimMsg = '\n' + claimResult.message;
                }
            }
        } catch (e) {
            console.error('[BountyClaim] Failed:', e.message);
        }
    }
    if (loserUser) {
        loserUser.pvpLosses = (loserUser.pvpLosses || 0) + 1;
        economy.saveUser(loser.jid);
        // 💡 AUDIT FIX 2026-08-01 (Round 1): call failedHuntPenalty when the
        // LOSER was the hunter (i.e. the WINNER had an active bounty on them).
        // This was NEVER called — the function existed but no code invoked it.
        // Consequences:
        //   1. Hunter paid 0 penalty for losing (should pay 10% of bounty)
        //   2. defendersWon counter never incremented
        //   3. Bounty never auto-terminated by defender wins (the feature I
        //      added in the prior pass was dead code without this call)
        // Now: if the winner had an active bounty, the loser (hunter) pays
        // the penalty + the winner's defendersWon counter increments.
        let failedHuntMsg = '';
        try {
            const bountySystem = require('./bountySystem');
            const bountyCheckOnWinner = await bountySystem.getBountiesOnTarget(winner.jid);
            if (bountyCheckOnWinner.length > 0) {
                // The winner was a bounty target who just defeated a hunter
                const penaltyResult = await bountySystem.failedHuntPenalty(loser.jid, winner.jid);
                if (penaltyResult.success && penaltyResult.penaltyPaid > 0) {
                    failedHuntMsg = `\n💸 *BOUNTY HUNT FAILED:* ${loser.name} paid ${penaltyResult.penaltyPaid.toLocaleString()} ${ZENI} penalty to ${winner.name}.`;
                    if (penaltyResult.defendedBounties && penaltyResult.defendedBounties.length > 0) {
                        failedHuntMsg += `\n🛡️ *BOUNTY DEFENDED!* ${winner.name} defeated 3 challengers — bounty cleared!`;
                    }
                }
            }
        } catch (e) {
            console.error('[FailedHuntPenalty] Failed:', e.message);
        }
        bountyClaimMsg += failedHuntMsg;
    }

    let msg = `🏆 *DUEL RESULT* 🏆\n`;
    msg += `———————————\n`;
    msg += `👑 *Winner:* ${winner.name}\n`;
    msg += `💀 *Defeated:* ${loser.name}\n\n`;
    msg += `🎁 *Rewards:*\n`;
    msg += `   ↳ ${rewardMsg}\n`;
    msg += `   ↳ ⭐ +${xpGain} XP\n` + bountyClaimMsg;
    
    return msg;
}

// ==========================================
// 🎨 IMAGE GENERATION
// ==========================================

async function generateDuelImage(duel) {
    // 💡 FIX 2026-08-08: Players array is ALWAYS [player1, player2] in fixed slot order.
    // Previously this was [attacker, defender] which swapped the array order each turn,
    // causing sprites to swap positions/facing/HP bars. The turn indicator
    // (action.attackerIndex) handles highlighting the correct player without
    // needing to reorder the array.
    const players = duel.players; // Fixed slot order: [0]=left, [1]=right

    return await combatImageGenerator.generateCombatImage(
        players, [],
        {
            combatType: 'PVP',
            bypassQueue: true,
            summons: duel.summons || [],
            action: {
                attackerSide: 'player',
                attackerIndex: duel.turn || 0,
                targetSide: 'player',
                targetIndex: 1 - (duel.turn || 0),
                skillName: '',
                element: 'physical',
                damage: 0,
                isCrit: false,
                missed: false,
                heal: 0,
            },
        }
    );
}

// ==========================================
// ⏱️ MAINTENANCE SWEEPER
// ==========================================

setInterval(() => {
    const now = Date.now();
    
    for (const [chatId, invite] of duelInvites.entries()) {
        if (now - invite.timestamp > CHALLENGE_TIMEOUT) {
            duelInvites.delete(chatId);
        }
    }
    
    for (const [chatId, duel] of activeDuels.entries()) {
        if (now - duel.lastAction > PVP_TIMEOUT_MS) {
            activeDuels.delete(chatId);
            const engine = require('../engine');
            const sock = engine.getSock();
            if (sock) {
                sock.sendMessage(chatId, { 
                    text: `⌛ *DUEL EXPIRED!*\n\nThe duel was cancelled due to ${Math.floor(PVP_TIMEOUT_MS / 60000)} minutes of inactivity.`
                }).catch(() => {});
            }
        }
    }
}, 60000);


module.exports = {
    getDuel,
    getInvite,
    challengePlayer,
    acceptChallenge,
    declineChallenge,
    cancelDuel,
    handlePvPAction,
};
