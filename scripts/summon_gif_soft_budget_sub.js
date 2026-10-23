// T3 subprocess: soft-budget exceed → text immediately + background MP4 follow-up.
// Env SUMMON_GIF_SOFT_MS=600 (read at module load). Real ffmpeg run on a tiny gif.
process.env.SUMMON_GIF_SOFT_MS = '600';
const path = require('path');
const { deliverSummonGif } = require(path.join(__dirname, '..', 'core', 'utils', 'summonGifDelivery'));

(async () => {
  const sends = [];
 // Real 1x1 GIF89a (ffmpeg-decodable) so the background ffmpeg conversion succeeds
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  const sock = { sends, sendMessage: async (c, msg) => { sends.push(msg); } };
  let resolveGif; const gifP = new Promise(r => { resolveGif = r; });
  const t0 = Date.now();
  await deliverSummonGif({
    kind: 't3', payload: { x: 1 }, sock, chatId: 'c',
    caption: 'CAP3',
    goCall: () => gifP,
    textFallback: 'SLOWTEXT', pngFallback: null, logTag: '[T3]',
  });
  const textAt = Date.now() - t0;
  console.log(JSON.stringify({ textAt, n1: sends.length, first: sends[0] && sends[0].text }));
  if (sends.length !== 1 || sends[0].text !== 'SLOWTEXT') process.exit(3);
  await new Promise(r => setTimeout(r, 250));
  resolveGif(gif);
  await new Promise(r => setTimeout(r, 1200)); // real ffmpeg on tiny gif
  const hasMp4 = sends.some(s => s.video);
  console.log(JSON.stringify({ n2: sends.length, hasMp4, secondCaption: sends[1] && sends[1].caption }));
  process.exit(hasMp4 && sends[1] && sends[1].caption === 'CAP3' ? 0 : 4);
})().catch(e => { console.error(e); process.exit(5); });
