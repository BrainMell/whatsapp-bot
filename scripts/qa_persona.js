// QA harness — PROJECT REALGUY persona engine (owner 2026-10-20).
// Pure stub-driven: no DB, no net, no engine require. Run:
//   node scripts/qa_persona.js
const persona = require('../core/persona/personaEngine');

let fails = 0;
const check = (label, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) fails++;
};

// ─── stubs ───────────────────────────────────────────────────────────────────
let kvStore = {};
const systemStub = {
  get: (k, fb) => (k in kvStore ? kvStore[k] : fb),
  set: (k, v) => { kvStore[k] = v; },
};
const realRandom = Math.random.bind(Math);

// script-driven groq stub: each call shifts the next scripted reply
let groqCalls = [];
let groqScript = [];
const groqStub = async (opts) => {
  groqCalls.push(opts);
  return { choices: [{ message: { content: groqScript.shift() || 'default casual reply' } }] };
};

// ─── 1. init ─────────────────────────────────────────────────────────────────
check('initPersona not ready without deps', persona.initPersona({}) === false);
check('initPersona ready with groq+system',
  persona.initPersona({ botName: 'joker', system: systemStub, smartGroqCall: async () => ({}), modelFn: () => 'm' }) === true);
persona.initPersona({ botName: 'joker', system: systemStub, smartGroqCall: groqStub, modelFn: () => 'FAST' });

// ─── 2. observe buffer (L2) ──────────────────────────────────────────────────
const CH = 'qa@g.us';
for (let i = 0; i < 30; i++) persona.observe({ chatId: CH, who: 'u' + i, text: 'msg ' + i });
const bufLen = persona._internals.transcriptBlock(CH).split('\n').length;
check('transcript window renders last 12 lines', bufLen === 12);
check('oldest entries evicted', !persona._internals.transcriptBlock(CH).includes('msg 0') && persona._internals.transcriptBlock(CH).includes('msg 29'));
persona.observe({ chatId: CH, who: 'x', text: '' }); // empty ignored silently
check('empty observe ignored', persona._internals.transcriptBlock(CH).split('\n').length === 12);

// ─── 3. ambient gate (L1) ────────────────────────────────────────────────────
Math.random = () => 0; // always passes the roll
check('ambient blocked in DM', persona.shouldAmbient({ chatId: CH, text: 'hey guys what is up', isGroup: false }) === false);
check('ambient blocked for commands', persona.shouldAmbient({ chatId: CH, text: '.j play something', isGroup: true }) === false);
check('ambient blocked for short msgs', persona.shouldAmbient({ chatId: CH, text: 'lol ok', isGroup: true }) === false);
check('ambient rolls + burns cooldown', persona.shouldAmbient({ chatId: CH, text: 'bro this game is actually wild today', isGroup: true }) === true);
check('ambient cooldown holds', persona.shouldAmbient({ chatId: CH, text: 'another perfectly eligible message here', isGroup: true }) === false);
Math.random = realRandom;

// ─── 4. chunking (L5) ────────────────────────────────────────────────────────
check('short text = 1 chunk', persona.chunkText('yo that fight was crazy lol').length === 1);
const long = 'This is sentence one which is fairly long on purpose. Sentence two adds more words to push past the limit for sure. Sentence three keeps going and going and going like a real rambler would. Sentence four finally wraps it all up nicely here.';
const chunks = persona.chunkText(long);
check('long text → 2-3 chunks', chunks.length >= 2 && chunks.length <= 3);
check('chunks stay human-sized', chunks.every(c => c.length <= 260) && chunks.join(' ').includes('sentence'));
check('chunkText safe on junk', JSON.stringify(persona.chunkText('')) === '[]' && JSON.stringify(persona.chunkText(null)) === '[]');

// ─── 5. typing delay (L5) ────────────────────────────────────────────────────
const d1 = persona.typingDelayMs('hi');
const d2 = persona.typingDelayMs('x'.repeat(20000));
check('delay clamped 1.2s-7s', d1 >= 1200 && d1 <= 7000 && d2 === 7000);

// ─── 6. tool protocol (L4) ───────────────────────────────────────────────────
const mixed = 'hmm let me think\n[SEARCH: who won the 2022 world cup]\n[REMEMBER: Mellow | hates pineapple on pizza]';
const parsed = persona.parseToolCalls(mixed);
check('SEARCH tag parsed', parsed.search === 'who won the 2022 world cup');
check('REMEMBER tag parsed (name|fact)', parsed.remember.length === 1 && parsed.remember[0].name.trim() === 'Mellow' && parsed.remember[0].fact.includes('pineapple'));
// (REALGUY v2: emoji re-add is random — pin it OFF for exact-string checks)
Math.random = () => 0.99;
const cleaned = persona.cleanReplyText(mixed);
check('cleanReplyText strips all tags + markdown', !cleaned.includes('[SEARCH') && !cleaned.includes('[REMEMBER') && !cleaned.includes('**'));
check('cleanReplyText strips bot: prefix', persona.cleanReplyText('**Bot:** yeah lol') === 'yeah lol');
Math.random = realRandom;

// ─── 7. facts KV (L2, Mongo-backed via shared system) ────────────────────────
persona.rememberFact(CH, 'Mellow', 'hates pineapple on pizza');
check('fact persisted to shared KV', JSON.stringify(kvStore._shared_persona_facts[CH]).includes('pineapple'));
check('factsBlock renders list', persona.factsBlock(CH).includes('- Mellow: hates pineapple'));
for (let i = 0; i < 35; i++) persona.rememberFact(CH, 'u' + i, 'fact ' + i);
check('facts capped at 30 (FIFO)', kvStore._shared_persona_facts[CH].length === 30 && !JSON.stringify(kvStore._shared_persona_facts[CH]).includes('pineapple'));
check('rememberFact rejects junk', persona.rememberFact('', '', '') === false);

(async () => {
  // ─── 8. buildTurn: plain + REMEMBER ────────────────────────────────────────
  groqCalls = [];
  groqScript = ['fr though\n[REMEMBER: Mellow | mains the samurai class]'];
  const t1 = await persona.buildTurn({ chatId: CH, senderName: 'Mellow', text: 'sup dude', isAmbient: false });
  check('turn returns replies', t1 && t1.replies.length >= 1 && t1.replies.join(' ').includes('fr though'));
  check('REMEMBER executed during turn', JSON.stringify(kvStore._shared_persona_facts[CH]).includes('samurai'));
  check('system prompt carries persona rules', groqCalls[0].messages[0].content.includes('You are joker') && groqCalls[0].messages[0].content.includes('not an AI'));
  // 💡 REALGUY v3 (owner: over-punctuating / robotic): voice layer checks
  const _src3 = require('fs').readFileSync(require('path').join(__dirname, '..', 'core', 'persona', 'personaEngine.js'), 'utf8');
  check('v3: HOW YOU TEXT teaches no trailing periods', groqCalls[0].messages[0].content.includes('never end a message with a period'));
  check('v3: HOW YOU TEXT bans semicolons/dashes/parens', groqCalls[0].messages[0].content.includes('no semicolons, no dashes, no parentheses'));
  check('v3: quote-prefix mechanic explained to the model', groqCalls[0].messages[0].content.includes("that's the message they're replying to"));
  check('v3: card/react context rule present', groqCalls[0].messages[0].content.includes('game cards and screenshots here'));
  check('v3: honest-miss rule (admit you missed it or ask)', groqCalls[0].messages[0].content.includes('admit you missed it or ask'));
  check('v3: Baileys quoted rides as THIRD arg (v2.5 bug: raw sends)', _src3.includes('sendMessage(chatId, content, quoted ? { quoted } : undefined)'));
  check('v3: humanSend forwards opts.quoteM into silentSend', _src3.includes('silentSend(sock, chatId, content, opts.quoteM)'));
  check('v3: em-dash/semicolon soften pass in cleanReplyText', _src3.includes('replace(/\\s*[—–]\\s*/g'));
  check('v3: per-bubble trailing-period strip in chunkText', _src3.includes("x.endsWith('.') && !x.endsWith('...')") && _src3.includes('stripTrailingDot(t)'));
  check('v3: trailing period stripped from a bubble', (() => {
    const out = persona.chunkText('hey there. this is fine.');
    return out.length === 1 && out[0] === 'hey there. this is fine';
  })());
  check('v3: ellipsis preserved by the strip', persona.chunkText('wait what...')[0] === 'wait what...');
  check('v3: em-dash softened to comma speech', (() => {
    const _mr = Math.random; Math.random = () => 0.99; // pin: no emoji re-add during this test
    const out = persona.cleanReplyText('so sick — wait; no');
    Math.random = _mr;
    return out === 'so sick, wait, no';
  })());
  check('v3: no exemplar ends with a period', (() => {
    const sys = groqCalls[0].messages[0].content;
    const lines = (sys.match(/^you: .*$/gm) || []);
    return lines.length >= 10 && lines.every((l) => !l.trim().endsWith('.'));
  })());
  check('transcript rides into prompt', groqCalls[0].messages[0].content.includes('GROUP CHAT RIGHT NOW'));

  // ─── 9. buildTurn: SEARCH tool loop ────────────────────────────────────────
  groqCalls = [];
  groqScript = ['[SEARCH: who won the 2022 world cup]', 'answered with the tool result'];
  let searchQ = null;
  persona.initPersona({ botName: 'joker', system: systemStub, smartGroqCall: groqStub, modelFn: () => 'FAST',
    searchFn: async (q) => { searchQ = q; return '- Result A: something useful\n- Result B: more info'; } });
  const t2 = await persona.buildTurn({ chatId: CH, senderName: 'Mellow', text: 'yo who won the 2022 world cup??', isAmbient: false });
  check('search tool invoked with query', searchQ === 'who won the 2022 world cup');
  check('tool round = 2 groq calls', groqCalls.length === 2);
  check('TOOL_RESULT fed to second call', JSON.stringify(groqCalls[1].messages).includes('You looked it up') && JSON.stringify(groqCalls[1].messages).includes('Result A'));
  check('final answer clean + flagged usedSearch', t2.usedSearch === true && !t2.replies.join(' ').includes('[SEARCH'));
  check('model id passed through', groqCalls[0].model === 'FAST');

  // ─── 10. ambient [SILENT] escape ───────────────────────────────────────────
  groqScript = ['[SILENT]'];
  check('ambient [SILENT] → null turn', await persona.buildTurn({ chatId: CH, senderName: 'x', text: 'whatever guys', isAmbient: true }) === null);

  // ─── 11. generation failure → null (never throws) ──────────────────────────
  persona.initPersona({ botName: 'joker', system: systemStub,
    smartGroqCall: async () => { throw new Error('429 wall'); }, modelFn: () => 'FAST' });
  check('groq failure → null turn, no throw', await persona.buildTurn({ chatId: CH, senderName: 'x', text: 'hello there', isAmbient: false }) === null);
  // restore script stub for the remaining suites
  persona.initPersona({ botName: 'joker', system: systemStub, smartGroqCall: groqStub, modelFn: () => 'FAST' });

  // ─── 12. silentSend: 1 + 2 background retries (L6) ─────────────────────────
  let attempts = 0;
  const flaky = { sendMessage: async () => { attempts++; if (attempts < 3) throw new Error('net drop'); return {}; } };
  check('send succeeds on 3rd attempt', await persona.silentSend(flaky, CH, { text: 'hi' }) === true && attempts === 3);
  attempts = 0;
  const dead = { sendMessage: async () => { attempts++; throw new Error('dead'); } };
  check('send fails SILENTLY after 3 attempts (no throw, no user msg)', await persona.silentSend(dead, CH, { text: 'hi' }) === false && attempts === 3);

  // ─── 13. humanSend: presence cadence + marker + chunk break ────────────────
  const events = [];
  const sock = {
    sendPresenceUpdate: async (state, chat) => { events.push(state + ':' + chat); },
    sendMessage: async () => { throw new Error('always down'); },
  };
  await persona.humanSend(sock, CH, ['first bubble', 'second bubble'], {});
  check('dead send → break: 1 composing then paused', events.filter(e => e.startsWith('composing')).length === 1 && events[events.length - 1] === 'paused:' + CH);
  check('humanSend stays silent when sends die (no throw)', true);

  const sent = [];
  const sock2 = {
    sendPresenceUpdate: async () => {},
    sendMessage: async (chat, content) => { sent.push(content); return {}; },
  };
  await persona.humanSend(sock2, CH, ['part one', 'part two'], {});
  check('chunks sent with invisible bot marker', sent.length === 2 && sent[0].text.startsWith('\u200B') && sent[1].text.includes('part two'));
  check('bot echoes own sends into its buffer (L2)', persona._internals.transcriptBlock(CH).includes('joker: part one'));

  // ─── 14. silentRetryTurn (L6) ───────────────────────────────────────────────
  let tries = 0;
  const heal = async () => { tries++; if (tries < 3) throw new Error('boom'); return 'ok'; };
  check('turn retried 2x in background then succeeds', await persona.silentRetryTurn(heal) === 'ok' && tries === 3);
  tries = 0;
  const cursed = async () => { tries++; throw new Error('boom'); };
  check('turn exhausted → null, never throws', await persona.silentRetryTurn(cursed) === null && tries === 3);

  // ─── 15. maybeAmbientChime end-to-end (L1+L6) ──────────────────────────────
  groqScript = ['lmao same tho'];
  const sentChime = [];
  const sock3 = { sendPresenceUpdate: async () => {}, sendMessage: async (c, x) => { sentChime.push(x); return {}; } };
  Math.random = () => 0;
  const ch = await persona.maybeAmbientChime({ sock: sock3, chatId: 'chime@g.us', isGroup: true, senderName: 'Mellow', text: 'this dungeon is rigged I swear' });
  check('ambient chime fires + sends', ch && ch.length === 1 && sentChime.length === 1 && sentChime[0].text.includes('lmao same'));
  const ch2 = await persona.maybeAmbientChime({ sock: sock3, chatId: 'chime@g.us', isGroup: true, senderName: 'Mellow', text: 'immediately after, should be cooldown-blocked' });
  check('ambient chime respects cooldown', ch2 === null);
  Math.random = () => 0.99;
  const ch3 = await persona.maybeAmbientChime({ sock: sock3, chatId: 'fresh@g.us', isGroup: true, senderName: 'M', text: 'roll should reject this one entirely' });
  check('ambient roll rejection → silence', ch3 === null);
  Math.random = realRandom;

  // ─── 16. REALGUY v2: persona prompt layers (owner round 2) ────────────────
  groqCalls = [];
  groqScript = ['yo.'];
  await persona.buildTurn({ chatId: CH, senderName: 'Mellow', text: 'yo', isAmbient: false });
  const sys2 = groqCalls[0].messages[0].content;
  check('L0: canonical Persona 5 anchor rides FIRST',
    sys2.startsWith('You are joker from Persona 5.'));
  check('L2: dev-claim hallucination fuel REMOVED', !sys2.includes('You also built') && !sys2.includes('You also built and run'));
  check('L2: identity rule present (never built/coded/tested)',
    sys2.includes("you didn't build, code, fix or test anything"));
  check('L2: redirects bot credit to mellow', sys2.includes('mellow builds stuff'));
  check('L2: no dev-support offers ("let me know if something\'s glitchy" banned)',
    sys2.includes("let me know if something's glitchy"));
  check('L3: grounding safeguards ported (no invented off-screen events)',
    sys2.includes('never invent events, activities or stories') && sys2.includes('i just tested it'));
  check('L3: topic-acknowledgment rule present', sys2.includes('answer what they actually said first'));
  check('L4: Gen Z emoji protocol in prompt', sys2.includes('EMOJIS: you almost never use them') && sys2.includes('only 💀 😭 🤨 👀 🙄 😏'));
  check('L4: banned AI-tell emojis named in prompt', sys2.includes('never 😎 🤖 💥 🫡 ✨ 🚀 🎉 🔥'));
  check('L5: few-shot exemplar block present (10 exchanges)',
    (sys2.match(/^you: /gm) || []).length === 10 && sys2.includes('EXAMPLES OF HOW YOUR TEXTS LOOK'));
  check('L5: bot-deflection exemplar pinned', sys2.includes('you: bold of you to ask'));
  check('L5: honesty exemplar (missed clip — ask, never fake it)', sys2.includes('nah i missed it, send it again'));
  check('L5: quote/card-context exemplar pinned', sys2.includes("[Replying to Joker's message") && sys2.includes('120 deer is a whole buffet'));
  check('L7: profileText layer rides into prompt when provided', (() => {
    groqCalls = []; groqScript = ['sup'];
    return persona.buildTurn({ chatId: CH, senderName: 'Mellow', text: 'hey', isAmbient: false, profileText: 'Nickname: Mel; mains samurai' })
      .then(() => groqCalls[0].messages[0].content.includes("PERSON YOU'RE TALKING TO") && groqCalls[0].messages[0].content.includes('mains samurai'));
  })());

  // ─── 17. REALGUY v2: deterministic emoji sanitizer ─────────────────────────
  const emojiRiddled = 'so sick 😎💥🤖 let\'s go 🔥✨🎉';
  Math.random = () => 0.99; // never re-add
  const stripped = persona.sanitizeEmoji(emojiRiddled);
  check('sanitizer strips ALL model emojis (banned set can never leak)',
    stripped === "so sick let's go" && !persona._internals.EMOJI_BANNED.some((e) => stripped.includes(e)));
  check('sanitizer keeps plain text intact', persona.sanitizeEmoji('lol ok bet') === 'lol ok bet');
  check('sanitizer preserves the BOT_MARKER (\\u200B)', persona.sanitizeEmoji('\u200Bplain reply') === '\u200Bplain reply');
  Math.random = () => 0; // always re-add
  const enriched = persona.sanitizeEmoji('nice one bro');
  check('sanitizer re-adds exactly ONE allowlist emoji at 100% roll',
    persona._internals.EMOJI_ALLOW.includes(enriched.split(' ').pop()) &&
    (enriched.match(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []).length === 1);
  Math.random = realRandom;
  // statistical envelope: 300 real-random runs → emoji rate ≈ 12% (bounded),
  // never more than one emoji, never a banned one
  let emojiCount = 0;
  const multiOrBanned = [];
  for (let i = 0; i < 300; i++) {
    const out = persona.sanitizeEmoji('some normal human sentence here');
    const found = out.match(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || [];
    if (found.length > 0) emojiCount++;
    if (found.length > 1 || found.some((f) => persona._internals.EMOJI_BANNED.includes(f)))
      multiOrBanned.push(out);
  }
  const emojiRate = emojiCount / 300;
  check(`sanitizer statistical envelope: rate ${(emojiRate * 100).toFixed(1)}% ∈ [2%,30%]`,
    emojiRate >= 0.02 && emojiRate <= 0.30);
  check('sanitizer never emits >1 emoji or banned glyphs across 300 runs', multiOrBanned.length === 0);
  Math.random = () => 0.99;
  check('cleanReplyText end-to-end: 😎💀 input → clean text out',
    persona.cleanReplyText('heh 😎 nice 💀') === 'heh nice');
  Math.random = realRandom;

  // ─── 18. REALGUY v2: engine.js source pins (intro restore + fast-path kill)
  const engineSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'core', 'engine.js'), 'utf8');
  check('old .on intro restored verbatim',
    engineSrc.includes('AI is now *enabled* in this ${isDM ? "DM" : "chat"}!'));
  check('old .off message restored verbatim',
    engineSrc.includes('AI is now *disabled* in this ${isDM ? "DM" : "chat"}!'));
  check('v1 intro slop REMOVED ("mention me, reply to me, or just talk")',
    !engineSrc.includes("mention me, reply to me, or just talk"));
  check("v1 .off slop REMOVED (\"I'm out of this\")", !engineSrc.includes("I'm out of this"));
  check('canned fast-path REMOVED (no _isShort fastResponses bark)',
    !engineSrc.includes('const _isShort'));
  check('contentFn wired (getContentDescription anchors persona)',
    engineSrc.includes('contentFn: () => botConfig.getContentDescription()'));
  check('profileText wired into persona buildTurn', engineSrc.includes('profileText: _profileText'));

  // ─── 19. REALGUY v2.5: name roster (nicknames vs WhatsApp names) ──────────
  const NCH = 'names@g.us';
  persona.initPersona({ botName: 'joker', system: systemStub, smartGroqCall: groqStub, modelFn: () => 'FAST',
    nameResolver: (jid) => (jid === 'prof@s.whatsapp.net' ? 'Mel' : null) });
  check('learnPushName persists WhatsApp name', persona.learnPushName(NCH, 'a@s.whatsapp.net', 'John Doe') === true
    && persona._internals.getNamesMap()[NCH]['a@s.whatsapp.net'].w === 'John Doe');
  check('learnPushName rejects junk', persona.learnPushName(NCH, 'a@s.whatsapp.net', 'someone') === false);
  check('moniker learned from "call me X"', persona.learnMonikerFromText(NCH, 'a@s.whatsapp.net', 'yo call me Shadow ok') === 'Shadow');
  check('moniker learned from "my name is X"', persona.learnMonikerFromText(NCH, 'b@s.whatsapp.net', "my name is Dave btw") === 'Dave');
  check('moniker learned from "I go by X"', persona.learnMonikerFromText(NCH, 'c@s.whatsapp.net', 'i go by Ghost around here') === 'Ghost');
  check('stoplisted moniker rejected ("call me dude")', persona.learnMonikerFromText(NCH, 'd@s.whatsapp.net', 'dude just call me Dude') === null);
  check('non-intro sentence rejected', persona.learnMonikerFromText(NCH, 'd@s.whatsapp.net', "let's call it a day guys") === null);
  check('bestName: moniker beats WhatsApp name', persona.bestName(NCH, 'a@s.whatsapp.net', 'x') === 'Shadow');
  check('bestName: profile nickname beats moniker', persona.bestName(NCH, 'prof@s.whatsapp.net', 'x') === 'Mel');
  check('bestName: WhatsApp name fallback', persona.bestName(NCH, 'b@s.whatsapp.net', 'x') === 'Dave');
  check('bestName: fallback when unknown', persona.bestName(NCH, 'zz@s.whatsapp.net', 'someone') === 'someone');
  const wb = persona.whoBlock(NCH, 'a@s.whatsapp.net');
  check('whoBlock: speaker + both name types', wb.includes("You're talking to Shadow") && wb.includes('"John Doe"') && wb.includes('they go by "Shadow"'));
  check('whoBlock: teaches the DIFFERENCE explicitly', wb.includes('WhatsApp display names are often random') && wb.includes("don't invent a name"));
  check('whoBlock empty without jid', persona.whoBlock(NCH, null) === '');
  persona.learnMonikerFor(NCH, 'e@s.whatsapp.net', 'Shad');
  persona.learnMonikerFor(NCH, 'e@s.whatsapp.net', 'Shady');
  persona.learnMonikerFor(NCH, 'e@s.whatsapp.net', 'Shad0w');
  persona.learnMonikerFor(NCH, 'e@s.whatsapp.net', 'Shad');
  check('monikers capped at 4 per person', persona._internals.getPersonEntry(NCH, 'e@s.whatsapp.net').m.length === 3);
  const rb = persona.rosterBlock(NCH, 'a@s.whatsapp.net');
  check('rosterBlock: lists others, skips speaker', rb.includes('Dave') && rb.includes('Ghost') && !rb.includes('Shadow'));
  check('rosterBlock: flags WhatsApp name when it differs', rb.includes('(WhatsApp name: John Doe)') === false && rb.includes('Dave'));
  // transcript renders BEST names (observe with jid → roster + moniker learn)
  persona.observe({ chatId: NCH, who: 'John Doe', jid: 'a@s.whatsapp.net', text: 'who is up for a raid' });
  check('transcript renders moniker, not raw WhatsApp name', persona._internals.transcriptBlock(NCH).includes('Shadow: who is up for a raid'));
  check('observe with jid learned pushname via transcript path', persona._internals.getPersonEntry(NCH, 'a@s.whatsapp.net').w === 'John Doe');
  groqCalls = []; groqScript = ['yo'];
  await persona.buildTurn({ chatId: NCH, senderName: 'John Doe', senderJid: 'a@s.whatsapp.net', text: 'hey', isAmbient: false });
  const sys3 = groqCalls[0].messages[0].content;
  check("prompt: WHO YOU'RE TALKING TO block rides with senderJid", sys3.includes("WHO YOU'RE TALKING TO") && sys3.includes("You're talking to Shadow"));
  check('prompt: PEOPLE YOU KNOW roster rides', sys3.includes('PEOPLE YOU KNOW IN THIS CHAT') && sys3.includes('Dave'));
  check('prompt: NAMES style rule present (whoBlock teaches it)', sys3.includes('never use their WhatsApp name when you know what they go by') && sys3.includes("don't invent a name"));
  check('prompt: REMEMBER name hint present', sys3.includes('goes by <what they said>'));

  // ─── 20. REALGUY v2.5: engine.js source pins ───────────────────────────────
  check('trigger: ALWAYS quotes the triggering message', engineSrc.includes('{ quoteM: m },'));
  // 💡 REALGUY v3 pins (owner round 4)
  check('v3: cached replies quote too (quoteM on both send paths)', (engineSrc.match(/\{ quoteM: m \},/g) || []).length === 2);
  check('v3: quoted card/photo gets a label (no more zero context)', engineSrc.includes('(a card/photo, no caption)') && engineSrc.includes("(it's a card/image)"));
  check('old conditional quote REMOVED', !engineSrc.includes('quoteM: isReplyToBot ? m : null'));
  check('trigger: digits-only LID/JID compare present', engineSrc.includes('const _digitsOf = (j) => String(j || "")') && engineSrc.includes('const _botIdDigits'));
  check('trigger: mention uses digit-core match', engineSrc.includes('_mentionedDigits.some'));
  check('trigger: reply-to-bot uses digit-core match', engineSrc.includes('_botIdDigits.includes(_quotedDigits)'));
  check('trigger: @<digits> text-fragment fallback present', engineSrc.includes('_mentionFragmentRe'));
  check('trigger: observability log line present', engineSrc.includes('🎯 [AI] trigger='));
  check('trigger: nameResolver wired into initPersona', engineSrc.includes('nameResolver: (jid) =>'));
  check('observe gets jid (roster learns every message)', engineSrc.includes('jid: senderJid, // 💡 REALGUY v2.5: identity for the name roster'));
  check('ambient chime gets senderJid', engineSrc.includes('senderJid, // 💡 REALGUY v2.5: ambient turns get identity too'));
  check('buildTurn gets senderJid (WHO IS WHO block)', engineSrc.includes('senderJid, // 💡 REALGUY v2.5: powers the WHO'));

  console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
  // let stdout drain (process.exit on a pipe truncates buffered console.log)
  process.exitCode = fails === 0 ? 0 : 1;
})().catch((e) => { console.error('HARNESS CRASH:', e); process.exit(1); });
