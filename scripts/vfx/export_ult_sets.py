#!/usr/bin/env python3
"""Export pvfx-foundry clips as ANIMATED sets for the ultimate video engine and (re)generate the newvfx part of
core/rpgasset/vfx/vfx_assets.json (existing non-newvfx sets/overrides are preserved).
Frames are re-placed on the clip's source canvas, cropped to ONE shared box so the motion stays aligned."""
import os, json
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
SRC = os.path.join(ROOT, 'New Assets', 'vfx', 'nerijs-pvfx-foundry', 'effects')
VFX = os.path.join(ROOT, 'core', 'rpgasset', 'vfx'); OUT = os.path.join(VFX, 'packs', 'newvfx'); MAN = os.path.join(VFX, 'vfx_assets.json')
MAXF = 24
def export(clip):
    d = os.path.join(SRC, clip, 'lit', 'packed'); m = json.load(open(os.path.join(d, 'manifest.json'))); sh = Image.open(os.path.join(d, 'sprite-sheet.png')).convert('RGBA')
    sw, sh_ = m['source_size']; fr = []
    for f in m['frames']:
        if not f.get('sheet') or not f.get('visible_bounds'): continue
        s = f['sheet']; cell = Image.new('RGBA', (sw, sh_), (0, 0, 0, 0)); cell.alpha_composite(sh.crop((s['x'], s['y'], s['x'] + s['width'], s['y'] + s['height'])), tuple(f['visible_bounds'][:2])); fr.append((cell, f['duration']['numerator_ms']))
    if len(fr) > MAXF: fr = [fr[round(i * (len(fr) - 1) / (MAXF - 1))] for i in range(MAXF)]
    bbs = [c.getchannel('A').point(lambda a: 255 if a > 12 else 0).getbbox() for c, _ in fr]; bbs = [b for b in bbs if b]
    box = (min(b[0] for b in bbs), min(b[1] for b in bbs), max(b[2] for b in bbs), max(b[3] for b in bbs))
    cid = 'pv_' + clip.replace('/', '_').replace('-', '_'); os.makedirs(os.path.join(OUT, cid), exist_ok=True); files = []
    for i, (c, _) in enumerate(fr):
        fn = f'{i:02d}.png'; c.crop(box).save(os.path.join(OUT, cid, fn), optimize=True); files.append(f'packs/newvfx/{cid}/{fn}')
    total = sum(ms for _, ms in fr) / 1000.0
    return cid, {'files': files, 'fps': max(8, min(24, round(len(fr) / max(0.2, total))))}, (box[2] - box[0], box[3] - box[1])
# role -> clip, per theme.   roles: circle pillar rings ripple cracks fall rift slashes breath vines burst sonic
T = {
 'fire':   dict(circle='fire/ground-flames', pillar='fire/fire-pillar', rings='explosions/fire-nova', ripple='impacts/shockwave-ring', cracks='fire/lava-burst', fall='fire/meteor-strike', rift='fire/fire-tornado', slashes='melee/sword-combo', breath='fire/flamethrower', burst='explosions/big-explosion', sonic='explosions/fire-nova'),
 'holy':   dict(circle='holy/resurrect', pillar='holy/holy-smite', rings='holy/regen-aura', ripple='impacts/shockwave-ring', cracks='holy/divine-beam', fall='holy/holy-smite', rift='holy/angel-feathers', slashes='melee/sword-combo', breath='holy/divine-beam', burst='holy/regen-aura', sonic='impacts/shockwave-ring'),
 'ice':    dict(circle='ice/frost-nova', pillar='ice/ice-spike', rings='ice/frost-nova', ripple='ice/freeze-encase', cracks='ice/ice-wall', fall='projectiles/ice-shard', rift='ice/blizzard', slashes='ice/ice-spike', breath='ice/frost-breath', burst='ice/snowball-impact', sonic='ice/frost-nova'),
 'storm':  dict(circle='lightning/static-burst', pillar='lightning/lightning-strike', rings='lightning/static-burst', ripple='impacts/shockwave-ring', cracks='lightning/chain-lightning', fall='lightning/lightning-strike', rift='lightning/thunder-cloud', slashes='lightning/chain-lightning', breath='lightning/chain-lightning', burst='lightning/ball-lightning', sonic='lightning/static-burst'),
 'shadow': dict(circle='shadow/curse', pillar='shadow/soul-drain', rings='shadow/void-implosion', ripple='shadow/void-implosion', cracks='shadow/shadow-tendrils', fall='shadow/shadow-bolt', rift='shadow/void-implosion', slashes='melee/shadow-claw', breath='shadow/shadow-bolt', burst='shadow/void-implosion', sonic='shadow/void-implosion'),
 'arcane': dict(circle='arcane/magic-circle', pillar='arcane/arcane-beam', rings='explosions/arcane-burst', ripple='arcane/shield-shatter', cracks='arcane/rune-trap', fall='arcane/arcane-orb-projectile', rift='arcane/portal-summon', slashes='arcane/blink-dash', breath='arcane/arcane-beam', burst='explosions/arcane-burst', sonic='explosions/arcane-burst'),
 'nature': dict(circle='nature/bloom-heal', pillar='nature/earth-spike', rings='nature/spore-burst', ripple='impacts/shockwave-ring', cracks='nature/fissure', fall='nature/boulder-toss', rift='nature/leaf-storm', slashes='nature/vine-snare', breath='nature/poison-cloud', burst='nature/spore-burst', sonic='nature/spore-burst', vines='nature/vine-snare'),
 'steel':  dict(circle='wind/whirlwind', pillar='impacts/ground-slam', rings='impacts/shockwave-ring', ripple='impacts/shockwave-ring', cracks='impacts/ground-slam', fall='melee/hammer-smash', rift='wind/whirlwind', slashes='melee/sword-combo', breath='wind/wind-blade', burst='impacts/crit-hit', sonic='impacts/shockwave-ring'),
 'brawl':  dict(circle='status/power-up-aura', pillar='impacts/ground-slam', rings='impacts/shockwave-ring', ripple='impacts/shockwave-ring', cracks='impacts/ground-slam', fall='melee/hammer-smash', rift='status/power-up-aura', slashes='impacts/punch-hit', breath='impacts/shockwave-ring', burst='impacts/crit-hit', sonic='impacts/shockwave-ring'),
}
CLS = {
 'fire': 'DRAGONSLAYER DRAGON_LORD DRAGON_GOD ELEMENTALIST MAGE DOOMSLAYER WARLORD',
 'holy': 'ACOLYTE CLERIC SAINT PALADIN TEMPLAR AVATAR GOD_HAND DIVINE_FIST',
 'ice': 'ZENMASTER SCOUT',
 'storm': 'ARTIFICER GRAND_INVENTOR VIRTUOSO BARD',
 'shadow': 'DEATH_LORD LICH NECROMANCER REAPER VOIDWALKER WARLOCK NIGHTBLADE KAGE',
 'arcane': 'ARCHMAGE APPRENTICE CHRONOMANCER TIMELORD',
 'nature': 'ARCHDRUID DRUID',
 'steel': 'NINJA SAMURAI SHOGUN ROGUE MERCHANT TYCOON',
 'brawl': 'BERSERKER FIGHTER WARRIOR MONK',
}
# role -> (layer key, width px at 640x480, extra fields)
W = dict(circle=(330, dict(loop=False)), pillar=(260, {}), rings=(420, {}), ripple=(380, {}), cracks=(300, {}), fall=(240, {}), rift=(300, {}), slashes=(300, dict(n=2, gap=0.09)), breath=(380, {}), vines=(300, {}))
FX = {'white_burst': ('burst', 300), 'k_sonic': ('sonic', 360), 'holy_burst': ('burst', 300), 'fire_bomb': ('burst', 300), 'k_flash': ('burst', 280), 'holy_pillar': ('pillar', 280), 'fire_blast': ('breath', 400), 'dark_a': ('rift', 300), 'dark_b': ('rift', 300), 'necro3': ('rift', 320), 'claw': ('slashes', 300), 'vine_slash': ('slashes', 300), 'k_ground': ('cracks', 320)}
man = json.load(open(MAN)); man['sets'] = {k: v for k, v in man.get('sets', {}).items() if not k.startswith('pv_')}
man['overrides'] = {k: v for k, v in man.get('overrides', {}).items() if '@' in k and not k.startswith(('slashes@', 'circle@', 'pillar@', 'rings@', 'ripple@', 'cracks@', 'fall@', 'rift@', 'breath@', 'vines@', 'fx:'))}
done = {}; info = {}
def S(clip):
    if clip not in done: cid, d, sz = export(clip); done[clip] = cid; man['sets'][cid] = d; info[cid] = sz
    return done[clip]
for th, cl in CLS.items():
    t = T[th]
    for c in cl.split():
        for role, (w, ex) in W.items():
            if role not in t: continue
            o = {'set': S(t[role]), 'w': w}; o.update(ex)
            if role in ('pillar', 'rift', 'breath'): o['loop'] = True
            man['overrides'][f'{role}@{c}'] = o
        for fx, (role, w) in FX.items():
            if role in t: man['overrides'][f'fx:{fx}@{c}'] = {'set': S(t[role]), 'w': w}
man['_readme'] = man.get('_readme', '')
json.dump(man, open(MAN, 'w'), indent=1)
print(len(done), 'clips'); [print(k, v) for k, v in sorted(info.items())]
