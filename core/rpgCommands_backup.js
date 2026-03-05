// ============================================ 
// ðŸ‘¤ CHARACTER & RPG COMMANDS 
// ============================================ 

const progression = require('./progression');
const inventorySystem = require('./inventorySystem');
const lootSystem = require('./lootSystem');
const craftingSystem = require('./craftingSystem');
const economy = require('./economy');
const classSystem = require('./classSystem');
const botConfig = require('../botConfig');
const fs = require('fs');

const getPrefix = () => botConfig.getPrefix();
const getCurrency = () => botConfig.getCurrency();

// ========================================== 
// ðŸ“Š CHARACTER SHEET 
// ========================================== 

async function displayCharacterSheet(sock, chatId, senderJid, senderName) { 
    const sheet = progression.getCharacterSheet(senderJid);
    const economyUser = economy.getUser(senderJid);
    
    if (!sheet || !economyUser) { 
        await sock.sendMessage(chatId, { 
            text: `âŒ Not registered! Use \`${getPrefix()} register\` first.` 
        });
        return;
    }
    
    const classData = classSystem.getClassById(sheet.class);
    const stats = progression.getBaseStats(senderJid, sheet.class);
    const equipment = inventorySystem.getEquipment(senderJid);
    const equipStats = inventorySystem.getEquipmentStats(senderJid);
    
    let msg = `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”“
â”ƒ   ðŸ‘¤ CHAR SHEET â”ƒ
â”—â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”›

`;
    
    // Basic info
    msg += `ðŸŽ­ *Name:* ${senderName}
`;
    msg += `${classData.icon} *Class:* ${classData.name}
`;
    msg += `ðŸ† *Rank:* ${sheet.adventurerRank}-Rank
`;
    msg += `â­ *Level:* ${sheet.level}

`;
    
    // XP Progress
    const progressBar = createProgressBar(sheet.progressPercent);
    msg += `ðŸ“ˆ *Experience:*
`;
    msg += `${progressBar} ${sheet.progressPercent}%
`;
    msg += `${sheet.xpProgress.toLocaleString()}/${sheet.xpForThisLevel.toLocaleString()} XP
`;
    msg += `(${sheet.xpNeeded.toLocaleString()} needed for Lv.${sheet.level + 1})

`;
    
    // Stats
    msg += `â”â”â”â”â”â”â”â”â”â”â”â”â”
`;
    msg += `ðŸ’ª *STATS:*
`;
          msg += `â¤ï¸ HP: ${stats.hp}${equipStats.hp ? ` (+${equipStats.hp})` : ''}
      `;
          msg += `âš¡ EN: ${stats.maxEnergy}
      `;
          msg += `âš”ï¸ ATK: ${stats.atk}${equipStats.atk ? ` (+${equipStats.atk})` : ''}`;
    msg += `ðŸ›¡ï¸ DEF: ${stats.def}${equipStats.def ? ` (+${equipStats.def})` : ''}
`;
    msg += `ðŸ”® MAG: ${stats.mag}${equipStats.mag ? ` (+${equipStats.mag})` : ''}
`;
    msg += `ðŸ’¨ SPD: ${stats.spd}${equipStats.spd ? ` (+${equipStats.spd})` : ''}
`;
    msg += `ðŸ€ LUCK: ${stats.luck}${equipStats.luck ? ` (+${equipStats.luck})` : ''}
`;
    msg += `ðŸ’¥ CRIT: ${stats.crit}%â€‹${equipStats.crit ? ` (+${equipStats.crit}%)` : ''}

`;
    
    // ðŸ’¡ SECONDARY STATS
    msg += `âœ¨ *Secondary Stats:*
`;
    msg += `ðŸ•Šï¸ Evasion: ${stats.evasion.toFixed(1)}%
`;
    msg += `ðŸ›¡ï¸ Dmg Reduction: ${stats.dmgReduction.toFixed(1)}%
`;
    msg += `ðŸŽ Drop Rate: +${stats.rareDropRate.toFixed(1)}%

`;
    
    // Stat points
    if (sheet.statPoints > 0) { 
        msg += `âœ¨ *Points:* ${sheet.statPoints}
`;
        msg += `ðŸ’¡ Use: \`${getPrefix()} allocate <stat> [n]\`

`;
    }
    
    // Equipment
    msg += `â”â”â”â”â”â”â”â”â”â”â”â”â”
`;
    msg += `âš”ï¸ *EQUIPMENT:*
`;
    
    const equipped = [];
    for (const [slot, item] of Object.entries(equipment)) { 
        if (item) { 
            const itemInfo = lootSystem.getItemInfo(item.id);
            equipped.push(`${getSlotIcon(slot)} ${itemInfo.rarity ? inventorySystem.ITEM_RARITY[itemInfo.rarity].icon : 'âšª'} ${itemInfo.name}`);
        }
    }
    
    if (equipped.length > 0) { 
        msg += equipped.join('\n') + '\n';
    } else { 
        msg += `_No equipment equipped_
`;
    }
    
    msg += `
â”â”â”â”â”â”â”â”â”â”â”â”â”
`;
    msg += `ðŸ“œ *QUESTS:* ${economyUser.questsCompleted || 0}
`;
    msg += `ðŸ’° *Wealth:* ${getCurrency().symbol}${economyUser.wallet.toLocaleString()}

`;
    
    msg += `ðŸ’¡ *Commands:*
`;
    msg += `â€¢ \`${getPrefix()} inventory\` - View items
`;
    msg += `â€¢ \`${getPrefix()} allocate hp 5\` - Spend points`;
    
    // Handle PFP
    let pfpUrl;
    try { 
        pfpUrl = await sock.profilePictureUrl(senderJid, 'image');
    } catch (e) { 
        pfpUrl = null;
    }

    if (pfpUrl) { 
        await sock.sendMessage(chatId, { 
            image: { url: pfpUrl },
            caption: msg,
            mentions: [senderJid]
        });
    } else { 
        // Use placeholder from assets
        const placeholderPath = botConfig.getAssetPath('placeholder.png');
        if (fs.existsSync(placeholderPath)) { 
            await sock.sendMessage(chatId, { 
                image: fs.readFileSync(placeholderPath),
                caption: msg,
                mentions: [senderJid]
            });
        } else { 
            await sock.sendMessage(chatId, { text: msg, mentions: [senderJid] });
        }
    }
}

// ========================================== 
// ðŸ“¦ INVENTORY DISPLAY 
// ========================================== 

async function displayInventory(sock, chatId, senderJid) { 
    const formatted = inventorySystem.formatInventory(senderJid);
    const equipment = inventorySystem.getEquipment(senderJid);
    const equippedIds = Object.values(equipment).filter(item => item !== null).map(item => item.id);
    
    let msg = `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”“
â”ƒ      ðŸŽ’ BAG     â”ƒ 
â”—â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”›

`;
    
    msg += `ðŸ“¦ Slots: ${formatted.count}/${formatted.slots}

`;
    
    if (formatted.isEmpty) { 
        msg += `_Your inventory is empty!_

`;
        msg += `ðŸ’¡ Get items from quests and combat!`;
    } else { 
        let itemCounter = 1;
        // Group by rarity
        const rarityGroups = {};
        for (const item of formatted.items) { 
            if (!rarityGroups[item.rarity]) { 
                rarityGroups[item.rarity] = [];
            }
            rarityGroups[item.rarity].push(item);
        }
        
        const rarityOrder = ['MYTHIC', 'LEGENDARY', 'EPIC', 'RARE', 'UNCOMMON', 'COMMON'];
        
        for (const rarity of rarityOrder) { 
            if (rarityGroups[rarity] && rarityGroups[rarity].length > 0) { 
                const rarityInfo = inventorySystem.ITEM_RARITY[rarity];
                msg += `â”â”â” ${rarityInfo.icon} ${rarityInfo.name} â”â”â”
`;
                
                for (const item of rarityGroups[rarity]) { 
                    const itemInfo = lootSystem.getItemInfo(item.id) || { name: item.id, value: 0 };
                    const isEquipped = equippedIds.includes(item.id);
                    
                    msg += `${itemCounter}. ${rarityInfo.icon} *${itemInfo.name}*`;
                    if (item.quantity > 1) { 
                        msg += ` x${item.quantity}`;
                    }
                    if (isEquipped) { 
                        msg += ` ðŸ›¡ *[EQUIPPED]*`;
                    }
                    msg += `\n`;

                    // ðŸ’¡ STAT COMPARISON
                    if (itemInfo.type === 'EQUIPMENT' && !isEquipped) { 
                        const slot = itemInfo.slot;
                        const equippedInSlot = equipment[slot];
                        if (equippedInSlot) { 
                            const currentInfo = lootSystem.getItemInfo(equippedInSlot.id);
                            let compMsg = '   ðŸ“Š '; 
                            for (const stat of ['atk', 'def', 'mag', 'hp', 'spd']) { 
                                const delta = (itemInfo.stats?.[stat] || 0) - (currentInfo.stats?.[stat] || 0);
                                if (delta !== 0) compMsg += `${stat.toUpperCase()} ${delta > 0 ? 'ðŸŸ¢+' : 'ðŸ”´'}${delta} `;
                            }
                            msg += compMsg + '\n';
                        } else if (itemInfo.stats) { 
                            let statsMsg = '   âœ¨ '; 
                            for (const [s, v] of Object.entries(itemInfo.stats)) { 
                                statsMsg += `${s.toUpperCase()}+${v} `; 
                            }
                            msg += statsMsg + '\n';
                        }
                    }

                    msg += `   ðŸ’° Value: ${getCurrency().symbol}${itemInfo.value}
`;
                    itemCounter++;
                }
                msg += `\n`;
            }
        }
        
        msg += `â”â”â”â”â”â”â”â”â”â”â”â”â”
`;
        msg += `ðŸ’¡ *Commands:*
`;
        msg += `â€¢ \`${getPrefix()} sell <n> [qty]\` - Sell item
`;
        msg += `â€¢ \`${getPrefix()} upgrade inv\` - Expand slots`;
    }
    
    await sock.sendMessage(chatId, { text: msg });
}

// ========================================== 
// ðŸ’ª ALLOCATE STATS 
// ========================================== 

async function allocateStats(sock, chatId, senderJid, stat, amount = 1) { 
    const result = progression.allocateStatPoint(senderJid, stat.toLowerCase(), amount);
    
    if (!result.success) { 
        await sock.sendMessage(chatId, { text: `âŒ ${result.message}` });
        return;
    }
    
    const sheet = progression.getCharacterSheet(senderJid);
    
    let msg = `â”â”â”â”â”â”â”â”â”â”â”â”â”
`;
    msg += `â”ƒ âœ¨ STAT GAINED! â”ƒ
`;
    msg += `â”—â”â”â”â”â”â”â”â”â”â”â”â”â”

`;
    
    msg += `${getStatIcon(result.stat)} *${result.stat}:* +${result.valueGained}

`;
    msg += `ðŸ“Š Points Spent: ${result.pointsSpent}
`;
    msg += `ðŸ’Ž Remaining: ${result.remainingPoints}

`;
    
    msg += `â”â”â”â”â”â”â”â”â”â”â”â”â”
`;
    msg += `*NEW STATS:*
`;
    msg += `â¤ï¸ HP: ${sheet.stats.hp}
`;
    msg += `âš”ï¸ ATK: ${sheet.stats.atk}
`;
    msg += `ðŸ›¡ï¸ DEF: ${sheet.stats.def}
`;
    msg += `ðŸ”® MAG: ${sheet.stats.mag}
`;
    msg += `ðŸ’¨ SPD: ${sheet.stats.spd}
`;
    msg += `ðŸ€ LUCK: ${sheet.stats.luck}
`;
    msg += `ðŸ’¥ CRIT: ${sheet.stats.crit}%â€‹`;
    
    await sock.sendMessage(chatId, { text: msg });
}

// ========================================== 
// ðŸ”„ RESET STATS 
// ========================================== 

async function resetStats(sock, chatId, senderJid) { 
    const RESET_COST = 1000;
    const user = economy.getUser(senderJid);
    
    if (!user || user.wallet < RESET_COST) { 
        await sock.sendMessage(chatId, { 
            text: `âŒ Not enough Zeni! Need ${getCurrency().symbol}${RESET_COST}` 
        });
        return;
    }
    
    const result = progression.resetStats(senderJid);
    economy.removeMoney(senderJid, RESET_COST);
    
    await sock.sendMessage(chatId, { 
        text: `âœ… *STATS RESET!*

ðŸ’° Cost: ${getCurrency().symbol}${RESET_COST}
ðŸ’Ž Refunded: ${result.pointsRefunded} stat points
ðŸ“Š Total Points: ${result.totalPoints}

ðŸ’¡ Use \`${getPrefix()} allocate\` to re-allocate!` 
    });
}

// ========================================== 
// ðŸ† LEADERBOARD 
// ========================================== 

async function displayLeaderboard(sock, chatId, type = 'level') { 
    const leaderboard = progression.getLeaderboard(type, 10);
    
    if (leaderboard.length === 0) { 
        await sock.sendMessage(chatId, { text: 'âŒ No data available!' });
        return;
    }
    
    let msg = `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
`;
    msg += `â”ƒ   ðŸ† TOP 10     â”ƒ 
`;
    msg += `â”—â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”

`;
    
    msg += `ðŸ“Š Ranking by: ${type === 'level' ? 'Level' : 'Total XP'}

`;
    
    for (let i = 0; i < leaderboard.length; i++) { 
        const player = leaderboard[i];
        const economyUser = economy.getUser(player.userId);
        const name = economyUser?.nickname || player.userId.split('@')[0];
        
        const medal = i === 0 ? 'ðŸ¥‡' : i === 1 ? 'ðŸ¥ˆ' : i === 2 ? 'ðŸ¥‰' : `${i + 1}.`;
        msg += `${medal} *${name}*
`;
        msg += `   Level ${player.level}`;
        if (type === 'xp') { 
            msg += ` | ${player.totalXPEarned.toLocaleString()} XP`;
        }
        msg += `\n\n`;
    }
    
    await sock.sendMessage(chatId, { text: msg });
}

// ========================================== 
// ðŸ“¦ SELL ITEM 
// ========================================== 

async function sellItem(sock, chatId, senderJid, itemId, quantity = 1) { 
    let targetItemId = itemId;
    
    // Check if input is a number
    if (!isNaN(parseInt(itemId))) { 
        const inventory = inventorySystem.formatInventory(senderJid);
        const index = parseInt(itemId) - 1;
        if (!inventory.isEmpty && inventory.items[index]) { 
            targetItemId = inventory.items[index].id;
        }
    }

    const result = inventorySystem.sellItem(senderJid, targetItemId, quantity);
    
    if (!result.success) { 
        await sock.sendMessage(chatId, { text: `âŒ ${result.message}` });
        return;
    }
    
    const itemInfo = lootSystem.getItemInfo(result.itemId) || { name: result.itemId, rarity: 'COMMON' };
    const rarityIcon = inventorySystem.ITEM_RARITY[itemInfo.rarity]?.icon || 'âšª';
    
    let msg = `ðŸ’° *ITEM SOLD!*

`;
    msg += `${rarityIcon} ${itemInfo.name} x${result.quantity}
`;
    msg += `ðŸ’µ Sold for: ${getCurrency().symbol}${result.soldFor.toLocaleString()}
`;

    if (result.guildContribution) {
        msg += `ðŸ›ï¸ Guild Contribution: ${getCurrency().symbol}${result.guildContribution.amount.toLocaleString()} (${result.guildContribution.xp} XP, ${result.guildContribution.bank} Bank)
`;
    }

    if (result.remaining > 0) { 
        msg += `ðŸ“¦ Remaining: ${result.remaining}`;
    }
    
    await sock.sendMessage(chatId, { text: msg });
}

// ========================================== 
// ðŸŽ UPGRADE INVENTORY 
// ========================================== 

async function upgradeInventory(sock, chatId, senderJid) { 
    const result = inventorySystem.upgradeInventory(senderJid);
    
    if (!result.success) { 
        await sock.sendMessage(chatId, { text: `âŒ ${result.message}` });
        return;
    }
    
    let msg = `â”â”â”â”â”â”â”â”â”â”â”â”â”
`;
    msg += `â”ƒ âœ¨ BAG UPGRADE  â”ƒ 
`;
    msg += `â”—â”â”â”â”â”â”â”â”â”â”â”â”â”

`;
    msg += `ðŸ’° Cost: ${getCurrency().symbol}${result.cost.toLocaleString()}
`;
    msg += `ðŸ“¦ Slots: ${result.oldSlots} â†’ ${result.newSlots}
`;
    msg += `ðŸŽ Gained: +${result.slotsGained} slots`;
    
    await sock.sendMessage(chatId, { text: msg });
}

// ========================================== 
// âš”ï¸EQUIPMENT COMMANDS 
// ========================================== 

async function equipItem(sock, chatId, senderJid, itemId, slot) { 
    const equipment = inventorySystem.getEquipment(senderJid);
    if (!equipment) return;

    if (!itemId || !slot) { 
        let msg = `â”â”â”â”â”â”â”â”â”â”â”â”â”
`;
        msg += `â”ƒ   ðŸ›¡EQUIPMENT  â”ƒ 
`;
        msg += `â”—â”â”â”â”â”â”â”â”â”â”â”â”â”

`;
        
        // List every slot and its current status
        const slots = Object.values(inventorySystem.EQUIPMENT_SLOTS);
        
        slots.forEach(slotName => { 
            const item = equipment[slotName];
            const icon = getSlotIcon(slotName);
            const title = slotName.charAt(0).toUpperCase() + slotName.slice(1);
            
            if (item) { 
                const itemInfo = lootSystem.getItemInfo(item.id);
                msg += `${icon} *${title}*: ${itemInfo.name}
`;
                msg += `   ðŸ†” ID: \`${item.id}\`

`;
            } else { 
                msg += `${icon} *${title}*: _Empty_

`;
            }
        });
        
        msg += `â”â”â”â”â”â”â”â”â”â”â”â”â”
`;
        msg += `ðŸ“– *HOW TO EQUIP:*
`;
        msg += `Type: \`${getPrefix()} equip <# or id> <slot>\`
`;
        msg += `ðŸ“Œ Example: \`${getPrefix()} equip 1 weapon\``;
        
        await sock.sendMessage(chatId, { text: msg });
        return;
    }

    let targetItemId = itemId;
    // Check if input is a number
    if (!isNaN(parseInt(itemId))) { 
        const inventory = inventorySystem.formatInventory(senderJid);
        const index = parseInt(itemId) - 1;
        if (!inventory.isEmpty && inventory.items[index]) { 
            targetItemId = inventory.items[index].id;
        }
    }

    const result = inventorySystem.equipItem(senderJid, targetItemId, slot);
    
    if (!result.success) { 
        await sock.sendMessage(chatId, { text: `âŒ ${result.message}` });
        return;
    }
    
    const itemInfo = lootSystem.getItemInfo(result.equipped);
    await sock.sendMessage(chatId, { 
        text: `âœ… Equipped ${itemInfo.name} to *${result.slot}* slot!` 
    });
}

async function unequipItem(sock, chatId, senderJid, slot) { 
    if (!slot) { 
        await sock.sendMessage(chatId, { 
            text: `âŒ Usage: \`${getPrefix()} unequip <slot>\`\n\nSlots: weapon, armor, helmet, boots, ring, amulet, cloak, gloves` 
        });
        return;
    }

    const result = inventorySystem.unequipItem(senderJid, slot);
    
    if (!result.success) { 
        await sock.sendMessage(chatId, { text: `âŒ ${result.message}` });
        return;
    }
    
    const itemInfo = lootSystem.getItemInfo(result.unequipped);
    await sock.sendMessage(chatId, { 
        text: `âœ… Unequipped ${itemInfo.name} from *${result.slot}* slot.` 
    });
}

// ========================================== 
// ðŸ› ï¸ HELPER FUNCTIONS 
// ========================================== 

function createProgressBar(percent, length = 10) { 
    const safePercent = Math.max(0, Math.min(100, percent));
    const filled = Math.floor((safePercent / 100) * length);
    const empty = Math.max(0, length - filled);
    return `[${'â–ˆ'.repeat(filled)}${'â–‘'.repeat(empty)}]`;
}

function getStatIcon(stat) { 
    const icons = { 
        HP: 'â¤ï¸',
        ATK: 'âš”ï¸',
        DEF: 'ðŸ›¡ï¸',
        MAG: 'ðŸ”®',
        SPD: 'ðŸ’¨',
        LUCK: 'ðŸ€',
        CRIT: 'ðŸ’¥'
    };
    return icons[stat] || 'ðŸ“Š';
}

function getSlotIcon(slot) { 
    const icons = { 
        weapon: 'âš”ï¸',
        armor: 'ðŸ›¡ï¸',
        helmet: 'â›‘ï¸',
        boots: 'ðŸ‘¢',
        ring: 'ðŸ’',
        amulet: 'ðŸ“¿',
        cloak: 'ðŸ§¥',
        gloves: 'ðŸ§¤'
    };
    return icons[slot] || 'ðŸ“¦';
}

// ========================================== 
// ðŸ› ï¸ CRAFTING & BREWING COMMANDS 
// ========================================== 

async function displayRecipes(sock, chatId, page = 1, categoryFilter = null) { 
    let recipes = Object.values(craftingSystem.getRecipes());
    
    if (categoryFilter) {
        recipes = recipes.filter(r => r.category === categoryFilter);
    }

    const itemsPerPage = 6;
    const totalPages = Math.ceil(recipes.length / itemsPerPage) || 1;
    const currentPage = Math.max(1, Math.min(page, totalPages));
    
    const startIdx = (currentPage - 1) * itemsPerPage;
    const pageItems = recipes.slice(startIdx, startIdx + itemsPerPage);

    const titleMap = {
        'WEAPON': 'âš’ï¸ BLACKSMITH',
        'ARMOR': 'ðŸ›¡ï¸ ARMORY',
        'BREWING': 'âš—ï¸ ALCHEMY',
        'COOKING': 'ðŸ³ KITCHEN',
        'ENGINEERING': 'âš™ï¸ WORKSHOP'
    };

    let msg = `â”â”â”â”â”â”â”â”â”â”â”â”â”
`;
    msg += `â”ƒ   ${categoryFilter ? titleMap[categoryFilter] || categoryFilter : 'âš’ RECIPES'}    â”ƒ 
`;
    msg += `â”—â”â”â”â”â”â”â”â”â”â”â”â”â”
`;
    msg += `(Page ${currentPage} of ${totalPages})

`;
    
    if (pageItems.length === 0) {
        msg += `_No recipes found in this category._\n\n`;
    }

    pageItems.forEach(r => { 
        const itemInfo = lootSystem.getItemInfo(r.id);
        msg += `â€¢ *${r.name}* (\`${r.id}\`)
`;
        msg += `  ðŸ“ ${r.desc}
`;
        const ingredients = Object.entries(r.ingredients).map(([id, qty]) => { 
            const info = lootSystem.getItemInfo(id);
            return `${qty}x ${info.name}`;
        }).join(', ');
        msg += `  ðŸ“¦ Req: ${ingredients}

`;
    });

    const cmdName = categoryFilter === 'COOKING' ? 'cook' : (categoryFilter === 'BREWING' ? 'brew' : 'craft');

    msg += `â”â”â”â”â”â”â”â”â”â”â”â”â”
`;
    msg += `ðŸ’¡ *HOW TO CREATE:*
`;
    msg += `Type: \`${getPrefix()} ${cmdName} <id>\`
`;
    msg += `ðŸ“Œ Example: \`${getPrefix()} ${cmdName} ${pageItems[0]?.id || 'steel_sabre'}\``;

    await sock.sendMessage(chatId, { text: msg });
}

async function craftItem(sock, chatId, senderJid, recipeId, categoryFilter = null) { 
    if (!recipeId) { 
        return displayRecipes(sock, chatId, 1, categoryFilter);
    }

    const recipe = craftingSystem.getRecipeById(recipeId.toLowerCase());
    if (categoryFilter && recipe && recipe.category !== categoryFilter) {
        const type = categoryFilter === 'COOKING' ? 'cooked' : (categoryFilter === 'BREWING' ? 'brewed' : 'crafted');
        await sock.sendMessage(chatId, { text: `âŒ This item cannot be ${type} here!` });
        return;
    }

    const result = craftingSystem.performCraft(senderJid, recipeId.toLowerCase());
    
    if (result.success) { 
        await sock.sendMessage(chatId, { text: result.message });
    } else { 
        await sock.sendMessage(chatId, { text: `âŒ *ACTION FAILED*\n\n${result.reason || result.message}` });
    }
}

async function cookItem(sock, chatId, senderJid, recipeId) {
    return craftItem(sock, chatId, senderJid, recipeId, 'COOKING');
}

async function brewItem(sock, chatId, senderJid, recipeId) {
    return craftItem(sock, chatId, senderJid, recipeId, 'BREWING');
}

async function forgeItem(sock, chatId, senderJid, recipeId) {
    // Forge can be Weapons or Armor
    return craftItem(sock, chatId, senderJid, recipeId);
}

async function dismantleItem(sock, chatId, senderJid, input) { 
    let targetItemId = input;
    
    if (!isNaN(parseInt(input))) { 
        const inventory = inventorySystem.formatInventory(senderJid);
        const index = parseInt(input) - 1;
        if (!inventory.isEmpty && inventory.items[index]) { 
            targetItemId = inventory.items[index].id;
        }
    }

    if (!targetItemId) { 
        await sock.sendMessage(chatId, { text: `âŒ Usage: \`${getPrefix()} dismantle <id or bag_#>\`` });
        return;
    }

    const result = craftingSystem.dismantleItem(senderJid, targetItemId);
    await sock.sendMessage(chatId, { text: result.message });
}

// ========================================== 
// â›ï¸ MINING SYSTEM 
// ========================================== 

async function mineOre(sock, chatId, senderJid, locationId) { 
    const sheet = progression.getCharacterSheet(senderJid);
    if (!sheet) { 
        await sock.sendMessage(chatId, { text: `âŒ Register first!` });
        return;
    }

    const locations = craftingSystem.getMiningLocations();
    const miningLevel = economy.getProfessionLevel(senderJid, 'mining');
    
    // If no location provided, show available mines
    if (!locationId) { 
        let msg = `â”â”â”â”â”â”â”â”â”â”â”â”â”
`;
        msg += `â”ƒ   â›ï¸ MINING     â”ƒ 
`;
        msg += `â”—â”â”â”â”â”â”â”â”â”â”â”â”â”
`;
        msg += `(Mining Level: ${miningLevel})

`;
        
        const rankOrder = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
        const userRankIdx = rankOrder.indexOf(sheet.adventurerRank);

        Object.values(locations).forEach(loc => { 
            const reqRankIdx = rankOrder.indexOf(loc.req.rank);
            const levelReq = loc.req.miningLevel || 1;
            const isLocked = sheet.level < loc.req.level || userRankIdx < reqRankIdx || miningLevel < levelReq;
            
            if (isLocked) { 
                msg += `ðŸ”’ *${loc.name}* (Locked)
`;
                msg += `   âš ï¸ Req: Lv.${loc.req.level} + ${loc.req.rank}-Rank

`;
            } else { 
                msg += `âœ… *${loc.name}* (ID: \`${loc.id}\`)
`;
                msg += `   ðŸ“ ${loc.desc}
`;
                msg += `   âš¡ Cost: ${Math.max(5, loc.energyCost - Math.floor(miningLevel/2))} Energy

`;
            }
        });

        msg += `â”â”â”â”â”â”â”â”â”â”â”â”â”
`;
        msg += `ðŸ’¡ *HOW TO MINE:*
`;
        msg += `Type: \`${getPrefix()} mine <location_id>\`
`;
        msg += `ðŸ“Œ Example: \`${getPrefix()} mine shimmering_caves\``;

        await sock.sendMessage(chatId, { text: msg });
        return;
    }

    const loc = locations[locationId.toLowerCase()];
    if (!loc) { 
        await sock.sendMessage(chatId, { text: `âŒ Invalid location! Type \`${getPrefix()} mine\` to see all.` });
        return;
    }

    // Check requirements
    const rankOrder = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
    const userRankIdx = rankOrder.indexOf(sheet.adventurerRank);
    const reqRankIdx = rankOrder.indexOf(loc.req.rank);
    const miningLevelReq = loc.req.miningLevel || 1;

    if (sheet.level < loc.req.level || userRankIdx < reqRankIdx || miningLevel < miningLevelReq) { 
        await sock.sendMessage(chatId, { text: `âŒ *LOCATION LOCKED*\n\nYou need to be Lv.${loc.req.level}, ${loc.req.rank}-Rank, and Mining Lv.${miningLevelReq} to enter the ${loc.name}.` });
        return;
    }

    // Energy check
    const user = economy.getUser(senderJid);
    const energyCost = Math.max(5, loc.energyCost - Math.floor(miningLevel/2));
    const currentEnergy = user.energy !== undefined ? user.energy : 100;

    if (currentEnergy < energyCost) { 
        await sock.sendMessage(chatId, { text: `âŒ Not enough energy! Need ${energyCost}, have ${currentEnergy}.` });
        return;
    }

    // Deduct energy
    user.energy = Math.max(0, currentEnergy - energyCost);
    
    // ðŸ’¡ Add Mining XP (Increased to 2.5x)
    const xpGained = Math.floor(loc.energyCost * 2.5);
    const levelUp = economy.addProfessionXP(senderJid, 'mining', xpGained);
    
    economy.saveUser(senderJid);

    let msg = `â›ï¸ *MINING: ${loc.name.toUpperCase()}* â›ï¸\n\n`;
    msg += `You strike the veins of the earth...\n\n`;

    // Roll for results based on LUCK and Mining Level
    const luck = sheet.stats.luck || 5;
    const baseRolls = 2 + Math.floor(miningLevel / 10);
    const bonusRolls = Math.floor(luck / 15); 
    const totalRolls = baseRolls + bonusRolls;
    const found = {};

    const totalWeight = loc.ores.reduce((s, o) => s + o.weight, 0);
    let luckyFinds = 0;

    for (let i = 0; i < totalRolls; i++) { 
        // ðŸ’° LUCKY FIND LOGIC
        if (Math.random() < 0.02) { // 2% chance per roll
            const foundZeni = Math.floor(Math.random() * 500) + 100;
            economy.addMoney(senderJid, foundZeni);
            luckyFinds += foundZeni;
        }

        let roll = Math.random() * totalWeight;
        for (const ore of loc.ores) { 
            roll -= ore.weight;
            if (roll <= 0) { 
                const qty = ore.quantity || (Math.floor(Math.random() * (ore.max - ore.min + 1)) + ore.min);
                inventorySystem.addItem(senderJid, ore.id, qty);
                found[ore.id] = (found[ore.id] || 0) + qty;
                break;
            }
        }
    }

    Object.entries(found).forEach(([id, qty]) => { 
        msg += `- ${qty}x ${lootSystem.getItemInfo(id).name}\n`;
    });

    if (luckyFinds > 0) { 
        msg += `\nðŸ’° *LUCKY FIND!* You found a lost pouch containing ${economy.getZENI()}${luckyFinds.toLocaleString()}!
`;
    }

    msg += `\nâš¡ Energy Left: ${user.energy}/${user.maxEnergy || 100} (-${energyCost})
`;
    msg += `ðŸ“ˆ Mining XP: +${xpGained}`;
    if (levelUp?.leveledUp) { 
        msg += `\nâœ¨ *LEVEL UP!* Mining is now Level ${levelUp.newLevel}!`;
    }

    await sock.sendMessage(chatId, { text: msg });
}

// ========================================== 
// ðŸ” SOURCE FINDER 
// ========================================== 

async function showItemSource(sock, chatId, itemId) { 
    const miningLocs = craftingSystem.getMiningLocations();
    const recipes = craftingSystem.getRecipes();

    // IF NO ID PROVIDED: List all items by category
    if (!itemId) { 
        let msg = `â”â”â”â”â”â”â”â”â”â”â”â”â”
`;
        msg += `â”ƒ   ðŸ” SOURCES    â”ƒ 
`;
        msg += `â”—â”â”â”â”â”â”â”â”â”â”â”â”â”

`;
        
        // Group items by source
        const categories = { 
            'Drops': [],
            'Mining': [],
            'Crafting': []
        };

        const db = lootSystem.ITEM_DATABASE;
        Object.keys(db).forEach(id => { 
            const sources = [];
            
            // Check mining
            for (const loc of Object.values(miningLocs)) { 
                if (loc.ores.some(o => o.id === id)) { 
                    if (!sources.includes('Mining')) sources.push('Mining');
                }
            }

            // Check monster drops
            for (const table of Object.values(lootSystem.LOOT_TABLES)) { 
                if (table.items.some(i => i.id === id)) { 
                    if (!sources.includes('Drops')) sources.push('Drops');
                }
            }
            for (const boss of Object.values(lootSystem.BOSS_DROPS)) { 
                if (boss.guaranteed.some(i => i.id === id) || boss.special.some(i => i.id === id)) { 
                    if (!sources.includes('Drops')) sources.push('Drops');
                }
            }

            // Check crafting
            if (recipes[id]) sources.push('Crafting');

            sources.forEach(cat => { 
                categories[cat].push(`\`${id}\``);
            });
        });

        msg += `ðŸ’Ž *Mining Ores:*\n${[...new Set(categories['Mining'])].join(', ')}\n\n`;
        msg += `ðŸ‘¹ *Monster Drops:*\n${[...new Set(categories['Drops'])].join(', ')}\n\n`;
        msg += `ðŸ› ï¸ *Craftables:*\n${[...new Set(categories['Crafting'])].join(', ')}\n\n`;
        msg += `ðŸ’¡ Use \`${getPrefix()} source <id>\` for exact details.`;

        await sock.sendMessage(chatId, { text: msg });
        return;
    }

    const id = itemId.toLowerCase();
    const info = lootSystem.getItemInfo(id);
    if (info.name === id && !lootSystem.ITEM_DATABASE[id]) { 
        await sock.sendMessage(chatId, { text: `âŒ Item \`${id}\` not found in database.` });
        return;
    }

    let msg = `â”â”â”â”â”â”â”â”â”â”â”â”â”
`;
    msg += `â”ƒ   ðŸ” FINDING    â”ƒ 
`;
    msg += `â”—â”â”â”â”â”â”â”â”â”â”â”â”â”

`;
    msg += `*Target:* ${info.name}

`;
    const sources = [];

    // Check Mining (new detailed check)
    for (const loc of Object.values(miningLocs)) { 
        if (loc.ores.some(o => o.id === id)) { 
            sources.push(`â€¢ *Mining*: Found in the *${loc.name}*.`);
        }
    }

    // Check Common Tables
    for (const [tableName, table] of Object.entries(lootSystem.LOOT_TABLES)) { 
        if (table.items.some(i => i.id === id)) { 
            sources.push(`â€¢ *${tableName.replace('_', ' ')}*: Found in standard drops.`);
        }
    }

    // Check Boss Drops
    for (const [bossName, drops] of Object.entries(lootSystem.BOSS_DROPS)) { 
        const inGuaranteed = drops.guaranteed.some(i => i.id === id);
        const inSpecial = drops.special.some(i => i.id === id);
        if (inGuaranteed || inSpecial) { 
            sources.push(`â€¢ *${bossName.replace('_', ' ')}*: Drops from this boss.`);
        }
    }

    // Check Recipes
    if (recipes[id]) { 
        sources.push(`â€¢ *Crafting*: Can be created using \`${getPrefix()} craft ${id}\`.`);
    }

    if (sources.length > 0) { 
        msg += sources.join('\n');
    } else { 
        msg += `_This item currently has no known source._`;
    }

    await sock.sendMessage(chatId, { text: msg });
}

async function useItem(sock, chatId, senderJid, target) {
    if (!target) {
        // Find consumables in inventory to suggest
        const inv = inventorySystem.getInventory(senderJid);
        const consumables = Object.keys(inv).filter(k => {
            const info = lootSystem.getItemInfo(k);
            return info.type === 'CONSUMABLE' || info.type === 'POTION';
        });

        let tip = consumables.length > 0 
            ? `Items you can use: ${consumables.join(', ')}`
            : "You don't have any usable consumables.";

        const sendUsageHelper = async (chatId, title, usage, example = null, tipText = null) => {
            let msg = `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”“\nâ”ƒ   ${title}   â”ƒ\nâ”—â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”›\n\n`;
            msg += `*Usage:* \`${getPrefix()}${usage}\`\n`;
            if (example) msg += `*Example:* \`${getPrefix()}${example}\`\n`;
            if (tipText) msg += `\nðŸ’¡ *Tip:* _${tipText}_`;
            return await sock.sendMessage(chatId, { text: `ðŸƒ *GOTEN*\n\n` + msg });
        };

        return await sendUsageHelper(chatId, 'ðŸ§ª USE ITEM', 'use <#bag_index>', 'use 1', tip);
    }

    // Resolve bag index if number
    let itemId = target;
    if (!isNaN(target)) {
        const invData = inventorySystem.formatInventory(senderJid);
        const item = invData.items[parseInt(target) - 1];
        if (item) itemId = item.id;
    }

    const result = inventorySystem.useItem(senderJid, itemId);
    if (result.success) {
        await sock.sendMessage(chatId, { 
            text: `ðŸƒ *GOTEN*\n\nâœ… *ITEM USED!*\nâ”â”â”â”â”â”â”â”â”â”â”â”â”â”â”\nðŸ“¦ *Item:* ${itemId}\nâœ¨ *Effect:* ${result.message}\nâ”â”â”â”â”â”â”â”â”â”â”â”â”â”â”` 
        });
    } else {
        await sock.sendMessage(chatId, { text: `ðŸƒ *GOTEN*\n\n` + result.message });
    }
}

async function enhanceItem(sock, chatId, senderJid, input) {
    if (!input) {
        return await sock.sendMessage(chatId, { text: `âŒ Usage: \`${getPrefix()} enhance <#bag_index>\`\nExample: \`${getPrefix()} enhance 1\`` });
    }

    const inventory = inventorySystem.formatInventory(senderJid);
    const index = parseInt(input) - 1;
    const targetItem = inventory.items[index];

    if (!targetItem) {
        return await sock.sendMessage(chatId, { text: `âŒ Item not found at index ${input}!` });
    }

    // Find a stone in inventory
    const stones = ['legendary_enhancement_stone', 'rare_enhancement_stone', 'minor_enhancement_stone'];
    let stoneId = null;
    for (const s of stones) {
        if (inventory.items.some(item => item.id === s)) {
            stoneId = s;
            break;
        }
    }

    if (!stoneId) {
        return await sock.sendMessage(chatId, { text: `âŒ You don't have any Enhancement Stones!` });
    }

    const result = inventorySystem.enhanceItem(senderJid, targetItem.id, stoneId);
    await sock.sendMessage(chatId, { text: result.message });
}

// ========================================== 
// ðŸ“¤ EXPORTS 
// ========================================== 

module.exports = { 
    displayCharacterSheet,
    displayInventory,
    allocateStats,
    resetStats,
    displayLeaderboard,
    sellItem,
    upgradeInventory,
    equipItem,
    unequipItem,
    useItem,
    displayRecipes,
    craftItem,
    dismantleItem,
    mineOre,
    showItemSource,
    enhanceItem,
    cookItem,
    brewItem,
    forgeItem
};


