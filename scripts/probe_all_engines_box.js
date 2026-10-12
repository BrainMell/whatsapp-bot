#!/usr/bin/env node
// probe_all_engines_box.js — sweep candidate search engines from box egress
const axios = require("axios");
const fs = require("fs");
const q = process.argv[2] || "who wrote the harry potter books";
const UA_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const UA_FF =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0";
const tests = [
  ["mojeek", `https://www.mojeek.com/search?q=${encodeURIComponent(q)}`, UA_CHROME],
  ["ecosia", `https://www.ecosia.org/search?q=${encodeURIComponent(q)}`, UA_CHROME],
  ["brave", `https://search.brave.com/search?q=${encodeURIComponent(q)}`, UA_CHROME],
  ["google-basic", `https://www.google.com/search?q=${encodeURIComponent(q)}&gbv=1&num=10&hl=en`, UA_FF],
  ["ddg-get", `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, UA_FF],
  ["startpage", `https://www.startpage.com/sp/search?query=${encodeURIComponent(q)}`, UA_CHROME],
  ["marginalia", `https://search.marginalia.nu/search?query=${encodeURIComponent(q)}`, UA_CHROME],
  ["searx-be", `https://searx.be/search?q=${encodeURIComponent(q)}`, UA_CHROME],
  ["yandex", `https://yandex.com/search/?text=${encodeURIComponent(q)}`, UA_CHROME],
  ["bing-ff", `https://www.bing.com/search?q=${encodeURIComponent(q)}`, UA_FF],
];
(async () => {
  for (const [name, url, ua] of tests) {
    try {
      const r = await axios.get(url, {
        headers: { "User-Agent": ua, "Accept-Language": "en-US,en;q=0.9", Accept: "text/html" },
        timeout: 8000,
        maxRedirects: 5,
        validateStatus: () => true,
      });
      const h = String(r.data);
      const markers = {
        b_algo: h.includes("b_algo"),
        result__a: h.includes("result__a"),
        "result-link": h.includes("result-link"),
        captcha: /captcha|are you a robot|unusual traffic|anomaly/i.test(h),
      };
      console.log(`${name}: status=${r.status} len=${h.length} ${JSON.stringify(markers)}`);
      if (r.status === 200 && h.length > 10000)
        fs.writeFileSync(`/tmp/eng_${name}.html`, h);
    } catch (e) {
      console.log(`${name}: FAIL ${e.message}`);
    }
  }
})();
