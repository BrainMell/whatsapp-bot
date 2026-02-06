// ===============================================
// POWERSCALE.JS - Now uses Go Service (10x faster!)
// Replaces Puppeteer with fast Go chromedp backend
// ===============================================

const GoImageService = require('./goImageService');

const goService = new GoImageService();

// Peak Logic (same as before)
const PeakLogic = {
    clean: (text) => {
        if (!text) return "N/A";
        let peak = text.split('|').pop().trim();
        return peak.replace(/\([^)]+\)/g, "").replace(/\[[^\]]+\]/g, "").trim();
    },
    tier: (text) => {
        const tiers = [...text.matchAll(/\b([0-9]+)-([A-Z])\b/gi)].map(m => m[0]);
        return tiers.length ? tiers[tiers.length - 1] : "Unknown";
    },
    bio: (text) => {
        if (!text) return "";
        return text.split(/[.!?](?:\s|$)/g)[0].trim() + ".";
    }
};

/**
 * Search VS Battles Wiki for characters
 * @param {string} characterName
 * @returns {Promise<Array>} Array of {name, url}
 */
async function searchVSB(characterName) {
    try {
        const response = await goService.searchVSBattles(characterName);
        return response.characters || [];
    } catch (error) {
        console.error('VS Battles search failed:', error.message);
        throw new Error("Character not found");
    }
}

/**
 * Scrape detailed character stats from VS Battles page
 * @param {string} pageUrl
 * @returns {Promise<Object>} Character details
 */
async function scrapeVSBPage(pageUrl) {
    try {
        const data = await goService.getVSBattlesDetail(pageUrl);

        return {
            htmlContent: "EXTRACTED_BY_GO", 
            imageUrl: data.imageURL || "",
            summary: data.summary || "",
            tierRaw: data.tier || "",
            stats: {
                tier: data.tier || "Unknown",
                ap: data.attackPotency || "N/A",
                speed: data.speed || "N/A",
                durability: data.durability || "N/A",
                stamina: data.stamina || "N/A",
                range: data.range || "N/A"
            },
            // Redundant top-level for safety
            tier: data.tier || "Unknown",
            ap: data.attackPotency || "N/A",
            speed: data.speed || "N/A",
            durability: data.durability || "N/A",
            stamina: data.stamina || "N/A",
            range: data.range || "N/A",
            imageWidth: data.imageWidth || 0,
            imageHeight: data.imageHeight || 0
        };
    } catch (error) {
        console.error('VS Battles detail scraping failed:', error.message);
        throw error;
    }
}

/**
 * Extract and clean stats (now done by Go service, but kept for compatibility)
 * @param {string} htmlContent - Not used anymore
 * @returns {Promise<Object>} Cleaned stats
 */
async function extractStatsWithGroq(htmlContent) {
    return {};
}

/**
 * Format powerscale data for display
 * @param {string} characterName
 * @param {Object} stats
 * @param {string} pageUrl 
 * @returns {string} Formatted message
 */
function formatPowerScale(characterName, stats, pageUrl) {
    let message = `*${characterName} Powerscaling Analysis*\n\n`;
    message += `*Attack Potency:* ${stats.ap || "N/A"}\n`;
    message += `*Speed:* ${stats.speed || "N/A"}\n`;
    message += `*Durability:* ${stats.durability || "N/A"}\n`;
    message += `*Stamina:* ${stats.stamina || "N/A"}\n`;
    message += `*Range:* ${stats.range || "N/A"}\n`;
    message += `*Tier:* ${stats.tier || "Unknown"}\n\n`;
    message += `Full details: ${pageUrl}`;
    return message;
}

/**
 * Complete powerscale workflow (updated for Go service)
 * @param {string} characterName
 * @returns {Promise<Object>} {message, imageUrl}
 */
async function getPowerScale(characterName) {
    try {
        const searchResults = await searchVSB(characterName);
        if (!searchResults || searchResults.length === 0) {
            throw new Error("Character not found");
        }
        const pageUrl = searchResults[0].url;
        const details = await scrapeVSBPage(pageUrl);
        const message = formatPowerScale(characterName, details.stats, pageUrl);

        return {
            success: true,
            message: message,
            imageUrl: details.imageUrl,
            imageWidth: details.imageWidth,
            imageHeight: details.imageHeight,
            characterName: searchResults[0].name
        };
    } catch (error) {
        console.error('Powerscale workflow failed:', error.message);
        return { success: false, error: error.message };
    }
}

module.exports = {
    searchVSB,
    scrapeVSBPage,
    extractStatsWithGroq,
    formatPowerScale,
    getPowerScale,
    PeakLogic
};
