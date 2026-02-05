require("dotenv").config();

/**
 * GLOBAL RAM TRAP - ULTRA AGGRESSIVE
 * Intercepts hardcoded library logs that serialize large Buffer objects.
 */
const maskLogs = (originalFn) => {
    return function(...args) {
        const str = args[0];
        if (typeof str === 'string' && (
            str.includes('Removing old closed session') || 
            str.includes('SessionEntry') || 
            str.includes('Closing open session') ||
            str.includes('Ratchet') ||
            str.includes('Connection Closed') ||
            str.includes('440') ||
            str.includes('Boom')
        )) {
            return;
        }
        originalFn.apply(console, args);
    };
};

console.log = maskLogs(console.log);
console.info = maskLogs(console.info);
console.warn = maskLogs(console.warn);
console.debug = maskLogs(console.debug);

// ... (Rest of imports remain same) ...
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Multi-Tenant Bot Manager is Running!');
});

app.listen(port, () => {
  console.log(`📡 Keep-alive server listening on port ${port}`);
});

const fs = require('fs');
const path = require('path');
const { startBot } = require('./core/engine');
const { BotConfig } = require('./botConfig');
const connectDB = require('./db');
const axios = require("axios");
const cheerio = require("cheerio");
const { parseHTML } = require('linkedom');

// Helper for dynamic ESM import of got-scraping
async function getGot() {
    const { gotScraping } = await import('got-scraping');
    return gotScraping;
}

// ... (Existing startup logic) ...

// ---------- scraper (Keep existing Node.js PornPics) ----------
async function scrapePornPics(searchTerm, count = 10, options = {}) {
    try {
        const got = await getGot();
        const searchUrl = `https://www.pornpics.com/?q=${encodeURIComponent(searchTerm)}`;
        
        console.log('🔍 Scraping (No-Browser):', searchUrl);
        
        const response = await got.get(searchUrl, {
            headers: {
                'Referer': 'https://www.pornpics.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: { request: 15000 }
        });
        
        const { document } = parseHTML(response.body);
        const imgs = document.querySelectorAll('img');
        console.log(`🔍 [${process.env.BOT_ID || 'BOT'}] PornPics found ${imgs.length} image tags`);
        const candidates = [];

        for (const img of imgs) {
            let url = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('src');
            if (!url) continue;

            if (!url.startsWith('http')) {
                if (url.startsWith('//')) url = 'https:' + url;
                else if (url.startsWith('/')) url = 'https://www.pornpics.com' + url;
                else continue;
            }

            if (url.includes('logo') || url.includes('icon') || url.includes('avatar')) continue;

            const w = parseInt(img.getAttribute('width')) || 0;
            const h = parseInt(img.getAttribute('height')) || 0;
            const score = w * h;

            if (score > 20000 || (!w && !h)) {
                candidates.push({ url, score });
            }
        }

        if (candidates.length === 0) {
            const regex = /https?:\/\/[^"\'\s]+\.(jpg|jpeg|png|webp)/gi;
            const matches = response.body.match(regex) || [];
            matches.forEach(url => {
                if (url.includes('thumb')) candidates.push({ url, score: 30000 });
            });
        }

        const finalList = [...new Set(candidates.map(c => c.url))]
            .filter(url => !url.includes('google') && !url.includes('click'))
            .slice(0, count + 1);

        const result = finalList.length > 1 ? finalList.slice(1) : finalList;
        return result.slice(0, count);

    } catch (err) {
        console.error('❌ PornPics Scrape Error:', err.message || String(err));
        return [];
    }
}

// Scrapes Rule34.xxx (Refactored to Go Service)
const GoImageService = require('./core/goImageService');
const goService = new GoImageService();

async function scrapeFromDefaultSite(searchTerm, count = 10) {
    try {
        console.log(`🔍 Rule34 Search (Go Service): ${searchTerm}`);
        const result = await goService.searchRule34(searchTerm, count);
        return result.images || [];
    } catch (err) {
        console.error("❌ Rule34 Error:", err.message);
        return [];
    }
}

// ... (Keep existing group summary logic, searchPinterest via Go, etc.) ...

async function searchPinterest(query, count = 10) {
    try {
        console.log(`🔍 Pinterest Search (Go Service): ${query}`);
        const result = await goService.searchPinterest(query, count);
        return result.images || [];
    } catch (err) {
        console.error("❌ Pinterest Error:", err.message);
        return [];
    }
}

async function boot() {
    if (process.env.BOT_ACTIVE === 'false') {
        console.log("🛑 Kill Switch Triggered (BOT_ACTIVE=false). Manager shutting down...");
        process.exit(0);
    }

    console.log(" Multi-Tenant Manager Booting...");
    await connectDB();

    const instancesDir = path.join(__dirname, 'instances');
    if (!fs.existsSync(instancesDir)) {
        console.error("❌ /instances folder not found!");
        process.exit(1);
    }

    const folders = fs.readdirSync(instancesDir).filter(f => {
        return fs.statSync(path.join(instancesDir, f)).isDirectory();
    });

    if (folders.length === 0) {
        console.warn("⚠️ No bot instances found in /instances. Please create a folder with botConfig.json.");
        return;
    }

    for (const folder of folders) {
        const instancePath = path.join(instancesDir, folder);
        const configPath = path.join(instancePath, 'botConfig.json');
        
        if (fs.existsSync(configPath)) {
            const config = new BotConfig(instancePath);
            console.log(`📡 Spawning bot: ${config.getBotName()} [${config.getBotId()}]`);
            startBot(config);
        } else {
            console.warn(`⚠️ Skipping instance '${folder}': botConfig.json missing.`);
        }
    }
}

module.exports = { scrapePornPics, scrapeFromDefaultSite, searchPinterest };

if (require.main === module) {
    boot();
}
