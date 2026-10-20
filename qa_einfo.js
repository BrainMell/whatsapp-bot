// 47-k2 einfo QA - drives the REAL cardSystem dispatcher with a dummy sock.
// Verifies: (1) bare `.j einfo` now returns a compact category summary,
// (2) `.j einfo <cat> | <anime>` combined search works (was broken),
// (3) legacy `.j info <cat> event | <anime>` still works,
// (4) big categories cap the listing at 40 with a narrowing hint,
// (5) all produced messages fit WhatsApp's 65k ceiling.
process.env.CARD_DIAG = '1';
const mongoose = require('mongoose');
mongoose.set('bufferTimeoutMS', 45000);
const connectDB = require('./db');
const cs = require('./core/rpg/cardSystem');

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS', name, extra || ''); }
  else { fail++; console.log('FAIL', name, extra || ''); }
};

(async () => {
  await connectDB();
  const sent = [];
  const sock = { sendMessage: async (chatId, content) => { sent.push({ chatId, content }); return { key: { id: 'qa' } }; } };
  await cs.init(sock, [], [], 'owner@lid');

  const run = async (label, txt) => {
    sent.length = 0;
    await cs.handleCommand({ lowerTxt: txt.toLowerCase(), txt, senderJid: 'owner@lid', chatId: 'qa@g.us', m: {}, isOwner: true, senderIsAdmin: false, isMod: false });
    const texts = sent.map(s => String(s.content.text || s.content.caption || ''));
    return { texts, joined: texts.join('\n'), totalLen: texts.join('').length };
  };

  // (1) bare einfo -> category summary
  let r = await run('bare', '.j einfo');
  check('bare einfo sends exactly one short message', r.texts.length === 1 && r.totalLen < 2000, '| len=' + r.totalLen);
  check('bare einfo is a category summary', r.joined.includes('categories') && r.joined.includes('Halloween') && r.joined.includes('Christmas'));
  check('bare einfo shows usage hints', r.joined.includes('einfo halloween') && r.joined.includes('| <anime>'));

  // (2) the combined search that was broken: einfo <cat> | <anime>
  r = await run('einfo pipe', '.j einfo halloween | re:zero');
  check('einfo halloween | re:zero -> 9 hits (event mode reached)', r.joined.includes('Found 9 event card'), '| got: ' + (r.joined.match(/Found \d+ event card/) || [r.joined.slice(0, 80)])[0]);
  check('pipe result is event-mode list (no generic NOT FOUND)', !r.joined.includes('CARD NOT FOUND'));

  // (3) legacy info route unchanged
  r = await run('info pipe', '.j info halloween event | re:zero');
  check('info halloween event | re:zero -> 9 hits', r.joined.includes('Found 9 event card'), '| got: ' + (r.joined.match(/Found \d+ event card/) || [r.joined.slice(0, 80)])[0]);

  // (4) anime-wide search + cap
  r = await run('einfo anime', '.j einfo re:zero');
  check('einfo re:zero -> 61 hits', r.joined.includes('Found 61 event card'), '| got: ' + (r.joined.match(/Found \d+ event card/) || [r.joined.slice(0, 80)])[0]);
  r = await run('einfo summer', '.j einfo summer');
  check('einfo summer caps at 40 + narrowing hint', r.joined.includes('showing first 40') && r.joined.includes('more. Narrow it'), '| got: ' + (r.joined.match(/Found \d+ event card/) || ['?'])[0]);
  check('summer listing lines capped (no 600-line wall)', (r.joined.match(/▫️/g) || []).length === 40, '| lines=' + (r.joined.match(/▫️/g) || []).length);

  // (5) every message fits WhatsApp
  check('all captured messages < 65k chars', sent.every(s => String(s.content.text || '').length < 65000));

  console.log('RESULT ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('QA ERR', e.stack); process.exit(1); });
