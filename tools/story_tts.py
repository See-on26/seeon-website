"""체험 「시온 STORY」 내레이션의 임시 음성을 만든다(Microsoft Edge 신경망 음성, edge-tts).

src/experience/story/story.json 의 lines[].say 를 story/<id>.mp3 로 저장한다.
진짜 음성은 ElevenLabs 로 만든다(tools/elevenlabs_story.py 또는 story/README.md). 이 도구는 ElevenLabs 파일이
없을 때 화면을 맞춰 보려고 쓰는 것이라, ElevenLabs 로 만든 파일은 덮어쓰지 않는다(story/_made.json 에 적힌 것만 다시 만든다).

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
    for line in data['lines']:
        path = STORY / f"{line['id']}.mp3"
        key = f"{voice}|{rate}|{line['say']}"
        if path.exists() and (line['id'] not in made or made[line['id']] == key):
            continue  # 직접 넣은 파일(ElevenLabs)이거나, 이미 같은 문장으로 만든 임시 음성
        await edge_tts.Communicate(line['say'], voice, rate=rate).save(str(path))
        made[line['id']] = key
        print('made', line['id'])
    MADE.write_text(json.dumps(made, ensure_ascii=False, indent=1), encoding='utf-8')


if __name__ == '__main__':
    asyncio.run(main())
