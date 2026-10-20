#!/usr/bin/env node
// Sibling process for econ_compositing_qa.js (47-l1) — simulates the OTHER
// bot instance sharing the same MongoDB (box1 topology: jake + subaru).
// Separate node process = separate in-memory snapshot, exactly like the
// real cross-box writers racing joker on wallet/bank/eventTokens.
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
    const uri = (process.env.MONGO_URI || '').replace(/\/[^/?]+(\?|$)/, '/gwqa_47l1$1');
    process.env.MONGO_URI = uri;
    const mongoose = require('mongoose');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
}

(async () => {
    await connectDB();
    const economy = require('../core/rpg/economy');
    await economy.loadEconomy();

    if (process.argv[2] === 'withdraw_and_tokens') {
        const u = economy.getUser(jid);
        u.wallet = u.wallet + 5000;            // the withdraw credit
        u.eventTokens = (u.eventTokens || 0) + 2;
        u.questsWon = 7;                       // a non-counter sibling change
        await economy.saveUser(jid);
        console.log(`[sibling] wrote wallet=${u.wallet} tokens=${u.eventTokens} questsWon=7`);
    } else if (process.argv[2] === 'credit_4000') {
        const u = economy.getUser(jid);
        u.wallet = u.wallet + 4000;
        await economy.saveUser(jid);
        console.log(`[sibling] wrote wallet=${u.wallet}`);
    } else if (process.argv[2] === 'verify_readback') {
        const u = economy.getUser(jid);
        console.log(`[sibling-readback] ${JSON.stringify({ wallet: u.wallet, bank: u.bank, eventTokens: u.eventTokens, questGold: u.questGold })}`);
    }
    const mongoose = require('mongoose');
    await mongoose.disconnect();
    process.exit(0);
})().catch((e) => { console.error('[sibling] FATAL', e.message); process.exit(1); });
