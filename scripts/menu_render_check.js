#!/usr/bin/env node
/** Live menu render check (no WhatsApp): simulates sendBotMenu paths at box HEAD. */
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const REG = require(path.join(ROOT, 'core/utils/commandRegistry'));
const { MOD_MENU, MOD_TIPS } = require(path.join(ROOT, 'core/utils/modMenuData'));
const fs = require('fs');
const engine = fs.readFileSync(path.join(ROOT, 'core/engine.js'), 'utf8');

// 1. tips array parses & count
const tipsMatch = engine.match(/const TIPS = \[([\s\S]*?)\n      \];/);
const tipLiterals = [...tipsMatch[1].matchAll(/`([^`]+)`/g)].map(m => m[1]);
console.log('regular tips parsed:', tipLiterals.length);

// 2. mod tips parse + {p} swap
console.log('mod tips parsed:', MOD_TIPS.length, '| sample:', MOD_TIPS[19] ? MOD_TIPS[19].replaceAll('{p}', '.j').slice(0, 70) : 'MISSING');

// 3. pagination simulation for the biggest cats
function pages(cat) {
  const prefix = '.j';
  const lines = REG[cat].map(c => '➤ `' + prefix + ' ' + c.cmd + '` - ' + c.desc.split('.')[0]);
  const out = []; let cur = [], len = 0;
  for (const ln of lines) {
    if (cur.length && len + ln.length + 1 > 870) { out.push(cur); cur = []; len = 0; }
    cur.push(ln); len += ln.length + 1;
  }
  if (cur.length) out.push(cur);
  return out;
}
for (const cat of ['RPG', 'GAMES', 'CARDS']) {
  const p = pages(cat);
  const worst = Math.max(...p.map(x => x.length));
  console.log(`${cat}: ${p.length} pages, worst page ${worst} chars ${worst <= 1024 ? 'OK' : 'OVER!'}`);
  console.log(`  p${p.length} last cmd: ` + REG[cat][REG[cat].length - 1].cmd);
}

// 4. explain-mode for brand-new commands resolves in BOTH menus
const findReg = (q) => { for (const [cat, cmds] of Object.entries(REG)) { const hit = cmds.find(c => c.cmd.toLowerCase() === q); if (hit) return { cat, ...hit }; } return null; };
for (const q of ['itemmarket', 'anim', 'quiz logos', 'gw forcestart', 'dglord', 'tutorial']) {
  const hit = findReg(q);
  console.log(`explain ${q}: ${hit ? hit.cat : 'MISSING'}`);
}
const flat = {};
for (const [k, v] of Object.entries(MOD_MENU)) for (const c of v.commands) flat[c.cmd.toLowerCase()] = c;
for (const q of ['gw forcestart', 'tokenlb', 'src', 'mentor', 'diag']) {
  console.log(`mod-explain ${q}: ${flat[q] ? 'OK' : 'MISSING'}`);
}


// 5. Native menu regression checks (no WhatsApp connection required)
const assert = require('node:assert/strict');
const nativeMenu = require(path.join(ROOT, 'core/commands/listMenu'));

(async () => {
  const diag = nativeMenu._diag();
  assert.equal(diag.catCount, diag.categories.length, 'every visible category appears exactly once');
  assert.equal(diag.catOnce, true, 'native category row IDs must be unique');
  assert.ok(diag.maxRowsPerSection <= 10, 'single-select sections must stay within the 10-row cap');
  assert.ok(diag.maxTitle <= 24, 'native row/section titles must stay within 24 characters');
  assert.ok(diag.maxDesc <= 72, 'native row descriptions must stay within 72 characters');

  const wrappedTap = {
    message: {
      ephemeralMessage: {
        message: {
          interactiveResponseMessage: {
            nativeFlowResponseMessage: {
              name: 'single_select',
              paramsJson: JSON.stringify({ id: 'jmenu:RPG' })
            }
          }
        }
      }
    }
  };
  assert.equal(nativeMenu.extractMenuRowId(wrappedTap), 'jmenu:RPG');
  assert.equal(nativeMenu.isMenuTap(wrappedTap), true);

  const legacyTap = {
    message: {
      listResponseMessage: {
        singleSelectReply: { selectedRowId: 'jmenu:GAMES' }
      }
    }
  };
  assert.equal(nativeMenu.extractMenuRowId(legacyTap), 'jmenu:GAMES');

  let routedArgs = null;
  await nativeMenu.handleMenuTap({}, 'chat@s.whatsapp.net', 'user@s.whatsapp.net', 'jmenu:GAMES', {
    sendBotMenu: async (...args) => { routedArgs = args; }
  });
  assert.deepEqual(routedArgs[3], ['games'], 'category taps must invoke the existing category renderer');

  const relayed = [];
  const fakeSock = {
    user: { id: '19999999999@s.whatsapp.net' },
    relayMessage: async (jid, message, options) => { relayed.push({ jid, message, options }); }
  };
  await nativeMenu.sendListMenu(fakeSock, '120363000000000000@g.us', '19999999999@s.whatsapp.net');
  assert.equal(relayed.length, 1, 'native menu must relay one interactive message');
  const button = relayed[0].message.interactiveMessage.nativeFlowMessage.buttons[0];
  assert.equal(button.name, 'single_select');
  const params = JSON.parse(button.buttonParamsJson);
  assert.equal(Object.hasOwn(params, 'status'), false, 'do not send unsupported single_select params');
  assert.ok(params.title && Array.isArray(params.sections) && params.sections.length);

  console.log('[MENU QA] native payload, category routing, wrapped taps and row limits: PASS');
})().catch((error) => {
  console.error('[MENU QA] native menu regression failed:', error);
  process.exitCode = 1;
});
