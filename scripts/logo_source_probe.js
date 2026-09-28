// reachability probe for the logo dataset sources
const axios = require("/home/z/my-project/whatsapp-bot/node_modules/axios");
const UA = { headers: { "User-Agent": "JakeQuizBot/5.3 (logo dataset builder; contact: box admin)" } };
const get = (u, raw) => axios.get(u, { ...UA, ...(raw ? { responseType: "arraybuffer" } : {}), timeout: 20000 });

(async () => {
  try {
    const r = await get("https://www.wikidata.org/w/api.php?action=wbgetentities&sites=enwiki&titles=Nike,%20Inc.&props=claims&format=json");
    const e = r.data.entities && Object.values(r.data.entities)[0];
    console.log("wikidata API: OK  P154(logo):", !!(e?.claims?.P154), " P856(site):", !!(e?.claims?.P856));
  } catch (e) { console.log("wikidata API: FAIL", e.message); }
  try {
    const r = await get("https://commons.wikimedia.org/wiki/Special:FilePath/Logo%20Nike.svg?width=480", true);
    console.log("commons FilePath render: OK", r.status, r.headers["content-type"], r.data.length, "bytes");
  } catch (e) { console.log("commons FilePath: FAIL", e.message); }
  try {
    const r = await get("https://logo.clearbit.com/nike.com", true);
    console.log("clearbit: OK", r.status, r.headers["content-type"], r.data.length, "bytes");
  } catch (e) { console.log("clearbit: FAIL", e.message); }
  try {
    const r = await get("https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&titles=Nike,_Inc.&format=json&pithumbsize=480", true);
    console.log("wikipedia API: OK", r.status);
  } catch (e) { console.log("wikipedia API: FAIL", e.message); }
})();
