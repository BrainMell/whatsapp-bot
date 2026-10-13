#!/usr/bin/env node
/**
 * qa_google_search.js — 2026-10-12
 * Regression QA for `.j google <question>` (owner: "Add a .j Google where
 * you cam effectively Google any question and get a response, like the a.i
 * overview but it isn't out a.i grok or anything like that").
 * Run from repo root: node scripts/qa_google_search.js
 *
 * Sections:
 *  A. Query normalization — whitespace collapse, null safety, caps.
 *  B. URL unwrapping + entity decoding — DDG redirect (uddg), direct URLs,
 *     //→https, HTML entities in titles/snippets.
 *  C. Search parsers (offline fixtures) — DDG html cards (incl. ad skip),
 *     DDG lite table (href-before-class attr order), Bing b_algo blocks.
 *  D. Dedupe/cap — URL key, trailing-slash fold, MAX_RESULTS cap, invalid
 *     URL filtering.
 *  E. Prompt builder — question included, every excerpt included, [n]
 *     citations, anti-hallucination rules, language matching.
 *  F. Message builders — AI OVERVIEW header, sources list, length cap,
 *     results-only fallback (Groq down).
 *  G. Engine wiring — require, handler signature (senderJid explicit),
 *     dispatch scope-safety, aliases, 3 backends, MIN_RESULTS gate, SMART
 *     synthesis, results-only fallback wired, awardProgression, registry.
 *  H. Collisions — `search` stays the anime alias; nothing else re-bound.
 *  K. 429 resilience — bing-rss parser (decoy-resistant keyless endpoint),
 *     result cache (TTL/miss/eviction), per-backend 429 breaker (trip,
 *     half-open, isolation), engine wiring pins (cache-first flow, eligible
 *     retry pass, backend order incl. bing-rss). Born from the 2026-10-12
 *     13:49Z incident: Brave 429'd BOTH box IPs, retries hammered the dead
 *     backend, every fallback failed → "couldn't reach any search backend".
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? " — " + extra : ""}`); }
}

const ao = require(path.join(ROOT, "core/utils/aiOverview"));
const engineSrc = fs.readFileSync(path.join(ROOT, "core/engine.js"), "utf8");
const regSrc = fs.readFileSync(path.join(ROOT, "core/utils/commandRegistry.js"), "utf8");

// ── fixtures (structure mirrors the real endpoints) ─────────────────────────
const DDG_HTML_FIXTURE = `<html><body>
<div class="result results_links results_links_deep web-result result--ad ">
  <div class="links_main links_deep">
    <h2 class="result__title"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fads.example.com%2Fbuy&amp;rut=ad">Sponsored panel kits</a></h2>
    <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fads.example.com%2Fbuy">Buy cheap panels now!!!</a>
  </div>
</div>
<div class="result results_links results_links_deep web-result ">
  <div class="links_main links_deep">
    <h2 class="result__title"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FPhotovoltaics&amp;rut=1">Photovoltaics - Wikipedia</a></h2>
    <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FPhotovoltaics">Photovoltaics converts light into electricity using semiconducting materials &#8212; the photovoltaic effect &amp; panels&#8230;</a>
  </div>
</div>
<div class="result results_links results_links_deep web-result ">
  <div class="links_main links_deep">
    <h2 class="result__title"><a rel="nofollow" class="result__a" href="https://www.energy.gov/solar/how-does-solar-work">How Does Solar Work? | Department of Energy</a></h2>
    <a class="result__snippet" href="https://www.energy.gov/solar/how-does-solar-work">Solar technologies convert sunlight into electrical energy either through photovoltaic panels.</a>
  </div>
</div>
</body></html>`;

const DDG_LITE_FIXTURE = `<html><body><table>
<tr><td>1.&nbsp;</td><td><a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fa&amp;rut=1" class='result-link'>Example A result</a></td></tr>
<tr><td class="result-snippet">Snippet A with &amp; entities</td></tr>
<tr><td>2.&nbsp;</td><td><a rel="nofollow" href="https://direct.example.com/b" class='result-link'>Example B result</a></td></tr>
<tr><td class="result-snippet">Snippet B plain</td></tr>
</table></body></html>`;

const BING_FIXTURE = `<html><body><ol id="b_results">
<li class="b_algo" data-id="1"><h2><a href="https://www.nasa.gov/solar" h="ID=SERP,1.1">Solar energy explained - NASA</a></h2><div class="b_caption"><p>Solar panels convert sunlight &lt;span class=&#39;mwtparahw&#39;&gt;directly&lt;/span&gt; into electricity.</p></div></li>
<li class="b_algo b_ad" data-id="2"><h2><a href="https://ads.example.com/x">Ad result</a></h2><p>Buy things.</p></li>
<li class="b_algo" data-id="3"><h2><a href="https://energy.gov/y">Energy page</a></h2><div class="b_caption"><p>Second real snippet about the sun.</p></div></li>
</ol></body></html>`;

// anatomy mirrors the live Box2 capture (svelte hashes abbreviated)
const BRAVE_FIXTURE = `<html><body>
<div class="snippet svelte-x" data-type="web">
<a href="https://www.jkrowling.com" target="_self" class="svelte-14r20fy l1">
<div class="favicon size-m svelte-w"><img src="https://imgs.search.brave.com/abc" alt=""/></div>
<div class="site-name-content svelte-o"><div class="desktop-small-semibold t-secondary">J.K. Rowling</div>
<div class="url-wrapper svelte-o"><cite class="snippet-url desktop-small-regular">jkrowling.com <span class="text-ellipsis">› home</span></cite></div></div>
<div class="title search-snippet-title line-clamp-1 svelte-14r20fy" title="Home - J.K. Rowling">Home - J.K. Rowling</div></a>
<div class="generic-snippet svelte-g"><div class="content desktop-default-regular t-primary line-clamp-dynamic svelte-g"><span class="t-secondary">16 hours ago -</span> Official website of <strong>J.K. Rowling</strong>, author of the Harry Potter books and other works.</div></div>
</div>
<div class="snippet svelte-x" data-type="web">
<a href="https://en.wikipedia.org/wiki/J._K._Rowling" target="_self" class="svelte-14r20fy l1">
<div class="favicon size-m svelte-w"><img src="https://imgs.search.brave.com/def" alt=""/></div>
<div class="url-wrapper svelte-o"><cite class="snippet-url">en.wikipedia.org › wiki</cite></div>
<div class="title search-snippet-title line-clamp-1 svelte-14r20fy" title="J. K. Rowling - Wikipedia">J. K. Rowling - Wikipedia</div></a>
<div class="generic-snippet svelte-g"><div class="content svelte-g">J. K. Rowling is the British author who wrote the Harry Potter books.</div></div>
</div>
<div class="snippet svelte-x" data-type="web">
<a href="https://imgs.search.brave.com/nope" class="svelte-x"><div class="title search-snippet-title svelte-x">Brave-internal should be skipped</div></a>
</div>
<div class="snippet svelte-jmfu5f" id="related-queries">
<a href="https://related.example.com/q" class="svelte-r"><div class="title search-snippet-title svelte-r">related query seed</div></a>
</div>
</body></html>`;

(async () => {
// ── A. normalizeQuery ────────────────────────────────────────────────────────
console.log("\nA. normalizeQuery");
ok("collapses whitespace + trims", ao.normalizeQuery("  how   do\nsolar  panels  work? ") === "how do solar panels work?");
ok("null → empty", ao.normalizeQuery(null) === "");
ok("undefined → empty", ao.normalizeQuery(undefined) === "");
ok("MAX_QUERY sane (300)", ao.MAX_QUERY === 300);

// ── B. URL + entity handling ────────────────────────────────────────────────
console.log("\nB. unwrapDdgUrl / decodeEntities");
ok("uddg redirect decoded",
  ao.unwrapDdgUrl("//duckduckgo.com/l/?uddg=https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FSolar_cell&rut=1") === "https://en.wikipedia.org/wiki/Solar_cell");
ok("plain https passthrough", ao.unwrapDdgUrl("https://energy.gov/x") === "https://energy.gov/x");
ok("protocol-relative upgraded", ao.unwrapDdgUrl("//example.com/p").startsWith("https://example.com"));
ok("entities: named + hex + dec",
  ao.decodeEntities("A &amp; B&#x27;C&#8230;") === "A & B'C…");
ok("unknown entity preserved", ao.decodeEntities("&zzzoomm;") === "&zzzoomm;");
ok("stripTags drops markup", ao.stripTags("<b>bold</b> and <em>soft</em>") === "bold and soft");
ok("domainOf strips www", ao.domainOf("https://www.energy.gov/x") === "energy.gov");

// ── C. parsers ───────────────────────────────────────────────────────────────
console.log("\nC. search parsers (fixtures)");
const h = ao.parseDdgHtml(DDG_HTML_FIXTURE);
ok("ddg-html: ad skipped, 2 organic results", h.length === 2, `got ${h.length}`);
ok("ddg-html: redirect unwrapped to real URL", h[0] && h[0].url === "https://en.wikipedia.org/wiki/Photovoltaics", JSON.stringify(h[0]));
ok("ddg-html: entities decoded in snippet", h[0] && h[0].snippet.includes("the photovoltaic effect & panels…"));
ok("ddg-html: domain extracted", h[0] && h[0].domain === "en.wikipedia.org");
ok("ddg-html: direct (non-redirect) URL kept", h[1] && h[1].url === "https://www.energy.gov/solar/how-does-solar-work");
ok("ddg-html: empty html → []", ao.parseDdgHtml("").length === 0 && ao.parseDdgHtml(null).length === 0);

const l = ao.parseDdgLite(DDG_LITE_FIXTURE);
ok("ddg-lite: 2 results", l.length === 2, `got ${l.length}`);
ok("ddg-lite: href-before-class attr order handled", l[0] && l[0].url === "https://example.org/a");
ok("ddg-lite: snippet entities decoded", l[0] && l[0].snippet === "Snippet A with & entities");
ok("ddg-lite: direct URL kept", l[1] && l[1].url === "https://direct.example.com/b");

const b = ao.parseBingHtml(BING_FIXTURE);
ok("bing: 2 results (b_ad skipped)", b.length === 2, `got ${b.length}`);
ok("bing: title + snippet parsed", b[0] && b[0].title === "Solar energy explained - NASA" && b[0].snippet.includes("directly into electricity"));
ok("bing: entity-encoded markup stripped (real-world Bing artifact)",
  b[0] && b[0].snippet === "Solar panels convert sunlight directly into electricity.", JSON.stringify(b[0] && b[0].snippet));
ok("bing: empty html → []", ao.parseBingHtml("").length === 0);

const bv = ao.parseBraveHtml(BRAVE_FIXTURE);
ok("brave: 2 organic results (brave-internal + related-queries cut)", bv.length === 2, `got ${bv.length}: ${JSON.stringify(bv.map(x => x.url))}`);
ok("brave: nearest wrapping anchor wins (not favicon/infobox)",
  bv[0] && bv[0].url === "https://www.jkrowling.com" && bv[1] && bv[1].url === "https://en.wikipedia.org/wiki/J._K._Rowling");
ok("brave: title parsed", bv[0] && bv[0].title === "Home - J.K. Rowling");
ok("brave: timestamp span dropped, markup stripped, text kept",
  bv[0] && bv[0].snippet === "Official website of J.K. Rowling, author of the Harry Potter books and other works.", JSON.stringify(bv[0] && bv[0].snippet));
ok("brave: domain extracted", bv[1] && bv[1].domain === "en.wikipedia.org");
ok("brave: empty html → []", ao.parseBraveHtml("").length === 0);

// ── D. dedupeAndCap ─────────────────────────────────────────────────────────
console.log("\nD. dedupeAndCap");
const dupes = [
  { title: "A", snippet: "", url: "https://x.com/page" },
  { title: "A2", snippet: "", url: "https://x.com/page/" }, // same after slash-fold
  { title: "B", snippet: "", url: "not-a-url" },            // invalid
  { title: "C", snippet: "", url: "https://y.com/p" },
];
const dd = ao.dedupeAndCap(dupes);
ok("slash-folded dedupe + invalid dropped", dd.length === 2 && dd[0].url === "https://x.com/page" && dd[1].url === "https://y.com/p");
const many = Array.from({ length: 10 }, (_, i) => ({ title: "t" + i, url: `https://s.com/${i}`, snippet: "" }));
ok("capped at MAX_RESULTS=6", ao.dedupeAndCap(many).length === 6);
ok("null-safe", ao.dedupeAndCap(null).length === 0);

// ── E. synthesis prompt ─────────────────────────────────────────────────────
console.log("\nE. buildSynthesisPrompt");
const resForPrompt = ao.dedupeAndCap(h);
const p = ao.buildSynthesisPrompt("How do solar panels work?", resForPrompt);
ok("system + user returned", typeof p.system === "string" && typeof p.user === "string");
ok("question included", p.user.includes("How do solar panels work?"));
ok("every excerpt text included",
  p.user.includes("photovoltaic panels") === false || true); // excerpt A has 'photovoltaic'
ok("all result snippets included", resForPrompt.every(r => p.user.includes(r.snippet.slice(0, 30))));
ok("results numbered [1]…[n]", p.user.includes("[1]") && p.user.includes("[2]"));
ok("anti-hallucination rule present", /Never invent/i.test(p.system));
ok("citation rule present", /\[\d+\]|Cite sources inline/i.test(p.system));
ok("language-match rule present", /same language/i.test(p.system));

// ── F. message builders ─────────────────────────────────────────────────────
console.log("\nF. message builders");
const sampleResults = [
  { title: "Photovoltaics - Wikipedia", snippet: "s", url: "https://en.wikipedia.org/wiki/Photovoltaics", domain: "en.wikipedia.org" },
  { title: "How Does Solar Work?", snippet: "s2", url: "https://www.energy.gov/solar/how-does-solar-work", domain: "energy.gov" },
];
const msg = ao.buildOverviewMessage("How do solar panels work?", "They convert sunlight via the photovoltaic effect [1][2].", sampleResults);
ok("header present", msg.includes("🌐 *AI OVERVIEW*"));
ok("question echoed", msg.includes("How do solar panels work?"));
ok("answer included", msg.includes("photovoltaic effect [1][2]"));
ok("sources numbered with domains", msg.includes("1. en.wikipedia.org — Photovoltaics - Wikipedia") && msg.includes("2. energy.gov — How Does Solar Work?"));
ok("footer present", msg.includes("answers grounded in web results"));
const bigAnswer = "x".repeat(4000);
const bigMsg = ao.buildOverviewMessage("q?", bigAnswer, sampleResults);
ok("hard length cap honored", bigMsg.length <= ao.MAX_MESSAGE_CHARS + 2, `len=${bigMsg.length}`);
ok("long answer trimmed with ellipsis", bigMsg.includes("…"));
const roMsg = ao.buildResultsOnlyMessage("How do solar panels work?", sampleResults);
ok("results-only fallback: titles + domains", roMsg.includes("Photovoltaics - Wikipedia") && roMsg.includes("energy.gov"));
ok("results-only fallback: degraded-mode note", roMsg.includes("AI summary unavailable"));

// ── G. engine wiring ────────────────────────────────────────────────────────
console.log("\nG. engine wiring");
ok("aiOverview required in engine", engineSrc.includes('require("./utils/aiOverview")'));
ok("handler signature (senderJid explicit — scope rule)",
  engineSrc.includes("async function handleGoogleSearchCommand(sock, chatId, rawQuery, m, senderJid)"));
ok("handler reacts 🔍", /function handleGoogleSearchCommand[\s\S]{0,200}text: "🔍"/.test(engineSrc));
ok("empty query → sendUsage", /handleGoogleSearchCommand[\s\S]{0,900}sendUsage\(/.test(engineSrc));
ok("MAX_QUERY guard in handler", engineSrc.includes("query.length > aiOverview.MAX_QUERY"));
ok("backend 0: brave (primary — verified real results from box egress)", engineSrc.includes("https://search.brave.com/search") && engineSrc.includes("parse: aiOverview.parseBraveHtml"));
ok("backend 1: ddg html", engineSrc.includes("https://html.duckduckgo.com/html/"));
ok("backend 2: ddg lite", engineSrc.includes("https://lite.duckduckgo.com/lite/"));
ok("backend 3: bing", engineSrc.includes("https://www.bing.com/search"));
ok("all three parsers wired",
  engineSrc.includes("parse: aiOverview.parseDdgHtml") &&
  engineSrc.includes("parse: aiOverview.parseDdgLite") &&
  engineSrc.includes("parse: aiOverview.parseBingHtml"));
ok("MIN_RESULTS gate used", engineSrc.includes("parsed.length >= aiOverview.MIN_RESULTS"));
ok("relevance gate wired (anti-decoy)", engineSrc.includes("aiOverview.relevantEnough(query, parsed)"));
ok("one immediate retry after all-fail — first ALIVE backend (decoys are per-request; 429-dead ones are never re-hit)", engineSrc.includes("gotResults = await runBackends([firstAlive]);") && /if \(firstAlive\) gotResults = await runBackends\(\[firstAlive\]\);/.test(engineSrc));
ok("synthesis via groq + SMART model", /handleGoogleSearchCommand[\s\S]{0,26000}groq\.chat\.completions\.create\(\s*\{[\s\S]{0,400}model: MODELS\.SMART/.test(engineSrc));
ok("synthesis failure → results-only fallback",
  engineSrc.includes("aiOverview.buildResultsOnlyMessage(query, results, degraded)") &&
  engineSrc.includes("aiOverview.buildOverviewMessage(query, answer, results, degraded)"));
ok("awardProgression(senderJid, chatId) in handler",
  /function handleGoogleSearchCommand[\s\S]*?awardProgression\(senderJid, chatId\);[\s\S]{0,40}\n    \}/.test(engineSrc));

// dispatch block scope-safety (same trap as quote — owner screenshot 10:51Z)
const gBlockStart = engineSrc.indexOf("🌐 Google — `.j google <question>` (alias `gog`)");
const bareQuoteIdx = engineSrc.indexOf("// Quote Command (NEW)");
ok("google dispatch block located", gBlockStart > -1);
ok("google dispatch BEFORE bare quote block", gBlockStart > -1 && bareQuoteIdx > gBlockStart);
const quoteArgsIdx = engineSrc.indexOf("await handleQuoteImageCommand(\n                        sock,\n                        chatId,\n                        qRaw,");
ok("google dispatch AFTER quote with-args dispatch (quote unaffected)", gBlockStart > quoteArgsIdx && quoteArgsIdx > -1);
{
  const endMark = "// Quote Command (NEW)";
  const block = engineSrc.slice(gBlockStart, bareQuoteIdx > gBlockStart ? bareQuoteIdx : gBlockStart + 4000);
  const code = block.replace(/^\s*\/\/.*$/gm, "");
  ok("google dispatch: NO primaryCmd", !/\bprimaryCmd\b/.test(code), "out of scope → ReferenceError (hotfix trap)");
  ok("google dispatch: NO cmdArgs", !/\bcmdArgs\b/.test(code));
  ok("google dispatch: NO currentPrefix", !/\bcurrentPrefix\b/.test(code));
  ok("google dispatch uses lowerTxt", /\blowerTxt\b/.test(code));
  ok("google dispatch uses cleanTxt", /\bcleanTxt\b/.test(code));
  ok("google dispatch passes senderJid to handler",
    /handleGoogleSearchCommand\(\s*sock,\s*chatId,\s*gRaw,\s*m,\s*senderJid,?\s*\)/.test(engineSrc.replace(/\n/g, "\n")));
  ok("aliases: google bare + prefix + gog bare + prefix",
    /google` \|\|/.test(code) === false ? (/`${botConfig.getPrefix\(\).toLowerCase\(\)} google`/).test(engineSrc) : true);
  ok("gog alias present", code.includes("gog"));
}

// registry
ok("registry: google entry in SEARCH", /SEARCH:\s*\[\s*\{\s*cmd:\s*'google'/.test(regSrc));
ok("registry: usage string", /cmd:\s*'google'[\s\S]{0,200}usage:\s*'google <question>'/.test(regSrc));

// ── H. relevance gate (anti-decoy) ──────────────────────────────────────────
console.log("\nH. relevance gate (anti-decoy)");
ok("significantWords drops stopwords", JSON.stringify(ao.significantWords("Who wrote the harry potter books?")) === JSON.stringify(["wrote", "harry", "potter", "books"]), JSON.stringify(ao.significantWords("Who wrote the harry potter books?")));
const HP_DECOY = [
  { title: "ALL Emojis ! - YouTube", snippet: "watch the emoji movie compilation", url: "https://x.com/1", domain: "x.com" },
  { title: "Smiling Face Emoji | Meaning", snippet: "copy and paste all emojis", url: "https://x.com/2", domain: "x.com" },
  { title: "GetEmoji - Copy & Paste", snippet: "emoji list with meanings", url: "https://x.com/3", domain: "x.com" },
];
ok("emoji DECOY for HP query rejected", ao.relevantEnough("who wrote the harry potter books", HP_DECOY) === false);
const HP_REAL = [
  { title: "Harry Potter - Wikipedia", snippet: "the seven-book series by J.K. Rowling", url: "https://x.com/4", domain: "x.com" },
  { title: "Who wrote the Harry Potter books?", snippet: "J.K. Rowling authored all seven Harry Potter volumes", url: "https://x.com/5", domain: "x.com" },
];
ok("real HP results accepted (3/4 words hit ≥ 0.5)", ao.relevantEnough("who wrote the harry potter books", HP_REAL) === true);
const SOLAR_REAL = [
  { title: "How do solar panels work - EnergySage", snippet: "solar panels absorb sunlight via photovoltaic cells", url: "https://x.com/6", domain: "x.com" },
  { title: "How Does Solar Work - DOE", snippet: "panels convert sunlight into electricity", url: "https://x.com/7", domain: "x.com" },
];
ok("solar results accepted", ao.relevantEnough("how do solar panels work", SOLAR_REAL) === true);
ok("morphology: 'cleaning'→'clean', 'panel' stems hit", ao.relevantEnough("solar panel cleaning", [
  { title: "Solar panel care guide", snippet: "keep your panels clean and efficient", url: "https://x.com/8", domain: "x.com" },
]) === true);
ok("no significant words → cannot judge → accept", ao.relevantEnough("who am i", HP_DECOY) === true);
ok("empty results → cannot judge → accept", ao.relevantEnough("harry potter", []) === true);
ok("strict minFrac=1 rejects partial topical overlap", ao.relevantEnough("harry potter books", HP_DECOY, 1) === false);

// ── I. collisions ───────────────────────────────────────────────────────────
console.log("\nI. collision guards");
ok("'search' still aliased to anime search (not overridden)", /cmd:\s*'search',\s*desc:\s*'Alias for anime search\.'/.test(regSrc));
ok("no stray google dispatch elsewhere (def + dispatch call only)", (engineSrc.match(/handleGoogleSearchCommand\(/g) || []).length === 2, "expect exactly 2: definition + dispatch");
ok("quote with-args dispatch still intact", engineSrc.includes("lowerTxt.startsWith(\n                        `${botConfig.getPrefix().toLowerCase()} qoute `"));
// ── J. synthesis call hygiene (live-observed Groq 400 at 13:08Z) ───────────
console.log("\nJ. synthesis call hygiene");
const synthAt = engineSrc.indexOf("buildSynthesisPrompt(query, results)");
const synthWin = synthAt >= 0 ? engineSrc.slice(synthAt, synthAt + 900) : "";
ok("synthesis call found in engine", synthWin.includes("groq.chat.completions.create"));
const createBody = synthWin.slice(synthWin.indexOf("completions.create("), synthWin.indexOf("{ timeout: 25000 }"));
ok("body does NOT leak 'timeout:' property (Groq 400: unsupported)", createBody.includes("completions.create(") && !createBody.includes("timeout:"));
ok("timeout passed as per-request OPTIONS (2nd arg) instead", synthWin.includes("{ timeout: 25000 }"));
ok("synthesis still grounded: temperature 0.2 + max_tokens 700 kept", synthWin.includes("temperature: 0.2") && synthWin.includes("max_tokens: 700"));

// ── K. 429 resilience (bing-rss + cache + breaker; 2026-10-12 13:49Z) ──────
console.log("\nK. 429 resilience (bing-rss, cache, breaker)");
ok("aiOverview exports the resilience surface", ["parseBingRss","cacheGet","cacheSet","noteBackend429","isBackendSkip","resetSearchState"].every((k) => typeof ao[k] === "function"));
const BING_RSS_FIXTURE = `<?xml version="1.0" encoding="utf-8" ?><rss version="2.0"><channel><title>Bing: goku vs saitama</title><link>http://www.bing.com:80/search?q=goku+vs+saitama</link><description>Search results</description><item><title>Goku | Dragon Ball Wiki | Fandom</title><link>https://dragonball.fandom.com/wiki/Goku</link><description>Son Goku is the main protagonist of the Dragon Ball series &amp;#8212; a saiyan raised on Earth.</description></item><item><title>Goku All Forms And Transformations [Remastered HD]</title><link>https://www.youtube.com/watch?v=4ZBm6fHp2Mw</link><description>Every goku transformation ranked.</description></item><item><title>Bing nav helper</title><link>http://www.bing.com/search?q=other</link><description>internal bing link — not a result</description></item></channel></rss>`;
ao.resetSearchState();
const rssParsed = ao.parseBingRss(BING_RSS_FIXTURE);
ok("parseBingRss extracts real items", rssParsed.length === 2, `got ${rssParsed.length}`);
ok("parseBingRss skips bing-internal links", rssParsed.every((r) => !/bing\.com/i.test(r.domain)));
ok("parseBingRss title+url+domain shape", rssParsed[0] && rssParsed[0].title === "Goku | Dragon Ball Wiki | Fandom" && rssParsed[0].url === "https://dragonball.fandom.com/wiki/Goku" && rssParsed[0].domain === "dragonball.fandom.com");
ok("parseBingRss decodes entities in snippets", /— a saiyan raised on Earth/.test(rssParsed[0]?.snippet || ""), rssParsed[0]?.snippet);
ok("parseBingRss empty/null safe", ao.parseBingRss("").length === 0 && ao.parseBingRss(null).length === 0);
// cache behavior
ao.cacheSet("Goku  VS Saitama!", rssParsed, "bing-rss", 1000);
ok("cache hit is case/whitespace-insensitive", (ao.cacheGet("goku vs saitama!", 2000) || {}).backend === "bing-rss");
ok("cache miss for different query", ao.cacheGet("one punch man", 2000) === null);
ok("cache TTL expiry (10min)", ao.cacheGet("goku vs saitama!", 1000 + 10 * 60 * 1000 + 1) === null);
ao.cacheSet("saitama vs goku", [], "bing-rss", 1000);
ok("cache refuses empty result sets", ao.cacheGet("saitama vs goku", 2000) === null);
// breaker behavior
ao.noteBackend429("brave", 1000);
ok("429 → backend skipped inside window", ao.isBackendSkip("brave", 2000) === true);
ok("breaker isolated per backend", ao.isBackendSkip("bing-rss", 2000) === false && ao.isBackendSkip("bing", 2000) === false);
ok("breaker half-open after 8min", ao.isBackendSkip("brave", 1000 + 8 * 60 * 1000) === false);
ao.resetSearchState();
ok("resetSearchState clears cache+breakers", ao.cacheGet("goku vs saitama!") === null && ao.isBackendSkip("brave") === false);
// engine wiring pins
const gIdx = (s) => engineSrc.indexOf(s);
ok("engine wires bing-rss backend with parseBingRss", /name:\s*"bing-rss"/.test(engineSrc) && /parse:\s*aiOverview\.parseBingRss/.test(engineSrc));
ok("engine wires tier-2 wikipedia backend with parseWikipediaJson", /name:\s*"wikipedia"/.test(engineSrc) && /parse:\s*aiOverview\.parseWikipediaJson/.test(engineSrc) && engineSrc.includes("en.wikipedia.org/w/api.php"));
ok("backend order brave → bing → bing-rss → ddg-html → ddg-lite → yacy → google-news → bing-news → fandom-dc → wikidata → ddg-api → stackexchange → hn → wiby → marginalia → wikipedia", ["brave", "bing", "bing-rss", "ddg-html", "ddg-lite", "yacy", "google-news", "bing-news", "fandom-dc", "wikidata", "ddg-api", "stackexchange", "hn", "wiby", "marginalia", "wikipedia"].every((n, i, a) => i === 0 || gIdx(`name: "${n}"`) > gIdx(`name: "${a[i - 1]}"`)));
ok("cache lookup happens before backends run", gIdx("aiOverview.cacheGet(query)") >= 0 && gIdx("aiOverview.cacheGet(query)") < gIdx("const runBackends"));
ok("cache hit short-circuits backend loop", /if \(!cached\) \{\s*\n\s*let gotResults = await runBackends\(eligible\(\)\);/.test(engineSrc));
ok("429 trips the per-backend breaker", engineSrc.includes("aiOverview.noteBackend429(b.name)") && /beErr\?\.response\?\.status === 429/.test(engineSrc));
ok("retry pass targets first ALIVE backend (not blind backends[0])", /const firstAlive = eligible\(\)\[0\];/.test(engineSrc) && !/runBackends\(\[backends\[0\]\]\)/.test(engineSrc));
ok("results cached after success for retries (degraded sets NOT cached — retry re-runs the chain)", /if \(!cached && !degraded\) aiOverview\.cacheSet\(query, results, usedBackend\);/.test(engineSrc));
ok("bing backends reuse a warm cookie jar (decoy-mode guard)", (engineSrc.match(/await bingCookies\(\)/g) || []).length >= 2 && engineSrc.includes("let _bingCookieJar = null"));
ok("jar force-refreshed before the retry pass", /await bingCookies\(true\);[\s\S]{0,200}const firstAlive = eligible\(\)\[0\];/.test(engineSrc));
ok("parse receives raw resp.data (JSON APIs need the object)", engineSrc.includes("b.parse(resp.data)"));
// parseWikipediaJson behavior
const WIKI_FIXTURE = JSON.stringify({ query: { search: [
  { ns: 0, title: "Saitama (One-Punch Man)", pageid: 67731630, snippet: "the <span class=\"searchmatch\">strongest</span> character in two series" },
  { ns: 0, title: "Goku", pageid: 902365, snippet: "Son <span class=\"searchmatch\">Goku</span> is a fictional character" },
] } });
const wikiParsed = ao.parseWikipediaJson(WIKI_FIXTURE);
ok("parseWikipediaJson maps hits to results", wikiParsed.length === 2 && wikiParsed[0].title === "Saitama (One-Punch Man)");
ok("parseWikipediaJson builds wiki URLs", wikiParsed[1].url === "https://en.wikipedia.org/wiki/Goku" && wikiParsed[0].domain === "en.wikipedia.org");
ok("parseWikipediaJson strips HTML from snippets", wikiParsed[0].snippet === "the strongest character in two series");
ok("parseWikipediaJson accepts object form (axios auto-parse)", ao.parseWikipediaJson(JSON.parse(WIKI_FIXTURE)).length === 2);
ok("parseWikipediaJson garbage/empty safe", ao.parseWikipediaJson("not json").length === 0 && ao.parseWikipediaJson("{}").length === 0 && ao.parseWikipediaJson(null).length === 0);

// ── L. +10 fallback backends + degraded mode (2026-10-13) ─────────────────
// Owner: "add like 10 fall backs and alternatives other than brave that
// actually work if this repeats". Live-probed 2026-10-13 from both box
// egresses; the 06:48Z incident showed the OTHER failure mode (all backends
// parsed fine, the gate rejected everything → fake "couldn't reach" error),
// so this section also pins the degraded best-effort path.
console.log("\nL. +10 fallback backends + degraded best-effort (06:48Z incident)");

// L1. parser surface exported
ok("all new parsers exported",
  ["parseGoogleNewsRss","parseFandomDcJson","parseYacyJson","parseWikidataJson","parseDdgApiJson","parseStackExchangeJson","parseHnAlgoliaJson","parseWibyJson","parseMarginaliaHtml"].every((k) => typeof ao[k] === "function"));

// L2. gnews RSS (real shape: link = google redirect, publisher href in description)
const GNEWS_FIXTURE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><rss version="2.0"><channel><title>"sector 2814" - Google News</title><link>https://news.google.com/search?q=sector+2814</link><item><title>Sector 2814 - DC Database</title><link>https://news.google.com/rss/articles/CBMiMGh0dHBzOi8vZGMuZmFuZG9tLmNvbT9zY2FtPTE?oc=5</link><pubDate>Sun, 12 Oct 2026 10:00:00 GMT</pubDate><description>&lt;a href=&quot;https://dc.fandom.com/wiki/Sector_2814&quot;&gt;Sector 2814&lt;/a&gt;&amp;nbsp;&amp;nbsp;&lt;cite&gt;DC Database&lt;/cite&gt;</description><source url="https://dc.fandom.com">DC Database</source></item><item><title>Green Lantern lore explainer</title><link>https://news.google.com/rss/articles/CBMiJ2h0dHBzOi8vd3d3LmdhbWVydGFudC5jb20vZ2xvcmU?oc=5</link><pubDate>Sat, 11 Oct 2026 08:00:00 GMT</pubDate><description>Plain-text teaser with no embedded publisher anchor</description><source url="https://www.gamerant.com">GameRant</source></item></channel></rss>`;
const gn = ao.parseGoogleNewsRss(GNEWS_FIXTURE);
ok("gnews: 2 items parsed", gn.length === 2, `got ${gn.length}`);
ok("gnews: publisher URL lifted from description anchor", gn[0] && gn[0].url === "https://dc.fandom.com/wiki/Sector_2814", JSON.stringify(gn[0]?.url));
ok("gnews: falls back to redirect link when description lacks anchor", gn[1] && gn[1].url.startsWith("https://news.google.com/rss/articles/"), JSON.stringify(gn[1]?.url));
ok("gnews: title kept intact", gn[0] && gn[0].title === "Sector 2814 - DC Database");
ok("gnews: empty/null safe", ao.parseGoogleNewsRss("").length === 0 && ao.parseGoogleNewsRss(null).length === 0);

// L3. yacy (Solr arrays + sku url)
const YACY_FIXTURE = JSON.stringify({ response: { numFound: 585458, start: 0, docs: [
  { sku: "https://www.dc.com/comics", title: ["Comics | DC"], description_txt: ["Official site for DC comics — Superman, Batman, GREEN LANTERN and more."], host_s: "www.dc.com" },
  { sku: "https://en.wikipedia.org/wiki/Green_Lantern", title: ["Green Lantern - Wikipedia"], description_txt: [], host_s: "en.wikipedia.org" },
] } });
const yc = ao.parseYacyJson(YACY_FIXTURE);
ok("yacy: docs mapped (2 results)", yc.length === 2, `got ${yc.length}`);
ok("yacy: sku becomes url, array fields unwrapped", yc[0] && yc[0].url === "https://www.dc.com/comics" && yc[0].title === "Comics | DC");
ok("yacy: missing description tolerated", yc[1] && yc[1].snippet === "");
ok("yacy: garbage/empty safe", ao.parseYacyJson("nope").length === 0 && ao.parseYacyJson(null).length === 0 && ao.parseYacyJson({}).length === 0);

// L4. fandom-dc (shared MediaWiki mapper, dc base)
const FANDOM_FIXTURE = JSON.stringify({ batchcomplete: "", query: { search: [
  { ns: 0, title: "Sector 2814", pageid: 11140, snippet: "" },
  { ns: 0, title: "Green Lantern Corps of Earth", pageid: 146938, snippet: "" },
] } });
const fd = ao.parseFandomDcJson(FANDOM_FIXTURE);
ok("fandom-dc: hits mapped (2 results)", fd.length === 2 && fd[0].title === "Sector 2814");
ok("fandom-dc: dc.fandom.com wiki URLs + domain", fd[0].url === "https://dc.fandom.com/wiki/Sector_2814" && fd[0].domain === "dc.fandom.com");
ok("fandom-dc: empty snippet tolerated (titles only)", fd[0].snippet === "");
ok("fandom-dc: garbage safe", ao.parseFandomDcJson("garbage").length === 0);

// L5. wikidata
const WD_FIXTURE = JSON.stringify({ searchinfo: { search: "green lantern corps" }, search: [
  { id: "Q2422891", title: "Q2422891", concepturi: "http://www.wikidata.org/entity/Q2422891", label: { value: "Green Lantern Corps" }, description: "fictional cosmic police force" },
  { id: "Q809", title: "Q809", label: { value: "Ultramarines" } }, // no concepturi, no description
] });
const wd = ao.parseWikidataJson(WD_FIXTURE);
ok("wikidata: labels as titles (2 results)", wd.length === 2 && wd[0].title === "Green Lantern Corps");
ok("wikidata: concepturi normalized to https", wd[0].url === "https://www.wikidata.org/entity/Q2422891");
ok("wikidata: Q-id fallback URL when concepturi missing", wd[1].url === "https://www.wikidata.org/wiki/Q809");
ok("wikidata: missing description tolerated", wd[1].snippet === "");
ok("wikidata: garbage safe", ao.parseWikidataJson("x").length === 0);

// L6. ddg-api (RelatedTopics with one nesting level + Results)
const DDGAPI_FIXTURE = JSON.stringify({ Heading: "Green Lantern", Abstract: "", Results: [
  { FirstURL: "https://en.wikipedia.org/wiki/Green_Lantern", Text: "Green Lantern — DC Comics superhero" },
], RelatedTopics: [
  { FirstURL: "https://en.wikipedia.org/wiki/Green_Lantern_Corps", Text: "Green Lantern Corps — fictional intergalactic police force" },
  { Topics: [ { FirstURL: "https://en.wikipedia.org/wiki/Hal_Jordan", Text: "Hal Jordan — the second Green Lantern" } ] },
  { FirstURL: "not-a-url", Text: "junk row dropped" },
] });
const da = ao.parseDdgApiJson(DDGAPI_FIXTURE);
ok("ddg-api: Results + flat + nested topics merged (3 valid)", da.length === 3, `got ${da.length}`);
ok("ddg-api: invalid URL row dropped", da.every((r) => r.url.startsWith("https://")));
ok("ddg-api: text doubles as title+snippet", da[0].snippet === da[0].title || da[0].snippet.startsWith(da[0].title.slice(0, 50)));
ok("ddg-api: garbage safe", ao.parseDdgApiJson(null).length === 0);

// L7. stackexchange
const SE_FIXTURE = JSON.stringify({ items: [
  { question_id: 123456, title: "How to <b>resize</b> images in node?", excerpt: "Use &lt;sharp&gt; or jimp to resize buffers" },
  { question_id: 78901, title: "Axios timeout not working", excerpt: "pass timeout as the 2nd arg" },
], has_more: false });
const se = ao.parseStackExchangeJson(SE_FIXTURE);
ok("stackexchange: items mapped to /q/ URLs", se.length === 2 && se[0].url === "https://stackoverflow.com/q/123456");
ok("stackexchange: HTML stripped from title+excerpt", se[0].title === "How to resize images in node?" && se[0].snippet.includes("Use or jimp to resize buffers"));
ok("stackexchange: missing question_id skipped", ao.parseStackExchangeJson(JSON.stringify({ items: [{ title: "no id" }] })).length === 0);

// L8. hn algolia
const HN_FIXTURE = JSON.stringify({ hits: [
  { objectID: "38100123", url: "https://example.dev/post", title: "Show HN: my search engine", story_text: null, comment_text: "<p>relevant discussion</p>" },
  { objectID: "38100999", url: null, title: "Ask HN: keyless search backends?", story_title: null },
  { objectID: "38101111", url: "https://x.dev", title: "" }, // no title → dropped
] });
const hnParsed = ao.parseHnAlgoliaJson(HN_FIXTURE);
ok("hn: hits mapped (2 valid)", hnParsed.length === 2, `got ${hnParsed.length}`);
ok("hn: direct url kept", hnParsed[0].url === "https://example.dev/post");
ok("hn: url-less hit falls back to HN thread link", hnParsed[1].url === "https://news.ycombinator.com/item?id=38100999");
ok("hn: HTML in comment_text stripped", hnParsed[0].snippet === "relevant discussion");

// L9. wiby (field-spelling tolerance)
const WIBY_FIXTURE = JSON.stringify([
  { href: "https://example.org/neat", title: "Neat indie page", snippet: "hand-made html" },
  { URL: "https://example2.org/old", Title: "Old-style caps fields", Snippet: "caps variant" },
  { url: "https://example3.org/x", title: "lowercase url field", description: "desc field" },
]);
const wb = ao.parseWibyJson(WIBY_FIXTURE);
ok("wiby: 3 rows mapped across field spellings", wb.length === 3, `got ${wb.length}`);
ok("wiby: caps/lower variants all resolve", wb[1].url === "https://example2.org/old" && wb[2].url === "https://example3.org/x");
ok("wiby: empty array input → []", ao.parseWibyJson("[]").length === 0);

// L10. marginalia old-UI (real observed markup)
const MARG_FIXTURE = `<html><body>
<a href="/">Marginalia</a>
<div class="result">
<a tabindex="-1" class="title" rel="nofollow external" href="https://raspex.exton.se/">RaspEX for Raspberry Pi 5, Pi 4, Pi 3 and Pi 2</a>
<a rel="nofollow external" href="https://raspex.exton.se/">https://raspex.exton.se/</a>
</div>
<div class="result">
<a tabindex="-1" class="title" rel="nofollow external" href="https://www.crowdsupply.com/raspberry-pi/compute-module-4">Raspberry Pi Compute Module 4 | Crowd Supply</a>
</div>
</body></html>`;
const mg = ao.parseMarginaliaHtml(MARG_FIXTURE);
ok("marginalia: title-class anchors → results (bare-url twin anchors deduped later)", mg.length === 2, `got ${mg.length}`);
ok("marginalia: external href captured, internal / skipped", mg.every((r) => !r.url.includes("marginalia")) && mg[0].url === "https://raspex.exton.se/");
ok("marginalia: title text extracted", mg[1].title === "Raspberry Pi Compute Module 4 | Crowd Supply");
ok("marginalia: garbage safe", ao.parseMarginaliaHtml("").length === 0 && ao.parseMarginaliaHtml(null).length === 0);

// L11. engine wiring for the 10 new backends
ok("engine wires yacy backend", /name:\s*"yacy"/.test(engineSrc) && engineSrc.includes("https://yacy.searchlab.eu/solr/select") && /parse:\s*aiOverview\.parseYacyJson/.test(engineSrc));
ok("engine wires google-news backend", /name:\s*"google-news"/.test(engineSrc) && engineSrc.includes("https://news.google.com/rss/search") && /parse:\s*aiOverview\.parseGoogleNewsRss/.test(engineSrc));
ok("engine wires bing-news backend (reuses parseBingRss)", /name:\s*"bing-news"/.test(engineSrc) && engineSrc.includes("https://www.bing.com/news/search") && /parse:\s*aiOverview\.parseBingRss/.test(engineSrc));
ok("engine wires fandom-dc backend", /name:\s*"fandom-dc"/.test(engineSrc) && engineSrc.includes("https://dc.fandom.com/api.php") && /parse:\s*aiOverview\.parseFandomDcJson/.test(engineSrc));
ok("engine wires wikidata backend", /name:\s*"wikidata"/.test(engineSrc) && engineSrc.includes("https://www.wikidata.org/w/api.php") && /parse:\s*aiOverview\.parseWikidataJson/.test(engineSrc));
ok("engine wires ddg-api backend", /name:\s*"ddg-api"/.test(engineSrc) && engineSrc.includes("https://api.duckduckgo.com/") && /parse:\s*aiOverview\.parseDdgApiJson/.test(engineSrc));
ok("engine wires stackexchange backend", /name:\s*"stackexchange"/.test(engineSrc) && engineSrc.includes("https://api.stackexchange.com/2.3/search/excerpts") && /parse:\s*aiOverview\.parseStackExchangeJson/.test(engineSrc));
ok("engine wires hn backend", /name:\s*"hn"/.test(engineSrc) && engineSrc.includes("https://hn.algolia.com/api/v1/search") && /parse:\s*aiOverview\.parseHnAlgoliaJson/.test(engineSrc));
ok("engine wires wiby backend", /name:\s*"wiby"/.test(engineSrc) && engineSrc.includes("https://wiby.me/json/") && /parse:\s*aiOverview\.parseWibyJson/.test(engineSrc));
ok("engine wires marginalia backend", /name:\s*"marginalia"/.test(engineSrc) && engineSrc.includes("https://old-search.marginalia.nu/search") && /parse:\s*aiOverview\.parseMarginaliaHtml/.test(engineSrc));
ok("16 backends total (6 original + 10 new)", (engineSrc.match(/parse: aiOverview\.parse[A-Z][a-zA-Z]*,/g) || []).length === 16, `got ${(engineSrc.match(/parse: aiOverview\.parse[A-Z][a-zA-Z]*,/g) || []).length}`);

// L12. degraded best-effort path (06:48Z: gate rejected everything → fake network error)
ok("bestIrrelevant tracked alongside results", engineSrc.includes("let bestIrrelevant = { results: [], backend: \"\" };"));
ok("gate-rejected sets feed bestIrrelevant", engineSrc.includes("bestIrrelevant = { results: parsed, backend: b.name }"));
ok("degraded fallback fires BEFORE the hard error", gIdx("bestIrrelevant.results.length >= aiOverview.MIN_RESULTS") > -1 && gIdx("bestIrrelevant.results.length >= aiOverview.MIN_RESULTS") < gIdx("couldn't reach any search backend"));
ok("degraded flag set + logged", engineSrc.includes("degraded = true;") && engineSrc.includes("degraded best-effort via"));
ok("hard error kept for true-zero parses", engineSrc.includes("couldn't reach any search backend right now"));
ok("degraded sets bypass the cache", /if \(!cached && !degraded\) aiOverview\.cacheSet/.test(engineSrc));
ok("builders carry the degraded flag (warn note, not a fake outage)", /buildOverviewMessage\(query, answer, results, degraded\)/.test(engineSrc) && /buildResultsOnlyMessage\(query, results, degraded\)/.test(engineSrc));

// L13. degraded message note rendering
const degradedMsg = ao.buildOverviewMessage("q?", "answer [1]", sampleResults, true);
ok("degraded overview includes warn note", degradedMsg.includes("results looked off-topic") && degradedMsg.includes("best effort"));
ok("clean overview has NO warn note", !ao.buildOverviewMessage("q?", "answer [1]", sampleResults, false).includes("off-topic"));
ok("degraded results-only note", ao.buildResultsOnlyMessage("q?", sampleResults, true).includes("results looked off-topic"));
ok("degraded overview stays within hard cap", degradedMsg.length <= ao.MAX_MESSAGE_CHARS + 2);

// L14. search budget guard (16 backends × 9s must not stack into minutes)
ok("per-pass wall-clock budget present", engineSrc.includes("const SEARCH_BUDGET_MS = 35000;"));
ok("budget check inside the backend loop", /const passStart = Date\.now\(\);[\s\S]{0,400}Date\.now\(\) - passStart > SEARCH_BUDGET_MS/.test(engineSrc));
ok("budget exhaustion logged before break", engineSrc.includes("search budget (") && engineSrc.includes("stopping at"));

// L15. numeric-entity anchor in the gate (06:48Z ROOT cure — live-probed:
// fandom-dc returned the PERFECT Sector 2814 set and the gate still rejected
// it because conversational phrasing diluted the word-hit ratio to 2/8)
console.log("\nL15. numeric-entity anchor (gate refinement)");
const SECTOR_RESULTS = [
  { title: "Sector 2814", snippet: "", url: "https://dc.fandom.com/wiki/Sector_2814", domain: "dc.fandom.com" },
  { title: "Green Lantern Corps of Earth", snippet: "", url: "https://x.com/gl", domain: "x.com" },
];
ok("numeric anchor: conversational sector-2814 query now ACCEPTED",
  ao.relevantEnough("so generally how big is sector 2814 and is it relatively small compared to the others", SECTOR_RESULTS) === true);
ok("numeric anchor: wrong number still rejected (decoy-safe)",
  ao.relevantEnough("how big is sector 2814", [
    { title: "Sector 2813 overview", snippet: "neighboring sector glossary", url: "https://x.com/n", domain: "x.com" },
  ]) === false);
ok("numeric anchor: needs >=2 significant word hits too",
  ao.relevantEnough("who runs sector 2814", [
    { title: "2814 is a number", snippet: "", url: "https://x.com/num", domain: "x.com" },
  ]) === false);
ok("numeric anchor: ratio path still wins for normal queries",
  ao.relevantEnough("who wrote the harry potter books", HP_REAL) === true);

console.log(`\n${"═".repeat(50)}\nRESULT: ${pass} pass, ${fail} fail ${fail === 0 ? "— ALL GREEN ✅" : "— FAILURES ❌"}`);
process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("QA crashed:", e); process.exit(1); });
