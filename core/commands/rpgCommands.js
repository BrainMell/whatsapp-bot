// ============================================ 
// 👤 CHARACTER & RPG COMMANDS 
// ============================================ 

const progression = require('../rpg/progression');
const inventorySystem = require('../rpg/inventorySystem');
const lootSystem = require('../rpg/lootSystem');
const craftingSystem = require('../rpg/craftingSystem');
const economy = require('../rpg/economy');
const classSystem = require('../rpg/classSystem');
const botConfig = require('../../botConfig');
const goService = require('../utils/goImageService'); // 💡 singleton (PERF PATCH 2026-07-27)
const fs = require('fs');
const profileHelper = require('../utils/profileHelper');
const { fetchPfp: fetchPfpCached } = require('../utils/pfpCache'); // 💡 PERF PATCH 2026-07-27: cached + 8s-timeout PFP fetcher
// 💡 Visual Overhaul: node-canvas profile card renderer
const profileCardRenderer = require('../rpg/profileCardRenderer');

const getPrefix = () => botConfig.getPrefix();
const getCurrency = () => botConfig.getCurrency();

// ========================================== 
// 📊 CHARACTER SHEET 
// ========================================== 

async function displayCharacterSheet(sock, chatId, senderJid, senderName) {
    inventorySystem.repairUserEquipmentStats(senderJid);
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
    
    // Handle PFP
    // 💡 PERF PATCH 2026-07-27: replaced inline 8s timeout + raw
    // sock.profilePictureUrl() call with the shared pfpCache helper.
    // Behaviour preserved (8s timeout, returns null on failure) PLUS
    // 5min positive cache + 60s negative cache + in-flight de-dup.
    let pfpUrl;
    try {
        pfpUrl = await fetchPfpCached(sock, senderJid);
    } catch (e) {
        console.warn('[displayCharacterSheet] profilePictureUrl failed:', e.message);
        pfpUrl = null;
    }

    // 💡 Visual Overhaul: Try node-canvas profile card FIRST (new design).
    // Falls back to Go service → text if canvas isn't available.
    try {
        // Fetch active summon(s) for the card
        let activeSummon = null;
        try {
            const summonSystem = require('../rpg/summonSystem');
            const activeSummonDoc = await summonSystem.getActiveSummon(economyUser);
            if (activeSummonDoc) {
              activeSummon = {
                species: activeSummonDoc.species,
                nickname: activeSummonDoc.nickname,
                level: activeSummonDoc.level,
                rarity: activeSummonDoc.rarity,
                tier: activeSummonDoc.tier,
                element: activeSummonDoc.element,
                archetype: activeSummonDoc.archetype,
                personality: activeSummonDoc.personality,
                loyalty: activeSummonDoc.loyalty,
                echoId: activeSummonDoc.echoId,
                lineage: activeSummonDoc.lineage
              };
            }
        } catch (summonErr) {
            console.warn('[displayCharacterSheet] Failed to fetch active summon:', summonErr.message);
        }

        // Fetch PFP as buffer (download if URL available)
        let pfpBuffer = null;
        if (pfpUrl) {
          try {
            const axios = require('axios');
            const resp = await axios.get(pfpUrl, { responseType: 'arraybuffer', timeout: 5000 });
            pfpBuffer = Buffer.from(resp.data);
          } catch (e) {}
        }

        const cardBuffer = await profileCardRenderer.renderProfileCard({
          user: economyUser,
          classData,
          stats,
          equipStats,
          equipment,
          level: sheet?.level || 1,
          rank: sheet?.adventurerRank || 'F',
          xpPercent: sheet?.progressPercent || 0,
          activeSummon,
          pfpBuffer,
          prefix: getPrefix()
        });

        if (cardBuffer && cardBuffer.length > 0) {
          await sock.sendMessage(chatId, {
            image: cardBuffer,
            caption: `👤 *${senderName}* — ${classData?.icon || '🛡️'} ${classData?.name || 'Adventurer'}\n⭐ Lv.${sheet?.level || 1} | 🏆 ${sheet?.adventurerRank || 'F'}-Rank | 💰 ${getCurrency().symbol}${(economyUser?.wallet || 0).toLocaleString()}`,
            mentions: [senderJid]
          });
          return;
        }
    } catch (err) {
        console.error('[displayCharacterSheet] node-canvas profile card failed:', err.message);
    }

    // ── Fallback: Try Go Image Service ──
    try {
        const cardData = await profileHelper.buildCardData(senderJid, senderName, pfpUrl);
        if (cardData) {
            const cardBuffer = await goService.generateProfileCard(cardData);
            if (cardBuffer) {
                let captionMsg = `👤 *Character:* ${cardData.nickname}\n`;
                captionMsg += `🛡️ *Class:* ${classData?.icon || '🛡️'} ${classData?.name || 'Adventurer'}\n`;
                captionMsg += `⭐ *Level:* ${sheet?.level || 1}  |  🏆 *Rank:* ${cardData.rank}\n`;
                captionMsg += `💰 *Zeni:* ${getCurrency().symbol}${(economyUser?.wallet || 0).toLocaleString()}\n\n`;
                captionMsg += `*STATS:*\n`;
                // 💡 PERSISTENT HP SYSTEM (2026-07-31): Show current/max HP.
                // If currentHP < maxHP, show in red/warning format.
                const maxHP = stats?.hp || 100;
                const currentHP = economy.getPersistentHP(senderJid, maxHP);
                const hpDisplay = currentHP < maxHP
                  ? `❤️ HP: ${currentHP}/${maxHP} ⚠️  |  ⚔️ ATK: ${stats?.atk || 10}\n`
                  : `❤️ HP: ${maxHP}  |  ⚔️ ATK: ${stats?.atk || 10}\n`;
                captionMsg += hpDisplay;
                captionMsg += `🛡️ DEF: ${stats?.def || 10}${equipStats?.def ? `+${equipStats.def}` : ''}  |  🔮 MAG: ${stats?.mag || 10}${equipStats?.mag ? `+${equipStats.mag}` : ''}\n`;
                captionMsg += `💨 SPD: ${stats?.spd || 10}${equipStats?.spd ? `+${equipStats.spd}` : ''}  |  🍀 LCK: ${stats?.luck || 10}${equipStats?.luck ? `+${equipStats.luck}` : ''}\n`;
                captionMsg += `💥 CRIT: ${stats?.crit || 0}%  |  🕊️ EVA: ${(stats?.evasion || 0).toFixed(1)}%\n`;
                
                // Gear list — name + rarity mark + critical durability warning only
                // (Full durability bar renders in the profile image card via durXxx fields in cardData)
                captionMsg += `\n*GEAR:*\n`;
                const captionEquipped = [];
                if (equipment) {
                    for (const [slot, item] of Object.entries(equipment)) {
                        if (item) {
                            const itemInfo = lootSystem.getItemInfo(item.id);
                            if (itemInfo) {
                                let condLabel = '';
                                if (item.durability !== undefined && item.maxDurability) {
                                    const pct = Math.round((item.durability / item.maxDurability) * 100);
                                    if (pct <= 0)      condLabel = ' 💔 *BROKEN*';
                                    else if (pct < 25) condLabel = ` 🔴 ${pct}%`;
                                    else if (pct < 50) condLabel = ` 🟠 ${pct}%`;
                                }
                                const RARITY_MARK = { UNCOMMON: ' ✦', RARE: ' ✦✦', EPIC: ' ✦✦✦', LEGENDARY: ' ★', MYTHIC: ' ★★' };
                                // 💡 BUG-05 fix: read INSTANCE rarity (item.rarity) first, fall back to
                                // DB rarity (itemInfo.rarity). The old code read only itemInfo.rarity,
                                // so an instance-rolled Mythic weapon displayed as Uncommon (the DB default).
                                const itemRarity = (item.rarity || itemInfo.rarity || 'COMMON').toUpperCase();
                                const rarityMark = RARITY_MARK[itemRarity] || '';
                                const slotName = slot.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                                // 💡 Also use item.name (preserves enhancement prefix like "+5 Iron Sword")
                                const displayName = item.name || itemInfo.name;
                                captionEquipped.push(`${getSlotIcon(slot)} *${slotName}:* ${displayName}${rarityMark}${condLabel}`);
                            }
                        }
                    }
                }
                if (captionEquipped.length > 0) {
                    captionMsg += captionEquipped.join('\n') + '\n';
                } else {
                    captionMsg += `_None equipped_\n`;
                }

                if (cardData.statPoints > 0) {
                    captionMsg += `\n✨ *${cardData.statPoints} Stat Points available!*\nUse \`${getPrefix()} allocate <stat> <amount>\` to assign them.`;
                }
                await sock.sendMessage(chatId, { 
                    image: cardBuffer,
                    caption: captionMsg,
                    mentions: [senderJid]
                });
                return;
            }
        }
    } catch (err) {
        console.error("Failed to generate Go character card:", err.message);
    }

    let msg = `👤 PROFILE\n\n`;
    
    // Basic info
    msg += `🎭 *${senderName}*\n`;
    msg += `${classData?.icon || '🛡️'} ${classData?.name || 'Adventurer'} | 🏆 ${sheet?.adventurerRank || 'F'}-Rank\n`;
    msg += `⭐ Level ${sheet?.level || 1} | 💰 ${getCurrency().symbol}${(economyUser?.wallet || 0).toLocaleString()}\n\n`;
    
    // XP Progress
    const progressBar = createProgressBar(sheet?.progressPercent || 0);
    msg += `📈 ${progressBar} ${sheet?.progressPercent || 0}%\n`;
    msg += `${(sheet?.xpProgress || 0).toLocaleString()}/${(sheet?.xpForThisLevel || 100).toLocaleString()} XP\n\n`;
    
    // Stats (compact 2-column)
    msg += `*STATS:*\n`;
    // 💡 PERSISTENT HP: show current/max HP
    const maxHP2 = stats?.hp || 100;
    const currentHP2 = economy.getPersistentHP(senderJid, maxHP2);
    const hpStr2 = currentHP2 < maxHP2
      ? `❤️ HP:${currentHP2}/${maxHP2}⚠️ ⚔️ ATK:${stats?.atk || 10}\n`
      : `❤️ HP:${maxHP2} ⚔️ ATK:${stats?.atk || 10}\n`;
    msg += hpStr2;
    msg += `🛡️ DEF:${stats?.def || 10}${equipStats?.def ? `+${equipStats.def}` : ''} 🔮 MAG:${stats?.mag || 10}${equipStats?.mag ? `+${equipStats.mag}` : ''}\n`;
    msg += `💨 SPD:${stats?.spd || 10}${equipStats?.spd ? `+${equipStats.spd}` : ''} 🍀 LCK:${stats?.luck || 10}${equipStats?.luck ? `+${equipStats.luck}` : ''}\n`;
    msg += `💥 CRIT:${stats?.crit || 0}% | 🕊️ EVA:${(stats?.evasion || 0).toFixed(1)}%\n`;
    
    // Stat points — always visible so players know the feature exists
    const statPts = sheet?.statPoints || 0;
    if (statPts > 0) {
        msg += `\n✨ *${statPts} Stat Points available!*\n`;
        msg += `\`${botConfig.getPrefix()} allocate <stat> <amount>\`\n`;
    } else {
        msg += `\n🔹 *Stat Points:* 0 _(earn more by leveling up)_\n`;
    }
    
    // Equipment summary
    msg += `\n*GEAR:*\n`;
    const equipped = [];
    if (equipment) {
        for (const [slot, item] of Object.entries(equipment)) { 
            if (item) { 
                const itemInfo = lootSystem.getItemInfo(item.id);
                if (itemInfo) {
                    let durStr = '';
                    if (item.durability !== undefined && item.maxDurability !== undefined) {
                        const pct = Math.max(0, Math.min(100, Math.round((item.durability / item.maxDurability) * 100)));
                        let block = '🟩';
                        if (pct <= 20) block = '🟥';
                        else if (pct <= 50) block = '🟨';
                        const filled = Math.max(0, Math.min(5, Math.round(pct / 20)));
                        durStr = ` (${block.repeat(filled)}${'⬜'.repeat(5 - filled)} ${pct}%)`;
                    }
                    const slotName = slot.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                    // 💡 BUG-05 fix: use instance name (preserves enhancement prefix)
                    const displayName = item.name || itemInfo.name;
                    equipped.push(`• ${getSlotIcon(slot)} *${slotName}:* ${displayName}${durStr}`);
                }
            }
        }
    }
    if (equipped.length > 0) { 
        msg += equipped.join('\n') + '\n';
    } else { 
        msg += `_None equipped_\n`;
    }
    
    msg += `📜 Quests: ${economyUser?.questsCompleted || 0}\n`;
    msg += `\`${botConfig.getPrefix()} inventory\` · \`${botConfig.getPrefix()} equip\``;

    try {
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
    } catch (sendErr) {
        console.error("Failed to send character sheet:", sendErr.message);
        try {
            await sock.sendMessage(chatId, { text: "⚠️ Error displaying character sheet, but you are active!" });
        } catch (fatal) {}
    }
}

// ========================================== 
// 📦 INVENTORY DISPLAY 
// ========================================== 

async function displayInventory(sock, chatId, senderJid, page = 1) {
  inventorySystem.repairUserEquipmentStats(senderJid);
  const formatted = inventorySystem.formatInventory(senderJid);
  const equipment = inventorySystem.getEquipment(senderJid);
  const equippedIds = Object.values(equipment).filter(i => i !== null).map(i => i.id);
  const economyUser = economy.getUser(senderJid);
  const currency = getCurrency();
  const walletBalance = economyUser?.wallet || 0;
  const questGold = economyUser?.questGold || 0;

  const ITEMS_PER_PAGE = 12;
  const rarityOrder = ['MYTHIC', 'LEGENDARY', 'EPIC', 'RARE', 'UNCOMMON', 'COMMON'];

  if (formatted.isEmpty) {
    let emptyMsg = `🎒 BAG\n\n`;
    emptyMsg += `💰 Wallet: ${currency.symbol}${walletBalance.toLocaleString()}\n`;
    if (questGold > 0) emptyMsg += `🏆 Quest Gold: ${questGold.toLocaleString()}\n`;
    emptyMsg += `\n_Your bag is empty._\n\n💡 Complete quests to earn items!`;

    return await sock.sendMessage(chatId, {
      text: emptyMsg
    });
  }

  // Build flat ordered list
  const orderedItems = [];
  const rarityGroups = {};
  for (const item of formatted.items) {
    if (!rarityGroups[item.rarity]) rarityGroups[item.rarity] = [];
    rarityGroups[item.rarity].push(item);
  }
  for (const rarity of rarityOrder) {
    if (rarityGroups[rarity]) orderedItems.push(...rarityGroups[rarity]);
  }

  const totalItems = orderedItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  const clampedPage = Math.min(Math.max(1, page), totalPages);
  const pageItems = orderedItems.slice((clampedPage - 1) * ITEMS_PER_PAGE, clampedPage * ITEMS_PER_PAGE);
  const pageStartIndex = (clampedPage - 1) * ITEMS_PER_PAGE;

  let msg = `🎒 BAG\n\n`;
  msg += `💰 Wallet: ${currency.symbol}${walletBalance.toLocaleString()}`;
  if (questGold > 0) msg += `  •  🏆 Quest Gold: ${questGold.toLocaleString()}`;
  msg += `\n`;
  msg += `📦 ${formatted.count}/${formatted.slots} slots  •  Page ${clampedPage}/${totalPages}\n\n`;

  let lastRarity = null;
  pageItems.forEach((item, i) => {
    const globalNum = pageStartIndex + i + 1;
    const rarityInfo = inventorySystem.ITEM_RARITY[item.rarity];
    if (item.rarity !== lastRarity) {
      if (lastRarity !== null) msg += `\n`;
      msg += `━━ ${rarityInfo.icon} ${rarityInfo.name} ━━\n`;
      lastRarity = item.rarity;
    }

    const isEquipped = equippedIds.includes(item.id);
    const itemName = item.name || item.id;
    msg += `*${globalNum}.* ${rarityInfo.icon} ${itemName}`;
    if (item.quantity > 1) msg += ` ×${item.quantity}`;
    if (isEquipped) msg += ` ✅`;
    msg += `\n`;

    // Stat delta (equipment only, compact)
    if (item.type === 'EQUIPMENT' && !isEquipped && item.stats) {
      const slot = item.slot;
      const equippedInSlot = equipment[slot];
      let statLine = '';
      if (equippedInSlot?.stats) {
        const parts = [];
        for (const s of ['atk', 'def', 'mag', 'hp', 'spd']) {
          const delta = (item.stats[s] || 0) - (equippedInSlot.stats[s] || 0);
          if (delta !== 0) parts.push(`${s.toUpperCase()}${delta > 0 ? '🟢+' : '🔴'}${delta}`);
        }
        if (parts.length) statLine = `  📊 ${parts.join(' ')}\n`;
      } else {
        // 💡 AUDIT FIX 2026-08-01: negative stats were displayed as "SPD+-10"
        // (the literal string "+" followed by the negative number). The
        // filter `[,v]) => v` correctly excludes 0 but the template
        // `${s.toUpperCase()}+${v}` always prepends "+", producing ugly
        // output like "SPD+-10". Now: filter on `v !== 0`, and only show
        // "+" for positive values — negative values show "SPD-10" naturally.
        const parts = Object.entries(item.stats)
          .filter(([,v]) => v !== 0)
          .map(([s, v]) => `${s.toUpperCase()}${v > 0 ? '+' : ''}${v}`);
        if (parts.length) statLine = `  ✨ ${parts.join(' ')}\n`;
      }
      msg += statLine;
    }
  });

  msg += `\n━━━━━━━━━━━━━━━━━━\n`;
  if (totalPages > 1) {
    let hints = [];
    if (clampedPage > 1) hints.push(`Prev: \`${botConfig.getPrefix()} bag ${clampedPage - 1}\``);
    if (clampedPage < totalPages) hints.push(`Next: \`${botConfig.getPrefix()} bag ${clampedPage + 1}\``);
    msg += `📄 ${hints.join(' | ')}\n`;
  }
  msg += `⚔️ \`${botConfig.getPrefix()} equip <#>\`  💰 \`${botConfig.getPrefix()} sell <#>\`  🧪 \`${botConfig.getPrefix()} use <#>\n\n`;
  msg += `💡 *Quick Tips:*\n`;
  msg += `• Sell: \`${botConfig.getPrefix()} sell <#> <number of items to sell>\` (e.g., \`${botConfig.getPrefix()} sell 1 5\`)\n`;
  msg += `• Fish: \`${botConfig.getPrefix()} fish\` to gather more loot!`;

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
    
    let msg = `✨ STAT UP!\n\n`;
    msg += `${getStatIcon(result.stat)} *${result.stat}:* +${result.valueGained}\n\n`;
    msg += `📊 Points Spent: ${result.pointsSpent}\n`;
    msg += `💎 Remaining: ${result.remainingPoints}\n\n`;
    msg += `━━━━━━━━━━━━━\n*NEW STATS:*\n`;
    msg += `❤️ HP: ${Math.floor(sheet.stats.hp)}\n⚔️ ATK: ${Math.floor(sheet.stats.atk)}\n🛡️ DEF: ${Math.floor(sheet.stats.def)}\n🔮 MAG: ${Math.floor(sheet.stats.mag)}\n💨 SPD: ${Math.floor(sheet.stats.spd)}\n🍀 LUCK: ${Math.floor(sheet.stats.luck)}\n💥 CRIT: ${Math.floor(sheet.stats.crit)}%`;
    
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
    
    let msg = `🏆 TOP 10\n\n`;
    if (type === 'pvp') {
        msg += `⚔️ PvP Leaderboard (Wins / Losses)\n\n`;
        for (let i = 0; i < leaderboard.length; i++) { 
            const player = leaderboard[i];
            const economyUser = economy.getUser(player.userId);
            const name = economyUser?.nickname || player.userId.split('@')[0];
            
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            msg += `${medal} *${name}*\n   ⚔️ Wins: \`${player.pvpWins || 0}\` | 💀 Losses: \`${player.pvpLosses || 0}\``;
            msg += `\n\n`;
        }
    } else {
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
    
    let msg = `✨ BAG+ ✨\n\n`;
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

    if (!itemId) { 
        let msg = `━━━━━━━━━━━━━\n🛡️ EQUIPMENT \n┗━━━━━━━━━━━━━\n\n`;
        const slots = Object.values(inventorySystem.EQUIPMENT_SLOTS);
        const durabilitySystem = require('../rpg/durabilitySystem');
        
        slots.forEach(slotName => { 
            const item = equipment[slotName];
            const icon = getSlotIcon(slotName);
            const title = slotName.charAt(0).toUpperCase() + slotName.slice(1);
            if (item) { 
                const itemInfo = lootSystem.getItemInfo(item.id);
                const maxDur = item.maxDurability || 100;
                const curDur = item.durability !== undefined ? item.durability : maxDur;
                const durStr = `⚙️ ${Math.ceil(curDur)}/${maxDur}`;
                const brokenStr = durabilitySystem.isBroken(item) ? " 💔 *[BROKEN]*" : "";
                // 💡 BUG-05 fix: use instance name (preserves enhancement prefix)
                const displayName = item.name || itemInfo.name;
                msg += `${icon} *${title}*: ${displayName}${brokenStr}\n   Condition: ${durStr}\n   🆔 ID: \`${item.id}\`\n\n`;
            } else { 
                msg += `${icon} *${title}*: _Empty_\n\n`;
            }
        });
        
        msg += `━━━━━━━━━━━━━\n📖 *HOW TO EQUIP:*\nType: \`${getPrefix()} equip <# or id> [slot]\`\n📌 Example: \`${getPrefix()} equip 1\``;
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
    const updatedEquipment = inventorySystem.getEquipment(senderJid);
    const equippedInstance = updatedEquipment[result.slot];
    const durStr = equippedInstance && equippedInstance.durability !== undefined
        ? ` (⚙️ ${equippedInstance.durability}/${equippedInstance.maxDurability})`
        : "";
    await sock.sendMessage(chatId, { text: `✅ Equipped *${itemInfo.name}* to *${result.slot}* slot!${durStr}` });
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
    // Safeguard against NaN or non-finite values
    const validPercent = isFinite(percent) ? percent : 0;
    const safePercent = Math.max(0, Math.min(100, validPercent));
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

async function displayRecipes(sock, chatId, page = 1, categoryFilter = 'CRAFT', searchQuery = null) { 
    let recipes = Object.values(craftingSystem.getRecipes());
    
    const STATION_CATEGORIES = {
        'FORGE': ['WEAPON', 'ARMOR'],
        'BREWING': ['BREWING'],
        'COOKING': ['COOKING'],
        'CRAFT': ['CRAFT', 'ACCESSORY', 'CLOTHING', 'ENGINEERING', 'EVOLUTION']
    };

    if (categoryFilter) {
        const allowedCategories = STATION_CATEGORIES[categoryFilter] || [];
        recipes = recipes.filter(r => allowedCategories.includes(r.category));
    }

    if (searchQuery) {
        const query = searchQuery.toLowerCase().trim();
        recipes = recipes.filter(r => 
            r.name.toLowerCase().includes(query) || 
            r.id.toLowerCase().includes(query) ||
            (r.desc && r.desc.toLowerCase().includes(query))
        );
    }

    // Sort: items without reqLevel first (alphabetically), then items with reqLevel (lowest first)
    recipes.sort((a, b) => {
        const aInfo = lootSystem.getItemInfo(a.id) || {};
        const bInfo = lootSystem.getItemInfo(b.id) || {};
        const aLvl = aInfo.reqLevel;
        const bLvl = bInfo.reqLevel;
        
        if (aLvl === undefined && bLvl === undefined) {
            return a.name.localeCompare(b.name);
        }
        if (aLvl === undefined) return -1;
        if (bLvl === undefined) return 1;
        if (aLvl === bLvl) {
            return a.name.localeCompare(b.name);
        }
        return aLvl - bLvl;
    });

    const itemsPerPage = 6;
    const totalPages = Math.ceil(recipes.length / itemsPerPage) || 1;
    const currentPage = Math.max(1, Math.min(page, totalPages));
    const startIdx = (currentPage - 1) * itemsPerPage;
    const pageItems = recipes.slice(startIdx, startIdx + itemsPerPage);

    const titleMap = { 'FORGE': '⚒️ BLACKSMITH', 'BREWING': '⚗️ ALCHEMY', 'COOKING': '🍳 KITCHEN', 'CRAFT': '⚒️ CRAFTING' };
    const baseTitle = titleMap[categoryFilter] || categoryFilter;
    
    let msg = `⚒️ *${baseTitle.toUpperCase()}* (Page ${currentPage}/${totalPages})\n`;
    msg += `────────────────────\n`;
    
    if (searchQuery) msg += `🔍 *Search:* _"${searchQuery}"_\n\n`;
    if (pageItems.length === 0) msg += `_No recipes found._\n\n`;

    const rarityEmojis = {
        'MYTHIC': '🌌',
        'LEGENDARY': '👑',
        'EPIC': '🔮',
        'RARE': '🔷',
        'UNCOMMON': '🟢',
        'COMMON': '⚪'
    };

    pageItems.forEach(r => { 
        const info = lootSystem.getItemInfo(r.id) || {};
        const slotIcon = getSlotIcon(info.slot);
        const rarityEmoji = rarityEmojis[info.rarity] || '⚪';
        const lvlStr = info.reqLevel !== undefined ? ` [Lvl: ${info.reqLevel}]` : "";
        
        msg += `\n${slotIcon} *${r.name}* (\`${r.id}\`) ${rarityEmoji}${lvlStr}\n`;
        msg += `📝 _${r.desc || info.description || ''}_\n`;
        
        const ingredients = Object.entries(r.ingredients).map(([id, qty]) => { 
            const ingInfo = lootSystem.getItemInfo(id);
            const ingSlotIcon = ingInfo.slot ? getSlotIcon(ingInfo.slot) + ' ' : '';
            return `${qty}x ${ingSlotIcon}${ingInfo.name}`;
        }).join(', ');
        
        msg += `🛠️ *Req:* ${ingredients}\n`;
    });

    const cmdName = categoryFilter === 'COOKING' ? 'cook' : (categoryFilter === 'BREWING' ? 'brew' : (categoryFilter === 'FORGE' ? 'forge' : 'craft'));
    
    msg += `────────────────────\n`;
    if (searchQuery) {
        msg += `💡 *Page:* \`${getPrefix()} ${cmdName} search ${searchQuery} <page>\`\n`;
    } else {
        msg += `💡 *Page:* \`${getPrefix()} ${cmdName} <page>\`\n`;
    }
    msg += `🔨 *Craft:* \`${getPrefix()} ${cmdName} <id>\`\n`;
    msg += `📌 *Example:* \`${getPrefix()} ${cmdName} ${pageItems[0]?.id || 'refined_steel'}\``;
    await sock.sendMessage(chatId, { text: msg });
}

async function craftItem(sock, chatId, senderJid, recipeId, categoryFilter = 'CRAFT') {
    if (!recipeId || recipeId.trim() === '') {
        return displayRecipes(sock, chatId, 1, categoryFilter);
    }
    
    const input = recipeId.trim();
    
    // Check if input is pagination page number
    if (/^\d+$/.test(input)) {
        return displayRecipes(sock, chatId, parseInt(input), categoryFilter);
    }
    
    // Check if input is search
    const searchMatch = input.match(/^search\s+(.+)$/i);
    if (searchMatch) {
        const queryStr = searchMatch[1].trim();
        const parts = queryStr.split(/\s+/);
        let page = 1;
        let searchQuery = queryStr;
        
        const lastPart = parts[parts.length - 1];
        if (/^\d+$/.test(lastPart) && parts.length > 1) {
            page = parseInt(lastPart);
            searchQuery = parts.slice(0, -1).join(" ");
        }
        return displayRecipes(sock, chatId, page, categoryFilter, searchQuery);
    }
    
    // Normal crafting execution
    const result = await craftingSystem.performCraft(senderJid, input.toLowerCase(), categoryFilter);
    if (result.success) {
        try {
            const recipe = result.recipe;
            const economyUser = economy.getUser(senderJid) || {};
            // 💡 PERF PATCH 2026-07-27: cached + 8s timeout (was no timeout, could hit 90s global)
            const pfpUrl = await fetchPfpCached(sock, senderJid);
            const nickname = economyUser.nickname || senderJid.split('@')[0];
            const currency = getCurrency();
            
            const cardType = categoryFilter === 'BREWING' ? 'BREW' : (categoryFilter === 'COOKING' ? 'COOK' : (categoryFilter === 'FORGE' ? 'FORGE' : 'CRAFT'));
            
            const imgBuf = await goService.generateTransactionCard({
                nickname: nickname,
                type: cardType,
                amount: 1,
                newWallet: economyUser.wallet || 0,
                newBank: economyUser.bank || 0,
                zeniSymbol: currency.symbol || 'Z',
                pfpUrl: pfpUrl,
                itemName: recipe?.name || input,
                item: recipe?.name || input,
                details: `Crafted: ${recipe?.name || input}`,
                description: recipe?.name || input
            });

            if (imgBuf) {
                await sock.sendMessage(chatId, { 
                    image: imgBuf, 
                    caption: result.message 
                });
            } else {
                throw new Error("No image buffer returned");
            }
        } catch (e) {
            console.error("Failed to generate crafting image card:", e.message);
            // Fallback to text message
            await sock.sendMessage(chatId, { text: result.message });
        }
    } else {
        await sock.sendMessage(chatId, { text: `❌ *ACTION FAILED*\n\n${result.reason || result.message}` });
    }
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
        let msg = `⛏️ MINING\n(Mining Lv.${miningLevel})\n\n`;
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
    // Use progression-derived maxEnergy — `user.maxEnergy` is never initialized
    // on the user object (it's computed dynamically from level + MAG).
    // Previously this capped at 100, making high-level mages' energy pools
    // effectively useless.
    const derivedStats = progression.getBaseStats(senderJid, user.class);
    const maxEn = derivedStats.maxEnergy || 100;

    if (currentEnergy < energyCost) return await sock.sendMessage(chatId, { text: `❌ Not enough energy! Need ${energyCost}, have ${currentEnergy}/${maxEn}.` });

    user.energy = Math.max(0, currentEnergy - energyCost);
    const xpGained = Math.floor(loc.energyCost * 20 + miningLevel * 5);
    const levelUp = economy.addProfessionXP(senderJid, 'mining', xpGained);

    if (Math.random() < 0.25) {
        const energyRecovered = Math.floor(Math.random() * 15) + 8;
        user.energy = Math.min(maxEn, user.energy + energyRecovered);
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
    msg += `\n⚡ Energy Left: ${user.energy}/${maxEn} (-${energyCost})\n📈 Mining XP: +${xpGained}`;
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
        let msg = `━━━━━━━━━━━━━\n🔍 SOURCES \n┗━━━━━━━━━━━━━\n\n`;
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
    let msg = `━━━━━━━━━━━━━\n🔍 FINDING \n┗━━━━━━━━━━━━━\n\n*Target:* ${info.name}\n\n`;
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
        let tip = consumables.length > 0 ? `Items you can use: ${consumables.join(', ')}` : `You don't have any usable consumables. (Use \`${getPrefix()}use repair_kit_basic <slot>\` to repair gear in the field!)`;
        let msg = `🧪 USE ITEM\n\n*Usage:* \`${getPrefix()}use <#bag_index> [slot]\`\n*Example:* \`${getPrefix()}use 1 main_hand\`\n\n💡 *Tip:* _${tip}_`;
        return await sock.sendMessage(chatId, { text: msg });
    }
    const parts = target.toLowerCase().trim().split(/\s+/);
    const itemInput = parts[0];
    const targetSlot = parts[1] || null;

    let itemId = itemInput.replace(/ /g, '_');
    if (!isNaN(itemInput)) {
        const invData = inventorySystem.formatInventory(senderJid);
        const item = invData.items[parseInt(itemInput) - 1];
        if (item) itemId = item.id;
    }
    const result = inventorySystem.useItem(senderJid, itemId, targetSlot);
    if (result.success) await sock.sendMessage(chatId, { text: `✅ *ITEM USED!*\n━━━━━━━━━━━━━━━\n📦 *Item:* ${itemId}\n✨ *Effect:* ${result.message}\n━━━━━━━━━━━━━━━` });
    else await sock.sendMessage(chatId, { text: `❌ ${result.message}` });
}

// 💡 FIX 2026-08-01 (BUG #2 + GAP #2): enhance command now:
//   1. Accepts an optional stone-type arg: `.jk enhance <#> [mythic|legendary|rare|minor]`
//   2. Defaults to best-available stone (mythic > legendary > rare > minor)
//   3. Previously the priority list omitted mythic_enhancement_stone entirely,
//      so even if a player had Mythic stones the command would skip them.
// Stone priority — best first. Player can override with the 2nd arg.
const ENHANCE_STONE_PRIORITY = [
    'mythic_enhancement_stone',
    'legendary_enhancement_stone',
    'rare_enhancement_stone',
    'minor_enhancement_stone'
];
// Maps the optional arg keyword → stone id (case-insensitive)
const STONE_KEYWORD_MAP = {
    'mythic': 'mythic_enhancement_stone',
    'legendary': 'legendary_enhancement_stone',
    'rare': 'rare_enhancement_stone',
    'minor': 'minor_enhancement_stone'
};

async function enhanceItem(sock, chatId, senderJid, input) {
    // Parse input: `<#> [stoneKeyword]`
    const parts = (input || '').trim().split(/\s+/);
    const indexArg = parts[0];
    const stoneKeyword = parts[1] ? parts[1].toLowerCase() : null;

    if (!indexArg) {
        return await sock.sendMessage(chatId, { text: `❌ Usage: \`${getPrefix()}enhance <#bag_index> [mythic|legendary|rare|minor]\`\nExample: \`${getPrefix()}enhance 1 mythic\`\n\n💡 If no stone type is specified, the best available stone is used automatically.` });
    }

    const inventory = inventorySystem.formatInventory(senderJid);
    const targetItem = inventory.items[parseInt(indexArg) - 1];
    if (!targetItem) return await sock.sendMessage(chatId, { text: `❌ Item not found at index ${indexArg}!` });

    // Resolve which stone to use:
    //   - If player specified a keyword, try that stone first.
    //   - Otherwise walk the priority list (best → worst).
    let stoneId = null;
    if (stoneKeyword) {
        const requestedId = STONE_KEYWORD_MAP[stoneKeyword];
        if (!requestedId) {
            return await sock.sendMessage(chatId, { text: `❌ Unknown stone type "${stoneKeyword}". Valid: mythic, legendary, rare, minor.` });
        }
        const hasIt = inventory.items.some(item => item.id === requestedId);
        if (!hasIt) {
            return await sock.sendMessage(chatId, { text: `❌ You don't have any *${lootSystem.getItemInfo(requestedId)?.name || requestedId}*!` });
        }
        stoneId = requestedId;
    } else {
        // Auto-pick best available
        for (const sid of ENHANCE_STONE_PRIORITY) {
            if (inventory.items.some(item => item.id === sid)) {
                stoneId = sid;
                break;
            }
        }
        if (!stoneId) {
            return await sock.sendMessage(chatId, { text: `❌ You don't have any Enhancement Stones!` });
        }
    }

    const result = inventorySystem.enhanceItem(senderJid, targetItem.id, stoneId);
    await sock.sendMessage(chatId, { text: result.message });
}

// ==========================================
// 🛠️ CUSTOM CRAFTING & RECIPES SYSTEM (.g craft)
// ==========================================

const CRAFTING_RECIPES = [
    {
        id: "rusty_dagger",
        name: "Rusted Dagger",
        description: "A simple blade. (+5 ATK)",
        levelReq: 1,
        ingredients: [
            { itemId: "iron_shard", qty: 2 }
        ],
        output: { itemId: "rusty_dagger", qty: 1 }
    },
    {
        id: "iron_sword",
        name: "Iron Sword",
        description: "A sturdy iron blade. (+12 ATK)",
        levelReq: 5,
        ingredients: [
            { itemId: "iron_shard", qty: 3 },
            { itemId: "tough_leather", qty: 1 }
        ],
        output: { itemId: "iron_sword", qty: 1 }
    },
    {
        id: "steel_sabre",
        name: "Steel Sabre",
        description: "Sharp and finely forged. (+25 ATK, +5 SPD)",
        levelReq: 10,
        ingredients: [
            { itemId: "iron_sword", qty: 1 },
            { itemId: "refined_steel", qty: 3 },
            { itemId: "sharp_whetstone", qty: 1 }
        ],
        output: { itemId: "steel_sabre", qty: 1 }
    },
    {
        id: "mythril_staff",
        name: "Mythril Staff",
        description: "Amplifies resonance. (+45 MAG, +15 HP)",
        levelReq: 20,
        ingredients: [
            { itemId: "arcane_wand", qty: 1 },
            { itemId: "mythril_ore", qty: 5 },
            { itemId: "mana_crystal", qty: 2 }
        ],
        output: { itemId: "mythril_staff", qty: 1 }
    },
    {
        id: "chainmail",
        name: "Chainmail",
        description: "Interlinked metal rings. (+12 DEF)",
        levelReq: 4,
        ingredients: [
            { itemId: "iron_shard", qty: 5 },
            { itemId: "tough_leather", qty: 2 }
        ],
        output: { itemId: "chainmail", qty: 1 }
    },
    {
        id: "iron_plate",
        name: "Iron Plate",
        description: "Sturdy iron protection. (+15 DEF)",
        levelReq: 5,
        ingredients: [
            { itemId: "refined_steel", qty: 4 },
            { itemId: "tough_leather", qty: 2 }
        ],
        output: { itemId: "iron_plate", qty: 1 }
    },
    {
        id: "reinforced_plate",
        name: "Reinforced Plate",
        description: "Impenetrable steel plating. (+45 DEF, +50 HP)",
        levelReq: 15,
        ingredients: [
            { itemId: "iron_plate", qty: 1 },
            { itemId: "refined_steel", qty: 6 },
            { itemId: "demon_hide", qty: 2 }
        ],
        output: { itemId: "reinforced_plate", qty: 1 }
    },
    {
        id: "dragon_scale_armor",
        name: "Dragon-Scale Plate",
        description: "Forged from dragon scales. (+85 DEF, +150 HP)",
        levelReq: 30,
        ingredients: [
            { itemId: "reinforced_plate", qty: 1 },
            { itemId: "dragon_blood", qty: 2 },
            { itemId: "demon_hide", qty: 5 }
        ],
        output: { itemId: "dragon_scale_armor", qty: 1 }
    }
];

async function handleCraftCommand(sock, chatId, senderJid, args) {
    const prefix = getPrefix();
    
    // Check registration first
    const economyUser = economy.getUser(senderJid);
    if (!economyUser) {
        await sock.sendMessage(chatId, {
            text: `❌ *ERROR*: You must be registered to craft items. Register using \`${prefix} register <nickname>\`.`
        });
        return;
    }
    
    const playerLevel = economyUser.progression?.level || 1;
    
    // Get inventory
    const inventoryData = inventorySystem.formatInventory(senderJid) || {};
    const inventoryItems = inventoryData.isEmpty ? [] : (inventoryData.items || []);
    
    // Map of itemId to quantity
    const playerInventory = {};
    for (const item of inventoryItems) {
        if (item && item.id) {
            playerInventory[item.id] = (playerInventory[item.id] || 0) + (item.quantity || 0);
        }
    }
    
    // Parse arguments
    let parsedArgs = [];
    if (Array.isArray(args)) {
        parsedArgs = args;
    } else if (typeof args === 'string') {
        parsedArgs = args.trim().split(/\s+/).filter(Boolean);
    }
    
    if (parsedArgs.length === 0 || parsedArgs[0].trim() === "") {
        // No args: get inventory, filter by both conditions (levelReq & ingredients), and render list
        const craftableRecipes = CRAFTING_RECIPES.filter(recipe => {
            // 1. Level Requirement
            if (playerLevel < recipe.levelReq) {
                return false;
            }

            // 2. Ingredient Availability
            for (const ing of recipe.ingredients) {
                const hasQty = playerInventory[ing.itemId] || 0;
                if (hasQty < ing.qty) {
                    return false;
                }
            }

            return true;
        });
        
        let msg = `━━━━━━━━━━━━━━━━\n`;
        msg += `⚒️ *CRAFTABLE ITEMS* \n`;
        msg += `┗━━━━━━━━━━━━━━━━\n\n`;
        msg += `👤 *Player Level:* _${playerLevel}_\n\n`;

        if (craftableRecipes.length === 0) {
            msg += `_You cannot craft or use any items right now._\n`;
        } else {
            craftableRecipes.forEach(recipe => {
                const outputInfo = lootSystem.getItemInfo(recipe.output.itemId) || {};
                const rarityEmojis = {
                    'MYTHIC': '🌌',
                    'LEGENDARY': '👑',
                    'EPIC': '🔮',
                    'RARE': '🔷',
                    'UNCOMMON': '🟢',
                    'COMMON': '⚪'
                };
                const rarityEmoji = rarityEmojis[outputInfo.rarity] || '⚪';

                msg += `✨ *${recipe.name}* (\`${recipe.id}\`) ${rarityEmoji}\n`;
                msg += `📝 _${recipe.description || outputInfo.description || ''}_\n`;
                msg += `⭐ *Req Level:* ${recipe.levelReq}\n`;
                
                const ingredientsStr = recipe.ingredients.map(ing => {
                    const ingInfo = lootSystem.getItemInfo(ing.itemId) || {};
                    return `${ing.qty}x ${ingInfo.name || ing.itemId}`;
                }).join(', ');

                msg += `🛠️ *Ingredients:* ${ingredientsStr}\n`;
                msg += `🎁 *Yield:* ${recipe.output.qty}x ${outputInfo.name || recipe.output.itemId}\n\n`;
            });
            
            msg += `💡 *To craft an item:* \`${prefix} craft <id>\` (e.g., \`${prefix} craft iron_sword\`)`;
        }
        msg += `\n━━━━━━━━━━━━━━━━`;
        
        await sock.sendMessage(chatId, { text: msg });
        return;
    }
    
    // args has recipe ID
    const recipeId = parsedArgs[0].trim().toLowerCase();
    const recipe = CRAFTING_RECIPES.find(r => r.id.toLowerCase() === recipeId);
    
    if (!recipe) {
        await sock.sendMessage(chatId, {
            text: `❌ *ERROR*: Recipe for \`${recipeId}\` not found.`
        });
        return;
    }
    
    // Check level req
    if (playerLevel < recipe.levelReq) {
        await sock.sendMessage(chatId, {
            text: `❌ *CRAFT FAILED*\n━━━━━━━━━━━━━━━━\nLevel requirement not met.\nReq: Level *${recipe.levelReq}*\nYour Level: *${playerLevel}*`
        });
        return;
    }
    
    // Check ingredients
    const missingIngredients = [];
    for (const ing of recipe.ingredients) {
        const hasQty = playerInventory[ing.itemId] || 0;
        if (hasQty < ing.qty) {
            const ingInfo = lootSystem.getItemInfo(ing.itemId) || {};
            missingIngredients.push(`${ing.qty - hasQty}x ${ingInfo.name || ing.itemId}`);
        }
    }
    
    if (missingIngredients.length > 0) {
        await sock.sendMessage(chatId, {
            text: `❌ *CRAFT FAILED*\n━━━━━━━━━━━━━━━━\nMissing ingredients:\n_` + missingIngredients.join('\n') + `_`
        });
        return;
    }
    
    // Check space
    if (!inventorySystem.hasInventorySpace(senderJid, 1, recipe.output.itemId)) {
        await sock.sendMessage(chatId, {
            text: `❌ *CRAFT FAILED*\n━━━━━━━━━━━━━━━━\nYour inventory is full! Sell some items or upgrade your bag size first.`
        });
        return;
    }
    
    // Deduct ingredients
    for (const ing of recipe.ingredients) {
        inventorySystem.removeItem(senderJid, ing.itemId, ing.qty);
    }
    
    // Add output
    await inventorySystem.addItem(senderJid, recipe.output.itemId, recipe.output.qty);

    // 💡 FIX: track itemsCrafted for rank missions. handleCraftCommand is a
    // SEPARATE craft path from craftItem() — it does its own ingredient
    // deduction and item add, but was missing the rank-mission tracking
    // call. Players crafting the 8 legacy recipes (rusty_dagger, iron_sword,
    // steel_sabre, mythril_staff, chainmail, iron_plate, reinforced_plate,
    // dragon_scale_armor) were getting ZERO itemsCrafted credit toward
    // the Trial of Mastery (15 items) and Trial of Divinity (50 items)
    // rank missions. craftItem() already had this via craftingSystem.performCraft.
    try {
        economy.trackMissionStat(senderJid, 'itemsCrafted', recipe.output.qty || 1);
    } catch (e) {}

    // Generate transaction card image if possible
    try {
        // 💡 PERF PATCH 2026-07-27: cached + 8s timeout (was no timeout, could hit 90s global)
        const pfpUrl = await fetchPfpCached(sock, senderJid);
        const nickname = economyUser.nickname || senderJid.split('@')[0];
        const currency = getCurrency();
        
        const imgBuf = await goService.generateTransactionCard({
            nickname: nickname,
            type: 'CRAFT',
            amount: recipe.output.qty,
            newWallet: economyUser.wallet || 0,
            newBank: economyUser.bank || 0,
            zeniSymbol: currency.symbol || 'Z',
            pfpUrl: pfpUrl,
            itemName: recipe.name,
            item: recipe.name,
            details: `Crafted: ${recipe.name}`,
            description: recipe.description || `Crafted ${recipe.name}`
        });

        // Confirmation text message
        const outputInfo = lootSystem.getItemInfo(recipe.output.itemId) || {};
        let confirmMsg = `✅ *CRAFT SUCCESSFUL!*\n`;
        confirmMsg += `━━━━━━━━━━━━━━━━\n`;
        confirmMsg += `🔨 Forged *${recipe.name}*\n\n`;
        confirmMsg += `➖ *Used:* \n`;
        recipe.ingredients.forEach(ing => {
            const ingInfo = lootSystem.getItemInfo(ing.itemId) || {};
            confirmMsg += `  • ${ing.qty}x ${ingInfo.name || ing.itemId}\n`;
        });
        confirmMsg += `\n➕ *Received:* \n`;
        confirmMsg += `  • ${recipe.output.qty}x *${outputInfo.name || recipe.output.itemId}*\n`;
        confirmMsg += `━━━━━━━━━━━━━━━━`;

        if (imgBuf) {
            await sock.sendMessage(chatId, { 
                image: imgBuf, 
                caption: confirmMsg 
            });
        } else {
            throw new Error("No image buffer returned");
        }
    } catch (e) {
        console.error("Failed to generate crafting image card:", e.message);
        // Fallback to text message
        const outputInfo = lootSystem.getItemInfo(recipe.output.itemId) || {};
        let confirmMsg = `✅ *CRAFT SUCCESSFUL!*\n`;
        confirmMsg += `━━━━━━━━━━━━━━━━\n`;
        confirmMsg += `🔨 Forged *${recipe.name}*\n\n`;
        confirmMsg += `➖ *Used:* \n`;
        recipe.ingredients.forEach(ing => {
            const ingInfo = lootSystem.getItemInfo(ing.itemId) || {};
            confirmMsg += `  • ${ing.qty}x ${ingInfo.name || ing.itemId}\n`;
        });
        confirmMsg += `\n➕ *Received:* \n`;
        confirmMsg += `  • ${recipe.output.qty}x *${outputInfo.name || recipe.output.itemId}*\n`;
        confirmMsg += `━━━━━━━━━━━━━━━━`;
        await sock.sendMessage(chatId, { text: confirmMsg });
    }
}

module.exports = { displayCharacterSheet, displayInventory, allocateStats, resetStats, displayLeaderboard, sellItem, upgradeInventory, equipItem, unequipItem, useItem, displayRecipes, craftItem, dismantleItem, mineOre, showItemSource, enhanceItem, cookItem, brewItem, forgeItem, handleCraftCommand, CRAFTING_RECIPES };
