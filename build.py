"""시온 소개 사이트를 src/ 조각으로 조립해 docs/ 에 GitHub Pages 용 정적 사이트를 만든다.

- 페이지마다 src/sec/ 의 섹션을 이어 붙이고, 머리줄·바닥글·페이지 머리는 여기서 만든다.
- 스타일·스크립트·글꼴은 docs/assets/ 의 파일 하나씩을 모든 페이지가 함께 쓴다.
- 글꼴은 Pretendard 에서 사이트에 쓰는 글자만 남겨 woff2 로 만든다.
  OFL 의 예약 글꼴 이름(Pretendard) 때문에 줄인 글꼴은 이름을 SeeonText 로 바꾼다.

    pip install -r requirements.txt
    python build.py
"""
import html
import re
import shutil
from pathlib import Path

from fontTools import subset

ROOT = Path(__file__).parent
SRC = ROOT / 'src'
OUT = ROOT / 'docs'
FONT_SRC = ROOT / 'fonts' / 'PretendardVariable.woff2'
FONT_LICENSE = ROOT / 'fonts' / 'Pretendard-LICENSE.txt'
FAMILY = 'SeeonText'
FONT_FILE = 'assets/fonts/SeeonText.woff2'
KEEP = {'CNAME'}  # GitHub 설정에서 맞춤 도메인을 넣으면 docs/CNAME 이 생긴다. 다시 빌드해도 지우지 않는다.
EMAIL = 'seeon0708@gmail.com'
TAGLINE = '발표자가 말하지 않은 화면 정보를 찾아, 회의 흐름을 끊지 않는 때에 짧게 들려주는 시각장애인용 화상회의 화면해설이에요.'

NAV = [
    ('experience', 'experience.html', '체험'),
    ('features', 'features.html', '기능'),
    ('technology', 'technology.html', '기술'),
    ('about', 'about.html', '팀 소개'),
    ('faq', 'faq.html', '자주 묻는 질문'),
]


def read(name):
    return (SRC / name).read_text(encoding='utf-8')


def section(name):
    return read(f'sec/{name}.html')


MARK = read('logo-mark.svg')
WORD = read('logo-word.svg')


def header(current):
    items = []
    for key, href, label in NAV:
        cur = ' aria-current="page"' if key == current else ''
        items.append(f'        <li><a href="{href}"{cur}>{label}</a></li>')
    items.append('        <li class="pill"><a href="easy.html">쉬운 안내</a></li>')
    return f'''<header class="site-head" id="site-head">
  <div class="wrap head-row">
    <a class="brand" href="index.html" aria-label="시온 첫 화면">
      {MARK}
      {WORD}
    </a>
    <button class="menu-btn" type="button" id="menu-btn" aria-expanded="false" aria-controls="site-nav"><span class="bars3" aria-hidden="true"></span><span class="sr">메뉴 열기</span></button>
    <nav class="nav" id="site-nav" aria-label="주 메뉴">
      <ul>
{chr(10).join(items)}
      </ul>
    </nav>
  </div>
</header>'''


FOOTER = f'''<footer class="site-foot">
  <div class="wrap">
    <div class="foot-top">
      <div class="foot-brand">
        <span style="display:inline-flex;align-items:center;gap:10px" aria-label="시온 SEEON">
          {MARK}
          {WORD}
        </span>
        <p class="foot-slogan">보이지 않는 화면을, 소리로 듣다.</p>
        <p>{TAGLINE}</p>
      </div>
      <div class="foot-cols">
        <div>
          <h2>둘러보기</h2>
          <ul>{''.join(f'<li><a href="{href}">{label}</a></li>' for key, href, label in NAV[:4])}</ul>
        </div>
        <div>
          <h2>안내</h2>
          <ul><li><a href="easy.html">쉬운 안내</a></li><li><a href="faq.html">자주 묻는 질문</a></li></ul>
        </div>
      </div>
    </div>
    <div class="foot-meta">
      <dl class="foot-company">
        <div><dt>팀</dt><dd>시온(SEEON, 視溫)</dd></div>
        <div><dt>대표</dt><dd>김지오</dd></div>
        <div><dt>이메일</dt><dd><a href="mailto:{EMAIL}">{EMAIL}</a></dd></div>
      </dl>
      <div class="foot-credit">
        <span>© 2026 시온</span>
        <span>사진: The Dafu, Compare Fibre, Reynier Carl, Compagnons, Christina @ wocintechchat.com · <a href="https://unsplash.com" rel="noopener">Unsplash</a></span>
        <span>글꼴: Pretendard(SIL OFL 1.1)에서 이 사이트에 쓰는 글자만 남겨 썼어요</span>
      </div>
    </div>
  </div>
</footer>'''


def page_head(label, title, sub, jumps):
    links = ''.join(f'<li><a href="#{anchor}">{text}</a></li>' for anchor, text in jumps)
    jump = f'\n      <ul class="ph-jump" aria-label="이 페이지의 내용">{links}</ul>' if jumps else ''
    return f'''  <section class="page-head" aria-labelledby="ph-title">
    <div class="wrap ph-inner">
      <p class="sec-label">{label}</p>
      <h1 id="ph-title">{title}</h1>
      <p class="sec-sub">{sub}</p>{jump}
    </div>
  </section>
'''


def subpage(file, nav, label, h1, sub, jumps, body, desc=None):
    return dict(file=file, title=f'{label} · 시온', nav=nav, desc=desc or sub,
                body=page_head(label, h1, sub, jumps) + body)


def drop_sec_head(html_text):
    return re.sub(r'\n      <div class="sec-head">.*?\n      </div>', '', html_text, count=1, flags=re.S)


how = section('how')
metrics = re.search(r'      <dl class="metrics two">.*?</dl>\n      <p class="fine">.*?</p>', how, re.S).group(0)
how = how.replace('<dl class="metrics two">', '<dl class="metrics two" id="numbers">').replace('<div class="privacy">', '<div class="privacy" id="privacy">')
together = section('together').replace('<div class="next">', '<div class="next" id="next">').replace('<dl class="team">', '<dl class="team" id="team">')

HOME_NUMBERS = f'''  <section class="sec alt" id="numbers" aria-labelledby="numbers-h">
    <div class="wrap">
      <div class="sec-head">
        <p class="sec-label">성능</p>
        <h2 id="numbers-h">찾아야 할 자리를 찾고, 비어 있던 이해를 채워요</h2>
      </div>
{metrics}
      <a class="more" href="technology.html#numbers">어떻게 쟀는지 자세히 보기</a>
    </div>
  </section>
'''

HOME_GO = '''  <section class="sec" id="go" aria-labelledby="go-h">
    <div class="wrap">
      <div class="sec-head">
        <p class="sec-label">둘러보기</p>
        <h2 id="go-h">시온을 더 알아보세요</h2>
      </div>
      <div class="go">
        <a href="experience.html"><span class="k">체험</span><b>눈을 감고 회의를 들어 보세요</b><p>예시 회의를 시온 없이, 또 시온과 함께 들어 보고, 시온이 언제 말할지 직접 골라 봐요.</p><span class="arr" aria-hidden="true">들어 보기 →</span></a>
        <a href="features.html"><span class="k">기능</span><b>말이 비는 순간에, 꼭 필요한 만큼만</b><p>가리킨 곳, 숫자의 뜻, 크기, 화면 전환까지 시온이 말해 주는 순간들과 듣는 방식을 모았어요.</p><span class="arr" aria-hidden="true">기능 보기 →</span></a>
        <a href="technology.html"><span class="k">기술</span><b>언제 말하지 않을지를 먼저 정했어요</b><p>판단과 해설이 이루어지는 다섯 단계, 성능, 회의 내용을 다루는 방식을 적었어요.</p><span class="arr" aria-hidden="true">기술 보기 →</span></a>
        <a href="about.html"><span class="k">팀 소개</span><b>쓰실 분들의 이야기에서 시작했어요</b><p>시각장애인 24명의 설문과 11명의 인터뷰, 만든 사람들, 앞으로의 계획이에요.</p><span class="arr" aria-hidden="true">팀 소개 보기 →</span></a>
      </div>
    </div>
  </section>
'''

PAGES = {
    'index': dict(
        file='index.html', title='시온 · 시각장애인을 위한 화상회의 화면해설', nav=None, desc=TAGLINE,
        body=section('top') + section('why') + HOME_NUMBERS + HOME_GO,
    ),
    'experience': subpage(
        'experience.html', 'experience', '체험', '시온을 직접 들어 보세요',
        '예시 회의 장면을 시온 없이 한 번, 시온과 함께 한 번 들어 보세요. 시온이 어느 자리에서 말하고 어느 자리에서 넘어가는지도 직접 골라 볼 수 있어요.',
        [('demo', '예시 회의 듣기'), ('judge', '시온의 판단 맞혀 보기')],
        section('demo') + section('judge'),
    ),
    'features': subpage(
        'features.html', 'features', '기능', '시온이 말해 주는 순간들',
        '가리킨 곳, 숫자의 뜻, 크기처럼 화면에만 있는 정보를 짧게 들려줘요. 직접 묻고, 회의가 끝나면 기록으로 다시 들을 수도 있어요. 듣는 방식은 기기에 맞게 골라요.',
        [('features', '이럴 때 말해요'), ('listen', '듣는 방식')],
        section('features') + section('listen'),
    ),
    'technology': subpage(
        'technology.html', 'technology', '기술', '시온이 판단하고 말하는 방식',
        '화면을 살피고 회의를 받아 적는 것부터 안내를 들려주기까지 다섯 단계를 거쳐요. 성능과 회의 내용을 다루는 방식도 함께 적었어요.',
        [('how', '다섯 단계'), ('numbers', '성능'), ('privacy', '회의 내용을 다루는 방식')],
        how,
    ),
    'about': subpage(
        'about.html', 'about', '팀 소개', '쓰실 분들과 함께 만드는 팀',
        '시각장애인 24명의 이야기에서 시작했어요. 2026년 11월부터는 시제품 테스트에 동의해 주신 분들과 직접 써 보며 다듬어 가요.',
        [('together', '당사자의 이야기'), ('next', '앞으로의 계획'), ('team', '만든 사람들')],
        together,
    ),
    'faq': subpage(
        'faq.html', 'faq', '자주 묻는 질문', '궁금한 점을 모았어요',
        f'여기에 없는 내용은 {EMAIL}으로 물어봐 주세요.', [],
        drop_sec_head(section('faq')),
        desc='쓸 수 있는 회의, 필요한 기기, 회의 내용을 다루는 방식, 비용, 공개 일정처럼 시온에 대해 자주 묻는 질문을 모았어요.',
    ),
}

EASY_DESC = '그림이나 움직임 없이 글로만 시온을 안내하는 페이지예요. 화면 낭독 프로그램으로 읽기 쉽게 만들었어요.'

# 페이지마다 쓰는 기본 틀. 안전 영역 여백·[hidden]·글자 크기 고정을 먼저 두고 사이트 스타일을 잇는다.
RESET = (':root { color-scheme: light; padding-top: env(safe-area-inset-top, 0px); '
         'padding-bottom: env(safe-area-inset-bottom, 0px); }\n'
         'html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }\n'
         '[hidden] { display: none !important; }\n')


def font_face(url):
    return ('@font-face {\n  font-family: "' + FAMILY + '";\n  src: url("' + url + '") format("woff2");\n'
            '  font-weight: 45 920;\n  font-style: normal;\n  font-display: swap;\n}\n')


def head_meta(title, desc, extra=''):
    t, d = html.escape(title), html.escape(desc)
    return f'''<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{d}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="시온">
<meta property="og:locale" content="ko_KR">
<meta property="og:title" content="{t}">
<meta property="og:description" content="{d}">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#101318" media="(prefers-color-scheme: dark)">
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="preload" href="{FONT_FILE}" as="font" type="font/woff2" crossorigin>
{extra}'''


def compose(key):
    p = PAGES[key]
    extra = '<link rel="preload" href="images/hero.jpg" as="image" fetchpriority="high">\n' if key == 'index' else ''
    return f'''<!doctype html>
<html lang="ko">
<head>
{head_meta(p['title'], p['desc'], extra)}<link rel="stylesheet" href="assets/site.css">
</head>
<body>
<a class="skip" href="#main">본문 바로가기</a>

{header(p['nav'])}

<main id="main">
{p['body']}</main>

{FOOTER}

<script src="assets/site.js"></script>
</body>
</html>
'''


def compose_easy():
    easy = read('easy.html').replace('/*@FONT*/', font_face(FONT_FILE).rstrip('\n'))
    easy = easy.replace('<title>시온 쉬운 안내</title>\n', '')
    return easy.replace('<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n',
                        head_meta('쉬운 안내 · 시온', EASY_DESC), 1)


FAVICON = MARK.replace('<svg class="seeon-mark" viewBox="0 0 256 238" aria-hidden="true">',
                       '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -9 256 256">\n'
                       '  <style>svg { color: #0067f2; } @media (prefers-color-scheme: dark) { svg { color: #5aa9ff; } }</style>')


def subset_font(text, out):
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.name_languages = ['*']
    opts.notdef_outline = True
    font = subset.load_font(str(FONT_SRC), opts)
    sub = subset.Subsetter(opts)
    chars = set(text) | {chr(c) for c in range(0x20, 0x7f)} | set('“”‘’·…—–−→×%')
    sub.populate(unicodes={ord(c) for c in chars if ord(c) > 0x1f})
    sub.subset(font)
    # 예약 글꼴 이름 대신 새 이름을 쓴다. 저작권(0)·라이선스(13, 14) 문구는 그대로 둔다.
    for rec in font['name'].names:
        if rec.nameID in (1, 3, 4, 6, 16, 17, 21, 22, 25):
            s = rec.toUnicode()
            for old in ('Pretendard Variable', 'PretendardVariable', 'Pretendard'):
                s = s.replace(old, FAMILY)
            rec.string = s
    subset.save_font(font, str(out), opts)


def clean_out():
    OUT.mkdir(exist_ok=True)
    for item in OUT.iterdir():
        if item.name in KEEP:
            continue
        shutil.rmtree(item) if item.is_dir() else item.unlink()


def main():
    clean_out()
    (OUT / 'assets' / 'fonts').mkdir(parents=True)
    pages = {p['file']: compose(k) for k, p in PAGES.items()}
    pages['easy.html'] = compose_easy()
    for name, text in pages.items():
        (OUT / name).write_text(text, encoding='utf-8')

    css = RESET + read('style.css').replace('/*@FONT*/', font_face('fonts/SeeonText.woff2').rstrip('\n'))
    js = read('script.js')
    (OUT / 'assets' / 'site.css').write_text(css, encoding='utf-8')
    (OUT / 'assets' / 'site.js').write_text(js, encoding='utf-8')
    (OUT / 'assets' / 'favicon.svg').write_text(FAVICON, encoding='utf-8')
    subset_font(''.join(pages.values()) + css + js, OUT / FONT_FILE)
    shutil.copy(FONT_LICENSE, OUT / 'assets' / 'fonts' / 'LICENSE-Pretendard.txt')
    shutil.copytree(SRC / 'images', OUT / 'images')
    (OUT / '.nojekyll').write_text('', encoding='utf-8')

    for f in sorted(p for p in OUT.rglob('*') if p.is_file()):
        print(f'{f.relative_to(OUT).as_posix():40} {f.stat().st_size / 1024:7.1f} KB')


if __name__ == '__main__':
    main()
