# Batilmer reels için kendi ürettiğimiz (telifsiz) müzik + videoyla senkron efektler
import sys, wave, numpy as np
sys.path.insert(0, '/tmp/claude-0/-home-user-form-batilmer-com/9354f13d-4a04-52f0-b879-56fa5060c767/scratchpad/reels3')
import modern as M

SR = 44100; FPS = 30; rng = np.random.default_rng(7)
def tt(n): return np.arange(n) / SR
def env(n, a=0.005, d=0.2):
    t = tt(n); e = np.exp(-t / d); k = int(a * SR)
    if k: e[:k] *= np.linspace(0, 1, k)
    return e
def noise(n): return rng.standard_normal(n)
def lp_fft(x, cutoff):  # basit FFT alçak geçiren
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); X *= 1 / (1 + (f / cutoff) ** 4); return np.fft.irfft(X, len(x))
def hp_fft(x, cutoff):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); X *= 1 / (1 + (cutoff / np.maximum(f, 1)) ** 4); return np.fft.irfft(X, len(x))
def bp_fft(x, lo, hi): return hp_fft(lp_fft(x, hi), lo)
def mtof(m): return 440 * 2 ** ((m - 69) / 12)
def add(buf, x, at, g=1.0):
    i = int(at * SR)
    if i >= len(buf): return
    x = x[:len(buf) - i]; buf[i:i + len(x)] += x * g

# ---------------- sesler
def kick():
    n = int(0.42 * SR); t = tt(n); f = 45 + 110 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR; return np.sin(ph) * env(n, 0.001, 0.16) + 0.25 * noise(n) * env(n, 0, 0.004)
def hat(open_=False):
    n = int((0.25 if open_ else 0.06) * SR); return hp_fft(noise(n), 7000) * env(n, 0.001, 0.09 if open_ else 0.018) * 0.5
def clap():
    n = int(0.3 * SR); x = bp_fft(noise(n), 900, 5000); e = env(n, 0.001, 0.12)
    for d in (0.0, 0.011, 0.022): k = int(d * SR); e[k:k + 80] += 0.6
    return x * e * 0.55
def saw(freq, n, harm=12):
    t = tt(n); return sum(np.sin(2 * np.pi * freq * k * t) / k * (0.85 ** k) for k in range(1, harm))
def pad(notes, dur):
    n = int(dur * SR); x = np.zeros(n)
    for m in notes:
        for det in (-0.08, 0.08): x += saw(mtof(m + det), n, 9)
    e = np.minimum(1, tt(n) / 0.25) * np.minimum(1, (dur - tt(n)) / 0.3); return x * e / len(notes) * 0.35
def bass(m, dur):
    n = int(dur * SR); f = mtof(m); t = tt(n)
    return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)) * env(n, 0.004, dur * 0.9) * 0.6
def pluck(m, dur=0.35):
    n = int(dur * SR); f = mtof(m); t = tt(n)
    return (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) + 0.12 * np.sin(6 * np.pi * f * t)) * env(n, 0.002, 0.11) * 0.33
def bell(m, dur=1.2):
    n = int(dur * SR); f = mtof(m); t = tt(n)
    return (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / 0.15) + 0.25 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t / 0.07)) * env(n, 0.002, 0.35) * 0.32
def whoosh(dur=0.4, up=True):
    n = int(dur * SR); x = noise(n); t = tt(n) / dur
    # kayan bant: parçalara bölüp farklı filtre
    out = np.zeros(n); seg = 8
    for s in range(seg):
        a, b = s * n // seg, (s + 1) * n // seg; c = 600 + 5000 * ((s / seg) if up else (1 - s / seg))
        out[a:b] = bp_fft(x, c * 0.5, c * 1.6)[a:b]
    e = np.sin(np.pi * t) ** 1.5; return out * e * 0.55
def tick():
    n = int(0.05 * SR); t = tt(n); return np.sin(2 * np.pi * 1800 * t) * env(n, 0.0005, 0.008) * 0.35
def pop():
    n = int(0.09 * SR); t = tt(n); f = 500 + 900 * np.exp(-t / 0.02); return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.03) * 0.45
def riser(dur):
    n = int(dur * SR); t = tt(n) / dur; out = np.zeros(n); seg = 12; x = noise(n)
    for s in range(seg):
        a, b = s * n // seg, (s + 1) * n // seg; c = 300 + 6000 * (s / seg) ** 2; out[a:b] = bp_fft(x, c * 0.6, c * 1.5)[a:b]
    return out * t ** 2 * 0.4
def impact():
    n = int(1.4 * SR); t = tt(n); f = 38 + 60 * np.exp(-t / 0.08)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.45) * 0.9 + lp_fft(noise(n), 2500) * env(n, 0.001, 0.12) * 0.35

# ---------------- olay zamanları videodan
def events(name):
    M.init(name); T = M.TL; ev = dict(word=[], whip=[], tap=[], chip=[], mag=[], ban=[], outro=None, end=None, btn=None)
    for i, t in enumerate(T):
        p = T[i - 1] if i else {}
        if t.get('hook') and i % 4 == 0 and i <= 4 * (len(M.ST['hook']) - 1): ev['word'].append(i)
        if t.get('whip', 0) > 0 and p.get('whip', 0) < 0: ev['whip'].append(i)
        if t.get('tap') and t['tap'][2] == 0: ev['tap'].append(i)
        if t.get('chip') and t.get('ht') == 4: ev['chip'].append(i)
        if t.get('mag') and t.get('ht') == 0: ev['mag'].append(i)
        if t.get('ban') is not None and p.get('ban') is None: ev['ban'].append(i)
        if t.get('outro') is not None and ev['outro'] is None: ev['outro'] = i
        if 'end' in t and ev['end'] is None: ev['end'] = i
    ev['btn'] = ev['end'] + 28; ev['n'] = len(T); return ev

def build(name, out):
    ev = events(name); dur = ev['n'] / FPS; L = int((dur + 0.1) * SR)
    music = np.zeros(L); sfx = np.zeros(L); duck = np.ones(L)
    drop = 42 / FPS; endt = ev['end'] / FPS
    bpm = 120; beat = 60 / bpm; bar = beat * 4
    prog = [(57, [57, 60, 64]), (53, [53, 57, 60]), (48, [55, 60, 64]), (55, [55, 59, 62])]  # Am F C G
    arp = [0, 2, 1, 2, 0, 2, 1, 3]
    # kanca: riser + yumuşak pad
    add(music, pad([57, 60, 64], drop + 0.2), 0, 0.5); add(sfx, riser(drop), 0, 0.9)
    K, Hh, Ho, C = kick(), hat(), hat(True), clap()
    t = drop; b = 0
    while t < endt - 0.05:
        bi = b % 16; root, ch = prog[(b // 4) % 4]
        if bi % 4 == 0: add(music, pad(ch, bar + 0.05), t, 0.55);
        add(music, K, t, 0.9)
        k = int(t * SR); m = int(0.22 * SR); duck[k:k + m] = np.minimum(duck[k:k + m], 0.35 + 0.65 * np.linspace(0, 1, len(duck[k:k + m])))
        if b % 2 == 1: add(music, C, t, 0.8)
        add(music, Ho if b % 4 == 3 else Hh, t + beat / 2, 0.9); add(music, Hh, t + beat * 0.25, 0.35); add(music, Hh, t + beat * 0.75, 0.35)
        add(music, bass(root - 12, beat * 0.45), t + beat / 2, 1.0); add(music, bass(root - 12, beat * 0.3), t, 0.7)
        for s in range(2):
            n = ch[arp[(bi * 2 + s) % 8] % 3] + 12 + (12 if arp[(bi * 2 + s) % 8] == 3 else 0)
            add(music, pluck(n), t + s * beat / 2, 0.8)
        t += beat; b += 1
    # bitiş: final akor
    add(music, pad([57, 60, 64, 69], 2.4), endt, 0.8); add(music, bass(45, 1.5), endt, 1.0); add(music, K, endt, 1.0)
    # sidechain + çıkışta sönme
    music *= np.concatenate([duck, np.ones(len(music) - len(duck))])[:len(music)]
    fade = np.ones(L); fs = int((dur - 1.2) * SR); fade[fs:] = np.linspace(1, 0, L - fs); music *= fade
    # efektler
    add(sfx, impact(), drop - 0.02, 0.8)
    for f in ev['word']: add(sfx, tick(), f / FPS, 0.6)
    for f in ev['whip']: add(sfx, whoosh(0.36), f / FPS - 0.18, 0.75)
    for f in ev['tap']: add(sfx, pop(), f / FPS + 0.05, 0.8)
    for f in ev['mag']: add(sfx, whoosh(0.22), f / FPS - 0.05, 0.35)
    for f in ev['chip']: add(sfx, bell(88), f / FPS, 0.55); add(sfx, bell(95), f / FPS + 0.09, 0.45)
    for f in ev['ban']: add(sfx, bell(84, 0.8), f / FPS, 0.5); add(sfx, bell(91, 0.8), f / FPS + 0.12, 0.5)
    add(sfx, whoosh(0.45, up=False), ev['outro'] / FPS, 0.6)
    add(sfx, impact(), endt, 0.6)
    for k, m in enumerate([81, 85, 88, 93]): add(sfx, bell(m, 0.9), ev['btn'] / FPS + k * 0.07, 0.3)
    mix = music * 0.55 + sfx * 0.7
    mix = np.tanh(mix * 1.3) / np.tanh(1.3)  # yumuşak limiter
    mix *= 0.89 / np.max(np.abs(mix))
    st = np.stack([mix, np.roll(mix, 9) * 0.98], 1)  # hafif stereo genişlik
    with wave.open(out, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((st * 32767).astype('<i2').tobytes())
    print(name, 'sn', round(dur, 2), {k: (len(v) if isinstance(v, list) else v) for k, v in ev.items()})

if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2])
