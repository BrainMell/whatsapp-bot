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
    
    let msg = `┏━━━━━━━━━━━━┓\n┃ 👤 PROFILE  ┃\n┗━━━━━━━━━━━━┛\n\n`;
    
    // Basic info
    msg += `🎭 *${senderName}*\n`;
    msg += `${classData.icon} ${classData.name} | 🏆 ${sheet.adventurerRank}-Rank\n`;
    msg += `⭐ Level ${sheet.level} | 💰 ${getCurrency().symbol}${economyUser.wallet.toLocaleString()}\n\n`;
    
    // XP Progress
    const progressBar = createProgressBar(sheet.progressPercent);
    msg += `📈 ${progressBar} ${sheet.progressPercent}%\n`;
    msg += `${sheet.xpProgress.toLocaleString()}/${sheet.xpForThisLevel.toLocaleString()} XP\n\n`;
    
    // Stats (compact 2-column)
    msg += `*STATS:*\n`;
    msg += `❤️ HP:${stats.hp}${equipStats.hp ? `+${equipStats.hp}` : ''} ⚔️ ATK:${stats.atk}${equipStats.atk ? `+${equipStats.atk}` : ''}\n`;
    msg += `🛡️ DEF:${stats.def}${equipStats.def ? `+${equipStats.def}` : ''} 🔮 MAG:${stats.mag}${equipStats.mag ? `+${equipStats.mag}` : ''}\n`;
    msg += `💨 SPD:${stats.spd}${equipStats.spd ? `+${equipStats.spd}` : ''} 🍀 LCK:${stats.luck}${equipStats.luck ? `+${equipStats.luck}` : ''}\n`;
    msg += `💥 CRIT:${stats.crit}% | 🕊️ EVA:${stats.evasion.toFixed(1)}%\n`;
    
    // Stat points
    if (sheet.statPoints > 0) { 
        msg += `\n✨ *${sheet.statPoints} stat pts!*\n`;
        msg += `\`.j allocate hp 5\`\n`;
    }
    
    // Equipment summary
    msg += `\n*GEAR:*\n`;
    const equipped = [];
    for (const [slot, item] of Object.entries(equipment)) { 
        if (item) { 
            const itemInfo = lootSystem.getItemInfo(item.id);
            equipped.push(`${getSlotIcon(slot)} ${itemInfo.name}`);
        }
    }
    if (equipped.length > 0) { 
        msg += equipped.join(' | ') + '\n';
    } else { 
        msg += `_None equipped_\n`;
    }
    
    msg += `\n📜 Quests: ${economyUser.questsCompleted || 0}\n`;
    msg += `\`.j inventory\` · \`.j equip\``;
    
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
    
    let msg = `┏━━━━━━━━━━━━┓\n┃  🎒 BAG     ┃\n┗━━━━━━━━━━━━┛\n\n`;
    msg += `📦 ${formatted.count}/${formatted.slots} slots\n\n`;
    
    if (formatted.isEmpty) { 
        msg += `_Your inventory is empty!_\n\n💡 Earn items from quests!`;
    } else { 
        let itemCounter = 1;
        // Display in the same rarity-first order as formatInventory (so numbers match sell/equip)
        const rarityOrder = ['MYTHIC', 'LEGENDARY', 'EPIC', 'RARE', 'UNCOMMON', 'COMMON'];
        const rarityGroups = {};
        for (const item of formatted.items) { 
            if (!rarityGroups[item.rarity]) rarityGroups[item.rarity] = [];
            rarityGroups[item.rarity].push(item);
        }
        
        for (const rarity of rarityOrder) { 
            if (!rarityGroups[rarity] || rarityGroups[rarity].length === 0) continue;
            const rarityInfo = inventorySystem.ITEM_RARITY[rarity];
            msg += `━━ ${rarityInfo.icon} ${rarityInfo.name} ━━\n`;
            
            for (const item of rarityGroups[rarity]) { 
                const isEquipped = equippedIds.includes(item.id);
                const itemName = item.name || item.id;
                
                msg += `*${itemCounter}.* ${rarityInfo.icon} ${itemName}`;
                if (item.quantity > 1) msg += ` ×${item.quantity}`;
                if (isEquipped) msg += ` ✅`;
                msg += `\n`;

                // Compact stat comparison
                if (item.type === 'EQUIPMENT' && !isEquipped && item.stats) { 
                    const slot = item.slot;
                    const equippedInSlot = equipment[slot];
                    if (equippedInSlot?.stats) { 
                        let compParts = [];
                        for (const stat of ['atk', 'def', 'mag', 'hp', 'spd']) { 
                            const delta = (item.stats?.[stat] || 0) - (equippedInSlot.stats?.[stat] || 0);
                            if (delta !== 0) compParts.push(`${stat.toUpperCase()}${delta > 0 ? '🟢+' : '🔴'}${delta}`);
                        }
                        if (compParts.length > 0) msg += `  📊 ${compParts.join(' ')}\n`;
                    } else { 
                        let statParts = [];
                        for (const [s, v] of Object.entries(item.stats)) { 
                            if (v) statParts.push(`${s.toUpperCase()}+${v}`);
                        }
                        if (statParts.length > 0) msg += `  ✨ ${statParts.join(' ')}\n`;
                    }
                }

                msg += `  💰${getCurrency().symbol}${item.value || 0} | \`${item.id}\`\n`;
                itemCounter++;
            }
            msg += `\n`;
        }
        
        msg += `━━━━━━━━━━━━\n`;
        msg += `\`.j sell <#>\` \`.j equip <#>\``;
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
    
    let msg = `┏━━━━━━━━━━━━┓\n┃ ✨ STAT UP! ┃\n┗━━━━━━━━━━━━┛\n\n`;
    msg += `${getStatIcon(result.stat)} *${result.stat}:* +${result.valueGained}\n\n`;
    msg += `📊 Points Spent: ${result.pointsSpent}\n`;
    msg += `💎 Remaining: ${result.remainingPoints}\n\n`;
    msg += `━━━━━━━━━━━━━\n*NEW STATS:*\n`;
    msg += `❤️ HP: ${sheet.stats.hp}\n⚔️ ATK: ${sheet.stats.atk}\n🛡️ DEF: ${sheet.stats.def}\n🔮 MAG: ${sheet.stats.mag}\n💨 SPD: ${sheet.stats.spd}\n🍀 LUCK: ${sheet.stats.luck}\n💥 CRIT: ${sheet.stats.crit}%`;
    
    await sock.sendMessage(chatId, { text: msg });
}

// ========================================== 
// 🔄 RESET STATS 
// ========================================== 

async function resetStats(sock, chatId, senderJid) { 
    const RESET_COST = 5000;
    const user = economy.getUser(senderJid);
    
    if (!user || user.wallet < RESET_COST) { 
        await sock.sendMessage(chatId, { 
            text: `❌ Not enough Zeni! Need ${getCurrency().symbol}${RESET_COST}` 
        });
        return;
    }
    
    const result = progression.resetStats(senderJid);
    economy.removeMoney(senderJid, RESET_COST, "Stat Reset");
    
    await sock.sendMessage(chatId, { 
        text: `✅ *STATS RESET!*\n\n💰 Cost: ${getCurrency().symbol}${RESET_COST}\n💎 Refunded: ${result.pointsRefunded} stat points\n📊 Total Points: ${result.totalPoints}\n\n💡 Use \`${getPrefix()} allocate\` to re-allocate!` 
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
    
    let msg = `┏━━━━━━━━━━━━┓\n┃ 🏆 TOP 10   ┃\n┗━━━━━━━━━━━━┛\n\n`;
    msg += `📊 Ranking by: ${type === 'level' ? 'Level' : 'Total XP'}\n\n`;
    
    for (let i = 0; i < leaderboard.length; i++) { 
        const player = leaderboard[i];
        const economyUser = economy.getUser(player.userId);
        const name = economyUser?.nickname || player.userId.split('@')[0];
        
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        msg += `${medal} *${name}*\n   Level ${player.level}`;
        if (type === 'xp') msg += ` | ${player.totalXPEarned.toLocaleString()} XP`;
        msg += `\n\n`;
    }
    
    await sock.sendMessage(chatId, { text: msg });
}

// ========================================== 
// 📦 SELL ITEM 
// ========================================== 

async function sellItem(sock, chatId, senderJid, itemId, quantity = 1) { 
    let targetItemId = itemId;
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
    
    const itemInfo = lootSystem.getItemInfo(result.itemId);
    const rarityIcon = inventorySystem.ITEM_RARITY[itemInfo.rarity]?.icon || '⚪';
    
    let msg = `💰 *ITEM SOLD!*\n\n`;
    msg += `${rarityIcon} ${itemInfo.name} x${result.quantity}\n`;
    msg += `💵 Sold for: ${getCurrency().symbol}${result.soldFor.toLocaleString()}\n`;

    if (result.guildContribution) {
        msg += `🏛️ Guild Contribution: ${getCurrency().symbol}${result.guildContribution.amount.toLocaleString()} (${result.guildContribution.xp} XP, ${result.guildContribution.bank} Bank)\n`;
    }

    if (result.remaining > 0) msg += `📦 Remaining: ${result.remaining}`;
    
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
    
    let msg = `┏━━━━━━━━━━━━┓\n┃ ✨ BAG+ ✨  ┃\n┗━━━━━━━━━━━━┛\n\n`;
    msg += `💰 Cost: ${getCurrency().symbol}${result.cost.toLocaleString()}\n`;
    msg += `📦 Slots: ${result.oldSlots} → ${result.newSlots}\n`;
    msg += `🎁 Gained: +${result.slotsGained} slots`;
    
    await sock.sendMessage(chatId, { text: msg });
}

// ========================================== 
// ⚔️ EQUIPMENT COMMANDS 
// ========================================== 

async function equipItem(sock, chatId, senderJid, itemId, slot) { 
    const equipment = inventorySystem.getEquipment(senderJid);
    if (!equipment) return;

    if (!itemId || !slot) { 
        let msg = `━━━━━━━━━━━━━\n┃   🛡️ EQUIPMENT  ┃ \n┗━━━━━━━━━━━━━\n\n`;
        const slots = Object.values(inventorySystem.EQUIPMENT_SLOTS);
        
        slots.forEach(slotName => { 
            const item = equipment[slotName];
            const icon = getSlotIcon(slotName);
            const title = slotName.charAt(0).toUpperCase() + slotName.slice(1);
            if (item) { 
                const itemInfo = lootSystem.getItemInfo(item.id);
                msg += `${icon} *${title}*: ${itemInfo.name}\n   🆔 ID: \`${item.id}\`\n\n`;
            } else { 
                msg += `${icon} *${title}*: _Empty_\n\n`;
            }
        });
        
        msg += `━━━━━━━━━━━━━\n📖 *HOW TO EQUIP:*\nType: \`${getPrefix()} equip <# or id> <slot>\`\n📌 Example: \`${getPrefix()} equip 1 weapon\``;
        await sock.sendMessage(chatId, { text: msg });
        return;
    }

    let targetItemId = itemId;
    if (!isNaN(parseInt(itemId))) { 
        const inventory = inventorySystem.formatInventory(senderJid);
        const index = parseInt(itemId) - 1;
        if (!inventory.isEmpty && inventory.items[index]) { 
            targetItemId = inventory.items[index].id;
        }
    }

    const result = await inventorySystem.equipItem(senderJid, targetItemId, slot);
    if (!result.success) { 
        await sock.sendMessage(chatId, { text: `❌ ${result.message}` });
        return;
    }
    
    const itemInfo = lootSystem.getItemInfo(result.equipped);
    await sock.sendMessage(chatId, { text: `✅ Equipped ${itemInfo.name} to *${result.slot}* slot!` });
}

async function unequipItem(sock, chatId, senderJid, slot) { 
    if (!slot) { 
        await sock.sendMessage(chatId, { text: `❌ Usage: \`${getPrefix()} unequip <slot>\`\n\nSlots: weapon, armor, helmet, boots, ring, amulet, cloak, gloves` });
        return;
    }

    const result = await inventorySystem.unequipItem(senderJid, slot);
    if (!result.success) { 
        await sock.sendMessage(chatId, { text: `❌ ${result.message}` });
        return;
    }
    
    const itemInfo = lootSystem.getItemInfo(result.unequipped);
    await sock.sendMessage(chatId, { text: `✅ Unequipped ${itemInfo.name} from *${result.slot}* slot.` });
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
    const icons = { HP: '❤️', ATK: '⚔️', DEF: '🛡️', MAG: '🔮', SPD: '💨', LUCK: '🍀', CRIT: '💥' };
    return icons[stat] || '📊';
}

function getSlotIcon(slot) { 
    const icons = { main_hand: '⚔️', off_hand: '🗡️', weapon: '⚔️', armor: '🛡️', helmet: '⛑️', boots: '👢', ring: '💍', amulet: '📿', cloak: '🧥', gloves: '🧤' };
    return icons[slot] || '📦';
}

// ========================================== 
// 🛠️ CRAFTING & BREWING COMMANDS 
// ========================================== 

async function displayRecipes(sock, chatId, page = 1, categoryFilter = 'CRAFT') { 
    let recipes = Object.values(craftingSystem.getRecipes());
    if (categoryFilter) recipes = recipes.filter(r => r.category === categoryFilter);

    const itemsPerPage = 6;
    const totalPages = Math.ceil(recipes.length / itemsPerPage) || 1;
    const currentPage = Math.max(1, Math.min(page, totalPages));
    const startIdx = (currentPage - 1) * itemsPerPage;
    const pageItems = recipes.slice(startIdx, startIdx + itemsPerPage);

    const titleMap = { 'FORGE': '⚒️ BLACKSMITH', 'BREWING': '⚗️ ALCHEMY', 'COOKING': '🍳 KITCHEN', 'CRAFT': '⚒️ CRAFTING' };
    let msg = `┏━━━━━━━━━━━━┓\n┃ ${(titleMap[categoryFilter] || categoryFilter).slice(0,10).padEnd(10)} ┃\n┗━━━━━━━━━━━━┛\n(Page ${currentPage}/${totalPages})\n\n`;
    if (pageItems.length === 0) msg += `_No recipes found in this category._\n\n`;

    pageItems.forEach(r => { 
        msg += `• *${r.name}* (\`${r.id}\`)\n  📝 ${r.desc}\n`;
        const ingredients = Object.entries(r.ingredients).map(([id, qty]) => { 
            const info = lootSystem.getItemInfo(id);
            return `${qty}x ${info.name}`;
        }).join(', ');
        msg += `  📦 Req: ${ingredients}\n\n`;
    });

    const cmdName = categoryFilter === 'COOKING' ? 'cook' : (categoryFilter === 'BREWING' ? 'brew' : (categoryFilter === 'FORGE' ? 'forge' : 'craft'));
    msg += `━━━━━━━━━━━━━\n💡 *HOW TO CREATE:*\nType: \`${getPrefix()} ${cmdName} <id>\`\n📌 Example: \`${getPrefix()} ${cmdName} ${pageItems[0]?.id || 'refined_steel'}\``;
    await sock.sendMessage(chatId, { text: msg });
}

async function craftItem(sock, chatId, senderJid, recipeId, categoryFilter = 'CRAFT') {
    if (!recipeId) return displayRecipes(sock, chatId, 1, categoryFilter);
    const result = await craftingSystem.performCraft(senderJid, recipeId.toLowerCase(), categoryFilter);
    if (result.success) await sock.sendMessage(chatId, { text: result.message });
    else await sock.sendMessage(chatId, { text: `❌ *ACTION FAILED*\n\n${result.reason || result.message}` });
}
async function cookItem(sock, chatId, senderJid, recipeId) { return craftItem(sock, chatId, senderJid, recipeId, 'COOKING'); }
async function brewItem(sock, chatId, senderJid, recipeId) { return craftItem(sock, chatId, senderJid, recipeId, 'BREWING'); }
async function forgeItem(sock, chatId, senderJid, recipeId) { return craftItem(sock, chatId, senderJid, recipeId, 'FORGE'); }

async function dismantleItem(sock, chatId, senderJid, input) {
    let targetItemId = input;
    if (!isNaN(parseInt(input))) {
        const inventory = inventorySystem.formatInventory(senderJid);
        const index = parseInt(input) - 1;
        if (!inventory.isEmpty && inventory.items[index]) targetItemId = inventory.items[index].id;
    }
    if (!targetItemId) return await sock.sendMessage(chatId, { text: `❌ Usage: \`${getPrefix()} dismantle <id or bag_#>\`` });
    const result = await craftingSystem.dismantleItem(senderJid, targetItemId);
    await sock.sendMessage(chatId, { text: result.message });
}
// ========================================== 
// ⛏️ MINING SYSTEM 
// ========================================== 

async function mineOre(sock, chatId, senderJid, locationId) { 
    const sheet = progression.getCharacterSheet(senderJid);
    if (!sheet) return await sock.sendMessage(chatId, { text: `❌ Register first!` });

    const locations = craftingSystem.getMiningLocations();
    const miningLevel = economy.getProfessionLevel(senderJid, 'mining');
    
    if (!locationId) { 
        let msg = `┏━━━━━━━━━━━━┓\n┃ ⛏️ MINING   ┃\n┗━━━━━━━━━━━━┛\n(Mining Lv.${miningLevel})\n\n`;
        const rankOrder = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
        const userRankIdx = rankOrder.indexOf(sheet.adventurerRank);

        Object.values(locations).forEach(loc => { 
            const reqRankIdx = rankOrder.indexOf(loc.req.rank);
            const levelReq = loc.req.miningLevel || 1;
            const isLocked = sheet.level < loc.req.level || userRankIdx < reqRankIdx || miningLevel < levelReq;
            if (isLocked) msg += `🔒 *${loc.name}* (Locked)\n   ⚠️ Req: Lv.${loc.req.level} + ${loc.req.rank}-Rank\n\n`;
            else msg += `✅ *${loc.name}* (ID: \`${loc.id}\`)\n   📝 ${loc.desc}\n   ⚡ Cost: ${Math.max(5, loc.energyCost - Math.floor(miningLevel/2))} Energy\n\n`;
        });

        msg += `━━━━━━━━━━━━━\n💡 *HOW TO MINE:*\nType: \`${getPrefix()} mine <location_id>\`\n📌 Example: \`${getPrefix()} mine shimmering_caves\``;
        await sock.sendMessage(chatId, { text: msg });
        return;
    }

    const loc = locations[locationId.toLowerCase()];
    if (!loc) return await sock.sendMessage(chatId, { text: `❌ Invalid location! Type \`${getPrefix()} mine\` to see all.` });

    const rankOrder = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
    const userRankIdx = rankOrder.indexOf(sheet.adventurerRank);
    const reqRankIdx = rankOrder.indexOf(loc.req.rank);
    const miningLevelReq = loc.req.miningLevel || 1;

    if (sheet.level < loc.req.level || userRankIdx < reqRankIdx || miningLevel < miningLevelReq) { 
        return await sock.sendMessage(chatId, { text: `❌ *LOCATION LOCKED*\n\nYou need to be Lv.${loc.req.level}, ${loc.req.rank}-Rank, and Mining Lv.${miningLevelReq} to enter the ${loc.name}.` });
    }

    const user = economy.getUser(senderJid);
    const energyCost = Math.max(5, loc.energyCost - Math.floor(miningLevel/2));
    const currentEnergy = user.energy !== undefined ? user.energy : 100;

    if (currentEnergy < energyCost) return await sock.sendMessage(chatId, { text: `❌ Not enough energy! Need ${energyCost}, have ${currentEnergy}.` });

    user.energy = Math.max(0, currentEnergy - energyCost);
    const xpGained = Math.floor(loc.energyCost * 20 + miningLevel * 5);
    const levelUp = economy.addProfessionXP(senderJid, 'mining', xpGained);
    
    if (Math.random() < 0.25) {
        const energyRecovered = Math.floor(Math.random() * 15) + 8;
        user.energy = Math.min(user.maxEnergy || 100, user.energy + energyRecovered);
    }

    economy.saveUser(senderJid);

    let msg = `⛏️ *MINING: ${loc.name.toUpperCase()}* ⛏️\n\nYou strike the veins of the earth...\n\n`;
    const luck = sheet.stats.luck || 5;
    const baseRolls = 2 + Math.floor(miningLevel / 10);
    const bonusRolls = Math.floor(luck / 15); 
    const totalRolls = baseRolls + bonusRolls;
    const found = {};
    const totalWeight = loc.ores.reduce((s, o) => s + o.weight, 0);
    let luckyFinds = 0;

    for (let i = 0; i < totalRolls; i++) { 
        if (Math.random() < 0.02) { 
            const foundZeni = Math.floor(Math.random() * 500) + 100;
            economy.addMoney(senderJid, foundZeni, "Mining Lucky Find");
            luckyFinds += foundZeni;
        }
        let roll = Math.random() * totalWeight;
        for (const ore of loc.ores) { 
            roll -= ore.weight;
            if (roll <= 0) { 
                const qty = ore.quantity || (Math.floor(Math.random() * (ore.max - ore.min + 1)) + ore.min);
                await inventorySystem.addItem(senderJid, ore.id, qty);
                found[ore.id] = (found[ore.id] || 0) + qty;
                break;
            }
        }
    }

    Object.entries(found).forEach(([id, qty]) => { msg += `- ${qty}x ${lootSystem.getItemInfo(id).name}\n`; });
    if (luckyFinds > 0) msg += `\n💰 *LUCKY FIND!* You found a lost pouch containing ${economy.getZENI()}${luckyFinds.toLocaleString()}!\n`;
    msg += `\n⚡ Energy Left: ${user.energy}/${user.maxEnergy || 100} (-${energyCost})\n📈 Mining XP: +${xpGained}`;
    if (levelUp?.leveledUp) msg += `\n✨ *LEVEL UP!* Mining is now Level ${levelUp.newLevel}!`;
    await sock.sendMessage(chatId, { text: msg });
}

// ========================================== 
// 🔍 SOURCE FINDER 
// ========================================== 

async function showItemSource(sock, chatId, itemId) { 
    const miningLocs = craftingSystem.getMiningLocations();
    const recipes = craftingSystem.getRecipes();

    if (!itemId) { 
        let msg = `━━━━━━━━━━━━━\n┃   🔍 SOURCES    ┃ \n┗━━━━━━━━━━━━━\n\n`;
        const categories = { 'Drops': [], 'Mining': [], 'Crafting': [] };
        const db = lootSystem.ITEM_DATABASE;
        Object.keys(db).forEach(id => { 
            for (const loc of Object.values(miningLocs)) if (loc.ores.some(o => o.id === id)) if (!categories['Mining'].includes(`\`${id}\``)) categories['Mining'].push(`\`${id}\``);
            for (const table of Object.values(lootSystem.LOOT_TABLES)) if (table.items.some(i => i.id === id)) if (!categories['Drops'].includes(`\`${id}\``)) categories['Drops'].push(`\`${id}\``);
            for (const boss of Object.values(lootSystem.BOSS_DROPS)) if (boss.guaranteed.some(i => i.id === id) || boss.special.some(i => i.id === id)) if (!categories['Drops'].includes(`\`${id}\``)) categories['Drops'].push(`\`${id}\``);
            if (recipes[id]) if (!categories['Crafting'].includes(`\`${id}\``)) categories['Crafting'].push(`\`${id}\``);
        });
        msg += `💎 *Mining Ores:*\n${categories['Mining'].join(', ')}\n\n👹 *Monster Drops:*\n${categories['Drops'].join(', ')}\n\n🛠️ *Craftables:*\n${categories['Crafting'].join(', ')}\n\n💡 Use \`${getPrefix()} source <id>\` for exact details.`;
        return await sock.sendMessage(chatId, { text: msg });
    }

    const id = itemId.toLowerCase();
    const info = lootSystem.getItemInfo(id);
    let msg = `━━━━━━━━━━━━━\n┃   🔍 FINDING    ┃ \n┗━━━━━━━━━━━━━\n\n*Target:* ${info.name}\n\n`;
    const sources = [];
    for (const loc of Object.values(miningLocs)) if (loc.ores.some(o => o.id === id)) sources.push(`• *Mining*: Found in the *${loc.name}*.`);
    for (const [tableName, table] of Object.entries(lootSystem.LOOT_TABLES)) if (table.items.some(i => i.id === id)) sources.push(`• *${tableName.replace('_', ' ')}*: Found in standard drops.`);
    for (const [bossName, drops] of Object.entries(lootSystem.BOSS_DROPS)) if (drops.guaranteed.some(i => i.id === id) || drops.special.some(i => i.id === id)) sources.push(`• *${bossName.replace('_', ' ')}*: Drops from this boss.`);
    if (recipes[id]) sources.push(`• *Crafting*: Can be created using \`${getPrefix()} craft ${id}\`.`);
    msg += sources.length > 0 ? sources.join('\n') : `_This item currently has no known source._`;
    await sock.sendMessage(chatId, { text: msg });
}

async function useItem(sock, chatId, senderJid, target) {
    if (!target) {
        const inv = inventorySystem.getInventory(senderJid);
        const consumables = Object.keys(inv).filter(k => {
            const info = lootSystem.getItemInfo(k);
            return info.type === 'POTION' || info.type === 'CONSUMABLE';
        });
        let tip = consumables.length > 0 ? `Items you can use: ${consumables.join(', ')}` : "You don't have any usable consumables.";
        let msg = `┏━━━━━━━━━━━━━━━┓\n┃   🧪 USE ITEM   ┃\n┗━━━━━━━━━━━━━━━┛\n\n*Usage:* \`${getPrefix()}use <#bag_index>\`\n*Example:* \`${getPrefix()}use 1\`\n\n💡 *Tip:* _${tip}_`;
        return await sock.sendMessage(chatId, { text: msg });
    }
    let itemId = target;
    if (!isNaN(target)) {
        const invData = inventorySystem.formatInventory(senderJid);
        const item = invData.items[parseInt(target) - 1];
        if (item) itemId = item.id;
    }
    const result = inventorySystem.useItem(senderJid, itemId);
    if (result.success) await sock.sendMessage(chatId, { text: `✅ *ITEM USED!*\n━━━━━━━━━━━━━━━\n📦 *Item:* ${itemId}\n✨ *Effect:* ${result.message}\n━━━━━━━━━━━━━━━` });
    else await sock.sendMessage(chatId, { text: `❌ ${result.message}` });
}

async function enhanceItem(sock, chatId, senderJid, input) {
    if (!input) return await sock.sendMessage(chatId, { text: `❌ Usage: \`${getPrefix()} enhance <#bag_index>\`\nExample: \`${getPrefix()} enhance 1\`` });
    const inventory = inventorySystem.formatInventory(senderJid);
    const targetItem = inventory.items[parseInt(input) - 1];
    if (!targetItem) return await sock.sendMessage(chatId, { text: `❌ Item not found at index ${input}!` });
    const stones = ['legendary_enhancement_stone', 'rare_enhancement_stone', 'minor_enhancement_stone'];
    let stoneId = stones.find(s => inventory.items.some(item => item.id === s));
    if (!stoneId) return await sock.sendMessage(chatId, { text: `❌ You don't have any Enhancement Stones!` });
    const result = inventorySystem.enhanceItem(senderJid, targetItem.id, stoneId);
    await sock.sendMessage(chatId, { text: result.message });
}

module.exports = { displayCharacterSheet, displayInventory, allocateStats, resetStats, displayLeaderboard, sellItem, upgradeInventory, equipItem, unequipItem, useItem, displayRecipes, craftItem, dismantleItem, mineOre, showItemSource, enhanceItem, cookItem, brewItem, forgeItem };
