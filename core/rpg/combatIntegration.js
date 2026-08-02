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
        const result = await combatImageGen.generateCombatImage(players, enemies, {
            rank: encounterInfo.rank,
            backgroundPath: encounterInfo.backgroundPath,
            // 💡 Phase 7: Pass summons through to the Go service
            summons: encounterInfo.summons || []
        });
        return result;
    } catch (error) {
        console.error('Combat start render error:', error);
        return { success: false, error: error.message };
    }
}

async function renderCombatTurn(players, enemies, turnInfo, options = {}) {
    try {
        const playersToShow = players.filter(p => p.currentHP > 0 || p.justDied);
        const enemiesToShow = enemies.filter(e => e.currentHP > 0 || e.justDied);

        // Build animation action payload from turnInfo (if actionable)
        // The Go service uses this to render VFX, sprite reactions, and HP interpolation.
        const animAction = buildAnimationAction(turnInfo, options);

        const result = await combatImageGen.updateCombatImage(
            playersToShow, enemiesToShow, turnInfo,
            {
                rank: options.rank,
                backgroundPath: options.backgroundPath,
                summons: options.summons || [],
                action: animAction  // null if no actionable attack
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
    // The ANIMATED MP4 path is still disabled — see updateCombatImage() below,
    // which now always uses the static PNG path. The action payload is passed
    // to the static renderer, which uses req.Action.AttackerSide + AttackerIndex
    // to draw the turn indicator.
    //
    // To re-enable animated MP4 combat: re-add the early `return null` here,
    // AND change updateCombatImage() to route to generateAnimatedCombatImage
    // when options.action is set. The Go service's /api/combat/animated
    // endpoint is unchanged and still works — it's just too slow for the
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
        // 💡 UPDATED 2026-07-29: Pass full rewards to the Go service so it can
        // render a richer victory/defeat scene with rewards panel.
        const items = rewards?.items?.map(i => i.name).join(', ') || '';
        return await combatImageGen.generateEndScreenImage(
            victory ? 'VICTORY' : 'DEFEATED',
            {
                victory,
                gold: rewards?.gold || 0,
                xp: rewards?.xp || 0,
                items
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
    
    let caption = `⚔️ *BATTLE COMMENCES!* ⚔️\n`;
    caption += `———————————\n`;
    
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
    const actor = turnInfo.actor;
    
    // Dynamic action verb based on weapon/actor type.
    // ⚠️ FIX 2026-07-17: only use weapon-flavored verbs (SMASHES/SLASHES/PIERCES/
    // CASTS/SHOOTS) for *basic attacks*. For named skills (Tactical Strike,
    // Cleave, Fireball, etc.) the verb should be neutral "uses" — otherwise
    // a player with a spear-equipped weapon would see "PIERCES with Fireball"
    // which makes no sense and led to user reports of "everything pierces".
    // The skill itself determines its own behavior; the weapon is irrelevant
    // when a skill is being cast.
    let actionVerb = actor?.isEnemy ? 'unleashes' : 'uses';
    const actionName = turnInfo?.action?.name || '';
    const isBasicAttack = (
        actionName === 'Basic Attack' ||
        actionName === 'Failed Attack' ||
        actionName === 'Missed Attack'
    );
    if (isBasicAttack && actor?.equipment?.main_hand) {
        const wName = (actor.equipment.main_hand.name || '').toLowerCase();
        if (/hammer|club|mace|maul/.test(wName)) actionVerb = '🔨 *SMASHES* with';
        else if (/sword|blade|sabre|falchion/.test(wName)) actionVerb = '⚔️ *SLASHES* with';
        else if (/dagger|knife|spear|lance/.test(wName)) actionVerb = '🗡️ *PIERCES* with';
        else if (/staff|wand|rod/.test(wName)) actionVerb = '🔮 *CASTS* via';
        else if (/bow|crossbow/.test(wName)) actionVerb = '🏹 *SHOOTS* with';
    }
    
    let caption = `🎮 *TURN ${turnInfo.turnNumber || '?'}*\n`;
    caption += `———————————\n`;
    
    // Action summary
    if (turnInfo.action) {
        caption += `⚡ *${actor?.name}* ${actionVerb} *${turnInfo.action.name}*!\n`;
        if (turnInfo.damage > 0) caption += `💥 *-${turnInfo.damage}* damage!\n`;
        if (turnInfo.healing > 0) caption += `💚 *+${turnInfo.healing}* HP restored!\n`;
        if (turnInfo.isCrit) caption += `💢 ★ *CRITICAL HIT!* ★\n`;
        if (turnInfo.missed) caption += `💨 *MISS!* The attack whiffed!\n`;
        if (turnInfo.effects?.length > 0) caption += `✨ ${turnInfo.effects.join(' · ')}\n`;
        caption += `\n`;
    }
    
    caption += `⏳ _Next action loading..._`;
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
        summons = []  // 💡 Phase 7: summons passed from guildAdventure.js
    } = options;

    let imageResult;
    let caption;

    switch (phase) {
        case 'START':
            imageResult = await renderCombatStart(players, enemies, { ...encounterInfo, summons });
            caption = generateStartCaption(players, enemies, encounterInfo);
            break;

        case 'TURN':
            imageResult = await renderCombatTurn(players, enemies, turnInfo, {
                backgroundPath, rank, summons,
                // Pass full arrays so buildAnimationAction can resolve actor/target indices
                _allPlayers: players,
                _allEnemies: enemies
            });
            caption = generateTurnCaption(players, enemies, turnInfo);
            break;

        case 'END':
            imageResult = await renderCombatEnd(players, enemies, victory, rewards, { rank, backgroundPath });
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
