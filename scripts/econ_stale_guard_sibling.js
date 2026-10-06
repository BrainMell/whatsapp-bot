#!/usr/bin/env node
// Sibling process for econ_stale_guard_qa.js — simulates the OTHER bot
// instance sharing the same MongoDB (Box1 topology: jake + subaru).
// Usage: node scripts/econ_stale_guard_sibling.js <step> <jid>
// Requires economy with its OWN cache (separate node process = separate
// in-memory snapshot), mutates, flushes to DB, exits.
const jid = process.argv[3];

async function connectDB() {
    const fs = require('fs');
    const path = require('path');
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
        for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
            if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
        }
    }
    const uri = (process.env.MONGO_URI || '').replace(/\/[^/?]+(\?|$)/, '/gwqa_stale$1');
    process.env.MONGO_URI = uri;
    const mongoose = require('mongoose');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
}

(async () => {
    await connectDB();
    const economy = require('../core/rpg/economy');
    await economy.loadEconomy();

    if (process.argv[2] === 'claim_reward') {
        // Sibling-side player actions: quest completion + wallet payout +
        // effect state the parent process has never seen.
        const u = economy.getUser(jid);
        u.wallet = 1500;                                   // sibling pays quest reward
        u.questsWon = 7;                                   // sibling's quest progress
        u.activeEffects = { full_restore: 999999999999 };  // granted via the sibling
        await economy.saveUser(jid);
        console.log(`[sibling] wrote wallet=1500 questsWon=7 activeEffects (wallet now ${economy.getBalance(jid)})`);
    } else if (process.argv[2] === 'verify_readback') {
        const u = economy.getUser(jid);
        console.log(`[sibling-readback] ${JSON.stringify({ wallet: u.wallet, questGold: u.questGold, questsCompleted: u.questsCompleted, questsWon: u.questsWon, activeEffects: u.activeEffects })}`);
    }
    const mongoose = require('mongoose');
    await mongoose.disconnect();
    process.exit(0);
})().catch((e) => { console.error('[sibling] FATAL', e.message); process.exit(1); });
