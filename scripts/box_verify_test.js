// LIVE test of Box 2 vision-worker /verify via the Go facade, from Box 1.
// Protocol: same character art = high similarity; different subjects = far apart.
const fs = require("fs");
const ENDPOINT = "http://10.0.1.56:7860/vision";

(async () => {
  const b64 = (f) => fs.readFileSync(f).toString("base64");
  const goku = b64("/home/ubuntu/vt_goku.png");
  const naruto = b64("/home/ubuntu/vt_naruto.png");
  const grey = b64("/home/ubuntu/vt_grey.jpg");
  const post = async (path, body) => {
    const r = await fetch(ENDPOINT + path, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(30000),
    });
    return r.json();
  };
  const h = await fetch(ENDPOINT + "/health", { signal: AbortSignal.timeout(8000) }).then((r) => r.json()).catch(() => null);
  console.log("health:", JSON.stringify(h));

  // identical image -> self-similarity ~1.0
  let t0 = Date.now();
  const self = await post("/verify", { image_b64: goku, reference_b64: goku });
  console.log(`goku vs goku      similarity=${self.similarity?.toFixed?.(3)} decision=${self.decision} ${Date.now() - t0}ms`);
  // different characters -> far apart
  t0 = Date.now();
  const cross = await post("/verify", { image_b64: goku, reference_b64: naruto });
  console.log(`goku vs naruto    similarity=${cross.similarity?.toFixed?.(3)} decision=${cross.decision} ${Date.now() - t0}ms`);
  // greyhound photo vs naruto ref -> must be far apart (reject)
  t0 = Date.now();
  const junk = await post("/verify", { image_b64: grey, reference_b64: naruto });
  console.log(`grey  vs naruto   similarity=${junk.similarity?.toFixed?.(3)} decision=${junk.decision} ${Date.now() - t0}ms`);

  const okSelf = self.similarity >= 0.9;
  const okCross = cross.similarity < 0.5;
  const okJunk = junk.similarity < 0.5;
  console.log(`LIVE VERIFY: self=${okSelf ? "PASS" : "FAIL"} cross=${okCross ? "PASS" : "FAIL"} junk=${okJunk ? "PASS" : "FAIL"}`);
  process.exit(okSelf && okCross && okJunk ? 0 : 1);
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
