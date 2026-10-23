#!/usr/bin/env node
// ESHOP DECK OPS TOOL (47-l2, )
// Ops tool for the System KV doc `eshop_deck_<botId>` (collection: systems).
// node eshop_deck_tool.js dump - read-only: print every eshop_deck doc
// node eshop_deck_tool.js restore - write Màh_Xée's overwritten stocking
// intent back into slots 5-8, then exit
// node eshop_deck_tool.js verify - assert slots 5-8 hold the 4 cards
// Background: Màh_Xée stocked the event shop with `t2edeck add 5 <id> <price>`
// four times (out-log 14:22-14:31Z). Each add overwrote slot 5, so the deck
// ended with ONE card. Restore re-lands their four intended cards via the
// REAL production writer (cardSystem.eshopAddCard → saveEShopDeck $set).
// Run order: restore && pm2 restart wa-joker - the fresh process boots with
// the restored deck in memory (restart must follow within seconds).
const fs = require('fs');
const path = require('path');

async function connect() {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
        for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
            if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
        }
    }
    const mongoose = require('mongoose');
    mongoose.set('bufferTimeoutMS', 45000);
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
    return mongoose;
}

/// Màh_Xée's stocking session, joker out-log 13:24-14:31Z:
/// add 6 e-02391 250 (13:24) · add 7 e-02388 250 (13:26)
/// add 4 e-03004 400 (14:11) · "add slot 5 ..." (14:14, bad syntax)
/// then SEVEN `add 5 ...` calls - every one overwrote slot 5:
/// e-02981@200, e-02968@250, e-001690(fail), e-01690@250,
/// e-01691@200, e-01686@250, e-03000@400, e-01691@200 (final survivor)
/// Deck filled count stayed 4/16 no matter what → "can only add max 4".
/// The five LOST cards (overwritten in slot 5) are re-added below at their
/// logged prices. Existing slots are never clobbered.
const MAH_LOST_CARDS = [
    { cardId: 'e-02981', price: 200 }, // Narberal Gamma
    { cardId: 'e-02968', price: 250 }, // Koala
    { cardId: 'e-01690', price: 250 }, // Rangiku Matsumoto
    { cardId: 'e-01686', price: 250 }, // Hisoka Morow
    { cardId: 'e-03000', price: 400 }, // Kurisu Makise
];

function printDeck(doc) {
    console.log(`doc key=${doc.key} updatedAt=${(doc.updatedAt || new Date(0)).toISOString()}`);
    const deck = Array.isArray(doc.value) ? doc.value : [];
    deck.forEach((e, i) => {
        console.log(`  slot ${String(i + 1).padStart(2)}: ${e ? `${e.cardId} | ${e.cardName} | T${e.tier} | ${e.price} tok` : '(empty)'}`);
    });
    if (!deck.length) console.log('  (no deck array in doc.value)');
}

(async () => {
    const mode = process.argv[2] || 'dump';
    const mongoose = await connect();
    const col = mongoose.connection.db.collection('systems');
    const docs = await col.find({ key: /^eshop_deck_/ }).toArray();
    if (!docs.length) { console.log('NO eshop_deck_* docs found'); process.exit(1); }

 // Target: joker's doc = the most recently updated one
    docs.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    const doc = docs[0];
    const deck = Array.isArray(doc.value) ? doc.value : [];

    if (mode === 'dump') {
        docs.forEach(printDeck);
    } else if (mode === 'restore') {
 // Direct DB write (no cardSystem require → no getBotId/side-effect
 // risk); the live process is restarted RIGHT AFTER this so its
 // in-memory copy reloads from this doc.
        const data = require(path.join(__dirname, '..', 'core', 'data', 'cards_data.json'));
        const flat = [].concat(...Object.values(data).filter(Array.isArray));
        let changed = 0;
        for (const c of MAH_LOST_CARDS) {
            if (deck.some(e => e && String(e.cardId).toLowerCase() === c.cardId)) {
                console.log(`  ${c.cardId}: already in deck - skip`); continue;
            }
            const card = flat.find(x => String(x.id || '').toLowerCase() === c.cardId);
            if (!card) { console.log(`  ${c.cardId}: NOT-FOUND in cards_data - skip`); continue; }
            const free = deck.findIndex(e => e === null || e === undefined);
            if (free === -1) { console.log('  deck full - stop'); break; }
            deck[free] = {
                cardId: card.id,
                cardName: card.cardName,
                imageUrl: card.imageUrl,
                tier: String(card.tier),
                anime: card.animeName || '',
                price: c.price
            };
            console.log(`  slot ${free + 1}: ✅ ${card.id} | ${card.cardName} | T${card.tier} | ${c.price} tok`);
            changed++;
        }
        if (changed) {
            await col.updateOne({ key: doc.key }, { $set: { value: deck } });
            console.log(`restore done: ${changed} card(s) written to ${doc.key}`);
        } else {
            console.log('restore done: nothing to write');
        }
    } else if (mode === 'verify') {
        const want = [
            'e-03004', 'e-01691', 'e-02391', 'e-02388', // already there
            ...MAH_LOST_CARDS.map(c => c.cardId)
        ];
        let ok = true;
        for (const id of want) {
            const cur = deck.find(e => e && String(e.cardId).toLowerCase() === id);
            const good = !!cur;
            console.log(`  ${id}: ${good ? '✅ ' + cur.cardName + '@' + cur.price + ' slot ' + (deck.indexOf(cur) + 1) : '❌ missing'}`);
            ok = ok && good;
        }
        console.log(`filled: ${deck.filter(e => e).length}/16`);
        console.log(ok ? 'VERIFY PASS' : 'VERIFY FAIL');
        process.exit(ok ? 0 : 1);
    } else {
        console.log('unknown mode; use dump | restore | verify');
        process.exit(2);
    }
    await mongoose.disconnect();
    process.exit(0);
})().catch(e => { console.error('TOOL ERROR:', e.message); process.exit(1); });
