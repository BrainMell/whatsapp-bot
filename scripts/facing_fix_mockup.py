#!/usr/bin/env python3
"""1) Strip the ruins arch 24-rot sheet to find the SW-opening frame.
2) Mockup: castle f0 + village f28-mirrored + current f0, on iso tiles with shadows."""
from PIL import Image, ImageDraw, ImageOps

FOREST = "/home/z/my-project/download/assets/packs/mossyforest/sprite/1x/sun_fixed"

def strip24(path, out, scale=1):
    im = Image.open(path).convert("RGBA")
    W, H = im.size
    cols, rows = 8, 3
    cw, ch = W // cols, H // rows
    n = cols * rows
    pad = 6
    strip = Image.new("RGBA", (n * (cw * scale + pad) + pad, ch * scale + 24), (40, 40, 45, 255))
    d = ImageDraw.Draw(strip)
    x = pad
    for i in range(n):
        r, c = divmod(i, cols)
        cell = im.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
        b = cell.getbbox()
        if b:
            cell = cell.crop(b)
        if scale != 1:
            cell = cell.resize((cell.width * scale, cell.height * scale), Image.NEAREST)
        strip.paste(cell, (x, 20), cell)
        if i % 2 == 0:
            d.text((x + 2, 4), str(i), fill=(255, 255, 0, 255))
        x += cw * scale + pad
    strip.save(out)
    print("saved", out, "cell", cw, ch)

strip24(f"{FOREST}/ruins_stone_arch_128_1x_24rot.png",
        "/home/z/my-project/download/assets/previews/r4proof/arch_24rot.png")

# ── mockup comparison on iso tiles ─────────────────────────────────────────
V = "/home/z/my-project/download/assets/packs/village/sprite/128sun"
C = "/home/z/my-project/download/assets/packs/castles/sprite/128sun"

def frame(path, idx, cols=8, rows=4):
    im = Image.open(path).convert("RGBA")
    W, H = im.size
    cw, ch = W // cols, H // rows
    r, c = divmod(idx, cols)
    f = im.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
    b = f.getbbox()
    return f.crop(b) if b else f

def diamond_tile(w=220):
    """grass diamond tile 2:1 with NW-lit bevel: light top-left edges."""
    tw, th = w, w // 2
    im = Image.new("RGBA", (tw + 4, th + 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pts = [(tw // 2 + 2, 2), (tw + 2, th // 2 + 2), (tw // 2 + 2, th + 2), (2, th // 2 + 2)]
    d.polygon(pts, fill=(92, 122, 74, 255), outline=(140, 168, 110, 255))
    return im

def with_shadow(spr, tile_w=220):
    """place sprite on tile with a down-right cast shadow (env law)."""
    tw, th = tile_w, tile_w // 2
    H = spr.height + th + 40
    W = max(tile_w, spr.width) + 80
    cv = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cv.paste(diamond_tile(tile_w), ((W - tile_w) // 2, H - th - 30), diamond_tile(tile_w))
    # shadow: squashed dark silhouette marching down-right
    sh = ImageOps.solid(spr.getImage if False else spr, None) if False else None
    sil = Image.new("RGBA", spr.size, (0, 0, 0, 0))
    alpha = spr.getchannel("A").point(lambda a: min(a, 110))
    sil.putalpha(alpha)
    dark = Image.new("RGBA", spr.size, (16, 10, 6, 255))
    dark.putalpha(alpha)
    sq = dark.resize((spr.width, max(1, spr.height // 2)))
    for mult, a in [(0.12, 120), (0.4, 80), (0.75, 50)]:
        t = int(spr.height * 0.5 * mult)
        cv.paste(sq, (W // 2 - sq.width // 2 + t, H - 30 - sq.height + t // 2), sq)
    ax, ay = W // 2, H - 30
    cv.paste(spr, (ax - spr.width // 2, ay - spr.height), spr)
    return cv

castle_f8 = frame(f"{C}/8_forest_duchy_nopalette.png", 8)
castle_f0 = frame(f"{C}/8_forest_duchy_nopalette.png", 0)
gate_f0 = frame(f"{V}/1x1_gatehouse_24bit.png", 0)
gate_f28m = ImageOps.mirror(frame(f"{V}/1x1_gatehouse_24bit.png", 28))
cottage_f0 = frame(f"{V}/1x1_thatched_cottage_24bit.png", 0)
cottage_f28m = ImageOps.mirror(frame(f"{V}/1x1_thatched_cottage_24bit.png", 28))

def scale_to(im, w):
    sc = w / im.width
    return im.resize((w, int(im.height * sc)), Image.LANCZOS)

panels = [
    ("castle f8 (CURRENT)", scale_to(castle_f8, 300)),
    ("castle f0 (FIX)", scale_to(castle_f0, 300)),
    ("gate f0 (CURRENT)", scale_to(gate_f0, 190)),
    ("gate f28mir (FIX)", scale_to(gate_f28m, 190)),
    ("cottage f0 (CURRENT)", scale_to(cottage_f0, 190)),
    ("cottage f28mir (FIX)", scale_to(cottage_f28m, 190)),
]
pad = 14
H = max(p.height for _, p in panels) + 60
W = sum(p.width for _, p in panels) + pad * (len(panels) + 1)
cv = Image.new("RGBA", (W, H), (44, 48, 42, 255))
d = ImageDraw.Draw(cv)
x = pad
for label, p in panels:
    tile = with_shadow(p, tile_w=p.width + 10)
    cv.paste(tile, (x, 40), tile)
    d.text((x, 8), label, fill=(255, 240, 160, 255))
    x += p.width + pad
cv.convert("RGB").save("/home/z/my-project/download/assets/previews/r4proof/facing_fix_mockup.jpg", quality=92)
print("saved mockup")
