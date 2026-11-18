// 🔥 PAYBACK (2026-11-18) — owner-only prank for a personal friends GC.
// Demotes every non-bot / non-owner / non-invoker admin, then Joker roasts each
// remaining member one at a time, spread across ~10 minutes. `.j payback stop`
// ends it early. Roasts are savage but deliberately free of slurs.

const DURATION_MS = 10 * 60 * 1000;

// {n} is replaced with the @tag. Pre-written, crude, nothing aimed at disability/race/etc.
const ROASTS = [
  "{n} you're genuinely a bum bro",
  "{n} I've seen shit better than you",
  "{n} you're lowkey a disappointment to everyone who's ever met you",
  "{n} bro you're such a waste of Wi-Fi",
  "{n} you add negative value to this chat and you still talk",
  "{n} you're a bum and your mother knows it",
  "{n} be so fr, nobody's missing you when you leave",
  "{n} you're the reason we have the mute button",
  "{n} you're that one friend everyone tolerates and nobody picked",
  "{n} sit down, you've been a bum all day",
  "{n} you're dumb as a bag of wet socks",
  "{n} your brain has been buffering since birth",
  "{n} you're the reason shampoo has instructions",
  "{n} even autocorrect gave up on you",
  "{n} you have the personality of unseasoned rice",
  "{n} you're proof that evolution takes the occasional day off",
  "{n} nobody's ever been happy to see you walk into a room, only the exit",
  "{n} you're so slow the loading circle waits for you",
  "{n} your best idea was a mistake and it still had better reception than you",
  "{n} you're a walking L with a phone",
  "{n} you type like your thumbs are on a blind date ⌨",
  "{n} I've seen better decisions from a coin flip. A broken one.",
  "{n} you're the group chat's background noise and not even good noise",
  "{n} you're not stupid, you just have bad luck thinking",
  "{n} even your shadow walks 10 feet behind you out of embarrassment",
  "{n} your drip is a leaky tap",
  "{n} you smell like an expired Wi-Fi password",
  "{n} you couldn't win an argument with a Roomba",
  "{n} you're the human version of a pop-up ad",
  "{n} 2 brain cells and they're fighting over who gets the day off",
  "{n} you're why aliens won't talk to us",
  "{n} you're the type to read the whole terms and conditions and still get scammed",
  "{n} you're a certified clown, circus wants its shoes back",
  "{n} you've got main character energy in the wrong movie, the one with no budget",
  "{n} your jokes land like a brick on a trampoline",
  "{n} even Joker's laughing at you and I'm the one built to laugh",
  "{n} you're so unlucky you'd get stood up by your own reflection",
  "{n} you eat like a raccoon, walk like a damp towel, and think like a loading bar",
  "{n} you're the free trial of a person",
  "{n} no one's ever said \"let's invite {n}\" and meant it",
  "{n} you have big \"mom, the Wi-Fi is down\" energy",
  "{n} you lose to NPCs",
  "{n} 100% of your confidence is unearned, 0% of it is deserved",
  "{n} you're a participation trophy with legs",
  "{n} you're so basic even water asks for more flavor",
  "{n} you're bottom of the leaderboard in a game of one",
  "{n} your IQ called, it said it's lonely down there",
  "{n} you're a software update nobody asked for",
  "{n} you've never once been the plot, just the typo in it",
  "{n} I'd roast you harder but I don't kick things that are already down",
];

const _active = new Map(); // chatId -> { timers, targets, stop() }

function _shuffle(a) {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}

function isActive(chatId) { return _active.has(chatId); }

function stop(chatId) {
  const s = _active.get(chatId);
  if (!s) return false;
  s.stop();
  return true;
}

/**
 * @param sock Baileys socket
 * @param chatId group jid
 * @param o { participants, invokerJid, botJid, isProtected(jid, participantObj)=>bool, jidNormalizedUser, mark }
 */
async function start(sock, chatId, o) {
  const norm = o.jidNormalizedUser || ((x) => x);
  const mark = o.mark || "";
  if (_active.has(chatId)) return { ok: false, reason: "already running" };

  const everyone = (o.participants || []).map((p) => ({
    id: norm(p.id || p),
    admin: p.admin || null,
    raw: p,
  }));
  const wanted = new Set((o.targetJids || []).map(norm));
  const targets = everyone.filter((p) => {
    if (!p.id || !wanted.has(p.id)) return false;
    if (p.id === norm(o.botJid)) return false;
    if (p.id === norm(o.invokerJid)) return false;
    try { if (o.isProtected && o.isProtected(p.id, p.raw)) return false; } catch { return false; }
    return true;
  });
  if (!targets.length) return { ok: false, reason: "tag at least one person (not me or the owner)" };

  const state = { timers: [], targets: targets.map((t) => t.id), locked: false, stop() {
    for (const t of state.timers) clearTimeout(t);
    _active.delete(chatId);
    if (state.locked) {
      state.locked = false;
      sock.groupSettingUpdate(chatId, "not_announcement").catch(() => {});
    }
  } };
  _active.set(chatId, state);

  // 0) lock the GC (admins-only messaging) unless it already was locked
  if (!o.alreadyLocked) {
    try { await sock.groupSettingUpdate(chatId, "announcement"); state.locked = true; }
    catch (e) { console.log("[payback] lock failed:", e?.message || e); }
  }

  // 1) demote every targeted admin (bot must be admin; failures are non-fatal)
  const admins = targets.filter((t) => t.admin).map((t) => t.id);
  let demoted = 0;
  for (let i = 0; i < admins.length; i += 5) {
    const chunk = admins.slice(i, i + 5);
    try { await sock.groupParticipantsUpdate(chatId, chunk, "demote"); demoted += chunk.length; }
    catch (e) { console.log("[payback] demote failed:", e?.message || e); }
    await new Promise((r) => setTimeout(r, 1200));
  }

  await sock.sendMessage(chatId, {
    text: mark + [
      "*Was it worth it?*",
      "",
      "*Was it really worth it?*",
      "",
      targets.map((t) => "@" + t.id.split("@")[0]).join(" "),
    ].join("\n"),
    mentions: targets.map((t) => t.id),
  }).catch(() => {});

  // 2) one roast per target, spread across 10 minutes; repeat shuffled rounds
  //    so every member keeps getting hit until the clock runs out.
  const t0 = Date.now();
  const gap = Math.max(4000, Math.floor(DURATION_MS / Math.max(targets.length * 3, 1)));
  let queue = [];
  let lastLine = "";
  const tick = async () => {
    if (!_active.has(chatId)) return;
    if (Date.now() - t0 >= DURATION_MS) {
      await sock.sendMessage(chatId, { text: mark + "*Payback complete.* Group unlocked. Kiss and make up." }).catch(() => {});
      state.stop();
      return;
    }
    if (!queue.length) queue = _shuffle(state.targets);
    const jid = queue.shift();
    let line;
    do { line = ROASTS[Math.floor(Math.random() * ROASTS.length)]; } while (line === lastLine && ROASTS.length > 1);
    lastLine = line;
    const tag = "@" + jid.split("@")[0];
    try {
      await sock.sendMessage(chatId, { text: mark + line.replace(/\{n\}/g, tag), mentions: [jid] });
    } catch (e) { console.log("[payback] send failed:", e?.message || e); }
    state.timers.push(setTimeout(tick, gap + Math.floor(Math.random() * 1500)));
  };
  state.timers.push(setTimeout(tick, 3000));
  return { ok: true, demoted, targets: targets.length };
}

module.exports = { start, stop, isActive, ROASTS, DURATION_MS };
