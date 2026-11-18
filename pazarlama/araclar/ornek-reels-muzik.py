# Örnek reels için kendi ürettiğimiz telifsiz müzik + kesmelere senkron efektler.
# Kullanım: python3 ornek-reels-muzik.py <olaylar.json> <çıktı.wav>
import json, sys, wave, numpy as np

SR = 44100; FPS = 30; rng = np.random.default_rng(11)
def tt(n): return np.arange(n) / SR
def env(n, a=0.005, d=0.2):
    t = tt(n); e = np.exp(-t / d); k = int(a * SR)
    if k: e[:k] *= np.linspace(0, 1, k)
    return e
def noise(n): return rng.standard_normal(n)
def filt(x, lo=None, hi=None):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    if hi: X *= 1 / (1 + (f / hi) ** 4)
    if lo: X *= 1 / (1 + (lo / np.maximum(f, 1)) ** 4)
    return np.fft.irfft(X, len(x))
def mtof(m): return 440 * 2 ** ((m - 69) / 12)
def add(buf, x, at, g=1.0):
    i = int(at * SR)
    if i < 0: x = x[-i:]; i = 0
    if i >= len(buf): return
    x = x[:len(buf) - i]; buf[i:i + len(x)] += x * g

def kick():
    n = int(0.5 * SR); t = tt(n); f = 42 + 130 * np.exp(-t / 0.03)
    return np.tanh(1.6 * np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.2)) + 0.3 * noise(n) * env(n, 0, 0.003)
def hat(o=False):
    n = int((0.22 if o else 0.05) * SR); return filt(noise(n), lo=7500) * env(n, 0.001, 0.08 if o else 0.015) * 0.45
def clap():
    n = int(0.32 * SR); x = filt(noise(n), 900, 5200); e = env(n, 0.001, 0.13)
    for d in (0.0, 0.012, 0.024): k = int(d * SR); e[k:k + 90] += 0.7
    return x * e * 0.6
def saw(freq, n, harm=14):
    t = tt(n); return sum(np.sin(2 * np.pi * freq * k * t) / k * (0.86 ** k) for k in range(1, harm))
def pad(notes, dur, bright=1.0):
    n = int(dur * SR); x = np.zeros(n)
    for m in notes:
        for det in (-0.1, 0.1): x += saw(mtof(m + det), n, int(6 + 6 * bright))
    e = np.minimum(1, tt(n) / 0.3) * np.minimum(1, (dur - tt(n)) / 0.35); return x * e / len(notes) * 0.32
def sub(m, dur):
    n = int(dur * SR); f = mtof(m); t = tt(n)
    return np.tanh(1.4 * (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t))) * env(n, 0.004, dur * 0.85) * 0.6
def stab(notes, dur=0.22):
    n = int(dur * SR); x = sum(saw(mtof(m), n, 10) for m in notes) / len(notes)
    return filt(x, hi=3500) * env(n, 0.002, 0.09) * 0.5
def bell(m, dur=1.0):
    n = int(dur * SR); f = mtof(m); t = tt(n)
    return (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / 0.15)) * env(n, 0.002, 0.35) * 0.3
def whoosh(dur=0.4, up=True):
    n = int(dur * SR); x = noise(n); out = np.zeros(n); seg = 10
    for s in range(seg):
        a, b = s * n // seg, (s + 1) * n // seg; c = 500 + 6000 * ((s / seg) if up else (1 - s / seg))
        out[a:b] = filt(x, c * 0.5, c * 1.6)[a:b]
    return out * np.sin(np.pi * tt(n) / dur) ** 1.5 * 0.6
def tick():
    n = int(0.05 * SR); return np.sin(2 * np.pi * 1700 * tt(n)) * env(n, 0.0005, 0.008) * 0.35
def riser(dur):
    n = int(dur * SR); t = tt(n) / dur; out = np.zeros(n); seg = 14; x = noise(n)
    for s in range(seg):
        a, b = s * n // seg, (s + 1) * n // seg; c = 300 + 7000 * (s / seg) ** 2; out[a:b] = filt(x, c * 0.6, c * 1.5)[a:b]
    return out * t ** 2 * 0.45
def impact():
    n = int(1.6 * SR); t = tt(n); f = 34 + 70 * np.exp(-t / 0.09)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.5) + filt(noise(n), hi=2500) * env(n, 0.001, 0.14) * 0.4
def swipe():  # önce/sonra süpürme sesi
    return whoosh(1.1, up=True) * 0.8

def build(evp, out):
    ev = json.load(open(evp)); dur = ev['n'] / FPS; L = int((dur + 0.2) * SR)
    mus = np.zeros(L); sfx = np.zeros(L); duck = np.ones(L)
    drop = ev['drop'] / FPS; brk = ev['q'] / FPS - 0.2; endt = ev['end'] / FPS
    beat = 0.5; bar = 2.0
    prog = [(50, [62, 65, 69]), (46, [62, 65, 70]), (53, [60, 65, 69]), (48, [60, 64, 67])]  # Dm Bb F C
    # kanca: koyu pad + yükselen gerilim
    add(mus, pad([50, 57, 62, 65], drop + 0.3, 0.5), 0, 0.55); add(sfx, riser(drop), 0, 0.9)
    for f in ev['word']: add(sfx, tick(), f / FPS, 0.7)
    K, Hc, Ho, C = kick(), hat(), hat(True), clap()
    t = drop; b = 0
    while t < endt - 0.05:
        root, ch = prog[(b // 4) % 4]; inbrk = brk <= t < endt
        if b % 4 == 0: add(mus, pad(ch, bar + 0.05, 0.4 if inbrk else 1.0), t, 0.5 if inbrk else 0.42)
        if not inbrk:
            add(mus, K, t, 0.95); k = int(t * SR); m = int(0.24 * SR)
            duck[k:k + m] = np.minimum(duck[k:k + m], 0.3 + 0.7 * np.linspace(0, 1, len(duck[k:k + m])))
            if b % 2 == 1: add(mus, C, t, 0.75)
            add(mus, Ho if b % 4 == 3 else Hc, t + beat / 2, 0.9)
            for q in (0.25, 0.75): add(mus, Hc, t + beat * q, 0.3)
            add(mus, sub(root - 12, beat * 0.4), t + beat / 2, 1.0); add(mus, sub(root - 12, beat * 0.3), t, 0.8)
            if b % 2 == 0: add(mus, stab(ch), t + beat * 0.75, 0.55)
        else:
            if b % 2 == 0: add(mus, sub(root - 12, bar * 0.9), t, 0.7)
        t += beat; b += 1
    add(sfx, riser(endt - brk - 0.1), brk + 0.1, 0.7)
    # bitiş
    add(mus, pad([50, 57, 62, 65, 69], 3.2), endt, 0.75); add(mus, sub(38, 2.2), endt, 1.0); add(mus, K, endt, 1.0)
    mus *= duck
    fade = np.ones(L); fs = int((dur - 1.3) * SR); fade[fs:] = np.linspace(1, 0, L - fs); mus *= fade
    # efektler: kesmeler, önce/sonra, soru, bitiş
    add(sfx, impact(), drop - 0.02, 0.85)
    for f in ev['cut']:
        if f / FPS > drop + 0.1: add(sfx, whoosh(0.32), f / FPS - 0.16, 0.6)
    for f in ev['step']: add(sfx, tick(), f / FPS + 0.07, 0.6)
    add(sfx, swipe(), ev['wipe'] / FPS - 0.1, 0.7)
    add(sfx, bell(86), ev['wipe'] / FPS + 1.25, 0.6); add(sfx, bell(93), ev['wipe'] / FPS + 1.34, 0.5)
    add(sfx, impact(), endt, 0.7)
    for k, m in enumerate([74, 77, 81, 86]): add(sfx, bell(m, 0.9), endt + 0.75 + k * 0.08, 0.3)
    mix = mus * 0.55 + sfx * 0.7
    mix = np.tanh(mix * 1.35) / np.tanh(1.35); mix *= 0.89 / np.max(np.abs(mix))
    st = np.stack([mix, np.roll(mix, 11) * 0.98], 1)
    with wave.open(out, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((st * 32767).astype('<i2').tobytes())
    print('müzik sn', round(dur, 2))

if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2])
