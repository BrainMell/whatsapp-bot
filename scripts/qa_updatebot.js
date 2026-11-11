#!/usr/bin/env node
// scripts/qa_updatebot.js — QA harness for core/rpg/systems/cards/updatebot.js
//
// Run on a box:  node scripts/qa_updatebot.js
// Real restart:  QA_REAL=1 QA_PMID=<pm2 id> node scripts/qa_updatebot.js
//   (pulls the latest branch for real and pm2-restarts that process — the
//    boot announce DM goes to the owner JID below, proving the full loop)
'use strict';
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const UB = require(path.join(ROOT, 'core', 'rpg', 'systems', 'cards', 'updatebot.js'));

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  \u2714 ${name}`); }
  else { fail++; console.log(`  \u2718 ${name}${extra ? ' | ' + String(extra).slice(0, 220) : ''}`); }
}

function collectReply() {
  const replies = [];
  return { replies, reply: async (t) => { replies.push(String(t)); } };
}

const OWNER = '233201487480@s.whatsapp.net';
const fakeM = { key: { remoteJid: OWNER } };

(async () => {
  if (process.env.QA_REAL === '1') {
    console.log('== REAL RUN: pull latest + pm2 restart ==');
    if (process.env.QA_PMID) process.env.pm_id = process.env.QA_PMID;
    const { replies, reply } = collectReply();
    await UB.cmdUpdateBot(OWNER, reply, fakeM);
    console.log(replies.join('\n---\n'));
    console.log(`[qa] state pending: ${fs.existsSync(UB.STATE_PATH)}`);
    console.log(`[qa] pm2 restart leg will fire for pm_id=${process.env.pm_id || '(unset)'}`);
    setTimeout(() => process.exit(0), 6000);
    return;
  }

  console.log('== T1 buildAnnounceText ==');
  const txt = UB.buildAnnounceText({ from: 'aaaaaaaaaaa', to: 'bbbbbbbbbbb', branch: 'audit/fix-pass-1', commits: 2, subjects: ['a: one', 'b: two'] });
  check('has UPDATE COMPLETE', /UPDATE COMPLETE/.test(txt));
  check('has both shas', txt.includes('aaaaaaa') && txt.includes('bbbbbbb'));
  check('has subjects', txt.includes('a: one') && txt.includes('b: two'));

  console.log('== T2 command flow (real git, dry-run) ==');
  try { fs.unlinkSync(UB.STATE_PATH); } catch (e) {}
  {
    process.env.UPDATEBOT_DRYRUN = '1';
    const { replies, reply } = collectReply();
    await UB.cmdUpdateBot(OWNER, reply, fakeM);
    const joined = replies.join(' | ');
    if (/ALREADY UP TO DATE/.test(joined)) {
      check('up-to-date path', true);
      check('up-to-date has sha', /`[0-9a-f]{7}`/.test(joined));
    } else {
      check('behind path plan', /BOT UPDATE/.test(joined), joined.slice(0, 200));
      check('plan shows arrow', /\`[0-9a-f]{7}\` \u2192 \`[0-9a-f]{7}\`/.test(joined));
      check('plan lists commits', /\u2022 /.test(joined));
      check('restart warning present', /restarting in a few seconds/.test(joined));
      check('dry-run skip note', /Dry-run/.test(joined));
    }
    check('no state left after dry-run', !fs.existsSync(UB.STATE_PATH));
    delete process.env.UPDATEBOT_DRYRUN;
  }

  console.log('== T3 untracked files must not block ==');
  {
    const dirtyFile = path.join(ROOT, 'core', 'data', 'qa_dirty_marker.tmp');
    fs.mkdirSync(path.join(ROOT, 'core', 'data'), { recursive: true });
    fs.writeFileSync(dirtyFile, 'x');
    process.env.UPDATEBOT_DRYRUN = '1';
    const { replies, reply } = collectReply();
    await UB.cmdUpdateBot(OWNER, reply, fakeM);
    check('untracked does not trigger DIRTY TREE', !replies.some(t => /DIRTY TREE/.test(t)), replies.join('|').slice(0, 160));
    fs.unlinkSync(dirtyFile);
    delete process.env.UPDATEBOT_DRYRUN;
  }

  console.log('== T4 tracked change blocks ==');
  {
    const tracked = path.join(ROOT, 'CHANGES.md');
    const orig = fs.readFileSync(tracked, 'utf8');
    fs.writeFileSync(tracked, orig + '\nqa-dirty-marker');
    process.env.UPDATEBOT_DRYRUN = '1';
    const { replies, reply } = collectReply();
    await UB.cmdUpdateBot(OWNER, reply, fakeM);
    check('tracked change triggers DIRTY TREE', replies.some(t => /DIRTY TREE/.test(t)), replies.join('|').slice(0, 160));
    fs.writeFileSync(tracked, orig);
    delete process.env.UPDATEBOT_DRYRUN;
  }

  console.log('== T5 in-progress guard ==');
  {
    fs.writeFileSync(UB.STATE_PATH, JSON.stringify({ chatId: OWNER, from: 'aaaaaaa', to: 'bbbbbbb', at: Date.now() }));
    const { replies, reply } = collectReply();
    await UB.cmdUpdateBot(OWNER, reply, fakeM);
    check('in-progress guard fires', replies.some(t => /ALREADY IN PROGRESS/.test(t)), replies.join('|').slice(0, 160));
    UB.clearState();
  }

  console.log('== T6 stale state cleaned on up-to-date run ==');
  {
    fs.writeFileSync(UB.STATE_PATH, JSON.stringify({ chatId: OWNER, from: 'aaaaaaa', to: 'bbbbbbb', at: Date.now() - 40 * 60 * 1000 }));
    const { replies, reply } = collectReply();
    await UB.cmdUpdateBot(OWNER, reply, fakeM);
    check('stale state gone', !fs.existsSync(UB.STATE_PATH));
  }

  console.log(`\nQA: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('QA crashed:', e); process.exit(2); });
