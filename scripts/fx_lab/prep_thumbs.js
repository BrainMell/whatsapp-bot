// One-shot: 320px JPEG preview thumbs for the v12 link-preview flip test.
// jimp 1.6.1 API (new): Jimp.read → resize({w}) → quality → write.
const { Jimp } = require("jimp");
(async () => {
    const A = "/home/ubuntu/whatsapp-bot/fx_captures/assets/";
    const pairs = [
        ["morph_a.jpg", "morph_a_thumb.jpg"],
        ["morph_b.jpg", "morph_b_thumb.jpg"],
    ];
    for (const [src, dst] of pairs) {
        const img = await Jimp.read(A + src);
        img.resize({ w: 320 });
        await img.write(A + dst);
        console.log("thumb →", dst);
    }
    console.log("thumbs done");
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
