// v2 (15:40Z): "Firstly make both thier sp and statppints 2 each"
// -> thefirstloser + pink dildo: progression.statPoints = 2, skillPoints = 2.
// Level/xp untouched (holding at L74 / 2,272,957 from the previous fix).
// BACKUP -> FIX (leaf $set, level-aware guard) -> VERIFY. No full-doc replaces.
const mongoose = require('mongoose');
const fs = require('fs');

(async () => {
 // self-load MONGO_URI from .env (shell sourcing of this .env is unreliable)
  if (!process.env.MONGO_URI) {
    const envText = fs.readFileSync('.env', 'utf8');
    for (const line of envText.split(/\r?\n/)) {
      const m = line.match(/^MONGO_URI=(.*)$/);
      if (m) process.env.MONGO_URI = m[1].trim();
    }
  }
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  const User = require('../core/models/User');

  const TARGETS = ['230240982986867@lid', '2348161792083@s.whatsapp.net']; // thefirstloser, pink dildo
  const PTS = 2;

  const docs = await User.find({ userId: { $in: TARGETS } }).lean();
  if (docs.length !== TARGETS.length) throw new Error(`expected ${TARGETS.length} docs, got ${docs.length}`);

 // 1. BACKUP
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `/home/ubuntu/player-backups/pre_points2_fix_${stamp}.json`;
  fs.mkdirSync('/home/ubuntu/player-backups', { recursive: true });
  fs.writeFileSync(backupPath, JSON.stringify({ stamp, targets: TARGETS, docs }, null, 2));
  for (const d of docs) {
    console.log(`BACKUP ${d.nickname} (${d.userId}): level=${d.progression?.level} xp=${d.progression?.xp} statPoints=${d.progression?.statPoints} skillPoints=${d.skillPoints} allocated=${JSON.stringify(d.progression?.allocatedStats)} -> ${backupPath}`);
  }

 // 2. FIX (leaf-level $set; guard on level=74 so we never blind-write a drifted doc)
  for (const d of docs) {
    const r = await User.updateOne(
      { userId: d.userId, 'progression.level': 74 }, // guard: only if still L74 from the previous fix
      { $set: { 'progression.statPoints': PTS, skillPoints: PTS } }
    );
    console.log(`FIX ${d.nickname}: statPoints ${d.progression?.statPoints}->${PTS}, skillPoints ${d.skillPoints}->${PTS} matched=${r.matchedCount} modified=${r.modifiedCount}`);
    if (r.matchedCount === 0) console.log(`WARN ${d.nickname}: level guard (74) did not match - current level=${d.progression?.level}, NOTHING written`);
  }

 // 3. VERIFY (immediate)
  const after = await User.find({ userId: { $in: TARGETS } }).lean();
  let ok = true;
  for (const d of after) {
    const good = d.progression?.statPoints === PTS && d.skillPoints === PTS && d.progression?.level === 74;
    if (!good) ok = false;
    console.log(`VERIFY ${d.nickname}: level=${d.progression?.level} xp=${d.progression?.xp} statPoints=${d.progression?.statPoints} skillPoints=${d.skillPoints} good=${good}`);
  }
  console.log(ok ? 'RESULT: GREEN' : 'RESULT: CHECK FAILED');
  await mongoose.disconnect();
  process.exit(ok ? 0 : 2);
})().catch(e => { console.error('ERR', e && e.message); process.exit(1); });
