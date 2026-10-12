#!/usr/bin/env node
/**
 * qa_sticker_pack.js — 2026-10-12
 * Regression QA for `.j s -p` (native WhatsApp sticker pack).
 * Run: NODE_PATH=<repo>/node_modules node qa_sticker_pack.js
 *
 * Sections:
 *  A. module integrity — HKDF label seeding, zip layout, tray collage
 *  B. blob encryption — matches Baileys' encryptedStream scheme (roundtrip)
 *  C. proto — stickerPackMessage assembles + encodes via WAProto
 *  D. engine wiring — `-p` matched BEFORE the flag handler, usage card,
 *     cooldown bypass covers `.j s -p`
 */
process.env.GW_TEST = "";
const path = require("path");
const crypto = require("crypto");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? " — " + extra : ""}`); }
}

const HERE = __dirname;
const baileys = require("@whiskeysockets/baileys");
const AdmZip = require("adm-zip");
const sharp = require("sharp");
const pack = require(path.join(HERE, "..", "core", "utils", "stickerPack.js"));
const fs = require("fs");
const engineSrc = fs.readFileSync(path.join(HERE, "..", "core", "engine.js"), "utf8");

// ── A. module integrity ──────────────────────────────────────────────────────
console.log("\nA. module integrity");
ok("HKDF label seeded into Baileys mapping",
  baileys.MEDIA_HKDF_KEY_MAPPING["sticker-pack"] === "Sticker Pack");
ok("limits: default 8, max 30",
  pack.DEFAULT_PACK_STICKERS === 8 && pack.MAX_PACK_STICKERS === 30);

(async () => {
  // tiny webp buffers via sharp (real webp bytes)
  const colors = [
    { r: 220, g: 60, b: 60 }, { r: 60, g: 180, b: 90 },
    { r: 60, g: 90, b: 220 }, { r: 230, g: 200, b: 60 },
  ];
  const webps = [];
  for (const c of colors) {
    webps.push(await sharp({
      create: { width: 400, height: 400, channels: 3, background: c },
    }).webp().toBuffer());
  }

  ok("isAnimatedWebp: static → false", pack.isAnimatedWebp(webps[0]) === false);
  ok("isAnimatedWebp: garbage → false", pack.isAnimatedWebp(Buffer.from("nonsense")) === false);

  const tray = await pack.buildTrayPng(webps);
  const trayMeta = await sharp(tray).metadata();
  ok("tray is 512×512 png", trayMeta.width === 512 && trayMeta.height === 512 && trayMeta.format === "png");
  const tray1 = await pack.buildTrayPng(webps.slice(0, 1));
  ok("tray works with a single sticker", (await sharp(tray1).metadata()).width === 512);

  const zipBuf = pack.buildPackZip(webps, tray);
  const zip = new AdmZip(zipBuf);
  const names = zip.getEntries().map((e) => e.entryName);
  ok("zip contains N.webp + tray.png",
    names.length === webps.length + 1 &&
    names[names.length - 1] === "tray.png" &&
    names[0] === "1.webp", JSON.stringify(names));
  ok("zip sticker bytes roundtrip",
    Buffer.compare(zip.readFile(zip.getEntry("2.webp")), webps[1]) === 0);

  // ── B. encryption roundtrip (Baileys scheme) ───────────────────────────────
  console.log("\nB. blob encryption");
  const plain = Buffer.concat([zipBuf, Buffer.from("padding-for-aes-final")]);
  const { mediaKey, enc, fileSha256, fileEncSha256, fileLength } =
    await pack.encryptPackBlob(plain);
  ok("fileLength = plain size", fileLength === plain.length);
  ok("fileSha256 correct",
    crypto.createHash("sha256").update(plain).digest().equals(Buffer.from(fileSha256)));
  ok("fileEncSha256 correct",
    crypto.createHash("sha256").update(enc).digest().equals(Buffer.from(fileEncSha256)));
  const keys = await baileys.getMediaKeys(Buffer.from(mediaKey), pack.PACK_MEDIA_TYPE);
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc", Buffer.from(keys.cipherKey), Buffer.from(keys.iv));
  const ct = enc.subarray(0, enc.length - 10);
  const mac = enc.subarray(enc.length - 10);
  const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
  ok("decrypt with Baileys-derived keys roundtrips", Buffer.compare(dec, plain) === 0);
  const macExpect = crypto.createHmac("sha256", Buffer.from(keys.macKey))
    .update(Buffer.from(keys.iv)).update(ct).digest().slice(0, 10);
  ok("mac = HMAC-SHA256(macKey, iv||ct)[0..10]", mac.equals(macExpect));

  // ── C. proto assembly ──────────────────────────────────────────────────────
  console.log("\nC. proto assembly");
  // stub sock for upload step
  const uploads = [];
  const fakeSock = {
    waUploadToServer: async (filePath, opts) => {
      uploads.push(opts.mediaType);
      return { mediaUrl: `https://mmg.whatsapp.net/fake/${uploads.length}`, directPath: `/mms/${opts.mediaType === "document" ? "document" : "image"}/abc${uploads.length}` };
    },
    relayMessage: async (jid, msg) => { fakeSock.lastRelay = { jid, msg }; },
  };
  const msg = await pack.buildStickerPackMessage({
    sock: fakeSock,
    name: "Goku Pack 🃏",
    publisher: "TestBot",
    stickerBuffers: webps,
    trayPng: tray,
  });
  ok("uploads used document path for blob + image path for tray",
    uploads.includes("document") && uploads.includes("thumbnail-link"),
    JSON.stringify(uploads));
  const spm = msg.stickerPackMessage;
  ok("pack name/publisher set", spm.name === "Goku Pack 🃏" && spm.publisher === "TestBot");
  ok("stickers[] metadata complete",
    spm.stickers.length === webps.length &&
    spm.stickers[0].fileName === "1.webp" &&
    spm.stickers[0].mimetype === "image/webp" &&
    spm.stickers[0].isAnimated === false);
  ok("blob fields present",
    !!spm.fileSha256 && !!spm.fileEncSha256 && !!spm.mediaKey &&
    String(spm.directPath).includes("/mms/document/") && spm.fileLength > 0);
  ok("tray fields present",
    !!spm.thumbnailDirectPath && !!spm.thumbnailSha256 &&
    spm.thumbnailWidth === 512 && spm.thumbnailHeight === 512 &&
    spm.trayIconFileName === "tray.png");
  ok("stickerPackOrigin USER_CREATED(2)", spm.stickerPackOrigin === 2);
  ok("stickerPackId non-empty", typeof spm.stickerPackId === "string" && spm.stickerPackId.length === 32);
  ok("messageSecret present", !!msg.messageContextInfo?.messageSecret);

  // proto encode/decode roundtrip
  const proto = baileys.proto;
  const encoded = proto.Message.encode(proto.Message.fromObject(msg)).finish();
  const decoded = proto.Message.decode(encoded);
  ok("proto encode/decode roundtrip keeps pack",
    decoded.stickerPackMessage &&
    decoded.stickerPackMessage.name === "Goku Pack 🃏" &&
    decoded.stickerPackMessage.stickers.length === webps.length &&
    decoded.stickerPackMessage.stickerPackOrigin === 2);

  // relay shape
  await pack.sendStickerPack(fakeSock, "123@g.us", msg);
  ok("relayMessage called with (jid, message)", !!fakeSock.lastRelay &&
    fakeSock.lastRelay.jid === "123@g.us" && !!fakeSock.lastRelay.msg.stickerPackMessage);

  // ── D. engine wiring (source guards) ───────────────────────────────────────
  console.log("\nD. engine wiring");
  const pBlock = engineSrc.indexOf("NATIVE WhatsApp sticker pack");
  const mediaBlock = engineSrc.indexOf("reply to image/video → sticker");
  const searchBlock = engineSrc.indexOf("s with Pinterest search");
  ok("pack handler exists", pBlock > 0);
  ok("pack handler BEFORE media-conversion handler", pBlock > 0 && mediaBlock > pBlock,
    `pack=${pBlock} media=${mediaBlock}`);
  ok("pack handler BEFORE loose-search handler", pBlock > 0 && searchBlock > pBlock);
  ok("matches `.j s -p` exact + with args",
    engineSrc.includes("`s -p` ||") || engineSrc.includes("} s -p` ||") ||
    /s -p`/.test(engineSrc));
  ok("usage card advertises -p", engineSrc.includes("Send results as ONE sticker pack"));
  ok("top-level require of ./utils/stickerPack",
    engineSrc.includes('require("./utils/stickerPack")'));
  // cooldown bypass from 0741c196 still covers `.j s -p` (startsWith `${p} s `)
  const bypassOk = /const _isStickerCmd =[\s\S]*?startsWith\(`\$\{_stickerPfx\} `\)/.test(engineSrc);
  ok("global-cooldown bypass still covers `.j s -p` forms", bypassOk);
  ok("pack fallback sends loose stickers on failure",
    engineSrc.includes("sending the stickers individually instead"));

  console.log(`\n${"═".repeat(50)}\nRESULT: ${pass} pass, ${fail} fail ${fail === 0 ? "— ALL GREEN ✅" : "— FAILURES ❌"}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error("QA crashed:", e);
  process.exit(1);
});
