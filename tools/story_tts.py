"""체험 「시온 이야기」 슬라이드의 내레이션을 음성 파일로 만든다.

src/experience/story/story.json 의 slides[].say 를 story/<id>.mp3 로 저장한다(Microsoft Edge 신경망 음성, edge-tts).
문장이나 목소리가 바뀐 장만 다시 만든다(story/_made.json).

    pip install edge-tts
    python tools/story_tts.py
"""
import asyncio
import json
from pathlib import Path

import edge_tts

STORY = Path(__file__).resolve().parent.parent / 'src' / 'experience' / 'story'
MADE = STORY / '_made.json'


async def main():
    data = json.loads((STORY / 'story.json').read_text(encoding='utf-8'))
    voice, rate = data['voice']['name'], data['voice'].get('rate', '+0%')
    made = json.loads(MADE.read_text(encoding='utf-8')) if MADE.exists() else {}
    for slide in data['slides']:
        key = f"{voice}|{rate}|{slide['say']}"
        path = STORY / f"{slide['id']}.mp3"
        if made.get(slide['id']) == key and path.exists():
            continue
        await edge_tts.Communicate(slide['say'], voice, rate=rate).save(str(path))
        made[slide['id']] = key
        print('made', slide['id'])
    MADE.write_text(json.dumps(made, ensure_ascii=False, indent=1), encoding='utf-8')


if __name__ == '__main__':
    asyncio.run(main())
