// ===============================================
// POWERSCALE.JS - Character list + selection flow
// ===============================================

const goService = require('./goImageService'); // 💡 singleton (PERF PATCH 2026-07-27)

// Pending selections: chatId → { characters, timestamp }
const pendingSelections = new Map();
const SELECTION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Step 1: Search for character, return formatted list for user to pick from
 * @param {string} characterName
 * @param {string} chatId
 * @returns {Promise<Object>} { success, message, isPending }
 */
async function getPowerScale(characterName, chatId) {
    try {
        console.log(`[Powerscale] Searching for: ${characterName}`);

        const data = await goService.searchPowerscale(characterName);
        console.log(`[Powerscale] Search response:`, JSON.stringify(data));

        if (!data || !data.characters || data.characters.length === 0) {
            return { success: false, error: `No results found for "${characterName}"` };
        }

        // Build character list message
        let message = `🔍 *Found ${data.characters.length} result(s) for "${characterName}":*\n\n`;
        data.characters.forEach(char => {
            message += `*${char.id}.* ${char.name}\n`;
        });
        message += `\n_Reply with a number (1-${data.characters.length}) within 5 minutes to get their powerscale._`;

        // Store pending selection for this chat
        pendingSelections.set(chatId, {
            characters: data.characters,
            timestamp: Date.now()
        });

        // Auto-cleanup after 5 minutes
        setTimeout(() => {
            pendingSelections.delete(chatId);
        }, SELECTION_TIMEOUT_MS);

        return {
            success: true,
            message,
            isPending: true
        };

    } catch (error) {
        console.error('[Powerscale] Search failed:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Step 2: User picked a number — scrape that character's page
 * @param {string} chatId
 * @param {number} selection  — 1-based index
 * @returns {Promise<Object>} { success, message, imageUrl } or null if no pending
 */
async function handlePowerscaleSelection(chatId, selection) {
    const pending = pendingSelections.get(chatId);
    if (!pending) return null; // no pending selection for this chat

    // Check timeout
    if (Date.now() - pending.timestamp > SELECTION_TIMEOUT_MS) {
        pendingSelections.delete(chatId);
        return { success: false, error: 'Selection timed out. Search again!' };
    }

    const idx = parseInt(selection, 10);
    if (isNaN(idx) || idx < 1 || idx > pending.characters.length) {
        return {
            success: false,
            error: `Invalid selection. Pick a number between 1 and ${pending.characters.length}.`
        };
    }

    const chosen = pending.characters[idx - 1];
    pendingSelections.delete(chatId); // clear pending

    console.log(`[Powerscale] User selected: ${chosen.name} (${chosen.url})`);

    try {
        const data = await goService.fetchPowerscalePage(chosen.url);
        console.log(`[Powerscale] Fetch response:`, JSON.stringify(data));

        if (!data || data.error) {
            return { success: false, error: data?.error || 'Failed to fetch character data' };
        }

        const stats = data.stats || {};
        let message = `[ POWER SCALING: ${data.name.toUpperCase()} ]\n\n`;

        if (data.summary && data.summary.length > 0) {
            message += `[ Summary ]\n${data.summary}\n\n`;
        }

        message += `[ POWER STATS ]\n`;
        message += `━━━━━━━━━━━━━━━━━━\n`;

        if (stats['Tier']) {
            message += `TIER: ${stats['Tier']}\n`;
            message += `━━━━━━━━━━━━━━━━━━\n`;
        }
        if (stats['Attack Potency']) message += `Attack Potency: ${stats['Attack Potency']}\n\n`;
        if (stats['Speed'])          message += `Speed: ${stats['Speed']}\n\n`;
        if (stats['Durability'])     message += `Durability: ${stats['Durability']}\n\n`;
        if (stats['Stamina'])        message += `Stamina: ${stats['Stamina']}\n\n`;
        if (stats['Range'])          message += `Range: ${stats['Range']}\n\n`;
        if (stats['Striking Strength']) message += `Striking Strength: ${stats['Striking Strength']}\n\n`;
        if (stats['Lifting Strength'])  message += `Lifting Strength: ${stats['Lifting Strength']}\n\n`;
        if (stats['Intelligence'])   message += `Intelligence: ${stats['Intelligence']}\n\n`;
        if (stats['Standard Equipment']) message += `Equipment: ${stats['Standard Equipment']}\n\n`;

        message += `━━━━━━━━━━━━━━━━━━\n`;
        message += `Source: ${data.pageUrl}`;

        return {
            success: true,
            message,
            imageUrl: data.imageUrl,
            characterName: data.name,
            pageUrl: data.pageUrl
        };

    } catch (error) {
        console.error('[Powerscale] Fetch failed:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Check if a chat has a pending powerscale selection
 */
function hasPendingSelection(chatId) {
    const pending = pendingSelections.get(chatId);
    if (!pending) return false;
    if (Date.now() - pending.timestamp > SELECTION_TIMEOUT_MS) {
        pendingSelections.delete(chatId);
        return false;
    }
    return true;
}

// Legacy stubs
async function searchVSB(name) { return [{ name, url: '' }]; }
async function scrapeVSBPage(url) { return {}; }
function formatPowerScale(name, stats, url) { return ''; }

module.exports = {
    getPowerScale,
    handlePowerscaleSelection,
    hasPendingSelection,
    searchVSB,
    scrapeVSBPage,
    formatPowerScale
};
