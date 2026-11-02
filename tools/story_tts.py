"""체험 「시온 STORY」 내레이션의 임시 음성을 만든다(Microsoft Edge 신경망 음성, edge-tts).

tools/story/script.json 의 lines[].say 를 script.json 의 voice 음성으로 읽어 tools/story/voice/<id>.mp3 로 저장한다.
진짜 내레이션은 ElevenLabs 로 만든다(tools/elevenlabs_story.py 또는 tools/story/README.md). 이 도구는 ElevenLabs 파일이
없을 때 화면을 맞춰 보려고 쓰는 것이라, ElevenLabs 로 만든 파일은 덮어쓰지 않는다(voice/_made.json 에 적힌 것만 다시 만든다).

    pip install edge-tts
    python tools/story_tts.py
    python tools/story_video.py      # 그다음 영상을 다시 만든다
"""
import asyncio
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent / 'story'
VOICE = HERE / 'voice'
MADE = VOICE / '_made.json'


async def main():
    import edge_tts

    data = json.loads((HERE / 'script.json').read_text(encoding='utf-8'))
    VOICE.mkdir(exist_ok=True)
    voice, rate = data['voice']['name'], data['voice'].get('rate', '+0%')
    made = json.loads(MADE.read_text(encoding='utf-8')) if MADE.exists() else {}
    for line in data['lines']:
        path = VOICE / f"{line['id']}.mp3"
        key = f"{voice}|{rate}|{line['say']}"
        if path.exists() and (line['id'] not in made or made[line['id']] == key):
            continue  # 직접 넣은 파일(ElevenLabs)이거나, 이미 같은 문장으로 만든 임시 음성
        await edge_tts.Communicate(line['say'], voice, rate=rate).save(str(path))
        made[line['id']] = key
        print('made', line['id'])
    MADE.write_text(json.dumps(made, ensure_ascii=False, indent=1), encoding='utf-8')


if __name__ == '__main__':
    asyncio.run(main())
