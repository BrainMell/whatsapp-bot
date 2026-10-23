#!/usr/bin/env node
/** qa_map_nsfw.js - .j map <place> card pipeline + rule34.xxx API rewire.
 *  Offline (canvas render only, no network). Run: node scripts/qa_map_nsfw.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log("  ✅ " + msg); } else { fail++; console.log("  ❌ " + msg); } };

const mc = require("../core/utils/mapCard");
const goMod = require("../core/utils/goImageService");
const engineSrc = fs.readFileSync(path.join(ROOT, "core/engine.js"), "utf8");
const goSrc = fs.readFileSync(path.join(ROOT, "core/utils/goImageService.js"), "utf8");
const regSrc = fs.readFileSync(path.join(ROOT, "core/utils/commandRegistry.js"), "utf8");

// -- A. tile math ------------------------------------------------------------
console.log("A. slippy-map tile math");
ok(Math.abs(mc.lngToTileX(0, 1) - 1) < 1e-9, "lngToTileX(0,1) === 1");
ok(Math.abs(mc.latToTileY(0, 1) - 1) < 1e-9, "latToTileY(0,1) === 1");
ok(Math.abs(mc.lngToTileX(180, 3) - 8) < 1e-9, "lngToTileX(180,3) === 2^3");
for (const [lat, lng, z] of [[8.03, -1.08, 6], [51.5074, -0.1278, 11], [-33.86, 151.2, 9]]) {
  const x = mc.lngToTileX(lng, z), y = mc.latToTileY(lat, z);
  const rLat = mc.tileYToLat(Math.floor(y) + 0.5, z), rLng = mc.tileXToLng(Math.floor(x) + 0.5, z);
  ok(Math.abs(rLat - lat) < 2 && Math.abs(rLng - lng) < 2, `roundtrip lat/lng within half-tile @z${z} (${lat},${lng})`);
}
ok(mc.latToTileY(89.9, 5) >= -1e-6 && mc.latToTileY(-89.9, 5) <= Math.pow(2, 5) + 1e-6, "lat clamped to mercator range (epsilon)");
ok(mc.tileUrl(30, 20, 6) === "https://tile.openstreetmap.org/6/30/20.png", "tileUrl format");

// -- B. zoom fitting (real Nominatim bboxes probed live from Box2) ----------
console.log("\nB. zoom fitting");
const GHANA_BBOX = ["4.5392525", "11.1748562", "-3.2607860", "1.2732942"]; // country
const zGhana = mc.fitZoom(GHANA_BBOX);
ok(zGhana >= 4 && zGhana <= 6, `Ghana country bbox → country zoom (${zGhana}, want 4-6)`);
const OSU_BBOX = ["5.5520", "5.5690", "-0.1900", "-0.1740"]; // suburb-scale
const zOsu = mc.fitZoom(OSU_BBOX);
ok(zOsu >= 13 && zOsu <= 16, `Osu suburb bbox → street zoom (${zOsu}, want 13-16)`);
ok(mc.fitZoom(null, { fallback: 9 }) === 9, "missing bbox → fallback");
ok(mc.fitZoom(["x", "y", "z", "w"], { fallback: 9 }) === 9, "non-numeric bbox → fallback");
ok(mc.fitZoom(["5", "5", "-0.1", "-0.1"]) === 16, "zero-span bbox → maxZ (POI pin)");
ok(mc.fitZoom(["4.5", "11.1", "-3.2", "1.2"], { maxZ: 10 }) <= 10, "maxZ clamp respected");
ok(mc.zoomForType("country") === 5, "zoomForType country → 5");
ok(mc.zoomForType("suburb") === 14, "zoomForType suburb → 14");
ok(mc.zoomForType("attraction") === 16, "zoomForType attraction → 16 (down to specific locations)");
ok(mc.zoomForType("nonexistent_type") === 12, "zoomForType unknown → 12");
ok(mc.zoomForType("whatever", "boundary") === 6, "boundary class → 6");

// -- C. tile layout ----------------------------------------------------------
console.log("\nC. tile layout");
const o1 = mc.pickOriginTile(8.03, -1.08, 6, 3);
ok(o1.x === Math.floor(mc.lngToTileX(-1.08, 6)) - 1 && o1.y === Math.floor(mc.latToTileY(8.03, 6)) - 1, "origin = center tile - 1 (3×3 centered)");
const m1 = mc.markerPixel(8.03, -1.08, 6, o1.x, o1.y);
ok(m1.px >= 0 && m1.px < 768 && m1.py >= 0 && m1.py < 768, "marker pixel inside 768×768 composite");
// world-edge clamp: lng near -180 at low zoom
const o2 = mc.pickOriginTile(5, -179.9, 2, 3);
ok(o2.x >= 0, "origin x clamped at world west edge");
const o3 = mc.pickOriginTile(84.9, 10, 4, 3);
ok(o3.y <= Math.pow(2, 4) - 3, "origin y clamped at world north edge");

// -- D. links + text ---------------------------------------------------------
console.log("\nD. links + text");
ok(mc.gmapsLink(5.5606, -0.1824) === "https://www.google.com/maps/search/?api=1&query=5.5606,-0.1824", "gmapsLink coords format");
ok(mc.gmapsSearchLink("Osu, Accra").includes(encodeURIComponent("Osu, Accra")), "gmapsSearchLink encodes query");
const txt = mc.buildMapText({ display_name: "Osu, Accra, Ghana", lat: "5.5606", lon: "-0.1824", type: "suburb" });
ok(txt.includes("*Osu, Accra, Ghana*"), "buildMapText has bold place name");
ok(txt.includes("5.56060, -0.18240"), "buildMapText has coords (5dp)");
ok(txt.includes("📌 suburb"), "buildMapText has kind line");
ok(txt.includes("https://www.google.com/maps/search/?api=1&query=5.5606,-0.1824"), "buildMapText has tappable Google Maps link");
const txt2 = mc.buildMapText({ display_name: "Nowhere", lat: "1", lon: "2" });
ok(!txt2.includes("📌"), "buildMapText omits kind line when type missing");

// -- E. canvas composite (offline render) ------------------------------------
console.log("\nE. canvas composite");
(async () => {
  const { createCanvas, loadImage } = require("canvas");
 // make 9 real 256px tiles (plain colored PNGs)
  const mkTile = (r, g, b) => {
    const c = createCanvas(256, 256); const x = c.getContext("2d");
    x.fillStyle = `rgb(${r},${g},${b})`; x.fillRect(0, 0, 256, 256);
    return c.toBuffer("image/png");
  };
  const tiles = [];
  for (let i = 0; i < 9; i++) tiles.push(mkTile(200 + (i % 3) * 10, 210, 220));
  tiles[4] = Buffer.from("notapng"); // corrupt → placeholder path exercised
  const canvas = await mc.compositeMap({
    tileBuffers: tiles, markerLat: 8.03, markerLng: -1.08, z: 6,
    originX: o1.x, originY: o1.y, label: "Ghana", sub: "8.0300, -1.0800 · zoom 5",
    createCanvas, loadImage,
  });
  ok(canvas.width === 768 && canvas.height === 880, `composite 768×880 (got ${canvas.width}×${canvas.height})`);
  const buf = canvas.toBuffer("image/png");
  ok(buf.length > 20000, `render non-trivial (${buf.length} bytes)`);
  const m = mc.markerPixel(8.03, -1.08, 6, o1.x, o1.y);
 // sample the red RING of the pin head (offset from center - the center is
 // the white inner dot). +12px right, same height: inside 20px head, outside 7.5px dot.
  const ctx = canvas.getContext("2d");
  const d = ctx.getImageData(m.px + 12, m.py - 46, 1, 1).data;
  ok(d[0] > 180 && d[1] < 110 && d[2] < 120, `pin head ring red at marker offset (${d[0]},${d[1]},${d[2]})`);
  const wc = ctx.getImageData(m.px, m.py - 46, 1, 1).data;
  ok(wc[0] > 230 && wc[1] > 230 && wc[2] > 230, "pin inner dot white at center");
 // caption bar bottom-left is dark (rgba(12,18,26,~0.96) over tiles)
  const bd = ctx.getImageData(20, canvas.height - 20, 1, 1).data;
  ok(bd[0] < 90 && bd[2] < 110, "caption bar drawn (dark strip at bottom)");
  ok(typeof mc.drawPin === "function", "drawPin exported");

 // -- F. rule34 pure helpers ------------------------------------------------
  console.log("\nF. rule34 pure helpers");
  ok(goMod.toBooruTag("Tifa Lockhart") === "tifa_lockhart", "toBooruTag: spaces→underscores, lowercase");
  ok(goMod.toBooruTag("  arknights (game)  ") === "arknights_(game)", "toBooruTag: keeps parens, trims");
  ok(goMod.toBooruTag("bad!!!tag@@") === "badtag", "toBooruTag: strips junk chars");
  ok(goMod.toBooruTag("a__b") === "a_b", "toBooruTag: collapses runs of underscores");
  ok(goMod.toBooruTag("") === "" && goMod.toBooruTag(null) === "", "toBooruTag: empty/null → empty");
  const POSTS = [
    { file_url: "https://x/1.webm", score: "99" },              // video → dropped
    { file_url: "https://x/2.jpg", score: "5" },
    { file_url: "https://x/3.png", score: "42" },
    { file_url: "https://x/4.jpeg", score: "17" },
    { file_url: "https://x/5.gif", score: "1000" },             // gif → dropped
    null,                                                        // junk → dropped
    { file_url: "https://x/6.jpg" },                             // no score → 0
  ];
  const picked = goMod.pickR34Images(POSTS, 3);
  ok(JSON.stringify(picked) === JSON.stringify(["https://x/3.png", "https://x/4.jpeg", "https://x/2.jpg"]), "pickR34Images: images only, score-desc, capped");
  ok(goMod.pickR34Images([], 5).length === 0 && goMod.pickR34Images(null, 5).length === 0, "pickR34Images: empty/null safe");

 // needsKey path (env unset in QA context)
  delete process.env.R34_API_KEY; delete process.env.R34_USER_ID;
  const r = await goMod.getShared().searchRule34("tifa", 5);
  ok(r.needsKey === true && Array.isArray(r.images) && r.images.length === 0, "searchRule34 without keys → needsKey flag (no network)");

 // -- G. engine source pins -------------------------------------------------
  console.log("\nG. engine source pins");
  ok(engineSrc.includes("require(\"./utils/mapCard\")"), "mapCard required in engine");
  ok((engineSrc.match(/handleMapCommand\(/g) || []).length >= 3, `handleMapCommand: def + 2 dispatch sites (${(engineSrc.match(/handleMapCommand\(/g) || []).length})`);
  const worldIdx = engineSrc.indexOf('if (primaryCmd === "world" || primaryCmd === "maps" || primaryCmd === "map")');
  const dispatchA = engineSrc.indexOf("__mapQuery");
  ok(dispatchA > -1 && dispatchA < worldIdx, "dispatch A (with-args map) sits BEFORE the world atlas block");
  ok(/ATLAS_WORDS = \["beyond", "afterlife", "abyss", "all"\]|primaryCmd === "map"/.test(engineSrc), "RPG atlas keeps `.j map` (rename-safe guard)");
  ok(/primaryCmd === "wmap"/.test(engineSrc), "real-world map renamed to wmap (owner 14:13Z - no collision with RPG atlas)");
  const dispatchB = engineSrc.search(/lowerTxt === `\$\{_wmapP\} wmap`/);
  ok(dispatchB > -1, "dispatch B (25xxx bare wmap) present");
  ok(/lowerTxt\.startsWith\(`\$\{_wmapP\} wmap `\)/.test(engineSrc), "dispatch B with-args wmap present");
  ok(dispatchB > engineSrc.indexOf("handleGoogleSearchCommand("), "dispatch B after google dispatch");
  ok(engineSrc.includes("data.needsKey") && engineSrc.includes("R34_API_KEY + R34_USER_ID"), "nsfw needsKey UX wired in engine");
  ok(engineSrc.includes("nominatim.openstreetmap.org/search"), "Nominatim geocode endpoint");
  ok(engineSrc.includes("tile.openstreetmap.org") || engineSrc.includes("mapCard.tileUrl"), "OSM tile fetch wired");
  ok(engineSrc.includes("89504e47"), "tile PNG magic guard");
 // tile-policy guards (live 418-block incident 13:52Z)
  ok(/r\.status === 200 && buf\.length > 500/.test(engineSrc), "tiles accept status 200 only (418 block pages are valid PNGs - caught live)");
  ok(engineSrc.includes("basemaps.cartocdn.com"), "CARTO CDN fallback wired");
  ok(engineSrc.includes("© OpenStreetMap © CARTO"), "attribution adapts to CARTO usage");
  ok(/setTimeout\(r, 340\)/.test(engineSrc), "tile throttle ≤ ~3 req/s (OSM usage policy)");
  ok(engineSrc.includes("_mapTileCache"), "tile cache present (fewer repeat hits)");

 // goImageService source pins
  ok(!goSrc.includes("/api/scrape/rule34"), "dead Go-service rule34 route removed");
  ok(goSrc.includes("api.rule34.xxx/index.php?page=dapi") && goSrc.includes("api_key="), "direct rule34 API with key params");
  ok(goSrc.includes("process.env.R34_API_KEY") && goSrc.includes("process.env.R34_USER_ID"), "env key reads");

 // -- H. registry -----------------------------------------------------------
  console.log("\nH. registry");
  ok(/cmd: 'wmap', desc: 'Show a real-world map image/.test(regSrc), "wmap entry in SEARCH");
  ok(/\.j map stays the RPG world atlas/.test(regSrc), "wmap entry documents .j map RPG fallback");
  ok(/Alias: maps - \.j wmap <place> is real-world maps/.test(regSrc), "world desc cross-references wmap");
  ok(/cmd: 'nsfw', desc: 'Rule34\.xxx image search by tag/.test(regSrc), "nsfw desc updated");
  ok(/usage: 'nsfw \[count\] <tag>'/.test(regSrc), "nsfw usage matches dispatch");

  console.log(`\n${"═".repeat(50)}\nRESULT: ${pass} pass, ${fail} fail ${fail === 0 ? "- ALL GREEN ✅" : "- FAILURES ❌"}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("QA crashed:", e); process.exit(1); });
