// debug probe: why does claimFlow's $or fail to match a fresh (no flow) doc?
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
}
process.env.MONGO_URI = (process.env.MONGO_URI || '').replace(/\/[^/?]+(\?|$)/, '/gwtest$1');
const mongoose = require('mongoose');
const GuildWarEvent = require('../core/models/GuildWarEvent');

(async () => {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
    const id = `gw_probe_${Date.now().toString(36)}`;
    await GuildWarEvent.deleteMany({ eventId: id });
    const ev = await GuildWarEvent.create({ eventId: id, state: 'REGISTRATION', hostGroupId: 'x@g.us' });
    console.log('created. flow field:', JSON.stringify(ev.flow), '| flow keys:', ev.toObject().flow);

    const q1 = { eventId: id, $or: [{ 'flow.owner': 'A' }, { 'flow.at': { $lt: Date.now() - 90000 } }, { flow: { $exists: false } }, { flow: null }] };
    const raw = await GuildWarEvent.collection.findOne(q1);
    console.log('RAW find matches fresh doc:', !!raw);

    try {
        const upd = await GuildWarEvent.findOneAndUpdate(q1, { $set: { flow: { owner: 'A', at: Date.now() } } }, { new: true, projection: { _id: 1 } }).lean();
        console.log('findOneAndUpdate result:', !!upd, upd && upd._id);
    } catch (e) {
        console.log('findOneAndUpdate THREW:', e.message);
    }
    const after = await GuildWarEvent.collection.findOne({ eventId: id });
    console.log('after claim, flow =', JSON.stringify(after.flow));
    await GuildWarEvent.deleteMany({ eventId: id });
    await mongoose.disconnect();
})().catch((e) => { console.error('fatal', e); process.exit(1); });
