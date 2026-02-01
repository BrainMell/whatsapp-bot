const fs = require('fs');
const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User');
const connectDB = require('../db');

const PROGRESSION_FILE = "./database/progression.json";
const PROFILES_FILE = "./database/user_profiles.json";

async function migrateExtras() {
    console.log("🚀 Starting SECONDARY migration (Progression + AI Memories)...");
    
    await connectDB();
    
    // 1. Load Progression
    let progressionData = {};
    if (fs.existsSync(PROGRESSION_FILE)) {
        const raw = JSON.parse(fs.readFileSync(PROGRESSION_FILE, 'utf-8'));
        progressionData = raw.users || {}; // Handle the "users" wrapper
        console.log(`📂 Found ${Object.keys(progressionData).length} progression records.`);
    }

    // 2. Load Profiles (Memories)
    let profileData = {};
    if (fs.existsSync(PROFILES_FILE)) {
        profileData = JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf-8'));
        console.log(`🧠 Found ${Object.keys(profileData).length} AI memory profiles.`);
    }

    // 3. Merge Logic
    // We iterate through ALL users found in either file
    const allUserIds = new Set([
        ...Object.keys(progressionData),
        ...Object.keys(profileData)
    ]);

    let count = 0;

    for (const userId of allUserIds) {
        const updatePayload = {};

        // Prepare Progression Data
        if (progressionData[userId]) {
            const p = progressionData[userId];
            updatePayload.progression = {
                xp: p.xp || 0,
                level: p.level || 1,
                totalXPEarned: p.totalXPEarned || 0,
                commandsUsed: p.commandCount || 0,
                achievements: p.achievements || []
            };
        }

        // Prepare Profile Data
        if (profileData[userId]) {
            const m = profileData[userId];
            updatePayload.profile = {
                whatsappName: m.whatsappName,
                nickname: m.nickname,
                notes: m.notes || [],
                memories: m.memories || {},
                stats: m.stats || {}
            };
        }

        if (Object.keys(updatePayload).length > 0) {
            // Upsert: Update if exists, Create if not
            await User.updateOne(
                { userId: userId },
                { $set: updatePayload },
                { upsert: true }
            );
            count++;
            if (count % 10 === 0) process.stdout.write('.');
        }
    }

    console.log(`\n✅ Updated/Created ${count} users with extra data.`);
    process.exit(0);
}

migrateExtras();
