'use strict';
// 🔊 SOUND STICKERS (WhatsApp, rolled out 2026-11-24).
//
// Wire format (reverse-engineered by the community, see whatsmeow PR #1366 and
// the zapota / proyects-bot implementations this is modelled on):
//   Message.audioStickerMessage = field 134  (FutureProofMessage)
//     { message(1) -> Message { stickerMessage(26) -> StickerMessage {
//         ...normal sticker fields...,
//         audioMessage = field 26  (a regular AudioMessage: OGG/Opus, <=10s) } } }
// Baileys rc14 has none of those fields, so we append the raw protobuf bytes to
// the encoder output (protobuf allows fields in any order). The sticker is ALSO
// sent as the top-level stickerMessage (26): that makes Baileys emit
// mediatype="sticker" on the stanza (without it the server silently drops the
// message) and lets clients without the update show a normal silent sticker.
//
// Everything here is best-effort: callers must fall back to a plain sticker.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');

const MAX_VIDEO_SEC = 8;   // visual loop
const MAX_AUDIO_SEC = 10;  // official sound-sticker audio cap
const MAX_WEBP = 500 * 1024;

const noop = () => {};
const LOG = { level: 'silent', trace: noop, debug: noop, info: noop, warn: noop, error: noop, fatal: noop, child() { return this; } };

function sh(cmd) {
  return new Promise((res, rej) => exec(cmd, { timeout: 120000, maxBuffer: 8 * 1024 * 1024 }, (e, so, se) => (e ? rej(new Error(String(se || e.message).slice(-200))) : res(so))));
}

/** video file -> { webp (animated 512x512), ogg (opus, may be empty if the clip has no audio) } */
async function convert(inputPath, ffmpeg, tmpDir) {
  const id = Date.now() + '_' + Math.floor(Math.random() * 1e6);
  const webpPath = path.join(tmpDir, `ss_${id}.webp`);
  const oggPath = path.join(tmpDir, `ss_${id}.ogg`);
  const vf = 'scale=512:512:force_original_aspect_ratio=increase,crop=512:512';
  let webp = null;
  try {
    for (const [fps, q] of [[15, 40], [12, 30], [10, 22], [8, 15]]) {
      await sh(`"${ffmpeg}" -y -loglevel error -i "${inputPath}" -t ${MAX_VIDEO_SEC} -vf "${vf},fps=${fps}" -loop 0 -c:v libwebp -lossless 0 -preset picture -compression_level 4 -q:v ${q} -vsync 0 -map_metadata -1 -an "${webpPath}"`);
      webp = fs.readFileSync(webpPath);
      if (webp.length <= MAX_WEBP) break;
    }
    let ogg = Buffer.alloc(0);
    try {
      // these opus flags are required: without them the sticker shows but the sound will not play
      await sh(`"${ffmpeg}" -y -loglevel error -i "${inputPath}" -t ${MAX_AUDIO_SEC} -vn -ac 1 -ar 48000 -c:a libopus -b:a 48k -vbr on -compression_level 10 -frame_duration 20 -avoid_negative_ts make_zero "${oggPath}"`);
      if (fs.existsSync(oggPath)) ogg = fs.readFileSync(oggPath);
    } catch (e) { /* clip has no audio track */ }
    return { webp, ogg };
  } finally {
    for (const f of [webpPath, oggPath]) { try { fs.unlinkSync(f); } catch (e) { /* ignore */ } }
  }
}


/** audio file (voice note / song clip) -> { webp: animated transparent waveform, ogg } */
async function convertAudio(inputPath, ffmpeg, tmpDir) {
  const id = Date.now() + '_' + Math.floor(Math.random() * 1e6);
  const webpPath = path.join(tmpDir, `ssa_${id}.webp`);
  const oggPath = path.join(tmpDir, `ssa_${id}.ogg`);
  try {
    await sh(`"${ffmpeg}" -y -loglevel error -i "${inputPath}" -t ${MAX_AUDIO_SEC} -vn -ac 1 -ar 48000 -c:a libopus -b:a 48k -vbr on -compression_level 10 -frame_duration 20 -avoid_negative_ts make_zero "${oggPath}"`);
    const ogg = fs.readFileSync(oggPath);
    // moving waveform, black keyed out so the sticker has no background
    const fc = "[0:a]aformat=channel_layouts=mono,showwaves=s=512x512:mode=cline:rate=15:colors=0xffd24a,format=rgba,colorkey=0x000000:0.12:0.1[v]";
    let webp = null;
    for (const q of [45, 30, 20]) {
      await sh(`"${ffmpeg}" -y -loglevel error -i "${inputPath}" -t ${MAX_AUDIO_SEC} -filter_complex "${fc}" -map "[v]" -loop 0 -c:v libwebp -lossless 0 -preset picture -compression_level 4 -q:v ${q} -vsync 0 "${webpPath}"`);
      webp = fs.readFileSync(webpPath);
      if (webp.length <= MAX_WEBP) break;
    }
    return { webp, ogg };
  } finally {
    for (const f of [webpPath, oggPath]) { try { fs.unlinkSync(f); } catch (e) { /* ignore */ } }
  }
}

// ---- protobuf plumbing ----------------------------------------------------
let _patched = false;
const cat = (a, b) => { const o = new Uint8Array(a.length + b.length); o.set(a, 0); o.set(b, a.length); return o; };
function varint(n) {
  const out = []; let v = n;
  for (;;) { let b = v % 128; v = Math.floor(v / 128); if (v) b += 128; out.push(b); if (!v) break; }
  return Uint8Array.from(out);
}
const field = (num, payload) => cat(cat(varint((num << 3) | 2), varint(payload.length)), payload);
const framed = (t) => cat(cat(varint(t.tag), varint(t.bytes.length)), t.bytes);

async function patchProto() {
  if (_patched) return true;
  const { proto } = await import('@whiskeysockets/baileys');
  const sticker = proto && proto.Message && proto.Message.StickerMessage;
  if (!proto || !proto.Message || !proto.Message.encode || !sticker || !sticker.encode) return false;
  // Tails carry the RAW payload; the patch writes tag+length itself on BOTH encode
  // paths (nested with a writer / top-level without) so nothing is framed twice.
  const wrap = (ctor, key) => {
    if (ctor.encode.__soundSticker) return;
    const orig = ctor.encode;
    ctor.encode = function patched(m, writer) {
      const tails = m && m[key];
      const list = Array.isArray(tails) ? tails : tails && tails.bytes ? [tails] : null;
      if (!list) return orig(m, writer);
      if (writer) {
        const w = orig(m, writer);
        for (const t of list) { w.uint32(t.tag); w.bytes(t.bytes); }
        return w;
      }
      let full = Uint8Array.from(orig(m).finish());
      for (const t of list) full = cat(full, framed(t));
      return { finish: () => full };
    };
    ctor.encode.__soundSticker = true;
  };
  wrap(sticker, '__ssAudio');
  wrap(proto.Message, '__ssWrapper');
  _patched = true;
  return true;
}

/** upload webp + ogg and relay one sound sticker. Throws on any failure. */
async function send(sock, chatId, webp, ogg) {
  if (!(await patchProto())) throw new Error('baileys proto not patchable');
  const { prepareWAMessageMedia, proto } = await import('@whiskeysockets/baileys');
  const upload = sock.waUploadToServer;
  const ps = await prepareWAMessageMedia({ sticker: webp }, { upload, logger: LOG });
  const pa = await prepareWAMessageMedia({ audio: ogg }, { upload, logger: LOG });
  const st = ps.stickerMessage; const au = pa.audioMessage;
  st.mimetype = 'image/webp'; st.isAnimated = true;
  au.mimetype = 'audio/ogg; codecs=opus'; au.ptt = false;

  const audioBytes = Uint8Array.from(proto.Message.AudioMessage.encode(au).finish());
  st.__ssAudio = [{ tag: (26 << 3) | 2, bytes: audioBytes }];
  const stickerBytes = Uint8Array.from(proto.Message.StickerMessage.encode(st).finish());

  // 134 -> FutureProofMessage{ message(1) -> Message{ stickerMessage(26) } }
  const fpm = field(1, field(26, stickerBytes));
  const outer = proto.Message.create({});
  outer.stickerMessage = st;                                   // keeps mediatype=sticker + silent fallback
  outer.__ssWrapper = { tag: (134 << 3) | 2, bytes: fpm };     // the sound-sticker envelope
  const messageId = '3EB0' + crypto.randomBytes(10).toString('hex').toUpperCase();
  await sock.relayMessage(chatId, outer, { messageId });
  return messageId;
}

module.exports = { convert, convertAudio, send, patchProto, MAX_AUDIO_SEC, MAX_VIDEO_SEC };
