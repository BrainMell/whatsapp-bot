'use strict';

// ─── NATIVE LIST MENU (experiment, 2026-11-01) ──────────────────────────────
// Owner ask: keep the classic Joker menu (banner image + identity) but replace
// the TEXT category grid with WhatsApp's NATIVE popup list: tap → sheet of
// categories → tap a category → its command list appears. Classic .j menu is
// NOT touched; .j menu native = banner image (same asset/pipeline) + the list.
//
// Why hand-built: Baileys 7.0.0-rc14 ships NO listMessage/sections sugar at
// all (grep of lib/Utils/messages.js: zero hits). The only owner-confirmed
// rendering path for interactive payloads in this codebase is protoLab.js
// relayInteractive: generateWAMessageFromContent({ interactiveMessage }) +
// relayMessage with biz/native_flow additionalNodes (v=9). We reuse that exact
// pattern with a `single_select` button — WhatsApp's current native list sheet.
//
// Limits respected: row title ≤24 chars, row description ≤72, button label
// ≤20, section title ≤24, header ≤60, body ≤1024, footer ≤60, and a
// defensive 10-rows-per-section cap (official Cloud API hard cap; consumer
// clients often scroll more, but truncation would silently hide categories).
// 16 visible categories → 2 pages of 8 + nav rows.

const { randomUUID } = require('crypto');
const {
    generateWAMessageFromContent,
} = require('@whiskeysockets/baileys');
const COMMAND_REGISTRY = require('../utils/commandRegistry');

const ROW_PREFIX = 'jmenu:';
const FLOW_NAME = 'single_select';

// Keep in sync with CATEGORY_EMOJIS in core/engine.js (not exported there).
const CAT_EMOJIS = {
    SUPPORT: '🛠️',
    STICKERS: '🎨',
    SEARCH: '🔍',
    ADMIN: '⚙️',
    GUILDS: '🏰',
    RPG: '⚔️',
    GROUP: '👥',
    PROGRESSION: '📈',
    ECONOMY: '💰',
    GAMBLING: '🎰',
    CARDS: '🃏',
    FUN: '🎡',
    GAMES: '🎮',
    ANIME: '🎎',
    INFO: 'ℹ️',
    INTERACTIONS: '💞',
    MODERATOR: '🛡️',
    'PHANTOM THIEF': '🎭',
    'USER INFO': '👤',
    PowerScaling: '⚖️',
};

function makeId() {
    return randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase();
}

function getUserJid(sock, fallback) {
    return sock?.user?.id || sock?.authState?.creds?.me?.id || fallback;
}

function visibleCategories() {
    return Object.keys(COMMAND_REGISTRY).filter((c) => c !== 'MODERATOR');
}

// One row per category. Pagination is NAV-AWARE: each page's category
// capacity shrinks by however many nav rows that page will carry, so a
// section can NEVER exceed the 10-row hard cap no matter how many
// categories exist (registry is dynamic — other agents keep adding cats).
function buildPages() {
    const cats = visibleCategories();
    const rows = cats.map((cat) => {
        const n = (COMMAND_REGISTRY[cat] || []).length;
        const emoji = CAT_EMOJIS[cat] || '📂';
        return {
            id: ROW_PREFIX + String(cat).toUpperCase(),
            title: `${emoji} ${cat}`.slice(0, 24),
            description: `${n} command${n === 1 ? '' : 's'} — tap to open`.slice(0, 72),
        };
    });
    const pages = [];
    let i = 0;
    while (i < rows.length) {
        // nav rows this page will carry: text-menu escape (always) +
        // previous-page row (any page after the first)
        let cap = 10 - 1 - (i > 0 ? 1 : 0);
        // more-row is needed when more categories remain than fit here
        if (rows.length - i > cap) cap -= 1;
        pages.push(rows.slice(i, i + cap));
        i += cap;
    }
    return pages;
}

function listSections(pageIdx) {
    const pages = buildPages();
    const idx = Math.max(0, Math.min(pageIdx || 0, pages.length - 1));
    const rows = pages[idx].slice();
    const nav = [];
    if (idx < pages.length - 1) {
        nav.push({
            id: ROW_PREFIX + '__page' + (idx + 2),
            title: '▶ More categories',
            description: 'Open the rest of the list',
        });
    }
    if (idx > 0) {
        nav.push({
            id: ROW_PREFIX + '__page' + idx,
            title: '◀ Previous categories',
            description: 'Back to the first page',
        });
    }
    nav.push({
        id: ROW_PREFIX + '__text',
        title: '🏠 Classic text menu',
        description: 'The original .j menu, unchanged',
    });
    return [
        {
            title: `📂 Categories (${idx + 1}/${pages.length})`.slice(0, 24),
            rows: rows.concat(nav).map((r) => ({
                id: String(r.id),
                title: String(r.title).slice(0, 24),
                description: String(r.description || '').slice(0, 72),
            })),
        },
    ];
}

function singleSelectParams(sections) {
    return JSON.stringify({
        status: true,
        title: '📂 Open categories',
        sections,
    });
}

function listEnvelope(opts = {}) {
    const sections = listSections(opts.page || 0);
    return {
        header: {
            title: String(opts.headerTitle || '🃏 JOKER MENU').slice(0, 60),
            hasMediaAttachment: false,
        },
        body: {
            text: String(
                opts.bodyText ||
                    'Pick a category — its command list opens right here, no typing needed.',
            ).slice(0, 1024),
        },
        footer: {
            text: String(
                opts.footerText || 'Native list experiment · classic: .j menu',
            ).slice(0, 60),
        },
        nativeFlowMessage: {
            buttons: [
                {
                    name: FLOW_NAME,
                    buttonParamsJson: singleSelectParams(sections),
                },
            ],
            messageParamsJson: '',
        },
    };
}

// The PROVEN relay pattern (protoLab.relayInteractive, owner-confirmed render).
async function sendListMenu(sock, chatId, senderJid, opts = {}) {
    const interactive = listEnvelope(opts);
    const generated = generateWAMessageFromContent(
        chatId,
        { interactiveMessage: interactive },
        {
            userJid: getUserJid(sock, senderJid),
            messageId: makeId(),
        },
    );
    const additionalNodes = [
        {
            tag: 'biz',
            attrs: {},
            content: [
                {
                    tag: 'interactive',
                    attrs: { type: 'native_flow', v: '1' },
                    content: [
                        {
                            tag: 'native_flow',
                            attrs: { v: '9', name: FLOW_NAME },
                        },
                    ],
                },
            ],
        },
    ];
    if (!String(chatId).endsWith('@g.us')) {
        additionalNodes.push({ tag: 'bot', attrs: { biz_bot: '1' } });
    }
    await sock.relayMessage(chatId, generated.message, {
        messageId: generated.key.id,
        additionalNodes,
    });
    console.log(
        `[LISTMENU] SENT page=${(opts.page || 0) + 1} chat=${String(chatId).split('@')[0]}`,
    );
    return generated;
}

// Extract a jmenu:* row id from an incoming tap. Handles both shapes:
//  - modern:  interactiveResponseMessage.nativeFlowResponseMessage.paramsJson (JSON with .id)
//  - legacy:  listResponseMessage.singleSelectReply.selectedRowId
// Returns null for anything that is not ours (never intercepts other flows).
function extractMenuRowId(m) {
    try {
        const mm = (m && m.message) || {};
        const irm = mm.interactiveResponseMessage;
        if (irm && irm.nativeFlowResponseMessage) {
            let j = null;
            try {
                j = JSON.parse(irm.nativeFlowResponseMessage.paramsJson || '{}');
            } catch (_e) {
                j = null;
            }
            const id = j && (j.id || j.selectedId);
            if (typeof id === 'string' && id.startsWith(ROW_PREFIX)) return id;
            return null;
        }
        const lrm = mm.listResponseMessage;
        if (lrm) {
            const id =
                (lrm.singleSelectReply && lrm.singleSelectReply.selectedRowId) ||
                lrm.rowId;
            if (typeof id === 'string' && id.startsWith(ROW_PREFIX)) return id;
        }
    } catch (_e) {
        /* never throw into the pipeline */
    }
    return null;
}

// True for ANY incoming tap/response payload (ours or not). Used ONLY as an
// antibot exemption: a human tapping a list must never be fingerprinted as a
// bot just because interactive responses score 1.5 (strict threshold = 1.0).
function isMenuTap(m) {
    const mm = (m && m.message) || {};
    return !!(
        mm.interactiveResponseMessage ||
        mm.listResponseMessage ||
        (mm.extendedTextMessage &&
            typeof mm.extendedTextMessage.text === 'string' &&
            mm.extendedTextMessage.text.startsWith(ROW_PREFIX))
    );
}

async function handleMenuTap(sock, chatId, senderJid, rowId, ctx = {}) {
    console.log(
        `[LISTMENU] TAP rowId=${rowId} by=${String(senderJid || '').split('@')[0]} chat=${String(chatId).split('@')[0]}`,
    );
    const key = String(rowId).slice(ROW_PREFIX.length).toUpperCase();
    const sendBotMenu = ctx.sendBotMenu;

    if (key === '__TEXT') {
        if (typeof sendBotMenu === 'function') {
            return sendBotMenu(sock, chatId, ctx.botMarker || '', [], senderJid);
        }
        return sock.sendMessage(chatId, {
            text: `Classic menu: ${(ctx.prefix || '.j')} menu`,
        });
    }

    const pageMatch = /^__PAGE(\d+)$/.exec(key);
    if (pageMatch) {
        return sendListMenu(sock, chatId, senderJid, {
            page: Math.max(1, parseInt(pageMatch[1], 10)) - 1,
            headerTitle: ctx.headerTitle,
            bodyText: ctx.bodyText,
            footerText: ctx.footerText,
        });
    }

    const cats = visibleCategories().map((c) => String(c).toUpperCase());
    if (cats.includes(key) && typeof sendBotMenu === 'function') {
        // Reuse the EXACT renderer the typed command uses (.j menu games) so
        // the side-by-side comparison is apples-to-apples.
        return sendBotMenu(sock, chatId, ctx.botMarker || '', [key.toLowerCase()], senderJid);
    }

    // Unknown row id → self-heal by re-opening page 1.
    return sendListMenu(sock, chatId, senderJid, { page: 0 });
}

function _diag() {
    const pages = buildPages();
    const perPage = pages.map((_, i) =>
        listSections(i).map((s) => ({
            title: s.title,
            rows: s.rows.map((r) => ({
                id: r.id,
                t: r.title.length,
                d: r.description.length,
            })),
        })),
    );
    const all = perPage.flat().flatMap((s) => s.rows);
    const catIds = all.map((r) => r.id).filter((id) => !id.includes(':__'));
    return {
        categories: visibleCategories(),
        pageSize: pages.map((p) => p.length),
        perPage,
        rows: all,
        maxTitle: Math.max(...all.map((r) => r.t)),
        maxDesc: Math.max(...all.map((r) => r.d)),
        maxRowsPerSection: Math.max(
            ...perPage.flat().map((s) => s.rows.length),
        ),
        catOnce: new Set(catIds).size === catIds.length,
        catCount: catIds.length,
    };
}

console.log(
    `[LISTMENU] ready v1 · ${visibleCategories().length} categories · flow=${FLOW_NAME}`,
);

module.exports = {
    ROW_PREFIX,
    FLOW_NAME,
    sendListMenu,
    handleMenuTap,
    extractMenuRowId,
    isMenuTap,
    listSections,
    _diag,
};
