#!/usr/bin/env python3.13
"""Round-2 fixes: per-val colors (style 3 burgundy values, style 9 ember values),
style 4 guild line light on dark sign, bg_9 footer glyphs moved below text,
bg_3 mid-panel flourish."""
import json

P = '/home/ubuntu/whatsapp-bot/core/rpgasset/ui/styles/layouts.json'
d = json.load(open(P))

# style 3: values live on op.vals[*].color (not op.color)
for o in d['3']['ops']:
    if o.get('op') == 'statvals':
        for v in o['vals']:
            v['color'] = '#7a2c3a'
# style 9: values + glow per val
for o in d['9']['ops']:
    if o.get('op') == 'statvals':
        for v in o['vals']:
            v['color'] = '#f0e0c8'
            v['glow'] = {'color': '#e88c40', 'r': 9}
# style 4: guild title light on the dark sign
for o in d['4']['ops']:
    if isinstance(o.get('s'), str) and o['s'].startswith('{GTITLE}'):
        o['color'] = '#f0d8b0'
json.dump(d, open(P, 'w'), indent=1, ensure_ascii=False)
print('layouts round-2 patched')
