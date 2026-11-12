'use strict';
// 🎬 Aldafold registration cinematic — plays ONCE per player, right after their first successful registration.
// The mp4 is pre-rendered (scripts/build_aldafold_intro.js) so nothing heavy runs at registration time. Every failure path is silent:
// registration, player creation and the DB are never touched.   Kill switch: ALDAFOLD_INTRO=0
const fs = require('fs');
const path = require('path');

const VIDEO = path.join(__dirname, '..', '..', '..', 'rpgasset', 'intro', 'aldafold_intro.mp4');
const SEEN_FILE = path.join(__dirname, '..', '..', '..', 'data', 'aldafold_intro_seen.json');
const SEND_TIMEOUT_MS = Number(process.env.ALDAFOLD_INTRO_TIMEOUT_MS) || 120000;
let _seen = null, _inflight = new Set();

function loadSeen() { if (_seen) return _seen; try { _seen = new Set(JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8'))); } catch (e) { _seen = new Set(); } return _seen; }
function markSeen(jid) {
  const s = loadSeen(); s.add(jid);
  try { fs.mkdirSync(path.dirname(SEEN_FILE), { recursive: true }); const tmp = SEEN_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify([...s])); fs.renameSync(tmp, SEEN_FILE); } catch (e) { console.warn('[AldafoldIntro] could not persist seen-list:', e && e.message); }
}
const hasSeen = (jid) => loadSeen().has(jid);
const available = () => process.env.ALDAFOLD_INTRO !== '0' && fs.existsSync(VIDEO);

// Fire-and-forget: never awaited by the registration flow, never throws.
function playAfterRegistration(sock, chatId, jid, marker = '') {
  if (!available() || !jid || hasSeen(jid) || _inflight.has(jid)) return;
  _inflight.add(jid);
  (async () => {
    try {
      const buf = fs.readFileSync(VIDEO);
      await Promise.race([
        sock.sendMessage(chatId, { video: buf, mimetype: 'video/mp4', caption: marker + '🏰 *Welcome to Aldafold.*\n_Music: "Bombastic Opening" by 0xabad1dea (CC BY 4.0). Engravings: Gustave Doré._' }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('intro send timed out')), SEND_TIMEOUT_MS)),
      ]);
      markSeen(jid);                                          // only after a confirmed send, so a failed delivery can retry next time
      console.log('[AldafoldIntro] delivered to', jid);
    } catch (e) { console.warn('[AldafoldIntro] skipped:', e && e.message ? e.message : e); }
    finally { _inflight.delete(jid); }
  })();
}
module.exports = { playAfterRegistration, hasSeen, markSeen, available, VIDEO };
