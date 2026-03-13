const GoImageService = require('./goImageService');
const goService = new GoImageService();
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

// Scrape Anime Corner for latest news (Via Go Service)
async function getLatestNews() {
    try {
        const articles = await goService.getAnimeNews();
        console.log(`DEBUG: Scraped ${articles.length} news items from Go Service.`);
        return articles;
    } catch (err) {
        console.error("❌ Failed to fetch anime news from Go Service:", err.message);
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

