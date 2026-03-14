// ===============================================
// POWERSCALE.JS - Now uses Go Service (Jina Proxy Backend)
// Replaces local Puppeteer with fast Go backend
// ===============================================

const GoImageService = require('./goImageService');
const goService = new GoImageService();

/**
 * Complete powerscale workflow (updated for Go service)
 * @param {string} characterName
 * @returns {Promise<Object>} {message, imageUrl}
 */
async function getPowerScale(characterName) {
    try {
        console.log(`[Powerscale] Fetching data for: ${characterName}`);

        const data = await goService.getPowerscale(characterName);

        console.log(`[Powerscale] Raw response:`, JSON.stringify(data));

        if (!data || data.error || !data.name) {
            throw new Error(data?.error || "Character not found or insufficient data");
        }

        const stats = data.stats || {};
        let message = `*${data.name} Powerscaling Analysis*\n\n`;
        message += `*Attack Potency:* ${stats["Attack Potency"] || stats.ap || "N/A"}\n`;
        message += `*Speed:* ${stats["Speed"] || stats.speed || "N/A"}\n`;
        message += `*Durability:* ${stats["Durability"] || stats.durability || "N/A"}\n`;
        message += `*Stamina:* ${stats["Stamina"] || stats.stamina || "N/A"}\n`;
        message += `*Range:* ${stats["Range"] || stats.range || "N/A"}\n`;
        message += `*Tier:* ${stats["Tier"] || stats.tier || "Unknown"}\n\n`;
        message += `Full details: ${data.pageUrl}`;

        console.log(`[Powerscale] Success for: ${data.name}`);

        return {
            success: true,
            message: message,
            imageUrl: data.imageUrl,
            characterName: data.name,
            pageUrl: data.pageUrl
        };
    } catch (error) {
        console.error('[Powerscale] Workflow failed:', error.message);
        return { success: false, error: error.message };
    }
}

// Kept for legacy compatibility if called directly
async function searchVSB(name) { return [{ name, url: "" }]; }
async function scrapeVSBPage(url) { return {}; }
function formatPowerScale(name, stats, url) { return ""; }

module.exports = {
    searchVSB,
    scrapeVSBPage,
    formatPowerScale,
    getPowerScale
};