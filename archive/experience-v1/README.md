# 예전 체험 페이지 (임시 보관)

2026-11-01에 상단 메뉴의 **체험**을 seeon-eval-web 화면(`src/experience/`)으로 바꾸면서 내려 둔 예전 체험 페이지예요. 사이트에는 나오지 않고(`docs/` 밖), 다시 쓸 수 있게 보관만 해요.

| 파일 | 내용 |
| --- | --- |
| `sec/demo.html` | 예시 회의 듣기 — 시온 없이 / 시온과 함께 들어 보는 플레이어 |
| `sec/judge.html` | "시온이라면 여기서 말할까요?" 맞혀 보기 |
| `experience.html` | 내리기 직전에 빌드된 페이지 그대로 (참고용. 이 폴더에서는 스타일이 깨져 보여요) |

## 다시 살리는 법

1. `sec/demo.html`, `sec/judge.html` 을 `src/sec/` 로 옮겨요.
2. `build.py` 의 `PAGES` 에 예전 항목을 다시 넣어요.

   ```python
   'experience-demo': subpage(
       'experience-demo.html', None, '체험', '시온을 직접 들어 보세요',
       '예시 회의 장면을 시온 없이 한 번, 시온과 함께 한 번 들어 보세요. 시온이 어느 자리에서 말하고 어느 자리에서 넘어가는지도 직접 골라 볼 수 있어요.',
       [('demo', '예시 회의 듣기'), ('judge', '시온의 판단 맞혀 보기')],
       section('demo') + section('judge'),
   ),
   ```

3. `python build.py` 로 다시 빌드해요.

플레이어(`#player`)와 맞혀 보기(`#quiz`)를 움직이는 코드와 스타일은 `src/script.js`, `src/style.css` 에 그대로 남아 있어요. 그 섹션이 있는 페이지에서만 동작하므로 따로 손댈 것은 없어요.
