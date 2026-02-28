// ============================================ 
// 👤 CHARACTER & RPG COMMANDS 
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
// 📊 CHARACTER SHEET 
// ========================================== 

async function displayCharacterSheet(sock, chatId, senderJid, senderName) { 
    const sheet = progression.getCharacterSheet(senderJid);
    const economyUser = economy.getUser(senderJid);
    
    if (!sheet || !economyUser) { 
        await sock.sendMessage(chatId, { 
            text: `❌ Not registered! Use \`${getPrefix()} register\` first.` 
        });
        return;
    }
    
    const classData = classSystem.getClassById(sheet.class);
    const stats = progression.getBaseStats(senderJid, sheet.class);
    const equipment = inventorySystem.getEquipment(senderJid);
    const equipStats = inventorySystem.getEquipmentStats(senderJid);
    
    let msg = `┏━━━━━━━━━━━━━━━┓
┃   👤 CHAR SHEET ┃
┗━━━━━━━━━━━━━━━┛

`;
    
    // Basic info
    msg += `🎭 *Name:* ${senderName}
`;
    msg += `${classData.icon} *Class:* ${classData.name}
`;
    msg += `🏆 *Rank:* ${sheet.adventurerRank}-Rank
`;
    msg += `⭐ *Level:* ${sheet.level}

`;
    
    // XP Progress
    const progressBar = createProgressBar(sheet.progressPercent);
    msg += `📈 *Experience:*
`;
    msg += `${progressBar} ${sheet.progressPercent}%
`;
    msg += `${sheet.xpProgress.toLocaleString()}/${sheet.xpForThisLevel.toLocaleString()} XP
`;
    msg += `(${sheet.xpNeeded.toLocaleString()} needed for Lv.${sheet.level + 1})

`;
    
    // Stats
    msg += `━━━━━━━━━━━━━
`;
    msg += `💪 *STATS:*
`;
          msg += `❤️ HP: ${stats.hp}${equipStats.hp ? ` (+${equipStats.hp})` : ''}
      `;
          msg += `⚡ EN: ${stats.maxEnergy}
      `;
          msg += `⚔️ ATK: ${stats.atk}${equipStats.atk ? ` (+${equipStats.atk})` : ''}`;
    msg += `🛡️ DEF: ${stats.def}${equipStats.def ? ` (+${equipStats.def})` : ''}
`;
    msg += `🔮 MAG: ${stats.mag}${equipStats.mag ? ` (+${equipStats.mag})` : ''}
`;
    msg += `💨 SPD: ${stats.spd}${equipStats.spd ? ` (+${equipStats.spd})` : ''}
`;
    msg += `🍀 LUCK: ${stats.luck}${equipStats.luck ? ` (+${equipStats.luck})` : ''}
`;
    msg += `💥 CRIT: ${stats.crit}%​${equipStats.crit ? ` (+${equipStats.crit}%)` : ''}

`;
    
    // 💡 SECONDARY STATS
    msg += `✨ *Secondary Stats:*
`;
    msg += `🕊️ Evasion: ${stats.evasion.toFixed(1)}%
`;
    msg += `🛡️ Dmg Reduction: ${stats.dmgReduction.toFixed(1)}%
`;
    msg += `🎁 Drop Rate: +${stats.rareDropRate.toFixed(1)}%

`;
    
    // Stat points
    if (sheet.statPoints > 0) { 
        msg += `✨ *Points:* ${sheet.statPoints}
`;
        msg += `💡 Use: \`${getPrefix()} allocate <stat> [n]\`

`;
    }
    
    // Equipment
    msg += `━━━━━━━━━━━━━
`;
    msg += `⚔️ *EQUIPMENT:*
`;
    
    const equipped = [];
    for (const [slot, item] of Object.entries(equipment)) { 
        if (item) { 
            const itemInfo = lootSystem.getItemInfo(item.id);
            equipped.push(`${getSlotIcon(slot)} ${itemInfo.rarity ? inventorySystem.ITEM_RARITY[itemInfo.rarity].icon : '⚪'} ${itemInfo.name}`);
        }
    }
    
    if (equipped.length > 0) { 
        msg += equipped.join('\n') + '\n';
    } else { 
        msg += `_No equipment equipped_
`;
    }
    
    msg += `
━━━━━━━━━━━━━
`;
    msg += `📜 *QUESTS:* ${economyUser.questsCompleted || 0}
`;
    msg += `💰 *Wealth:* ${getCurrency().symbol}${economyUser.wallet.toLocaleString()}

`;
    
    msg += `💡 *Commands:*
`;
    msg += `• \`${getPrefix()} inventory\` - View items
`;
    msg += `• \`${getPrefix()} allocate hp 5\` - Spend points`;
    
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
// 📦 INVENTORY DISPLAY 
// ========================================== 

async function displayInventory(sock, chatId, senderJid) { 
    const formatted = inventorySystem.formatInventory(senderJid);
    const equipment = inventorySystem.getEquipment(senderJid);
    const equippedIds = Object.values(equipment).filter(item => item !== null).map(item => item.id);
    
    let msg = `┏━━━━━━━━━━━━━━━┓
┃      🎒 BAG     ┃ 
┗━━━━━━━━━━━━━━━┛

`;
    
    msg += `📦 Slots: ${formatted.count}/${formatted.slots}

`;
    
    if (formatted.isEmpty) { 
        msg += `_Your inventory is empty!_

`;
        msg += `💡 Get items from quests and combat!`;
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
                msg += `━━━ ${rarityInfo.icon} ${rarityInfo.name} ━━━
`;
                
                for (const item of rarityGroups[rarity]) { 
                    const itemInfo = lootSystem.getItemInfo(item.id) || { name: item.id, value: 0 };
                    const isEquipped = equippedIds.includes(item.id);
                    
                    msg += `${itemCounter}. ${rarityInfo.icon} *${itemInfo.name}*`;
                    if (item.quantity > 1) { 
                        msg += ` x${item.quantity}`;
                    }
                    if (isEquipped) { 
                        msg += ` 🛡 *[EQUIPPED]*`;
                    }
                    msg += `\n`;

                    // 💡 STAT COMPARISON
                    if (itemInfo.type === 'EQUIPMENT' && !isEquipped) { 
                        const slot = itemInfo.slot;
                        const equippedInSlot = equipment[slot];
                        if (equippedInSlot) { 
                            const currentInfo = lootSystem.getItemInfo(equippedInSlot.id);
                            let compMsg = '   📊 '; 
                            for (const stat of ['atk', 'def', 'mag', 'hp', 'spd']) { 
                                const delta = (itemInfo.stats?.[stat] || 0) - (currentInfo.stats?.[stat] || 0);
                                if (delta !== 0) compMsg += `${stat.toUpperCase()} ${delta > 0 ? '🟢+' : '🔴'}${delta} `;
                            }
                            msg += compMsg + '\n';
                        } else if (itemInfo.stats) { 
                            let statsMsg = '   ✨ '; 
                            for (const [s, v] of Object.entries(itemInfo.stats)) { 
                                statsMsg += `${s.toUpperCase()}+${v} `; 
                            }
                            msg += statsMsg + '\n';
                        }
                    }

                    msg += `   💰 Value: ${getCurrency().symbol}${itemInfo.value}
`;
                    itemCounter++;
                }
                msg += `\n`;
            }
        }
        
        msg += `━━━━━━━━━━━━━
`;
        msg += `💡 *Commands:*
`;
        msg += `• \`${getPrefix()} sell <n> [qty]\` - Sell item
`;
        msg += `• \`${getPrefix()} upgrade inv\` - Expand slots`;
    }
    
    await sock.sendMessage(chatId, { text: msg });
}

// ========================================== 
// 💪 ALLOCATE STATS 
// ========================================== 

async function allocateStats(sock, chatId, senderJid, stat, amount = 1) { 
    const result = progression.allocateStatPoint(senderJid, stat.toLowerCase(), amount);
    
    if (!result.success) { 
        await sock.sendMessage(chatId, { text: `❌ ${result.message}` });
        return;
    }
    
    const sheet = progression.getCharacterSheet(senderJid);
    
    let msg = `━━━━━━━━━━━━━
`;
    msg += `┃ ✨ STAT GAINED! ┃
`;
    msg += `┗━━━━━━━━━━━━━

`;
    
    msg += `${getStatIcon(result.stat)} *${result.stat}:* +${result.valueGained}

`;
    msg += `📊 Points Spent: ${result.pointsSpent}
`;
    msg += `💎 Remaining: ${result.remainingPoints}

`;
    
    msg += `━━━━━━━━━━━━━
`;
    msg += `*NEW STATS:*
`;
    msg += `❤️ HP: ${sheet.stats.hp}
`;
    msg += `⚔️ ATK: ${sheet.stats.atk}
`;
    msg += `🛡️ DEF: ${sheet.stats.def}
`;
    msg += `🔮 MAG: ${sheet.stats.mag}
`;
    msg += `💨 SPD: ${sheet.stats.spd}
`;
    msg += `🍀 LUCK: ${sheet.stats.luck}
`;
    msg += `💥 CRIT: ${sheet.stats.crit}%​`;
    
    await sock.sendMessage(chatId, { text: msg });
}

// ========================================== 
// 🔄 RESET STATS 
// ========================================== 

async function resetStats(sock, chatId, senderJid) { 
    const RESET_COST = 1000;
    const user = economy.getUser(senderJid);
    
    if (!user || user.wallet < RESET_COST) { 
        await sock.sendMessage(chatId, { 
            text: `❌ Not enough Zeni! Need ${getCurrency().symbol}${RESET_COST}` 
        });
        return;
    }
    
    const result = progression.resetStats(senderJid);
    economy.removeMoney(senderJid, RESET_COST);
    
    await sock.sendMessage(chatId, { 
        text: `✅ *STATS RESET!*

💰 Cost: ${getCurrency().symbol}${RESET_COST}
💎 Refunded: ${result.pointsRefunded} stat points
📊 Total Points: ${result.totalPoints}

💡 Use \`${getPrefix()} allocate\` to re-allocate!` 
    });
}

// ========================================== 
// 🏆 LEADERBOARD 
// ========================================== 

async function displayLeaderboard(sock, chatId, type = 'level') { 
    const leaderboard = progression.getLeaderboard(type, 10);
    
    if (leaderboard.length === 0) { 
        await sock.sendMessage(chatId, { text: '❌ No data available!' });
        return;
    }
    
    let msg = `━━━━━━━━━━━━━━━
`;
    msg += `┃   🏆 TOP 10     ┃ 
`;
    msg += `┗━━━━━━━━━━━━━━━━

`;
    
    msg += `📊 Ranking by: ${type === 'level' ? 'Level' : 'Total XP'}

`;
    
    for (let i = 0; i < leaderboard.length; i++) { 
        const player = leaderboard[i];
        const economyUser = economy.getUser(player.userId);
        const name = economyUser?.nickname || player.userId.split('@')[0];
        
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
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
// 📦 SELL ITEM 
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
        await sock.sendMessage(chatId, { text: `❌ ${result.message}` });
        return;
    }
    
    const itemInfo = lootSystem.getItemInfo(result.itemId) || { name: result.itemId, rarity: 'COMMON' };
    const rarityIcon = inventorySystem.ITEM_RARITY[itemInfo.rarity]?.icon || '⚪';
    
    let msg = `💰 *ITEM SOLD!*

`;
    msg += `${rarityIcon} ${itemInfo.name} x${result.quantity}
`;
    msg += `💵 Sold for: ${getCurrency().symbol}${result.soldFor.toLocaleString()}
`;

    if (result.guildContribution) {
        msg += `🏛️ Guild Contribution: ${getCurrency().symbol}${result.guildContribution.amount.toLocaleString()} (${result.guildContribution.xp} XP, ${result.guildContribution.bank} Bank)
`;
    }

    if (result.remaining > 0) { 
        msg += `📦 Remaining: ${result.remaining}`;
    }
    
    await sock.sendMessage(chatId, { text: msg });
}

// ========================================== 
// 🎁 UPGRADE INVENTORY 
// ========================================== 

async function upgradeInventory(sock, chatId, senderJid) { 
    const result = inventorySystem.upgradeInventory(senderJid);
    
    if (!result.success) { 
        await sock.sendMessage(chatId, { text: `❌ ${result.message}` });
        return;
    }
    
    let msg = `━━━━━━━━━━━━━
`;
    msg += `┃ ✨ BAG UPGRADE  ┃ 
`;
    msg += `┗━━━━━━━━━━━━━

`;
    msg += `💰 Cost: ${getCurrency().symbol}${result.cost.toLocaleString()}
`;
    msg += `📦 Slots: ${result.oldSlots} → ${result.newSlots}
`;
    msg += `🎁 Gained: +${result.slotsGained} slots`;
    
    await sock.sendMessage(chatId, { text: msg });
}

// ========================================== 
// ⚔️EQUIPMENT COMMANDS 
// ========================================== 

async function equipItem(sock, chatId, senderJid, itemId, slot) { 
    const equipment = inventorySystem.getEquipment(senderJid);
    if (!equipment) return;

    if (!itemId || !slot) { 
        let msg = `━━━━━━━━━━━━━
`;
        msg += `┃   🛡EQUIPMENT  ┃ 
`;
        msg += `┗━━━━━━━━━━━━━

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
                msg += `   🆔 ID: \`${item.id}\`

`;
            } else { 
                msg += `${icon} *${title}*: _Empty_

`;
            }
        });
        
        msg += `━━━━━━━━━━━━━
`;
        msg += `📖 *HOW TO EQUIP:*
`;
        msg += `Type: \`${getPrefix()} equip <# or id> <slot>\`
`;
        msg += `📌 Example: \`${getPrefix()} equip 1 weapon\``;
        
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
        await sock.sendMessage(chatId, { text: `❌ ${result.message}` });
        return;
    }
    
    const itemInfo = lootSystem.getItemInfo(result.equipped);
    await sock.sendMessage(chatId, { 
        text: `✅ Equipped ${itemInfo.name} to *${result.slot}* slot!` 
    });
}

async function unequipItem(sock, chatId, senderJid, slot) { 
    if (!slot) { 
        await sock.sendMessage(chatId, { 
            text: `❌ Usage: \`${getPrefix()} unequip <slot>\`\n\nSlots: weapon, armor, helmet, boots, ring, amulet, cloak, gloves` 
        });
        return;
    }

    const result = inventorySystem.unequipItem(senderJid, slot);
    
    if (!result.success) { 
        await sock.sendMessage(chatId, { text: `❌ ${result.message}` });
        return;
    }
    
    const itemInfo = lootSystem.getItemInfo(result.unequipped);
    await sock.sendMessage(chatId, { 
        text: `✅ Unequipped ${itemInfo.name} from *${result.slot}* slot.` 
    });
}

// ========================================== 
// 🛠️ HELPER FUNCTIONS 
// ========================================== 

function createProgressBar(percent, length = 10) { 
    const safePercent = Math.max(0, Math.min(100, percent));
    const filled = Math.floor((safePercent / 100) * length);
    const empty = Math.max(0, length - filled);
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}

function getStatIcon(stat) { 
    const icons = { 
        HP: '❤️',
        ATK: '⚔️',
        DEF: '🛡️',
        MAG: '🔮',
        SPD: '💨',
        LUCK: '🍀',
        CRIT: '💥'
    };
    return icons[stat] || '📊';
}

function getSlotIcon(slot) { 
    const icons = { 
        weapon: '⚔️',
        armor: '🛡️',
        helmet: '⛑️',
        boots: '👢',
        ring: '💍',
        amulet: '📿',
        cloak: '🧥',
        gloves: '🧤'
    };
    return icons[slot] || '📦';
}

// ========================================== 
// 🛠️ CRAFTING & BREWING COMMANDS 
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
        'WEAPON': '⚒️ BLACKSMITH',
        'ARMOR': '🛡️ ARMORY',
        'BREWING': '⚗️ ALCHEMY',
        'COOKING': '🍳 KITCHEN',
        'ENGINEERING': '⚙️ WORKSHOP'
    };

    let msg = `━━━━━━━━━━━━━
`;
    msg += `┃   ${categoryFilter ? titleMap[categoryFilter] || categoryFilter : '⚒ RECIPES'}    ┃ 
`;
    msg += `┗━━━━━━━━━━━━━
`;
    msg += `(Page ${currentPage} of ${totalPages})

`;
    
    if (pageItems.length === 0) {
        msg += `_No recipes found in this category._\n\n`;
    }

    pageItems.forEach(r => { 
        const itemInfo = lootSystem.getItemInfo(r.id);
        msg += `• *${r.name}* (\`${r.id}\`)
`;
        msg += `  📝 ${r.desc}
`;
        const ingredients = Object.entries(r.ingredients).map(([id, qty]) => { 
            const info = lootSystem.getItemInfo(id);
            return `${qty}x ${info.name}`;
        }).join(', ');
        msg += `  📦 Req: ${ingredients}

`;
    });

    const cmdName = categoryFilter === 'COOKING' ? 'cook' : (categoryFilter === 'BREWING' ? 'brew' : 'craft');

    msg += `━━━━━━━━━━━━━
`;
    msg += `💡 *HOW TO CREATE:*
`;
    msg += `Type: \`${getPrefix()} ${cmdName} <id>\`
`;
    msg += `📌 Example: \`${getPrefix()} ${cmdName} ${pageItems[0]?.id || 'steel_sabre'}\``;

    await sock.sendMessage(chatId, { text: msg });
}

async function craftItem(sock, chatId, senderJid, recipeId, categoryFilter = null) { 
    if (!recipeId) { 
        return displayRecipes(sock, chatId, 1, categoryFilter);
    }

    const recipe = craftingSystem.getRecipeById(recipeId.toLowerCase());
    if (categoryFilter && recipe && recipe.category !== categoryFilter) {
        const type = categoryFilter === 'COOKING' ? 'cooked' : (categoryFilter === 'BREWING' ? 'brewed' : 'crafted');
        await sock.sendMessage(chatId, { text: `❌ This item cannot be ${type} here!` });
        return;
    }

    const result = craftingSystem.performCraft(senderJid, recipeId.toLowerCase());
    
    if (result.success) { 
        await sock.sendMessage(chatId, { text: result.message });
    } else { 
        await sock.sendMessage(chatId, { text: `❌ *ACTION FAILED*\n\n${result.reason || result.message}` });
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
        await sock.sendMessage(chatId, { text: `❌ Usage: \`${getPrefix()} dismantle <id or bag_#>\`` });
        return;
    }

    const result = craftingSystem.dismantleItem(senderJid, targetItemId);
    await sock.sendMessage(chatId, { text: result.message });
}

// ========================================== 
// ⛏️ MINING SYSTEM 
// ========================================== 

async function mineOre(sock, chatId, senderJid, locationId) { 
    const sheet = progression.getCharacterSheet(senderJid);
    if (!sheet) { 
        await sock.sendMessage(chatId, { text: `❌ Register first!` });
        return;
    }

    const locations = craftingSystem.getMiningLocations();
    const miningLevel = economy.getProfessionLevel(senderJid, 'mining');
    
    // If no location provided, show available mines
    if (!locationId) { 
        let msg = `━━━━━━━━━━━━━
`;
        msg += `┃   ⛏️ MINING     ┃ 
`;
        msg += `┗━━━━━━━━━━━━━
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
                msg += `🔒 *${loc.name}* (Locked)
`;
                msg += `   ⚠️ Req: Lv.${loc.req.level} + ${loc.req.rank}-Rank

`;
            } else { 
                msg += `✅ *${loc.name}* (ID: \`${loc.id}\`)
`;
                msg += `   📝 ${loc.desc}
`;
                msg += `   ⚡ Cost: ${Math.max(5, loc.energyCost - Math.floor(miningLevel/2))} Energy

`;
            }
        });

        msg += `━━━━━━━━━━━━━
`;
        msg += `💡 *HOW TO MINE:*
`;
        msg += `Type: \`${getPrefix()} mine <location_id>\`
`;
        msg += `📌 Example: \`${getPrefix()} mine shimmering_caves\``;

        await sock.sendMessage(chatId, { text: msg });
        return;
    }

    const loc = locations[locationId.toLowerCase()];
    if (!loc) { 
        await sock.sendMessage(chatId, { text: `❌ Invalid location! Type \`${getPrefix()} mine\` to see all.` });
        return;
    }

    // Check requirements
    const rankOrder = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
    const userRankIdx = rankOrder.indexOf(sheet.adventurerRank);
    const reqRankIdx = rankOrder.indexOf(loc.req.rank);
    const miningLevelReq = loc.req.miningLevel || 1;

    if (sheet.level < loc.req.level || userRankIdx < reqRankIdx || miningLevel < miningLevelReq) { 
        await sock.sendMessage(chatId, { text: `❌ *LOCATION LOCKED*\n\nYou need to be Lv.${loc.req.level}, ${loc.req.rank}-Rank, and Mining Lv.${miningLevelReq} to enter the ${loc.name}.` });
        return;
    }

    // Energy check
    const user = economy.getUser(senderJid);
    const energyCost = Math.max(5, loc.energyCost - Math.floor(miningLevel/2));
    const currentEnergy = user.energy !== undefined ? user.energy : 100;

    if (currentEnergy < energyCost) { 
        await sock.sendMessage(chatId, { text: `❌ Not enough energy! Need ${energyCost}, have ${currentEnergy}.` });
        return;
    }

    // Deduct energy
    user.energy = Math.max(0, currentEnergy - energyCost);
    
    // 💡 Add Mining XP (Increased to 2.5x)
    const xpGained = Math.floor(loc.energyCost * 2.5);
    const levelUp = economy.addProfessionXP(senderJid, 'mining', xpGained);
    
    economy.saveUser(senderJid);

    let msg = `⛏️ *MINING: ${loc.name.toUpperCase()}* ⛏️\n\n`;
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
        // 💰 LUCKY FIND LOGIC
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
        msg += `\n💰 *LUCKY FIND!* You found a lost pouch containing ${economy.getZENI()}${luckyFinds.toLocaleString()}!
`;
    }

    msg += `\n⚡ Energy Left: ${user.energy}/${user.maxEnergy || 100} (-${energyCost})
`;
    msg += `📈 Mining XP: +${xpGained}`;
    if (levelUp?.leveledUp) { 
        msg += `\n✨ *LEVEL UP!* Mining is now Level ${levelUp.newLevel}!`;
    }

    await sock.sendMessage(chatId, { text: msg });
}

// ========================================== 
// 🔍 SOURCE FINDER 
// ========================================== 

async function showItemSource(sock, chatId, itemId) { 
    const miningLocs = craftingSystem.getMiningLocations();
    const recipes = craftingSystem.getRecipes();

    // IF NO ID PROVIDED: List all items by category
    if (!itemId) { 
        let msg = `━━━━━━━━━━━━━
`;
        msg += `┃   🔍 SOURCES    ┃ 
`;
        msg += `┗━━━━━━━━━━━━━

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

        msg += `💎 *Mining Ores:*\n${[...new Set(categories['Mining'])].join(', ')}\n\n`;
        msg += `👹 *Monster Drops:*\n${[...new Set(categories['Drops'])].join(', ')}\n\n`;
        msg += `🛠️ *Craftables:*\n${[...new Set(categories['Crafting'])].join(', ')}\n\n`;
        msg += `💡 Use \`${getPrefix()} source <id>\` for exact details.`;

        await sock.sendMessage(chatId, { text: msg });
        return;
    }

    const id = itemId.toLowerCase();
    const info = lootSystem.getItemInfo(id);
    if (info.name === id && !lootSystem.ITEM_DATABASE[id]) { 
        await sock.sendMessage(chatId, { text: `❌ Item \`${id}\` not found in database.` });
        return;
    }

    let msg = `━━━━━━━━━━━━━
`;
    msg += `┃   🔍 FINDING    ┃ 
`;
    msg += `┗━━━━━━━━━━━━━

`;
    msg += `*Target:* ${info.name}

`;
    const sources = [];

    // Check Mining (new detailed check)
    for (const loc of Object.values(miningLocs)) { 
        if (loc.ores.some(o => o.id === id)) { 
            sources.push(`• *Mining*: Found in the *${loc.name}*.`);
        }
    }

    // Check Common Tables
    for (const [tableName, table] of Object.entries(lootSystem.LOOT_TABLES)) { 
        if (table.items.some(i => i.id === id)) { 
            sources.push(`• *${tableName.replace('_', ' ')}*: Found in standard drops.`);
        }
    }

    // Check Boss Drops
    for (const [bossName, drops] of Object.entries(lootSystem.BOSS_DROPS)) { 
        const inGuaranteed = drops.guaranteed.some(i => i.id === id);
        const inSpecial = drops.special.some(i => i.id === id);
        if (inGuaranteed || inSpecial) { 
            sources.push(`• *${bossName.replace('_', ' ')}*: Drops from this boss.`);
        }
    }

    // Check Recipes
    if (recipes[id]) { 
        sources.push(`• *Crafting*: Can be created using \`${getPrefix()} craft ${id}\`.`);
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
            let msg = `┏━━━━━━━━━━━━━━━┓\n┃   ${title}   ┃\n┗━━━━━━━━━━━━━━━┛\n\n`;
            msg += `*Usage:* \`${getPrefix()}${usage}\`\n`;
            if (example) msg += `*Example:* \`${getPrefix()}${example}\`\n`;
            if (tipText) msg += `\n💡 *Tip:* _${tipText}_`;
            return await sock.sendMessage(chatId, { text: `🃏 *GOTEN*\n\n` + msg });
        };

        return await sendUsageHelper(chatId, '🧪 USE ITEM', 'use <#bag_index>', 'use 1', tip);
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
            text: `🃏 *GOTEN*\n\n✅ *ITEM USED!*\n━━━━━━━━━━━━━━━\n📦 *Item:* ${itemId}\n✨ *Effect:* ${result.message}\n━━━━━━━━━━━━━━━` 
        });
    } else {
        await sock.sendMessage(chatId, { text: `🃏 *GOTEN*\n\n` + result.message });
    }
}

async function enhanceItem(sock, chatId, senderJid, input) {
    if (!input) {
        return await sock.sendMessage(chatId, { text: `❌ Usage: \`${getPrefix()} enhance <#bag_index>\`\nExample: \`${getPrefix()} enhance 1\`` });
    }

    const inventory = inventorySystem.formatInventory(senderJid);
    const index = parseInt(input) - 1;
    const targetItem = inventory.items[index];

    if (!targetItem) {
        return await sock.sendMessage(chatId, { text: `❌ Item not found at index ${input}!` });
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
        return await sock.sendMessage(chatId, { text: `❌ You don't have any Enhancement Stones!` });
    }

    const result = inventorySystem.enhanceItem(senderJid, targetItem.id, stoneId);
    await sock.sendMessage(chatId, { text: result.message });
}

// ========================================== 
// 📤 EXPORTS 
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


