// QA: audioPicker Deezer fallback list (2026-11-09)
// Covers: T1 yt-hit regression guard, T2 yt-miss -> Deezer list + pinned pick,
// T3 yt+deezer miss -> transparent notice + legacy takeover, T4 session
// survives picks (switch numbers).
// Run from repo root: node scripts/qa_audio_fallback.js
const ap = require('../core/utils/audioPicker');

function mockSock(tag) {
  const sent = [];
  return {
    sent,
    sendMessage: async (jid, content) => {
      if (content && content.text) sent.push({ tag, text: content.text });
      else if (content && content.react) sent.push({ tag, react: content.react.text });
      return {};
    },
  };
}

function assert(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' | ' + extra : ''}`);
  if (!cond) process.exitCode = 1;
}

(async () => {
  const m = { key: { id: 'qa' } };

  // T1: yt-hit path unchanged (real search, no env hooks)
  {
    const s = mockSock('T1');
    const listed = await ap.runAudioSearch(s, 'qa:t1', 'eminem without me', m, { botMarker: '.j ' });
    assert('T1 yt-hit lists results', listed === true, `sends=${s.sent.length}`);
    const listMsg = s.sent.find((x) => x.text && x.text.includes('AUDIO SEARCH'));
    assert('T1 list message format', !!listMsg);
    const pick = ap.resolveAudioPick('qa:t1', '1');
    assert('T1 pick returns videoUrl', pick.ok && !!pick.videoUrl && !pick.pinnedQuery, pick.videoUrl || '');
    ap.clearAudioSelection('qa:t1');
  }

  // T2: yt-miss -> Deezer list (forced via env hook)
  {
    process.env.AUDIO_TEST_FORCE_YT_MISS = '1';
    const s = mockSock('T2');
    const listed = await ap.runAudioSearch(s, 'qa:t2', 'eminem without me', m, { botMarker: '.j ' });
    assert('T2 yt-miss -> deezer list sent', listed === true, `sends=${s.sent.length}`);
    const listMsg = s.sent.find((x) => x.text && x.text.includes('listed from Deezer'));
    assert('T2 deezer banner present', !!listMsg);
    const pick = ap.resolveAudioPick('qa:t2', '1');
    assert('T2 pick returns pinnedQuery', pick.ok && !!pick.pinnedQuery && !pick.videoUrl, JSON.stringify(pick).slice(0, 120));
    console.log('   T2 pinnedQuery =', pick.pinnedQuery);
    ap.clearAudioSelection('qa:t2');
  }

  // T3: yt-miss + deezer-empty (Mellow's exact meme query, confirmed 0 on
  // both sources) -> transparent notice + legacy chain takeover
  {
    const s = mockSock('T3');
    const listed = await ap.runAudioSearch(
      s, 'qa:t3', "this is the worst thing i've ever seen meme sound", m, { botMarker: '.j ' },
    );
    assert('T3 no-list returns false (legacy)', listed === false);
    const notice = s.sent.find((x) => x.text && x.text.includes('No list match'));
    assert('T3 transparent notice sent', !!notice);
    assert('T3 searching session cleaned (numbers not swallowed)', !ap.hasPendingAudioSelection('qa:t3'));
  }

  // T4: deezer pick session survives picks (powerscale parity)
  {
    const s = mockSock('T4');
    await ap.runAudioSearch(s, 'qa:t4', 'daft punk one more time', m, { botMarker: '.j ' });
    const p1 = ap.resolveAudioPick('qa:t4', '1');
    assert('T4 first pick ok', p1.ok);
    assert('T4 session survives pick', ap.hasPendingAudioSelection('qa:t4'));
    const p2 = ap.resolveAudioPick('qa:t4', '2');
    assert('T4 switch pick ok', p2.ok, JSON.stringify(p2).slice(0, 100));
    ap.clearAudioSelection('qa:t4');
  }

  delete process.env.AUDIO_TEST_FORCE_YT_MISS;
  console.log('QA audio fallback done.');
})();
