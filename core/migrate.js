const fs = require('fs');
const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User');
const connectDB = require('../db');

const ECONOMY_FILE = "./database/economy.json";

async function migrate() {
    console.log("🚀 Starting migration...");
    
    // 1. Connect to MongoDB
    await connectDB();
    
    // 2. Read JSON
    if (!fs.existsSync(ECONOMY_FILE)) {
        console.error("❌ Economy file not found!");
        process.exit(1);
    }
    
    const rawData = fs.readFileSync(ECONOMY_FILE, 'utf-8');
    const economyData = JSON.parse(rawData);
    
    console.log(`📂 Found ${Object.keys(economyData).length} users to migrate.`);
    
    // 3. Loop and Insert
    let successCount = 0;
    let failCount = 0;
    
    for (const [userId, data] of Object.entries(economyData)) {
        try {
            // Check if user exists
            const existing = await User.findOne({ userId });
            if (existing) {
                console.log(`⚠️ User ${userId} already exists. Updating...`);
                await User.updateOne({ userId }, data);
            } else {
                await User.create({ userId, ...data });
            }
            successCount++;
            process.stdout.write('.'); // Progress bar style
        } catch (err) {
            console.error(`\n❌ Failed to migrate ${userId}: ${err.message}`);
            failCount++;
        }
    }
    
    console.log(`\n\n✅ Migration Complete!`);
    console.log(`Successful: ${successCount}`);
    console.log(`Failed: ${failCount}`);
    
    process.exit(0);
}

migrate();
