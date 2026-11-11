#!/usr/bin/env python3
"""Score + sound design for the Aldafold intro. Only CC0 samples (core/rpgasset/intro/audio_src) + synthesis. usage: build_aldafold_audio.py out.wav"""
import sys, os, json, subprocess, numpy as np
from scipy import signal
SR = 44100
SRC = os.path.join(os.path.dirname(__file__), '..', 'core', 'rpgasset', 'intro', 'audio_src')
TL = json.loads(subprocess.check_output(['node', '-e', "console.log(JSON.stringify(require('./core/rpg/systems/intro/aldafold/timeline.js')))"], cwd=os.path.join(os.path.dirname(__file__), '..')))
M, S, DUR = TL['moments'], TL['scenes'], TL['DURATION']
N = int((DUR + 4) * SR); rng = np.random.default_rng(7)
def load(name):
    p = next(os.path.join(SRC, name + e) for e in ('.flac', '.ogg') if os.path.exists(os.path.join(SRC, name + e)))
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', p, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'])
    return np.frombuffer(raw, np.float32).reshape(-1, 2).T.copy()
def pitch(x, semis):                                   # resample pitch shift (changes length)
    r = 2 ** (semis / 12.0); from fractions import Fraction
    f = Fraction(r).limit_denominator(200); return np.stack([signal.resample_poly(c, f.denominator, f.numerator) for c in x]).astype(np.float32)
def norm(x, peak=1.0): return x / (np.abs(x).max() + 1e-9) * peak
def env(n, a, r, curve=2.0):
    e = np.ones(n); na, nr = int(a * SR), int(r * SR)
    if na: e[:na] = np.linspace(0, 1, na) ** curve
    if nr: e[-nr:] *= np.linspace(1, 0, nr) ** curve
    return e
def lp(x, fc, order=2): b, a = signal.butter(order, fc / (SR / 2), 'low'); return signal.lfilter(b, a, x, axis=-1)
def hp(x, fc, order=2): b, a = signal.butter(order, fc / (SR / 2), 'high'); return signal.lfilter(b, a, x, axis=-1)
def bp(x, lo, hi): b, a = signal.butter(2, [lo / (SR / 2), hi / (SR / 2)], 'band'); return signal.lfilter(b, a, x, axis=-1)
def ir(sec, tilt=3500, seed=1):                        # synthetic hall impulse response
    r = np.random.default_rng(seed); n = int(sec * SR); t = np.arange(n) / SR
    out = []
    for _ in range(2):
        h = r.standard_normal(n) * np.exp(-t * (6.9 / sec)); h = lp(h, tilt, 1); out.append(h * np.linspace(1, 1, n))
    h = np.stack(out); h[:, :int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR)); return h / np.sqrt((h ** 2).sum())
def reverb(x, sec=3.5, wet=0.4, tilt=3500, seed=1):
    h = ir(sec, tilt, seed); w = np.stack([signal.fftconvolve(x[i], h[i])[:x.shape[1] + h.shape[1] - 1] for i in range(2)])
    w *= np.abs(x).max() / (np.abs(w).max() + 1e-9) * 1.6; out = np.zeros((2, max(x.shape[1], w.shape[1]))); out[:, :x.shape[1]] += x * (1 - wet); out[:, :w.shape[1]] += w * wet; return out
bus = {k: np.zeros((2, N), np.float32) for k in ['amb', 'pad', 'choir', 'perc', 'fx', 'hit']}
def put(b, x, t, g=1.0, pan=0.0):
    i = int(t * SR); 
    if i < 0: x = x[:, -i:]; i = 0
    n = min(x.shape[1], N - i)
    if n <= 0: return
    L, R = (1 - max(0, pan)) * g, (1 + min(0, pan)) * g; bus[b][0, i:i + n] += x[0, :n] * L; bus[b][1, i:i + n] += x[1, :n] * R
def mono2(x, w=0.0): d = int(0.012 * SR); return np.stack([x, np.concatenate([np.zeros(d), x[:-d]]) if w else x])
def fade_env(points, n=N):                             # piecewise-linear gain curve [(t,g),...]
    t = np.arange(n) / SR; return np.interp(t, [p[0] for p in points], [p[1] for p in points])
midi = lambda m: 440 * 2 ** ((m - 69) / 12)
def saw_pad(freqs, dur, detune=0.012, voices=3, cutoff=1400, seed=0):
    r = np.random.default_rng(seed); n = int(dur * SR); t = np.arange(n) / SR; out = np.zeros((2, n))
    for f in freqs:
        for v in range(voices):
            fd = f * (1 + detune * (v - (voices - 1) / 2) / max(1, voices - 1) * 2); ph = r.random()
            s = signal.sawtooth(2 * np.pi * (fd * t + ph)) * (0.6 + 0.4 * np.sin(2 * np.pi * (0.1 + 0.05 * v) * t + r.random() * 6))
            pn = (v / max(1, voices - 1)) * 2 - 1; out[0] += s * (1 - max(0, pn)) / voices; out[1] += s * (1 + min(0, pn)) / voices
    return lp(out, cutoff, 2) / len(freqs)
def noise(dur, seed=3): return np.random.default_rng(seed).standard_normal(int(dur * SR))

# ---------- samples ----------
choir = load('ambi_choir'); drone = load('ambi_drone'); haunted = load('ambi_haunted_hum'); lunar = load('ambi_lunar_land'); glass = load('ambi_glass_hum'); dwoosh = load('ambi_dark_woosh'); swoosh = load('ambi_swoosh')
cine = load('misc_cineboom'); boom = load('bd_boom'); crow = load('misc_crow'); bell = load('perc_bell'); bell2 = load('perc_bell2'); imp1 = load('perc_impact1'); imp2 = load('perc_impact2')
tomlo = load('drum_tom_lo_hard'); tommid = load('drum_tom_mid_hard'); kick = load('drum_heavy_kick'); cymb = load('drum_cymbal_open'); roll = load('drum_roll'); splash = load('drum_splash_hard'); gdrone = load('loop_drone_g_97')
slice1 = load('knifeSlice'); slice2 = load('knifeSlice2'); draw2 = load('drawKnife2'); latch = load('metalLatch'); pot1 = load('metalPot1'); pot3 = load('metalPot3'); cloth1 = load('cloth1'); cloth3 = load('cloth3')
def loop_fill(x, dur, xf=2.0):                       # crossfaded loop to fill `dur` seconds
    n = int(dur * SR); xfn = int(xf * SR); out = np.zeros((2, n)); pos = 0; first = True
    while pos < n:
        seg = x.copy(); L = seg.shape[1]; 
        if not first: seg[:, :xfn] *= np.linspace(0, 1, xfn)
        seg[:, -xfn:] *= np.linspace(1, 0, xfn); m = min(L, n - pos); out[:, pos:pos + m] += seg[:, :m]; pos += L - xfn; first = False
    return out

# ---------- AMBIENCE: drone bed + wind + fire + crows ----------
d = loop_fill(pitch(gdrone, -7), DUR + 3); d = reverb(d, 4.0, 0.35)[:, :N]; d = np.pad(d, ((0, 0), (0, max(0, N - d.shape[1]))))
tension = fade_env([(0, 0), (1.5, 0.12), (7, 0.22), (8.5, 0.5), (16, 0.45), (22, 0.3), (24, 0.2), (36, 0.7), (51, 0.7), (53, 0.1), (62, 0.14), (68, 0.45), (75, 0.6), (77, 0.9), (86, 0.9), (88, 0.3), (97, 0.14)])
bus['amb'] += d * tension * 0.9
hh = loop_fill(pitch(haunted, -5), DUR + 3); hh = reverb(hh, 3.0, 0.4)[:, :N]; bus['amb'][:, :hh.shape[1]] += np.pad(hh, ((0, 0), (0, max(0, N - hh.shape[1]))))[:, :N] * fade_env([(0, 0), (4, 0.0), (8, 0.35), (22, 0.3), (24, 0.05), (62, 0.05), (66, 0.35), (75, 0.4), (78, 0.1)])
wind = bp(noise(DUR + 4, 11), 180, 900); wind = mono2(wind * (0.5 + 0.5 * np.sin(2 * np.pi * np.arange(wind.size) / SR * 0.11))); wind = np.pad(wind, ((0, 0), (0, max(0, N - wind.shape[1]))))[:, :N]
bus['amb'] += wind * fade_env([(0, 0), (2, 0.05), (8, 0.08), (22, 0.1), (24, 0.02), (36, 0.03), (50, 0.04), (52, 0), (62, 0), (64, 0.1), (75, 0.14), (78, 0.0)]) * 0.35
fire = hp(noise(DUR + 4, 12), 1800) * (rng.random(int((DUR + 4) * SR)) > 0.9992) * 6; fire = lp(np.convolve(fire, np.exp(-np.arange(400) / 60.0), 'same'), 5000, 1); fire = mono2(fire); fire = np.pad(fire, ((0, 0), (0, max(0, N - fire.shape[1]))))[:, :N]
bus['amb'] += fire * fade_env([(9, 0), (11.5, 0.7), (18, 0.7), (21.5, 0.2), (23, 0)]) * 0.5
for tc, g, p in [(12.3, 0.7, -0.4), (14.1, 0.55, 0.5), (19.4, 0.5, 0.2)]: put('amb', reverb(pitch(crow, -2), 2.0, 0.4), tc, g, p)

# ---------- PADS: strings/brass-ish chords following the story ----------
def chord(notes, t, dur, g=0.5, cutoff=1500, voices=3, fade_in=2.0, fade_out=2.5, seed=0):
    x = saw_pad([midi(m) for m in notes], dur, 0.01, voices, cutoff, seed) * env(int(dur * SR), fade_in, fade_out, 1.5); x = reverb(x, 3.2, 0.4, 3000, seed + 1); put('pad', x, t, g)
D2, A2, D3, F3, A3, D4, Bb2, Bb3, G2, G3, E3, C3, C4, E4, F4, G4, A4 = 38, 45, 50, 53, 57, 62, 34, 46, 43, 55, 52, 48, 60, 64, 65, 67, 69
chord([D2, A2, D3], 1.0, 8.0, 0.55, 700, 3, 3.0, 2.0, 1)                                         # opening dread
chord([D2, A2, F3, A3], 8.0, 8.0, 0.8, 1500, 4, 0.8, 2.0, 2)                                      # chaos arrives
chord([Bb2, F3, Bb3, D4], 15.5, 8.0, 0.75, 1300, 4, 1.5, 2.5, 3)                                  # ruin
chord([D3, A3, D4, F4 + 1], 23.5, 6.0, 0.6, 1800, 4, 3.0, 1.0, 4)                                 # Order: major lift
chord([D3, A3, D4, F4 + 1, A4], 28.0, 9.0, 0.85, 2600, 5, 0.3, 3.0, 5)                            # blessing bloom
chord([D2, A2, D3, F3, A3], 36.0, 5.5, 1.25, 2000, 5, 0.6, 0.5, 6); chord([Bb2, F3, Bb3, D4], 41.2, 5.0, 0.85, 1800, 4, 0.4, 0.4, 7)
chord([G2, D3, G3, Bb3], 46.0, 3.0, 0.9, 2000, 4, 0.3, 0.3, 8); chord([A2, E3, A3, C4 + 1, E4], 48.8, 3.6, 0.95, 2400, 5, 0.3, 1.0, 9)  # swell into the cliff
chord([D2, A2], 52.0, 11.0, 0.28, 500, 2, 3.0, 3.0, 10)                                           # the question: hollow
chord([Bb2, F3, Bb3], 63.5, 6.0, 0.7, 900, 3, 2.5, 1.5, 11); chord([G2, D3, Bb3], 69.0, 7.0, 0.85, 1100, 3, 1.5, 1.5, 12)          # fate: brooding
chord([D2, A2, D3, F3], 76.0, 4.0, 1.0, 2200, 5, 0.6, 0.2, 13); chord([Bb2, F3, Bb3, D4], 80.0, 2.0, 1.0, 2400, 5, 0.1, 0.2, 14); chord([G2, D3, G3, Bb3, D4], 82.0, 2.4, 1.0, 2600, 5, 0.1, 0.2, 15); chord([A2, E3, A3, C4 + 1, E4], 84.4, 2.0, 1.1, 3000, 5, 0.1, 0.4, 16)
chord([D2, A2, D3, F3 + 1, A3, D4], 86.3, 10.0, 1.0, 3200, 5, 0.2, 5.0, 17)                       # resolution under the logo (D major)

# ---------- CHOIR (CC0 sample, pitched onto chord tones) ----------
def choir_at(t, semis, g, dur=None, rev=5.0, wet=0.6):
    x = pitch(choir, semis); 
    if dur: x = x[:, :int(dur * SR)] * env(min(x.shape[1], int(dur * SR)), 0.8, 1.5, 1.5)
    put('choir', reverb(x, rev, wet, 3500, 5), t, g)
for t, st, g in [(24.2, 0, 0.5), (26.5, 7, 0.5), (28.0, 0, 0.9), (29.4, 12, 0.7), (31.0, 4, 0.6), (33.0, 7, 0.55)]: choir_at(t, st, g)
for t, st, g in [(36.4, -5, 0.8), (38.6, -7, 0.7), (41.2, -5, 0.4), (44.0, -7, 0.5), (48.8, -3, 0.6)]: choir_at(t, st, g)
for t, st, g in [(76.4, -7, 0.65), (79.0, -5, 0.7), (81.7, -3, 0.75), (84.2, 0, 0.9), (86.4, 0, 1.0), (89.5, 7, 0.65)]: choir_at(t, st, g)
choir_at(65.0, -12, 0.35); choir_at(69.5, -10, 0.4)

# ---------- PERCUSSION: timpani/taiko build ----------
tim = reverb(pitch(tomlo, -9), 2.8, 0.45, 2500, 7); bd = reverb(boom, 2.5, 0.4, 2500, 8)
for i, t in enumerate(np.arange(38.0, 51.4, 1.0)): put('perc', tim, float(t), 0.55 + 0.05 * i, -0.1); put('perc', tim, float(t) + 0.5, 0.3 + 0.03 * i, 0.1) if t > 45 else None
for t in np.arange(44.0, 51.4, 0.25): put('perc', pitch(tommid, -8)[:, :int(0.5 * SR)], float(t), 0.12 + 0.012 * (t - 44), 0.2)
for t in [52.4 + 3.0 * k for k in range(0)]: pass
for i in range(24): put('perc', reverb(pitch(tomlo, -14)[:, :int(1.2 * SR)], 2.0, 0.4), 52.0 + i * (0.95 - i * 0.012), 0.10 + 0.012 * i)  # question heartbeat (accelerating)
for i in range(18): put('perc', tim, 76.0 + i * 0.5, 0.75, 0.0); put('perc', pitch(tommid, -8)[:, :int(0.4 * SR)], 76.0 + i * 0.5 + 0.25, 0.35, 0.2)
put('perc', tim, 86.3, 1.0)

# ---------- HITS & TRANSITIONS ----------
def cine_hit(t, semis=0, g=1.0, rev=4.0): put('hit', reverb(pitch(cine, semis), rev, 0.35, 3000, 9), t, g)
cine_hit(M['chaosArrive'], -3, 1.0); put('hit', bd, M['chaosArrive'], 0.9)
put('fx', reverb(pitch(dwoosh, -4), 2.5, 0.35), M['chaosArrive'] - 1.6, 0.9)
for k, tt in enumerate([M['collapseStart'] + 0.3, M['collapseStart'] + 1.0, M['collapseStart'] + 1.8]): put('fx', lp(mono2(noise(1.6, 20 + k) * env(int(1.6 * SR), 0.15, 1.2, 1.5)) * 0.9, 380), tt, 0.7)   # rumble
cine_hit(M['collapseImpact'], -7, 1.0, 5.0); put('hit', reverb(pitch(boom, -5), 3.5, 0.4), M['collapseImpact'], 1.0); put('hit', reverb(lp(imp2, 3000), 2.0, 0.3), M['collapseImpact'] + 0.1, 0.8)
put('fx', reverb(pitch(swoosh, -6), 2.5, 0.4), 21.4, 0.7)
# Order: shimmering glass hum swell + bell + impact
put('fx', reverb(pitch(glass, 5), 4.0, 0.5), M['orderSigil'] - 0.4, 0.8); put('fx', reverb(pitch(glass, 12), 4.0, 0.5, 4000, 3), M['orderSigil'] + 2.6, 0.55)
put('fx', reverb(pitch(bell, 0), 5.0, 0.6, 5000), M['orderSigil'], 0.7); put('fx', reverb(pitch(bell2, 7), 5.0, 0.6, 5000), M['orderSigil'] + 1.6, 0.5)
rise = bp(noise(4.0, 31), 600, 7000); rise = mono2(rise * env(int(4.0 * SR), 3.8, 0.05, 2.2)) * 0.6; put('fx', rise, M['blessing'] - 3.9, 0.6)
cine_hit(M['blessing'], 0, 1.0, 5.5); put('hit', reverb(splash, 3.0, 0.4), M['blessing'], 0.7); put('fx', reverb(pitch(glass, 12), 5.0, 0.6, 5000), M['blessing'], 0.9)
# Warriors: steel + cloth (low), unison step
for k, (tt, smp) in enumerate([(37.4, draw2), (38.1, cloth1), (38.9, latch), (39.6, cloth3), (40.2, draw2)]): put('fx', reverb(smp, 1.8, 0.25), tt, 0.35, (k - 2) * 0.25)
put('hit', reverb(pitch(pot1, -6), 2.5, 0.4), M['unison'], 0.9); put('hit', bd, M['unison'], 0.85); put('hit', reverb(slice1, 1.2, 0.2), M['unison'] + 0.05, 0.6)
put('fx', reverb(glass, 3.0, 0.5, 4000, 4), M['orb'], 0.6)
for tt in [44.2, 45.6, 47.0, 48.2, 49.4]: put('fx', reverb(slice2, 1.2, 0.2), tt, 0.28, rng.uniform(-0.5, 0.5)); put('fx', reverb(pitch(pot3, -2), 1.2, 0.2), tt + 0.18, 0.2, rng.uniform(-0.5, 0.5))
rise2 = bp(noise(3.4, 32), 400, 6000); put('fx', mono2(rise2 * env(int(3.4 * SR), 3.2, 0.05, 2.0)) * 0.5, 48.2, 0.6)
cine_hit(51.4, -2, 0.7)
# Question: bells, the "wrong" low swell
put('fx', reverb(pitch(bell, -12), 7.0, 0.7, 3500), M['bell1'], 0.95); put('fx', reverb(pitch(bell, -12), 7.0, 0.7, 3500), M['question'], 1.0); put('fx', reverb(pitch(bell2, -14), 7.0, 0.7, 3500), M['bell2'], 0.9)
put('hit', reverb(pitch(cine, -9), 5.0, 0.4), M['question'], 0.75); put('fx', reverb(pitch(dwoosh, -10), 4.0, 0.4), M['question'] - 2.5, 0.8)
put('fx', reverb(pitch(lunar, -7), 4.0, 0.5), 54.5, 0.6)
# Fate: low brass-ish swell, lightning, eyes
sub = np.sin(2 * np.pi * midi(26) * np.arange(int(9 * SR)) / SR) * env(int(9 * SR), 6, 2, 1.5); put('fx', mono2(sub) * 0.7, 66.5, 0.9)
bz = saw_pad([midi(26), midi(33), midi(38)], 9.0, 0.014, 3, 360) * env(int(9 * SR), 6, 2, 2.0); put('pad', reverb(bz, 3.0, 0.4), 66.0, 1.1)
lc = hp(noise(0.5, 41), 1500) * env(int(0.5 * SR), 0.002, 0.45, 3.0); put('fx', reverb(mono2(lc) * 1.4, 2.5, 0.35), M['lightning'], 0.8); put('fx', reverb(lp(imp1, 1500), 2.5, 0.4), M['lightning'] + 0.06, 0.8)
put('fx', mono2(lp(noise(0.6, 42), 200) * env(int(0.6 * SR), 0.005, 0.5, 2) * 1.4), M['lightning'] + 0.4, 1.0)
cine_hit(M['eyes'], -8, 1.0, 6.0); put('hit', reverb(pitch(boom, -9), 4.0, 0.4), M['eyes'], 0.95)
put('fx', reverb(pitch(dwoosh, -12), 3.0, 0.4), M['eyes'] - 1.8, 0.9)
# Final: massive riser, hits on each shout, silence-before-the-flash then boom
rise3 = bp(noise(9.0, 33), 300, 9000); rise3 = mono2(rise3 * env(int(9.0 * SR), 8.6, 0.05, 2.4)) * 0.8; put('fx', rise3, 77.0, 0.7)
rv = pitch(cymb, -2)[:, ::-1].copy(); put('fx', reverb(rv, 2.0, 0.3), 86.3 - rv.shape[1] / SR, 0.9)
cine_hit(M['shout1'], -4, 0.95); put('hit', bd, M['shout1'], 0.9); cine_hit(M['shout2'], -2, 1.0); put('hit', bd, M['shout2'], 1.0)
put('hit', np.zeros((2, 10)), 85.9, 0)                                                                              # (breath: mix ducks to silence just before the flash — see master)
cine_hit(M['flash'], 0, 1.0, 6.0); put('hit', reverb(pitch(boom, -3), 4.0, 0.4), M['flash'], 1.0); put('hit', reverb(splash, 4.0, 0.5), M['flash'], 0.8)
put('fx', reverb(pitch(bell, -5), 8.0, 0.7, 5000), M['logo'], 0.95); put('fx', reverb(pitch(bell2, 2), 8.0, 0.7, 5000), M['logo'] + 0.8, 0.6); put('fx', reverb(pitch(glass, 12), 6.0, 0.6, 5000), M['logo'] + 0.3, 0.8)
put('fx', reverb(pitch(glass, 19), 6.0, 0.6, 6000, 6), M['logo'] + 2.4, 0.5)

# ---------- MIX ----------
gains = {'amb': 0.85, 'pad': 0.62, 'choir': 0.7, 'perc': 0.85, 'fx': 0.85, 'hit': 0.95}
mix = sum(bus[k] * gains[k] for k in bus)
duck = fade_env([(0, 1), (85.55, 1), (86.0, 0.15), (86.28, 0.15), (86.34, 1)])                                 # breath of near-silence before the flash
mix = mix * duck
# gentle bus processing: warmth lowpass, soft clip, loudness target
mix = lp(mix, 15000, 1); mix = np.tanh(mix * 1.25) / np.tanh(1.25)
mix *= fade_env([(0, 0), (1.0, 1), (DUR - 2.5, 1), (DUR, 0)])
mix = mix[:, :int(DUR * SR)]
rms = np.sqrt((mix ** 2).mean()); mix *= (0.12 / rms)                                                           # ~ -18 dBFS RMS: cinematic, not blasting
pk = np.abs(mix).max(); mix = mix / pk * 0.89 if pk > 0.89 else mix
out = sys.argv[1]; import wave
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix.T * 32767).astype('<i2').tobytes())
print('audio ok', out, round(mix.shape[1] / SR, 1), 's rms', round(float(np.sqrt((mix ** 2).mean())), 4), 'peak', round(float(np.abs(mix).max()), 3))
