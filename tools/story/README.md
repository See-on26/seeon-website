# 시온 STORY 영상 만들기

체험 1단계 「시온 STORY」에서 트는 `src/experience/story/story.mp4` 의 재료와 만드는 방법이에요. 본선 제출 영상 인트로의 꼴을 따라요. 어둡게 누른 실사 위에 가운데 손글씨 인용, 흰 자막과 파란 강조, 오른쪽 위 작은 로고, 끝은 흰 화면에 로고예요. 이야기는 **문제 → 시온** 순서예요.

## 흐름 (임시 음성으로 약 47초)

| 줄 | 화면 | 내레이션 |
| --- | --- | --- |
| `n1` | 노트북 화상회의 | 화상회의에서 발표자는 화면을 띄우고 이렇게 말합니다. |
| `n2` | 차트 앞의 발표자, 손글씨 “여기가 중요한 부분 입니다.” | “여기가 중요한 부분입니다.” |
| `n3` | 검은 화면, 손글씨의 ‘여기’가 파랗게 바뀜 | 하지만 화면을 볼 수 없다면, ‘여기’는 어디일까요? |
| `n4` | 점자를 읽는 손, 92%(설문 24명 중 22명) | 시각장애인 열에 아홉은, 회의 흐름을 한 번 놓치면 다시 따라가기 어렵다고 말합니다. |
| `n5` | 탁자 앞에 앉은 시각장애인 | 그래서 회의 중에 옆 사람에게 묻거나, 회의가 끝난 뒤에야 내용을 확인합니다. |
| `n6` | 검은 화면에 시온 로고 | 시온은 말로 채워지지 않은 화면의 빈자리를, 소리로 채우고자 합니다. |
| `n7` | 공유 화면(막대그래프)과 발표자 말 “여기를 보시면, 이만큼 늘었죠.”, ‘여기’·‘이만큼’에 파란 밑줄 | 발표자의 말에서, 화면을 봐야만 알 수 있는 순간을 찾고, |
| `n8` | 같은 화면 | 말이 멈춘 틈에, 그 화면을 음성으로 설명합니다. |
| `a1` | 시온 AD 상자, 2025 막대가 파랗게 빛나고 +30% | (시온 AD) 2025년 매출, 1년 전보다 30% 늘었어요. |
| `n9` | 흰 끝 화면에 로고 | 화상회의 화면 음성 해설, 시온을 소개합니다. |

92%·24명 중 22명은 최종 보고서의 설문(2026년 7~8월, 시각장애인 24명)이에요. “옆 사람에게 묻거나, 회의가 끝난 뒤에야”도 같은 설문의 답(8명, 12명)이에요.

## 내레이션 — ElevenLabs

`voice/n1.mp3 … n9.mp3` 는 **임시 음성(Microsoft Edge)** 이에요. ElevenLabs 로 만든 파일을 **같은 이름으로 `tools/story/voice/` 에 덮어쓰고** 영상을 다시 만들면, 줄마다 길이를 재서 장면과 자막 시간을 다시 맞춰요. 따로 고칠 것은 없어요. `a1.mp3`(시온 AD)는 체험의 해설과 같은 음성이어야 해서 ElevenLabs 로 만들지 않아요.

- 톤: 차분한 여성 내레이터, 다큐멘터리처럼. `n2` 는 발표자의 말을 옮기는 부분이라 살짝 다른 톤(인용)으로 읽어요.
- 형식: mp3. 앞뒤 무음은 영상 도구가 걷어 내요.

**웹에서**: ElevenLabs → Text to Speech, 모델은 **Eleven Multilingual v2**. 위 표의 문장(`script.json` 의 `say`)을 한 줄씩 넣어 만들고, 파일 이름을 `n1.mp3` … `n9.mp3` 로 바꿔 넣어요.

**API로 한꺼번에**:

```bash
set ELEVENLABS_API_KEY=발급받은_키
set ELEVENLABS_VOICE_ID=고른_목소리_ID
python tools/elevenlabs_story.py          # 고른 줄만: python tools/elevenlabs_story.py n2 n4
```

ElevenLabs 로 넣은 파일은 임시 음성 도구(`tools/story_tts.py`)가 덮어쓰지 않아요.

## 영상 만들기

```bash
python tools/story_tts.py       # 빠진 음성만 임시 음성으로 채운다
python tools/story_video.py     # → src/experience/story/story.mp4
python build.py
```

`python tools/story_video.py --still 3 14 39.5 --out 폴더` 로 그 순간들만 PNG 로 뽑아 볼 수 있어요. 줄 사이 쉬는 시간은 `story_video.py` 의 `GAP` 이에요.

필요한 것: numpy, Pillow, ffmpeg(libx264. `imageio-ffmpeg` 가 깔려 있으면 그 ffmpeg 를 쓰고, 다른 것을 쓰려면 `SEEON_FFMPEG` 에 경로), Pretendard 글꼴(못 찾으면 `SEEON_FONT_DIR`).

## 재료

- `script.json` — 대본(`say`)과 화면에 박는 자막(`cap`, `*굵게*`, `{파랑}`, 줄바꿈 `\n`).
- `art/quote_white.png`, `art/quote_blue.png` — 본선 인트로에서 오려 낸 손글씨 인용. ‘여기’가 흰 판과 파란 판이에요. `art/logo_*.png` 는 지금 로고(720p 크기).
- `music/problem.mp3`(문제 부분, 잔잔한 피아노)와 `music/solution.mp3`(시온 부분, "Clean and confident") — 본선 영상을 만들 때 쓴 BGM 폴더의 곡이에요. 장면보다 짧으면 마디 단위로 이어 붙여 늘리고, 말하는 동안에는 소리를 낮춰요.
- `footage/` — Pexels 무료 영상(Pexels License, 출처 표기 없이 쓸 수 있어요). 9초씩 잘라 720p·무음으로 다시 인코딩했어요.

| 파일 | Pexels |
| --- | --- |
| `meeting.mp4` | 5486225 (cottonbro studio) — 노트북 화상회의 |
| `presenter.mp4` | 6285682 — 차트를 가리키며 발표하는 사람 |
| `blind.mp4` | 10140872 (cottonbro studio) — 탁자 앞에 앉은 시각장애인 |
| `braille.mp4` | 10140877 (cottonbro studio) — 점자를 읽는 손 |
| `headphones.mp4` | 5704050 — 헤드폰을 쓰고 노트북을 쓰는 사람 |
