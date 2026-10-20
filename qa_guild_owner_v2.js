// 47-k6 guild owner gate QA (rebuilt after sandbox reset) - validates isGuildOwner
// against the LIVE guild roster. Every loaded guild's leader must pass in raw (@lid)
// form AND cross-format (phone) form; unknown/empty/undefined senders must fail.
// Guards the be90da3c8 fix after 4d612b4fa touched loadGuilds/syncGuild
// (continent/marker persistence) - the guildOwners rebuild must still hold.
process.env.CARD_DIAG = '1';
const mongoose = require('mongoose');
mongoose.set('bufferTimeoutMS', 45000);
const connectDB = require('./db');
const guilds = require('./core/rpg/guilds');
const lidResolver = require('./core/utils/lidResolver');

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS', name, extra || ''); }
  else { fail++; console.log('FAIL', name, extra || ''); }
};

(async () => {
  await connectDB();
  await guilds.loadGuilds();
  const info = guilds.getGuildInfo();
  const recs = Object.values((info && info.guilds) || {});
  console.log('guilds loaded:', recs.length);
  check('guild roster non-empty', recs.length >= 1);

  for (const g of recs) {
    const leader = g.leader || g.owner;
    const label = g.name || g.guildId || '?';
    if (!leader) { console.log('SKIP', label, '(no leader field)'); continue; }
    check(`leader raw ${label} [${leader}]`, (await guilds.isGuildOwner(leader)) === true);
    let phone = null;
    try { phone = lidResolver.resolveToPhone(leader); } catch (e) { /* no mapping */ }
    if (phone && phone !== leader) {
      check(`leader phone-form ${label} [${phone}]`, (await guilds.isGuildOwner(phone)) === true);
    }
  }
  check('unknown s.whatsapp.net rejected', (await guilds.isGuildOwner('000000000@s.whatsapp.net')) === false);
  check('unknown @lid rejected', (await guilds.isGuildOwner('999999999999@lid')) === false);
  check('empty string rejected', (await guilds.isGuildOwner('')) === false);
  check('undefined rejected', (await guilds.isGuildOwner(undefined)) === false);
  console.log(`RESULT ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e.stack); process.exit(1); });
