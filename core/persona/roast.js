'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  .j roast v2 (owner 2026-10-30: the old one was "a long yap festival of not funny bs").
//  Why it yapped: the model got a list of likes/hobbies and was told to be "BRUTAL",
//  so it wrote a paragraph of generic insults. Funny roasts are SHORT and SPECIFIC.
//  This builds the roast from real material (verbatim quotes, habits, facts, game
//  data from people memory + what they said in this chat lately), hands the model ONE
//  hook to hit, caps the length hard, and falls back to a template built from the
//  same hook if the model still waffles.
// ═══════════════════════════════════════════════════════════════════════════
const MAX_WORDS = 30;
const BAD_RE = /\b(as an ai|brutally|savage|roast (this|you)|here'?s? (a|your) roast|buckle up|let'?s dive|in conclusion|boring|loser|nobody|ghost|invisible|personality)\b/i;
const wc = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;

function pickHooks(kit, recentLines) {
  const hooks = [];
  for (const q of kit.quotes || []) hooks.push({ kind: 'quote', text: q, w: 5 });
  for (const m of kit.moments || []) hooks.push({ kind: 'moment', text: m, w: 4.5 });
  // RPG is a separate system and only exists for people who actually play it (engine gates that:
  // mid/high level or real activity). For them ONE game detail can join the pool as spice - it competes
  // with quotes/habits/facts, it is never the whole roast.
  const gm = (kit.game || []).filter(Boolean);
  // ...and even for them only about 1 roast in 4 uses it (owner 2026-10-30)
  if (gm.length && Math.random() < 0.25) hooks.push({ kind: 'game', text: gm[Math.floor(Math.random() * gm.length)], w: 3.2 });
  for (const h of kit.habits || []) hooks.push({ kind: 'habit', text: h, w: 3.5 });
  for (const f of kit.facts || []) hooks.push({ kind: 'fact', text: f, w: 3 });
  for (const l of (recentLines || []).slice(-4)) if (l.length > 15) hooks.push({ kind: 'recent', text: l, w: 2.5 });
  hooks.sort((a, b) => b.w - a.w + (Math.random() - 0.5) * 2.2); // best first, with a little shuffle so repeats differ
  return hooks;
}
function templateRoast(name, hook) {
  const T = {
    quote: [`"${hook.text}" ... and you said that with your whole chest`, `${name} really typed "${hook.text}" and hit send`],
    moment: [`${hook.text}. and you still talk like that`, `${name}: ${hook.text}. say less`],
    game: [`${hook.text}, and you act like the main character`, `${hook.text}. the numbers dont lie ${name}`],
    habit: [`${name} ${hook.text}. we all noticed`, `${hook.text}. nobody asked ${name}`],
    fact: [`${name} ${hook.text} and thinks thats a personality`],
    recent: [`"${hook.text}" ... genuinely hurt to read`],
  };
  const a = T[hook.kind] || T.fact; return a[Math.floor(Math.random() * a.length)];
}

/**
 * @param {object} o { targetName, requesterName, kit, recentLines, isSelf, llm(messages,opts)=>string, botName }
 * @returns {Promise<string>} one or two short lines
 */
async function roast(o) {
  const name = o.targetName || 'you';
  const hooks = pickHooks(o.kit || {}, o.recentLines);
  const thin = !hooks.length;
  const top = hooks.slice(0, 3);
  const system = `You are ${o.botName || 'Joker'}, a quick-witted friend roasting someone in a group chat. A good roast is SHORT and SPECIFIC. Rules: ONE line, two at the very most, under ${MAX_WORDS} words total. Use ONE concrete detail from the material below (quote it or reference it directly), twist it into a punchline, then STOP. No setup paragraphs, no list of insults, no explaining the joke, no moralising. Never use generic insults (loser, boring, nobody, ghost, no personality). Never invent facts that are not in the material. all lowercase, casual texting voice, at most one emoji. Punch at their habits and moments, never at health, family, looks, race, religion or anything that is not their own doing.`;
  const material = thin
    ? `We know almost nothing about ${name} (they barely speak here). Roast exactly that in one short line, for example how quiet or unknowable they are, without calling them boring or a ghost.`
    : `Material about ${name}:\n${top.map((h) => `- (${h.kind}) ${h.text}`).join('\n')}${o.kit && o.kit.voice ? `\n- how they come across: ${o.kit.voice}` : ''}\nPick the single best detail (anything tagged game is just a side detail, never the main subject). ${o.isSelf ? `${name} asked to be roasted, so go a little harder.` : `${o.requesterName || 'someone'} asked for this roast.`}`;
  let out = '';
  for (let attempt = 0; attempt < 2 && o.llm; attempt++) {
    try {
      const raw = await o.llm([{ role: 'system', content: system }, { role: 'user', content: material + (attempt ? '\n\nthat was too long or generic. ONE short line, one specific detail.' : '') }], { temperature: attempt ? 0.7 : 0.95, max_completion_tokens: 160 });
      let t = String(raw || '').trim().replace(/^(["'`])([^"'`]*)\1$/s, '$2').replace(/\*\*/g, '').replace(/\s*\n+\s*/g, '\n').trim();
      t = t.replace(/^@?\S+\s*[:,-]\s*/, (m) => (m.length < 18 && /^@/.test(m) ? '' : m));
      const lines = t.split('\n').filter(Boolean).slice(0, 2);
      t = lines.join('\n');
      if (!t || BAD_RE.test(t) || /<\|/.test(t) || wc(t) > MAX_WORDS + 8) continue;
      out = t; break;
    } catch (e) { /* retry / fall back */ }
  }
  if (!out) out = templateRoast(name, hooks[0] || { kind: 'habit', text: 'is impossible to read' });
  return out.toLowerCase().replace(/\s+([.!?,])/g, '$1');
}
module.exports = { roast, pickHooks, templateRoast };
