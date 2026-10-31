'use strict';

// 🐉 .j proto dbtimelines — Dragon Ball Timelines visual guide delivery.
//
// Owner 2026-10-31: he typed ".j proto dbtimelines" after receiving the
// standalone HTML guide and hit "Unknown command" — the guide had never been
// wired into the bot. This module makes that exact invocation work:
//   1. compact QUICK-VIEW page rendered IN-APP via the classic proto envelope
//      (same FOAHtmlPrimitive shape as `.j mod proto menu`, which owner-confirmed
//      renders — payloads there are ~4 KB, so the quick view stays under ~6 KB),
//   2. the full ~94 KB visual guide as a WhatsApp document (works offline),
//   3. an experimental in-app attempt at the FULL page through the same
//      envelope (25x the proven size — may silently fail; never fatal).
//
// Isolated from RPG systems. The guide file lives at assets/
// dragon-ball-timelines-guide.html and is read fresh on every call, so
// updating the guide never requires a code change.

const fs = require('fs');
const path = require('path');

const { generateWAMessageFromContent, prepareWAMessageMedia, proto } = require('@whiskeysockets/baileys');

const GUIDE_PATH = path.join(__dirname, '..', '..', 'assets', 'dragon-ball-timelines-guide.html');
const GUIDE_FILE = 'dragon-ball-timelines-guide.html';

function makeId() {
    return require('crypto').randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase();
}

function responseData(sections) {
    return Buffer.from(JSON.stringify({
        __typename: 'GenAIUnifiedResponse',
        response_id: makeId(),
        sections
    })).toString('base64');
}

// Same envelope as protoLab.sendClassicHtml (kept local so this module never
// circular-requires protoLab and protoLab can lazily require this module).
function htmlEnvelope(html) {
    return {
        botForwardedMessage: {
            message: {
                richResponseMessage: {
                    messageType: 1,
                    unifiedResponse: { data: responseData([{
                        __typename: 'GenAIUnifiedResponseSection',
                        view_model: {
                            __typename: 'GenAISingleLayoutViewModel',
                            primitive: {
                                __typename: 'FOAHtmlPrimitiveDemoDONOTUSE',
                                trusted_sources: [],
                                payload: String(html).trim()
                            }
                        }
                    }]) }
                }
            }
        }
    };
}

function getUserJid(sock, fallback) {
    return sock?.user?.id || sock?.authState?.creds?.me?.id || fallback;
}

async function sendClassicHtmlLocal(sock, chatId, senderJid, html) {
    const content = htmlEnvelope(html);
    const generated = generateWAMessageFromContent(chatId, content, {
        userJid: getUserJid(sock, senderJid),
        messageId: makeId()
    });
    await sock.relayMessage(chatId, generated.message, {
        messageId: generated.key.id
    });
    return generated;
}

// ── The compact in-app QUICK VIEW (keep under ~6 KB — the proven envelope size) ──
function buildCompactHtml() {
    return String.raw`<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
*{box-sizing:border-box;margin:0}body{padding:14px;background:#101014;color:#f5f1f5;font-family:Arial,Helvetica,sans-serif}
.shell{max-width:680px;margin:auto;border:1px solid #44303b;border-radius:18px;overflow:hidden;background:#15131a}
.hero{padding:20px 16px;text-align:center;background:linear-gradient(135deg,#260e19,#111116 68%);border-bottom:1px solid #593040}
.mark{font-size:11px;letter-spacing:3px;color:#e9a7b2}.name{font-size:26px;font-weight:900;letter-spacing:3px;margin:6px 0;color:#fff}
.sub{font-size:10px;letter-spacing:1px;color:#c9a4af}
.content{padding:14px}.eyebrow{font-size:10px;letter-spacing:2px;color:#e27b91;margin:14px 0 8px}
.ruler{display:flex;gap:2px}.tick{flex:1;text-align:center;padding:5px 0 6px;border-radius:5px;background:#1d1922;border:1px solid #382b38}
.tick b{display:block;font-size:10px;color:#f3c3ce}.tick span{display:block;font-size:7px;line-height:1.25;color:#bcb0bf;margin-top:2px}
.branch{border:1px solid #382b38;border-radius:9px;background:#1a1620;padding:8px 10px;margin-bottom:7px}
.branch h4{font-size:11px;color:#f3c3ce;letter-spacing:.5px}.branch p{font-size:9px;line-height:1.45;color:#bcb0bf;margin-top:3px}
.debate{display:flex;gap:7px;align-items:flex-start;padding:6px 9px;border-left:2px solid #e27b91;background:#1d1922;border-radius:0 8px 8px 0;margin-bottom:5px}
.debate span{font-size:9px;line-height:1.4;color:#d4c8d0}.q{color:#e9a7b2;font-weight:bold}
.foot{margin-top:12px;padding:10px;border:1px dashed #593040;border-radius:9px;text-align:center;font-size:9px;color:#c9a4af;line-height:1.5}
</style></head><body><div class="shell">
<div class="hero"><div class="mark">🃏 JOKER BOT · .j proto dbtimelines</div>
<div class="name">🐉 TIMELINES</div>
<div class="sub">QUICK VIEW · FULL VISUAL GUIDE IN THE DOCUMENT BELOW</div></div>
<div class="content">
<div class="eyebrow">⏳ THE AGE RULER — MAIN TIMELINE (UNIVERSE 7)</div>
<div class="ruler">
<div class="tick"><b>737</b><span>Goku lands</span></div>
<div class="tick"><b>761</b><span>Raditz · Z begins</span></div>
<div class="tick"><b>762</b><span>Namek · SSJ</span></div>
<div class="tick"><b>764</b><span>Trunks · Frieza falls</span></div>
<div class="tick"><b>767</b><span>Cell Games</span></div>
<div class="tick"><b>774</b><span>Majin Buu</span></div>
<div class="tick"><b>778+</b><span>Super era</span></div>
<div class="tick"><b>784</b><span>End of Z · Uub</span></div>
<div class="tick"><b>789</b><span>GT (non-canon)</span></div>
</div>
<div class="eyebrow">🕸️ THE FOUR TIMELINES — CELL SAGA BRANCH MAP</div>
<div class="branch"><h4>① MAIN / PRIME LINE</h4><p>The one we follow. Cell is born here in Age 788-ish AFTER the games — because the Cell that appears in Age 767 came back from further still.</p></div>
<div class="branch"><h4>② TRUNKS' FUTURE (his home)</h4><p>Androids 17 &amp; 18 ravage Earth from Age ~767 until Trunks returns stronger in Age 785 and kills them — then Cell ambushes him and steals the machine.</p></div>
<div class="branch"><h4>③ CELL'S ORIGIN LINE</h4><p>Where Cell grabbed Trunks' machine. His trip to Age 764 created a NEW branch — the one Trunks' second trip unknowingly feeds into (he expects his own past; it isn't).</p></div>
<div class="branch"><h4>④ THE UNSEEN LINE</h4><p>The branch Cell's arrival created: a past where Trunks' first visit "never happened" for its residents. Cell Games are fought on line ④ — the prime line never knew Cell.</p></div>
<div class="eyebrow">⚖️ WHERE OPINIONS SPLIT</div>
<div class="debate"><span><span class="q">3 vs 4 timelines —</span> Toriyama's sketch shows 3 lines drawn; the mechanics imply a 4th. Largest fan war in the whole topic.</span></div>
<div class="debate"><span><span class="q">Cell's Age-764 stop —</span> did he land in the prime past (stealing a spare remote) or an already-split branch? Changes the whole count.</span></div>
<div class="debate"><span><span class="q">Time Rings vs machine —</span> Super's rings say "a trip never splits a line"; the Cell saga is built on splitting. One model, or two different kinds of time?</span></div>
<div class="debate"><span><span class="q">GT —</span> 789-790 sequel to End of Z, or fully retired once Super occupied the same slots? Most YouTube channels present it "anime-optional".</span></div>
<div class="foot">📂 The full guide — <b>top 50 YouTube timeline videos distilled</b>, cross-checked vs Fandom Wiki / VS Battles / Kanzenshuu / the official site, every debate matrixed — is attached as a document below ⬇️.<br>Download → double-click → opens in any browser, fully offline.</div>
</div></div></body></html>`;
}

// ── Document caption ──
const CAPTION =
    '🐉 *DRAGON BALL TIMELINES — THE VISUAL GUIDE*\n\n' +
    '📺 Top 50 YouTube timeline videos distilled (Dragon Ball University, Carthu\'s Dojo, Qaaman\'s Lair, the "All 25 Timelines" school…)\n' +
    '🕸️ Cross-checked vs Fandom Wiki · VS Battles Wiki · Kanzenshuu databooks · the official site\n' +
    '⚖️ Every major debate flagged: 3 vs 4 timelines · Cell\'s Age-764 ordering · Time Rings vs machine · GT canon · movie placements\n' +
    '🕸️ 7 hand-drawn SVG diagrams · 10 module tiles · works fully offline\n\n' +
    '📂 *Download → double-click → opens in any browser.*\n' +
    'Quick view sent above ⤴️ · experiments section: `.j mod proto help`';

async function sendGuide(sock, chatId, senderJid, m, BOT_MARKER = '') {
    // 1) compact in-app quick view (proven envelope size, owner-confirmed render shape)
    try {
        await sendClassicHtmlLocal(sock, chatId, senderJid, buildCompactHtml());
        console.log('[DbTimelines] quick view relayed (' + buildCompactHtml().length + ' B)');
    } catch (e) {
        console.error('[DbTimelines] quick view relay failed:', e?.message || e);
    }

    // 2) the full guide as a document (guaranteed artifact)
    let docOk = false;
    try {
        const buf = fs.readFileSync(GUIDE_PATH);
        await sock.sendMessage(chatId, {
            document: buf,
            mimetype: 'text/html',
            fileName: GUIDE_FILE,
            caption: BOT_MARKER + CAPTION
        }, m?.key ? { quoted: m } : {});
        docOk = true;
        console.log('[DbTimelines] document sent (' + buf.length + ' B)');
    } catch (e) {
        console.error('[DbTimelines] document send failed:', e?.message || e);
        await sock.sendMessage(chatId, {
            text: BOT_MARKER + '⚠️ The guide document failed to attach (' + (e?.message || 'unknown error') + '). Ask Mellow to poke me about it.'
        }, m?.key ? { quoted: m } : {}).catch(() => {});
    }

    // 3) experimental: the FULL ~94 KB page through the same in-app envelope.
    //    Proven renders are ~4 KB; this is 25x. If WhatsApp rejects it the relay
    //    throws and we log — the quick view + document above already delivered.
    try {
        const full = fs.readFileSync(GUIDE_PATH, 'utf8');
        await sendClassicHtmlLocal(sock, chatId, senderJid, full);
        console.log('[DbTimelines] full-page in-app render relayed (' + full.length + ' B) — client render unverified');
    } catch (e) {
        console.error('[DbTimelines] full-page in-app relay failed (expected at this size, non-fatal):', e?.message || e);
    }

    return docOk;
}

module.exports = { sendGuide, buildCompactHtml, GUIDE_PATH };
