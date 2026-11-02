# 시온 STORY 영상 만들기

체험 1단계 「시온 STORY」에서 트는 `src/experience/story/story.mp4` 의 재료와 만드는 방법이에요. 본선 제출 영상 인트로의 꼴을 따라요. 어둡게 누른 실사 위에 흰 자막과 파란 강조, 가운데 손글씨 인용, 오른쪽 위 작은 로고, 끝은 흰 화면에 로고예요. 이야기는 **문제 → 시온** 순서이고, **30초 안쪽**으로 맞춰요.

## 흐름 (임시 음성으로 약 29초)

| 줄 | 화면 | 목소리 | 문장 |
| --- | --- | --- | --- |
| `n1` | 노트북 화상회의 | 내레이터 | 발표자는 화면을 띄우고 말합니다. |
| `n2` | 검은 화면 가운데 손글씨 “여기가 중요한 부분 입니다.”만 크게 | **발표자** | “여기가 중요한 부분입니다.” |
| `n3` | 같은 화면, ‘여기’가 파랗게 바뀜 | 내레이터 | 하지만 화면을 볼 수 없다면, ‘여기’는 어디일까요? |
| `n4` | 점자를 읽는 손, 92%(설문 24명 중 22명) | 내레이터 | 시각장애인 열에 아홉은, 회의 흐름을 놓치면 따라가기 어렵다고 말합니다. |
| `n5` | 검은 화면에 시온 로고 | 내레이터 | 시온은 말로 채워지지 않은 화면의 빈자리를, 소리로 채웁니다. |
| `n6` | 헤드폰을 쓰고 노트북을 쓰는 사람 | 내레이터 | 말이 멈춘 틈에, 화면을 음성으로 설명합니다. |
| `n7` | 흰 끝 화면에 로고 | 내레이터 | 화상회의 화면 음성 해설, 시온을 소개합니다. |

92%·24명 중 22명은 최종 보고서의 설문(2026년 7~8월, 시각장애인 24명)이에요.

영상 길이는 내레이션 길이에 맞춰 정해져요. 30초를 넘으면 줄 사이 쉼부터 줄이고, 쉼을 다 줄여도 넘으면 경고를 띄워요. 그때는 ElevenLabs 의 속도(Speed)를 1.1쯤으로 올려 다시 만들어요.

## 내레이션 — ElevenLabs

`voice/n1.mp3 … n7.mp3` 는 **임시 음성(Microsoft Edge)** 이에요. 내레이터는 여성(SunHi), 발표자 `n2` 는 남성(InJoon)이에요. ElevenLabs 음성으로 바꾸면 줄마다 길이를 재서 장면과 자막 시간을 다시 맞춰요. 따로 고칠 것은 없어요.

**내레이터(6줄)와 발표자(1줄)를 서로 다른 목소리로 따로 만들어요.**

### 1. 내레이터 — 한 파일로 받기 (ElevenLabs 대화창 · 무료 요금제)

아래를 그대로 붙여 넣고, 나온 파일 하나를 받아 다음처럼 넣어요. 줄 사이의 긴 쉼 5곳을 찾아 `n1, n3, n4, n5, n6, n7` 로 나눠 넣고 영상을 다시 만들어요.

```bash
python tools/story_video.py --voice 받은파일.mp3
```

```text
한국어 내레이션 보이스오버를 하나 만들어 주세요.

- 목소리: 30대 여성, 차분하고 따뜻한 다큐멘터리 내레이터. 또렷하게, 보통 빠르기로.
- 버전은 1개만 만들어 주세요.
- 아래 대본을 순서대로 그대로 읽어 주세요. 문장을 고치거나 덧붙이지 마세요.
- 줄과 줄 사이에서는 1초쯤 쉬고, 줄 안의 쉼표에서는 짧게만 쉬어 주세요.
- 마지막 줄은 소개하듯 또렷하게 맺어 주세요.

대본:

발표자는 화면을 띄우고 말합니다.

하지만 화면을 볼 수 없다면, ‘여기’는 어디일까요?

시각장애인 열에 아홉은, 회의 흐름을 놓치면 따라가기 어렵다고 말합니다.

시온은 말로 채워지지 않은 화면의 빈자리를, 소리로 채웁니다.

말이 멈춘 틈에, 화면을 음성으로 설명합니다.

화상회의 화면 음성 해설, 시온을 소개합니다.
```

나눈 뒤에 "줄 사이 쉼과 문장 안 쉼의 길이가 비슷해요" 가 나오면 줄이 잘못 나뉘었을 수 있어요. 영상을 보고 자막과 소리가 어긋나면 줄마다 따로 받아요.

### 2. 발표자 — 한 줄 (내레이터와 다른 목소리)

받은 파일을 `tools/story/voice/n2.mp3` 로 넣어요.

```text
한국어 보이스오버를 하나 만들어 주세요.

- 목소리: 30~40대 남성, 회의에서 화면을 가리키며 발표하는 사람. 자신 있고 밝게, 말하듯 자연스럽게.
- 버전은 1개만 만들어 주세요.
- 아래 한 문장만 그대로 읽어 주세요. 앞뒤에 다른 말을 붙이지 마세요.

여기가 중요한 부분입니다.
```

### 줄마다 받기 (Text to Speech · API)

ElevenLabs → Text to Speech, 모델은 **Eleven Multilingual v2**. 위 표의 문장(`script.json` 의 `say`)을 한 줄씩 넣어 만들고(`n2` 만 발표자 목소리), 파일 이름을 `n1.mp3` … `n7.mp3` 로 바꿔 `tools/story/voice/` 에 덮어써요. 그다음 `python tools/story_video.py`.

API로 한꺼번에 만들 때:

```bash
set ELEVENLABS_API_KEY=발급받은_키
set ELEVENLABS_VOICE_ID=내레이터_목소리_ID
set ELEVENLABS_PRESENTER_VOICE_ID=발표자_목소리_ID
python tools/elevenlabs_story.py          # 고른 줄만: python tools/elevenlabs_story.py n2 n4
python tools/story_video.py
```

ElevenLabs 로 넣은 파일(어느 방법이든)은 임시 음성 도구(`tools/story_tts.py`)가 덮어쓰지 않아요.

## 영상 만들기

```bash
python tools/story_tts.py       # 빠진 음성만 임시 음성으로 채운다
python tools/story_video.py     # → src/experience/story/story.mp4
python build.py
```

`python tools/story_video.py --still 3 7 12 --out 폴더` 로 그 순간들만 PNG 로 뽑아 볼 수 있어요. 줄 사이 쉬는 시간은 `story_video.py` 의 `GAP` 이에요.

필요한 것: numpy, Pillow, ffmpeg(libx264. `imageio-ffmpeg` 가 깔려 있으면 그 ffmpeg 를 쓰고, 다른 것을 쓰려면 `SEEON_FFMPEG` 에 경로), Pretendard 글꼴(못 찾으면 `SEEON_FONT_DIR`).

## 재료

- `script.json` — 대본(`say`), 화면에 박는 자막(`cap`, `*굵게*`, `{파랑}`, 줄바꿈 `\n`), 목소리(`voice` 내레이터, `presenter` 발표자, 줄의 `speaker`).
- `art/quote_white.png`, `art/quote_blue.png` — 본선 제출 영상(1080p)에서 오려 낸 손글씨 인용. ‘여기’가 흰 판과 파란 판이에요. `art/logo_*.png` 는 지금 로고(720p 크기).
- `music/safe_future_intro_30s.mp3` — 배경 음악 "Safe Future - Quiet Piano Intro (30 seconds)", 캡스톤 인트로용으로 편곡한 곡이에요. 피아노 음원은 Salamander Grand Piano(Alexander Holm, CC BY 3.0)예요. 말하는 동안에는 소리를 낮춰요.
- `footage/` — Pexels 무료 영상(Pexels License, 출처 표기 없이 쓸 수 있어요). 9초씩 잘라 720p·무음으로 다시 인코딩했어요.

| 파일 | Pexels |
| --- | --- |
| `meeting.mp4` | 5486225 (cottonbro studio) — 노트북 화상회의 |
| `braille.mp4` | 10140877 (cottonbro studio) — 점자를 읽는 손 |
| `headphones.mp4` | 5704050 — 헤드폰을 쓰고 노트북을 쓰는 사람 |
