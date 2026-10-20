// ============================================
// ⚔️ COMBAT SCENE INTEGRATION
// ============================================

const combatImageGen = require('./combatImageGenerator');
const botConfig = require('../../botConfig');
const fs = require('fs');

// ==========================================
// 🎨 COMBAT SCENE RENDERING
// ==========================================

async function renderCombatStart(players, enemies, encounterInfo) {
    try {
        // 💡 DUNGEON FAST-LANE (2026-10-20 owner: "dungeons are very inconsistent,
        // make it fast and lightweight"): static combat renders are 1-3s jobs that
        // must NOT wait behind slow GIF/roster renders in the shared _enqueue
        // semaphore. Queued lane measured: busy queue -> up to 20s waitMs -> the
        // caller's 10s race fires -> text-only fallback = the classic
        // "sometimes image, sometimes text" dungeon roulette. PvP duels already
        // bypass (see generateCombatImageDirect history); dungeons now do too.
        const result = await combatImageGen.generateCombatImage(players, enemies, {
            rank: encounterInfo.rank,
            floor: encounterInfo.floor || 0,
            backgroundPath: encounterInfo.backgroundPath,
            // 💡 Phase 7: Pass summons through to the Go service
            summons: encounterInfo.summons || [],
            // ⚔️ ruins encounter scene: square map panel replaces Options_menu
            encounter: encounterInfo.encounter || undefined,
            bypassQueue: true
        });
        return result;
    } catch (error) {
        console.error('Combat start render error:', error);
        return { success: false, error: error.message };
    }
}

async function renderCombatTurn(players, enemies, turnInfo, options = {}) {
    try {
        // 💀 FIX 2026-10-11 (owner fight-card audit): send the FULL ROSTER
        // every turn — dead enemies included (they carry justDied + 0 HP and
        // the Go renderer hides them itself). The old filter
        // `e.currentHP > 0 || e.justDied` had two failure modes:
        //   1. enemies built without a currentHP field (createEnemy sets only
        //      stats.hp) were ALL dropped on TURN renders → the classic
        //      "defend card shows no enemy at all" report;
        //   2. compacting the array shifted every survivor into the dead
        //      enemy's slot: positions repacked, sprites reshuffled and the
        //      last slot went empty ("the dead one stays visible while an
        //      enemy in another position disappears").
        // The Go service keys positions/sprites off the original roster index,
        // so the roster it receives must never be compacted mid-fight.
        const playersToShow = players.filter(p => ((p.currentHP ?? p.stats?.hp) > 0) || p.justDied);
        const enemiesToShow = enemies;

        // Build animation action payload from turnInfo (if actionable)
        // The Go service uses this to render VFX, sprite reactions, and HP interpolation.
        const animAction = buildAnimationAction(turnInfo, options);

        const result = await combatImageGen.updateCombatImage(
            playersToShow, enemiesToShow, turnInfo,
            {
                rank: options.rank,
                floor: options.floor || 0,
                backgroundPath: options.backgroundPath,
                summons: options.summons || [],
                action: animAction,  // null if no actionable attack
                // 💡 DUNGEON FAST-LANE (2026-10-20): turn renders take the direct
                // express lane (1-3s) instead of queueing behind GIF renders —
                // same rationale as renderCombatStart above.
                bypassQueue: true
            }
        );
        return result;
    } catch (error) {
        console.error('Combat turn render error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Build the animation action payload from turnInfo.
 * Returns null for non-actionable turns (rest, flee, defend, charge-up).
 *
 * The animator needs to know:
 *   - Who is attacking (side + index)
 *   - Who is being attacked (side + index)
 *   - What element/VFX to play
 *   - Damage dealt, crit, miss, heal
 */
function buildAnimationAction(turnInfo, options = {}) {
    // 💡 FIX 2026-08-03: This function now BUILDS the action payload (instead
    // of returning null) so the static renderer can use it for the turn
    // indicator (golden ellipse under the active attacker).
    //
    // The ANIMATED MP4 path is still disabled - see updateCombatImage() below,
    // which now always uses the static PNG path. The action payload is passed
    // to the static renderer, which uses req.Action.AttackerSide + AttackerIndex
    // to draw the turn indicator.
    //
    // To re-enable animated MP4 combat: re-add the early `return null` here,
    // AND change updateCombatImage() to route to generateAnimatedCombatImage
    // when options.action is set. The Go service's /api/combat/animated
    // endpoint is unchanged and still works - it's just too slow for the
    // 512MB Box 2 instance (6-27s per MP4 encode).

    if (!turnInfo || !turnInfo.action) return null;
    const actionName = String(turnInfo.action.name || '').toLowerCase();

    // Skip non-actionable turns
    if (['rest', 'flee', 'defend', 'charging', 'charge'].some(s => actionName.includes(s))) {
        return null;
    }

    // Resolve attacker side + index
    const actor = turnInfo.actor;
    if (!actor) return null;
    const summons = options.summons || [];
    const players = options._allPlayers || [];
    const enemies = options._allEnemies || [];

    let attackerSide = null, attackerIndex = -1;
    if (actor.isEnemy) {
        attackerSide = 'enemy';
        attackerIndex = enemies.findIndex(e => e === actor || e.name === actor.name);
    } else if (actor.isSummon) {
        attackerSide = 'summon';
        attackerIndex = summons.findIndex(s => s === actor || s.name === actor.name);
    } else {
        attackerSide = 'player';
        attackerIndex = players.findIndex(p => p === actor || p.name === actor.name);
    }
    if (attackerIndex < 0) attackerSide = null;

    // Resolve target side + index
    const target = turnInfo.target;
    let targetSide = null, targetIndex = -1;
    if (target) {
        if (target.isEnemy) {
            targetSide = 'enemy';
            targetIndex = enemies.findIndex(e => e === target || e.name === target.name);
        } else if (target.isSummon) {
            targetSide = 'summon';
            targetIndex = summons.findIndex(s => s === target || s.name === target.name);
        } else {
            targetSide = 'player';
            targetIndex = players.findIndex(p => p === target || p.name === target.name);
        }
    }
    if (targetIndex < 0) targetSide = null;

    // If we can't resolve sides, skip animation (fall back to static)
    if (!attackerSide || !targetSide) return null;

    // Determine element/VFX from action name + skill info
    let element = 'physical';
    const nameLower = actionName;
    if (/fire|flame|burn|inferno|meteor|fireball/i.test(nameLower)) element = 'fire';
    else if (/ice|frost|freeze|blizzard|snow/i.test(nameLower)) element = 'ice';
    else if (/lightning|thunder|shock|bolt|zap/i.test(nameLower)) element = 'lightning';
    else if (/dark|shadow|void|necro|curse|decay/i.test(nameLower)) element = 'dark';
    else if (/holy|light|smite|divine|sanctif/i.test(nameLower)) element = 'holy';
    else if (/heal|cure|mend|regen/i.test(nameLower)) element = 'none';

    // Determine damage/heal
    const damage = Math.max(0, Math.floor(Number(turnInfo.damage) || 0));
    const heal = Math.max(0, Math.floor(Number(turnInfo.healing) || 0));
    const isCrit = Boolean(turnInfo.isCrit);
    const missed = Boolean(turnInfo.missed) || actionName.includes('miss');

    return {
        attackerSide,
        attackerIndex,
        targetSide,
        targetIndex,
        skillName: String(turnInfo.action.name || 'Attack'),
        element,
        vfx: '',  // let Go service pick based on element
        damage,
        isCrit,
        missed,
        heal
    };
}

async function renderCombatEnd(players, enemies, victory, rewards = null, options = {}) {
    try {
        // 💡 2026-09-14: extended payload for the redesigned lamoot-style
        // victory/defeat portrait card (bg_VICTORY/bg_DEFEAT). All the new
        // fields are optional - the Go side degrades gracefully when absent.
        const items = rewards?.items?.map(i => i.name).join(', ') || '';
        const p0 = (players || []).find(p => p && !p._isSummon) || (players || [])[0] || {};
        // primary enemy = the beefiest one on the field (boss battles have one)
        const e0 = (enemies || []).slice().sort((a, b) =>
            (Number(b?.stats?.maxHp || b?.maxHp) || 0) - (Number(a?.stats?.maxHp || a?.maxHp) || 0))[0] || {};
        return await combatImageGen.generateEndScreenImage(
            victory ? 'VICTORY' : 'DEFEATED',
            {
                victory,
                gold: rewards?.gold || 0,
                xp: rewards?.xp || 0,
                items,
                playerName: p0.name || '',
                playerClass: String(p0.class?.id || p0.class || '').toUpperCase(),
                playerIndex: Math.floor(Number(p0.spriteIndex) || 0),
                playerLevel: Math.floor(Number(p0.level) || 0),
                enemyName: e0.name || e0.id || '',
                enemyLevel: Math.floor(Number(e0.level || e0.stats?.level) || 0),
                enemyIndex: Math.floor(Number(e0.spriteIndex) || 0),
                enemyIsBoss: Boolean(e0.isBoss),
                // 💡 FIX 2026-09-17: wild summons render their species sprite
                // on the end card instead of a random monster.
                enemySpecies: String(e0.species || ((e0.isWildSummon || e0._isSummon) ? (e0.speciesId || e0.id) : '') || ''),
                rank: String(options.rank || ''),
                floor: Math.floor(Number(options.floor) || 0),
                // 💡 OWNER BRIEF 2026-10-09 §2: deterministic new-style fallback
                background: String(options.backgroundPath
                    ? options.backgroundPath.split(/[\\/]/).pop()
                    : 'env1.png'),
                // 💡 DUNGEON FAST-LANE (2026-10-20): the victory/defeat card is the
                // payoff moment — it must not wait behind GIF renders in the queue.
                bypassQueue: true
            }
        );
    } catch (error) {
        console.error('Combat end render error:', error);
        return { success: false, error: error.message };
    }
}

// ==========================================
// 📝 CAPTION GENERATION
// ==========================================

function generateStartCaption(players, enemies, encounterInfo) {
    const rankColors = {
        'F': '⬜', 'E': '🟫', 'D': '⬛', 'C': '🟨', 'B': '🟦', 'A': '🟩', 'S': '🟪', 'SS': '🟥', 'SSS': '🌈'
    };
    const rankBadge = rankColors[encounterInfo.rank] || '⬜';
    
    // 💡 STYLE C (2026-10-20): no `-----------` dividers anywhere in combat
    // text — the VS-PANEL family uses spacing instead of rule lines.
    let caption = `⚔️ *BATTLE COMMENCES!* ⚔️\n`;
    
    if (encounterInfo.turnOrderStr) {
        caption += `${encounterInfo.turnOrderStr}\n\n`;
    } else if (encounterInfo.narration) {
        caption += `📜 _${encounterInfo.narration}_\n\n`;
    }
    
    caption += `${rankBadge} *${encounterInfo.theme?.theme || 'Unknown Territory'}* ${rankBadge}\n`;
    if (encounterInfo.theme?.description) {
        caption += `_${encounterInfo.theme.description}_\n`;
    }
    caption += `\n`;
    
    caption += `⏳ _Awaiting first action..._`;
    return caption;
}

function generateTurnCaption(players, enemies, turnInfo) {
    // 💡 STYLE C "VS PANEL" (owner pick, 2026-10-20 session): the per-turn
    // narration that used to go out as a separate text bubble (guildAdventure
    // performAction) now rides INSIDE the battle-image caption — ONE message
    // per turn: 🆚 header, fighter bars, then the ↳ action log. WhatsApp text
    // is proportional-font, so NO box-drawing borders and no bare column
    // alignment — bars use the proven [▰▱] bracket form from the raid UI
    // family (promptPlayerAction / renderDuelistStatus), which stays aligned
    // on every phone width.
    const toStr = (n) => Number(n || 0).toLocaleString('en-US');
    const bar = (cur, max, len = 10) => {
        const safeMax = Number(max) > 0 ? Number(max) : 1;
        const filled = Math.max(0, Math.min(len, Math.round((Math.max(0, Number(cur) || 0) / safeMax) * len)));
        return '▰'.repeat(filled) + '▱'.repeat(len - filled);
    };

    let caption = `🆚 *TURN ${turnInfo.turnNumber || '?'}*\n`;

    // Party lines — co-op lists every member; fallen fighters stay visible.
    for (const p of (Array.isArray(players) ? players : [])) {
        if (!p) continue;
        const hp = Math.max(0, Math.floor(p.stats?.hp ?? p.currentHP ?? 0));
        const maxHp = Math.max(1, Math.floor(p.stats?.maxHp ?? p.maxHp ?? 1));
        const en = Math.max(0, Math.floor(p.stats?.energy ?? 0));
        const maxEn = Math.max(1, Math.floor(p.stats?.maxEnergy ?? p.maxEnergy ?? 1));
        const dead = hp <= 0;
        caption += `${dead ? '🕯️' : (p.class?.icon || '🧑')} *${p.name}* [${bar(hp, maxHp)}] \`${toStr(hp)}/${toStr(maxHp)}\` HP ⚡${Math.round((en / maxEn) * 100)}%\n`;
    }

    // Enemy lines — pack fights show every enemy; dead ones stay with 💀.
    for (const e of (Array.isArray(enemies) ? enemies : [])) {
        if (!e) continue;
        const hp = Math.max(0, Math.floor(e.stats?.hp ?? 0));
        const maxHp = Math.max(1, Math.floor(e.stats?.maxHp ?? 1));
        const dead = hp <= 0;
        caption += `${dead ? '💀' : '👾'} *${e.name}* [${bar(hp, maxHp)}] \`${toStr(hp)}/${toStr(maxHp)}\` HP ${Math.round((hp / maxHp) * 100)}%\n`;
    }

    // ↳ action block: narration lines captured from performAction via
    // turnInfo.actionLog (full fidelity — procs, OVERKILL, kills all ride
    // along), or the compact structured fallback when no log was attached.
    let lines = (Array.isArray(turnInfo.actionLog) ? turnInfo.actionLog : []).map(l => String(l).trim()).filter(Boolean);
    if (lines.length === 0 && turnInfo.action) {
        const actor = turnInfo.actor;
        const actionName = turnInfo?.action?.name || '';
        const isBasicAttack = actionName === 'Basic Attack' || actionName === 'Failed Attack' || actionName === 'Missed Attack';
        let actionVerb = actor?.isEnemy ? 'unleashes' : 'uses';
        if (isBasicAttack && actor?.equipment?.main_hand) {
            const wName = (actor.equipment.main_hand.name || '').toLowerCase();
            if (/hammer|club|mace|maul/.test(wName)) actionVerb = '🔨 *SMASHES* with';
            else if (/sword|blade|sabre|falchion/.test(wName)) actionVerb = '⚔️ *SLASHES* with';
            else if (/dagger|knife|spear|lance/.test(wName)) actionVerb = '🗡️ *PIERCES* with';
            else if (/staff|wand|rod/.test(wName)) actionVerb = '🔮 *CASTS* via';
            else if (/bow|crossbow/.test(wName)) actionVerb = '🏹 *SHOOTS* with';
        }
        lines.push(`⚡ *${actor?.name}* ${actionVerb} *${actionName}*!`);
        if (Number(turnInfo.damage) > 0) lines.push(`💥 *-${toStr(turnInfo.damage)}* damage!`);
        if (Number(turnInfo.healing) > 0) lines.push(`💚 *+${toStr(turnInfo.healing)}* HP restored!`);
        if (turnInfo.isCrit) lines.push(`💢 ★ *CRITICAL HIT!* ★`);
        if (turnInfo.missed) lines.push(`💨 *MISS!* The attack whiffed!`);
        if (turnInfo.effects?.length > 0) lines.push(`✨ ${turnInfo.effects.join(' · ')}`);
    }
    if (lines.length > 0) {
        // Caption budget guard (WhatsApp media captions ~1024 chars precedent).
        const CAP = 8;
        const shown = lines.length > CAP ? [...lines.slice(0, CAP), `… +${lines.length - CAP} more`] : lines;
        caption += `\n${shown.map(l => `↳ ${l}`).join('\n')}\n`;
    }
    return caption;
}

function generateEndCaption(players, enemies, victory, rewards) {
    const ZENI = botConfig.getCurrency().symbol;
    
    if (victory) {
        let caption = `🏆 *VICTORY!* 🏆\n\n`;
        
        if (rewards) {
            caption += `🎁 *REWARDS*\n`;
            caption += `💰 ${ZENI}${rewards.gold.toLocaleString()} ${botConfig.getCurrency().name}\n`;
            caption += `⭐ ${rewards.xp.toLocaleString()} XP\n`;
            if (rewards.items?.length > 0) {
                caption += `📦 ${rewards.items.map(i => i.name).join(', ')}\n`;
            }
            caption += `\n`;
        }
        
        const survivors = players.filter(p => p.currentHP > 0).map(p => p.name);
        if (survivors.length > 0) {
            caption += `🛡️ *Survivors:* ${survivors.join(', ')}\n`;
        }
        const fallen = players.filter(p => p.currentHP <= 0).map(p => p.name);
        if (fallen.length > 0) {
            caption += `🕯️ *Fallen:* ${fallen.join(', ')}\n`;
        }
        return caption;
    } else {
        let caption = `💀 *PARTY WIPED* 💀\n\n`;
        caption += `_The party falls into darkness..._\n\n`;
        caption += `💀 ${players.map(p => p.name).join(', ')} have been defeated.\n`;
        return caption;
    }
}

// ==========================================
// 🛠️ HELPER FUNCTIONS
// ==========================================

function createHPBar(percent, length = 8) {
    const safe = isNaN(percent) ? 0 : Math.max(0, Math.min(100, percent));
    const filled = Math.round((safe / 100) * length);
    const empty = Math.max(0, length - filled);
    
    let color;
    if (safe > 60) color = '🟢';
    else if (safe > 25) color = '🟡';
    else color = '🔴';
    
    return `${color}[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${Math.floor(safe)}%`;
}

function createMiniBar(percent, length = 10) {
    return createHPBar(percent, length);
}

function createEnergyPips(energy) {
    const filled = Math.round((energy / 100) * 5);
    return '⬡'.repeat(filled) + '⬢'.repeat(Math.max(0, 5 - filled));
}

function getStatusTag(statusEffects) {
    if (!statusEffects || statusEffects.length === 0) return '';
    const se = statusEffects[0];
    const tags = {
        'poison': '☣️ ', 'burn': '🔥 ', 'stun': '💫 ',
        'bleed': '🩸 ', 'freeze': '❄️ ', 'curse': '💀 '
    };
    return tags[se?.type] || '';
}

function ensureTempDirectory() {
    if (!fs.existsSync('./temp')) {
        fs.mkdirSync('./temp', { recursive: true });
    }
}

// ==========================================
// 🎯 MAIN INTEGRATION FUNCTION
// ==========================================

async function generateCombatScene(players, enemies, phase, options = {}) {
    ensureTempDirectory();

    const {
        turnInfo = null,
        encounterInfo = null,
        victory = false,
        rewards = null,
        backgroundPath = null,
        rank = null,
        floor = 0,
        summons = []  // 💡 Phase 7: summons passed from guildAdventure.js
    } = options;

    let imageResult;
    let caption;

    switch (phase) {
        case 'START':
            imageResult = await renderCombatStart(players, enemies, { ...encounterInfo, floor, summons });
            caption = generateStartCaption(players, enemies, encounterInfo);
            break;

        case 'TURN':
            imageResult = await renderCombatTurn(players, enemies, turnInfo, {
                backgroundPath, rank, floor, summons,
                // Pass full arrays so buildAnimationAction can resolve actor/target indices
                _allPlayers: players,
                _allEnemies: enemies
            });
            caption = generateTurnCaption(players, enemies, turnInfo);
            break;

        case 'END':
            imageResult = await renderCombatEnd(players, enemies, victory, rewards, { rank, floor, backgroundPath });
            caption = generateEndCaption(players, enemies, victory, rewards);
            break;

        default:
            return { success: false, error: 'Invalid phase' };
    }

    if (!imageResult.success) {
        return { success: false, error: imageResult.error, caption };
    }

    return {
        success: true,
        buffer: imageResult.buffer,
        imagePath: imageResult.path,
        caption,
        width: imageResult.width,
        height: imageResult.height,
        mimeType: imageResult.mimeType || 'image/png',  // 💡 NEW: 'image/png' or 'video/mp4'
        backgroundPath: options.backgroundPath
    };
}

module.exports = {
    renderCombatStart,
    renderCombatTurn,
    renderCombatEnd,
    generateStartCaption,
    generateTurnCaption,
    generateEndCaption,
    generateCombatScene,
    createMiniBar,
    createHPBar,
};
