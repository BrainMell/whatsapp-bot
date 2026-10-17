#!/usr/bin/env python3
"""PIL preview renderer — 1:1 mirror of the bot's homestead/guild renderFrame
(same iso math, same assets, placements from gen_placements.js)."""
import json, math, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

REPO = '/home/z/my-project/repos/whatsapp-bot'
HS = f'{REPO}/core/rpgasset/homestead'
GB = f'{REPO}/core/rpgasset/guildbase'
FONTS = f'{REPO}/core/rpgasset/fonts'
PREV = '/home/z/my-project/download/assets/previews'
os.makedirs(PREV, exist_ok=True)

TW, TH, N, P, M = 64, 32, 16, 3, 12
ART_W, ART_H = 1240, 850
OX, OY = ART_W / 2, 150

def isoX(x, y): return OX + (x - y) * (TW / 2)
def isoY(x, y): return OY + (x + y) * (TH / 2)

_img_cache = {}
def img(dirpath, name):
    key = dirpath + '/' + name
    if key not in _img_cache:
        try: _img_cache[key] = Image.open(key).convert('RGBA')
        except Exception: _img_cache[key] = None
    return _img_cache[key]

def tint(im, col):
    """mirror isoForest.tinted: source-atop fill at alpha 0.88"""
    a = im.getchannel('A')
    solid = Image.new('RGB', im.size, col)
    blended = Image.blend(im.convert('RGB'), solid, 0.88)
    out = blended.convert('RGBA')
    out.putalpha(a)
    return out

def mulberry32(seed):
    a = seed & 0xFFFFFFFF
    def rnd():
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = a
        t = (t ^ (t >> 15)) * (1 | t) & 0xFFFFFFFF
        t = (t + (((t ^ (t >> 7)) * (61 | t) & 0xFFFFFFFF))) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296
    return rnd

def hash_str(s):
    h = 2166136261
    for ch in str(s):
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return h

GRASS = ['forest_moss_a.png', 'forest_moss_b.png', 'forest_moss_c.png']
GRASS_IMGS = [img(HS, g) for g in GRASS]
ROCK_TILE = img(HS, 'forest_rock_tile.png')
SHROOM_TILE = img(HS, 'forest_moss_shrooms.png')
TRAIL = img(HS, 'forest_trail.png')
WATER = [img(HS, 'forest_water_0.png'), img(HS, 'forest_water_1.png')]
STRUCT_DEFS = json.load(open(f'{HS}/structures.json'))['structures']

def struct_def(t):
    for s in STRUCT_DEFS:
        if s['id'] == t: return s
    return None

def in_zone(z, x, y):
    return z and z['x'] <= x < z['x'] + z['fw'] and z['y'] <= y < z['y'] + z['fh']

def round_rect(d, box, r, **kw):
    d.rounded_rectangle(box, radius=r, **kw)

def backdrop(im):
    """simplified paintBackdrop: canopy gradient + 3 hazed treeline rows."""
    d = ImageDraw.Draw(im)
    top = (0x16, 0x23, 0x0f); mid = (0x35, 0x51, 0x1f); low = (0x55, 0x74, 0x2f)
    horizon = isoY(0, 0) - 16
    for y in range(0, max(int(horizon) + 40, 10)):
        t = y / max(horizon + 40, 10)
        c = tuple(int(top[i] + (low[i] - top[i]) * min(1, t * 1.35)) for i in range(3))
        d.line([(0, y), (ART_W, y)], fill=c)
    ib = isoY(N - 1, N - 1) + 16
    for y in range(max(0, int(ib - 30)), ART_H):
        t = min(1, (y - (ib - 30)) / max(1, ART_H - ib + 30))
        c = (int(0x1d + (0x12 - 0x1d) * t), int(0x2a + (0x1a - 0x2a) * t), int(0x12 + (0x0b - 0x12) * t))
        d.line([(0, y), (ART_W, y)], fill=c)
    # treeline rows
    rows = [(horizon - 44, 0.34, '#1a2812', 0.94, 34), (horizon - 16, 0.52, '#223516', 0.95, 44), (horizon + 26, 0.74, '#2c4419', 1.0, 58)]
    for ri, (ry, sc, col, alpha, step) in enumerate(rows):
        rnd = mulberry32(101 + ri * 7)
        x = -60
        while x < ART_W + 120:
            f = ['px_conifer_a.png', 'px_conifer_b.png', 'px_pine_a.png', 'px_pine_b.png'][int(rnd() * 4) % 4]
            spr = img(HS, f)
            if spr:
                s2 = spr.resize((max(2, int(spr.width * sc)), max(2, int(spr.height * sc))), Image.LANCZOS)
                s2 = tint(s2, col)
                yy = ry + (rnd() - 0.5) * (10 + ri * 4)
                im.paste(s2, (int(x), int(yy - s2.height)), s2)
            x += step * (0.8 + rnd() * 0.5)

def draw_props_layer(im, props, shadows=True):
    """props: [{img, x, y, sc}] — shadows then sprites, depth-sorted."""
    layer = Image.new('RGBA', im.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ordered = sorted(props, key=lambda p: p['y'])
    if shadows:
        for p in ordered:
            spr = p['img']
            if spr and spr.height * p['sc'] > 26:
                w = spr.width * p['sc'] * 0.62
                h = w * 0.30
                cx, cy = p['x'], p['y'] + 2
                ld.ellipse((cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2), fill=(20, 16, 8, 110))
    for p in ordered:
        spr = p['img']
        if not spr: continue
        pw, ph = int(spr.width * p['sc']), int(spr.height * p['sc'])
        layer.paste(spr.resize((pw, ph), Image.LANCZOS) if (pw, ph) != spr.size else spr, (int(p['x'] - pw / 2), int(p['y'] - ph)), spr.resize((pw, ph), Image.LANCZOS) if (pw, ph) != spr.size else spr)
    im.alpha_composite(layer)

def render(kind, state, out_path, frame=0):
    seed = hash_str(state.get('owner') or state.get('name') or 'x')
    # ── placements from the real JS modules ──
    sf = '/tmp/pl_state.json'
    json.dump(state, open(sf, 'w'))
    raw = subprocess.run(['node', '/home/z/my-project/scripts/gen_placements.js', kind, state.get('owner') or state.get('name') or 'x', sf], capture_output=True, text=True)
    if raw.returncode != 0:
        print(raw.stderr); sys.exit(1)
    pl = json.loads(raw.stdout)

    im = Image.new('RGBA', (ART_W, ART_H))
    backdrop(im)
    d = ImageDraw.Draw(im)
    waterF = WATER[0] if frame % 4 < 2 else WATER[1]
    wildTile = {(t['x'], t['y']): t['tile'] for t in pl['wildTiles']}

    # ── terrain ──
    for x in range(-M, N + M):
        for y in range(-M, N + M):
            px, py = isoX(x, y), isoY(x, y)
            if px < -TW or px > ART_W + TW or py < -TH or py > ART_H + TH: continue
            r = mulberry32(seed + (x + 40) * 131 + (y + 40) * 17)()
            inside = 0 <= x < N and 0 <= y < N
            inFence = -P <= x <= N - 1 + P and -P <= y <= N - 1 + P
            if kind == 'base':
                LAYOUT = json.load(open('/tmp/layout.json')) if False else None
            tile = None
            if inside:
                if kind == 'base':
                    mines_zone = {'x': 1, 'y': 1, 'fw': 5, 'fh': 4} if False else BASE_LAYOUT_MINES
                    if in_zone(BASE_LAYOUT_MINES, x, y): tile = ROCK_TILE if r < 0.85 else GRASS_IMGS[2]
                    elif in_zone(BASE_LAYOUT_POND, x, y): tile = waterF if r < 0.92 else GRASS_IMGS[2]
                    elif (x, y) in BASE_PATHS: tile = TRAIL
                    else: tile = SHROOM_TILE if r < 0.07 else GRASS_IMGS[int(r * 3) % 3]
                else:
                    if (x, y) in GUILD_PLAZA: tile = ROCK_TILE
                    elif (x, y) in GUILD_PATHS: tile = TRAIL
                    else: tile = SHROOM_TILE if r < 0.07 else GRASS_IMGS[int(r * 3) % 3]
            elif inFence:
                tile = SHROOM_TILE if r < 0.04 else GRASS_IMGS[int(r * 3) % 3]
            else:
                wt = wildTile.get((x, y))
                if wt == 'water': tile = waterF
                elif wt: tile = img(HS, wt)
                else: tile = GRASS_IMGS[int(r * 3) % 3]
            if tile: im.paste(tile, (int(px - TW / 2), int(py - TH / 2)), tile)

    # gate trail
    if kind == 'base':
        trail_cells = [(5, y) for y in range(N, N - 1 + P + 1)] + [(5, N + P), (4, N + P + 1), (4, N + P + 2), (3, N + P + 3)]
    else:
        trail_cells = [(-P, 8), (-P - 1, 8), (-P - 2, 8), (-P - 3, 7), (-P - 4, 7)]
    for (tx, ty) in trail_cells:
        px, py = isoX(tx + 0.5, ty + 0.5), isoY(tx + 0.5, ty + 0.5)
        im.paste(TRAIL, (int(px - TW / 2), int(py - TH / 2)), TRAIL)

    # playable rim
    d.line([(isoX(0, N), isoY(0, N)), (isoX(N, N), isoY(N, N)), (isoX(N, 0), isoY(N, 0))], fill=(24, 32, 14, 56), width=3)

    # wild haze outside the fence diamond (evenodd via mask)
    haze = Image.new('L', im.size, 0)
    hd = ImageDraw.Draw(haze)
    hd.rectangle((-8, -8, ART_W + 16, ART_H + 16), fill=255)
    fpts = [(isoX(-P, -P), isoY(-P, -P)), (isoX(N + P, -P), isoY(N + P, -P)), (isoX(N + P, N + P), isoY(N + P, N + P)), (isoX(-P, N + P), isoY(-P, N + P))]
    hd.polygon(fpts, fill=0)
    haze = haze.filter(ImageFilter.GaussianBlur(1))
    for y0, y1, a in [(isoY(-P, -P) - 60, (isoY(-P, -P) + isoY(N + P, N + P)) / 2, 97), ((isoY(-P, -P) + isoY(N + P, N + P)) / 2, isoY(N + P, N + P) + 30, 112)]:
        grad = Image.new('L', im.size, 0)
        gd = ImageDraw.Draw(grad)
        for yy in range(max(0, int(y0)), min(ART_H, int(y1))):
            t = (yy - y0) / max(1, y1 - y0)
            gd.line([(0, yy), (ART_W, yy)], fill=int(a * (0.7 + 0.3 * t)))
        wash = Image.new('RGBA', im.size, (18, 28, 14, 0))
        wash.putalpha(Image.composite(grad, Image.new('L', im.size, 0), haze))
        im.alpha_composite(wash)

    # ── props (forest + outlands + garnish + fence) ──
    props = []
    for f in pl['forestProps'] + pl['outlandProps'] + pl.get('garnish', []):
        spr = img(HS, f['file'])
        if not spr: continue
        tintc = f.get('tint')
        if tintc:
            props.append({'img': tint(spr.resize((max(2, int(spr.width * f.get('sc', 1))), max(2, int(spr.height * f.get('sc', 1)))), Image.LANCZOS), tintc), 'x': f['x'], 'y': f['y'], 'sc': 1})
        else:
            props.append({'img': spr, 'x': f['x'], 'y': f['y'], 'sc': f.get('sc', 1)})
    for seg in pl['fence']:
        fim = img(HS, seg['file'])
        if fim: props.append({'img': fim, 'x': seg['x'], 'y': seg['y'], 'sc': 1})

    # ── structures ──
    drawn = []
    if kind == 'base':
        for st in state['structures']:
            sd = struct_def(st['type'])
            if not sd: continue
            lv = next((l for l in sd['levels'] if l['level'] == st['level']), sd['levels'][0])
            spr = img(HS, lv['sprite'] + '.png')
            if not spr: continue
            fw, fh = sd['fw'], sd['fh']
            cx = isoX(st['x'] + fw / 2, st['y'] + fh / 2)
            ay = isoY(st['x'] + fw, st['y'] + fh) + 4
            drawn.append({'depth': isoY(st['x'] + fw, st['y'] + fh) + 2, 'spr': spr, 'cx': cx, 'ay': ay, 'sc': 1.0, 'kind': 'struct'})
    else:
        for sid, sd in [('hall', None)] and [('hall', {'fw': 4, 'fh': 4, 'x': 6, 'y': 6, 'sprite': f"gb_castle_l{state['buildings'].get('hall', 1)}"}), ('training', {'fw': 3, 'fh': 3, 'x': 11, 'y': 2, 'sprite': f"gb_training_l{state['buildings'].get('training', 1)}", 'bias': -34}), ('treasury', {'fw': 2, 'fh': 2, 'x': 12, 'y': 12, 'sprite': f"gb_treasury_l{state['buildings'].get('treasury', 1)}", 'bias': -34})]:
            spr = img(GB, sd['sprite'] + '.png')
            if not spr: continue
            sc = 0.74 if sid != 'hall' else 1.0
            cx = isoX(sd['x'] + sd['fw'] / 2, sd['y'] + sd['fh'] / 2)
            ay = isoY(sd['x'] + sd['fw'], sd['y'] + sd['fh']) + 4 + sd.get('bias', 0)
            drawn.append({'depth': isoY(sd['x'] + sd['fw'], sd['y'] + sd['fh']) + 2, 'spr': spr, 'cx': cx, 'ay': ay, 'sc': sc, 'kind': 'struct'})
        # member cottages
        cspr = ['gb_cottage_a.png', 'gb_cottage_b.png', 'gb_cottage_c.png', 'gb_cottage_d.png']
        slots = [[6, 13], [9, 13], [5, 15], [8, 15], [14, 14]]
        for i in range(min(5, state.get('memberCount', 0))):
            cxx, cyy = slots[i]
            spr = img(GB, cspr[i % 4])
            if not spr: continue
            cx = isoX(cxx + 0.675, cyy + 0.675)
            ay = isoY(cxx + 1.35, cyy + 1.35) + 4
            drawn.append({'depth': isoY(cxx + 1.35, cyy + 1.35) + 2, 'spr': spr, 'cx': cx, 'ay': ay, 'sc': 1.0, 'kind': 'cottage'})

    # plots markers
    marker = img(HS, 'base_plot_marker.png')
    if marker:
        if kind == 'base':
            for plot in state.get('freePlots', []):
                c = isoX(plot['x'] + 1.5, plot['y'] + 1.5)
                props.append({'img': marker, 'x': c, 'y': isoY(plot['x'] + 1.5, plot['y'] + 1.5), 'sc': 1})
        else:
            for plot in [{'id': 1, 'x': 2, 'y': 2}, {'id': 2, 'x': 7, 'y': 1}, {'id': 3, 'x': 2, 'y': 12}, {'id': 4, 'x': 12, 'y': 7}]:
                c = isoX(plot['x'] + 1.5, plot['y'] + 1.5)
                props.append({'img': marker, 'x': c, 'y': isoY(plot['x'] + 1.5, plot['y'] + 1.5), 'sc': 1})

    # ── merged depth pass (game law): props depth = anchor y; structs =
    # footprint SOUTH CORNER + 2 (ties resolve prop-in-front) ──
    drawables = [{'kind': 'prop', 'depth': p['y'], **p} for p in props]
    for dd in drawn:
        drawables.append({'kind': dd['kind'], 'depth': dd['depth'], 'img': dd['spr'], 'x': dd['cx'], 'y': dd['ay'], 'sc': dd['sc']})
    # shadows first (floor level)
    sh = Image.new('RGBA', im.size, (0, 0, 0, 0))
    sd_ = ImageDraw.Draw(sh)
    for dd in sorted(drawables, key=lambda z: z['depth']):
        spr = dd['img']
        if not spr: continue
        hh = spr.height * dd['sc']
        if dd['kind'] == 'prop' and hh <= 26: continue
        w = spr.width * dd['sc'] * 0.62
        h2 = w * 0.28
        alpha = 90 if dd['kind'] == 'prop' else 130
        sd_.ellipse((dd['x'] - w / 2, dd['y'] + 2 - h2 / 2, dd['x'] + w / 2, dd['y'] + 2 + h2 / 2), fill=(18, 14, 6, alpha))
    im.alpha_composite(sh)
    # sprites in depth order
    layer = Image.new('RGBA', im.size, (0, 0, 0, 0))
    for dd in sorted(drawables, key=lambda z: z['depth']):
        spr = dd['img']
        if not spr: continue
        w, h = int(spr.width * dd['sc']), int(spr.height * dd['sc'])
        s2 = spr.resize((w, h), Image.LANCZOS) if (w, h) != spr.size else spr
        layer.paste(s2, (int(dd['x'] - w / 2), int(dd['y'] - h)), s2)
    im.alpha_composite(layer)

    # banner (guild, west road)
    if kind == 'guild':
        poleX = isoX(4.5, 9.5) + 18; poleBase = isoY(4.5, 9.5) + 8
        d.rectangle((poleX - 1.5, poleBase - 84, poleX + 1.5, poleBase), fill=(0x4a, 0x2d, 0x17))
        flagc = state.get('emblemColor') or '#a02c3c'
        frgb = tuple(int(flagc[i:i + 2], 16) for i in (1, 3, 5))
        d.polygon([(poleX + 1.5, poleBase - 83), (poleX + 40, poleBase - 77), (poleX + 38, poleBase - 63), (poleX + 1.5, poleBase - 69)], fill=frgb)

    # vignette
    vig = Image.new('L', im.size, 0)
    vd = ImageDraw.Draw(vig)
    for rr in range(900, 380, -14):
        a = int(107 * (1 - (rr - 380) / 520) ** 1.2)
        vd.ellipse((OX - rr, OY + 340 - rr * 0.72, OX + rr, OY + 340 + rr * 0.72), fill=a)
    dark = Image.new('RGBA', im.size, (20, 14, 6, 0))
    dark.putalpha(vig)
    im.alpha_composite(dark)

    # HUD plate
    hud = Image.new('RGBA', im.size, (0, 0, 0, 0))
    hd2 = ImageDraw.Draw(hud)
    Hh = 132; Wp = ART_W - 60; x0 = 30; y0 = ART_H - Hh - 22
    round_rect(hd2, (x0, y0, x0 + Wp, y0 + Hh), 14, fill=(24, 17, 10, 224))
    round_rect(hd2, (x0 + 4, y0 + 4, x0 + Wp - 4, y0 + Hh - 4), 10, outline=(166, 124, 46, 255), width=2)
    try:
        f_cinzel = ImageFont.truetype(f'{FONTS}/CinzelDecorative-Black.ttf', 25)
        f_med = ImageFont.truetype(f'{FONTS}/MedievalSharp.ttf', 15)
        f_cin = ImageFont.truetype(f'{FONTS}/Cinzel-Variable.ttf', 19)
    except Exception:
        f_cinzel = f_med = f_cin = ImageFont.load_default()
    if kind == 'base':
        hd2.text((x0 + 26, y0 + 26), str(state.get('owner', ''))[:22], font=f_cinzel, fill=(232, 213, 163))
        hd2.text((x0 + 26, y0 + 58), f"The base of {state.get('owner', '')}", font=f_med, fill=(156, 132, 85))
        hd2.text((x0 + Wp - 262, y0 + 28), str(len(state.get('structures', []))), font=f_cin, fill=(232, 213, 163), anchor='ma')
        hd2.text((x0 + Wp - 262, y0 + 54), 'STRUCTURES', font=f_med, fill=(156, 132, 85), anchor='mm')
        hd2.text((x0 + Wp - 90, y0 + 28), str(len(state.get('freePlots', []))), font=f_cin, fill=(232, 213, 163), anchor='ma')
        hd2.text((x0 + Wp - 90, y0 + 54), 'FREE PLOTS', font=f_med, fill=(156, 132, 85), anchor='mm')
        hd2.text((x0 + Wp / 2, y0 + Hh - 24), 'base build <type> [plot]  •  base upgrade  •  base house  •  base info', font=f_med, fill=(122, 102, 63), anchor='mm')
    else:
        hd2.text((x0 + 26, y0 + 22), f"★ {state.get('name', 'Guild')}"[:22], font=f_cinzel, fill=(232, 213, 163))
        hd2.text((x0 + 26, y0 + 56), f"{state.get('archetype', 'Adventurers')} Guild · Level {state.get('level', 1)}", font=f_med, fill=(156, 132, 85))
        hd2.text((x0 + Wp - 84, y0 + 26), f"{state.get('memberCount', 0)}", font=f_cin, fill=(232, 213, 163), anchor='ma')
        hd2.text((x0 + Wp - 84, y0 + 52), 'MEMBERS', font=f_med, fill=(156, 132, 85), anchor='mm')
        chips = [('CASTLE', state['buildings'].get('hall', 0)), ('TRAINING', state['buildings'].get('training', 0)), ('TREASURY', state['buildings'].get('treasury', 0))]
        chipX = x0 + Wp - 250
        for label, lvl in chips:
            built = lvl > 0
            round_rect(hd2, (chipX - 52, y0 + 22, chipX + 48, y0 + 62), 8, fill=(166, 124, 46, 64) if built else (90, 70, 40, 89))
            hd2.text((chipX - 2, y0 + 42), f"{label} L{lvl}" if built else f"{label} —", font=f_cin, fill=(232, 213, 163) if built else (122, 102, 63), anchor='mm')
            chipX -= 116
    im.alpha_composite(hud)

    im.convert('RGB').save(out_path, quality=90)
    print('saved', out_path, f"[biome: {pl['biome']}]")

# layout data (mirror of homestead LAYOUT / guild PATHS + PLAZA)
BASE_LAYOUT_MINES = {'x': 1, 'y': 1, 'fw': 5, 'fh': 4}
BASE_LAYOUT_POND = {'x': 11, 'y': 0, 'fw': 5, 'fh': 4}
BASE_PATHS = {(c[0], c[1]) for c in [
    [5, 8], [5, 9], [5, 10], [6, 10], [7, 10], [8, 10], [9, 10], [9, 9], [9, 8],
    [7, 3], [7, 4], [7, 5], [7, 6],
    [3, 3], [4, 3], [5, 3], [6, 3],
    [8, 3], [9, 3], [10, 3], [11, 3], [12, 3],
    [1, 9], [2, 9], [3, 9], [4, 9],
    [9, 11], [9, 12], [9, 13], [8, 14], [7, 14], [6, 14], [5, 14],
]}
GUILD_PATHS = {(c[0], c[1]) for c in [
    [0, 8], [1, 8], [2, 8], [3, 8], [4, 8],
    [5, 5], [6, 5], [7, 5], [8, 5], [9, 5],
    [5, 6], [5, 7], [5, 8], [5, 9],
    [10, 6], [10, 7], [10, 8], [10, 9],
    [5, 10], [6, 10], [7, 10], [8, 10], [9, 10], [10, 10],
    [11, 8], [12, 8],
    [8, 3], [8, 4], [9, 3], [10, 3], [11, 3],
    [7, 11], [7, 12], [6, 13],
]}
GUILD_PLAZA = GUILD_PATHS & {(x, y) for x in range(5, 11) for y in range(5, 11)} | {(5, 5), (6, 5), (7, 5), (8, 5), (9, 5), (5, 6), (5, 7), (5, 8), (5, 9), (10, 6), (10, 7), (10, 8), (10, 9)}

if __name__ == '__main__':
    which = sys.argv[1] if len(sys.argv) > 1 else 'all'
    base_state = {
        'owner': 'Aldric',
        'structures': [
            {'type': 'house', 'x': 6, 'y': 7, 'level': 2},
            {'type': 'mines', 'x': 1, 'y': 1, 'level': 2},
            {'type': 'pond', 'x': 12, 'y': 1, 'level': 2},
            {'type': 'blacksmith', 'x': 2, 'y': 6, 'level': 2},
            {'type': 'medbay', 'x': 12, 'y': 6, 'level': 2},
            {'type': 'alchemy', 'x': 8, 'y': 12, 'level': 3},
            {'type': 'hunting', 'x': 3, 'y': 8, 'level': 1},
        ],
        'freePlots': [{'id': 1, 'x': 12, 'y': 11}, {'id': 2, 'x': 3, 'y': 12}],
    }
    guild_state = {
        'name': 'Iron Vale',
        'archetype': 'Adventurers',
        'level': 7,
        'buildings': {'hall': 5, 'training': 3, 'treasury': 3},
        'memberCount': 5,
        'emblemColor': '#a02c3c',
    }
    if which in ('base', 'all'):
        render('base', dict(base_state, owner='Aldric'), f'{PREV}/r4_base_forest.jpg')
        render('base', dict(base_state, owner='Marina Waves'), f'{PREV}/r4_base_coast.jpg')
        render('base', dict(base_state, owner='Karguk'), f'{PREV}/r4_base_highlands.jpg')
        render('base', dict(base_state, owner='Elder Tim'), f'{PREV}/r4_base_ruins.jpg')
    if which in ('guild', 'all'):
        render('guild', guild_state, f'{PREV}/r4_guild_castle5.jpg')
