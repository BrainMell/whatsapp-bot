'use strict';
// 💾 Quiz resume: snapshot a live quiz (questions, position, scores) to disk so a bot restart never loses it.
// `.j quiz resume [n]` rebuilds the session and continues from the saved question (or from question number n).
const fs = require('fs'); const path = require('path');
const DIR = path.join(__dirname, '..', '..', 'data', 'quiz_resume');
const TTL_MS = 12 * 3600 * 1000;
const fileOf = (chatId) => path.join(DIR, String(chatId).replace(/[^a-zA-Z0-9]/g, '_') + '.json');
const SKIP = new Set(['timerId', 'nextTimerId', 'reassureTimerId', 'readyTimerId', 'hardCapTimerId', 'callLLM', 'revealLock', 'holdsGenSlot', 'sectionJobs']);
function rep(k, v) {
    if (SKIP.has(k) || typeof v === 'function') return undefined;
    if (v instanceof Map) return { __map: [...v.entries()] };
    if (v instanceof Set) return { __set: [...v.values()] };
    if (v && v.type === 'Buffer' && Array.isArray(v.data)) return { __buf: Buffer.from(v.data).toString('base64') };
    return v;
}
function rev(k, v) {
    if (v && typeof v === 'object') { if (v.__map) return new Map(v.__map); if (v.__set) return new Set(v.__set); if (v.__buf) return Buffer.from(v.__buf, 'base64'); }
    return v;
}
let busy = false, again = null;
function save(chatId, session) {
    try {
        if (!session || session.cancelled || session.awaitingGo || !session.sections) return;
        if (busy) { again = [chatId, session]; return; }
        busy = true; fs.mkdirSync(DIR, { recursive: true });
        const snap = JSON.stringify({ at: Date.now(), chatId, session }, rep); const f = fileOf(chatId);
        fs.writeFile(f + '.tmp', snap, (e) => { if (!e) { try { fs.renameSync(f + '.tmp', f); } catch (x) { /* retry next save */ } } busy = false; if (again) { const a = again; again = null; save(...a); } });
    } catch (e) { busy = false; console.log('[QuizResume] save failed:', e.message); }
}
function load(chatId) {
    try { const j = JSON.parse(fs.readFileSync(fileOf(chatId), 'utf8'), rev); if (!j || Date.now() - j.at > TTL_MS) return null; return j; } catch (e) { return null; }
}
function clear(chatId) { try { fs.unlinkSync(fileOf(chatId)); } catch (e) { /* none */ } }
module.exports = { save, load, clear, fileOf };
