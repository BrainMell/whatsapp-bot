// QA harness for summonGifDelivery — local, no canvas/Go needed (fake goCall+sock).
// Covers: cache hit, in-flight dedupe, soft-budget exceed → text+background MP4,
// fast render failure → PNG fallback → text, cached-send-failure resilience.
const assert = require('assert');
const { deliverSummonGif, cacheStats, payloadKey } = require('../core/utils/summonGifDelivery');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
}

function makeSock() {
  const sends = [];
  return {
    sends,
    async sendMessage(chatId, content) { sends.push(content); },
  };
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// Real 1x1 GIF89a (ffmpeg-decodable) — fake bytes fail conversion and poison the test
const realGif = () => Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

(async () => {
  console.log('— T1: fast render in budget → single MP4 send —');
  {
    const sock = makeSock();
    let calls = 0;
    const t0 = Date.now();
    await deliverSummonGif({
      kind: 't1', payload: { a: 1 }, sock, chatId: 'c',
      caption: 'CAP1',
      goCall: async () => { calls++; await sleep(120); return realGif(); },
      textFallback: 'TEXT1', pngFallback: null, logTag: '[T1]',
    });
    ok(sock.sends.length === 1, 'exactly one send');
    ok(sock.sends[0].video && sock.sends[0].gifPlayback === true && sock.sends[0].caption === 'CAP1', 'MP4 + gifPlayback + caption');
    ok(calls === 1, 'goCall ran once');
    ok(Date.now() - t0 < 5000, 'fast path is fast');
  }

  console.log('— T2: cache hit → no goCall —');
  {
    const sock = makeSock();
    let calls = 0;
    await deliverSummonGif({
      kind: 't1', payload: { a: 1 }, sock, chatId: 'c',
      caption: 'CAP1',
      goCall: async () => { calls++; return realGif(); },
      textFallback: 'TEXT1', pngFallback: null, logTag: '[T2]',
    });
    ok(calls === 0, 'goCall skipped on cache hit');
    ok(sock.sends.length === 1 && sock.sends[0].video, 'MP4 sent from cache');
  }

  console.log('— T3: slow render exceeds soft budget → text now + background MP4 —');
  {
    const sock = makeSock();
    const t0 = Date.now();
    process.env.SUMMON_GIF_SOFT_MS = '800'; // helper reads env at module load — use small custom via direct opts? fallback: monkey patch not possible. Use default 20s → too slow for test.
    // Instead: verify via a goCall that rejects AFTER budget → we can't shrink env post-load.
    // So: simulate with fast-rendering-but-failing-convert? Simplest: rely on env read at load — reload module with env set:
    delete process.env.SUMMON_GIF_SOFT_MS;
    const fresh = require('child_process').execFileSync('node', [require('path').join(__dirname, 'summon_gif_soft_budget_sub.js')], { cwd: __dirname, timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
    ok(true, `T3 subprocess: ${fresh.toString().trim().split('\n').join(' | ')}`);
  }

  console.log('— T4: fast failure → PNG fallback —');
  {
    const sock = makeSock();
    await deliverSummonGif({
      kind: 't4', payload: { b: 2 }, sock, chatId: 'c',
      caption: 'CAP4',
      goCall: async () => { throw new Error('ECONNREFUSED'); },
      textFallback: 'TEXT4',
      pngFallback: async () => ({ image: Buffer.alloc(50, 9), caption: 'CAP4PNG' }),
      logTag: '[T4]',
    });
    ok(sock.sends.length === 1 && sock.sends[0].image, 'PNG sent on fast failure');
    ok(sock.sends[0].caption === 'CAP4PNG', 'PNG caption used');
  }

  console.log('— T5: fast failure, PNG fails too → text —');
  {
    const sock = makeSock();
    await deliverSummonGif({
      kind: 't5', payload: { b: 3 }, sock, chatId: 'c',
      caption: 'CAP5',
      goCall: async () => { throw new Error('down'); },
      textFallback: 'TEXT5',
      pngFallback: async () => { throw new Error('canvas boom'); },
      logTag: '[T5]',
    });
    ok(sock.sends.length === 1 && sock.sends[0].text === 'TEXT5', 'text fallback reached');
  }

  console.log('— T6: in-flight dedupe —');
  {
    const sockA = makeSock(), sockB = makeSock();
    let calls = 0;
    const slowGo = async () => { calls++; await sleep(400); return realGif(); };
    const pa = deliverSummonGif({ kind: 't6', payload: { d: 9 }, sock: sockA, chatId: 'a', caption: 'CA', goCall: slowGo, textFallback: 'TA', pngFallback: null, logTag: '[T6]' });
    const pb = deliverSummonGif({ kind: 't6', payload: { d: 9 }, sock: sockB, chatId: 'b', caption: 'CB', goCall: slowGo, textFallback: 'TB', pngFallback: null, logTag: '[T6]' });
    await Promise.all([pa, pb]);
    ok(calls === 1, `goCall shared (calls=${calls})`);
    ok(sockA.sends.length === 1 && sockA.sends[0].video, 'A got MP4');
    ok(sockB.sends.length === 1 && sockB.sends[0].video, 'B got MP4 (joined)');
  }

  console.log('— T7: distinct payloads do NOT collide —');
  {
    const sockA = makeSock(), sockB = makeSock();
    await Promise.all([
      deliverSummonGif({ kind: 't7', payload: { d: 1 }, sock: sockA, chatId: 'a', caption: 'CA', goCall: async () => realGif(), textFallback: 'TA', pngFallback: null, logTag: '[T7]' }),
      deliverSummonGif({ kind: 't7', payload: { d: 2 }, sock: sockB, chatId: 'b', caption: 'CB', goCall: async () => realGif(), textFallback: 'TB', pngFallback: null, logTag: '[T7]' }),
    ]);
    ok(sockA.sends[0].video && sockB.sends[0].video, 'both got their own MP4');
    ok(payloadKey('k', { a: 1 }) !== payloadKey('k', { a: 2 }), 'keys differ');
    ok(payloadKey('k1', { a: 1 }) !== payloadKey('k2', { a: 1 }), 'kind in key');
  }

  console.log(`\nRESULT: ${pass} pass / ${fail} fail`);
  console.log('cacheStats:', JSON.stringify(cacheStats()));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
