#!/usr/bin/env node
// QA - Super RC auto-backup + .j unsrc restore.
// Source pins on cardSystem.js + CardBackup model + real-DB model smoke test.
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'core/rpg/cardSystem.js'), 'utf8');
const model = fs.readFileSync(path.join(ROOT, 'core/models/CardBackup.js'), 'utf8');

console.log('── model file');
ok(/collection: 'cardBackups'/.test(model), 'CardBackup targets cardBackups collection');
ok(/targetJid|variants|rows:|wipedBy|restoredAt|restoredBy/.test(model), 'schema carries targetJid/variants/rows/wipedBy/restoredAt/restoredBy');
ok(/mongoose\.models\.CardBackup \|\|/.test(model), 'model re-register guard');

console.log('── require + registry');
ok(/const CardBackup = require\('\.\.\/models\/CardBackup'\);/.test(src), 'cardSystem requires CardBackup');
ok(/'unsrc', 'restorecards'/.test(src), 'unsrc/restorecards in TOKEN_CMD_EXCLUDED');

console.log('── cmdSuperRc: backup BEFORE wipe, across identity variants');
const superRc = src.slice(src.indexOf('async function cmdSuperRc'), src.indexOf('async function cmdRestoreCards'));
ok(/await ownerOf\(mentioned\)/.test(superRc), 'wipe counts/deletes via ownerOf (all identity forms)');
ok(/await cardOwnerVariants\(mentioned\)/.test(superRc), 'variants captured for backup doc');
ok(/await CardBackup\.create\(/.test(superRc), 'backup doc created on confirm');
ok(superRc.indexOf('CardBackup.create') < superRc.indexOf('UserCard.deleteMany'), 'backup happens BEFORE deleteMany (ordering)');
ok(/refusing to wipe without a recovery path/.test(superRc), 'backup failure ABORTS the wipe');
ok(/sellerId: \{ \$in: variants \}/.test(superRc), 'market listings cancelled across variants');
ok(/BACKUP \$\{backupId\}/.test(superRc), 'backup id logged to console (recovery handle)');
ok(/completely wiped\._/.test(superRc), 'dramatic chat reply preserved (prank-safe)');

console.log('── cmdRestoreCards');
const restore = src.slice(src.indexOf('async function cmdRestoreCards'), src.indexOf('async function cmdTokenLB'));
ok(/variants: \{ \$in: variants \}, restoredAt: null/.test(restore), 'matches latest unrestored backup across variants');
ok(/insertMany\(backup\.rows, \{ ordered: false \}\)/.test(restore), 'ordered:false insertMany (original _ids, dupes skipped)');
ok(/insertedDocs && e\.insertedDocs\.length/.test(restore), 'partial-success counting (insertedDocs)');
ok(/backup\.restoredAt = new Date\(\)/.test(restore), 'backup marked restored');
ok(/NO BACKUP FOUND/.test(restore), 'no-backup reply path');
ok(/COLLECTION RESTORED/.test(restore), 'restore confirmation reply');

console.log('── dispatch + gate');
ok(/case 'unsrc':\s*\n\s*case 'restorecards':\s*\n\s*if \(!isCardMod\) return reply/.test(src), 'unsrc/restorecards dispatched, isCardMod gated');
ok(/case 'src':\s*\n\s*if \(!isCardMod\) return reply\('❌ Only card moderators and above can run a Super RC\.'\), true;\s*\n\s*await cmdSuperRc\(senderJid, reply, args, m\);/.test(src), 'src dispatch intact');
ok((src.match(/await cmdRestoreCards\(/g) || []).length === 1, 'cmdRestoreCards wired exactly once');
ok(/const deleted = await UserCard\.deleteMany\(ownerFilter\);/.test(superRc), 'cards deleted across ownerFilter');
ok(/await CardDeck\.deleteMany\(ownerFilter\);/.test(superRc), 'decks deleted across ownerFilter');

console.log('── real-DB model smoke test (harmless: writes+removes one cardBackups doc only)');
(async () => {
  try {
    const mongoose = require('mongoose');
    const os = require('os');
    const env = fs.readFileSync(path.join(os.homedir(), 'whatsapp-bot', '.env'), 'utf8');
    const uri = env.match(/^MONGO_URI=(.*)$/m)[1].trim().replace(/^["']|["']$/g, '');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
    const CardBackup = require(path.join(ROOT, 'core/models/CardBackup'));
    const d = await CardBackup.create({ targetJid: 'qa_smoke@x', variants: ['qa_smoke@x'], cardCount: 1, rows: [{ userId: 'qa_smoke@x', cardId: 'QA-1' }], wipedBy: 'qa' });
    const back = await CardBackup.findById(d._id).lean();
    ok(back && back.rows.length === 1 && back.rows[0].cardId === 'QA-1', 'roundtrip: backup doc persists rows');
    const match = await CardBackup.findOne({ variants: { $in: ['qa_smoke@x'] }, restoredAt: null }).lean();
    ok(!!match, 'restore lookup shape ($in on variants) works against real DB');
    await CardBackup.deleteOne({ _id: d._id });
    console.log('  (smoke doc cleaned up)');
    await mongoose.disconnect();
  } catch (e) {
    ok(false, 'real-DB smoke: ' + e.message);
  }
  console.log(`\nQA RESULT: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
