"""체험 1단계 「시온 STORY」 영상(src/experience/story/story.mp4)을 만든다.

본선 제출 영상 인트로의 꼴을 따른다. 어둡게 누른 실사 위에 가운데 손글씨 인용(인트로에서 오려 냄), 흰 자막과 파란 강조,
오른쪽 위 작은 로고, 끝은 흰 화면에 로고. 이야기는 문제(n1~n5) → 시온(n6~n8)이다.

장면 길이는 내레이션(tools/story/voice/<id>.mp3) 길이에 맞춰 정해진다. ElevenLabs 로 만든 파일로 바꾼 뒤 다시 돌리면
그 길이대로 다시 짜인다. 대본과 자막은 tools/story/script.json 에 있다.

    python tools/story_tts.py                       # 없는 내레이션을 임시 음성으로 채운다
    python tools/story_video.py                     # 영상을 만든다
    python tools/story_video.py --voice 받은파일.mp3  # 대본 전체를 한 파일로 읽은 것을 줄마다 나눠 넣고 만든다
    python tools/story_video.py --still 3 9.5 30    # 그 순간들만 PNG 로(확인용, --out 폴더)

필요한 것: numpy, Pillow, ffmpeg(libx264, imageio-ffmpeg 가 있으면 그 ffmpeg 를 쓴다), Pretendard 글꼴
(못 찾으면 SEEON_FONT_DIR 로 폴더를 알려 준다).
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
HERE = ROOT / 'tools' / 'story'
OUT = ROOT / 'src' / 'experience' / 'story' / 'story.mp4'
W, H, FPS, SR = 1280, 720, 30, 44100
WHITE = (255, 255, 255)
BLUE = (98, 168, 255)     # 강조색(지금 로고의 파랑을 어두운 바탕에서 읽히게 밝힌 것)
INK = (27, 35, 48)        # 끝 화면 글자
PAPER = (254, 254, 252)   # 끝 화면 바탕(본선 인트로와 같은 흰색)

# 줄이 끝나고 다음 줄까지 쉬는 시간(초). 장면이 바뀌는 곳은 길게 둔다.
GAP = {'n1': 0.35, 'n2': 0.6, 'n3': 0.85, 'n4': 0.5, 'n5': 1.1, 'n6': 0.6, 'n7': 0.9, 'n8': 2.0}
LEAD = 0.9  # 첫 줄 앞


def ffmpeg_exe():
    if os.environ.get('SEEON_FFMPEG'):  # Windows 는 환경 변수 이름의 대소문자를 가리지 않아 FFMPEG 는 다른 것과 겹친다
        return os.environ['SEEON_FFMPEG']
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        return shutil.which('ffmpeg') or sys.exit('ffmpeg 를 찾지 못했어요. SEEON_FFMPEG 환경 변수로 경로를 알려 주세요.')


FF = ffmpeg_exe()


def font_dir():
    cands = [os.environ.get('SEEON_FONT_DIR'), Path(os.environ.get('LOCALAPPDATA', '.')) / 'Microsoft' / 'Windows' / 'Fonts',
             'C:/Windows/Fonts', Path.home() / '.fonts', Path.home() / 'Library' / 'Fonts', '/usr/share/fonts/truetype/pretendard']
    for c in cands:
        if c and (Path(c) / 'Pretendard-Bold.ttf').exists():
            return Path(c)
    sys.exit('Pretendard 글꼴(Pretendard-*.ttf)을 찾지 못했어요. SEEON_FONT_DIR 로 폴더를 알려 주세요.')


FONT_DIR = font_dir()
_fonts = {}


def font(weight, size):
    if (weight, size) not in _fonts:
        _fonts[weight, size] = ImageFont.truetype(str(FONT_DIR / f'Pretendard-{weight}.ttf'), size)
    return _fonts[weight, size]


def ease(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


def ramp(t, t0, t1, fade_in, fade_out):
    """t0 부터 fade_in 동안 나타나 t1 에 사라지는(그 전 fade_out 동안 옅어지는) 세기."""
    if t < t0 or t >= t1:
        return 0.0
    a = 1.0 if fade_in <= 0 else ease((t - t0) / fade_in)
    b = 1.0 if fade_out <= 0 else ease((t1 - t) / fade_out)
    return min(a, b)


# ── 글자 ──────────────────────────────────────────────────────────

def parse(markup):
    """'*굵게*', '{파랑}' 표시를 (글자, 굵게, 파랑) 조각으로 나눈다."""
    runs, buf, bold, blue = [], '', False, False
    for ch in markup:
        if ch in '*{}':
            if buf:
                runs.append((buf, bold, blue))
                buf = ''
            if ch == '*':
                bold = not bold
            else:
                blue = ch == '{'
        else:
            buf += ch
    if buf:
        runs.append((buf, bold, blue))
    return runs


def run_font(bold, blue, size, weight):
    return font('Bold' if (bold or blue) else weight, size)


def measure(markup, size, weight='Medium'):
    return sum(run_font(b, u, size, weight).getlength(s) for s, b, u in parse(markup))


def wrap(markup, size, maxw, weight='Medium'):
    """너무 긴 줄은 표시 밖 쉼표(없으면 빈칸) 가운데 한가운데에 가장 가까운 곳에서 두 줄로 나눈다."""
    out = []
    for line in markup.split('\n'):
        if measure(line, size, weight) <= maxw:
            out.append(line)
            continue
        bold = blue = False
        commas, spaces = [], []
        for i, ch in enumerate(line):
            if ch == '*':
                bold = not bold
            elif ch in '{}':
                blue = ch == '{'
            elif not (bold or blue) and ch == ',':
                commas.append(i + 1)
            elif not (bold or blue) and ch == ' ':
                spaces.append(i)
        cuts = commas or spaces
        mid = len(line) / 2
        cut = min(cuts, key=lambda i: abs(i - mid))
        out += [line[:cut].rstrip(), line[cut:].lstrip()]
    return out


def text_image(markup, size, *, color=WHITE, blue=BLUE, weight='Medium', line_gap=1.42, shadow=True, maxw=1100):
    """표시가 든 글을 가운데 맞춤 RGBA 그림으로. (그림, 파랑 조각들의 [글자, x0, x1, 밑줄 y]) 를 돌려준다."""
    lines = wrap(markup, size, maxw, weight)
    asc, desc = font(weight, size).getmetrics()
    lh = round(size * line_gap)
    pad = 12
    widths = [measure(l, size, weight) for l in lines]
    w = int(max(widths)) + pad * 2
    h = lh * (len(lines) - 1) + asc + desc + pad * 2
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    marks = []
    for i, (line, lw) in enumerate(zip(lines, widths)):
        x = pad + (w - pad * 2 - lw) / 2
        y = pad + asc + i * lh
        for s, b, u in parse(line):
            f = run_font(b, u, size, weight)
            d.text((x, y), s, font=f, fill=(blue if u else color) + (255,), anchor='ls')
            n = f.getlength(s)
            if u:
                marks.append((s, x, x + n, y + desc * 0.55))
            x += n
    if shadow:
        a = im.getchannel('A').filter(ImageFilter.GaussianBlur(3))
        sh = Image.new('RGBA', im.size, (0, 0, 0, 0))
        sh.putalpha(a.point(lambda v: int(v * 0.6)))
        base = Image.new('RGBA', im.size, (0, 0, 0, 0))
        base.alpha_composite(sh, (0, 2))
        base.alpha_composite(im)
        im = base
    return im, marks


# ── 그리기 ────────────────────────────────────────────────────────

class Sprite:
    def __init__(self, im):
        a = np.asarray(im.convert('RGBA'), dtype=np.float32)
        self.rgb = a[..., :3]
        self.a = a[..., 3:4] / 255.0
        self.h, self.w = a.shape[:2]


def put(canvas, sp, x, y, alpha=1.0, mask=None):
    """canvas(H×W×3, 0~255 실수) 위 (x, y) 에 sprite 를 alpha 세기로 얹는다. mask 는 가로 방향 곱(드러내기용)."""
    if alpha <= 0.003:
        return
    x, y = int(round(x)), int(round(y))
    x0, y0, x1, y1 = max(x, 0), max(y, 0), min(x + sp.w, W), min(y + sp.h, H)
    if x0 >= x1 or y0 >= y1:
        return
    a = sp.a[y0 - y:y1 - y, x0 - x:x1 - x] * alpha
    if mask is not None:
        a = a * mask[None, x0 - x:x1 - x, None]
    sub = canvas[y0:y1, x0:x1]
    sub *= 1 - a
    sub += sp.rgb[y0 - y:y1 - y, x0 - x:x1 - x] * a


def centered(sp, cy):
    return (W - sp.w) / 2, cy - sp.h / 2


# 가장자리를 살짝 누르는 비네트
_yy, _xx = np.mgrid[0:H, 0:W].astype(np.float32)
VIGNETTE = (1 - 0.38 * np.clip((((_xx - W / 2) / (W / 2)) ** 2 + ((_yy - H / 2) / (H / 2)) ** 2) / 2, 0, 1) ** 1.3)[..., None]


def probe_duration(path):
    out = subprocess.run([FF, '-hide_banner', '-i', str(path)], capture_output=True, text=True, errors='replace').stderr
    m = re.search(r'Duration: (\d+):(\d+):([\d.]+)', out)
    return int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3])


class Footage:
    """실사 한 토막. 어둡게 누르고(본선 인트로처럼) 천천히 다가간다. 토막보다 장면이 길면 느리게 튼다."""

    def __init__(self, name, t0, t1, *, start=0.0, zoom=(1.0, 1.07), pan=(0.0, 0.0), dim=0.42, sat=0.72, blur=0,
                 fade_in=0.6, fade_out=0.0):
        self.path = HERE / 'footage' / f'{name}.mp4'
        self.t0, self.t1, self.fi, self.fo = t0, t1, fade_in, fade_out
        self.zoom, self.pan, self.dim, self.sat, self.blur = zoom, pan, dim, sat, blur
        self.start = start
        room = probe_duration(self.path) - start - 0.15
        self.speed = min(1.0, room / (t1 - t0))
        self.proc, self.k, self.last = None, -1, None

    def alpha(self, t):
        return ramp(t, self.t0, self.t1, self.fi, self.fo)

    def frame(self, t):
        if self.proc is None:
            vf = (f'scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},'
                  f'setpts=PTS/{self.speed:.4f},fps={FPS}')
            self.proc = subprocess.Popen([FF, '-v', 'error', '-ss', f'{self.start}', '-i', str(self.path), '-vf', vf,
                                          '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                                         stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        want = int((t - self.t0) * FPS + 1e-6)
        while self.k < want:
            buf = self.proc.stdout.read(W * H * 3)
            if len(buf) < W * H * 3:
                break  # 토막 끝: 마지막 장면을 붙든다
            self.last = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
            self.k += 1
        u = (t - self.t0) / (self.t1 - self.t0)
        z = self.zoom[0] + (self.zoom[1] - self.zoom[0]) * u
        cw, ch = W / z, H / z
        cx = W / 2 + self.pan[0] * u * (W - cw) / 2
        cy = H / 2 + self.pan[1] * u * (H - ch) / 2
        im = Image.fromarray(self.last).resize((W, H), Image.BILINEAR, box=(cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2))
        if self.blur:
            im = im.filter(ImageFilter.GaussianBlur(self.blur))
        f = np.asarray(im, dtype=np.float32)
        g = f @ np.array([0.299, 0.587, 0.114], np.float32)
        f = (g[..., None] + (f - g[..., None]) * self.sat) * self.dim
        return f * VIGNETTE

    def close(self):
        if self.proc:
            self.proc.kill()
            self.proc = None


class Solid:
    def __init__(self, color, t0, t1, fade_in=0.8, fade_out=0.0):
        self.t0, self.t1, self.fi, self.fo = t0, t1, fade_in, fade_out
        self.color = np.array(color, np.float32)

    def alpha(self, t):
        return ramp(t, self.t0, self.t1, self.fi, self.fo)

    def frame(self, t):
        return self.color

    def close(self):
        pass


# ── 소리 ──────────────────────────────────────────────────────────

def load_audio(path):
    raw = subprocess.run([FF, '-v', 'error', '-i', str(path), '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).copy()


def frame_rms(a, hop=441):
    n = len(a) // hop
    return np.sqrt(np.mean(a[:n * hop].reshape(n, hop) ** 2, axis=1) + 1e-12)


def trim(a, floor_db=-38):
    """앞뒤 무음을 걷어 낸다(Edge·ElevenLabs 파일 모두 앞뒤에 빈 소리가 붙어 온다)."""
    r = frame_rms(a)
    on = np.nonzero(r > r.max() * 10 ** (floor_db / 20))[0]
    s = max(on[0] * 441 - int(0.03 * SR), 0)
    e = min((on[-1] + 1) * 441 + int(0.08 * SR), len(a))
    return a[s:e]


def level(a, target_db, floor_db=-40):
    """소리가 나는 부분의 평균 세기를 target_db(dBFS)에 맞춘다."""
    r = frame_rms(a)
    on = r[r > r.max() * 10 ** (floor_db / 20)]
    return a * (10 ** (target_db / 20) / np.sqrt(np.mean(on ** 2)))


def beat_period(a):
    """박자 길이(초)를 어림한다. 음악을 이어 붙일 때 마디를 맞추려고 쓴다."""
    hop = 441
    n = len(a) // hop
    spec = np.abs(np.fft.rfft(a[:n * hop].reshape(n, hop) * np.hanning(hop), axis=1))
    flux = np.maximum(np.diff(np.log1p(spec * 50), axis=0), 0).sum(axis=1)
    flux -= flux.mean()
    ac = np.correlate(flux, flux, 'full')[len(flux) - 1:]
    lo, hi = int(0.3 * 100), int(1.0 * 100)
    return (lo + int(np.argmax(ac[lo:hi]))) / 100


def fit_music(y, need, a, b, xf=0.5):
    """음악을 need 초로 맞춘다. 모자라면 [a, b) 를 마디 단위로 이어 붙여 늘리고, 끝은 원래 끝맺음(b 뒤)으로 맺는다."""
    n = int(need * SR)
    if len(y) >= n:
        return y[:n]
    bar = 4 * beat_period(y)
    b = a + max(1, int((b - a) / bar)) * bar          # 이어 붙이는 구간을 마디의 정수배로(b 를 넘지 않게)
    A, B, X = int(a * SR), int(b * SR), int(xf * SR)
    seg, tail = y[A:B], y[B:]
    fade = np.sqrt(np.linspace(0, 1, X, dtype=np.float32))

    def join(head, nxt):
        mid = head[-X:] * fade[::-1] + nxt[:X] * fade
        return np.concatenate([head[:-X], mid, nxt[X:]])

    out = y[:B]
    while len(out) - X + len(tail) < n:
        out = join(out, seg)
    out = join(out[:n - len(tail) + X], tail)
    return out[:n]


def split_voice(path, ids):
    """한 파일에 이어 읽은 내레이션을 가장 긴 쉼 len(ids)-1 곳에서 잘라 voice/<id>.mp3 로 저장한다.
    ElevenLabs 에서 대본 전체를 한 번에 만들었을 때 쓴다(줄 사이를 1초쯤 쉬어 읽게 한다)."""
    a = load_audio(path)
    r = frame_rms(a)
    quiet = r < r.max() * 10 ** (-38 / 20)
    gaps, i = [], 0
    while i < len(quiet):
        j = i
        while j < len(quiet) and quiet[j]:
            j += 1
        if j > i and i > 0 and j < len(quiet):
            gaps.append((j - i, i, j))
        i = max(j, i + 1)
    gaps.sort(reverse=True)
    need = len(ids) - 1
    if len(gaps) < need:
        sys.exit(f'쉼이 {len(gaps)}곳뿐이라 {len(ids)}줄로 나눌 수 없어요. 줄 사이를 쉬어 읽은 파일인지 봐 주세요.')
    cuts = sorted(gaps[:need], key=lambda g: g[1])
    bounds = [0] + [(g[1] + g[2]) // 2 * 441 for g in cuts] + [len(a)]
    (HERE / 'voice').mkdir(exist_ok=True)
    for k, s, e in zip(ids, bounds, bounds[1:]):
        subprocess.run([FF, '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-c:a', 'libmp3lame',
                        '-b:a', '160k', str(HERE / 'voice' / f'{k}.mp3')], input=a[s:e].tobytes(), check=True)
        print(f'  {k}  {len(trim(a[s:e])) / SR:5.2f}초')
    shortest = gaps[need - 1][0] / 100
    longest_left = gaps[need][0] / 100 if len(gaps) > need else 0
    print(f'  자른 쉼 가운데 가장 짧은 것 {shortest:.2f}초, 남긴 쉼 가운데 가장 긴 것 {longest_left:.2f}초')
    if longest_left > shortest * 0.75:
        print('  ※ 줄 사이 쉼과 문장 안 쉼의 길이가 비슷해요. 줄이 제대로 나뉘었는지 --still 이나 영상으로 확인해 주세요.')
    made = HERE / 'voice' / '_made.json'
    if made.exists():  # 임시 음성 도구가 덮어쓰지 않게 표시를 지운다
        m = json.loads(made.read_text(encoding='utf-8'))
        made.write_text(json.dumps({k: v for k, v in m.items() if k not in ids}, ensure_ascii=False, indent=1), encoding='utf-8')


# ── 줄거리 ────────────────────────────────────────────────────────

def build():
    script = json.loads((HERE / 'script.json').read_text(encoding='utf-8'))
    lines = {l['id']: l for l in script['lines']}
    order = [l['id'] for l in script['lines']]
    voice = {}
    for k in order:
        path = HERE / 'voice' / f'{k}.mp3'
        if not path.exists():
            sys.exit(f'{path} 가 없어요. python tools/story_tts.py 로 임시 음성을 먼저 만들어 주세요.')
        voice[k] = level(trim(load_audio(path)), -19)
    T, t = {}, LEAD
    for k in order:
        T[k] = (t, t + len(voice[k]) / SR)
        t = T[k][1] + GAP.get(k, 0.5)
    total = t
    S = lambda k: T[k][0]  # noqa: E731
    E = lambda k: T[k][1]  # noqa: E731
    dur = lambda k: E(k) - S(k)  # noqa: E731

    def said_at(k, word):
        """줄 k 에서 word 를 말하는 때를 글자 수로 어림한다."""
        say = lines[k]['say']
        i = say.index(word)
        count = lambda s: len(re.sub(r'[\s“”‘’\'"]', '', s)) + 2.5 * s.count(',')  # noqa: E731
        return S(k) + dur(k) * count(say[:i]) / count(say)

    # 바탕(뒤에 적은 것이 위에 덮인다)
    bg = [
        Footage('meeting', 0.0, S('n2') + 0.3, fade_in=0.9, zoom=(1.0, 1.08), pan=(0.3, 0)),
        Footage('presenter', S('n2') - 0.45, S('n3') + 0.45, fade_in=0.6, fade_out=1.0, zoom=(1.04, 1.12), pan=(0.4, -0.2)),
        Footage('braille', S('n4') - 0.4, S('n5') + 0.4, fade_in=0.8, zoom=(1.0, 1.1), pan=(-0.3, 0)),
        Footage('blind', S('n5') - 0.45, E('n5') + 0.95, fade_in=0.6, fade_out=1.0, zoom=(1.0, 1.08)),
        Footage('headphones', E('n6') + 0.15, E('n7') + 1.3, fade_in=0.9, zoom=(1.0, 1.08), pan=(0.3, 0)),
        Solid(PAPER, E('n7') + 0.25, total + 1, fade_in=0.9),
    ]

    # 얹는 것들
    art = lambda n: Sprite(Image.open(HERE / 'art' / f'{n}.png'))  # noqa: E731
    mark, logo_open, logo_end = art('logo_mark'), art('logo_open'), art('logo_end')
    q_white, q_blue = art('quote_white'), art('quote_blue')
    over = []

    def watermark(c, t):
        a = max(ramp(t, 0.6, S('n6') - 0.5, 0.6, 0.6), ramp(t, E('n6') + 0.5, E('n7') + 0.4, 0.6, 0.5))
        put(c, mark, W - mark.w - 26, 20, a)
    over.append(watermark)

    # n2·n3: 손글씨 인용. 글씨 쓰듯 왼쪽부터 드러나고, n3 에서 '여기'를 말할 때 파랗게.
    q_t0, q_t1 = S('n2') - 0.2, min(E('n3') + 0.45, S('n4') - 0.4)  # 다음 장면이 들어오기 전에 사라진다
    t_blue = said_at('n3', '여기')
    qx, qy = (W - q_white.w) / 2, 268
    cols = np.arange(q_white.w, dtype=np.float32)

    def quote(c, t):
        a = ramp(t, q_t0, q_t1, 0.15, 0.5)
        if a <= 0:
            return
        p = ease((t - q_t0) / 1.0)
        edge = 60.0
        mask = np.clip((p * (q_white.w + edge) - cols) / edge, 0, 1)
        put(c, q_white, qx, qy, a, mask)
        put(c, q_blue, qx, qy, a * ramp(t, t_blue - 0.05, q_t1, 0.3, 0.5), mask)
    over.append(quote)

    # 아래 자막: 내레이션을 그대로(가운데 글이 따로 있는 n2·n6·n8 은 빼고)
    caps = []
    for i, k in enumerate(order):
        cap = lines[k].get('cap')
        if not cap or k in ('n6', 'n8'):
            continue
        nxt = S(order[i + 1]) - 0.08 if i + 1 < len(order) else total
        im, _ = text_image(cap, 30)
        caps.append((Sprite(im), S(k) - 0.05, min(E(k) + 0.3, nxt)))

    def captions(c, t):
        for sp, t0, t1 in caps:
            a = ramp(t, t0, t1, 0.18, 0.25)
            if a > 0:
                put(c, sp, (W - sp.w) / 2, H - 52 - sp.h + 12, a)
    over.append(captions)

    # n4: 92% (설문 24명 중 22명)
    stat_label = Sprite(text_image('설문에 답한 시각장애인 24명 중 22명', 24, color=(225, 230, 240))[0])
    nums = {}

    def stat(c, t):
        a = ramp(t, S('n4') + 0.05, E('n4') + 0.35, 0.4, 0.4)
        if a <= 0:
            return
        v = round(92 * ease((t - S('n4') - 0.15) / 1.3))
        if v not in nums:
            nums[v] = Sprite(text_image(f'{v}{{%}}', 132, weight='Bold')[0])
        sp = nums[v]
        rise = 10 * (1 - ease((t - S('n4') - 0.05) / 0.5))
        put(c, sp, (W - sp.w) / 2, 205 + rise, a)
        put(c, stat_label, (W - stat_label.w) / 2, 372 + rise, a)
    over.append(stat)

    # n6: 검은 화면에 로고 + 가운데 글
    n6_text = Sprite(text_image(lines['n6']['cap'], 34, weight='SemiBold')[0])

    def pivot(c, t):
        a = ramp(t, S('n6') - 0.55, E('n6') + 0.45, 0.7, 0.45)
        rise = 8 * (1 - ease((t - S('n6') + 0.55) / 0.7))
        put(c, logo_open, (W - logo_open.w) / 2, 238 + rise, a)
        put(c, n6_text, (W - n6_text.w) / 2, 336 + rise, ramp(t, S('n6') + 0.1, E('n6') + 0.45, 0.5, 0.45))
    over.append(pivot)

    # n8: 끝 화면
    end_text = Sprite(text_image(lines['n8']['cap'], 24, color=INK, shadow=False)[0])

    def endcard(c, t):
        a = ramp(t, E('n7') + 0.75, total + 1, 0.7, 0)
        put(c, logo_end, (W - logo_end.w) / 2, 280, a)
        put(c, end_text, (W - end_text.w) / 2, 384, ramp(t, S('n8') - 0.1, total + 1, 0.6, 0))
    over.append(endcard)

    # 소리
    mix = np.zeros(int((total + 0.5) * SR), np.float32)
    speech_on = np.zeros_like(mix)
    for k in order:
        i = int(S(k) * SR)
        mix[i:i + len(voice[k])] += voice[k]
        speech_on[i:i + len(voice[k])] = 1
    # 말하는 동안 음악을 낮춘다(0.25초 부드럽게)
    k = int(0.25 * SR)
    run = np.concatenate([[0.0], np.cumsum(speech_on, dtype=np.float64)])
    idx = np.clip(np.arange(len(mix)) + k // 2, 0, len(mix))
    duck = (1 - 0.5 * (run[idx] - run[np.clip(idx - k, 0, len(mix))]) / k).astype(np.float32)

    def lay(y, at):
        i = int(at * SR)
        seg = y[:len(mix) - i]
        mix[i:i + len(seg)] += seg * duck[i:i + len(seg)]

    problem = level(load_audio(HERE / 'music' / 'problem.mp3'), -27)
    p_end = E('n5') + 1.6
    problem = fit_music(problem, p_end, 1.0, 14.0)
    problem[-int(1.4 * SR):] *= np.linspace(1, 0, int(1.4 * SR), dtype=np.float32) ** 2
    problem[:int(0.5 * SR)] *= np.linspace(0, 1, int(0.5 * SR), dtype=np.float32)
    lay(problem, 0.0)
    s_at = S('n6') - 0.35
    solution = level(load_audio(HERE / 'music' / 'solution.mp3'), -26)
    solution = fit_music(solution, total + 0.5 - s_at, 1.2, 10.0)
    lay(solution, s_at)
    mix[-int(1.2 * SR):] *= np.linspace(1, 0, int(1.2 * SR), dtype=np.float32)
    peak = np.abs(mix).max()
    if peak > 0.89:
        mix *= 0.89 / peak

    return bg, over, mix, total, T


def render(canvas_t, bg, over):
    c = np.zeros((H, W, 3), np.float32)
    for layer in bg:
        a = layer.alpha(canvas_t)
        if a > 0:
            f = layer.frame(canvas_t)
            c *= 1 - a
            c += f * a
    for draw in over:
        draw(c, canvas_t)
    return c


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--still', type=float, nargs='*', help='이 시각(초)들의 장면만 PNG 로 만든다')
    ap.add_argument('--out', default=str(OUT), help='영상 파일(또는 --still 일 때 PNG 를 둘 폴더)')
    ap.add_argument('--voice', help='대본 전체를 이어 읽은 내레이션 한 파일. 줄마다 나눠 voice/ 에 넣고 영상을 만든다')
    args = ap.parse_args()
    if args.voice:
        script = json.loads((HERE / 'script.json').read_text(encoding='utf-8'))
        split_voice(args.voice, [line['id'] for line in script['lines']])
    bg, over, mix, total, T = build()
    print('길이 %.2f초' % total)
    for k, (s, e) in T.items():
        print(f'  {k}  {s:6.2f} ~ {e:6.2f}')
    if args.still:
        out = Path(args.out)
        out.mkdir(parents=True, exist_ok=True)
        for ts in args.still:
            for layer in bg:  # 처음부터 다시 읽는다
                layer.close()
                layer.k = -1
            c = render(ts, bg, over)
            Image.fromarray(np.clip(c, 0, 255).astype(np.uint8)).save(out / f'still_{ts:05.2f}.png')
        print('PNG →', out)
        return
    out = Path(args.out)
    wav = out.with_suffix('.wav')
    with wave.open(str(wav), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes())
    n = int(round(total * FPS))
    enc = subprocess.Popen([FF, '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
                            '-i', '-', '-i', str(wav), '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p',
                            '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-shortest', str(out)], stdin=subprocess.PIPE)
    for i in range(n):
        t = i / FPS
        c = render(t, bg, over)
        enc.stdin.write(np.clip(c, 0, 255).astype(np.uint8).tobytes())
        for layer in bg:
            if isinstance(layer, Footage) and t > layer.t1:
                layer.close()
        if i % (FPS * 5) == 0:
            print(f'  {t:5.1f}s', flush=True)
    enc.stdin.close()
    enc.wait()
    wav.unlink()
    for layer in bg:
        layer.close()
    print('만듦 →', out, f'({out.stat().st_size / 1e6:.1f}MB)')


if __name__ == '__main__':
    main()
