// ============================================
// COMPLETE PUPPETEER SCRAPING SNIPPETS (PRE-GO ERA)
// FROM COMMIT: b51c8e5d4058e39ef4bd3ecf8f7737ab4a194a0a
// ============================================

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const cheerio = require("cheerio");
const axios = require("axios");
const { parseHTML } = require('linkedom');

// ============================================
// 1. PINTEREST & STICKER LOGIC
// ============================================

/**
 * Scrapes pinterest for image results based on a query
 */
async function searchPinterest(query, count = 10) {
    let browser;
    try {
        browser = await puppeteer.launch({ 
            headless: "new", 
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        const page = await browser.newPage();
        
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['stylesheet', 'font', 'media'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        const url = `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`;
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        const scrolls = Math.ceil(count / 10);
        for (let i = 0; i < scrolls; i++) {
            await page.evaluate(() => window.scrollBy(0, 1000));
            await new Promise(res => setTimeout(res, 2000));
        }

        const images = await page.evaluate(() => {
            const pinWrappers = document.querySelectorAll('div[data-test-id="pinWrapper"]');
            const links = [];
            pinWrappers.forEach(wrapper => {
                const img = wrapper.querySelector('img');
                if (img && img.src && img.src.includes('pinimg.com')) {
                    links.push(img.src.replace(/236x|474x/g, '736x'));
                }
            });
            return links;
        });

        await browser.close();
        return [...new Set(images)].slice(0, count);
    } catch (err) {
        if (browser) await browser.close();
        console.error("❌ Pinterest Error:", err.message);
        return [];
    }
}

// --- COMMAND: .j s (Pinterest search & stickerize) ---
// if (lowerTxt.startsWith(`${PREFIX.toLowerCase()} s `)) { ... }
// (See full implementation in engine_snippets.js or original index.js)

// ============================================
// 2. NSFW / RULE34 LOGIC
// ============================================

async function scrapeFromDefaultSite(searchTerm, count = 10) {
    let results = await tryAPI(searchTerm, count);
    if (results.length === 0) {
        results = await tryWebScrape(searchTerm, count);
    }
    return results;
}

async function tryAPI(searchTerm, count) {
    try {
        const tag = searchTerm.trim().replace(/\s+/g, '_');
        const url = `https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&json=1&limit=200&tags=${encodeURIComponent(tag)}`;
        const { data } = await axios.get(url, {
            timeout: 10000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (!data) return [];
        let posts = data.post || data;
        if (!Array.isArray(posts)) posts = [posts];
        return posts.filter(p => p?.file_url).map(p => p.file_url).slice(0, count);
    } catch (err) { return []; }
}

async function tryWebScrape(searchTerm, count) {
    try {
        const tag = searchTerm.trim().replace(/\s+/g, '_');
        const url = `https://rule34.xxx/index.php?page=post&s=list&tags=${encodeURIComponent(tag)}`;
        const { data: html } = await axios.get(url, { timeout: 15000 });
        const $ = cheerio.load(html);
        const imagePromises = [];
        $('.thumb').each((i, elem) => {
            if (i >= count) return false;
            const postId = $(elem).find('a').attr('href')?.match(/id=(\d+)/)?.[1];
            if (postId) imagePromises.push(getFullImageFromPost(postId));
        });
        const images = await Promise.all(imagePromises);
        return images.filter(url => url !== null).slice(0, count);
    } catch (err) { return []; }
}

async function getFullImageFromPost(postId) {
    try {
        const postUrl = `https://rule34.xxx/index.php?page=post&s=view&id=${postId}`;
        const { data: html } = await axios.get(postUrl);
        const $ = cheerio.load(html);
        let imageUrl = $('#image').attr('src') || $('video source').attr('src') || $('meta[property="og:image"]').attr('content');
        if (imageUrl && imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;
        return imageUrl || null;
    } catch (err) { return null; }
}

// ============================================
// 3. PORNPICS LOGIC (18+ COMMAND)
// ============================================

async function scrapePornPics(searchTerm, count = 10) {
    let browser;
    try {
        const searchUrl = `https://www.pornpics.com/?q=${encodeURIComponent(searchTerm)}`;
        browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0');
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        for (let i = 0; i < Math.ceil(count / 5); i++) {
            await page.evaluate(() => window.scrollBy(0, 800));
            await new Promise(res => setTimeout(res, 900));
        }
        const candidates = await page.evaluate(() => {
            const out = [];
            document.querySelectorAll('img').forEach(img => {
                let url = img.src || img.getAttribute('data-src');
                if (url && url.startsWith('http')) out.push({ url, score: img.width * img.height });
            });
            return out.sort((a,b) => b.score - a.score);
        });
        await browser.close();
        return candidates.filter(c => c.score > 40000).map(c => c.url).slice(1, count + 1);
    } catch (err) { if (browser) await browser.close(); return []; }
}

// ============================================
// 4. POWERSCALE LOGIC (VS BATTLES WIKI)
// ============================================

async function handlePowerscaleCommand(sock, chatId, character, m) {
    let browser;
    try {
        browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
        const page = await browser.newPage();
        const searchUrl = `https://vsbattles.fandom.com/wiki/Special:Search?query=${encodeURIComponent(character)}`;
        await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
        const searchResults = await page.$$eval(".unified-search__result a", links => links.map(a => a.href).filter(h => h.includes("/wiki/") && !h.includes("Special:")));
        
        if (searchResults.length === 0) { await browser.close(); return; }

        // Try the first valid result
        const url = searchResults[0];
        await page.goto(url, { waitUntil: "networkidle2" });
        await page.evaluate(() => window.scrollTo(0, 500));
        await new Promise(resolve => setTimeout(resolve, 2000));

        const foundData = await page.evaluate(() => {
            const out = { image: "", summary: "", stats: {} };
            const content = document.querySelector("#mw-content-text");
            if (!content) return out;

            const foundImage = content.querySelector('img[src*="static.wikia.nocookie.net"]');
            if (foundImage) out.image = foundImage.src.split('/revision')[0];

            const summaryH2 = [...content.querySelectorAll("h2")].find(h => /summary/i.test(h.innerText));
            if (summaryH2) {
                let node = summaryH2.nextSibling;
                let arr = [];
                while (node && (node.nodeType !== 1 || node.tagName !== "H2")) {
                    if (node.innerText?.trim()) arr.push(node.innerText.trim());
                    node = node.nextSibling;
                }
                out.summary = arr.join("\n\n");
            }

            const statFields = ["Tier", "Durability", "Lifting Strength", "Speed", "Attack Potency"];
            statFields.forEach(field => {
                const regex = new RegExp(field + "\\s*:\\s*(.+)", "i");
                const match = content.innerText.match(regex);
                if (match) out.stats[field] = match[1].trim();
            });
            return out;
        });

        await browser.close();
        return foundData;
    } catch (err) { if (browser) await browser.close(); throw err; }
}
