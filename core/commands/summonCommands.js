// ============================================
// 🐉 SUMMON COMMANDS — player-facing summon management
// ============================================
// Commands:
//   .summon list              — view owned summons
//   .summon deploy <id>       — equip a summon for combat
//   .summon dismiss           — unequip active summon
//   .summon info <id>         — detailed summon view
//   .summon release <id>      — permanently release a summon
//   .summon train <id>        — daily training (+500 XP, shared cooldown)
//   .summon allocate <id> <stat> <points> — allocate stat points
//   .summon resonance         — view active resonance web bonuses
//   .summon compendium        — view tamed species (Necromancer)
//   .summon hatch <eggId>     — hatch a summon egg
//
// See: /home/z/my-project/download/SUMMONER_SYSTEM_DESIGN.md

const economy = require('../rpg/economy');
const botConfig = require('../../botConfig');
const summonSystem = require('../rpg/summonSystem');
const summonCapture = require('../rpg/summonCapture');
const summonForging = require('../rpg/summonForging');
const summonTrials = require('../rpg/summonTrials');
const registry = require('../rpg/summonRegistry');

const getPrefix = () => botConfig.getPrefix();

// ─────────────────────────────────────────────────────────────
// MAIN COMMAND ROUTER
// ─────────────────────────────────────────────────────────────

async function handleCommand(sock, chatId, senderJid, senderName, args) {
  const sub = (args[0] || '').toLowerCase();
  const rest = args.slice(1);

  switch (sub) {
    case 'list':
    case 'ls':
      return await cmdList(sock, chatId, senderJid);

    case 'deploy':
    case 'equip':
      return await cmdDeploy(sock, chatId, senderJid, rest);

    case 'dismiss':
    case 'unequip':
      return await cmdDismiss(sock, chatId, senderJid);

    case 'info':
    case 'i':
      return await cmdInfo(sock, chatId, senderJid, rest);

    case 'release':
      return await cmdRelease(sock, chatId, senderJid, rest);

    case 'train':
      return await cmdTrain(sock, chatId, senderJid, rest);

    case 'allocate':
    case 'alloc':
      return await cmdAllocate(sock, chatId, senderJid, rest);

    case 'resonance':
    case 'res':
      return await cmdResonance(sock, chatId, senderJid);

    case 'compendium':
    case 'tamed':
      return await cmdCompendium(sock, chatId, senderJid);

    case 'hatch':
      return await cmdHatch(sock, chatId, senderJid, rest);

    case 'forge':
    case 'fuse':
      return await cmdForge(sock, chatId, senderJid, rest);

    case 'trial':
      return await cmdTrial(sock, chatId, senderJid, rest);

    case 'passives':
      return await cmdPassives(sock, chatId, senderJid);

    case 'help':
    default:
      return await cmdHelp(sock, chatId);
  }
}

// ─────────────────────────────────────────────────────────────
// .summon list — view owned summons
// ─────────────────────────────────────────────────────────────

async function cmdList(sock, chatId, senderJid) {
  const user = economy.getUser(senderJid);
  if (!user) {
    await sock.sendMessage(chatId, { text: '❌ Not registered. Use `' + getPrefix() + ' register` first.' });
    return;
  }

  const summons = await summonSystem.getUserSummons(senderJid);

  if (summons.length === 0) {
    await sock.sendMessage(chatId, {
      text: `🐉 *You own no summons.*\n\nSummons can be obtained by:\n• Necromancer: capture enemies with Army of the Dead\n• Hatching summon eggs (from boss drops, raids, abyss)\n• Purchasing from the summon market\n\nUse \`${getPrefix()} summon help\` for all commands.`
    });
    return;
  }

  let msg = `🐉 *YOUR SUMMONS* (${summons.length}/${user.summonSlots || 3} slots)\n`;
  msg += `━━━━━━━━━━━━━━━\n`;

  for (let i = 0; i < summons.length; i++) {
    const s = summons[i];
    const species = registry.getSpecies(s.species);
    const name = s.nickname || species?.name || s.species;
    const active = user.activeSummonId === s.summonId ? ' ⭐' : '';
    const forSaleTag = s.forSale ? ' 🏷️' : '';
    const tamedTag = (s.lineage || []).some(l => l.personality === 'TAMED') ? ' ✨' : '';

    msg += `\n${i + 1}. ${species?.icon || '🐉'} *${name}*${active}${forSaleTag}${tamedTag}\n`;
    msg += `   📊 Lv.${s.level} ${s.rarity} ${s.tier} | ${s.element}/${s.archetype}\n`;
    msg += `   💖 ${s.loyalty} loyalty | 🧠 ${s.personality}\n`;
    msg += `   🆔 \`${s.summonId.slice(-8)}\`\n`;
  }

  msg += `\n💡 Use \`${getPrefix()} summon info <id>\` for details.\n`;
  msg += `💡 Use \`${getPrefix()} summon deploy <id>\` to equip one.\n`;
  if (user.activeSummonId) {
    msg += `⭐ = currently deployed`;
  }

  await sock.sendMessage(chatId, { text: msg });
}

// ─────────────────────────────────────────────────────────────
// .summon deploy <id> — equip a summon
// ─────────────────────────────────────────────────────────────

async function cmdDeploy(sock, chatId, senderJid, args) {
  const user = economy.getUser(senderJid);
  if (!user) {
    await sock.sendMessage(chatId, { text: '❌ Not registered.' });
    return;
  }

  const query = (args[0] || '').trim();
  if (!query) {
    await sock.sendMessage(chatId, {
      text: `❌ Usage: \`${getPrefix()} summon deploy <id>\`\n\nUse \`${getPrefix()} summon list\` to see your summon IDs (last 8 chars).`
    });
    return;
  }

  // Resolve summon by partial ID match (last 8 chars) or nickname
  const summons = await summonSystem.getUserSummons(senderJid);
  const target = summons.find(s =>
    s.summonId.endsWith(query) ||
    s.summonId === query ||
    (s.nickname && s.nickname.toLowerCase() === query.toLowerCase())
  );

  if (!target) {
    await sock.sendMessage(chatId, { text: `❌ No summon matching "${query}". Use \`${getPrefix()} summon list\` to see your IDs.` });
    return;
  }

  const result = await summonSystem.deploySummon(user, target.summonId);
  await sock.sendMessage(chatId, { text: result.message });

  // Refresh resonances
  if (result.success) {
    try {
      await summonSystem.refreshUserResonances(user);
      const activeRes = user.activeResonances || [];
      if (activeRes.length > 0) {
        const resonanceNames = activeRes.map(r => registry.getResonance(r)?.name || r).join(', ');
        await sock.sendMessage(chatId, { text: `🔗 Active resonances: ${resonanceNames}` });
      }
    } catch (e) {}
  }
}

// ─────────────────────────────────────────────────────────────
// .summon dismiss — unequip active summon
// ─────────────────────────────────────────────────────────────

async function cmdDismiss(sock, chatId, senderJid) {
  const user = economy.getUser(senderJid);
  if (!user) {
    await sock.sendMessage(chatId, { text: '❌ Not registered.' });
    return;
  }

  const result = await summonSystem.dismissSummon(user);
  await sock.sendMessage(chatId, { text: result.message });
}

// ─────────────────────────────────────────────────────────────
// .summon info <id> — detailed view
// ─────────────────────────────────────────────────────────────

async function cmdInfo(sock, chatId, senderJid, args) {
  const user = economy.getUser(senderJid);
  if (!user) {
    await sock.sendMessage(chatId, { text: '❌ Not registered.' });
    return;
  }

  const query = (args[0] || '').trim();
  if (!query) {
    await sock.sendMessage(chatId, { text: `❌ Usage: \`${getPrefix()} summon info <id>\`` });
    return;
  }

  const summons = await summonSystem.getUserSummons(senderJid);
  const target = summons.find(s =>
    s.summonId.endsWith(query) ||
    s.summonId === query ||
    (s.nickname && s.nickname.toLowerCase() === query.toLowerCase())
  );

  if (!target) {
    await sock.sendMessage(chatId, { text: `❌ No summon matching "${query}".` });
    return;
  }

  const species = registry.getSpecies(target.species);
  const echo = registry.getEcho(target.echoId);
  const stats = summonSystem.computeEffectiveStats(target);
  const personality = registry.getPersonalityModifier(target.personality);
  const active = user.activeSummonId === target.summonId;

  let msg = `🐉 *SUMMON DETAILS*\n`;
  msg += `━━━━━━━━━━━━━━━\n\n`;
  msg += `${species?.icon || '🐉'} *${target.nickname || species?.name || target.species}*${active ? ' ⭐ ACTIVE' : ''}\n`;
  msg += `📊 Level ${target.level}/${registry.getRarityConfig(target.rarity).maxLevel} | ${target.rarity} | ${target.tier}\n`;
  msg += `🎯 Element: ${target.element} | Archetype: ${target.archetype}\n`;
  msg += `💖 Loyalty: ${target.loyalty}/100\n`;
  msg += `🧠 Personality: ${personality.name} — ${personality.desc}\n\n`;

  msg += `*STATS:*\n`;
  msg += `❤️ HP: ${stats.hp} | ⚔️ ATK: ${stats.atk}\n`;
  msg += `🛡️ DEF: ${stats.def} | 🔮 MAG: ${stats.mag}\n`;
  msg += `💨 SPD: ${stats.spd} | 💥 CRIT: ${stats.crit}%\n`;
  msg += `🕊️ EVA: ${stats.evasion}% | 🛡️ DR: ${stats.dmgReduction}%\n\n`;

  msg += `*PROGRESSION:*\n`;
  msg += `✨ XP: ${target.xp}/${registry.getSummonXPForLevel(target.level + 1) - registry.getSummonXPForLevel(target.level)}\n`;
  msg += `📈 Stat points available: ${target.statPoints}\n\n`;

  msg += `*SOUL ECHO:*\n`;
  msg += `${echo?.icon || '💫'} ${echo?.name || 'Unknown'} — ${echo?.desc || ''}\n\n`;

  // Behavior score (personality development)
  const bs = target.behaviorScore || {};
  msg += `*BEHAVIOR* (shifts at ${summonCapture.PERSONALITY_SHIFT_THRESHOLD || 20} actions):\n`;
  msg += `😤 Aggressive: ${bs.aggressive || 0} | 🛡️ Protective: ${bs.protective || 0}\n`;
  msg += `🤔 Curious: ${bs.curious || 0} | 🎲 Volatile: ${bs.volatile || 0}\n\n`;

  // Lineage
  if (target.lineage && target.lineage.length > 0) {
    msg += `*LINEAGE:*\n`;
    for (const ancestor of target.lineage) {
      if (ancestor.personality === 'TAMED') {
        msg += `✨ *TAMED* — +20% stats (permanent bonus)\n`;
      } else {
        msg += `• ${ancestor.species} (Lv.${ancestor.level}, ${ancestor.personality})\n`;
      }
    }
    msg += `\n`;
  }

  // Runes
  if (target.socketedRuneIds && target.socketedRuneIds.length > 0) {
    msg += `*RUNES:* ${target.socketedRuneIds.length}/${registry.getRarityConfig(target.rarity).runeSlots} slots\n`;
    for (const runeId of target.socketedRuneIds) {
      msg += `• ${runeId}\n`;
    }
    msg += `\n`;
  }

  msg += `🆔 Full ID: \`${target.summonId}\`\n`;
  msg += `📅 Obtained: ${target.obtainedAt?.toLocaleDateString() || 'unknown'} via ${target.obtainedFrom || 'unknown'}`;

  await sock.sendMessage(chatId, { text: msg });
}

// ─────────────────────────────────────────────────────────────
// .summon release <id> — permanently release
// ─────────────────────────────────────────────────────────────

async function cmdRelease(sock, chatId, senderJid, args) {
  const user = economy.getUser(senderJid);
  if (!user) {
    await sock.sendMessage(chatId, { text: '❌ Not registered.' });
    return;
  }

  const query = (args[0] || '').trim();
  if (!query) {
    await sock.sendMessage(chatId, { text: `❌ Usage: \`${getPrefix()} summon release <id>\`` });
    return;
  }

  const summons = await summonSystem.getUserSummons(senderJid);
  const target = summons.find(s =>
    s.summonId.endsWith(query) ||
    s.summonId === query ||
    (s.nickname && s.nickname.toLowerCase() === query.toLowerCase())
  );

  if (!target) {
    await sock.sendMessage(chatId, { text: `❌ No summon matching "${query}".` });
    return;
  }

  // Safety: can't release active summon
  if (user.activeSummonId === target.summonId) {
    await sock.sendMessage(chatId, { text: `❌ Cannot release your active summon. Dismiss it first with \`${getPrefix()} summon dismiss\`.` });
    return;
  }

  const result = await summonSystem.releaseSummon(senderJid, target.summonId);

  if (result.success) {
    // Refresh resonances
    try {
      await summonSystem.refreshUserResonances(user);
    } catch (e) {}
  }

  await sock.sendMessage(chatId, { text: result.message });
}

// ─────────────────────────────────────────────────────────────
// .summon train <id> — daily training
// ─────────────────────────────────────────────────────────────

async function cmdTrain(sock, chatId, senderJid, args) {
  const user = economy.getUser(senderJid);
  if (!user) {
    await sock.sendMessage(chatId, { text: '❌ Not registered.' });
    return;
  }

  const query = (args[0] || '').trim();
  if (!query) {
    await sock.sendMessage(chatId, { text: `❌ Usage: \`${getPrefix()} summon train <id>\`` });
    return;
  }

  const summons = await summonSystem.getUserSummons(senderJid);
  const target = summons.find(s =>
    s.summonId.endsWith(query) ||
    s.summonId === query ||
    (s.nickname && s.nickname.toLowerCase() === query.toLowerCase())
  );

  if (!target) {
    await sock.sendMessage(chatId, { text: `❌ No summon matching "${query}".` });
    return;
  }

  const result = await summonSystem.trainSummon(user, target.summonId);
  await sock.sendMessage(chatId, { text: result.message });
}

// ─────────────────────────────────────────────────────────────
// .summon allocate <id> <stat> <points>
// ─────────────────────────────────────────────────────────────

async function cmdAllocate(sock, chatId, senderJid, args) {
  const user = economy.getUser(senderJid);
  if (!user) {
    await sock.sendMessage(chatId, { text: '❌ Not registered.' });
    return;
  }

  const query = args[0] || '';
  const stat = (args[1] || '').toLowerCase();
  const points = parseInt(args[2]) || 1;

  if (!query || !stat) {
    await sock.sendMessage(chatId, {
      text: `❌ Usage: \`${getPrefix()} summon allocate <id> <stat> <points>\`\nStats: hp, atk, def, mag, spd`
    });
    return;
  }

  const summons = await summonSystem.getUserSummons(senderJid);
  const target = summons.find(s =>
    s.summonId.endsWith(query) ||
    s.summonId === query ||
    (s.nickname && s.nickname.toLowerCase() === query.toLowerCase())
  );

  if (!target) {
    await sock.sendMessage(chatId, { text: `❌ No summon matching "${query}".` });
    return;
  }

  const result = summonSystem.allocateStatPoint(target, stat, points);
  if (result.success) {
    await target.save();
  }
  await sock.sendMessage(chatId, { text: result.message });
}

// ─────────────────────────────────────────────────────────────
// .summon resonance — view active resonance web bonuses
// ─────────────────────────────────────────────────────────────

async function cmdResonance(sock, chatId, senderJid) {
  const user = economy.getUser(senderJid);
  if (!user) {
    await sock.sendMessage(chatId, { text: '❌ Not registered.' });
    return;
  }

  // Refresh resonances
  await summonSystem.refreshUserResonances(user);
  const active = user.activeResonances || [];

  if (active.length === 0) {
    await sock.sendMessage(chatId, {
      text: `🔗 *RESONANCE WEB*\n\nNo active resonances.\n\nOwn diverse summons to activate resonances. Examples:\n• *Legion*: own 3+ undead (+5% magic)\n• *Pack*: own 3+ beasts (+5% speed)\n• *Steam*: own fire + ice (+10% vs wet)\n• *Conclave*: own fire + ice + lightning (+5% all stats)\n\nUse \`${getPrefix()} summon list\` to see your collection.`
    });
    return;
  }

  let msg = `🔗 *RESONANCE WEB* — ${active.length} active\n`;
  msg += `━━━━━━━━━━━━━━━\n\n`;

  for (const resonanceId of active) {
    const res = registry.getResonance(resonanceId);
    if (!res) continue;
    msg += `${res.icon} *${res.name}*\n`;
    msg += `   ${res.desc}\n\n`;
  }

  await sock.sendMessage(chatId, { text: msg });
}

// ─────────────────────────────────────────────────────────────
// .summon compendium — view tamed species (Necromancer)
// ─────────────────────────────────────────────────────────────

async function cmdCompendium(sock, chatId, senderJid) {
  const user = economy.getUser(senderJid);
  if (!user) {
    await sock.sendMessage(chatId, { text: '❌ Not registered.' });
    return;
  }

  const tamed = summonCapture.getTamedSpecies(user);
  const allMappings = summonCapture.ENEMY_TO_SPECIES_MAP;
  const totalSpecies = new Set(Object.values(allMappings)).size;

  let msg = `📖 *TAMING COMPENDIUM*\n`;
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `✨ Tamed: ${tamed.length}/${totalSpecies} species\n\n`;

  if (tamed.length === 0) {
    msg += `No tamed species yet.\n\n`;
    msg += `Taming is the Necromancer's capture pipeline:\n`;
    msg += `1. Cast *Army of the Dead* to open a capture window\n`;
    msg += `2. Kill enemies during the window to capture them\n`;
    msg += `3. Kill 10 of the same enemy type to permanently "tame" that species\n`;
    msg += `4. Tamed species summons get +20% stats permanently\n`;
  } else {
    msg += `*TAMED SPECIES:*\n`;
    for (const t of tamed) {
      const species = registry.getSpecies(t.speciesId);
      msg += `${species?.icon || '🐉'} ${species?.name || t.speciesId} — ${t.count} kills\n`;
    }
  }

  // Show in-progress taming
  const progress = user.tamingProgress || {};
  const inProgress = Object.entries(progress)
    .filter(([_, count]) => count > 0 && count < summonCapture.CAPTURE_CONFIG.TAMING_THRESHOLD)
    .sort((a, b) => b[1] - a[1]);

  if (inProgress.length > 0) {
    msg += `\n*IN PROGRESS:*\n`;
    for (const [enemyType, count] of inProgress.slice(0, 10)) {
      const speciesId = allMappings[enemyType];
      const species = registry.getSpecies(speciesId);
      msg += `${species?.icon || '❓'} ${species?.name || enemyType} — ${count}/${summonCapture.CAPTURE_CONFIG.TAMING_THRESHOLD}\n`;
    }
  }

  await sock.sendMessage(chatId, { text: msg });
}

// ─────────────────────────────────────────────────────────────
// .summon hatch <eggId> — hatch a summon egg
// ─────────────────────────────────────────────────────────────

async function cmdHatch(sock, chatId, senderJid, args) {
  const user = economy.getUser(senderJid);
  if (!user) {
    await sock.sendMessage(chatId, { text: '❌ Not registered.' });
    return;
  }

  const eggId = (args[0] || '').trim();
  if (!eggId) {
    await sock.sendMessage(chatId, {
      text: `❌ Usage: \`${getPrefix()} summon hatch <egg_id>\`\n\nSummon eggs can be obtained from boss drops, raids, and the abyss.`
    });
    return;
  }

  // Check if user has the egg
  const inventorySystem = require('../rpg/inventorySystem');
  if (!inventorySystem.hasItem(senderJid, eggId)) {
    await sock.sendMessage(chatId, { text: `❌ You don't have a "${eggId}" egg.` });
    return;
  }

  // Check slot space
  const summons = await summonSystem.getUserSummons(senderJid);
  if (summons.length >= (user.summonSlots || 3)) {
    await sock.sendMessage(chatId, { text: `❌ Summon slots full (${summons.length}/${user.summonSlots || 3}). Release a summon or expand your slots first.` });
    return;
  }

  // Determine species from egg ID
  // Egg IDs: summon_egg_<species> (e.g. summon_egg_skeleton, summon_egg_flame_elemental)
  // Common eggs: summon_egg_common (random COMMON species)
  let speciesId = null;
  if (eggId === 'summon_egg_common' || eggId === 'common_summon_egg') {
    // Random common species
    const commonSpecies = Object.entries(registry.SUMMON_SPECIES)
      .filter(([_, s]) => s.rarity === 'COMMON')
      .map(([id]) => id);
    if (commonSpecies.length === 0) {
      await sock.sendMessage(chatId, { text: '❌ No common species available.' });
      return;
    }
    speciesId = commonSpecies[Math.floor(Math.random() * commonSpecies.length)];
  } else {
    // Extract species from egg ID
    const match = eggId.match(/^summon_egg_(.+)$/);
    if (match) {
      speciesId = match[1];
    }
  }

  if (!speciesId || !registry.getSpecies(speciesId)) {
    await sock.sendMessage(chatId, { text: `❌ Unknown egg type: "${eggId}". Cannot hatch.` });
    return;
  }

  // Consume the egg
  inventorySystem.removeItem(senderJid, eggId, 1);

  // Create the summon
  try {
    const summon = await summonSystem.createSummon(senderJid, speciesId, {
      obtainedFrom: 'egg'
    });

    const species = registry.getSpecies(speciesId);
    await sock.sendMessage(chatId, {
      text: `🥚 *EGG HATCHED!*\n\n${species.icon} A *${species.name}* has been born!\n\n📊 Level ${summon.level} | ${summon.rarity}\n💖 Loyalty: ${summon.loyalty}/100\n🧠 Personality: STOIC\n\nUse \`${getPrefix()} summon deploy ${summon.summonId.slice(-8)}\` to equip it.`
    });

    // Refresh resonances
    try {
      await summonSystem.refreshUserResonances(user);
    } catch (e) {}
  } catch (e) {
    // Refund the egg on failure
    inventorySystem.addItem(senderJid, eggId, 1);
    await sock.sendMessage(chatId, { text: `❌ Hatching failed: ${e.message}` });
  }
}

// ─────────────────────────────────────────────────────────────
// .summon forge <id1> <id2> — Soul Forging
// ─────────────────────────────────────────────────────────────

async function cmdForge(sock, chatId, senderJid, args) {
  const user = economy.getUser(senderJid);
  if (!user) {
    await sock.sendMessage(chatId, { text: '❌ Not registered.' });
    return;
  }

  const id1 = (args[0] || '').trim();
  const id2 = (args[1] || '').trim();

  if (!id1 || !id2) {
    await sock.sendMessage(chatId, {
      text: `❌ Usage: \`${getPrefix()} summon forge <id1> <id2>\`\n\nBoth summons are consumed. The fused summon inherits traits from both + random mutations. Soulbound for 7 days. Cost: 50K+ Zeni.`
    });
    return;
  }

  // Resolve both summons by partial ID
  const summons = await summonSystem.getUserSummons(senderJid);
  const s1 = summons.find(s => s.summonId.endsWith(id1) || s.summonId === id1 || (s.nickname && s.nickname.toLowerCase() === id1.toLowerCase()));
  const s2 = summons.find(s => s.summonId.endsWith(id2) || s.summonId === id2 || (s.nickname && s.nickname.toLowerCase() === id2.toLowerCase()));

  if (!s1 || !s2) {
    await sock.sendMessage(chatId, { text: '❌ One or both summons not found. Use partial IDs from `.summon list`.' });
    return;
  }

  // Confirm
  const species1 = registry.getSpecies(s1.species);
  const species2 = registry.getSpecies(s2.species);
  const totalLevel = s1.level + s2.level;
  const goldCost = summonForging.FORGE_CONFIG.GOLD_COST_BASE + (totalLevel * summonForging.FORGE_CONFIG.GOLD_COST_PER_LEVEL);

  // Execute the forge
  const result = await summonForging.forgeSummons(senderJid, s1.summonId, s2.summonId);
  await sock.sendMessage(chatId, { text: result.message });

  if (result.success && result.summon) {
    // Show active resonances update
    try {
      const activeRes = user.activeResonances || [];
      if (activeRes.length > 0) {
        const resonanceNames = activeRes.map(r => registry.getResonance(r)?.name || r).join(', ');
        await sock.sendMessage(chatId, { text: `🔗 Active resonances: ${resonanceNames}` });
      }
    } catch (e) {}
  }
}

// ─────────────────────────────────────────────────────────────
// .summon trial <id> — attempt solo evolution trial
// ─────────────────────────────────────────────────────────────

async function cmdTrial(sock, chatId, senderJid, args) {
  const user = economy.getUser(senderJid);
  if (!user) {
    await sock.sendMessage(chatId, { text: '❌ Not registered.' });
    return;
  }

  const query = (args[0] || '').trim();
  if (!query) {
    // Show available trials
    const summons = await summonSystem.getUserSummons(senderJid);
    const eligible = summons.filter(s => {
      const trial = summonTrials.getTrial(s.species);
      return trial && !s.trialCompleted && s.level >= trial.requiredSummonLevel && s.tier === trial.requiredTier;
    });

    let msg = `⚔️ *SUMMON TRIALS*\n`;
    msg += `━━━━━━━━━━━━━━━\n\n`;

    if (eligible.length === 0) {
      msg += `No eligible summons for trials right now.\n\n`;
      msg += `Trials require:\n• Summon at the required level\n• Correct evolution tier (BASE or ASCENDED)\n• Trial not already completed\n\n`;
      msg += `Use \`${getPrefix()} summon trial <id>\` to attempt a trial.`;
    } else {
      msg += `*ELIGIBLE SUMMONS:*\n`;
      for (const s of eligible) {
        const trial = summonTrials.getTrial(s.species);
        const species = registry.getSpecies(s.species);
        msg += `${species?.icon || '🐉'} *${s.nickname || species?.name || s.species}* — ${trial.name}\n`;
        msg += `   📊 Lv.${s.level} | Boss: ${trial.bossId} (Lv.${trial.bossLevel})\n`;
        msg += `   🆔 \`${s.summonId.slice(-8)}\`\n`;
        msg += `   Reward: Evolve to ${trial.rewardEvolution} + unlock *${summonTrials.getPassive(trial.rewardPassive)?.name || 'passive'}*\n\n`;
      }
      msg += `Use \`${getPrefix()} summon trial <id>\` to attempt.`;
    }

    await sock.sendMessage(chatId, { text: msg });
    return;
  }

  // Resolve summon
  const summons = await summonSystem.getUserSummons(senderJid);
  const target = summons.find(s =>
    s.summonId.endsWith(query) || s.summonId === query ||
    (s.nickname && s.nickname.toLowerCase() === query.toLowerCase())
  );

  if (!target) {
    await sock.sendMessage(chatId, { text: `❌ No summon matching "${query}".` });
    return;
  }

  const result = await summonTrials.attemptTrial(senderJid, target.summonId);
  await sock.sendMessage(chatId, { text: result.message });
}

// ─────────────────────────────────────────────────────────────
// .summon passives — view unlocked player passives from trials
// ─────────────────────────────────────────────────────────────

async function cmdPassives(sock, chatId, senderJid) {
  const user = economy.getUser(senderJid);
  if (!user) {
    await sock.sendMessage(chatId, { text: '❌ Not registered.' });
    return;
  }

  const passives = summonTrials.getActivePlayerPassives(user);
  const allPassives = Object.entries(summonTrials.PLAYER_PASSIVES);

  let msg = `✨ *SUMMON TRIAL PASSIVES*\n`;
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `Unlocked: ${passives.length}/${allPassives.length}\n\n`;

  if (passives.length === 0) {
    msg += `No passives unlocked yet.\n\n`;
    msg += `Complete summon trials to unlock permanent player passives.\n`;
    msg += `Each passive is active whenever you own a summon of the matching element.\n\n`;
    msg += `Use \`${getPrefix()} summon trial\` to see eligible summons.`;
  } else {
    msg += `*ACTIVE PASSIVES:*\n`;
    for (const p of passives) {
      msg += `✅ ${p.name} — ${p.desc}\n`;
    }

    const locked = allPassives.filter(([id]) => !user.unlockedSummonPassives.includes(id));
    if (locked.length > 0) {
      msg += `\n*LOCKED:*\n`;
      for (const [id, p] of locked.slice(0, 10)) {
        msg += `🔒 ${p.name} — ${p.desc}\n`;
      }
      if (locked.length > 10) {
        msg += `... and ${locked.length - 10} more\n`;
      }
    }
  }

  await sock.sendMessage(chatId, { text: msg });
}

// ─────────────────────────────────────────────────────────────
// .summon help
// ─────────────────────────────────────────────────────────────

async function cmdHelp(sock, chatId) {
  const p = getPrefix();
  let msg = `🐉 *SUMMONER SYSTEM*\n`;
  msg += `━━━━━━━━━━━━━━━\n\n`;
  msg += `*COMMANDS:*\n`;
  msg += `📋 \`${p} summon list\` — view your summons\n`;
  msg += `⚔️ \`${p} summon deploy <id>\` — equip for combat\n`;
  msg += `🛡️ \`${p} summon dismiss\` — unequip active summon\n`;
  msg += `🔍 \`${p} summon info <id>\` — detailed summon view\n`;
  msg += `📈 \`${p} summon train <id>\` — daily training (+500 XP)\n`;
  msg += `📊 \`${p} summon allocate <id> <stat> <pts>\` — allocate stat points\n`;
  msg += `🔗 \`${p} summon resonance\` — view active resonance bonuses\n`;
  msg += `📖 \`${p} summon compendium\` — view tamed species (Necromancer)\n`;
  msg += `🥚 \`${p} summon hatch <egg_id>\` — hatch a summon egg\n`;
  msg += `⚔️ \`${p} summon forge <id1> <id2>\` — Soul Forge two summons\n`;
  msg += `🏆 \`${p} summon trial <id>\` — attempt evolution trial\n`;
  msg += `✨ \`${p} summon passives\` — view unlocked trial passives\n`;
  msg += `💔 \`${p} summon release <id>\` — permanently release a summon\n\n`;
  msg += `*OBTAINING SUMMONS:*\n`;
  msg += `• Necromancer: cast Army of the Dead to capture enemies\n`;
  msg += `• Hatch eggs (from boss drops, raids, abyss)\n`;
  msg += `• Trade on the summon market (coming soon)\n\n`;
  msg += `*MECHANICS:*\n`;
  msg += `• Summons act via gauge-based turn order (high SPD = more turns)\n`;
  msg += `• Personalities shift based on how you use them\n`;
  msg += `• Death leaves a Soul Echo buff on you (3 turns)\n`;
  msg += `• Loyalty decays per action — restore with Loyalty Crystals\n`;
  msg += `• Own diverse summons to activate Resonance Web bonuses\n`;
  msg += `• At 0 loyalty: 5% betrayal chance per combat\n\n`;
  msg += `💡 Use partial IDs (last 8 chars) or nicknames for <id>.`;

  await sock.sendMessage(chatId, { text: msg });
}

// ─────────────────────────────────────────────────────────────
// MODULE EXPORTS
// ─────────────────────────────────────────────────────────────

module.exports = {
  handleCommand
};
