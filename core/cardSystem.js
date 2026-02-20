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

// ── Mongoose Models ──────────────────────────────────────────────────────────
const CardStat   = require('./models/CardStat');
const UserCard   = require('./models/UserCard');
const CardMarket = require('./models/CardMarket');
const CardDeck   = require('./models/CardDeck');

// ── Config ───────────────────────────────────────────────────────────────────
const botConfig  = require('../botConfig');
const ZENI       = () => botConfig.getCurrency().symbol;

// ═══════════════════════════════════════════════════════════════════════════
//  SECTION 1 — CARD DATABASE
// ═══════════════════════════════════════════════════════════════════════════

const CARDS_DB_PATH = path.join(__dirname, 'data', 'cards_data.json');
let ALL_CARDS     = [];   // flat array of every card object
let CARD_INDEX    = {};   // { "1-00001": cardObject } — O(1) lookup
let CARDS_BY_TIER = {};   // { "1": [cards], "2": [cards], ... }

function loadCardsDB() {
  try {
    const raw     = JSON.parse(fs.readFileSync(CARDS_DB_PATH, 'utf8'));
    ALL_CARDS     = Array.isArray(raw.cards) ? raw.cards : Object.values(raw.cards);
    CARD_INDEX    = {};
    CARDS_BY_TIER = {};
    for (const card of ALL_CARDS) {
      CARD_INDEX[card.id] = card;
      const t = String(card.tier);
      if (!CARDS_BY_TIER[t]) CARDS_BY_TIER[t] = [];
      CARDS_BY_TIER[t].push(card);
    }
    console.log(`[CardSystem] Loaded ${ALL_CARDS.length} cards across ${Object.keys(CARDS_BY_TIER).length} tiers.`);
  } catch (e) {
    console.error('[CardSystem] Failed to load cards_data.json:', e.message);
    console.error('[CardSystem] Expected path: <bot-root>/data/cards_data.json');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  SECTION 2 — CONSTANTS & TABLES
// ═══════════════════════════════════════════════════════════════════════════

const BASE_MAX   = { '1': 200, '2': 120, '3': 60, '4': 30, '5': 8, '6': 3, 'S': 1 };
const BASE_PRICE = { '1': 10,  '2': 25,  '3': 60, '4': 150, '5': 400, '6': 1200, 'S': 9999 };

const TIER_STARS = {
  '1': '✦', '2': '✦✦', '3': '✦✦✦',
  '4': '✦✦✦✦', '5': '✦✦✦✦✦', '6': '❖❖❖❖❖❖', 'S': '👑'
};

const TIER_LABEL = {
  '1': 'TIER  I',  '2': 'TIER  II',  '3': 'TIER  III',
  '4': 'TIER  IV', '5': 'TIER  V',   '6': 'TIER  VI',  'S': 'TIER  S'
};

// Weighted auto-spawn table — weights sum to 79 (the remaining 21% chance goes to T6 check + T5 guarantee)
const SPAWN_WEIGHTS = [
  { tier: '1', w: 30 },
  { tier: '2', w: 20 },
  { tier: '3', w: 15 },
  { tier: '4', w: 10 },
  { tier: '5', w:  4 },
];

// T6 = once every 3–4 days avg = once per ~168 half-hour intervals
const T6_PER_INTERVAL = 1 / 168;

// Cards expire if not claimed within this window
const CLAIM_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

const MAIN_DECK_SIZE = 12;

// ═══════════════════════════════════════════════════════════════════════════
//  SECTION 3 — RUNTIME STATE (Multi-Tenant)
// ═══════════════════════════════════════════════════════════════════════════

const instances = new Map();

function getInst() {
  const id = botConfig.getBotId();
  if (!instances.has(id)) {
    instances.set(id, {
      sock_ref:      null,
      activeGroups:  new Set(), // JIDs where cards are ON
      spawnTimer:    null,
      ownerJid:      null,
      adminJids:     new Set(),
      modJids:       new Set(),
      activeSpawns:  new Map(), // cardId -> spawn data
    });
  }
  return instances.get(id);
}

// ═══════════════════════════════════════════════════════════════════════════
//  SECTION 4 — RARITY & PRICE ENGINE
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

// ═══════════════════════════════════════════════════════════════════════════
//  SECTION 5 — CARD CAPTION BUILDER
// ═══════════════════════════════════════════════════════════════════════════

function buildSpawnCaption(card, copyNumber, maxCopies, price) {
  const tier   = String(card.tier);
  const rarity = getRarityLabel(copyNumber, maxCopies);
  const stars  = TIER_STARS[tier]  || '✦';
  const label  = TIER_LABEL[tier]  || `TIER ${tier}`;

  return (
`▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
        🎴  *A CARD APPEARED!*
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬

  *${card.cardName}*
  _${card.animeName}_
${card.description ? `\n  _"${card.description}"_\n` : ''}
  ${stars}  *${label}*  ${stars}
  ${rarity.emoji}  *${rarity.label}*
  📋  Copy  *#${copyNumber}*  of  *${maxCopies}*

  🎨  *Art by*  ›  ${card.creator || 'Unknown'}
  🪙  *Value*   ›  ${ZENI()}${price.toLocaleString()}

▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
  🆔  \`${card.id}\`
  _Type_  *.g claim ${card.id}*  _to collect_
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬`
  );
}

function cardLine(index, card, uc, stat) {
  const tier   = String(card.tier);
  const rarity = getRarityLabel(uc.copyNumber, stat?.maxCopies || BASE_MAX[tier] || 200);
  return `*#${index}*  ${TIER_STARS[tier]}  ${card.cardName}  _(${card.animeName})_  ${rarity.emoji} ${rarity.label}`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  SECTION 6 — SPAWN ENGINE
// ═══════════════════════════════════════════════════════════════════════════

function pickSpawnTier() {
  if (Math.random() < T6_PER_INTERVAL) return '6';
  const total = SPAWN_WEIGHTS.reduce((s, e) => s + e.w, 0);
  let roll = Math.random() * total;
  for (const { tier, w } of SPAWN_WEIGHTS) {
    roll -= w;
    if (roll <= 0) return tier;
  }
  return '1';
}

async function getOrInitStat(cardId, tier) {
  let stat = await CardStat.findOne({ cardId });
  if (!stat) stat = await CardStat.create({ cardId, maxCopies: BASE_MAX[String(tier)] || 200 });
  return stat;
}

async function doSpawn(forceCardId = null, forceTier = null, bypassCap = false, targetGroup = null) {
  const inst  = getInst();
  const group = targetGroup;
  if (!inst.sock_ref || !group) return;

  let card = null;
  let stat = null;

  if (forceCardId) {
    // Find by ID first, fall back to name search
    card = CARD_INDEX[forceCardId] || ALL_CARDS.find(c => c.cardName.toLowerCase() === forceCardId.toLowerCase());
    if (!card) { console.warn(`[CardSystem] spawn: "${forceCardId}" not found`); return null; }
    stat = await getOrInitStat(card.id, card.tier);

  } else {
    const tier = forceTier || pickSpawnTier();
    const pool = [...(CARDS_BY_TIER[tier] || [])];

    // Fisher-Yates shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    for (const c of pool) {
      const s = await getOrInitStat(c.id, c.tier);
      if (s.totalSpawned < s.maxCopies) { card = c; stat = s; break; }
    }

    // T1 fallback if tier is exhausted
    if (!card) {
      const t1 = [...(CARDS_BY_TIER['1'] || [])];
      for (let i = t1.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [t1[i], t1[j]] = [t1[j], t1[i]];
      }
      for (const c of t1) {
        const s = await getOrInitStat(c.id, '1');
        if (s.totalSpawned < s.maxCopies) { card = c; stat = s; break; }
      }
    }
    if (!card) { console.warn('[CardSystem] No spawnable card found.'); return; }
  }

  if (!bypassCap && stat.totalSpawned >= stat.maxCopies) {
    console.warn(`[CardSystem] ${card.id} at max copies. Skipping.`);
    return;
  }

  stat.totalSpawned  += 1;
  stat.lastSpawnedAt  = new Date();
  await stat.save();

  const copyNumber = stat.totalSpawned;
  const price      = calcPrice(card.tier, copyNumber, stat.maxCopies);
  const caption    = buildSpawnCaption(card, copyNumber, stat.maxCopies, price);

  try {
    const res = await axios.get(card.imageUrl, {
      responseType: 'arraybuffer',
      timeout: 12000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    await inst.sock_ref.sendMessage(group, {
      image:    Buffer.from(res.data),
      caption,
      mimetype: 'image/jpeg'
    });

    inst.activeSpawns.set(card.id, {
      card, copyNumber, stat, price,
      groupJid:  group,
      spawnedAt: Date.now(),
      expiresAt: Date.now() + CLAIM_WINDOW_MS
    });

    console.log(`[CardSystem] Spawned: ${card.cardName} (T${card.tier}) #${copyNumber}/${stat.maxCopies}`);
    return { card, copyNumber, stat, price };

  } catch (err) {
    console.error('[CardSystem] Image send failed — rolling back:', err.message);
    stat.totalSpawned -= 1;
    await stat.save();
  }
}

// Expire unclaimed spawns every minute (Checks all instances)
setInterval(() => {
  const now = Date.now();
  for (const inst of instances.values()) {
    for (const [id, sp] of inst.activeSpawns.entries()) {
      if (now > sp.expiresAt) inst.activeSpawns.delete(id);
    }
  }
}, 60_000);

// ═══════════════════════════════════════════════════════════════════════════
//  SECTION 7 — ALL COMMAND HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

// ─── 7.1  .g cards on/off ───────────────────────────────────────────────────
async function cmdToggle(sub, senderJid, groupJid, reply, senderIsAdmin) {
  const inst = getInst();
  // Allow Global Admins, Owner, OR WhatsApp Group Admins to toggle
  if (!inst.adminJids.has(senderJid) && senderJid !== inst.ownerJid && !senderIsAdmin) {
    return reply('❌ Only admins can toggle the card system.');
  }
  if (sub === 'on') {
    if (inst.activeGroups.has(groupJid)) return reply('⚠️ Card system is already *ON* in this group.');
    inst.activeGroups.add(groupJid);
    
    // Spawn one immediately for THIS group
    doSpawn(null, null, false, groupJid);

    // Setup singleton timer for this instance if not already running
    if (!inst.spawnTimer) {
      inst.spawnTimer = setInterval(() => {
        for (const gid of inst.activeGroups) {
          doSpawn(null, null, false, gid);
        }
      }, 30 * 60 * 1000);
    }

    return reply(
`✅ *CARD SYSTEM IS NOW ONLINE*

🃏  Cards will spawn in this group every *30 minutes*
🕹️  Players claim with *.g claim <id>*
📦  View collection with *.g coll*

_Use_ *.g cards off* _to stop._`
    );
  }
  if (sub === 'off') {
    if (!inst.activeGroups.has(groupJid)) return reply('⚠️ Card system is already *OFF* in this group.');
    inst.activeGroups.delete(groupJid);
    
    // If no more groups, we can stop the timer (optional optimization)
    if (inst.activeGroups.size === 0 && inst.spawnTimer) {
      clearInterval(inst.spawnTimer);
      inst.spawnTimer = null;
    }

    return reply('🔴 *Card system is now OFF in this group.*');
  }
  return reply('Usage: *.g cards on* or *.g cards off*');
}

// ─── 7.1b  Mod Management (Owner Only) ───────────────────────────────────────
async function cmdManageRole(type, action, targetJid, reply) {
  const inst = getInst();
  if (!targetJid) return reply('❌ Tag a user.');
  
  const set = type === 'admin' ? inst.adminJids : inst.modJids;
  const label = type === 'admin' ? 'Card Admin' : 'Card Moderator';

  if (action === 'add') {
    set.add(targetJid);
    return reply(`✅ @${targetJid.split('@')[0]} is now a *${label}*.`);
  } else {
    set.delete(targetJid);
    return reply(`👤 @${targetJid.split('@')[0]} removed from *${label}* roles.`);
  }
}

// ─── 7.2  .g claim <id> ─────────────────────────────────────────────────────
async function cmdClaim(cardId, senderJid, reply) {
  const inst = getInst();
  if (!cardId) return reply('❌ Usage: *.g claim <card-id>*\nExample: `.g claim 1-00001`');

  const now = Date.now();
  for (const [id, sp] of inst.activeSpawns.entries()) {
    if (now > sp.expiresAt) inst.activeSpawns.delete(id);
  }

  const spawn = inst.activeSpawns.get(cardId);
  if (!spawn) return reply(`❌ No active card with ID \`${cardId}\`\n_It was already claimed, expired, or the ID is wrong._`);

  try {
    await UserCard.create({ userId: senderJid, cardId: spawn.card.id, copyNumber: spawn.copyNumber });
    spawn.stat.totalCirculation += 1;
    spawn.stat.uniqueOwners     += 1;
    await spawn.stat.save();
    inst.activeSpawns.delete(cardId);

    const tier   = String(spawn.card.tier);
    const rarity = getRarityLabel(spawn.copyNumber, spawn.stat.maxCopies);
    return reply(
`${rarity.emoji}  *CLAIMED!*

*${spawn.card.cardName}*  —  _${spawn.card.animeName}_
${TIER_STARS[tier]}  ${TIER_LABEL[tier]}  •  ${rarity.label}
📋  Copy *#${spawn.copyNumber}* of *${spawn.stat.maxCopies}*
🎨  Art by *${spawn.card.creator || 'Unknown'}*

_Added to your collection!  Check it with_ *.g coll*`
    );
  } catch (err) {
    console.error('[CardSystem] Claim error:', err.message);
    return reply('❌ Claim failed. Please try again.');
  }
}

// ─── 7.3  .g coll ───────────────────────────────────────────────────────────
async function cmdColl(senderJid, reply) {
  const owned = await UserCard.find({ userId: senderJid }).sort({ createdAt: 1 });
  if (!owned.length) return reply('📭 You have no cards yet.\n_Wait for one to spawn and use_ *.g claim <id>*');

  const lines = [];
  for (let i = 0; i < owned.length; i++) {
    const uc   = owned[i];
    const card = CARD_INDEX[uc.cardId];
    if (!card) continue;
    const stat = await CardStat.findOne({ cardId: uc.cardId });
    lines.push(`${cardLine(i + 1, card, uc, stat)}${uc.forSale ? '  🏷️ _[LISTED]_' : ''}`);
  }

  const header = `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n   🗃️  *YOUR COLLECTION*\n   _${owned.length} card${owned.length !== 1 ? 's' : ''}  •  by acquired time_\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n`;

  for (let s = 0; s < lines.length; s += 30) {
    await reply((s === 0 ? header : '') + lines.slice(s, s + 30).join('\n'));
  }
}

// ─── 7.4  .g card --tier ─────────────────────────────────────────────────────
async function cmdCollByTier(senderJid, reply) {
  const owned = await UserCard.find({ userId: senderJid });
  if (!owned.length) return reply('📭 You have no cards yet.');

  const byTier = {};
  for (const uc of owned) {
    const card = CARD_INDEX[uc.cardId];
    if (!card) continue;
    const t = String(card.tier);
    if (!byTier[t]) byTier[t] = [];
    byTier[t].push({ uc, card });
  }

  let msg = `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n   🗂️  *COLLECTION BY TIER*\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n`;
  for (const tier of ['S', '6', '5', '4', '3', '2', '1']) {
    const group = byTier[tier];
    if (!group?.length) continue;
    msg += `${TIER_STARS[tier]}  *${TIER_LABEL[tier]}*  (${group.length})\n`;
    for (const { uc, card } of group) {
      const stat   = await CardStat.findOne({ cardId: uc.cardId });
      const rarity = getRarityLabel(uc.copyNumber, stat?.maxCopies || BASE_MAX[tier] || 200);
      msg += `  •  ${card.cardName}  _(${card.animeName})_  ${rarity.emoji}\n`;
    }
    msg += '\n';
  }
  return reply(msg);
}

// ─── 7.5  .g duplicate ──────────────────────────────────────────────────────
async function cmdDuplicate(senderJid, reply) {
  const owned = await UserCard.find({ userId: senderJid });
  if (!owned.length) return reply('📭 You own no cards.');

  const counts = {};
  for (const uc of owned) counts[uc.cardId] = (counts[uc.cardId] || 0) + 1;
  const dupes = Object.entries(counts).filter(([, c]) => c > 1);

  if (!dupes.length) return reply('✅ No duplicates! Every copy you own is unique.');

  let msg = `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n   🔁  *YOUR DUPLICATES*\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n`;
  for (const [cardId, count] of dupes) {
    const card = CARD_INDEX[cardId];
    if (!card) continue;
    msg += `${TIER_STARS[String(card.tier)]}  *${card.cardName}*  ×${count}  _${card.animeName}_\n`;
  }
  msg += `\n_Use_ *.g merge <card-id>* _to combine duplicates._`;
  return reply(msg);
}

// ─── 7.6  .g merge <card-id> ────────────────────────────────────────────────
async function cmdMerge(cardId, senderJid, reply) {
  if (!cardId) return reply('❌ Usage: *.g merge <card-id>*\nYou need 2+ copies to merge.\nExample: `.g merge 1-00001`');

  const copies = await UserCard.find({ userId: senderJid, cardId }).sort({ copyNumber: 1 });
  if (copies.length < 2) return reply(`❌ You only own *${copies.length}* copy of \`${cardId}\`. Need at least 2.`);

  const card = CARD_INDEX[cardId];
  const stat = await CardStat.findOne({ cardId });
  const keep = copies[0];

  await UserCard.deleteOne({ _id: copies[1]._id });
  if (stat) { stat.totalCirculation = Math.max(0, stat.totalCirculation - 1); await stat.save(); }

  const rarity = getRarityLabel(keep.copyNumber, stat?.maxCopies || BASE_MAX[String(card?.tier)] || 200);
  return reply(
`♻️  *MERGE COMPLETE*

*${card?.cardName || cardId}*  —  _${card?.animeName}_
${TIER_STARS[String(card?.tier)]}  ${TIER_LABEL[String(card?.tier)]}

📉  2 copies  →  1 copy
📋  Kept Copy *#${keep.copyNumber}*  (${rarity.emoji} ${rarity.label})
🗑️  Duplicate destroyed.

_You now own ${copies.length - 1} cop${copies.length - 1 === 1 ? 'y' : 'ies'} of this card._`
  );
}

// ─── 7.7  .g cs <name> [tier <n>] ───────────────────────────────────────────
async function cmdSearchCard(args, reply) {
  const raw        = args.join(' ');
  const tierMatch  = raw.match(/tier\s*(\w)/i);
  const tierNum    = tierMatch ? tierMatch[1].toUpperCase() : null;
  const name       = raw.replace(/tier\s*\w/i, '').trim();

  if (!name) return reply('❌ Usage: *.g cs <card name>* or *.g cs <card name> tier <n>*\nExample: `.g cs Edward Elric tier 5`');

  let matches = ALL_CARDS.filter(c => c.cardName.toLowerCase().includes(name.toLowerCase()));
  if (tierNum) matches = matches.filter(c => String(c.tier).toUpperCase() === tierNum);

  if (!matches.length) return reply(`❌ No cards matching "*${name}*"${tierNum ? ` Tier ${tierNum}` : ''}.`);

  let msg = `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n   🔍  *CARD SEARCH*\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n`;
  for (const card of matches.slice(0, 10)) {
    const stat    = await CardStat.findOne({ cardId: card.id });
    const spawned = stat?.totalSpawned  || 0;
    const maxCop  = stat?.maxCopies     || BASE_MAX[String(card.tier)] || 200;
    const owners  = stat?.uniqueOwners  || 0;
    msg += `${TIER_STARS[String(card.tier)]}  *${card.cardName}*  _(${card.animeName})_\n`;
    msg += `   🆔 \`${card.id}\`  •  🎨 ${card.creator || 'Unknown'}\n`;
    msg += `   📋 ${spawned}/${maxCop} copies  •  👤 ${owners} owner${owners !== 1 ? 's' : ''}\n\n`;
  }
  if (matches.length > 10) msg += `_...and ${matches.length - 10} more results. Narrow your search._`;
  return reply(msg);
}

// ─── 7.8  .g cg @user Deck <n> ──────────────────────────────────────────────
async function cmdGiveCard(args, senderJid, mentionedJid, reply) {
  if (!mentionedJid) return reply('❌ Tag the recipient.\nExample: `.g cg @User Deck 4`');
  const deckNumMatch = args.join(' ').match(/deck\s+(\d+)/i);
  const deckNum      = deckNumMatch ? parseInt(deckNumMatch[1]) : null;
  if (!deckNum) return reply('❌ Specify deck slot.\nExample: `.g cg @User Deck 4`');

  const deckCards = await UserCard.find({ userId: senderJid, inMainDeck: true }).sort({ mainDeckSlot: 1 });
  const target    = deckCards.find(uc => uc.mainDeckSlot === deckNum);
  if (!target) return reply(`❌ No card in Deck slot *#${deckNum}*.`);

  const card = CARD_INDEX[target.cardId];
  target.userId = mentionedJid; target.inMainDeck = false; target.mainDeckSlot = null;
  await target.save();

  const stat   = await CardStat.findOne({ cardId: target.cardId });
  const rarity = getRarityLabel(target.copyNumber, stat?.maxCopies || BASE_MAX[String(card?.tier)] || 200);
  return reply(
`🎁  *CARD GIVEN!*

*${card?.cardName || target.cardId}*  —  _${card?.animeName}_
${TIER_STARS[String(card?.tier)]}  ${rarity.emoji} ${rarity.label}
📋  Copy *#${target.copyNumber}*

👤  Sent to  @${mentionedJid.split('@')[0]}`
  );
}

// ─── 7.9  .g sc <deck#> <price> ─────────────────────────────────────────────
async function cmdSellCard(args, senderJid, reply) {
  const deckNum = parseInt(args[0]);
  const price   = parseInt(String(args[1] || '').replace(/,/g, ''));
  if (!deckNum || isNaN(price) || price <= 0) {
    return reply('❌ Usage: *.g sc <deck-slot> <price>*\nExample: `.g sc 2 400000`');
  }
  const deckCards = await UserCard.find({ userId: senderJid, inMainDeck: true }).sort({ mainDeckSlot: 1 });
  const target    = deckCards.find(uc => uc.mainDeckSlot === deckNum);
  if (!target) return reply(`❌ No card in Deck slot *#${deckNum}*.`);
  if (target.forSale) return reply('⚠️ That card is already listed. Use *.g cancel sale* first.');

  const card = CARD_INDEX[target.cardId];
  target.forSale = true; target.salePrice = price; await target.save();
  await CardMarket.create({ userCardId: target._id, cardId: target.cardId, sellerId: senderJid, type: 'sale', price });

  return reply(
`🏷️  *CARD LISTED*

*${card?.cardName || target.cardId}*
💰  Price: *${ZENI()}${price.toLocaleString()}*

_Players buy it with_ *.g buycard*
_Remove listing with_ *.g cancel sale*`
  );
}

// ─── 7.10  .g cancel sale ────────────────────────────────────────────────────
async function cmdCancelSale(senderJid, reply) {
  const listing = await CardMarket.findOne({ sellerId: senderJid, status: 'active', type: 'sale' });
  if (!listing) return reply('❌ You have no active sale listings.');

  const uc = await UserCard.findById(listing.userCardId);
  if (uc) { uc.forSale = false; uc.salePrice = null; await uc.save(); }
  listing.status = 'cancelled'; await listing.save();

  const card = CARD_INDEX[listing.cardId];
  return reply(`✅ *Sale cancelled.* *${card?.cardName || listing.cardId}* removed from market.`);
}

// ─── 7.11  .g buycard [listing#] ─────────────────────────────────────────────
async function cmdBuyCard(args, senderJid, economy, reply) {
  const listings = await CardMarket.find({ status: 'active', type: 'sale' }).sort({ price: 1 }).limit(20);
  const buyIndex = parseInt(args[0]) - 1;

  if (isNaN(buyIndex)) {
    // Show market
    if (!listings.length) return reply('🏪 Marketplace is empty. No cards are for sale.');
    let msg = `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n   🏪  *CARD MARKETPLACE*\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n`;
    listings.forEach((l, i) => {
      const card = CARD_INDEX[l.cardId];
      msg += `*${i + 1}.*  ${card?.cardName || l.cardId}  _(${card?.animeName || ''})_\n`;
      msg += `      💰 ${ZENI()}${l.price.toLocaleString()}  •  Seller: @${l.sellerId.split('@')[0]}\n\n`;
    });
    msg += `_To buy: *.g buycard <number>*_`;
    return reply(msg);
  }

  const listing = listings[buyIndex];
  if (!listing) return reply('❌ Invalid number. Type *.g buycard* to see the market.');
  if (listing.sellerId === senderJid) return reply('❌ You can\'t buy your own listing.');

  const balance = economy.getBalance(senderJid);
  if (balance < listing.price) {
    return reply(`❌ Need ${ZENI()}${listing.price.toLocaleString()}, you have ${ZENI()}${balance.toLocaleString()}.`);
  }

  economy.removeMoney(senderJid,      listing.price, 'Card purchase');
  economy.addMoney(listing.sellerId,  listing.price, 'Card sold');

  const uc = await UserCard.findById(listing.userCardId);
  if (uc) { uc.userId = senderJid; uc.forSale = false; uc.salePrice = null; uc.inMainDeck = false; uc.mainDeckSlot = null; await uc.save(); }

  const stat = await CardStat.findOne({ cardId: listing.cardId });
  if (stat) { stat.lastTradePrice = listing.price; stat.recentTradePrices = [...(stat.recentTradePrices || []).slice(-4), listing.price]; await stat.save(); }
  listing.status = 'sold'; listing.completedAt = new Date(); await listing.save();

  const card = CARD_INDEX[listing.cardId];
  return reply(
`✅  *PURCHASE COMPLETE*

*${card?.cardName || listing.cardId}*  acquired!
💰  Spent: *${ZENI()}${listing.price.toLocaleString()}*
💳  Balance: *${ZENI()}${(balance - listing.price).toLocaleString()}*

_View it with_ *.g coll*`
  );
}

// ─── 7.12  .g bid <amount> ───────────────────────────────────────────────────
async function cmdBid(args, senderJid, economy, reply) {
  const amount = parseInt(String(args[0] || '').replace(/,/g, ''));
  if (!amount || amount <= 0) return reply('❌ Usage: *.g bid <amount>*\nExample: `.g bid 300000`');

  const auction = await CardMarket.findOne({ status: 'active', type: 'auction', auctionEndsAt: { $gt: new Date() } });
  if (!auction) return reply('❌ No active auction right now.');
  if (auction.sellerId === senderJid) return reply('❌ Can\'t bid on your own auction.');

  const minBid = auction.currentBid > 0 ? auction.currentBid + 1 : auction.price;
  if (amount < minBid) return reply(`❌ Min bid is *${ZENI()}${minBid.toLocaleString()}*. Current: ${ZENI()}${auction.currentBid.toLocaleString()}`);

  const balance = economy.getBalance(senderJid);
  if (balance < amount) return reply(`❌ Not enough funds. Balance: ${ZENI()}${balance.toLocaleString()}`);

  auction.bids.push({ bidderId: senderJid, amount });
  auction.currentBid   = amount;
  auction.highBidderId = senderJid;
  await auction.save();

  const card     = CARD_INDEX[auction.cardId];
  const timeLeft = Math.max(0, Math.round((new Date(auction.auctionEndsAt) - Date.now()) / 60000));
  return reply(
`🔨  *BID PLACED*

*${card?.cardName || auction.cardId}*
💰  Your bid: *${ZENI()}${amount.toLocaleString()}*
⏱️  Time left: *${timeLeft} min${timeLeft !== 1 ? 's' : ''}*

_Outbid someone with_ *.g bid <higher>*`
  );
}

// ─── 7.13  .g deck ───────────────────────────────────────────────────────────
async function cmdDeck(senderJid, reply) {
  const deckCards = await UserCard.find({ userId: senderJid, inMainDeck: true }).sort({ mainDeckSlot: 1 });
  const slotMap   = {};
  for (const uc of deckCards) slotMap[uc.mainDeckSlot] = uc;

  let msg = `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n   🃏  *YOUR DECK*  (${deckCards.length}/${MAIN_DECK_SIZE})\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n`;

  for (let slot = 1; slot <= MAIN_DECK_SIZE; slot++) {
    const uc = slotMap[slot];
    if (!uc) { msg += `*${slot}.*  ░ _(empty)_\n`; continue; }
    const card   = CARD_INDEX[uc.cardId];
    const stat   = await CardStat.findOne({ cardId: uc.cardId });
    const rarity = getRarityLabel(uc.copyNumber, stat?.maxCopies || BASE_MAX[String(card?.tier)] || 200);
    msg += `*${slot}.*  ${TIER_STARS[String(card?.tier)] || '✦'}  *${card?.cardName || uc.cardId}*  ${rarity.emoji}\n`;
  }

  msg += `\n_*.g t2deck <coll#>* to add  •  *.g swap card <a> and <b>* to rearrange_`;
  return reply(msg);
}

// ─── 7.14  .g swap card <a> and <b> ─────────────────────────────────────────
async function cmdSwapCard(args, senderJid, reply) {
  const nums = args.join(' ').replace(/and/gi, '').match(/\d+/g);
  if (!nums || nums.length < 2) return reply('❌ Usage: *.g swap card <slot-a> and <slot-b>*\nExample: `.g swap card 2 and 4`');
  const [slotA, slotB] = [parseInt(nums[0]), parseInt(nums[1])];
  if (slotA < 1 || slotA > MAIN_DECK_SIZE || slotB < 1 || slotB > MAIN_DECK_SIZE) {
    return reply(`❌ Slots must be between 1 and ${MAIN_DECK_SIZE}.`);
  }
  const [cardA] = await UserCard.find({ userId: senderJid, inMainDeck: true, mainDeckSlot: slotA });
  const [cardB] = await UserCard.find({ userId: senderJid, inMainDeck: true, mainDeckSlot: slotB });
  if (!cardA && !cardB) return reply(`❌ Both slots ${slotA} and ${slotB} are empty.`);
  if (cardA) { cardA.mainDeckSlot = slotB; await cardA.save(); }
  if (cardB) { cardB.mainDeckSlot = slotA; await cardB.save(); }
  const nameA = cardA ? (CARD_INDEX[cardA.cardId]?.cardName || cardA.cardId) : '_(empty)_';
  const nameB = cardB ? (CARD_INDEX[cardB.cardId]?.cardName || cardB.cardId) : '_(empty)_';
  return reply(`🔀  *SWAPPED*\n\nSlot *${slotA}* ↔ Slot *${slotB}*\n_${nameA}_  ↔  _${nameB}_`);
}

// ─── 7.15  .g t2deck <coll#> ─────────────────────────────────────────────────
async function cmdT2Deck(args, senderJid, reply) {
  const collNum = parseInt(args[0]);
  if (!collNum) return reply('❌ Usage: *.g t2deck <collection-number>*\nExample: `.g t2deck 300`');
  const owned  = await UserCard.find({ userId: senderJid }).sort({ createdAt: 1 });
  const target = owned[collNum - 1];
  if (!target) return reply(`❌ No card at collection position #${collNum}.`);
  if (target.inMainDeck) return reply('⚠️ That card is already in your deck.');
  const deckCards = await UserCard.find({ userId: senderJid, inMainDeck: true });
  if (deckCards.length >= MAIN_DECK_SIZE) return reply(`❌ Deck is full (${MAIN_DECK_SIZE}/${MAIN_DECK_SIZE}). Remove a card first with *.g t2coll <slot>*`);
  const usedSlots = new Set(deckCards.map(c => c.mainDeckSlot));
  let freeSlot = null;
  for (let s = 1; s <= MAIN_DECK_SIZE; s++) { if (!usedSlots.has(s)) { freeSlot = s; break; } }
  target.inMainDeck = true; target.mainDeckSlot = freeSlot; await target.save();
  const card = CARD_INDEX[target.cardId];
  return reply(`✅  *${card?.cardName || target.cardId}*  →  Deck Slot *#${freeSlot}*\n_Use_ *.g deck* _to view._`);
}

// ─── 7.16  .g t2coll <deck#> ─────────────────────────────────────────────────
async function cmdT2Coll(args, senderJid, reply) {
  const deckNum = parseInt(args[0]);
  if (!deckNum) return reply('❌ Usage: *.g t2coll <deck-slot>*\nExample: `.g t2coll 4`');
  const [target] = await UserCard.find({ userId: senderJid, inMainDeck: true, mainDeckSlot: deckNum });
  if (!target) return reply(`❌ No card in deck slot *#${deckNum}*.`);
  target.inMainDeck = false; target.mainDeckSlot = null; await target.save();
  const card = CARD_INDEX[target.cardId];
  return reply(`✅  *${card?.cardName || target.cardId}*  returned to collection from slot #${deckNum}.`);
}

// ─── 7.17  .g t2cdeck <DeckName> <coll#> ────────────────────────────────────
async function cmdT2CDeck(args, senderJid, reply) {
  if (args.length < 2) return reply('❌ Usage: *.g t2cdeck <Deck Name> <coll-number>*\nExample: `.g t2cdeck My Bawls 12`');
  const collNum  = parseInt(args[args.length - 1]);
  const deckName = args.slice(0, -1).join(' ');
  if (!collNum || !deckName) return reply('❌ Usage: *.g t2cdeck <Deck Name> <coll-number>*');
  const deck = await CardDeck.findOne({ userId: senderJid, name: new RegExp(`^${deckName}$`, 'i') });
  if (!deck) return reply(`❌ No deck named *"${deckName}"*. Create one with *.g create deck ${deckName}*`);
  const owned  = await UserCard.find({ userId: senderJid }).sort({ createdAt: 1 });
  const target = owned[collNum - 1];
  if (!target) return reply(`❌ No card at collection position #${collNum}.`);
  if (target.inCustomDeck) return reply('⚠️ That card is already in a custom deck.');
  deck.cards.push(target._id); await deck.save();
  target.inCustomDeck = true; target.customDeckName = deck.name; target.customDeckSlot = deck.cards.length; await target.save();
  const card = CARD_INDEX[target.cardId];
  return reply(`✅  *${card?.cardName || target.cardId}*  added to *"${deck.name}"*  (slot #${deck.cards.length})`);
}

// ─── 7.18  .g t2ccoll <DeckName> <slot#> ────────────────────────────────────
async function cmdT2CColl(args, senderJid, reply) {
  if (args.length < 2) return reply('❌ Usage: *.g t2ccoll <Deck Name> <slot-number>*\nExample: `.g t2ccoll My Bawls 3`');
  const slotNum  = parseInt(args[args.length - 1]);
  const deckName = args.slice(0, -1).join(' ');
  const deck = await CardDeck.findOne({ userId: senderJid, name: new RegExp(`^${deckName}$`, 'i') });
  if (!deck) return reply(`❌ No deck named *"${deckName}"*.`);
  const cardObjId = deck.cards[slotNum - 1];
  if (!cardObjId) return reply(`❌ No card in slot #${slotNum} of *"${deckName}"*.`);
  const uc = await UserCard.findById(cardObjId);
  if (!uc) return reply('❌ Card record not found.');
  deck.cards.splice(slotNum - 1, 1); await deck.save();
  uc.inCustomDeck = false; uc.customDeckName = null; uc.customDeckSlot = null; await uc.save();
  const card = CARD_INDEX[uc.cardId];
  return reply(`✅  *${card?.cardName || uc.cardId}*  returned to collection from *"${deck.name}"*.`);
}

// ─── 7.19  .g create deck <name>  (admin/owner only) ────────────────────────
async function cmdCreateDeck(deckName, senderJid, reply) {
  if (!deckName) return reply('❌ Usage: *.g create deck <name>*\nExample: `.g create deck My Bawls`');
  const exists = await CardDeck.findOne({ userId: senderJid, name: new RegExp(`^${deckName}$`, 'i') });
  if (exists) return reply(`❌ You already have a deck called *"${deckName}"*.`);
  await CardDeck.create({ userId: senderJid, name: deckName, cards: [] });
  return reply(
`✅  *CUSTOM DECK CREATED*

📁  *"${deckName}"*
_Add cards:_ *.g t2cdeck ${deckName} <coll#>*
_View:_ *.g cdeck ${deckName}*
_List all:_ *.g list decks*`
  );
}

// ─── 7.20  .g cdeck <name> [slot#] ──────────────────────────────────────────
async function cmdCDeck(args, senderJid, reply) {
  const slotMaybe = parseInt(args[args.length - 1]);
  let deckName, slotNum = null;
  if (!isNaN(slotMaybe)) { slotNum = slotMaybe; deckName = args.slice(0, -1).join(' '); }
  else deckName = args.join(' ');
  if (!deckName) return reply('❌ Usage: *.g cdeck <Deck Name>* or *.g cdeck <Deck Name> <slot#>*');

  const deck = await CardDeck.findOne({ userId: senderJid, name: new RegExp(`^${deckName}$`, 'i') }).populate('cards');
  if (!deck) return reply(`❌ No deck named *"${deckName}"*. Use *.g list decks* to see yours.`);

  if (slotNum !== null) {
    const uc = deck.cards[slotNum - 1];
    if (!uc) return reply(`❌ No card in slot #${slotNum} of *"${deckName}"*.`);
    const card   = CARD_INDEX[uc.cardId];
    const stat   = await CardStat.findOne({ cardId: uc.cardId });
    const rarity = getRarityLabel(uc.copyNumber, stat?.maxCopies || 200);
    return reply(
`📁  *"${deckName}"*  —  Slot *#${slotNum}*

${TIER_STARS[String(card?.tier)] || '✦'}  *${card?.cardName || uc.cardId}*
_${card?.animeName}_
${rarity.emoji}  ${rarity.label}  •  Copy *#${uc.copyNumber}*
🎨  Art by *${card?.creator || 'Unknown'}*`
    );
  }

  let msg = `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n   📁  *${deck.name}*\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n`;
  if (!deck.cards.length) { msg += '_(Empty — add cards with *.g t2cdeck*)_'; }
  else {
    for (let i = 0; i < deck.cards.length; i++) {
      const uc   = deck.cards[i];
      const card = CARD_INDEX[uc.cardId];
      msg += `*${i + 1}.*  ${TIER_STARS[String(card?.tier)] || '✦'}  *${card?.cardName || uc.cardId}*  _(${card?.animeName || ''})_\n`;
    }
  }
  msg += `\n_${deck.cards.length} card${deck.cards.length !== 1 ? 's' : ''} in deck_`;
  return reply(msg);
}

// ─── 7.21  .g list decks ─────────────────────────────────────────────────────
async function cmdListDecks(senderJid, reply) {
  const decks = await CardDeck.find({ userId: senderJid });
  if (!decks.length) return reply('📭 No custom decks.\n_Create one with_ *.g create deck <name>*');
  let msg = `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n   📂  *YOUR CUSTOM DECKS*\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n`;
  decks.forEach((d, i) => { msg += `*${i + 1}.*  📁  *${d.name}*  —  ${d.cards.length} card${d.cards.length !== 1 ? 's' : ''}\n`; });
  msg += `\n_View: *.g cdeck <name>*_`;
  return reply(msg);
}

// ─── 7.22  .g rename deck <old> | <new> ─────────────────────────────────────
async function cmdRenameDeck(args, senderJid, reply) {
  const raw   = args.join(' ');
  const parts = raw.split('|').map(s => s.trim());
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    return reply('❌ Usage: *.g rename deck <Old Name> | <New Name>*\nExample: `.g rename deck Alchemy | My Bawls`');
  }
  const [oldName, newName] = parts;
  const deck = await CardDeck.findOne({ userId: senderJid, name: new RegExp(`^${oldName}$`, 'i') });
  if (!deck) return reply(`❌ No deck named *"${oldName}"*.`);
  await UserCard.updateMany({ userId: senderJid, customDeckName: deck.name }, { $set: { customDeckName: newName } });
  deck.name = newName; await deck.save();
  return reply(`✅  *"${oldName}"*  →  *"${newName}"*`);
}

// ─── 7.23  .g delete deck <name> ─────────────────────────────────────────────
async function cmdDeleteDeck(args, senderJid, reply) {
  const deckName = args.join(' ').trim();
  if (!deckName) return reply('❌ Usage: *.g delete deck <name>*');
  const deck = await CardDeck.findOne({ userId: senderJid, name: new RegExp(`^${deckName}$`, 'i') }).populate('cards');
  if (!deck) return reply(`❌ No deck named *"${deckName}"*.`);
  const cardCount = deck.cards.length;
  if (cardCount > 0) await UserCard.deleteMany({ _id: { $in: deck.cards.map(c => c._id) } });
  await CardDeck.deleteOne({ _id: deck._id });
  return reply(
`🗑️  *DECK DELETED*

*"${deckName}"* permanently removed.
${cardCount > 0 ? `⚠️  *${cardCount} card${cardCount !== 1 ? 's' : ''}* inside were also deleted.` : '_The deck was empty._'}`
  );
}

// ─── 7.24  .g cltr <series> ──────────────────────────────────────────────────
async function cmdCollector(args, reply) {
  const seriesName = args.join(' ').trim();
  if (!seriesName) return reply('❌ Usage: *.g cltr <series name>*\nExample: `.g cltr Dragon Ball`');

  const seriesCards = ALL_CARDS.filter(c => c.animeName.toLowerCase().includes(seriesName.toLowerCase()));
  if (!seriesCards.length) return reply(`❌ No cards found for series *"${seriesName}"*.`);

  const cardIdSet = new Set(seriesCards.map(c => c.id));
  const owned     = await UserCard.find({ cardId: { $in: [...cardIdSet] } });

  const userCounts = {};
  for (const uc of owned) userCounts[uc.userId] = (userCounts[uc.userId] || 0) + 1;

  const sorted = Object.entries(userCounts).sort(([, a], [, b]) => b - a).slice(0, 3);
  if (!sorted.length) return reply(`📭 Nobody owns any *${seriesCards[0].animeName}* cards yet.`);

  const medals = ['🥇', '🥈', '🥉'];
  let msg = `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n   🏆  *TOP COLLECTORS*\n   _${seriesCards[0].animeName}_\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n`;
  sorted.forEach(([uid, count], i) => {
    msg += `${medals[i]}  @${uid.split('@')[0]}  —  *${count}* card${count !== 1 ? 's' : ''}\n`;
  });
  msg += `\n_Series total: ${seriesCards.length} cards_`;
  return reply(msg);
}

// ─── 7.25  .g series <name>  (mod only) ──────────────────────────────────────
async function cmdSeries(args, senderJid, reply) {
  const inst = getInst();
  if (!inst.modJids.has(senderJid) && senderJid !== inst.ownerJid) {
    return reply('❌ This command is for moderators only.');
  }
  const seriesName = args.join(' ').trim();
  if (!seriesName) return reply('❌ Usage: *.g series <series name>*');

  const cards = ALL_CARDS.filter(c => c.animeName.toLowerCase().includes(seriesName.toLowerCase()));
  if (!cards.length) return reply(`❌ No series found matching *"${seriesName}"*.`);

  const tierOrder = { S: 0, '6': 1, '5': 2, '4': 3, '3': 4, '2': 5, '1': 6 };
  cards.sort((a, b) => (tierOrder[String(a.tier)] || 9) - (tierOrder[String(b.tier)] || 9));

  const actualSeries = cards[0].animeName;
  let msg = `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n   📋  *${actualSeries.toUpperCase()}*\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n`;
  let currentTier = null;
  for (const card of cards) {
    const t = String(card.tier);
    if (t !== currentTier) { msg += `\n${TIER_STARS[t]}  *${TIER_LABEL[t]}*\n`; currentTier = t; }
    msg += `  •  \`${card.id}\`  ${card.cardName}  _by ${card.creator || 'Unknown'}_\n`;
  }
  msg += `\n_${cards.length} card${cards.length !== 1 ? 's' : ''} total_`;
  return reply(msg);
}

// ─── 7.26  .g spawn | <name or id> | <tier>  (owner DMs only) ───────────────
async function cmdOwnerSpawn(rawArgs, senderJid, chatId, reply) {
  const inst = getInst();
  if (senderJid !== inst.ownerJid) return reply('❌ This command is exclusive to the server owner.');
  if (chatId.endsWith('@g.us')) return reply('❌ The *.g spawn* command only works in DMs with Olivier. Cannot be used in group chats.');

  const parts   = rawArgs.split('|').map(s => s.trim()).filter(Boolean);
  const query   = parts[0] || '';
  const tierArg = parts[1] ? parts[1].replace(/[^0-9SsTt]/g, '').replace(/[Tt]/g, '').toUpperCase() : null;

  if (!query) {
    return reply(
`❌ Usage: *.g spawn | <card name or ID> | <tier>*

Examples:
\`.g spawn | Edward Elric | 5\`
\`.g spawn | 3-04521\`
\`.g spawn | Naruto | S\``
    );
  }

  let card = CARD_INDEX[query];
  if (!card) {
    let pool = ALL_CARDS.filter(c => c.cardName.toLowerCase().includes(query.toLowerCase()));
    if (tierArg) pool = pool.filter(c => String(c.tier).toUpperCase() === tierArg);
    card = pool[0];
  }

  if (!card) return reply(`❌ No card found matching: *${query}*${tierArg ? ` (Tier ${tierArg})` : ''}`);

  if (inst.activeGroups.size === 0) return reply('❌ Card system is not ON in any group. Turn it on first with *.g cards on* in the target group.');

  // Send to the first active group found
  const targetGroup = [...inst.activeGroups][0];
  const result = await doSpawn(card.id, String(card.tier), true, targetGroup);
  if (result) {
    return reply(`✨  Spawned *${result.card.cardName}*  (T${result.card.tier})  copy *#${result.copyNumber}*  →  sent to active group.`);
  } else {
    return reply('❌ Spawn failed. Check that the card image URL is still live.');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  SECTION 8 — MAIN COMMAND ROUTER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Call this from engine.js inside your messages.upsert handler,
 * BEFORE falling through to other commands.
 *
 * @param {object} opts
 * @param {string} opts.lowerTxt      Full lowercased + cleaned message text
 * @param {string} opts.txt           Original message text (preserves case for names/prices)
 * @param {string} opts.senderJid     Sender's WhatsApp JID
 * @param {string} opts.chatId        Chat JID (group or DM)
 * @param {object} opts.m             Raw Baileys message object
 * @param {object} opts.economy       Your economy module (getBalance, addMoney, removeMoney)
 * @param {boolean} opts.isOwner      Is sender the bot owner?
 * @param {boolean} opts.senderIsAdmin Is sender a group admin?
 * @returns {boolean} true if a card command was matched and handled — caller should return early
 */
async function handleCommand({ lowerTxt, txt, senderJid, chatId, m, economy, isOwner, senderIsAdmin }) {
  const inst   = getInst();
  const P      = botConfig.getPrefix().toLowerCase();
  const reply  = (text) => inst.sock_ref.sendMessage(chatId, { text });
  const mentioned = m?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || null;

  // Helper: check starts with prefix + command word
  const is  = (cmd)       => lowerTxt === `${P} ${cmd}`;
  const has = (cmd)       => lowerTxt.startsWith(`${P} ${cmd} `);
  const arg = (skipWords) => txt.trim().split(/\s+/).slice(skipWords);

  // ── Toggle ──────────────────────────────────────────────────────────────
  if (is('cards on'))  return (await cmdToggle('on',  senderJid, chatId, reply, senderIsAdmin)), true;
  if (is('cards off')) return (await cmdToggle('off', senderJid, chatId, reply, senderIsAdmin)), true;

  // ── Role Management (Owner Only) ─────────────────────────────────────────
  if (isOwner) {
    if (has('addmod'))   return (await cmdManageRole('mod',   'add', mentioned, reply)), true;
    if (has('delmod'))   return (await cmdManageRole('mod',   'del', mentioned, reply)), true;
    if (has('addadmin')) return (await cmdManageRole('admin', 'add', mentioned, reply)), true;
    if (has('deladmin')) return (await cmdManageRole('admin', 'del', mentioned, reply)), true;
  }

  // ── Claim ────────────────────────────────────────────────────────────────
  if (has('claim') || is('claim')) {
    await cmdClaim(arg(2)[0] || null, senderJid, reply);
    return true;
  }

  // ── Collection views ─────────────────────────────────────────────────────
  if (is('coll'))                                   return (await cmdColl(senderJid, reply)), true;
  if (is('card --tier') || is('card--tier'))        return (await cmdCollByTier(senderJid, reply)), true;
  if (is('duplicate') || is('dupes'))               return (await cmdDuplicate(senderJid, reply)), true;

  // ── Merge ────────────────────────────────────────────────────────────────
  if (has('merge') || is('merge'))  return (await cmdMerge(arg(2)[0] || null, senderJid, reply)), true;

  // ── Card search ──────────────────────────────────────────────────────────
  if (has('cs'))  return (await cmdSearchCard(arg(2), reply)), true;

  // ── Give card ────────────────────────────────────────────────────────────
  if (has('cg') || is('cg'))  return (await cmdGiveCard(arg(2), senderJid, mentioned, reply)), true;

  // ── Sell card ─────────────────────────────────────────────────────────────
  if (has('sc'))  return (await cmdSellCard(arg(2), senderJid, reply)), true;

  // ── Cancel sale ──────────────────────────────────────────────────────────
  if (is('cancel sale'))  return (await cmdCancelSale(senderJid, reply)), true;

  // ── Buy card ─────────────────────────────────────────────────────────────
  if (is('buycard') || has('buycard'))  return (await cmdBuyCard(arg(2), senderJid, economy, reply)), true;

  // ── Bid ──────────────────────────────────────────────────────────────────
  if (has('bid'))  return (await cmdBid(arg(2), senderJid, economy, reply)), true;

  // ── Main deck ────────────────────────────────────────────────────────────
  if (is('deck'))         return (await cmdDeck(senderJid, reply)), true;
  if (has('swap card'))   return (await cmdSwapCard(arg(3), senderJid, reply)), true;

  // ── t2cdeck / t2ccoll must be checked BEFORE t2deck / t2coll (longer match first)
  if (has('t2cdeck'))  return (await cmdT2CDeck(arg(2), senderJid, reply)), true;
  if (has('t2ccoll'))  return (await cmdT2CColl(arg(2), senderJid, reply)), true;
  if (has('t2deck'))   return (await cmdT2Deck(arg(2), senderJid, reply)), true;
  if (has('t2coll'))   return (await cmdT2Coll(arg(2), senderJid, reply)), true;

  // ── Custom decks ─────────────────────────────────────────────────────────
  if (has('create deck')) {
    if (!isOwner && !inst.adminJids.has(senderJid)) return reply('❌ Custom deck creation is admin-only.'), true;
    return (await cmdCreateDeck(arg(3).join(' '), senderJid, reply)), true;
  }
  if (is('list decks'))    return (await cmdListDecks(senderJid, reply)), true;
  if (has('cdeck'))        return (await cmdCDeck(arg(2), senderJid, reply)), true;
  if (has('rename deck'))  return (await cmdRenameDeck(arg(3), senderJid, reply)), true;
  if (has('delete deck'))  return (await cmdDeleteDeck(arg(3), senderJid, reply)), true;

  // ── Discovery ────────────────────────────────────────────────────────────
  if (has('cltr'))    return (await cmdCollector(arg(2), reply)), true;
  if (has('series'))  return (await cmdSeries(arg(2), senderJid, reply)), true;

  // ── Owner spawn (DMs only) ────────────────────────────────────────────────
  if (has('spawn') || is('spawn')) {
    const rawArgs = txt.trim().slice(`${botConfig.getPrefix()} spawn`.length).trim();
    await cmdOwnerSpawn(rawArgs, senderJid, chatId, reply);
    return true;
  }

  return false; // No card command matched — let engine.js continue to other commands
}

// ═══════════════════════════════════════════════════════════════════════════
//  SECTION 9 — INIT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Call this once in engine.js after your socket is open.
 *
 * @param {object}   sock    Baileys socket instance
 * @param {string[]} admins  JIDs who can toggle .g cards on/off
 * @param {string[]} mods    JIDs who can use .g series
 * @param {string}   owner   Server owner JID (exclusive .g spawn access)
 */
function init(sock, admins = [], mods = [], owner = null) {
  const inst = getInst();
  inst.sock_ref  = sock;
  inst.ownerJid  = owner;
  inst.adminJids = new Set(admins);
  inst.modJids   = new Set(mods);
  loadCardsDB();
  console.log(`[CardSystem][${botConfig.getBotId()}] Initialized.`);
}

// ─── Public API ──────────────────────────────────────────────────────────────
module.exports = { init, handleCommand, doSpawn, CardStat, UserCard, CardMarket, CardDeck, instances };
