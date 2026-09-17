#!/usr/bin/env python3.13
"""profileCardRenderer.js: rpgfills gains x/color/h + crystal gains img.
Backwards compatible (defaults keep current behaviour)."""
import re

P = '/home/ubuntu/whatsapp-bot/core/rpg/profileCardRenderer.js'
src = open(P).read()

old_rpg = """        case 'rpgfills': {
          for (const it of op.items || []) {
            const img = await loadExtra(it.img);
            if (!img) continue;
            const frac = statFrac(D._stats, it.key);
            const fw = Math.max(10, (150 - 30) * frac);
            ctx.drawImage(img, 492, it.y, fw, 11);
          }
          break;
        }"""
new_rpg = """        case 'rpgfills': {
          for (const it of op.items || []) {
            const frac = statFrac(D._stats, it.key);
            const fw = Math.max(10, ((it.w || 150) - 30) * frac);
            const fx = it.x || 492;
            const fh = it.h || 11;
            if (it.color) {
              ctx.save();
              roundRectPath(ctx, fx, it.y, fw, fh, fh / 2); ctx.clip();
              ctx.fillStyle = it.color;
              ctx.fillRect(fx, it.y, fw, fh);
              ctx.restore();
            } else {
              const img = await loadExtra(it.img);
              if (!img) continue;
              ctx.drawImage(img, fx, it.y, fw, fh);
            }
          }
          break;
        }"""
assert old_rpg in src, 'rpgfills block not found'
src = src.replace(old_rpg, new_rpg)

old_cr = """        case 'crystal': {
          const cr = await loadExtra('crystal.png');"""
new_cr = """        case 'crystal': {
          const cr = (op.img ? await loadExtra(op.img) : null) || (await loadExtra('crystal.png'));"""
assert old_cr in src, 'crystal block not found'
src = src.replace(old_cr, new_cr)

open(P, 'w').write(src)
print('patched rpgfills + crystal')
