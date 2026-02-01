const fs = require('fs');
const puppeteer = require('puppeteer-extra');
const Groq = require("groq-sdk"); 

const getChromeExecutablePath = () => {
    if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
        console.log(`Using Chrome executable from CHROME_PATH environment variable: ${process.env.CHROME_PATH}`);
        return process.env.CHROME_PATH;
    }

    try {
        const defaultPath = puppeteer.executablePath();
        if (defaultPath && fs.existsSync(defaultPath)) {
            console.log(`Using Chrome executable from Puppeteer's default: ${defaultPath}`);
            return defaultPath;
        }
    } catch (e) {
        console.warn(`Puppeteer's default executable not found or failed to retrieve: ${e.message}`);
    }

    const commonPaths = [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    ];

    for (const path of commonPaths) {
        if (fs.existsSync(path)) {
            console.log(`Using common Windows Chrome path: ${path}`);
            return path;
        }
    }

    throw new Error("Chrome/Chromium executable not found. Please ensure Chrome/Chromium is installed or set the CHROME_PATH environment variable.");
};

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

async function searchVSB(characterName) {
    const browser = await puppeteer.launch({
        headless: "new",
        dumpio: true, // Add this line
        executablePath: getChromeExecutablePath(),
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-accelerated-2d-canvas",
            "--no-first-run",
            "--no-zygote",
            // "--single-process" // Removed this line
        ]
    });

    try {
        const page = await browser.newPage();
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        page.setDefaultNavigationTimeout(60000);
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");

        const searchUrl = `https://vsbattles.fandom.com/wiki/Special:Search?query=${encodeURIComponent(characterName)}`;
        await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

        const searchLinks = await page.$$eval(".unified-search__result a", links => {
            return links.map(a => {
                const url = a.href;
                const nameMatch = url.match(/\/wiki\/(.+)/);
                const name = nameMatch ? decodeURIComponent(nameMatch[1].replace(/_/g, ' ')) : '';
                return { url, name };
            }).filter(item => item.url.includes("/wiki/") && !item.url.includes("Special:") && !item.url.includes("Category:"));
        });

        if (!searchLinks || searchLinks.length === 0) throw new Error("Character not found");

        return searchLinks; 
    } finally {
        if (browser) await browser.close();
    }
}

async function scrapeVSBPage(pageUrl) {
    const browser = await puppeteer.launch({
        headless: "new",
        dumpio: true, // Add this line
        executablePath: getChromeExecutablePath(),
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-accelerated-2d-canvas",
            "--no-first-run",
            "--no-zygote",
            // "--single-process" // Removed this line
        ]
    });

    try {
        const page = await browser.newPage();
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        page.setDefaultNavigationTimeout(60000);
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");

        await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

                    const rawData = await page.evaluate(async () => { // Made async for retry logic
                        const out = { imageUrl: "", summary: "", tierRaw: "", stats: {}, htmlContent: "", imageWidth: 0, imageHeight: 0 };
                        const content = document.querySelector("#mw-content-text");
                        if (!content) {
                            out.htmlContent = document.documentElement.outerHTML;
                            return out;
                        }
        
                        let img = null;
                        const maxRetries = 10; // Increased retry count
                        const minImageSize = 100; // Minimum dimension for a "valid" image
                        for (let i = 0; i < maxRetries; i++) {
                            img = content.querySelector('img.pi-image-thumbnail');
                            if (img) {
                                const rawUrl = img.dataset.src || img.src;
                                const imgWidth = parseInt(img.getAttribute('data-image-width')) || 0;
                                const imgHeight = parseInt(img.getAttribute('data-image-height')) || 0;

                                // Found a usable URL AND the dimensions are large enough
                                if (rawUrl && !rawUrl.startsWith('data:') && imgWidth >= minImageSize && imgHeight >= minImageSize) {
                                    out.imageWidth = imgWidth;
                                    out.imageHeight = imgHeight;
                                    break; // Found a valid image source
                                }
                            }
                            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds (increased duration)
                        }
        
                        if (img) {
                            let rawUrl = img.dataset.src || img.src; // Prioritize data-src if it became available
                            if (rawUrl && !rawUrl.startsWith('data:')) {
                                const revisionIndex = rawUrl.indexOf('/revision/');
                                if (revisionIndex !== -1) {
                                    out.imageUrl = rawUrl.substring(0, revisionIndex);
                                } else {
                                    out.imageUrl = rawUrl;
                                }
                            }
                        }
            const firstP = content.querySelector("p");
            out.summary = firstP ? firstP.innerText : "";

            const statFields = ["Striking Strength", "Durability", "Stamina", "Range", "Speed", "Attack Potency"];
            statFields.forEach(field => {
                const regex = new RegExp(field + "\s*:\s*(.+)", "i");
                const match = content.innerText.match(regex);
                out.stats[field] = match ? match[1].trim() : "";
            });

            const tierMatch = content.innerText.match(/Tier\s*:\s*(.+)/i);
            out.tierRaw = tierMatch ? tierMatch[1] : "";

            out.htmlContent = document.documentElement.outerHTML; 
            return out;
        });

        return {
            htmlContent: rawData.htmlContent,
            imageUrl: rawData.imageUrl,
            summary: rawData.summary,
            tierRaw: rawData.tierRaw,
            stats: rawData.stats,
            imageWidth: rawData.imageWidth,
            imageHeight: rawData.imageHeight
        };

    } finally {
        if (browser) await browser.close();
    }
}

async function extractStatsWithGroq(htmlContent) {
    const stats = {};
    const statFields = ["Attack Potency", "Speed", "Durability", "Stamina", "Range"];

    statFields.forEach(field => {
        const regex = new RegExp(`${field}\s*?:\s*?<[^>]+>(.*?)(?:<br\s*\/?>|\n|$)`, "i");
        const match = htmlContent.match(regex);
        stats[field] = match ? match[1].replace(/<[^>]+>/g, '').trim() : "";
    });

    const tierMatch = htmlContent.match(/Tier\s*:\s*?<[^>]+>(.*?)(?:<br\s*\/?>|\n|$)/i);
    stats.Tier = tierMatch ? tierMatch[1].replace(/<[^>]+>/g, '').trim() : "";

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
