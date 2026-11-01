'use strict';

// ─── MENU LAB (experiment, 2026-11-01) ─────────────────────────────────────
// Owner: "let's experiment with different methods and menu types".
// `.j menu lab` lists them, `.j menu n3` … `n9` send one. Every variant uses
// the same `jmenu:<CATEGORY>` ids as listMenu.js, so taps on the button-style
// variants already route through the existing tap handler (category opens).
//
//  n3  image header + quick-reply buttons (≤10)      — renders on every platform
//  n4  carousel: one image card per 3 categories      — swipeable, quick replies
//  n5  image header + single_select list (no wrap)    — the list-with-photo test
//  n6  legacy buttonsMessage (image header, 3 btns)   — pre-native-flow format
//  n7  legacy listMessage (SINGLE_SELECT)             — pre-native-flow list
//  n8  poll — categories as options                   — works everywhere; votes aren't routed
//  n9  mixed native flow: image + url + quick replies — what the card can carry
//
// All builders swallow errors into a returned {ok:false,error} so a variant
// that WhatsApp refuses can never take the command down.

const fs = require('fs');
const { randomUUID } = require('crypto');
const {
    generateWAMessageFromContent,
    prepareWAMessageMedia,
} = require('@whiskeysockets/baileys');
const COMMAND_REGISTRY = require('../utils/commandRegistry');
const listMenu = require('./listMenu');

const P = listMenu.ROW_PREFIX;
const makeId = () => randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase();
const cats = () => Object.keys(COMMAND_REGISTRY).filter((c) => c !== 'MODERATOR');
const EMOJI = {
    SUPPORT: '🛠️', STICKERS: '🎨', SEARCH: '🔍', ADMIN: '⚙️', GUILDS: '🏰', RPG: '⚔️', GROUP: '👥',
    PROGRESSION: '📈', ECONOMY: '💰', GAMBLING: '🎰', CARDS: '🃏', FUN: '🎡', GAMES: '🎮', ANIME: '🎎',
    INFO: 'ℹ️', INTERACTIONS: '💞', 'PHANTOM THIEF': '🎭', 'USER INFO': '👤', PowerScaling: '⚖️',
};
const label = (c) => `${EMOJI[c] || '📂'} ${c}`.slice(0, 24);
const qr = (c) => ({
    name: 'quick_reply',
    buttonParamsJson: JSON.stringify({ display_text: label(c), id: P + String(c).toUpperCase() }),
});
const me = (sock, jid) => sock?.user?.id || sock?.authState?.creds?.me?.id || jid;

async function uploadImage(sock, imagePath) {
    if (!imagePath || !fs.existsSync(imagePath)) return null;
    const media = await prepareWAMessageMedia(
        { image: fs.readFileSync(imagePath) },
        { upload: sock.waUploadToServer },
    );
    return media && media.imageMessage ? media.imageMessage : null;
}

function nativeNodes(chatId, flowName = 'mixed') {
    const nodes = [{
        tag: 'biz', attrs: {},
        content: [{ tag: 'interactive', attrs: { type: 'native_flow', v: '1' },
            content: [{ tag: 'native_flow', attrs: { v: '9', name: flowName } }] }],
    }];
    if (!String(chatId).endsWith('@g.us')) nodes.push({ tag: 'bot', attrs: { biz_bot: '1' } });
    return nodes;
}

async function relayInteractive(sock, chatId, senderJid, interactive, nodes) {
    const gen = generateWAMessageFromContent(chatId, {
        viewOnceMessage: { message: {
            messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} },
            interactiveMessage: interactive,
        } },
    }, { userJid: me(sock, senderJid), messageId: makeId() });
    await sock.relayMessage(chatId, gen.message, { messageId: gen.key.id, additionalNodes: nodes });
    return gen;
}

const VARIANTS = {
    n3: {
        desc: 'image header + quick-reply buttons (10 max) — cross-platform',
        async send(sock, chatId, senderJid, o) {
            const img = await uploadImage(sock, o.imagePath);
            const list = cats().slice(0, 9);
            const buttons = list.map(qr);
            buttons.push({ name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '🏠 Classic menu', id: P + '__text' }) });
            return relayInteractive(sock, chatId, senderJid, {
                header: img ? { title: o.title, hasMediaAttachment: true, imageMessage: img } : { title: o.title, hasMediaAttachment: false },
                body: { text: o.body },
                footer: { text: 'n3 · image + quick replies' },
                nativeFlowMessage: { buttons, messageParamsJson: '' },
            }, nativeNodes(chatId, 'quick_reply'));
        },
    },
    n4: {
        desc: 'carousel — swipe through image cards, 3 categories each',
        async send(sock, chatId, senderJid, o) {
            const img = await uploadImage(sock, o.imagePath);
            const all = cats();
            const cards = [];
            for (let i = 0; i < all.length && cards.length < 8; i += 3) {
                const group = all.slice(i, i + 3);
                cards.push({
                    header: img ? { hasMediaAttachment: true, imageMessage: img } : { hasMediaAttachment: false },
                    body: { text: group.map(label).join('\n') },
                    footer: { text: `card ${cards.length + 1}` },
                    nativeFlowMessage: { buttons: group.map(qr), messageParamsJson: '' },
                });
            }
            return relayInteractive(sock, chatId, senderJid, {
                body: { text: o.body },
                footer: { text: 'n4 · carousel' },
                carouselMessage: { cards, messageVersion: 1 },
            }, nativeNodes(chatId, 'quick_reply'));
        },
    },
    n5: {
        desc: 'image header + single_select list (the "list with a photo" test)',
        async send(sock, chatId, senderJid, o) {
            const img = await uploadImage(sock, o.imagePath);
            const env = listMenu.listEnvelope({ headerTitle: o.title, bodyText: o.body, footerText: 'n5 · photo + list', page: 0 });
            if (img) { env.header.hasMediaAttachment = true; env.header.imageMessage = img; }
            return relayInteractive(sock, chatId, senderJid, env, nativeNodes(chatId, 'single_select'));
        },
    },
    n6: {
        desc: 'legacy buttonsMessage — image header, 3 buttons',
        async send(sock, chatId, senderJid, o) {
            const img = await uploadImage(sock, o.imagePath);
            const top = cats().slice(0, 3);
            const content = { buttonsMessage: {
                contentText: o.body, footerText: 'n6 · legacy buttons',
                headerType: img ? 4 : 1,
                ...(img ? { imageMessage: img } : { text: o.title }),
                buttons: top.map((c) => ({ buttonId: P + String(c).toUpperCase(), buttonText: { displayText: label(c) }, type: 1 })),
            } };
            const gen = generateWAMessageFromContent(chatId, content, { userJid: me(sock, senderJid), messageId: makeId() });
            await sock.relayMessage(chatId, gen.message, { messageId: gen.key.id });
            return gen;
        },
    },
    n7: {
        desc: 'legacy listMessage — the old SINGLE_SELECT list',
        async send(sock, chatId, senderJid, o) {
            const rows = cats().slice(0, 10).map((c) => ({
                title: label(c), description: `${(COMMAND_REGISTRY[c] || []).length} commands`, rowId: P + String(c).toUpperCase(),
            }));
            const gen = generateWAMessageFromContent(chatId, { listMessage: {
                title: o.title, description: o.body, footerText: 'n7 · legacy list', buttonText: 'Open categories',
                listType: 1, sections: [{ title: 'Categories', rows }],
            } }, { userJid: me(sock, senderJid), messageId: makeId() });
            const nodes = [{ tag: 'biz', attrs: {}, content: [{ tag: 'list', attrs: { v: '2', type: 'product_list' } }] }];
            if (!String(chatId).endsWith('@g.us')) nodes.push({ tag: 'bot', attrs: { biz_bot: '1' } });
            await sock.relayMessage(chatId, gen.message, { messageId: gen.key.id, additionalNodes: nodes });
            return gen;
        },
    },
    n8: {
        desc: 'poll — categories as options (works everywhere, votes not routed)',
        async send(sock, chatId, senderJid, o) {
            return sock.sendMessage(chatId, { poll: { name: `${o.title} — pick a category`, values: cats().slice(0, 12).map(label), selectableCount: 1 } });
        },
    },
    n9: {
        desc: 'mixed card — image + URL button + quick replies',
        async send(sock, chatId, senderJid, o) {
            const img = await uploadImage(sock, o.imagePath);
            const buttons = [
                ...cats().slice(0, 3).map(qr),
                { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '🌐 Website', url: 'https://example.com', merchant_url: 'https://example.com' }) },
            ];
            return relayInteractive(sock, chatId, senderJid, {
                header: img ? { title: o.title, hasMediaAttachment: true, imageMessage: img } : { title: o.title, hasMediaAttachment: false },
                body: { text: o.body }, footer: { text: 'n9 · mixed buttons' },
                nativeFlowMessage: { buttons, messageParamsJson: '' },
            }, nativeNodes(chatId, 'mixed'));
        },
    },
};

function labIndex(prefix) {
    return `🧪 *MENU LAB*\n\nTry each, tell me which render + feel right:\n\n` +
        `➤ \`${prefix} menu n1\` / \`n2\` — native list (the one that worked)\n` +
        Object.entries(VARIANTS).map(([k, v]) => `➤ \`${prefix} menu ${k}\` — ${v.desc}`).join('\n') +
        `\n\n_Taps on the button variants open the category like the list does._`;
}

async function sendVariant(sock, chatId, senderJid, key, opts = {}) {
    const v = VARIANTS[key];
    if (!v) return { ok: false, error: 'unknown variant' };
    try {
        await v.send(sock, chatId, senderJid, {
            imagePath: opts.imagePath,
            title: opts.title || '🃏 JOKER MENU',
            body: opts.body || 'Pick a category — it opens right here, no typing needed.',
        });
        console.log(`[MENULAB] SENT ${key} chat=${String(chatId).split('@')[0]}`);
        return { ok: true };
    } catch (e) {
        console.error(`[MENULAB] ${key} failed:`, e.message);
        return { ok: false, error: e.message };
    }
}

module.exports = { VARIANTS, labIndex, sendVariant };
