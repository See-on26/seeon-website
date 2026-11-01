# 시온 소개 사이트

시각장애인을 위한 화상회의 화면해설 **시온(SEEON, 視溫)** 을 소개하는 정적 웹사이트예요. 설치나 다운로드 없이 소개만 해요. GitHub Pages로 바로 올릴 수 있게 `docs/` 에 완성된 사이트가 들어 있어요.

공개 주소: https://see-on26.github.io/seeon-website/ — `main` 브랜치에 올리면 1~2분 뒤 바뀌어요.

| 페이지 | 파일 | 내용 |
| --- | --- | --- |
| 홈 | `index.html` | 첫 화면, 만든 까닭(설문), 성능 두 가지, 각 페이지로 가는 길 |
| 체험 | `experience/` | seeon-eval-web 화면을 옮긴 체험 첫 화면 — 일반객(부스 체험) · 실험자 · 관리자 |
| 기능 | `features.html` | 시온이 말해 주는 순간 9가지, 듣는 방식(동시·교차) |
| 기술 | `technology.html` | 다섯 단계, 성능, 회의 내용을 다루는 방식 |
| 팀 소개 | `about.html` | 당사자의 이야기, 앞으로의 계획, 만든 사람들 |
| 자주 묻는 질문 | `faq.html` | 9개 질문 |
| 쉬운 안내 | `easy.html` | 그림·움직임 없이 글로만 읽는 안내 |

## 폴더 구성

```
seeon-website/
├─ docs/               ← GitHub Pages가 내보내는 완성본 (build.py가 만들어요. 직접 고치지 않아요)
│  ├─ *.html
│  ├─ assets/          site.css · site.js · favicon.svg · fonts/
│  ├─ images/
│  ├─ experience/      체험 (src/experience/ 를 그대로 복사)
│  └─ .nojekyll
├─ src/                ← 고칠 때는 여기를 고쳐요
│  ├─ sec/             페이지를 이루는 섹션 조각 (top, why, features, listen, how, together, faq)
│  ├─ style.css        사이트 전체 스타일
│  ├─ script.js        기능 탭, 듣는 방식 버튼, 메뉴 (예전 체험 플레이어·맞혀 보기 코드도 남아 있어요)
│  ├─ easy.html        쉬운 안내 페이지
│  ├─ logo-mark.svg, logo-word.svg
│  ├─ images/          사진 원본
│  └─ experience/      체험 — seeon-eval-web/public 을 옮긴 것과 일반객 체험(visitor.html, story/) (아래 「체험」 참고)
├─ archive/            사이트에 나오지 않는 임시 보관 (예전 체험 페이지: experience-v1/)
├─ fonts/              Pretendard Variable 원본과 라이선스
├─ build.py            src/ → docs/ 조립, 글꼴 줄이기
├─ tools/             story_tts.py(이야기 음성) · make_ad.py(해설 음성) · serve.py(부스용 로컬 서버)
├─ 부스 실행.bat        인터넷 없이 부스 노트북에서 일반객 체험 띄우기
└─ requirements.txt
```

## GitHub Pages로 올리기

1. GitHub에서 새 저장소를 만들어요. 예: `seeon-website`
2. 이 폴더를 그 저장소에 올려요.

   ```bash
   git init
   git add .
   git commit -m "시온 소개 사이트"
   git branch -M main
   git remote add origin https://github.com/<계정>/seeon-website.git
   git push -u origin main
   ```

3. 저장소의 **Settings → Pages** 에서 **Source** 를 **Deploy from a branch** 로, 브랜치를 **main**, 폴더를 **/docs** 로 고르고 저장해요.
4. 1~2분 뒤 `https://<계정>.github.io/seeon-website/` 에서 열려요.

모든 링크와 파일 경로가 상대 경로라서 저장소 이름이 달라도, 맞춤 도메인을 붙여도 그대로 동작해요. 맞춤 도메인을 넣으면 GitHub이 `docs/CNAME` 을 만드는데, 다시 빌드해도 이 파일은 지우지 않아요.

## 고치는 법

`src/` 를 고친 뒤 빌드해서 `docs/` 를 새로 만들고, 둘 다 커밋해요.

```bash
pip install -r requirements.txt
python build.py
```

- 머리줄 메뉴, 바닥글(팀·대표·이메일), 페이지 제목과 설명, 홈의 성능·둘러보기 섹션은 `build.py` 안에 있어요.
- 글꼴은 Pretendard에서 사이트에 쓰는 글자만 남겨 `docs/assets/fonts/SeeonText.woff2`(약 130KB)로 만들어요. 문구를 바꾸면 새 글자가 들어가도록 꼭 다시 빌드해 주세요. 빌드하지 않고 `docs/` 만 고치면 새로 넣은 글자가 다른 글꼴로 보일 수 있어요.
- 미리 보려면 `python -m http.server 8000 --directory docs` 를 실행하고 `http://localhost:8000` 을 열어요.

## 체험

상단 메뉴의 **체험**은 `experience/index.html` 로 가요. 평가 사이트(seeon-eval-web)의 화면을 2026-11-01 기준으로 옮겨 온 것이라 첫 화면에서 **일반객 · 실험자 · 관리자** 로 나뉘어요. 체험 첫 화면의 SEEON 로고를 누르면 소개 사이트 홈으로 돌아가요.

평가 사이트와 다른 점은 이래요(2026-11-02).

- 첫 화면의 카드는 **일반객 · 실험자** 두 개이고, **관리자**는 오른쪽 위의 작은 버튼으로 들어가요(사운드 버튼 자리).
- 카드와 체험 퀴즈 안내에 붙어 있던 01·02·03 번호는 뺐어요.
- 사운드(배경음, 카드에 올릴 때 나던 효과음)는 없앴어요. 체험 퀴즈의 듣기 소리는 그대로예요.
- 배경은 점 격자·파란 빛·떠다니는 글자 대신 소개 사이트와 같은 실사 사진(`images/`)이에요. 원래 있던 움직임은 이렇게 바꿨어요(`js/fx.js` 의 `startScene`, `startWaves`).

| 원래 | 지금 |
| --- | --- |
| 마우스를 따라오는 파란 빛 | 마우스 둘레만 사진이 밝아지고, 사진이 마우스 쪽으로 살짝 움직여요 |
| 카드에 올리면 파형이 커짐 | 카드나 관리자 버튼에 올리거나 Tab으로 고르면 배경이 그 갈래의 사진으로 바뀌어요 (일반객 `hero.jpg`, 실험자 `meeting.jpg`, 관리자 `braille.jpg`). 파형도 함께 커져요 |
| 화면 가운데의 파란 파형 | 아래쪽의 얇은 흰 파형. 마우스 위치와 카드에 반응하는 것은 그대로예요 |
| 떠다니는 SEEON 글자 | 사진이 천천히 다가오는 움직임 |

기본 사진은 `listen.jpg` 이고, 일반객 체험 화면도 같은 사진을 써요. 움직임 줄이기를 켠 기기에서는 사진이 움직이지 않아요.

GitHub Pages에는 평가 서버(Node·데이터베이스)가 없어서, 서버가 하던 답을 `src/experience/js/static-api.js` 가 대신 해요.

| 입구 | 공개 사이트에서 | 데이터 |
| --- | --- | --- |
| 일반객 | `visitor.html`. 아래 「일반객 체험」 흐름 전체가 공개 사이트에서도 그대로 동작해요 | `src/experience/data/visitor/` (영상·해설 음성·문항) |
| 실험자 | "지금은 실험 접수를 받지 않습니다" 화면이 나와요. 응답을 모을 서버가 없기 때문이에요 | 없음 |
| 관리자 | 로그인 화면은 그대로이고, 로그인하면 "이 공개 사이트에서는 관리자 기능을 쓸 수 없습니다"가 나와요 | 없음 |

**평가 데이터는 올리지 않았어요.** 데이터베이스(`data/seeon-eval.db`), 평가 영상·음성(`data/uploads/`), 평가 문항은 저장소에 없어요. 실험 안내 그림(`img/guide/`)도 외부 강의 영상 장면과 예시 문항이 담겨 있어 빼 두었어요. 실험자 화면이 공개 사이트에서 열리지 않으므로 지금은 쓰이지 않아요.

### 일반객 체험

`src/experience/visitor.html` · `js/visitor.js` · `css/visitor.css`. 한 사람에 3분쯤 걸려요. 첫 화면의 세 단계(시온 STORY → SEEON 들어보기 → 퀴즈)는 오른쪽이 뾰족한 화살표로 이어져 있어요.

1. **시온 STORY** — 실사 바탕 위에 내레이터가 들려주는 다큐 형식의 25~30초 영상이에요. 줄마다 내레이션(`story/n1.mp3` …)을 틀고, 그동안 장면을 천천히 움직이며 CC 자막(검은 바탕 흰 글씨)을 띄워요. 시작 5초 뒤 오른쪽 아래에 **건너뛰기**, 끝나면 아래에 **넘기기**가 나와요. 문장·장면은 `src/experience/story/story.json`. 내레이션은 ElevenLabs 로 만들어 같은 이름으로 덮어써요(`src/experience/story/README.md`, `tools/elevenlabs_story.py`). 지금 들어 있는 것은 임시 음성(`tools/story_tts.py`)이에요.
2. **SEEON 들어보기** — 소금 섭취량 영상의 "WHO에서 하루 권장량이…"부터 "저염식을 할 수 있을까?"까지를 1.4배속(해설도 1.4배속)으로, 화면과 함께 틀어요(15초 안쪽). 발표자 말은 흰 CC 자막, 시온 해설은 「(시온 AD)」를 붙인 한 줄 자막으로 나와요. 다 보면 **다음으로**를 눌러 넘어가요. 구간·속도는 `visitor.json` 의 `demo`, 자막은 `clips.salt.subs`.
3. **퀴즈** — 예상 시간(약 1분 30초)을 위에 적고, 빈자리 찾기 5문제(글·소리로 내고 트리거 낱말은 파란색) 또는 화면 없이 듣고 맞히기 1문제(보기 4개) 중 하나를 골라요. 해설 자막은 「(시온 AD)」를 붙여 한 줄로 나와요.
4. **완료** — "STAFF에게 이 화면을 보여 주고 간식 뽑기에 참여하세요". 처음으로는 1초 길게 눌러야 돌아가요.

- 왼쪽 위 **처음으로** 를 누르면 체험 중 어느 화면에서든 일반객 첫 화면으로 돌아가요(첫 화면과 완료 화면에서는 숨어요). 실험자 화면 왼쪽 위의 처음으로는 체험 첫 화면으로 가요.
- STAFF 키: `Esc` 2초 = 처음으로, `S` = 지금 단계 건너뛰기(점검용, 간식 안내를 띄우지 않아요). 아무것도 고르지 않아도 저절로 처음으로 돌아가지는 않아요.

**데이터** — `src/experience/data/visitor/`

| 파일 | 내용 |
| --- | --- |
| `visitor.json` | 영상별 해설(시각·문장·방식 pause/duck), 탐지 문장 12개, 이해도 문항 9개 |
| `clips/<id>.mp4` | 영상 7개: salt(효과 들어 보기), ramen·aircon·dino·cards·pancake·jelly(퀴즈) — 사람 제거·공유화면 편집본 |
| `ad/<id>.mp3` | 해설 음성 11개. 해설은 시온 실제 출력이 아니라 시연용으로 사람이 쓴 문장이에요 |

해설 문장이나 목소리(`voice.ad`)를 바꾸면 `python tools/make_ad.py` 로 음성을 다시 만들어요(`pip install edge-tts`, 바뀐 것만 만들어요. 전부 다시는 `--all`).

**부스에서 띄우기** — 인터넷이 되면 공개 주소의 `experience/visitor.html` 을 Chrome 키오스크로 열면 돼요. 인터넷 없이 띄우려면 이 저장소를 받아 `부스 실행.bat` 을 더블클릭해요. `tools/serve.py`(영상 중간으로 건너뛸 수 있게 Range 요청을 받는 로컬 서버)로 `docs/` 를 열고 Chrome 키오스크 화면을 띄워요. Python 3 과 Chrome 이 있어야 해요.

## 내용의 기준

모든 내용은 「시온 26년도 AI ROOKIE 최종결과보고서」를 따라요. 성능은 두 가지만 써요.

- 탐지 성능: **F1 96.1** (한국어·영어 절반씩 3,600문항)
- 이해도: **도달률 증가폭 +20.8%p** (영상 30개, 다른 계열 AI가 풀어 잰 값. 일반인 9명으로 방향 확인)

## 공개 전 확인할 것

- [ ] 팀 소개 페이지의 행사명 표기 "2026년도 인공지능 루키 결선"이 공식 표기와 맞는지
- [ ] 사진은 Unsplash 무료 사진이에요. 실제 팀·당사자 사진이 생기면 `src/images/` 에서 같은 이름으로 바꾸고 `src/sec/` 의 대체 텍스트(alt)도 고쳐 주세요
- [ ] 바닥글과 자주 묻는 질문에 팀 이메일(seeon0708@gmail.com)이 공개돼요

## 출처와 라이선스

- 글꼴: [Pretendard](https://github.com/orioncactus/pretendard) © Kil Hyung-jin, SIL Open Font License 1.1. OFL의 예약 글꼴 이름 규정에 따라, 글자를 줄인 글꼴은 이름을 `SeeonText` 로 바꿨어요. 라이선스 전문은 `fonts/Pretendard-LICENSE.txt` 와 `docs/assets/fonts/LICENSE-Pretendard.txt` 에 있어요.
- 사진: The Dafu, Compare Fibre, Reynier Carl, Compagnons, Christina @ wocintechchat.com — [Unsplash License](https://unsplash.com/license)
