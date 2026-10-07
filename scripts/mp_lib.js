// ============================================
// 🧪 MULTIPLAYER RUINS PLAYTEST LIB — owner brief multiplayer_ruins_playtest-1.txt
// Drives the REAL game code exactly like real players: real DB event docs,
// real dmRouter.handleDM per player, real startRoomCombat (in-process battle
// renders), real rooms/state/points. Fake sock records every DM payload so
// we can assert what each player actually received AND save the images.
// ============================================
process.env.GW_TEST = '1';
process.env.GW_MOVE_COOLDOWN_MS = '300'; // 6s → 0.3s so sims can move quickly
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ⚙️ portability (follow-up to ca939f0f): resolve the repo relative to THIS
// file and honor GW_QA_OUT — the hardcoded dev-container paths made
// gw_full_sim EACCES on the boxes (nothing can mkdir /home/z/my-project there).
const REPO = process.env.GW_QA_REPO || path.join(__dirname, '..');
const OUT = process.env.GW_QA_OUT || path.join(REPO, 'render_out', 'mp_playtest');

async function connectDB() {
    const envPath = path.join(REPO, '.env');
    if (fs.existsSync(envPath)) for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
    // GW_SIM_DB: run a sim on its OWN database so concurrent agents iterating
    // the shared gwtest sandbox (they wipe events) can never delete each
    // other's wars mid-run. Default stays gwtest.
    const simDb = process.env.GW_SIM_DB || 'gwtest';
    const uri = (process.env.MONGO_URI || '').replace(/\/[^/?]+(\?|$)/, `/${simDb}$1`);
    process.env.MONGO_URI = uri;
    await require('mongoose').connect(uri, { serverSelectionTimeoutMS: 8000 });
}

// characters/ top-level PNGs are LFS stubs — overlay the real ones for renders
function overlaySprites() {
    try {
        const dir = path.join(REPO, 'core/rpgasset/characters');
        const clean = path.join(dir, 'clean');
        for (const f of fs.readdirSync(clean)) {
            const dst = path.join(dir, f);
            const st = fs.statSync(path.join(clean, f));
            if (st.isFile() && st.size > 1000) fs.copyFileSync(path.join(clean, f), dst);
        }
    } catch (e) { console.error('sprite overlay failed:', e.message); }
}
function restoreSprites() {
    try { execSync('git checkout -- core/rpgasset/characters', { cwd: REPO }); } catch (e) {}
}

// ── fake WhatsApp sock: records every message per recipient ──
function makeSock(label) {
    const sock = {
        label, sent: [],
        async sendMessage(chatId, payload) {
            this.sent.push({ to: chatId, payload, at: Date.now() });
        },
        async groupMetadata() { return { participants: [] }; },
        clear() { this.sent.length = 0; },
        // filter helpers
        to(jid) { return this.sent.filter((s) => String(s.to).split('@')[0] === String(jid).split('@')[0]); },
    };
    return sock;
}

// ── per-player DM driver: real router, real serialization ──
// NOTE: mirrors engine.js — a NON-EMPTY router RETURN is sent by the engine
// (image+caption / text). Verbs that send inside the router return {}.
async function dm(sock, jid, text) {
    const dmRouter = require('../core/rpg/guildWar/dmRouter');
    const res = await dmRouter.handleDM(sock, jid, jid, text, '\u200B', { prefix: '.j', prefixed: true });
    if (res && (res.image || res.text)) {
        const payload = res.image
            ? { image: res.image, caption: '\u200B' + (res.text || '') }
            : { text: '\u200B' + (res.text || '') };
        try { await sock.sendMessage(jid, payload); } catch (e) { /* best-effort */ }
    }
    return res;
}

// ── seed economy users + in-memory guilds so sprites/stats resolve ──
function seedIdentities(roster) {
    const economy = require('../core/rpg/economy');
    const guilds = require('../core/rpg/guilds');
    for (const p of roster) {
        if (!economy.isRegistered(p.jid)) {
            try { economy.registerUser(p.jid, p.name); } catch (e) { /* already */ }
        }
        const u = economy.getUser(p.jid);
        if (u) { u.class = p.classId; u.spriteIndex = p.spriteIndex ?? 0; }
    }
    // real guild API: createGuild(guildName, creatorJid) + joinGuild(guildName, jid)
    const byGuild = {};
    for (const p of roster) (byGuild[p.guildName] = byGuild[p.guildName] || []).push(p);
    for (const [gn, members] of Object.entries(byGuild)) {
        if (!guilds.getGuild(gn)) {
            const r = guilds.createGuild(gn, members[0].jid);
            if (!r.success) console.error('createGuild', gn, r.message);
            const g = guilds.getGuild(gn);
            if (g) g.level = 9; // visibility perk tier: mates + detect
        }
        for (const m of members.slice(1)) {
            if (guilds.getUserGuild(m.jid) !== gn) {
                const r = guilds.joinGuild(gn, m.jid);
                if (!r.success) console.error('joinGuild', m.name, r.message);
            }
        }
    }
}

// roster helper: jids like mp1@, mp2@… so test rows never collide with real users
function makeRoster(specs) {
    return specs.map((s, i) => ({
        jid: `${s.jid}@s.whatsapp.net`,
        name: s.name,
        guildId: s.guild, guildName: s.guild,
        classId: s.class || 'FIGHTER',
        spriteIndex: s.sprite ?? (i % 3),
    }));
}

// ── create + start a war with the roster (real map/state pipeline) ──
async function startWar(roster, { hostGroupId = 'mpsim@g.us', deadWorld = 'ember' } = {}) {
    const state = require('../core/rpg/guildWar/state');
    const created = await state.createEvent({ type: 'normal', hostGroupId, initiatedBy: 'owner@s.whatsapp.net' });
    for (const p of roster) {
        const ok = await state.registerPlayer(created.event.eventId, p);
        if (!ok) throw new Error('register failed ' + p.jid);
    }
    const started = await state.startEvent(created.event.eventId, { deadWorld });
    if (!started.ok) throw new Error('start failed: ' + started.reason);
    return started.event; // full doc
}

// ── image saving from recorded sock payloads ──
function saveImages(sock, tag, manifest) {
    fs.mkdirSync(OUT, { recursive: true });
    let n = 0;
    for (const [i, s] of sock.sent.entries()) {
        if (!s.payload || !s.payload.image) continue;
        const who = String(s.to).split('@')[0];
        const file = `${OUT}/${tag}_${who}_${String(i).padStart(3, '0')}.png`;
        const buf = Buffer.isBuffer(s.payload.image) ? s.payload.image : Buffer.from(s.payload.image);
        fs.writeFileSync(file, buf);
        manifest.push({ file, to: s.to, caption: (s.payload.caption || '').slice(0, 220).replace(/\n+/g, ' | ') });
        n++;
    }
    return n;
}

function summarizeSent(sock, jid, limit = 14) {
    return sock.to(jid).slice(-limit).map((s) => {
        const p = s.payload || {};
        const kind = p.image ? '[IMG]' : '[txt]';
        const body = (p.caption || p.text || '').replace(/\n+/g, ' ⏎ ').slice(0, 110);
        return `  → ${kind} ${body}`;
    });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { connectDB, overlaySprites, restoreSprites, makeSock, dm, seedIdentities, makeRoster, startWar, saveImages, summarizeSent, sleep, OUT, REPO };
