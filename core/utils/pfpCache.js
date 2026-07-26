/**
 * PFP (profile picture URL) fetcher with TTL cache + negative caching.
 *
 * 💡 PERF PATCH 2026-07-27:
 * Background — sock.profilePictureUrl() has NO built-in timeout. On LID JIDs
 * (xxx@lid) it tries to fetch from WhatsApp's servers and frequently hangs
 * for the full 90s command-timeout window. Even on phone JIDs it does a
 * network round-trip every time, which is wasteful: a user's PFP doesn't
 * change often, but commands like .jk char / .jk bal / .jk profile all
 * call profilePictureUrl() independently on every invocation.
 *
 * This module wraps sock.profilePictureUrl() with:
 *   - 8s hard timeout (consistent across all callsites — previously some
 *     callsites had 8s, others had none and would hit the 90s global
 *     command-timeout).
 *   - Positive cache: successful lookups cached for 5 min. Subsequent
 *     calls within the window return instantly with no network hop.
 *   - Negative cache: failed/timed-out lookups cached for 60s. Without
 *     this, a user with an unreachable PFP would block 8s on EVERY
 *     command they ran — now they block 8s once, then ~0ms for the
 *     next minute.
 *   - In-flight de-duplication: if two commands for the same JID arrive
 *     simultaneously, only ONE profilePictureUrl call is made; both
 *     callers await the same promise.
 *
 * Usage:
 *   const { fetchPfp } = require('../utils/pfpCache');
 *   const pfpUrl = await fetchPfp(sock, senderJid);  // returns string|null
 *
 * All former callsites that did:
 *   const pfpUrl = await sock.profilePictureUrl(jid, 'image').catch(() => null);
 * should switch to:
 *   const pfpUrl = await fetchPfp(sock, jid);
 */

const TTL_POSITIVE_MS = 5 * 60 * 1000;   // 5 min — PFPs rarely change
const TTL_NEGATIVE_MS = 60 * 1000;        // 60s — backoff before retrying a failed lookup
const TIMEOUT_MS = 8000;                  // 8s — same as the prior rpgCommands/shopCommands timeout

// Map<jid, { value: string|null, expiresAt: number }>
const _cache = new Map();
// Map<jid, Promise<string|null>> — in-flight lookups for de-dup
const _inflight = new Map();

/**
 * Fetch a profile picture URL with caching + timeout.
 * @param {object} sock - Baileys socket
 * @param {string} jid - phone@... or lid@... JID
 * @returns {Promise<string|null>} URL string if available, null otherwise
 */
async function fetchPfp(sock, jid) {
  if (!sock || !jid) return null;

  // Cache hit?
  const cached = _cache.get(jid);
  if (cached) {
    if (Date.now() < cached.expiresAt) {
      return cached.value;
    }
    _cache.delete(jid);
  }

  // In-flight de-dup: if another caller already asked for the same JID,
  // piggyback on its promise instead of firing a second network call.
  const existing = _inflight.get(jid);
  if (existing) return existing;

  const p = (async () => {
    const timeoutP = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('profilePictureUrl timed out after 8s')), TIMEOUT_MS)
    );
    try {
      const url = await Promise.race([
        sock.profilePictureUrl(jid, 'image'),
        timeoutP,
      ]);
      _cache.set(jid, { value: url || null, expiresAt: Date.now() + TTL_POSITIVE_MS });
      return url || null;
    } catch (e) {
      // Negative cache — prevents hammering WhatsApp for unreachable LID jids
      _cache.set(jid, { value: null, expiresAt: Date.now() + TTL_NEGATIVE_MS });
      // Brief warning — keep volume low because this fires once per minute
      // per unreachable JID, which on a busy bot is still a lot.
      console.warn(`[pfpCache] miss for ${jid}: ${e.message}`);
      return null;
    } finally {
      _inflight.delete(jid);
    }
  })();

  _inflight.set(jid, p);
  return p;
}

/**
 * Invalidate a specific JID's cache entry. Use when you know the PFP just
 * changed (e.g. after a user updates their profile via the bot).
 */
function invalidate(jid) {
  _cache.delete(jid);
  _inflight.delete(jid);
}

/** Drop everything (mostly useful for tests / hot-reload). */
function clear() {
  _cache.clear();
  _inflight.clear();
}

/** Snapshot for diagnostics. */
function stats() {
  return {
    cached: _cache.size,
    inflight: _inflight.size,
    positive: Array.from(_cache.values()).filter(e => e.value !== null).length,
    negative: Array.from(_cache.values()).filter(e => e.value === null).length,
  };
}

module.exports = { fetchPfp, invalidate, clear, stats };
