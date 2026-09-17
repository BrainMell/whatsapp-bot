#!/usr/bin/env python3.13
"""Patch layouts.json colors for the re-baked profile backgrounds + write
style-3 rpgfills colors + style-5 crystal img. Idempotent."""
import json, sys

P = '/home/ubuntu/whatsapp-bot/core/rpgasset/ui/styles/layouts.json'
d = json.load(open(P))

def op(d, style, pred, **kw):
    hit = 0
    for o in d[str(style)]['ops']:
        if pred(o):
            o.update(kw)
            hit += 1
    return hit

n = 0
# ── style 1 Stonekeep: engraved dark ink on granite plate
n += op(d, 1, lambda o: o.get('s') == '{NAME}', color='#23252a', shadow={'color': '#ffffff88', 'off': 2})
n += op(d, 1, lambda o: isinstance(o.get('s'), str) and o['s'].startswith('{CLS}'), color='#3a3d45')
# ── style 3 Retro Court: dark ink + burgundy on sepia
n += op(d, 3, lambda o: o.get('s') == '{NAME} the {CLST}', color='#3a2c20')
n += op(d, 3, lambda o: o.get('op') == 'join' and o.get('y') == 150, color='#7a2c3a')
n += op(d, 3, lambda o: o.get('s') == '{RANKX}', color='#7a2c3a')
n += op(d, 3, lambda o: o.get('op') == 'join' and o.get('y') == 926, color='#3a2c20')
n += op(d, 3, lambda o: o.get('op') == 'statvals', color='#7a2c3a')
# ── style 4 Woodmere: dark wood ink on tan paper
n += op(d, 4, lambda o: o.get('s') in ('HP', 'ATK', 'DEF', 'MAG', 'SPD', 'ZENI'), color='#4a3015')
n += op(d, 4, lambda o: isinstance(o.get('s'), str) and (o['s'].startswith('{V_}') or o['s'] == '{ZENI}'), color='#34220f')
# ── style 9 Rune Monolith: ember accents (was cyan)
n += op(d, 9, lambda o: o.get('s') == '{RANKX}', color='#f5ddc2', glow={'color': '#e88c40', 'r': 10})
n += op(d, 9, lambda o: o.get('op') == 'statvals', color='#f0e0c8', glow={'color': '#e88c40', 'r': 9})
# ── style 5 Emblem Noir: red wax disc instead of pixel crystal
n += op(d, 5, lambda o: o.get('op') == 'crystal', img='wax_noir.png')
# ── style 3 rpgfills: muted vintage color fills (no pixel-art bars)
for o in d['3']['ops']:
    if o.get('op') == 'rpgfills':
        cols = {'hp': '#8a3040', 'atk': '#a0562c', 'def': '#4a6a52', 'mag': '#5c3a70', 'spd': '#3c6470', 'luck': '#77702c'}
        for it in o.get('items', []):
            it['color'] = cols.get(it['key'], '#7a2c3a')
        n += 1

json.dump(d, open(P, 'w'), indent=1, ensure_ascii=False)
print('patched ops:', n)
