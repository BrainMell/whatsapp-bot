// hq_harness.js — standalone v12e de-risk: prove prepareWAMessageMedia with
// mediaTypeOverride 'thumbnail-link' produces the full HQ field set the
// linkPreview mapping needs (mock upload; real upload already proven in v12c).
const path = require("path");
const fs = require("fs");
const botDir = "/home/ubuntu/whatsapp-bot";
const { prepareWAMessageMedia } = require(path.join(botDir, "node_modules/@whiskeysockets/baileys"));
(async () => {
    const buf = fs.readFileSync(botDir + "/fx_captures/assets/morph_wide_a.jpg");
    const prep = await prepareWAMessageMedia({ image: buf }, {
        upload: async (filePath, opts) => {
            console.log("upload called: mediaType=" + opts.mediaType + " encSha256B64.len=" + (opts.fileEncSha256B64 || "").length);
            return { mediaUrl: "https://mmg.whatsapp.net/fake", directPath: "/v/t62.36144-24/fake.enc" };
        },
        mediaTypeOverride: "thumbnail-link",
    });
    const im = prep.imageMessage;
    console.log("imageMessage:", JSON.stringify({
        width: im.width, height: im.height,
        directPath: im.directPath ? String(im.directPath).slice(0, 30) : null,
        mediaKey: im.mediaKey ? im.mediaKey.length + "B" : null,
        mediaKeyTimestamp: im.mediaKeyTimestamp,
        fileSha256: im.fileSha256 ? im.fileSha256.length + "B" : null,
        fileEncSha256: im.fileEncSha256 ? im.fileEncSha256.length + "B" : null,
        jpegThumbnail: im.jpegThumbnail ? im.jpegThumbnail.length + "B" : null,
        mimetype: im.mimetype,
    }));
    const ready = im.directPath && im.mediaKey && im.width && im.height;
    console.log(ready ? "HQ-FIELDS-READY" : "HQ-FIELDS-MISSING");
})().catch(e => { console.error("FAIL", e.message); process.exit(1); });
