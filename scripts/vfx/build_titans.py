#!/usr/bin/env python3
"""Conquest Titan bosses from the asset packs (core/rpgasset/packs/monsters): one boss per realm -> golems/titan_<realm>.png (4x nearest, bbox-cropped)."""
import os
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'); M = os.path.join(ROOT, 'core', 'rpgasset', 'packs', 'monsters'); OUT = os.path.join(ROOT, 'core', 'rpgasset', 'guildwar', 'conquest', 'golems')
MY = os.path.join(M, 'mythic-monsters', 'Free Mythic Monsters', 'Transparent', '1x Size')
def sheet(p, w, h): return Image.open(p).convert('RGBA').crop((0, 0, w, h))
SRC = {
    'frostreach': lambda: sheet(os.path.join(M, 'boss-frost-guardian', 'frost_guardian_free_192x128_SpriteSheet.png'), 192, 128),   # Frost Guardian
    'wildwood':   lambda: sheet(os.path.join(M, 'boss-minotaur', 'animations', 'minotaur_288x160_SpriteSheet.png'), 288, 160),        # Minotaur
    'emberfields': lambda: Image.open(os.path.join(MY, '025_1.png')).convert('RGBA'),   # ember demon
    'sunscorch':  lambda: Image.open(os.path.join(MY, '012_1.png')).convert('RGBA'),    # gilded horned beast
    'stormreach': lambda: Image.open(os.path.join(MY, '018_1.png')).convert('RGBA'),    # three-headed hydra
}
for realm, fn in SRC.items():
    im = fn(); bb = im.getchannel('A').point(lambda a: 255 if a > 10 else 0).getbbox(); im = im.crop(bb)
    k = max(2, min(6, round(300 / max(im.size)))); im = im.resize((im.width * k, im.height * k), Image.NEAREST); im.save(os.path.join(OUT, f'titan_{realm}.png'), optimize=True); print(realm, im.size)
