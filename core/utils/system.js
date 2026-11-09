const System = require('../models/System');
const connectDB = require('../../db');

const systemCache = new Map();

// ⚡ BOOT SNAPSHOT (2026-11-09): Atlas M0 throttles this 3.1 MB collection to
// ~38 s per pull — boot used to wait for it SERIALLY before WhatsApp even
// connected. Restore from the instance's disk dump instead (see bootSnapshot.js);
// getFresh() still hits Mongo whenever a caller needs live truth, so a
// restored KV is safe.
async function loadSystemData() {
    try {
        // ⚡ RECONNECT SKIP (2026-11-09): initSocket re-runs on every reconnect;
        // the 3.1 MB Mongo re-pull (~38 s throttled) used to re-run with it.
        // The cache is live in memory and getFresh() always hits Mongo when a
        // caller needs current truth — so a populated cache skips the reload.
        if (systemCache.size > 0) {
            console.log(`✅ [system] cache already populated (${systemCache.size} keys) — skipping re-load`);
            return;
        }
        await connectDB();
        const bs = require('./bootSnapshot');
        const dir = global.WA_INSTANCE_DIR;
        if (dir) {
            const snap = bs.loadSnapshot(dir, 'systems');
            if (snap.ok && snap.data && Array.isArray(snap.data.entries) && snap.data.entries.length) {
                for (const [k, v] of snap.data.entries) systemCache.set(k, v);
                console.log(`✅ Loaded ${snap.data.entries.length} system keys from SNAPSHOT (age ${snap.ageMin}m)`);
                return;
            } else if (snap.reason === 'stale') {
                console.log(`⏳ system snapshot too old (${snap.ageMin}m) — falling back to MongoDB load`);
            }
        }
        const data = await System.find({}).lean();
        for (const item of data) {
            systemCache.set(item.key, item.value);
        }
        console.log(`✅ Loaded ${data.length} system keys from MongoDB`);
    } catch (err) {
        console.error("Error loading system data:", err.message);
    }
}

// ⚡ Called on the boot-snapshot cadence (engine.js). Dumps the KV map to the
// instance's cache/boot dir. Fire-and-forget; never throws.
async function dumpSystemSnapshot() {
    try {
        const bs = require('./bootSnapshot');
        const dir = global.WA_INSTANCE_DIR;
        if (!dir || systemCache.size === 0) return;
        const r = await bs.saveSnapshot(dir, 'systems', { entries: Array.from(systemCache.entries()) });
        if (r.err && r.err !== 'disabled') console.warn('⚠️ system snapshot dump failed:', r.err);
    } catch (e) { /* never throw into the caller */ }
}

function get(key, defaultValue = null) {
    return systemCache.has(key) ? systemCache.get(key) : defaultValue;
}

// 💡 FIX 2026-09-11 (stale mod lists): the cache above is only populated at
// boot by loadSystemData(). Before this function existed, EVERYTHING read
// through get() stayed frozen at boot state - so a mod added on one bot
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
    dumpSystemSnapshot,
    get,
    getFresh,
    set
};
