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
// 💡 Phase C2: Image-based roster rendering
const rosterRenderer = require('../rpg/summonRosterRenderer');
const summonSprites = require('../rpg/summonSprites');
const codexRenderer = require('../rpg/summonCodexRenderer');

const getPrefix = () => botConfig.getPrefix();

// 💡 HELPER: Resolve a summon by position number (1, 2, 3) or fallback to summonId
// This replaces all the old summonId.endsWith(query) lookups.
// SYNCHRONOUS — no I/O, no await needed.
function resolveSummon(summons, query) {
  if (!query) return null;
  // Try position number first
  const num = parseInt(query);
  if (!isNaN(num) && num >= 1 && num <= summons.length) {
    return summons[num - 1];
  }
  // Fallback: summonId match (backwards compat)
  return summons.find(s =>
    s.summonId.endsWith(query) ||
    s.summonId === query ||
    (s.nickname && s.nickname.toLowerCase() === query.toLowerCase())
  ) || null;
}


// ─────────────────────────────────────────────────────────────
// MAIN COMMAND ROUTER
// ─────────────────────────────────────────────────────────────

async function handleCommand(sock, chatId, senderJid, senderName, args) {
  const sub = (args[0] || '').toLowerCase();
  const rest = args.slice(1);

  // 💡 Phase 9: .summon with no args → Pokémon-style interface (NOT help).
  // .summon help → command list. .summon <number> → view summon #N details.
  // Numeric arg = navigate to summon by list position (1-indexed).
  if (!sub) {
    return await cmdPokedex(sock, chatId, senderJid);
  }

  // Numeric navigation — .summon 3 → view details of the 3rd summon in the list
  if (/^\d+$/.test(sub)) {
    return await cmdNavigate(sock, chatId, senderJid, sub, rest);
  }

  switch (sub) {
    case 'list':
    case 'ls':
      return await cmdPokedex(sock, chatId, senderJid);

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

    case 'codex':
    case 'all':
    case 'species':
      return await cmdCodex(sock, chatId, senderJid, rest);

    case 'compendium':
    case 'tamed':
      return await cmdCompendium(sock, chatId, senderJid);

    case 'hatch':
      return await cmdHatch(sock, chatId, senderJid, rest);

    case 'eggcraft':
    case 'craftegg':
    case 'egg':
      return await cmdEggCraft(sock, chatId, senderJid, rest);

    case 'skill':
    case 'skills':
    case 'skilltree':
      return await cmdSkillTree(sock, chatId, senderJid, rest);

    case 'evolve':
    case 'evolution':
      return await cmdEvolve(sock, chatId, senderJid, rest);

    case 'bond':
      return await cmdBond(sock, chatId, senderJid, rest);

    case 'trait':
    case 'traits':
      return await cmdTraits(sock, chatId, senderJid, rest);

    case 'ai':
    case 'aimode':
      return await cmdAIMode(sock, chatId, senderJid, rest);

    case 'abilities':
    case 'ability':
    case 'moves':
      return await cmdAbilities(sock, chatId, senderJid, rest);

    case 'equip':
    case 'gear':
      return await cmdSummonEquip(sock, chatId, senderJid, rest);

    case 'unequip':
      return await cmdSummonUnequip(sock, chatId, senderJid, rest);

    case 'forge':
    case 'fuse':
      return await cmdForge(sock, chatId, senderJid, rest);

    case 'trial':
      return await cmdTrial(sock, chatId, senderJid, rest);

    case 'passives':
      return await cmdPassives(sock, chatId, senderJid);

    case 'market':
    case 'shop':
      return await cmdMarket(sock, chatId, senderJid, rest);

    case 'duel':
      return await cmdDuel(sock, chatId, senderJid, rest);

    case 'backlog':
    case 'storage':
      return await cmdBacklog(sock, chatId, senderJid, rest);

    case 'swap':
      return await cmdSwap(sock, chatId, senderJid, rest);

    case 'help':
      return await cmdHelp(sock, chatId);

    default:
      return await cmdHelp(sock, chatId);
  }
}

// ─────────────────────────────────────────────────────────────
// .summon — Pokémon-style Pokédex interface (DEFAULT when no subcommand)
// ─────────────────────────────────────────────────────────────

async function cmdPokedex(sock, chatId, senderJid) {
  const user = economy.getUser(senderJid);
  if (!user) {
    await sock.sendMessage(chatId, { text: '❌ Not registered. Use `' + getPrefix() + ' register` first.' });
    return;
  }

  const summons = await summonSystem.getUserSummons(senderJid);
  const p = getPrefix();

  if (summons.length === 0) {
    await sock.sendMessage(chatId, {
      text: `🐉 *SUMMON CODEX*\n━━━━━━━━━━━━━━━\n\n📭 Your codex is empty.\n\n*HOW TO GET SUMMONS:*\n💀 Necromancer: capture enemies with Army of the Dead\n🥚 Hatch eggs (from boss drops, raids, abyss)\n🏪 Trade on the summon market (\`${p} summon market\`)\n\nType \`${p} summon help\` for all commands.`
    });
    return;
  }

  // 💡 NEW 2026-08-03: Render the roster as an ANIMATED GIF via the Go service.
  // Shows summons doing their idle.gif animations on a sparklinlabs background.
  // Falls back to node-canvas PNG, then text.
  try {
    const goService = require('../utils/goImageService');
    const summonSystem = require('../rpg/summonSystem');
    const registry = require('../rpg/summonRegistry');

    console.log('[SummonRoster] Building payload for', summons.length, 'summons');

    // Build the payload for the Go service
    const rosterSummons = summons.map(s => {
      const stats = summonSystem.computeEffectiveStats(s);
      const species = registry.getSpecies(s.species);
      return {
        species: s.species,
        nickname: s.nickname || species?.name || s.species,
        level: s.level || 1,
        rarity: s.rarity || 'COMMON',
        element: s.element || species?.element || 'neutral',
        archetype: s.archetype || species?.archetype || 'BRUTE',
        loyalty: s.loyalty || 100,
        hp: stats.hp || 0,
        atk: stats.atk || 0,
        def: stats.def || 0,
        mag: stats.mag || 0,
        spd: stats.spd || 0,
        isDeployed: user.activeSummonId === s.summonId,
      };
    });

    const activeIdx = summons.findIndex(s => s.summonId === user.activeSummonId);

    console.log('[SummonRoster] Calling Go service for GIF...');
    const gifBuffer = await goService.generateSummonRosterGIF({
      userNickname: user.nickname || 'Adventurer',
      slotsUsed: summons.length,
      slotsMax: user.summonSlots || 3,
      summons: rosterSummons,
      activeIndex: activeIdx,
    });

    console.log('[SummonRoster] GIF buffer received:', gifBuffer ? gifBuffer.length + ' bytes' : 'null');

    if (gifBuffer && gifBuffer.length > 0) {
      // 💡 CRITICAL NOTE FOR FUTURE REFERENCE:
      // WhatsApp does NOT support GIF as an image format (image: gifBuffer,
      // mimetype: 'image/gif' silently fails — the bot sends but the user
      // sees nothing). WhatsApp also can't use video + gifPlayback: true
      // with a raw GIF buffer (Baileys tries ffmpeg MP4 conversion which
      // silently fails on Oracle).
      //
      // SOLUTION: Convert the GIF to MP4 using ffmpeg on Box 1 (where ffmpeg
      // IS installed and has enough RAM), THEN send as video + gifPlayback.
      // The card system already uses this pattern successfully (convertCardImage
      // returns MP4, sent as video + gifPlayback: true).
      //
      // The monkey-patch auto-injects jpegThumbnail for video messages too.
      console.log('[SummonRoster] Converting GIF to MP4 via ffmpeg...');
      const { execFileSync } = require('child_process');
      const fs = require('fs');
      const tmpGif = '/tmp/summon_roster.gif';
      const tmpMp4 = '/tmp/summon_roster.mp4';
      fs.writeFileSync(tmpGif, gifBuffer);

      try {
        // Convert GIF → MP4 (fast: ~2-5s for a 7-frame GIF)
        // -preset ultrafast for speed, -crf 23 for quality
        // Scale to 720x720 square (WhatsApp gifPlayback prefers square)
        execFileSync('ffmpeg', [
          '-y', '-i', tmpGif,
          '-movflags', 'faststart',
          '-pix_fmt', 'yuv420p',
          '-vf', 'scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(ow-iw)/2:(oh-ih)/2',
          '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
          '-an', // no audio
          tmpMp4,
        ], { timeout: 15000, stdio: 'pipe' });

        const mp4Buffer = fs.readFileSync(tmpMp4);
        console.log('[SummonRoster] MP4 converted:', mp4Buffer.length, 'bytes');

        // Send as video with gifPlayback (same pattern as card system)
        console.log('[SummonRoster] Sending MP4 as video to WhatsApp...');
        const sendResult = await sock.sendMessage(chatId, {
          video: mp4Buffer,
          gifPlayback: true,
          caption: `🐉 *SUMMON ROSTER* — ${summons.length}/${user.summonSlots || 3} slots\n💡 \`${p} summon <#>\` — view details | \`${p} summon help\` — commands`,
        });
        console.log('[SummonRoster] Send result:', sendResult ? 'success' : 'null');

        // Cleanup
        try { fs.unlinkSync(tmpGif); } catch (e) {}
        try { fs.unlinkSync(tmpMp4); } catch (e) {}
        return;
      } catch (convErr) {
        console.error('[SummonRoster] ffmpeg conversion failed:', convErr.message);
        // Fall through to PNG fallback
        try { fs.unlinkSync(tmpGif); } catch (e) {}
        try { fs.unlinkSync(tmpMp4); } catch (e) {}
      }
    }
  } catch (e) {
    console.error('[SummonRoster] GIF render failed, trying PNG fallback:', e.message);
  }

  // 💡 Fallback: node-canvas PNG (sparklinlabs background, static sprites)
  try {
    const imageBuffer = await rosterRenderer.renderRoster(user, summons);
    if (imageBuffer && imageBuffer.length > 0) {
      await sock.sendMessage(chatId, {
        image: imageBuffer,
        caption: `🐉 *SUMMON CODEX* — ${summons.length}/${user.summonSlots || 3} slots\n💡 \`${p} summon <#>\` — view details | \`${p} summon help\` — commands`
      });
      return;
    }
  } catch (e) {
    console.error('[SummonRoster] PNG render failed, falling back to text:', e.message);
  }

  // ── Text fallback (same as before) ──
  const activeResonances = user.activeResonances || [];

  let msg = `🐉 *SUMMON CODEX*\n`;
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `📦 ${summons.length}/${user.summonSlots || 3} slots`;
  if (activeResonances.length > 0) {
    msg += ` | 🔗 ${activeResonances.length} resonance${activeResonances.length > 1 ? 's' : ''}`;
  }
  if (user.activeSummonId) {
    msg += ` | ⭐ 1 deployed`;
  }
  msg += `\n\n`;

  const rarityColors = {
    COMMON: '⚪', UNCOMMON: '🟢', RARE: '🔵', EPIC: '🔴', LEGENDARY: '🟡', MYTHIC: '🟣'
  };

  for (let i = 0; i < summons.length; i++) {
    const s = summons[i];
    const species = registry.getSpecies(s.species);
    const name = s.nickname || species?.name || s.species;
    const active = user.activeSummonId === s.summonId;
    const forSaleTag = s.forSale ? ' 🏷️' : '';
    const tamedTag = (s.lineage || []).some(l => l.personality === 'TAMED') ? ' ✨' : '';
    const rarityIcon = rarityColors[s.rarity] || '⚪';
    const stats = summonSystem.computeEffectiveStats(s);

    const loyaltyPct = s.loyalty;
    const loyaltyBar = loyaltyPct >= 75 ? '🟩' : loyaltyPct >= 50 ? '🟨' : loyaltyPct >= 25 ? '🟧' : loyaltyPct >= 1 ? '🟥' : '⬛';

    msg += `${i + 1}│ ${species?.icon || '🐉'} *${name}*${active ? ' ⭐' : ''}${forSaleTag}${tamedTag}\n`;
    msg += `  │ ${rarityIcon} Lv.${s.level} ${s.tier} | ${s.element}/${s.archetype}\n`;
    msg += `  │ ❤️ ${Math.floor(stats.hp)} HP | ⚔️ ${Math.floor(stats.atk)} | 🛡️ ${Math.floor(stats.def)} | 🔮 ${Math.floor(stats.mag)}\n`;
    msg += `  │ 💖 ${loyaltyBar} ${s.loyalty}/100 | 🧠 ${s.personality}\n`;
    msg += `\n`;
  }

  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `📱 \`${p} summon <#>\` — view details\n`;
  msg += `⚔️ \`${p} summon deploy <#>\` — equip\n`;
  msg += `❓ \`${p} summon help\` — all commands`;

  await sock.sendMessage(chatId, { text: msg });
}

// ─────────────────────────────────────────────────────────────
// .summon <#> — navigate to summon by list position (Pokédex entry)
// ─────────────────────────────────────────────────────────────

async function cmdNavigate(sock, chatId, senderJid, numStr, rest) {
  const user = economy.getUser(senderJid);
  if (!user) {
    await sock.sendMessage(chatId, { text: '❌ Not registered.' });
    return;
  }

  const summons = await summonSystem.getUserSummons(senderJid);
  const index = parseInt(numStr) - 1;  // 1-indexed → 0-indexed

  if (index < 0 || index >= summons.length) {
    await sock.sendMessage(chatId, {
      text: `❌ Invalid number. You have ${summons.length} summons (1-${summons.length}).`
    });
    return;
  }

  // Check if there's a subcommand after the number (e.g., ".summon 3 deploy")
  const action = (rest[0] || '').toLowerCase();
  if (action === 'deploy' || action === 'equip') {
    return await cmdDeploy(sock, chatId, senderJid, [summons[index].summonId.slice(-8)]);
  }
  if (action === 'release') {
    return await cmdRelease(sock, chatId, senderJid, [summons[index].summonId.slice(-8)]);
  }
  if (action === 'train') {
    return await cmdTrain(sock, chatId, senderJid, [summons[index].summonId.slice(-8)]);
  }
  if (action === 'trial') {
    return await cmdTrial(sock, chatId, senderJid, [summons[index].summonId.slice(-8)]);
  }

  // Default: show animated detail GIF via Go service (idle.gif + info hub)
  // Falls back to node-canvas PNG, then text
  try {
    const goService = require('../utils/goImageService');
    const summonSystem = require('../rpg/summonSystem');
    const s = summons[index];
    const stats = summonSystem.computeEffectiveStats(s);
    const species = registry.getSpecies(s.species);

    const detailGifBuffer = await goService.generateSummonDetailGIF({
      userNickname: user.nickname || 'Adventurer',
      slotsUsed: summons.length,
      slotsMax: user.summonSlots || 3,
      activeIndex: -1,
      summons: [{
        species: s.species,
        nickname: s.nickname || species?.name || s.species,
        level: s.level || 1,
        rarity: s.rarity || 'COMMON',
        element: s.element || species?.element || 'neutral',
        archetype: s.archetype || species?.archetype || 'BRUTE',
        loyalty: s.loyalty || 100,
        hp: stats.hp || 0,
        atk: stats.atk || 0,
        def: stats.def || 0,
        mag: stats.mag || 0,
        spd: stats.spd || 0,
        isDeployed: user.activeSummonId === s.summonId,
      }],
    });

    if (detailGifBuffer && detailGifBuffer.length > 0) {
      // Convert GIF → MP4 via ffmpeg (same as roster)
      const { execFileSync } = require('child_process');
      const fs = require('fs');
      const tmpGif = '/tmp/summon_detail.gif';
      const tmpMp4 = '/tmp/summon_detail.mp4';
      fs.writeFileSync(tmpGif, detailGifBuffer);

      try {
        execFileSync('ffmpeg', [
          '-y', '-i', tmpGif,
          '-movflags', 'faststart',
          '-pix_fmt', 'yuv420p',
          '-vf', 'scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(ow-iw)/2:(oh-ih)/2',
          '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
          '-an', tmpMp4,
        ], { timeout: 15000, stdio: 'pipe' });

        const mp4Buffer = fs.readFileSync(tmpMp4);
        const name = s.nickname || species?.name || s.species;
        const active = user.activeSummonId === s.summonId;
        const p = getPrefix();

        await sock.sendMessage(chatId, {
          video: mp4Buffer,
          gifPlayback: true,
          caption: `${species?.icon || '🐉'} *${name}*${active ? ' ⭐ DEPLOYED' : ''}\n💡 \`${p} summon ${index + 1} deploy\` — equip | \`${p} summon ${index + 1} trial\` — evolve`,
        });

        try { fs.unlinkSync(tmpGif); } catch (e) {}
        try { fs.unlinkSync(tmpMp4); } catch (e) {}
        return;
      } catch (convErr) {
        console.error('[SummonDetail] ffmpeg conversion failed:', convErr.message);
        try { fs.unlinkSync(tmpGif); } catch (e) {}
        try { fs.unlinkSync(tmpMp4); } catch (e) {}
      }
    }
  } catch (e) {
    console.error('[SummonDetail] GIF render failed, trying PNG fallback:', e.message);
  }

  // Fallback: node-canvas PNG
  try {
    const imageBuffer = await rosterRenderer.renderDetailCard(summons[index], user);
    if (imageBuffer && imageBuffer.length > 0) {
      const species = registry.getSpecies(summons[index].species);
      const name = summons[index].nickname || species?.name || summons[index].species;
      const active = user.activeSummonId === summons[index].summonId;
      await sock.sendMessage(chatId, {
        image: imageBuffer,
        caption: `${species?.icon || '🐉'} *${name}*${active ? ' ⭐ DEPLOYED' : ''}\n💡 \`${getPrefix()} summon ${index + 1} deploy\` — equip | \`${getPrefix()} summon ${index + 1} trial\` — evolve`
      });
      return;
    }
  } catch (e) {
    console.error('[SummonDetail] PNG render failed, falling back to text:', e.message);
  }

  // Text fallback
  return await cmdInfo(sock, chatId, senderJid, [summons[index].summonId.slice(-8)]);
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
  const target = resolveSummon(summons, query);

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
  const target = resolveSummon(summons, query);

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
  msg += `❤️ HP: ${stats.hp} | ⚔️ ATK: ${Math.floor(stats.atk)}\n`;
  msg += `🛡️ DEF: ${Math.floor(stats.def)} | 🔮 MAG: ${Math.floor(stats.mag)}\n`;
  msg += `💨 SPD: ${Math.floor(stats.spd)} | 💥 CRIT: ${Math.floor(stats.crit)}%\n`;
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

  msg += '🆔 ID: `' + target.summonId + '`\n';
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
  const target = resolveSummon(summons, query);

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
  const target = resolveSummon(summons, query);

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
  const target = resolveSummon(summons, query);

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
// .summon codex — view ALL summon species in the game
// ─────────────────────────────────────────────────────────────

async function cmdCodex(sock, chatId, senderJid, args) {
  const user = economy.getUser(senderJid);
  if (!user) {
    await sock.sendMessage(chatId, { text: '❌ Not registered.' });
    return;
  }

  // Parse page number
  let page = 1;
  for (const arg of args) {
    const num = parseInt(arg);
    if (!isNaN(num) && num > 0) page = num;
  }

  const p = getPrefix();
  const PER_PAGE = 5;
  const allSpecies = registry.getAllSpecies();
  const totalPages = Math.ceil(allSpecies.length / PER_PAGE);
  page = Math.max(1, Math.min(page, totalPages));

  const startIdx = (page - 1) * PER_PAGE;
  const pageSpecies = allSpecies.slice(startIdx, startIdx + PER_PAGE);

  // Build payload for Go service — same format as roster but with all species
  const rosterSummons = pageSpecies.map(speciesId => {
    const s = registry.getSpecies(speciesId);
    return {
      species: speciesId,
      nickname: s?.name || speciesId,
      level: 1,
      rarity: s?.rarity || 'COMMON',
      element: s?.element || 'neutral',
      archetype: s?.archetype || 'BRUTE',
      loyalty: 100,
      hp: s?.baseStats?.hp || 100,
      atk: s?.baseStats?.atk || 10,
      def: s?.baseStats?.def || 5,
      mag: s?.baseStats?.mag || 5,
      spd: s?.baseStats?.spd || 10,
      isDeployed: false,
    };
  });

  // Try Go service animated GIF (same as roster, 5 per page)
  try {
    const goService = require('../utils/goImageService');
    const gifBuffer = await goService.generateSummonRosterGIF({
      userNickname: 'CODEX',
      slotsUsed: pageSpecies.length,
      slotsMax: PER_PAGE,
      summons: rosterSummons,
      activeIndex: -1,
    });

    if (gifBuffer && gifBuffer.length > 0) {
      // Convert GIF → MP4 via ffmpeg
      const { execFileSync } = require('child_process');
      const fs = require('fs');
      const tmpGif = '/tmp/summon_codex.gif';
      const tmpMp4 = '/tmp/summon_codex.mp4';
      fs.writeFileSync(tmpGif, gifBuffer);

      try {
        execFileSync('ffmpeg', [
          '-y', '-i', tmpGif,
          '-movflags', 'faststart', '-pix_fmt', 'yuv420p',
          '-vf', 'scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(ow-iw)/2:(oh-ih)/2',
          '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-an',
          tmpMp4,
        ], { timeout: 15000, stdio: 'pipe' });

        const mp4Buffer = fs.readFileSync(tmpMp4);
        let caption = `📖 *SUMMON CODEX* — ${allSpecies.length} species | Page ${page}/${totalPages}`;
        if (totalPages > 1) caption += `\n💡 \`${p} summon codex <page>\` — navigate`;
        await sock.sendMessage(chatId, { video: mp4Buffer, gifPlayback: true, caption });

        try { fs.unlinkSync(tmpGif); } catch (e) {}
        try { fs.unlinkSync(tmpMp4); } catch (e) {}
        return;
      } catch (convErr) {
        console.error('[Codex] ffmpeg failed:', convErr.message);
        try { fs.unlinkSync(tmpGif); } catch (e) {}
        try { fs.unlinkSync(tmpMp4); } catch (e) {}
      }
    }
  } catch (e) {
    console.error('[Codex] GIF render failed, trying text:', e.message);
  }

  // Text fallback
  let msg = `📖 *SUMMON CODEX* — Page ${page}/${totalPages}\n`;
  msg += `Total: ${allSpecies.length} species\n\n`;
  pageSpecies.forEach((id, i) => {
    const s = registry.getSpecies(id);
    msg += `${startIdx + i + 1}. ${s?.icon || '🐉'} *${s?.name || id}* — ${s?.rarity || 'COMMON'} ${s?.element || ''}\n`;
  });
  if (totalPages > 1) msg += `\n💡 \`${p} summon codex <page>\` — navigate`;
  await sock.sendMessage(chatId, { text: msg });
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
    // 💡 AUDIT FIX 2026-08-01: updated help text to reflect the new egg system
    await sock.sendMessage(chatId, {
      text: `🥚 *SUMMON EGG HATCHING*\n\nUsage: \`${getPrefix()} summon hatch <egg_id>\`\n\n*Available eggs:*\n• \`basic_summon_egg\` — 1 of 4 starters (Tank/DPS/Mage/Support)\n• \`rare_summon_egg\` — random RARE summon\n• \`epic_summon_egg\` — random EPIC summon\n• \`legendary_summon_egg\` — random LEGENDARY summon\n• \`mythic_summon_egg\` — random MYTHIC summon\n\n_Buy a Basic Egg from the shop. Higher-tier eggs are crafted from fragments dropped by wild summons in the Abyss._`
    });
    return;
  }

  // 💡 AUDIT FIX 2026-08-01: use the new summonEggSystem for tiered eggs
  const summonEggSystem = require('../rpg/summonEggSystem');
  const result = await summonEggSystem.hatchEgg(senderJid, eggId);
  await sock.sendMessage(chatId, { text: result.message });
  if (result.success) {
    // Refresh resonances
    try {
      await summonSystem.refreshUserResonances(user);
    } catch (e) {}
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
  const s1 = resolveSummon(summons, id1);
  const s2 = resolveSummon(summons, id2);

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
  const target = resolveSummon(summons, query);

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
// .summon backlog — view backlog summons
// .summon swap <backlog#> <deckSlot> — swap backlog into main deck
// ─────────────────────────────────────────────────────────────

async function cmdBacklog(sock, chatId, senderJid, args) {
  const user = economy.getUser(senderJid);
  if (!user) {
    await sock.sendMessage(chatId, { text: '❌ Not registered.' });
    return;
  }
  const p = getPrefix();
  const backlog = await summonSystem.getBacklog(senderJid);

  if (backlog.length === 0) {
    await sock.sendMessage(chatId, {
      text: `📦 *BACKLOG*\n\nYour backlog is empty.\n\nMain Deck summons: \`${p} summons\`\nSwap: \`${p} summon swap <backlog#> <deckSlot>\``,
    });
    return;
  }

  let msg = `📦 *BACKLOG* — ${backlog.length} summons\n━━━━━━━━━━━━━━━\n\n`;
  backlog.forEach((s, i) => {
    const species = registry.getSpecies(s.species);
    const name = s.nickname || species?.name || s.species;
    msg += `${i + 1}. ${species?.icon || '🐉'} *${name}* — Lv.${s.level} ${s.rarity} ${s.element}\n`;
  });
  msg += `\n💡 \`${p} summon swap <backlog#> <deckSlot>\` — swap into Main Deck`;
  await sock.sendMessage(chatId, { text: msg });
}

async function cmdSwap(sock, chatId, senderJid, args) {
  const user = economy.getUser(senderJid);
  if (!user) {
    await sock.sendMessage(chatId, { text: '❌ Not registered.' });
    return;
  }
  const p = getPrefix();

  const backlogNum = parseInt(args[0]);
  const deckSlot = parseInt(args[1]);

  if (!backlogNum || !deckSlot) {
    await sock.sendMessage(chatId, {
      text: `❌ Usage: \`${p} summon swap <backlog#> <deckSlot>\`\n\nExample: \`${p} summon swap 1 2\` — swaps backlog summon #1 into Main Deck slot 2.\n\nView backlog: \`${p} summon backlog\`\nView Main Deck: \`${p} summons\``,
    });
    return;
  }

  const backlog = await summonSystem.getBacklog(senderJid);
  const backlogIndex = backlogNum - 1;
  if (backlogIndex < 0 || backlogIndex >= backlog.length) {
    await sock.sendMessage(chatId, { text: `❌ Invalid backlog number. You have ${backlog.length} backlog summons (1-${backlog.length}).` });
    return;
  }

  const result = await summonSystem.swapToMainDeck(senderJid, backlog[backlogIndex].summonId, deckSlot - 1);
  await sock.sendMessage(chatId, { text: result.message });
}

// ─────────────────────────────────────────────────────────────
// .summon market <subcommand> — summon trading market
// ─────────────────────────────────────────────────────────────

const SummonMarket = require('../models/SummonMarket');
const SummonModel = require('../models/Summon');

async function cmdMarket(sock, chatId, senderJid, args) {
  const action = (args[0] || '').toLowerCase();
  const rest = args.slice(1);

  switch (action) {
    case 'list':
    case 'browse':
      return await cmdMarketList(sock, chatId, senderJid);
    case 'sell':
    case 'list_sell':
      return await cmdMarketSell(sock, chatId, senderJid, rest);
    case 'buy':
      return await cmdMarketBuy(sock, chatId, senderJid, rest);
    case 'cancel':
      return await cmdMarketCancel(sock, chatId, senderJid, rest);
    case 'my':
    case 'mine':
      return await cmdMarketMy(sock, chatId, senderJid);
    default:
      await sock.sendMessage(chatId, {
        text: `🏪 *SUMMON MARKET*\n\nCommands:\n• \`${getPrefix()} summon market list\` — browse summons for sale\n• \`${getPrefix()} summon market sell <id> <price>\` — list a summon\n• \`${getPrefix()} summon market buy <listingId>\` — buy a summon\n• \`${getPrefix()} summon market cancel <listingId>\` — cancel your listing\n• \`${getPrefix()} summon market my\` — view your listings\n\n💡 5% listing fee on sale price. Soulbound summons can't be sold.`
      });
  }
}

async function cmdMarketList(sock, chatId, senderJid) {
  try {
    const listings = await SummonMarket.find({ status: 'active' })
      .sort({ price: 1 })
      .limit(20);

    if (listings.length === 0) {
      await sock.sendMessage(chatId, { text: '🏪 *SUMMON MARKET*\n\nNo summons for sale right now.' });
      return;
    }

    // Load summon details for each listing
    let msg = `🏪 *SUMMON MARKET*\n`;
    msg += `━━━━━━━━━━━━━━━\n\n`;

    for (let i = 0; i < listings.length; i++) {
      const listing = listings[i];
      const summon = await SummonModel.findOne({ summonId: listing.summonId });
      if (!summon) continue;

      const species = registry.getSpecies(summon.species);
      const name = summon.nickname || species?.name || summon.species;

      msg += `${i + 1}│ ${species?.icon || '🐉'} *${name}*\n`;
      msg += `  │ 📊 Lv.${summon.level} ${summon.rarity} | ${summon.element}\n`;
      msg += `  │ 💰 ${listing.price.toLocaleString()} Zeni\n`;
      msg += `  │ 🆔 \`${listing.listingId.slice(-8)}\`\n\n`;
    }

    msg += `💡 \`${getPrefix()} summon market buy <listingId>\` to purchase`;
    await sock.sendMessage(chatId, { text: msg });
  } catch (e) {
    await sock.sendMessage(chatId, { text: `❌ Market error: ${e.message}` });
  }
}

async function cmdMarketSell(sock, chatId, senderJid, args) {
  const user = economy.getUser(senderJid);
  if (!user) {
    await sock.sendMessage(chatId, { text: '❌ Not registered.' });
    return;
  }

  const query = (args[0] || '').trim();
  const price = parseInt(args[1]) || 0;

  if (!query || price < 1000) {
    await sock.sendMessage(chatId, {
      text: `❌ Usage: \`${getPrefix()} summon market sell <id> <price>\`\nMinimum price: 1,000 Zeni.`
    });
    return;
  }

  // Resolve summon
  const summons = await summonSystem.getUserSummons(senderJid);
  const target = resolveSummon(summons, query);

  if (!target) {
    await sock.sendMessage(chatId, { text: `❌ No summon matching "${query}".` });
    return;
  }

  // Validate
  if (target.forSale) {
    await sock.sendMessage(chatId, { text: '❌ This summon is already listed for sale.' });
    return;
  }
  if (target.isLocked) {
    await sock.sendMessage(chatId, { text: '❌ This summon is locked and cannot be sold.' });
    return;
  }
  if (target.soulboundUntil && target.soulboundUntil > new Date()) {
    await sock.sendMessage(chatId, { text: '❌ This summon is soulbound. Wait for the soulbound period to end.' });
    return;
  }
  if (user.activeSummonId === target.summonId) {
    await sock.sendMessage(chatId, { text: '❌ Cannot sell your active summon. Dismiss it first.' });
    return;
  }

  // Calculate listing fee (5%)
  const fee = Math.floor(price * 0.05);
  const totalCost = fee;

  if (user.wallet < totalCost) {
    await sock.sendMessage(chatId, { text: `❌ Listing fee is ${fee.toLocaleString()} Zeni (5% of price). You have ${user.wallet.toLocaleString()}.` });
    return;
  }

  // Deduct fee
  economy.removeMoney(senderJid, totalCost, `Summon market listing fee`);

  // Create listing
  const listingId = 'L-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  const listing = new SummonMarket({
    listingId,
    summonId: target.summonId,
    sellerId: senderJid,
    type: 'sale',
    price,
    status: 'active',
    approvalStatus: 'approved'
  });
  await listing.save();

  // Mark summon as forSale
  target.forSale = true;
  target.salePrice = price;
  await target.save();

  // Refresh resonances (forSale summons don't count)
  try { await summonSystem.refreshUserResonances(user); } catch (e) {}

  const species = registry.getSpecies(target.species);
  await sock.sendMessage(chatId, {
    text: `🏪 *SUMMON LISTED FOR SALE*\n\n${species?.icon || '🐉'} *${target.nickname || species?.name || target.species}*\n💰 Price: ${price.toLocaleString()} Zeni\n💸 Listing fee: ${fee.toLocaleString()} Zeni\n🆔 Listing ID: \`${listingId.slice(-8)}\`\n\nUse \`${getPrefix()} summon market cancel ${listingId.slice(-8)}\` to cancel.`
  });
}

async function cmdMarketBuy(sock, chatId, senderJid, args) {
  const user = economy.getUser(senderJid);
  if (!user) {
    await sock.sendMessage(chatId, { text: '❌ Not registered.' });
    return;
  }

  const query = (args[0] || '').trim();
  if (!query) {
    await sock.sendMessage(chatId, { text: `❌ Usage: \`${getPrefix()} summon market buy <listingId>\`` });
    return;
  }

  // Find listing
  const listing = await SummonMarket.findOne({
    listingId: { $regex: query + '$' },
    status: 'active'
  });

  if (!listing) {
    await sock.sendMessage(chatId, { text: `❌ No active listing matching "${query}".` });
    return;
  }

  // Anti-self-buy
  if (listing.sellerId === senderJid) {
    await sock.sendMessage(chatId, { text: '❌ You cannot buy your own listing.' });
    return;
  }

  // Alt detection
  try {
    const altDetection = require('../rpg/altDetection');
    const altCheck = altDetection.checkTransfer(senderJid, listing.sellerId);
    if (altCheck.blocked) {
      await sock.sendMessage(chatId, { text: `❌ ${altCheck.reason}` });
      return;
    }
  } catch (e) {}

  // Check slot space
  const userSummons = await summonSystem.getUserSummons(senderJid);
  if (userSummons.length >= (user.summonSlots || 3)) {
    await sock.sendMessage(chatId, { text: `❌ Summon slots full (${userSummons.length}/${user.summonSlots || 3}).` });
    return;
  }

  // Check funds
  if (user.wallet < listing.price) {
    await sock.sendMessage(chatId, { text: `❌ Insufficient Zeni. Need ${listing.price.toLocaleString()}, have ${user.wallet.toLocaleString()}.` });
    return;
  }

  // Atomic claim
  const claimed = await SummonMarket.findOneAndUpdate(
    { listingId: listing.listingId, status: 'active' },
    { status: 'sold', buyerId: senderJid, soldAt: new Date(), salePrice: listing.price },
    { new: true }
  );

  if (!claimed) {
    await sock.sendMessage(chatId, { text: '❌ This listing was just purchased by someone else.' });
    return;
  }

  // Transfer funds
  economy.removeMoney(senderJid, listing.price, `Summon market purchase: ${listing.summonId}`);
  economy.addMoney(listing.sellerId, listing.price, `Summon market sale: ${listing.summonId}`);

  // Transfer summon
  const summon = await SummonModel.findOneAndUpdate(
    { summonId: listing.summonId },
    { ownerJid: senderJid, forSale: false, salePrice: null },
    { new: true }
  );

  // Refresh resonances for both users
  try {
    const seller = economy.getUser(listing.sellerId);
    if (seller) await summonSystem.refreshUserResonances(seller);
    await summonSystem.refreshUserResonances(user);
  } catch (e) {}

  const species = registry.getSpecies(summon.species);
  await sock.sendMessage(chatId, {
    text: `✅ *SUMMON PURCHASED!*\n\n${species?.icon || '🐉'} *${summon.nickname || species?.name || summon.species}*\n💰 Paid: ${listing.price.toLocaleString()} Zeni\n📊 Lv.${summon.level} ${summon.rarity}\n\nUse \`${getPrefix()} summon deploy ${summon.summonId.slice(-8)}\` to equip it.`
  });
}

async function cmdMarketCancel(sock, chatId, senderJid, args) {
  const query = (args[0] || '').trim();
  if (!query) {
    await sock.sendMessage(chatId, { text: `❌ Usage: \`${getPrefix()} summon market cancel <listingId>\`` });
    return;
  }

  const listing = await SummonMarket.findOne({
    listingId: { $regex: query + '$' },
    sellerId: senderJid,
    status: 'active'
  });

  if (!listing) {
    await sock.sendMessage(chatId, { text: `❌ No active listing matching "${query}" belonging to you.` });
    return;
  }

  // Cancel listing
  listing.status = 'cancelled';
  await listing.save();

  // Unmark summon
  await SummonModel.updateOne(
    { summonId: listing.summonId },
    { forSale: false, salePrice: null }
  );

  // Refresh resonances
  const user = economy.getUser(senderJid);
  if (user) {
    try { await summonSystem.refreshUserResonances(user); } catch (e) {}
  }

  await sock.sendMessage(chatId, { text: `✅ Listing cancelled. Your summon is back in your collection.` });
}

async function cmdMarketMy(sock, chatId, senderJid) {
  const listings = await SummonMarket.find({
    sellerId: senderJid,
    status: 'active'
  }).sort({ createdAt: -1 });

  if (listings.length === 0) {
    await sock.sendMessage(chatId, { text: '📭 You have no active market listings.' });
    return;
  }

  let msg = `🏪 *YOUR LISTINGS*\n`;
  msg += `━━━━━━━━━━━━━━━\n\n`;

  for (const listing of listings) {
    const summon = await SummonModel.findOne({ summonId: listing.summonId });
    if (!summon) continue;
    const species = registry.getSpecies(summon.species);
    msg += `${species?.icon || '🐉'} *${summon.nickname || species?.name || summon.species}*\n`;
    msg += `  💰 ${listing.price.toLocaleString()} Zeni | 🆔 \`${listing.listingId.slice(-8)}\`\n\n`;
  }

  msg += `💡 \`${getPrefix()} summon market cancel <id>\` to cancel`;
  await sock.sendMessage(chatId, { text: msg });
}

// ─────────────────────────────────────────────────────────────
// .summon duel @user — PvP summon vs summon
// ─────────────────────────────────────────────────────────────

async function cmdDuel(sock, chatId, senderJid, args) {
  const user = economy.getUser(senderJid);
  if (!user) {
    await sock.sendMessage(chatId, { text: '❌ Not registered.' });
    return;
  }

  // Get target from mention or reply
  const mentioned = args[0];
  if (!mentioned || !mentioned.includes('@')) {
    await sock.sendMessage(chatId, {
      text: `❌ Usage: \`${getPrefix()} summon duel @user\`\n\nChallenge another player's active summon to a 1v1 duel. Both players must have a summon deployed.`
    });
    return;
  }

  // Clean mention to JID
  const targetJid = mentioned.replace(/[@!]/g, '').includes('s.whatsapp.net')
    ? mentioned.replace(/[@!]/g, '')
    : mentioned.replace(/[@!]/g, '') + '@s.whatsapp.net';

  if (targetJid === senderJid) {
    await sock.sendMessage(chatId, { text: '❌ Cannot duel yourself.' });
    return;
  }

  // Alt detection
  try {
    const altDetection = require('../rpg/altDetection');
    const altCheck = altDetection.checkTransfer(senderJid, targetJid);
    if (altCheck.blocked) {
      await sock.sendMessage(chatId, { text: `❌ ${altCheck.reason}` });
      return;
    }
  } catch (e) {}

  const targetUser = economy.getUser(targetJid);
  if (!targetUser || !targetUser.registered) {
    await sock.sendMessage(chatId, { text: '❌ Target is not registered.' });
    return;
  }

  // Both players must have active summons
  const mySummon = await summonSystem.getActiveSummon(user);
  if (!mySummon) {
    await sock.sendMessage(chatId, { text: `❌ You don't have an active summon. Deploy one with \`${getPrefix()} summon deploy <id>\`.` });
    return;
  }

  const targetSummon = await summonSystem.getActiveSummon(targetUser);
  if (!targetSummon) {
    await sock.sendMessage(chatId, { text: `❌ @${economy.getDisplayName(targetJid)} doesn't have an active summon deployed.`, mentions: [targetJid] });
    return;
  }

  // Simulate the duel
  const myStats = summonSystem.computeEffectiveStats(mySummon);
  const targetStats = summonSystem.computeEffectiveStats(targetSummon);
  const mySpecies = registry.getSpecies(mySummon.species);
  const targetSpecies = registry.getSpecies(targetSummon.species);

  let myHp = myStats.hp;
  let targetHp = targetStats.hp;
  const log = [];
  let round = 0;
  const maxRounds = 15;

  while (myHp > 0 && targetHp > 0 && round < maxRounds) {
    round++;

    // My summon attacks
    const myDmg = Math.max(1, Math.floor(myStats.atk * (0.8 + Math.random() * 0.4) - targetStats.def * 0.5));
    targetHp -= myDmg;
    log.push(`R${round}: ${mySpecies?.name || 'Summon'} hits for ${myDmg}!`);

    if (targetHp <= 0) break;

    // Target summon attacks
    const targetDmg = Math.max(1, Math.floor(targetStats.atk * (0.8 + Math.random() * 0.4) - myStats.def * 0.5));
    myHp -= targetDmg;
    log.push(`R${round}: ${targetSpecies?.name || 'Summon'} hits for ${targetDmg}!`);
  }

  const victory = targetHp <= 0 && myHp > 0;
  const draw = myHp <= 0 && targetHp <= 0;

  // Update ELO
  if (user.summonStats) {
    if (victory) user.summonStats.arenaWins = (user.summonStats.arenaWins || 0) + 1;
    else if (!draw) user.summonStats.arenaLosses = (user.summonStats.arenaLosses || 0) + 1;
  }
  if (targetUser.summonStats) {
    if (!victory && !draw) targetUser.summonStats.arenaWins = (targetUser.summonStats.arenaWins || 0) + 1;
    else if (victory) targetUser.summonStats.arenaLosses = (targetUser.summonStats.arenaLosses || 0) + 1;
  }

  // Loyalty cost (both summons lose some loyalty from the fight)
  mySummon.loyalty = Math.max(0, mySummon.loyalty - 3);
  await mySummon.save();
  targetSummon.loyalty = Math.max(0, targetSummon.loyalty - 3);
  await targetSummon.save();

  let msg = `⚔️ *SUMMON DUEL!*\n`;
  msg += `━━━━━━━━━━━━━━━\n\n`;
  msg += `${mySpecies?.icon || '🐉'} *${mySummon.nickname || mySpecies?.name}* vs ${targetSpecies?.icon || '🐉'} *${targetSummon.nickname || targetSpecies?.name}*\n\n`;
  msg += log.join('\n') + '\n\n';

  if (victory) {
    msg += `🏆 *${mySummon.nickname || mySpecies?.name} WINS!*`;
  } else if (draw) {
    msg += `🤝 *DRAW — both summons fell!*`;
  } else {
    msg += `💀 *${targetSummon.nickname || targetSpecies?.name} WINS!*`;
  }

  msg += `\n\n💖 Both summons lost 3 loyalty from the fight.`;

  await sock.sendMessage(chatId, { text: msg, mentions: [targetJid] });
}

// ─────────────────────────────────────────────────────────────
// .summon skill — view/manage summon skill tree (Phase 2)
// Subcommands:
//   .summon skill <id>           — view skill tree for a summon
//   .summon skill choose <id> <A|B|C> — choose a path
//   .summon skill unlock <id> <A1-A5> — unlock a node
//   .summon skill respec <id>    — reset skill tree (needs scroll)
// ─────────────────────────────────────────────────────────────

async function cmdSkillTree(sock, chatId, senderJid, args) {
  const user = economy.getUser(senderJid);
  if (!user) { await sock.sendMessage(chatId, { text: '❌ Not registered.' }); return; }

  const sub = (args[0] || '').toLowerCase();
  const summonNum = args[1] || '';
  const p = getPrefix();

  // .summon skill (no args) — show help
  if (!sub || !summonNum) {
    await sock.sendMessage(chatId, {
      text: `🛤️ *SUMMON SKILL TREES*\n\nEach summon has a 3-path skill tree. Choose ONE path and unlock nodes as you level up.\n\n*Commands:*\n• \`${p} summon skill <#>\` — view skill tree for summon #N\n• \`${p} summon skill choose <#> <A|B|C>\` — choose a path\n• \`${p} summon skill unlock <#> <A1-A5>\` — unlock a node (costs 1 skill point)\n• \`${p} summon skill respec <#>\` — reset tree (needs Skill Respec Scroll)\n\n_Skill points: 1 per level. Nodes unlock at L5/10/15/25/35._\n_Use summon position number (1, 2, 3) not summon ID._`
    });
    return;
  }

  // 💡 FIX: Use position number instead of summonId for lookup
  const summons = await summonSystem.getUserSummons(senderJid);
  const summonIndex = parseInt(summonNum) - 1;
  let summon = null;

  if (!isNaN(summonIndex) && summonIndex >= 0 && summonIndex < summons.length) {
    summon = summons[summonIndex];
  } else {
    // Fallback: try summonId match (for backwards compat)
    summon = summons.find(s => s.summonId.endsWith(summonNum) || s.summonId === summonNum);
  }

  if (!summon) {
    await sock.sendMessage(chatId, { text: `❌ Summon not found. You have ${summons.length} summons (1-${summons.length}). Use \`${p} summons\` to see them.` });
    return;
  }

  const summonSkillTrees = require('../rpg/summonSkillTrees');

  if (sub === 'choose') {
    const path = (args[2] || '').toUpperCase().trim();
    const result = summonSkillTrees.choosePath(summon, path);
    if (result.success) await summon.save();
    await sock.sendMessage(chatId, { text: result.message });
    return;
  }

  if (sub === 'unlock') {
    const nodeKey = (args[2] || '').toUpperCase().trim();
    const result = summonSkillTrees.unlockNode(summon, nodeKey);
    if (result.success) await summon.save();
    await sock.sendMessage(chatId, { text: result.message });
    return;
  }

  if (sub === 'respec') {
    const inventorySystem = require('../rpg/inventorySystem');
    if (!inventorySystem.hasItem(senderJid, 'skill_respec_scroll', 1)) {
      await sock.sendMessage(chatId, { text: `❌ Need a Skill Respec Scroll. Buy from shop or craft.` });
      return;
    }
    inventorySystem.removeItem(senderJid, 'skill_respec_scroll', 1);
    // Refund all skill points from unlocked nodes
    const refunded = (summon.unlockedSkillNodes || []).length;
    summon.skillPoints = (summon.skillPoints || 0) + refunded;
    summon.unlockedSkillNodes = [];
    summon.chosenSkillPath = null;
    await summon.save();
    await sock.sendMessage(chatId, { text: `✨ *SKILL TREE RESET!* Refunded ${refunded} skill point(s). Path choice cleared.` });
    return;
  }

  // .summon skill <id> — show the skill tree
  const tree = summonSkillTrees.getSkillTree(summon.archetype);
  const chosenPath = summon.chosenSkillPath;
  const unlocked = summon.unlockedSkillNodes || [];

  let msg = `🛤️ *SKILL TREE — ${summon.nickname || registry.getSpecies(summon.species)?.name}*\n`;
  msg += `📊 L${summon.level} | Skill Points: ${summon.skillPoints || 0}\n`;
  msg += `${chosenPath ? `🛤️ Path: ${chosenPath}` : '⚠️ No path chosen yet'}\n\n`;

  for (const [pathKey, pathData] of Object.entries(tree)) {
    const isChosen = chosenPath === pathKey;
    msg += `${isChosen ? '▶️' : '⚪'} *Path ${pathKey}: ${pathData.name}* ${pathData.icon}\n`;
    msg += `_${pathData.desc}_\n`;

    for (const [nodeKey, node] of Object.entries(pathData.nodes)) {
      const isUnlocked = unlocked.includes(nodeKey);
      const canUnlock = isChosen && !isUnlocked && summonSkillTrees.canUnlockNode(summon, nodeKey).canUnlock;
      const icon = isUnlocked ? '✅' : (canUnlock ? '🔹' : '🔒');
      msg += `  ${icon} \`${nodeKey}\` L${node.levelReq} — ${node.name} (${node.type})\n`;
      msg += `     ${node.desc}\n`;
    }
    msg += `\n`;
  }

  if (!chosenPath) {
    msg += `_Choose a path: \`${p} summon skill choose <id> <A|B|C>\`_`;
  } else {
    msg += `_Unlock: \`${p} summon skill unlock <id> <${chosenPath}1-${chosenPath}5>\`_`;
  }

  await sock.sendMessage(chatId, { text: msg });
}

// ─────────────────────────────────────────────────────────────
// .summon evolve <id> — evolve a summon to its next stage (Phase 3)
// ─────────────────────────────────────────────────────────────

async function cmdEvolve(sock, chatId, senderJid, args) {
  const user = economy.getUser(senderJid);
  if (!user) { await sock.sendMessage(chatId, { text: '❌ Not registered.' }); return; }

  const summonIdQuery = (args[0] || '').trim();
  if (!summonIdQuery) {
    const summonEvolution = require('../rpg/summonEvolution');
    const p = getPrefix();
    let msg = `✨ *SUMMON EVOLUTION*\n\nEvolve your summon to its next form!\n\n`;
    msg += `*Requirements:*\n`;
    msg += `• Stage 2 (ASCENDED): L15 + 1x Summon Essence (T2) + 10K Zeni\n`;
    msg += `• Stage 3 (TRANSCENDENT): L30 + 1x Summon Essence (T3) + 50K Zeni\n\n`;
    msg += `_Essences drop from Abyss bosses. Use \`${p} summon evolve <id>\` to evolve._`;
    await sock.sendMessage(chatId, { text: msg });
    return;
  }

  // Resolve the summon
  const summons = await summonSystem.getUserSummons(senderJid);
  const summon = resolveSummon(summons, summonNum);
  if (!summon) {
    await sock.sendMessage(chatId, { text: `❌ Summon not found. Use \`${getPrefix()} summon list\` to see your summons.` });
    return;
  }

  const summonEvolution = require('../rpg/summonEvolution');

  // Check if can evolve first
  const check = summonEvolution.canEvolve(summon);
  if (!check.canEvolve) {
    await sock.sendMessage(chatId, { text: `❌ ${check.reason}` });
    return;
  }

  // Show requirements + confirm
  if (!args[1] || args[1].toLowerCase() !== 'confirm') {
    const { nextSpeciesData, reqs } = check;
    const ZENI = botConfig.getCurrency().symbol;
    let msg = `✨ *EVOLUTION PREVIEW*\n\n`;
    msg += `${registry.getSpecies(summon.species)?.icon || '🐉'} ${registry.getSpecies(summon.species)?.name || summon.species}\n`;
    msg += `→ ${nextSpeciesData.icon} *${nextSpeciesData.name}* (${reqs.tier})\n\n`;
    msg += `*New Stats:*\n`;
    msg += `❤️ HP: ${nextSpeciesData.baseStats.hp} | ⚔️ ATK: ${nextSpeciesData.baseStats.atk}\n`;
    msg += `🛡️ DEF: ${nextSpeciesData.baseStats.def} | 🔮 MAG: ${nextSpeciesData.baseStats.mag}\n`;
    msg += `💨 SPD: ${nextSpeciesData.baseStats.spd}\n\n`;
    msg += `*Requirements:*\n`;
    msg += `📊 Level: ${summon.level}/${reqs.levelReq} ${summon.level >= reqs.levelReq ? '✅' : '❌'}\n`;
    const hasEssence = require('../rpg/inventorySystem').hasItem(senderJid, reqs.essenceId, 1);
    msg += `💎 ${reqs.essenceName}: ${hasEssence ? '✅' : '❌'}\n`;
    const balance = economy.getGold(senderJid);
    msg += `💰 Zeni: ${balance.toLocaleString()}/${reqs.zeniCost.toLocaleString()} ${balance >= reqs.zeniCost ? '✅' : '❌'}\n\n`;
    msg += `_Confirm with: \`${getPrefix()} summon evolve ${summonIdQuery} confirm\`_`;
    await sock.sendMessage(chatId, { text: msg });
    return;
  }

  // Execute evolution
  const result = await summonEvolution.evolveSummon(summon);
  await sock.sendMessage(chatId, { text: result.message });
}

// ─────────────────────────────────────────────────────────────
// .summon equip <summonId> <gearId> — equip summon gear (Phase 5)
// ─────────────────────────────────────────────────────────────

async function cmdSummonEquip(sock, chatId, senderJid, args) {
  const user = economy.getUser(senderJid);
  if (!user) { await sock.sendMessage(chatId, { text: '❌ Not registered.' }); return; }

  const summonIdQuery = (args[0] || '').trim();
  const gearIdQuery = (args[1] || '').trim();

  if (!summonIdQuery || !gearIdQuery) {
    let msg = `⚙️ *SUMMON EQUIPMENT*\n\n5 equipment slots: Claw, Core, Armor, Crest, Relic.\n\n_Usage: \`${getPrefix()} summon equip <summonId> <gearId>\`_`;
    await sock.sendMessage(chatId, { text: msg });
    return;
  }

  // Resolve summon
  const summons = await summonSystem.getUserSummons(senderJid);
  const summon = resolveSummon(summons, summonNum);
  if (!summon) { await sock.sendMessage(chatId, { text: '❌ Summon not found.' }); return; }

  // Resolve gear item — look up in ITEM_DATABASE for type SUMMON_GEAR
  const lootSystem = require('../rpg/lootSystem');
  const inventorySystem = require('../rpg/inventorySystem');
  const cleanQuery = gearIdQuery.toLowerCase().replace(/_/g, '').replace(/ /g, '');
  const gearId = Object.keys(lootSystem.ITEM_DATABASE).find(id =>
    lootSystem.ITEM_DATABASE[id].type === 'SUMMON_GEAR' &&
    id.toLowerCase().replace(/_/g, '') === cleanQuery
  );

  if (!gearId) {
    await sock.sendMessage(chatId, { text: `❌ Summon gear "${gearIdQuery}" not found. Make sure it's a summon equipment item.` });
    return;
  }

  const gearInfo = lootSystem.getItemInfo(gearId);
  const slot = gearInfo.summonSlot;
  if (!slot) {
    await sock.sendMessage(chatId, { text: `❌ ${gearInfo.name} is not summon equipment.` });
    return;
  }

  // Check player has the item
  if (!inventorySystem.hasItem(senderJid, gearId, 1)) {
    await sock.sendMessage(chatId, { text: `❌ You don't have a ${gearInfo.name}.` });
    return;
  }

  // If something is already equipped in that slot, return it to inventory
  const oldGear = summon.summonEquipment?.[slot];
  if (oldGear) {
    inventorySystem.addItem(senderJid, oldGear.id || oldGear.summonSlot, 1);
  }

  // Equip the new gear
  if (!summon.summonEquipment) summon.summonEquipment = {};
  summon.summonEquipment[slot] = {
    id: gearId,
    name: gearInfo.name,
    stats: gearInfo.stats,
    rarity: gearInfo.rarity,
  };

  // Remove from inventory
  inventorySystem.removeItem(senderJid, gearId, 1);
  await summon.save();

  let msg = `⚙️ *EQUIPPED!*\n\n${gearInfo.name} → ${summon.nickname || summon.species}'s ${slot} slot\n`;
  if (gearInfo.stats) {
    const statStr = Object.entries(gearInfo.stats)
      .filter(([,v]) => v !== 0)
      .map(([k,v]) => `${k.toUpperCase()} ${v > 0 ? '+' : ''}${v}`)
      .join(', ');
    if (statStr) msg += `Stats: ${statStr}`;
  }
  await sock.sendMessage(chatId, { text: msg });
}

// ─────────────────────────────────────────────────────────────
// .summon unequip <summonId> <slot> — unequip summon gear (Phase 5)
// ─────────────────────────────────────────────────────────────

async function cmdSummonUnequip(sock, chatId, senderJid, args) {
  const user = economy.getUser(senderJid);
  if (!user) { await sock.sendMessage(chatId, { text: '❌ Not registered.' }); return; }

  const summonIdQuery = (args[0] || '').trim();
  const slot = (args[1] || '').toLowerCase().trim();

  if (!summonIdQuery || !slot) {
    await sock.sendMessage(chatId, {
      text: `❌ Usage: \`${getPrefix()} summon unequip <summonId> <claw|core|armor|crest|relic>\``
    });
    return;
  }

  const validSlots = ['claw', 'core', 'armor', 'crest', 'relic'];
  if (!validSlots.includes(slot)) {
    await sock.sendMessage(chatId, { text: `❌ Invalid slot. Use: claw, core, armor, crest, or relic.` });
    return;
  }

  const summons = await summonSystem.getUserSummons(senderJid);
  const summon = resolveSummon(summons, summonNum);
  if (!summon) { await sock.sendMessage(chatId, { text: '❌ Summon not found.' }); return; }

  const gear = summon.summonEquipment?.[slot];
  if (!gear) {
    await sock.sendMessage(chatId, { text: `❌ Nothing equipped in ${slot} slot.` });
    return;
  }

  // Return to inventory
  const inventorySystem = require('../rpg/inventorySystem');
  inventorySystem.addItem(senderJid, gear.id, 1);
  summon.summonEquipment[slot] = null;
  await summon.save();

  await sock.sendMessage(chatId, { text: `✅ Unequipped ${gear.name} from ${slot} slot. Returned to inventory.` });
}

// ─────────────────────────────────────────────────────────────
// .summon bond <id> — view bond level + bonuses (Phase 4)
// ─────────────────────────────────────────────────────────────

async function cmdBond(sock, chatId, senderJid, args) {
  const user = economy.getUser(senderJid);
  if (!user) { await sock.sendMessage(chatId, { text: '❌ Not registered.' }); return; }

  const summonIdQuery = (args[0] || '').trim();
  if (!summonIdQuery) {
    await sock.sendMessage(chatId, {
      text: `💖 *SUMMON BOND SYSTEM*\n\nFight alongside your summon to grow your bond. Each combat grants 1-3 bond XP.\n\n*Bond Tiers:*\n• 10: Acquainted — +5% all stats\n• 25: Trusted — +10% stats, loyalty decays slower\n• 50: Bonded — +15% stats, echo buff stronger\n• 75: Soulbound — +20% stats, combo attack unlocked\n• 100: Eternal — +25% stats, loyalty never decays\n\n_Usage: \`${getPrefix()} summon bond <id>\`_`
    });
    return;
  }

  const summons = await summonSystem.getUserSummons(senderJid);
  const summon = resolveSummon(summons, summonNum);
  if (!summon) {
    await sock.sendMessage(chatId, { text: `❌ Summon not found.` });
    return;
  }

  const summonBondTraits = require('../rpg/summonBondTraits');
  const bondDisplay = summonBondTraits.getBondDisplay(summon);
  const species = registry.getSpecies(summon.species);
  let msg = `💖 *BOND — ${summon.nickname || species?.name || summon.species}*\n\n`;
  msg += bondDisplay;
  await sock.sendMessage(chatId, { text: msg });
}

// ─────────────────────────────────────────────────────────────
// .summon traits <id> — view traits (Phase 4)
// ─────────────────────────────────────────────────────────────

async function cmdTraits(sock, chatId, senderJid, args) {
  const user = economy.getUser(senderJid);
  if (!user) { await sock.sendMessage(chatId, { text: '❌ Not registered.' }); return; }

  const summonIdQuery = (args[0] || '').trim();
  if (!summonIdQuery) {
    await sock.sendMessage(chatId, {
      text: `🧬 *SUMMON TRAITS*\n\nEach summon spawns with 1-3 permanent traits that define its unique identity.\n\n_Usage: \`${getPrefix()} summon traits <id>\`_`
    });
    return;
  }

  const summons = await summonSystem.getUserSummons(senderJid);
  const summon = resolveSummon(summons, summonNum);
  if (!summon) {
    await sock.sendMessage(chatId, { text: `❌ Summon not found.` });
    return;
  }

  const summonBondTraits = require('../rpg/summonBondTraits');
  const species = registry.getSpecies(summon.species);
  let msg = `🧬 *TRAITS — ${summon.nickname || species?.name || summon.species}*\n\n`;
  msg += `   ${summonBondTraits.getTraitsDisplay(summon)}\n`;
  msg += `\n_Traits are permanent — they define this summon's unique identity._`;
  await sock.sendMessage(chatId, { text: msg });
}

// ─────────────────────────────────────────────────────────────
// .summon ai <id> <mode> — set AI behavior mode (Phase 4)
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// .summon abilities — list auto-unlocked abilities for active summon
// 💡 NEW 2026-08-05: Summons auto-unlock abilities at level milestones.
// This command shows what's unlocked + what's coming next.
// ─────────────────────────────────────────────────────────────
async function cmdAbilities(sock, chatId, senderJid, args) {
  const user = economy.getUser(senderJid);
  if (!user) { await sock.sendMessage(chatId, { text: '❌ Not registered.' }); return; }

  const summon = await summonSystem.getActiveSummon(user);
  if (!summon) {
    await sock.sendMessage(chatId, {
      text: `❌ No active summon. Deploy one first with \`${getPrefix()}summon deploy <#>\``,
    });
    return;
  }

  const species = registry.getSpecies(summon.species);
  const monsterSkills = require('../rpg/monsterSkills');
  const arch = monsterSkills.MONSTER_ARCHETYPES[summon.archetype];

  if (!arch) {
    await sock.sendMessage(chatId, {
      text: `❌ This summon's archetype (${summon.archetype}) has no ability kit defined.`,
    });
    return;
  }

  const p = getPrefix();
  const name = summon.nickname || species?.name || summon.species;
  const icon = species?.icon || '🐉';

  let msg = `${icon} *${name}* — Abilities (Lv.${summon.level} ${summon.archetype})\n`;
  msg += `━━━━━━━━━━━━━━━━━━━\n\n`;

  // Unlocked abilities
  const unlocked = Object.entries(arch.skills)
    .filter(([, s]) => !s.isFollowUp && summon.level >= s.levelReq)
    .map(([id, s]) => ({ id, ...s }));

  // Locked abilities (coming at future levels)
  const locked = Object.entries(arch.skills)
    .filter(([, s]) => !s.isFollowUp && summon.level < s.levelReq)
    .map(([id, s]) => ({ id, ...s }))
    .sort((a, b) => a.levelReq - b.levelReq);

  msg += `✅ *UNLOCKED (${unlocked.length}):*\n`;
  if (unlocked.length === 0) {
    msg += `   _No abilities yet — reach Lv.${locked[0]?.levelReq || 1} to unlock the first._\n`;
  } else {
    for (const ab of unlocked) {
      const costStr = ab.cost > 0 ? ` · ${ab.cost} EN` : '';
      msg += `   • *${ab.name}* (Lv.${ab.levelReq}+${costStr})\n`;
      if (ab.msg) msg += `     _"${ab.msg}"_\n`;
    }
  }

  // Next to unlock
  if (locked.length > 0) {
    msg += `\n🔒 *NEXT TO UNLOCK:*\n`;
    const next = locked.slice(0, 3);
    for (const ab of next) {
      const costStr = ab.cost > 0 ? ` · ${ab.cost} EN` : '';
      msg += `   • *${ab.name}* — unlocks at Lv.${ab.levelReq}${costStr}\n`;
    }
    if (locked.length > 3) {
      msg += `   _...and ${locked.length - 3} more at higher levels_\n`;
    }
  }

  msg += `\n💡 Abilities auto-unlock as your summon levels up. Use \`${p}summon train\` to gain XP.`;
  await sock.sendMessage(chatId, { text: msg });
}

async function cmdAIMode(sock, chatId, senderJid, args) {
  const user = economy.getUser(senderJid);
  if (!user) { await sock.sendMessage(chatId, { text: '❌ Not registered.' }); return; }

  const summonIdQuery = (args[0] || '').trim();
  const mode = (args[1] || '').toUpperCase().trim();

  if (!summonIdQuery) {
    const summonBondTraits = require('../rpg/summonBondTraits');
    let msg = `🤖 *SUMMON AI MODES*\n\nChoose how your summon behaves in combat:\n\n`;
    msg += summonBondTraits.getAIModesDisplay();
    msg += `\n\n_Usage: \`${getPrefix()} summon ai <id> <mode>\`_`;
    await sock.sendMessage(chatId, { text: msg });
    return;
  }

  const summons = await summonSystem.getUserSummons(senderJid);
  const summon = resolveSummon(summons, summonNum);
  if (!summon) {
    await sock.sendMessage(chatId, { text: `❌ Summon not found.` });
    return;
  }

  if (!mode) {
    const summonBondTraits = require('../rpg/summonBondTraits');
    const currentMode = summonBondTraits.getAIMode(summon.aiMode || 'BALANCED');
    let msg = `🤖 *AI MODE — ${summon.nickname || summon.species}*\n\n`;
    msg += `Current: ${currentMode.icon} ${currentMode.name}\n${currentMode.desc}\n\n`;
    msg += `*Available modes:*\n`;
    msg += summonBondTraits.getAIModesDisplay();
    msg += `\n\n_Usage: \`${getPrefix()} summon ai ${summonIdQuery} <mode>\`_`;
    await sock.sendMessage(chatId, { text: msg });
    return;
  }

  const summonBondTraits = require('../rpg/summonBondTraits');
  const modeData = summonBondTraits.getAIMode(mode);
  if (!summonBondTraits.AI_MODES[mode]) {
    await sock.sendMessage(chatId, { text: `❌ Invalid mode. Use: AGGRESSIVE, DEFENSIVE, PROTECT_OWNER, SUPPORT_ALLY, or BALANCED.` });
    return;
  }

  summon.aiMode = mode;
  await summon.save();
  await sock.sendMessage(chatId, { text: `🤖 AI mode set to *${modeData.name}* ${modeData.icon}\n${modeData.desc}` });
}

// ─────────────────────────────────────────────────────────────
// .summon eggcraft <tier> — craft eggs from fragments
// ─────────────────────────────────────────────────────────────

async function cmdEggCraft(sock, chatId, senderJid, args) {
  const user = economy.getUser(senderJid);
  if (!user) {
    await sock.sendMessage(chatId, { text: '❌ Not registered.' });
    return;
  }

  const tier = (args[0] || '').toLowerCase().trim();
  const validTiers = ['rare', 'epic', 'legendary', 'mythic'];

  if (!tier) {
    const inventorySystem = require('../rpg/inventorySystem');
    const p = getPrefix();
    let msg = `💎 *SUMMON EGG CRAFTING*\n\n`;
    msg += `Combine 10 fragments to craft an egg:\n\n`;
    for (const t of validTiers) {
      const summonEggSystem = require('../rpg/summonEggSystem');
      const tierData = summonEggSystem.EGG_TIERS[t];
      const fragId = tierData.fragmentsRequired.id;
      const fragCount = tierData.fragmentsRequired.count;
      const have = inventorySystem.getItemCount(senderJid, fragId);
      const eggName = require('../rpg/lootSystem').getItemInfo(tierData.eggId)?.name || tierData.eggId;
      const fragName = require('../rpg/lootSystem').getItemInfo(fragId)?.name || fragId;
      msg += `• \`${p} summon eggcraft ${t}\` — ${fragCount}x ${fragName} → ${eggName}\n  _You have: ${have}/${fragCount}_\n`;
    }
    msg += `\n_Get fragments by defeating Wild Summons in the Abyss (10% encounter rate per floor)._`;
    await sock.sendMessage(chatId, { text: msg });
    return;
  }

  if (!validTiers.includes(tier)) {
    await sock.sendMessage(chatId, {
      text: `❌ Invalid tier. Use: \`${getPrefix()} summon eggcraft <rare|epic|legendary|mythic>\``
    });
    return;
  }

  const summonEggSystem = require('../rpg/summonEggSystem');
  const result = await summonEggSystem.craftEgg(senderJid, tier);
  await sock.sendMessage(chatId, { text: result.message });
}

// ─────────────────────────────────────────────────────────────
// .summon help
// ─────────────────────────────────────────────────────────────

async function cmdHelp(sock, chatId) {
  const p = getPrefix();
  let msg = `🐉 *SUMMONER SYSTEM*\n`;
  msg += `━━━━━━━━━━━━━━━\n\n`;
  msg += `*COMMANDS:*\n`;
  msg += `📋 \`${p} summons\` — view your Main Deck (animated)\n`;
  msg += `📦 \`${p} summon backlog\` — view your Backlog summons\n`;
  msg += `🔄 \`${p} summon swap <backlog#> <deckSlot>\` — swap between Backlog and Main Deck\n`;
  msg += `🔍 \`${p} summon <#>\` — view summon details (animated)\n`;
  msg += `⚔️ \`${p} summon <#> deploy\` — deploy summon for combat (1 at a time)\n`;
  msg += `🛡️ \`${p} summon dismiss\` — unequip active summon\n`;
  msg += `📈 \`${p} summon train <#>\` — daily training (+500 XP)\n`;
  msg += `📊 \`${p} summon allocate <#> <stat> <pts>\` — allocate stat points\n`;
  msg += `🛤️ \`${p} summon skill <#>\` — view/manage skill tree\n`;
  msg += `🔗 \`${p} summon resonance\` — view active resonance bonuses\n`;
  msg += `📚 \`${p} summon codex\` — view ALL summon species (5 per page)\n`;
  msg += `🥚 \`${p} summon hatch <egg_id>\` — hatch a summon egg\n`;
  msg += `💎 \`${p} summon eggcraft <tier>\` — craft eggs from fragments\n`;
  msg += `⚔️ \`${p} summon forge <#1> <#2>\` — Soul Forge two summons\n`;
  msg += `🏆 \`${p} summon trial <#>\` — attempt evolution trial\n`;
  msg += `✨ \`${p} summon passives\` — view unlocked trial passives\n`;
  msg += `🏪 \`${p} summon market <list/sell/buy/cancel>\` — summon trading\n`;
  msg += `⚔️ \`${p} summon duel @user\` — summon vs summon PvP\n`;
  msg += `💔 \`${p} summon release <#>\` — permanently release a summon\n\n`;
  msg += `*MAIN DECK & BACKLOG:*\n`;
  msg += `• Main Deck = 3 slots (deployable in combat)\n`;
  msg += `• Backlog = unlimited storage for extra summons\n`;
  msg += `• Use \`${p} summon swap <backlog#> <deckSlot>\` to move summons\n`;
  msg += `• Example: \`${p} summon swap 1 2\` = backlog #1 → deck slot 2\n\n`;
  msg += `*OBTAINING SUMMONS:*\n`;
  msg += `• 🥚 Buy a *Basic Summon Egg* from the shop (5K Zeni) → hatches 1 of 4 starters\n`;
  msg += `• 🐉 Explore the *Abyss* — 10% chance per floor to encounter a Wild Summon\n`;
  msg += `• 💎 Defeat Wild Summons → drop *Summon Fragments* (tiered by floor depth)\n`;
  msg += `• 🔮 Craft higher-tier eggs from fragments → hatch stronger summons\n`;
  msg += `• Necromancer: cast Army of the Dead to capture enemies\n`;
  msg += `• Buy from other players on the summon market\n\n`;
  msg += `*EGG CRAFTING:*\n`;
  msg += `• 10x Common Fragment → Rare Egg\n`;
  msg += `• 10x Rare Fragment → Epic Egg\n`;
  msg += `• 10x Epic Fragment → Legendary Egg\n`;
  msg += `• 10x Legendary Fragment → Mythic Egg\n\n`;
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
