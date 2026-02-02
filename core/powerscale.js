const fs = require('fs');
const Groq = require("groq-sdk"); 

// Helper for dynamic ESM import
async function getGot() {
    const { gotScraping } = await import('got-scraping');
    return gotScraping;
}

const PeakLogic = {
    clean: (text) => {
        if (!text) return "N/A";
        let peak = text.split('|').pop().trim();
        return peak.replace(/\([^)]+\)/g, "").replace(/[[^\]]+]/g, "").trim();
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
 * Search for characters using MediaWiki's opensearch API
 */
async function searchVSB(characterName) {
    const got = await getGot();
    const baseURL = 'https://vsbattles.fandom.com/api.php';
    
    const params = {
        action: 'opensearch',
        search: characterName,
        limit: 10,
        namespace: 0,
        format: 'json',
    };

    try {
        const response = await got.get(baseURL, {
            searchParams: params,
        }).json();

        const [query, titles, descriptions, urls] = response;
        
        if (!titles || titles.length === 0) throw new Error("Character not found");

        return titles.map((title, idx) => ({
            url: urls[idx],
            name: title
        }));
    } catch (error) {
        console.error('VS Battles search failed:', error.message);
        throw error;
    }
}

/**
 * Scrape VSB page data using MediaWiki API
 */
async function scrapeVSBPage(pageUrl) {
    const got = await getGot();
    const baseURL = 'https://vsbattles.fandom.com/api.php';
    
    // Extract title from URL
    const titleMatch = pageUrl.match(/\/wiki\/(.+)/);
    const title = titleMatch ? decodeURIComponent(titleMatch[1]) : '';

    const params = {
        action: 'query',
        titles: title,
        prop: 'pageimages|extracts|revisions',
        pithumbsize: 1000,
        exintro: true,
        explaintext: true,
        rvprop: 'content',
        format: 'json',
    };

    try {
        const response = await got.get(baseURL, {
            searchParams: params,
        }).json();

        const pages = response.query.pages;
        const page = Object.values(pages)[0];

        if (!page || page.missing) throw new Error("Page not found");

        const htmlContent = page.revisions?.[0]?.['*'] || ''; // Wikitext actually, but extractStats expects this
        
        // Extract basic stats from intro text if available
        const summary = page.extract || "";
        const stats = {};
        const statFields = ["Striking Strength", "Durability", "Stamina", "Range", "Speed", "Attack Potency"];
        
        statFields.forEach(field => {
            const regex = new RegExp(field + "\\s*:\s*(.+)", "i");
            const match = summary.match(regex) || htmlContent.match(regex);
            stats[field] = match ? match[1].split('\n')[0].trim() : "N/A";
        });

        const tierMatch = summary.match(/Tier\s*:\s*(.+)/i) || htmlContent.match(/Tier\s*:\s*(.+)/i);
        const tierRaw = tierMatch ? tierMatch[1].split('\n')[0].trim() : "N/A";

        return {
            htmlContent: htmlContent, // Passing wikitext as fallback
            imageUrl: page.thumbnail?.source || "",
            summary: summary,
            tierRaw: tierRaw,
            stats: stats,
            imageWidth: page.thumbnail?.width || 0,
            imageHeight: page.thumbnail?.height || 0
        };
    } catch (error) {
        console.error('VS Battles detail fetch failed:', error.message);
        throw error;
    }
}

async function extractStatsWithGroq(htmlContent) {
    // This function originally parsed HTML but we now have wikitext/summary
    // I'll keep the logic but clean up common tags
    const stats = {};
    const statFields = ["Attack Potency", "Speed", "Durability", "Stamina", "Range"];

    statFields.forEach(field => {
        const regex = new RegExp(`${field}\s*?:\s*(.*?)(?:\n|$)`, "i");
        const match = htmlContent.match(regex);
        stats[field] = match ? match[1].replace(/<[^>]+>/g, '').trim() : "N/A";
    });

    const tierMatch = htmlContent.match(/Tier\s*:\s*(.*?)(?:\n|$)/i);
    stats.Tier = tierMatch ? tierMatch[1].replace(/<[^>]+>/g, '').trim() : "N/A";

    const cleanedStats = {
        ap: PeakLogic.clean(stats["Attack Potency"]),
        speed: PeakLogic.clean(stats["Speed"]),
        durability: PeakLogic.clean(stats["Durability"]),
        stamina: PeakLogic.clean(stats["Stamina"]),
        range: PeakLogic.clean(stats["Range"]),
        tier: PeakLogic.tier(stats["Tier"] || stats["Attack Potency"])
    };

    return cleanedStats;
}

function formatPowerScale(characterName, stats, pageUrl) {
    let message = `*${characterName} Powerscaling Analysis*\n\n`;
    message += `*Attack Potency:* ${stats.ap}\n`;
    message += `*Speed:* ${stats.speed}\n`;
    message += `*Durability:* ${stats.durability}\n`;
    message += `*Stamina:* ${stats.stamina}\n`;
    message += `*Range:* ${stats.range}\n`;
    message += `*Tier:* ${stats.tier}\n\n`;
    message += `Full details: ${pageUrl}`;
    return message;
}

module.exports = {
    searchVSB,
    scrapeVSBPage,
    extractStatsWithGroq,
    formatPowerScale
};