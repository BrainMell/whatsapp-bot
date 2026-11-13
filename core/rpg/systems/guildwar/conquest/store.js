'use strict';
// 💾 Persistence: ONE Mongo doc per war ({key, v, state}); optimistic-concurrency mutate() so the 3 bot instances
// can't clobber each other. CONQUEST_MEM=1 (or no mongoose connection) falls back to memory for tests.
let Model = null;
function model() {
    if (Model) return Model; const mongoose = require('mongoose');
    const schema = new mongoose.Schema({ key: { type: String, unique: true, index: true }, v: { type: Number, default: 0 }, status: String, state: mongoose.Schema.Types.Mixed }, { minimize: false, timestamps: true });
    return (Model = mongoose.models.ConquestWar || mongoose.model('ConquestWar', schema));
}
const mem = new Map(); const useMem = () => String(process.env.CONQUEST_MEM || '') === '1';
async function load(key) { if (useMem()) return mem.has(key) ? JSON.parse(mem.get(key)) : null; const d = await model().findOne({ key }).lean(); if (!d) return null; d.state.v = d.v; return d.state; }
/** fn(state) mutates in place and returns a value; create() builds the state if absent. Retries on version conflict. */
async function mutate(key, fn, create) {
    for (let i = 0; i < 5; i++) {
        let st = await load(key); if (!st) { if (!create) return null; st = create(); st.v = 0; if (!useMem()) { try { await model().create({ key, v: 0, status: st.status, state: st }); } catch (e) { if (e.code !== 11000) throw e; st = await load(key); } } }
        const base = st.v; const out = await fn(st); st.v = base + 1;
        if (useMem()) { mem.set(key, JSON.stringify(st)); return out; }
        const r = await model().updateOne({ key, v: base }, { $set: { state: st, v: base + 1, status: st.status } });
        if (r.modifiedCount === 1 || r.nModified === 1) return out;
    }
    throw new Error('conquest: version conflict after retries');
}
module.exports = { load, mutate, _mem: mem };
