# 시온 소개 사이트

시각장애인을 위한 화상회의 화면해설 **시온(SEEON, 視溫)** 을 소개하는 정적 웹사이트예요. 설치나 다운로드 없이 소개만 해요. GitHub Pages로 바로 올릴 수 있게 `docs/` 에 완성된 사이트가 들어 있어요.

공개 주소: https://see-on26.github.io/seeon-website/ — `main` 브랜치에 올리면 1~2분 뒤 바뀌어요.

| 페이지 | 파일 | 내용 |
| --- | --- | --- |
| 홈 | `index.html` | 첫 화면, 만든 까닭(설문), 성능 두 가지, 각 페이지로 가는 길 |
| 체험 | `experience/` | seeon-eval-web 화면 그대로 — 일반객(체험 퀴즈) · 실험자 · 관리자 |
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
│  └─ experience/      체험 — seeon-eval-web/public 을 옮긴 것 (아래 「체험」 참고)
├─ archive/            사이트에 나오지 않는 임시 보관 (예전 체험 페이지: experience-v1/)
├─ fonts/              Pretendard Variable 원본과 라이선스
├─ build.py            src/ → docs/ 조립, 글꼴 줄이기
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

상단 메뉴의 **체험**은 `experience/index.html` 로 가요. 평가 사이트(seeon-eval-web)의 화면을 2026-11-01 기준으로 옮겨 온 것이라 첫 화면에서 **일반객 · 실험자 · 관리자** 로 나뉘는 것까지 똑같아요. 체험 첫 화면의 SEEON 로고를 누르면 소개 사이트 홈으로 돌아가요.

GitHub Pages에는 평가 서버(Node·데이터베이스)가 없어서, 서버가 하던 답을 `src/experience/js/static-api.js` 가 대신 해요.

| 입구 | 공개 사이트에서 | 데이터 |
| --- | --- | --- |
| 일반객 | 체험 퀴즈가 처음부터 끝까지 동작해요 (소리 듣기 → 문제 → 정답 확인 → 화면과 함께 보기 → 결과). 정답 확인도 브라우저 안에서 해요 | `src/experience/data/quiz.json` (지금은 문항 0개 → "아직 준비된 퀴즈가 없습니다") |
| 실험자 | "지금은 실험 접수를 받지 않습니다" 화면이 나와요. 응답을 모을 서버가 없기 때문이에요 | 없음 |
| 관리자 | 로그인 화면은 그대로이고, 로그인하면 "이 공개 사이트에서는 관리자 기능을 쓸 수 없습니다"가 나와요 | 없음 |

**평가 데이터는 올리지 않았어요.** 데이터베이스(`data/seeon-eval.db`), 평가 영상·음성(`data/uploads/`), 평가 문항은 저장소에 없어요. 실험 안내 그림(`img/guide/`)도 외부 강의 영상 장면과 예시 문항이 담겨 있어 빼 두었어요. 실험자 화면이 공개 사이트에서 열리지 않으므로 지금은 쓰이지 않아요.

### 체험 퀴즈 문항 넣기

`src/experience/data/quiz.json` 에 문항을 적고, 소리·영상 파일은 `src/experience/data/media/` 에 넣은 뒤 빌드해요. 파일 경로는 `experience/` 폴더 기준이에요.

```json
{
  "settings": {
    "showUnknown": false,
    "allowReplay": false,
    "messageCorrect": "정답일 때 결과 화면에 띄울 문구",
    "messageWrong": "오답일 때 결과 화면에 띄울 문구"
  },
  "items": [
    {
      "id": 1,
      "stem": "문제",
      "options": ["보기 1", "보기 2", "보기 3", "보기 4"],
      "answer": 0,
      "explanation": "정답 해설",
      "audio": { "src": "data/media/q1-seeon.mp3", "start": 0, "end": 42.5 },
      "video": { "src": "data/media/q1-screen.mp4", "start": 0, "end": 42.5 }
    }
  ]
}
```

- `answer` 는 0부터 세요(첫 번째 보기가 0). `showUnknown` 을 켜면 「알 수 없음」 보기가 붙어요.
- `audio` 는 화면 없이 들려줄 소리(시온 해설이 들어간 것), `video` 는 정답 확인 뒤 화면과 함께 보여 줄 영상이에요. `start`·`end` 는 초 단위이고, `end` 를 `null` 로 두면 끝까지 재생해요.
- 문항을 잠시 내리려면 `"active": false` 를 넣어요.
- 저장소가 공개라서 여기 넣은 파일은 **누구나 내려받을 수 있어요.** 저작권이 있는 외부 영상이나 당사자 평가에 쓸 문항은 넣지 마세요.

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
