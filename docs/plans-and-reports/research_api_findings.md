# API Research Findings (overnight feature build - 2026-09-25)

## STOCKS → CHOSEN: Yahoo Finance (no key, no crumb)
- Chart: GET https://query1.finance.yahoo.com/v8/finance/chart/{SYM}?range=..&interval=..
  - Browser UA required; NO auth/crumb needed. Tested 8/8 matrix + 5/5 non-equity.
  - Ranges verified: 1d/5m, 5d/15m, 1mo/1d, 6mo/1d, 1y/1wk, 5y/1wk (all return OHLCV + meta).
  - meta: currency, fullExchangeName, regularMarketPrice, chartPreviousClose, symbol.
  - indicators.quote[0]: open/high/low/close/volume arrays aligned to timestamp[].
  - Errors: bad symbol → 404 "symbol may be delisted"; bad interval → 400 + valid list.
  - ⚠️ bogus RANGE returns 200 silently → whitelist ranges client-side.
- Search: GET https://query2.finance.yahoo.com/v1/finance/search?q=..&quotesCount=6&newsCount=0
  - "apple"→AAPL(EQUITY) first; must rank: exact symbol match > quoteType EQUITY/ETF > others; drop FUTURE noise unless nothing else.
- Non-equity verified: BTC-USD, ETH-USD, SPY, GC=F, EURUSD=X.
- Rate limit: 10 rapid calls 10/10 OK. Cache 60s per (sym,range).
- Rejected: Stooq (JS-gated HTML), Alpha Vantage/Finnhub (no key on host), query2 chart parity OK.

## TRENDS → CHOSEN: unofficial Google Trends dance via got-scraping (NO new deps, ESM dynamic import)
- axios = 100% 429 (datacenter IP + TLS fingerprint blocked). got-scraping (TLS fp + chrome headers) = 12/12.
- Dance: 1) GET /trends/explore (CookieJar) 2) GET /trends/api/explore?hl=en-US&tz=0&req={comparisonItem:[{keyword,time,geo}...],category:0,property:""} → ")]}'"+JSON, widget id TIMESERIES {token,request} 3) GET /trends/api/widgetdata/multiline?...&req=<widget.request>&token= → default.timelineData[] {time(sec), value[](per kw), hasData[], formattedTime}
- Time tokens verified: now 1-H (58pts), now 4-H (238pts), now 1-d (181pts), now 7-d (169 hourly), today 1-m (32 daily), today 3-m (93 daily), today 12-m (53 weekly), today 5-y (262 weekly).
- Multi-keyword: values[] in input keyword order (columnNames came back EMPTY → use input order). Up to 5 tested.
- ⚠️ Nonexistent keyword → 200 with all-zero timeline (detect & report "no data", don't error).
- Latency 0.5-1.5s/dance. 12 dances @1.5s spacing OK. Cache 10min. Backoff on 429.
- got-scraping usage: const {gotScraping} = await import("got-scraping"); headerGeneratorOptions:{browsers:[{name:"chrome"}], devices:["desktop"]}; cookieJar: new (require("tough-cookie").CookieJar)().
- Values are RELATIVE search interest (0-100, normalized within the query) - must state in bot output.

## QUIZ → CHOSEN: AniList GraphQL (primary) + Jikan /anime/{id}/full (fallback)
- AniList: POST https://graphql.anilist.co {query, variables} - no key, 90 req/min, paced 1.3s tested.
  - Search resolves abbreviations ("fmab"→FMA:B) + synonyms (11 for FMA:B incl "FMAB").
  - ⚠️ SEARCH_MATCH ranks unreleased/obscure first sometimes ("evangelion"→2026 unreleased) → re-rank: format TV/MOVIE + popularity desc + score desc, exact/synonym match boost.
  - Characters: edges {role, node.name.full, node.favourites, voiceActors(JAPANESE).name.full} - question material.
  - Nonexistent → 0 hits.
- Jikan v4: search endpoints 504 during test window (their backend); /anime/{id}/full works (cached) and is rich (aliases!). Keep as fallback + data enricher. ⚠️ requires family:4 (see network note).
- AI generation: engine smartGroqCall (groq-sdk, key rotation, MODELS.FAST/SMART) passed as param like debate.js. Key lives on DEPLOY HOST only - local tests use realistic+malformed stubs (qa_debate methodology). Deterministic fallback questions from AniList ground truth so quiz works even with zero AI.

## NETWORK ENVIRONMENT (critical)
- This box: DNS returns AAAA first; IPv6 unroutable; Node autoSelectFamily aborts IPv4 after 250ms default while some hosts need ~280ms → axios needs family:4 (Jikan fix, 860ms 200). curl works (longer Happy-Eyeballs).
- Apply family:4 to all new axios clients. got-scraping unaffected (own stack).

## ENGINE INTEGRATION MAP (from recon)
- Dispatch: inline if-chain; place quiz/stock/trends near wordle/chess block engine.js ~28635-28880. Tokenize via cmdArgs. Reply: sock.sendMessage(chatId,{text:BOT_MARKER+..}) or reply() helper 7360.
- Media send: {image: buffer, caption} (tictactoe.js:384). Charts: node-canvas → toBuffer('image/png').
- Persistent scores: system.get/set KV (core/utils/system.js; System model key+Mixed).
- Rewards: economy.addMoney(userId, amount) (Zeni Ꞩ). wordle rewards {easy:100,medium:200,hard:300}.
- Sessions: module Map keyed chatId; setTimeout cleanup; re-arm pattern from wordle.js 284-310.
- Registry: commandRegistry.js GAMES/INFO entries + allCommands array engine ~29263.
- Mid-chat interception hook (quiz answers could ride here) engine 10791-10862 (debate) - BUT quiz uses explicit `.j a <letter>` so no chat hijack.
- 45s race on every run: handlers must return fast; quiz gen should react ⏳ then post when ready (within budget ~45s; AniList 1-2s + Groq 3-10s = OK, keep retries bounded).
- NO collision: existing RPG `.j stock*` commands are "buy stock"/"sell stock"/"portfolio" (two-word, different primary). New: `.j stock <TICKER> [range]` primary="stock" - verify if-chain order at insertion point.
