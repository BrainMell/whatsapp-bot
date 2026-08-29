// core/rpg/testerSystem.js
// Game Tester permission + tester GC list + issue/bug command + Groq organize.
//
// SYSTEM KEYS (stored in MongoDB `systems` collection):
//   _shared_game_testers        — Set of tester JIDs (shared across all 3 bot instances)
//   _shared_tester_gcs           — Array of tester GC JIDs
//   _shared_rpg_test_mode        — boolean: true = maintenance lock active for non-testers
//
// COMMANDS:
//   .j addgtester @user   — Owner/Global Mod/RPG Mod only: promote to Game Tester
//   .j delgtester @user   — Owner/Global Mod/RPG Mod only: demote
//   .j listtesters         — anyone can list current testers
//   .j testgc add @gid    — Owner/Global Mod/RPG Mod only
//   .j testgc remove @gid
//   .j testgc list
//   .j testmode on|off|status — Owner/Global Mod/RPG Mod only
//   .j bug <text>          — tester submits an issue (must be in tester GC or be a tester)
//   .j issues [n]          — view last N issues (default 10, max 30)
//   .j organizeissues      — Owner/RPG Mod only: send all open issues to Groq for organization

const mongoose = require('mongoose');
const System = require('../models/System');
const Issue = require('../models/Issue');

const TESTER_SET_KEY = '_shared_game_testers';
const TESTER_GC_KEY  = '_shared_tester_gcs';
const TEST_MODE_KEY  = '_shared_rpg_test_mode';

// In-memory cache of tester JIDs (mirrors rpgMods pattern)
const gameTesters = new Set();
let loaded = false;

async function loadGameTesters() {
  try {
    const data = await System.findOne({ key: TESTER_SET_KEY });
    if (data && Array.isArray(data.value)) {
      data.value.forEach(jid => gameTesters.add(jid));
    }
    console.log(`🎮 [GameTesters] Loaded ${gameTesters.size} Game Testers`);
    loaded = true;
  } catch (err) {
    console.error('Error loading Game Testers:', err.message);
  }
}

async function saveGameTesters() {
  await System.findOneAndUpdate(
    { key: TESTER_SET_KEY },
    { $set: { value: Array.from(gameTesters) } },
    { upsert: true }
  );
}

async function addGameTester(userId) {
  const { jidNormalizedUser } = require('@whiskeysockets/baileys');
  const normalized = jidNormalizedUser(userId);
  gameTesters.add(normalized);
  await saveGameTesters();
}

async function delGameTester(userId) {
  const { jidNormalizedUser } = require('@whiskeysockets/baileys');
  const normalized = jidNormalizedUser(userId);
  gameTesters.delete(normalized);
  await saveGameTesters();
}

function isGameTester(userId) {
  if (!userId || typeof userId !== 'string') return false;
  try {
    const { jidNormalizedUser } = require('@whiskeysockets/baileys');
    const realJid = userId.startsWith('sandbox_') ? userId.substring(8) : userId;
    return gameTesters.has(jidNormalizedUser(realJid));
  } catch {
    return false;
  }
}

// ── Tester GC list ─────────────────────────────────────────────────────
async function loadTesterGcs() {
  // Returns array of GC JIDs
  try {
    const data = await System.findOne({ key: TESTER_GC_KEY });
    return (data && Array.isArray(data.value)) ? data.value : [];
  } catch {
    return [];
  }
}

async function saveTesterGcs(arr) {
  await System.findOneAndUpdate(
    { key: TESTER_GC_KEY },
    { $set: { value: arr } },
    { upsert: true }
  );
}

async function addTesterGc(gcJid) {
  const arr = await loadTesterGcs();
  if (!arr.includes(gcJid)) {
    arr.push(gcJid);
    await saveTesterGcs(arr);
  }
}

async function removeTesterGc(gcJid) {
  const arr = await loadTesterGcs();
  const filtered = arr.filter(g => g !== gcJid);
  await saveTesterGcs(filtered);
}

async function isTesterGc(gcJid) {
  const arr = await loadTesterGcs();
  return arr.includes(gcJid);
}

// ── RPG maintenance/test mode ──────────────────────────────────────────
async function getTestMode() {
  try {
    const data = await System.findOne({ key: TEST_MODE_KEY });
    return !!(data && data.value === true);
  } catch {
    return false;
  }
}

async function setTestMode(on) {
  await System.findOneAndUpdate(
    { key: TEST_MODE_KEY },
    { $set: { value: !!on } },
    { upsert: true }
  );
}

// ── Permission helper for the maintenance lock ─────────────────────────
// Returns true if the user can use RPG commands during test mode.
// Bypasses the lock if user is: Owner, Global Mod, RPG Mod, or Game Tester.
// Also bypasses if the chat is a registered tester GC.
async function canBypassRpgLock(userId, chatId) {
  // Late-require engine to avoid circular dependency at module load time
  const engine = require('../engine');
  if (engine.isBotOwner(userId)) return true;
  if (engine.isGlobalMod(userId)) return true;
  if (engine.isRpgMod(userId)) return true;
  if (isGameTester(userId)) return true;
  // Also bypass if this chat is a registered tester GC
  if (chatId && await isTesterGc(chatId)) return true;
  return false;
}

// ── Issue submission ───────────────────────────────────────────────────
async function submitIssue({ reporterId, reporterName, chatId, chatName, body, category, severity, attachments }) {
  const doc = await Issue.create({
    reporterId,
    reporterName,
    chatId: chatId || '',
    chatName: chatName || '',
    body,
    category: category || 'general',
    severity: severity || 'normal',
    attachments: attachments || [],
    status: 'open'
  });
  return doc;
}

async function listIssues(limit = 10, statusFilter = 'open') {
  const query = statusFilter === 'all' ? {} : { status: statusFilter };
  return await Issue.find(query).sort({ submittedAt: -1 }).limit(limit).lean();
}

async function countOpenIssues() {
  return await Issue.countDocuments({ status: 'open' });
}

// ── Groq organization ──────────────────────────────────────────────────
// Sends all open issues to Groq for cleanup + point-by-point organization.
// Reuses the existing GroqClient singleton at core/src/context_engine/GroqClient.js.
async function organizeIssuesWithGroq(organizerJid) {
  // Load all open issues
  const issues = await Issue.find({ status: 'open' }).sort({ submittedAt: 1 }).lean();
  if (issues.length === 0) {
    return { success: false, message: 'No open issues to organize.' };
  }

  // Build the raw issues text for Groq
  const rawIssues = issues.map((iss, i) => {
    return `Issue #${iss._id.toString().slice(-6)} [${iss.category}/${iss.severity}] by ${iss.reporterName} on ${new Date(iss.submittedAt).toISOString()}:\n${iss.body}${iss.attachments && iss.attachments.length > 0 ? '\nAttachments:\n' + iss.attachments.map(a => '  - ' + a).join('\n') : ''}`;
  }).join('\n\n---\n\n');

  // System prompt: organize but never invent or remove
  const systemPrompt = `You are a precise issue-organization assistant for an RPG bot's testing team.
Your job: take a messy collection of tester-reported bugs/issues and produce a clean, organized development list.

RULES (STRICT — violations are unacceptable):
1. Group related issues together under clear category headers.
2. Organize the issues point-by-point.
3. Fix grammar and spelling.
4. Make wording clearer and more concise.
5. PRESERVE the original meaning — do not reinterpret.
6. NEVER invent information that wasn't in the original reports.
7. NEVER remove an issue. Every single reported issue must appear in your output.
8. NEVER change what a tester actually reported — only rephrase for clarity.
9. Keep the original reporter's name and the issue's category/severity where relevant.
10. Output as Markdown with headers (## Category) and bullet points (- Issue).

INPUT FORMAT:
A series of "Issue #XXXXX [category/severity] by <name> on <date>: <body>" entries separated by "---".

OUTPUT FORMAT:
A single Markdown document, organized by category, every issue accounted for, nothing added, nothing removed.`;

  const userPrompt = `Here are ${issues.length} tester-reported issues. Organize them per the rules above.\n\n${rawIssues}`;

  let organized;
  try {
    const GroqClient = require('../src/context_engine/GroqClient');
    const client = GroqClient;
    // Use chat.completions directly — not extract (we want markdown, not JSON)
    const Groq = require('groq-sdk');
    // Reuse the GroqClient's API key rotation
    const apiKey = client.getApiKey ? client.getApiKey() : process.env.GROQ_API_KEYS?.split(',')[0];
    const tempClient = new Groq({ apiKey });
    const completion = await tempClient.chat.completions.create({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 4000
    });
    organized = completion.choices[0]?.message?.content || '';
  } catch (err) {
    console.error('[testerSystem] Groq organize failed:', err.message);
    return { success: false, message: `Groq call failed: ${err.message}` };
  }

  if (!organized || organized.trim().length === 0) {
    return { success: false, message: 'Groq returned empty response.' };
  }

  // Mark all the organized issues as 'organized' and store the summary on the most recent one
  const ids = issues.map(i => i._id);
  await Issue.updateMany(
    { _id: { $in: ids } },
    { $set: { status: 'organized', organizedAt: new Date(), organizedBy: organizerJid } }
  );
  // Store the organized summary on the FIRST issue (oldest) for retrieval
  await Issue.findByIdAndUpdate(issues[0]._id, { $set: { organized: organized } });

  return {
    success: true,
    organized,
    issuesProcessed: issues.length
  };
}

module.exports = {
  // testers
  loadGameTesters,
  addGameTester,
  delGameTester,
  isGameTester,
  // tester GCs
  loadTesterGcs,
  addTesterGc,
  removeTesterGc,
  isTesterGc,
  // test mode
  getTestMode,
  setTestMode,
  canBypassRpgLock,
  // issues
  submitIssue,
  listIssues,
  countOpenIssues,
  organizeIssuesWithGroq,
  // model re-export
  Issue
};
