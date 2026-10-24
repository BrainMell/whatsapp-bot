'use strict';
/* QA: 45s command-watchdog anti-spam (owner 2026-10-24: "can get this to
 * fucking stop spamming when we are fishing hunting or mining").
 * 1. Source pins: overrides for the RPG media lanes, the throttle map, the
 *    grace window, and the hoisted _handlerPromise (let OUTSIDE the try, so
 *    the catch can see it).
 * 2. Logic sim of the new catch flow: recovering orphan -> NO notice; hung
 *    orphan -> first notice sends, repeats inside 10 min are suppressed.
 * Run: node scripts/qa_watchdog_throttle.js
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const check = (name, cond) => {
    console.log(`[check] ${name}: ${cond ? 'PASS' : 'FAIL'}`);
    cond ? pass++ : fail++;
};

const src = fs.readFileSync(path.join(__dirname, '..', 'core', 'engine.js'), 'utf8');

// ── 1. source pins ─────────────────────────────────────────────────────────
check('RPG media lanes have 90s override ceilings',
    /mine: 90000,/.test(src) && /fish: 90000,/.test(src) && /fishing: 90000,/.test(src) &&
    /cast: 90000,/.test(src) && /hunt: 90000,/.test(src) && /hunting: 90000,/.test(src));
check('throttle map __cmdTimeoutNotice present', src.includes('__cmdTimeoutNotice'));
check('grace window 15s present', /setTimeout\(r, 15000\)/.test(src));
check('_handlerPromise hoisted with let OUTSIDE the try',
    /let _handlerPromise = null;\s*\n\s*try \{\s*\n\s*_handlerPromise = botConfig\.storage\.run/.test(src));
check('orphan watch consumed in the catch', /if \(_handlerPromise\) _handlerPromise\.then\(_markOrphanSettled, _markOrphanSettled\)/.test(src));
check('watchdog itself still alive (45s ceiling + message)', src.includes('Command timed out after') && src.includes('_cmdTimeoutMs = 45000'));

// ── 2. logic sim of the new catch flow ─────────────────────────────────────
(async () => {
    const GRACE_MS = 20; // shrunken clock for the sim, same shape as prod
    const WINDOW_MS = 100; // 10-minute window, shrunken
    let sent = [];
    const makeSock = () => ({ sendMessage: async (chat, content) => { sent.push(content.text); } });
    const notices = new Map();

    async function timeoutCatch(sock, spamKey, orphan) {
        let orphanSettled = false;
        const mark = () => { orphanSettled = true; };
        if (orphan) orphan.then(mark, mark);
        await new Promise((r) => setTimeout(r, GRACE_MS));
        if (orphanSettled) return 'suppressed-settled';
        const now = Date.now();
        const last = notices.get(spamKey) || 0;
        notices.set(spamKey, now);
        if (now - last >= WINDOW_MS) {
            await sock.sendMessage('chat', { text: '⏱️ Command timed out after 45.0s.' });
            return 'sent';
        }
        return 'suppressed-throttled';
    }

    // A: recovering orphan (upload stall that delivers late) -> never cries wolf
    sent = [];
    const sockA = makeSock();
    const a1 = await timeoutCatch(sockA, 'chatA|mine', new Promise((res) => setTimeout(res, 5)));
    check('A1 recovering orphan -> notice suppressed', a1 === 'suppressed-settled' && sent.length === 0);

    // B: true hang -> first notice sends, immediate repeat is throttled
    sent = [];
    const sockB = makeSock();
    const never = new Promise(() => {});
    const b1 = await timeoutCatch(sockB, 'chatB|mine', never);
    const b2 = await timeoutCatch(sockB, 'chatB|mine', never);
    const b3 = await timeoutCatch(sockB, 'chatB|mine', never);
    check('B1 hung orphan -> first notice SENT', b1 === 'sent' && sent.length === 1);
    check('B2 repeat hang -> throttled (console only)', b2 === 'suppressed-throttled' && b3 === 'suppressed-throttled' && sent.length === 1);

    // C: different command in same chat is NOT throttled by the first
    sent = [];
    const sockC = makeSock();
    const c1 = await timeoutCatch(sockC, 'chatB|hunt', never);
    check('C different cmd in same chat -> own notice', c1 === 'sent' && sent.length === 1);

    // D: window expiry lets a notice through again
    await new Promise((r) => setTimeout(r, WINDOW_MS + 10));
    const d1 = await timeoutCatch(sockB, 'chatB|mine', never);
    check('D window expiry -> notice allowed again', d1 === 'sent');

    console.log(`\n[qa] RESULT: ${fail === 0 ? 'ALL PASS' : `${fail} FAILURES`} (${pass} passed)`);
    process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('[qa] FATAL', e); process.exit(1); });
