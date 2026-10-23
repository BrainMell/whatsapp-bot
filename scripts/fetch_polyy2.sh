#!/bin/bash
# Fetch Polyy.AI pack parts v2: click button -> grab presigned mirror URL from native network log -> curl fast.
# Presign expires in 60s; Range is unsigned so curl -C - can resume with a fresh URL.
# Usage: fetch_polyy2.sh <slug> <dest_dir> <upload_id:label> ...
set -u
SLUG="$1"; DEST="$2"; shift 2
mkdir -p "$DEST"
ab() { agent-browser "$@"; }

grab_url() {
  ab network requests --filter mirror 2>/dev/null | grep -oE 'https://itchio-mirror[^ ]+' | tail -1
}

for SPEC in "$@"; do
  ID="${SPEC%%:*}"; LABEL="${SPEC##*:}"
  OUT="$DEST/$LABEL"
  echo "== $LABEL (upload $ID) =="
  for ATTEMPT in 1 2 3 4 5 6 7 8; do
    ab eval "var b=document.querySelector('.download_btn[data-upload_id=\"$ID\"]'); b?(b.click(),'clicked'):'NOBTN'" >/dev/null 2>&1
    sleep 3
    URL=$(grab_url)
    if [ -z "$URL" ]; then echo "  attempt $ATTEMPT: no url"; continue; fi
    SIZE=$(stat -c%s "$OUT" 2>/dev/null || echo 0)
    echo "  attempt $ATTEMPT: got url, resuming from $SIZE"
    curl -sL -C - --max-time 55 -o "$OUT" "$URL"
    RC=$?
    SIZE=$(stat -c%s "$OUT" 2>/dev/null || echo 0)
    if [ "$RC" -eq 0 ]; then echo "  COMPLETE $LABEL: $SIZE bytes"; break; fi
    echo "  partial: $SIZE bytes (rc=$RC), refetching signed url"
  done
done
ls -la "$DEST"
