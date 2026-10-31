# 시온 소개 사이트

시각장애인을 위한 화상회의 화면해설 **시온(SEEON, 視溫)** 을 소개하는 정적 웹사이트예요. 설치나 다운로드 없이 소개만 해요. GitHub Pages로 바로 올릴 수 있게 `docs/` 에 완성된 사이트가 들어 있어요.

| 페이지 | 파일 | 내용 |
| --- | --- | --- |
| 홈 | `index.html` | 첫 화면, 만든 까닭(설문), 성능 두 가지, 각 페이지로 가는 길 |
| 체험 | `experience.html` | 예시 회의 듣기, "시온이라면 여기서 말할까요?" 맞혀 보기 |
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
│  └─ .nojekyll
├─ src/                ← 고칠 때는 여기를 고쳐요
│  ├─ sec/             페이지를 이루는 섹션 조각 (top, why, demo, judge, features, listen, how, together, faq)
│  ├─ style.css        사이트 전체 스타일
│  ├─ script.js        체험 플레이어, 맞혀 보기, 기능 탭, 듣는 방식 버튼, 메뉴
│  ├─ easy.html        쉬운 안내 페이지
│  ├─ logo-mark.svg, logo-word.svg
│  └─ images/          사진 원본
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
