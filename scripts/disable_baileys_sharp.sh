#!/bin/bash
# Disable sharp inside Baileys' thumbnail generation on this box.
# sharp's native libvips hard-crashes the process (GLib-GObject-CRITICAL,
# 2026-09-14 22:53 incident - killed the bot mid gstatus media post).
# Baileys falls back to jimp when sharp is unavailable; jimp is the bot's
# approved image lib. Run this again after any `npm install`.
set -e
F="/home/ubuntu/whatsapp-bot/node_modules/@whiskeysockets/baileys/lib/Utils/messages-media.js"
if [ ! -f "$F" ]; then echo "Baileys messages-media.js not found"; exit 1; fi
if grep -q "SHARP-BANNED-ON-THIS-BOX" "$F"; then
  echo "Already patched"
else
  sed -i "s/if ('sharp' in lib \&\& typeof lib.sharp?.default === 'function') {/if (false \&\& 'sharp' in lib \&\& typeof lib.sharp?.default === 'function') { \/\/ SHARP-BANNED-ON-THIS-BOX: native libvips crash - jimp only/g" "$F"
  if grep -q "SHARP-BANNED-ON-THIS-BOX" "$F"; then
    echo "Patched OK"
  else
    echo "PATCH FAILED - anchor not found (Baileys updated?)"; exit 1
  fi
fi
