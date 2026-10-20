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
const cleaned = persona.cleanReplyText(mixed);
check('cleanReplyText strips all tags + markdown', !cleaned.includes('[SEARCH') && !cleaned.includes('[REMEMBER') && !cleaned.includes('**'));
check('cleanReplyText strips bot: prefix', persona.cleanReplyText('**Bot:** yeah lol') === 'yeah lol');

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
  check('system prompt carries persona rules', groqCalls[0].messages[0].content.includes('You are joker') && groqCalls[0].messages[0].content.includes('NOT an AI'));
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

  console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
  // let stdout drain (process.exit on a pipe truncates buffered console.log)
  process.exitCode = fails === 0 ? 0 : 1;
})().catch((e) => { console.error('HARNESS CRASH:', e); process.exit(1); });
