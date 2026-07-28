// ============================================
// 🛡️ ALT DETECTION — phone-hash based anti-abuse
// ============================================
// The codebase has NO alt detection. The placerPhone param in
// bountySystem.placeBounty is dead code. This module implements
// phone-hash based alt detection across the entire game.
//
// How it works:
// 1. On registration, compute phoneHash = sha256(phoneNumber + salt)
// 2. Store user.phoneHash (indexed)
// 3. All transfers (money, cards, summons, gifts, bounties) check
//    if sender.phoneHash === receiver.phoneHash → block
//
// This prevents:
// - Alt-account farming (transfer daily rewards from alts to main)
// - Self-bounties for free guild XP
// - Market arbitrage between alts
// - Gift-reversal scams
//
// See: /home/z/my-project/download/SUMMONER_SYSTEM_DESIGN.md (section 8.1)

const crypto = require('crypto');
const economy = require('./economy');

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────

// Salt for phone hashing. In production, this should be an env variable.
// For now, hardcoded — changing it invalidates all existing hashes.
const PHONE_HASH_SALT = process.env.PHONE_HASH_SALT || 'mellow_rpg_2026_salt_v1';

// ─────────────────────────────────────────────────────────────
// HASH COMPUTATION
// ─────────────────────────────────────────────────────────────

/**
 * Compute a phone hash from a JID or phone number.
 * @param {string} jidOrPhone - WhatsApp JID (e.g. "2349133219812@s.whatsapp.net") or raw phone
 * @returns {string} - SHA-256 hash (hex)
 */
function computePhoneHash(jidOrPhone) {
  if (!jidOrPhone) return null;

  // Extract phone number from JID (strip @s.whatsapp.net, @lid, etc.)
  let phone = String(jidOrPhone);
  phone = phone.split('@')[0];  // take everything before @
  phone = phone.replace(/[^0-9]/g, '');  // keep only digits

  if (!phone) return null;

  // Hash with salt
  return crypto.createHash('sha256')
    .update(phone + PHONE_HASH_SALT)
    .digest('hex');
}

/**
 * Set the phoneHash on a user (called on registration or lazy migration).
 * @param {object} user - Economy user object
 * @returns {string} - The computed hash
 */
function setPhoneHash(user) {
  if (!user || !user.userId) return null;
  // Only set if not already set (don't overwrite existing hash)
  if (user.phoneHash) return user.phoneHash;
  user.phoneHash = computePhoneHash(user.userId);
  return user.phoneHash;
}

// ─────────────────────────────────────────────────────────────
// ALT CHECK
// ─────────────────────────────────────────────────────────────

/**
 * Check if two users are the same person (alt accounts).
 * @param {string} jid1 - First user's JID
 * @param {string} jid2 - Second user's JID
 * @returns {boolean} - True if they share the same phone hash (are alts)
 */
function isAltAccount(jid1, jid2) {
  if (!jid1 || !jid2) return false;
  if (jid1 === jid2) return true;  // same person

  const user1 = economy.getUser(jid1);
  const user2 = economy.getUser(jid2);

  if (!user1 || !user2) return false;

  // Lazy-migrate phoneHash if missing
  if (!user1.phoneHash) setPhoneHash(user1);
  if (!user2.phoneHash) setPhoneHash(user2);

  // If either hash is null, can't determine — allow (fail open, not closed)
  if (!user1.phoneHash || !user2.phoneHash) return false;

  return user1.phoneHash === user2.phoneHash;
}

/**
 * Check if a transfer between two users should be blocked.
 * @param {string} fromJid - Sender JID
 * @param {string} toJid - Receiver JID
 * @returns {{blocked: boolean, reason: string}}
 */
function checkTransfer(fromJid, toJid) {
  if (isAltAccount(fromJid, toJid)) {
    return {
      blocked: true,
      reason: '❌ Cannot transfer between accounts on the same phone number. Alt-account farming is not allowed.'
    };
  }
  return { blocked: false, reason: '' };
}

// ─────────────────────────────────────────────────────────────
// LAZY MIGRATION — backfill phoneHash for existing users
// ─────────────────────────────────────────────────────────────

/**
 * Ensure a user has a phoneHash set.
 * Called from economy.getUser lazy migration.
 * @param {object} user - Economy user object
 */
function ensurePhoneHash(user) {
  if (!user) return;
  if (!user.phoneHash && user.userId) {
    user.phoneHash = computePhoneHash(user.userId);
  }
}

// ─────────────────────────────────────────────────────────────
// MODULE EXPORTS
// ─────────────────────────────────────────────────────────────

module.exports = {
  computePhoneHash,
  setPhoneHash,
  isAltAccount,
  checkTransfer,
  ensurePhoneHash,
  PHONE_HASH_SALT
};
