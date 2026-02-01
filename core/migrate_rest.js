const fs = require('fs');
const mongoose = require('mongoose');
require('dotenv').config();
const connectDB = require('../db');

// Models
const Guild = require('./models/Guild');
const Loan = require('./models/Loan');
const System = require('./models/System');

// File Paths
const DB_PATH = './database';

async function migrateRest() {
    console.log("🚀 Starting FINAL migration (Guilds, Loans, System)...");
    await connectDB();
    
    // 1. Guilds
    if (fs.existsSync(`${DB_PATH}/guilds.json`)) {
        try {
            const data = JSON.parse(fs.readFileSync(`${DB_PATH}/guilds.json`, 'utf-8'));
            let count = 0;
            for (const [id, guild] of Object.entries(data)) {
                await Guild.updateOne({ guildId: id }, guild, { upsert: true });
                count++;
            }
            console.log(`✅ Migrated ${count} Guilds.`);
        } catch (e) { console.error("❌ Guild Migration Error:", e.message); }
    }

    // 2. Loans
    if (fs.existsSync(`${DB_PATH}/loans.json`)) {
        try {
            const data = JSON.parse(fs.readFileSync(`${DB_PATH}/loans.json`, 'utf-8'));
            let count = 0;
            for (const [id, loan] of Object.entries(data)) {
                await Loan.updateOne({ loanId: id }, loan, { upsert: true });
                count++;
            }
            console.log(`✅ Migrated ${count} Loans.`);
        } catch (e) { console.error("❌ Loan Migration Error:", e.message); }
    }

    // 3. System Data (Key-Value Stores)
    const systemFiles = {
        'blocked_users': 'blocked_users.json',
        'muted_users': 'muted_users.json',
        'user_warnings': 'user_warnings.json',
        'group_settings': 'group_settings.json',
        'support_usage': 'support_usage.json',
        'bot_info': 'bot-info.json',
        'ttt_scores': 'ttt_scores.json',
        'wordle_scores': 'wordle_scores.json'
    };

    for (const [key, file] of Object.entries(systemFiles)) {
        if (fs.existsSync(`${DB_PATH}/${file}`)) {
            try {
                const data = JSON.parse(fs.readFileSync(`${DB_PATH}/${file}`, 'utf-8'));
                await System.updateOne(
                    { key: key },
                    { $set: { value: data } },
                    { upsert: true }
                );
                console.log(`✅ Migrated System Data: ${key}`);
            } catch (e) { console.error(`❌ ${key} Migration Error:`, e.message); }
        }
    }

    console.log("🎉 All migrations complete!");
    process.exit(0);
}

migrateRest();
