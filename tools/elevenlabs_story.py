"""체험 「시온 STORY」 내레이션을 ElevenLabs 로 한꺼번에 만든다.

src/experience/story/story.json 의 lines[].say 를 ElevenLabs 음성으로 읽어 story/<id>.mp3 로 저장한다.
API 키와 목소리 ID 는 환경 변수로 준다(저장소에 넣지 않는다).

    set ELEVENLABS_API_KEY=...            (PowerShell: $env:ELEVENLABS_API_KEY="...")
    set ELEVENLABS_VOICE_ID=...           ElevenLabs Voice Library 에서 고른 목소리의 ID
    python tools/elevenlabs_story.py              # 전부
    python tools/elevenlabs_story.py n2 n4        # 고른 줄만

웹에서 직접 만들 때는 story/README.md 의 표를 보고 같은 이름으로 저장하면 된다.
"""
import json
import os
import sys
import urllib.request
from pathlib import Path

STORY = Path(__file__).resolve().parent.parent / 'src' / 'experience' / 'story'
MADE = STORY / '_made.json'
MODEL = os.environ.get('ELEVENLABS_MODEL', 'eleven_multilingual_v2')
SETTINGS = {'stability': 0.55, 'similarity_boost': 0.8, 'style': 0.15, 'use_speaker_boost': True}


def speak(text, voice_id, key, path):
    req = urllib.request.Request(
        f'https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128',
        data=json.dumps({'text': text, 'model_id': MODEL, 'voice_settings': SETTINGS, 'language_code': 'ko'}).encode('utf-8'),
        headers={'xi-api-key': key, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg'},
        method='POST',
    )
    with urllib.request.urlopen(req) as res:
        path.write_bytes(res.read())


def main():
    key = os.environ.get('ELEVENLABS_API_KEY')
    voice_id = os.environ.get('ELEVENLABS_VOICE_ID')
    if not key or not voice_id:
        sys.exit('ELEVENLABS_API_KEY 와 ELEVENLABS_VOICE_ID 를 먼저 정해 주세요.')
    data = json.loads((STORY / 'story.json').read_text(encoding='utf-8'))
    only = set(sys.argv[1:])
    made = json.loads(MADE.read_text(encoding='utf-8')) if MADE.exists() else {}
    for line in data['lines']:
        if only and line['id'] not in only:
            continue
        speak(line['say'], voice_id, key, STORY / f"{line['id']}.mp3")
        made.pop(line['id'], None)  # 임시 음성 도구(story_tts.py)가 덮어쓰지 않게 표시를 지운다
        print('made', line['id'], line['say'])
    MADE.write_text(json.dumps(made, ensure_ascii=False, indent=1), encoding='utf-8')


if __name__ == '__main__':
    main()
