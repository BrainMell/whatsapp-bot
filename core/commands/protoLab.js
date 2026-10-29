'use strict';

// Experimental WhatsApp protocol probes for the installed Baileys build.
// This module is intentionally isolated from RPG systems. It never claims a
// Meta AI origin; rich-response probes omit isForwarded and forwardOrigin.

const { randomUUID } = require('crypto');
const { generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');

function makeId() {
    return randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase();
}

function responseData(sections) {
    return Buffer.from(JSON.stringify({
        __typename: 'GenAIUnifiedResponse',
        response_id: randomUUID(),
        sections
    })).toString('base64');
}

function htmlEnvelope(html) {
    return {
        botForwardedMessage: {
            message: {
                richResponseMessage: {
                    messageType: 1,
                    unifiedResponse: {
                        data: responseData([{
                            __typename: 'GenAIUnifiedResponseSection',
                            view_model: {
                                __typename: 'GenAISingleLayoutViewModel',
                                primitive: {
                                    __typename: 'FOAHtmlPrimitiveDemoDONOTUSE',
                                    trusted_sources: [],
                                    payload: String(html).trim()
                                }
                            }
                        }])
                    }
                }
            }
        }
    };
}

function richEnvelope(sections) {
    return {
        botForwardedMessage: {
            message: {
                richResponseMessage: {
                    messageType: 1,
                    unifiedResponse: { data: responseData(sections) }
                }
            }
        }
    };
}

function section(primitive) {
    return {
        __typename: 'GenAIUnifiedResponseSection',
        view_model: { __typename: 'GenAISingleLayoutViewModel', primitive }
    };
}

function getUserJid(sock, fallback) {
    return sock?.user?.id || sock?.authState?.creds?.me?.id || fallback;
}

async function relayContent(sock, chatId, senderJid, content, relayOptions = {}) {
    const generated = generateWAMessageFromContent(chatId, content, {
        userJid: getUserJid(sock, senderJid),
        messageId: makeId()
    });
    await sock.relayMessage(chatId, generated.message, {
        messageId: generated.key.id,
        ...relayOptions
    });
    return generated;
}

// A compatibility experiment found in community Baileys implementations:
// replay the same rich payload through MESSAGE_EDIT. This is not a trust or
// signature bypass; it only tests whether the client renders the envelope
// without the extra download-consent step.
async function replayRichAsEdit(sock, chatId, senderJid, original) {
    const editType = proto?.Message?.ProtocolMessage?.Type?.MESSAGE_EDIT;
    if (editType === undefined) {
        throw new Error('MESSAGE_EDIT enum is unavailable in this Baileys build');
    }
    const editContent = {
        botForwardedMessage: {
            message: {
                protocolMessage: {
                    key: { remoteJid: chatId, fromMe: true, id: original.key.id },
                    type: editType,
                    editedMessage: original.message
                }
            }
        }
    };
    const edit = generateWAMessageFromContent(chatId, editContent, {
        userJid: getUserJid(sock, senderJid),
        messageId: makeId()
    });
    await sock.relayMessage(chatId, edit.message, { messageId: edit.key.id });
    return edit;
}

async function sendRich(sock, chatId, senderJid, content, editReplay = true) {
    const original = await relayContent(sock, chatId, senderJid, content);
    if (editReplay) {
        try {
            await replayRichAsEdit(sock, chatId, senderJid, original);
        } catch (error) {
            console.error('[ProtoLab] Edit replay failed:', error?.stack || error);
        }
    }
    return original;
}

function dashboardHtml() {
    return [
        '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">',
        '<style>*{box-sizing:border-box}body{margin:0;padding:14px;background:#0d0c12;color:#f7f2f7;font-family:Arial,Helvetica,sans-serif}',
        '.wrap{max-width:680px;margin:auto;border:1px solid #49303d;border-radius:18px;overflow:hidden;background:#15121a}',
        '.hero{padding:24px 18px;background:linear-gradient(140deg,#401224,#17121d 72%);border-bottom:1px solid #573143}',
        '.k{font-size:10px;letter-spacing:3px;color:#f09eb6}.title{font-size:30px;font-weight:900;letter-spacing:3px;margin:8px 0}.sub{font-size:11px;color:#c7b6c9;line-height:1.6}',
        '.body{padding:16px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.item{padding:12px;border-radius:11px;background:#201a26;border:1px solid #3b2a3c}.item b{display:block;font-size:12px}.item code{display:block;margin-top:7px;color:#f5a8bd;font-size:10px;overflow-wrap:anywhere}.item p{color:#c5b8c9;font-size:10px;line-height:1.5;margin:7px 0 0}',
        '.note{padding:12px;margin-top:13px;background:#281923;border:1px solid #523146;border-radius:11px;color:#dfc9d6;font-size:11px;line-height:1.6}.foot{padding:12px;text-align:center;font-size:9px;letter-spacing:2px;color:#8c7c92;border-top:1px solid #332535}',
        '@media(max-width:360px){body{padding:7px}.title{font-size:25px}.grid{gap:6px}.item{padding:9px}}',
        '</style></head><body><main class="wrap"><header class="hero"><div class="k">EXPERIMENTAL MESSAGE WORKSHOP</div><div class="title">JOKER / PROTO</div>',
        '<div class="sub">Research-only payloads for the active Baileys build.<br>These are format tests, not production bot UI.</div></header><section class="body"><div class="grid">',
        '<article class="item"><b>🧪 HTML primitive</b><code>.j mod proto html</code><p>HTML payload plus edit-replay compatibility experiment.</p></article>',
        '<article class="item"><b>📝 Rich response</b><code>.j mod proto rich</code><p>Structured Markdown, links, code and table rendering.</p></article>',
        '<article class="item"><b>🃏 Horizontal cards</b><code>.j mod proto cards</code><p>Experimental horizontal layout and action-row shape.</p></article>',
        '<article class="item"><b>🔘 Native Flow</b><code>.j mod proto flow</code><p>Quick reply, copy, URL and single-select button probes.</p></article>',
        '<article class="item"><b>📋 Legacy list</b><code>.j mod proto list</code><p>Older structured list-message compatibility.</p></article>',
        '<article class="item"><b>📊 Poll</b><code>.j mod proto poll</code><p>Native poll creation using the installed Baileys API.</p></article>',
        '<article class="item"><b>📅 Event</b><code>.j mod proto event</code><p>Native WhatsApp event-invitation message probe.</p></article>',
        '<article class="item"><b>✏️ Edit</b><code>.j mod proto edit</code><p>Standard edit compared with rich edit replay.</p></article></div>',
        '<div class="note"><b>Download-prompt investigation</b><br><code>.j mod proto warning</code> sends a raw HTML probe and a second probe using edit replay. Neither claims to originate from Meta AI. Rendering differs by client and rollout.</div>',
        '<div class="note"><b>Full suite</b><br><code>.j mod proto all</code> sends several test messages, including a poll and event. Use only in a suitable chat.<br><br>For command list: <code>.j mod proto help</code></div>',
        '</section><footer class="foot">JOKER • PROTOCOL LAB • EXPERIMENTAL</footer></main></body></html>'
    ].join('');
}

function htmlTestPage(title, subtitle, detail) {
    return [
        '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">',
        '<style>*{box-sizing:border-box}body{margin:0;padding:18px;background:#101014;color:#f4edf4;font-family:Arial,Helvetica,sans-serif}',
        '.panel{max-width:650px;margin:auto;background:#19151e;border:1px solid #533043;border-radius:16px;overflow:hidden}.head{padding:22px;background:linear-gradient(140deg,#3a1123,#17131b);border-bottom:1px solid #573246}',
        '.tag{font-size:10px;letter-spacing:3px;color:#ef9db6}.title{font-size:24px;font-weight:800;margin:9px 0}.sub{font-size:12px;color:#d4c2d4}.body{padding:18px;font-size:13px;line-height:1.7}.box{padding:13px;border-radius:10px;background:#251923;border:1px solid #553044}.foot{padding:12px;text-align:center;color:#927f94;font-size:9px;letter-spacing:2px;border-top:1px solid #332735}</style>',
        '</head><body><main class="panel"><header class="head"><div class="tag">JOKER PROTOCOL LAB</div><div class="title">', title,
        '</div><div class="sub">', subtitle,
        '</div></header><section class="body"><div class="box">', detail,
        '</div><p>This payload does not assert a Meta AI origin. Client rendering is experimental.</p></section><footer class="foot">FORMAT TEST ONLY</footer></main></body></html>'
    ].join('');
}

async function sendHtmlProbe(sock, chatId, senderJid, mode = 'html', editReplay = true) {
    const isMenu = mode === 'menu';
    const html = isMenu ? dashboardHtml() : htmlTestPage(
        mode === 'raw' ? 'RAW HTML BASELINE' : 'HTML RENDER TEST',
        mode === 'raw' ? 'No origin metadata and no edit replay' : 'HTML primitive with compatibility replay',
        mode === 'raw'
            ? 'Baseline A. Observe whether WhatsApp shows a download-consent prompt.'
            : 'Baseline B. This variant sends the HTML envelope and replays it as a message edit.'
    );
    return sendRich(sock, chatId, senderJid, htmlEnvelope(html), editReplay);
}

async function sendRichProbe(sock, chatId, senderJid) {
    const markdown = [
        '# Structured Rich Response',
        '',
        '**Bold** · *italic* · inline code',
        '',
        'A normal link: [Joker repository](https://github.com/BrainMell/whatsapp-bot)',
        '',
        'JavaScript sample: const proto = "experimental"; console.log(proto);',
        '',
        '| Primitive | Probe |',
        '|---|---|',
        '| Markdown | Yes |',
        '| Code content | Yes |',
        '| Table | Yes |',
        '',
        '_Formatting depends on the WhatsApp client._'
    ].join('\n');
    return sendRich(sock, chatId, senderJid, richEnvelope([
        section({ __typename: 'FOATextPrimitive', text: '# JOKER PROTO LAB\nStructured response test' }),
        section({ __typename: 'GenAIMarkdownTextUXPrimitive', text: markdown, inline_entities: [] })
    ]), true);
}

function cardsSection() {
    const cards = [
        { title: 'HTML', label: 'Inspect HTML' },
        { title: 'Rich Text', label: 'Inspect Markdown' },
        { title: 'Native Flow', label: 'Inspect Buttons' }
    ];
    return {
        __typename: 'GenAIUnifiedResponseSection',
        view_model: {
            __typename: 'GenAIHScrollLayoutViewModel',
            primitives: cards.map(card => ({
                __typename: 'GenAI3PExtWidgetPrimitive',
                header: { __typename: 'GenAI3PExtWidgetStandardHeader', title: card.title },
                body: {
                    __typename: 'GenAI3PExtCalendarEventList',
                    ctas: [{
                        label: card.label,
                        state: 'PENDING',
                        kind: 'OTHER',
                        tool_call_id: randomUUID(),
                        toast: {
                            label: 'Visual experiment only. This CTA is not connected to a bot action.',
                            __typename: 'GenAI3PExtWidgetToast'
                        },
                        __typename: 'GenAI3PExtWidgetCTA'
                    }],
                    sections: []
                }
            }))
        }
    };
}

async function sendCardsProbe(sock, chatId, senderJid) {
    return sendRich(sock, chatId, senderJid, richEnvelope([cardsSection()]), true);
}

function nativeFlowButtons(kind) {
    const map = {
        quick: [{
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({ display_text: 'Quick reply test', id: 'proto_lab_quick_reply' })
        }],
        copy: [{
            name: 'cta_copy',
            buttonParamsJson: JSON.stringify({ display_text: 'Copy test code', id: 'proto_lab_copy', copy_code: 'JOKER-PROTO-TEST' })
        }],
        url: [{
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({ display_text: 'Open repository', url: 'https://github.com/BrainMell/whatsapp-bot' })
        }],
        select: [{
            name: 'single_select',
            buttonParamsJson: JSON.stringify({
                title: 'Choose a probe',
                sections: [{
                    title: 'Protocol Lab',
                    rows: [
                        { title: 'HTML response', description: 'Experimental HTML primitive', id: 'proto_html' },
                        { title: 'Rich response', description: 'Markdown and table', id: 'proto_rich' },
                        { title: 'Cards', description: 'Horizontal layout probe', id: 'proto_cards' }
                    ]
                }]
            })
        }],
        webview: [{
            name: 'open_webview',
            buttonParamsJson: JSON.stringify({
                title: 'Open repository',
                link: {
                    url: 'https://github.com/BrainMell/whatsapp-bot',
                    in_app_webview: true,
                    view_once: false
                }
            })
        }],
        mixed: [
            { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Quick reply', id: 'proto_lab_quick_reply' }) },
            { name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text: 'Copy code', id: 'proto_lab_copy', copy_code: 'JOKER-PROTO-TEST' }) },
            { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: 'Open repo', url: 'https://github.com/BrainMell/whatsapp-bot' }) }
        ]
    };
    return map[kind] || map.mixed;
}

async function sendNativeFlowProbe(sock, chatId, senderJid, kind = 'mixed') {
    const content = {
        interactiveMessage: {
            header: { title: 'JOKER PROTO LAB', hasMediaAttachment: false },
            body: {
                text: 'Native Flow probe: ' + kind + '. Button click responses are not wired to RPG actions yet.'
            },
            footer: { text: 'Experimental native-flow test' },
            nativeFlowMessage: { buttons: nativeFlowButtons(kind), messageParamsJson: '' }
        }
    };
    const generated = generateWAMessageFromContent(chatId, content, {
        userJid: getUserJid(sock, senderJid),
        messageId: makeId()
    });
    const additionalNodes = [{
        tag: 'biz',
        attrs: {},
        content: [{
            tag: 'interactive',
            attrs: { type: 'native_flow', v: '1' },
            content: [{
                tag: 'native_flow',
                attrs: {
                    v: '9',
                    name: kind === 'select' ? 'single_select' : kind === 'webview' ? 'open_webview' : 'mixed'
                }
            }]
        }]
    }];
    if (!String(chatId).endsWith('@g.us')) {
        additionalNodes.push({ tag: 'bot', attrs: { biz_bot: '1' } });
    }
    await sock.relayMessage(chatId, generated.message, {
        messageId: generated.key.id,
        additionalNodes
    });
    return generated;
}

async function sendLegacyListProbe(sock, chatId, senderJid) {
    const listType = proto?.Message?.ListMessage?.ListType?.SINGLE_SELECT ?? 1;
    const generated = generateWAMessageFromContent(chatId, {
        listMessage: {
            title: 'Joker Protocol Lab',
            description: 'Legacy list-message compatibility probe',
            buttonText: 'Open list',
            footerText: 'List responses are not wired to actions yet',
            listType,
            sections: [{
                title: 'Choose a probe',
                rows: [
                    { title: 'HTML', rowId: 'proto_html', description: 'Rich HTML primitive' },
                    { title: 'Rich response', rowId: 'proto_rich', description: 'Markdown and tables' },
                    { title: 'Native flow', rowId: 'proto_flow', description: 'Native button layout' }
                ]
            }]
        }
    }, {
        userJid: getUserJid(sock, senderJid),
        messageId: makeId()
    });
    await sock.relayMessage(chatId, generated.message, {
        messageId: generated.key.id,
        additionalNodes: [{
            tag: 'biz',
            attrs: {},
            content: [{ tag: 'list', attrs: { v: '2', type: 'product_list' } }]
        }]
    });
    return generated;
}

async function sendPollProbe(sock, chatId) {
    return sock.sendMessage(chatId, {
        poll: {
            name: 'Joker Proto Lab: which UI should we explore?',
            values: ['Rich HTML', 'Native Flow buttons', 'Rich text and tables'],
            selectableCount: 1
        }
    });
}

async function sendEventProbe(sock, chatId) {
    return sock.sendMessage(chatId, {
        event: {
            name: 'Joker Proto Lab test event',
            description: 'Experimental WhatsApp event-message compatibility test.',
            startDate: new Date(Date.now() + 60 * 60 * 1000),
            endDate: new Date(Date.now() + 2 * 60 * 60 * 1000),
            extraGuestsAllowed: false
        }
    });
}

async function sendEditProbe(sock, chatId) {
    const original = await sock.sendMessage(chatId, {
        text: 'JOKER PROTO LAB\nEdit probe A: original message.'
    });
    await sock.sendMessage(chatId, {
        text: 'JOKER PROTO LAB\nEdit probe B: the message was edited in place.',
        edit: original.key
    });
    return original;
}

async function runWarningCompare(sock, chatId, senderJid) {
    await sendHtmlProbe(sock, chatId, senderJid, 'raw', false);
    await sendHtmlProbe(sock, chatId, senderJid, 'html', true);
    return sock.sendMessage(chatId, {
        text: 'JOKER PROTO LAB\nDownload-prompt A/B test sent. Compare the raw HTML baseline with the edit-replay variant. Both omit forwardOrigin metadata. Note which displays immediately and which, if any, asks for Download.'
    });
}

// The JOKER mod menu (owner 2026-10-29: "mod proto should pull up a menu").
// Canonical copy lives here; the identical template in adminConsole.js's
// original protomenu block is unreachable dead code since the lab took over
// the 'proto'/'protomenu' routing.
function modMenuHtml() {
    return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
*{box-sizing:border-box} body{margin:0;padding:18px;background:#101014;color:#f5f1f5;font-family:Arial,Helvetica,sans-serif}
.shell{max-width:680px;margin:auto;border:1px solid #44303b;border-radius:18px;overflow:hidden;background:#15131a}
.hero{padding:24px 18px;text-align:center;background:linear-gradient(135deg,#260e19,#111116 68%);border-bottom:1px solid #593040}
.mark{font-size:12px;letter-spacing:4px;color:#e9a7b2}.name{font-size:34px;font-weight:900;letter-spacing:5px;margin:8px 0;color:#fff}.sub{font-size:11px;letter-spacing:2px;color:#c9a4af}.meta{margin-top:16px;font-size:12px;color:#d4c8d0}.meta b{color:#f3c3ce}
.content{padding:18px}.eyebrow{font-size:11px;letter-spacing:2px;color:#e27b91;margin:0 0 12px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
.card{padding:13px 11px;border:1px solid #382b38;border-radius:11px;background:#1d1922;min-height:72px}
.card .icon{font-size:19px;margin-bottom:7px}.card strong{display:block;font-size:12px;letter-spacing:.4px}.card span{display:block;margin-top:5px;font-size:10px;line-height:1.4;color:#bcb0bf}
.feature{margin-top:16px;padding:15px;border-radius:12px;background:#25151e;border:1px solid #573043}.feature strong{font-size:12px;color:#f0b0c0}.feature p{margin:7px 0 0;font-size:11px;line-height:1.6;color:#d7cbd6}
.footer{text-align:center;padding:14px;border-top:1px solid #302631;color:#8e8291;font-size:10px;letter-spacing:1px}
@media(max-width:360px){body{padding:8px}.content{padding:12px}.grid{gap:6px}.card{padding:10px 8px}.name{font-size:27px}}
</style>
</head>
<body><main class="shell">
<header class="hero"><div class="mark">♠ THE PHANTOM COMMAND SYSTEM ♠</div><div class="name">JOKER</div><div class="sub">MODERATOR TERMINAL · PROTOTYPE</div><div class="meta"><b>VERSION 5.3.4</b> &nbsp;·&nbsp; BY MELLOW<br><br>PREFIX &nbsp; <b>.j</b></div></header>
<section class="content"><p class="eyebrow">▸ SELECT A DESTINATION</p><div class="grid">
<div class="card"><div class="icon">🧬</div><strong>RPG</strong><span>Character control and progression</span></div>
<div class="card"><div class="icon">🏗️</div><strong>FORGE</strong><span>Classes, skills and enemy tools</span></div>
<div class="card"><div class="icon">⚔️</div><strong>GUILD WAR</strong><span>War state and test skirmishes</span></div>
<div class="card"><div class="icon">🎴</div><strong>CARDS</strong><span>Spawns, tokens and eShop</span></div>
<div class="card"><div class="icon">🧪</div><strong>SANDBOX</strong><span>Test character and godmode</span></div>
<div class="card"><div class="icon">🎯</div><strong>QUIZ</strong><span>Quiz sessions and configuration</span></div>
<div class="card"><div class="icon">🛡️</div><strong>MANAGEMENT</strong><span>Moderator roles and permissions</span></div>
<div class="card"><div class="icon">🧰</div><strong>TESTERS</strong><span>Issues, reports and test controls</span></div>
</div><div class="feature"><strong>✦ QUICK NAVIGATION</strong><p>Use <b>.j mod sandbox on</b> to enter the RPG test sandbox.<br>Use <b>.j mod &lt;category&gt;</b> to open a command category.<br>Use <b>.j mod &lt;command&gt;</b> to inspect a command.</p></div><div class="feature"><strong>⚠ EXPERIMENTAL HTML VIEW</strong><p>This is a visual prototype. The cards are not clickable yet. WhatsApp may render this experimental message differently across clients.</p></div></section><footer class="footer">JOKER · MAKE YOUR NEXT MOVE</footer></main></body></html>`;
}

const HELP = [
    'JOKER PROTOCOL LAB',
    '',
    '.j mod proto opens the JOKER mod menu (rich HTML).',
    '.j mod proto lab  The protocol-lab workshop dashboard',
    '.j mod proto html  HTML primitive plus edit replay',
    '.j mod proto htmlraw  HTML primitive without edit replay',
    '.j mod proto warning  A/B test for the download prompt',
    '.j mod proto rich  Structured response with Markdown, links and table',
    '.j mod proto cards  GenAI horizontal-card/action-row probe',
    '.j mod proto flow  Mixed native-flow buttons',
    '.j mod proto flow quick  Native quick reply',
    '.j mod proto flow copy  Copy-code button',
    '.j mod proto flow url  URL button',
    '.j mod proto flow select  Single-select menu',
    '.j mod proto flow webview  In-app webview CTA',
    '.j mod proto list  Legacy list-message probe',
    '.j mod proto poll  Native poll',
    '.j mod proto event  Event invitation probe',
    '.j mod proto edit  Standard message edit',
    '.j mod proto all  Run suite; sends several messages, including a poll and event',
    '',
    'Experimental formats may be rejected or render differently across clients.',
    'Native button responses and visual card CTAs are not wired to RPG actions yet.'
].join('\n');

async function handleProtoLab(sock, chatId, senderJid, args = [], BOT_MARKER = '') {
    const sub = String(args[0] || 'menu').toLowerCase();
    const kind = String(args[1] || 'mixed').toLowerCase();
    try {
        switch (sub) {
            case 'help':
            case 'tests':
                return await sock.sendMessage(chatId, { text: BOT_MARKER + HELP });
            case 'menu':
            case 'protomenu':
                // owner 2026-10-29: bare .j mod proto / protomenu must open the
                // MOD MENU, not the lab workshop. Edit-replay delivery = the
                // most promising download-gate bypass until the A/B verdict.
                return await sendRich(sock, chatId, senderJid, htmlEnvelope(modMenuHtml()), true);
            case 'lab':
            case 'workshop':
            case 'dashboard':
                return await sendHtmlProbe(sock, chatId, senderJid, 'menu', true);
            case 'html':
                return await sendHtmlProbe(sock, chatId, senderJid, 'html', true);
            case 'htmlraw':
            case 'raw':
                return await sendHtmlProbe(sock, chatId, senderJid, 'raw', false);
            case 'warning':
            case 'download':
                return await runWarningCompare(sock, chatId, senderJid);
            case 'rich':
            case 'markdown':
            case 'table':
                return await sendRichProbe(sock, chatId, senderJid);
            case 'cards':
            case 'carousel':
                return await sendCardsProbe(sock, chatId, senderJid);
            case 'flow':
            case 'native':
                return await sendNativeFlowProbe(sock, chatId, senderJid, kind);
            case 'quick':
            case 'copy':
            case 'url':
            case 'select':
            case 'webview':
                return await sendNativeFlowProbe(sock, chatId, senderJid, sub);
            case 'list':
            case 'legacylist':
                return await sendLegacyListProbe(sock, chatId, senderJid);
            case 'poll':
                return await sendPollProbe(sock, chatId);
            case 'event':
                return await sendEventProbe(sock, chatId);
            case 'edit':
                return await sendEditProbe(sock, chatId);
            case 'all': {
                const tests = [
                    ['HTML plus edit replay', () => sendHtmlProbe(sock, chatId, senderJid, 'html', true)],
                    ['Structured rich response', () => sendRichProbe(sock, chatId, senderJid)],
                    ['Horizontal cards', () => sendCardsProbe(sock, chatId, senderJid)],
                    ['Native-flow buttons', () => sendNativeFlowProbe(sock, chatId, senderJid, 'mixed')],
                    ['Legacy list', () => sendLegacyListProbe(sock, chatId, senderJid)],
                    ['Poll', () => sendPollProbe(sock, chatId)],
                    ['Event', () => sendEventProbe(sock, chatId)],
                    ['Edit', () => sendEditProbe(sock, chatId)]
                ];
                const results = [];
                for (const [name, test] of tests) {
                    try {
                        await test();
                        results.push('OK  ' + name);
                    } catch (error) {
                        console.error('[ProtoLab] ' + name + ' failed:', error?.stack || error);
                        results.push('FAILED  ' + name + ': ' + (error?.message || String(error)));
                    }
                }
                return await sock.sendMessage(chatId, {
                    text: BOT_MARKER + 'PROTO LAB SUITE RESULTS\n\n' + results.join('\n') +
                        '\n\nA successful relay does not guarantee that the recipient client renders that format.'
                });
            }
            default:
                return await sock.sendMessage(chatId, {
                    text: BOT_MARKER + 'Unknown proto probe: ' + sub + '\n\n' + HELP
                });
        }
    } catch (error) {
        console.error('[ProtoLab] ' + sub + ' failed:', error?.stack || error);
        return await sock.sendMessage(chatId, {
            text: BOT_MARKER + 'Protocol probe failed: ' + sub + '\n' +
                (error?.message || String(error)) +
                '\n\nThe feature may not be supported by this Baileys build or WhatsApp client. Try .j mod proto help.'
        });
    }
}

module.exports = { handleProtoLab };
