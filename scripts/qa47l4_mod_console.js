#!/usr/bin/env node
/**
 * qa47l4_mod_console.js - 47-l4 functional check of the mod-console overhaul
 * against the DEPLOYED files (drives the REAL adminConsole.handleAdmin with a
 * mock sock; no WhatsApp, no Go service):
 *   1. args ['sandbox','status']  -> sandbox status reply (console dispatch intact)
 *   2. args ['setlevel','5']      -> usage line teaches `.j mod setlevel` (text rewrite)
 *   3. guide (['help'])           -> MOD CONSOLE title + mod-form lines, no `.j admin` usage
 *   4. modMenuData                -> SANDBOX category with 21 entries + short fields
 * Run from repo root: node scripts/qa47l4_mod_console.js
 */
process.env.GO_IMAGE_SERVICE_URL = 'http://127.0.0.1:1';
delete require.cache[require.resolve('../botConfig')];

const botConfig = require('../botConfig');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? " - " + String(extra).slice(0, 160) : ""}`); }
}

function cfgFor(botId) {
  return {
    getBotId: () => botId, getBotName: () => botId,
    getPrefix: () => '.j', getCurrency: () => ({ symbol: 'Ꞩ', name: 'Zeni' }),
    getAssetPath: () => '', getStickerPath: () => '', getDataPath: () => '',
    getRPGAssetPath: () => '', getAuthPath: () => '', getSiblings: () => [],
    isEnabled: () => true, getVersion: () => '5.3.2', getSymbol: () => '.',
    getContentDescription: () => '', getFastResponses: () => [], pairingPhone: null,
  };
}

async function main() {
  const fs = require('fs');
  const path = require('path');
  const envPath = path.join(__dirname, '..', '.env');
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
  const mongoose = require('mongoose');
  mongoose.set('bufferTimeoutMS', 45000);
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });

  const adminConsole = require('../core/commands/adminConsole');

  const sends = [];
  const sock = {
    sendMessage: async (jid, content) => { sends.push(content); return { key: { id: 'q' + sends.length } }; },
  };
  const CHAT = 'qa47l4@g.us';
  const ME = 'qa47l4_owner@s.whatsapp.net';
  const m = { key: { remoteJid: CHAT, fromMe: false }, pushName: 'QA' };
  const getMentionOrReply = () => null;
  const textOf = (i) => sends[i]?.text || sends[i]?.caption || '';

  botConfig.storage.run(cfgFor('Joker'), async () => {
 // 1. sandbox status through the console
    sends.length = 0;
    await adminConsole.handleAdmin(sock, CHAT, ME, ['sandbox', 'status'], m, '', '.j', getMentionOrReply);
    const t1 = sends.map((c, i) => textOf(i)).join('\n');
    ok('sandbox status dispatches', /SANDBOX TEST CHARACTER|Status:/i.test(t1), t1.slice(0, 140));

 // 2. setlevel usage line teaches the mod form
    sends.length = 0;
    await adminConsole.handleAdmin(sock, CHAT, ME, ['setlevel', '500'], m, '', '.j', getMentionOrReply);
    const t2 = sends.map((c, i) => textOf(i)).join('\n');
    ok('setlevel usage teaches .j mod', /mod setlevel/.test(t2), t2.slice(0, 140));
    ok('setlevel usage no longer says .j admin', !/\.j admin setlevel/.test(t2), t2.slice(0, 140));

 // 3. help guide: MOD CONSOLE, mod-form lines, zero admin-form lines
    sends.length = 0;
    await adminConsole.handleAdmin(sock, CHAT, ME, ['help'], m, '', '.j', getMentionOrReply);
    const t3 = sends.map((c, i) => textOf(i)).join('\n');
    ok('guide retitled MOD CONSOLE', /MOD CONSOLE - FULL GUIDE/i.test(t3), t3.slice(0, 120));
    ok('guide teaches mod sandbox on', /mod sandbox on/.test(t3), '');
    ok('guide has zero `.j admin` usage lines', !/`\.j admin /i.test(t3), (t3.match(/\.j admin [a-z]/gi) || []).join(','));
    ok('guide mentions the sandbox alias', /`\.j sandbox <sub>`/.test(t3), '');

 // 4. menu data: SANDBOX category intact with shorts
    const { MOD_MENU } = require('../core/utils/modMenuData');
    const sb = MOD_MENU.SANDBOX;
    ok('SANDBOX category exists (21 cmds)', sb && sb.commands.length === 21, sb && sb.commands.length);
    ok('sandbox entries carry short descs', sb.commands.every((c) => c.short && c.short.length <= 26), '');
    ok('sandbox usage forms are mod-prefixed', sb.commands.every((c) => /^mod (sandbox|godmode)/.test(c.usage)), sb.commands[0].usage);

    console.log(`\n47-l4 MOD CONSOLE QA: ${pass}/${pass + fail}`);
    await mongoose.disconnect();
    process.exit(fail === 0 ? 0 : 1);
  });
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
