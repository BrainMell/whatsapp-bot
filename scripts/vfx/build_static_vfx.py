#!/usr/bin/env python3
"""Build the STATIC VFX library from `New Assets/vfx/*` (the owner's collected packs).
For every effect clip we pick the strongest single frame (peak) + one alternate frame, crop it to its content and save it to
core/rpgasset/vfx_static/<pack>/<id>.png, then write manifest.json with tags (kind / element / colour / size) used by the card renderer.
Usage: python3 scripts/vfx/build_static_vfx.py   (idempotent; output is committed)"""
import os, re, sys, json, glob, colorsys
from PIL import Image
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
SRC = os.path.join(ROOT, 'New Assets', 'vfx'); OUT = os.path.join(ROOT, 'core', 'rpgasset', 'vfx_static')
MIN_PX = 14          # skip frames whose content is smaller than this
def slug(s): return re.sub(r'[^a-z0-9]+', '_', s.lower()).strip('_')
def content(im):
    im = im.convert('RGBA'); bb = im.getchannel('A').point(lambda a: 255 if a > 20 else 0).getbbox(); return (im.crop(bb), bb) if bb else (None, None)
def score(im):  # visual weight: opaque area x brightness
    a = im.getchannel('A'); px = a.getdata(); n = sum(1 for v in px if v > 20)
    if not n: return 0
    rgb = im.convert('RGB').resize((16, 16)); br = sum(sum(p) for p in rgb.getdata()) / (256 * 765)
    return n * (0.4 + br)
def split_sheet(path, fw=None, fh=None):
    im = Image.open(path).convert('RGBA'); w, h = im.size
    if not fw:
        m = re.search(r'(\d+)x(\d+)', path) or re.search(r'_(\d{2,3})(?:\D|$)', os.path.basename(path))
        if m and len(m.groups()) == 2: fw, fh = int(m.group(1)), int(m.group(2))
        elif m: fw = fh = int(m.group(1))
        elif w % h == 0 and w > h: fw = fh = h
        elif h % w == 0 and h > w: fw = fh = w
        else: fw, fh = w, h
    if w % fw or h % fh: fw, fh = w, h
    return [im.crop((x, y, x + fw, y + fh)) for y in range(0, h, fh) for x in range(0, w, fw)]
def hue_tag(im):
    px = [p for p in im.resize((24, 24)).getdata() if p[3] > 80]
    if not px: return 'white'
    sat = [colorsys.rgb_to_hsv(p[0] / 255, p[1] / 255, p[2] / 255) for p in px]; s = sum(v[1] for v in sat) / len(sat); v = sum(x[2] for x in sat) / len(sat)
    if s < 0.18: return 'white' if v > 0.6 else 'grey' if v > 0.3 else 'black'
    sx = sum(__import__('math').cos(x[0] * 6.2832) * x[1] for x in sat); sy = sum(__import__('math').sin(x[0] * 6.2832) * x[1] for x in sat)
    hh = (__import__('math').atan2(sy, sx) / 6.2832) % 1 * 360
    for hi, nm in ((15, 'red'), (45, 'orange'), (68, 'yellow'), (165, 'green'), (200, 'cyan'), (255, 'blue'), (290, 'purple'), (335, 'pink'), (361, 'red')):
        if hh < hi: return nm
KIND_RULES = [('slash', r'slash|smear|swipe|thrust|stab|claw|punch|swoosh|dash|cut|blade|sword'), ('shield', r'shield|hex|barrier|ward|block|parry'), ('pillar', r'pillar|column|skyfall|beam|ray'),
  ('explosion', r'explo|nova|burst|blast|implosion|shockwave|firework|meteor|crash'), ('impact', r'impact|hit|spark|crit'), ('aura', r'aura|heal|buff|debuff|level|charge|glow|sparkle|shine|aegis|bless|holy|time|clock|portal|teleport|spawn|summon'),
  ('status', r'status|bleed|charm|confus|sleep|stun|freez|frozen|poison|burn|shock|zzz|bubble'), ('smoke', r'smoke|dust|steam|puff|poof|cloud|fog'), ('projectile', r'missile|bolt|orb|spear|glob|fireball|arrow|projectile|lightning|ball'),
  ('ground', r'spike|pool|field|wall|ground|flames|tornado|whirl|vortex|geyser|splash|wave|blizzard|campfire|rock|crystal|lava'), ('pickup', r'coin|heart|pickup|treasure|chest|xp|item|confetti|star')]
ELEM_RULES = [('fire', r'fire|flame|burn|lava|meteor|ember|inferno|magma|campfire|explosion_ground|blaze'), ('ice', r'ice|frost|freez|blizzard|snow|cryo|frozen'), ('lightning', r'light(?!_pillar)ning|electric|shock|spark|thunder|arc|volt|plasma'),
  ('water', r'water|splash|wave|tide|rain|geyser|aqua|bubble'), ('wind', r'wind|tornado|gale|dash|whirl|air|swoosh'), ('earth', r'earth|rock|stone|debris|spike|crystal|ground|dust'), ('holy', r'holy|light_pillar|pillar|bless|heal|aegis|radiant|divine|sun'),
  ('dark', r'dark|shadow|void|necro|curse|abyss|doom|bone'), ('poison', r'poison|toxic|acid|venom|plague|glob'), ('blood', r'blood|bleed|gore'), ('arcane', r'arcane|magic|time|clock|portal|teleport|rune|astral|mana|cosmic|void'), ('nature', r'nature|leaf|vine|thorn|growth|forest')]
def tags_for(name):
    low = name.lower(); k = next((k for k, r in KIND_RULES if re.search(r, low)), 'burst'); e = [e for e, r in ELEM_RULES if re.search(r, low)]; return k, e
manifest = []
def add(pack, cid, frames, label):
    frames = [f for f in frames if f is not None]
    if not frames: return
    cs = [content(f) for f in frames]; sc = [score(c[0]) if c[0] else 0 for c in cs]
    if not any(sc): return
    pk = max(range(len(frames)), key=lambda i: sc[i]); alts = [i for i in range(len(frames)) if i != pk and sc[i] > 0.45 * sc[pk] and abs(i - pk) >= max(2, len(frames) // 5)]
    pick = [('peak', pk)] + ([('alt', alts[len(alts) // 2])] if alts else [])
    os.makedirs(os.path.join(OUT, pack), exist_ok=True)
    for tag, i in pick:
        im, bb = cs[i]
        if im is None or max(im.size) < MIN_PX: continue
        fn = f'{cid}__{tag}.png'; im.save(os.path.join(OUT, pack, fn), optimize=True)
        k, e = tags_for(label); manifest.append({'file': f'{pack}/{fn}', 'pack': pack, 'id': cid, 'frame': tag, 'w': im.size[0], 'h': im.size[1], 'kind': k, 'elem': e, 'hue': hue_tag(im), 'label': label, 'frames': len(frames)})
def pngs(d): return sorted(glob.glob(os.path.join(d, '*.png')), key=lambda p: [int(t) if t.isdigit() else t for t in re.split(r'(\d+)', p)])
# ── artistworld AW mega pack: <cat>/<effect>/<Size>/frames/*.png  (Large preferred) ──
aw = os.path.join(SRC, 'artistworld-aw-vfx-mega-pack', 'AW_VFX_Mega_Pack_Free')
for cat in sorted(os.listdir(aw)):
    cd = os.path.join(aw, cat)
    if not os.path.isdir(cd) or cat.startswith('10_'): continue
    for eff in sorted(os.listdir(cd)):
        ed = os.path.join(cd, eff); sizes = [s for s in ('Large', 'XL', 'Medium', 'Small') if os.path.isdir(os.path.join(ed, s))]
        for s in sizes[:1]:
            fr = pngs(os.path.join(ed, s, 'frames')) or []
            add('aw', slug(f'{eff}_{s}'), [Image.open(p) for p in fr], f'{cat} {eff}')
# ── nerijs PVFX foundry: effects/<group>/<name>/lit/packed/{sprite-sheet.png,manifest.json} ──
for mp in sorted(glob.glob(os.path.join(SRC, 'nerijs-pvfx-foundry', 'effects', '*', '*', 'lit', 'packed', 'manifest.json'))):
    m = json.load(open(mp)); sheet = Image.open(os.path.join(os.path.dirname(mp), 'sprite-sheet.png')).convert('RGBA'); fr = []
    for f in m['frames']:
        s = f['sheet']; fr.append(sheet.crop((s['x'], s['y'], s['x'] + s['width'], s['y'] + s['height'])))
    grp, nm = m['program'].split('/'); add('pvfx', slug(nm), fr, f'{grp} {nm}')
# ── pimen / frostwindz / pipoya / others ──
def walk_frames(pack, base, label_from=1):
    for dp, dn, fn in os.walk(base):
        pn = pngs(dp)
        if len(pn) >= 2 and ('rame' in os.path.basename(dp) or re.search(r'color\d', os.path.basename(dp))):
            rel = os.path.relpath(dp, base); add(pack, slug(rel), [Image.open(p) for p in pn], rel)
walk_frames('pimen', os.path.join(SRC, 'pimen-dark-spell-effect')); walk_frames('pimen', os.path.join(SRC, 'pimen-holy-spell-effect')); walk_frames('pimen', os.path.join(SRC, 'pimen-ice-spell-effect-01'))
for p in glob.glob(os.path.join(SRC, 'pimen-battle-vfx-slashes-thrusts', '*', '*.png')): add('pimen', 'smear_' + slug(os.path.basename(p)[:-4]), [Image.open(p)], 'slash smear ' + os.path.basename(p))
# frostwindz slashes: 64x64/Slash N/colorM/*.png  (keep color1..4 for variety)
for dp, dn, fn in os.walk(os.path.join(SRC, 'frostwindz-pixel-art-slashes')):
    if re.search(r'color\d$', dp) and pngs(dp) and '64x64' in dp:
        rel = os.path.relpath(dp, os.path.join(SRC, 'frostwindz-pixel-art-slashes')); add('frostwindz', slug(rel), [Image.open(p) for p in pngs(dp)], 'slash ' + rel)
for p in sorted(glob.glob(os.path.join(SRC, 'frostwindz-animated-portal', 'Frames', '*.png'))): pass
add('frostwindz', 'portal', [Image.open(p) for p in pngs(os.path.join(SRC, 'frostwindz-animated-portal', 'Frames'))], 'portal teleport')
for p in sorted(glob.glob(os.path.join(SRC, 'pipoya-*', '*', '*', '*.png'))):
    nm = slug(os.path.basename(p)[:-4]); dn = slug(os.path.basename(os.path.dirname(os.path.dirname(os.path.dirname(p)))))
    if '480' in p or '400' in p: continue   # keep the 192 set (smaller) — the large duplicates add nothing for cards
    add('pipoya', f'{dn}_{nm}', split_sheet(p), dn.replace('pipoya_', '') + ' ' + nm)
for p in sorted(glob.glob(os.path.join(SRC, 'jasontomlee-slashfx', '*', '*sheet.png')) + glob.glob(os.path.join(SRC, 'jasontomlee-slashfx', '*', '*', '*sheet*.png'))): add('slashfx', slug(os.path.basename(p)[:-4]), split_sheet(p), 'slash ' + os.path.basename(p))
for p in sorted(glob.glob(os.path.join(SRC, 'ansimuz-gothicvania-magic-pack-9', '*', 'spritesheets', '*.png'))): add('gothicvania', slug(os.path.basename(p)[:-4]), split_sheet(p), 'magic ' + os.path.basename(p))
for p in sorted(glob.glob(os.path.join(SRC, 'pixogenassets-pixel-art-rpg-vfx-lite', 'Textures', '*', '*.png'))): add('pixogen', slug(os.path.basename(p)[:-4]), split_sheet(p), os.path.basename(os.path.dirname(p)) + ' ' + os.path.basename(p))
for p in sorted(glob.glob(os.path.join(SRC, 'sangoro-attack-vfx', '*.png'))): add('sangoro', slug(os.path.basename(p)[:-4]), split_sheet(p), 'attack ' + os.path.basename(p))
for p in sorted(glob.glob(os.path.join(SRC, 'the-pixel-game-pixel-spells', '*', '*', '*.png')) + glob.glob(os.path.join(SRC, 'the-pixel-game-pixel-spells', '*', '*', '*', '*.png'))): add('pixelspells', slug(os.path.basename(p)[:-4]), split_sheet(p), os.path.basename(os.path.dirname(p)) + ' ' + os.path.basename(p))
json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=0)
from collections import Counter
print(len(manifest), 'sprites', Counter(m['pack'] for m in manifest)); print(Counter(m['kind'] for m in manifest)); print(Counter(e for m in manifest for e in (m['elem'] or ['-'])))
