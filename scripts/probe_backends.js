#!/usr/bin/env node
// probe_backends.js — save raw backend responses for parser verification
const fs = require("fs");
const axios = require("axios");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const q = process.argv[2] || "how do solar panels work";
const outdir = process.argv[3] || "/tmp/google_probe";
fs.mkdirSync(outdir, { recursive: true });

(async () => {
  try {
    const r1 = await axios.post("https://html.duckduckgo.com/html/",
      new URLSearchParams({ q }).toString(),
      { headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" }, timeout: 9000, maxRedirects: 5 });
    fs.writeFileSync(`${outdir}/ddg_html.html`, r1.data);
    console.log("ddg_html:", String(r1.data).length, "b, status", r1.status, "final URL:", r1.request?.res?.responseUrl || "?");
  } catch (e) { console.log("ddg_html FAIL:", e.message); }
  try {
    const r2 = await axios.get("https://lite.duckduckgo.com/lite/", { params: { q }, headers: { "User-Agent": UA }, timeout: 9000, maxRedirects: 5 });
    fs.writeFileSync(`${outdir}/ddg_lite.html`, r2.data);
    console.log("ddg_lite:", String(r2.data).length, "b, status", r2.status);
  } catch (e) { console.log("ddg_lite FAIL:", e.message); }
  try {
    const r3 = await axios.get("https://www.bing.com/search", { params: { q, count: 10 }, headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" }, timeout: 9000, maxRedirects: 5 });
    fs.writeFileSync(`${outdir}/bing.html`, r3.data);
    console.log("bing:", String(r3.data).length, "b, status", r3.status);
  } catch (e) { console.log("bing FAIL:", e.message); }
})();
