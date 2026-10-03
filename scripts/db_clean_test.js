// ============================================
// 🧹 PRODUCTION CLEANUP — remove owner-flagged test artifacts ONLY:
//   * Guilds: GwTestA, GwTestB (smoke-test guilds, today, placeholder owners)
//   * GuildLoan: the GwTestA 50k test loan
//   * GuildWarEvent gw_muqj249b_b7b090 (fake host 'm@g.us', initiatedBy 'x',
//     fake player 'mp@s.whatsapp.net', guild 'G' that does not exist)
//   * User docs for synthetic jids: u-GwTestA, u-GwTestB, mp@s.whatsapp.net
// REAL guilds (Valhalla, The Gray Order, Nightraid, SHRINE, NIFLHEIM) untouched.
// Run on box: node scripts/db_clean_test.js
// ============================================
async function main() {
    const connectDB = require('../db');
    await connectDB();
    const Guild = require('../core/models/Guild');
    const GuildLoan = require('../core/models/GuildLoan');
    const GuildWarEvent = require('../core/models/GuildWarEvent');
    const User = require('../core/models/User');

    // ── pre-flight prints ──
    const gDocs = await Guild.find({ guildId: { $in: ['GwTestA', 'GwTestB'] } }).lean();
    console.log(`[clean] guilds to delete: ${gDocs.map((g) => `${g.guildId}(bal=${g.balance},members=${(g.members || []).length})`).join(', ') || 'none'}`);
    const loans = await GuildLoan.find({ guildId: 'GwTestA' }).lean();
    console.log(`[clean] loans to delete: ${loans.length}`);
    const ev = await GuildWarEvent.findOne({ eventId: 'gw_muqj249b_b7b090' }).lean();
    if (ev) {
        // safety: confirm it is the fake one before deleting
        const isFake = ev.hostGroupId === 'm@g.us' && ev.initiatedBy === 'x';
        console.log(`[clean] event gw_muqj249b_b7b090 fake-check: host=${ev.hostGroupId} initiatedBy=${ev.initiatedBy} -> isFake=${isFake}`);
        if (!isFake) { console.error('[clean] ABORT: event does not match fake signature'); process.exit(1); }
    } else {
        console.log('[clean] event gw_muqj249b_b7b090 already gone');
    }
    const FAKE_JIDS = ['u-GwTestA', 'u-GwTestB', 'mp@s.whatsapp.net'];
    const users = await User.find({ userId: { $in: FAKE_JIDS } }).lean();
    console.log(`[clean] user docs to delete: ${users.map((u) => `${u.userId}(wallet=${u.wallet})`).join(', ') || 'none'}`);

    // ── deletions ──
    const r1 = await Guild.deleteMany({ guildId: { $in: ['GwTestA', 'GwTestB'] } });
    const r2 = await GuildLoan.deleteMany({ guildId: 'GwTestA' });
    const r3 = ev ? await GuildWarEvent.deleteOne({ eventId: 'gw_muqj249b_b7b090' }) : { deletedCount: 0 };
    const r4 = await User.deleteMany({ userId: { $in: FAKE_JIDS } });
    console.log(`[clean] deleted: guilds=${r1.deletedCount} loans=${r2.deletedCount} events=${r3.deletedCount} users=${r4.deletedCount}`);

    // ── post verify ──
    const remaining = await Guild.find({ guildId: { $in: ['GwTestA', 'GwTestB'] } }).lean();
    const remainingEv = await GuildWarEvent.countDocuments({});
    const guildList = await Guild.find({}).select('guildId').lean();
    console.log(`[clean] remaining test guilds: ${remaining.length}; total gw events: ${remainingEv}; guilds now: ${guildList.map((g) => g.guildId).join(', ')}`);
    console.log('[clean] done');
    process.exit(0);
}

main().catch((e) => { console.error('[clean] FAILED:', e); process.exit(1); });
