const fs = require('fs');
const mongoose = require('mongoose');
require('dotenv').config();
const connectDB = require('../db');
const Guild = require('./models/Guild');
const System = require('./models/System');

async function migrate() {
    await connectDB();
    const data = JSON.parse(fs.readFileSync('./database/guilds.json', 'utf-8'));

    // 1. Individual Guilds
    for (const [name, guild] of Object.entries(data.guilds)) {
        await Guild.updateOne(
            { guildId: name }, 
            { 
                name: name,
                leader: guild.owner,
                members: guild.members.map(jid => ({
                    userId: jid,
                    role: guild.owner === jid ? 'leader' : (guild.admins.includes(jid) ? 'officer' : 'member'),
                    title: guild.titles[jid] || 'Member'
                })),
                upgrades: guild.buildings || {},
                logs: guild.pointsHistory || []
            }, 
            { upsert: true }
        );
    }

    // 2. System mappings
    await System.updateOne(
        { key: 'guild_system' },
        { 
            $set: { 
                value: {
                    memberGuilds: data.memberGuilds,
                    guildOwners: data.guildOwners,
                    guildInvites: data.guildInvites
                } 
            } 
        },
        { upsert: true }
    );

    console.log("✅ Guilds & Mappings Migrated!");
    process.exit(0);
}
migrate();
