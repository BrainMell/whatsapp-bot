const System = require('./models/System');
const connectDB = require('../db');

const systemCache = new Map();

async function loadSystemData() {
    try {
        await connectDB();
        const data = await System.find({});
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
    set
};
