// ╔══════════════════════════════════════════════════════════════════════════╗
// ║                        CARD SYSTEM  —  cardSystem.js                    ║
// ║                                                                          ║
// ║  Drop this file in the same directory as engine.js.                     ║
// ║  See README_CARDS.md for setup instructions.                            ║
// ╚══════════════════════════════════════════════════════════════════════════╝

'use strict';

const fs      = require('fs');
const path    = require('path');
const axios   = require('axios');
const GoImageService = require('./goImageService');
const goService = new GoImageService();

// ── Mongoose Models ──────────────────────────────────────────────────────────
const CardStat   = require('./models/CardStat');
const UserCard   = require('./models/UserCard');
const CardMarket = require('./models/CardMarket');
const CardDeck   = require('./models/CardDeck');
const System     = require('./models/System');
const economy    = require('./economy');

// ── Config ───────────────────────────────────────────────────────────────────
const botConfig  = require('../botConfig');
const ZENI       = () => botConfig.getCurrency().symbol;
const P          = () => botConfig.getPrefix().toLowerCase();

// ═══════════════════════════════════════════════════════════════════════════
//  SECTION 1 — CONSTANTS & TABLES
// ═══════════════════════════════════════════════════════════════════════════

const CARDS_DB_PATH = path.join(__dirname, 'data', 'cards_data.json');
const BASE_MAX   = { '1': 500, '2': 300, '3': 150, '4': 80, '5': 20, '6': 5, 'S': 1 };
const BASE_PRICE = { '1': 10,  '2': 25,  '3': 60, '4': 150, '5': 400, '6': 1200, 'S': 9999 };

const TIER_STARS = {
  '1': '✦', '2': '✦✦', '3': '✦✦✦',
  '4': '✦✦✦✦', '5': '✦✦✦✦✦', '6': '❖❖❖❖❖❖', 'S': '👑'
};

const TIER_LABEL = {
  '1': 'TIER  I',  '2': 'TIER  II',  '3': 'TIER  III',
  '4': 'TIER  IV', '5': 'TIER  V',   '6': 'TIER  VI',  'S': 'TIER  S'
};

const SPAWN_WEIGHTS = [
  { tier: '1', w: 20 },
  { tier: '2', w: 15 },
  { tier: '3', w: 10 },
  { tier: '4', w:  8 },
];

const T5_PER_INTERVAL = 1 / 144;
const T6_PER_INTERVAL = 1 / 672;
const CLAIM_WINDOW_MS = 30 * 60 * 1000; 
const MAIN_DECK_SIZE = 12;

// ═══════════════════════════════════════════════════════════════════════════
//  SECTION 2 — RUNTIME STATE (Multi-Tenant)
// ═══════════════════════════════════════════════════════════════════════════

const instances = new Map();

function getInst() {
  const id = botConfig.getBotId();
  if (!instances.has(id)) {
    instances.set(id, {
      sock_ref:      null,
      activeGroups:  new Set(),
      spawnTimer:    null,
      ownerJid:      null,
      adminJids:     new Set(),
      modJids:       new Set(),
      activeSpawns:  new Map(),
      pendingBurns:  new Map(),
      ALL_CARDS:     [],
      CARD_INDEX:    {},
      CARDS_BY_TIER: {}
    });
  }
  return instances.get(id);
}

const ALL_CARDS     = () => getInst().ALL_CARDS;
const CARD_INDEX    = () => getInst().CARD_INDEX;
const CARDS_BY_TIER = () => getInst().CARDS_BY_TIER;

function loadCardsDB() {
  const inst = getInst();
  try {
    const raw     = JSON.parse(fs.readFileSync(CARDS_DB_PATH, 'utf8'));
    const cards   = Array.isArray(raw.cards) ? raw.cards : Object.values(raw.cards);
    
    inst.ALL_CARDS     = cards;
    inst.CARD_INDEX    = {};
    inst.CARDS_BY_TIER = {};
    
    for (const card of inst.ALL_CARDS) {
      inst.CARD_INDEX[card.id] = card;
      const t = String(card.tier);
      if (!inst.CARDS_BY_TIER[t]) inst.CARDS_BY_TIER[t] = [];
      inst.CARDS_BY_TIER[t].push(card);
    }
    console.log(`[CardSystem][${botConfig.getBotId()}] Loaded ${inst.ALL_CARDS.length} cards across ${Object.keys(inst.CARDS_BY_TIER).length} tiers.`);
  } catch (e) {
    console.error('[CardSystem] Failed to load cards_data.json:', e.message);
  }
}

async function saveActiveGroups() {
  const inst = getInst();
  const id = botConfig.getBotId();
  await System.findOneAndUpdate(
    { key: `card_active_groups_${id}` },
    { value: Array.from(inst.activeGroups) },
    { upsert: true, returnDocument: 'after' }
  );
}

async function saveRoles() {
  const inst = getInst();
  const id = botConfig.getBotId();
  await System.findOneAndUpdate(
    { key: `card_roles_${id}` },
    { value: { admins: Array.from(inst.adminJids), mods: Array.from(inst.modJids) } },
    { upsert: true, returnDocument: 'after' }
  );
}

async function loadActiveGroups() {
  const inst = getInst();
  const id = botConfig.getBotId();
  const data = await System.findOne({ key: `card_active_groups_${id}` });
  if (data && Array.isArray(data.value)) {
    inst.activeGroups = new Set(data.value);
    if (inst.activeGroups.size > 0) ensureTimerRunning();
  }
}

async function loadRoles() {
  const inst = getInst();
  const id = botConfig.getBotId();
  const data = await System.findOne({ key: `card_roles_${id}` });
  if (data && data.value) {
    if (Array.isArray(data.value.admins)) data.value.admins.forEach(j => inst.adminJids.add(j));
    if (Array.isArray(data.value.mods)) data.value.mods.forEach(j => inst.modJids.add(j));
  }
}

function ensureTimerRunning() {
  const inst = getInst();
  if (!inst.spawnTimer && inst.activeGroups.size > 0) {
    let groupIndex = 0;
    inst.spawnTimer = setInterval(() => {
      const groups = Array.from(inst.activeGroups);
      if (groups.length === 0) return;
      const gid = groups[groupIndex % groups.length];
      doSpawn(null, null, false, gid);
      groupIndex++;
    }, 30 * 60 * 1000);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  SECTION 3 — CORE ENGINE
// ═══════════════════════════════════════════════════════════════════════════

function getRarityLabel(copyNumber, maxCopies) {
  const pct = copyNumber / maxCopies;
  if (copyNumber === 1) return { label: 'SOLO COPY',             emoji: '💠' };
  if (copyNumber <= 3)  return { label: 'TOP 3 COPY',            emoji: '💎' };
  if (pct <= 0.05)      return { label: 'ULTRA RARE',            emoji: '✨' };
  if (pct <= 0.15)      return { label: 'LEGENDARY CIRCULATION', emoji: '🔮' };
  if (pct <= 0.35)      return { label: 'RARE',                  emoji: '🌟' };
  if (pct <= 0.70)      return { label: 'UNCOMMON',              emoji: '🎴' };
  return                       { label: 'COMMON',                emoji: '📦' };
}

function calcPrice(tier, totalSpawned, maxCopies) {
  const base  = BASE_PRICE[String(tier)] || 10;
  const ratio = maxCopies / Math.max(totalSpawned, 1);
  return Math.max(Math.round(base * ratio), base);
}

function buildCardDetailCaption(card, uc, stat, location = 'Collection', index = null) {
  const tier   = String(card.tier);
  const label  = TIER_LABEL[tier]  || `TIER ${tier}`;
  const stars  = TIER_STARS[tier]  || '✦';
  let locStr = `📦 *${location}*`;
  if (index !== null) locStr += ` (#${index})`;
  if (uc) {
    if (uc.inMainDeck) locStr = `🎴 *Main Deck* (Slot #${uc.mainDeckSlot})`;
    else if (uc.inCustomDeck) locStr = `📁 *Deck: ${uc.customDeckName}* (Slot #${uc.customDeckSlot})`;
  }
  return (
`╔═════════════════╗
      🎴  *CARD DETAIL*
╚═════════════════╝

🏷️  *Name:* ${card.cardName}
📺  *Series:* ${card.animeName}
${stars}  *${label}*  ${stars}
🎨  *Artist:* ${card.creator || 'Unknown'}

📍  *Location:* ${locStr}

▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬`
  );
}

function buildSpawnCaption(card, copyNumber, maxCopies, price) {
  const tier   = String(card.tier);
  const label  = TIER_LABEL[tier]  || `TIER ${tier}`;
  return (
`▬▬▬▬▬▬▬▬▬▬▬▬
🎴  CARD APPEARED!
▬▬▬▬▬▬▬▬▬▬▬▬
🏷️  Name ›  ${card.cardName}
📺  Series ›  ${card.animeName}
✦  ${label}  ✦
🎨  Art ›  ${card.creator || 'Unknown'}
▬▬▬▬▬▬▬▬▬▬▬▬
🆔  ${card.id}
⌨️  Type  ${P()} claim ${card.id}  
▬▬▬▬▬▬▬▬▬▬▬▬`
  );
}

function cardLine(index, card, uc, stat) {
  const tier   = String(card.tier);
  const rarity = getRarityLabel(uc.copyNumber, stat?.maxCopies || BASE_MAX[tier] || 200);
  return `  #${index} ➳ ${TIER_STARS[tier]} ${card.cardName} _(${card.animeName})_ ${rarity.emoji}`;
}

async function getOrInitStat(cardId, tier) {
  let stat = await CardStat.findOne({ cardId });
  if (!stat) stat = await CardStat.create({ cardId, maxCopies: BASE_MAX[String(tier)] || 200 });
  return stat;
}

async function doSpawn(forceCardId = null, forceTier = null, bypassCap = false, targetGroup = null) {
  const inst  = getInst();
  if (!inst.sock_ref || !targetGroup) return;

  let card = null;
  let stat = null;

  if (forceCardId) {
    card = CARD_INDEX()[forceCardId] || ALL_CARDS().find(c => c.cardName.toLowerCase() === forceCardId.toLowerCase());
    if (!card) return null;
    stat = await getOrInitStat(card.id, card.tier);
  } else {
    const tier = forceTier || (() => {
      if (Math.random() < T6_PER_INTERVAL) return '6';
      if (Math.random() < T5_PER_INTERVAL) return '5';
      const total = SPAWN_WEIGHTS.reduce((s, e) => s + e.w, 0);
      let roll = Math.random() * total;
      for (const { tier, w } of SPAWN_WEIGHTS) { roll -= w; if (roll <= 0) return tier; }
      return '1';
    })();
    
    const pool = [...(CARDS_BY_TIER()[tier] || [])];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    for (const c of pool) {
      const s = await getOrInitStat(c.id, c.tier);
      if (s.totalSpawned < s.maxCopies) { card = c; stat = s; break; }
    }
    
    if (!card) {
        // T1 Fallback
        const t1 = [...(CARDS_BY_TIER()['1'] || [])];
        for (const c of t1) {
            const s = await getOrInitStat(c.id, '1');
            if (s.totalSpawned < s.maxCopies) { card = c; stat = s; break; }
        }
    }
  }

  if (!card || (!bypassCap && stat.totalSpawned >= stat.maxCopies)) return;

  stat.totalSpawned += 1;
  stat.lastSpawnedAt = new Date();
  await stat.save();

  const price   = calcPrice(card.tier, stat.totalSpawned, stat.maxCopies);
  const caption = buildSpawnCaption(card, stat.totalSpawned, stat.maxCopies, price);

  try {
    if (String(card.tier) === '6' || String(card.tier) === 'S') {
      const gifBuffer = await goService.convertCardImage(card.imageUrl);
      if (gifBuffer) {
        await inst.sock_ref.sendMessage(targetGroup, { video: gifBuffer, gifPlayback: true, caption });
      } else {
        // Fallback to static image if conversion fails
        const res = await axios.get(card.imageUrl, { responseType: 'arraybuffer', timeout: 12000, headers: { 'User-Agent': 'Mozilla/5.0' } });
        await inst.sock_ref.sendMessage(targetGroup, { image: Buffer.from(res.data), caption, mimetype: 'image/jpeg' });
      }
    } else {
      const res = await axios.get(card.imageUrl, { responseType: 'arraybuffer', timeout: 12000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      await inst.sock_ref.sendMessage(targetGroup, { image: Buffer.from(res.data), caption, mimetype: 'image/jpeg' });
    }

    const spawnKey = `${targetGroup}_${card.id}`;
    inst.activeSpawns.set(spawnKey, {
      card, copyNumber: stat.totalSpawned, stat, price,
      groupJid: targetGroup, spawnedAt: Date.now(), expiresAt: Date.now() + CLAIM_WINDOW_MS
    });
    console.log(`[CardSystem][${botConfig.getBotId()}] Spawned: ${card.cardName} (T${card.tier}) #${stat.totalSpawned}/${stat.maxCopies} in ${targetGroup}`);
    return { card, copyNumber: stat.totalSpawned, stat, price };
  } catch (err) {
    stat.totalSpawned -= 1;
    await stat.save();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  SECTION 4 — COMMAND HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

// GIF Cache
const gifCache = {
    decks: new Map(), // key: userId_deckName, value: { hash: string, buffer: Buffer }
    collections: new Map() // key: userId, value: { hash: string, buffer: Buffer }
};

function getDeckHash(cards) {
    return cards.map(c => c.cardId + (c.isLocked ? 'L' : 'U')).join('|');
}

function sendUsage(reply, cmd, usage, example) {
  let msg = `┏━━━━━━━━━━━━━━━┓\n`;
  msg += `┃   📖 *USAGE*    ┃\n`;
  msg += `┗━━━━━━━━━━━━━━━┛\n\n`;
  msg += `*Command:* \`${cmd}\`\n`;
  msg += `*Usage:* \`${usage}\`\n`;
  msg += `*Example:* \`${example}\`\n\n`;
  msg += `💡 _Make sure you are using the correct indices from your collection or deck._`;
  return reply(msg);
}

async function cmdClaim(args, senderJid, reply, chatId) {
  const inst = getInst();
  const cardIdInput = args.join('').trim();
  if (!cardIdInput) return sendUsage(reply, `${P()} claim`, `${P()} claim <card-id>`, `${P()} claim 3-04521`);

  // Try exact match with composite key
  const exactKey = `${chatId}_${cardIdInput}`;
  let spawn = inst.activeSpawns.get(exactKey);
  
  if (!spawn) {
      // Find case-insensitive match for this chat
      const foundKey = Array.from(inst.activeSpawns.keys()).find(k => {
          return k.toLowerCase() === exactKey.toLowerCase() || (k.startsWith(chatId + '_') && k.split('_')[1].toLowerCase() === cardIdInput.toLowerCase());
      });
      if (foundKey) spawn = inst.activeSpawns.get(foundKey);
  }

  if (!spawn || Date.now() > spawn.expiresAt) {
    if (spawn) inst.activeSpawns.delete(`${chatId}_${spawn.card.id}`);
    return reply(`❌ No active card with ID \`${cardIdInput}\` in this group.`);
  }

  try {
    await UserCard.create({ userId: senderJid, cardId: spawn.card.id, copyNumber: spawn.copyNumber });
    spawn.stat.totalCirculation += 1;
    spawn.stat.uniqueOwners     += 1;
    await spawn.stat.save();
    inst.activeSpawns.delete(`${chatId}_${spawn.card.id}`);

    const rarity = getRarityLabel(spawn.copyNumber, spawn.stat.maxCopies);
    return reply(`${rarity.emoji}  *CLAIMED!*\n\n*${spawn.card.cardName}* — _${spawn.card.animeName}_\n📋 Copy *#${spawn.copyNumber}* (${rarity.label})\n\n_Added to your collection!_`);
  } catch (err) {
    console.error('[Claim Error]', err);
    return reply('❌ Claim failed.');
  }
}

function getTopCards(cards) {
  const tierOrder = { 'S': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2, '1': 1 };
  return [...cards].sort((a, b) => {
    const cardA = CARD_INDEX()[a.cardId];
    const cardB = CARD_INDEX()[b.cardId];
    const tA = tierOrder[cardA?.tier] || 0;
    const tB = tierOrder[cardB?.tier] || 0;
    if (tA !== tB) return tB - tA;
    return (b.copyNumber || 0) - (a.copyNumber || 0);
  }).slice(0, 6);
}

function getTopImageUrls(topCards) {
  return topCards.map(uc => CARD_INDEX()[uc.cardId]?.imageUrl).filter(Boolean);
}

async function cmdCardsTier(senderJid, reply, chatId) {
  const inst = getInst();
  const p = P();
  const owned = await UserCard.find({ userId: senderJid, inMainDeck: false, inCustomDeck: false, forSale: false }).sort({ createdAt: 1 });
  if (!owned.length) return reply('📭 Collection empty.');

  // Group by Tier
  const tiers = { 'S': [], '6': [], '5': [], '4': [], '3': [], '2': [], '1': [] };
  const tierEmoji = { 'S': '👑', '6': '💎', '5': '✨', '4': '🎗', '3': '🔮', '2': '🌈', '1': '🎴' };
  
  owned.forEach((uc, i) => {
    const card = CARD_INDEX()[uc.cardId];
    if (card) {
      const t = String(card.tier);
      if (tiers[t]) tiers[t].push({ name: card.cardName, index: i + 1 });
    }
  });

  let finalMsg = `🃏 *Cards | Tier View*\n\n`;
  for (const t of ['S', '6', '5', '4', '3', '2', '1']) {
    if (tiers[t].length > 0) {
      const label = t === 'S' ? 'S' : t;
      finalMsg += `${tierEmoji[t]} *Tier ${label}*\n`;
      tiers[t].forEach((item) => {
        finalMsg += `*#${item.index} ➳ ${item.name}*\n`;
      });
      finalMsg += `\n`;
    }
  }

  finalMsg += `*[Use ${p} coll <card_index> to see more detail about this card]*`;

  // GIF generation for Tier View (Top 6 Highlights)
  const topCards = getTopCards(owned);
  const imageUrls = getTopImageUrls(topCards);
  if (imageUrls.length > 0) {
    const currentHash = getDeckHash(topCards);
    const cached = gifCache.collections.get(senderJid);
    
    let gifBuffer;
    if (cached && cached.hash === currentHash) {
        gifBuffer = cached.buffer;
    } else {
        gifBuffer = await goService.generateCardGif(imageUrls, "COLLECTION HIGHLIGHTS");
        if (gifBuffer) gifCache.collections.set(senderJid, { hash: currentHash, buffer: gifBuffer });
    }

    if (gifBuffer) {
      return await inst.sock_ref.sendMessage(chatId, { 
          video: gifBuffer, 
          gifPlayback: true, 
          caption: finalMsg 
      });
    }
  }

  return reply(finalMsg);
}

async function cmdColl(senderJid, reply, chatId, args = []) {
  const inst = getInst();
  const p = P();

  if (args.length > 0) {
    const input = args[0];
    if (input === '--tier') return cmdCardsTier(senderJid, reply, chatId);
    
    let uc = null;
    if (input.includes('-')) uc = await UserCard.findOne({ userId: senderJid, cardId: input });
    else {
      const idx = parseInt(input);
      if (!isNaN(idx)) {
        const owned = await UserCard.find({ userId: senderJid, inMainDeck: false, inCustomDeck: false, forSale: false }).sort({ createdAt: 1 });
        uc = owned[idx - 1];
      }
    }
    if (uc) {
      const card = CARD_INDEX()[uc.cardId];
      const stat = await CardStat.findOne({ cardId: uc.cardId });
      const caption = buildCardDetailCaption(card, uc, stat, 'Collection');
      try {
        if (String(card.tier) === '6' || String(card.tier) === 'S') {
          const gifBuffer = await goService.convertCardImage(card.imageUrl);
          if (gifBuffer) {
            return await inst.sock_ref.sendMessage(chatId, { video: gifBuffer, gifPlayback: true, caption, mentions: [uc.userId] });
          }
        }
        const res = await axios.get(card.imageUrl, { responseType: 'arraybuffer' });
        return await inst.sock_ref.sendMessage(chatId, { image: Buffer.from(res.data), caption, mentions: [uc.userId] });
      } catch (e) { return reply(caption); }
    }
    return sendUsage(reply, `${p} coll`, `${p} coll [index or card_id]\n• Tier View: \`${p} coll --tier\``, `${p} coll 5`);
  }

  const owned = await UserCard.find({ userId: senderJid, inMainDeck: false, inCustomDeck: false, forSale: false }).sort({ createdAt: 1 });
  if (!owned.length) return reply('📭 Collection empty.');

  // Build flat list with simple style
  let msg = `🃏 *Collection*\n`;
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `📦 *Total:* ${owned.length}\n\n`;

  const lines = [];
  for (let i = 0; i < owned.length; i++) {
    const card = CARD_INDEX()[owned[i].cardId];
    if (card) {
      lines.push(`*#${i + 1} ➳ ${card.cardName}*`);
    }
  }

  // GIF generation for collection (Top 6 Highlights)
  const topCards = getTopCards(owned);
  const imageUrls = getTopImageUrls(topCards);
  if (imageUrls.length > 0) {
    const currentHash = getDeckHash(topCards);
    const cached = gifCache.collections.get(senderJid);
    
    let gifBuffer;
    if (cached && cached.hash === currentHash) {
        gifBuffer = cached.buffer;
    } else {
        gifBuffer = await goService.generateCardGif(imageUrls, "COLLECTION HIGHLIGHTS");
        if (gifBuffer) gifCache.collections.set(senderJid, { hash: currentHash, buffer: gifBuffer });
    }

    if (gifBuffer) {
      // Send first page with GIF
      const firstChunk = msg + lines.slice(0, 100).join('\n') + `\n\n*[Use ${p} coll <card_index> to see more detail]*`;
      await inst.sock_ref.sendMessage(chatId, { 
          video: gifBuffer, 
          gifPlayback: true, 
          caption: firstChunk 
      });
      
      if (lines.length > 100) {
        for (let s = 100; s < lines.length; s += 100) {
          await reply(lines.slice(s, s + 100).join('\n'));
        }
      }
      return;
    }
  }

  // Fallback text-only pagination
  for (let s = 0; s < lines.length; s += 100) {
    let chunk = (s === 0 ? msg : '') + lines.slice(s, s + 100).join('\n');
    if (s + 100 >= lines.length) {
       chunk += `\n\n*[Use ${p} coll <card_index> to see more detail]*`;
    }
    await reply(chunk);
  }
}

async function cmdDeck(senderJid, reply, chatId, args = []) {
  const inst = getInst();
  const p = P();
  
  if (args.length > 0) {
    const slot = parseInt(args[0]);
    if (!isNaN(slot)) {
        const uc = await UserCard.findOne({ userId: senderJid, inMainDeck: true, mainDeckSlot: slot });
        if (uc) {
            const card = CARD_INDEX()[uc.cardId];
            const stat = await CardStat.findOne({ cardId: uc.cardId });
            const caption = buildCardDetailCaption(card, uc, stat, 'Main Deck', slot);
            try {
                if (String(card.tier) === '6' || String(card.tier) === 'S') {
                    const gifBuffer = await goService.convertCardImage(card.imageUrl);
                    if (gifBuffer) {
                        return await inst.sock_ref.sendMessage(chatId, { video: gifBuffer, gifPlayback: true, caption, mentions: [uc.userId] });
                    }
                }
                const res = await axios.get(card.imageUrl, { responseType: 'arraybuffer' });
                return await inst.sock_ref.sendMessage(chatId, { image: Buffer.from(res.data), caption, mentions: [uc.userId] });
            } catch (e) { return reply(caption); }
        }
    }
    return sendUsage(reply, `${p} deck`, `${p} deck [slot_number]`, `${p} deck 1`);
  }

  const deck = await UserCard.find({ userId: senderJid, inMainDeck: true }).sort({ mainDeckSlot: 1 });
  if (!deck.length) return reply('📭 Main Deck is empty.');

  // Build requested template
  let msg = `🎴 *Main Deck* 🎴\n`;
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `📦 *Total:* ${deck.length}\n\n`;
  
  const lines = deck.map(uc => {
    const card = CARD_INDEX()[uc.cardId];
    const name = card ? card.cardName : 'Unknown';
    const tier = card ? String(card.tier) : '?';
    return `🔹 *#${uc.mainDeckSlot}*\n   🃏 *Name:* ${name}\n   ✨ *Tier:* ${tier}\n━━━━━━━━━━━━━━━`;
  });
  
  msg += lines.join('\n');
  msg += `\n\n*[Use ${p} deck <card_index> to see more detail about this card]*`;

  // GIF generation for deck (Top 6)
  const topCards = getTopCards(deck);
  const imageUrls = getTopImageUrls(topCards);
  if (imageUrls.length > 0) {
    const currentHash = getDeckHash(topCards);
    const cached = gifCache.decks.get(`${senderJid}_main`);
    
    let gifBuffer;
    if (cached && cached.hash === currentHash) {
        gifBuffer = cached.buffer;
    } else {
        gifBuffer = await goService.generateCardGif(imageUrls, "DECK HIGHLIGHTS");
        if (gifBuffer) gifCache.decks.set(`${senderJid}_main`, { hash: currentHash, buffer: gifBuffer });
    }

    if (gifBuffer) {
        return await inst.sock_ref.sendMessage(chatId, { 
            video: gifBuffer, 
            gifPlayback: true, 
            caption: msg 
        });
    }
  }

  return reply(msg);
}

async function cmdScc(senderJid, reply, chatId, args = []) {
  const inst = getInst();
  const animeQuery = args.join(' ').toLowerCase().trim();
  if (!animeQuery) return sendUsage(reply, `${P()} scc`, `${P()} scc <anime_name>`, `${P()} scc dragon ball`);

  const owned = await UserCard.find({ userId: senderJid }).sort({ createdAt: 1 });
  const filtered = owned.filter(uc => {
    const card = CARD_INDEX()[uc.cardId];
    return card?.animeName.toLowerCase().includes(animeQuery);
  });

  if (!filtered.length) return reply(`📭 No cards found for anime: *${animeQuery}*`);

  let msg = `🃏 *Owned | ${animeQuery.toUpperCase()}*\n`;
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `📦 *Total:* ${filtered.length}\n\n`;

  const lines = filtered.map((uc, i) => {
    const card = CARD_INDEX()[uc.cardId];
    return `🔹 *#${i + 1}*\n   🃏 *Name:* ${card.cardName}\n   ✨ *Tier:* ${card.tier}\n━━━━━━━━━━━━━━━`;
  });

  return reply(msg + lines.slice(0, 100).join('\n'));
}

async function cmdMaker(senderJid, reply, chatId, args = []) {
  const inst = getInst();
  const makerQuery = args.join(' ').replace(/["']/g, '').toLowerCase().trim();
  if (!makerQuery) return sendUsage(reply, `${P()} maker`, `${P()} maker "<maker_name>"`, `${P()} maker Mah_xee`);

  const owned = await UserCard.find({ userId: senderJid }).sort({ createdAt: 1 });
  const filtered = owned.filter(uc => {
    const card = CARD_INDEX()[uc.cardId];
    return card?.creator?.toLowerCase().includes(makerQuery);
  });

  if (!filtered.length) return reply(`📭 No owned cards found by maker: *${makerQuery}*`);

  const tiers = { 'S': [], '6': [], '5': [], '4': [], '3': [], '2': [], '1': [] };
  const tierEmoji = { 'S': '👑', '6': '💎', '5': '✨', '4': '🎗', '3': '🔮', '2': '🌈', '1': '🎴' };

  filtered.forEach(uc => {
    const card = CARD_INDEX()[uc.cardId];
    if (card) tiers[String(card.tier)].push(card.cardName);
  });

  let msg = `🎨 *Cards | Made by ${makerQuery}*\n\n`;
  for (const t of ['S', '6', '5', '4', '3', '2', '1']) {
    if (tiers[t].length > 0) {
      msg += `${tierEmoji[t]} *Tier ${t}*\n`;
      tiers[t].forEach((name, i) => {
        msg += `🔹 *#${i + 1} ➳ ${name}*\n`;
      });
      msg += `\n`;
    }
  }

  return reply(msg);
}

async function cmdBurn(senderJid, reply, chatId, args = []) {
  const inst = getInst();
  const index = parseInt(args[0]);
  if (isNaN(index)) return sendUsage(reply, `${P()} burn`, `${P()} burn <coll_index>`, `${P()} burn 12`);

  const owned = await UserCard.find({ userId: senderJid, inMainDeck: false, inCustomDeck: false, forSale: false }).sort({ createdAt: 1 });
  const uc = owned[index - 1];
  if (!uc) return reply('❌ Card not found in your collection.');

  const card = CARD_INDEX()[uc.cardId];
  const p = P();

  // Show burning preview
  const gifBuffer = await goService.generateBurnGif(card.imageUrl);
  const caption = `🔥 *BURN CONFIRMATION* 🔥\n\n` +
    `🃏 *Card:* ${card.cardName} (${card.tier})\n` +
    `🆔 *ID:* \`${uc.cardId}\`\n\n` +
    `⚠️ *WARNING:* This will delete the card forever!\n` +
    `Are you sure? Type \`${p} accept\` to confirm or \`${p} decline\` to cancel.`;

  if (gifBuffer) {
    await inst.sock_ref.sendMessage(chatId, { video: gifBuffer, gifPlayback: true, caption });
  } else {
    await reply(caption);
  }

  inst.pendingBurns.set(`${chatId}_${senderJid}`, { ucId: uc._id, cardName: card.cardName });
}

async function cmdAccept(senderJid, reply, chatId) {
  const inst = getInst();
  const key = `${chatId}_${senderJid}`;
  const pending = inst.pendingBurns.get(key);
  if (!pending) return false;

  try {
    await UserCard.findByIdAndDelete(pending.ucId);
    inst.pendingBurns.delete(key);
    await reply(`🔥 *ASHES TO ASHES...*\n\n*${pending.cardName}* has been deleted from your collection forever.`);
    return true;
  } catch (err) {
    await reply('❌ Failed to delete card.');
    return true;
  }
}

async function cmdDecline(senderJid, reply, chatId) {
  const inst = getInst();
  const key = `${chatId}_${senderJid}`;
  if (inst.pendingBurns.has(key)) {
    inst.pendingBurns.delete(key);
    await reply('✅ *Burn cancelled.* Your card is safe... for now.');
    return true;
  }
  return false;
}

async function cmdCltr(reply, chatId, args = []) {
  const p = P();
  const query = args.join(' ').toLowerCase().trim();
  if (!query) {
    return sendUsage(reply, `${p} cltr`, `${p} cltr <series_name>`, `${p} cltr fullmetal`);
  }

  try {
    // 1. Find all cards in this series
    const seriesCards = ALL_CARDS().filter(c => c.animeName.toLowerCase().includes(query));
    if (seriesCards.length === 0) {
      return reply(`🔍 No cards found for series: *"${query}"*`);
    }

    const cardIds = seriesCards.map(c => c.id);

    // 2. Aggregate owners
    const collectors = await UserCard.aggregate([
      { $match: { cardId: { $in: cardIds } } },
      { $group: { _id: "$userId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    if (collectors.length === 0) {
      return reply(`📭 No one owns any cards from *"${query}"* yet.`);
    }

    // 3. Format Message
    const topSeriesName = seriesCards[0].animeName;
    let msg = `👑 *Top ${topSeriesName} Collectors* 👑\n\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    const medals = ['🥇', '🥈', '🥉'];
    const mentions = [];

    collectors.forEach((col, i) => {
      const emoji = medals[i] || '🔹';
      msg += `${emoji} *${i + 1}. @${col._id.split('@')[0]}*\n`;
      msg += `   📊 ${col.count} card(s)\n\n`;
      mentions.push(col._id);
    });

    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🔍 Searched: "${query}"`;

    return reply(msg, { mentions });
  } catch (err) {
    console.error('[Cltr] Error:', err);
    return reply('❌ Failed to fetch top collectors.');
  }
}

async function cmdEScc(reply, args = []) {
  const p = P();
  const query = args.join(' ').toLowerCase().trim();
  if (!query) return sendUsage(reply, `${p} escc`, `${p} escc <series_name>`, `${p} escc fullmetal`);

  const matches = ALL_CARDS().filter(c => c.animeName.toLowerCase().includes(query) && c.tier === 'S');
  if (matches.length === 0) return reply(`🔍 No event (Tier S) cards found for series: *"${query}"*`);

  let msg = `✨ *Event Cards | ${matches[0].animeName.toUpperCase()}* ✨\n`;
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `📦 Found ${matches.length} matches:\n\n`;

  matches.forEach(c => {
    msg += `▫️ *${c.cardName}*\n   ➥ ID: \`${c.id}\`\n`;
  });

  return reply(msg);
}

async function cmdFc(senderJid, reply, args = []) {
  const p = P();
  const query = args.join(' ').toLowerCase().trim();
  if (!query) return sendUsage(reply, `${p} fc`, `${p} fc <card_name or id>`, `${p} fc goku`);

  // 1. Search Main Deck
  const deck = await UserCard.find({ userId: senderJid, inMainDeck: true }).sort({ mainDeckSlot: 1 });
  for (const uc of deck) {
    const card = CARD_INDEX()[uc.cardId];
    if (uc.cardId.toLowerCase() === query || card?.cardName.toLowerCase().includes(query)) {
      return reply(`📍 *Card Found!* \n\n🃏 *${card?.cardName}* (${card?.tier})\n🎴 Location: *Main Deck* (Slot #${uc.mainDeckSlot})`);
    }
  }

  // 2. Search Custom Decks
  const customDecks = await CardDeck.find({ userId: senderJid });
  for (const cd of customDecks) {
    for (let i = 0; i < cd.cards.length; i++) {
      const ucId = cd.cards[i];
      const uc = await UserCard.findById(ucId);
      if (uc) {
        const card = CARD_INDEX()[uc.cardId];
        if (uc.cardId.toLowerCase() === query || card?.cardName.toLowerCase().includes(query)) {
          return reply(`📍 *Card Found!* \n\n🃏 *${card?.cardName}* (${card?.tier})\n📁 Location: *Deck: ${cd.name}* (Slot #${i + 1})`);
        }
      }
    }
  }

  // 3. Search Collection
  const owned = await UserCard.find({ userId: senderJid, inMainDeck: false, inCustomDeck: false, forSale: false }).sort({ createdAt: 1 });
  for (let i = 0; i < owned.length; i++) {
    const uc = owned[i];
    const card = CARD_INDEX()[uc.cardId];
    if (uc.cardId.toLowerCase() === query || card?.cardName.toLowerCase().includes(query)) {
      return reply(`📍 *Card Found!* \n\n🃏 *${card?.cardName}* (${card?.tier})\n📦 Location: *Collection* (Index #${i + 1})`);
    }
  }

  return reply(`❌ Card *"${query}"* not found in your decks or collection.`);
}

async function cmdInfo(reply, chatId, args = []) {
  const p = P();
  const query = args.join(' ').toLowerCase().trim();
  if (!query) return sendUsage(reply, `${p} info`, `${p} info <card_name or id>`, `${p} info goku`);

  // Exact ID check first
  const exact = CARD_INDEX()[query];
  if (exact) {
    const stat = await CardStat.findOne({ cardId: exact.id });
    const caption = buildCardDetailCaption(exact, null, stat, 'Global Database');
    try {
      if (String(exact.tier) === '6' || String(exact.tier) === 'S') {
        const gifBuffer = await goService.convertCardImage(exact.imageUrl);
        if (gifBuffer) {
          return await getInst().sock_ref.sendMessage(chatId, { video: gifBuffer, gifPlayback: true, caption });
        }
      }
      const res = await axios.get(exact.imageUrl, { responseType: 'arraybuffer' });
      return await getInst().sock_ref.sendMessage(chatId, { image: Buffer.from(res.data), caption });
    } catch (e) { return reply(caption); }
  }

  // Partial name search
  const matches = ALL_CARDS().filter(c => c.cardName.toLowerCase().includes(query));
  
  if (matches.length === 0) return reply(`❌ Card not found: *"${query}"*`);
  
  if (matches.length === 1) {
    const card = matches[0];
    const stat = await CardStat.findOne({ cardId: card.id });
    const caption = buildCardDetailCaption(card, null, stat, 'Global Database');
    try {
      if (String(card.tier) === '6' || String(card.tier) === 'S') {
        const gifBuffer = await goService.convertCardImage(card.imageUrl);
        if (gifBuffer) {
          return await getInst().sock_ref.sendMessage(chatId, { video: gifBuffer, gifPlayback: true, caption });
        }
      }
      const res = await axios.get(card.imageUrl, { responseType: 'arraybuffer' });
      return await getInst().sock_ref.sendMessage(chatId, { image: Buffer.from(res.data), caption });
    } catch (e) { return reply(caption); }
  }

  // Multiple matches
  let msg = `🔍 *Search Results for "${query}"*\n`;
  msg += `📦 Found ${matches.length} matches. Showing top 15:\n\n`;
  
  matches.slice(0, 15).forEach(c => {
    msg += `▫️ *${c.cardName}* (${c.tier})\n   ➥ ID: \`${c.id}\` | Series: _${c.animeName}_\n`;
  });

  msg += `\n💡 Use \`${p} info <id>\` to see full details.`;
  return reply(msg);
}

async function cmdT2Deck(senderJid, reply, args = []) {
  const p = P();
  const index = parseInt(args[0]);
  if (isNaN(index)) return sendUsage(reply, `${p} t2deck`, `${p} t2deck <coll_index>`, `${p} t2deck 1`);

  const owned = await UserCard.find({ userId: senderJid, inMainDeck: false, inCustomDeck: false, forSale: false }).sort({ createdAt: 1 });
  const uc = owned[index - 1];
  if (!uc) return reply('❌ Card not found in your collection.');

  // Find next available slot
  const deck = await UserCard.find({ userId: senderJid, inMainDeck: true }).sort({ mainDeckSlot: 1 });
  if (deck.length >= MAIN_DECK_SIZE) return reply(`❌ Your main deck is full (${MAIN_DECK_SIZE}/12)! Move a card to collection first.`);

  const usedSlots = deck.map(d => d.mainDeckSlot);
  let slot = 1;
  while (usedSlots.includes(slot)) slot++;

  uc.inMainDeck = true;
  uc.mainDeckSlot = slot;
  await uc.save();

  const card = CARD_INDEX()[uc.cardId];
  return reply(`✅ *${card.cardName}* moved to main deck (Slot #${slot}).`);
}

async function cmdT2CDeck(senderJid, reply, args = []) {
  const p = P();
  const index = parseInt(args[0]);
  const deckNameQuery = args.slice(1).join(' ').trim();

  if (isNaN(index) || !deckNameQuery) {
    return sendUsage(reply, `${p} t2cdeck`, `${p} t2cdeck <coll_index> <deck_name>`, `${p} t2cdeck 1 Waifus`);
  }

  const owned = await UserCard.find({ userId: senderJid, inMainDeck: false, inCustomDeck: false, forSale: false }).sort({ createdAt: 1 });
  const uc = owned[index - 1];
  if (!uc) return reply('❌ Card not found in your collection.');

  // Fuzzy match deck name
  const decks = await CardDeck.find({ userId: senderJid });
  if (decks.length === 0) return reply('❌ You have no custom decks. Create one first!');

  let targetDeck = decks.find(d => d.name.toLowerCase() === deckNameQuery.toLowerCase());
  if (!targetDeck) {
    // Try includes
    targetDeck = decks.find(d => d.name.toLowerCase().includes(deckNameQuery.toLowerCase()));
  }

  if (!targetDeck) return reply(`❌ Custom deck *"${deckNameQuery}"* not found.`);

  uc.inCustomDeck = true;
  uc.customDeckName = targetDeck.name;
  uc.customDeckSlot = targetDeck.cards.length + 1;
  await uc.save();

  targetDeck.cards.push(uc._id);
  await targetDeck.save();

  const card = CARD_INDEX()[uc.cardId];
  return reply(`✅ *${card.cardName}* moved to custom deck *"${targetDeck.name}"* (Slot #${uc.customDeckSlot}).`);
}

async function cmdEShop(senderJid, reply, chatId, args = [], isMod = false) {
  const p = P();
  const sub = args[0]?.toLowerCase();

  if (sub === 'sell') {
    const deckName = args[1];
    const price = parseInt(args[2]);
    if (!deckName || isNaN(price) || price < 1) {
      return sendUsage(reply, `${p} eshop sell`, `${p} eshop sell <deck_name> <price>`, `${p} eshop sell Waifus 50000`);
    }

    const deck = await CardDeck.findOne({ userId: senderJid, name: { $regex: new RegExp(`^${deckName}$`, 'i') } });
    if (!deck) return reply(`❌ Custom deck *"${deckName}"* not found.`);
    if (deck.cards.length === 0) return reply('❌ You cannot sell an empty deck!');

    try {
      await CardMarket.create({
        deckId: deck._id,
        deckName: deck.name,
        sellerId: senderJid,
        type: 'sale',
        price: price,
        isDeck: true,
        status: 'pending_approval',
        approvalStatus: 'pending'
      });
      return reply(`📦 *LISTING SUBMITTED!*\n\nYour deck *"${deck.name}"* has been submitted for approval.\n💰 Requested Price: ${ZENI()}${price.toLocaleString()}\n💡 A Card Moderator will review it soon.`);
    } catch (err) { return reply('❌ Failed to submit listing.'); }
  }

  if (sub === 'approve' || sub === 'reject') {
    if (!isMod) return reply('❌ Mod only.');
    const id = args[1];
    if (!id) return reply(`❌ Usage: \`${p} eshop ${sub} <listing_id>\``);

    try {
      const listing = await CardMarket.findById(id);
      if (!listing || !listing.isDeck) return reply('❌ Listing not found.');
      
      if (sub === 'approve') {
        listing.status = 'active';
        listing.approvalStatus = 'approved';
        await listing.save();
        return reply(`✅ Approved deck listing *#${id}*. It is now live in the E-Shop!`);
      } else {
        listing.status = 'cancelled';
        listing.approvalStatus = 'rejected';
        await listing.save();
        return reply(`❌ Rejected deck listing *#${id}*.`);
      }
    } catch (err) { return reply('❌ Operation failed.'); }
  }

  if (sub === 'pending') {
    if (!isMod) return reply('❌ Mod only.');
    const pending = await CardMarket.find({ status: 'pending_approval', isDeck: true });
    if (pending.length === 0) return reply('📭 No pending deck approvals.');

    let msg = `📋 *PENDING DECK APPROVALS*\n\n`;
    pending.forEach(l => {
      msg += `🆔 ID: \`${l._id}\`\n`;
      msg += `📂 Deck: *${l.deckName}*\n`;
      msg += `👤 Seller: @${l.sellerId.split('@')[0]}\n`;
      msg += `💰 Price: ${ZENI()}${l.price.toLocaleString()}\n`;
      msg += `━━━━━━━━━━━━━━━\n`;
    });
    msg += `💡 Use \`${p} eshop approve/reject <id>\``;
    return reply(msg, { mentions: pending.map(l => l.sellerId) });
  }

  if (sub === 'buy') {
    const index = parseInt(args[1]);
    if (isNaN(index)) return sendUsage(reply, `${p} eshop buy`, `${p} eshop buy <number>`, `${p} eshop buy 1`);

    const active = await CardMarket.find({ status: 'active', isDeck: true }).sort({ listedAt: -1 });
    const listing = active[index - 1];
    if (!listing) return reply('❌ Invalid listing number.');

    if (listing.sellerId === senderJid) return reply('❌ You cannot buy your own deck.');

    const balance = economy.getBalance(senderJid);
    if (balance < listing.price) return reply(`❌ Insufficient funds! You need ${ZENI()}${listing.price.toLocaleString()}.`);

    try {
      // Transfer Funds
      economy.removeMoney(senderJid, listing.price);
      economy.addMoney(listing.sellerId, listing.price);

      // Transfer Deck & Cards
      const deck = await CardDeck.findById(listing.deckId);
      if (deck) {
        deck.userId = senderJid;
        await deck.save();
        await UserCard.updateMany({ _id: { $in: deck.cards } }, { userId: senderJid });
      }

      listing.status = 'sold';
      listing.completedAt = new Date();
      await listing.save();

      return reply(`🎉 *CONGRATULATIONS!*\n\nYou bought the deck *"${listing.deckName}"* for ${ZENI()}${listing.price.toLocaleString()}!`);
    } catch (err) { return reply('❌ Purchase failed.'); }
  }

  // Default: List Shop
  const active = await CardMarket.find({ status: 'active', isDeck: true }).sort({ listedAt: -1 });
  if (active.length === 0) return reply('📭 The E-Shop is currently empty. Sell your decks with `.eshop sell <name> <price>`.');

  let msg = `🏬 *CARD DECK E-SHOP* 🏬\n\n`;
  active.forEach((l, i) => {
    msg += `*${i + 1}.* 📂 *${l.deckName}*\n`;
    msg += `   💰 Price: ${ZENI()}${l.price.toLocaleString()}\n`;
    msg += `   👤 Seller: @${l.sellerId.split('@')[0]}\n\n`;
  });
  msg += `💡 Use \`${p} eshop buy <number>\` to purchase.`;
  return reply(msg, { mentions: active.map(l => l.sellerId) });
}

async function cmdT2CDeck(senderJid, reply, args = []) {
  const p = P();
  const index = parseInt(args[0]);
  const deckNameQuery = args.slice(1).join(' ').trim();

  if (isNaN(index) || !deckNameQuery) {
    return sendUsage(reply, `${p} t2cdeck`, `${p} t2cdeck <coll_index> <deck_name>`, `${p} t2cdeck 1 Waifus`);
  }

  const owned = await UserCard.find({ userId: senderJid, inMainDeck: false, inCustomDeck: false, forSale: false }).sort({ createdAt: 1 });
  const uc = owned[index - 1];
  if (!uc) return reply('❌ Card not found in your collection.');

  // Fuzzy match deck name
  const decks = await CardDeck.find({ userId: senderJid });
  if (decks.length === 0) return reply('❌ You have no custom decks. Create one first!');

  let targetDeck = decks.find(d => d.name.toLowerCase() === deckNameQuery.toLowerCase());
  if (!targetDeck) {
    // Try includes
    targetDeck = decks.find(d => d.name.toLowerCase().includes(deckNameQuery.toLowerCase()));
  }

  if (!targetDeck) return reply(`❌ Custom deck *"${deckNameQuery}"* not found.`);

  uc.inCustomDeck = true;
  uc.customDeckName = targetDeck.name;
  uc.customDeckSlot = targetDeck.cards.length + 1;
  await uc.save();

  targetDeck.cards.push(uc._id);
  await targetDeck.save();

  const card = CARD_INDEX()[uc.cardId];
  return reply(`✅ *${card.cardName}* moved to custom deck *"${targetDeck.name}"* (Slot #${uc.customDeckSlot}).`);
}

async function cmdT2Coll(senderJid, reply, args = []) {
  const p = P();
  const slot = parseInt(args[0]);
  if (isNaN(slot)) return sendUsage(reply, `${p} t2coll`, `${p} t2coll <deck_slot>`, `${p} t2coll 1`);

  const uc = await UserCard.findOne({ userId: senderJid, inMainDeck: true, mainDeckSlot: slot });
  if (!uc) return reply(`❌ No card in deck slot #${slot}.`);

  uc.inMainDeck = false;
  uc.mainDeckSlot = null;
  await uc.save();

  const card = CARD_INDEX()[uc.cardId];
  return reply(`✅ *${card.cardName}* moved back to collection.`);
}

async function cmdSwapCard(senderJid, reply, args = []) {
  const p = P();
  // Support ".j swap card 1 and 2" or ".j swap 1 2"
  let a, b;
  if (args[0] === 'card') {
    a = parseInt(args[1]);
    b = parseInt(args[3]);
  } else {
    a = parseInt(args[0]);
    b = parseInt(args[1]);
  }

  if (isNaN(a) || isNaN(b)) return sendUsage(reply, `${p} swap card`, `${p} swap card <a> and <b>`, `${p} swap card 1 and 2`);

  const cardA = await UserCard.findOne({ userId: senderJid, inMainDeck: true, mainDeckSlot: a });
  const cardB = await UserCard.findOne({ userId: senderJid, inMainDeck: true, mainDeckSlot: b });

  if (!cardA && !cardB) return reply('❌ Both slots are empty.');

  if (cardA) cardA.mainDeckSlot = b;
  if (cardB) cardB.mainDeckSlot = a;

  if (cardA) await cardA.save();
  if (cardB) await cardB.save();

  return reply(`✅ Swapped Slot #${a} and Slot #${b}.`);
}

async function cmdCG(senderJid, reply, args = [], m) {
  const p = P();
  // Usage: .cg @user <index> [Deck]
  const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  if (mentioned.length === 0) return sendUsage(reply, `${p} cg`, `${p} cg @user <index> [Deck]`, `${p} cg @user 5`);

  const targetJid = mentioned[0];
  const isFromDeck = args.some(a => a.toLowerCase() === 'deck');
  const indexStr = args.find(a => !isNaN(parseInt(a)));
  const index = parseInt(indexStr);

  if (isNaN(index)) return sendUsage(reply, `${p} cg`, `${p} cg @user <index> [Deck]`, `${p} cg @user 1`);

  let uc;
  if (isFromDeck) {
    uc = await UserCard.findOne({ userId: senderJid, inMainDeck: true, mainDeckSlot: index });
  } else {
    const owned = await UserCard.find({ userId: senderJid, inMainDeck: false, inCustomDeck: false, forSale: false }).sort({ createdAt: 1 });
    uc = owned[index - 1];
  }

  if (!uc) return reply(`❌ Card not found in your ${isFromDeck ? 'deck' : 'collection'}.`);
  if (uc.isLocked) return reply('❌ This card is locked!');

  uc.userId = targetJid;
  uc.inMainDeck = false;
  uc.mainDeckSlot = null;
  await uc.save();

  const card = CARD_INDEX()[uc.cardId];
  return reply(`🎁 *GIFT SENT!*\n\n@${senderJid.split('@')[0]} gave *${card.cardName}* to @${targetJid.split('@')[0]}!`, { mentions: [senderJid, targetJid] });
}

async function cmdCS(reply, args = []) {
  const p = P();
  if (args.length === 0) return sendUsage(reply, `${p} cs`, `${p} cs <name or series> [tier n]`, `${p} cs goku tier S`);

  let tierFilter = null;
  const tierIdx = args.findIndex(a => a.toLowerCase() === 'tier');
  if (tierIdx !== -1 && args[tierIdx + 1]) {
    tierFilter = args[tierIdx + 1].toUpperCase();
    args.splice(tierIdx, 2);
  }

  const query = args.join(' ').toLowerCase().trim();
  let matches = ALL_CARDS().filter(c => 
    c.cardName.toLowerCase().includes(query) || 
    c.animeName.toLowerCase().includes(query) ||
    c.id.toLowerCase() === query
  );

  if (tierFilter) {
    matches = matches.filter(c => String(c.tier) === tierFilter);
  }
  
  const totalFound = matches.length;
  matches = matches.slice(0, 15);

  if (matches.length === 0) return reply(`🔍 No cards found matching *"${query}"*${tierFilter ? ` in Tier ${tierFilter}` : ''}`);

  let msg = `🔍 *Search Results for "${query}"*${tierFilter ? ` (Tier ${tierFilter})` : ''}\n`;
  msg += `📦 Found ${totalFound} matches. Showing top 15:\n\n`;
  
  matches.forEach(c => {
    msg += `▫️ *${c.cardName}* (${c.tier})\n   ➥ ID: \`${c.id}\` | Series: _${c.animeName}_\n`;
  });

  return reply(msg);
}

async function cmdBuyCard(senderJid, reply, args = []) {
  const p = P();
  const inst = getInst();
  
  if (args.length > 0) {
    const index = parseInt(args[0]);
    if (!isNaN(index)) {
        const active = await CardMarket.find({ status: 'active', type: 'sale' }).sort({ listedAt: -1 });
        const listing = active[index - 1];
        if (!listing) return reply('❌ Invalid listing number.');

        if (listing.sellerId === senderJid) return reply('❌ You cannot buy your own card.');

        const balance = economy.getBalance(senderJid);
        if (balance < listing.price) return reply(`❌ Insufficient funds! You need ${ZENI()}${listing.price.toLocaleString()}.`);

        try {
            economy.removeMoney(senderJid, listing.price);
            economy.addMoney(listing.sellerId, listing.price);
            await UserCard.findByIdAndUpdate(listing.userCardId, { userId: senderJid, forSale: false, salePrice: null });
            listing.status = 'sold';
            listing.completedAt = new Date();
            await listing.save();
            const card = CARD_INDEX()[listing.cardId];
            return reply(`✅ *PURCHASE COMPLETE!*\n\nYou bought *${card.cardName}* for ${ZENI()}${listing.price.toLocaleString()}.`);
        } catch (err) { return reply('❌ Purchase failed.'); }
    }
  }

  const active = await CardMarket.find({ status: 'active', type: 'sale' }).sort({ listedAt: -1 }).limit(10);
  if (active.length === 0) return reply('📭 No cards currently listed for sale.');

  let msg = `🛒 *CARD MARKET | SALE LISTINGS*\n\n`;
  active.forEach((l, i) => {
    const card = CARD_INDEX()[l.cardId];
    msg += `*${i + 1}.* ${card?.cardName || 'Unknown'} (${card?.tier || '?'})\n`;
    msg += `   💰 Price: ${ZENI()}${l.price.toLocaleString()}\n`;
    msg += `   👤 Seller: @${l.sellerId.split('@')[0]}\n\n`;
  });

  msg += `💡 Use \`${p} buycard <number>\` to purchase.`;
  return reply(msg, { mentions: active.map(l => l.sellerId) });
}

async function cmdSC(senderJid, reply, args = []) {
  const p = P();
  const slot = parseInt(args[0]);
  const price = parseInt(args[1]);

  if (isNaN(slot) || isNaN(price) || price < 1) return sendUsage(reply, `${p} sc`, `${p} sc <deck_slot> <price>`, `${p} sc 1 5000`);

  const uc = await UserCard.findOne({ userId: senderJid, inMainDeck: true, mainDeckSlot: slot });
  if (!uc) return reply(`❌ No card in deck slot #${slot}.`);
  if (uc.isLocked) return reply('❌ This card is locked! Unlock it first.');

  try {
    uc.forSale = true;
    uc.salePrice = price;
    await uc.save();
    await CardMarket.create({
        userCardId: uc._id,
        cardId: uc.cardId,
        sellerId: senderJid,
        type: 'sale',
        price: price,
        status: 'active'
    });
    const card = CARD_INDEX()[uc.cardId];
    return reply(`🛒 *LISTED FOR SALE!*\n\n*${card.cardName}* has been listed for ${ZENI()}${price.toLocaleString()}.`);
  } catch (err) { return reply('❌ Listing failed.'); }
}

async function cmdLock(senderJid, reply, args = []) {
  const p = P();
  const input = args[0];
  if (!input) return sendUsage(reply, `${p} lock`, `${p} lock <deck_slot or card_id>`, `${p} lock 1`);

  let uc;
  const slot = parseInt(input);
  if (!isNaN(slot)) {
    uc = await UserCard.findOne({ userId: senderJid, inMainDeck: true, mainDeckSlot: slot });
  } else {
    uc = await UserCard.findOne({ userId: senderJid, cardId: input });
  }

  if (!uc) return reply('❌ Card not found.');

  uc.isLocked = !uc.isLocked;
  await uc.save();

  const card = CARD_INDEX()[uc.cardId];
  return reply(`🔒 *${card.cardName}* is now ${uc.isLocked ? 'LOCKED' : 'UNLOCKED'}.`);
}

async function cmdMerge(senderJid, reply, args = []) {
  const p = P();
  const query = args.join('').trim();
  if (!query) return sendUsage(reply, `${p} merge`, `${p} merge <card_id>`, `${p} merge 3-04521`);

  const owned = await UserCard.find({ userId: senderJid, cardId: query, inMainDeck: false, forSale: false, isLocked: false });
  if (owned.length < 2) return reply(`❌ You need at least 2 unlocked copies of \`${query}\` in your collection to merge.`);

  try {
    const toDelete = owned[0];
    await UserCard.findByIdAndDelete(toDelete._id);
    const reward = 500;
    economy.addMoney(senderJid, reward);
    const card = CARD_INDEX()[query];
    return reply(`🧬 *MERGE SUCCESSFUL!*\n\nMerged 2 copies of *${card?.cardName || query}*.\n💰 Reward: ${ZENI()}${reward.toLocaleString()} Zeni`);
  } catch (err) { return reply('❌ Merge failed.'); }
}

async function cmdMergeAll(senderJid, reply) {
  try {
    const owned = await UserCard.find({ userId: senderJid, inMainDeck: false, forSale: false, isLocked: false });
    const groups = {};
    owned.forEach(uc => {
      if (!groups[uc.cardId]) groups[uc.cardId] = [];
      groups[uc.cardId].push(uc);
    });

    let totalMerged = 0;
    let totalReward = 0;

    for (const cardId in groups) {
      const list = groups[cardId];
      if (list.length >= 2) {
        const toDeleteCount = list.length - 1;
        for (let i = 0; i < toDeleteCount; i++) {
          await UserCard.findByIdAndDelete(list[i]._id);
          totalMerged++;
          totalReward += 500;
        }
      }
    }

    if (totalMerged === 0) return reply('✨ No duplicates found to merge.');

    economy.addMoney(senderJid, totalReward);
    return reply(`🧬 *MASS MERGE COMPLETE!*\n\nMerged ${totalMerged} duplicate cards.\n💰 Total Reward: ${ZENI()}${totalReward.toLocaleString()} Zeni`);
  } catch (err) { return reply('❌ Mass merge failed.'); }
}

async function cmdListDecks(senderJid, reply) {
  const decks = await CardDeck.find({ userId: senderJid });
  if (decks.length === 0) return reply('📭 You have no custom decks. Create one with `.create deck <name>`.');

  let msg = `📂 *YOUR CUSTOM DECKS*\n\n`;
  decks.forEach((d, i) => {
    msg += `*${i + 1}.* ${d.name} (${d.cards.length} cards)\n`;
  });

  return reply(msg);
}

async function cmdCreateDeck(senderJid, reply, args = [], isMod = false, m = {}) {
  const p = P();
  let name = args.join(' ').trim();
  let targetJid = senderJid;

  // Mod can create a deck for someone else by tagging them
  const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (isMod && mentioned) {
      targetJid = mentioned;
      name = args.filter(a => !a.includes('@')).join(' ').trim();
  }

  if (!name) return sendUsage(reply, `${p} create deck`, `${p} create deck <name> [@user]`, `${p} create deck Waifus`);

  try {
    await CardDeck.create({ userId: targetJid, name: name, cards: [] });
    return reply(`✅ Created custom deck *"${name}"*${targetJid !== senderJid ? ` for @${targetJid.split('@')[0]}` : ''}.`, { mentions: [targetJid] });
  } catch (err) {
    if (err.code === 11000) return reply(`❌ A deck with the name *"${name}"* already exists for this user.`);
    return reply('❌ Failed to create deck.');
  }
}

async function cmdCDeck(senderJid, reply, chatId, args = []) {
  const p = P();
  
  if (!args[0]) return sendUsage(reply, `${p} cdeck`, `${p} cdeck <name> [slot]`, `${p} cdeck <name> remove <slot>`);

  // Check for 'remove' subcommand
  // .j cdeck <name> remove <slot>
  const removeIndex = args.findIndex(a => a.toLowerCase() === 'remove');
  if (removeIndex !== -1 && args.length > removeIndex + 1) {
    const deckName = args.slice(0, removeIndex).join(' ').trim();
    const slot = parseInt(args[removeIndex + 1]);
    
    if (!deckName || isNaN(slot)) return reply(`❌ Usage: \`${p} cdeck <name> remove <slot>\``);
    
    const deck = await CardDeck.findOne({ userId: senderJid, name: { $regex: new RegExp(`^${deckName}$`, 'i') } });
    if (!deck) return reply(`❌ Custom deck *"${deckName}"* not found.`);
    
    const ucId = deck.cards[slot - 1];
    if (!ucId) return reply(`❌ No card in slot #${slot} of deck *"${deck.name}"*.`);
    
    const uc = await UserCard.findById(ucId);
    if (uc) {
      uc.inCustomDeck = false;
      uc.customDeckName = null;
      uc.customDeckSlot = null;
      await uc.save();
    }
    
    deck.cards.splice(slot - 1, 1);
    await deck.save();
    
    return reply(`✅ Removed card from slot #${slot} of deck *"${deck.name}"*. It has been returned to your collection.`);
  }

  // Try to parse slot if last arg is a number
  let slot = null;
  let name = args.join(' ').trim();
  
  if (args.length > 1) {
    const last = parseInt(args[args.length - 1]);
    if (!isNaN(last)) {
      slot = last;
      name = args.slice(0, -1).join(' ').trim();
    }
  }

  const deck = await CardDeck.findOne({ userId: senderJid, name: { $regex: new RegExp(`^${name}$`, 'i') } });
  if (!deck) return reply(`❌ Custom deck *"${name}"* not found.`);

  if (slot !== null) {
    const ucId = deck.cards[slot - 1];
    if (!ucId) return reply(`❌ No card in slot #${slot} of deck *"${name}"*.`);
    
    const uc = await UserCard.findById(ucId);
    if (uc) {
      const card = CARD_INDEX()[uc.cardId];
      const stat = await CardStat.findOne({ cardId: uc.cardId });
      const caption = buildCardDetailCaption(card, uc, stat, `Deck: ${deck.name}`, slot);
      try {
        if (String(card.tier) === '6' || String(card.tier) === 'S') {
          const gifBuffer = await goService.convertCardImage(card.imageUrl);
          if (gifBuffer) {
            return await getInst().sock_ref.sendMessage(chatId, { video: gifBuffer, gifPlayback: true, caption });
          }
        }
        const res = await axios.get(card.imageUrl, { responseType: 'arraybuffer' });
        return await getInst().sock_ref.sendMessage(chatId, { image: Buffer.from(res.data), caption });
      } catch (e) { return reply(caption); }
    }
  }

  if (deck.cards.length === 0) return reply(`📭 Custom deck *"${name}"* is empty.`);

  let msg = `📂 *CUSTOM DECK | ${deck.name.toUpperCase()}*\n\n`;
  const ownedCards = [];
  for (let i = 0; i < deck.cards.length; i++) {
    const uc = await UserCard.findById(deck.cards[i]);
    if (uc) {
      const card = CARD_INDEX()[uc.cardId];
      msg += `*${i + 1}.* ${card?.cardName || 'Unknown'} (${card?.tier || '?'})\n`;
      ownedCards.push(uc);
    }
  }
  msg += `\n💡 Use \`${p} cdeck ${deck.name} <slot>\` for details.`;

  // GIF generation for custom deck (Top 6)
  const topCards = getTopCards(ownedCards);
  const imageUrls = getTopImageUrls(topCards);
  if (imageUrls.length > 0) {
    const currentHash = getDeckHash(topCards);
    const cached = gifCache.decks.get(`${senderJid}_${deck.name}`);
    
    let gifBuffer;
    if (cached && cached.hash === currentHash) {
        gifBuffer = cached.buffer;
    } else {
        gifBuffer = await goService.generateCardGif(imageUrls, `DECK: ${deck.name.toUpperCase()}`);
        if (gifBuffer) gifCache.decks.set(`${senderJid}_${deck.name}`, { hash: currentHash, buffer: gifBuffer });
    }

    if (gifBuffer) {
        return await inst.sock_ref.sendMessage(chatId, { 
            video: gifBuffer, 
            gifPlayback: true, 
            caption: msg 
        });
    }
  }

  return reply(msg);
}

async function cmdRenameDeck(senderJid, reply, args = []) {
  const p = P();
  const raw = args.join(' ');
  const [oldName, newName] = raw.split('|').map(s => s.trim());
  if (!oldName || !newName) return sendUsage(reply, `${p} rename deck`, `${p} rename deck <old> | <new>`, `${p} rename deck Waifus | Best Waifus`);

  try {
    const deck = await CardDeck.findOne({ userId: senderJid, name: { $regex: new RegExp(`^${oldName}$`, 'i') } });
    if (!deck) return reply(`❌ Deck *"${oldName}"* not found.`);

    deck.name = newName;
    await deck.save();
    return reply(`✅ Deck renamed to *"${newName}"*.`);
  } catch (err) {
    if (err.code === 11000) return reply(`❌ A deck with the name *"${newName}"* already exists.`);
    return reply('❌ Rename failed.');
  }
}

async function cmdDeleteDeck(senderJid, reply, args = [], isMod = false, m = {}) {
  const p = P();
  let name = args.join(' ').trim();
  let targetJid = senderJid;

  // Mod can delete someone else's deck by tagging them
  const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (isMod && mentioned) {
      targetJid = mentioned;
      name = args.filter(a => !a.includes('@')).join(' ').trim();
  }

  if (!name) return sendUsage(reply, `${p} delete deck`, `${p} delete deck <name> [@user]`, `${p} delete deck MyDeck`);

  const deck = await CardDeck.findOne({ userId: targetJid, name: { $regex: new RegExp(`^${name}$`, 'i') } });
  if (!deck) return reply(`❌ Deck *"${name}"* not found ${targetJid !== senderJid ? `for @${targetJid.split('@')[0]}` : ''}.`, { mentions: [targetJid] });

  try {
    await UserCard.updateMany({ _id: { $in: deck.cards } }, { inCustomDeck: false, customDeckName: null, customDeckSlot: null });
    await CardDeck.findByIdAndDelete(deck._id);
    return reply(`🗑️ *DECK DELETED!*\n\nCustom deck *"${name}"* ${targetJid !== senderJid ? `belonging to @${targetJid.split('@')[0]}` : ''} has been removed. Cards returned to collection.`, { mentions: [targetJid] });
  } catch (err) { return reply('❌ Deletion failed.'); }
}

function parseDuration(str) {
  if (!str) return null;
  const match = str.match(/^(\d+)([mhd])$/i);
  if (!match) {
    const hours = parseInt(str);
    return isNaN(hours) ? null : hours * 60 * 60 * 1000;
  }
  const val = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case 'm': return val * 60 * 1000;
    case 'h': return val * 60 * 60 * 1000;
    case 'd': return val * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

async function cmdAuction(senderJid, reply, args = []) {
  const p = P();
  const slot = parseInt(args[0]);
  const minBid = parseInt(args[1]);
  const durationStr = args[2];
  const ms = parseDuration(durationStr);

  if (isNaN(slot) || isNaN(minBid) || !ms || ms < 60000 || ms > 7 * 24 * 60 * 60 * 1000) {
    return sendUsage(reply, `${p} auction`, `${p} auction <deck_slot> <min_bid> <duration>`, `${p} auction 1 1000 1d\n💡 Duration units: m (min), h (hour), d (day)`);
  }

  const uc = await UserCard.findOne({ userId: senderJid, inMainDeck: true, mainDeckSlot: slot });
  if (!uc) return reply(`❌ No card in deck slot #${slot}.`);
  if (uc.isLocked) return reply('❌ This card is locked!');

  try {
    uc.inAuction = true;
    await uc.save();
    const endsAt = new Date(Date.now() + ms);
    await CardMarket.create({
      userCardId: uc._id,
      cardId: uc.cardId,
      sellerId: senderJid,
      type: 'auction',
      price: minBid,
      currentBid: minBid,
      status: 'active',
      auctionEndsAt: endsAt
    });
    const card = CARD_INDEX()[uc.cardId];
    return reply(`🔨 *AUCTION STARTED!*\n\n*${card.cardName}* is up for bidding!\n💰 Min Bid: ${ZENI()}${minBid.toLocaleString()}\n⏳ Ends at: ${endsAt.toLocaleString()}`);
  } catch (err) { return reply('❌ Failed to start auction.'); }
}

async function cmdBid(senderJid, reply, args = []) {
  const p = P();
  const active = await CardMarket.find({ status: 'active', type: 'auction' }).sort({ auctionEndsAt: 1 });
  if (active.length === 0) return reply('📭 No active auctions.');

  if (args.length < 2) {
    let msg = `🔨 *LIVE CARD AUCTIONS*\n\n`;
    active.forEach((a, i) => {
      const card = CARD_INDEX()[a.cardId];
      msg += `*${i + 1}.* ${card?.cardName} (${card?.tier})\n`;
      msg += `   💰 Current: ${ZENI()}${a.currentBid.toLocaleString()}\n`;
      msg += `   👤 High Bidder: ${a.highBidderId ? '@'+a.highBidderId.split('@')[0] : 'None'}\n`;
      msg += `   ⏳ Ends: ${a.auctionEndsAt.toLocaleString()}\n\n`;
    });
    msg += `💡 Use \`${p} bid <number> <amount>\` to place a bid.`;
    return reply(msg, { mentions: active.map(a => a.highBidderId).filter(Boolean) });
  }

  const index = parseInt(args[0]);
  const amount = parseInt(args[1]);
  if (isNaN(index) || isNaN(amount)) return sendUsage(reply, `${p} bid`, `${p} bid <number> <amount>`, `${p} bid 1 5000`);

  const auction = active[index - 1];
  if (!auction) return reply('❌ Invalid auction number.');
  if (auction.sellerId === senderJid) return reply('❌ You cannot bid on your own auction.');
  if (amount <= auction.currentBid) return reply(`❌ Bid must be higher than ${ZENI()}${auction.currentBid.toLocaleString()}.`);

  const balance = economy.getBalance(senderJid);
  if (balance < amount) return reply(`❌ You don't have ${ZENI()}${amount.toLocaleString()}.`);

  try {
    auction.currentBid = amount;
    auction.highBidderId = senderJid;
    auction.bids.push({ bidderId: senderJid, amount, placedAt: new Date() });
    await auction.save();
    return reply(`✅ *BID PLACED!*\n\nYou are now the high bidder for *${CARD_INDEX()[auction.cardId]?.cardName}* at ${ZENI()}${amount.toLocaleString()}.`);
  } catch (err) { return reply('❌ Failed to place bid.'); }
}

// Finalize auctions
async function finalizeAuctions(sock) {
  const expired = await CardMarket.find({ status: 'active', type: 'auction', auctionEndsAt: { $lte: new Date() } });
  if (!Array.isArray(expired)) return;
  
  for (const a of expired) {
    try {
      if (a.highBidderId) {
        // Transfer Zeni
        economy.removeMoney(a.highBidderId, a.currentBid);
        economy.addMoney(a.sellerId, a.currentBid);

        // Transfer Card
        await UserCard.findByIdAndUpdate(a.userCardId, { userId: a.highBidderId, inAuction: false, inMainDeck: false, mainDeckSlot: null });
        
        a.status = 'sold';
      } else {
        // No bidders, return card
        await UserCard.findByIdAndUpdate(a.userCardId, { inAuction: false });
        a.status = 'expired';
      }
      a.completedAt = new Date();
      await a.save();
    } catch (err) { console.error('Finalize auction failed:', err); }
  }
}

// Start sweeper
setInterval(() => {
    const inst = Array.from(instances.values())[0]; // get first available sock for system task
    if (inst?.sock_ref) finalizeAuctions(inst.sock_ref);
}, 60000);

// ═══════════════════════════════════════════════════════════════════════════
//  SECTION 5 — ROUTER & INIT
// ═══════════════════════════════════════════════════════════════════════════

async function handleCommand({ lowerTxt, txt, senderJid, chatId, m, economy, isOwner, senderIsAdmin, isMod }) {
  const inst = getInst();
  if (!inst.sock_ref) return false;

  const reply = (text, options = {}) => inst.sock_ref.sendMessage(chatId, { text, ...options });
  const p = P();
  
  // STRICT PREFIX CHECK
  if (!lowerTxt.startsWith(p)) {
    return false;
  }

  const parts = txt.trim().split(/\s+/);
  const firstWord = parts[0].toLowerCase();
  const cmd = firstWord === p ? parts[1]?.toLowerCase() : firstWord.slice(p.length);
  const args = firstWord === p ? parts.slice(2) : parts.slice(1);

  if (!cmd) return false;

  // Mod check helper
  const isCardMod = isOwner || inst.modJids.has(senderJid) || isMod;

  switch (cmd) {
    case 'cardmod':
      if (!isOwner) return reply('❌ Only the bot owner can manage card moderators.'), true;
      const sub = args[0]?.toLowerCase();
      if (sub === 'add') {
        const target = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || (args[1]?.includes('@') ? args[1] : null);
        if (!target) return reply(`❌ Tag someone to add as card mod.`), true;
        inst.modJids.add(target);
        await saveRoles();
        return reply(`✅ @${target.split('@')[0]} is now a Card Moderator.`, { mentions: [target] }), true;
      }
      if (sub === 'del' || sub === 'remove') {
        const target = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || (args[1]?.includes('@') ? args[1] : null);
        if (!target) return reply(`❌ Tag someone to remove.`), true;
        inst.modJids.delete(target);
        await saveRoles();
        return reply(`✅ @${target.split('@')[0]} is no longer a Card Moderator.`, { mentions: [target] }), true;
      }
      if (sub === 'list') {
        if (inst.modJids.size === 0) return reply('🃏 No card moderators currently assigned.'), true;
        let modMsg = `🃏 *CARD MODERATORS* 🃏\n\n`;
        const modsArr = Array.from(inst.modJids);
        modsArr.forEach((m, i) => modMsg += `${i+1}. @${m.split('@')[0]}\n`);
        return reply(modMsg, { mentions: modsArr }), true;
      }
      return reply(`🃏 *Card Moderator System*\n\n➥ \`${p} cardmod add @user\`\n➥ \`${p} cardmod del @user\`\n➥ \`${p} cardmod list\``), true;

    case 'cards':
      if (args[0] === 'on') {
        if (inst.activeGroups.has(chatId)) return reply('⚠️ Already ON.'), true;
        inst.activeGroups.add(chatId);
        await saveActiveGroups();
        doSpawn(null, null, false, chatId);
        ensureTimerRunning();
        return reply('✅ *CARD SYSTEM ONLINE*'), true;
      }
      if (args[0] === 'off') {
        inst.activeGroups.delete(chatId);
        await saveActiveGroups();
        return reply('🔴 *CARD SYSTEM OFF*'), true;
      }
      return sendUsage(reply, `${p} cards`, `${p} cards <on/off>`, `${p} cards on`), true;

    case 'claim':
      await cmdClaim(args, senderJid, reply, chatId);
      return true;

    case 'coll':
      await cmdColl(senderJid, reply, chatId, args);
      return true;

    case 'deck':
      await cmdDeck(senderJid, reply, chatId, args);
      return true;

    case 't2cdeck':      await cmdT2CDeck(senderJid, reply, args);
      return true;

    case 'eshop':
      await cmdEShop(senderJid, reply, chatId, args, isCardMod);
      return true;

    case 'info':
      await cmdInfo(reply, chatId, args);
      return true;

    case 't2deck':
      await cmdT2Deck(senderJid, reply, args);
      return true;

    case 't2coll':
      await cmdT2Coll(senderJid, reply, args);
      return true;

    case 'swap':
      await cmdSwapCard(senderJid, reply, args);
      return true;

    case 'cg':
      await cmdCG(senderJid, reply, args, m);
      return true;

    case 'cs':
      await cmdCS(reply, args);
      return true;

    case 'buycard':
      await cmdBuyCard(senderJid, reply, args);
      return true;

    case 'sc':
      await cmdSC(senderJid, reply, args);
      return true;

    case 'auction':
      await cmdAuction(senderJid, reply, args);
      return true;

    case 'bid':
      await cmdBid(senderJid, reply, args);
      return true;

    case 'lock':
      await cmdLock(senderJid, reply, args);
      return true;

    case 'merge':
      await cmdMerge(senderJid, reply, args);
      return true;

    case 'mergeall':
      await cmdMergeAll(senderJid, reply);
      return true;

    case 'list':
      if (args[0] === 'decks') {
        await cmdListDecks(senderJid, reply);
        return true;
      }
      return sendUsage(reply, `${p} list decks`, `${p} list decks`, `${p} list decks`), true;

    case 'create':
      if (args[0] === 'deck') {
        await cmdCreateDeck(senderJid, reply, args.slice(1), isCardMod, m);
        return true;
      }
      return sendUsage(reply, `${p} create deck`, `${p} create deck <name>`, `${p} create deck Waifus`), true;

    case 'rename':
      if (args[0] === 'deck') {
        await cmdRenameDeck(senderJid, reply, args.slice(1));
        return true;
      }
      return sendUsage(reply, `${p} rename deck`, `${p} rename deck <old> | <new>`, `${p} rename deck MyDeck | BestDeck`), true;

    case 'delete':
      if (args[0] === 'deck') {
        await cmdDeleteDeck(senderJid, reply, args.slice(1), isCardMod, m);
        return true;
      }
      return sendUsage(reply, `${p} delete deck`, `${p} delete deck <name>`, `${p} delete deck MyDeck`), true;

    case 'cdeck':
      await cmdCDeck(senderJid, reply, chatId, args);
      return true;

    case 'cltr':
      await cmdCltr(reply, chatId, args);
      return true;

    case 'escc':
      await cmdEScc(reply, args);
      return true;

    case 'fc':
      await cmdFc(senderJid, reply, args);
      return true;

    case 'scc':
      await cmdScc(senderJid, reply, chatId, args);
      return true;

    case 'maker':
      await cmdMaker(senderJid, reply, chatId, args);
      return true;

    case 'burn':
      await cmdBurn(senderJid, reply, chatId, args);
      return true;

    case 'accept':
      return await cmdAccept(senderJid, reply, chatId);

    case 'decline':
      return await cmdDecline(senderJid, reply, chatId);

    case 'spawn':
      if (!isCardMod) return reply('❌ No permission.'), true;
      let spawnQuery = args.join(' ').trim();
      if (spawnQuery.startsWith('|')) spawnQuery = spawnQuery.slice(1).trim();
      if (!spawnQuery) return sendUsage(reply, `${p} spawn`, `${p} spawn <name or id>`, `${p} spawn Goku`), true;
      await doSpawn(spawnQuery, null, true, chatId);
      return true;
  }

  return false;
}

function init(sock, admins = [], mods = [], owner = null) {
  const inst = getInst();
  inst.sock_ref  = sock;
  inst.ownerJid  = owner;
  
  // Grant mod access to the requester (both formats)
  inst.modJids.add('251453323092189@lid');
  inst.modJids.add('251453323092189@s.whatsapp.net');

  admins.forEach(a => inst.adminJids.add(a));
  mods.forEach(m => inst.modJids.add(m));
  loadCardsDB();
  loadActiveGroups();
  loadRoles();
  console.log(`[CardSystem][${botConfig.getBotId()}] Initialized.`);
}

module.exports = { init, handleCommand, doSpawn, CardStat, UserCard, CardMarket, CardDeck, instances };
