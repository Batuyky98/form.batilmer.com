# Batilmer modern reels motoru: kanca, hareketli arka plan, kelime kelime yazı,
# süzülen telefon, punch-zoom, büyüteç kartı, whip-pan geçiş, ilerleme çubuğu, animasyonlu bitiş.
import json, math, sys, os
from multiprocessing import Pool
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops

S = '/tmp/claude-0/-home-user-form-batilmer-com/9354f13d-4a04-52f0-b879-56fa5060c767/scratchpad/'
FD = '/usr/share/fonts/opentype/inter/'
W, H, FPS = 1080, 1920, 30
NAVY = (15, 23, 42); BLUE = (47, 91, 234); LIGHT = (142, 166, 255); GREEN = (37, 211, 102); WHITE = (255, 255, 255)
F = lambda n, s: ImageFont.truetype(FD + n, s)

# ------------------------------------------------------------------ reels tanımları
REELS = {
    'r2': dict(
        dir=S + 'reels2/', out=S + 'reels3/batilmer-reels-2-modern.mp4',
        hook=[('Randevular hâlâ', False), ('mesajla mı?', True)],
        scenes=[  # (başlangıç etiketi, satır1, satır2)
            ('m-bos', 'Müşteriniz formu', 'kendisi doldurur'),
            ('m-gun', 'Boş gün ve saati', 'kendisi seçer'),
            ('m-adim3', 'Bilgilerini yazar,', 'gönderir'),
            ('m-tamam', 'Randevu', 'anında kaydedildi'),
            ('p-bugun', 'Telefonunuza', 'anında bildirim'),
            ('p-liste', 'Tüm detaylar', 'tek ekranda'),
            ('p-hizmet', 'Hizmet ve süreler', 'sizin elinizde'),
            ('p-musait', 'İzin, tatil, kapalı saat', 'tek dokunuşla'),
            ('p-hatirlat', 'Gelmeden önce', 'tek dokunuşla hatırlat'),
        ],
        hold={'m-bos': 14, 'm-kedi': 8, 'm-adim2': 10, 'm-asi': 22, 'm-gun': 12, 'm-saat': 26, 'm-adim3': 8, 'm-kvkk': 8,
              'm-tamam': 40, 'p-bugun': 8, 'p-liste': 18, 'p-detay': 30, 'p-hizmet': 10, 'p-musait': 10, 'p-hatirlat': 14, 'p-hatirlat-tamam': 34},
        typing={'m-yaz'}, scroll={'p-hizmet-kay', 'p-musait-kay'},
        mag={'m-asi', 'm-saat', 'p-hatirlat-tamam'},
        chips={'m-tamam': ('✓  Randevu alındı', BLUE), 'p-hatirlat-tamam': ('✓  WhatsApp mesajı hazır', GREEN)},
        banner=True,
    ),
    'r1': dict(
        dir=S + 'reels/', out=S + 'reels3/batilmer-reels-1-modern.mp4',
        hook=[('Yarınki randevu', False), ('unutulmasın.', True)], bubble='Yarın 14:00, sizi bekliyoruz ✓',
        scenes=[
            ('bugun', 'Bugün ne var?', 'tek bakışta'),
            ('hatirlat', 'Yarının randevuları', 'tek dokunuşla hatırlat'),
            ('cagir', 'Zamanı gelen müşteri', 'geri çağrılır'),
            ('rapor', 'Ay sonunda', 'işletmenin karnesi'),
        ],
        hold={'bugun': 14, 'hatirlat': 16, 'hatirlat-tamam': 30, 'cagir': 16, 'cagir-tamam': 30, 'rapor': 14},
        typing=set(), scroll={'scroll'},
        mag={'hatirlat-tamam', 'cagir-tamam'},
        chips={'hatirlat-tamam': ('✓  Mesaj hazır, gönder', GREEN), 'cagir-tamam': ('✓  Müşteri geri çağrıldı', BLUE)},
        banner=False,
    ),
}

# ------------------------------------------------------------------ yardımcılar
def ease_out_expo(t): return 1 if t >= 1 else 1 - 2 ** (-10 * t)
def ease_out_back(t, s=1.7): t = min(max(t, 0), 1) - 1; return 1 + (s + 1) * t ** 3 + s * t ** 2
def ease_in_cubic(t): return t ** 3
def ease_io(t): return 0.5 - math.cos(math.pi * min(max(t, 0), 1)) / 2
def clamp(v, a=0., b=1.): return max(a, min(b, v))
def with_alpha(im, a):
    if a >= 0.999: return im
    im = im.copy(); im.putalpha(im.getchannel('A').point(lambda v: int(v * a))); return im

def rrect(size, r, fill):
    im = Image.new('RGBA', size, (0, 0, 0, 0)); ImageDraw.Draw(im).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), r, fill=fill); return im

def word_imgs(lines, size, x0, y0, maxw, lh, colors):
    """Satırları kelimelere ayırıp (img, x, y) listesi döndürür; satıra sığmazsa alta kayar."""
    out = []; y = y0
    for (text, hi) in lines:
        font = F('InterDisplay-ExtraBold.otf', size)
        col = colors[1] if hi else colors[0]
        x = x0; sp = font.getlength(' ')
        for w in text.split(' '):
            wl = font.getlength(w)
            if x > x0 and x + wl > x0 + maxw: x = x0; y += lh
            bb = font.getbbox(w)
            im = Image.new('RGBA', (int(wl) + 8, size + 40), (0, 0, 0, 0))
            ImageDraw.Draw(im).text((2, 4), w, font=font, fill=col)
            out.append([im, x, y, hi]); x += wl + sp
        y += lh
    return out, y

def center_lines(words, cx):
    # her satırı yatay ortala
    rows = {}
    for w in words: rows.setdefault(w[2], []).append(w)
    for ws in rows.values():
        l = ws[0][1]; r = ws[-1][1] + ws[-1][0].width - 8; off = cx - (l + r) / 2
        for w in ws: w[1] += off
    return words

# ------------------------------------------------------------------ sabit katmanlar
def make_static(cfg):
    st = {}
    bg = Image.new('RGB', (W, H), NAVY); d = ImageDraw.Draw(bg)
    for yy in range(0, H, 64):
        for xx in range(32, W, 64): d.ellipse((xx - 1.6, yy - 1.6, xx + 1.6, yy + 1.6), fill=(30, 40, 62))
    st['bg'] = bg
    def glow(c, r, a):
        g = Image.new('RGBA', (r * 2 + 400, r * 2 + 400), (0, 0, 0, 0))
        ImageDraw.Draw(g).ellipse((200, 200, 200 + 2 * r, 200 + 2 * r), fill=c + (a,))
        return g.filter(ImageFilter.GaussianBlur(140))
    st['g1'] = glow(BLUE, 480, 170); st['g2'] = glow((109, 91, 255), 360, 120)
    # telefon
    SW = 640; SH = round(SW * 844 / 390); P = 14
    st.update(SW=SW, SH=SH, P=P)
    bez = rrect((SW + 2 * P, SH + 2 * P), 76, (6, 9, 18, 255))
    ImageDraw.Draw(bez).rounded_rectangle((0, 0, SW + 2 * P - 1, SH + 2 * P - 1), 76, outline=(54, 64, 90), width=3)
    st['bez'] = bez
    m = Image.new('L', (SW, SH), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, SW - 1, SH - 1), 62, fill=255); st['mask'] = m
    sh = Image.new('RGBA', (SW + 2 * P + 240, SH + 2 * P + 240), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((120, 150, SW + 2 * P + 120, SH + 2 * P + 150), 80, fill=(0, 0, 0, 150))
    st['shadow'] = sh.filter(ImageFilter.GaussianBlur(45))
    # yazılar
    st['hook'], hy = word_imgs(cfg['hook'], 118, 0, 0, 900, 132, (WHITE, LIGHT))
    st['hook'] = center_lines(st['hook'], W / 2)
    off = (H / 2 - 160) - hy / 2
    for w in st['hook']: w[2] += off
    st['caps'] = [word_imgs([(a, False), (b, True)], 80, 92, 150, 880, 92, (WHITE, LIGHT))[0] for (_, a, b) in cfg['scenes']]
    # çipler
    st['chips'] = {}
    for k, (txt, col) in cfg['chips'].items():
        f = F('Inter-Bold.otf', 40); tw = int(f.getlength(txt))
        c = rrect((tw + 76, 96), 48, col + (255,)); ImageDraw.Draw(c).text((38, 22), txt, font=f, fill=WHITE)
        s2 = Image.new('RGBA', (c.width + 80, c.height + 80), (0, 0, 0, 0)); s2.paste((0, 0, 0, 120), (40, 52), c.getchannel('A'))
        s2 = s2.filter(ImageFilter.GaussianBlur(16)); s2.alpha_composite(c, (40, 40)); st['chips'][k] = s2
    if cfg.get('bubble'):
        f = F('Inter-SemiBold.otf', 42); txt = cfg['bubble']; tw = int(f.getlength(txt))
        b = rrect((tw + 80, 110), 40, (220, 248, 198, 255)); d = ImageDraw.Draw(b); d.text((40, 30), txt, font=f, fill=(17, 27, 33))
        st['bubble'] = b
    # bildirim kartı
    if cfg['banner'] and os.path.exists(cfg['dir'] + 'assets/banner.png'):
        bn = Image.open(cfg['dir'] + 'assets/banner.png').convert('RGBA'); st['banner'] = bn.resize((820, int(bn.height * 820 / bn.width)), Image.LANCZOS)
    # bitiş
    lg = Image.new('RGBA', (180, 180), (0, 0, 0, 0)); d = ImageDraw.Draw(lg); k = 180 / 64
    d.rounded_rectangle((0, 0, 179, 179), 16 * k, fill=WHITE)
    for cx in (15, 23, 31): d.ellipse(((cx - 2.6) * k, (13 - 2.6) * k, (cx + 2.6) * k, (13 + 2.6) * k), fill=BLUE)
    d.line((21 * k, 22 * k, 21 * k, 51 * k), fill=NAVY, width=int(6.5 * k)); d.ellipse((23 * k, 29 * k, 45 * k, 51 * k), outline=NAVY, width=int(6.5 * k))
    d.line((47 * k, 49 * k, 53 * k, 49 * k), fill=BLUE, width=int(5 * k))
    st['logo'] = lg
    st['endw'], _ = word_imgs([('Randevu defteriniz', False), ('artık cebinizde.', True)], 92, 0, 0, 900, 106, (WHITE, LIGHT))
    st['endw'] = center_lines(st['endw'], W / 2)
    for w in st['endw']: w[2] += 900
    f = F('Inter-Medium.otf', 40); sub = 'Online randevu · Hatırlatma · Müşteri takibi'
    s = Image.new('RGBA', (int(f.getlength(sub)) + 10, 60), (0, 0, 0, 0)); ImageDraw.Draw(s).text((4, 4), sub, font=f, fill=(196, 205, 225)); st['endsub'] = s
    f = F('Inter-Bold.otf', 46); bt = 'Demo için DM → “DEMO”'; tw = int(f.getlength(bt))
    b = rrect((tw + 120, 112), 56, BLUE + (255,)); ImageDraw.Draw(b).text((60, 28), bt, font=f, fill=WHITE)
    g = Image.new('RGBA', (b.width + 120, b.height + 120), (0, 0, 0, 0)); g.paste(BLUE + (160,), (60, 60), b.getchannel('A'))
    g = g.filter(ImageFilter.GaussianBlur(28)); g.alpha_composite(b, (60, 60)); st['endbtn'] = g
    wm = F('InterDisplay-ExtraBold.otf', 72); t = 'batilmer'
    im = Image.new('RGBA', (int(wm.getlength(t)) + 10, 100), (0, 0, 0, 0)); ImageDraw.Draw(im).text((4, 4), t, font=wm, fill=WHITE); st['wordmark'] = im
    return st

# ------------------------------------------------------------------ zaman çizelgesi
def build_timeline(cfg):
    seq = json.load(open(cfg['dir'] + 'seq.json'))
    starts = {s[0]: i for i, s in enumerate(cfg['scenes'])}
    T = []; cur = None; curtag = None; scene = 0; last_tap = None
    def add(n, **kw):
        for i in range(n): T.append(dict(scr=cur, scene=scene, **{k: (v(i, n) if callable(v) else v) for k, v in kw.items()}))
    HOOK = 44
    for s in seq:
        if 'tap' in s:
            last_tap = s['tap']
            add(10, tap=lambda i, n: (last_tap['x'], last_tap['y'], i / (n - 1)), punch=lambda i, n: i / (n - 1))
            continue
        if 'banner' in s:
            add(10, ban=lambda i, n: ease_out_back((i + 1) / n)); add(26, ban=1.0)
            add(10, ban=1.0, tap=lambda i, n: (0.5, 0.02, i / (n - 1)), punch=lambda i, n: i / (n - 1))
            continue
        f, tag = s['f'], s['tag']
        new_scene = tag in starts and starts[tag] != scene or (cur is None)
        if cur is None:
            cur, curtag = f, tag; scene = starts.get(tag, 0)
            add(HOOK, hook=True)
            add(cfg['hold'].get(tag, 10)); continue
        if tag in cfg['typing']:
            cur, curtag = f, tag; add(4); continue
        if tag in cfg['scroll']:
            cur, curtag = f, tag; add(1); continue
        if curtag in cfg['scroll']: add(12)
        if tag in starts and starts[tag] != scene:
            # whip-pan: eski ekran sola savrulur, yeni sağdan gelir
            old = cur; ns = starts[tag]
            for i in range(5): T.append(dict(scr=old, scene=scene, whip=-ease_in_cubic((i + 1) / 5), capout=(i + 1) / 5))
            cur, curtag, scene = f, tag, ns
            for i in range(7): T.append(dict(scr=cur, scene=scene, whip=1 - ease_out_expo((i + 1) / 7)))
        else:
            a = cur; cur, curtag = f, tag
            for i in range(6): T.append(dict(scr=a, scr2=f, mix=(i + 1) / 6, scene=scene))
        n = cfg['hold'].get(tag, 10)
        extra = {}
        if tag in cfg['mag'] and last_tap: extra['mag'] = (last_tap['x'], last_tap['y'])
        if tag in cfg['chips']: extra['chip'] = tag
        for i in range(n): T.append(dict(scr=cur, scene=scene, ht=i, hn=n, **extra))
        last_tap = None
    # sahne başlangıçları ve uzunlukları (ilerleme çubuğu + yazı animasyonu)
    first = {}; cnt = {}
    for i, t in enumerate(T):
        if t.get('hook'): continue
        first.setdefault(t['scene'], i); cnt[t['scene']] = cnt.get(t['scene'], 0) + 1
    for i, t in enumerate(T):
        t['st'] = i - first.get(t['scene'], 0); t['sl'] = cnt.get(t['scene'], 1)
    for i in range(14): T.append(dict(scr=cur, scene=scene, outro=(i + 1) / 14, st=0, sl=1))
    for i in range(80): T.append(dict(end=i))
    return T

# ------------------------------------------------------------------ çizim
ST = None; CFG = None; TL = None; CACHE = {}
def scr(f):
    if f not in CACHE:
        if len(CACHE) > 40: CACHE.clear()
        CACHE[f] = Image.open(CFG['dir'] + f).convert('RGB')
    return CACHE[f]

def background(fi):
    bg = ST['bg'].copy().convert('RGBA'); t = fi / FPS
    g1, g2 = ST['g1'], ST['g2']
    bg.alpha_composite(g1, (int(-260 + 120 * math.sin(t * 0.8)), int(-180 + 90 * math.cos(t * 0.6))))
    bg.alpha_composite(g2, (int(W - 620 + 80 * math.cos(t * 0.7)), int(H - 900 + 120 * math.sin(t * 0.5))))
    return bg

def draw_caption(fr, words, st, out=0.0):
    for j, (im, x, y, hi) in enumerate(words):
        k = clamp((st - 2 - j * 3) / 10); e = ease_out_expo(k)
        if k <= 0: continue
        a = e * (1 - out); dy = (1 - e) * 36 - out * 30
        fr.alpha_composite(with_alpha(im, a), (int(x), int(y + dy)))

def phone_layer(t):
    SW, SH, P = ST['SW'], ST['SH'], ST['P']
    if t.get('scr2'): s = Image.blend(scr(t['scr']), scr(t['scr2']), t['mix'])
    else: s = scr(t['scr'])
    s = s.resize((SW, SH), Image.BILINEAR).convert('RGBA')
    if t.get('tap'):
        x, y, tt = t['tap']; x *= SW; y *= SH; ov = Image.new('RGBA', (SW, SH), (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
        if tt < 0.3:
            r = 30; a = int(150 * tt / 0.3); d.ellipse((x - r, y - r, x + r, y + r), fill=LIGHT + (int(a * .6),), outline=WHITE + (a,), width=4)
        else:
            k = (tt - 0.3) / 0.7; r = 30 + 60 * ease_out_expo(k); a = int(220 * (1 - k))
            d.ellipse((x - r, y - r, x + r, y + r), outline=LIGHT + (a,), width=7)
        s.alpha_composite(ov)
        if 0.3 < tt < 0.5: s = Image.blend(s, Image.new('RGBA', s.size, (255, 255, 255, 255)), 0.12)
    lay = ST['bez'].copy(); lay.paste(s, (P, P), ST['mask'])
    return lay

def render(i):
    t = TL[i]; fr = background(i)
    if 'end' in t: return end_card(fr, t['end'])
    SW, SH, P = ST['SW'], ST['SH'], ST['P']
    # telefonun konumu
    hook = t.get('hook'); hk = 0
    if hook:
        hk = i  # kanca karesi
    t0 = i / FPS
    scale = 1.0; ang = 1.3 * math.sin(t0 * 2 * math.pi / 4); bob = 9 * math.sin(t0 * 2 * math.pi / 4 + 1.2)
    rise = 0
    if hook:
        k = clamp((hk - 28) / 14); rise = (1 - ease_out_back(k, 1.3)) * 1500 if k < 1 else 0
        if k <= 0: rise = 2000
    if t.get('punch') is not None:
        p = t['punch']; scale *= 1 + 0.05 * math.sin(math.pi * p)
    if t.get('outro') is not None:
        o = ease_in_cubic(t['outro']); scale *= 1 - 0.35 * o; rise = -200 * o
    whip = t.get('whip', 0)
    lay = phone_layer(t)
    if scale != 1: lay = lay.resize((int(lay.width * scale), int(lay.height * scale)), Image.BILINEAR)
    lay = lay.rotate(ang, Image.BICUBIC, expand=True)
    cx = 520 + whip * 900; cy = 430 + (SH + 2 * P) / 2 + bob + rise
    px, py = int(cx - lay.width / 2), int(cy - lay.height / 2)
    alpha = 1 - (ease_in_cubic(t['outro']) if t.get('outro') is not None else 0)
    sh = ST['shadow']; fr.alpha_composite(with_alpha(sh, alpha * (1 - abs(whip))), (int(cx - sh.width / 2), int(cy - sh.height / 2 + 30)))
    if abs(whip) > 0.02:
        acc = Image.new('RGBA', fr.size, (0, 0, 0, 0)); n = 5; spread = 70 * abs(whip) + 20
        for k in range(n):
            l2 = Image.new('RGBA', fr.size, (0, 0, 0, 0)); l2.alpha_composite(lay, (max(-lay.width + 1, min(W - 1, px + int((k - n / 2) * spread / n))), py)) if -lay.width < px < W else None
            acc = Image.blend(acc, l2, 1 / (k + 1))
        fr.alpha_composite(acc)
    else:
        fr.alpha_composite(with_alpha(lay, alpha), (px, py))
    if t.get('ban') is not None and 'banner' in ST:
        b = ST['banner']; v = t['ban']; y = int(470 - (1 - v) * 260)
        fr.alpha_composite(with_alpha(b, clamp(v * 1.5)), (int(520 - b.width / 2), y))
    # büyüteç kartı
    if t.get('mag') and t.get('ht') is not None:
        mx, my = t['mag']; ht, hn = t['ht'], t['hn']
        k = clamp(ht / 9); e = ease_out_back(k); out = clamp((ht - (hn - 6)) / 6)
        if k > 0 and out < 1:
            src = scr(t['scr']); cw, ch = 430, 170
            x0 = int(clamp(mx * 780 - cw / 2, 0, 780 - cw)); y0 = int(clamp(my * 1688 - ch / 2, 0, 1688 - ch))
            crop = src.crop((x0, y0, x0 + cw, y0 + ch)).resize((int(cw * 1.9), int(ch * 1.9)), Image.LANCZOS).convert('RGBA')
            m = Image.new('L', crop.size, 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, crop.width - 1, crop.height - 1), 28, fill=255)
            card = Image.new('RGBA', (crop.width + 8, crop.height + 8), (0, 0, 0, 0)); ImageDraw.Draw(card).rounded_rectangle((0, 0, card.width - 1, card.height - 1), 32, fill=LIGHT + (255,))
            card.paste(crop, (4, 4), m)
            sc = 0.55 + 0.45 * e; card = card.resize((max(1, int(card.width * sc)), max(1, int(card.height * sc))), Image.BILINEAR)
            ty = 430 + P + my * SH
            cyy = ty - 300 if ty > 900 else ty + 260
            ccx = 520
            shd = Image.new('RGBA', (card.width + 100, card.height + 100), (0, 0, 0, 0)); shd.paste((0, 0, 0, 140), (50, 70), card.getchannel('A')); shd = shd.filter(ImageFilter.GaussianBlur(24))
            a = clamp(k * 1.5) * (1 - out)
            fr.alpha_composite(with_alpha(shd, a), (int(ccx - shd.width / 2), int(cyy - shd.height / 2)))
            fr.alpha_composite(with_alpha(card, a), (int(ccx - card.width / 2), int(cyy - card.height / 2 + out * 40)))
    # çip
    if t.get('chip') and t.get('ht') is not None:
        c = ST['chips'][t['chip']]; ht, hn = t['ht'], t['hn']
        k = clamp((ht - 4) / 10); out = clamp((ht - (hn - 5)) / 5)
        if k > 0 and out < 1:
            e = ease_out_back(k); cc = c.resize((max(1, int(c.width * (0.6 + 0.4 * e))), max(1, int(c.height * (0.6 + 0.4 * e)))), Image.BILINEAR)
            fr.alpha_composite(with_alpha(cc, clamp(k * 2) * (1 - out)), (int(540 - cc.width / 2), int(1430 - cc.height / 2 + (1 - e) * 60)))
    # kanca yazısı
    if hook:
        out = clamp((hk - 22) / 8)
        for j, (im, x, y, hi) in enumerate(ST['hook']):
            k = clamp((hk - j * 4) / 9); e = ease_out_expo(k)
            if k <= 0: continue
            fr.alpha_composite(with_alpha(im, e * (1 - out)), (int(x), int(y + (1 - e) * 40 - ease_in_cubic(out) * 420)))
        hl = [w for w in ST['hook'] if w[3]]
        if hl and out < 1:
            u = clamp((hk - 14) / 10); l = hl[0][1]; r = hl[-1][1] + hl[-1][0].width - 10; y = hl[0][2] + 150 - ease_in_cubic(out) * 420
            ImageDraw.Draw(fr).rounded_rectangle((l, y, l + (r - l) * ease_out_expo(u), y + 12), 6, fill=LIGHT + (int(255 * (1 - out)),)) if u > 0 else None
        if ST.get('bubble') and out < 1:
            b = ST['bubble']; k = clamp((hk - 18) / 9)
            if k > 0:
                e = ease_out_back(k); bb = b.resize((max(1, int(b.width * e)), max(1, int(b.height * e))), Image.BILINEAR)
                fr.alpha_composite(with_alpha(bb, 1 - out), (int(W / 2 - bb.width / 2), int(1260 - bb.height / 2 - ease_in_cubic(out) * 260)))
    else:
        if t.get('outro') is None:
            draw_caption(fr, ST['caps'][t['scene']], t['st'], t.get('capout', 0))
            # ilerleme çubuğu
            n = len(CFG['scenes']); x0, x1, gap = 92, 988, 10; wseg = (x1 - x0 - gap * (n - 1)) / n; d = ImageDraw.Draw(fr)
            for k in range(n):
                xa = x0 + k * (wseg + gap); d.rounded_rectangle((xa, 84, xa + wseg, 90), 3, fill=(255, 255, 255, 50))
                f = 1 if k < t['scene'] else (clamp(t['st'] / t['sl']) if k == t['scene'] else 0)
                if f > 0: d.rounded_rectangle((xa, 84, xa + wseg * f, 90), 3, fill=WHITE)
    return fr.convert('RGB')

def end_card(fr, e):
    k = clamp(e / 12); s = ease_out_back(k)
    lg = ST['logo']; wm = ST['wordmark']
    if k > 0:
        l2 = lg.resize((max(1, int(lg.width * s)), max(1, int(lg.height * s))), Image.BILINEAR)
        tw = 180 + 28 + wm.width; x = (W - tw) / 2
        fr.alpha_composite(with_alpha(l2, clamp(k * 2)), (int(x + 90 - l2.width / 2), int(640 - l2.height / 2)))
        a = clamp((e - 4) / 8); fr.alpha_composite(with_alpha(wm, a), (int(x + 208 + (1 - ease_out_expo(a)) * 40), 640 - 50))
    for j, (im, x, y, hi) in enumerate(ST['endw']):
        k = clamp((e - 8 - j * 3) / 10); ee = ease_out_expo(k)
        if k > 0: fr.alpha_composite(with_alpha(im, ee), (int(x), int(y + (1 - ee) * 40)))
    a = clamp((e - 22) / 10); sb = ST['endsub']
    if a > 0: fr.alpha_composite(with_alpha(sb, a), (int(W / 2 - sb.width / 2), 1150))
    k = clamp((e - 28) / 10)
    if k > 0:
        b = ST['endbtn']; pulse = 1 + 0.035 * max(0, math.sin((e - 38) / FPS * 2 * math.pi)) if e > 38 else 1
        sc = ease_out_back(k) * pulse; bb = b.resize((max(1, int(b.width * sc)), max(1, int(b.height * sc))), Image.BILINEAR)
        fr.alpha_composite(with_alpha(bb, clamp(k * 2)), (int(W / 2 - bb.width / 2), int(1330 - bb.height / 2)))
    return fr.convert('RGB')

def init(name):
    global ST, CFG, TL
    CFG = REELS[name]; ST = make_static(CFG); TL = build_timeline(CFG)

def job(args):
    i, od = args; render(i).save(f'{od}/{i:04d}.jpg', quality=93); return i

if __name__ == '__main__':
    name = sys.argv[1]; only = sys.argv[2:]  # opsiyonel kontrol kareleri
    init(name); od = S + f'reels3/fr-{name}'; os.makedirs(od, exist_ok=True)
    print('kare', len(TL), 'sn', round(len(TL) / FPS, 1))
    if only:
        for i in map(int, only): render(i).save(f'{S}reels3/k-{name}-{i}.jpg', quality=90)
        sys.exit()
    for f in os.listdir(od): os.remove(f'{od}/{f}')
    with Pool(4, initializer=init, initargs=(name,)) as p:
        for _ in p.imap_unordered(job, [(i, od) for i in range(len(TL))], chunksize=8): pass
    os.system(f'ffmpeg -y -loglevel error -framerate {FPS} -i {od}/%04d.jpg -c:v libx264 -preset slow -crf 19 -pix_fmt yuv420p -movflags +faststart {CFG["out"]}')
    print('ok', CFG['out'])
