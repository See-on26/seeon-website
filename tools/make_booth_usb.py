"""부스 노트북(Windows)에 USB 로 넘겨줄 폴더를 만든다. 인터넷도 Python 도 없이 일반객 체험을 키오스크로 띄운다.

- docs/ 를 통째로 <폴더>/site/ 로 복사한다(체험 화면이 ../images/ 도 쓰므로 사이트 전체를 넣는다).
- tools/booth_usb/ 의 시작.bat·끝내기.bat·자동 시작 켜기/끄기.bat·server/booth.ps1·사용법.txt 를 넣는다.
  booth.ps1 은 Windows PowerShell 5.1 의 HttpListener 로 Range 를 받는 로컬 서버를 켜고,
  Chrome(없으면 Edge) 키오스크로 experience/visitor.html 을 띄운다.
- .bat 은 BOM 없는 UTF-8(cmd 가 BOM 을 못 읽는다), .ps1·.txt 는 BOM 있는 UTF-8(PowerShell 5.1·메모장용), 줄 끝은 CRLF 로 쓴다.
- 사이트가 바깥 주소에서 무엇을 불러오는지 훑어 알린다(부스는 인터넷 없이 돌아야 한다).

    python build.py                      # docs/ 를 먼저 최신으로
    python tools/make_booth_usb.py       # ../seeon-booth-usb/ 에 만든다
    python tools/make_booth_usb.py --out E:/seeon-booth-usb
"""
import argparse
import re
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / 'docs'
TEMPLATE = Path(__file__).resolve().parent / 'booth_usb'
DEFAULT_OUT = ROOT.parent / 'seeon-booth-usb'
PAGE = 'experience/visitor.html'
MARK = 'server/booth.ps1'  # 이 파일이 있으면 이 스크립트가 만든 폴더로 보고 덮어쓴다

# 페이지가 바깥 주소에서 무언가를 불러오는 꼴. <a href> 같은 링크는 누르지 않으면 불러오지 않으니 뺀다.
EXTERNAL = [
    re.compile(r'<(?:script|img|source|video|audio|iframe|embed|track)\b[^>]*\bsrc\s*=\s*["\']?((?:https?:)?//[^"\'\s>]+)', re.I),
    re.compile(r'<link\b[^>]*\bhref\s*=\s*["\']?((?:https?:)?//[^"\'\s>]+)', re.I),
    re.compile(r'url\(\s*["\']?((?:https?:)?//[^"\')\s]+)', re.I),
    re.compile(r'@import\s+["\']((?:https?:)?//[^"\']+)', re.I),
    re.compile(r'(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\bfetch\s*\(\s*)["\'`]((?:https?:)?//[^"\'`]+)'),
]


def git(*args):
    try:
        return subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return ''


def write_text(src, dst, replace=None):
    text = src.read_text(encoding='utf-8-sig')
    for key, value in (replace or {}).items():
        text = text.replace(key, value)
    text = text.replace('\r\n', '\n').replace('\n', '\r\n')
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(text, encoding='utf-8' if src.suffix.lower() in ('.bat', '.cmd') else 'utf-8-sig', newline='')


def external_loads(site):
    found = []
    for path in sorted(site.rglob('*')):
        if path.suffix.lower() not in ('.html', '.js', '.mjs', '.css', '.svg'):
            continue
        text = path.read_text(encoding='utf-8', errors='replace')
        for pattern in EXTERNAL:
            for m in pattern.finditer(text):
                if 'www.w3.org/' not in m.group(1):  # SVG 이름공간, 불러오지 않는다
                    found.append((path.relative_to(site).as_posix(), m.group(1)))
    return sorted(set(found))


def size_mb(folder):
    return sum(p.stat().st_size for p in folder.rglob('*') if p.is_file()) / 1e6


def main():
    ap = argparse.ArgumentParser(description='부스 노트북용 USB 폴더를 만든다.')
    ap.add_argument('--out', type=Path, default=DEFAULT_OUT, help=f'만들 폴더 (기본 {DEFAULT_OUT})')
    args = ap.parse_args()
    out = args.out.resolve()

    if not (DOCS / PAGE).exists():
        sys.exit(f'{DOCS / PAGE} 가 없어요. 먼저 python build.py 를 돌리세요.')
    if out == ROOT or ROOT in out.parents:
        sys.exit(f'저장소 안에는 만들지 않아요: {out}')
    if out.exists() and any(out.iterdir()) and not (out / MARK).exists():
        sys.exit(f'{out} 에 다른 파일이 있어요. 비어 있는 폴더나 새 경로를 고르세요.')

    # 이 스크립트가 넣는 것만 지우고 다시 넣는다(사용자가 둔 다른 파일은 남는다).
    templates = sorted(p for p in TEMPLATE.rglob('*') if p.is_file() and '__pycache__' not in p.parts)
    for p in [out / 'site', out / 'server'] + [out / t.relative_to(TEMPLATE) for t in templates]:
        if p.is_dir():
            shutil.rmtree(p)
        elif p.exists():
            p.unlink()
    out.mkdir(parents=True, exist_ok=True)
    shutil.copytree(DOCS, out / 'site')

    commit = git('rev-parse', '--short', 'HEAD')
    dirty = ' (커밋 안 한 변경 포함)' if git('status', '--porcelain', '--', 'docs') else ''
    build = f'{date.today():%Y-%m-%d} · 사이트 {commit or "?"}{dirty}'
    for t in templates:
        write_text(t, out / t.relative_to(TEMPLATE), {'{{BUILD}}': build})

    print(f'{out}  ({size_mb(out):.1f} MB, {build})')
    for t in templates:
        print(f'  {t.relative_to(TEMPLATE).as_posix()}')
    print(f'  site/  ← docs/ ({size_mb(out / "site"):.1f} MB)')

    loads = external_loads(out / 'site')
    if loads:
        print('\n바깥 주소에서 불러오는 것 — 인터넷 없이는 안 보여요:')
        for page, url in loads:
            print(f'  {page}: {url}')
        if any(page.startswith('experience/') for page, _ in loads):
            print('  ↑ 체험 화면(experience/)에 있어요. 부스에서 빠질 수 있으니 로컬 파일로 바꾸세요.')
    else:
        print('\n바깥 주소에서 불러오는 것 없음 — 인터넷 없이 돌아가요.')


if __name__ == '__main__':
    main()
