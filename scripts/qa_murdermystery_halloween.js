#!/usr/bin/env node
'use strict';

// Static regression checks for the Halloween/Murder Mystery renderer and phase
// chain. This intentionally uses Node built-ins only, so deployment preflight
// can run it before production dependencies or the bot runtime are touched.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const gameDir = path.join(__dirname, '..', 'core', 'games', 'murdermystery');
const indexSrc = fs.readFileSync(path.join(gameDir, 'index.js'), 'utf8');
const cardSrc = fs.readFileSync(path.join(gameDir, 'halloweenCards.js'), 'utf8');

function check(condition, message) {
  assert.ok(condition, message);
  console.log('PASS', message);
}

// Regression: the intro scheduler must not read a callback-scoped variable
// before the timer starts; every card send failure must still advance the chain.
const introStart = indexSrc.indexOf('function scheduleIntros(sock, chatId, cast) {');
const introEnd = indexSrc.indexOf('\nfunction butlerOf(g)', introStart);
assert.ok(introStart >= 0 && introEnd > introStart, 'intro scheduler exists');
const intro = indexSrc.slice(introStart, introEnd);
const introCode = intro.replace(/\/\/[^\\n]*/g, '');
check(intro.includes('const testMode = !!g.testMode') && !introCode.includes('gg.testMode') && introCode.includes('(testMode ? 500 : INTRO_FIRST_MS)'), 'intro timer delay uses the captured game mode, not callback-scoped gg');
check(intro.includes('finally') && intro.includes('step(i + 1)'), 'intro chain advances even after a card send failure');
check(intro.includes('beginNight(sockForGame(current), chatId)'), 'last guest card transitions into NIGHT');
check(indexSrc.includes("const discussionMs = g.testMode ? 18000 : DISCUSS_MS") &&
  indexSrc.includes("const votingMs = g.testMode ? 12000 : VOTE_MS"),
  'sandbox discussion and vote windows use their accelerated durations');
check(indexSrc.includes('if (!g || !g.deadline || g.testMode) return;'),
  'sandbox does not send misleading production-length phase reminders');

// Regression: use real existing scene art, not a hand-drawn mansion silhouette.
const scenesMatch = cardSrc.match(/const SCENES = \{([\s\S]*?)\n\};/);
assert.ok(scenesMatch, 'Halloween scene map exists');
const scenes = [...scenesMatch[1].matchAll(/\b([a-zA-Z]+)\s*:\s*'([a-z0-9_]+)'/g)];
assert.ok(scenes.length >= 10, 'multiple scene-backed card types are mapped');
for (const [, kind, scene] of scenes) {
  check(fs.existsSync(path.join(gameDir, 'assets', 'bg', scene + '.jpg')),
    'scene "' + kind + '" uses bundled asset ' + scene + '.jpg');
}
check(cardSrc.includes('await drawScene(ctx,w,h,tall,kind)'),
  'Halloween card renderer actually paints the selected room scene');
check(!cardSrc.includes('const mxn=w*.32') && !cardSrc.includes('function backdrop('),
  'old manually drawn house backdrop is removed');

// Regression: private role cards state the actual game role, and faint cut-out
// alpha is strengthened without replacing the character assets.
check(!/YOUR HALLOWEEN IDENTITY/i.test(cardSrc), 'confusing Halloween identity heading is removed');
check(cardSrc.includes('const ROLE_CARD_STYLE = {') &&
  ['KILLER','INVESTIGATOR','GUARDIAN','MEDIUM','BUTLER','ACCOMPLICE','CIVILIAN'].every(role =>
    new RegExp('\\b' + role + '\\s*:', 'm').test(cardSrc.slice(cardSrc.indexOf('const ROLE_CARD_STYLE = {'), cardSrc.indexOf('};', cardSrc.indexOf('const ROLE_CARD_STYLE = {')) + 2))),
  'role cards have role-specific titles and colours');
check(/px\[i\] > 0\) px\[i\] = Math\.min\(255, Math\.round\(px\[i\] \* 1\.\d+\)\)/.test(cardSrc),
  'semi-transparent character cut-outs are strengthened during rendering');

console.log('Halloween/Murder Mystery regression checks passed.');
