// ============================================
// 🔍 PRODUCTION DB AUDIT (READ-ONLY) — find test guilds / test wars /
// test artifacts the owner flagged. Prints; deletes NOTHING.
// Run on box1: node scripts/db_audit.js
// ============================================
const path = require('fs');
const ROOT = require('path').resolve(__dirname, '..');

async function main() {
    const connectDB = require('../db');
    await connectDB();
    const mongoose = require('mongoose');
    console.log(`[audit] PRODUCTION db: ${mongoose.connection.name} @ ${mongoose.connection.host}`);

    const Guild = require('../core/models/Guild');
    const System = require('../core/models/System');
    const GuildWarEvent = require('../core/models/GuildWarEvent');
    const GuildLoan = require('../core/models/GuildLoan');

    // 1. all guilds
    const guilds = await Guild.find({}).lean();
    console.log(`\n=== GUILDS (${guilds.length}) ===`);
    for (const g of guilds) {
        console.log(JSON.stringify({
            guildId: g.guildId, name: g.name || g.guildId, owner: g.owner || g.ownerJid,
            members: Array.isArray(g.members) ? g.members.length : undefined,
            points: g.points, level: g.level, balance: g.balance,
            createdAt: g.createdAt, updatedAt: g.updatedAt,
        }));
    }

    // 2. system keys that reference guilds
    console.log(`\n=== SYSTEM KEYS (guild-related) ===`);
    const sysKeys = await System.find({
        key: { $in: ['guild_system', 'memberGuilds', 'guildOwners', 'guildInvites'] },
    }).lean();
    for (const s of sysKeys) {
        const v = s.value;
        const kind = typeof v === 'object' ? (v instanceof Map ? 'map' : Array.isArray(v) ? 'array' : 'object') : typeof v;
        let size = '?';
        try {
            if (kind === 'map') size = v.size;
            else if (kind === 'array') size = v.length;
            else if (kind === 'object') size = Object.keys(v || {}).length;
        } catch (e) {}
        console.log(`key=${s.key} kind=${kind} size=${size}`);
        // print entries that reference suspicious test guild names
        const TESTISH = /test|qa|sim|dummy|fake|temp|debug/i;
        const dump = kind === 'map' ? Array.from(v.entries()) : kind === 'object' ? Object.entries(v || {}) : (v || []);
        let shown = 0;
        for (const [k, val] of dump) {
            const sVal = String(Array.isArray(val) ? val.join(',') : val);
            if (TESTISH.test(String(k)) || TESTISH.test(sVal)) {
                console.log(`  TESTISH: ${String(k).slice(0, 60)} -> ${sVal.slice(0, 80)}`);
                shown++;
                if (shown > 20) { console.log('  ...more suppressed'); break; }
            }
        }
    }

    // 3. gw rpg gc marks (per-bot)
    const rpgKeys = await System.find({ key: /^gw_rpg_gcs_/ }).lean();
    for (const s of rpgKeys) console.log(`rpg-gc key=${s.key} value=${JSON.stringify(s.value)}`);

    // 4. guild war events
    const events = await GuildWarEvent.find({}).sort({ createdAt: -1 }).limit(30).lean();
    console.log(`\n=== GUILD WAR EVENTS (latest ${events.length}) ===`);
    for (const e of events) {
        console.log(JSON.stringify({
            eventId: e.eventId, type: e.type, state: e.state, players: (e.players || []).length,
            createdAt: e.createdAt, hostGroupId: e.hostGroupId,
            playerNames: (e.players || []).slice(0, 6).map((p) => p.name),
        }));
    }

    // 5. guild loans
    const loans = await GuildLoan.find({}).sort({ createdAt: -1 }).limit(20).lean();
    console.log(`\n=== GUILD LOANS (latest ${loans.length}) ===`);
    for (const l of loans) {
        console.log(JSON.stringify({ guildId: l.guildId, amount: l.amount, state: l.state || l.status, createdAt: l.createdAt }));
    }

    console.log('\n[audit] done (read-only)');
    process.exit(0);
}

main().catch((e) => { console.error('[audit] FAILED:', e); process.exit(1); });
