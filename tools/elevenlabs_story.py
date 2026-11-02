"""체험 「시온 STORY」 내레이션을 ElevenLabs 로 한꺼번에 만든다.

tools/story/script.json 의 lines[].say 를 ElevenLabs 음성으로 읽어 tools/story/voice/<id>.mp3 로 저장한다.
목소리 ID 는 script.json 의 voice.elevenlabs(내레이터)와 presenter.elevenlabs(발표자, speaker 가 presenter 인 줄)에 있다.
API 키는 저장소에 넣지 않고 환경 변수 ELEVENLABS_API_KEY 로 준다. Windows 에서 setx 로 정해 두면 이미 떠 있는
터미널에서도 읽는다.

    setx ELEVENLABS_API_KEY 발급받은_키           (한 번만. PowerShell 이면 $env:ELEVENLABS_API_KEY="..." 로 그 창에서만)
    python tools/elevenlabs_story.py              # 전부
    python tools/elevenlabs_story.py n2 n4        # 고른 줄만
    python tools/story_video.py                   # 그다음 영상을 다시 만든다

목소리를 잠깐 바꿔 보려면 ELEVENLABS_VOICE_ID(내레이터)·ELEVENLABS_PRESENTER_VOICE_ID(발표자)를 정한다.
웹에서 직접 만들 때는 tools/story/README.md 의 요청문을 쓴다.
"""
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent / 'story'
VOICE = HERE / 'voice'
MADE = VOICE / '_made.json'
MODEL = os.environ.get('ELEVENLABS_MODEL', 'eleven_multilingual_v2')
SETTINGS = {'stability': 0.55, 'similarity_boost': 0.8, 'style': 0.15, 'use_speaker_boost': True}


def api_key():
    key = os.environ.get('ELEVENLABS_API_KEY')
    if not key and sys.platform == 'win32':  # setx 로 정한 값은 이미 떠 있는 터미널에 안 보이므로 사용자 환경 변수에서 읽는다
        import winreg
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, 'Environment') as k:
                key = winreg.QueryValueEx(k, 'ELEVENLABS_API_KEY')[0]
        except OSError:
            pass
    return key


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
    key = api_key()
    if not key:
        sys.exit('ELEVENLABS_API_KEY 를 먼저 정해 주세요(setx ELEVENLABS_API_KEY 발급받은_키).')
    data = json.loads((HERE / 'script.json').read_text(encoding='utf-8'))
    voices = {'voice': os.environ.get('ELEVENLABS_VOICE_ID') or data['voice'].get('elevenlabs'),
              'presenter': os.environ.get('ELEVENLABS_PRESENTER_VOICE_ID') or data.get('presenter', {}).get('elevenlabs')}
    VOICE.mkdir(exist_ok=True)
    only = set(sys.argv[1:])
    made = json.loads(MADE.read_text(encoding='utf-8')) if MADE.exists() else {}
    try:
        for line in data['lines']:
            if only and line['id'] not in only:
                continue
            voice_id = voices.get(line.get('speaker', 'voice'))
            if not voice_id:
                print('skip', line['id'], '— script.json 에 이 목소리의 elevenlabs ID 가 없어요')
                continue
            speak(line['say'], voice_id, key, VOICE / f"{line['id']}.mp3")
            made.pop(line['id'], None)  # 임시 음성 도구(story_tts.py)가 덮어쓰지 않게 표시를 지운다
            print('made', line['id'], line['say'])
    except urllib.error.HTTPError as err:
        print(f"ElevenLabs 가 {line['id']} 에서 {err.code} 로 거절했어요: {err.read().decode('utf-8', 'replace')[:400]}")
        print('키가 맞는지, 크레딧이 남았는지, 그 목소리를 API 로 쓸 수 있는 요금제인지 확인해 주세요. 앞서 만든 줄은 그대로 둬요.')
        sys.exit(1)
    finally:
        MADE.write_text(json.dumps(made, ensure_ascii=False, indent=1), encoding='utf-8')


if __name__ == '__main__':
    main()
