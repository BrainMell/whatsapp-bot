const mongoose = require('mongoose');
const connectDB = require('../db');
const User = require('./models/User');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function wipeUsers() {
    try {
        console.log("🔌 Connecting to MongoDB...");
        await connectDB();
        console.log("✅ Connected.");

        const count = await User.countDocuments();
        console.log(`\n⚠️  WARNING: You are about to DELETE ALL ${count} USERS from the database.`);
        console.log("⚠️  This action is IRREVERSIBLE.");
        console.log("⚠️  This will reset economy, levels, and profiles for everyone.");

        rl.question('\n🔴 Are you sure you want to proceed? Type "DELETE" to confirm: ', async (answer) => {
            if (answer === 'DELETE') {
                console.log("\n🗑️  Wiping User collection...");
                await User.deleteMany({});
                console.log("✅ All user data has been cleared.");
                
                // Optional: Check if you want to clear other related collections
                // await Profile.deleteMany({}); 
                
                console.log("✨ Ready for new information extraction system.");
            } else {
                console.log("\n❌ Operation cancelled. No data was deleted.");
            }
            
            await mongoose.disconnect();
            rl.close();
            process.exit(0);
        });

    } catch (err) {
        console.error("❌ Error:", err);
        process.exit(1);
    }
}

wipeUsers();
