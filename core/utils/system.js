const System = require('../models/System');
const connectDB = require('../../db');

const systemCache = new Map();

async function loadSystemData() {
    try {
        await connectDB();
        const data = await System.find({}).lean();
        for (const item of data) {
            systemCache.set(item.key, item.value);
        }
        console.log(`✅ Loaded ${data.length} system keys from MongoDB`);
    } catch (err) {
        console.error("Error loading system data:", err.message);
    }
}

function get(key, defaultValue = null) {
    return systemCache.has(key) ? systemCache.get(key) : defaultValue;
}

// 💡 FIX 2026-09-11 (stale mod lists): the cache above is only populated at
// boot by loadSystemData(). Before this function existed, EVERYTHING read
// through get() stayed frozen at boot state — so a mod added on one bot
// instance (".g addmod" writes _shared_global_mods to MongoDB) was invisible
// on every other instance until a full restart, and even ".j reloadmods"
// re-read the stale cache. getFresh() hits MongoDB directly, refreshes the
// cache, and falls back to the cached value if the DB is unreachable.
async function getFresh(key, defaultValue = null) {
    try {
        const doc = await System.findOne({ key }).lean();
        const value = doc ? doc.value : defaultValue;
        systemCache.set(key, value);
        return value;
    } catch (err) {
        console.error(`Error reading system key ${key}:`, err.message);
        return systemCache.has(key) ? systemCache.get(key) : defaultValue;
    }
}

async function set(key, value) {
    systemCache.set(key, value);
    try {
        await System.updateOne({ key }, { value }, { upsert: true });
    } catch (err) {
        console.error(`Error saving system key ${key}:`, err.message);
    }
}

module.exports = {
    loadSystemData,
    get,
    getFresh,
    set
};
