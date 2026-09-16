// ===============================================
// AUDIOCLIP.JS — refined audio clipping / citing (FIX 2026-09-16)
// ===============================================
// Syntax:  `.clip <start> <end>`  while REPLYING to an audio / voice note.
//          `.clip <end>`          clip from the beginning to <end>.
//          `.clip info`           while replying — shows duration + help.
//
// Timestamps: `15` `15.5` `0:15` `1:30` `1:30.5` `1:02:30` (h:mm:ss).
//
// Design rules (owner brief): clean, reliable, refined — never a crude
// cutter. Everything validates, everything cleans up, errors are useful.
// Reuses Baileys' downloadContentFromMessage + local ffmpeg (already the
// bot's media stack) instead of new dependencies.

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';
const FFMPEG_TIMEOUT_MS = 120 * 1000;
const MAX_INPUT_BYTES = 50 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 15 * 1024 * 1024; // WhatsApp audio comfort zone
const VALID_AUDIO_MIMES = [
  'audio/', 'ogg', 'mpeg', 'mp3', 'mp4', 'm4a', 'aac', 'wav', 'opus', 'flac',
];

// ── timestamp parsing ────────────────────────────────────────────────
// Accepts: 15 | 15.5 | 0:15 | 1:30 | 1:30.5 | 1:02:30 | 90s | 2m30s | 1h2m3s
// Returns seconds (float) or null when invalid.
function parseTimestamp(input) {
  if (input === null || input === undefined) return null;
  const s = String(input).trim().toLowerCase();
  if (!s) return null;

  // h:m:s / m:s / s with optional .fraction
  const clock = /^(\d+):(\d{1,2})(?::(\d{1,2}))?(?:\.(\d{1,3}))?$/.exec(s);
  if (clock) {
    const a = parseInt(clock[1], 10);
    const b = parseInt(clock[2], 10);
    const c = clock[3] ? parseInt(clock[3], 10) : null;
    const frac = clock[4] ? parseFloat('0.' + clock[4]) : 0;
    if (c === null) {
      // m:ss form
      if (b >= 60) return null;
      return a * 60 + b + frac;
    }
    if (b >= 60 || c >= 60) return null;
    return a * 3600 + b * 60 + c + frac;
  }

  // bare seconds: 15 | 15.5 | 90s
  const bare = /^(\d+(?:\.\d+)?)(s)?$/.exec(s);
  if (bare) return parseFloat(bare[1]);

  // compact units: 2m30s | 1h2m | 3m | 45s | 1h2m3.5s
  const units = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/.exec(s);
  if (units && (units[1] || units[2] || units[3])) {
    return (parseFloat(units[1] || 0)) * 3600 +
           (parseFloat(units[2] || 0)) * 60 +
           (parseFloat(units[3] || 0));
  }

  return null;
}

// pretty-print seconds → 1:02:03.5 style
function fmtTimestamp(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const ss = (s < 10 ? '0' : '') + (Number.isInteger(s) ? s : s.toFixed(1));
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}

// ── quoted media resolution ──────────────────────────────────────────
function getQuotedAudio(m) {
  const ctx = m.message?.extendedTextMessage?.contextInfo;
  const q = ctx?.quotedMessage;
  if (!q) return null;

  if (q.audioMessage) return { msg: q.audioMessage, type: 'audio', ptt: !!q.audioMessage.ptt };
  if (q.documentMessage) {
    const mime = String(q.documentMessage.mimetype || '');
    if (VALID_AUDIO_MIMES.some((v) => mime.includes(v))) {
      return { msg: q.documentMessage, type: 'document', ptt: false };
    }
  }
  // some clients wrap quoted media one level deep in ephemeral/view-once
  const inner = q.ephemeralMessage?.message || q.viewOnceMessage?.message || q.viewOnceMessageV2?.message;
  if (inner) {
    if (inner.audioMessage) return { msg: inner.audioMessage, type: 'audio', ptt: !!inner.audioMessage.ptt };
    if (inner.documentMessage) {
      const mime = String(inner.documentMessage.mimetype || '');
      if (VALID_AUDIO_MIMES.some((v) => mime.includes(v))) {
        return { msg: inner.documentMessage, type: 'document', ptt: false };
      }
    }
  }
  return null;
}

async function downloadBuffer(message, type) {
  const stream = await downloadContentFromMessage(message, type);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// ── ffprobe / ffmpeg ─────────────────────────────────────────────────
function probeDuration(file) {
  return new Promise((resolve) => {
    execFile(FFPROBE, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      file,
    ], { timeout: 20000 }, (err, stdout) => {
      if (err) return resolve(null);
      const v = parseFloat(String(stdout).trim());
      resolve(Number.isFinite(v) ? v : null);
    });
  });
}

function runFfmpeg(args) {
  return new Promise((resolve) => {
    execFile(FFMPEG, args, { timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, err, stderr: String(stderr || '').slice(-600) });
    });
  });
}

// ── main handler ─────────────────────────────────────────────────────
async function handleClipCommand(sock, chatId, senderJid, args, m, BOT_MARKER, prefix) {
  const pfx = prefix || '.';
  const quoted = getQuotedAudio(m);

  // no args → help
  if (!args || args.length === 0) {
    return await sock.sendMessage(chatId, {
      text: BOT_MARKER + [
        '✂️ *AUDIO CLIP — cut & cite any section*',
        '',
        `*Reply to an audio/voice note with:*`,
        `\`${pfx}clip <start> <end>\` — keep that section`,
        `\`${pfx}clip <end>\` — from the beginning to <end>`,
        `\`${pfx}clip info\` — show the audio's length`,
        '',
        `*Timestamps:* \`0:15\` · \`1:30\` · \`1:30.5\` · \`1:02:30\` · \`90s\` · \`2m30s\``,
        `*Example:* reply to a song with \`${pfx}clip 1:10 1:25\` → 15s chorus.`,
      ].join('\n'),
    }, { quoted: m });
  }

  if (!quoted) {
    return await sock.sendMessage(chatId, {
      text: BOT_MARKER + '❌ *Reply to an audio or voice note* with the `.clip <start> <end>` command.',
    }, { quoted: m });
  }

  const sub = String(args[0] || '').toLowerCase();
  if (sub === 'info' || sub === 'length') {
    await sock.sendMessage(chatId, { react: { text: '⏳', key: m.key } });
    const tmpIn = path.join(os.tmpdir(), `clip_in_${crypto.randomBytes(6).toString('hex')}`);
    try {
      const buf = await downloadBuffer(quoted.msg, quoted.type);
      if (buf.length > MAX_INPUT_BYTES) {
        return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Audio too large (${(buf.length / 1048576).toFixed(1)}MB, limit 50MB).` }, { quoted: m });
      }
      fs.writeFileSync(tmpIn, buf);
      const dur = await probeDuration(tmpIn);
      if (!dur) {
        return await sock.sendMessage(chatId, { text: BOT_MARKER + '❌ Could not read this audio\'s duration.' }, { quoted: m });
      }
      return await sock.sendMessage(chatId, {
        text: BOT_MARKER + `🎵 *Audio info*\n• Length: *${fmtTimestamp(dur)}* (${dur.toFixed(1)}s)\n• Size: ${(buf.length / 1048576).toFixed(1)}MB\n\nCut a section with \`.clip <start> <end>\`.`,
      }, { quoted: m });
    } finally {
      try { fs.unlinkSync(tmpIn); } catch (e) {}
    }
  }

  // ── parse range ──
  let start = parseTimestamp(args[0]);
  let end = args[1] !== undefined ? parseTimestamp(args[1]) : null;

  if (start === null) {
    return await sock.sendMessage(chatId, {
      text: BOT_MARKER + `❌ Can't read the start time \`${args[0]}\`.\nUse \`0:15\` · \`1:30\` · \`1:30.5\` · \`1:02:30\` · \`90s\`.`,
    }, { quoted: m });
  }
  if (args.length >= 2 && end === null) {
    return await sock.sendMessage(chatId, {
      text: BOT_MARKER + `❌ Can't read the end time \`${args[1]}\`.\nUse \`0:15\` · \`1:30\` · \`1:30.5\` · \`1:02:30\` · \`90s\`.`,
    }, { quoted: m });
  }
  if (end === null) {
    // single value = "first N seconds"
    end = start;
    start = 0;
  }

  let swapped = false;
  if (end < start) {
    const t = start; start = end; end = t;
    swapped = true;
  }
  if (start < 0) start = 0;

  await sock.sendMessage(chatId, { react: { text: '✂️', key: m.key } });

  const token = crypto.randomBytes(6).toString('hex');
  const tmpIn = path.join(os.tmpdir(), `clip_in_${token}`);
  const tmpOut = path.join(os.tmpdir(), `clip_out_${token}.mp3`);

  try {
    // download
    let buf;
    try {
      buf = await downloadBuffer(quoted.msg, quoted.type);
    } catch (dlErr) {
      return await sock.sendMessage(chatId, {
        text: BOT_MARKER + '❌ Couldn\'t download that audio (expired media or network hiccup). Ask the sender to resend it.',
      }, { quoted: m });
    }
    if (buf.length > MAX_INPUT_BYTES) {
      return await sock.sendMessage(chatId, {
        text: BOT_MARKER + `❌ Audio too large (${(buf.length / 1048576).toFixed(1)}MB, limit 50MB).`,
      }, { quoted: m });
    }
    if (buf.length < 1024) {
      return await sock.sendMessage(chatId, { text: BOT_MARKER + '❌ That audio looks empty or corrupted.' }, { quoted: m });
    }
    fs.writeFileSync(tmpIn, buf);

    // duration sanity
    const dur = await probeDuration(tmpIn);
    if (dur && start >= dur - 0.05) {
      return await sock.sendMessage(chatId, {
        text: BOT_MARKER + `❌ Start time ${fmtTimestamp(start)} is past the end of this audio (length ${fmtTimestamp(dur)}).`,
      }, { quoted: m });
    }
    let clamped = false;
    if (dur && end > dur) {
      end = dur;
      clamped = true;
    }
    if (dur && end - start < 0.3) {
      return await sock.sendMessage(chatId, {
        text: BOT_MARKER + `❌ That section is too short (under 0.3s). Pick a wider range.`,
      }, { quoted: m });
    }

    // encode pass 1: 128k
    let enc = await runFfmpeg([
      '-y', '-v', 'error',
      '-i', tmpIn,
      '-ss', start.toFixed(3), '-to', end.toFixed(3),
      '-vn', '-ac', '2', '-acodec', 'libmp3lame', '-b:a', '128k',
      '-f', 'mp3',
      tmpOut,
    ]);
    if (!enc.ok) {
      // some inputs refuse 2ch — retry mono/adaptive
      enc = await runFfmpeg([
        '-y', '-v', 'error',
        '-i', tmpIn,
        '-ss', start.toFixed(3), '-to', end.toFixed(3),
        '-vn', '-acodec', 'libmp3lame', '-b:a', '96k',
        '-f', 'mp3',
        tmpOut,
      ]);
    }
    if (!enc.ok || !fs.existsSync(tmpOut) || fs.statSync(tmpOut).size < 512) {
      console.error('[audioclip] ffmpeg failed:', enc.stderr);
      return await sock.sendMessage(chatId, {
        text: BOT_MARKER + '❌ Couldn\'t process that audio format. Try a different file.',
      }, { quoted: m });
    }

    // size guard: re-encode lower bitrate if huge
    if (fs.statSync(tmpOut).size > MAX_OUTPUT_BYTES) {
      enc = await runFfmpeg([
        '-y', '-v', 'error',
        '-i', tmpIn,
        '-ss', start.toFixed(3), '-to', end.toFixed(3),
        '-vn', '-ac', '1', '-acodec', 'libmp3lame', '-b:a', '48k',
        '-f', 'mp3',
        tmpOut + '.sm.mp3',
      ]);
      if (enc.ok && fs.existsSync(tmpOut + '.sm.mp3') && fs.statSync(tmpOut + '.sm.mp3').size <= MAX_OUTPUT_BYTES) {
        fs.unlinkSync(tmpOut);
        fs.renameSync(tmpOut + '.sm.mp3', tmpOut);
      } else {
        try { fs.unlinkSync(tmpOut + '.sm.mp3'); } catch (e) {}
        return await sock.sendMessage(chatId, {
          text: BOT_MARKER + '❌ That clip is too long to send (over ~15MB even compressed). Cut a shorter section.',
        }, { quoted: m });
      }
    }

    const outBuf = fs.readFileSync(tmpOut);
    const durOut = end - start;
    const notes = [];
    if (swapped) notes.push('times were reversed — swapped them for you');
    if (clamped) notes.push(`end was past the audio's length — clamped to ${fmtTimestamp(end)}`);

    await sock.sendMessage(chatId, { audio: outBuf, mimetype: 'audio/mpeg', ptt: quoted.ptt === true }, { quoted: m });
    await sock.sendMessage(chatId, {
      text: BOT_MARKER + `✂️ *Clip ready!* 🎵\n• Section: *${fmtTimestamp(start)} → ${fmtTimestamp(end)}* (${durOut.toFixed(1)}s)\n• Size: ${(outBuf.length / 1048576).toFixed(2)}MB${notes.length ? '\n• Note: ' + notes.join('; ') : ''}`,
    });
    await sock.sendMessage(chatId, { react: { text: '✅', key: m.key } });
    return { success: true };
  } catch (err) {
    console.error('[audioclip] error:', err.message);
    await sock.sendMessage(chatId, {
      text: BOT_MARKER + '❌ Clip failed unexpectedly. Try again in a moment.',
    }, { quoted: m }).catch(() => {});
    return { success: false, error: err.message };
  } finally {
    try { fs.unlinkSync(tmpIn); } catch (e) {}
    try { fs.unlinkSync(tmpOut); } catch (e) {}
    try { fs.unlinkSync(tmpOut + '.sm.mp3'); } catch (e) {}
  }
}

module.exports = {
  parseTimestamp,
  fmtTimestamp,
  getQuotedAudio,
  handleClipCommand,
};
