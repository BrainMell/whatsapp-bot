'use strict';
// 🛠️ GROUP TOOLS (2026-11-25): the group-admin commands the bot was missing + view-once text.
//   admin : gname, gdesc, link, revoke, requests, approve, reject, ephemeral, addmode, approval, editinfo
//   anyone: ginfo, vo (view-once text, experimental)
// Wired from engine.js with one call; returns true when it handled the message.

const crypto = require('crypto');


// ---- shared chat theme (WhatsApp 2026 "set a theme for everyone") -----------------------------
// Wire format from whatsmeow main: Message.protocolMessage{ type=34 CHAT_THEME_SETTING,
// chatThemeSetting(30) = ChatThemeSetting{ settingTimestampMS(1), clearTheme(2), solidColor(11) } }.
// Baileys rc14 predates these fields, so field 30 is appended as raw bytes.
const COLORS = {
  red: '#d32f2f', crimson: '#8b0a1a', pink: '#e91e8c', purple: '#7b1fa2', violet: '#5e35b1', blue: '#1565c0', navy: '#0d1b3d',
  sky: '#29b6f6', teal: '#00897b', green: '#2e7d32', lime: '#9ccc3c', yellow: '#fbc02d', orange: '#ef6c00', brown: '#5d4037',
  black: '#0b0b0f', grey: '#546e7a', gray: '#546e7a', white: '#f5f5f5', gold: '#c9a227',
};
const _cat = (a, b) => { const o = new Uint8Array(a.length + b.length); o.set(a, 0); o.set(b, a.length); return o; };
const _vi = (n) => { const o = []; let v = Number(n); for (;;) { let b = v % 128; v = Math.floor(v / 128); if (v) b += 128; o.push(b); if (!v) break; } return Uint8Array.from(o); };
const _ld = (tag, bytes) => _cat(_cat(_vi((tag << 3) | 2), _vi(bytes.length)), bytes);
const _fx32 = (tag, n) => { const b = new Uint8Array(5); b[0] = (tag << 3) | 5; new DataView(b.buffer).setUint32(1, n >>> 0, true); return b; };
const _bool = (tag, v) => Uint8Array.from([(tag << 3) | 0, v ? 1 : 0]);
function parseColor(s) {
  s = String(s || '').trim().toLowerCase();
  if (COLORS[s]) s = COLORS[s];
  const m = s.match(/^#?([0-9a-f]{6})$/);
  return m ? parseInt(m[1], 16) : null;
}
const shade = (rgb, k) => ((Math.round(((rgb >> 16) & 255) * k) << 16) | (Math.round(((rgb >> 8) & 255) * k) << 8) | Math.round((rgb & 255) * k)) >>> 0;
const argb = (rgb) => (0xFF000000 | rgb) >>> 0;

let _themePatched = false;
async function patchProtocol() {
  if (_themePatched) return true;
  const { proto } = await import('@whiskeysockets/baileys');
  const PM = proto && proto.Message && proto.Message.ProtocolMessage;
  if (!PM || !PM.encode) return false;
  const orig = PM.encode;
  PM.encode = function patched(m, writer) {
    const tail = m && m.__themeTail;
    if (!tail) return orig(m, writer);
    if (writer) { const w = orig(m, writer); w.uint32((30 << 3) | 2); w.bytes(tail); return w; }
    return { finish: () => _cat(Uint8Array.from(orig(m).finish()), _ld(30, tail)) };
  };
  _themePatched = true;
  return true;
}

async function sendTheme(sock, chatId, { rgb, clear, doodle }) {
  if (!(await patchProtocol())) throw new Error('baileys proto not patchable');
  const { proto } = await import('@whiskeysockets/baileys');
  let cts = _cat(new Uint8Array(0), _cat(_vi((1 << 3) | 0), _vi(Date.now())));          // settingTimestampMS
  if (clear) cts = _cat(cts, _bool(2, true));                                            // clearTheme
  else {
    const solid = _cat(_cat(_fx32(1, argb(rgb)), _fx32(2, argb(shade(rgb, 0.45)))), _bool(3, !!doodle));
    cts = _cat(cts, _ld(11, solid));                                                      // solidColor
  }
  const pm = proto.Message.ProtocolMessage.create({ type: 34 });
  pm.__themeTail = cts;
  const outer = proto.Message.create({});
  outer.protocolMessage = pm;
  const id = '3EB0' + crypto.randomBytes(10).toString('hex').toUpperCase();
  await sock.relayMessage(chatId, outer, { messageId: id });
  return id;
}

const DURATIONS = { off: 0, '0': 0, '24h': 86400, '1d': 86400, '7d': 604800, '1w': 604800, '90d': 7776000 };

function fmtDate(sec) {
  if (!sec) return 'unknown';
  try { return new Date(Number(sec) * 1000).toISOString().slice(0, 10); } catch (e) { return 'unknown'; }
}

const num = (jid) => String(jid || '').split('@')[0].split(':')[0];

/**
 * @param c { sock, chatId, m, txt, lowerTxt, prefix, isGroupChat, canUseAdminCommands, getGroupMetadata, mark }
 */
async function handle(c) {
  const { sock, chatId, m, lowerTxt, prefix, isGroupChat, canUseAdminCommands, getGroupMetadata } = c;
  const mark = c.mark || '';
  const p = String(prefix || '').toLowerCase();
  if (!lowerTxt.startsWith(p + ' ')) return false;
  const rest = c.txt.slice(p.length).trim();
  const word = rest.split(/\s+/)[0].toLowerCase();
  const args = rest.slice(word.length).trim();
  const say = (text, extra = {}) => sock.sendMessage(chatId, { text: mark + text, ...extra }, { quoted: m });
  const react = (e) => sock.sendMessage(chatId, { react: { text: e, key: m.key } }).catch(() => {});

  const ADMIN = ['gname', 'gdesc', 'link', 'revoke', 'requests', 'approve', 'reject', 'ephemeral', 'addmode', 'approval', 'editinfo', 'gtheme'];
  const ANYONE = ['ginfo', 'vo'];
  if (!ADMIN.includes(word) && !ANYONE.includes(word)) return false;

  // ---- view-once text works anywhere --------------------------------------
  if (word === 'vo') {
    // `.j vo <text>` — the text is deleted from the chat command and re-sent as a view-once text.
    // Mode -b uses Baileys' own wrapper, for A/B testing which one real clients honour.
    const alt = /^-b\s+/i.test(args);
    const body = args.replace(/^-b\s+/i, '').trim();
    if (!body) { await say(`🔒 *View-once text*\n\`${prefix} vo <text>\` sends your text so it can be opened once, then it is gone.\n_Experimental: only phones with the 2026 view-once-text update show it properly. If it looks wrong, try \`${prefix} vo -b <text>\`._`); return true; }
    try {
      if (alt) {
        await sock.sendMessage(chatId, { text: body, viewOnce: true });
      } else {
        const { generateWAMessageFromContent, proto } = await import('@whiskeysockets/baileys');
        const content = {
          viewOnceMessageV2: {
            message: {
              messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
              extendedTextMessage: { text: body, viewOnce: true },
            },
          },
        };
        const msg = generateWAMessageFromContent(chatId, proto.Message.fromObject(content), { userJid: sock.user && sock.user.id, messageId: '3EB0' + crypto.randomBytes(10).toString('hex').toUpperCase() });
        await sock.relayMessage(chatId, msg.message, { messageId: msg.key.id });
      }
      if (isGroupChat) await sock.sendMessage(chatId, { delete: m.key }).catch(() => {});
    } catch (e) {
      await say('❌ Could not send the view-once text: ' + String((e && e.message) || e).slice(0, 120));
    }
    return true;
  }

  // everything else is group-only
  if (!isGroupChat) { await say('👥 That command only works inside a group.'); return true; }

  // ---- ginfo (anyone) -------------------------------------------------------
  if (word === 'ginfo') {
    let md = null;
    try { md = await getGroupMetadata(chatId); } catch (e) { /* ignore */ }
    if (!md) { await say("❌ Couldn't load group info. Try again in a moment."); return true; }
    const parts = md.participants || [];
    const admins = parts.filter((x) => x.admin).length;
    await say([
      '📋 *GROUP INFO*',
      '',
      `*Name:* ${md.subject}`,
      `*Members:* ${parts.length} (${admins} admins)`,
      `*Created:* ${fmtDate(md.creation)}`,
      `*Owner:* ${md.owner ? '@' + num(md.owner) : 'unknown'}`,
      `*Messages:* ${md.announce ? 'admins only' : 'everyone'}`,
      `*Edit group info:* ${md.restrict ? 'admins only' : 'everyone'}`,
      `*Add members:* ${md.memberAddMode === false ? 'admins only' : 'everyone'}`,
      `*Join approval:* ${md.joinApprovalMode ? 'on' : 'off'}`,
      `*Disappearing:* ${md.ephemeralDuration ? Math.round(md.ephemeralDuration / 86400) + ' day(s)' : 'off'}`,
      md.desc ? `\n*Description:*\n${String(md.desc).slice(0, 300)}` : '',
    ].filter((l) => l !== '').join('\n'), md.owner ? { mentions: [md.owner] } : {});
    return true;
  }

  // ---- admin-only below ------------------------------------------------------
  if (!canUseAdminCommands) { await say('you need to be an admin to use this command.'); return true; }

  const fail = async (e) => {
    const t = String((e && e.message) || e || '');
    if (/not-authorized|forbidden|403/i.test(t)) await say('❌ I need to be a group admin to do that.');
    else await say('❌ WhatsApp refused it: ' + t.slice(0, 120));
    await react('❌');
  };

  try {
    if (word === 'gname') {
      if (!args) { await say(`✏️ \`${prefix} gname <new group name>\``); return true; }
      await sock.groupUpdateSubject(chatId, args.slice(0, 100));
      await react('✅');
      return true;
    }
    if (word === 'gdesc') {
      if (!args) { await say(`✏️ \`${prefix} gdesc <new description>\` or \`${prefix} gdesc clear\``); return true; }
      await sock.groupUpdateDescription(chatId, /^clear$/i.test(args) ? '' : args.slice(0, 2048));
      await react('✅');
      return true;
    }
    if (word === 'link') {
      const code = await sock.groupInviteCode(chatId);
      await say('🔗 *Invite link*\nhttps://chat.whatsapp.com/' + code);
      return true;
    }
    if (word === 'revoke') {
      const code = await sock.groupRevokeInvite(chatId);
      await say('♻️ Old invite link revoked.\nNew link: https://chat.whatsapp.com/' + code);
      return true;
    }
    if (word === 'requests' || word === 'approve' || word === 'reject') {
      const list = (await sock.groupRequestParticipantsList(chatId)) || [];
      if (word === 'requests') {
        if (!list.length) { await say('📭 No pending join requests.'); return true; }
        const lines = list.slice(0, 30).map((r, i) => `${i + 1}. @${num(r.jid || r.phone_number)}`);
        await say(`📬 *Pending requests (${list.length})*\n${lines.join('\n')}\n\n\`${prefix} approve all\` · \`${prefix} approve 1\` · \`${prefix} reject all\``, { mentions: list.slice(0, 30).map((r) => r.jid).filter(Boolean) });
        return true;
      }
      if (!list.length) { await say('📭 No pending join requests.'); return true; }
      let pick = [];
      if (/^all$/i.test(args)) pick = list;
      else {
        const nums = (args.match(/\d+/g) || []).map(Number);
        pick = nums.map((n) => list[n - 1]).filter(Boolean);
      }
      if (!pick.length) { await say(`Say which: \`${prefix} ${word} all\` or \`${prefix} ${word} 1 2\` (numbers from \`${prefix} requests\`).`); return true; }
      const jids = pick.map((r) => r.jid || r.phone_number).filter(Boolean);
      await sock.groupRequestParticipantsUpdate(chatId, jids, word);
      await say(`${word === 'approve' ? '✅ Approved' : '🚫 Rejected'} ${jids.length} request${jids.length === 1 ? '' : 's'}.`);
      return true;
    }
    if (word === 'ephemeral') {
      const key = args.toLowerCase().replace(/\s+/g, '');
      if (!(key in DURATIONS)) { await say(`⏳ \`${prefix} ephemeral off|24h|7d|90d\``); return true; }
      await sock.groupToggleEphemeral(chatId, DURATIONS[key]);
      await react('✅');
      return true;
    }
    if (word === 'gtheme') {
      const a = args.trim().toLowerCase();
      if (!a) {
        await say(`🎨 *Group theme for everyone*\n\`${prefix} gtheme <color>\` - e.g. red, navy, gold, or a hex like #8b0a1a\n\`${prefix} gtheme <color> doodle\` - keep the chat doodles\n\`${prefix} gtheme reset\` - back to default\n\n_Needs members on the 2026 shared-themes update; they may get an accept prompt._`);
        return true;
      }
      if (/^(reset|default|clear|off)$/.test(a)) { await sendTheme(sock, chatId, { clear: true }); await react('✅'); return true; }
      const doodle = /\bdoodle\b/.test(a);
      const rgb = parseColor(a.replace(/\bdoodle\b/, '').trim());
      if (rgb === null) { await say('🎨 I do not know that color. Try a name (red, navy, gold, teal...) or a hex like #8b0a1a.'); return true; }
      await sendTheme(sock, chatId, { rgb, doodle });
      await react('🎨');
      return true;
    }
    if (word === 'addmode') {
      const a = args.toLowerCase();
      if (!/^(all|admins)$/.test(a)) { await say(`➕ Who can add members?\n\`${prefix} addmode all\` or \`${prefix} addmode admins\``); return true; }
      await sock.groupMemberAddMode(chatId, a === 'all' ? 'all_member_add' : 'admin_add');
      await react('✅');
      return true;
    }
    if (word === 'approval') {
      const a = args.toLowerCase();
      if (!/^(on|off)$/.test(a)) { await say(`🛂 \`${prefix} approval on\` (admins approve new joiners) or \`${prefix} approval off\``); return true; }
      await sock.groupJoinApprovalMode(chatId, a);
      await react('✅');
      return true;
    }
    if (word === 'editinfo') {
      const a = args.toLowerCase();
      if (!/^(admins|all)$/.test(a)) { await say(`🔧 Who can edit group name/icon/description?\n\`${prefix} editinfo admins\` or \`${prefix} editinfo all\``); return true; }
      await sock.groupSettingUpdate(chatId, a === 'admins' ? 'locked' : 'unlocked');
      await react('✅');
      return true;
    }
  } catch (e) {
    await fail(e);
    return true;
  }
  return false;
}

module.exports = { handle };
