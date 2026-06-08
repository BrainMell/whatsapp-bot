const mongoose = require('mongoose');
const connectDB = require('../db');
const User = require('../models/User');
const Guild = require('../models/Guild');
const Loan = require('../models/Loan');
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

        console.log("\n🛑 CRITICAL: The bot server MUST be turned OFF before running this script.");
        console.log("If the bot is ON, it will overwrite the database with its memory cache.");

        const userCount = await User.countDocuments();
        const guildCount = await Guild.countDocuments();
        const loanCount = await Loan.countDocuments();

        console.log(`\n⚠️  WARNING: You are about to DELETE EVERYTHING:`);
        console.log(`- ${userCount} Users`);
        console.log(`- ${guildCount} Guilds`);
        console.log(`- ${loanCount} Active Loans`);
        console.log("\n⚠️  This action is IRREVERSIBLE.");

        rl.question('\n🔴 Are you sure you want to proceed? Type "WIPE EVERYTHING" to confirm: ', async (answer) => {
            if (answer === 'WIPE EVERYTHING') {
                console.log("\n🗑️  Wiping database collections...");
                
                await User.deleteMany({});
                console.log("✅ User data cleared.");
                
                await Guild.deleteMany({});
                console.log("✅ Guild data cleared.");

                await Loan.deleteMany({});
                console.log("✅ Loan data cleared.");
                
                console.log("\n✨ Database is now fresh. You can now restart the bot.");
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
