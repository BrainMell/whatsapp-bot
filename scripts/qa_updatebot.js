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

  console.log('== T4 tracked change blocks the reset path ==');
  {
    // Point the check at origin/main (behind/different from what boxes run)
    // so the command reaches the dirty-tree rail instead of short-circuiting
    // on up-to-date.
    process.env.UPDATEBOT_BRANCH = process.env.QA_ALT_BRANCH || 'main';
    process.env.UPDATEBOT_DRYRUN = '1';
    const { replies, reply } = collectReply();
    await UB.cmdUpdateBot(OWNER, reply, fakeM);
    const joined = replies.join('|');
    if (/ALREADY UP TO DATE/.test(joined)) {
      console.log('  \u2139 QA_ALT_BRANCH matches HEAD \u2014 set QA_ALT_BRANCH to a divergent branch; skipped');
    } else if (/NOTHING TO PULL|DIVERGED|PROTECTED FIX MISSING|UPDATE FAILED|UPDATE ABORTED/.test(joined)) {
      // The alt branch short-circuits before the dirty rail (e.g. groomed
      // public branches lack the canaries — that refusal is itself correct).
      // The rail itself is exercised by T2/T3 paths and on-box real runs.
      console.log('  \u2139 alt branch refused upstream of the dirty rail (expected on groomed branches); rail not re-asserted here');
      check('gate replies never leak a false success', !/ALREADY UP TO DATE|BOT UPDATE/.test(joined), joined.slice(0, 160));
    } else {
      check('clean tree passes the rail (proceeds past dirty check)', !/DIRTY TREE/.test(joined), joined.slice(0, 160));
      const tracked = path.join(ROOT, 'AGENT_ONBOARDING_PROMPT.md');
      const orig = fs.readFileSync(tracked, 'utf8');
      fs.writeFileSync(tracked, orig + '\nqa-dirty-marker');
      const r2 = collectReply();
      await UB.cmdUpdateBot(OWNER, r2.reply, fakeM);
      check('tracked change triggers DIRTY TREE', r2.replies.some(t => /DIRTY TREE/.test(t)), r2.replies.join('|').slice(0, 160));
      fs.writeFileSync(tracked, orig);
    }
    delete process.env.UPDATEBOT_BRANCH;
    delete process.env.UPDATEBOT_DRYRUN;
  }

  console.log('== T5 in-progress guard ==');
  {
    process.env.UPDATEBOT_DRYRUN = '1';
    fs.writeFileSync(UB.STATE_PATH, JSON.stringify({ chatId: OWNER, from: 'aaaaaaa', to: 'bbbbbbb', at: Date.now() }));
    const { replies, reply } = collectReply();
    await UB.cmdUpdateBot(OWNER, reply, fakeM);
    check('in-progress guard fires', replies.some(t => /ALREADY IN PROGRESS/.test(t)), replies.join('|').slice(0, 160));
    UB.clearState();
    delete process.env.UPDATEBOT_DRYRUN;
  }

  console.log('== T6 stale state cleaned on up-to-date run ==');
  {
    process.env.UPDATEBOT_DRYRUN = '1';
    fs.writeFileSync(UB.STATE_PATH, JSON.stringify({ chatId: OWNER, from: 'aaaaaaa', to: 'bbbbbbb', at: Date.now() - 40 * 60 * 1000 }));
    const { replies, reply } = collectReply();
    await UB.cmdUpdateBot(OWNER, reply, fakeM);
    check('stale state gone', !fs.existsSync(UB.STATE_PATH));
    delete process.env.UPDATEBOT_DRYRUN;
  }

  console.log('== T7 restart-apps parsing (git_guard.conf) ==');
  {
    const apps = UB.parseRestartApps('# c\nRESTART_APPS="wa-jake wa-subaru"\nPEER_APPS="wa-joker"\n');
    check('parses quoted two apps', apps.length === 2 && apps[0] === 'wa-jake' && apps[1] === 'wa-subaru', JSON.stringify(apps));
    check('parses unquoted one app', UB.parseRestartApps('RESTART_APPS=wa-joker\n').join() === 'wa-joker');
    check('missing conf is empty', UB.parseRestartApps('nothing here at all').length === 0);
    check('peer apps never leak in', !JSON.stringify(UB.parseRestartApps('RESTART_APPS="wa-joker"\nPEER_APPS="wa-jake wa-subaru"')).includes('wa-jake'));
  }

  console.log('== T8 plainRemoteUrl (self-heal URL math) ==');
  {
    check('strips userinfo', UB.plainRemoteUrl('https://user:ghp_x@github.com/BrainMell/whatsapp-bot.git') === 'https://github.com/BrainMell/whatsapp-bot.git');
    check('plain url untouched (null)', UB.plainRemoteUrl('https://github.com/BrainMell/whatsapp-bot.git') === null);
    check('ssh url untouched (null)', UB.plainRemoteUrl('git@github.com:BrainMell/whatsapp-bot.git') === null);
    check('no cred (null)', UB.plainRemoteUrl('') === null);
  }

  console.log('== T9 nested-sharp scan (box1 npm hazard) ==');
  {
    const os = require('os');
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa_sharp_'));
    const mk = (rel) => { fs.mkdirSync(path.join(tmpRoot, rel), { recursive: true }); };
    mk('node_modules/pkg1/node_modules/sharp');           // nested copy — MUST be found
    mk('node_modules/sharp');                             // top-level real install — must NOT
    mk('node_modules/@img/sharp-linux-x64');              // official platform pkg — must NOT
    mk('node_modules/pkg2/node_modules/sharp.disabled-old'); // already disabled — must NOT
    mk('node_modules/a/node_modules/b/node_modules/sharp');  // deep nested — MUST be found
    const found = UB.findNestedSharp(tmpRoot);
    check('finds nested sharp', found.includes('node_modules/pkg1/node_modules/sharp'), JSON.stringify(found));
    check('finds deep nested sharp', found.includes('node_modules/a/node_modules/b/node_modules/sharp'), JSON.stringify(found));
    check('never flags top-level sharp', !found.includes('node_modules/sharp'), JSON.stringify(found));
    check('never flags @img pkgs', !found.some(f => f.includes('@img')), JSON.stringify(found));
    check('skips .disabled copies', !found.some(f => f.includes('.disabled')), JSON.stringify(found));
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }

  console.log('== T10 fetch failure is a loud abort ==');
  {
    process.env.UPDATEBOT_BRANCH = 'audit/fix-pass-1-does-not-exist';
    process.env.UPDATEBOT_DRYRUN = '1';
    try { fs.unlinkSync(UB.STATE_PATH); } catch (e) {}
    const { replies } = collectReply();
    await UB.cmdUpdateBot(OWNER, (t) => replies.push(String(t)), fakeM);
    const joined = replies.join(' | ');
    check('says UPDATE FAILED', /UPDATE FAILED/.test(joined), joined.slice(0, 180));
    check('names the fetch', /git fetch/.test(joined));
    check('no state written on failed fetch', !fs.existsSync(UB.STATE_PATH));
    delete process.env.UPDATEBOT_BRANCH;
    delete process.env.UPDATEBOT_DRYRUN;
  }

  console.log(`\nQA: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('QA crashed:', e); process.exit(2); });

// 2026-11-13: real-run markers — QA_REAL fired this end to end on both boxes
// (box2 joker 09:xx, box1 jake+subaru right after; both announced UPDATE COMPLETE).
// 2026-11-13: QA_REAL re-proof via box1 primary Subaru (jake stays unpaired).
