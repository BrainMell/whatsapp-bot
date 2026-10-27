'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  GROUP WHISPER (owner request 2026-10-27): from the owner's DM, pick a group the bot is in, pick one /
//  several / all members (search by name), and the bot posts a message into that group that ONLY the chosen
//  members receive - each copy carries a real @mention of THAT member, so when you pick everyone each
//  person sees a message tagging them individually.
//
//  Mechanism: Baileys' relayMessage() accepts `participant: {jid, count}`; the stanza is addressed to the
//  group with `participant=<member device>` and encrypted pairwise for that device only (this is what retry
//  resends use). We send one such copy per device of each chosen member. Nobody else in the group gets it.
//  NOT verified against live WhatsApp clients yet: test on a small group of your own accounts first.
//
//  Flow (all in the owner's DM):   .j whisper  ->  1) pick group by number  ->  2) search / pick members
//  (numbers, ranges, `all`, `done`)  ->  3) type the message ({tag} = their @mention, {name} = their name).
//  Owner-only: the engine hook only routes the bot owner's DMs here.
// ═══════════════════════════════════════════════════════════════════════════
let B = null;
try { B = require('@whiskeysockets/baileys'); } catch (e) { /* resolved lazily at send time */ }

const sessions = new Map();           // ownerJid -> session
const TTL = 15 * 60 * 1000;
const START_RE = /^\S{1,4}\s+(?:whisper|whisp|ghosttag)\b/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (jid) => String(jid || '').split('@')[0].split(':')[0];

function nameOf(p) {
    try {
        const econ = require('../rpg/economy');
        const pn = p.phoneNumber || p.jid || p.id;
        const n = econ.getDisplayName && econ.getDisplayName(String(pn).replace(/:\d+@/, '@'));
        if (n && !/^\d{6,}$/.test(String(n))) return String(n);
    } catch (e) { /* number fallback */ }
    return p.notify || p.name || p.pushName || num(p.phoneNumber || p.id);
}

async function getGroups(sock) {
    const all = await sock.groupFetchAllParticipating();
    return Object.values(all || {}).map((g) => ({ id: g.id, subject: g.subject || g.id, participants: g.participants || [] }))
        .sort((a, b) => String(a.subject).localeCompare(String(b.subject)));
}

const send = (sock, chatId, text) => sock.sendMessage(chatId, { text });

function showMatches(sess) {
    const sel = sess.selected;
    const rows = sess.matches.slice(0, 40).map((m, i) => `${sel.has(m.id) ? '✅' : '▫️'} *${i + 1}.* ${m.name} _(${num(m.phoneNumber || m.id)})_`);
    const more = sess.matches.length > 40 ? `\n…and ${sess.matches.length - 40} more - narrow the search.` : '';
    return rows.join('\n') + more;
}

/** one whispered copy: a real @mention of `member`, delivered ONLY to that member's devices. */
async function whisperOne(sock, groupJid, member, template) {
    const lib = B || require('@whiskeysockets/baileys');
    const tagTxt = '@' + num(member.id);
    let text = template.includes('{tag}') ? template.split('{tag}').join(tagTxt) : `${tagTxt} ${template}`;
    text = text.split('{name}').join(member.name);
    const content = { extendedTextMessage: { text, contextInfo: { mentionedJid: [member.id] } } };
    const msg = lib.generateWAMessageFromContent(groupJid, content, { userJid: sock.user.id });
    // every device of the member (phone + linked devices); fall back to the bare jid
    let devs = [];
    try {
        const d = await sock.getUSyncDevices([member.id], false, false);
        const server = String(member.id).split('@')[1];
        devs = (d || []).map((x) => x.jid || lib.jidEncode(x.user, server, x.device));
    } catch (e) { /* fall through */ }
    if (!devs.length) devs = [member.id];
    let ok = 0, lastErr = null;
    for (const jid of [...new Set(devs)]) {
        try { await sock.relayMessage(groupJid, msg.message, { messageId: msg.key.id, participant: { jid, count: 0 } }); ok++; }
        catch (e) { lastErr = e; }
    }
    if (!ok) throw lastErr || new Error('no device accepted the message');
    return ok;
}

async function handle(sock, chatId, sender, txt) {
    const now = Date.now();
    for (const [k, s] of sessions) if (now - s.ts > TTL) sessions.delete(k);
    let sess = sessions.get(sender);

    if (START_RE.test(txt)) {
        const groups = await getGroups(sock);
        if (!groups.length) { await send(sock, chatId, '❌ The bot is not in any groups.'); return true; }
        sess = { step: 'group', groups, ts: now, selected: new Set(), matches: [] };
        sessions.set(sender, sess);
        const list = groups.map((g, i) => `*${i + 1}.* ${g.subject} _(${g.participants.length})_`).join('\n');
        await send(sock, chatId, `🤫 *GROUP WHISPER*\nReply with the number of the group (or \`cancel\`):\n\n${list}`);
        return true;
    }
    if (!sess) return false;
    sess.ts = now;
    const t = txt.trim();
    if (/^(cancel|exit|quit|stop)$/i.test(t)) { sessions.delete(sender); await send(sock, chatId, '🤫 Whisper cancelled.'); return true; }

    if (sess.step === 'group') {
        const i = parseInt(t, 10);
        if (!/^\d+$/.test(t) || i < 1 || i > sess.groups.length) { await send(sock, chatId, `Reply with a number 1-${sess.groups.length}, or \`cancel\`.`); return true; }
        const g = sess.groups[i - 1];
        const meNum = num(sock.user && sock.user.id), meLid = num(sock.user && sock.user.lid);
        sess.group = g;
        sess.members = g.participants.filter((p) => ![meNum, meLid].includes(num(p.id)) && num(p.phoneNumber) !== meNum)
            .map((p) => ({ id: p.id, phoneNumber: p.phoneNumber, admin: p.admin, name: nameOf(p) }))
            .sort((a, b) => a.name.localeCompare(b.name));
        sess.matches = sess.members; sess.step = 'members';
        await send(sock, chatId, `👥 *${g.subject}* - ${sess.members.length} members.\n\n` +
            `• type a *name or number* to search\n• reply with *numbers* to toggle (e.g. \`1,3,5\` or \`2-6\`)\n• \`all\` selects everyone · \`clear\` · \`list\` shows picks\n• \`done\` when finished · \`back\` for groups · \`cancel\`\n\n${showMatches(sess)}`);
        return true;
    }

    if (sess.step === 'members') {
        if (/^back$/i.test(t)) { sessions.delete(sender); return await handle(sock, chatId, sender, '.j whisper'); }
        if (/^all$/i.test(t)) { sess.members.forEach((m) => sess.selected.add(m.id)); await send(sock, chatId, `✅ Selected everyone (${sess.selected.size}). Type \`done\` to write the message.`); return true; }
        if (/^clear$/i.test(t)) { sess.selected.clear(); await send(sock, chatId, 'Selection cleared.'); return true; }
        if (/^list$/i.test(t)) { const s = sess.members.filter((m) => sess.selected.has(m.id)); await send(sock, chatId, s.length ? `✅ *Selected (${s.length}):*\n` + s.map((m) => `• ${m.name}`).join('\n') : 'Nobody selected yet.'); return true; }
        if (/^(done|next|ok)$/i.test(t)) {
            if (!sess.selected.size) { await send(sock, chatId, 'Pick at least one member first (or `all`).'); return true; }
            sess.step = 'compose';
            await send(sock, chatId, `✍️ Send the message text for *${sess.selected.size}* member${sess.selected.size === 1 ? '' : 's'}.\nUse \`{tag}\` where their @mention should go (otherwise it is put first) and \`{name}\` for their name.\nOnly they will see it. \`cancel\` to abort.`);
            return true;
        }
        if (/^[\d,\s-]+$/.test(t)) {
            let changed = 0;
            for (const part of t.split(/[,\s]+/).filter(Boolean)) {
                const r = part.match(/^(\d+)-(\d+)$/);
                const idxs = r ? Array.from({ length: Math.max(0, +r[2] - +r[1] + 1) }, (_, k) => +r[1] + k) : [parseInt(part, 10)];
                for (const i of idxs) { const m = sess.matches[i - 1]; if (!m) continue; sess.selected.has(m.id) ? sess.selected.delete(m.id) : sess.selected.add(m.id); changed++; }
            }
            await send(sock, chatId, `${changed ? 'Updated' : 'No valid numbers'} - ${sess.selected.size} selected.\n\n${showMatches(sess)}`);
            return true;
        }
        const q = t.toLowerCase();
        sess.matches = sess.members.filter((m) => m.name.toLowerCase().includes(q) || num(m.phoneNumber || m.id).includes(q));
        await send(sock, chatId, sess.matches.length ? `🔎 ${sess.matches.length} match${sess.matches.length === 1 ? '' : 'es'} for "${t}":\n\n${showMatches(sess)}` : `No member matches "${t}".`);
        return true;
    }

    if (sess.step === 'compose') {
        const targets = sess.members.filter((m) => sess.selected.has(m.id));
        sessions.delete(sender);
        await send(sock, chatId, `🤫 Whispering to ${targets.length} member${targets.length === 1 ? '' : 's'} in *${sess.group.subject}*…`);
        let ok = 0; const failed = [];
        for (const m of targets) {
            try { await whisperOne(sock, sess.group.id, m, t); ok++; } catch (e) { failed.push(`${m.name} (${String(e.message || e).slice(0, 40)})`); }
            await sleep(700);
        }
        await send(sock, chatId, `✅ Delivered to ${ok}/${targets.length}.` + (failed.length ? `\n⚠️ Failed: ${failed.slice(0, 10).join(', ')}` : '') + '\n_Check on a member\'s phone that it appeared with their own tag._');
        return true;
    }
    return false;
}

module.exports = { handle, whisperOne, getGroups, START_RE };
