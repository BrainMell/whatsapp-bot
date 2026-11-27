'use strict';
// 🩹 Idempotent runtime patch for @whiskeysockets/baileys (rc13/rc14), run from index.js BEFORE
// Baileys is first required. Adds ONE thing: a protocolMessage carrying a shared chat theme
// (core/commands/groupTools.js tags it with __themeTail) gets mediatype="chat_theme" on the
// <enc> node and stanza type="media". Without that WhatsApp Android ignores the theme.
// Safe: no-op if already patched or the anchor text is not found (other Baileys version).
const fs = require('fs');
const path = require('path');

const MARK = '/*joker:chat_theme*/';
const ANCHOR = "else if (message.groupInviteMessage) {\n            return 'url';\n        }\n        return '';";
const PATCHED = "else if (message.groupInviteMessage) {\n            return 'url';\n        }\n        " + MARK + "else if (message.protocolMessage && message.protocolMessage.__themeTail) {\n            return 'chat_theme';\n        }\n        return '';";

function apply() {
  try {
    const file = path.join(path.dirname(require.resolve('@whiskeysockets/baileys/package.json')), 'lib', 'Socket', 'messages-send.js');
    const src = fs.readFileSync(file, 'utf8');
    if (src.includes(MARK)) return 'already';
    if (!src.includes(ANCHOR)) return 'anchor-missing';
    fs.writeFileSync(file, src.replace(ANCHOR, PATCHED));
    return 'patched';
  } catch (e) {
    return 'error: ' + (e && e.message);
  }
}

module.exports = { apply };
