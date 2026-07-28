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
        const result = await combatImageGen.updateCombatImage(
            playersToShow, enemiesToShow, turnInfo,
            { rank: options.rank, backgroundPath: options.backgroundPath, summons: options.summons || [] }
        );
        return result;
    } catch (error) {
        console.error('Combat turn render error:', error);
        return { success: false, error: error.message };
    }
}

async function renderCombatEnd(players, enemies, victory, rewards = null, options = {}) {
    try {
        return await combatImageGen.generateEndScreenImage(victory ? 'VICTORY' : 'DEFEATED');
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
            imageResult = await renderCombatTurn(players, enemies, turnInfo, { backgroundPath, rank, summons });
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
