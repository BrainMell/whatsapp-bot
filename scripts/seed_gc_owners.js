#!/usr/bin/env node
/**
 * Task 18 seed: populate the single-owner group map (_shared_gc_owner).
 *
 * Runs on a box that has the repo + .env (MONGO_URI). Safe to re-run (merges:
 * entries below win, unknown existing entries are preserved).
 *
 * Owner choices are evidence-based from pm2 log analysis (2026-10-05):
 * groups where 2-3 bots raced each other get their dominant/primary bot;
 * single-bot groups are pinned to the bot that actually serves them.
 *
 * Key encoding: Mongo forbids '.' in doc keys → '|' replaces '.' in JIDs
 * (engine.js decGid reverses this).
 */
require('dotenv').config();
const mongoose = require('mongoose');

const KEY = '_shared_gc_owner';

// gid → bot id (lowercase)
const SEED = {
    // contested - war group: jake dominant (1681 vs 949 log lines, 188 vs 61 GW)
    '120363409467230514@g.us': 'jake',
    // contested - subaru dominant (239 vs 176 vs 95)
    '120363409013549791@g.us': 'subaru',
    // contested - jake dominant
    '120363425537623415@g.us': 'jake',
    '120363424033442252@g.us': 'jake',
    // contested - joker is the currently-serving bot here (recent traffic + double pong)
    '120363198461552512@g.us': 'joker',
    '120363408369953090@g.us': 'joker',
    '120363410407950041@g.us': 'joker',
    // single-bot groups - pinned for determinism
    '120363409235438388@g.us': 'joker',
    '120363423509709765@g.us': 'subaru',
    '120363412295224732@g.us': 'subaru',
    '120363292176054440@g.us': 'subaru',
    '120363411265881672@g.us': 'subaru',
    '120363408470920742@g.us': 'subaru',
    '120363428642091639@g.us': 'jake',
    '120363416194140862@g.us': 'joker',
    '120363427063834892@g.us': 'joker',
};

const enc = (gid) => String(gid).replace(/\./g, '|');

(async () => {
    if (!process.env.MONGO_URI) {
        console.error('FATAL: MONGO_URI not set (.env missing?)');
        process.exit(1);
    }
    await mongoose.connect(process.env.MONGO_URI);
    const col = mongoose.connection.db.collection('systems');

    const before = await col.findOne({ key: KEY });
    const merged = { ...(before && before.value ? before.value : {}) };
    const existingEnabled = await col.findOne({ key: '_shared_enabled_gcs' });
    const enabledList = (existingEnabled && Array.isArray(existingEnabled.value)) ? existingEnabled.value : [];
    const enabledSet = new Set(enabledList);

    for (const [gid, bot] of Object.entries(SEED)) {
        merged[enc(gid)] = bot;
    }
    await col.updateOne({ key: KEY }, { $set: { value: merged } }, { upsert: true });

    console.log(`[seed] enabled whitelist has ${enabledList.length} group(s)`);
    for (const [gid, bot] of Object.entries(SEED)) {
        console.log(`[seed] ${gid} -> ${bot}${enabledSet.has(gid) ? '' : '  (NOTE: not in whitelist)'}`);
    }
    const after = await col.findOne({ key: KEY });
    const n = after && after.value ? Object.keys(after.value).length : 0;
    console.log(`[seed] _shared_gc_owner now holds ${n} entr(ies). Done.`);
    await mongoose.disconnect();
})().catch((e) => {
    console.error('[seed] FATAL:', e.message);
    process.exit(1);
});
