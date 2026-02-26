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

async function cmdInfo(reply, chatId, args = []) {
  const p = P();
  const query = args.join(' ').toLowerCase().trim();
  if (!query) return reply(`❌ Usage: \`${p} info <card_name or id>\``);

  const card = ALL_CARDS().find(c => c.id.toLowerCase() === query || c.cardName.toLowerCase().includes(query));
  if (!card) return reply(`❌ Card not found: *"${query}"*`);

  const stat = await CardStat.findOne({ cardId: card.id });
  const caption = buildCardDetailCaption(card, null, stat, 'Global Database');
  
  try {
    const res = await axios.get(card.imageUrl, { responseType: 'arraybuffer' });
    return await getInst().sock_ref.sendMessage(chatId, { image: Buffer.from(res.data), caption });
  } catch (e) {
    return reply(caption);
  }
}

async function cmdT2Deck(senderJid, reply, args = []) {
  const p = P();
  const index = parseInt(args[0]);
  if (isNaN(index)) return reply(`❌ Usage: \`${p} t2deck <coll_index>\``);

  const owned = await UserCard.find({ userId: senderJid, inMainDeck: false, inCustomDeck: false }).sort({ createdAt: 1 });
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

async function cmdT2Coll(senderJid, reply, args = []) {
  const p = P();
  const slot = parseInt(args[0]);
  if (isNaN(slot)) return reply(`❌ Usage: \`${p} t2coll <deck_slot>\``);

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

  if (isNaN(a) || isNaN(b)) return reply(`❌ Usage: \`${p} swap card <a> and <b>\``);

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
  // Usage: .cg @user <coll_index>
  const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  if (mentioned.length === 0) return reply(`❌ Usage: \`${p} cg @user <coll_index>\``);

  const targetJid = mentioned[0];
  const indexStr = args.find(a => !isNaN(parseInt(a)));
  const index = parseInt(indexStr);

  if (isNaN(index)) return reply(`❌ Usage: \`${p} cg @user <coll_index>\``);

  const owned = await UserCard.find({ userId: senderJid, inMainDeck: false, inCustomDeck: false }).sort({ createdAt: 1 });
  const uc = owned[index - 1];
  if (!uc) return reply('❌ Card not found in your collection.');

  uc.userId = targetJid;
  await uc.save();

  const card = CARD_INDEX()[uc.cardId];
  return reply(`🎁 *GIFT SENT!*\n\n@${senderJid.split('@')[0]} gave *${card.cardName}* to @${targetJid.split('@')[0]}!`, { mentions: [senderJid, targetJid] });
}

async function cmdCS(reply, args = []) {
  const p = P();
  const query = args.join(' ').toLowerCase().trim();
  if (!query) return reply(`❌ Usage: \`${p} cs <card_name>\``);

  const matches = ALL_CARDS().filter(c => c.cardName.toLowerCase().includes(query)).slice(0, 15);
  if (matches.length === 0) return reply(`🔍 No cards found matching *"${query}"*`);

  let msg = `🔍 *Search Results for "${query}"*\n\n`;
  matches.forEach(c => {
    msg += `▫️ *${c.cardName}* (${c.tier})\n   ➥ ID: \`${c.id}\`\n`;
  });

  return reply(msg);
}

async function cmdBuyCard(senderJid, reply, args = []) {
  const p = P();
  const inst = getInst();
  
  if (args.length > 0) {
    const index = parseInt(args[0]);
    if (!isNaN(index)) {
        // Buy a specific listing
        const active = await CardMarket.find({ status: 'active', type: 'sale' }).sort({ listedAt: -1 });
        const listing = active[index - 1];
        if (!listing) return reply('❌ Invalid listing number.');

        if (listing.sellerId === senderJid) return reply('❌ You cannot buy your own card.');

        const balance = economy.getBalance(senderJid);
        if (balance < listing.price) return reply(`❌ Insufficient funds! You need ${ZENI()}${listing.price.toLocaleString()}.`);

        try {
            // Transaction
            economy.removeMoney(senderJid, listing.price);
            economy.addMoney(listing.sellerId, listing.price);

            // Transfer Card
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

  if (isNaN(slot) || isNaN(price) || price < 1) return reply(`❌ Usage: \`${p} sc <deck_slot> <price>\``);

  const uc = await UserCard.findOne({ userId: senderJid, inMainDeck: true, mainDeckSlot: slot });
  if (!uc) return reply(`❌ No card in deck slot #${slot}.`);
  if (uc.isLocked) return reply('❌ This card is locked! Unlock it first.');

  try {
    // Mark card as for sale
    uc.forSale = true;
    uc.salePrice = price;
    await uc.save();

    // Create listing
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
  if (!input) return reply(`❌ Usage: \`${p} lock <deck_slot or id>\``);

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
  if (!query) return reply(`❌ Usage: \`${p} merge <card_id>\``);

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

async function cmdCreateDeck(senderJid, reply, args = []) {
  const p = P();
  const name = args.join(' ').trim();
  if (!name) return reply(`❌ Usage: \`${p} create deck <name>\``);

  try {
    await CardDeck.create({ userId: senderJid, name: name, cards: [] });
    return reply(`✅ Created custom deck: *"${name}"*`);
  } catch (err) {
    if (err.code === 11000) return reply(`❌ A deck with the name *"${name}"* already exists.`);
    return reply('❌ Failed to create deck.');
  }
}

async function cmdCDeck(senderJid, reply, args = []) {
  const p = P();
  const name = args.join(' ').trim();
  if (!name) return reply(`❌ Usage: \`${p} cdeck <name>\``);

  const deck = await CardDeck.findOne({ userId: senderJid, name: { $regex: new RegExp(`^${name}$`, 'i') } });
  if (!deck) return reply(`❌ Custom deck *"${name}"* not found.`);

  if (deck.cards.length === 0) return reply(`📭 Custom deck *"${name}"* is empty.`);

  let msg = `📂 *CUSTOM DECK | ${deck.name.toUpperCase()}*\n\n`;
  for (let i = 0; i < deck.cards.length; i++) {
    const uc = await UserCard.findById(deck.cards[i]);
    if (uc) {
      const card = CARD_INDEX()[uc.cardId];
      msg += `*${i + 1}.* ${card?.cardName || 'Unknown'} (${card?.tier || '?'})\n`;
    }
  }

  return reply(msg);
}

async function cmdRenameDeck(senderJid, reply, args = []) {
  const p = P();
  const raw = args.join(' ');
  const [oldName, newName] = raw.split('|').map(s => s.trim());
  if (!oldName || !newName) return reply(`❌ Usage: \`${p} rename deck <old_name> | <new_name>\``);

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

async function cmdDeleteDeck(senderJid, reply, args = []) {
  const p = P();
  const name = args.join(' ').trim();
  if (!name) return reply(`❌ Usage: \`${p} delete deck <name>\``);

  const deck = await CardDeck.findOne({ userId: senderJid, name: { $regex: new RegExp(`^${name}$`, 'i') } });
  if (!deck) return reply(`❌ Deck *"${name}"* not found.`);

  // Delete cards inside the deck too? User said "Cards inside are deleted!" in registry.
  try {
    await UserCard.deleteMany({ _id: { $in: deck.cards } });
    await CardDeck.findByIdAndDelete(deck._id);
    return reply(`🗑️ *DECK DELETED!*\n\nCustom deck *"${name}"* and all cards inside have been removed.`);
  } catch (err) { return reply('❌ Deletion failed.'); }
}

async function cmdAuction(senderJid, reply, args = []) {
  const p = P();
  const slot = parseInt(args[0]);
  const minBid = parseInt(args[1]);
  const hours = parseInt(args[2]);

  if (isNaN(slot) || isNaN(minBid) || isNaN(hours) || hours < 1 || hours > 48) {
    return reply(`❌ Usage: \`${p} auction <deck_slot> <min_bid> <hours (1-48)>\``);
  }

  const uc = await UserCard.findOne({ userId: senderJid, inMainDeck: true, mainDeckSlot: slot });
  if (!uc) return reply(`❌ No card in deck slot #${slot}.`);
  if (uc.isLocked) return reply('❌ This card is locked!');

  try {
    uc.inAuction = true;
    await uc.save();

    const endsAt = new Date();
    endsAt.setHours(endsAt.getHours() + hours);

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
  // Simplified: auto-bid on the latest auction or support index?
  // Let's list auctions first if no index
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
  if (isNaN(index) || isNaN(amount)) return reply(`❌ Usage: \`${p} bid <number> <amount>\``);

  const auction = active[index - 1];
  if (!auction) return reply('❌ Invalid auction number.');

  if (auction.sellerId === senderJid) return reply('❌ You cannot bid on your own auction.');
  if (amount <= auction.currentBid) return reply(`❌ Bid must be higher than ${ZENI()}${auction.currentBid.toLocaleString()}.`);

  const balance = economy.getBalance(senderJid);
  if (balance < amount) return reply(`❌ You don't have ${ZENI()}${amount.toLocaleString()}.`);

  try {
    // Note: In a real system, we might "lock" the bid money.
    // For now, we'll just record the high bidder.
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
      
      // Notify (optional, requires chatId storage in market or join logic)
      // Since we don't have chatId in market, we skip broadcast here or add it.
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
  // cmd is the word immediately after the prefix (or attached to it)
  // e.g. ".j cards" -> cmd is "cards"
  // e.g. ".jcards" -> cmd is "cards"
  const firstWord = parts[0].toLowerCase();
  const cmd = firstWord === p ? parts[1]?.toLowerCase() : firstWord.slice(p.length);
  const args = firstWord === p ? parts.slice(2) : parts.slice(1);

  if (!cmd) return false;

  switch (cmd) {
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
      if (args[0] === '--tier') {
        await cmdCardsTier(senderJid, reply, chatId);
        return true;
      }
      break;

    case 'claim':
      await cmdClaim(args, senderJid, reply);
      return true;

    case 'coll':
      await cmdColl(senderJid, reply, chatId, args);
      return true;

    case 'deck':
      await cmdDeck(senderJid, reply, chatId, args);
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
      break;

    case 'create':
      if (args[0] === 'deck') {
        await cmdCreateDeck(senderJid, reply, args.slice(1));
        return true;
      }
      break;

    case 'rename':
      if (args[0] === 'deck') {
        await cmdRenameDeck(senderJid, reply, args.slice(1));
        return true;
      }
      break;

    case 'delete':
      if (args[0] === 'deck') {
        await cmdDeleteDeck(senderJid, reply, args.slice(1));
        return true;
      }
      break;

    case 'cdeck':
      await cmdCDeck(senderJid, reply, args);
      return true;

    case 'cltr':
      await cmdCltr(reply, chatId, args);
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
