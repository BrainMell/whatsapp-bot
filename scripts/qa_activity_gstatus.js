// QA: owner-order fixes 2026-09-22 (".j activity broken / gstatus still no media")
//
//  A. .j activity [day]: REAL runtime tests of core/utils/gcActivity.js
//     (timezone math, day arg parsing, aggregation, card) + a REAL execution
//     of the engine's detectActivityType (extracted from the shipped source)
//     + source pins for every write path and the midnight-default rewire.
//  B. gstatus: media posts detached from the 45s-raced message run,
//     GS_UNSUPPORTED scoping fix, media messageSecret in the relay,
//     text-only path untouched.
//
// No real Mongo needed: the aggregation pipelines the module sends are
// interpreted against an in-memory doc set (stages used: $match/$group/
// $sort/$limit only - the interpreter is exact for those).

process.env.GO_IMAGE_SERVICE_URL = process.env.GO_IMAGE_SERVICE_URL || 'http://127.0.0.1:7860';

const fs = require('fs');
const engineSrc = fs.readFileSync('./core/engine.js', 'utf8');
const securitySrc = fs.readFileSync('./core/utils/security.js', 'utf8');
const registrySrc = fs.readFileSync('./core/utils/commandRegistry.js', 'utf8');
const modelSrc = fs.readFileSync('./core/models/ActivityLog.js', 'utf8');

let pass = 0, fail = 0;
function assert(cond, label) {
    if (cond) { pass++; console.log('✓', label); }
    else { fail++; console.error('✗ FAIL:', label); process.exitCode = 1; }
}

const gcActivity = require('../core/utils/gcActivity');

// ── tiny aggregation interpreter (exact for the stages the module uses) ──
function runPipeline(docs, pipeline) {
    let rows = docs;
    for (const stage of pipeline) {
        if (stage.$match) {
            rows = rows.filter((d) => matchDoc(d, stage.$match));
        } else if (stage.$group) {
            const g = {};
            for (const d of rows) {
                const key = JSON.stringify(resolveId(stage.$group._id, d));
                (g[key] = g[key] || { _id: resolveId(stage.$group._id, d), __sum: 0 });
                for (const [field, spec] of Object.entries(stage.$group)) {
                    if (field === '_id') continue;
                    if (spec && spec.$sum) {
                        const v = spec.$sum === 1 ? 1 : (d[spec.$sum] || 0);
                        g[key][field] = (g[key][field] || 0) + v;
                    }
                }
            }
            rows = Object.values(g);
        } else if (stage.$sort) {
            const [[field, dir]] = Object.entries(stage.$sort);
            rows = [...rows].sort((a, b) => (a[field] > b[field] ? dir : a[field] < b[field] ? -dir : 0));
        } else if (stage.$limit) {
            rows = rows.slice(0, stage.$limit);
        }
    }
    return rows;
}
function matchDoc(d, m) {
    for (const [k, v] of Object.entries(m)) {
        if (k === 'timestamp') {
            if (v.$gte && !(new Date(d.timestamp) >= new Date(v.$gte))) return false;
            if (v.$lt && !(new Date(d.timestamp) < new Date(v.$lt))) return false;
        } else if (k === 'type' && v && v.$in) {
            if (!v.$in.includes(d.type)) return false;
        } else if (d[k] !== v) return false;
    }
    return true;
}
function resolveId(spec, d) {
    if (typeof spec === 'string') return d[spec.replace(/^\$/, '')];
    if (spec && typeof spec === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(spec)) out[k] = resolveId(v, d);
        return out;
    }
    return spec;
}
function stubModel(docs) {
    return {
        aggregate: async (pipeline) => runPipeline(docs, pipeline),
        create: async (x) => { if (Array.isArray(x)) docs.push(...x); else docs.push(x); return x; },
    };
}

const CHAT = 'activity-test@g.us';
const U1 = '251111000001@s.whatsapp.net';
const U2 = '251111000002@s.whatsapp.net';
const U3 = '251111000003@s.whatsapp.net';

(async () => {
    console.log('\n── 1. Timezone math (Africa/Accra, no server-TZ dependence) ──');
    // 2026-09-21T23:30:00Z is 23:30 in Accra (GMT+0) -> still Sep 21 there.
    const lateNight = new Date('2026-09-21T23:30:00.000Z');
    assert(gcActivity.dayKey(lateNight) === '2026-09-21', 'dayKey buckets by Accra calendar day');
    // 2026-09-22T00:10:00Z is already Sep 22 in Accra.
    assert(gcActivity.dayKey(new Date('2026-09-22T00:10:00.000Z')) === '2026-09-22', 'midnight rollover lands on the new day');

    const range = gcActivity.dayRange('2026-09-21');
    assert(!!range && range.start instanceof Date && range.end instanceof Date, 'dayRange returns start/end');
    assert(range.end - range.start === 24 * 3600000, 'Accra day is exactly 24h (no DST)');
    assert(range.start.toISOString().startsWith('2026-09-21T00:00'), 'day starts AT MIDNIGHT local (00:00 GMT), not now-24h');

    console.log('\n── 2. Day-arg parsing ──');
    const today = gcActivity.dayRangeFromArg('today');
    assert(!today.error && today.label.includes('midnight'), 'bare/today = "today (since midnight)"');
    assert(gcActivity.dayRangeFromArg('').key !== undefined || !gcActivity.dayRangeFromArg('').error, 'empty arg defaults to today');
    const yday = gcActivity.dayRangeFromArg('yesterday');
    assert(!yday.error && yday.label === 'yesterday', 'yesterday parses');
    const iso = gcActivity.dayRangeFromArg('2026-09-21');
    assert(!iso.error && iso.start.toISOString().startsWith('2026-09-21T00:00'), 'YYYY-MM-DD parses');
    const dmy = gcActivity.dayRangeFromArg('21/09/2026');
    assert(!dmy.error && dmy.start.toISOString().startsWith('2026-09-21T00:00'), 'DD/MM/YYYY parses day-first');
    const dm = gcActivity.dayRangeFromArg('21-09');
    assert(!dm.error && dm.start.toISOString().startsWith('2026-09-21T00:00'), 'DD-MM parses with current year');
    const bare = gcActivity.dayRangeFromArg('21');
    assert(!bare.error && bare.start.toISOString().startsWith('2026-09-21T00:00'), 'bare day-of-month parses');
    assert(gcActivity.dayRangeFromArg('not a date').error === true, 'garbage errors into usage text');
    assert(gcActivity.dayRangeFromArg('2026-13-40').error === true, 'impossible dates rejected');

    console.log('\n── 3. getDailyBreakdown + formatCard (REAL module runtime) ──');
    const mid = new Date('2026-09-21T12:00:00.000Z');
    const docs = [
        ...Array.from({ length: 7 }, () => ({ chatId: CHAT, userId: U1, type: 'message', timestamp: mid })),
        ...Array.from({ length: 3 }, () => ({ chatId: CHAT, userId: U2, type: 'message', timestamp: mid })),
        { chatId: CHAT, userId: U1, type: 'image', timestamp: mid },
        { chatId: CHAT, userId: U1, type: 'image', timestamp: mid },
        { chatId: CHAT, userId: U2, type: 'video', timestamp: mid },
        { chatId: CHAT, userId: U2, type: 'sticker', timestamp: mid },
        { chatId: CHAT, userId: U3, type: 'audio', timestamp: mid },
        { chatId: CHAT, userId: U3, type: 'document', timestamp: mid },
        { chatId: CHAT, userId: U3, type: 'contact', timestamp: mid },
        { chatId: CHAT, userId: U3, type: 'location', timestamp: mid },
        { chatId: CHAT, userId: U1, type: 'poll', timestamp: mid },
        { chatId: CHAT, userId: U2, type: 'link_deleted', timestamp: mid },
        { chatId: CHAT, userId: U3, type: 'join', timestamp: mid },
        { chatId: CHAT, userId: U2, type: 'left', timestamp: mid },
        { chatId: CHAT, userId: U2, type: 'kicked', timestamp: mid },
        // noise: other chat + other day must NOT leak in
        { chatId: 'other@g.us', userId: U1, type: 'message', timestamp: mid },
        { chatId: CHAT, userId: U1, type: 'message', timestamp: new Date('2026-09-20T12:00:00.000Z') },
    ];
    const model = stubModel(docs);
    const r = gcActivity.dayRange('2026-09-21');
    const bd = await gcActivity.getDailyBreakdown(model, CHAT, r.start, r.end);
    assert(bd.counts.message === 10, 'messages: 10 (7+3), other chat/day excluded');
    assert(bd.counts.image === 2 && bd.counts.video === 1 && bd.counts.sticker === 1, 'media counted by type');
    assert(bd.counts.audio === 1 && bd.counts.document === 1 && bd.counts.contact === 1 && bd.counts.location === 1 && bd.counts.poll === 1, 'audio/doc/contact/location/poll counted');
    assert(bd.counts.link_deleted === 1, 'links deleted counted');
    assert(bd.events.join.length === 1 && bd.events.left.length === 1 && bd.events.kicked.length === 1, 'join/left/kicked rosters populated');
    assert(bd.top.length >= 1 && bd.top[0].userId === U1 && bd.top[0].count === 7, 'top poster = U1 with 7');
    assert(bd.totalEvents === 23, 'total events = 23 (10 msg + 9 media + 1 link + 3 roster events, scope-filtered)');

    const card = gcActivity.formatCard(bd, '2026-09-21', (jid) => jid.split('@')[0]);
    assert(card.includes('GC ACTIVITY') && card.includes('2026-09-21'), 'card carries the day label');
    assert(card.includes('Messages: *10*'), 'card shows message count');
    assert(card.includes('Links deleted: *1*'), 'card shows links deleted');
    assert(card.includes('Joined: *1*') && card.includes('Left: *1*') && card.includes('Kicked: *1*'), 'card shows join/left/kick');
    assert(card.includes('251111000001') && card.includes('*7* msg'), 'card shows top poster');
    const mentions = gcActivity.collectMentions(bd);
    assert(mentions.includes(U1) && mentions.includes(U2) && mentions.includes(U3), 'mentions collected for top posters + rosters');
    assert(new Set(mentions).size === mentions.length, 'mentions deduped');

    console.log('\n── 4. detectActivityType: REAL execution of the shipped engine code ──');
    const fnMatch = engineSrc.match(/function detectActivityType\(message\) \{[\s\S]*?\n    \}/);
    assert(!!fnMatch, 'detectActivityType found in engine source');
    // eslint-disable-next-line no-new-func
    const detectActivityType = new Function(`return (${fnMatch[0]});`)();
    assert(detectActivityType({ message: { conversation: 'hi' } }) === 'message', 'text -> message');
    assert(detectActivityType({ message: { imageMessage: {} } }) === 'image', 'image -> image');
    assert(detectActivityType({ message: { videoMessage: {} } }) === 'video', 'video -> video');
    assert(detectActivityType({ message: { audioMessage: {} } }) === 'audio', 'audio -> audio');
    assert(detectActivityType({ message: { stickerMessage: {} } }) === 'sticker', 'sticker -> sticker');
    assert(detectActivityType({ message: { documentMessage: {} } }) === 'document', 'document -> document');
    assert(detectActivityType({ message: { contactMessage: {} } }) === 'contact', 'contact -> contact');
    assert(detectActivityType({ message: { locationMessage: {} } }) === 'location', 'location -> location');
    assert(detectActivityType({ message: { pollCreationMessageV3: {} } }) === 'poll', 'poll -> poll');
    assert(detectActivityType({ message: { ephemeralMessage: { message: { imageMessage: {} } } } }) === 'image', 'ephemeral-wrapped image STILL counted as image');
    assert(detectActivityType({ message: { viewOnceMessageV2: { message: { videoMessage: {} } } } }) === 'video', 'view-once video counted as video');
    assert(detectActivityType({ message: { documentWithCaptionMessage: { message: { documentMessage: {} } } } }) === 'document', 'doc-with-caption counted');
    assert(detectActivityType({}) === 'message', 'empty message -> message (never throws)');

    console.log('\n── 5. Engine wiring: midnight defaults + real daily command ──');
    assert(engineSrc.includes('trackActivity(chatId, senderJid, detectActivityType(m))'), 'message path passes the detected type');
    assert(/function trackActivity\(chatId, userId, type\)/.test(engineSrc), 'trackActivity takes the type');
    assert(/type: type \|\| "message"/.test(engineSrc), 'ActivityLog rows persist the type');
    assert(engineSrc.includes("dayRangeFromArg(argAct || \"today\")"), '.j activity bare uses today since midnight');
    assert((engineSrc.match(/const _winAct = gcActivityWindow\(periodArg\)/g) || []).length === 4, 'active/inactive/tagactive/taginactive all use the midnight window');
    assert(!engineSrc.includes('getChatActivityForPeriod(chatId, periodMs !== null ? periodMs : 24 * 60 * 60 * 1000)'), 'old last-24h default is GONE');
    assert(!engineSrc.includes('Total messages this session'), 'misleading all-time "session" label is GONE');
    assert(engineSrc.includes('async function getChatActivityBetween(chatId, start, end)'), 'explicit-window aggregator exists');
    assert(engineSrc.includes('$gte: start') && engineSrc.includes('match.timestamp.$lt = end'), 'window is [start, end)');
    assert(engineSrc.includes("activity [yesterday|2026-09-21|21/09|21]") || registrySrc.includes('activity [yesterday|2026-09-21|21/09|21]'), 'registry documents the day forms');
    assert(registrySrc.includes('Bare = today since midnight'), 'registry documents the midnight default');
    assert(engineSrc.includes("beyond the 30-day activity window"), 'pre-30d queries get the TTL warning');
    assert(engineSrc.includes("can't count the future"), 'future dates rejected');
    assert(modelSrc.includes("type: { type: String, default: 'message' }"), 'ActivityLog.type is ADDITIVE with default (old rows count as messages, no migration)');

    console.log('\n── 6. Engine wiring: membership + antilink event writers ──');
    assert(engineSrc.includes('const _actType =') && engineSrc.includes('? "join"') && engineSrc.includes('? "left"') && engineSrc.includes('"kicked"'), 'participants handler maps add/leave/remove to join/left/kicked');
    assert(/_actLogModel\.create\(_actDocs\)/.test(engineSrc), 'membership events written to ActivityLog');
    assert(/action === "remove" \? \(_actVoluntary \? "left" : "kicked"\)/.test(engineSrc), 'self-removal = left, admin action = kicked');
    assert(securitySrc.includes("type: 'link_deleted'"), 'antilink delete writes link_deleted');
    assert(securitySrc.includes('_jnu(chatId)'), 'antilink log normalizes chatId to the engine key format');

    console.log('\n── 7. gstatus: media detached from the 45s-raced run ──');
    assert((engineSrc.match(/const GS_UNSUPPORTED = '__gs_unsupported_media__';/g) || []).length === 1, 'GS_UNSUPPORTED declared exactly once');
    const gsHelperStart = engineSrc.indexOf('const __gsEnsureHelpers = () => {');
    const gsHelperEnd = engineSrc.indexOf('globalThis.__gsHelpers = { gsBuildPayload, gsPost, gsMsgId };');
    const helperBody = engineSrc.slice(gsHelperStart, gsHelperEnd);
    assert(!helperBody.includes('const GS_UNSUPPORTED'), 'GS_UNSUPPORTED is NOT scoped inside __gsEnsureHelpers anymore');
    assert(engineSrc.indexOf("const GS_UNSUPPORTED = '__gs_unsupported_media__';") < gsHelperStart, 'GS_UNSUPPORTED hoisted to per-message scope (visible to both catch sites)');
    assert(engineSrc.includes('const __gsDetachPost = (sock2, chatId2, key2, buildFn, okText)'), 'detached post helper exists');
    assert((engineSrc.match(/__gsDetachPost\(/g) || []).length >= 2, 'pending path AND command path both call the detached poster');
    assert(!engineSrc.includes('payload = await __gsBuildPayload('), 'no inline media build left in the command path');
    assert(!engineSrc.includes('const _gsPayload = await __gsBuildPayload('), 'no inline media build left in the pending path');
    assert(engineSrc.includes('let __gsMediaBuild = null;'), 'command path defers media via buildFn');
    // the 45s race is intact and must not see any long media await anymore
    assert(engineSrc.includes('Command timed out after'), '45s command timeout still in place');

    console.log('\n── 8. gstatus: media relay carries the official messageSecret ──');
    assert(engineSrc.includes('messageSecret: crypto.randomBytes(32)'), 'media inner message gets messageSecret (official GStatusIn shape)');
    assert(/const __gsInner = inner\.message \|\| inner;/.test(engineSrc), 'relay unwraps the generated message once');
    assert(engineSrc.includes('{ groupStatusMessageV2: { message: __gsInner } }'), 'single groupStatusMessageV2 wrap kept (v3 shape intact)');
    const relayIdx = engineSrc.indexOf('const __gsInner = inner.message || inner;');
    const relayBlock = engineSrc.slice(relayIdx, relayIdx + 900);
    assert(/if \(isMedia\) \{[\s\S]*messageSecret/.test(relayBlock), 'messageSecret applied to MEDIA ONLY - text path untouched');

    console.log(`\n${pass} passed, ${fail} failed`);
    if (fail > 0) process.exit(1);
})().catch((e) => { console.error('QA crashed:', e); process.exit(1); });
