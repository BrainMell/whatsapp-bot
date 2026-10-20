#!/usr/bin/env node
// 🏗️ BASE WIRING QA (2026-10-20) — run ON-BOX inside the bot dir:
//   node scripts/base_wiring_qa.js
// Owner brief: ".j base <index> … zoomed in … wire it all up" — close-up cards
// for every structure, Clash market, hunting camp, pond angles, summons
// barracks, guild hall.
//
// Safety: prod DB touched ONLY by the QA jid's own records (Base doc seeded
// for the probe, DELETED in cleanup; economy reads are per-jid).
'use strict';
const fs = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0, SKIP = 0;
function check(name, cond, extra) {
    if (cond) { PASS++; console.log(`  ✅ ${name}`); }
    else { FAIL++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}
function skip(name, why) { SKIP++; console.log(`  ⏭️  ${name} — ${why}`); }

async function connectDB() {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
        for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
            if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
        }
    }
    const mongoose = require('mongoose');
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mellow';
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    console.log(`[qa] mongo connected: ${mongoose.connection.name}`);
}

const QA_JID = 'qa-base@s.whatsapp.net';

(async () => {
    await connectDB();
    const BOT = process.env.BOT_DIR || path.join(__dirname, '..');
    const renderer = require(path.join(BOT, 'core', 'rpg', 'homesteadBaseRenderer'));
    const baseBuilder = require(path.join(BOT, 'core', 'rpg', 'baseBuilder'));
    const Base = require(path.join(BOT, 'core', 'models', 'Base'));
    const economy = require(path.join(BOT, 'core', 'rpg', 'economy'));

    // ── §1 structures catalog ──
    console.log('\n── §1 structures catalog ──');
    const S = renderer.structures().structures;
    check('9 structure types', S.length === 9, `got ${S.length}: ${S.map((s) => s.id).join(',')}`);
    for (const t of ['market', 'barracks']) {
        const d = renderer.structDef(t);
        check(`${t}: 3 levels w/ prices`, !!d && d.levels.length === 3 && d.levels.every((l) => l.price > 0 && l.sprite && l.name));
    }
    check('fixed four intact', ['house', 'mines', 'pond', 'hunting'].every((t) => renderer.structDef(t)?.fixed));

    // ── §2 pond variety (the "angles should be different" fix) ──
    console.log('\n── §2 pond generation variety ──');
    const aspects = new Set(), nooks = new Set();
    let pierOk = 0;
    for (const owner of ['QAa', 'QAb', 'QAc', 'QAd', 'QAe', 'QAf']) {
        const world = renderer.buildWorld({ owner, structures: renderer.LAYOUT ? [
            { type: 'house', level: 1, x: renderer.LAYOUT.house.x, y: renderer.LAYOUT.house.y },
            { type: 'mines', level: 1, x: renderer.LAYOUT.mines.x, y: renderer.LAYOUT.mines.y },
            { type: 'pond', level: 1, x: renderer.LAYOUT.pond.x, y: renderer.LAYOUT.pond.y },
            { type: 'hunting', level: 1, x: renderer.LAYOUT.hunting.x, y: renderer.LAYOUT.hunting.y },
        ] : [], freePlots: [] }, null);
        const w = world.w;
        const lakes = [];
        for (let r = 0; r < w.rows; r++) for (let c = 0; c < w.cols; c++) {
            const k = w.cell[r][c];
            if (k && k.lake) lakes.push([c, r]);
        }
        if (!lakes.length) { continue; }
        const cs = lakes.map((l) => l[0]), rs = lakes.map((l) => l[1]);
        const bw = Math.max(...cs) - Math.min(...cs) + 1, bh = Math.max(...rs) - Math.min(...rs) + 1;
        aspects.add(Math.round((bw / bh) * 20) / 20);
        nooks.add(`${Math.min(...cs)},${Math.min(...rs)}`);
        // pier line must be water (pond L1-L4 guarantee)
        const P = renderer.LAYOUT.pond;
        let ok = true;
        for (let i = 0; i <= 4; i++) {
            const kk = w.cell[P.y + P.fh - 1 + 15]?.[P.x + P.fw - 1 + i + 15];
            if (!kk || !kk.water) ok = false;
        }
        if (ok) pierOk++;
    }
    check('lake shapes vary across seeds (≥3 distinct aspects)', aspects.size >= 3, `aspects=${[...aspects].join(', ')}`);
    check('lake nooks vary (≥2 positions)', nooks.size >= 2, `nooks=${nooks.size}`);
    check('pier line is water in every world (6/6)', pierOk === 6, `${pierOk}/6`);

    // ── §3 close-up cards render (all viewable types) ──
    console.log('\n── §3 close-up card bakes ──');
    const st = [
        { type: 'house', level: 2, x: renderer.LAYOUT.house.x, y: renderer.LAYOUT.house.y },
        { type: 'mines', level: 2, x: renderer.LAYOUT.mines.x, y: renderer.LAYOUT.mines.y },
        { type: 'pond', level: 2, x: renderer.LAYOUT.pond.x, y: renderer.LAYOUT.pond.y },
        { type: 'hunting', level: 1, x: renderer.LAYOUT.hunting.x, y: renderer.LAYOUT.hunting.y },
        { type: 'market', level: 1, x: 8, y: 1 },
        { type: 'barracks', level: 2, x: 13, y: 7 },
    ];
    const cardState = { owner: 'QA Base Owner', structures: st, freePlots: [] };
    for (const t of ['mines', 'pond', 'hunting', 'market', 'barracks']) {
        try {
            const out = await renderer.renderStructureCard(cardState, { type: t, index: st.findIndex((s) => s.type === t) });
            const jpeg = out && out.buffer && out.buffer[0] === 0xFF && out.buffer[1] === 0xD8;
            check(`card ${t} renders (jpeg, ${out && out.buffer ? Math.round(out.buffer.length / 1024) : '?'}KB)`, !!out && out.contentType === 'image/jpeg' && jpeg && out.buffer.length > 60000);
        } catch (e) {
            check(`card ${t} renders`, false, e.message);
        }
    }

    // ── §4 enterStructure wiring (mock sock, QA base record) ──
    console.log('\n── §4 enterStructure wiring ──');
    await Base.deleteOne({ userId: QA_JID });
    const rec = await baseBuilder.loadBase(QA_JID);           // seeds the 4 fixed structures
    await Base.updateOne({ userId: QA_JID }, { $push: { structures: [
        { uid: 'qa-mkt', type: 'market', level: 1, x: 8, y: 1 },
        { uid: 'qa-brk', type: 'barracks', level: 2, x: 13, y: 7 },
    ] } });
    const rec2 = await baseBuilder.loadBase(QA_JID);

    const mkCtx = () => {
        const sent = [], replies = [];
        return {
            sent, replies,
            ctx: {
                sock: { sendMessage: async (jid, content) => { sent.push({ jid, content }); return { key: { id: `M${sent.length}` } }; } },
                chatId: 'qa:base@chat',
                reply: async (t) => { replies.push(String(t)); return { key: { id: `R${replies.length}` } }; },
                senderJid: QA_JID,
                prefix: '.j',
                m: null,
                isMod: false,
                text: '.j base',
            },
        };
    };
    const lastMedia = (t) => t.sent.filter((s) => s.content && (s.content.image || s.content.video)).pop();

    // mines (#2): card + mining stats caption
    {
        const { ctx, sent, replies } = mkCtx();
        await baseBuilder.enterStructure(ctx, '2');
        const m = lastMedia({ sent });
        check('mines: image sent', !!m && !!m.content.image, sent.length + ' sends');
        const cap = String((m && m.content.caption) || '');
        check('mines: caption has Mining Lv + .j mine', /Mining Lv\./.test(cap) && /\.j mine/.test(cap), cap.slice(0, 90));
        check('mines: no text fallback used', replies.length === 0, JSON.stringify(replies[0] || '').slice(0, 60));
    }
    // name routing: 'mines' resolves the same structure
    {
        const { ctx, sent } = mkCtx();
        await baseBuilder.enterStructure(ctx, 'mines');
        const m = lastMedia({ sent });
        check('`.j base mines` (by name) → mines card', !!m && /Mines/.test(String((m && m.content.caption) || '')));
    }
    // hunting (#4): hunt counter line
    {
        const { ctx, sent } = mkCtx();
        await baseBuilder.enterStructure(ctx, '4');
        const m = lastMedia({ sent });
        check('hunting: hunts-today counter + .j hunt', /Hunts today: \*0\/10\*/.test(String((m && m.content.caption) || '')) && /\.j hunt/.test(String((m && m.content.caption) || '')));
    }
    // market (#5): shop CTAs
    {
        const { ctx, sent } = mkCtx();
        await baseBuilder.enterStructure(ctx, '5');
        const m = lastMedia({ sent });
        check('market: .j shop + .j itemmarket CTAs', /\.j shop/.test(String((m && m.content.caption) || '')) && /\.j itemmarket/.test(String((m && m.content.caption) || '')));
    }
    // barracks (#6): card + summons roster follow-up
    {
        const { ctx, sent, replies } = mkCtx();
        await baseBuilder.enterStructure(ctx, '6');
        const m = lastMedia({ sent });
        check('barracks: card sent', !!m && /Barracks|Summons/i.test(String((m && m.content.caption) || '')));
        check('barracks: summons roster opened after the card', sent.length + replies.length >= 2, `${sent.length} sends + ${replies.length} replies`);
    }
    // guildhall RETIRED (owner 2026-10-20: undo the guild hall close-up) — the
    // catalog no longer has it and loadBase silently strips any legacy record
    check('guildhall retired from the catalog', !renderer.structDef('guildhall'));

    // ── cleanup ──
    await Base.deleteOne({ userId: QA_JID }).catch(() => {});
    console.log('\n[cleanup] QA base record removed');

    console.log(`\n═══ RESULT: ${PASS} passed · ${FAIL} failed · ${SKIP} skipped ═══`);
    process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error('[qa] FATAL', e); process.exit(2); });
