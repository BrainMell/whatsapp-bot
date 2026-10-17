#!/bin/bash
# itch per-upload click -> capture signed CDN url -> immediate download
set -u
DEST="/home/z/my-project/download/assets/packs/castles"
mkdir -p "$DEST"
ab() { agent-browser "$@"; }

dl_one() {
  local ID="$1" OUT="$2"
  ab eval "window.__xhrlog=[]; 'cleared'" >/dev/null 2>&1
  ab eval "document.querySelector('.download_btn[data-upload_id=\"$ID\"]').click(); 'c'" >/dev/null 2>&1
  ab wait 900 >/dev/null 2>&1
  ab eval "window.stop(); 's'" >/dev/null 2>&1
  ab eval "JSON.stringify(window.__xhrlog.filter(x=>x.u.includes('/file/')))" 2>/dev/null | tr -d '\\' > "/tmp/xhr_$ID.json"
  local URL
  URL=$(/home/z/.venv/bin/python -c "
import re,sys
raw=open('/tmp/xhr_$ID.json').read()
m=re.search(r'/file/$ID.*?url.?:(?:\"\\\\?/\\\\?/|\")?(https:\\\\?/\\\\?/itchio-mirror[^\"]+)', raw) or re.search(r'(https:\\\\?/\\\\?/itchio-mirror[^\"]+)', raw)
print(m.group(1).replace('\\\\/','/') if m else '')
")
  if [ -z "$URL" ]; then echo "FAIL $ID (no url)"; return 1; fi
  echo "GOT $ID -> ${URL:0:80}..."
  curl -sL -o "$OUT" "$URL" &
  echo "launched $OUT"
}

dl_one 17775711 "$DEST/castles_pack_part_1.zip"
dl_one 17775709 "$DEST/castles_pack_extra.zip"
sleep 3
ls -la "$DEST"
