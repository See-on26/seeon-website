"""일반객 체험의 해설 문장(src/experience/data/visitor/visitor.json)을 음성 파일(같은 폴더의 ad/<id>.mp3)로 만든다.

- 목소리는 visitor.json 의 voice.ad / voice.rate (Microsoft Edge 신경망 음성, edge-tts).
- 문장이나 목소리가 바뀐 줄만 다시 만든다(ad/_made.json 에 무엇으로 만들었는지 적어 둔다).
- 다른 TTS 로 바꾸려면 synthesize() 만 바꾸면 된다.

    pip install edge-tts
    python tools/make_ad.py          # 바뀐 것만
    python tools/make_ad.py --all    # 전부 다시
"""
import asyncio
import json
import sys
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent / 'src' / 'experience' / 'data' / 'visitor'
OUT = ROOT / 'ad'
MADE = OUT / '_made.json'


async def synthesize(text, voice, rate, path):
    await edge_tts.Communicate(text, voice, rate=rate).save(str(path))


async def main(redo_all):
    data = json.loads((ROOT / 'visitor.json').read_text(encoding='utf-8'))
    voice, rate = data['voice']['ad'], data['voice'].get('rate', '+0%')
    made = {} if redo_all or not MADE.exists() else json.loads(MADE.read_text(encoding='utf-8'))
    OUT.mkdir(exist_ok=True)
    wanted = {}
    for clip in data['clips'].values():
        for ad in clip['ad']:
            wanted[ad['id']] = ad['text']
    for ad_id, text in wanted.items():
        key = f'{voice}|{rate}|{text}'
        path = OUT / f'{ad_id}.mp3'
        if made.get(ad_id) == key and path.exists():
            continue
        await synthesize(text, voice, rate, path)
        made[ad_id] = key
        print('made', ad_id, text)
    for stale in set(made) - set(wanted):
        (OUT / f'{stale}.mp3').unlink(missing_ok=True)
        del made[stale]
        print('removed', stale)
    MADE.write_text(json.dumps(made, ensure_ascii=False, indent=1), encoding='utf-8')


if __name__ == '__main__':
    asyncio.run(main('--all' in sys.argv))
