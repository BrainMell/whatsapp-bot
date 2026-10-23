/**
 * stickerPack.js - 2026-10-12
 * Native WhatsApp sticker-pack sender for `.j s -p`.
 *
 * Builds a sticker pack ZIP (N webp stickers + tray.png), encrypts it with
 * the WhatsApp media scheme (HKDF appInfo "WhatsApp Sticker Pack Keys" -
 * seeded into Baileys' MEDIA_HKDF_KEY_MAPPING so we reuse Baileys' own
 * rust-backed HKDF), uploads the blob + an unencrypted 2×2 tray collage,
 * and relays a `stickerPackMessage` (stickerPackOrigin USER_CREATED).
 *
 * Wire-format notes (Baileys 7.0.0-rc14, WAProto.StickerPackMessage):
 *  - pack blob = encrypted CDN media referenced by fileSha256/fileEncSha256/
 *    mediaKey/directPath (no url field in this proto version)
 *  - thumbnail fields carry NO mediaKey → raw (unencrypted) upload, integrity
 *    via sha256 only
 *  - stickers[] entries are fileName/mimetype/isAnimated/emojis metadata;
 *    the bytes live in the blob, named to match fileName
 */
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const AdmZip = require("adm-zip");
const baileys = require("@whiskeysockets/baileys");
const sharp = require("sharp");

// -- HKDF appInfo seeding -----------------------------------------------------
// getMediaKeys(buffer, mediaType) derives keys with
// `WhatsApp ${MEDIA_HKDF_KEY_MAPPING[mediaType]} Keys`. The map is exported
// and mutable, so a one-time seed gives us Baileys' own HKDF path for the
// pack blob instead of reimplementing KDF.
const PACK_MEDIA_TYPE = "sticker-pack";
const PACK_HKDF_LABEL = "Sticker Pack";
if (
  baileys.MEDIA_HKDF_KEY_MAPPING &&
  !baileys.MEDIA_HKDF_KEY_MAPPING[PACK_MEDIA_TYPE]
) {
  baileys.MEDIA_HKDF_KEY_MAPPING[PACK_MEDIA_TYPE] = PACK_HKDF_LABEL;
}

const MAX_PACK_STICKERS = 30; // WhatsApp pack limit
const DEFAULT_PACK_STICKERS = 8;

// -- helpers ------------------------------------------------------------------
/** true if a webp buffer contains animation frames (ANMF chunks) */
function isAnimatedWebp(buf) {
  try {
    if (!buf || buf.length < 16) return false;
    if (buf.toString("ascii", 0, 4) !== "RIFF") return false;
    if (buf.toString("ascii", 8, 12) !== "WEBP") return false;
    return buf.toString("ascii", 12, 16) === "VP8X" &&
      buf.indexOf("ANMF", 30) !== -1;
  } catch {
    return false;
  }
}

/** 2×2 cover collage (512×512 png) from up to 4 sticker webps */
async function buildTrayPng(webpBuffers) {
  const n = Math.min(4, webpBuffers.length);
  if (!n) throw new Error("no stickers to build tray from");
  const tile = 256;
  const composites = [];
  for (let i = 0; i < n; i++) {
    const tilePng = await sharp(webpBuffers[i], { animated: false })
      .resize(tile, tile, { fit: "cover", position: "centre" })
      .png()
      .toBuffer();
    composites.push({
      input: tilePng,
      left: (i % 2) * tile,
      top: Math.floor(i / 2) * tile,
    });
  }
  return sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

/** pack ZIP: 1.webp..N.webp at root + tray.png */
function buildPackZip(stickerBuffers, trayPng) {
  const zip = new AdmZip();
  stickerBuffers.forEach((buf, i) => zip.addFile(`${i + 1}.webp`, buf));
  zip.addFile("tray.png", trayPng);
  return zip.toBuffer();
}

/**
 * Encrypt a plain blob exactly like Baileys' encryptedStream:
 * AES-256-CBC with derived keys, then a truncated (10-byte) HMAC-SHA256 over
 * iv||ciphertext appended to the stream.
 */
async function encryptPackBlob(plainBuf) {
  const mediaKey = crypto.randomBytes(32);
  const keys = await baileys.getMediaKeys(mediaKey, PACK_MEDIA_TYPE);
  const iv = Buffer.from(keys.iv);
  const cipherKey = Buffer.from(keys.cipherKey);
  const macKey = Buffer.from(keys.macKey);
  const aes = crypto.createCipheriv("aes-256-cbc", cipherKey, iv);
  const ct = Buffer.concat([aes.update(plainBuf), aes.final()]);
  const mac = crypto
    .createHmac("sha256", macKey)
    .update(iv)
    .update(ct)
    .digest()
    .slice(0, 10);
  const enc = Buffer.concat([ct, mac]);
  return {
    mediaKey,
    enc,
    fileSha256: crypto.createHash("sha256").update(plainBuf).digest(),
    fileEncSha256: crypto.createHash("sha256").update(enc).digest(),
    fileLength: plainBuf.length,
  };
}

/**
 * Upload a buffer to WhatsApp CDN. Encrypted-media uploads use
 * mediaType 'document' (proven /mms/document path); raw (unencrypted)
 * tray uploads use 'thumbnail-link' (/mms/image path, no mediaKey needed).
 */
async function uploadBuffer(sock, buf, mediaType, timeoutMs = 60000) {
  const tmp = path.join(
    os.tmpdir(),
    `spp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  );
  fs.writeFileSync(tmp, buf);
  try {
    const sha = crypto.createHash("sha256").update(buf).digest();
    const res = await sock.waUploadToServer(tmp, {
      fileEncSha256B64: sha.toString("base64"),
      mediaType,
      timeoutMs,
    });
    if (!res || !res.directPath) {
      throw new Error(`upload returned no directPath (${mediaType})`);
    }
    return res;
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {}
  }
}

/**
 * Build the full relayable message object.
 * @param {object} p
 * @param {string} p.name pack display name
 * @param {string} p.publisher pack author
 * @param {Buffer[]} p.stickerBuffers webp sticker buffers (already converted)
 * @param {Buffer} p.trayPng 512×512 cover png
 */
async function buildStickerPackMessage({ sock, name, publisher, stickerBuffers, trayPng }) {
  if (!sock) throw new Error("sticker pack requires a live sock");
  if (!Array.isArray(stickerBuffers) || stickerBuffers.length === 0) {
    throw new Error("empty sticker list");
  }
  if (stickerBuffers.length > MAX_PACK_STICKERS) {
    stickerBuffers = stickerBuffers.slice(0, MAX_PACK_STICKERS);
  }

  const zipBuf = buildPackZip(stickerBuffers, trayPng);
  const blob = await encryptPackBlob(zipBuf);
  const blobUp = await uploadBuffer(sock, blob.enc, "document");

  const traySha = crypto.createHash("sha256").update(trayPng).digest();
  const trayUp = await uploadBuffer(sock, trayPng, "thumbnail-link");

  return {
    stickerPackMessage: {
      stickerPackId: crypto.randomBytes(16).toString("hex"),
      name: String(name || "Sticker Pack").slice(0, 60),
      publisher: String(publisher || "WhatsApp Bot").slice(0, 60),
      stickers: stickerBuffers.map((buf, i) => ({
        fileName: `${i + 1}.webp`,
        isAnimated: isAnimatedWebp(buf),
        emojis: [],
        mimetype: "image/webp",
      })),
      fileLength: blob.fileLength,
      fileSha256: blob.fileSha256,
      fileEncSha256: blob.fileEncSha256,
      mediaKey: blob.mediaKey,
      directPath: blobUp.directPath,
      trayIconFileName: "tray.png",
      thumbnailDirectPath: trayUp.directPath,
      thumbnailSha256: traySha,
      thumbnailEncSha256: traySha, // raw upload: unencrypted, enc == plain
      thumbnailHeight: 512,
      thumbnailWidth: 512,
      imageDataHash: traySha.toString("base64"),
      stickerPackSize: blob.fileLength,
      stickerPackOrigin: 2, // USER_CREATED
    },
    messageContextInfo: { messageSecret: crypto.randomBytes(32) },
  };
}

/** relay the pack message to a chat */
async function sendStickerPack(sock, chatId, packMessage) {
  await sock.relayMessage(chatId, packMessage, {});
}

module.exports = {
  MAX_PACK_STICKERS,
  DEFAULT_PACK_STICKERS,
  PACK_MEDIA_TYPE,
  PACK_HKDF_LABEL,
  isAnimatedWebp,
  buildTrayPng,
  buildPackZip,
  encryptPackBlob,
  uploadBuffer,
  buildStickerPackMessage,
  sendStickerPack,
};
