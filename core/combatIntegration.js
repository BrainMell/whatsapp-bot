// ============================================
// ⚔️ COMBAT IMAGE INTEGRATION
// ============================================
// Integrates image generation with combat system

const combatImageGen = require('./combatImageGenerator');
const GoImageService = require('./goImageService');
const fs = require('fs');
const path = require('path');

const goService = new GoImageService();

// ==========================================
// 🎨 COMBAT SCENE RENDERING
// ==========================================

/*
 * Generate initial combat scene
 */
async function renderCombatStart(players, enemies, encounterInfo) {
    try {
        const result = await combatImageGen.generateCombatImage(players, enemies, {
            rank: encounterInfo.rank,
            backgroundPath: encounterInfo.backgroundPath // Pass if available
        });
        
        return result;
    } catch (error) {
        console.error('Combat start render error:', error);
        return { success: false, error: error.message };
    }
}

/*
 * Update combat scene after a turn
 */
async function renderCombatTurn(players, enemies, turnInfo, options = {}) {
    try {
        // Filter out dead units
        let playersToShow = players.filter(p => p.currentHP > 0 || p.justDied);
        const enemiesToShow = enemies.filter(e => e.currentHP > 0 || e.justDied);
        
        const result = await combatImageGen.updateCombatImage(
            playersToShow, 
            enemiesToShow, 
            turnInfo,
            {
                rank: options.rank,
                backgroundPath: options.backgroundPath
            }
        );
        
        return result;
    } catch (error) {
        console.error('Combat turn render error:', error);
        return { success: false, error: error.message };
    }
}

/*
 * Generate victory/defeat screen
 */
async function renderCombatEnd(players, enemies, victory, rewards = null, options = {}) {
    try {
        const text = victory ? "ENCOUNTER COMPLETE" : "DEFEATED";
        return await combatImageGen.generateEndScreenImage(text);
    } catch (error) {
        console.error('Combat end render error:', error);
        return { success: false, error: error.message };
    }
}
// ==========================================
// 📝 CAPTION GENERATION
// ==========================================

/*
 * Generate caption for combat start
 */
function generateStartCaption(players, enemies, encounterInfo) {
    let caption = `┏━━━━━━━━━━━━━━━┓\n`;
    caption += `┃   ⚔️ BATTLE START\n`;
    caption += `┗━━━━━━━━━━━━━━━┛\n\n`;
    
    if (encounterInfo.narration) {
        caption += `📜 ${encounterInfo.narration}\n\n`;
    }
    
    caption += `📍 *${encounterInfo.theme.theme}*\n`;
    caption += `_${encounterInfo.theme.description}_\n\n`;
    
    caption += `👥 *PARTY:*\n`;
    for (const player of players) {
        const classIcon = player.class?.icon || '⚔️';
        caption += `${classIcon} ${player.name} (Lv.${player.level})\n`;
        caption += `➤ ❤️ ${player.currentHP}/${player.stats.maxHp || player.stats.hp}\n`;
        caption += `➤ 💙 ${player.energy || 100}/100\n`;
        
        // Show equipment if available
        if (player.equipment) {
            const equippedItems = Object.entries(player.equipment)
                .filter(([slot, item]) => item !== null)
                .map(([slot, item]) => item.name);
            if (equippedItems.length > 0) {
                caption += `▫️ Gear: ${equippedItems.join(', ')}\n`;
            }
        }
    }
    
    caption += `\n👹 *ENEMIES:*\n`;
    for (const enemy of enemies) {
        const maxHp = enemy.stats?.maxHp || enemy.stats?.hp || 100;
        const hpPercent = Math.floor((enemy.currentHP / maxHp) * 100);
        const hpBar = createMiniBar(hpPercent, 5);
        caption += `${enemy.icon} ${enemy.name}${enemy.isBoss ? ' 👑' : ''}\n`;
        caption += `➤ ${hpBar} ${enemy.currentHP}/${maxHp}\n`;
    }
    
    caption += `\n━━━━━━━━━━━━━━━\n`;
    caption += `⏰ *Waiting for actions...*`;
    
    return caption;
}

/*
 * Generate caption for combat turn
 */
function generateTurnCaption(players, enemies, turnInfo) {
    let caption = `┏━━━━━━━━━━━━━━━┓\n`;
    caption += `┃   🎮 TURN ${turnInfo.turnNumber}\n`;
    caption += `┗━━━━━━━━━━━━━━━┛\n\n`;
    
    // Show what happened this turn
    if (turnInfo.action) {
        let actionVerb = "used";
        const actor = turnInfo.actor;
        
        // ⚔️ WEAPON WEIGHT LOGIC
        if (!actor.isEnemy && actor.equipment?.main_hand) {
            const weapon = actor.equipment.main_hand;
            const name = weapon.name.toLowerCase();
            if (name.includes('hammer') || name.includes('club') || name.includes('mace')) actionVerb = "🔨 SMASHES with";
            else if (name.includes('sword') || name.includes('blade') || name.includes('sabre')) actionVerb = "⚔️ SLASHES with";
            else if (name.includes('dagger') || name.includes('knife') || name.includes('spear')) actionVerb = "🗡️ PIERCES with";
            else if (name.includes('staff') || name.includes('wand')) actionVerb = "🔮 CASTS via";
        } else if (actor.isEnemy) {
            actionVerb = "unleashed";
        }

        caption += `⚡ *${actor.name}* ${actionVerb} *${turnInfo.action.name}*!\n`;
        
        if (turnInfo.damage) {
            caption += `💥 Dealt ${turnInfo.damage} damage!\n`;
        }
        
        if (turnInfo.healing) {
            caption += `💚 Healed ${turnInfo.healing} HP!\n`;
        }
        
        if (turnInfo.effects && turnInfo.effects.length > 0) {
            caption += `✨ Effects: ${turnInfo.effects.join(', ')}\n`;
        }
        
        caption += `\n`;
    }
    
    // Show current status
    caption += `👥 *PARTY STATUS:*\n`;
    for (const player of players) {
        if (player.currentHP <= 0) {
            caption += `💀 ${player.name} - *DEFEATED*\n`;
        } else {
            const hpPercent = Math.floor((player.currentHP / (player.stats.maxHp || player.stats.hp)) * 100);
            const hpBar = createMiniBar(hpPercent, 10);
            
            // ☣️ STATUS TAG VISUALS
            let statusPrefix = "";
            if (player.statusEffects?.some(e => e.type === 'poison')) statusPrefix = "☣️ ";
            else if (player.statusEffects?.some(e => e.type === 'burn')) statusPrefix = "🔥 ";
            else if (player.statusEffects?.some(e => e.type === 'stun')) statusPrefix = "💫 ";
            else if (player.statusEffects?.some(e => e.type === 'bleed')) statusPrefix = "🩸 ";

            caption += `${player.class?.icon || '⚔️'} ${statusPrefix}${player.name}\n`;
            caption += `➤ ${hpBar} ${player.currentHP}/${player.stats.maxHp || player.stats.hp}\n`;
        }
    }

    caption += `\n👹 *ENEMIES:*\n`;
    for (const enemy of enemies) {
        if (enemy.currentHP <= 0) {
            caption += `💀 ${enemy.name} - *SLAIN*\n`;
        } else {
            const maxHp = enemy.stats?.maxHp || enemy.stats?.hp || 100;
            const hpPercent = Math.floor((enemy.currentHP / maxHp) * 100);
            const hpBar = createMiniBar(hpPercent, 5);
            
            // Status visual for enemies too
            let statusPrefix = "";
            if (enemy.statusEffects?.some(e => e.type === 'poison')) statusPrefix = "☣️ ";
            else if (enemy.statusEffects?.some(e => e.type === 'burn')) statusPrefix = "🔥 ";

            caption += `${enemy.icon} ${statusPrefix}${enemy.name}\n`;
            caption += `➤ ${hpBar} ${enemy.currentHP}/${maxHp}\n`;
        }
    }
    
    caption += `\n━━━━━━━━━━━━━━━\n`;
    caption += `⏰ *Next turn...*`;
    
    return caption;
}

/*
 * Generate caption for combat end
 */
function generateEndCaption(players, enemies, victory, rewards) {
    const ZENI_SYM = botConfig.getCurrency().symbol;
    let caption = `┏━━━━━━━━━━━━━━━┓\n`;
    
    if (victory) {
        caption += `┃   🎉 VICTORY!\n`;
        caption += `┗━━━━━━━━━━━━━━━┛\n\n`;
        
        caption += `✨ *Battle Complete!*\n\n`;
        
        if (rewards) {
            caption += `🎁 *REWARDS:*\n`;
            caption += `💰 ${ZENI_SYM}: ${rewards.gold.toLocaleString()}\n`;
            caption += `⭐ XP: ${rewards.xp.toLocaleString()}\n`;
            
            if (rewards.items && rewards.items.length > 0) {
                caption += `\n📦 *ITEMS:*\n`;
                for (const item of rewards.items) {
                    caption += `• ${item.name}\n`;
                }
            }
        }
        
        caption += `\n👥 *Survivors:*\n`;
        for (const player of players) {
            if (player.currentHP > 0) {
                caption += `✅ ${player.name} - ${player.currentHP}/${player.stats.maxHp || player.stats.hp} HP\n`;
            }
        }
    } else {
        caption += `┃   💀 DEFEAT\n`;
        caption += `┗━━━━━━━━━━━━━━━┛\n\n`;
        
        caption += `The party has been wiped out...\n\n`;
        
        caption += `💀 *Fallen Heroes:*\n`;
        for (const player of players) {
            caption += `• ${player.name}\n`;
        }
    }
    
    caption += `\n━━━━━━━━━━━━━━━`;
    return caption;
}

// ==========================================
// 🛠️ HELPER FUNCTIONS
// ==========================================

function createMiniBar(percent, length = 10) {
    const safePercent = isNaN(percent) ? 0 : Math.max(0, Math.min(100, percent));
    const filled = Math.floor((safePercent / 100) * length);
    const empty = Math.max(0, length - filled);
    
    let color;
    if (safePercent > 60) color = '🟢';
    else if (safePercent > 30) color = '🟡';
    else color = '🔴';
    
    return `${color} [${'█'.repeat(filled)}${'░'.repeat(empty)}] ${Math.floor(safePercent)}%`;
}

function ensureTempDirectory() {
    if (!fs.existsSync('./temp')) {
        fs.mkdirSync('./temp', { recursive: true });
    }
}

// ==========================================
// 🎯 MAIN INTEGRATION FUNCTION
// ==========================================

/*
 * Complete combat image + caption generation
 */
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
            return {
                success: false,
                error: 'Invalid phase'
            };
    }
    
    if (!imageResult.success) {
        return imageResult;
    }
    
    return {
        success: true,
        buffer: imageResult.buffer, // Pass buffer
        imagePath: imageResult.path, // Pass path if available (legacy)
        caption: caption,
        width: imageResult.width,
        height: imageResult.height,
        backgroundPath: options.backgroundPath // Pass through for state consistency
    };
}

// ==========================================
// 📤 EXPORTS
// ==========================================

module.exports = {
    renderCombatStart,
    renderCombatTurn,
    renderCombatEnd,
    generateStartCaption,
    generateTurnCaption,
    generateEndCaption,
    generateCombatScene,
    createMiniBar
};
