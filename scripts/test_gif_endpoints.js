// scripts/test_gif_endpoints.js
// Verifies the 2026-09-01 reaction-GIF endpoint overhaul (Task 4):
//   dead endpoint: api.waifu.pics (NXDOMAIN) + nekos.best (Cloudflare 403)
//   new sources:   nekos.life v2 + PurrBot v2 with full category maps
// LIVE-NETWORK test — run where outbound HTTPS is allowed (sandbox + server).
//  - Part A: every one of the 85 reaction types resolves to a GIF URL
//  - Part B: full handleReaction pipeline (download + ffmpeg GIF→MP4 + send)
//            against a mock sock, for kiss (targeted) + kill + wave (self)

const path = require('path');
const REACTIONS = require('../reactions/config');
const { fetchGifUrl, handleReaction } = require('../reactions/handler');

let pass = 0, fail = 0, skipped = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`[+] ${name} ✅`); }
  else { fail++; console.error(`[-] ${name} ❌ ${detail}`); }
}

async function withRetry(fn, tries = 2, backoffMs = 1500) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { lastErr = e; }
    await new Promise(r => setTimeout(r, backoffMs));
  }
  throw lastErr;
}

async function main() {
  // ─── PART A: all 85 categories resolve ───
  console.log('=== PART A: fetchGifUrl resolves every reaction type ===');
  const failures = [];
  for (const r of REACTIONS) {
    let url = null;
    try {
      url = await withRetry(() => fetchGifUrl(r.type));
    } catch (e) { /* leave null */ }
    if (url && /^https?:\/\//.test(url)) {
      pass++;
    } else {
      fail++;
      failures.push(r.type);
      console.error(`    [-] ${r.type} — no URL`);
    }
    // small delay to be polite to the APIs
    await new Promise(res => setTimeout(res, 350));
  }
  console.log(`    resolved ${REACTIONS.length - failures.length}/${REACTIONS.length} categories`);

  // Key regressions from the bug report
  console.log('\n=== PART A2: key categories (the reported broken ones) ===');
  for (const key of ['kill', 'kiss', 'slap', 'wave', 'cry', 'smile']) {
    try {
      const url = await withRetry(() => fetchGifUrl(key));
      check(`${key} → ${url.slice(0, 60)}...`, true);
    } catch (e) {
      check(`${key} resolves`, false, e.message);
    }
    await new Promise(res => setTimeout(res, 350));
  }

  // ─── PART B: full pipeline with mock sock ───
  console.log('\n=== PART B: handleReaction end-to-end (mock sock) ===');
  const sent = [];
  const mockSock = {
    user: { id: 'bot@s.whatsapp.net' },
    sendMessage: async (chatId, content, opts) => { sent.push({ chatId, content, opts }); }
  };
  const makeMsg = (text, mentionedJid) => ({
    key: { remoteJid: '120363026316393285@g.us', participant: 'user1@s.whatsapp.net' },
    message: {
      extendedTextMessage: {
        text,
        contextInfo: { mentionedJid, participant: 'user1@s.whatsapp.net' }
      }
    }
  });

  // B1: targeted kiss
  try {
    await handleReaction(mockSock, makeMsg('.j kiss', ['target1@s.whatsapp.net']),
      'kiss', '💋', true, 'chat1@g.us', 'user1@s.whatsapp.net', 'User One');
    const m = sent[0];
    check('kiss: sent something', !!m);
    check('kiss: sent VIDEO (gifPlayback)', !!m?.content?.video && m.content.gifPlayback === true, JSON.stringify(m?.content || {}).slice(0, 120));
    check('kiss: caption mentions both users', /user1/.test(m?.content?.caption || '') && /target1/.test(m?.content?.caption || ''));
  } catch (e) {
    check('kiss pipeline', false, e.message);
  }

  // B2: .gif kill — THE reported broken command
  try {
    sent.length = 0;
    await handleReaction(mockSock, makeMsg('.j kill', ['target1@s.whatsapp.net']),
      'kill', '⚰️', true, 'chat1@g.us', 'user1@s.whatsapp.net', 'User One');
    const m = sent[0];
    check('kill: sent VIDEO (gifPlayback)', !!m?.content?.video && m.content.gifPlayback === true, JSON.stringify(m?.content || {}).slice(0, 120));
    check('kill: caption says kills', /kills/.test(m?.content?.caption || ''));
  } catch (e) {
    check('kill pipeline', false, e.message);
  }

  // B3: self reaction (wave) — no target needed
  try {
    sent.length = 0;
    await handleReaction(mockSock, makeMsg('.j wave', []),
      'wave', '👋', false, 'chat1@g.us', 'user1@s.whatsapp.net', 'User One');
    const m = sent[0];
    check('wave: sent VIDEO (gifPlayback)', !!m?.content?.video && m.content.gifPlayback === true, JSON.stringify(m?.content || {}).slice(0, 120));
  } catch (e) {
    check('wave pipeline', false, e.message);
  }

  // B4: no-target error path still friendly
  try {
    sent.length = 0;
    // mock with NO mentions and NO quoted participant — the only way
    // resolveTarget genuinely returns null in a group chat
    const msgNoTarget = {
      key: { remoteJid: '120363026316393285@g.us', participant: 'user1@s.whatsapp.net' },
      message: { extendedTextMessage: { text: '.j kill', contextInfo: {} } }
    };
    await handleReaction(mockSock, msgNoTarget,
      'kill', '⚰️', true, 'chat1@g.us', 'user1@s.whatsapp.net', 'User One');
    const m = sent[0];
    check('kill without target: friendly error', /Tag someone/i.test(m?.content?.text || ''), JSON.stringify(m?.content || {}).slice(0, 120));
  } catch (e) {
    check('kill no-target path', false, e.message);
  }

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ''} ===`);
  if (failures.length) console.error('FAILED CATEGORIES:', failures.join(', '));
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
