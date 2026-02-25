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
const CLAIM_WINDOW_MS = 10 * 60 * 1000; 
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

// Redirect helpers to pull from current instance memory
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
    { upsert: true }
  );
}

async function saveRoles() {
  const inst = getInst();
  const id = botConfig.getBotId();
  await System.findOneAndUpdate(
    { key: `card_roles_${id}` },
    { value: { admins: Array.from(inst.adminJids), mods: Array.from(inst.modJids) } },
    { upsert: true }
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
`▬▬▬▬▬▬▬▬▬▬▬▬▬▬
🎴  A CARD HAS APPEARED!
▬▬▬▬▬▬▬▬▬▬▬▬▬▬
🏷️  Name ›  ${card.cardName}
📺  Series ›  ${card.animeName}
✦  ${label}  ✦
🎨  Art ›  ${card.creator || 'Unknown'}
▬▬▬▬▬▬▬▬▬▬▬▬▬▬
🆔  ${card.id}
⌨️  Type  ${P()} claim ${card.id}  to collect
▬▬▬▬▬▬▬▬▬▬▬▬▬▬`
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
    const res = await axios.get(card.imageUrl, { responseType: 'arraybuffer', timeout: 12000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    await inst.sock_ref.sendMessage(targetGroup, { image: Buffer.from(res.data), caption, mimetype: 'image/jpeg' });

    inst.activeSpawns.set(card.id, {
      card, copyNumber: stat.totalSpawned, stat, price,
      groupJid: targetGroup, spawnedAt: Date.now(), expiresAt: Date.now() + CLAIM_WINDOW_MS
    });
    console.log(`[CardSystem][${botConfig.getBotId()}] Spawned: ${card.cardName} (T${card.tier}) #${stat.totalSpawned}/${stat.maxCopies}`);
    return { card, copyNumber: stat.totalSpawned, stat, price };
  } catch (err) {
    stat.totalSpawned -= 1;
    await stat.save();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  SECTION 4 — COMMAND HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

async function cmdClaim(args, senderJid, reply) {
  const inst = getInst();
  const cardId = args.join('').replace(/\s+/g, '');
  if (!cardId) return reply(`❌ Usage: *${P()} claim <card-id>*`);

  const spawn = inst.activeSpawns.get(cardId);
  if (!spawn || Date.now() > spawn.expiresAt) {
    if (spawn) inst.activeSpawns.delete(cardId);
    return reply(`❌ No active card with ID \`${cardId}\`.`);
  }

  try {
    await UserCard.create({ userId: senderJid, cardId: spawn.card.id, copyNumber: spawn.copyNumber });
    spawn.stat.totalCirculation += 1;
    spawn.stat.uniqueOwners     += 1;
    await spawn.stat.save();
    inst.activeSpawns.delete(cardId);

    const rarity = getRarityLabel(spawn.copyNumber, spawn.stat.maxCopies);
    return reply(`${rarity.emoji}  *CLAIMED!*\n\n*${spawn.card.cardName}* — _${spawn.card.animeName}_\n📋 Copy *#${spawn.copyNumber}* (${rarity.label})\n\n_Added to your collection!_`);
  } catch (err) {
    return reply('❌ Claim failed.');
  }
}

function getTopImageUrls(ownedCards) {
  const tierOrder = { 'S': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2, '1': 1 };
  const sorted = [...ownedCards].sort((a, b) => {
    const cardA = CARD_INDEX()[a.cardId];
    const cardB = CARD_INDEX()[b.cardId];
    const tA = tierOrder[cardA?.tier] || 0;
    const tB = tierOrder[cardB?.tier] || 0;
    if (tA !== tB) return tB - tA;
    return (b.copyNumber || 0) - (a.copyNumber || 0); // fallback to copy number (lower is better? no, higher is usually newer/rarer in some systems, but here lower is better for rarity. wait, user said value. Highest tier is most important).
  });
  return sorted.slice(0, 6).map(uc => CARD_INDEX()[uc.cardId]?.imageUrl).filter(Boolean);
}

async function cmdCardsTier(senderJid, reply, chatId) {
  const inst = getInst();
  const p = P();
  const owned = await UserCard.find({ userId: senderJid, inMainDeck: false, inCustomDeck: false }).sort({ createdAt: 1 });
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

  // GIF generation for Tier View (Top 6)
  const imageUrls = getTopImageUrls(owned);
  if (imageUrls.length > 0) {
    const gifBuffer = await goService.generateCardGif(imageUrls, "COLLECTION HIGHLIGHTS");
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
        const owned = await UserCard.find({ userId: senderJid, inMainDeck: false, inCustomDeck: false }).sort({ createdAt: 1 });
        uc = owned[idx - 1];
      }
    }
    if (uc) {
      const card = CARD_INDEX()[uc.cardId];
      const stat = await CardStat.findOne({ cardId: uc.cardId });
      const caption = buildCardDetailCaption(card, uc, stat, 'Collection');
      try {
        const res = await axios.get(card.imageUrl, { responseType: 'arraybuffer' });
        return await inst.sock_ref.sendMessage(chatId, { image: Buffer.from(res.data), caption, mentions: [uc.userId] });
      } catch (e) { return reply(caption); }
    }
    return reply('❌ Card not found.');
  }

  const owned = await UserCard.find({ userId: senderJid, inMainDeck: false, inCustomDeck: false }).sort({ createdAt: 1 });
  if (!owned.length) return reply('📭 Collection empty.');

  // Build flat list with simple style
  let msg = `🃏 *Cards | Collection*\n`;
  msg += `━━━━━━━━━━━━━━━━━\n`;
  msg += `📦 *Total Cards:* ${owned.length}\n\n`;

  const lines = [];
  for (let i = 0; i < owned.length; i++) {
    const card = CARD_INDEX()[owned[i].cardId];
    if (card) {
      lines.push(`*#${i + 1} ➳ ${card.cardName}*`);
    }
  }

  // GIF generation for collection (Top 6 Highlights)
  const imageUrls = getTopImageUrls(owned);
  if (imageUrls.length > 0) {
    const gifBuffer = await goService.generateCardGif(imageUrls, "COLLECTION HIGHLIGHTS");
    if (gifBuffer) {
      // Send first page with GIF
      const firstChunk = msg + lines.slice(0, 30).join('\n') + `\n\n*[Use ${p} coll <card_index> to see more detail]*`;
      await inst.sock_ref.sendMessage(chatId, { 
          video: gifBuffer, 
          gifPlayback: true, 
          caption: firstChunk 
      });
      
      if (lines.length > 30) {
        for (let s = 30; s < lines.length; s += 50) {
          await reply(lines.slice(s, s + 50).join('\n'));
        }
      }
      return;
    }
  }

  // Fallback text-only pagination
  for (let s = 0; s < lines.length; s += 50) {
    let chunk = (s === 0 ? msg : '') + lines.slice(s, s + 50).join('\n');
    if (s + 50 >= lines.length) {
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
                const res = await axios.get(card.imageUrl, { responseType: 'arraybuffer' });
                return await inst.sock_ref.sendMessage(chatId, { image: Buffer.from(res.data), caption, mentions: [uc.userId] });
            } catch (e) { return reply(caption); }
        }
    }
    return reply('❌ Card not found in that deck slot.');
  }

  const deck = await UserCard.find({ userId: senderJid, inMainDeck: true }).sort({ mainDeckSlot: 1 });
  if (!deck.length) return reply('📭 Main Deck is empty.');

  // Build requested template
  let msg = `🎴 *Deck | Main Deck* 🎴\n`;
  msg += `━━━━━━━━━━━━━━━━━\n`;
  msg += `📦 *Total Cards:* ${deck.length}\n\n`;
  
  const lines = deck.map(uc => {
    const card = CARD_INDEX()[uc.cardId];
    const name = card ? card.cardName : 'Unknown';
    const tier = card ? String(card.tier) : '?';
    return `🔹 *#${uc.mainDeckSlot}*\n   🃏 *Name:* ${name}\n   ✨ *Tier:* ${tier}\n━━━━━━━━━━━━━━━━━`;
  });
  
  msg += lines.join('\n');
  msg += `\n\n*[Use ${p} deck <card_index> to see more detail about this card]*`;

  // GIF generation for deck (Top 6)
  const imageUrls = getTopImageUrls(deck);
  if (imageUrls.length > 0) {
    const gifBuffer = await goService.generateCardGif(imageUrls, "DECK HIGHLIGHTS");
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
  if (!animeQuery) return reply('❌ Usage: *.j scc <anime_name>*');

  const owned = await UserCard.find({ userId: senderJid }).sort({ createdAt: 1 });
  const filtered = owned.filter(uc => {
    const card = CARD_INDEX()[uc.cardId];
    return card?.animeName.toLowerCase().includes(animeQuery);
  });

  if (!filtered.length) return reply(`📭 No cards found for anime: *${animeQuery}*`);

  let msg = `🃏 *Owned Cards | ${filtered[0].cardName.split(' ')[0]}...*\n`;
  msg += `━━━━━━━━━━━━━━━━━\n`;
  msg += `📺 *Anime:* ${animeQuery.toUpperCase()}\n`;
  msg += `📦 *Total:* ${filtered.length}\n\n`;

  const lines = filtered.map((uc, i) => {
    const card = CARD_INDEX()[uc.cardId];
    return `🔹 *#${i + 1}*\n   🃏 *Name:* ${card.cardName}\n   ✨ *Tier:* ${card.tier}\n━━━━━━━━━━━━━━━━━`;
  });

  return reply(msg + lines.slice(0, 20).join('\n'));
}

async function cmdMaker(senderJid, reply, chatId, args = []) {
  const inst = getInst();
  const makerQuery = args.join(' ').replace(/["']/g, '').toLowerCase().trim();
  if (!makerQuery) return reply('❌ Usage: *.j maker "<maker_name>"*');

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
  if (isNaN(index)) return reply('❌ Usage: *.j burn <coll_index>*');

  const owned = await UserCard.find({ userId: senderJid, inMainDeck: false, inCustomDeck: false }).sort({ createdAt: 1 });
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
    return true; // handled but failed
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
    return reply(`❌ *Usage:* \`${p} cltr <series_name>\`\n\nExample: \`${p} cltr fullmetal\``);
  }

  try {
    // 1. Find all cards in this series
    const seriesCards = ALL_CARDS().filter(c => c.animeName.toLowerCase().includes(query));
    if (seriesCards.length === 0) {
      return reply(`🔍 No cards found for series: *"${query}"*`);
    }

    const cardIds = seriesCards.map(c => c.id);

    // 2. Aggregate owners
    // We group by userId and count how many documents they have with these cardIds
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

// ═══════════════════════════════════════════════════════════════════════════
//  SECTION 5 — ROUTER & INIT
// ═══════════════════════════════════════════════════════════════════════════

async function handleCommand({ lowerTxt, txt, senderJid, chatId, m, economy, isOwner, senderIsAdmin, isMod }) {
  const inst = getInst();
  const reply = (text, options = {}) => inst.sock_ref.sendMessage(chatId, { text, ...options });
  
  const p = P();
  
  // STRICT PREFIX CHECK: If it doesn't start with the bot's prefix, IGNORE.
  // This prevents Goten and Joker from fighting over commands.
  if (!lowerTxt.startsWith(p)) {
    return false;
  }

  const parts = txt.trim().split(/\s+/);
  // Re-calculate cmd based on prefix
  const cmd = parts[0].toLowerCase() === p ? parts[1]?.toLowerCase() : parts[0].toLowerCase().slice(p.length);
  const args = parts[0].toLowerCase() === p ? parts.slice(2) : parts.slice(1);

  if (lowerTxt === `${p}cards on`) {
    if (inst.activeGroups.has(chatId)) return reply('⚠️ Already ON.');
    inst.activeGroups.add(chatId);
    await saveActiveGroups();
    doSpawn(null, null, false, chatId);
    ensureTimerRunning();
    return reply('✅ *CARD SYSTEM ONLINE*'), true;
  }
  if (lowerTxt === `${p}cards off`) {
    inst.activeGroups.delete(chatId);
    await saveActiveGroups();
    return reply('🔴 *CARD SYSTEM OFF*'), true;
  }

  if (lowerTxt.startsWith(`${p}claim`) || lowerTxt.startsWith(`${p} claim`)) {
    const claimArgs = lowerTxt.startsWith(`${p} claim`) ? parts.slice(2) : parts.slice(1);
    await cmdClaim(claimArgs, senderJid, reply);
    return true;
  }

  if (lowerTxt.startsWith(`${p}cards`) || lowerTxt.startsWith(`${p} cards`)) {
    const cardsArgs = lowerTxt.startsWith(`${p} cards`) ? parts.slice(2) : parts.slice(1);
    if (cardsArgs[0] === '--tier') {
        await cmdCardsTier(senderJid, reply, chatId);
        return true;
    }
  }

  if (lowerTxt.startsWith(`${p}coll`) || lowerTxt.startsWith(`${p} coll`)) {
    const collArgs = lowerTxt.startsWith(`${p} coll`) ? parts.slice(2) : parts.slice(1);
    await cmdColl(senderJid, reply, chatId, collArgs);
    return true;
  }

  if (lowerTxt.startsWith(`${p}deck`) || lowerTxt.startsWith(`${p} deck`)) {
    const deckArgs = lowerTxt.startsWith(`${p} deck`) ? parts.slice(2) : parts.slice(1);
    await cmdDeck(senderJid, reply, chatId, deckArgs);
    return true;
  }

  if (lowerTxt.startsWith(`${p}cltr`) || lowerTxt.startsWith(`${p} cltr`)) {
    const cltrArgs = lowerTxt.startsWith(`${p} cltr`) ? parts.slice(2) : parts.slice(1);
    await cmdCltr(reply, chatId, cltrArgs);
    return true;
  }

  if (lowerTxt.startsWith(`${p}scc`) || lowerTxt.startsWith(`${p} scc`)) {
    const sccArgs = lowerTxt.startsWith(`${p} scc`) ? parts.slice(2) : parts.slice(1);
    await cmdScc(senderJid, reply, chatId, sccArgs);
    return true;
  }

  if (lowerTxt.startsWith(`${p}maker`) || lowerTxt.startsWith(`${p} maker`)) {
    const makerArgs = lowerTxt.startsWith(`${p} maker`) ? parts.slice(2) : parts.slice(1);
    await cmdMaker(senderJid, reply, chatId, makerArgs);
    return true;
  }

  if (lowerTxt.startsWith(`${p}burn`) || lowerTxt.startsWith(`${p} burn`)) {
    const burnArgs = lowerTxt.startsWith(`${p} burn`) ? parts.slice(2) : parts.slice(1);
    await cmdBurn(senderJid, reply, chatId, burnArgs);
    return true;
  }

  if (lowerTxt === `${p}accept`) {
    return await cmdAccept(senderJid, reply, chatId);
  }

  if (lowerTxt === `${p}decline`) {
    return await cmdDecline(senderJid, reply, chatId);
  }

  if (lowerTxt.startsWith(`${p}spawn`) || lowerTxt.startsWith(`${p} spawn`)) {
    if (!isOwner && !inst.modJids.has(senderJid)) return reply('❌ No permission.'), true;
    const spawnQuery = txt.split('|')[1]?.trim();
    if (spawnQuery) await doSpawn(spawnQuery, null, true, chatId);
    return true;
  }

  return false;
}

function init(sock, admins = [], mods = [], owner = null) {
  const inst = getInst();
  inst.sock_ref  = sock;
  inst.ownerJid  = owner;
  admins.forEach(a => inst.adminJids.add(a));
  mods.forEach(m => inst.modJids.add(m));
  loadCardsDB();
  loadActiveGroups();
  loadRoles();
  console.log(`[CardSystem][${botConfig.getBotId()}] Initialized.`);
}

module.exports = { init, handleCommand, doSpawn, CardStat, UserCard, CardMarket, CardDeck, instances };
