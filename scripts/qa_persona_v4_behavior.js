#!/usr/bin/env node
// QA — REALGUY v4 behavioral: extract the ACTUAL trigger block from engine.js
// and run scenario messages through it (reply-to-human suppression, name gating,
// explicit-address preservation).
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }

const eng = fs.readFileSync(path.join(__dirname, '..', 'core/engine.js'), 'utf8');

// slice the real logic: from waContextInfo assembly through the full hasTrigger statement
const start = eng.indexOf('const waContextInfo =');
const htStart = eng.indexOf('const hasTrigger =');
const htEnd = eng.indexOf(';', htStart);
if (start < 0 || htStart < 0 || htEnd < 0) { console.log('FAIL could not slice trigger block'); process.exit(1); }
let block = eng.slice(start, htEnd + 1);
// cut the observability console.log lines out (they reference console only - fine to keep actually)
block = block.replace(/console\.log\([\s\S]*?\);/, ''); // first console.log only if any

const botJid = '233509676154@s.whatsapp.net';
const botLid = '106631840940269@lid';
const botConfig = { getBotName: () => 'Joker' };

function decide({ text, contextInfo }) {
  const txt = String(text);
  const lowerTxt = txt.toLowerCase();
  const m = { message: contextInfo || {} };
  const chatId = '120363409013549791@g.us';
  let isBotMentioned, isReplyToBot, quotedIsHuman, _mentionsOtherHuman, isNameTrigger, hasTrigger, isBotNameMention, quotedIsHuman_unused;
  const scope = { m, txt, lowerTxt, chatId, botJid, botLid, botConfig };
  const wrapper = new Function(
    'scope',
    `const { m, txt, lowerTxt, chatId, botJid, botLid, botConfig } = scope;
     ${block}
     return { isBotMentioned, isReplyToBot, quotedIsHuman, _mentionsOtherHuman, isNameTrigger, hasTrigger, isBotNameMention };`,
  );
  return wrapper(scope);
}

const HUMAN = '2348080602542@lid';        // one of the claimant's other SIMs
const BOT_PHONE_QUOTE = '233509676154@s.whatsapp.net';
const BOT_LID_QUOTE = '106631840940269@lid';
const q = (participant, mentioned) => ({ extendedTextMessage: { contextInfo: { quotedMessage: { conversation: 'hi' }, participant, ...(mentioned ? { mentionedJid: mentioned } : {}) } } });
const ctxMention = (mentioned) => ({ extendedTextMessage: { contextInfo: { mentionedJid: mentioned } } });
const noCtx = () => ({ conversation: 'x' });

// 1) reply to ANOTHER HUMAN + says "joker" → suppressed (the core complaint)
let r = decide({ text: 'joker is so dumb lmao', contextInfo: q(HUMAN) });
ok(r.isBotNameMention === true && r.hasTrigger === false, 'reply-to-human + "joker" → name seen but SUPPRESSED');
ok(r.quotedIsHuman === true, 'quotedIsHuman detected');

// 2) reply to BOT (phone form) → still fires as reply
r = decide({ text: 'lol ok', contextInfo: q(BOT_PHONE_QUOTE) });
ok(r.isReplyToBot === true && r.hasTrigger === true, 'reply-to-bot (phone form) fires');

// 3) reply to BOT (LID form) → still fires as reply
r = decide({ text: 'lol ok', contextInfo: q(BOT_LID_QUOTE) });
ok(r.isReplyToBot === true && r.hasTrigger === true, 'reply-to-bot (LID form) fires');

// 4) @bot mention → fires
r = decide({ text: 'yo @233509676154 help', contextInfo: ctxMention([BOT_PHONE_QUOTE]) });
ok(r.isBotMentioned === true && r.hasTrigger === true, '@bot mention fires');

// 5) bare name call, no quote/mention → fires (talking TO the bot)
r = decide({ text: 'joker you there?', contextInfo: noCtx() });
ok(r.isNameTrigger === true && r.hasTrigger === true, 'bare name-call still fires');

// 6) @another human + says "joker" → suppressed (talking to that human about the bot)
r = decide({ text: '@2348080602542 bro joker got me fucked up', contextInfo: ctxMention([HUMAN]) });
ok(r._mentionsOtherHuman === true && r.hasTrigger === false, 'tag-other-human + "joker" → SUPPRESSED');

// 7) reply to human, no name → no trigger, ambient would be SKIPPED
r = decide({ text: 'nah bro you tripping', contextInfo: q(HUMAN) });
ok(r.hasTrigger === false && r.quotedIsHuman === true, 'reply-to-human plain → quiet, no ambient roll');

// 8) fresh chatter, nothing aimed anywhere → no trigger (ambient may roll, engine passes !quotedIsHuman)
r = decide({ text: 'this game is crazy hard today man', contextInfo: noCtx() });
ok(r.hasTrigger === false && r.quotedIsHuman === false, 'plain chatter → no trigger, ambient allowed');

// 9) reply to bot + ALSO mentions a human → still fires (explicit address wins)
r = decide({ text: '@2348080602542 look what joker said', contextInfo: q(BOT_PHONE_QUOTE, [HUMAN]) });
ok(r.isReplyToBot === true && r.hasTrigger === true, 'reply-to-bot + tag human → still fires');

// 10) device-suffixed bot jid in quote → fires
r = decide({ text: 'wdym', contextInfo: q('233509676154:12@s.whatsapp.net') });
ok(r.isReplyToBot === true, 'device-suffixed bot quote still detected');

console.log(`\nQA RESULT: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
