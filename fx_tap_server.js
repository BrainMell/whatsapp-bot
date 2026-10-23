// fx-tap - joker's button-press detector.
// cta_url buttons point here; the HTTP GET is the tap signal.
// WhatsApp protocol sends NOTHING on a cta_url tap - this closes the
// detection gap through the web instead. Zero chat traffic.
// Listens on 0.0.0.0:8787, logs taps to fx_captures/taps.log.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 8787;
const LOG = path.join(process.cwd(), "fx_captures", "taps.log");

function logTap(line) {
    try {
        fs.mkdirSync(path.dirname(LOG), { recursive: true });
        fs.appendFileSync(LOG, line + "\n");
    } catch (e) { console.error("log fail:", e.message); }
}

const server = http.createServer((req, res) => {
    const ua = (req.headers["user-agent"] || "-").slice(0, 160);
    const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "-").toString().slice(0, 60);
    const url = new URL(req.url, "http://" + (req.headers.host || "x"));
    if (url.pathname.startsWith("/c/")) {
        const tag = decodeURIComponent(url.pathname.slice(3)).slice(0, 80);
        const line = new Date().toISOString() + " tap tag=" + tag + " ua=" + ua + " ip=" + ip;
        logTap(line);
        console.log(line);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>🫥 tap received</title>` +
            `<style>body{background:#0d0d17;color:#e8e8f2;font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}div{text-align:center;padding:24px}h1{font-size:28px}p{color:#8b8ba3}</style></head>` +
            `<body><div><h1>🫥 TAP RECEIVED</h1><p>this visit = the proof joker just logged server-side.</p><p>your side sent <b>zero messages</b> to the chat.</p><p style="margin-top:18px;font-size:12px;color:#555">${tag}</p></div></body></html>`);
        return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><html><head><title>joker fx-tap</title></head><body style="font-family:system-ui;background:#0d0d17;color:#e8e8f2">joker fx-tap listener alive - /c/&lt;tag&gt; to land a tap</body></html>`);
});
server.listen(PORT, "0.0.0.0", () => console.log("fx-tap listening on " + PORT));
