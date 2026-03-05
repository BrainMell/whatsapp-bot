// ============================================
// ⚔️ COMBAT SCENE INTEGRATION
// ============================================

const combatImageGen = require('./combatImageGenerator');
const botConfig = require('../botConfig');
const fs = require('fs');

// ==========================================
// 🎨 COMBAT SCENE RENDERING
// ==========================================

async function renderCombatStart(players, enemies, encounterInfo) {
    try {
        const result = await combatImageGen.generateCombatImage(players, enemies, {
            rank: encounterInfo.rank,
            backgroundPath: encounterInfo.backgroundPath
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
            { rank: options.rank, backgroundPath: options.backgroundPath }
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
    
    let caption = `╔══════════════════════════╗\n`;
    caption += `   ⚔️ *BATTLE COMMENCES!*\n`;
    caption += `╚══════════════════════════╝\n\n`;
    
    if (encounterInfo.narration) {
        caption += `📜 _${encounterInfo.narration}_\n\n`;
    }
    
    caption += `${rankBadge} *${encounterInfo.theme?.theme || 'Unknown Territory'}* ${rankBadge}\n`;
    if (encounterInfo.theme?.description) {
        caption += `_${encounterInfo.theme.description}_\n`;
    }
    caption += `\n`;
    
    // Party block
    caption += `┌─────── 👥 PARTY ───────┐\n`;
    for (const player of players) {
        const classIcon = player.class?.icon || '⚔️';
        const maxHp = player.stats?.maxHp || player.stats?.hp || 1;
        const hpPct = Math.max(0, Math.floor((player.currentHP / maxHp) * 100));
        const hpBar = createHPBar(hpPct, 8);
        const energy = player.energy ?? 100;
        
        caption += `│ ${classIcon} *${player.name}* (Lv.${player.level})\n`;
        caption += `│  ❤️ ${hpBar} ${player.currentHP}/${maxHp}\n`;
        caption += `│  ⚡ ${createEnergyPips(energy)} ${energy}/100\n`;
        
        if (player.equipment) {
            const gear = Object.values(player.equipment).filter(Boolean).map(i => i.name).join(', ');
            if (gear) caption += `│  ⚙️ _${gear}_\n`;
        }
    }
    caption += `└────────────────────────┘\n\n`;
    
    // Enemies block
    caption += `┌────── 👹 ENEMIES ──────┐\n`;
    for (const enemy of enemies) {
        const maxHp = enemy.stats?.maxHp || enemy.stats?.hp || 100;
        const hpPct = Math.max(0, Math.floor((enemy.currentHP / maxHp) * 100));
        const hpBar = createHPBar(hpPct, 8);
        const bossTag = enemy.isBoss ? ' 👑 *BOSS*' : '';
        
        caption += `│ ${enemy.icon || '👹'} *${enemy.name}*${bossTag}\n`;
        caption += `│  ❤️ ${hpBar} ${enemy.currentHP}/${maxHp}\n`;
    }
    caption += `└────────────────────────┘\n\n`;
    
    caption += `⏳ _Awaiting first action..._`;
    return caption;
}

function generateTurnCaption(players, enemies, turnInfo) {
    const actor = turnInfo.actor;
    
    // Dynamic action verb based on weapon/actor type
    let actionVerb = actor?.isEnemy ? 'unleashes' : 'uses';
    if (actor?.equipment?.main_hand) {
        const wName = actor.equipment.main_hand.name?.toLowerCase() || '';
        if (/hammer|club|mace|maul/.test(wName)) actionVerb = '🔨 *SMASHES* with';
        else if (/sword|blade|sabre|falchion/.test(wName)) actionVerb = '⚔️ *SLASHES* with';
        else if (/dagger|knife|spear|lance/.test(wName)) actionVerb = '🗡️ *PIERCES* with';
        else if (/staff|wand|rod/.test(wName)) actionVerb = '🔮 *CASTS* via';
        else if (/bow|crossbow/.test(wName)) actionVerb = '🏹 *SHOOTS* with';
    }
    
    let caption = `╔══════════════════════════╗\n`;
    caption += `   🎮 *TURN ${turnInfo.turnNumber}*\n`;
    caption += `╚══════════════════════════╝\n\n`;
    
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
    
    // Party status
    caption += `┌─── 👥 PARTY ───┐\n`;
    for (const player of players) {
        if (player.currentHP <= 0) {
            caption += `│ 💀 ~~${player.name}~~ — *DOWN*\n`;
            continue;
        }
        const maxHp = player.stats?.maxHp || player.stats?.hp || 1;
        const hpPct = Math.max(0, Math.floor((player.currentHP / maxHp) * 100));
        const hpBar = createHPBar(hpPct, 8);
        
        // Status effect prefix
        const statusTag = getStatusTag(player.statusEffects);
        caption += `│ ${player.class?.icon || '⚔️'} ${statusTag}*${player.name}*\n`;
        caption += `│  ${hpBar} ${player.currentHP}/${maxHp}\n`;
    }
    caption += `└─────────────────┘\n\n`;
    
    // Enemy status
    caption += `┌─── 👹 ENEMIES ───┐\n`;
    for (const enemy of enemies) {
        if (enemy.currentHP <= 0) {
            caption += `│ 💀 ~~${enemy.name}~~ — *SLAIN*\n`;
            continue;
        }
        const maxHp = enemy.stats?.maxHp || enemy.stats?.hp || 100;
        const hpPct = Math.max(0, Math.floor((enemy.currentHP / maxHp) * 100));
        const hpBar = createHPBar(hpPct, 8);
        const statusTag = getStatusTag(enemy.statusEffects);
        
        caption += `│ ${enemy.icon || '👹'} ${statusTag}*${enemy.name}*\n`;
        caption += `│  ${hpBar} ${enemy.currentHP}/${maxHp}\n`;
    }
    caption += `└──────────────────┘\n\n`;
    
    caption += `⏳ _Next action loading..._`;
    return caption;
}

function generateEndCaption(players, enemies, victory, rewards) {
    const ZENI = botConfig.getCurrency().symbol;
    
    if (victory) {
        let caption = `╔══════════════════════════╗\n`;
        caption += `   🏆 *VICTORY!*\n`;
        caption += `╚══════════════════════════╝\n\n`;
        
        if (rewards) {
            caption += `┌──── 🎁 REWARDS ────┐\n`;
            caption += `│ 💰 ${ZENI}${rewards.gold.toLocaleString()} Gold\n`;
            caption += `│ ⭐ ${rewards.xp.toLocaleString()} XP\n`;
            if (rewards.items?.length > 0) {
                caption += `│ 📦 ${rewards.items.map(i => i.name).join(', ')}\n`;
            }
            caption += `└────────────────────┘\n\n`;
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
        let caption = `╔══════════════════════════╗\n`;
        caption += `   💀 *PARTY WIPED*\n`;
        caption += `╚══════════════════════════╝\n\n`;
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
        rank = null
    } = options;
    
    let imageResult;
    let caption;
    
    switch (phase) {
        case 'START':
            imageResult = await renderCombatStart(players, enemies, encounterInfo);
            caption = generateStartCaption(players, enemies, encounterInfo);
            break;
            
        case 'TURN':
            imageResult = await renderCombatTurn(players, enemies, turnInfo, { backgroundPath, rank });
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
