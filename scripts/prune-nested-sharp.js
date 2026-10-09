#!/usr/bin/env node
// ⚔️ postinstall guard (Guild War overhaul 2026-10-09, Box1 sharp incident):
// wa-sticker-formatter@4.4.4 pins sharp ^0.30.0, which npm installs NESTED
// and — when the prebuilt download fails — builds against the SYSTEM
// libvips. On Box1 the Oct-07/08 apt upgrades (libpoppler/glib stack) left
// that system libvips unable to resolve g_once_init_enter_pointer, so every
// fresh boot that loaded the nested sharp crashed (pm2 crash-loop, bots
// parked). The ROOT sharp (^0.35.3, prebuilt, bundled vips) works on both
// boxes; package.json now overrides the nested dependency to `$sharp`, but
// npm's override pruning proved version-flaky — so this hook physically
// removes the nested copy after every install. Resolution then falls
// through to the root sharp everywhere.
// Never fail the install over this.
try {
    const fs = require('fs');
    const path = require('path');
    const nested = path.join(__dirname, '..', 'node_modules', 'wa-sticker-formatter', 'node_modules', 'sharp');
    if (fs.existsSync(nested)) {
        fs.rmSync(nested, { recursive: true, force: true });
        console.log('[postinstall] removed nested wa-sticker-formatter/sharp — root sharp (^0.35) is used instead (Box1 libvips incident 2026-10-09)');
    }
} catch (e) {
    console.error('[postinstall] prune-nested-sharp skipped:', e.message);
}
process.exit(0);
