// ============================================
// 🧑‍🏫 MENTORING — shoob.gg mining dashboard
// ============================================
// Mellow (2026-10-07): Box 1 bots are parked and wa-miner mines shoob.gg
// event cards on the freed box. This command is the window into that
// operation, available from ANY box (data flows through the SHARED Mongo
// `System` collection, so `.j mentoring` on Joker sees what Box 1 mined).
//
//   .j mentoring               dashboard — miner health + what this box has
//   .j mentoring new [n]       newest mined cards NOT yet live here (w/ previews)
//   .j mentoring preview <q>   send one card's actual media (mp4/gif/image,
//                              WhatsApp-safe ffmpeg pipeline)
//   .j mentoring find <q>      search the mined event block (id/name/event/maker)
//   .j mentoring media         media archive stats
//   .j mentoring ids reg       browse the mined REGULAR-catalog block too
//   .j mentoring promote       OWNER ONLY — splice the mined event block AND
//                              the regular-catalog block into this box's
//                              cards_data.json (atomic, backed up, hot reload,
//                              no restart)
//
// Read-only by default. promote is the only writer and it is owner-gated,
// backs up the previous DB, writes atomically (tmp+rename) and hot-reloads
// via cardSystem.loadCardsDB().
// ============================================

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { execSync, execFile } = require('child_process');

const System = require('../models/System');
const cardSystem = require('../rpg/cardSystem');
const botConfig = require('../../botConfig');
const goService = require('../utils/goImageService');

const CARDS_DB_PATH = path.join(__dirname, '..', 'data', 'cards_data.json');
const ANIMATED_RE = /\.(gif|webp|webm)(\?|$)/i;
const CANON = ['id', 'cardName', 'animeName', 'tier', 'creator', 'imageUrl', 'detailUrl', 'description', 'eventName'];

// ── helpers ─────────────────────────────────────────────────────────────────
function inst() {
  return cardSystem.instances.get(botConfig.getBotId()) || { ALL_CARDS: [], CARD_INDEX: {}, EVENT_CARDS: [] };
}

function fmtBytes(b) {
  if (!b && b !== 0) return '?';
  if (b >= 1073741824) return (b / 1073741824).toFixed(2) + 'GB';
  if (b >= 1048576) return (b / 1048576).toFixed(0) + 'MB';
  return (b / 1024).toFixed(0) + 'KB';
}

function timeAgo(iso) {
  if (!iso) return '?';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return Math.round(s) + 's ago';
  if (s < 5400) return Math.round(s / 60) + 'm ago';
  if (s < 172800) return Math.round(s / 3600) + 'h ago';
  return Math.round(s / 86400) + 'd ago';
}

async function getSystemValue(key) {
  try {
    const doc = await System.findOne({ key }).lean();
    return doc ? doc.value : null;
  } catch { return null; }
}

function liveEventCards() {
  const i = inst();
  return (i.EVENT_CARDS && i.EVENT_CARDS.length) ? i.EVENT_CARDS : (i.ALL_CARDS || []).filter(c => String(c.id || '').startsWith('E-'));
}

function liveRegularCards() {
  const i = inst();
  return (i.ALL_CARDS || []).filter(c => c.id && !String(c.id).startsWith('E-'));
}

function maxLiveEId() {
  let maxE = 0;
  for (const c of liveEventCards()) {
    const n = parseInt(String(c.id || '').slice(2), 10);
    if (Number.isFinite(n) && n > maxE) maxE = n;
  }
  return maxE;
}

// mined cards not yet present in THIS box's live DB
function pendingHere(newcards) {
  const idx = inst().CARD_INDEX || {};
  return (newcards || []).filter(c => !idx[c.id]);
}

function cardLine(c) {
  const scope = c.eventName || c.animeName || '\u2014';
  return `\`${c.id}\` *${c.cardName}* — T${c.tier} · ${scope} · maker: ${c.creator || 'Anonymous'}`;
}

// ── media pipeline (WhatsApp-safe) ──────────────────────────────────────────
// Mellow bug report 2026-10-08: preview of a .webm event card (E-03004) came
// through as a WHITE SCREEN. Root cause: the Go convert service (10s timeout)
// fails on cold 1-3MB shoob videos, and the old fallback then sent the raw
// WEBM bytes as an { image } message — WhatsApp can't render video bytes as
// an image, hence the white box + "image not available". New pipeline:
//   1. download once with browser headers, SNIFF magic bytes (never trust
//      extensions — 35 mined cards have no extension and empty content-type)
//   2. animated (webm/gif/mp4) -> local ffmpeg -> H.264 mp4 (yuv420p,
//      faststart), cached per card id in /tmp/mentor-media
//   3. webp -> Go convert (the proven regular-card path), fallback static
//   4. png/jpg -> plain image message
// It is now impossible to send video bytes as an image.
const MEDIA_CACHE_DIR = '/tmp/mentor-media';
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Referer': 'https://shoob.gg/',
  'Accept': 'image/*,video/*,*/*',
};

function sniffMime(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  const head = buf.slice(0, 16).toString('latin1');
  if (head.startsWith('GIF87a') || head.startsWith('GIF89a')) return 'image/gif';
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') return 'image/webp';
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'video/webm';
  if (head.slice(4, 8) === 'ftyp') return 'video/mp4';
  if (head[0] === '<') return 'text/html';
  return null;
}

async function fetchMediaBuffer(url) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 25000,
    maxRedirects: 5,
    headers: BROWSER_HEADERS,
  });
  return Buffer.from(res.data);
}

function ffmpegToMp4(inPath, outPath) {
  return new Promise((resolve, reject) => {
    // -an: shoob cards carry no audio; libx264+yuv420p+faststart = plays everywhere
    // -f mp4: ffmpeg infers the muxer from the file extension and our cache
    // temp name ends in .tmp -> "Invalid argument" without the explicit format
    execFile('ffmpeg',
      ['-y', '-i', inPath, '-f', 'mp4', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', outPath],
      { timeout: 90000 },
      (err) => {
        if (err) return reject(err);
        try {
          if (!fs.statSync(outPath).size) return reject(new Error('ffmpeg produced an empty file'));
          resolve();
        } catch (e) { reject(e); }
      });
  });
}

function cachedMp4(card) {
  try {
    const p = path.join(MEDIA_CACHE_DIR, `${card.id}.mp4`);
    if (fs.existsSync(p) && fs.statSync(p).size > 0) return fs.readFileSync(p);
  } catch {}
  return null;
}

async function animatedToMp4(card, buf) {
  const hit = cachedMp4(card);
  if (hit) return hit;
  fs.mkdirSync(MEDIA_CACHE_DIR, { recursive: true });
  const outPath = path.join(MEDIA_CACHE_DIR, `${card.id}.mp4`);
  const inPath = path.join(MEDIA_CACHE_DIR, `${card.id}.src`);
  const tmpOut = path.join(MEDIA_CACHE_DIR, `${card.id}.mp4.tmp`);
  fs.writeFileSync(inPath, buf);
  try {
    await ffmpegToMp4(inPath, tmpOut);
    fs.renameSync(tmpOut, outPath);
  } finally {
    try { fs.unlinkSync(inPath); } catch {}
    try { fs.unlinkSync(tmpOut); } catch {}
  }
  return fs.readFileSync(outPath);
}

// caption mirrors cardSystem's buildCardDetailCaption (the "regular cards style")
const TIER_STARS = { '1': '✦', '2': '✦✦', '3': '✦✦✦', '4': '✦✦✦✦', '5': '✦✦✦✦✦', '6': '❖❖❖❖❖❖', 'S': '👑', 'E': '🎁' };
const TIER_LABEL = { '1': 'TIER  I', '2': 'TIER  II', '3': 'TIER  III', '4': 'TIER  IV', '5': 'TIER  V', '6': 'TIER  VI', 'S': 'TIER  S', 'E': 'EVENT' };

function buildPreviewCaption(card) {
  // 🎴 UNIVERSAL CAPTION STYLE (owner spec 2026-10-08) — same block as
  // cardSystem.buildCardDetailCaption: plain header, `emoji ⟢ *Label:* _value_`.
  const tier = String(card.tier);
  const label = String(TIER_LABEL[tier] || `TIER ${tier}`).replace(/\s+/g, ' ').trim();
  const series = card.animeName || 'Unknown';
  const eventLine = (card.eventName && card.eventName !== card.animeName) ? `\n🎪 ⟢ *Event:* _${card.eventName}_` : '';
  const desc = card.description ? `\n📝 ⟢ *Description:* _${card.description}_` : '';
  const link = card.detailUrl ? `\n🔗 _${card.detailUrl}_` : '';
  return (
`🎴  *CARD DETAIL*

🏷️ ⟢ *Name:* _${card.cardName}_ \`${card.id}\`
📺 ⟢ *Series:* _${series}_
🏆 ❖ *Tier:* _${label}_
🎨 ⟢ *Artist:* _${card.creator || 'Unknown'}_${eventLine}${desc}

📍 ⟢ *Location:* 🗄️ _Event Database_${link}`
  );
}

async function sendCardMedia(sock, chatId, card) {
  const caption = buildPreviewCaption(card);
  try {
    if (!card.imageUrl) {
      await sock.sendMessage(chatId, { text: `${caption}\n\n⚠️ no media url on file for this card.` });
      return false;
    }
    // fast path: converted mp4 already cached for this card id — no network
    const cached = cachedMp4(card);
    if (cached) {
      await sock.sendMessage(chatId, { video: cached, gifPlayback: true, mimetype: 'video/mp4', caption });
      return true;
    }
    const buf = await fetchMediaBuffer(card.imageUrl);
    const mime = sniffMime(buf);
    if (!mime || mime === 'text/html') {
      await sock.sendMessage(chatId, { text: `${caption}\n\n⚠️ shoob served non-media bytes (${mime || 'unknown'}${buf.length ? ', ' + buf.length + 'B' : ''}) — the CDN may be blocking.\n🔗 ${card.detailUrl || ''}` });
      return false;
    }
    if (mime === 'video/webm' || mime === 'image/gif' || mime === 'video/mp4') {
      const mp4 = await animatedToMp4(card, buf);
      if (mp4.length <= 16 * 1024 * 1024) {
        await sock.sendMessage(chatId, { video: mp4, gifPlayback: true, mimetype: 'video/mp4', caption });
        return true;
      }
      if (mime === 'image/gif') { // too big for video -> static image still beats a white box
        await sock.sendMessage(chatId, { image: buf, caption });
        return true;
      }
      await sock.sendMessage(chatId, { text: `${caption}\n\n⚠️ media too large to send (${fmtBytes(mp4.length)}).\n🔗 ${card.detailUrl || ''}` });
      return false;
    }
    if (mime === 'image/webp') {
      const gifBuffer = await goService.convertCardImage(card.imageUrl); // proven regular-card path
      if (gifBuffer) {
        await sock.sendMessage(chatId, { video: gifBuffer, gifPlayback: true, caption });
        return true;
      }
      await sock.sendMessage(chatId, { image: buf, caption }); // static webp fallback — visible, never white
      return true;
    }
    await sock.sendMessage(chatId, { image: buf, caption }); // png / jpeg
    return true;
  } catch (e) {
    try {
      await sock.sendMessage(chatId, { text: `${caption}\n\n⚠️ media fetch failed: ${e.message}\n🔗 ${card.detailUrl || ''}` });
    } catch {}
    return false;
  }
}

// ── subcommand: dashboard ───────────────────────────────────────────────────
async function dashboard(sock, chatId) {
  const p = botConfig.getPrefix();
  const status = await getSystemValue('shoob_miner_status');
  const newcards = await getSystemValue('shoob_miner_newcards');
  const eventblock = await getSystemValue('shoob_miner_eventblock');
  const regblock = await getSystemValue('shoob_miner_regblock');
  const i = inst();
  const liveEvents = liveEventCards();
  const liveRegCount = (i.ALL_CARDS || []).length - liveEvents.length;
  const pending = pendingHere(newcards && newcards.cards);
  const regPending = ((regblock && regblock.cards) || []).filter(c => !i.CARD_INDEX[c.id]);

  const L = [];
  L.push('╔═════════════════════════╗');
  L.push('   🧑‍🏫 *SHOOB MINING DASHBOARD*');
  L.push('╚═════════════════════════╝');
  L.push('');

  L.push(`⛏️ *MINER (Box 1)*`);
  if (!status) {
    L.push('   no report yet — miner hasn\u2019t published a cycle');
  } else if (status.lastError) {
    L.push(`   ❌ last cycle FAILED ${timeAgo(status.lastError.at)}: ${String(status.lastError.message).slice(0, 120)}`);
    L.push(`   next attempt: ${status.nextRunAt || '?'}`);
  } else {
    const r = status.lastResult || {};
    L.push(`   ✅ last cycle ${timeAgo(status.cycle && status.cycle.finishedAt)} (${status.cycle && status.cycle.durationMin != null ? status.cycle.durationMin + 'min' : '?'}) from ${status.miner ? status.miner.host : '?'}`);
    L.push(`   scraped: *${r.scraped != null ? r.scraped : '?'}* live cards · new ids: *${r.newIdsThisCycle != null ? r.newIdsThisCycle : '?'}* · tombstones: *${r.keptRemoved != null ? r.keptRemoved : '?'}*`);
    L.push(`   events seen: *${r.events != null ? r.events : '?'}* · next run: ${status.nextRunAt ? 'in ' + Math.max(0, Math.round((new Date(status.nextRunAt).getTime() - Date.now()) / 60000)) + 'm' : '?'}`);
    if (status.media) L.push(`   media archive: *${status.media.totalFiles}* files / ${fmtBytes(status.media.totalBytes)}`);
  }
  if (eventblock) L.push(`   event block on file: *${eventblock.totalCards}* cards (updated ${timeAgo(eventblock.updatedAt)})`);
  if (status && status.regular) {
    const g = status.regular;
    const tiers = g.perTier ? Object.entries(g.perTier).map(([t, n]) => `T${t}:${n}`).join(' · ') : '?';
    L.push(`   regular catalog: *${g.composed != null ? g.composed : '?'}* missing cards mined (${tiers}), ${g.failed || 0} failed${g.media ? ` · media ${fmtBytes(g.media.totalBytes)}` : ''}`);
  } else if (status && status.regularError) {
    L.push(`   ⚠️ regular phase failed ${timeAgo(status.regularError.at)}: ${String(status.regularError.message).slice(0, 100)}`);
  }
  if (regblock) L.push(`   regular block on file: *${regblock.totalCards}* cards (updated ${timeAgo(regblock.updatedAt)})`);
  L.push('');

  L.push(`💾 *THIS BOX* (${botConfig.getBotId()})`);
  L.push(`   live DB: *${(i.ALL_CARDS || []).length}* cards · regular: *${liveRegCount}* · event: *${liveEvents.length}* · max id: \`E-${String(maxLiveEId()).padStart(5, '0')}\``);
  L.push(`   mined-but-not-live-here: event *${pending.length}* · regular *${regPending.length}*`);
  L.push('');
  L.push(`   \`${p} mentoring new\` — preview fresh finds`);
  L.push(`   \`${p} mentoring ids [reg] [filter] [n]\` — newest card ids`);
  L.push(`   \`${p} mentoring find <q>\` — search the mine`);
  L.push(`   \`${p} mentoring promote\` — push mine → live (owner)`);
  L.push(`   \`${p} mentoring media\` — archive stats`);
  await sock.sendMessage(chatId, { text: L.join('\n') });
}

// ── subcommand: new cards + previews ────────────────────────────────────────
async function showNew(sock, chatId, argStr) {
  const newcards = await getSystemValue('shoob_miner_newcards');
  const regblock = await getSystemValue('shoob_miner_regblock');
  const idx = inst().CARD_INDEX || {};
  const eventPending = pendingHere(newcards && newcards.cards).map(c => ({ ...c, __src: 'event' }));
  const regPending = ((regblock && regblock.cards) || []).filter(c => !idx[c.id]).map(c => ({ ...c, __src: 'regular' }));
  const all = [...eventPending, ...regPending];
  if (!all.length) {
    await sock.sendMessage(chatId, { text: '📭 No mined cards on file yet.\n\nThe miner publishes here after its first full cycle (Box 1, `wa-miner`). Check `.j mentoring` for its status.' });
    return;
  }
  const sorted = [...all].sort((a, b) =>
    String(b.foundAt || b.scrapedAt || '').localeCompare(String(a.foundAt || a.scrapedAt || '')) ||
    String(b.id).localeCompare(String(a.id), 'en', { numeric: true }));
  let n = parseInt(argStr, 10);
  if (!Number.isFinite(n) || n <= 0) n = 5;
  n = Math.min(n, 10);
  const shown = sorted.slice(0, n);
  const L = [`🆕 *${all.length}* mined cards not live here yet (showing ${shown.length}):`, ''];
  L.push(...shown.map(cardLine));
  if (all.length > shown.length) L.push('', `_...and ${all.length - shown.length} more — \`${botConfig.getPrefix()}mentoring new ${Math.min(all.length, 10)}\`_`);
  await sock.sendMessage(chatId, { text: L.join('\n') });

  // media previews for the first few (animated cards get the real gif treatment)
  const previews = shown.slice(0, 3);
  for (const c of previews) {
    await sendCardMedia(sock, chatId, c);
  }
}

// ── subcommand: find ────────────────────────────────────────────────────────
async function find(sock, chatId, q) {
  if (!q) { await sock.sendMessage(chatId, { text: 'Usage: `.j mentoring find <name|id|event|maker>`' }); return; }
  const eventblock = await getSystemValue('shoob_miner_eventblock');
  const regblock = await getSystemValue('shoob_miner_regblock');
  const minedEvents = (eventblock && Array.isArray(eventblock.cards) && eventblock.cards.length) ? eventblock.cards : null;
  const minedRegs = (regblock && Array.isArray(regblock.cards) && regblock.cards.length) ? regblock.cards : [];
  const pool = minedEvents ? [...minedEvents, ...minedRegs] : [...liveEventCards(), ...minedRegs];
  // every word must match somewhere (name/event/series/maker/id) — "halloween beira" finds Beira cards in Halloween
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = (c) => `${c.cardName || ''} ${c.eventName || ''} ${c.animeName || ''} ${c.creator || ''} ${c.id || ''}`.toLowerCase();
  const hits = pool.filter(c => words.every(w => hay(c).includes(w))).slice(0, 10);
  if (!hits.length) {
    await sock.sendMessage(chatId, { text: `🔍 No match for *${q}* in ${minedEvents ? 'the mined blocks' : 'the live DB'} (${pool.length} cards).` });
    return;
  }
  const L = [`🔍 *${hits.length}* hit${hits.length > 1 ? 's' : ''} for *${q}* (${minedEvents ? 'mined blocks' : 'live DB'}):`, ''];
  L.push(...hits.map(cardLine));
  await sock.sendMessage(chatId, { text: L.join('\n') });
}

// ── subcommand: preview one card ────────────────────────────────────────────
async function preview(sock, chatId, q) {
  if (!q) { await sock.sendMessage(chatId, { text: 'Usage: `.j mentoring preview <E-id|tier-id|name>`' }); return; }
  const eventblock = await getSystemValue('shoob_miner_eventblock');
  const regblock = await getSystemValue('shoob_miner_regblock');
  const minedEvents = (eventblock && Array.isArray(eventblock.cards) && eventblock.cards.length) ? eventblock.cards : null;
  const minedRegs = (regblock && Array.isArray(regblock.cards) && regblock.cards.length) ? regblock.cards : [];
  const pool = minedEvents ? [...minedEvents, ...minedRegs] : [...liveEventCards(), ...minedRegs];
  const needle = q.toLowerCase();
  const card = pool.find(c => String(c.id).toLowerCase() === needle)
    || pool.find(c => String(c.cardName || '').toLowerCase() === needle)
    || pool.find(c => String(c.cardName || '').toLowerCase().includes(needle));
  if (!card) { await sock.sendMessage(chatId, { text: `🔍 No card matches *${q}*.` }); return; }
  await sendCardMedia(sock, chatId, card);
}

// ── subcommand: media stats ─────────────────────────────────────────────────
async function mediaStats(sock, chatId) {
  const status = await getSystemValue('shoob_miner_status');
  if (!status || !status.media) {
    await sock.sendMessage(chatId, { text: '📭 No media stats yet — the miner publishes them after the first mirror pass.' });
    return;
  }
  const m = status.media;
  const L = ['🗃️ *MEDIA ARCHIVE (Box 1)*', '',
    `   event files: *${m.totalFiles}*`,
    `   event size: *${fmtBytes(m.totalBytes)}*`,
    `   every card\u2019s gif/webm/png is mirrored to Box 1, id-keyed + idempotent`,
    `   purpose: survives shoob.gg seasonal rotation / CDN cleanup`,
    '',
    `   cards in mined block: *${status.lastResult ? status.lastResult.scraped : '?'}* live + *${status.lastResult ? status.lastResult.keptRemoved : '?'}* tombstoned`];
  if (status.regular && status.regular.media) {
    const rm = status.regular.media;
    L.push(`   regular media: *${rm.totalFiles}* files / *${fmtBytes(rm.totalBytes)}* (\`media/regular\`, same id-keyed layout)`);
  }
  await sock.sendMessage(chatId, { text: L.join('\n') });
}

// ── subcommand: ids — browse the newest mined card ids ──────────────────────
async function listIds(sock, chatId, q) {
  const eventblock = await getSystemValue('shoob_miner_eventblock');
  const regblock = await getSystemValue('shoob_miner_regblock');
  const words0 = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  // scope keyword: "reg" / "regular" -> the regular-catalog block
  let scope = 'event';
  const regTok = words0.findIndex(w => w === 'reg' || w === 'regular' || w === 'regulars');
  if (regTok !== -1) { scope = 'reg'; words0.splice(regTok, 1); }
  const words = words0;

  let pool, label;
  if (scope === 'reg') {
    pool = (regblock && Array.isArray(regblock.cards) && regblock.cards.length) ? regblock.cards : liveRegularCards();
    label = 'regular catalog';
  } else {
    pool = (eventblock && Array.isArray(eventblock.cards) && eventblock.cards.length) ? eventblock.cards : liveEventCards();
    label = 'event block';
  }
  const byNewest = scope === 'reg'
    ? [...pool].sort((a, b) =>
        String(b.scrapedAt || '').localeCompare(String(a.scrapedAt || '')) ||
        String(b.id).localeCompare(String(a.id), 'en', { numeric: true }))
    : [...pool].sort((a, b) =>
        (parseInt(String(b.id).slice(2), 10) || 0) - (parseInt(String(a.id).slice(2), 10) || 0));
  const lo = byNewest.length ? byNewest[byNewest.length - 1].id : '?';
  const hi = byNewest.length ? byNewest[0].id : '?';

  // args: [reg] [words...|event] [count] — a bare number = how many, words = filter
  let n = 20;
  const numTok = words.find(w => /^\d+$/.test(w));
  if (numTok) { n = Math.min(parseInt(numTok, 10), 50); words.splice(words.indexOf(numTok), 1); }

  const filtered = words.length
    ? byNewest.filter(c => {
        const hay = `${c.cardName || ''} ${c.eventName || ''} ${c.animeName || ''} ${c.creator || ''} ${c.id || ''}`.toLowerCase();
        return words.every(w => hay.includes(w));
      })
    : byNewest;
  if (!filtered.length) {
    await sock.sendMessage(chatId, { text: `🔍 No ids match *${words.join(' ') || q}* in ${pool.length} ${label} cards.\nTry \`${botConfig.getPrefix()}mentoring ids${scope === 'reg' ? ' reg' : ''} halloween\`, a name, a maker, or a bare count like \`${botConfig.getPrefix()}mentoring ids${scope === 'reg' ? ' reg' : ''} 50\`.` });
    return;
  }

  const shown = filtered.slice(0, n);
  const scopeTxt = (scope === 'reg' ? 'regular catalog' : 'event block') + (words.length ? ` matching *${words.join(' ')}*` : '');
  const L = [`🆔 *newest card ids* — ${scopeTxt}: ${filtered.length} match${filtered.length === 1 ? '' : 'es'} (newest first, showing ${shown.length})`,
    `   ${label}: ${pool.length} cards · id range \`${lo}\` → \`${hi}\``, ''];
  L.push(...shown.map(cardLine));
  if (filtered.length > shown.length) {
    L.push('', `_…${filtered.length - shown.length} more — \`${botConfig.getPrefix()}mentoring ids${scope === 'reg' ? ' reg' : ''} ${words.join(' ')} ${Math.min(filtered.length, 50)}\` (max 50 per view)_`);
  }
  await sock.sendMessage(chatId, { text: L.join('\n') });
}

// ── subcommand: promote (OWNER ONLY) ────────────────────────────────────────
async function promote(sock, chatId) {
  const eventblock = await getSystemValue('shoob_miner_eventblock');
  const regblock = await getSystemValue('shoob_miner_regblock');
  const hasEvents = eventblock && Array.isArray(eventblock.cards) && eventblock.cards.length > 0;
  const hasRegs = regblock && Array.isArray(regblock.cards) && regblock.cards.length > 0;
  if (!hasEvents && !hasRegs) {
    await sock.sendMessage(chatId, { text: '📭 No mined blocks published yet — nothing to promote.' });
    return;
  }

  // ── event block sanity: exact E-schema, unique ids ──
  const cards = hasEvents ? eventblock.cards : [];
  const badSchema = cards.filter(c => !c || !c.id || !String(c.id).startsWith('E-') || !c.cardName || !c.imageUrl);
  const ids = new Set(cards.map(c => c.id));
  if (badSchema.length || ids.size !== cards.length) {
    await sock.sendMessage(chatId, { text: `❌ Mined event block failed sanity check (${badSchema.length} malformed, ${cards.length - ids.size} dup ids) — NOT promoting. Check the miner output on Box 1.` });
    return;
  }

  // ── regular block sanity: tier-seq ids, unique ──
  const rCards = hasRegs ? regblock.cards : [];
  const REG_ID_RE = /^(S|\d{1,2})-\d{4,6}$/;
  const badReg = rCards.filter(c => !c || !c.id || !REG_ID_RE.test(String(c.id)) || !c.cardName || !c.imageUrl);
  const regIdSet0 = new Set(rCards.map(c => c.id));
  if (badReg.length || regIdSet0.size !== rCards.length) {
    await sock.sendMessage(chatId, { text: `❌ Mined regular block failed sanity check (${badReg.length} malformed, ${rCards.length - regIdSet0.size} dup ids) — NOT promoting. Check the miner output on Box 1.` });
    return;
  }

  // load current DB
  let prod;
  try { prod = JSON.parse(fs.readFileSync(CARDS_DB_PATH, 'utf8')); }
  catch (e) { await sock.sendMessage(chatId, { text: `❌ Cannot read local cards_data.json: ${e.message}` }); return; }
  const prodCards = Array.isArray(prod.cards) ? prod.cards : Object.values(prod.cards || {});
  const regular = prodCards.filter(c => !(c.id && String(c.id).startsWith('E-')));
  const oldEvents = prodCards.filter(c => c.id && String(c.id).startsWith('E-'));
  const oldIds = new Set(oldEvents.map(c => c.id));
  const added = cards.filter(c => !oldIds.has(c.id));

  // dedupe regulars: id OR mongoId already live (idempotent re-promotes)
  const regIdSet = new Set(regular.map(c => String(c.id)));
  const mongoOf = (c) => (String(c.detailUrl || '').match(/\/cards\/info\/([0-9a-f]{24})$/) || [])[1];
  const regMongoSet = new Set(regular.map(mongoOf).filter(Boolean));
  const newRegs = rCards.filter(c => !regIdSet.has(String(c.id)) && !(mongoOf(c) && regMongoSet.has(mongoOf(c))));
  const skippedRegs = rCards.length - newRegs.length;

  // layout convention: regular cards first, then the event block
  const merged = {
    ...prod,
    totalCards: regular.length + newRegs.length + cards.length,
    uniqueCards: regular.length + newRegs.length + cards.length,
    lastUpdated: new Date().toISOString(),
    cards: [...regular, ...newRegs, ...cards],
    metadata: {
      ...(prod.metadata || {}),
      lastUpdated: new Date().toISOString(),
      eventCards: cards.length,
      promotedFrom: [hasEvents ? 'shoob_miner_eventblock' : null, newRegs.length ? 'shoob_miner_regblock' : null].filter(Boolean).join(' + ') || 'shoob_miner_eventblock',
      promotedAt: new Date().toISOString(),
    },
  };

  // atomic swap: tmp -> validate -> backup -> rename
  const tmp = CARDS_DB_PATH + '.promote.tmp';
  const backup = CARDS_DB_PATH + `.bak-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(merged));
    JSON.parse(fs.readFileSync(tmp, 'utf8')); // prove the tmp parses before touching the live file
    try { fs.copyFileSync(CARDS_DB_PATH, backup); } catch {}
    fs.renameSync(tmp, CARDS_DB_PATH);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch {}
    await sock.sendMessage(chatId, { text: `❌ Promote aborted during file swap: ${e.message}\nThe live DB was not modified.` });
    return;
  }

  // hot reload — no restart needed
  let loaded = '?';
  try {
    cardSystem.loadCardsDB();
    loaded = `${(inst().ALL_CARDS || []).length} cards / ${(inst().EVENT_CARDS || []).length} event`;
  } catch (e) {
    await sock.sendMessage(chatId, { text: `⚠️ File swapped but hot reload failed: ${e.message}\nFix with \`${botConfig.getPrefix()}g reloadcards\` or a restart. Backup: ${path.basename(backup)}` });
    return;
  }

  const preservedCount = [...oldIds].filter(id => ids.has(id)).length;
  const L = ['✅ *PROMOTED — mine is live on this box*', ''];
  if (hasEvents) {
    L.push(`   event block: ${oldEvents.length} → *${cards.length}*`);
    L.push(`   newly added: *${added.length}*${added.length ? ` (new ceiling \`E-${String(maxLiveEId()).padStart(5, '0')}\`)` : ''}`);
    L.push(`   preserved ids: *${preservedCount}* (inventory references intact)`);
  }
  if (hasRegs) {
    L.push(`   regular block: *${newRegs.length}* newly added${skippedRegs ? ` (${skippedRegs} already live, skipped)` : ''}${newRegs.length ? ` — pool now *${regular.length + newRegs.length}* regular cards` : ''}`);
  }
  L.push(`   reloaded: ${loaded}`);
  L.push(`   backup: ${path.basename(backup)}`);
  await sock.sendMessage(chatId, { text: L.join('\n') });
}

// ── entry ───────────────────────────────────────────────────────────────────
async function handleMentoring(sock, chatId, argStr, opts = {}) {
  const p = botConfig.getPrefix();
  const arg = String(argStr || '').trim();
  const [sub, ...rest] = arg.split(/\s+/);
  const q = rest.join(' ').trim();

  try {
    if (!sub || sub === 'status' || sub === 'dashboard' || sub === '-info') return await dashboard(sock, chatId);
    if (sub === 'new' || sub === 'fresh') return await showNew(sock, chatId, q);
    if (sub === 'ids' || sub === 'list') return await listIds(sock, chatId, q);
    if (sub === 'find' || sub === 'search') return await find(sock, chatId, q);
    if (sub === 'preview' || sub === 'show') return await preview(sock, chatId, q);
    if (sub === 'media') return await mediaStats(sock, chatId);
    if (sub === 'promote' || sub === 'push') {
      if (!opts.isOwner) {
        await sock.sendMessage(chatId, { text: '❌ `promote` is owner-only. Everything else here is safe to explore.' });
        return;
      }
      return await promote(sock, chatId);
    }
    await sock.sendMessage(chatId, { text: `🧑‍🏫 Unknown subcommand *${sub}*.\n\n\`${p} mentoring\` — dashboard\n\`${p} mentoring new [n]\` — fresh finds (w/ previews)\n\`${p} mentoring ids [reg] [filter] [n]\` — newest card ids\n\`${p} mentoring find <q>\` — search the mine (events + regulars)\n\`${p} mentoring preview <q>\` — one card\u2019s media\n\`${p} mentoring media\` — archive stats\n\`${p} mentoring promote\` — mine → live (owner, events + regulars)` });
  } catch (e) {
    console.error('[Mentoring] handler error:', e);
    await sock.sendMessage(chatId, { text: `❌ mentoring error: ${e.message}` });
  }
}

module.exports = { handleMentoring };
