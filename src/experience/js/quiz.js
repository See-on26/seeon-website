import { $, api, clear, fmtClock, h, toast } from './common.js';
import { scramble, startScene, startWaves } from './fx.js';
import { markSvg, mountLogos } from './logo.js';
import { exitFullscreen, LockedPlayer, requestFullscreen } from './player.js';

// 일반객 체험 퀴즈
// 1 SEEON AD가 결합된 오디오 → 2 VQA 1문항 → 3 정/오답 → 4 같은 부분을 화면과 함께 → 5 결과 + STAFF 안내 → 처음으로
const STEPS = ['소리 듣기', '문제 풀기', '정답 확인', '화면 보기', '결과'];
const LAST_KEY = 'seeon.quiz.last';

const app = $('#app');
const stage = $('#stage');
const stageStatus = $('#stage-status');
const stageBar = $('#stage-bar');
let video = $('#video');

mountLogos();
$('#listen-mark').innerHTML = markSvg({ label: '' });
startScene($('#backdrop'));
const waves = startWaves($('#waves'), { lines: 5, intensity: 0.6, baseline: 0.88 });

function view(step, ...children) {
  stage.hidden = true;
  clear(
    app,
    step >= 0
      ? h('ol', { class: 'steps', 'aria-label': '진행 단계' },
          STEPS.map((s, i) => h('li', { class: i === step ? 'on' : i < step ? 'done' : '', 'aria-current': i === step ? 'step' : null }, `${i + 1}. ${s}`)))
      : null,
    ...children,
  );
  window.scrollTo(0, 0);
  (app.querySelector('h1') || app).focus();
}

const title = (text) => h('h1', { class: 'page-title', tabindex: '-1' }, text);
const homeButton = (label = '처음으로') => h('a', { class: 'btn btn-lg', href: 'index.html' }, label);

function freshVideo() {
  const v = video.cloneNode(false);
  video.replaceWith(v);
  video = v;
  return v;
}

function openStage(screen, label) {
  stage.hidden = false;
  stage.classList.toggle('blind', !screen);
  stage.classList.toggle('show-video', screen);
  $('#listening').hidden = screen;
  stageBar.style.width = '0%';
  stageStatus.textContent = label;
}

// 구간 하나를 재생하고 끝나면 resolve
function playSegment(player, screen, label) {
  return new Promise((resolve, reject) => {
    player.cb.onEnded = () => {
      stage.hidden = true;
      resolve();
    };
    player.cb.onError = (err) => {
      stage.hidden = true;
      reject(err);
    };
    player.cb.onProgress = (t, d) => {
      if (d) stageBar.style.width = `${Math.min(100, (t / d) * 100)}%`;
      stageStatus.textContent = d ? `${label} · ${fmtClock(d - t)}` : label;
    };
    openStage(screen, label);
    player.play().catch(reject);
  });
}

const corners = () => h('span', { class: 'corners', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'));
const eyebrow = (text) => {
  const el = h('p', { class: 'eyebrow-mono', 'aria-hidden': 'true' }, text);
  el.dataset.text = text;
  setTimeout(() => scramble(el), 120);
  return el;
};

function showIntro() {
  const start = h('button', { type: 'button', class: 'btn btn-primary btn-lg' }, '퀴즈 시작');
  start.addEventListener('click', prepare);
  start.addEventListener('pointerenter', () => waves.setEnergy(1.1));
  start.addEventListener('pointerleave', () => waves.setEnergy(0.55));
  const flow = [
    ['LISTEN', '소리 듣기', '화면을 가린 채 발표 한 장면을 듣습니다.'],
    ['ANSWER', '문제 풀기', '들은 내용으로 문제 하나를 풉니다.'],
    ['REVEAL', '화면 보기', '같은 부분을 이번엔 화면과 함께 봅니다.'],
  ];
  view(
    -1,
    h('div', { class: 'card hud-card' },
      corners(),
      eyebrow('SEEON EXPERIENCE'),
      title('화면 없이, 소리만으로 풀어 보세요'),
      h('p', { class: 'lead' }, '발표 화면을 가린 채 들려드립니다. SEEON이 화면에 있는 내용을 사이사이 목소리로 알려 줘요.'),
      h('ol', { class: 'flow' }, flow.map(([k, t, d]) => h('li', { class: 'flow-step' }, h('b', null, k), h('strong', null, t), h('span', null, d)))),
      h('div', { class: 'btn-row', style: { marginTop: '24px' } }, start),
    ),
  );
}

async function prepare() {
  let item;
  try {
    const last = localStorage.getItem(LAST_KEY);
    item = await api(`/api/quiz/next${last ? `?last=${encodeURIComponent(last)}` : ''}`);
  } catch (err) {
    return view(-1, h('div', { class: 'card' }, title('퀴즈를 시작할 수 없습니다'), h('p', { class: 'lead' }, err.message), homeButton()));
  }
  try {
    localStorage.setItem(LAST_KEY, String(item.id));
  } catch {
    /* 저장 못 해도 진행 */
  }

  const player = new LockedPlayer(freshVideo());
  const go = h('button', { type: 'button', class: 'btn btn-primary btn-lg', disabled: true }, '불러오는 중…');
  view(
    0,
    h('div', { class: 'card' },
      title('헤드폰을 쓰고 들어 주세요'),
      h('p', { class: 'lead' }, '화면은 검게 가려집니다. 소리만 듣고 무슨 내용인지 떠올려 보세요.'),
      h('div', { class: 'btn-row', style: { marginTop: '16px' } }, go),
    ),
  );
  try {
    await player.load(item.audio.url, item.audio);
  } catch {
    go.textContent = '소리 파일을 불러오지 못했습니다';
    return toast('STAFF에게 알려 주세요.', 'bad');
  }
  go.disabled = false;
  go.textContent = '▶ 듣기 시작';
  go.addEventListener('click', async () => {
    go.disabled = true;
    requestFullscreen();
    try {
      await playSegment(player, false, '듣는 중');
    } catch {
      exitFullscreen();
      return toast('재생 중 문제가 생겼습니다. STAFF에게 알려 주세요.', 'bad');
    }
    exitFullscreen();
    showQuestion(item, player);
  }, { once: true });
}

function showQuestion(item, player) {
  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-lg', disabled: true }, '정답 확인');
  const options = item.options.map((o, k) =>
    h('label', { class: `option${o.value === 4 ? ' unknown' : ''}` },
      h('input', { type: 'radio', name: 'quiz', value: String(o.value) }),
      h('span', { class: 'key', 'aria-hidden': 'true' }, String(k + 1)),
      h('span', null, o.text)),
  );
  const replay = item.allowReplay ? h('button', { type: 'button', class: 'btn' }, '↺ 다시 듣기') : null;
  replay?.addEventListener('click', async () => {
    replay.disabled = true;
    player.rewind();
    try {
      await playSegment(player, false, '다시 듣는 중');
    } catch {
      toast('재생하지 못했습니다.', 'bad');
    }
    replay.disabled = false;
  });
  const form = h('form', { class: 'card' },
    h('fieldset', { style: { border: 0, padding: 0, margin: 0 } },
      h('legend', { class: 'q-stem' }, item.stem),
      h('div', { class: 'choice-list' }, options)),
    h('div', { class: 'btn-row', style: { marginTop: '22px', justifyContent: 'space-between' } }, replay || h('span'), submit),
  );
  form.addEventListener('change', () => (submit.disabled = false));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const sel = form.querySelector('input:checked');
    if (!sel) return;
    submit.disabled = true;
    try {
      const result = await api(`/api/quiz/${item.id}/answer`, { method: 'POST', body: { choice: Number(sel.value), playId: item.playId } });
      player.dispose();
      showFeedback(item, Number(sel.value), result);
    } catch (err) {
      submit.disabled = false;
      toast(err.message, 'bad');
    }
  });
  view(1, title('들은 내용으로 문제를 풀어 보세요'), form);
}

function answerList(item, choice, result) {
  return h('div', { class: 'choice-list' },
    item.options.map((o, k) => {
      const cls = o.value === result.answer ? ' is-answer' : o.value === choice ? ' is-wrong' : '';
      const tag = o.value === result.answer ? '정답' : o.value === choice ? '내 답' : '';
      return h('div', { class: `option${cls}`, 'aria-disabled': 'true' },
        h('span', { class: 'key', 'aria-hidden': 'true' }, String(k + 1)),
        h('span', { style: { flex: 1 } }, o.text),
        tag ? h('b', { class: 'small' }, tag) : null);
    }));
}

function verdict(correct) {
  return h('div', { class: `verdict ${correct ? 'ok' : 'bad'}` },
    h('div', { class: 'verdict-mark', 'aria-hidden': 'true' }, correct ? 'O' : 'X'),
    h('h1', { tabindex: '-1' }, correct ? '정답입니다!' : '아쉬워요, 오답입니다'));
}

// 3 정/오답 알림 → 4 화면과 함께 보기
function showFeedback(item, choice, result) {
  const watch = h('button', { type: 'button', class: 'btn btn-primary btn-lg' }, '▶ 화면과 함께 보기');
  view(
    2,
    h('div', { class: 'card' },
      verdict(result.correct),
      h('p', { class: 'q-stem', style: { marginTop: '18px', fontSize: '19px' } }, item.stem),
      answerList(item, choice, result),
      h('p', { class: 'lead', style: { marginTop: '22px' } }, '방금 소리로만 들은 부분을 이번에는 화면과 함께 보여드릴게요.'),
      h('div', { class: 'btn-row', style: { marginTop: '8px' } }, watch),
    ),
  );
  watch.addEventListener('click', async () => {
    watch.disabled = true;
    watch.textContent = '불러오는 중…';
    const player = new LockedPlayer(freshVideo());
    try {
      await player.load(result.video.url, result.video);
      requestFullscreen();
      await playSegment(player, true, '화면과 함께 보는 중');
    } catch {
      toast('영상을 재생하지 못했습니다. STAFF에게 알려 주세요.', 'bad');
    }
    player.dispose();
    exitFullscreen();
    showResult(item, choice, result);
  }, { once: true });
}

// 5 결과 다시 보여 주기 + STAFF 안내
function showResult(item, choice, result) {
  view(
    4,
    h('div', { class: 'card' },
      verdict(result.correct),
      // STAFF가 바로 볼 수 있게 안내와 버튼을 위로 올린다
      result.message ? h('div', { class: 'staff-callout' }, result.message) : null,
      h('div', { class: 'btn-row', style: { justifyContent: 'center', marginTop: '16px' } }, homeButton()),
      h('p', { class: 'q-stem', style: { marginTop: '28px', fontSize: '19px' } }, item.stem),
      answerList(item, choice, result),
      result.explanation ? h('div', { class: 'notice', style: { marginTop: '16px' } }, result.explanation) : null,
    ),
  );
}

showIntro();
