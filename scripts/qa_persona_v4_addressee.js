#!/usr/bin/env node
// QA — REALGUY v4: addressee awareness (owner: "the chatbot can't tell when
// someone is talking to someone else"). Source pins on engine.js + personaEngine.js.
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }

const ROOT = path.join(__dirname, '..');
const eng = fs.readFileSync(path.join(ROOT, 'core/engine.js'), 'utf8');
const per = fs.readFileSync(path.join(ROOT, 'core/persona/personaEngine.js'), 'utf8');

console.log('── engine: addressee evidence');
ok(/const quotedParticipant = waContextInfo\?\.participant \|\| null;/.test(eng), 'chatId fallback REMOVED from quoted participant');
ok(/const quotedIsHuman =\s*\n\s*!!waContextInfo\?\.quotedMessage &&\s*\n\s*!!quotedParticipant &&\s*\n\s*!isReplyToBot;/.test(eng), 'quotedIsHuman = quoted someone who is not the bot');
ok(/return d && !_botIdDigits\.includes\(d\);/.test(eng), 'mentionsOtherHuman = mentioned digits that are not the bot');

console.log('── engine: name-trigger gating');
ok(/const isNameTrigger =\s*\n\s*isBotNameMention && !quotedIsHuman && !_mentionsOtherHuman;/.test(eng), 'bare name trigger suppressed when aimed elsewhere');
ok(/const hasTrigger =\s*\n\s*isBotMentioned \|\| isReplyToBot \|\| isNameTrigger;/.test(eng), 'hasTrigger uses gated name trigger');
ok(!/isBotMentioned \|\| isReplyToBot \|\| isBotNameMention[;)]/.test(eng), 'old ungated isBotNameMention trigger gone');

console.log('── engine: ambient suppression + observability');
ok(/if \(!hasTrigger\) \{\s*\n\s*if \(!quotedIsHuman\) \{/.test(eng), 'ambient never rolls on reply-to-human threads');
ok(/addresseeHint: _mentionsOtherHuman/.test(eng), 'tagged-someone-else hint reaches the chime');
ok(/name-trigger suppressed \(aimed elsewhere:/.test(eng), 'suppressed name-triggers are logged (bug class was invisible twice)');

console.log('── persona: prompt + plumbing');
ok(/If the name in that prefix isn't you and nobody tagged you, they're talking to EACH OTHER/.test(per), 'READING MESSAGES teaches thread ownership');
ok(/If the message was clearly aimed at someone else \(a reply to another person, or they tagged someone\), that thread isn't yours — \[SILENT\]/.test(per), 'AMBIENT MODE addressee rule + [SILENT]');
ok(/async function maybeAmbientChime\(\{ sock, chatId, isGroup, senderName, senderJid, text, addresseeHint \}\)/.test(per), 'chime accepts addresseeHint');
ok(/buildTurn\(\{ chatId, senderName, senderJid, text, isAmbient: true, addresseeHint \}\)/.test(per), 'hint flows into buildTurn');
ok(/addresseeHint \? `\\n\(context: \$\{addresseeHint\}\)` : ''/.test(per), 'hint rendered into ambient lead');
ok(/async function buildTurn\(\{ chatId, senderName, senderJid, text, isAmbient, profileText, addresseeHint \}\)/.test(per), 'buildTurn signature carries addresseeHint');

console.log('── regressions (explicit address still fires)');
ok(/const isReplyToBot = _quotedDigits\s*\n\s*\? _botIdDigits\.includes\(_quotedDigits\)/.test(eng), 'reply-to-bot compare intact');
ok(/const isBotMentioned = _mentionedDigits\.some\(/.test(eng), 'mention compare intact');
ok(/\(qa: trigger log kept\)/, '');
pass--; // drop the placeholder
ok(/🎯 \[AI\] trigger=\$\{/.test(eng), 'trigger observability line kept');

console.log(`\nQA RESULT: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
