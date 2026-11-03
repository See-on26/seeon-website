"""체험에서 트는 소리(발표 영상·해설 음성·소개 영상)의 크기를 한 기준으로 맞춘다.

발표 영상은 녹음한 곳마다 소리 크기가 많게는 20 dB 넘게 달랐다. 파일마다 EBU R128 통합 라우드니스(LUFS)를 재서
TARGET 에 오도록 파일 전체에 같은 배율을 곱한다. 키운 봉우리가 CEILING 을 넘는 파일만 리미터로 그 봉우리를 누른다.

- 발표 영상(clips/*.mp4): visitor.json 에서 실제로 트는 구간(들어보기·탐지·이해도 듣기와 정답 장면)만 이어 잰다.
  화면은 그대로 두고 소리만 다시 넣는다.
- 해설 음성(ad/*.mp3)·소개 영상(story/story.mp4): 파일 전체를 잰다.
- 일부러 하는 크기 조절은 그대로 둔다. 파일 전체에 같은 배율만 곱하므로 소개 영상 안의 내레이션·음악 비율,
  말할 때 음악을 줄이는 것, 처음·끝 페이드가 남는다. 해설 동안 원음을 줄이는 것(visitor.js 의 duck)은 재생할 때 하는 일이라 손대지 않는다.
- 이미 기준에서 TOLERANCE 안이면 다시 만들지 않는다. make_ad.py·story_video.py 도 새로 만든 파일을 이 기준에 맞춘다.

    python tools/level_audio.py           # 맞춘다
    python tools/level_audio.py --check   # 재기만 한다
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

EXP = Path(__file__).resolve().parent.parent / 'src' / 'experience'
DATA = EXP / 'data' / 'visitor'
STORY = EXP / 'story' / 'story.mp4'

TARGET = -16.0    # LUFS. 말소리 위주 웹 영상에 흔히 쓰는 크기라 노트북 스피커로도 또렷하다
CEILING = -1.5    # dBTP. 키운 봉우리가 이보다 크면 리미터로 누른다
TOLERANCE = 0.5   # LU. 이 안이면 다시 만들지 않는다


def ffmpeg_exe():
    if os.environ.get('SEEON_FFMPEG'):  # Windows 는 환경 변수 이름의 대소문자를 가리지 않아 FFMPEG 는 다른 것과 겹친다
        return os.environ['SEEON_FFMPEG']
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        return shutil.which('ffmpeg') or sys.exit('ffmpeg 를 찾지 못했어요. SEEON_FFMPEG 환경 변수로 경로를 알려 주세요.')


FF = ffmpeg_exe()


def ffmpeg_log(args):
    return subprocess.run([FF, '-hide_banner', *args], capture_output=True, text=True, encoding='utf-8', errors='replace').stderr


def measure(path, spans=None):
    """통합 라우드니스(LUFS)와 트루 피크(dBTP)를 잰다. spans 가 있으면 그 구간들만 이어 잰다."""
    af = 'ebur128=peak=true'
    if spans:
        sel = '+'.join(f'between(t,{s:.3f},{e:.3f})' for s, e in spans)
        af = f"aselect='{sel}',asetpts=N/SR/TB,{af}"
    log = ffmpeg_log(['-nostats', '-i', str(path), '-map', '0:a:0', '-af', af, '-f', 'null', '-'])
    summary = log[log.rindex('Summary:'):]
    lufs = float(re.search(r'I:\s+(-?[\d.]+) LUFS', summary).group(1))
    peak = float(re.search(r'Peak:\s+(-?[\d.]+) dBFS', summary).group(1))
    return lufs, peak


def audio_filter(lufs, peak):
    """TARGET 에 맞추는 ffmpeg 소리 필터. 키운 봉우리가 CEILING 을 넘을 때만 리미터를 단다."""
    gain = TARGET - lufs
    af = f'volume={gain:.2f}dB'
    if peak + gain > CEILING:
        # 리미터는 표본 봉우리를 보므로 표본 사이 봉우리·다시 누를 때 생기는 넘침 몫으로 0.5 dB 더 낮춘다
        af += f',alimiter=limit={10 ** ((CEILING - 0.5) / 20):.4f}:attack=5:release=50:level=false:latency=true'
    return af


def rewrite(src, dst, af):
    """src 의 소리에 af 를 걸어 같은 형식으로 dst 에 쓴다. 영상 화면은 손대지 않고 그대로 옮긴다."""
    info = ffmpeg_log(['-i', str(src)])
    m = re.search(r'Audio: \w+.*?, (\d+) Hz, (mono|stereo).*?, (\d+) kb/s', info)
    rate, ch, kbps = m.group(1), '1' if m.group(2) == 'mono' else '2', m.group(3)
    if src.suffix == '.mp4':
        codec = ['-map', '0:v:0', '-map', '0:a:0', '-c:v', 'copy', '-c:a', 'aac', '-movflags', '+faststart']
    else:
        codec = ['-map', '0:a:0', '-c:a', 'libmp3lame']
    subprocess.run([FF, '-v', 'error', '-y', '-i', str(src), *codec, '-af', af, '-ar', rate, '-ac', ch, '-b:a', f'{kbps}k',
                    str(dst)], check=True)


def level(path, spans=None, check=False):
    lufs, peak = measure(path, spans)
    name = path.relative_to(EXP).as_posix()
    if abs(lufs - TARGET) <= TOLERANCE:
        print(f'  {name:30s} {lufs:6.1f} LUFS  봉우리 {peak:5.1f} dBTP  그대로')
        return
    if check:
        print(f'  {name:30s} {lufs:6.1f} LUFS  봉우리 {peak:5.1f} dBTP  {TARGET - lufs:+.1f} dB 필요')
        return
    # 다시 누르면 고음이 조금 깎이고(24 kHz mp3) 리미터도 조금 줄이므로, 모자란 만큼 더 키워 원본에서 다시 만든다
    src = path.with_name(path.stem + '.orig' + path.suffix)
    os.replace(path, src)
    try:
        want = lufs
        for _ in range(3):
            rewrite(src, path, audio_filter(want, peak))
            after, tp = measure(path, spans)
            if abs(after - TARGET) <= 0.1:
                break
            want += after - TARGET
    except BaseException:
        os.replace(src, path)
        raise
    src.unlink()
    print(f'  {name:30s} {lufs:6.1f} → {after:6.1f} LUFS  봉우리 {tp:5.1f} dBTP')


def played_spans(data):
    """발표 영상마다 체험에서 실제로 트는 구간."""
    spans = {k: [] for k in data['clips']}
    demo = data['demo']
    spans[demo['clip']].append((demo['start'], demo['end']))
    for it in data['detection']:
        spans[it['clip']].append((it.get('context', {}).get('start', it['start']), it['end']))
    for it in data['comprehension']:
        spans[it['clip']].append((it['start'], it['end']))
        if 'reveal' in it:
            spans[it['clip']].append((it['reveal']['start'], it['reveal']['end']))
    return spans


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--check', action='store_true', help='재기만 하고 파일은 그대로 둔다')
    args = ap.parse_args()
    data = json.loads((DATA / 'visitor.json').read_text(encoding='utf-8'))
    print(f'기준 {TARGET} LUFS(±{TOLERANCE}), 봉우리 {CEILING} dBTP 아래')
    print('발표 영상 — 트는 구간만 잰다')
    for k, spans in played_spans(data).items():
        level(DATA / data['clips'][k]['video'], spans or None, args.check)
    print('해설 음성')
    for path in sorted((DATA / 'ad').glob('*.mp3')):
        level(path, None, args.check)
    print('소개 영상')
    level(STORY, None, args.check)


if __name__ == '__main__':
    main()
