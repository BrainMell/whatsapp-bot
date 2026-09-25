// ============================================
// QUIZ CONFIG (2026-09-26 audit - Priority 16 + 17)
// ============================================
// ONE explicit configuration object read by EVERY quiz stage:
//
//   COMMAND → QUIZ CONFIG → SOURCE DATA → AI PROMPT → GENERATION →
//   VALIDATION → SECTION CREATION → QUESTION SELECTION → LIVE QUIZ
//
// This is the structural fix for category drift (P6), the voice-actor
// question flood (P10) and the scattered hardcoded constants (30s timer,
// MAX_QUESTIONS=15...) that made tuning a source edit instead of a command.
//
// Layers:
//   1. GLOBAL DEFAULTS           - code constants below.
//   2. PER-GROUP overrides       - persisted via system KV "quiz_cfg:<chatId>"
//                                  (MongoDB), set with .j quizmod by mods.
//   3. PER-QUIZ overrides        - parsed from the command line (-images,
//                                  -audio, count, difficulty, section) and
//                                  clamped against the group limits.
//
// Scoping is explicit: every setting declares scope "group" (default) or
// "global". Group settings only affect their own chat; a mod cannot silently
// change another group's quiz. (The only global knob is streamingGeneration
// because section prefetch workers are process-wide.)
// ============================================

const system = require("../utils/system");

const _KEY = (chatId) => `quiz_cfg:${chatId}`;

// ── defaults (all times ms-based where noted) ──
const DEFAULTS = {
  timePerQuestion: 15,          // seconds to answer one question (P2: 7-20s band)
  sectionBreakDuration: 45,     // seconds pause between sections of long quizzes
  maxQuestions: 50,             // hard ceiling on quiz size (P7)
  sectionSize: 10,              // questions per section; >sectionSize quizzes split
  imageQuestionLimit: 5,        // max image questions per quiz (exact count comes from -images)
  audioQuestionLimit: 3,        // max audio questions per quiz (voice + theme song combined)
  voiceActorQuestionLimit: 1,   // HARD CAP on production/VA questions per quiz (P10)
  themeSongQuestionLimit: 1,    // max theme-song audio questions per quiz
  streamingGeneration: true,    // background-generate the next section while one plays (P19)
};

// ── setting registry: validation + docs in one place (P17) ──
// type: int | bool. scope: "group" | "global".
const SETTING_DEFS = {
  timer:                   { key: "timePerQuestion",         label: "question timer",        type: "int",  min: 7,    max: 120, scope: "group",  unit: "seconds" },
  sectionbreak:            { key: "sectionBreakDuration",    label: "section break",         type: "int",  min: 0,    max: 600, scope: "group",  unit: "seconds" },
  maxquestions:            { key: "maxQuestions",            label: "max quiz questions",    type: "int",  min: 3,    max: 50,  scope: "group",  unit: "questions" },
  sectionsize:             { key: "sectionSize",             label: "section size",          type: "int",  min: 3,    max: 25,  scope: "group",  unit: "questions" },
  imagelimit:              { key: "imageQuestionLimit",      label: "max image questions",   type: "int",  min: 0,    max: 25,  scope: "group",  unit: "questions" },
  audiolimit:              { key: "audioQuestionLimit",      label: "max audio questions",   type: "int",  min: 0,    max: 10,  scope: "group",  unit: "questions" },
  voiceactorcap:           { key: "voiceActorQuestionLimit", label: "voice-actor cap",       type: "int",  min: 0,    max: 5,   scope: "group",  unit: "questions" },
  themesong:               { key: "themeSongQuestionLimit",  label: "theme-song questions",  type: "int",  min: 0,    max: 5,   scope: "group",  unit: "questions" },
  streaming:               { key: "streamingGeneration",     label: "streaming generation",  type: "bool",                            scope: "global", unit: "on/off" },
};

// aliases so ".j quizmod timer 10" and ".j quizmod time 10" both work
const SETTING_ALIASES = {
  time: "timer", questiontimer: "timer", seconds: "timer",
  break: "sectionbreak", section_break: "sectionbreak",
  max: "maxquestions", questions: "maxquestions", size: "maxquestions",
  section: "sectionsize", sections: "sectionsize", sectionsize: "sectionsize",
  images: "imagelimit", image: "imagelimit",
  audio: "audiolimit", sounds: "audiolimit",
  va: "voiceactorcap", voiceactor: "voiceactorcap", voiceactors: "voiceactorcap",
  theme: "themesong", themesongaudio: "themesong", songs: "themesong",
  stream: "streaming", background: "streaming",
};

// ── group override persistence ──
// Cached in memory (reads happen on question timers - must not await DB);
// writes go through system.set which also hits MongoDB.
const _groupCache = new Map(); // chatId -> overrides object

function loadGroupOverrides(chatId) {
  if (!chatId) return {};
  if (_groupCache.has(chatId)) return _groupCache.get(chatId);
  const v = system.get(_KEY(chatId), null);
  const overrides = v && typeof v === "object" ? v : {};
  _groupCache.set(chatId, overrides);
  return overrides;
}

async function setGroupOverride(chatId, defKey, value) {
  const overrides = { ...loadGroupOverrides(chatId) };
  overrides[defKey] = value;
  _groupCache.set(chatId, overrides);
  await system.set(_KEY(chatId), overrides);
  return overrides;
}

function clearGroupOverrides(chatId) {
  _groupCache.delete(chatId);
  return system.set(_KEY(chatId), {});
}

// ── validation ──
// Returns {ok, value} or {ok:false, error} with the valid range in the text.
function validateValue(def, raw) {
  if (def.type === "bool") {
    const s = String(raw).trim().toLowerCase();
    if (["on", "true", "1", "yes", "enable", "enabled"].includes(s)) return { ok: true, value: true };
    if (["off", "false", "0", "no", "disable", "disabled"].includes(s)) return { ok: true, value: false };
    return { ok: false, error: `"${raw}" is not on/off.` };
  }
  const n = parseInt(String(raw).trim(), 10);
  if (!Number.isInteger(n)) return { ok: false, error: `"${raw}" is not a whole number.` };
  if (n < def.min || n > def.max) {
    return { ok: false, error: `must be between ${def.min} and ${def.max}${def.unit ? ` ${def.unit}` : ""}.` };
  }
  return { ok: true, value: n };
}

// ── THE config object builder ──
// merged = DEFAULTS ← GLOBAL overrides ← group overrides ← per-quiz clamps.
// Returns a frozen plain object threaded through every quiz stage; nothing
// downstream may read the old module constants again.
async function buildQuizConfig(chatId, perQuiz = {}) {
  const globalOv = loadGroupOverrides("global");
  const groupOv = chatId ? loadGroupOverrides(chatId) : {};
  const merged = { ...DEFAULTS };
  for (const src of [globalOv, groupOv]) {
    for (const def of Object.values(SETTING_DEFS)) {
      if (src[def.key] !== undefined && src[def.key] !== null) {
        merged[def.key] = src[def.key];
      }
    }
  }
  // per-quiz overrides (command line): count/difficulty/images/audio/section.
  // Each clamped against the group ceiling so a user command can never
  // exceed what the mods configured (P17).
  const cfg = {
    ...merged,
    media: perQuiz.media || null,              // franchise object (P22 media typing)
    mediaType: perQuiz.mediaType || "anime",   // anime | manga | game | comic | movie | tv | franchise
    questionCount: Math.max(1, Math.min(parseInt(perQuiz.count, 10) || 10, merged.maxQuestions)),
    difficulty: ["easy", "medium", "hard"].includes(perQuiz.difficulty) ? perQuiz.difficulty : "medium",
    categories: perQuiz.categories || null,    // forced domain list from -s/--section, or null = weighted mix
    imageQuestionCount: Math.max(0, Math.min(parseInt(perQuiz.images, 10) || 0, merged.imageQuestionLimit)),
    audioQuestionCount: Math.max(0, Math.min(parseInt(perQuiz.audio, 10) || 0, merged.audioQuestionLimit)),
    randomMode: !!perQuiz.randomMode,          // .j quiz random
    chatId: chatId || null,
    requestedBy: perQuiz.requestedBy || null,
  };
  // theme songs can never exceed the audio budget (they share it with voice audio)
  cfg.themeSongQuestionCount = Math.min(cfg.themeSongQuestionLimit, cfg.audioQuestionCount);
  return cfg;
}

// ── .j quizmod handler (P17) ──
// Shows or mutates settings. Returns {message} like every other quiz export.
// Permission is enforced by the CALLER (engine passes canUseAdminCommands) -
// this function double-checks and refuses without it.
async function handleQuizMod(chatId, args, canUseAdminCommands, prefix) {
  const p = prefix || ".";
  if (!canUseAdminCommands) {
    return { message: `🛑 quizmod is for moderators and above only.` };
  }
  const tokens = String(args || "").trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) {
    // show current config: defaults vs this group's overrides
    const overrides = loadGroupOverrides(chatId);
    let out = `⚙️ *QUIZ CONFIG*\n\n`;
    out += `Setting commands: \`${p} quizmod <setting> <value>\`\n\n`;
    for (const [name, def] of Object.entries(SETTING_DEFS)) {
      const cur = overrides[def.key] !== undefined ? overrides[def.key] : DEFAULTS[def.key];
      const modified = overrides[def.key] !== undefined ? " ✏️" : "";
      const range = def.type === "int" ? ` (${def.min}-${def.max}${def.unit ? ` ${def.unit}` : ""})` : " (on/off)";
      out += `• *${name}*${range}: \`${cur}\`${modified}\n`;
    }
    out += `\n✏️ = changed for THIS group (others: global default)\n`;
    out += `Reset: \`${p} quizmod reset\`\n`;
    out += `Example: \`${p} quizmod timer 10\``;
    return { message: out };
  }
  const sub = tokens[0].toLowerCase();
  if (sub === "reset" || sub === "defaults") {
    await clearGroupOverrides(chatId);
    return { message: `⚙️ Quiz config for this group reset to bot defaults.` };
  }
  const name = (SETTING_ALIASES[sub] || sub).toLowerCase();
  const def = SETTING_DEFS[name];
  if (!def) {
    return { message: `❌ Unknown setting "${tokens[0]}".\nValid: ${Object.keys(SETTING_DEFS).join(", ")}.\nExample: \`${p} quizmod timer 10\`` };
  }
  if (!tokens[1]) {
    const overrides = loadGroupOverrides(chatId);
    const cur = overrides[def.key] !== undefined ? overrides[def.key] : DEFAULTS[def.key];
    const range = def.type === "int" ? `Valid range: ${def.min}-${def.max}${def.unit ? ` ${def.unit}` : ""}.` : "Valid values: on / off.";
    return { message: `⚙️ *${def.label}* is currently \`${cur}\`.\n${range}\nSet it: \`${p} quizmod ${name} <value>\`` };
  }
  if (def.scope === "group" && !chatId) {
    return { message: `❌ "${def.label}" is per-group; use this inside a group chat.` };
  }
  const v = validateValue(def, tokens[1]);
  if (!v.ok) {
    const range = def.type === "int" ? `Valid range: ${def.min}-${def.max}${def.unit ? ` ${def.unit}` : ""}.` : "Valid values: on / off.";
    return { message: `❌ ${def.label}: ${v.error}\n${range}` };
  }
  if (def.scope === "global") {
    // global settings persist under the "global" pseudo-chat so every group sees it
    await setGroupOverride("global", def.key, v.value);
    return { message: `✅ ${def.label} set to \`${v.value}\` *(GLOBAL - applies to every chat)*` };
  }
  await setGroupOverride(chatId, def.key, v.value);
  const overrides = loadGroupOverrides(chatId);
  return { message: `✅ ${def.label} set to \`${v.value}\` for THIS group.\n(seen by the next quiz started here)` };
}

module.exports = {
  DEFAULTS,
  SETTING_DEFS,
  SETTING_ALIASES,
  buildQuizConfig,
  handleQuizMod,
  loadGroupOverrides,
  setGroupOverride,
  clearGroupOverrides,
  validateValue,
  _internal: { _groupCache, _KEY },
};
