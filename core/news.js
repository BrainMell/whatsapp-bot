const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const system = require('./system'); // NEW: Database System Module

let sentUrls = new Set();

// Load sent history on startup
function loadLog() {
    const data = system.get('news_log', []);
    sentUrls = new Set(data);
    console.log(`📰 Loaded ${sentUrls.size} sent news articles from MongoDB.`);
}

function saveLog() {
    // Keep log size manageable (max 200)
    if (sentUrls.size > 200) {
        const arr = Array.from(sentUrls);
        sentUrls = new Set(arr.slice(arr.length - 100)); // Keep last 100
    }
    system.set('news_log', [...sentUrls]);
}

// Scrape Anime Corner for latest news
async function getLatestNews() {
    try {
        const BASE_URL = 'https://animecorner.me/category/anime-news/';
        const { data } = await axios.get(BASE_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000
        });
        
        const $ = cheerio.load(data);
        const articles = [];

        const articleElements = $('article').toArray();
        for (let i = 0; i < Math.min(articleElements.length, 5); i++) {
            const el = articleElements[i];
            const title = $(el).find('h1,h2,h3').first().text().trim();
            const link = $(el).find('a').first().attr('href');
            
            if (!title || !link) continue;

            // Get initial image
            const imgElement = $(el).find('img');
            let img = imgElement.attr('data-src') || imgElement.attr('data-lazy-src') || imgElement.attr('data-original') || imgElement.attr('src');
            
            if (img && img.startsWith('//')) img = 'https:' + img;

            let summary = "";
            
            // Fetch article page for BEST image and summary
            try {
                const pageRes = await axios.get(link, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 5000 });
                const $$ = cheerio.load(pageRes.data);
                
                // Better summary
                const para = $$('article p').first().text().trim();
                if (para.length > 50) summary = para.slice(0, 300) + "...";

                // Better image fallback
                if (!img || img.includes('placeholder')) {
                    const ogImg = $$('meta[property="og:image"]').attr('content') || $$('meta[name="twitter:image"]').attr('content');
                    if (ogImg) img = ogImg;
                }
            } catch (e) {
                console.log(`⚠️ Page fetch failed for ${link}: ${e.message}`);
            }

            console.log(`DEBUG: Scraped: "${title.substring(0, 30)}..." | Image: ${img ? "YES" : "NONE"}`);
            articles.push({ title, link, img, summary });
        }

        return articles;
    } catch (err) {
        console.error("❌ Failed to scrape anime news:", err.message);
        return [];
    }
}

// Get ONLY news that hasn't been sent yet
async function getUnsentNews() {
    const allNews = await getLatestNews();
    const newArticles = [];

    for (const article of allNews) {
        if (!sentUrls.has(article.link)) {
            newArticles.push(article);
            sentUrls.add(article.link); // Mark as sent immediately to prevent dupes
        }
    }

    if (newArticles.length > 0) {
        saveLog();
    }

    return newArticles;
}

// Check if update is due (every 6 hours)
function isUpdateDue() {
    const lastRun = system.get('last_news_run', 0);
    const now = Date.now();
    // 6 hours = 21600000 ms
    return (now - lastRun) > 21600000;
}

// Mark update as complete
function markUpdateComplete() {
    system.set('last_news_run', Date.now());
}

// Initialize
loadLog();

module.exports = {
    getUnsentNews,
    getLatestNews,
    isUpdateDue,
    markUpdateComplete
};
