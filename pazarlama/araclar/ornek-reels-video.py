# Müşteri adayının kendi ham videosundan modern reels (örnek çalışma).
# Kullanım: python3 ornek-reels-video.py <kaynak.mp4> <logo.png> <çalışma_klasörü>
# Çıktı: <klasör>/video.mp4 (sessiz) + <klasör>/olaylar.json (müzik senkronu için)
import json, math, os, subprocess, sys
from multiprocessing import Pool
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops, ImageEnhance

SRC, LOGO, WD = sys.argv[1], sys.argv[2], sys.argv[3]
W, H, FPS = 1080, 1920, 30
FD = '/usr/share/fonts/opentype/inter/'
F = lambda n, s: ImageFont.truetype(FD + n, s)
RED = (228, 32, 39); WHITE = (250, 248, 245); GREY = (200, 204, 210); INK = (10, 10, 12)

# ---------------------------------------------------------------- sahneler
# (tür, kaynak başlangıç, kaynak bitiş, çıktı süresi sn, ek bilgi)
SAHNE = [
    ('hook',   0.3, 3.7, 2.5, None),
    ('adim',   4.4, 7.3, 1.5, ('01', 'TEMİZLİK', 'Yüzey yağdan arındırılır')),
    ('adim',   7.5, 11.0, 1.5, ('02', 'RENK KARIŞIMI', 'Boya + sertleştirici')),
    ('adim',  11.1, 21.4, 2.5, ('03', 'ZEMİN HAZIRLIĞI', '3000 kum zımpara')),
    ('adim',  21.5, 28.6, 2.0, ('04', 'KAT KAT DOLGU', 'Çizik boyayla doldurulur')),
    ('adim',  28.7, 32.6, 1.5, ('05', 'KURUTMA', 'Her kat sertleşene kadar')),
    ('adim',  32.7, 43.8, 2.5, ('06', 'PASTA & HARE ALMA', 'Rotatif + orbital makine')),
    ('oncesonra', 44.0, 50.9, 4.0, 1.2),   # ek: "önce" karesinin kaynak saniyesi
    ('final',  51.0, 57.0, 4.5, None),
    ('son',    None, None, 3.5, None),
]

def extract():
    os.makedirs(WD + '/kare', exist_ok=True)
    vf = ("scale=1080:1920:flags=lanczos,eq=contrast=1.10:saturation=1.18:brightness=-0.015:gamma=0.97,"
          "unsharp=5:5:0.6,vignette=PI/5")
    for i, (k, a, b, d, ek) in enumerate(SAHNE):
        if a is None: continue
        od = f'{WD}/kare/s{i}'; os.makedirs(od, exist_ok=True)
        if os.listdir(od): continue
        n = round(d * FPS)
        subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(a), '-t', str(b - a), '-i', SRC, '-an',
                        '-vf', f'setpts=PTS*{d / (b - a):.5f},fps={FPS},{vf}', '-frames:v', str(n),
                        '-q:v', '2', f'{od}/%04d.jpg'], check=True)
        if k == 'oncesonra':
            subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(ek), '-i', SRC, '-frames:v', '1', '-vf', vf,
                            '-q:v', '2', f'{WD}/kare/once.jpg'], check=True)

# ---------------------------------------------------------------- yardımcılar
def clamp(v, a=0., b=1.): return max(a, min(b, v))
def eo(t): t = clamp(t); return 1 - (1 - t) ** 3
def eexpo(t): t = clamp(t); return 1 if t >= 1 else 1 - 2 ** (-10 * t)
def eback(t, s=1.8): t = clamp(t) - 1; return 1 + (s + 1) * t ** 3 + s * t ** 2
def eio(t): t = clamp(t); return 0.5 - math.cos(math.pi * t) / 2

def zoom(im, z, cx=0.5, cy=0.5, dx=0):
    if abs(z - 1) < 1e-3 and not dx: return im
    w, h = W / z, H / z; x = clamp(cx * W - w / 2 + dx, 0, W - w); y = clamp(cy * H - h / 2, 0, H - h)
    return im.resize((W, H), Image.BICUBIC, box=(x, y, x + w, y + h))

def blur_band(im, y0, y1, r=22, dark=0.55):
    """Ham videodaki yazıyı gizleyen buzlu bant + üstten yumuşak geçiş."""
    y0, y1 = int(y0), int(y1)
    band = im.crop((0, y0, W, y1)).filter(ImageFilter.GaussianBlur(r))
    band = ImageEnhance.Brightness(band).enhance(1 - dark)
    m = Image.new('L', (W, y1 - y0), 255); d = ImageDraw.Draw(m); f = 90
    for i in range(f):
        a = int(255 * eio(i / f)); d.line([(0, i), (W, i)], fill=a); d.line([(0, y1 - y0 - 1 - i), (W, y1 - y0 - 1 - i)], fill=a)
    im.paste(band, (0, y0), m)

def grad(h, top=True, a=200):
    g = Image.new('L', (1, h)); g.putdata([int(a * ((1 - i / h) if top else i / h) ** 1.6) for i in range(h)])
    return g.resize((W, h))

_cache = {}
def word_img(txt, font, size, color, shadow=True):
    key = (txt, font, size, color, shadow)
    if key in _cache: return _cache[key]
    f = F(font, size); bb = f.getbbox(txt); w, h = bb[2] - bb[0] + 40, bb[3] + 40
    im = Image.new('RGBA', (w, h)); d = ImageDraw.Draw(im)
    if shadow:
        sh = Image.new('L', (w, h)); ImageDraw.Draw(sh).text((20 - bb[0], 24), txt, font=f, fill=200)
        sh = sh.filter(ImageFilter.GaussianBlur(9)); im.paste((0, 0, 0, 255), (0, 0), sh)
    d.text((20 - bb[0], 20), txt, font=f, fill=color)
    _cache[key] = (im, bb[2] - bb[0], f.getmetrics()); return _cache[key]

def kinetic(fr, lines, y, t, stagger=3, dur=7, out=None, gap=0.28):
    """lines: [(metin, font, boyut, renk)]; kelime kelime aşağıdan yukarı, hafif ölçek."""
    k = 0; cy = y
    for txt, font, size, col in lines:
        words = txt.split(' '); imgs = [word_img(w, font, size, col) for w in words]
        sp = int(size * gap); total = sum(i[1] for i in imgs) + sp * (len(imgs) - 1); x = (W - total) // 2
        for im, wd, _ in imgs:
            p = (t - k * stagger) / dur; k += 1
            if p > 0:
                e = eback(p); a = clamp(p * 1.6)
                if out is not None: a *= 1 - clamp(out);
                if a > 0.01:
                    src = im.copy(); src.putalpha(ImageChops.multiply(im.getchannel('A'), Image.new('L', im.size, int(255 * a))))
                    off = int((1 - e) * size * 0.55)
                    fr.alpha_composite(src, (x - 20, int(cy - 20 + off)))
            x += wd + sp
        cy += int(size * 1.08)
    return cy

def rrect(size, r, fill):
    im = Image.new('RGBA', size); ImageDraw.Draw(im).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), r, fill=fill); return im

def chip(fr, txt, x, y, bg, fg, size=34, a=1.0, anchor='l'):
    f = F('Inter-ExtraBold.otf', size); bb = f.getbbox(txt); w, h = bb[2] - bb[0] + size * 1.2, int(size * 1.9)
    c = rrect((int(w), h), h // 2, bg + (int(235 * a),)); d = ImageDraw.Draw(c)
    d.text(((w - (bb[2] - bb[0])) / 2 - bb[0], (h - size) / 2 - bb[1] * 0.25), txt, font=f, fill=fg + (int(255 * a),))
    if anchor == 'r': x -= int(w)
    fr.alpha_composite(c, (int(x), int(y)))

# ---------------------------------------------------------------- zaman çizelgesi
def timeline():
    T = []; ev = dict(cut=[], drop=None, word=[], step=[], wipe=None, ba=None, q=None, end=None, n=0)
    for i, (k, a, b, d, ek) in enumerate(SAHNE):
        n = round(d * FPS); s0 = len(T)
        if k == 'adim': ev['step'].append(s0)
        if k == 'oncesonra': ev['ba'] = s0; ev['wipe'] = s0 + 12
        if k == 'final': ev['q'] = s0 + 6
        if k == 'son': ev['end'] = s0
        if i == 1: ev['drop'] = s0
        if i > 0: ev['cut'].append(s0)
        for j in range(n): T.append((i, j, n))
    ev['n'] = len(T); ev['word'] = [0, 3, 9, 12, 15]
    return T, ev

T, EV = timeline()
LOGO_IM = None
def logo(w):
    global LOGO_IM
    if LOGO_IM is None:
        im = Image.open(LOGO).convert('RGB'); LOGO_IM = im
    im = LOGO_IM; h = int(im.height * w / im.width)
    im = im.resize((w, h), Image.LANCZOS).filter(ImageFilter.UnsharpMask(2, 80, 2))
    return im

def frame(f):
    i, j, n = T[f]; k, a, b, d, ek = SAHNE[i]; p = j / max(n - 1, 1)
    if k == 'son': return end_card(j)
    src = Image.open(f'{WD}/kare/s{i}/{min(j + 1, len(os.listdir(f"{WD}/kare/s{i}"))):04d}.jpg').convert('RGB')
    # kamera: yavaş itme + kesmede punch-zoom + whip
    z = 1.04 + 0.05 * p
    if j < 6 and i > 0: z += 0.14 * (1 - eexpo(j / 6))
    if k == 'final': z = 1.0 + 0.10 * eio(p)
    dx = 0
    if n - j <= 3 and i < len(SAHNE) - 2: dx = (3 - (n - j) + 1) * 70        # çıkışta hızlanan kayma
    im = zoom(src, z, 0.5, 0.5, dx)
    if n - j <= 3 and i < len(SAHNE) - 2:                                     # hareket bulanıklığı
        im = Image.blend(im, im.filter(ImageFilter.BoxBlur(6)), 0.7)
    if k == 'oncesonra': im = before_after(im, j, n)
    fr = im.convert('RGBA')
    # ham yazıları kapat
    if k == 'hook': blur_band(fr, 330, 760, 24, 0.45)
    elif k in ('oncesonra', 'final'): blur_band(fr, 1230, 1840, 26, 0.62)
    else: blur_band(fr, 1380, 1840, 24, 0.62)
    # üst gradyan + logo
    top = Image.new('RGBA', (W, 300), (0, 0, 0, 0)); top.putalpha(grad(300, True, 170)); fr.alpha_composite(top)
    lg = logo(260).convert('RGBA'); lg.putalpha(ImageChops.multiply(lg.convert('L').point(lambda v: min(255, v * 3)), Image.new('L', lg.size, 230)))
    fr.alpha_composite(lg, (W - 260 - 48, 52))
    # kesmede beyaz flaş
    if j < 3 and i > 0:
        fl = Image.new('RGBA', (W, H), (255, 255, 255, int(90 * (1 - j / 3)))); fr.alpha_composite(fl)
    if k == 'hook': hook(fr, j, n)
    elif k == 'adim': step(fr, j, n, ek, i)
    elif k == 'oncesonra': ba_text(fr, j, n)
    elif k == 'final': final(fr, j, n)
    progress(fr, f)
    return fr.convert('RGB')

def progress(fr, f):
    d = ImageDraw.Draw(fr); w = int(W * (f + 1) / EV['end'])
    d.rectangle((0, 0, W, 9), fill=(255, 255, 255, 50)); d.rectangle((0, 0, min(w, W), 9), fill=RED)

def hook(fr, j, n):
    out = clamp((j - (n - 5)) / 5)
    kinetic(fr, [('BU ÇİZİK', 'InterDisplay-BlackItalic.otf', 132, WHITE),
                 ('BOYASIZ', 'InterDisplay-BlackItalic.otf', 150, RED),
                 ('GİDER Mİ?', 'InterDisplay-BlackItalic.otf', 150, RED)], 400, j, stagger=3, out=out)
    if j > 30:
        chip(fr, 'ÇİZİK RÖTUŞU · PART 1', W / 2 - 250, 1560, INK, WHITE, 34, clamp((j - 30) / 6) * (1 - out))

def step(fr, j, n, ek, i):
    no, title, sub = ek; out = clamp((j - (n - 4)) / 4)
    # sol kırmızı numara bloğu
    e = eback(j / 8); x0 = int(-260 + e * 330)
    blk = rrect((150, 150), 26, RED + (255,)); d = ImageDraw.Draw(blk)
    fn = F('InterDisplay-BlackItalic.otf', 84); bb = fn.getbbox(no); d.text(((150 - bb[2]) / 2 - 4, (150 - bb[3]) / 2 - 6), no, font=fn, fill=WHITE)
    a = 1 - out
    blk.putalpha(ImageChops.multiply(blk.getchannel('A'), Image.new('L', blk.size, int(255 * a))))
    fr.alpha_composite(blk, (x0, 1520))
    # başlık + alt yazı soldan
    for ln, (txt, font, sz, col, dl) in enumerate([(title, 'InterDisplay-BlackItalic.otf', 80 if len(title) < 15 else 66, WHITE, 2),
                                                    (sub, 'Inter-SemiBold.otf', 42, GREY, 5)]):
        im, wd, _ = word_img(txt, font, sz, col)
        pp = clamp((j - dl) / 8); ex = eexpo(pp)
        if pp <= 0: continue
        src = im.copy(); src.putalpha(ImageChops.multiply(im.getchannel('A'), Image.new('L', im.size, int(255 * clamp(pp * 1.5) * a))))
        fr.alpha_composite(src, (int(250 + (1 - ex) * 120), 1522 + ln * 98 - 20))
    # adım göstergesi
    d = ImageDraw.Draw(fr); cur = int(no)
    for s in range(6):
        x = 80 + s * 52; on = s < cur
        d.rounded_rectangle((x, 1730, x + 40, 1740), 5, fill=RED if on else (255, 255, 255, 90))

def before_after(after, j, n):
    once = Image.open(f'{WD}/kare/once.jpg').convert('RGB')
    once = zoom(once, 1.08); blur_band(once, 330, 760, 24, 0.45)
    wp = eio((j - 12) / 36)                        # 0.4 sn sonra 1.2 sn'de süpürme
    dline = int(W * (1 - wp))
    im = after.copy(); im.paste(once.crop((0, 0, dline, H)), (0, 0)) if dline > 0 else None
    if 0 < dline < W:
        d = ImageDraw.Draw(im); d.rectangle((dline - 4, 0, dline + 4, H), fill=WHITE)
        d.ellipse((dline - 46, H // 2 - 46, dline + 46, H // 2 + 46), fill=RED, outline=WHITE, width=6)
        d.polygon([(dline - 26, H // 2), (dline - 8, H // 2 - 16), (dline - 8, H // 2 + 16)], fill=WHITE)
        d.polygon([(dline + 26, H // 2), (dline + 8, H // 2 - 16), (dline + 8, H // 2 + 16)], fill=WHITE)
    return im

def ba_text(fr, j, n):
    wp = eio((j - 12) / 36)
    if wp < 0.98: chip(fr, 'ÖNCE', 60, 330, INK, WHITE, 40, 1 - clamp((wp - 0.8) / 0.2))
    if wp > 0.05: chip(fr, 'SONRA', W - 60, 330, RED, WHITE, 40, clamp(wp * 3), anchor='r')
    if j >= 50:
        t = j - 50
        kinetic(fr, [('BOYAMADAN,', 'InterDisplay-BlackItalic.otf', 104, WHITE),
                     ('RÖTUŞLA.', 'InterDisplay-BlackItalic.otf', 104, RED)], 1420, t, stagger=3)
        if t > 14:
            im, wd, _ = word_img('Metalik renkte %85’e yakın sonuç', 'Inter-SemiBold.otf', 40, GREY)
            src = im.copy(); src.putalpha(ImageChops.multiply(im.getchannel('A'), Image.new('L', im.size, int(255 * clamp((t - 14) / 8)))))
            fr.alpha_composite(src, ((W - wd) // 2 - 20, 1660))

def final(fr, j, n):
    out = clamp((j - (n - 6)) / 6)
    kinetic(fr, [('SİZ OLSAYDINIZ', 'InterDisplay-BlackItalic.otf', 96, WHITE),
                 ('BOYATIR MIYDINIZ?', 'InterDisplay-BlackItalic.otf', 96, RED)], 1440, j - 6, stagger=3, out=out)
    if j > 40:
        chip(fr, 'YORUMLARA YAZIN  ↓', W / 2 - 220, 1700, INK, WHITE, 34, clamp((j - 40) / 8) * (1 - out))

def end_card(j):
    fr = Image.new('RGBA', (W, H), INK + (255,))
    # kırmızı nefes alan ışık
    glow = Image.new('L', (W, H)); ImageDraw.Draw(glow).ellipse((-200, 380, W + 200, 1300), fill=int(120 + 40 * math.sin(j / 9)))
    glow = glow.filter(ImageFilter.GaussianBlur(160)); fr.paste((120, 10, 16, 255), (0, 0), glow)
    # logo: siyah zemini ekran karışımıyla eriterek
    s = eback(j / 14); w = int(900 * (0.6 + 0.4 * s)); lg = logo(w)
    if j < 14: lg = ImageEnhance.Brightness(lg).enhance(clamp(j / 8))
    base = fr.convert('RGB'); x, y = (W - w) // 2, 560 - lg.height // 2
    reg = base.crop((x, y, x + w, y + lg.height)); base.paste(ImageChops.screen(reg, lg), (x, y)); fr = base.convert('RGBA')
    kinetic(fr, [('Çizik rötuş · Pasta cila', 'Inter-SemiBold.otf', 46, GREY),
                 ('Seramik kaplama · PPF', 'Inter-SemiBold.otf', 46, GREY)], 860, j - 10, stagger=2, gap=0.25)
    if j > 22:
        e = eback((j - 22) / 10); bw, bh = 820, 150
        b = rrect((bw, bh), 75, RED + (255,)); d = ImageDraw.Draw(b)
        f1 = F('InterDisplay-BlackItalic.otf', 54); t1 = 'RANDEVU: BİO’DAKİ LİNK'; bb = f1.getbbox(t1)
        d.text(((bw - bb[2]) / 2, (bh - 54) / 2 - 8), t1, font=f1, fill=WHITE)
        sc = 0.7 + 0.3 * e; b = b.resize((int(bw * sc), int(bh * sc)), Image.LANCZOS)
        fr.alpha_composite(b, ((W - b.width) // 2, 1120 + (bh - b.height) // 2))
    if j > 32:
        kinetic(fr, [('@erncarcare · Seyrantepe', 'Inter-ExtraBold.otf', 50, WHITE)], 1340, j - 32, stagger=2)
    if j > 44:
        im, wd, _ = word_img('Örnek çalışma · Batilmer', 'Inter-SemiBold.otf', 28, (120, 124, 130), shadow=False)
        src = im.copy(); src.putalpha(ImageChops.multiply(im.getchannel('A'), Image.new('L', im.size, int(255 * clamp((j - 44) / 10)))))
        fr.alpha_composite(src, ((W - wd) // 2 - 20, 1780))
    progress(fr, EV['end'] - 1)
    return fr.convert('RGB')

def job(rng):
    out = []
    for f in range(*rng):
        frame(f).save(f'{WD}/cikti/{f:04d}.jpg', quality=93)
    return rng

if __name__ == '__main__':
    extract(); os.makedirs(WD + '/cikti', exist_ok=True)
    N = EV['n']; parts = [(s, min(s + 40, N)) for s in range(0, N, 40)]
    only = os.environ.get('KARE')
    if only:
        for f in map(int, only.split(',')): frame(f).save(f'{WD}/onizleme_{f:04d}.jpg', quality=90)
        sys.exit()
    with Pool(4) as p: list(p.imap_unordered(job, parts))
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-framerate', str(FPS), '-i', f'{WD}/cikti/%04d.jpg',
                    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', f'{WD}/video.mp4'], check=True)
    json.dump(EV, open(f'{WD}/olaylar.json', 'w'))
    print('kare', N, 'sn', N / FPS, EV)
