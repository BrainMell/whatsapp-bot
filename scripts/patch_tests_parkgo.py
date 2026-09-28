#!/usr/bin/env python3
"""2026-09-28: adapt quiz QA batteries to the universal park->go lifecycle.
Every quiz now parks behind the ready gate; tests must fire confirmStart."""
import re, sys

BASE = "/home/z/my-project/whatsapp-bot/scripts/"

def patch(path, subs, must=True):
    p = BASE + path
    src = open(p).read()
    for old, new in subs:
        if old not in src:
            if must:
                print(f"FAIL: anchor not found in {path}:\n{old[:120]}")
                sys.exit(1)
            continue
        src = src.replace(old, new, 1)
    open(p, "w").write(src)
    print(f"patched {path}")

# ── 1. qa_quiz_audit.js ──
patch("qa_quiz_audit.js", [
    ("""  async function waitSession(chatId, timeoutMs = 150000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const s = quiz.getSession(chatId);
      if (s && s.sections[0] && s.sections[0].state === "ACTIVE") return s;
      await new Promise((r) => setTimeout(r, 500));
    }
    return null;
  }""",
     """  async function waitSession(sock, chatId, timeoutMs = 150000) {
    // 2026-09-28: every quiz parks behind the ready gate (uniform planning
    // phase). Wait for the parked session, shrink the between-question gaps
    // for test speed, fire the starting gun as the asker, then wait ACTIVE.
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const s = quiz.getSession(chatId);
      if (s && s.awaitingGo) {
        s.cfg.questionGapMin = 1;
        s.cfg.questionGapMax = 1;
        await quiz.confirmStart(sock, chatId, s.askedBy, MARK, false);
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }
      if (s && s.sections[0] && s.sections[0].state === "ACTIVE") return s;
      await new Promise((r) => setTimeout(r, 500));
    }
    return null;
  }"""),
    ("""    const loading = sock.sent.find((s) => s.content?.text?.includes("Gathering questions"));
    ok(!!loading, "immediate loading message sent (P5)");""",
     """    const loading = await waitText(sock, "QUIZ PLANNING", 15000);
    ok(!!loading, "immediate QUIZ PLANNING announce (uniform planning phase, P5)");"""),
    ("const session = await waitSession(CHAT);", "const session = await waitSession(sock, CHAT);"),
    ("const session = await waitSession(CHAT2);", "const session = await waitSession(sock, CHAT2);"),
    ("const session = await waitSession(CHAT3);", "const session = await waitSession(sock, CHAT3);"),
    ("const s = await waitSession(CHATI, 150000);", "const s = await waitSession(sock, CHATI, 150000);"),
    ("const session = await waitSession(CHATS);", "const session = await waitSession(sock, CHATS);"),
    ("const session = await waitSession(CHATR, 150000);", "const session = await waitSession(sock, CHATR, 150000);"),
])

# ── 2. quiz_cancel_race_test.js ──
patch("quiz_cancel_race_test.js", [
    ("""async function waitActive(chatId, timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const s = quiz.getSession(chatId);
    if (s && !s.awaitingGo && s.sections?.[0]?.state === "ACTIVE") return s;
    await wait(250);
  }
  return null;
}""",
     """async function waitActive(chatId, timeoutMs = 30000) {
  // 2026-09-28: quizzes park behind the ready gate - fire the starting gun
  // (the asker always passes confirmStart) with 1s test gaps, then wait ACTIVE
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const s = quiz.getSession(chatId);
    if (s && s.awaitingGo) {
      s.cfg.questionGapMin = 1;
      s.cfg.questionGapMax = 1;
      await quiz.confirmStart(mockSock(), chatId, s.askedBy, MARK, false);
      await wait(200);
      continue;
    }
    if (s && !s.awaitingGo && s.sections?.[0]?.state === "ACTIVE") return s;
    await wait(250);
  }
  return null;
}"""),
])

# ── 3. qa_quiz_perms.js ──
patch("qa_quiz_perms.js", [
    ("""function waitSession(chatId, timeoutMs = 30000) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const iv = setInterval(() => {
      const s = quiz.getSession(chatId);
      if (s && !s.awaitingGo && s.sections && s.sections[0].state === "ACTIVE") { clearInterval(iv); resolve(s); }
      else if (Date.now() - t0 > timeoutMs) { clearInterval(iv); resolve(null); }
    }, 300);
  });
}""",
     """function waitSession(chatId, timeoutMs = 30000, sock = null) {
  // 2026-09-28: parked quizzes need confirmStart to go ACTIVE
  const t0 = Date.now();
  return new Promise((resolve) => {
    const iv = setInterval(async () => {
      const s = quiz.getSession(chatId);
      if (s && s.awaitingGo) {
        s.cfg.questionGapMin = 1;
        s.cfg.questionGapMax = 1;
        await quiz.confirmStart(sock || mockSock(), chatId, s.askedBy, MARK, false);
        return; // re-poll; ACTIVE is checked next tick
      }
      if (s && !s.awaitingGo && s.sections && s.sections[0].state === "ACTIVE") { clearInterval(iv); resolve(s); }
      else if (Date.now() - t0 > timeoutMs) { clearInterval(iv); resolve(null); }
    }, 300);
  });
}"""),
    ('const s = await waitSession("gate2@g.us");', 'const s = await waitSession("gate2@g.us", 30000, sock);'),
    ('const sock = mockSock();\n    // manage: hook absent -> legacy behaviour (canUseAdminCommands decides)',
     'const sock = mockSock();\n    // manage: hook absent -> legacy behaviour (canUseAdminCommands decides)'),
    ('await quiz.startQuiz(sock, "gate3@g.us", "u1@x", MARK, { key: { id: "G3" } }, \'"fmab" 3 easy\', "A", makeValidAI(5), { FAST: "t" });\n    await waitSession("gate3@g.us");',
     'await quiz.startQuiz(sock, "gate3@g.us", "u1@x", MARK, { key: { id: "G3" } }, \'"fmab" 3 easy\', "A", makeValidAI(5), { FAST: "t" });\n    await waitSession("gate3@g.us", 30000, sock);'),
    ('const s = await waitSession(chat);\n    ok(!!s, "quiz active for answer tests");',
     'const s = await waitSession(chat, 30000, sock);\n    ok(!!s, "quiz active for answer tests");'),
    # the second waitSession(chat) at L148
])
src = open(BASE + "qa_quiz_perms.js").read()
src = src.replace("""    await quiz.startQuiz(sock, chat, "u1@x", MARK, { key: { id: "A2" } }, '"fmab" 3 easy', "A", makeValidAI(5), { FAST: "t" });
    const s = await waitSession(chat);""",
"""    await quiz.startQuiz(sock, chat, "u1@x", MARK, { key: { id: "A2" } }, '"fmab" 3 easy', "A", makeValidAI(5), { FAST: "t" });
    const s = await waitSession(chat, 30000, sock);""", 1)
open(BASE + "qa_quiz_perms.js", "w").write(src)
print("patched qa_quiz_perms.js (second A2 site)")

# ── 4. qa_quiz_iterations.js ──
patch("qa_quiz_iterations.js", [
    ("""      let session = null;
      const tw = Date.now();
      while (Date.now() - tw < 150000) {
        const s2 = quiz.getSession(chatId);
        if (s2 && s2.sections && s2.sections[0] && s2.sections[0].state === "ACTIVE") { session = s2; break; }
        await sleep(500);
      }""",
     """      let session = null;
      const tw = Date.now();
      while (Date.now() - tw < 150000) {
        const s2 = quiz.getSession(chatId);
        if (s2 && s2.awaitingGo) {
          // 2026-09-28: park->go lifecycle - fire the starting gun with 1s gaps
          s2.cfg.questionGapMin = 1;
          s2.cfg.questionGapMax = 1;
          await quiz.confirmStart(sock, chatId, s2.askedBy, MARK, false);
          await sleep(400);
          continue;
        }
        if (s2 && s2.sections && s2.sections[0] && s2.sections[0].state === "ACTIVE") { session = s2; break; }
        await sleep(500);
      }"""),
])

print("ALL PATCHED")
