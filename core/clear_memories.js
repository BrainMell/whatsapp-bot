const mongoose = require('mongoose');
const connectDB = require('../db');
const User = require('./models/User');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function clearMemories() {
    try {
        console.log("🔌 Connecting to MongoDB...");
        await connectDB();
        console.log("✅ Connected.");

        const count = await User.countDocuments();
        console.log(`\n⚠️  WARNING: You are about to clear PERSONAL MEMORIES for all ${count} users.`);
        console.log("⚠️  This will reset: likes, dislikes, hobbies, personal facts, and notes.");
        console.log("💰 Wallet, Bank, Levels, and Items will NOT be affected.");

        rl.question('\n🔴 Proceed with clearing memories? (y/n): ', async (answer) => {
            if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
                console.log("\n🧠 Clearing AI memories and profile notes...");
                
                await User.updateMany({}, {
                    $set: {
                        'profile.notes': [],
                        'profile.memories.likes': [],
                        'profile.memories.dislikes': [],
                        'profile.memories.hobbies': [],
                        'profile.memories.personal': [],
                        'profile.memories.other': []
                    }
                });

                console.log("✅ All user memories have been reset.");
                console.log("✨ Ready for the new information extraction system.");
            } else {
                console.log("❌ Operation cancelled.");
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

clearMemories();
