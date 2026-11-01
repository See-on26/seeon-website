import { $, api, clear, fmtClock, h, toast } from './common.js';
import { mountLogos } from './logo.js';
import { exitFullscreen, LockedPlayer, playChime, requestFullscreen } from './player.js';

const TOKEN_KEY = 'seeon.exp.token';
const STEPS = ['인적사항', '실험 안내', '실험', '완료'];
const UNKNOWN = 4;

const app = $('#app');
const stage = $('#stage');
let video = $('#video');
const stageStatus = $('#stage-status');
const stageBar = $('#stage-bar');
const homeLink = $('#home-link');

mountLogos();

let token = null;
let running = false;
let info = null; // /state 응답
let keyHandler = null;
let playingPosition = null; // 재생 중인 블록 위치(이탈 기록에 붙인다)
let stageTrack = null; // 재생 화면 위쪽 진행률

// 안내용 예시 화면 캡처(그림을 누르면 크게)
function guideFigure(src, heading, caption) {
  const img = h('img', { src, alt: `${heading} 예시 화면`, loading: 'lazy' });
  img.addEventListener('click', () => img.classList.toggle('zoomed'));
  img.addEventListener('error', () => img.closest('figure')?.remove());
  return h('figure', { class: 'guide-figure' }, img, h('figcaption', null, h('b', null, heading), ' ', caption));
}

// 다시 보기 안내: 쓰는 법을 짧은 항목으로, 영상 파트·소리만 파트 재생기를 캡처로 보여 준다
function reviewGuide() {
  const legend = (...lines) => h('span', { class: 'legend' }, lines.map((l) => h('span', null, rich(l))));
  return h('section', { class: 'review-box', 'aria-label': '문제를 풀 때 다시 보기' },
    h('h2', null, '🔁 문제를 풀 때 다시 듣고 볼 수 있습니다'),
    h('p', { class: 'review-lead' }, rich('**기억해 두지 않아도 됩니다.** 영상마다 처음 한 번은 끝까지 재생되고, 문제 화면으로 넘어가면 **왼쪽에 다시 보기 재생기**가 생깁니다.')),
    h('ol', { class: 'review-steps' },
      h('li', null, rich('**▶ 버튼**을 누르면 다시 재생되고, 한 번 더 누르면 멈춥니다.')),
      h('li', null, rich('**막대를 끌거나 누르면** 원하는 곳으로 옮겨 들을 수 있습니다.')),
      h('li', null, rich('재생기 아래에 **자막**이 같이 나옵니다. 발표자 말은 흰색, 안내 목소리는 파란색입니다.')),
      h('li', null, rich('그 영상의 **문제를 다 풀면 재생기가 닫히고**, 다음 영상에서 새로 생깁니다.'))),
    h('div', { class: 'guide-grid' },
      guideFigure('img/guide/guide-5-review-video.jpg', '영상 파트 — 화면이 보이는 재생기',
        legend('**①** 재생 버튼과 이동 막대', '**②** 자막', '**③** 문제', '화면과 소리가 함께 나옵니다.')),
      guideFigure('img/guide/guide-5-review-audio.jpg', '소리만 파트 — 자막이 보이는 재생기',
        legend('**①** 재생 버튼과 이동 막대', '**②** 자막 (안내 목소리는 파란색)', '**③** 문제', '화면 없이 소리와 자막만 나옵니다.'))));
}

// ---------- 메모 ----------
// 영상(블록)마다 새 메모. 재생 중에는 무대 오른쪽, 문제 풀 때는 문제 옆에 같은 내용이 보인다. 서버에 블록마다 저장한다.
const notesState = { text: '', timer: null, dirty: false };
const stageNotes = $('#stage-notes');
const stageNotesText = $('#stage-notes-text');

function saveNotesNow() {
  clearTimeout(notesState.timer);
  notesState.timer = null;
  if (!notesState.dirty || !token) return Promise.resolve();
  notesState.dirty = false;
  return call('/notes', { method: 'POST', body: { notes: notesState.text } }).catch(() => { notesState.dirty = true; });
}

function setNotes(text) {
  notesState.text = text;
  notesState.dirty = true;
  clearTimeout(notesState.timer);
  notesState.timer = setTimeout(saveNotesNow, 1500);
}

stageNotesText.addEventListener('input', () => setNotes(stageNotesText.value));

// ---------- 자막 ----------
const stageSubs = $('#stage-subs');
const subAd = $('#sub-ad');
const subSpeech = $('#sub-speech');

function activeCueText(cues, kind, t) {
  let text = '';
  for (const c of cues) {
    if (c.kind !== kind) continue;
    if (c.start <= t && t < c.end) text = c.text;
    else if (c.start > t) break;
  }
  return text;
}

function updateSubs(cues, t) {
  const ad = activeCueText(cues, 'ad', t);
  const speech = ad ? '' : activeCueText(cues, 'speech', t);
  if (subAd.textContent !== ad) subAd.textContent = ad;
  if (subSpeech.textContent !== speech) subSpeech.textContent = speech;
}

// ---------- 전체 진행률 ----------
// 연습 → 파트별 영상 → 설문을 칸으로 보여 주고, 지금 칸과 전체 %를 표시한다.
function progressSegments() {
  const list = [];
  if (info?.practice) list.push({ group: '연습', label: '연습' });
  (info?.parts || []).forEach((p, i) => {
    for (let k = 0; k < p.clips; k++) list.push({ group: `파트 ${i + 1}`, label: `영상 ${k + 1}`, screen: p.screen });
  });
  if (info?.postSurvey) list.push({ group: '설문', label: '설문' });
  return list;
}

// position: 지금 칸 번호(블록 위치, 설문이면 마지막 칸), inner: 그 칸 안에서 진행한 비율(0~1)
function progressPercent(position, inner) {
  const n = progressSegments().length || 1;
  return Math.max(0, Math.min(100, Math.round(((position + inner) / n) * 100)));
}

function progressTracker({ position, inner = 0, caption = '', dark = false }) {
  const segs = progressSegments();
  if (!segs.length) return null;
  const groups = [];
  segs.forEach((seg, index) => {
    let g = groups.at(-1);
    if (!g || g.name !== seg.group) groups.push((g = { name: seg.group, items: [] }));
    g.items.push({ ...seg, index });
  });
  const fills = [];
  const percent = h('b', null, `${progressPercent(position, inner)}%`);
  const el = h('div', { class: `progress-track${dark ? ' dark' : ''}`, role: 'group', 'aria-label': '전체 진행 상황' },
    h('div', { class: 'progress-head' },
      h('span', null, '전체 진행 ', percent),
      caption ? h('span', { class: 'progress-caption' }, caption) : null),
    h('div', { class: 'progress-groups' },
      groups.map((g) => h('div', { class: `progress-group${g.items.some((it) => it.index === position) ? ' current' : ''}` },
        h('div', { class: 'progress-group-name' }, g.name),
        h('div', { class: 'progress-cells' },
          g.items.map((it) => {
            const state = it.index < position ? 'done' : it.index === position ? 'now' : 'todo';
            const fill = h('i', { style: { width: state === 'done' ? '100%' : state === 'now' ? `${Math.round(inner * 100)}%` : '0%' } });
            if (state === 'now') fills.push(fill);
            return h('span', { class: `progress-cell ${state}`, title: `${g.name} ${it.label}` }, fill);
          })))))
  );
  // 재생 중에는 지금 칸만 채운다(통째로 다시 그리지 않는다)
  el.update = (nextInner) => {
    fills.forEach((f) => (f.style.width = `${Math.round(nextInner * 100)}%`));
    percent.textContent = `${progressPercent(position, nextInner)}%`;
  };
  return el;
}

// 안내 문구의 **굵게** 를 강조로 바꾼다(HTML 을 쓰지 않는다)
function rich(text) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? h('strong', null, part) : part));
}

const call = (path, opts = {}) =>
  api(`/api/exp${path}`, { ...opts, headers: { 'x-exp-token': token, ...(opts.headers || {}) } });

const sendEvent = (type, detail) => token && call('/event', { method: 'POST', body: { type, detail } }).catch(() => {});

function view(step, ...children) {
  closeStage();
  keyHandler = null;
  app.classList.remove('wide');
  clear(
    app,
    step >= 0
      ? h('ol', { class: 'steps', 'aria-label': '진행 단계' },
          STEPS.map((s, i) => h('li', { class: i === step ? 'on' : i < step ? 'done' : '', 'aria-current': i === step ? 'step' : null }, `${i + 1}. ${s}`)))
      : null,
    ...children,
  );
  window.scrollTo(0, 0);
  (app.querySelector('h1, legend') || app).focus?.();
}

const title = (text) => h('h1', { class: 'page-title', tabindex: '-1' }, text);
const homeButton = (label = '처음으로') => h('a', { class: 'btn btn-lg', href: 'index.html' }, label);
const fact = (big, small) => h('div', { class: 'fact' }, h('b', null, big), h('span', null, small));

// 왼쪽 위 전체 화면 켜기·끄기. 실험이 진행 중일 때만 보인다(그때는 로고가 숨는다)
const fsToggle = $('#fs-toggle');
const syncFsToggle = () => {
  fsToggle.textContent = document.fullscreenElement ? '⛶ 전체 화면 끄기' : '⛶ 전체 화면 켜기';
};
fsToggle.addEventListener('click', () => {
  if (document.fullscreenElement) exitFullscreen();
  else requestFullscreen();
});
document.addEventListener('fullscreenchange', syncFsToggle);

function setRunning(on) {
  running = on;
  homeLink.hidden = on;
  fsToggle.hidden = !on || !document.fullscreenEnabled;
  syncFsToggle();
}

function forget() {
  setRunning(false);
  token = null;
  sessionStorage.removeItem(TOKEN_KEY);
}

// 이어서 할 수 없는 상태. 관리자가 초기화해야 처음부터 다시 할 수 있다.
function showStopped(message, heading = '실험이 중단되었습니다') {
  forget();
  exitFullscreen();
  view(
    -1,
    h('div', { class: 'card' },
      title(heading),
      h('p', { class: 'lead' }, message),
      h('div', { class: 'notice warn' }, '중간에 멈춘 실험은 이어서 할 수 없습니다. 다시 참여하려면 관리자에게 초기화를 요청해 주세요.'),
      h('div', { class: 'btn-row', style: { marginTop: '20px' } }, homeButton()),
    ),
  );
}

async function abortAndStop(reason, message) {
  const t = token;
  if (t) await api('/api/exp/abort', { method: 'POST', body: { token: t, reason } }).catch(() => {});
  showStopped(message);
}

function fail(err) {
  if (err.code === 'network') {
    toast(err.message, 'bad');
    return false;
  }
  if (err.status === 401 || err.code === 'not_active') {
    showStopped(err.message);
    return true;
  }
  abortAndStop(`오류: ${err.code || err.status}`, err.message);
  return true;
}

// ---------- 페이지 이탈 = 중단 ----------
window.addEventListener('pagehide', () => {
  if (!running || !token) return;
  const body = new Blob([JSON.stringify({ token, reason: '페이지를 떠남(새로 고침·닫기·뒤로 가기)' })], { type: 'text/plain' });
  navigator.sendBeacon('/api/exp/abort', body);
});
window.addEventListener('beforeunload', (e) => {
  if (!running) return;
  e.preventDefault();
  e.returnValue = '';
});
window.addEventListener('pageshow', (e) => e.persisted && location.reload());
document.addEventListener('visibilitychange', () => {
  if (!stage.hidden) sendEvent(document.hidden ? 'tab_hidden' : 'tab_visible', { position: playingPosition });
});
document.addEventListener('fullscreenchange', () => {
  if (!stage.hidden && !document.fullscreenElement) sendEvent('fullscreen_exit', { position: playingPosition });
});
document.addEventListener('keydown', (e) => keyHandler?.(e));

// 휴대전화·작은 화면: 영상 파트에서 화면 글자를 읽을 수 없으므로 PC로 하게 한다
const MIN_WIDTH = 1024;
function isSmallDevice() {
  const touchOnly = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
  return touchOnly || Math.max(screen.width, innerWidth) < MIN_WIDTH;
}

// ---------- [1단계] 인적사항 ----------
function formatPhoneInput(value) {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

async function showRegister() {
  let status;
  try {
    status = await api('/api/exp/status');
  } catch (err) {
    return view(-1, h('div', { class: 'card' }, title('서버에 연결할 수 없습니다'), h('p', null, err.message), homeButton()));
  }
  if (!status.open || !status.ready) {
    return view(
      0,
      h('div', { class: 'card' },
        title('지금은 실험을 시작할 수 없습니다'),
        h('p', { class: 'lead' }, status.open ? '실험 준비가 아직 끝나지 않았습니다. 관리자에게 문의해 주세요.' : '지금은 실험 접수를 받지 않습니다. 관리자에게 문의해 주세요.'),
        homeButton(),
      ),
    );
  }

  if (status.requireDesktop && isSmallDevice()) {
    return view(
      0,
      h('div', { class: 'card' },
        title('PC나 노트북으로 접속해 주세요'),
        h('p', { class: 'lead' }, '이 실험에는 발표 화면의 글자를 읽어야 하는 부분이 있어, 휴대전화나 작은 화면에서는 진행할 수 없습니다.'),
        h('p', { class: 'muted' }, `가로 ${MIN_WIDTH}px 이상인 PC·노트북의 브라우저(Chrome·Edge 권장)로 같은 주소에 다시 들어와 주세요.`),
        homeButton(),
      ),
    );
  }

  const err = h('p', { class: 'error-text', role: 'alert' });
  const name = h('input', { type: 'text', id: 'f-name', autocomplete: 'name', maxlength: '40', required: true });
  const age = h('input', { type: 'number', id: 'f-age', inputmode: 'numeric', min: '1', max: '120', required: true });
  const phone = h('input', { type: 'tel', id: 'f-phone', inputmode: 'numeric', autocomplete: 'tel', placeholder: '010-1234-5678', required: true });
  phone.addEventListener('input', () => (phone.value = formatPhoneInput(phone.value)));
  const visual = status.visualOptions.map((v) => h('label', { class: 'check' }, h('input', { type: 'radio', name: 'visual', value: v, required: true }), h('span', null, v)));
  const consent = h('input', { type: 'checkbox', id: 'f-consent' });
  const sensitive = h('input', { type: 'checkbox', id: 'f-sensitive' });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-lg btn-block' }, '다음');

  const form = h('form', { class: 'card', novalidate: true },
    h('div', { class: 'field' }, h('label', { for: 'f-name' }, '이름'), name),
    h('div', { class: 'field' }, h('label', { for: 'f-age' }, '나이 (만 나이)'), age),
    h('div', { class: 'field' }, h('label', { for: 'f-phone' }, '전화번호'), phone, h('span', { class: 'hint' }, '중복 참여를 막는 데 씁니다. 같은 번호로는 다시 시작할 수 없습니다.')),
    h('fieldset', { class: 'field', style: { border: 0, padding: 0, margin: '0 0 18px' } },
      h('legend', { class: 'label', style: { marginBottom: '6px', fontWeight: 600 } }, '시각 장애 여부'),
      h('div', { class: 'choice-list' }, visual)),
    h('div', { class: 'field' },
      h('span', { class: 'label' }, '개인정보 수집·이용 동의 (필수)'),
      h('div', { class: 'consent-box', tabindex: '0' }, status.consentText),
      h('label', { class: 'check' }, consent, h('span', null, '위 내용을 읽었으며 개인정보 수집·이용에 동의합니다.'))),
    h('div', { class: 'field' },
      h('span', { class: 'label' }, '민감정보 처리 동의 (필수)'),
      h('div', { class: 'consent-box', tabindex: '0' }, status.sensitiveConsentText),
      h('label', { class: 'check' }, sensitive, h('span', null, '시각 장애 여부(민감정보) 처리에 동의합니다.'))),
    err,
    submit,
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const visualValue = form.querySelector('input[name=visual]:checked')?.value;
    const problems = [];
    if (!name.value.trim()) problems.push('이름');
    if (!(Number(age.value) >= 1 && Number(age.value) <= 120)) problems.push('나이');
    if (!/^01\d-?\d{3,4}-?\d{4}$/.test(phone.value)) problems.push('전화번호');
    if (!visualValue) problems.push('시각 장애 여부');
    if (problems.length) {
      err.textContent = `${problems.join(', ')}을(를) 확인해 주세요.`;
      return;
    }
    if (!consent.checked || !sensitive.checked) {
      err.textContent = '두 가지 동의에 모두 체크해야 참여할 수 있습니다.';
      return;
    }
    submit.disabled = true;
    try {
      const res = await api('/api/exp/register', {
        method: 'POST',
        body: { name: name.value.trim(), age: Number(age.value), phone: phone.value, visual: visualValue, consent: true, sensitiveConsent: true },
      });
      token = res.token;
      sendEvent('client_info', { screenW: screen.width, screenH: screen.height, innerW: innerWidth, innerH: innerHeight });
      sessionStorage.setItem(TOKEN_KEY, token);
      setRunning(true);
      showIntro();
    } catch (e2) {
      submit.disabled = false;
      if (e2.code === 'cannot_register') {
        return view(-1, h('div', { class: 'card' }, title('등록할 수 없습니다'), h('p', { class: 'lead' }, e2.message), homeButton()));
      }
      err.textContent = e2.message;
    }
  });

  view(0, title('인적사항을 적어 주세요'), h('p', { class: 'lead' }, '실험은 한 사람당 한 번만 참여할 수 있습니다.'), form);
}

// ---------- [2단계] 실험 방법 소개·음량 체크 ----------
async function showIntro() {
  try {
    info = await call('/state');
  } catch (err) {
    return fail(err);
  }
  const blind = info.parts.filter((p) => !p.screen).length;
  const withScreen = info.parts.length - blind;
  const clipCount = info.parts.reduce((sum, p) => sum + p.clips, 0);
  const clipSet = [...new Set(info.parts.map((p) => p.clips))];
  const clipsText = clipSet.length === 1 ? `${clipSet[0]}개` : `${Math.min(...clipSet)}~${Math.max(...clipSet)}개`;
  const startBtn = h('button', { type: 'button', class: 'btn btn-primary btn-lg', disabled: true }, `실험 시작하기 (약 ${info.estimatedMinutes}분)`);
  const checks = [
    '헤드폰(이어폰)을 착용했습니다.',
    '휴대전화를 무음으로 바꿨습니다.',
    '조용한 곳에 편하게 앉아 있습니다.',
    '**실험이 끝날 때까지 다른 일(다른 창·휴대전화·메신저 등)을 하지 않고 실험에만 집중**하겠습니다.',
  ].map((t) => h('label', { class: 'check' }, h('input', { type: 'checkbox', class: 'pre-check' }), h('span', null, rich(t))));
  // 안내 문구: '! ' 줄은 꼭 지킬 것, '? ' 줄은 답하는 방법, 나머지는 진행 방식
  const lines = info.introText.split('\n').map((l) => l.trim()).filter(Boolean);
  const mustLines = lines.filter((l) => l.startsWith('! ')).map((l) => l.slice(2));
  const howLines = lines.filter((l) => l.startsWith('? ')).map((l) => l.slice(2));
  const flowLines = lines.filter((l) => !l.startsWith('! ') && !l.startsWith('? '));
  const heard = h('input', { type: 'checkbox', class: 'pre-check', disabled: true });
  const heardLabel = h('label', { class: 'check' }, heard, h('span', null, '테스트 소리가 편하게 잘 들립니다.'));
  const testBtn = h('button', { type: 'button', class: 'btn' }, '▶ 테스트 소리 듣기');
  let testAudio = null;
  const stopTest = () => {
    if (!testAudio) return;
    testAudio.pause();
    testAudio = null;
    testBtn.textContent = '▶ 다시 듣기';
    heard.disabled = false;
  };
  const sync = () => (startBtn.disabled = ![...app.querySelectorAll('.pre-check')].every((c) => c.checked));

  // 테스트 소리는 듣는 도중에 멈출 수 있다(같은 버튼)
  testBtn.addEventListener('click', async () => {
    if (testAudio) return stopTest();
    if (!info.volumeUrl) {
      testBtn.disabled = true;
      await playChime().catch(() => {});
      testBtn.disabled = false;
      testBtn.textContent = '▶ 다시 듣기';
      heard.disabled = false;
      return;
    }
    const audio = new Audio(info.volumeUrl);
    testAudio = audio;
    testBtn.textContent = '■ 멈추기';
    audio.onended = () => testAudio === audio && stopTest();
    try {
      await audio.play();
    } catch {
      testAudio = null;
      testBtn.textContent = '▶ 테스트 소리 듣기';
      toast('소리를 재생하지 못했습니다. 다시 눌러 보세요.', 'bad');
    }
  });
  app.addEventListener('change', sync);

  startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    stopTest();
    requestFullscreen();
    try {
      await call('/intro-done', { method: 'POST', body: {} });
      runBlock();
    } catch (err) {
      if (!fail(err)) startBtn.disabled = false;
    }
  });

  view(
    1,
    title('실험 방법 안내'),
    h('div', { class: 'card overview-card' },
      h('p', null, rich(`실험은 **약 ${info.estimatedMinutes}분** 걸립니다. 발표 영상 **${clipCount}개**를 **${info.parts.length}개 파트**로 나누어 진행합니다.`)),
      h('p', null, rich(`**파트**는 같은 방식으로 이어서 듣는 영상 묶음입니다. 한 파트에는 영상이 ${clipsText} 있고, 영상 하나가 끝날 때마다 바로 그 영상에 관한 문제를 풉니다.`)),
      h('p', null, rich(`파트마다 듣는 방식이 다릅니다. ${info.parts.length}개 파트 중 **${withScreen}개는 화면과 소리를 함께**, **${blind}개는 화면 없이 소리만** 듣습니다. 어느 파트가 어떤 방식인지는 파트를 시작할 때 알려 드리고, 화면 맨 위의 **진행 막대**로 지금 어디쯤인지 볼 수 있습니다.`)),
    ),
    info.practice
      ? h('div', { class: 'notice practice-notice' }, h('strong', null, '⭐ 본 실험 전에 짧은 연습 파트가 하나 있습니다.'), ' 연습은 결과에 들어가지 않으니 진행 방식을 익히는 데 쓰세요.')
      : null,
    mustLines.length
      ? h('section', { class: 'must-box', 'aria-label': '꼭 지켜 주세요' },
          h('h2', null, '⚠ 꼭 지켜 주세요'),
          h('ul', null, mustLines.map((l) => h('li', null, rich(l)))))
      : null,
    h('div', { class: 'card' },
      h('h2', null, '이렇게 진행합니다'),
      h('ol', { class: 'intro-list' }, flowLines.map((l) => h('li', null, rich(l)))),
      h('h3', { class: 'guide-title' }, '화면으로 미리 보기'),
      h('p', { class: 'muted small' }, '아래는 예시 화면입니다. 실제 실험의 영상·문제와는 다릅니다. 그림을 누르면 크게 볼 수 있습니다.'),
      h('div', { class: 'guide-grid' },
        guideFigure('img/guide/guide-1-part.jpg', '① 파트를 시작할 때', '이번 파트가 「소리만」인지 「영상」인지, 문제가 몇 개인지 알려 줍니다. 준비되면 「▶ 재생 시작」을 누릅니다.'),
        guideFigure('img/guide/guide-2-listen.jpg', '② 소리만 듣는 파트', '화면은 검게 가려집니다. 아래에 자막(발표자 말은 흰색, 안내 목소리는 파란색)이 나오고, 오른쪽 칸에 메모할 수 있습니다. 맨 위 막대가 전체 진행 상황입니다.'),
        guideFigure('img/guide/guide-3-video.jpg', '③ 영상을 보는 파트', '화면과 소리가 함께 나옵니다. 자막과 메모 칸은 똑같이 쓸 수 있습니다.'),
      ),
    ),
    howLines.length
      ? h('section', { class: 'howto-box', 'aria-label': '문제에 답하는 방법' },
          h('h2', null, '문제에 답하는 방법'),
          h('ul', null, howLines.map((l) => h('li', null, rich(l)))),
          h('div', { class: 'guide-grid one' },
            info.allowReview
              ? guideFigure('img/guide/guide-4-question-review.jpg', '④ 문제 풀기', '영상이 끝나면 문제가 하나씩 나옵니다. 문제 화면 왼쪽 재생기로 그 영상(소리)을 다시 재생하고 막대를 옮겨 확인할 수 있습니다. 보기를 누르거나 숫자 키(1~5)로 고르고 「다음 문제」를 누릅니다. 오른쪽에 그 영상에서 쓴 메모가 그대로 보입니다.')
              : guideFigure('img/guide/guide-4-question.jpg', '④ 문제 풀기', '영상이 끝나면 문제가 하나씩 나옵니다. 보기를 누르거나 숫자 키(1~5)로 고르고 「다음 문제」를 누릅니다. 오른쪽에 그 영상에서 쓴 메모가 그대로 보입니다.')))
      : null,
    info.allowReview ? reviewGuide() : null,
    h('div', { class: 'card' },
      h('h2', null, '시작하기 전에 확인해 주세요'),
      h('div', { class: 'choice-list' }, checks),
      h('h3', { style: { marginTop: '22px' } }, '음량 테스트'),
      h('p', { class: 'muted' }, '실험 소리와 비슷한 크기의 테스트 소리가 나옵니다. 작거나 크면 컴퓨터 음량을 맞춘 뒤 다시 들어 보세요.'),
      h('div', { class: 'btn-row', style: { marginBottom: '12px' } }, testBtn),
      heardLabel,
    ),
    h('div', { class: 'btn-row end', style: { marginTop: '20px' } }, startBtn),
  );
}

// ---------- [3단계] 파트 재생 → 문항 ----------
function openStage(b) {
  stage.hidden = false;
  stage.classList.toggle('blind', !b.screen);
  stage.classList.toggle('show-video', b.screen);
  $('#listening').hidden = b.screen;
  stageBar.style.width = '0%';
  stageStatus.textContent = '';
  stageSubs.hidden = !(b.cues && b.cues.length);
  subAd.textContent = '';
  subSpeech.textContent = '';
  stageNotes.hidden = !b.allowNotes;
  stageNotesText.value = notesState.text;
}

function closeStage() {
  stage.hidden = true;
}

// 파트마다 새 video 요소를 써서 이전 재생기의 이벤트가 남지 않게 한다
function freshVideo() {
  const v = video.cloneNode(false);
  video.replaceWith(v);
  video = v;
  return v;
}

function blockLabel(b) {
  if (b.practice) return '연습';
  const part = `파트 ${b.part + 1} / ${b.partTotal}`;
  return b.slotsInPart > 1 ? `${part} · 영상 ${b.slot + 1} / ${b.slotsInPart}` : part;
}

async function runBlock() {
  let b;
  try {
    b = await call('/block');
  } catch (err) {
    return fail(err);
  }
  const startBtn = h('button', { type: 'button', class: 'btn btn-primary btn-lg', disabled: true }, '불러오는 중…');
  const label = blockLabel(b);
  notesState.text = b.notes || '';
  notesState.dirty = false;
  const firstOfPart = b.practice || b.slot === 0;
  const kind = b.screen ? '영상을 봅니다' : '소리만 듣습니다';
  view(
    2,
    progressTracker({ position: b.position, caption: `지금: ${label}` }),
    title(b.practice ? `연습 파트 — ${kind}` : firstOfPart ? `이번 파트는 ${kind}` : `같은 파트의 ${b.slot + 1}번째 영상입니다`),
    h('p', { class: 'lead' },
      b.practice
        ? '진행 방식을 익히는 연습입니다. 결과에 들어가지 않습니다.'
        : firstOfPart
          ? `${b.screen ? '화면과 소리가 함께 나옵니다.' : '화면이 검게 가려지고 소리만 나옵니다.'}${b.slotsInPart > 1 ? ` 이 파트에서는 영상 ${b.slotsInPart}개를 하나씩 재생하고, 영상마다 끝나면 바로 문제를 풉니다.` : ''}`
          : `앞 영상과 같은 방식으로 ${b.screen ? '화면과 소리가 함께 나옵니다' : '소리만 나옵니다'}.`),
    h('div', { class: 'fact-row' },
      fact(`약 ${Math.max(1, Math.ceil((b.durationSec || 600) / 60))}분`, '재생 시간'),
      fact(`${b.questionCount}문항`, '재생이 끝난 뒤 풀 문제'),
    ),
    h('section', { class: 'howto-box', 'aria-label': '이 영상에서 풀 문제' },
      h('h2', null, '이 영상에서 풀 문제'),
      h('ul', null,
        h('li', null, '재생이 끝나면 이 영상에 관한 ', h('strong', null, `문제 ${b.questionCount}개`), '를 한 문제씩 풉니다.'),
        h('li', null, '모두 ', h('strong', null, '객관식'), '입니다. 보기 4개와 ', h('strong', null, '「알 수 없음」'), ' 중 하나를 고릅니다.'),
        h('li', null, '「다음 문제」를 누르면 ', h('strong', null, '앞 문제로 돌아갈 수 없습니다.'), ' 시간 제한은 없습니다.'),
        b.allowReview
          ? h('li', null, '문제를 풀 때 문제 화면 왼쪽 재생기로 ', h('strong', null, b.screen ? '영상을 다시 보고' : '소리를 다시 듣고'), ', 원하는 곳으로 옮겨 확인할 수 있습니다.')
          : null,
        b.allowNotes ? h('li', null, '종이나 화면 메모를 ', h('strong', null, '보면서 풀어도 됩니다.')) : null)),
    b.allowReview
      ? h('div', { class: 'notice warn' },
        h('strong', null, '처음 재생은 끝까지 한 번 이어집니다.'), ' 그동안은 멈추거나 되돌릴 수 없으니 준비되면 시작해 주세요. 재생하는 동안 다른 창을 열지 말고 끝까지 집중해 주세요.')
      : h('div', { class: 'notice warn' },
        h('strong', null, '재생은 한 번만 됩니다.'), ' 멈추거나 되돌릴 수 없으니 준비되면 시작해 주세요. 재생하는 동안 다른 창을 열지 말고 끝까지 집중해 주세요.'),
    b.allowNotes ? h('p', { class: 'muted', style: { marginTop: '10px' } }, '재생하는 동안 화면 오른쪽 메모 칸에 자유롭게 메모할 수 있고, 문제를 풀 때 다시 볼 수 있습니다.') : null,
    b.afterPractice
      ? h('p', { class: 'muted', style: { marginTop: '12px' } }, '연습이 끝났습니다. 지금부터 본 실험입니다.')
      : !b.practice && b.slot === 0 && b.part > 0
        ? h('p', { class: 'muted', style: { marginTop: '12px' } }, '앞 파트를 마쳤습니다. 잠시 쉬었다가 시작해도 됩니다.')
        : null,
    h('div', { class: 'btn-row end', style: { marginTop: '20px' } }, startBtn),
  );

  const player = new LockedPlayer(freshVideo(), {
    onProgress: (t, d) => {
      if (b.cues?.length) updateSubs(b.cues, t);
      if (d) stageTrack?.update(Math.min(1, t / d) * 0.5);
      if (d) stageBar.style.width = `${Math.min(100, (t / d) * 100)}%`;
      stageStatus.textContent = d ? `${label} · 남은 시간 ${fmtClock(d - t)}` : label;
    },
    onEnded: () => endBlock(b, player),
    onEvent: (type, detail) => sendEvent(type, { position: b.position, ...detail }),
    onError: () => {
      player.dispose();
      abortAndStop('재생 오류', '재생 중에 문제가 생겼습니다. 관리자에게 알려 주세요.');
    },
  });

  try {
    await player.load(b.mediaUrl);
  } catch {
    startBtn.textContent = '파일을 불러오지 못했습니다';
    toast('재생 파일을 불러오지 못했습니다. 관리자에게 알려 주세요.', 'bad');
    return;
  }
  startBtn.disabled = false;
  startBtn.textContent = '▶ 재생 시작';
  startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    requestFullscreen();
    playingPosition = b.position;
    stageTrack = progressTracker({ position: b.position, caption: `${label} · 듣는 중`, dark: true });
    $('#stage-track').replaceChildren(stageTrack || '');
    openStage(b);
    const played = player.play().then(() => true, () => false);
    try {
      await call('/block/start', { method: 'POST', body: {} });
    } catch (err) {
      player.dispose();
      return fail(err);
    }
    if (!(await played)) {
      // 자동 재생이 막힌 드문 경우 — 무대 위에서 한 번 더 누르게 한다
      const again = h('button', { type: 'button', class: 'btn btn-primary btn-lg' }, '▶ 눌러서 재생');
      stageStatus.replaceChildren(again);
      again.addEventListener('click', () => player.play().then(() => again.remove(), () => toast('재생하지 못했습니다.', 'bad')));
    }
  }, { once: true });
}

async function endBlock(b, player) {
  closeStage();
  player.dispose();
  await saveNotesNow();
  let res;
  try {
    res = await call('/block/ended', { method: 'POST', body: { client: { w: innerWidth, h: innerHeight } } });
  } catch (err) {
    return fail(err);
  }
  showQuestion(b, res.questions, 0, b.allowReview && b.mediaUrl ? reviewPlayer(b) : null);
}

// 문제를 푸는 동안 같은 조건의 재생 파일을 다시 재생·이동해 보는 재생기(다시 보기를 켠 실험).
// 소리만 나오는 조건은 오디오만, 자막은 첫 재생과 같다. 문항마다 재생 횟수·실제 재생한 초·이동 횟수를 센다.
function reviewPlayer(b) {
  const media = h(b.screen ? 'video' : 'audio', { class: 'review-media', controls: true, preload: 'auto', playsInline: true });
  media.disablePictureInPicture = true;
  media.setAttribute('controlsList', 'nodownload noplaybackrate noremoteplayback');
  media.addEventListener('contextmenu', (e) => e.preventDefault());
  media.src = b.mediaUrl;
  const adLine = h('p', { class: 'sub-line sub-ad' });
  const speechLine = h('p', { class: 'sub-line sub-speech' });
  const subs = b.cues?.length ? h('div', { class: 'review-subs', 'aria-live': 'off' }, adLine, speechLine) : null;

  let stats = { plays: 0, sec: 0, seeks: 0 };
  let lastT = 0;
  let seekingAt = -Infinity;
  media.addEventListener('seeking', () => (seekingAt = performance.now()));
  media.addEventListener('play', () => {
    // 재생 막대를 옮길 때 브라우저가 내는 재생 이벤트는 재생 시작으로 세지 않는다
    if (performance.now() - seekingAt > 1000) stats.plays += 1;
    lastT = media.currentTime;
  });
  media.addEventListener('seeked', () => {
    stats.seeks += 1;
    lastT = media.currentTime;
  });
  media.addEventListener('timeupdate', () => {
    const t = media.currentTime;
    // 이어서 재생한 만큼만 더한다(이동은 seeked 에서 따로 센다)
    if (!media.paused && !media.seeking && t > lastT && t - lastT < 1.5) stats.sec += t - lastT;
    lastT = t;
    if (subs) {
      const ad = activeCueText(b.cues, 'ad', t);
      const speech = ad ? '' : activeCueText(b.cues, 'speech', t);
      if (adLine.textContent !== ad) adLine.textContent = ad;
      if (speechLine.textContent !== speech) speechLine.textContent = speech;
    }
  });

  const card = h('section', { class: 'card review-card', 'aria-label': b.screen ? '영상 다시 보기' : '소리 다시 듣기' },
    h('h2', null, b.screen ? '영상 다시 보기' : '소리 다시 듣기'),
    media,
    subs,
    h('p', { class: 'muted small', style: { margin: '8px 0 0' } },
      '필요하면 다시 재생하고, 막대를 옮겨 원하는 곳부터 들을 수 있습니다. 이 영상의 문제를 다 풀면 닫힙니다.'));

  return {
    card,
    // 지금 문항 동안의 기록(보내기 전에 읽고, 답이 저장되면 reset)
    peek: () => ({ plays: stats.plays, sec: Math.round(stats.sec * 10) / 10, seeks: stats.seeks }),
    reset: () => {
      stats = { plays: 0, sec: 0, seeks: 0 };
      lastT = media.currentTime;
    },
    pause: () => media.pause(),
    dispose: () => {
      media.pause();
      media.removeAttribute('src');
      media.load();
    },
  };
}

function showQuestion(b, questions, i, review = null) {
  const q = questions[i];
  const shownAt = performance.now();
  const last = i === questions.length - 1;
  const next = h('button', { type: 'submit', class: 'btn btn-primary btn-lg', disabled: true }, last ? '제출' : '다음 문제');
  const options = q.options.map((o, k) =>
    h('label', { class: `option${o.value === UNKNOWN ? ' unknown' : ''}` },
      h('input', { type: 'radio', name: `q-${q.id}`, value: String(o.value) }),
      h('span', { class: 'key', 'aria-hidden': 'true' }, String(k + 1)),
      h('span', null, o.text)),
  );
  const form = h('form', { class: 'card' },
    h('div', { class: 'q-head' },
      h('span', { class: 'q-count' }, `문제 ${q.number} / ${questions.length}`),
      h('span', { class: 'muted small' }, `숫자 키 1~${options.length}로도 고를 수 있어요`)),
    h('fieldset', { style: { border: 0, padding: 0, margin: 0 } },
      h('legend', { class: 'q-stem', tabindex: '-1' }, q.stem),
      h('div', { class: 'choice-list' }, options)),
    h('div', { class: 'btn-row end', style: { marginTop: '22px' } }, next),
  );
  form.addEventListener('change', () => (next.disabled = !form.querySelector('input:checked')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const sel = form.querySelector('input:checked');
    if (!sel || next.disabled) return;
    next.disabled = true;
    try {
      // 마지막 문항을 내면 다음 블록으로 넘어가므로 메모를 먼저 저장한다
      await saveNotesNow();
      review?.pause();
      const r = await call('/answer', {
        method: 'POST',
        body: { questionId: q.id, choice: Number(sel.value), rtMs: Math.round(performance.now() - shownAt), review: review?.peek() },
      });
      review?.reset();
      if (r.next !== 'question') review?.dispose();
      if (r.next === 'question') showQuestion(b, questions, i + 1, review);
      else if (r.next === 'block') runBlock();
      else if (r.next === 'survey') showSurvey();
      else showDone();
    } catch (err) {
      if (!fail(err)) next.disabled = false;
    }
  });

  let notesCard = null;
  if (b.allowNotes) {
    const notesBox = h('textarea', { 'aria-label': '내 메모', spellcheck: 'false', value: notesState.text });
    notesBox.addEventListener('input', () => setNotes(notesBox.value));
    notesCard = h('div', { class: 'card notes-card' }, h('h2', { style: { marginTop: 0, fontSize: '17px' } }, '내 메모'), notesBox,
      h('p', { class: 'muted small', style: { margin: '8px 0 0' } }, '이 영상의 문제를 다 풀면 메모가 지워집니다.'));
  }
  // 다시 보기를 켜면 왼쪽에 재생기·메모, 오른쪽에 문제를 나란히 두어 스크롤 없이 오가게 한다
  const body = review
    ? h('div', { class: 'q-layout review' }, h('div', { class: 'q-side' }, review.card, notesCard), form)
    : notesCard ? h('div', { class: 'q-layout' }, form, notesCard) : form;
  view(2, progressTracker({ position: b.position, inner: 0.5 + 0.5 * (i / questions.length), caption: `지금: ${blockLabel(b)} · 문제 ${i + 1} / ${questions.length}` }), body);
  if (review) app.classList.add('wide');
  keyHandler = (e) => {
    if (e.target.tagName === 'TEXTAREA') return;
    if (e.target.tagName === 'INPUT' && e.target.type !== 'radio') return;
    const n = Number(e.key);
    if (n >= 1 && n <= options.length) {
      const input = options[n - 1].querySelector('input');
      input.checked = true;
      input.focus();
      next.disabled = false;
    }
  };
}

// ---------- 사후 설문 ----------
async function showSurvey() {
  exitFullscreen();
  let data;
  try {
    data = await call('/survey');
  } catch (err) {
    return fail(err);
  }
  const q = data.survey;
  const err = h('p', { class: 'error-text', role: 'alert' });
  const radios = (key) =>
    h('fieldset', { class: 'field', style: { border: 0, padding: 0, margin: '0 0 18px' } },
      h('legend', { class: 'label', style: { marginBottom: '6px', fontWeight: 600 } }, q[key].label),
      h('div', { class: 'choice-list' },
        q[key].options.map((o) => h('label', { class: 'check' }, h('input', { type: 'radio', name: `sv-${key}`, value: o }), h('span', null, o)))));
  const seen = data.contents.map((c) =>
    h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'sv-seen', value: String(c.id) }), h('span', null, c.title)));
  const detail = h('input', { type: 'text', id: 'sv-detail', maxlength: '500' });
  const comment = h('textarea', { id: 'sv-comment', rows: 3, maxlength: '1000' });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-lg btn-block' }, '제출하고 마치기');
  const form = h('form', { class: 'card', novalidate: true },
    radios('headphones'),
    radios('noise'),
    radios('disturbed'),
    h('div', { class: 'field' }, h('label', { for: 'sv-detail' }, q.disturbedDetail.label), detail),
    h('fieldset', { class: 'field', style: { border: 0, padding: 0, margin: '0 0 18px' } },
      h('legend', { class: 'label', style: { marginBottom: '6px', fontWeight: 600 } }, q.seenBefore.label),
      h('div', { class: 'choice-list' }, seen)),
    h('div', { class: 'field' }, h('label', { for: 'sv-comment' }, q.comment.label), comment),
    err,
    submit,
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const val = (key) => form.querySelector(`input[name=sv-${key}]:checked`)?.value;
    if (!val('headphones') || !val('noise') || !val('disturbed')) {
      err.textContent = '위의 세 질문에 모두 답해 주세요.';
      return;
    }
    submit.disabled = true;
    try {
      await call('/survey', {
        method: 'POST',
        body: {
          headphones: val('headphones'),
          noise: val('noise'),
          disturbed: val('disturbed'),
          disturbedDetail: detail.value,
          seenBefore: [...form.querySelectorAll('input[name=sv-seen]:checked')].map((i) => Number(i.value)),
          comment: comment.value,
        },
      });
      showDone();
    } catch (e2) {
      if (!fail(e2)) submit.disabled = false;
    }
  });
  view(2, progressTracker({ position: progressSegments().length - 1, caption: '지금: 마지막 설문' }), title('마지막으로 몇 가지만 알려 주세요'), h('p', { class: 'lead' }, '실험 환경을 확인하는 짧은 설문입니다. 1분이면 끝납니다.'), form);
}

// ---------- [4단계] 완료 ----------
function showDone() {
  forget();
  exitFullscreen();
  let left = info?.doneReturnSeconds ?? 15;
  const counter = h('p', { class: 'muted' }, `${left}초 뒤 첫 화면으로 돌아갑니다.`);
  view(
    3,
    h('div', { class: 'card verdict ok' },
      h('div', { class: 'verdict-mark', 'aria-hidden': 'true' }, '✓'),
      title('수고하셨습니다!'),
      h('p', { class: 'lead' }, info?.doneMessage || '실험이 모두 끝났습니다. 참여해 주셔서 감사합니다.'),
      counter,
      h('div', { class: 'btn-row', style: { justifyContent: 'center', marginTop: '12px' } }, homeButton('지금 처음으로')),
    ),
  );
  const timer = setInterval(() => {
    left -= 1;
    counter.textContent = `${left}초 뒤 첫 화면으로 돌아갑니다.`;
    if (left <= 0) {
      clearInterval(timer);
      location.href = 'index.html';
    }
  }, 1000);
}

// ---------- 시작 ----------
(async function init() {
  const stale = sessionStorage.getItem(TOKEN_KEY);
  if (stale) {
    // 같은 탭에서 새로 고친 경우: 이어서 하지 않고 중단 처리한다
    token = stale;
    await abortAndStop('새로 고침', '페이지를 새로 고쳐 실험이 중단되었습니다.');
    return;
  }
  showRegister();
})();
