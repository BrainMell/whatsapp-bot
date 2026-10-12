// aiOverview.js — web-grounded "AI overview" helpers for `.j google <question>`
//
// Owner 2026-10-12: "Add a .j Google where you can effectively Google any
// question and get a response, like the AI overview but it isn't our AI
// grok or anything like that." — i.e. answers must come from REAL search
// results (with visible sources), not free-form chat.
//
// Design (mirrors quoteCard.js): ZERO network calls here. The engine fetches
// the search pages (DuckDuckGo html → DuckDuckGo lite → Bing) and calls
// Groq; every function in this module is pure so QA can run offline against
// fixture HTML.

const MAX_QUERY = 300; // sanity cap for questions
const MAX_RESULTS = 6; // sources shown to the user
const MIN_RESULTS = 2; // a backend response with fewer parses = useless page
const MAX_ANSWER_CHARS = 1800; // keep the synthesized paragraph readable
const MAX_MESSAGE_CHARS = 3500; // hard cap for the whole WhatsApp message

// ---------------------------------------------------------------- utilities

function normalizeQuery(raw) {
  if (raw === null || raw === undefined) return "";
  return String(raw).replace(/\s+/g, " ").trim();
}

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  middot: "·",
  deg: "°",
  euro: "€",
  pound: "£",
  copy: "©",
  reg: "®",
  trade: "™",
  eacute: "é",
  egrave: "è",
  uuml: "ü",
  ouml: "ö",
  auml: "ä",
  szlig: "ß",
  ntilde: "ñ",
  ccedil: "ç",
};

function decodeEntities(s) {
  return String(s || "")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
      try {
        return String.fromCodePoint(parseInt(h, 16));
      } catch {
        return "";
      }
    })
    .replace(/&#(\d+);/g, (_, d) => {
      try {
        return String.fromCodePoint(parseInt(d, 10));
      } catch {
        return "";
      }
    })
    .replace(/&([a-zA-Z]+);/g, (_, n) => {
      const v = NAMED_ENTITIES[n.toLowerCase()];
      return v === undefined ? `&${n};` : v;
    });
}

function stripTags(s) {
  // ⚠️ decode BEFORE stripping: Bing snippets embed entity-encoded markup
  // (e.g. &lt;span class=&#39;…&#39;&gt;) — stripping first would let the
  // tags survive as literal text once entities decode. Final decode catches
  // double-encoded fragments (&amp;lt; → &lt; → text).
  const once = decodeEntities(String(s || ""));
  return decodeEntities(once.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

// DuckDuckGo wraps result URLs in a redirect: //duckduckgo.com/l/?uddg=<enc>&rut=...
function unwrapDdgUrl(href) {
  let h = String(href || "");
  if (!h) return "";
  if (h.startsWith("//")) h = "https:" + h;
  try {
    const u = new URL(h);
    const uddg = u.searchParams.get("uddg");
    return uddg || h;
  } catch {
    return h;
  }
}

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function validUrl(u) {
  return /^https?:\/\//i.test(u || "");
}

// Order-agnostic <a> extractor: returns [{href, raw}] for anchors whose
// class attribute contains classNeedle (handles class-before-href AND
// href-before-class markup).
function findAnchors(html, classNeedle) {
  const out = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] || "";
    const clsM = attrs.match(/class\s*=\s*["']([^"']*)["']/i);
    const cls = clsM ? clsM[1] : "";
    if (!cls.split(/\s+/).some((c) => c.includes(classNeedle))) continue;
    const hrefM = attrs.match(/href\s*=\s*["']([^"']+)["']/i);
    out.push({ href: hrefM ? hrefM[1] : "", raw: m[2] });
  }
  return out;
}

// ------------------------------------------------------------------ parsers
// Every parser returns [{title, snippet, url, domain}] (possibly empty).

// html.duckduckgo.com/html/ (POST q=...) — classic result cards.
// ⚠️ Ad-safety: split into result-card chunks FIRST and test result--ad
// WITHIN the card only — a naive fixed look-back window bleeds across card
// boundaries and eats the organic result that follows an ad.
function parseDdgHtml(html) {
  const out = [];
  if (!html) return out;
  const cards = String(html).split('<div class="result').slice(1);
  for (const card of cards) {
    if (/result--ad/.test(card.slice(0, 500))) continue; // sponsored card
    const aM = card.match(
      /<a\b[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/,
    );
    const title0 = aM || findAnchors(card, "result__a")[0];
    if (!title0) continue;
    const url = unwrapDdgUrl(title0.href || title0[1]);
    if (!validUrl(url)) continue;
    const title = stripTags(title0.raw || title0[2]);
    if (!title) continue;
    const sA = findAnchors(card, "result__snippet")[0];
    const sM = sA || card.match(
      /<a\b[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/,
    );
    const snippet = sM ? stripTags(sM.raw || sM[1]) : "";
    out.push({ title, snippet, url, domain: domainOf(url) });
  }
  return out;
}

// lite.duckduckgo.com/lite/?q=... — table layout, `result-link` anchors.
function parseDdgLite(html) {
  const out = [];
  if (!html) return out;
  const titles = findAnchors(html, "result-link");
  const snippets = [];
  const snipRe = /<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/g;
  let m;
  while ((m = snipRe.exec(html)) !== null) snippets.push(m[1]);

  titles.forEach((t, i) => {
    const url = unwrapDdgUrl(t.href);
    if (!validUrl(url)) return;
    const title = stripTags(t.raw);
    if (!title) return;
    const snippet = snippets[i] !== undefined ? stripTags(snippets[i]) : "";
    out.push({ title, snippet, url, domain: domainOf(url) });
  });
  return out;
}

// bing.com/search?q=... — <li class="b_algo"> blocks.
function parseBingHtml(html) {
  const out = [];
  if (!html) return out;
  const blockRe = /<li\b[^>]*class="[^"]*b_algo[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
  let m;
  while ((m = blockRe.exec(html)) !== null) {
    const block = m[1];
    if (/b_ad/i.test(m[0].slice(0, 200))) continue;
    const aM = block.match(
      /<h2[^>]*>\s*<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
    );
    if (!aM) continue;
    const url = aM[1];
    if (!validUrl(url)) continue;
    const title = stripTags(aM[2]);
    if (!title) continue;
    const pM = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const snippet = pM ? stripTags(pM[1]) : "";
    out.push({ title, snippet, url, domain: domainOf(url) });
  }
  return out;
}

function dedupeAndCap(results, cap = MAX_RESULTS) {
  const seen = new Set();
  const out = [];
  for (const r of results || []) {
    if (!r || !validUrl(r.url) || !r.title) continue;
    const key = r.url.replace(/\/+$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...r, domain: r.domain || domainOf(r.url) });
    if (out.length >= cap) break;
  }
  return out;
}

// ------------------------------------------------------------ prompt + text

function buildSynthesisPrompt(question, results) {
  const lines = results.map(
    (r, i) => `[${i + 1}] ${r.title}${r.domain ? ` (${r.domain})` : ""}\n${r.snippet || "(no excerpt)"}`,
  );
  const system =
    "You are the answer engine of a WhatsApp bot's .j google command, like a search engine's AI overview. " +
    "Answer ONLY from the numbered search result excerpts provided by the user message. Rules: " +
    "1) Open with the direct answer, then brief supporting detail (2-6 sentences total). " +
    "2) Cite sources inline with their numbers, like [1] or [2][3]. " +
    "3) If the excerpts do not contain the answer, say so plainly and share the most relevant facts you do have, with citations. " +
    "4) Never invent facts, quotes, numbers or URLs. Never cite numbers that were not provided. " +
    "5) Plain text only — no markdown headings, no bullet lists unless genuinely enumerating. " +
    "6) Reply in the same language as the question.";
  const user = `Question: ${question}\n\nSearch result excerpts:\n${lines.join("\n\n")}`;
  return { system, user };
}

function formatSourceList(results) {
  return results
    .map(
      (r, i) =>
        `${i + 1}. ${r.domain || "web"}${r.title ? ` — ${r.title}` : ""}`,
    )
    .join("\n");
}

function buildOverviewMessage(question, answer, results) {
  const q = normalizeQuery(question);
  const a = String(answer || "").trim();
  const src = formatSourceList(results);
  let body = [
    "🌐 *AI OVERVIEW* 🔍",
    `_${q}_`,
    "",
    a.length > MAX_ANSWER_CHARS ? a.slice(0, MAX_ANSWER_CHARS - 1) + "…" : a,
    "",
    "*Sources:*",
    src,
  ].join("\n");
  let msg = `${body}\n\n_j google · answers grounded in web results_`;
  if (msg.length > MAX_MESSAGE_CHARS) {
    // trim the answer, keep sources intact
    const overflow = msg.length - MAX_MESSAGE_CHARS;
    const trimmed = a.slice(0, Math.max(200, a.length - overflow - 1)) + "…";
    body = [
      "🌐 *AI OVERVIEW* 🔍",
      `_${q}_`,
      "",
      trimmed,
      "",
      "*Sources:*",
      src,
    ].join("\n");
    msg = `${body}\n\n_j google · answers grounded in web results_`;
  }
  return msg;
}

// Groq down / synthesis empty → still useful: clean result digest.
function buildResultsOnlyMessage(question, results) {
  const q = normalizeQuery(question);
  const src = results
    .slice(0, 4)
    .map(
      (r, i) =>
        `*${i + 1}. ${r.title}*\n${r.domain}\n${(r.snippet || "").slice(0, 220)}`,
    )
    .join("\n\n");
  return [
    "🌐 *SEARCH RESULTS* 🔍",
    `_${q}_`,
    "",
    src || "No result excerpts available.",
    "",
    "_AI summary unavailable right now — showing the raw results._",
  ].join("\n");
}

module.exports = {
  MAX_QUERY,
  MAX_RESULTS,
  MIN_RESULTS,
  MAX_ANSWER_CHARS,
  MAX_MESSAGE_CHARS,
  normalizeQuery,
  decodeEntities,
  stripTags,
  unwrapDdgUrl,
  domainOf,
  parseDdgHtml,
  parseDdgLite,
  parseBingHtml,
  dedupeAndCap,
  buildSynthesisPrompt,
  formatSourceList,
  buildOverviewMessage,
  buildResultsOnlyMessage,
};
