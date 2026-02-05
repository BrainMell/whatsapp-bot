// ============================================
// POWERSCALE COMMAND - GO SERVICE MIGRATION
// ============================================

const GoImageService = require('./goImageService');
const goService = new GoImageService();

/**
 * Search for characters using VS Battles Wiki via Go Service
 */
async function searchVSB(characterName) {
    try {
        const result = await goService.searchVSBattles(characterName);
        return result.characters.map(char => ({
            url: char.url,
            name: char.name
        }));
    } catch (error) {
        console.error('❌ VS Battles search failed:', error.message);
        throw error;
    }
}

/**
 * Scrape VSB page details via Go Service
 */
async function scrapeVSBPage(pageUrl) {
    try {
        const detail = await goService.getVSBattlesDetail(pageUrl);
        
        // Return structure matching what engine.js and legacy code expects
        return {
            htmlContent: 'EXTRACTED_BY_GO', // Placeholder
            imageUrl: detail.imageURL,
            summary: detail.summary,
            tier: detail.tier || 'Unknown',
            ap: detail.attackPotency || 'N/A',
            speed: detail.speed || 'N/A',
            durability: detail.durability || 'N/A',
            stamina: detail.stamina || 'N/A',
            range: detail.range || 'N/A',
            // Also keep original keys for extra safety
            stats: {
                tier: detail.tier || 'Unknown',
                ap: detail.attackPotency || 'N/A',
                speed: detail.speed || 'N/A',
                durability: detail.durability || 'N/A',
                stamina: detail.stamina || 'N/A',
                range: detail.range || 'N/A'
            }
        };
    } catch (error) {
        console.error('❌ VS Battles detail fetch failed:', error.message);
        throw error;
    }
}

// Legacy function - kept for compatibility. 
// Now it just passes through the stats if they were already extracted by Go.
async function extractStatsWithGroq(htmlContent) {
    // If we get our placeholder, we know Go already did the work.
    // engine.js calls this with pageData.htmlContent.
    return {}; // Return empty object, engine.js should rely on scrapeVSBPage data
}

function formatPowerScale(characterName, stats, pageUrl) {
    const tier = stats.tier || stats.Tier || 'Unknown';
    const ap = stats.ap || stats['Attack Potency'] || 'N/A';
    const speed = stats.speed || stats['Speed'] || 'N/A';
    const durability = stats.durability || stats['Durability'] || 'N/A';
    const stamina = stats.stamina || stats['Stamina'] || 'N/A';
    const range = stats.range || stats['Range'] || 'N/A';

    let message = `*${characterName} Powerscaling Analysis*\n\n`;
    message += `*Tier:* ${tier}\n`;
    message += `*Attack Potency:* ${ap}\n`;
    message += `*Speed:* ${speed}\n`;
    message += `*Durability:* ${durability}\n`;
    message += `*Stamina:* ${stamina}\n`;
    message += `*Range:* ${range}\n\n`;
    message += `Full details: ${pageUrl}`;
    return message;
}

module.exports = {
    searchVSB,
    scrapeVSBPage,
    extractStatsWithGroq,
    formatPowerScale
};
