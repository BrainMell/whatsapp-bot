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
const goService = require('../utils/goImageService'); // 💡 singleton (PERF PATCH 2026-07-27)

// ── Mongoose Models ──────────────────────────────────────────────────────────
const CardStat   = require('../models/CardStat');
const UserCard   = require('../models/UserCard');
const CardMarket = require('../models/CardMarket');
const CardDeck   = require('../models/CardDeck');
const User       = require('../models/User');
const System     = require('../models/System');
const economy    = require('./economy');

// ── Config ───────────────────────────────────────────────────────────────────
const botConfig  = require('../../botConfig');
const ZENI       = () => botConfig.getCurrency().symbol;
const P          = () => botConfig.getPrefix().toLowerCase();

// ═══════════════════════════════════════════════════════════════════════════
//  SECTION 1 — CONSTANTS & TABLES
// ═══════════════════════════════════════════════════════════════════════════

const CARDS_DB_PATH = path.join(__dirname, '..', 'data', 'cards_data.json');
const BASE_MAX   = { '1': 500, '2': 300, '3': 150, '4': 80, '5': 20, '6': 5, 'S': 1, 'E': 1000 };
const BASE_PRICE = { '1': 10,  '2': 25,  '3': 60, '4': 150, '5': 400, '6': 1200, 'S': 9999, 'E': 500 };

const TIER_STARS = {
  '1': '✦', '2': '✦✦', '3': '✦✦✦',
  '4': '✦✦✦✦', '5': '✦✦✦✦✦', '6': '❖❖❖❖❖❖', 'S': '👑', 'E': '🎁'
};

const TIER_LABEL = {
  '1': 'TIER  I',  '2': 'TIER  II',  '3': 'TIER  III',
  '4': 'TIER  IV', '5': 'TIER  V',   '6': 'TIER  VI',  'S': 'TIER  S', 'E': 'EVENT'
};

// 💡 Default tier spawn weights. Can be overridden per-bot via .g spawnset tier.
// Weights are relative (not percentages). The system normalizes them.
// T5 and T6 have separate "per-interval chance" gates that fire BEFORE
// the weighted pool — if the gate passes, that tier is selected directly.
// S and E tiers are disabled by default (weight=0, no per-interval gate).
// Owners can enable them with: .g spawnset tier S 5
const DEFAULT_SPAWN_WEIGHTS = {
  '1': 20,
  '2': 15,
  '3': 10,
  '4':  8,
  '5':  0,  // controlled by T5_PER_INTERVAL gate by default
  '6':  0,  // controlled by T6_PER_INTERVAL gate by default
  'S':  0,  // disabled by default — enable with .g spawnset tier S <weight>
  'E':  0,  // disabled by default — event cards, enable with .g spawnset tier E <weight>
};

const DEFAULT_T5_CHANCE = 1 / 144;  // ~0.7% per spawn
const DEFAULT_T6_CHANCE = 1 / 672;  // ~0.15% per spawn
const DEFAULT_S_CHANCE  = 0;        // disabled by default
const DEFAULT_E_CHANCE  = 0;        // disabled by default
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
      CARDS_BY_TIER: {},
      // 💡 TOKEN EVENT STATE
      tokenEventActive: false,     // toggled via .g event start/stop
      tokenEventStart: 0,          // timestamp event started
      // 💡 SPAWN COUNTER — every 3rd spawn grants a guaranteed event token
      // (when the event is active). Replaces the old 50%-chance-per-claim RNG.
      spawnCounter: 0,
      // 💡 TIER SPAWN CONFIG — per-bot configurable tier weights + chances.
      // Loaded from DB on init, overridden via .g spawnset tier.
      tierWeights: { ...DEFAULT_SPAWN_WEIGHTS },
      tierChances: {
        '5': DEFAULT_T5_CHANCE,
        '6': DEFAULT_T6_CHANCE,
        'S': DEFAULT_S_CHANCE,
        'E': DEFAULT_E_CHANCE,
      },
      // 💡 SPAWN INTERVAL — per-bot configurable via '.g spawnset <minutes>'.
      // Default 20 min (= 3 spawns/hour). Persisted in System collection
      // (key: card_spawn_interval_<botId>) so it survives restarts.
      spawnIntervalMs: 20 * 60 * 1000,
      // 💡 ESHOP DECK STATE
      eshopDeck: new Array(16).fill(null), // 16 slots, each null or { cardId, cardName, imageUrl, tier, anime, price }
      // 💡 PERF 2026-07-27: per-user render mode cache (hybrid vs static).
      // Avoids hitting MongoDB on every .jk coll / .jk deck invocation.
      // Key: userId (normalized phone@... JID), Value: 'hybrid' | 'static'
      userRenderModes: new Map(),
    });
  }
  return instances.get(id);
}

const ALL_CARDS     = () => getInst().ALL_CARDS;
const CARD_INDEX    = () => getInst().CARD_INDEX;
const CARDS_BY_TIER = () => getInst().CARDS_BY_TIER;

// 💡 Helper: identify event cards by ID prefix (E-XXXXX).
// Event cards now have real tiers (1-6, S) extracted from shoob.gg,
// so we can't rely on tier === 'E' anymore. The ID prefix 'E-' is
// the reliable way to identify event cards.
function isEventCard(card) {
  return card && card.id && String(card.id).startsWith('E-');
}

// 💡 Helper: escape regex special characters in a deck name before using it
// in `new RegExp(...)`. Without this, deck names like "Best (Girls)" or
// "S+ Tiers" throw SyntaxError or silently fail to match.
// Used by: cmdCDeck, cmdCDeckRemove, cmdEShopDeckTrading(sell),
//          cmdRenameDeck, cmdDeleteDeck.
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 💡 Helper: get all event cards (by ID prefix, not tier)
function getEventCards() {
  return ALL_CARDS().filter(c => isEventCard(c));
}

function loadCardsDB() {
  const inst = getInst();
  try {
    const raw     = JSON.parse(fs.readFileSync(CARDS_DB_PATH, 'utf8'));
    const cards   = Array.isArray(raw.cards) ? raw.cards : Object.values(raw.cards);
    
    inst.ALL_CARDS     = cards;
    inst.CARD_INDEX    = {};
    inst.CARDS_BY_TIER = {};
    inst.EVENT_CARDS   = []; // 💡 Event cards by ID prefix (E-XXXXX)
    
    for (const card of inst.ALL_CARDS) {
      inst.CARD_INDEX[card.id] = card;
      const t = String(card.tier);
      if (!inst.CARDS_BY_TIER[t]) inst.CARDS_BY_TIER[t] = [];
      inst.CARDS_BY_TIER[t].push(card);
      // 💡 Track event cards by ID prefix
      if (isEventCard(card)) {
        inst.EVENT_CARDS.push(card);
      }
    }
    console.log(`[CardSystem][${botConfig.getBotId()}] Loaded ${inst.ALL_CARDS.length} cards across ${Object.keys(inst.CARDS_BY_TIER).length} tiers (${inst.EVENT_CARDS.length} event cards).`);
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
  if (inst.spawnTimer) return; // already running
  if (inst.activeGroups.size === 0) return;

  // 💡 FIX §8: per-group spawn timers instead of a single shared timer.
  // Previously, one timer rotated through groups, so each group only got
  // a spawn every interval × numberOfGroups. Now each group gets its own
  // independent timer at the configured interval.
  //
  // 💡 FIX (Item #13 — "card spawn hive mind"): stagger the first spawn
  // for each group by a random offset within the interval, so groups
  // don't all spawn at the same wall-clock minute. Without this, every
  // group's setInterval fires at t=interval, t=2*interval, t=3*interval...
  // all in lockstep — making the bot look like a single hive mind
  // spawning cards simultaneously across every chat. Now the first
  // fire is randomized within [0, interval), and subsequent fires
  // follow at interval spacing — so over time, spawns distribute
  // naturally across the clock minute.
  const intervalMs = inst.spawnIntervalMs || (20 * 60 * 1000);

  // Track per-group timers
  if (!inst.perGroupTimers) inst.perGroupTimers = new Map();

  // Start a timer for each active group
  for (const gid of inst.activeGroups) {
    if (inst.perGroupTimers.has(gid)) continue; // already has a timer

    // Random initial delay in [0, intervalMs) so groups desync.
    const initialDelay = Math.floor(Math.random() * intervalMs);

    // Use a recursive setTimeout chain instead of setInterval so we can
    // inject the random initial delay only on the FIRST fire. After that,
    // spacing is exactly intervalMs (predictable cadence per group).
    const scheduleNext = (delay) => {
      const timer = setTimeout(() => {
        // Check if group is still active
        if (!inst.activeGroups.has(gid)) {
          inst.perGroupTimers.delete(gid);
          return;
        }
        doSpawn(null, null, false, gid);
        // Schedule the next fire at the standard interval
        scheduleNext(intervalMs);
      }, delay);
      inst.perGroupTimers.set(gid, timer);
    };
    scheduleNext(initialDelay);
  }

  // Keep a dummy spawnTimer reference so the old `if (inst.spawnTimer)` check works
  inst.spawnTimer = true;
  console.log(`[CardSystem][${botConfig.getBotId()}] Per-group spawn timers started: ${inst.perGroupTimers.size} groups, interval=${Math.round(intervalMs/60000)}min each (staggered first-fire)`);
}

// 💡 Restart the spawn timer with a new interval. Called by .g spawnset.
// Clears the existing timer and re-creates it with the new interval.
function restartSpawnTimer() {
  const inst = getInst();
  // Clear per-group timers (setTimeout chain — use clearTimeout, not clearInterval)
  if (inst.perGroupTimers) {
    for (const [gid, timer] of inst.perGroupTimers) {
      clearTimeout(timer);
    }
    inst.perGroupTimers.clear();
  }
  inst.spawnTimer = null;
  ensureTimerRunning();
}

// 💡 Persist + apply a new spawn interval for this bot instance.
// minutes must be a number between 1 and 1440 (24 hours).
// Returns { success, message }.
async function setSpawnInterval(minutes, callerJid, isOwner) {
  const inst = getInst();
  if (!isOwner) {
    return { success: false, message: '❌ Only moderators and above can change the spawn interval.' };
  }
  const mins = Number(minutes);
  if (!Number.isFinite(mins) || mins < 1 || mins > 1440) {
    return { success: false, message: '❌ Invalid interval. Use a number between 1 and 1440 minutes (24 hours).\nExample: `.g spawnset 20` (3 spawns/hour)' };
  }
  inst.spawnIntervalMs = mins * 60 * 1000;
  // Persist to System collection so it survives restarts
  try {
    await System.findOneAndUpdate(
      { key: `card_spawn_interval_${botConfig.getBotId()}` },
      { value: inst.spawnIntervalMs },
      { upsert: true }
    );
  } catch (e) {
    console.error('[CardSystem] Failed to persist spawn interval:', e.message);
    return { success: false, message: `⚠️ Interval set to ${mins}min in memory but failed to persist: ${e.message}` };
  }
  // Restart timer if it's running
  if (inst.activeGroups.size > 0) {
    restartSpawnTimer();
  }
  const spawnsPerHour = Math.round(60 / mins * 10) / 10;
  const tokensPerHour = spawnsPerHour / 3; // every 3rd spawn = guaranteed token
  return {
    success: true,
    message: `✅ Spawn interval set to *${mins} minutes* for ${botConfig.getBotId()}.\n\n📊 Approximate rates:\n• ${spawnsPerHour} spawns/hour\n• ${tokensPerHour} guaranteed event tokens/hour (during events)\n• +25% RNG token bonus on non-guaranteed spawns\n\n_Interval persists across bot restarts._`
  };
}

// 💡 Get current spawn interval info for display.
function getSpawnIntervalInfo() {
  const inst = getInst();
  const ms = inst.spawnIntervalMs || (20 * 60 * 1000);
  const mins = Math.round(ms / 60000);
  const spawnsPerHour = Math.round(60 / mins * 10) / 10;
  const tokensPerHour = Math.round(spawnsPerHour / 3 * 10) / 10;
  return {
    minutes: mins,
    ms,
    spawnsPerHour,
    tokensPerHour,
    activeGroups: inst.activeGroups.size,
    timerRunning: !!inst.spawnTimer,
  };
}

// 💡 Load persisted spawn interval from System collection on startup.
async function loadSpawnInterval() {
  const inst = getInst();
  try {
    const doc = await System.findOne({ key: `card_spawn_interval_${botConfig.getBotId()}` });
    if (doc && typeof doc.value === 'number' && doc.value > 0) {
      inst.spawnIntervalMs = doc.value;
      console.log(`[CardSystem][${botConfig.getBotId()}] Loaded spawn interval: ${Math.round(doc.value/60000)}min`);
    }
  } catch (e) {
    console.error('[CardSystem] Failed to load spawn interval:', e.message);
  }
}

// 💡 Load persisted tier spawn config from System collection on startup.
async function loadTierConfig() {
  const inst = getInst();
  try {
    const doc = await System.findOne({ key: `card_tier_config_${botConfig.getBotId()}` });
    if (doc && doc.value) {
      if (doc.value.tierWeights) inst.tierWeights = { ...DEFAULT_SPAWN_WEIGHTS, ...doc.value.tierWeights };
      if (doc.value.tierChances) inst.tierChances = { '5': DEFAULT_T5_CHANCE, '6': DEFAULT_T6_CHANCE, 'S': 0, 'E': 0, ...doc.value.tierChances };
      console.log(`[CardSystem][${botConfig.getBotId()}] Loaded tier config: weights=${JSON.stringify(inst.tierWeights)} chances=${JSON.stringify(inst.tierChances)}`);
    }
  } catch (e) {
    console.error('[CardSystem] Failed to load tier config:', e.message);
  }
}

// 💡 Set a tier's spawn weight or chance. Persisted to DB.
// For T1-T4: use weight (relative number, higher = more common)
// For T5/T6/S/E: use chance (0.0-1.0 per-spawn probability) OR weight
// Setting weight to 0 disables the tier from the weighted pool.
// Setting chance to 0 disables the per-interval gate.
async function setTierConfig(tier, type, value) {
  const inst = getInst();
  const validTiers = ['1', '2', '3', '4', '5', '6', 'S', 'E'];
  if (!validTiers.includes(tier)) {
    return { success: false, message: `❌ Invalid tier. Valid: ${validTiers.join(', ')}` };
  }
  const numVal = Number(value);
  if (!Number.isFinite(numVal) || numVal < 0) {
    return { success: false, message: `❌ Invalid value. Use a number >= 0.` };
  }

  if (type === 'weight') {
    if (numVal > 100) {
      return { success: false, message: `❌ Weight must be 0-100. Use 0 to disable.` };
    }
    inst.tierWeights[tier] = numVal;
  } else if (type === 'chance') {
    if (numVal > 1) {
      return { success: false, message: `❌ Chance must be 0.0-1.0 (e.g. 0.05 = 5% per spawn). Use 0 to disable.` };
    }
    inst.tierChances[tier] = numVal;
  } else {
    return { success: false, message: `❌ Invalid type. Use 'weight' or 'chance'.` };
  }

  // Persist
  try {
    await System.findOneAndUpdate(
      { key: `card_tier_config_${botConfig.getBotId()}` },
      { value: { tierWeights: inst.tierWeights, tierChances: inst.tierChances } },
      { upsert: true }
    );
  } catch (e) {
    return { success: false, message: `⚠️ Set in memory but failed to persist: ${e.message}` };
  }

  return {
    success: true,
    message: `✅ Tier ${tier} ${type} set to ${numVal}.\n\n_Current config:_\n${formatTierConfig(inst)}`,
  };
}

function formatTierConfig(inst) {
  let lines = [];
  const tiers = ['1', '2', '3', '4', '5', '6', 'S', 'E'];
  for (const t of tiers) {
    const w = inst.tierWeights[t] || 0;
    const c = inst.tierChances[t] || 0;
    let status = '';
    if (w > 0) status += `weight=${w}`;
    if (c > 0) status += (status ? ', ' : '') + `chance=${(c * 100).toFixed(2)}%`;
    if (!status) status = 'disabled';
    lines.push(`  T${t}: ${status}`);
  }
  return lines.join('\n');
}

// 💡 Reset tier config to defaults.
async function resetTierConfig() {
  const inst = getInst();
  inst.tierWeights = { ...DEFAULT_SPAWN_WEIGHTS };
  inst.tierChances = { '5': DEFAULT_T5_CHANCE, '6': DEFAULT_T6_CHANCE, 'S': 0, 'E': 0 };
  try {
    await System.findOneAndUpdate(
      { key: `card_tier_config_${botConfig.getBotId()}` },
      { value: { tierWeights: inst.tierWeights, tierChances: inst.tierChances } },
      { upsert: true }
    );
  } catch (e) {}
  return { success: true, message: `✅ Tier config reset to defaults.\n\n${formatTierConfig(inst)}` };
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

// Fetch user name helper
async function getUserName(jid) {
    try {
        const u = await User.findOne({ userId: jid });
        return u?.nickname || u?.profile?.whatsappName || 'Adventurer';
    } catch (e) { return 'Adventurer'; }
}

function buildCardDetailCaption(card, uc, stat, location = 'Collection', index = null, ownerName = 'Player') {
  const tier   = String(card.tier);
  const label  = TIER_LABEL[tier]  || `TIER ${tier}`;
  const stars  = TIER_STARS[tier]  || '✦';

  // 💡 FIX: Only show "Player's Coll" when there IS an owner (uc != null).
  // For database lookups (info command, no owner), use the location
  // parameter directly — defaults to 'Global Database' or 'Event Database'.
  let locStr;
  if (uc) {
    // Player owns this card — show their collection/deck info
    locStr = `📦 *${ownerName}'s Coll*`;
    if (index !== null) locStr += ` (#${index})`;
    if (uc.inMainDeck) locStr = `🎴 *${ownerName}'s Main Deck* (Slot #${uc.mainDeckSlot})`;
    else if (uc.inCustomDeck) locStr = `📁 *Deck: ${uc.customDeckName}* (Slot #${uc.customDeckSlot})`;
  } else {
    // No owner — this is a database lookup, not a player's card
    locStr = `🗄️ *${location}*`;
  }

  const copyInfo = uc ? `\n📋  *Copy:* #${uc.copyNumber} / ${stat?.maxCopies || '?'}` : '';
  const ownerTag = uc ? `\n👤  *Owner:* @${uc.userId.split('@')[0]}` : '';

  // 💡 FIX: For event cards, show the actual anime series if available.
  // The animeName field currently stores the event name (e.g., "Chinese
  // New Year") for event cards. If the card has a 'series' field, use
  // that instead. Otherwise, for event cards, show "Event: <eventName>"
  // so it's clear this is an event card, not a regular anime card.
  let seriesDisplay = card.animeName || 'Unknown';
  let eventLine = '';
  if (card.series) {
    seriesDisplay = card.series;
  }
  if (isEventCard(card)) {
    // Event cards: show event name separately
    seriesDisplay = card.animeName || 'Unknown';
    if (card.eventName && card.eventName !== card.animeName) {
      eventLine = `\n🎪  *Event:* ${card.eventName}`;
    } else {
      eventLine = `\n🎪  *Event:* ${card.animeName}`;
    }
  }

  // 💡 FIX: Show the card's description if available (event cards have
  // a description like "Albedo from Chinese New Year"). This gives more
  // context about the card.
  const descLine = card.description ? `\n📝  *Description:* ${card.description}` : '';

  return (
`╔═════════════════╗
      🎴  *CARD DETAIL*
╚═════════════════╝

🏷️  *Name:* ${card.cardName}
📺  *Series:* ${seriesDisplay}
${stars}  *Tier:* ${label}  ${stars}
🎨  *Artist:* ${card.creator || 'Unknown'}${eventLine}${descLine}${copyInfo}${ownerTag}

📍  *Location:* ${locStr}

▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬`
  );
}

function buildSpawnCaption(card, copyNumber, maxCopies, price) {
  const tier   = String(card.tier);
  const label  = TIER_LABEL[tier]  || `TIER ${tier}`;
  const stars  = TIER_STARS[tier]  || '✆';

  // Use same series display logic as buildCardDetailCaption
  let seriesDisplay = card.animeName || 'Unknown';
  let eventLine = '';
  if (card.series) {
    seriesDisplay = card.series;
  }
  if (isEventCard(card)) {
    // Event cards: show event name separately
    seriesDisplay = card.animeName || 'Unknown';
    if (card.eventName && card.eventName !== card.animeName) {
      eventLine = `\n🎪  *Event:* ${card.eventName}`;
    } else {
      eventLine = `\n🎪  *Event:* ${card.animeName}`;
    }
  }

  return (
`▬▬▬▬▬▬▬▬▬▬▬▬
🎴  CARD APPEARED!
▬▬▬▬▬▬▬▬▬▬▬▬
🏷️  Name ›  ${card.cardName}
📺  Series ›  ${seriesDisplay}
${stars}  Tier ›  ${label}  ${stars}
🎨  Art ›  ${card.creator || 'Unknown'}${eventLine ? '\n🎪  Event ›  ' + card.eventName : ''}
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
    card = CARD_INDEX()[forceCardId];
    if (!card) {
      const q = forceCardId.toLowerCase();
      card = ALL_CARDS().find(c => c.cardName.toLowerCase() === q && (!forceTier || String(c.tier) === String(forceTier)));
      if (!card) card = ALL_CARDS().find(c => c.cardName.toLowerCase().includes(q) && (!forceTier || String(c.tier) === String(forceTier)));
    }
    if (!card) return null;
    stat = await getOrInitStat(card.id, card.tier);
  } else {
    const tier = forceTier || (() => {
      // 💡 Use per-bot configurable tier chances (T5/T6/S/E fire first)
      const chances = inst.tierChances || { '5': DEFAULT_T5_CHANCE, '6': DEFAULT_T6_CHANCE, 'S': 0, 'E': 0 };
      if (chances['6'] > 0 && Math.random() < chances['6']) return '6';
      if (chances['5'] > 0 && Math.random() < chances['5']) return '5';
      if (chances['S'] > 0 && Math.random() < chances['S']) return 'S';
      if (chances['E'] > 0 && Math.random() < chances['E']) return 'E';
      // Weighted pool for T1-T4 (+ any T5/T6/S/E with weight > 0)
      const weights = inst.tierWeights || { ...DEFAULT_SPAWN_WEIGHTS };
      const entries = Object.entries(weights).filter(([t, w]) => w > 0);
      if (entries.length === 0) return '1'; // fallback
      const total = entries.reduce((s, [, w]) => s + w, 0);
      let roll = Math.random() * total;
      for (const [t, w] of entries) { roll -= w; if (roll <= 0) return t; }
      return entries[0][0];
    })();
    
    const pool = [...(CARDS_BY_TIER()[tier] || [])].filter(c => !isEventCard(c));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    for (const c of pool) {
      const s = await getOrInitStat(c.id, c.tier);
      if (s.totalSpawned < s.maxCopies) { card = c; stat = s; break; }
    }
    
    if (!card) {
        // T1 Fallback — exclude event cards
        const t1 = [...(CARDS_BY_TIER()['1'] || [])].filter(c => !isEventCard(c));
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
    if (String(card.tier) === '6' || String(card.tier) === 'S' || isEventCard(card)) {
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
    // 💡 FIX: increment spawn counter. Every 3rd spawn becomes "token-bearing"
    // — when claimed during an active token event, it grants a guaranteed
    // token (replaces the old 50%-chance-per-claim RNG). Roughly 1 token per
    // hour at 3 spawns/hour.
    inst.spawnCounter = (inst.spawnCounter || 0) + 1;
    const isTokenSpawn = (inst.spawnCounter % 3 === 0);
    inst.activeSpawns.set(spawnKey, {
      card, copyNumber: stat.totalSpawned, stat, price,
      groupJid: targetGroup, spawnedAt: Date.now(), expiresAt: Date.now() + CLAIM_WINDOW_MS,
      hasToken: isTokenSpawn, // 💡 marked for guaranteed token drop on claim
    });
    console.log(`[CardSystem][${botConfig.getBotId()}] Spawned: ${card.cardName} (T${card.tier}) #${stat.totalSpawned}/${stat.maxCopies} in ${targetGroup}${isTokenSpawn ? ' [TOKEN BEARING]' : ''}`);
    return { card, copyNumber: stat.totalSpawned, stat, price };
  } catch (err) {
    stat.totalSpawned -= 1;
    await stat.save();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  SECTION 3.5 — TOKEN EVENT & ESHOP SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if the token event is currently active.
 * Returns true if the owner has started the event via `.g event start`.
 */
async function isTokenEventActive() {
  const inst = getInst();
  return !!inst.tokenEventActive;
}

/**
 * Start the token event. Only the bot owner can do this.
 */
async function startTokenEvent(ownerJid) {
  const inst = getInst();
  if (inst.tokenEventActive) {
    return { success: false, message: '❌ Token event is already active!' };
  }
  inst.tokenEventActive = true;
  inst.tokenEventStart = Date.now();

  // Persist to System collection
  try {
    await System.findOneAndUpdate(
      { key: `token_event_${botConfig.getBotId()}` },
      { $set: { value: { active: true, startedAt: inst.tokenEventStart } } },
      { upsert: true }
    );
  } catch (e) { console.error('[TokenEvent] Failed to persist state:', e.message); }

  return {
    success: true,
    message: `🎉 *TOKEN EVENT STARTED!* 🎉\n\n` +
      `Claim cards to earn Event Tokens (1 token per ~2 claims).\n` +
      `Spend tokens in the eShop: \`${P()} eshop\`\n\n` +
      `Check your balance: \`${P()} tokens\``
  };
}

/**
 * Stop the token event. Only the bot owner can do this.
 */
async function stopTokenEvent(ownerJid) {
  const inst = getInst();
  if (!inst.tokenEventActive) {
    return { success: false, message: '❌ Token event is not currently active.' };
  }
  inst.tokenEventActive = false;

  try {
    await System.findOneAndUpdate(
      { key: `token_event_${botConfig.getBotId()}` },
      { $set: { value: { active: false, startedAt: inst.tokenEventStart, stoppedAt: Date.now() } } },
      { upsert: true }
    );
  } catch (e) { console.error('[TokenEvent] Failed to persist state:', e.message); }

  return { success: true, message: '🛑 *Token event stopped.* No more tokens will drop.' };
}

/**
 * Load token event state from DB on startup.
 */
async function loadTokenEventState() {
  try {
    const doc = await System.findOne({ key: `token_event_${botConfig.getBotId()}` }).lean();
    if (doc && doc.value) {
      const inst = getInst();
      inst.tokenEventActive = !!doc.value.active;
      inst.tokenEventStart = doc.value.startedAt || 0;
    }
  } catch (e) { /* silent — may not exist yet */ }
}

/**
 * Load eShop deck from DB on startup.
 */
async function loadEShopDeck() {
  try {
    const doc = await System.findOne({ key: `eshop_deck_${botConfig.getBotId()}` }).lean();
    if (doc && doc.value && Array.isArray(doc.value)) {
      const inst = getInst();
      inst.eshopDeck = doc.value;
    }
  } catch (e) { /* silent */ }
}

/**
 * Save eShop deck to DB.
 */
async function saveEShopDeck() {
  const inst = getInst();
  try {
    await System.findOneAndUpdate(
      { key: `eshop_deck_${botConfig.getBotId()}` },
      { $set: { value: inst.eshopDeck } },
      { upsert: true }
    );
  } catch (e) { console.error('[eShop] Failed to save deck:', e.message); }
}

/**
 * Add a card to the eShop deck at a specific slot (1-16).
 * Owner-only.
 */
async function eshopAddCard(slot, cardId, price) {
  const inst = getInst();
  if (slot < 1 || slot > 16) {
    return { success: false, message: '❌ Slot must be 1-16.' };
  }
  const card = CARD_INDEX()[cardId];
  if (!card) {
    return { success: false, message: `❌ Card ID "${cardId}" not found in database.` };
  }
  const priceNum = Math.max(1, Math.floor(Number(price) || 0));
  inst.eshopDeck[slot - 1] = {
    cardId: card.id,
    cardName: card.cardName,
    imageUrl: card.imageUrl,
    tier: String(card.tier),
    anime: card.animeName || '',
    price: priceNum
  };
  await saveEShopDeck();
  return {
    success: true,
    message: `✅ Added *${card.cardName}* (T${card.tier}) to eShop slot ${slot} for 🎫 ${priceNum} tokens.`
  };
}

/**
 * Remove a card from the eShop deck at a specific slot.
 * Owner-only.
 */
async function eshopRemoveCard(slot) {
  const inst = getInst();
  if (slot < 1 || slot > 16) {
    return { success: false, message: '❌ Slot must be 1-16.' };
  }
  if (!inst.eshopDeck[slot - 1]) {
    return { success: false, message: `❌ Slot ${slot} is already empty.` };
  }
  const removed = inst.eshopDeck[slot - 1];
  inst.eshopDeck[slot - 1] = null;
  await saveEShopDeck();
  return { success: true, message: `✅ Removed *${removed.cardName}* from eShop slot ${slot}.` };
}

/**
 * Set the price for a card in the eShop deck.
 * Owner-only.
 */
async function eshopSetPrice(slot, price) {
  const inst = getInst();
  if (slot < 1 || slot > 16) {
    return { success: false, message: '❌ Slot must be 1-16.' };
  }
  const entry = inst.eshopDeck[slot - 1];
  if (!entry) {
    return { success: false, message: `❌ Slot ${slot} is empty. Add a card first with \`${P()} t2edeck add <slot> <cardId> <price>\`.` };
  }
  const priceNum = Math.max(1, Math.floor(Number(price) || 0));
  entry.price = priceNum;
  await saveEShopDeck();
  return { success: true, message: `✅ Set price for *${entry.cardName}* (slot ${slot}) to 🎫 ${priceNum} tokens.` };
}

/**
 * Buy a card from the eShop using event tokens.
 * Anyone can use this.
 */
async function eshopBuy(senderJid, slot) {
  const inst = getInst();
  if (slot < 1 || slot > 16) {
    return { success: false, message: '❌ Slot must be 1-16.' };
  }
  const entry = inst.eshopDeck[slot - 1];
  if (!entry) {
    return { success: false, message: `❌ Slot ${slot} is empty.` };
  }

  const balance = economy.getTokens(senderJid);
  if (balance < entry.price) {
    return {
      success: false,
      message: `❌ Insufficient tokens! Need 🎫 ${entry.price}, have 🎫 ${balance}.\nClaim cards during the token event to earn more!`
    };
  }

  // Deduct tokens
  const deducted = economy.removeTokens(senderJid, entry.price);
  if (!deducted) {
    return { success: false, message: '❌ Failed to deduct tokens. Try again.' };
  }

  // Grant the card to the user
  try {
    // Get the card stat to find the next copy number
    const stat = await getOrInitStat(entry.cardId, entry.tier);
    stat.totalCirculation += 1;
    // 💡 FIX: Use totalCirculation for the copy number, NOT totalSpawned.
    // eShop purchases aren't "spawns" so totalSpawned stays unchanged,
    // but the copy number must still be unique. Using totalSpawned+1
    // would collide with the next natural spawn's copy number.
    const copyNumber = stat.totalCirculation;
    await UserCard.create({ userId: senderJid, cardId: entry.cardId, copyNumber });
    await stat.save();

    const newBalance = economy.getTokens(senderJid);
    return {
      success: true,
      message: `✅ *PURCHASE COMPLETE!*\n\n` +
        `🎁 *${entry.cardName}* — _${entry.anime}_\n` +
        `${TIER_STARS[String(entry.tier)] || '✆'} ${TIER_LABEL[String(entry.tier)] || 'TIER ' + entry.tier} | Copy #${copyNumber}\n\n` +
        `🎫 Spent: ${entry.price} tokens\n` +
        `🎫 Remaining: ${newBalance} tokens\n\n` +
        `_Added to your collection!_`
    };
  } catch (err) {
    // Roll back the token deduction if card grant failed
    economy.addTokens(senderJid, entry.price);
    console.error('[eShop Buy Error]', err);
    return { success: false, message: '❌ Purchase failed — tokens refunded.' };
  }
}

/**
 * Generate the eShop deck image via the Go Image Service.
 * Returns a PNG buffer.
 */
async function generateEShopDeckImage() {
  const inst = getInst();
  const cards = inst.eshopDeck
    .map((entry, i) => entry ? { slot: i + 1, ...entry } : null)
    .filter(Boolean);

  const payload = {
    title: '🎁 EVENT SHOP — TOKEN EVENT',
    currency: '🎫 Tokens',
    cards: cards
  };

  try {
    const result = await goService.generateEShopDeck(payload);
    return result;
  } catch (err) {
    console.error('[eShop] Image generation failed:', err.message);
    return null;
  }
}

/**
 * Search for event cards by name and/or anime.
 * Used by `info <name> event | <anime>`.
 */
async function searchEventCards(nameQuery, animeQuery) {
  const inst = getInst();
  const eventCards = inst.EVENT_CARDS || [];

  let results = eventCards;

  if (nameQuery) {
    const nq = nameQuery.toLowerCase();
    results = results.filter(c => c.cardName.toLowerCase().includes(nq));
  }

  if (animeQuery) {
    const aq = animeQuery.toLowerCase();
    results = results.filter(c => (c.animeName || '').toLowerCase().includes(aq));
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════
//  SECTION 4 — COMMAND HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

// GIF Cache
// 💡 AUDIT FIX 2026-08-01 (Round 3): added TTL + timestamp to cache entries.
// Previously entries never expired — every user who ran .coll/.deck added
// a permanent buffer to the Map. On a 954MB box with 3000+ users, this is
// a slow memory leak. Now entries expire after 60s (matches onboarding doc's
// "Hybrid grid 60s cache" note) and a sweeper runs every 2 min.
const GIF_CACHE_TTL_MS = 60 * 1000; // 60 seconds
const gifCache = {
    decks: new Map(), // key: userId_deckName, value: { hash: string, buffer: Buffer, ts: number }
    collections: new Map() // key: userId, value: { hash: string, buffer: Buffer, ts: number }
};

// Sweep expired cache entries every 2 min — prevents unbounded growth
setInterval(() => {
    const now = Date.now();
    let decksEvicted = 0, collsEvicted = 0;
    for (const [key, entry] of gifCache.decks.entries()) {
        if (now - (entry.ts || 0) > GIF_CACHE_TTL_MS) {
            gifCache.decks.delete(key);
            decksEvicted++;
        }
    }
    for (const [key, entry] of gifCache.collections.entries()) {
        if (now - (entry.ts || 0) > GIF_CACHE_TTL_MS) {
            gifCache.collections.delete(key);
            collsEvicted++;
        }
    }
    if (decksEvicted > 0 || collsEvicted > 0) {
        console.log(`🃏 [GifCache] Swept ${decksEvicted} deck + ${collsEvicted} collection entries (TTL ${GIF_CACHE_TTL_MS/1000}s).`);
    }
}, 2 * 60 * 1000);

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
    // Check if the user already owns at least one copy of this card.
    const alreadyOwned = await UserCard.findOne({ userId: senderJid, cardId: spawn.card.id }).lean();

    await UserCard.create({ userId: senderJid, cardId: spawn.card.id, copyNumber: spawn.copyNumber });
    spawn.stat.totalCirculation += 1;
    if (!alreadyOwned) {
      spawn.stat.uniqueOwners += 1;
    }
    await spawn.stat.save();
    inst.activeSpawns.delete(`${chatId}_${spawn.card.id}`);

    // 💡 TOKEN EVENT: two-layer drop mechanic.
    //   1) GUARANTEED: every 3rd spawn is marked hasToken=true at spawn time.
    //      On claim, if the event is active AND the spawn is token-bearing,
    //      grant a guaranteed token (no RNG). ~1 guaranteed token per hour
    //      at 3 spawns/hour.
    //   2) RNG FALLBACK: non-token-bearing spawns (the other 2/3) still have
    //      a chance to drop a token. This keeps the old RNG excitement
    //      without the old inconsistency (the guaranteed layer ensures a
    //      steady baseline). Net result: ~1.5 tokens/hour during events.
    let tokenMsg = '';
    try {
      const eventActive = await isTokenEventActive();
      if (eventActive) {
        if (spawn.hasToken) {
          // Guaranteed drop
          economy.addTokens(senderJid, 1);
          const balance = economy.getTokens(senderJid);
          tokenMsg = `\n\n🎫 *GUARANTEED TOKEN DROP!* +1 Event Token (Total: ${balance})\n_This was a token-bearing spawn! Use \`${P()} eshop\` to spend them._`;
        } else if (Math.random() < 0.25) {
          // RNG fallback for non-token-bearing spawns (25% chance)
          economy.addTokens(senderJid, 1);
          const balance = economy.getTokens(senderJid);
          tokenMsg = `\n\n🎫 *Token Drop!* +1 Event Token (Total: ${balance})\n_Use \`${P()} eshop\` to spend them!_`;
        }
      }
    } catch (tokenErr) {
      // Don't fail the claim if token drop fails
      console.error('[Token Drop Error]', tokenErr.message);
    }

    const rarity = getRarityLabel(spawn.copyNumber, spawn.stat.maxCopies);
    const _claimTier = String(spawn.card.tier);
      const _claimLabel = TIER_LABEL[_claimTier] || `TIER ${_claimTier}`;
      return reply(`${rarity.emoji}  *CLAIMED!*\n\n*${spawn.card.cardName}* — _${spawn.card.animeName}_\n${TIER_STARS[_claimTier] || '✆'} ${_claimLabel} | Copy *#${spawn.copyNumber}* (${rarity.label})\n\n_Added to your collection!_${tokenMsg}`);
  } catch (err) {
    console.error('[Claim Error]', err);
    return reply('❌ Claim failed.');
  }
}

function getTopCards(cards) {
  // 💡 FIX: Added 'E' (Event) tier to the sort order. Event cards are
  // special and should sort just below S-tier (rarity-wise they're
  // unique event rewards). Previously they got tier 0 and sank to the
  // bottom of collection highlights, making them invisible in the GIF.
  const tierOrder = { 'S': 8, 'E': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2, '1': 1 };
  return [...cards].sort((a, b) => {
    const cardA = CARD_INDEX()[a.cardId];
    const cardB = CARD_INDEX()[b.cardId];
    const tA = tierOrder[cardA?.tier] || 0;
    const tB = tierOrder[cardB?.tier] || 0;
    if (tA !== tB) return tB - tA;
    return (b.copyNumber || 0) - (a.copyNumber || 0);
    // 💡 Top 12 cards for the 4×3 grid (matches Go grid renderer)
  }).slice(0, 12);
}

function getTopImageUrls(topCards) {
  return topCards.map(uc => {
    const card = CARD_INDEX()[uc.cardId];
    if (!card) return null;
    return {
      url: card.imageUrl,
      animated: String(card.tier) === '6' || String(card.tier) === 'S' || isEventCard(card),
      // 💡 Pass card name + tier so the Go grid renderer can overlay them
      name: card.cardName || '',
      tier: String(card.tier || ''),
    };
  }).filter(Boolean);
}

/**
 * Detects whether the Go server returned:
 *   - MP4 (Cloudinary slideshow) → send as video/gif
 *   - PNG (old grid fallback) → send as image
 *   - JPEG (new optimized grid) → send as image
 */
async function sendCardMedia(sock, chatId, buffer, caption, mentions) {
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
  const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
  if (isPng || isJpeg) {
    return await sock.sendMessage(chatId, {
      image: buffer,
      caption,
      ...(mentions ? { mentions } : {})
    });
  }
  return await sock.sendMessage(chatId, {
    video: buffer,
    gifPlayback: true,
    caption,
    ...(mentions ? { mentions } : {})
  });
}

async function cmdCardsTier(senderJid, reply, chatId) {
  const inst = getInst();
  const p = P();
  const owned = await UserCard.find({ userId: senderJid, inMainDeck: false, inCustomDeck: false, forSale: false }).sort({ createdAt: 1 });
  if (!owned.length) return reply('📭 Collection empty.');

  // Group by Tier
  // 💡 FIX: Added 'E' (Event) tier. Previously event cards were silently
  // dropped from the tier view because `tiers[String(card.tier)]` was
  // undefined for 'E', so the `if (tiers[t])` check skipped them.
  const tiers = { 'S': [], 'E': [], '6': [], '5': [], '4': [], '3': [], '2': [], '1': [] };
  const tierEmoji = { 'S': '👑', 'E': '🎁', '6': '💎', '5': '✨', '4': '🎗', '3': '🔮', '2': '🌈', '1': '🎴' };
  
  owned.forEach((uc, i) => {
    const card = CARD_INDEX()[uc.cardId];
    if (card) {
      const t = String(card.tier);
      if (tiers[t]) tiers[t].push({ name: card.cardName, index: i + 1 });
    }
  });

  let finalMsg = `🃏 *Cards | Tier View*\n\n`;
  // 💡 FIX: Added 'E' to the iteration order (right after S)
  for (const t of ['S', 'E', '6', '5', '4', '3', '2', '1']) {
    if (tiers[t].length > 0) {
      const label = TIER_LABEL[t] || `TIER ${t}`;
      finalMsg += `${tierEmoji[t]} *${label}*\n`;
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
    if (cached && cached.hash === currentHash && (Date.now() - (cached.ts || 0)) < GIF_CACHE_TTL_MS) {
        gifBuffer = cached.buffer;
    } else {
        gifBuffer = await goService.generateCardGrid(imageUrls, "COLLECTION HIGHLIGHTS");
        if (gifBuffer) gifCache.collections.set(senderJid, { hash: currentHash, buffer: gifBuffer, ts: Date.now() });
    }

    if (gifBuffer) {
      return await inst.sock_ref.sendMessage(chatId, { image: gifBuffer, caption: finalMsg });
    }
  }

  return reply(finalMsg);
}

// ═══════════════════════════════════════════════════════════════════════════
//  USER RENDER MODE PREFERENCE (hybrid vs static)
// ═══════════════════════════════════════════════════════════════════════════
// Added 2026-07-27 when hybrid became the default rendering mode.
// Persists per-user preference in MongoDB System collection so it survives
// bot restarts. In-memory cache in inst.userRenderModes avoids DB hits on
// every .jk coll / .jk deck invocation.
//
// Default = 'hybrid' (the new animated MP4 grid)
// Toggle via: .jk anim on | .jk anim off | .jk anim (status)
// One-shot override via: .jk coll --static | .jk coll --anim

async function getUserRenderMode(userId) {
  const inst = getInst();
  if (inst.userRenderModes.has(userId)) {
    return inst.userRenderModes.get(userId);
  }
  // Lazy load from DB
  const id = botConfig.getBotId();
  try {
    const doc = await System.findOne({ key: `card_render_mode_${id}_${userId}` }).lean();
    const mode = doc?.value === 'static' ? 'static' : 'hybrid';
    inst.userRenderModes.set(userId, mode);
    return mode;
  } catch (e) {
    // DB read failed — default to hybrid (best experience)
    return 'hybrid';
  }
}

async function setUserRenderMode(userId, mode) {
  const inst = getInst();
  const id = botConfig.getBotId();
  try {
    await System.findOneAndUpdate(
      { key: `card_render_mode_${id}_${userId}` },
      { value: mode },
      { upsert: true }
    );
  } catch (e) {
    console.error(`[cardSystem] failed to persist render mode for ${userId}:`, e.message);
  }
  inst.userRenderModes.set(userId, mode);
}

/**
 * cmdAnim — `.jk anim [on|off|status]` — toggle per-user render mode.
 *   .jk anim           → show current status
 *   .jk anim on         → enable animated hybrid (DEFAULT)
 *   .jk anim off        → switch to static PNG
 *   .jk anim hybrid     → alias for 'on'
 *   .jk anim static     → alias for 'off'
 */
async function cmdAnim(senderJid, reply, chatId, args = []) {
  const p = P();
  const sub = args[0]?.toLowerCase();

  if (sub === 'on' || sub === 'hybrid' || sub === 'anim') {
    await setUserRenderMode(senderJid, 'hybrid');
    return reply(
      `🎬 *Animated Hybrid — ENABLED*\n\n` +
      `.jk coll and .jk deck will now produce animated MP4s by default.\n\n` +
      `*Commands:*\n` +
      `• \`${p} anim off\` — switch to static PNG\n` +
      `• \`${p} coll --static\` — one-shot static (overrides preference)\n` +
      `• \`${p} coll --anim\` — one-shot hybrid (overrides preference)`
    );
  }

  if (sub === 'off' || sub === 'static') {
    await setUserRenderMode(senderJid, 'static');
    return reply(
      `🖼️ *Static PNG — ENABLED*\n\n` +
      `.jk coll and .jk deck will now produce static PNGs by default.\n\n` +
      `*Commands:*\n` +
      `• \`${p} anim on\` — switch back to animated hybrid (default)\n` +
      `• \`${p} coll --anim\` — one-shot hybrid (overrides preference)\n` +
      `• \`${p} coll --static\` — one-shot static (overrides preference)`
    );
  }

  // No arg (or unknown arg) — show current status
  const mode = await getUserRenderMode(senderJid);
  const isHybrid = mode === 'hybrid';
  return reply(
    `🎬 *Card Render Mode*\n\n` +
    `Current: *${isHybrid ? 'Animated Hybrid (MP4)' : 'Static PNG'}*\n\n` +
    `*Commands:*\n` +
    `• \`${p} anim on\` — animated hybrid (default)\n` +
    `• \`${p} anim off\` — static PNG\n` +
    `• \`${p} coll --static\` — one-shot static\n` +
    `• \`${p} coll --anim\` — one-shot hybrid`
  );
}

async function cmdColl(senderJid, reply, chatId, args = []) {
  console.log(`🃏 [cmdColl] ENTERED | senderJid=${senderJid?.split('@')[0]} | args=${JSON.stringify(args)}`);
  const inst = getInst();
  const p = P();

  // 💡 FEATURE 2026-07-27: hybrid is now the DEFAULT render mode.
  // User can toggle globally via .jk anim on|off (persists in MongoDB).
  // One-shot overrides:
  //   .jk coll --anim     → force hybrid this once (regardless of preference)
  //   .jk coll --static   → force static PNG this once
  //   .jk coll -a         → shortcut for --anim
  //   .jk coll -s         → shortcut for --static
  // If no flag: use user's saved preference (default = hybrid).
  let useHybridAnim;
  const animFlagIdx = args.findIndex(a => a === '--anim' || a === '-a' || a === '--animated');
  const staticFlagIdx = args.findIndex(a => a === '--static' || a === '-s');
  if (animFlagIdx !== -1) {
    useHybridAnim = true;
    args.splice(animFlagIdx, 1);
    console.log(`🃏 [cmdColl] --anim flag (one-shot override) → hybrid`);
  } else if (staticFlagIdx !== -1) {
    useHybridAnim = false;
    args.splice(staticFlagIdx, 1);
    console.log(`🃏 [cmdColl] --static flag (one-shot override) → static`);
  } else {
    // No flag — use user's saved preference
    const mode = await getUserRenderMode(senderJid);
    useHybridAnim = (mode === 'hybrid');
    console.log(`🃏 [cmdColl] user preference: ${mode}`);
  }

  if (args.length > 0) {
    const input = args[0];
    if (input === '--tier') return cmdCardsTier(senderJid, reply, chatId);
    
    let uc = null;
    let collIndex = null;
    if (input.includes('-')) uc = await UserCard.findOne({ userId: senderJid, cardId: input });
    else {
      const idx = parseInt(input);
      if (!isNaN(idx)) {
        const owned = await UserCard.find({ userId: senderJid, inMainDeck: false, inCustomDeck: false, forSale: false }).sort({ createdAt: 1 });
        uc = owned[idx - 1];
        collIndex = idx;
      }
    }
    if (uc) {
      const card = CARD_INDEX()[uc.cardId];
      const stat = await CardStat.findOne({ cardId: uc.cardId });
      const ownerName = await getUserName(uc.userId);
      const caption = buildCardDetailCaption(card, uc, stat, 'Collection', collIndex, ownerName);
      try {
        if (String(card.tier) === '6' || String(card.tier) === 'S' || isEventCard(card)) {
          const gifBuffer = await goService.convertCardImage(card.imageUrl);
          if (gifBuffer) {
            return await inst.sock_ref.sendMessage(chatId, { video: gifBuffer, gifPlayback: true, caption, mentions: [uc.userId] });
          }
        }
        const res = await axios.get(card.imageUrl, { responseType: 'arraybuffer' });
        return await inst.sock_ref.sendMessage(chatId, { image: Buffer.from(res.data), caption, mentions: [uc.userId] });
      } catch (e) { return reply(caption); }
    }
    return sendUsage(reply, `${p} coll`, `${p} coll [index or card_id]\n• Tier View: \`${p} coll --tier\`\n• Animated grid: \`${p} coll --anim\``, `${p} coll 5`);
  }

  console.log(`🃏 [cmdColl] querying UserCard.find | senderJid=${senderJid?.split('@')[0]}`);
  const owned = await UserCard.find({ userId: senderJid, inMainDeck: false, inCustomDeck: false, forSale: false }).sort({ createdAt: 1 });
  console.log(`🃏 [cmdColl] UserCard.find returned ${owned.length} cards`);
  if (!owned.length) {
    console.log(`🃏 [cmdColl] collection empty, sending text reply`);
    return reply('📭 Collection empty.');
  }

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

  // GIF generation for collection (Top 15 Highlights)
  const topCards = getTopCards(owned);
  const imageUrls = getTopImageUrls(topCards);
  if (imageUrls.length > 0) {
    const currentHash = getDeckHash(topCards);
    const cached = gifCache.collections.get(senderJid);

    let gifBuffer;
    let hybridContentType = null;
    if (cached && cached.hash === currentHash && !useHybridAnim && (Date.now() - (cached.ts || 0)) < GIF_CACHE_TTL_MS) {
        // Only use cache for static grid (hybrid is animated, don't cache — re-render each time)
        console.log(`🃏 [cmdColl] using cached grid buffer`);
        gifBuffer = cached.buffer;
    } else if (useHybridAnim) {
        // 💡 Hybrid animated grid — styled static grid + animated overlays.
        // Returns video/mp4 (if ≥1 animated card) or image/png (if none animated).
        console.log(`🃏 [cmdColl] calling goService.generateHybridGrid | urls=${imageUrls.length}`);
        const hybridResult = await goService.generateHybridGrid(imageUrls, "COLLECTION (TOP 12)");
        if (hybridResult) {
          gifBuffer = hybridResult.buffer;
          hybridContentType = hybridResult.contentType;
          console.log(`🃏 [cmdColl] generateHybridGrid returned: ${gifBuffer.length} bytes (${hybridContentType})`);
        } else {
          console.log(`🃏 [cmdColl] generateHybridGrid returned null`);
        }
    } else {
        console.log(`🃏 [cmdColl] calling goService.generateCardGrid | urls=${imageUrls.length}`);
        gifBuffer = await goService.generateCardGrid(imageUrls, "COLLECTION (TOP 12)");
        console.log(`🃏 [cmdColl] generateCardGrid returned: ${gifBuffer ? gifBuffer.length + ' bytes' : 'null'}`);
        if (gifBuffer) gifCache.collections.set(senderJid, { hash: currentHash, buffer: gifBuffer, ts: Date.now() });
    }

    if (gifBuffer) {
      const fullText = msg + lines.join('\n') + `\n\n*[Use ${p} coll <card_index> to see more detail]*`;
      if (useHybridAnim) {
        // 💡 Send as single message. Hybrid may return MP4 or PNG.
        // MP4 (animated cards): send as { video, gifPlayback, caption }
        // PNG (no animated cards): send as { image, caption }
        const isVideo = hybridContentType && hybridContentType.includes('video');
        console.log(`🃏 [cmdColl] sending ${isVideo ? 'video' : 'image'} (hybrid) with caption`);
        if (isVideo) {
          return await inst.sock_ref.sendMessage(chatId, { video: gifBuffer, gifPlayback: true, caption: fullText });
        }
        return await inst.sock_ref.sendMessage(chatId, { image: gifBuffer, caption: fullText });
      }
      console.log(`🃏 [cmdColl] sending image with caption`);
      return await inst.sock_ref.sendMessage(chatId, { image: gifBuffer, caption: fullText });
    }
  }

  // Fallback text-only (Send as one message)
  console.log(`🃏 [cmdColl] sending text-only fallback`);
  return reply(msg + lines.join('\n') + `\n\n*[Use ${p} coll <card_index> to see more detail]*`);
}

async function cmdDeck(senderJid, reply, chatId, args = []) {
  const inst = getInst();
  const p = P();

  // 💡 FEATURE 2026-07-27: hybrid is now the DEFAULT render mode.
  // Same flag/preference logic as cmdColl — see comment there for details.
  let useHybridAnim;
  const animFlagIdx = args.findIndex(a => a === '--anim' || a === '-a' || a === '--animated');
  const staticFlagIdx = args.findIndex(a => a === '--static' || a === '-s');
  if (animFlagIdx !== -1) {
    useHybridAnim = true;
    args.splice(animFlagIdx, 1);
    console.log(`🃏 [cmdDeck] --anim flag (one-shot override) → hybrid`);
  } else if (staticFlagIdx !== -1) {
    useHybridAnim = false;
    args.splice(staticFlagIdx, 1);
    console.log(`🃏 [cmdDeck] --static flag (one-shot override) → static`);
  } else {
    const mode = await getUserRenderMode(senderJid);
    useHybridAnim = (mode === 'hybrid');
    console.log(`🃏 [cmdDeck] user preference: ${mode}`);
  }

  if (args.length > 0) {
    const slot = parseInt(args[0]);
    if (!isNaN(slot)) {
        const uc = await UserCard.findOne({ userId: senderJid, inMainDeck: true, mainDeckSlot: slot });
        if (uc) {
            const card = CARD_INDEX()[uc.cardId];
            const stat = await CardStat.findOne({ cardId: uc.cardId });
            const ownerName = await getUserName(uc.userId);
            const caption = buildCardDetailCaption(card, uc, stat, 'Main Deck', slot, ownerName);
            try {
                if (String(card.tier) === '6' || String(card.tier) === 'S' || isEventCard(card)) {
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
    return sendUsage(reply, `${p} deck`, `${p} deck [slot_number]\n• Animated grid: \`${p} deck --anim\``, `${p} deck 1`);
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

  // GIF generation for deck (Top 15)
  const topCards = getTopCards(deck);
  const imageUrls = getTopImageUrls(topCards);
  if (imageUrls.length > 0) {
    const currentHash = getDeckHash(topCards);
    const cached = gifCache.decks.get(`${senderJid}_main`);

    let gifBuffer;
    let hybridContentType = null;
    if (cached && cached.hash === currentHash && !useHybridAnim && (Date.now() - (cached.ts || 0)) < GIF_CACHE_TTL_MS) {
        gifBuffer = cached.buffer;
    } else if (useHybridAnim) {
        const hybridResult = await goService.generateHybridGrid(imageUrls, "MAIN DECK (TOP 12)");
        if (hybridResult) {
          gifBuffer = hybridResult.buffer;
          hybridContentType = hybridResult.contentType;
        }
        // Don't cache hybrid (see cmdColl comment)
    } else {
        gifBuffer = await goService.generateCardGrid(imageUrls, "MAIN DECK (TOP 12)");
        if (gifBuffer) gifCache.decks.set(`${senderJid}_main`, { hash: currentHash, buffer: gifBuffer, ts: Date.now() });
    }

    if (gifBuffer) {
        if (useHybridAnim) {
          const isVideo = hybridContentType && hybridContentType.includes('video');
          if (isVideo) {
            return await inst.sock_ref.sendMessage(chatId, { video: gifBuffer, gifPlayback: true, caption: msg });
          }
          return await inst.sock_ref.sendMessage(chatId, { image: gifBuffer, caption: msg });
        }
        return await inst.sock_ref.sendMessage(chatId, { image: gifBuffer, caption: msg });
    }
  }

  return reply(msg);
}

async function cmdScc(senderJid, reply, chatId, args = []) {
  const inst = getInst();
  const p = P();

  let page = 1;
  const pageIdx = args.findIndex(a => a === '--page' || a === '-p');
  if (pageIdx !== -1 && args[pageIdx+1]) {
    page = parseInt(args[pageIdx+1]) || 1;
    args.splice(pageIdx, 2);
  }

  const animeQuery = args.join(' ').toLowerCase().trim();
  if (!animeQuery) return sendUsage(reply, `${p} scc`, `${p} scc <anime_name> [--page n]`, `${p} scc dragon ball`);

  // 💡 BUG-03 fix: fetch ALL owned cards (for display) but build the coll-number
  // map from COLL-ONLY cards (matching .g coll numbering). The old code built
  // collNumberMap from ALL cards, so the numbers didn't match what .g coll
  // showed — and the collNum was computed but never rendered in the output.
  const allOwned = await UserCard.find({ userId: senderJid }).sort({ createdAt: 1 });

  // Build coll-number map from COLL-ONLY cards (not in deck, not for sale).
  // This matches the numbering used by .g coll, .g t2deck, .g burn, .g cg, etc.
  const collOnly = await UserCard.find({
    userId: senderJid,
    inMainDeck: false,
    inCustomDeck: false,
    forSale: false,
  }).sort({ createdAt: 1 });
  const collNumberMap = new Map();
  collOnly.forEach((uc, i) => {
    collNumberMap.set(uc._id.toString(), i + 1);
  });

  const filtered = [];

  // 💡 FIX (BUG 3: "scc doesn't show coll numbers, gives random ones, needs
  // redesign"). The old scc used a sequential `collIndex = i + 1` based on
  // position in the OWNED array — but that index was only valid within the
  // filtered chunk, not the actual collection. Now we compute the TRUE
  // collection index by counting only non-deck, non-sale cards (matching
  // the coll/coll display the user sees elsewhere). Also redesigned the
  // output to match the user's requested format: grouped by tier with
  // proper icons (👑 for S, 💎 for 6, ✨ for 5, etc.), tier S gets a crown,
  // and it's a flex mechanism not a paginated list.

  allOwned.forEach((uc) => {
    const card = CARD_INDEX()[uc.cardId];
    if (card?.animeName.toLowerCase().includes(animeQuery)) {
      // Determine location
      let location = '📜 Collection';
      if (uc.inMainDeck) location = '🎴 Main Deck';
      else if (uc.inCustomDeck) location = '📁 Custom Deck';
      else if (uc.forSale) location = '🏷️ Market';

      // Coll number only exists for cards in the loose collection.
      // Deck/market cards have no coll number (shown as —).
      const collNum = collNumberMap.has(uc._id.toString())
        ? collNumberMap.get(uc._id.toString())
        : null;

      filtered.push({
        uc,
        card,
        collNum,
        location,
      });
    }
  });

  if (!filtered.length) return reply(`📭 No cards found for anime: *${animeQuery}*`);

  // Sort by tier descending (S > 6 > 5 > 4 > 3 > 2 > 1 > E), then by coll number
  const tierOrder = { 'S': 100, '6': 90, '5': 80, '4': 70, '3': 60, '2': 50, '1': 40, 'E': 30 };
  // 💡 BUG-03 fix: sort uses collNum — null (deck/market cards) sort after
  // numbered cards so they appear at the end of each tier group.
  filtered.sort((a, b) => {
    const ta = tierOrder[String(a.card.tier)] || 0;
    const tb = tierOrder[String(b.card.tier)] || 0;
    if (tb !== ta) return tb - ta;
    // Cards with coll numbers sort first (ascending), then nulls last
    if (a.collNum === null && b.collNum === null) return 0;
    if (a.collNum === null) return 1;
    if (b.collNum === null) return -1;
    return a.collNum - b.collNum;
  });

  // Pagination
  const pageSize = 25;
  const totalPages = Math.ceil(filtered.length / pageSize);
  if (page > totalPages) page = totalPages;
  const start = (page - 1) * pageSize;
  const chunk = filtered.slice(start, start + pageSize);

  // 💡 Flex-style format matching the user's example
  const tierIcons = { 'S': '👑', '6': '💎', '5': '✨', '4': '🎗', '3': '🔮', '2': '🌈', '1': '🎴', 'E': '🎁' };

  let msg = `🔍 *Found ${filtered.length} card(s)* with "${animeQuery}":\n\n`;
  for (const item of chunk) {
    const icon = tierIcons[String(item.card.tier)] || '🃏';
    // 💡 BUG-03 fix: render the coll number (was computed but never shown).
    // Deck/market cards show no coll number (just the location).
    const numStr = item.collNum ? ` [#${item.collNum}]` : '';
    msg += `${icon} *${item.card.cardName}* (Tier ${item.card.tier})${numStr} in ${item.location}\n`;
  }

  if (totalPages > 1) {
    msg += `\n📖 Page ${page}/${totalPages} — \`${p} scc ${animeQuery} --page ${page + 1 <= totalPages ? page + 1 : 1}\` for more`;
  }

  return reply(msg);
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

  // 💡 FIX: Added 'E' (Event) tier. Previously this code CRASHED with
  // "TypeError: Cannot read property 'push' of undefined" if the user
  // owned any event cards, because `tiers['E']` was undefined.
  const tiers = { 'S': [], 'E': [], '6': [], '5': [], '4': [], '3': [], '2': [], '1': [] };
  const tierEmoji = { 'S': '👑', 'E': '🎁', '6': '💎', '5': '✨', '4': '🎗', '3': '🔮', '2': '🌈', '1': '🎴' };

  filtered.forEach(uc => {
    const card = CARD_INDEX()[uc.cardId];
    if (card) {
      const t = String(card.tier);
      if (tiers[t]) tiers[t].push(card.cardName);
    }
  });

  let msg = `🎨 *Cards | Made by ${makerQuery}*\n\n`;
  // 💡 FIX: Added 'E' to the iteration order
  for (const t of ['S', 'E', '6', '5', '4', '3', '2', '1']) {
    if (tiers[t].length > 0) {
      const label = TIER_LABEL[t] || `TIER ${t}`;
      msg += `${tierEmoji[t]} *${label}*\n`;
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
  let page = 1;
  const pageIdx = args.findIndex(a => a === '--page' || a === '-p');
  if (pageIdx !== -1 && args[pageIdx+1]) {
    page = parseInt(args[pageIdx+1]) || 1;
    args.splice(pageIdx, 2);
  }

  const query = args.join(' ').toLowerCase().trim();
  if (!query) return sendUsage(reply, `${p} escc`, `${p} escc <series_name> [--page n]`, `${p} escc fullmetal`);

  const matches = ALL_CARDS().filter(c => c.animeName.toLowerCase().includes(query) && c.tier === 'S');
  if (matches.length === 0) return reply(`🔍 No event (Tier S) cards found for series: *"${query}"*`);

  const pageSize = 15;
  const totalPages = Math.ceil(matches.length / pageSize);
  if (page > totalPages) page = totalPages;
  const start = (page - 1) * pageSize;
  const chunk = matches.slice(start, start + pageSize);

  let msg = `✨ *Event Cards | ${matches[0].animeName.toUpperCase()}* ✨\n`;
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `📦 Total Matches: ${matches.length}\n`;
  msg += `📖 Page: ${page} / ${totalPages}\n\n`;

  chunk.forEach(c => {
    msg += `▫️ *${c.cardName}*\n   ➥ ID: \`${c.id}\`\n`;
  });

  if (totalPages > 1) {
    msg += `\n💡 Use \`${p} escc ${query} --page ${page + 1 <= totalPages ? page + 1 : 1}\` for more.`;
  }

  return reply(msg);
}

async function cmdFc(senderJid, reply, args = []) {
  const p = P();
  const query = args.join(' ').toLowerCase().trim();
  if (!query) return sendUsage(reply, `${p} fc`, `${p} fc <card_name or id>`, `${p} fc goku`);

  // 💡 FIX (BUG 2: "fc command only shows one card if you have 2 of the same
  // name, needs to show all and their coll number"):
  // The old cmdFc used `return reply(...)` on the FIRST match in each
  // location, so if you had 2 "Akatsuki" cards in your collection, only
  // the first was shown. Now we collect ALL matches across all locations
  // (main deck, custom decks, collection) and display them in a single
  // message with their location + coll number.
  const matches = [];

  // 1. Search Main Deck
  const deck = await UserCard.find({ userId: senderJid, inMainDeck: true }).sort({ mainDeckSlot: 1 });
  for (const uc of deck) {
    const card = CARD_INDEX()[uc.cardId];
    if (uc.cardId.toLowerCase() === query || (card?.cardName && card.cardName.toLowerCase().includes(query))) {
      matches.push({
        card,
        location: `Main Deck (Slot #${uc.mainDeckSlot})`,
        ucId: uc._id,
      });
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
        if (uc.cardId.toLowerCase() === query || (card?.cardName && card.cardName.toLowerCase().includes(query))) {
          matches.push({
            card,
            location: `Deck: ${cd.name} (Slot #${i + 1})`,
            ucId: uc._id,
          });
        }
      }
    }
  }

  // 3. Search Collection (cards not in any deck, not for sale)
  const owned = await UserCard.find({ userId: senderJid, inMainDeck: false, inCustomDeck: false, forSale: false }).sort({ createdAt: 1 });
  for (let i = 0; i < owned.length; i++) {
    const uc = owned[i];
    const card = CARD_INDEX()[uc.cardId];
    if (uc.cardId.toLowerCase() === query || (card?.cardName && card.cardName.toLowerCase().includes(query))) {
      matches.push({
        card,
        location: `Collection (Coll #${i + 1})`,
        ucId: uc._id,
      });
    }
  }

  if (matches.length === 0) {
    return reply(`❌ Card *"${query}"* not found in your decks or collection.`);
  }

  // Build the result message
  const tierIcons = { '6': '💎', '5': '✨', '4': '🎗', '3': '🔮', '2': '🌈', '1': '🎴', 'S': '👑', 'E': '🎁' };
  let msg = `🔍 *Found ${matches.length} card(s)* matching "${query}":\n\n`;
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const icon = tierIcons[String(m.card?.tier)] || '🃏';
    msg += `${icon} *${m.card?.cardName}* (Tier ${m.card?.tier})\n`;
    msg += `   📍 ${m.location}\n`;
    if (matches.length > 1) {
      msg += `   🆔 \`${m.ucId}\`\n`;
    }
    msg += `\n`;
  }
  if (matches.length > 1) {
    msg += `_Use the Coll # or card ID to reference a specific copy._`;
  }

  return reply(msg);
}

async function cmdInfo(reply, chatId, args = [], perms = {}) {
  // 💡 perms = { isOwner, isCardMod, p }
  // Event card lookups require mod permissions. Regular card lookups
  // are available to everyone.
  const isOwner = perms.isOwner || false;
  const isCardMod = perms.isCardMod || false;
  const canViewEvents = isOwner || isCardMod;
  const p = perms.p || P();
  let query = args.join(' ').toLowerCase().trim();
  let animeFilter = null;

  // Support both `|` separator and space-separated anime filter
  // e.g. "info Roy event | fullmetal" or "info Roy event fullmetal"
  let eventMode = false;
  if (query.includes('|')) {
    const parts = query.split('|');
    query = parts[0].trim();
    animeFilter = parts[1].trim();
  }

  // Check for "event" keyword — triggers event card search mode
  // e.g. "roy event" or "roy event | fullmetal"
  if (query.includes(' event')) {
    eventMode = true;
    query = query.replace(' event', '').trim();
  }
  // Also handle "event" at the start: "event roy"
  if (query.startsWith('event ')) {
    eventMode = true;
    query = query.substring(6).trim();
  }

  if (!query && !eventMode) return sendUsage(reply, `${p} info`, `${p} info <card_name or id> | [anime]`, `${p} info Winry | fullmetal alchemist`);

  // 💡 MOD-ONLY GATE: Event card search requires mod permissions.
  // Non-mods get a friendly message instead of the event search results.
  if (eventMode && !canViewEvents) {
    return reply(`❌ Event card search is for moderators and above only.\n\nEvent cards are special cards that don't spawn naturally — they're managed by mods via the token event eShop.\n\nUse \`${p} eshop\` to buy event cards during active token events.`);
  }

  // 💡 MOD-ONLY GATE: Looking up an E-tier card by exact ID also requires
  // mod permissions (prevents non-mods from viewing event card details).
  if (query && !eventMode) {
    const exactCard = CARD_INDEX()[query];
    if (exactCard && isEventCard(exactCard) && !canViewEvents) {
      return reply(`❌ Event card details are for moderators and above only.\n\nThis is an event-tier card. Use \`${p} eshop\` to buy event cards during active token events.`);
    }
  }

  // 💡 EVENT CARD SEARCH MODE
  // `info <name> event | <anime>` → search event-tier cards by name and anime
  // `info E-00001 event` → also check exact ID first
  if (eventMode) {
    // 💡 FIX: Check if query is an exact E-XXXXX ID first
    if (query) {
      const exactEventCard = CARD_INDEX()[query];
      if (exactEventCard && isEventCard(exactEventCard)) {
        // Found by exact ID — show details directly
        const stat = await CardStat.findOne({ cardId: exactEventCard.id });
        const caption = buildCardDetailCaption(exactEventCard, null, stat, 'Event Database');
        try {
          if (String(exactEventCard.tier) === '6' || String(exactEventCard.tier) === 'S' || isEventCard(exactEventCard)) {
            const gifBuffer = await goService.convertCardImage(exactEventCard.imageUrl);
            if (gifBuffer) {
              return await getInst().sock_ref.sendMessage(chatId, { video: gifBuffer, gifPlayback: true, caption });
            }
          }
          const res = await axios.get(exactEventCard.imageUrl, { responseType: 'arraybuffer', timeout: 12000, headers: { 'User-Agent': 'Mozilla/5.0' } });
          return await getInst().sock_ref.sendMessage(chatId, { image: Buffer.from(res.data), caption });
        } catch (e) {
          return reply(caption);
        }
      }
    }

    const results = await searchEventCards(query, animeFilter);
    if (results.length === 0) {
      return reply(`❌ No event cards found${query ? ` matching "${query}"` : ''}${animeFilter ? ` in anime "${animeFilter}"` : ''}.\n\nEvent cards are special and don't spawn naturally. They're only available during token events via the eShop.`);
    }

    let msg = `🎁 *EVENT CARD SEARCH* 🎁\n`;
    msg += `📦 Found ${results.length} event card${results.length === 1 ? '' : 's'}:\n\n`;
    results.forEach(c => {
      msg += `▫️ *${c.cardName}* (T${c.tier})\n   ➥ ID: \`${c.id}\` | Event: _${c.animeName}_\n`;
    });
    msg += `\n💡 Use \`${p} info <id>\` to see full details.`;
    return reply(msg);
  }

  // Exact ID check first
  const exact = CARD_INDEX()[query];
  if (exact) {
    const stat = await CardStat.findOne({ cardId: exact.id });
    const caption = buildCardDetailCaption(exact, null, stat, 'Global Database');
    try {
      if (String(exact.tier) === '6' || String(exact.tier) === 'S' || isEventCard(exact)) {
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
  const matches = ALL_CARDS().filter(c =>
    c.cardName.toLowerCase().includes(query) &&
    (!animeFilter || c.animeName.toLowerCase().includes(animeFilter))
  );

  if (matches.length === 0) return reply(`❌ Card not found: *"${query}"*${animeFilter ? ` in anime *"${animeFilter}"*` : ''}`);

  if (matches.length === 1) {
    const card = matches[0];
    const stat = await CardStat.findOne({ cardId: card.id });
    const caption = buildCardDetailCaption(card, null, stat, 'Global Database');
    try {
      if (String(card.tier) === '6' || String(card.tier) === 'S' || isEventCard(card)) {
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
  if (!args.length) return sendUsage(reply, `${p} t2deck`, `${p} t2deck <coll_index> [index2] [index3]...`, `${p} t2deck 1\n${p} t2deck 10 21 3`);

  // Parse all indices (skip non-numbers)
  const indices = [...new Set(args.map(a => parseInt(a)).filter(n => !isNaN(n) && n > 0))];
  if (!indices.length) return sendUsage(reply, `${p} t2deck`, `${p} t2deck <coll_index> [index2] [index3]...`, `${p} t2deck 10 21 3`);

  const owned = await UserCard.find({ userId: senderJid, inMainDeck: false, inCustomDeck: false, forSale: false }).sort({ createdAt: 1 });
  const deck  = await UserCard.find({ userId: senderJid, inMainDeck: true }).sort({ mainDeckSlot: 1 });

  const slotsAvailable = MAIN_DECK_SIZE - deck.length;
  if (slotsAvailable <= 0) return reply(`❌ Your main deck is full (${MAIN_DECK_SIZE}/12)! Move a card to your collection first.`);
  if (indices.length > slotsAvailable) return reply(`⚠️ Only *${slotsAvailable}* slot(s) left in your deck. You tried to add ${indices.length} cards — please reduce the number.`);

  // Find next available slots
  const usedSlots = new Set(deck.map(d => d.mainDeckSlot));
  const getNextSlot = () => { let s = 1; while (usedSlots.has(s)) s++; usedSlots.add(s); return s; };

  const results = [];
  for (const idx of indices) {
    const uc = owned[idx - 1];
    if (!uc) { results.push(`❌ #${idx} — not found`); continue; }
    const card = CARD_INDEX()[uc.cardId];
    const slot = getNextSlot();
    uc.inMainDeck = true;
    uc.mainDeckSlot = slot;
    await uc.save();
    results.push(`✅ *${card?.cardName ?? uc.cardId}* → Slot #${slot}`);
  }

  const header = indices.length === 1 ? '🎴 Card moved to main deck!' : `🎴 *${results.length}* card(s) moved to main deck!`;
  return reply(`${header}\n\n${results.join('\n')}`);
}


async function cmdT2CDeck(senderJid, reply, args = []) {
  const p = P();

  // 💡 UPDATED 2026-07-18: now supports multiple indices.
  // Format: .g t2cdeck 1 5 10 Waifus   (moves cards #1, #5, #10 to "Waifus")
  const indices = [];
  let deckNameParts = [];
  let foundNonNumeric = false;
  for (const arg of args) {
    if (!foundNonNumeric && /^\d+$/.test(arg)) {
      indices.push(parseInt(arg));
    } else {
      foundNonNumeric = true;
      deckNameParts.push(arg);
    }
  }
  const deckNameQuery = deckNameParts.join(' ').trim();
  const uniqueIndices = [...new Set(indices.filter(n => n > 0))];

  if (!uniqueIndices.length || !deckNameQuery) {
    return sendUsage(reply, `${p} t2cdeck`, `${p} t2cdeck <coll_index> [index2] [index3]... <deck_name>`, `${p} t2cdeck 1 Waifus\n${p} t2cdeck 5 10 21 Best Cards`);
  }

  const owned = await UserCard.find({ userId: senderJid, inMainDeck: false, inCustomDeck: false, forSale: false }).sort({ createdAt: 1 });
  const decks = await CardDeck.find({ userId: senderJid });
  if (decks.length === 0) return reply('❌ You have no custom decks. Create one first!');

  let targetDeck = decks.find(d => d.name.toLowerCase() === deckNameQuery.toLowerCase());
  if (!targetDeck) targetDeck = decks.find(d => d.name.toLowerCase().includes(deckNameQuery.toLowerCase()));
  if (!targetDeck) return reply(`❌ Custom deck *"${deckNameQuery}"* not found.`);

  const results = [];
  let nextSlot = targetDeck.cards.length;
  for (const idx of uniqueIndices) {
    const uc = owned[idx - 1];
    if (!uc) { results.push(`❌ #${idx} — not found`); continue; }
    uc.inCustomDeck = true;
    uc.customDeckName = targetDeck.name;
    nextSlot++;
    uc.customDeckSlot = nextSlot;
    await uc.save();
    targetDeck.cards.push(uc._id);
    const card = CARD_INDEX()[uc.cardId];
    results.push(`✅ *${card?.cardName ?? uc.cardId}* → Slot #${nextSlot}`);
  }
  await targetDeck.save();

  const header = uniqueIndices.length === 1
    ? `✅ Card moved to custom deck *"${targetDeck.name}"*!`
    : `✅ *${results.filter(r => r.startsWith('✅')).length}* card(s) moved to custom deck *"${targetDeck.name}"*!`;
  return reply(`${header}\n\n${results.join('\n')}`);
}

async function cmdESummon(senderJid, reply) {
  const eventDeck = await CardDeck.findOne({ name: { $regex: /^(event shop|event deck)$/i } });
  if (!eventDeck) return reply('❌ The event shop is currently closed.');
  if (eventDeck.cards.length === 0) return reply('❌ The event shop is currently empty! All cards have been claimed.');

  const randomIndex = Math.floor(Math.random() * eventDeck.cards.length);
  const cardIdToPull = eventDeck.cards[randomIndex];

  const uc = await UserCard.findById(cardIdToPull);
  if (!uc) {
     eventDeck.cards.splice(randomIndex, 1);
     await eventDeck.save();
     return reply('❌ Error fetching card. Please try again.');
  }

  uc.userId = senderJid;
  uc.inCustomDeck = false;
  uc.customDeckName = null;
  uc.customDeckSlot = null;
  await uc.save();

  eventDeck.cards.splice(randomIndex, 1);
  await eventDeck.save();

  const card = CARD_INDEX()[uc.cardId];
  const stat = await CardStat.findOne({ cardId: uc.cardId });
  const rarity = getRarityLabel(uc.copyNumber, stat?.maxCopies || BASE_MAX[String(card.tier)] || 200);

  const _summonTier = String(card.tier);
    const _summonLabel = TIER_LABEL[_summonTier] || `TIER ${_summonTier}`;
    return reply(`🎉 *EVENT SUMMON!* 🎉\n\nYou pulled *${card.cardName}* — _${card.animeName}_\n${TIER_STARS[_summonTier] || '✆'} ${_summonLabel} | Copy *#${uc.copyNumber}* (${rarity.label})\n\n_Added to your collection!_`);
}

async function cmdEShop(senderJid, reply, chatId, args = [], isMod = false) {
  const p = P();
  const sub = args[0]?.toLowerCase();

  // ── TOKEN EVENT ESHOP ────────────────────────────
  // `eshop` (no args) → show the 4x4 event card grid
  // `eshop buy <slot>` → buy a card from the grid using tokens
  if (sub === 'buy' && args[1] && !args[1].startsWith('deck')) {
    const slot = parseInt(args[1]);
    if (isNaN(slot) || slot < 1 || slot > 16) {
      return reply(`❌ Usage: \`${p} eshop buy <slot_number>\` (1-16)`);
    }
    const result = await eshopBuy(senderJid, slot);
    return reply(result.message);
  }

  // ── DECK TRADING (old eshop, now under `eshop deck`) ──
  if (sub === 'deck') {
    return cmdEShopDeckTrading(senderJid, reply, chatId, args.slice(1), isMod);
  }

  // ── DEFAULT: Show the token event eShop (4x4 grid image) ──
  const inst = getInst();
  const filledSlots = inst.eshopDeck.filter(e => e !== null).length;

  if (filledSlots === 0) {
    return reply(`📭 *EVENT SHOP*\n\nThe eShop is currently empty. The owner needs to add event cards first.\n\nOwner: Use \`${p} t2edeck add <slot> <cardId> <price>\` to add cards.`);
  }

  // Generate and send the 4x4 grid image
  const imageBuffer = await generateEShopDeckImage();
  if (imageBuffer) {
    const tokenBalance = economy.getTokens(senderJid);
    const eventActive = await isTokenEventActive();
    const caption = `🎁 *EVENT SHOP* 🎁\n` +
      `━━━━━━━━━━━━━━━\n` +
      `🎫 Your Tokens: *${tokenBalance}*\n` +
      `📊 Event Status: ${eventActive ? '🟢 ACTIVE' : '🔴 INACTIVE'}\n` +
      `📦 Cards Available: *${filledSlots}/16*\n\n` +
      `💡 Use \`${p} eshop buy <slot_number>\` to purchase.`;
    try {
      return await getInst().sock_ref.sendMessage(chatId, { image: imageBuffer, caption });
    } catch (err) {
      console.error('[eShop] Failed to send image:', err.message);
    }
  }

  // Fallback: text list if image generation failed
  let msg = `🎁 *EVENT SHOP* 🎁\n`;
  msg += `🎫 Your Tokens: *${economy.getTokens(senderJid)}*\n\n`;
  inst.eshopDeck.forEach((entry, i) => {
    if (entry) {
      msg += `*${i + 1}.* ${entry.cardName} (T${entry.tier})\n   🎫 Price: ${entry.price} tokens\n   📺 ${entry.anime}\n\n`;
    }
  });
  msg += `💡 Use \`${p} eshop buy <slot_number>\` to purchase.`;
  return reply(msg);
}

// Old deck-trading eshop, renamed to `eshop deck <subcommand>`
async function cmdEShopDeckTrading(senderJid, reply, chatId, args = [], isMod = false) {
  const p = P();
  const sub = args[0]?.toLowerCase();

  if (sub === 'sell') {
    const deckName = args[1];
    const price = parseInt(args[2]);
    if (!deckName || isNaN(price) || price < 1) {
      return sendUsage(reply, `${p} eshop deck sell`, `${p} eshop deck sell <deck_name> <price>`, `${p} eshop deck sell Waifus 50000`);
    }

    const deck = await CardDeck.findOne({ userId: senderJid, name: { $regex: new RegExp(`^${escapeRegex(deckName)}$`, 'i') } });
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
    if (!id) return reply(`❌ Usage: \`${p} eshop deck ${sub} <listing_id>\``);

    try {
      const listing = await CardMarket.findById(id);
      if (!listing || !listing.isDeck) return reply('❌ Listing not found.');

      if (sub === 'approve') {
        listing.status = 'active';
        listing.approvalStatus = 'approved';
        await listing.save();
        return reply(`✅ Approved deck listing *#${id}*. It is now live in the Deck Shop!`);
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
    msg += `💡 Use \`${p} eshop deck approve/reject <id>\``;
    return reply(msg, { mentions: pending.map(l => l.sellerId) });
  }

  if (sub === 'buy') {
    const index = parseInt(args[1]);
    if (isNaN(index)) return sendUsage(reply, `${p} eshop deck buy`, `${p} eshop deck buy <number>`, `${p} eshop deck buy 1`);

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

  // Default: List Deck Shop
  const active = await CardMarket.find({ status: 'active', isDeck: true }).sort({ listedAt: -1 });
  if (active.length === 0) return reply('📭 The Deck Shop is currently empty. Sell your decks with `.eshop deck sell <name> <price>`.');

  let msg = `🏬 *CARD DECK SHOP* 🏬\n\n`;
  active.forEach((l, i) => {
    msg += `*${i + 1}.* 📂 *${l.deckName}*\n`;
    msg += `   💰 Price: ${ZENI()}${l.price.toLocaleString()}\n`;
    msg += `   👤 Seller: @${l.sellerId.split('@')[0]}\n\n`;
  });
  msg += `💡 Use \`${p} eshop deck buy <number>\` to purchase.`;
  return reply(msg, { mentions: active.map(l => l.sellerId) });
}

async function cmdT2CDeck(senderJid, reply, args = []) {
  const p = P();

  // 💡 UPDATED 2026-07-18: now supports multiple indices.
  // Format: .g t2cdeck 1 5 10 Waifus   (moves cards #1, #5, #10 to "Waifus")
  const indices = [];
  let deckNameParts = [];
  let foundNonNumeric = false;
  for (const arg of args) {
    if (!foundNonNumeric && /^\d+$/.test(arg)) {
      indices.push(parseInt(arg));
    } else {
      foundNonNumeric = true;
      deckNameParts.push(arg);
    }
  }
  const deckNameQuery = deckNameParts.join(' ').trim();
  const uniqueIndices = [...new Set(indices.filter(n => n > 0))];

  if (!uniqueIndices.length || !deckNameQuery) {
    return sendUsage(reply, `${p} t2cdeck`, `${p} t2cdeck <coll_index> [index2] [index3]... <deck_name>`, `${p} t2cdeck 1 Waifus\n${p} t2cdeck 5 10 21 Best Cards`);
  }

  const owned = await UserCard.find({ userId: senderJid, inMainDeck: false, inCustomDeck: false, forSale: false }).sort({ createdAt: 1 });
  const decks = await CardDeck.find({ userId: senderJid });
  if (decks.length === 0) return reply('❌ You have no custom decks. Create one first!');

  let targetDeck = decks.find(d => d.name.toLowerCase() === deckNameQuery.toLowerCase());
  if (!targetDeck) targetDeck = decks.find(d => d.name.toLowerCase().includes(deckNameQuery.toLowerCase()));
  if (!targetDeck) return reply(`❌ Custom deck *"${deckNameQuery}"* not found.`);

  const results = [];
  let nextSlot = targetDeck.cards.length;
  for (const idx of uniqueIndices) {
    const uc = owned[idx - 1];
    if (!uc) { results.push(`❌ #${idx} — not found`); continue; }
    uc.inCustomDeck = true;
    uc.customDeckName = targetDeck.name;
    nextSlot++;
    uc.customDeckSlot = nextSlot;
    await uc.save();
    targetDeck.cards.push(uc._id);
    const card = CARD_INDEX()[uc.cardId];
    results.push(`✅ *${card?.cardName ?? uc.cardId}* → Slot #${nextSlot}`);
  }
  await targetDeck.save();

  const header = uniqueIndices.length === 1
    ? `✅ Card moved to custom deck *"${targetDeck.name}"*!`
    : `✅ *${results.filter(r => r.startsWith('✅')).length}* card(s) moved to custom deck *"${targetDeck.name}"*!`;
  return reply(`${header}\n\n${results.join('\n')}`);
}

async function cmdT2Coll(senderJid, reply, args = []) {
  const p = P();
  if (!args.length) return sendUsage(reply, `${p} t2coll`, `${p} t2coll <deck_slot> [slot2] [slot3]...`, `${p} t2coll 1\n${p} t2coll 1 3 5`);

  // Parse all slot numbers (skip non-numbers), deduplicate
  const slots = [...new Set(args.map(a => parseInt(a)).filter(n => !isNaN(n) && n > 0))];
  if (!slots.length) return sendUsage(reply, `${p} t2coll`, `${p} t2coll <deck_slot> [slot2] [slot3]...`, `${p} t2coll 1 3 5`);

  const results = [];
  for (const slot of slots) {
    const uc = await UserCard.findOne({ userId: senderJid, inMainDeck: true, mainDeckSlot: slot });
    if (!uc) { results.push(`❌ Slot #${slot} — empty`); continue; }
    const card = CARD_INDEX()[uc.cardId];
    uc.inMainDeck = false;
    uc.mainDeckSlot = null;
    await uc.save();
    results.push(`✅ *${card?.cardName ?? uc.cardId}* ← Slot #${slot}`);
  }

  const header = slots.length === 1 ? '📦 Card moved to collection!' : `📦 *${results.filter(r => r.startsWith('✅')).length}* card(s) moved to collection!`;
  return reply(`${header}\n\n${results.join('\n')}`);
}

// 💡 FEATURE 7 (requested a year ago): t2ccoll — move a card FROM a custom
// deck BACK to the collection by collection number.
// Format: .g t2ccoll <coll_index> <deck_name>
//   <coll_index> = the slot number of the card within the custom deck
//   <deck_name>  = the name of the custom deck
// Example: .g t2ccoll 3 Waifus   (removes slot #3 from "Waifus" deck)
//
// This is the inverse of t2cdeck. Previously users had to use
// `cdeck <name> remove <slot>` which used deck-relative slots, not coll
// numbers. The user explicitly asked for the t2ccoll interface.
async function cmdT2CColl(senderJid, reply, args = []) {
  const p = P();

  // Parse: first arg(s) = slot numbers, last part = deck name
  const indices = [];
  let deckNameParts = [];
  let foundNonNumeric = false;
  for (const arg of args) {
    if (!foundNonNumeric && /^\d+$/.test(arg)) {
      indices.push(parseInt(arg));
    } else {
      foundNonNumeric = true;
      deckNameParts.push(arg);
    }
  }
  const deckNameQuery = deckNameParts.join(' ').trim();
  const uniqueIndices = [...new Set(indices.filter(n => n > 0))];

  if (!uniqueIndices.length || !deckNameQuery) {
    return sendUsage(reply, `${p} t2ccoll`, `${p} t2ccoll <slot> [slot2]... <deck_name>`, `${p} t2ccoll 3 Waifus\n${p} t2ccoll 1 5 10 Best Cards`);
  }

  const decks = await CardDeck.find({ userId: senderJid });
  if (decks.length === 0) return reply('❌ You have no custom decks.');

  let targetDeck = decks.find(d => d.name.toLowerCase() === deckNameQuery.toLowerCase());
  if (!targetDeck) targetDeck = decks.find(d => d.name.toLowerCase().includes(deckNameQuery.toLowerCase()));
  if (!targetDeck) return reply(`❌ Custom deck *"${deckNameQuery}"* not found.`);

  // Sort indices descending so we splice from the end first — this keeps
  // the remaining slot numbers stable as we remove cards.
  const sortedIndices = uniqueIndices.sort((a, b) => b - a);
  const results = [];

  for (const slot of sortedIndices) {
    const ucId = targetDeck.cards[slot - 1];
    if (!ucId) { results.push(`❌ Slot #${slot} — empty`); continue; }

    const uc = await UserCard.findById(ucId);
    if (!uc) {
      // Card doc missing — just remove from deck array
      targetDeck.cards.splice(slot - 1, 1);
      results.push(`⚠️ Slot #${slot} — card doc missing, removed from deck`);
      continue;
    }

    const card = CARD_INDEX()[uc.cardId];
    uc.inCustomDeck = false;
    uc.customDeckName = null;
    uc.customDeckSlot = null;
    await uc.save();

    targetDeck.cards.splice(slot - 1, 1);
    results.push(`✅ *${card?.cardName ?? uc.cardId}* ← Slot #${slot} of "${targetDeck.name}"`);
  }

  await targetDeck.save();

  // Re-sort results ascending for display
  results.sort((a, b) => {
    const aNum = parseInt(a.match(/#(\d+)/)?.[1] || '0');
    const bNum = parseInt(b.match(/#(\d+)/)?.[1] || '0');
    return aNum - bNum;
  });

  const header = uniqueIndices.length === 1
    ? `📦 Card moved from custom deck to collection!`
    : `📦 *${results.filter(r => r.startsWith('✅')).length}* card(s) moved from *"${targetDeck.name}"* to collection!`;
  return reply(`${header}\n\n${results.join('\n')}`);
}

// 💡 FEATURE 8: Rc — admin/mod tool to FORCIBLY delete a card from ANY
// player's collection. Used for regulation, cloning bugs, event duplication.
// Format: .g rc @user <card_name> [tier]
// The command searches the target's collection (including decks) for the
// exact card name (+ optional tier) and deletes the FIRST match.
// Permission: Owner / GlobalMod / CardMod only.
async function cmdRc(senderJid, reply, args = [], isCardMod = false, m = {}) {
  const p = P();
  if (!isCardMod) return reply('❌ Rc (regulation card removal) is for moderators and above only.'), true;

  // Parse: @mention or reply → target user, then card name (+ optional tier)
  const mentioned = m?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (!mentioned) return reply(`❌ Usage: \`${p} rc @user <card_name> [tier]\`\n\n_Tag the player whose card you want to delete._`), true;

  // args after the mention
  const parts = args.filter(a => !a.includes('@') && !/^\d{10,}/.test(a));
  if (parts.length === 0) return reply(`❌ Usage: \`${p} rc @user <card_name> [tier]\``), true;

  // Last part might be a tier (S, 6, 5, 4, 3, 2, 1, E)
  const validTiers = ['S', '6', '5', '4', '3', '2', '1', 'E'];
  let tierFilter = null;
  if (parts.length > 1 && validTiers.includes(parts[parts.length - 1].toUpperCase())) {
    tierFilter = parts.pop().toUpperCase();
  }
  const cardNameQuery = parts.join(' ').toLowerCase().trim();
  if (!cardNameQuery) return reply(`❌ Usage: \`${p} rc @user <card_name> [tier]\``), true;

  // Search target's entire collection (main deck + custom decks + collection + market)
  const allCards = await UserCard.find({ userId: mentioned }).sort({ createdAt: 1 });
  let targetUc = null;
  for (const uc of allCards) {
    const card = CARD_INDEX()[uc.cardId];
    if (!card) continue;
    if (card.cardName && card.cardName.toLowerCase() === cardNameQuery) {
      if (tierFilter && String(card.tier).toUpperCase() !== tierFilter) continue;
      targetUc = uc;
      break;
    }
  }
  // Fallback: substring match
  if (!targetUc) {
    for (const uc of allCards) {
      const card = CARD_INDEX()[uc.cardId];
      if (!card) continue;
      if (card.cardName && card.cardName.toLowerCase().includes(cardNameQuery)) {
        if (tierFilter && String(card.tier).toUpperCase() !== tierFilter) continue;
        targetUc = uc;
        break;
      }
    }
  }

  if (!targetUc) {
    return reply(`❌ No card matching "${cardNameQuery}"${tierFilter ? ` (Tier ${tierFilter})` : ''} found for @${mentioned.split('@')[0]}.`, { mentions: [mentioned] }), true;
  }

  const card = CARD_INDEX()[targetUc.cardId];
  const location = targetUc.inMainDeck ? 'Main Deck' : (targetUc.inCustomDeck ? `Custom Deck: ${targetUc.customDeckName}` : (targetUc.forSale ? 'Market' : 'Collection'));

  // If in a custom deck, remove from the deck's cards array
  if (targetUc.inCustomDeck && targetUc.customDeckName) {
    const deck = await CardDeck.findOne({ userId: mentioned, name: targetUc.customDeckName });
    if (deck) {
      deck.cards = deck.cards.filter(id => id.toString() !== targetUc._id.toString());
      await deck.save();
    }
  }

  await UserCard.findByIdAndDelete(targetUc._id);

  return reply(`🗑️ *REGULATION REMOVAL*\n\n👤 Target: @${mentioned.split('@')[0]}\n🃏 Card: *${card.cardName}* (Tier ${card.tier})\n📍 Was in: ${location}\n\n_Card has been permanently deleted._`, { mentions: [mentioned] }), true;
}

// 💡 FEATURE 9: Erc — same as Rc but for event cards. Searches by event
// card ID prefix (E-XXXXX) or event card name.
// Format: .g erc @user <event_card_name_or_id>
async function cmdErc(senderJid, reply, args = [], isCardMod = false, m = {}) {
  const p = P();
  if (!isCardMod) return reply('❌ Erc (event regulation card removal) is for moderators and above only.'), true;

  const mentioned = m?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (!mentioned) return reply(`❌ Usage: \`${p} erc @user <event_card_name_or_id>\``), true;

  const parts = args.filter(a => !a.includes('@') && !/^\d{10,}/.test(a));
  if (parts.length === 0) return reply(`❌ Usage: \`${p} erc @user <event_card_name_or_id>\``), true;

  const query = parts.join(' ').toLowerCase().trim();
  const allCards = await UserCard.find({ userId: mentioned }).sort({ createdAt: 1 });
  let targetUc = null;
  for (const uc of allCards) {
    const card = CARD_INDEX()[uc.cardId];
    if (!card || !isEventCard(card)) continue;
    if (uc.cardId.toLowerCase() === query || (card.cardName && card.cardName.toLowerCase() === query) || (card.cardName && card.cardName.toLowerCase().includes(query))) {
      targetUc = uc;
      break;
    }
  }

  if (!targetUc) {
    return reply(`❌ No event card matching "${query}" found for @${mentioned.split('@')[0]}.`, { mentions: [mentioned] }), true;
  }

  const card = CARD_INDEX()[targetUc.cardId];

  // Remove from custom deck if applicable
  if (targetUc.inCustomDeck && targetUc.customDeckName) {
    const deck = await CardDeck.findOne({ userId: mentioned, name: targetUc.customDeckName });
    if (deck) {
      deck.cards = deck.cards.filter(id => id.toString() !== targetUc._id.toString());
      await deck.save();
    }
  }

  await UserCard.findByIdAndDelete(targetUc._id);

  return reply(`🗑️ *EVENT REGULATION REMOVAL*\n\n👤 Target: @${mentioned.split('@')[0]}\n🃏 Event Card: *${card.cardName}* (${targetUc.cardId})\n\n_Event card has been permanently deleted._`, { mentions: [mentioned] }), true;
}

// 💡 FEATURE 10: Tcoll — TRUE collection. Shows ALL cards the user owns,
// including cards hidden in custom decks and event cards. The regular
// `.g coll` only shows cards in the loose collection (not in any deck).
// Format: .g tcoll  OR  .g tcoll --tier
async function cmdTcoll(senderJid, reply, chatId, args = []) {
  const inst = getInst();
  const p = P();
  const tierMode = args.includes('--tier');

  // Fetch ALL cards regardless of deck/market status
  const allOwned = await UserCard.find({ userId: senderJid }).sort({ createdAt: 1 });
  if (!allOwned.length) return reply('📭 True collection empty.');

  if (tierMode) {
    // Tier-grouped view
    const tiers = { 'S': [], 'E': [], '6': [], '5': [], '4': [], '3': [], '2': [], '1': [] };
    const tierEmoji = { 'S': '👑', 'E': '🎁', '6': '💎', '5': '✨', '4': '🎗', '3': '🔮', '2': '🌈', '1': '🎴' };

    allOwned.forEach((uc, i) => {
      const card = CARD_INDEX()[uc.cardId];
      if (card) {
        const t = String(card.tier);
        if (tiers[t]) {
          let loc = '📜';
          if (uc.inMainDeck) loc = '🎴';
          else if (uc.inCustomDeck) loc = '📁';
          else if (uc.forSale) loc = '🏷️';
          tiers[t].push({ name: card.cardName, index: i + 1, loc });
        }
      }
    });

    let msg = `🃏 *TRUE COLLECTION | Tier View*\n`;
    msg += `📦 Total: ${allOwned.length} cards (including decks & market)\n\n`;
    for (const t of ['S', 'E', '6', '5', '4', '3', '2', '1']) {
      if (tiers[t].length > 0) {
        const label = TIER_LABEL[t] || `TIER ${t}`;
        msg += `${tierEmoji[t]} *${label}* (${tiers[t].length})\n`;
        tiers[t].forEach((item) => {
          msg += `  ${item.loc} #${item.index} ➳ ${item.name}\n`;
        });
        msg += `\n`;
      }
    }
    msg += `_📂 = custom deck, 🎴 = main deck, 🏷️ = market, 📜 = collection_`;
    return reply(msg);
  }

  // Flat list view
  let msg = `🃏 *TRUE COLLECTION*\n`;
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `📦 *Total:* ${allOwned.length} (including decks & market)\n\n`;

  for (let i = 0; i < allOwned.length; i++) {
    const card = CARD_INDEX()[allOwned[i].cardId];
    if (card) {
      let loc = '📜';
      if (allOwned[i].inMainDeck) loc = '🎴';
      else if (allOwned[i].inCustomDeck) loc = '📁';
      else if (allOwned[i].forSale) loc = '🏷️';
      msg += `${loc} *#${i + 1} ➳ ${card.cardName}* (${card.tier})\n`;
    }
  }
  msg += `\n_📂 = custom deck, 🎴 = main deck, 🏷️ = market, 📜 = collection_\n`;
  msg += `_Use \`${p} tcoll --tier\` for tier-grouped view._`;

  return reply(msg);
}

// 💡 FEATURE 11: Ecoll — event collection. Shows ALL event cards the user
// owns, separated by tier. For event flexing.
// Format: .g ecoll  OR  .g ecoll --tier
async function cmdEcoll(senderJid, reply, chatId, args = []) {
  const p = P();

  // Fetch ALL cards, filter to event cards only
  const allOwned = await UserCard.find({ userId: senderJid }).sort({ createdAt: 1 });
  const eventCards = [];
  allOwned.forEach((uc, i) => {
    const card = CARD_INDEX()[uc.cardId];
    if (card && isEventCard(card)) {
      eventCards.push({ uc, card, collNum: i + 1 });
    }
  });

  if (!eventCards.length) return reply('📭 No event cards in your collection.');

  // Group by tier
  const tiers = { 'S': [], '6': [], '5': [], '4': [], '3': [], '2': [], '1': [], 'E': [] };
  const tierEmoji = { 'S': '👑', '6': '💎', '5': '✨', '4': '🎗', '3': '🔮', '2': '🌈', '1': '🎴', 'E': '🎁' };

  eventCards.forEach(item => {
    const t = String(item.card.tier);
    if (tiers[t]) tiers[t].push(item);
  });

  let msg = `🎁 *EVENT COLLECTION*\n`;
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `📦 *Total Event Cards:* ${eventCards.length}\n\n`;

  for (const t of ['S', '6', '5', '4', '3', '2', '1', 'E']) {
    if (tiers[t].length > 0) {
      const label = TIER_LABEL[t] || `TIER ${t}`;
      msg += `${tierEmoji[t]} *${label}* (${tiers[t].length})\n`;
      tiers[t].forEach((item) => {
        let loc = '📜';
        if (item.uc.inMainDeck) loc = '🎴';
        else if (item.uc.inCustomDeck) loc = '📁';
        else if (item.uc.forSale) loc = '🏷️';
        msg += `  ${loc} *${item.card.cardName}* (#${item.collNum})\n`;
      });
      msg += `\n`;
    }
  }
  msg += `_📂 = custom deck, 🎴 = main deck, 🏷️ = market, 📜 = collection_`;

  return reply(msg);
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

async function cmdCS(reply, args = [], perms = {}) {
  // 💡 perms = { isOwner, isCardMod }
  // Non-mods cannot search event (E-tier) cards.
  const canViewEvents = perms.isOwner || perms.isCardMod;
  const p = P();
  if (args.length === 0) return sendUsage(reply, `${p} cs`, `${p} cs <name or series> [tier n] [--page n]`, `${p} cs goku tier S`);

  let page = 1;
  const pageIdx = args.findIndex(a => a === '--page' || a === '-p');
  if (pageIdx !== -1 && args[pageIdx+1]) {
    page = parseInt(args[pageIdx+1]) || 1;
    args.splice(pageIdx, 2);
  }

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
    // 💡 MOD-ONLY GATE: Non-mods cannot search for event cards.
    if (tierFilter === 'E' && !canViewEvents) {
      return reply(`❌ Event card search is for moderators and above only.`);
    }
    // For event card filter, match by ID prefix since event cards now
    // have real tiers (1-6, S) instead of tier 'E'
    if (tierFilter === 'E') {
      matches = matches.filter(c => isEventCard(c));
    } else {
      matches = matches.filter(c => String(c.tier) === tierFilter);
    }
  }

  // 💡 MOD-ONLY GATE: Filter out E-tier cards from non-mod search results
  // entirely (even when no tier filter is specified).
  if (!canViewEvents) {
    matches = matches.filter(c => !isEventCard(c));  // Hide event cards from non-mods
  }
  
  if (matches.length === 0) return reply(`🔍 No cards found matching *"${query}"*${tierFilter ? ` in Tier ${tierFilter}` : ''}`);

  const pageSize = 15;
  const totalFound = matches.length;
  const totalPages = Math.ceil(totalFound / pageSize);
  if (page > totalPages) page = totalPages;
  const start = (page - 1) * pageSize;
  const chunk = matches.slice(start, start + pageSize);

  let msg = `🔍 *Search Results for "${query}"*${tierFilter ? ` (Tier ${tierFilter})` : ''}\n`;
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `📦 Found ${totalFound} matches\n`;
  msg += `📖 Page: ${page} / ${totalPages}\n\n`;
  
  chunk.forEach(c => {
    msg += `▫️ *${c.cardName}* (${c.tier})\n   ➥ ID: \`${c.id}\` | Series: _${c.animeName}_\n`;
  });

  if (totalPages > 1) {
    msg += `\n💡 Use \`${p} cs ${query} ${tierFilter ? 'tier '+tierFilter : ''} --page ${page + 1 <= totalPages ? page + 1 : 1}\` for more.`;
  }

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
            // Verify return values: previously removeMoney and addMoney were
            // called without checking, so if either failed the card might
            // transfer without payment (or payment without card transfer).
            const paid = economy.removeMoney(senderJid, listing.price, `Bought card ${listing.cardId}`);
            if (!paid) {
              return reply('❌ Purchase failed: wallet balance changed during transaction.');
            }
            const credited = economy.addMoney(listing.sellerId, listing.price, `Sold card ${listing.cardId}`);
            if (!credited) {
              // Roll back the buyer's payment
              economy.addMoney(senderJid, listing.price, `Card purchase rollback (seller credit failed)`);
              return reply('❌ Purchase failed: seller could not be credited. Try again later.');
            }

            // Transfer card ownership
            const updated = await UserCard.findByIdAndUpdate(listing.userCardId, { userId: senderJid, forSale: false, salePrice: null });
            if (!updated) {
              // Roll back the transaction — neither party should lose out
              economy.addMoney(senderJid, listing.price, `Card purchase rollback (card not found)`);
              economy.removeMoney(listing.sellerId, listing.price, `Card sale rollback (card not found)`);
              return reply('❌ Purchase failed: card listing was stale. Try the market listing again.');
            }

            listing.status = 'sold';
            listing.completedAt = new Date();
            await listing.save();
            const card = CARD_INDEX()[listing.cardId];
            return reply(`✅ *PURCHASE COMPLETE!*\n\nYou bought *${card.cardName}* for ${ZENI()}${listing.price.toLocaleString()}.`);
        } catch (err) {
            console.error('[CardMarket] Purchase error:', err);
            return reply('❌ Purchase failed: ' + (err.message || 'unknown error'));
        }
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
    
    const deck = await CardDeck.findOne({ userId: senderJid, name: { $regex: new RegExp(`^${escapeRegex(deckName)}$`, 'i') } });
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

  // 💡 FIX (BUG 1: "custom decks don't summon/show anymore, even if u type
  // it properly"). The old code used `new RegExp(`^${name}$`, 'i')` which
  // breaks if the deck name contains regex special characters (parentheses,
  // brackets, asterisks, plus signs, etc.). For example, a deck named
  // "Best (Girls)" would throw a SyntaxError or fail to match. Now we:
  //   1. Escape regex special chars in the name
  //   2. Try exact (case-insensitive) match first
  //   3. Fall back to substring match if no exact match
  // This mirrors the more lenient matching in cmdT2CDeck.
  let deck = await CardDeck.findOne({ userId: senderJid, name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') } });
  if (!deck) {
    // Fallback: substring match
    const allDecks = await CardDeck.find({ userId: senderJid });
    deck = allDecks.find(d => d.name.toLowerCase() === name.toLowerCase())
       || allDecks.find(d => d.name.toLowerCase().includes(name.toLowerCase()));
  }
  if (!deck) return reply(`❌ Custom deck *"${name}"* not found.`);

  if (slot !== null) {
    const ucId = deck.cards[slot - 1];
    if (!ucId) return reply(`❌ No card in slot #${slot} of deck *"${name}"*.`);
    
    const uc = await UserCard.findById(ucId);
    if (uc) {
      const card = CARD_INDEX()[uc.cardId];
      const stat = await CardStat.findOne({ cardId: uc.cardId });
      const ownerName = await getUserName(uc.userId);
      const caption = buildCardDetailCaption(card, uc, stat, `Deck: ${deck.name}`, slot, ownerName);
      try {
        if (String(card.tier) === '6' || String(card.tier) === 'S' || isEventCard(card)) {
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
    if (cached && cached.hash === currentHash && (Date.now() - (cached.ts || 0)) < GIF_CACHE_TTL_MS) {
        gifBuffer = cached.buffer;
    } else {
        gifBuffer = await goService.generateCardGrid(imageUrls, `DECK: ${deck.name.toUpperCase()}`);
        if (gifBuffer) gifCache.decks.set(`${senderJid}_${deck.name}`, { hash: currentHash, buffer: gifBuffer, ts: Date.now() });
    }

    if (gifBuffer) {
        return await inst.sock_ref.sendMessage(chatId, { image: gifBuffer, caption: msg });
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
    const deck = await CardDeck.findOne({ userId: senderJid, name: { $regex: new RegExp(`^${escapeRegex(oldName)}$`, 'i') } });
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

  const deck = await CardDeck.findOne({ userId: targetJid, name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') } });
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
  // 💡 DIAG 2026-07-26: log why handleCommand returns false for .jk coll
  // The log showed cardSystem returning false for .jk coll when it should
  // return true. This logging will reveal which early-return fires.
  if (!inst.sock_ref) {
    console.warn(`🃏 [cardSystem] returning false: inst.sock_ref is null | botId=${botConfig.getBotId()} | inst has instances: ${instances.has(botConfig.getBotId())} | txt=${txt?.slice(0,40)}`);
    return false;
  }

  try {
    const lidResolver = require('../utils/lidResolver');
    senderJid = lidResolver.resolveJid(senderJid);
  } catch (e) {
    console.error("Error resolving senderJid in cardSystem:", e.message);
  }

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

  // 💡 DIAG: log what cmd we're about to handle
  console.log(`🃏 [cardSystem] dispatching cmd="${cmd}" | senderJid=${senderJid?.split('@')[0]} | chatId=${chatId?.split('@')[0]}`);

  // Mod check helper
  // 💡 POLISH 2026-07-17: now also checks isCardsMod() from the 3-tier mod
  // system. Cards Mods can use espawn, einfo, eshop, esummon, etc. but NOT
  // RPG admin commands. General Mods (isMod) and owner still have full access.
  // isCardsMod is imported lazily to avoid circular dependency at load time.
  let isCardsMod = false;
  try {
    const engine = require('../engine');
    isCardsMod = (typeof engine.isCardsMod === 'function') ? engine.isCardsMod(senderJid) : false;
  } catch (e) { /* engine not loaded yet — skip */ }
  const isCardMod = isOwner || inst.modJids.has(senderJid) || isMod || isCardsMod;

  switch (cmd) {
    case 'cardmod':
      if (!isOwner && !isMod) return reply('❌ Only the bot owner or a global mod can manage card moderators.'), true;
      const sub = args[0]?.toLowerCase();
      if (sub === 'add') {
        const target = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || (args[1]?.includes('@') ? args[1] : null);
        if (!target) return reply(`❌ Tag someone to add as card mod.`), true;
        inst.modJids.add(target);
        await saveRoles();
        // 💡 SECURITY FIX: ALSO add to engine's cardsMods Set so the two
        // systems stay in sync. Previously cardmod add only added to the
        // card system's modJids — the engine's isCardsMod() didn't see
        // them, causing inconsistent permission checks.
        try {
          const engine = require('../engine');
          if (typeof engine.addCardsMod === 'function') engine.addCardsMod(target);
        } catch (e) {}
        return reply(`✅ @${target.split('@')[0]} is now a Card Moderator.`, { mentions: [target] }), true;
      }
      if (sub === 'del' || sub === 'remove') {
        const target = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || (args[1]?.includes('@') ? args[1] : null);
        if (!target) return reply(`❌ Tag someone to remove.`), true;
        inst.modJids.delete(target);
        await saveRoles();
        // 💡 SECURITY FIX: ALSO remove from engine's cardsMods Set. Without
        // this, the ban protection (isCardsMod check) still sees them as a
        // mod even after cardmod del — causing "can't ban a mod" for someone
        // who was already removed.
        try {
          const engine = require('../engine');
          if (typeof engine.delCardsMod === 'function') engine.delCardsMod(target);
        } catch (e) {}
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

    case 'anim':
      await cmdAnim(senderJid, reply, chatId, args);
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

    case 'esummon':
      // 💡 MOD-ONLY: Legacy event summon — only mods can use this.
      if (!isCardMod) return reply('❌ Event summon is for moderators and above only.'), true;
      await cmdESummon(senderJid, reply);
      return true;

    case 'info':
      // 💡 Event card lookups are mod-only. Regular card lookups are
      // available to everyone. The event mode is triggered by "event"
      // keyword in the query OR by looking up an E-tier card by ID.
      await cmdInfo(reply, chatId, args, { isOwner, isCardMod, p });
      return true;

    case 't2deck':
      await cmdT2Deck(senderJid, reply, args);
      return true;

    case 't2coll':
      await cmdT2Coll(senderJid, reply, args);
      return true;

    // 💡 FEATURE 7: t2ccoll — move card(s) FROM custom deck TO collection.
    // Inverse of t2cdeck. Requested a year ago, finally added.
    case 't2ccoll':
      await cmdT2CColl(senderJid, reply, args);
      return true;

    // 💡 FEATURE 8: Rc — mod-only regulation card removal from any player.
    case 'rc':
      await cmdRc(senderJid, reply, args, isCardMod, m);
      return true;

    // 💡 FEATURE 9: Erc — mod-only event card regulation removal.
    case 'erc':
      await cmdErc(senderJid, reply, args, isCardMod, m);
      return true;

    // 💡 FEATURE 10: Tcoll — true collection (all cards including decks/market).
    case 'tcoll':
      await cmdTcoll(senderJid, reply, chatId, args);
      return true;

    // 💡 FEATURE 11: Ecoll — event collection separated by tier.
    case 'ecoll':
      await cmdEcoll(senderJid, reply, chatId, args);
      return true;

    // ── TOKEN EVENT & ESHOP COMMANDS ──────────────────
    case 't2edeck':
      await cmdT2EDeck(senderJid, reply, args, isOwner, isMod);
      return true;

    case 't2ecoll':
      // 💡 MOD-ONLY: Event card collection database viewer.
      // Shows all event cards in the database — mod tool for managing events.
      if (!isCardMod) return reply('❌ Event card collection viewer is for moderators and above only.'), true;
      await cmdT2EColl(senderJid, reply, args);
      return true;

    case 'tokens':
      const tokenBal = economy.getTokens(senderJid);
      const eventActive = await isTokenEventActive();
      return reply(
        `🎫 *EVENT TOKENS* 🎫\n` +
        `━━━━━━━━━━━━━━━\n` +
        `Your Balance: *${tokenBal} tokens*\n` +
        `Event Status: ${eventActive ? '🟢 ACTIVE' : '🔴 INACTIVE'}\n\n` +
        `💡 Earn tokens by claiming cards during the event!\n` +
        `Spend them with \`${p} eshop\` to buy event cards.`
      ), true;

    case 'event':
      if (!isOwner && !isMod) return reply('❌ Only the bot owner or a global mod can control the token event.'), true;
      const eventSub = args[0]?.toLowerCase();
      if (eventSub === 'start') {
        const result = await startTokenEvent(senderJid);
        return reply(result.message), true;
      }
      if (eventSub === 'stop') {
        const result = await stopTokenEvent(senderJid);
        return reply(result.message), true;
      }
      if (eventSub === 'status') {
        const active = await isTokenEventActive();
        return reply(`📊 *Token Event Status*\n\nStatus: ${active ? '🟢 ACTIVE' : '🔴 INACTIVE'}\n\nUse \`${p} event start\` or \`${p} event stop\`.`), true;
      }
      return reply(`🎫 *Token Event Control*\n\n➥ \`${p} event start\` — Start the token event\n➥ \`${p} event stop\` — Stop the token event\n➥ \`${p} event status\` — Check current status`), true;

    case 'setprice':
      // .j setprice edeck <slot> <price>
      if (!isOwner && !isMod) return reply('❌ Only the bot owner or a global mod can set eShop prices.'), true;
      if (args[0]?.toLowerCase() === 'edeck') {
        const slot = parseInt(args[1]);
        const price = parseInt(args[2]);
        if (isNaN(slot) || isNaN(price) || price < 1) {
          return reply(`❌ Usage: \`${p} setprice edeck <slot 1-16> <price>\``), true;
        }
        const result = await eshopSetPrice(slot, price);
        return reply(result.message), true;
      }
      return reply(`❌ Usage: \`${p} setprice edeck <slot 1-16> <price>\``), true;

    case 'swap':
      await cmdSwapCard(senderJid, reply, args);
      return true;

    case 'cg':
      await cmdCG(senderJid, reply, args, m);
      return true;

    case 'cs':
      await cmdCS(reply, args, { isOwner, isCardMod });
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
      return false;

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
      let forceTier = null;
      if (spawnQuery.includes('|')) {
        const parts = spawnQuery.split('|');
        spawnQuery = parts[0].trim();
        forceTier = parts[1].trim();
      }
      if (!spawnQuery) return sendUsage(reply, `${p} spawn`, `${p} spawn <name or id> | <tier>`, `${p} spawn Roy mustang | 5`), true;
      
      const spawnRes = await doSpawn(spawnQuery, forceTier, true, chatId);
      if (!spawnRes) return reply(`❌ Card not found matching "${spawnQuery}"${forceTier ? ` in Tier ${forceTier}` : ''}.`), true;
      return true;

    // 💡 .g espawn <name> — force-spawn an event (E-tier) card.
    // Shortcut for `.g spawn <name> | E`. Card-mod only.
    case 'espawn':
      if (!isCardMod) return reply('❌ No permission.'), true;
      const espawnQuery = args.join(' ').trim();
      if (!espawnQuery) {
        // No args → list all available event cards, grouped by event
        const eventCards = getInst().EVENT_CARDS || [];
        if (eventCards.length === 0) {
          return reply(`📭 No event cards exist in the database.\n\nEvent cards have tier "E" in cards_data.json.`), true;
        }
        let listMsg = `🎁 *EVENT CARDS — ${eventCards.length} available*\n\n`;
        listMsg += `Usage: \`${p} espawn <name or id>\`\n\n`;
        // Group by event name for readability
        const byEvent = {};
        eventCards.forEach(c => {
          const ev = c.eventName || c.animeName || 'Unknown Event';
          if (!byEvent[ev]) byEvent[ev] = [];
          byEvent[ev].push(c);
        });
        for (const [ev, cards] of Object.entries(byEvent)) {
          listMsg += `📺 *${ev}* (${cards.length} cards)\n`;
          cards.slice(0, 20).forEach(c => {  // Show first 20 per event
            listMsg += `  ▫️ ${c.cardName} (T${c.tier}) — \`${c.id}\`\n   _${c.animeName}_\n`;
          });
          if (cards.length > 20) {
            listMsg += `  ... and ${cards.length - 20} more\n`;
          }
          listMsg += `\n`;
        }
        return reply(listMsg), true;
      }
      const espawnRes = await doSpawn(espawnQuery, 'E', true, chatId);
      if (!espawnRes) {
        const eventCards = getInst().EVENT_CARDS || [];
        return reply(`❌ Event card not found matching "${espawnQuery}".\n\n${eventCards.length} event cards available. Use \`${p} espawn\` (no args) to list them all.`), true;
      }
      return true;

    // 💡 .g reloadcards — reload cards_data.json without restarting the bot.
    // Mod-only. Use after updating cards_data.json (e.g. after merging new
    // event cards) so the bot picks up the changes immediately.
    case 'reloadcards':
      if (!isCardMod) return reply('❌ Only moderators and above can reload the card database.'), true;
      try {
        const before = inst.ALL_CARDS.length;
        loadCardsDB();
        const after = getInst().ALL_CARDS.length;
        const eventCount = (getInst().EVENT_CARDS || []).length;
        return reply(
          `✅ *Card database reloaded!*\n\n` +
          `📦 Before: ${before} cards\n` +
          `📦 After: ${after} cards\n` +
          `🎁 Event cards: ${eventCount}\n\n` +
          `The new cards are now available for spawn/info/claim.`
        ), true;
      } catch (err) {
        return reply(`❌ Failed to reload: ${err.message}`), true;
      }

    // 💡 .g einfo <name or id> — look up an event card's details.
    // Mod-only shortcut for `.g info <name> event` or `.g info <E-XXXXX>`.
    // Without args, lists all event cards (same as .g espawn with no args).
    case 'einfo':
      if (!isCardMod) return reply('❌ Event card lookup is for moderators and above only.'), true;
      const einfoQuery = args.join(' ').trim();
      if (!einfoQuery) {
        // No args → list all event cards
        const eventCards = getInst().EVENT_CARDS || [];
        if (eventCards.length === 0) {
          return reply(`📭 No event cards exist in the database.`), true;
        }
        let listMsg = `🎁 *EVENT CARDS — ${eventCards.length} in database*\n\n`;
        listMsg += `Usage: \`${p} einfo <name or id>\`\n\n`;
        // Group by event name for readability
        const byEvent = {};
        eventCards.forEach(c => {
          const ev = c.eventName || c.animeName || 'Unknown Event';
          if (!byEvent[ev]) byEvent[ev] = [];
          byEvent[ev].push(c);
        });
        for (const [ev, cards] of Object.entries(byEvent)) {
          listMsg += `📺 *${ev}* (${cards.length} cards)\n`;
          cards.forEach(c => {
            listMsg += `  ▫️ ${c.cardName} (T${c.tier}) — \`${c.id}\`\n   _${c.animeName}_\n`;
          });
          listMsg += `\n`;
        }
        return reply(listMsg), true;
      }

      // 💡 FIX: If the query is an E-XXXXX ID, look it up directly in
      // CARD_INDEX instead of delegating to cmdInfo with the "event"
      // keyword (which does a NAME search, not an ID lookup).
      const directCard = CARD_INDEX()[einfoQuery];
      if (directCard) {
        // Found by exact ID — show card details directly
        const stat = await CardStat.findOne({ cardId: directCard.id });
        const caption = buildCardDetailCaption(directCard, null, stat, 'Event Database');
        try {
          if (String(directCard.tier) === '6' || String(directCard.tier) === 'S' || isEventCard(directCard)) {
            const gifBuffer = await goService.convertCardImage(directCard.imageUrl);
            if (gifBuffer) {
              return await getInst().sock_ref.sendMessage(chatId, { video: gifBuffer, gifPlayback: true, caption });
            }
          }
          const res = await axios.get(directCard.imageUrl, { responseType: 'arraybuffer', timeout: 12000, headers: { 'User-Agent': 'Mozilla/5.0' } });
          return await getInst().sock_ref.sendMessage(chatId, { image: Buffer.from(res.data), caption });
        } catch (e) {
          return reply(caption);
        }
      }

      // Not an exact ID — delegate to cmdInfo with event mode for name search
      await cmdInfo(reply, chatId, [einfoQuery, 'event'], { isOwner, isCardMod: true, p });
      return true;

    // 💡 NEW: .g spawnset <minutes> — set per-bot spawn interval (owner-only)
    // .g spawnset reset — restore default 20min
    // .g spawninfo — show current interval + calculated rates
    case 'spawnset': {
      // 💡 QA: changed from owner-only to mod+ (owner OR global mod OR card mod)
      if (!isCardMod) return reply('❌ Only moderators and above can change the spawn interval.'), true;
      const sub = args[0]?.toLowerCase();

      // .g spawnset tier <tier> <weight|chance> <value>
      // .g spawnset tier reset
      // .g spawnset tier show
      if (sub === 'tier') {
        const tierSub = args[1]?.toUpperCase();
        if (!tierSub) {
          return reply(
            `🔧 *Tier Spawn Configuration*\n\n` +
            `Usage:\n` +
            `• \`${p} spawnset tier <T1-T6|S|E> weight <0-100>\` — set weighted pool weight (0 = disabled)\n` +
            `• \`${p} spawnset tier <T5|T6|S|E> chance <0.0-1.0>\` — set per-spawn chance (0 = disabled)\n` +
            `• \`${p} spawnset tier reset\` — reset to defaults\n` +
            `• \`${p} spawnset tier show\` — view current config\n\n` +
            `Examples:\n` +
            `• \`${p} spawnset tier S chance 0.05\` — 5% chance per spawn for S-tier\n` +
            `• \`${p} spawnset tier 5 weight 5\` — T5 in weighted pool with weight 5\n` +
            `• \`${p} spawnset tier S chance 0\` — disable S-tier spawns\n\n` +
            `_T1-T4 use weights only. T5/T6/S/E can use both weight and chance._`
          ), true;
        }
        if (tierSub === 'RESET') {
          const res = await resetTierConfig();
          return reply(res.message), true;
        }
        if (tierSub === 'SHOW') {
          return reply(`📊 *Tier Spawn Config — ${botConfig.getBotId()}*\n\n${formatTierConfig(getInst())}`), true;
        }
        const type = args[2]?.toLowerCase();
        const value = args[3];
        if (!type || value === undefined) {
          return reply(`❌ Usage: \`${p} spawnset tier ${tierSub} <weight|chance> <value>\``), true;
        }
        const res = await setTierConfig(tierSub, type, value);
        return reply(res.message), true;
      }

      if (sub === 'reset' || sub === 'default') {
        const res = await setSpawnInterval(20, senderJid, isOwner || isMod);
        return reply(res.message), true;
      }
      if (!sub) {
        return reply(
          `🔧 *Spawn Interval Configuration*\n\n` +
          `Usage:\n` +
          `• \`${p} spawnset <minutes>\` — set interval (1 to 1440)\n` +
          `• \`${p} spawnset reset\` — restore default (20 min)\n` +
          `• \`${p} spawninfo\` — view current settings\n\n` +
          `Examples:\n` +
          `• \`${p} spawnset 20\` → 3 spawns/hour (default)\n` +
          `• \`${p} spawnset 15\` → 4 spawns/hour\n` +
          `• \`${p} spawnset 30\` → 2 spawns/hour\n` +
          `• \`${p} spawnset 60\` → 1 spawn/hour\n\n` +
          `_Interval is unique per bot instance and persists across restarts._`
        ), true;
      }
      const res = await setSpawnInterval(sub, senderJid, isOwner || isMod);
      return reply(res.message), true;
    }

    case 'spawninfo': {
      const info = getSpawnIntervalInfo();
      const inst = getInst();
      return reply(
        `📊 *Spawn Configuration — ${botConfig.getBotId()}*\n\n` +
        `⏱️ Interval: *${info.minutes} minutes*\n` +
        `📈 Rate: *${info.spawnsPerHour} spawns/hour*\n` +
        `🎫 Guaranteed tokens: *${info.tokensPerHour}/hour* (during events)\n` +
        `🎲 RNG token bonus: *25%* on non-guaranteed spawns\n\n` +
        `🏠 Active groups: *${info.activeGroups}*\n` +
        `⚙️ Timer: ${info.timerRunning ? '✅ Running' : '⏸️ Idle (no active groups)'}\n\n` +
        `📋 *Tier Spawn Config:*\n${formatTierConfig(inst)}\n\n` +
        `_Use \`${p} spawnset <minutes>\` for interval, \`${p} spawnset tier\` for tier config._`
      ), true;
    }
  }

  return false;
}

// 💡 PERF PATCH 2026-07-27:
// bindSocket() is the SYNCHRONOUS part of init(). It MUST be called before
// any await in the connection.open handler — otherwise incoming messages
// can hit handleCommand() before sock_ref is set, causing cardSystem to
// bail with "inst.sock_ref is null" for every card command during the
// post-connect DB-load window (which can take seconds on a cold start).
//
// init() is still async (awaits DB loads). Callers should call
// bindSocket(sock) FIRST (sync), then fire init(sock, ...) for the DB loads.
function bindSocket(sock) {
  const inst = getInst();
  inst.sock_ref = sock;
}

async function init(sock, admins = [], mods = [], owner = null) {
  const inst = getInst();
  inst.sock_ref  = sock;
  inst.ownerJid  = owner;

  // 💡 SECURITY FIX: Removed hardcoded backdoor JID that was permanently
  // granting card mod access to '251453323092189' on every bot restart.
  // This was a debug leftover that couldn't be removed via normal commands
  // — delcardsmod/cardmod del removed it from the in-memory Set, but init()
  // re-added it on the next restart. Anyone with this JID had permanent
  // unrevokable card mod access.

  admins.forEach(a => inst.adminJids.add(a));
  mods.forEach(m => inst.modJids.add(m));
  loadCardsDB();  // synchronous — reads local JSON file
  // 💡 FIX: await all async loads so the card system is fully ready
  // before any commands are processed. Previously these were fire-and-
  // forget, causing a race condition where commands ran before tier
  // config / eShop deck / token event state was loaded.
  await Promise.all([
    loadActiveGroups(),
    loadRoles(),
    loadTokenEventState(),
    loadEShopDeck(),
    loadSpawnInterval(),
    loadTierConfig(),
  ]);
  console.log(`[CardSystem][${botConfig.getBotId()}] Initialized.`);
}

// ═══════════════════════════════════════════════════════════════════════════
//  SECTION 6 — ESHOP DECK MANAGEMENT COMMANDS (t2edeck, t2ecoll)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * cmdT2EDeck — Owner-only command to manage the eShop deck.
 * Usage:
 *   t2edeck                    → Show current deck (4x4 image)
 *   t2edeck add <slot> <cardId> <price>  → Add a card to a slot
 *   t2edeck remove <slot>      → Remove a card from a slot
 *   t2edeck price <slot> <price> → Set price for a slot
 *   t2edeck clear              → Clear all slots
 */
async function cmdT2EDeck(senderJid, reply, args, isOwner, isMod) {
  const p = P();

  if (!isOwner && !isMod) {
    return reply('❌ Only the bot owner or a global mod can manage the eShop deck.');
  }

  const sub = args[0]?.toLowerCase();

  if (sub === 'add') {
    const slot = parseInt(args[1]);
    const cardId = args[2];
    const price = parseInt(args[3]);
    if (isNaN(slot) || !cardId || isNaN(price) || price < 1) {
      return reply(`❌ Usage: \`${p} t2edeck add <slot 1-16> <cardId> <price>\`\nExample: \`${p} t2edeck add 1 roy_mustang_1 50\``);
    }
    const result = await eshopAddCard(slot, cardId, price);
    return reply(result.message);
  }

  if (sub === 'remove') {
    const slot = parseInt(args[1]);
    if (isNaN(slot)) {
      return reply(`❌ Usage: \`${p} t2edeck remove <slot 1-16>\``);
    }
    const result = await eshopRemoveCard(slot);
    return reply(result.message);
  }

  if (sub === 'price') {
    const slot = parseInt(args[1]);
    const price = parseInt(args[2]);
    if (isNaN(slot) || isNaN(price) || price < 1) {
      return reply(`❌ Usage: \`${p} t2edeck price <slot 1-16> <price>\`\n💡 Or use \`${p} setprice edeck <slot> <price>\``);
    }
    const result = await eshopSetPrice(slot, price);
    return reply(result.message);
  }

  if (sub === 'clear') {
    const inst = getInst();
    inst.eshopDeck = new Array(16).fill(null);
    await saveEShopDeck();
    return reply('✅ eShop deck cleared. All slots are now empty.');
  }

  // Default: show the current deck (4x4 image)
  const inst = getInst();
  const filledSlots = inst.eshopDeck.filter(e => e !== null).length;
  if (filledSlots === 0) {
    return reply(`📭 *ESHOP DECK — EMPTY*\n\nNo cards in the deck. Add cards with:\n\`${p} t2edeck add <slot 1-16> <cardId> <price>\``);
  }

  // Generate and show the image
  const imageBuffer = await generateEShopDeckImage();
  if (imageBuffer) {
    let caption = `🎨 *ESHOP DECK EDITOR* 🎨\n`;
    caption += `━━━━━━━━━━━━━━━\n`;
    caption += `📦 Filled: ${filledSlots}/16 slots\n\n`;
    caption += `Commands:\n`;
    caption += `➥ \`${p} t2edeck add <slot> <cardId> <price>\`\n`;
    caption += `➥ \`${p} t2edeck remove <slot>\`\n`;
    caption += `➥ \`${p} t2edeck price <slot> <price>\`\n`;
    caption += `➥ \`${p} t2edeck clear\``;
    try {
      return await getInst().sock_ref.sendMessage(reply._chatId || reply.chatId, { image: imageBuffer, caption });
    } catch (err) {
      // Fall through to text list
    }
  }

  // Fallback: text list
  let msg = `🎨 *ESHOP DECK* (${filledSlots}/16 filled)\n\n`;
  inst.eshopDeck.forEach((entry, i) => {
    if (entry) {
      msg += `*${i + 1}.* ${entry.cardName} (T${entry.tier}) — 🎫 ${entry.price}\n`;
    } else {
      msg += `*${i + 1}.* _[empty]_\n`;
    }
  });
  msg += `\n💡 \`${p} t2edeck add <slot> <cardId> <price>\` to add`;
  return reply(msg);
}

/**
 * cmdT2EColl — Show the owner's event card collection (all E-tier cards).
 * Anyone can use this — it shows which event cards exist in the database.
 */
async function cmdT2EColl(senderJid, reply, args) {
  const p = P();
  const inst = getInst();
  const eventCards = inst.EVENT_CARDS || [];

  if (eventCards.length === 0) {
    return reply(`📭 No event cards exist in the database yet.\n\nEvent cards are added to cards_data.json by the owner and have tier "E".`);
  }

  // Group by anime
  const byAnime = {};
  eventCards.forEach(c => {
    const anime = c.animeName || 'Unknown';
    if (!byAnime[anime]) byAnime[anime] = [];
    byAnime[anime].push(c);
  });

  let msg = `🎁 *EVENT CARD COLLECTION* 🎁\n`;
  msg += `📦 Total: ${eventCards.length} event cards across ${Object.keys(byAnime).length} anime\n\n`;

  Object.entries(byAnime).forEach(([anime, cards]) => {
    msg += `📺 *${anime}* (${cards.length} cards)\n`;
    cards.forEach(c => {
      msg += `  ▫️ ${c.cardName} — \`${c.id}\`\n`;
    });
    msg += `\n`;
  });

  msg += `💡 Use \`${p} info <name> event | <anime>\` to search.`;
  return reply(msg);
}

module.exports = {
  init, handleCommand, doSpawn, CardStat, UserCard, CardMarket, CardDeck, instances,
  bindSocket,
  // 💡 Token event & eShop exports
  isTokenEventActive, startTokenEvent, stopTokenEvent,
  eshopAddCard, eshopRemoveCard, eshopSetPrice, eshopBuy,
  generateEShopDeckImage, searchEventCards,
  loadTokenEventState, loadEShopDeck,
  // 💡 Spawn interval configuration exports
  setSpawnInterval, getSpawnIntervalInfo, loadSpawnInterval, restartSpawnTimer,
  // 💡 Tier spawn configuration exports
  setTierConfig, loadTierConfig, resetTierConfig, formatTierConfig,
};
