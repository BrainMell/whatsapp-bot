'use strict';
// 🛠️ GROUP TOOLS (2026-11-25): the group-admin commands the bot was missing + view-once text.
//   admin : gname, gdesc, link, revoke, requests, approve, reject, ephemeral, addmode, approval, editinfo
//   anyone: ginfo, vo (view-once text, experimental)
// Wired from engine.js with one call; returns true when it handled the message.

const crypto = require('crypto');

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

  const ADMIN = ['gname', 'gdesc', 'link', 'revoke', 'requests', 'approve', 'reject', 'ephemeral', 'addmode', 'approval', 'editinfo'];
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
