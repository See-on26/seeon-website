import { $, clear, h } from './common.js';
import { startScene, startWaves, storage } from './fx.js';
import { markSvg, mountLogos } from './logo.js';
import { requestFullscreen } from './player.js';

// 일반객 체험 (부스)
// 시작 → 1단계(시온 STORY 영상 → SEEON 들어보기) → 2단계(퀴즈: 말에 화면 정보가 담겼는지 맞히기 5문제 또는 화면 없이 듣고 맞히기 1문제) → 완료(STAFF 안내)
// 영상·해설·문항은 data/visitor/, 시온 STORY 영상은 story/ 에 있다.
// STAFF: Esc 를 2초 누르면 어디서든 처음으로, S 는 지금 단계 건너뛰기(점검용, 간식 안내는 띄우지 않는다).

const DATA = 'data/visitor/';
const STORY = 'story/';
const ANSWER_SEC = 20;
const SKIP_AFTER_SEC = 5;
const DETECTION_COUNT = 5;
const DETECTION_GAPS = 3;
const LAST_COMP = 'seeon.visitor.lastComp';
const AD_LABEL = '(시온 AD)';

const app = $('#app');
mountLogos();
startScene($('#backdrop'));
const waves = startWaves($('#waves'), { lines: 5, intensity: 0.5, baseline: 0.9 });

let data = null;
let story = null;
let screen = 'start';
let run = null; // 한 사람의 체험: { ac, booth, stage1, stage2, checkOnly, skip }

class Aborted extends Error {}

// ---------- 공통 ----------
const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => (clearTimeout(id), reject(new Aborted())), { once: true });
  });

function once(target, type, signal) {
  return new Promise((resolve, reject) => {
    const done = () => (target.removeEventListener(type, done), resolve());
    target.addEventListener(type, done);
    signal?.addEventListener('abort', () => (target.removeEventListener(type, done), reject(new Aborted())), { once: true });
  });
}

const shuffle = (list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const ignoreAbort = (err) => {
  if (!(err instanceof Aborted)) console.error(err);
};

// 단계마다 따로 멈출 수 있는 신호. 체험 전체가 끝나면(처음으로) 함께 멈춘다. S 키는 이 단계만 멈춘다.
function stepSignal(r) {
  const step = new AbortController();
  r.ac.signal.addEventListener('abort', () => step.abort(), { once: true });
  r.skip = () => {
    r.checkOnly = true;
    step.abort();
  };
  return step.signal;
}

const title = (text) => h('h1', { class: 'page-title', tabindex: '-1' }, text);
const eyebrow = (text) => h('p', { class: 'eyebrow-mono', lang: 'en' }, text);
const steps = (labels, on) =>
  h('ol', { class: 'steps', 'aria-label': '진행 단계' },
    labels.map((s, i) => h('li', { class: i === on ? 'on' : i < on ? 'done' : '', 'aria-current': i === on ? 'step' : null }, `${i + 1}. ${s}`)));
const MAIN_STEPS = ['시온 STORY', 'SEEON 들어보기', '퀴즈'];

// 왼쪽 위 「처음으로」: 체험 중 어느 화면에서든 일반객 첫 화면으로. 첫 화면과 완료 화면(STAFF가 길게 눌러 돌아간다)에서는 숨긴다.
const homeBtn = $('#v-home');
homeBtn.addEventListener('click', () => reset());

function view(name, ...children) {
  screen = name;
  app.dataset.screen = name;
  homeBtn.hidden = name === 'start' || name === 'done';
  clear(app, ...children);
  window.scrollTo(0, 0);
  (app.querySelector('h1') || app).focus({ preventScroll: true });
}

// 트리거 낱말을 파란색으로 칠한다
function highlight(text, triggers = []) {
  const marks = [];
  for (const t of triggers) {
    const at = text.indexOf(t);
    if (at >= 0) marks.push([at, at + t.length]);
  }
  marks.sort((a, b) => a[0] - b[0]);
  const out = [];
  let pos = 0;
  for (const [s, e] of marks) {
    if (s < pos) continue;
    out.push(text.slice(pos, s), h('mark', { class: 'trig' }, text.slice(s, e)));
    pos = e;
  }
  out.push(text.slice(pos));
  return out;
}

// 시온 STORY 영상 자막과 같은 표시(tools/story/script.json 의 cap): *굵게*, {파란 글씨}
const storyText = (markup) =>
  markup.split(/(\*[^*]+\*|\{[^}]+\})/).filter(Boolean).map((s) =>
    s[0] === '*' ? h('b', null, s.slice(1, -1)) : s[0] === '{' ? h('span', { class: 'blue' }, s.slice(1, -1)) : s);

// 한 줄에 다 들어가도록 글자 크기를 줄인다
function fitOneLine(el, min = 12) {
  el.style.fontSize = '';
  let size = parseFloat(getComputedStyle(el).fontSize);
  while (el.scrollWidth > el.clientWidth + 1 && size > min) {
    size -= 1;
    el.style.fontSize = `${size}px`;
  }
}

// ---------- 영상 + 시온 해설 재생기 (영상 하나를 화면마다 옮겨 쓴다) ----------
const video = h('video', { playsinline: true, preload: 'auto' });
const coverAd = h('p', { class: 'v-cover-ad', hidden: true }, `${AD_LABEL} 시온이 말하는 중`);
const cover = h('div', { class: 'v-cover', 'aria-hidden': 'true' },
  h('div', { class: 'listen-mark mark-live', html: markSvg({ label: '' }) }),
  h('p', null, '화면은 가려져 있어요. 소리에 집중해 주세요'), coverAd);
const ccAd = h('span', { class: 'v-cc-line ad', hidden: true });
const ccLine = h('span', { class: 'v-cc-line', hidden: true });
const cc = h('div', { class: 'v-cc', 'aria-live': 'polite' }, ccAd, ccLine);
const badge = h('div', { class: 'v-badge', hidden: true }, '여기서 정답이 보여요');

// 「다시 보기」는 영상 안에 크게 띄운다(영상 밖의 작은 버튼은 잘 보이지 않았다)
const REPLAY_ICON = '<svg viewBox="0 0 24 24"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4v5h5"/></svg>';
const replayButton = (label) =>
  h('button', { type: 'button', class: 'v-replay' }, h('span', { 'aria-hidden': 'true', html: REPLAY_ICON }), h('span', null, label));
const replay = replayButton('다시 듣기');
replay.hidden = true;
let onReplay = null;
replay.addEventListener('click', () => onReplay?.());
function showReplay(label, action) {
  replay.lastChild.textContent = label;
  onReplay = action;
  replay.hidden = false;
}
function hideReplay() {
  replay.hidden = true;
  onReplay = null;
}

const bar = h('div');
const player = h('div', { class: 'v-player' },
  h('div', { class: 'v-screen' }, video, cover, cc, badge, replay),
  h('div', { class: 'v-progress', 'aria-hidden': 'true' }, bar));
let adAudio = null;

const setBlind = (on) => player.classList.toggle('blind', on);

// CC 자막 두 줄: 아래는 발표자 말(검은 바탕), 그 위는 시온 해설(파란 바탕, 「(시온 AD)」를 붙여 한 줄로). 둘은 함께 뜰 수 있다.
function showCaption(text) {
  ccLine.textContent = text;
  ccLine.hidden = false;
}
function hideCaption() {
  ccLine.hidden = true;
  ccLine.textContent = '';
}

function showAd(cue, withText) {
  if (withText) {
    clear(ccAd, h('b', { class: 'v-cc-label' }, AD_LABEL), ' ', cue.text);
    ccAd.hidden = false;
    fitOneLine(ccAd);
  }
  coverAd.hidden = false;
  player.classList.add('speaking');
}
function hideAd() {
  ccAd.hidden = true;
  ccAd.textContent = '';
  coverAd.hidden = true;
  player.classList.remove('speaking');
}

function stopMedia() {
  video.pause();
  adAudio?.pause();
  adAudio = null;
  hideAd();
  hideCaption();
  hideReplay();
  badge.hidden = true;
}

async function playAd(cue, signal, rate = 1) {
  const audio = new Audio(DATA + 'ad/' + cue.id + '.mp3' + (cue.v ? `?v=${cue.v}` : '')); // v: 빌드가 붙이는 음성 버전
  audio.playbackRate = rate;
  adAudio = audio;
  waves.setEnergy(1.0);
  try {
    await audio.play();
    await once(audio, 'ended', signal);
  } catch (err) {
    if (err instanceof Aborted) throw err;
    await sleep(2500 / rate, signal); // 소리를 못 내면 자막만 잠깐 보여 준다
  } finally {
    audio.pause();
    if (adAudio === audio) adAudio = null;
    waves.setEnergy(0.55);
  }
}

// 다른 영상으로 바꿀 때는 새 장면이 준비될 때까지 화면을 감춘다(앞 영상의 마지막 장면이 번쩍이지 않게)
async function loadClip(clipId, signal) {
  const clip = data.clips[clipId];
  if (video.dataset.clip !== clipId) {
    player.classList.add('switching');
    video.dataset.clip = clipId;
    video.src = DATA + clip.video;
    video.load();
  }
  if (video.readyState < 1) await once(video, 'loadedmetadata', signal);
  return clip;
}

async function seek(sec, signal) {
  if (!(Math.abs(video.currentTime - sec) < 0.05 && video.readyState >= 2)) {
    video.currentTime = sec;
    await once(video, 'seeked', signal);
  }
  player.classList.remove('switching');
}

// start~end 를 재생한다.
//  withAd: 그 사이의 해설을 넣는다(pause: 영상을 멈추고 / duck: 원음을 줄이고)
//  captions: 해설 자막을 띄운다 / subs: 발표자 말 자막도 띄운다 / rate: 영상·해설 재생 속도
async function playSegment({ clipId, start, end, withAd = true, captions = true, subs = false, rate = 1, onTime }, signal) {
  const clip = await loadClip(clipId, signal);
  end = Math.min(end, video.duration || end);
  await seek(start, signal);
  const cues = withAd ? clip.ad.filter((a) => a.at >= start - 0.05 && a.at < end).map((a) => ({ ...a, done: false })) : [];
  const lines = subs ? (clip.subs || []).filter((l) => l.end > start + 0.2) : []; // 앞 문장의 끝자락이 번쩍이지 않게
  const duck = [];
  const runCue = async (cue) => {
    cue.done = true;
    showAd(cue, captions);
    if (cue.mode === 'duck') {
      video.volume = 0.3;
      duck.push(playAd(cue, signal, rate).finally(() => ((video.volume = 1), hideAd())));
      return;
    }
    video.pause();
    await playAd(cue, signal, rate);
    hideAd();
  };
  video.volume = 1;
  video.playbackRate = rate;
  video.defaultPlaybackRate = rate;
  hideCaption();
  for (const cue of cues) if (cue.at <= start + 0.05) await runCue(cue);
  await video.play();
  await new Promise((resolve, reject) => {
    let shown = null;
    const tick = async () => {
      if (signal.aborted) return reject(new Aborted());
      const now = video.currentTime;
      bar.style.width = `${Math.min(100, ((now - start) / (end - start)) * 100)}%`;
      onTime?.(now);
      // 해설을 먼저 본다: 영상을 멈추는 해설 동안에는 그 앞까지 하던 말의 자막을 그대로 둔다
      const cue = cues.find((c) => !c.done && now >= c.at);
      if (cue) {
        try {
          await runCue(cue);
          // 구간 끝에 걸린 해설 뒤에는 다시 틀지 않는다(다음 말의 첫소리가 묻어나지 않게)
          if (cue.mode !== 'duck' && video.currentTime < end - 0.03) await video.play();
        } catch (err) {
          return reject(err);
        }
      }
      if (lines.length) {
        const line = lines.find((l) => now >= l.start && now < l.end);
        if (line !== shown) {
          shown = line;
          if (line) showCaption(line.text);
          else hideCaption();
        }
      }
      if (now >= end - 0.03 || video.ended) {
        video.pause();
        return resolve();
      }
      setTimeout(tick, 40); // 화면이 가려져도 멈추지 않게 requestAnimationFrame 대신 타이머로 잰다
    };
    setTimeout(tick, 40);
  });
  await Promise.all(duck);
  hideCaption();
  video.playbackRate = 1;
  video.defaultPlaybackRate = 1;
}

// ---------- 시작 ----------
function renderStart() {
  stopMedia();
  document.body.classList.remove('v-running');
  const booth = !!data;
  const start = h('button', { type: 'button', class: 'btn btn-primary btn-lg v-start' }, booth ? '체험 시작하기' : '시온 STORY 보기');
  start.addEventListener('click', () => {
    if (booth) requestFullscreen();
    begin(booth);
  });
  const flow = [
    ['STORY', '시온 STORY', '시온을 왜 만들었는지 30초 영상으로 봐요.'],
    ['LISTEN', 'SEEON 들어보기', '시온 해설이 붙은 영상을 화면과 함께 들어 봐요.'],
    ['QUIZ', '퀴즈', '두 가지 퀴즈 중 하나를 풀어요.'],
  ].slice(0, booth ? 3 : 1);
  view('start',
    h('div', { class: 'card hud-card v-start-card' },
      h('span', { class: 'corners', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i')),
      eyebrow('SEEON EXPERIENCE'),
      title('화면 없이, 소리로 따라가 보세요'),
      booth ? null : h('p', { class: 'lead' }, '퀴즈 체험은 시온 부스에서 할 수 있어요. 여기서는 시온을 왜 만들었는지 영상으로 볼 수 있어요.'),
      h('ol', { class: 'v-flow' }, flow.map(([k, t, d]) =>
        h('li', null, h('b', { lang: 'en' }, k), h('strong', null, t), h('span', null, d)))),
      h('p', { class: 'v-phones' },
        h('span', { 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24"><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><path d="M4 15a2 2 0 0 1 2-2h1v7H6a2 2 0 0 1-2-2z"/><path d="M20 15a2 2 0 0 0-2-2h-1v7h1a2 2 0 0 0 2-2z"/></svg>' }),
        '헤드폰을 쓰고 체험해 주세요'),
      h('div', { class: 'btn-row v-start-row' }, start,
        booth ? null : h('a', { class: 'btn btn-lg', href: 'index.html' }, '체험 첫 화면으로'))));
}

function begin(booth) {
  run?.ac.abort();
  run = { ac: new AbortController(), booth, stage1: false, stage2: false, checkOnly: false, skip: null };
  document.body.classList.toggle('v-running', booth);
  playStory(run).catch(ignoreAbort);
}

function reset() {
  run?.ac.abort();
  run = null;
  renderStart();
}

// ---------- 1단계 ① 시온 STORY (한 편의 영상) ----------
// 문제 → 시온으로 이어지는 영상(tools/story_video.py 로 만든다). 내레이션·자막은 영상에 들어 있다.
// 시작 5초 뒤 「건너뛰기」, 끝나면 영상 안에 「다시 보기」, 아래에 「넘기기」.
async function playStory(r) {
  const signal = stepSignal(r);
  const film = h('video', { class: 'v-intro', src: story.video, playsinline: true, preload: 'auto' });
  const skip = h('button', { type: 'button', class: 'v-skip', hidden: true },
    '건너뛰기', h('span', { 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24"><path d="M5 5v14l10-7z"/><path d="M17 5h2v14h-2z"/></svg>' }));
  const again = replayButton('다시 보기');
  again.hidden = true;
  const fill = h('div');
  const after = h('div', { class: 'v-after', hidden: true });
  view('story',
    r.booth ? steps(MAIN_STEPS, 0) : null,
    h('h1', { class: 'v-sr', tabindex: '-1' }, '시온 STORY'),
    h('div', { class: 'v-stage' },
      h('div', { class: 'v-film-wrap' }, h('div', { class: 'v-film' }, film, skip, again), h('div', { class: 'v-progress', 'aria-hidden': 'true' }, fill))),
    h('div', { class: 'v-after-slot' }, after)); // 끝난 뒤 나오는 버튼 자리를 미리 비워 둬 영상 크기가 그대로다
  const goDemo = () => {
    if (screen !== 'story' || run !== r) return;
    film.pause();
    if (!r.booth) return renderStoryEnd();
    renderDemo(r);
  };
  const tick = setInterval(() => {
    if (film.duration) fill.style.width = `${Math.min(100, (film.currentTime / film.duration) * 100)}%`;
    if (skip.hidden && after.hidden && film.currentTime >= SKIP_AFTER_SEC) skip.hidden = false;
  }, 100);
  skip.addEventListener('click', () => {
    clearInterval(tick);
    goDemo();
  });
  signal.addEventListener('abort', () => {
    clearInterval(tick);
    film.pause();
    if (!r.ac.signal.aborted) goDemo(); // S: 건너뛰기
  }, { once: true });
  film.addEventListener('ended', () => {
    clearInterval(tick);
    if (screen !== 'story' || run !== r) return;
    fill.style.width = '100%';
    skip.hidden = true;
    const next = h('button', { type: 'button', class: 'btn btn-primary btn-lg' }, '넘기기 →');
    again.addEventListener('click', () => playStory(r).catch(ignoreAbort));
    next.addEventListener('click', goDemo);
    clear(after, h('div', { class: 'btn-row v-center' }, next));
    again.hidden = false;
    after.hidden = false;
    next.focus();
  }, { once: true });
  try {
    await film.play();
  } catch {
    // 소리를 낼 수 없으면(자동 재생 막힘) 소리 없이라도 튼다
    film.muted = true;
    await film.play().catch(() => {});
  }
}

function renderStoryEnd() {
  const again = h('button', { type: 'button', class: 'btn btn-primary btn-lg' }, '다시 보기');
  again.addEventListener('click', () => begin(false));
  view('story-end',
    h('div', { class: 'card' },
      title('시온 STORY 를 다 보셨어요'),
      h('p', { class: 'lead' }, '시온 해설을 직접 들어 보고 퀴즈를 푸는 체험은 시온 부스에서 할 수 있어요.'),
      h('div', { class: 'btn-row', style: { marginTop: '20px' } }, again, h('a', { class: 'btn btn-lg', href: 'index.html' }, '체험 첫 화면으로'))));
}

// ---------- 1단계 ② SEEON 들어보기 ----------
function renderDemo(r) {
  const signal = stepSignal(r);
  const demo = typeof data.demo === 'string' ? { clip: data.demo, start: 0, end: 1e6, rate: 1 } : data.demo;
  const clip = data.clips[demo.clip];
  const next = h('button', { type: 'button', class: 'btn btn-primary btn-lg' }, '다음으로 →');
  // 다 듣고 나면 화면 전체를 반투명한 검은 막으로 덮고, 시온 STORY 자막과 같은 말투·꼴(흰 글씨, 핵심 낱말만 파란 글씨)로 풀어 준다.
  // 이 영상은 한 번만 들려준다(다시 보기 없음).
  const after = h('div', { class: 'v-overlay', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'v-demo-done' },
    h('div', { class: 'v-overlay-box' },
      h('h2', { id: 'v-demo-done' }, '방금 들으셨나요?'),
      h('p', null, ...storyText('발표자는 *“보시면 10.9, 9.3”*이라고만 말했습니다.'), h('br'),
        ...storyText('{숫자의 의미}를 알 수 없었지만, {시온}은 그 {빈자리}를 채웠습니다.')),
      h('div', { class: 'btn-row v-center' }, next)));
  setBlind(false);
  bar.style.width = '0';
  view('demo',
    h('div', { class: 'q-head' }, h('h1', { class: 'page-title v-quiz-title', tabindex: '-1' }, 'SEEON 들어보기'), steps(MAIN_STEPS, 1)),
    h('p', { class: 'lead' }, `「${clip.title}」을 설명하는 장면이에요. 검은 자막은 발표자의 말, 파란 자막 ${AD_LABEL}는 시온의 해설이에요.`),
    h('div', { class: 'v-stage' }, player),
    after);
  const play = async () => {
    await playSegment({ clipId: demo.clip, start: demo.start, end: demo.end, withAd: true, subs: true, rate: demo.rate || 1 }, signal);
    after.hidden = false;
    r.stage1 = true;
    next.focus();
  };
  next.addEventListener('click', () => {
    stopMedia();
    renderChoose(r);
  });
  signal.addEventListener('abort', () => {
    if (!r.ac.signal.aborted && screen === 'demo') renderChoose(r); // S: 건너뛰기
  }, { once: true });
  sleep(600, signal).then(play).catch(ignoreAbort);
}

// ---------- 2단계: 퀴즈 고르기 ----------
function renderChoose(r) {
  stopMedia();
  r.skip = null;
  const card = (key, k, name, desc) => {
    const el = h('button', { type: 'button', class: 'v-choice' },
      h('span', { class: 'v-choice-k' }, k),
      h('strong', null, name),
      h('span', null, desc));
    el.addEventListener('click', () => (key === 'det' ? runDetection(r) : runComprehension(r)).catch(ignoreAbort));
    return el;
  };
  view('choose',
    steps(MAIN_STEPS, 2),
    title('어떤 퀴즈를 풀어 볼까요?'),
    h('p', { class: 'v-time' }, h('span', { 'aria-hidden': 'true' }, '⏱'), ' 예상 시간 약 1분 30초'),
    h('div', { class: 'v-choices' },
      card('det', '유형 1', '말에 화면 정보가 담겼는지 맞히기', '발표자의 말 한 마디를 듣고, 화면을 봐야 알 수 있는 말인지 맞혀 보세요.'),
      card('comp', '유형 2', '화면 없이 듣고 맞히기', '화면을 가린 채 시온 해설만 듣고, 화면 속 정답을 맞혀 보세요.')));
}

// ---------- 2단계 ① 탐지: 말에 화면 정보가 담겼는지 맞히기 ----------
// 영상마다 한 문장씩 5문제. 빈자리 3개, 아닌 것 2개를 섞는다.
// 앞 맥락이 있어야 답이 정해지는 문항(item.context)은 앞에서 한 말부터 들려주고, 카드에도 그 말을 적어 둔다.
function pickDetection() {
  const byClip = new Map();
  for (const item of data.detection) {
    if (!byClip.has(item.clip)) byClip.set(item.clip, []);
    byClip.get(item.clip).push(item);
  }
  const clips = shuffle([...byClip.keys()]).slice(0, DETECTION_COUNT);
  const noClips = new Set(shuffle(clips.filter((c) => byClip.get(c).some((it) => !it.gap))).slice(0, DETECTION_COUNT - DETECTION_GAPS));
  return clips.map((c) => {
    const pool = byClip.get(c).filter((it) => it.gap === !noClips.has(c));
    const list = pool.length ? pool : byClip.get(c);
    return list[Math.floor(Math.random() * list.length)];
  });
}

async function runDetection(r) {
  const signal = stepSignal(r);
  const items = pickDetection();
  const results = [];
  try {
    for (let i = 0; i < items.length; i++) results.push(await detectionItem(items[i], i, items.length, signal));
  } catch (err) {
    if (!(err instanceof Aborted) || r.ac.signal.aborted) throw err;
    stopMedia();
    r.stage2 = true;
    return renderDone(r); // S: 건너뛰기
  }
  stopMedia();
  r.stage2 = true;
  renderDetectionResult(r, items, results);
}

async function detectionItem(item, i, total, signal) {
  const yes = h('button', { type: 'button', class: 'v-ox o', disabled: true }, h('b', null, 'O'), '화면을 봐야 알 수 있어요');
  const no = h('button', { type: 'button', class: 'v-ox x', disabled: true }, h('b', null, 'X'), '말로 충분해요');
  const ask = h('div', { class: 'v-ask' },
    h('p', { class: 'q-stem' }, '이 말, 화면을 봐야 알 수 있을까요?'),
    h('div', { class: 'v-ox-row' }, yes, no));
  const out = h('div', { class: 'v-reveal', hidden: true });
  setBlind(true);
  bar.style.width = '0';
  view('detection',
    h('div', { class: 'q-head' },
      h('h1', { class: 'page-title v-quiz-title', tabindex: '-1' }, '말에 화면 정보가 담겼는지 맞히기'),
      h('span', { class: 'q-count' }, `${i + 1} / ${total}`)),
    h('div', { class: 'v-split' },
      player,
      h('div', { class: 'card v-quote-card' },
        item.context ? h('p', { class: 'v-context' }, h('b', null, '앞에서 한 말'), item.context.text) : null,
        h('p', { class: 'v-quote' }, '“', ...highlight(item.text, item.triggers), '”'),
        h('p', { class: 'v-legend' }, h('mark', { class: 'trig' }, '파란 글씨'), '는 시온이 "화면을 가리키는 말"로 보는 표현이에요.'),
        ask, out)));

  // 다 들으면 가려진 영상 안에 「다시 듣기」
  const listen = async () => {
    [yes, no].forEach((b) => (b.disabled = true));
    hideReplay();
    await playSegment({ clipId: item.clip, start: item.context?.start ?? item.start, end: item.end, withAd: false, subs: true }, signal);
    [yes, no].forEach((b) => (b.disabled = false));
    showReplay('다시 듣기', () => listen().catch(ignoreAbort));
  };
  await sleep(400, signal);
  await listen();
  yes.focus();

  const choice = await new Promise((resolve, reject) => {
    const finish = (v) => {
      window.removeEventListener('keydown', onKey);
      resolve(v);
    };
    const onKey = (e) => {
      if (yes.disabled) return;
      if (e.key === '1' || e.key.toLowerCase() === 'o') finish(true);
      if (e.key === '2' || e.key.toLowerCase() === 'x') finish(false);
    };
    yes.addEventListener('click', () => finish(true));
    no.addEventListener('click', () => finish(false));
    window.addEventListener('keydown', onKey);
    signal.addEventListener('abort', () => (window.removeEventListener('keydown', onKey), reject(new Aborted())), { once: true });
  });

  const correct = choice === item.gap;
  ask.hidden = true;
  hideReplay();
  setBlind(false);
  await seek(item.frame, signal);
  const next = h('button', { type: 'button', class: 'btn btn-primary btn-lg' }, i + 1 < total ? '다음 문제 →' : '결과 보기 →');
  clear(out,
    h('p', { class: `v-verdict ${correct ? 'ok' : 'bad'}` }, correct ? '맞혔어요! ' : '아쉬워요! ',
      h('span', null, item.gap ? '화면을 봐야 알 수 있는 빈자리예요.' : '말로 충분한 문장이에요.')),
    h('p', { class: 'v-why' }, item.why),
    item.gap ? null : h('p', { class: 'v-why muted' }, '그래서 시온은 여기서 조용히 있었어요.'),
    h('div', { class: 'btn-row', style: { marginTop: '14px' } }, next));
  out.hidden = false;
  next.focus();
  // 해설이 나오는 중에 눌러도 바로 다음 문제로 간다
  const clicked = once(next, 'click', signal).then(() => 'next');
  const cue = item.gap && data.clips[item.clip].ad.find((a) => a.id === item.ad);
  if (cue) {
    showCaption(item.text); // 발표자가 한 말과 그 빈자리를 채우는 시온 해설을 함께 보여 준다
    showAd(cue, true);
    const said = playAd(cue, signal).then(() => 'ad');
    said.catch(() => {});
    if ((await Promise.race([said, clicked])) === 'next') {
      stopMedia();
      return { correct, choice };
    }
  }
  await Promise.race([clicked, sleep(cue ? 4000 : 6000, signal)]);
  hideAd();
  hideCaption();
  return { correct, choice };
}

function renderDetectionResult(r, items, results) {
  const score = results.filter((x) => x.correct).length;
  const done = h('button', { type: 'button', class: 'btn btn-primary btn-lg' }, '체험 마치기 →');
  done.addEventListener('click', () => renderDone(r));
  view('detection-result',
    steps(MAIN_STEPS, 2),
    h('div', { class: 'card v-det-result' },
      title(`${results.length}문제 중 ${score}개를 맞혔어요`),
      h('ol', { class: 'v-score' }, items.map((it, k) =>
        h('li', { class: results[k].correct ? 'ok' : 'bad' },
          h('b', { 'aria-label': results[k].correct ? '맞힘' : '틀림' }, results[k].correct ? 'O' : 'X'),
          h('span', null, '“', ...highlight(it.text, it.triggers), '”'),
          h('em', null, it.gap ? '빈자리' : '빈자리 아님')))),
      h('p', { class: 'lead' }, '시온도 발표자의 말을 들으며 방금처럼 판단해요. 한국어·영어 문장 3,600개로 시험했을 때, 화면을 봐야 알 수 있는 말을 놓치지 않고 정확하게 골라낸 정도가 100점 만점에 96.1점(F1 점수)이었어요.'),
      h('div', { class: 'btn-row' }, done)));
  done.focus();
}

// ---------- 2단계 ② 이해도: 화면 없이 듣고 맞히기 ----------
// 화면을 가린 채 해설과 함께 듣기(문제는 옆에 함께) → 답 고르기 → 화면과 함께 정답 장면 보기 → 정답 확인
function pickComprehension() {
  const all = data.comprehension;
  const pool = all.filter((c) => c.id !== storage.get(LAST_COMP));
  const list = pool.length ? pool : all;
  const item = list[Math.floor(Math.random() * list.length)];
  storage.set(LAST_COMP, item.id);
  return item;
}

const COMP_STEPS = ['듣기', '답 고르기', '화면과 함께 보기', '정답'];

async function runComprehension(r) {
  const signal = stepSignal(r);
  const item = pickComprehension();
  const options = item.options;
  let selected = null;
  let listened = false;
  const confirm = h('button', { type: 'button', class: 'btn btn-primary btn-lg', disabled: true }, '정답 확인 →');
  const inputs = [];
  const list = h('div', { class: 'choice-list' }, options.map((text, k) => {
    const input = h('input', { type: 'radio', name: 'v-comp', value: String(k) });
    inputs.push(input);
    input.addEventListener('change', () => {
      selected = k;
      confirm.disabled = !listened;
    });
    return h('label', { class: 'option' }, input,
      h('span', { class: 'key', 'aria-hidden': 'true' }, String(k + 1)), h('span', null, text));
  }));
  const timer = h('div', { class: 'v-timer', hidden: true }, h('div'));
  const hint = h('p', { class: 'muted small v-hint' }, `소리가 끝나면 ${ANSWER_SEC}초 동안 답을 고를 수 있어요. 듣는 동안 골라도 돼요.`);
  const stepBar = h('div');
  const setStep = (k) => clear(stepBar, steps(COMP_STEPS, k));
  const onKey = (e) => {
    const k = Number(e.key) - 1;
    if (k >= 0 && k < inputs.length && !inputs[k].disabled) inputs[k].click();
  };
  setBlind(true);
  bar.style.width = '0';
  setStep(0);
  view('comprehension',
    h('div', { class: 'q-head' },
      h('h1', { class: 'page-title v-quiz-title', tabindex: '-1' }, '화면 없이, 시온 해설만 듣고 맞혀 보세요'),
      stepBar),
    h('div', { class: 'v-split' },
      player,
      h('div', { class: 'card' },
        h('p', { class: 'q-stem' }, item.stem),
        list, timer, hint,
        h('div', { class: 'btn-row end', style: { marginTop: '16px' } }, confirm))));
  window.addEventListener('keydown', onKey);
  try {
    await sleep(700, signal);
    await playSegment({ clipId: item.clip, start: item.start, end: item.end, withAd: true, subs: true }, signal);
    listened = true;
    setStep(1);
    hint.textContent = '이제 답을 골라 주세요.';
    confirm.disabled = selected === null;
    timer.hidden = false;
    timer.firstChild.style.animationDuration = `${ANSWER_SEC}s`;
    timer.firstChild.classList.add('run');
    await Promise.race([once(confirm, 'click', signal), sleep(ANSWER_SEC * 1000, signal)]);
    window.removeEventListener('keydown', onKey);
    timer.hidden = true;
    inputs.forEach((input) => (input.disabled = true));

    // 화면과 함께 정답 장면 보기
    setStep(2);
    confirm.hidden = true;
    hint.textContent = '이번에는 화면과 함께 봐요. 정답이 화면에 나와요.';
    setBlind(false);
    // reveal: 정답이 보이는 장면을 말이 끊기지 않게 문장 단위로 잡은 구간. 끝나면 마지막 장면을 잠깐 더 보여 준다
    const reveal = item.reveal || { start: Math.max(0, item.answerAt - 5), end: item.answerAt + 6 };
    await playSegment({
      clipId: item.clip, start: reveal.start, end: reveal.end, withAd: false, subs: true,
      onTime: (t) => (badge.hidden = t < item.answerAt - 0.3),
    }, signal);
    await sleep(1500, signal);
    badge.hidden = true;
  } catch (err) {
    window.removeEventListener('keydown', onKey);
    if (!(err instanceof Aborted) || r.ac.signal.aborted) throw err;
    stopMedia();
    r.stage2 = true;
    return renderDone(r); // S: 건너뛰기
  }
  r.stage2 = true;
  renderComprehensionResult(r, item, options, selected);
}

function renderComprehensionResult(r, item, options, selected) {
  const correct = selected === item.answer;
  const done = h('button', { type: 'button', class: 'btn btn-primary btn-lg' }, '체험 마치기 →');
  done.addEventListener('click', () => renderDone(r));
  view('comprehension-result',
    steps(COMP_STEPS, 3),
    h('div', { class: 'card v-comp-result' },
      h('div', { class: `verdict ${correct ? 'ok' : 'bad'}` },
        h('div', { class: 'verdict-mark', 'aria-hidden': 'true' }, correct ? 'O' : 'X'),
        title(correct ? '정답이에요!' : selected === null ? '시간이 다 됐어요' : '아쉬워요, 오답이에요')),
      h('p', { class: 'q-stem' }, item.stem),
      h('div', { class: 'choice-list' }, options.map((text, k) => {
        const cls = k === item.answer ? ' is-answer' : k === selected ? ' is-wrong' : '';
        const tag = k === item.answer ? '정답' : k === selected ? '내 답' : '';
        return h('div', { class: `option${cls}`, 'aria-disabled': 'true' },
          h('span', { class: 'key', 'aria-hidden': 'true' }, String(k + 1)), h('span', { style: { flex: 1 } }, text), tag ? h('b', { class: 'small' }, tag) : null);
      })),
      h('div', { class: 'notice' }, item.explanation),
      h('p', { class: 'lead' }, '시온 해설 덕분에 화면을 보지 않고도 답을 알 수 있었어요. 화면을 보며 들을 때 이해하는 정도를 100이라고 하면, 시온 해설을 함께 들었을 때는 소리만 들을 때보다 그 100에 20.8%p 더 가까워졌어요(강의·회의·보고 영상 30개로 잰 결과).'),
      h('div', { class: 'btn-row' }, done)));
  done.focus();
}

// ---------- 완료 ----------
function renderDone(r) {
  stopMedia();
  r.skip = null;
  const full = r.stage1 && r.stage2 && !r.checkOnly;
  view('done',
    h('div', { class: 'card v-done' },
      h('div', { class: 'verdict ok' }, h('div', { class: 'verdict-mark', 'aria-hidden': 'true' }, '✓'), title('체험을 모두 마쳤어요!')),
      full
        ? h('div', { class: 'staff-callout' }, 'STAFF에게 이 화면을 보여 주고 간식 뽑기에 참여하세요')
        : h('div', { class: 'notice' }, '점검용으로 단계를 건너뛰었어요. 간식 안내는 띄우지 않아요.'),
      h('div', { class: 'btn-row', style: { justifyContent: 'center', marginTop: '22px' } },
        holdButton('처음으로', 'STAFF: 1초 길게 누르기', reset))));
}

// 1초 길게 눌러야 동작하는 버튼(방문객이 STAFF에게 보여 주기 전에 실수로 누르지 않게)
function holdButton(label, sub, action, ms = 1000) {
  const fill = h('span', { class: 'v-hold-fill', 'aria-hidden': 'true' });
  const btn = h('button', { type: 'button', class: 'btn btn-lg v-hold', 'aria-label': `${label} (${sub})` },
    fill, h('span', null, label), h('small', null, sub));
  let timer = 0;
  const startHold = (e) => {
    if (e.type === 'keydown' && (e.repeat || (e.key !== 'Enter' && e.key !== ' '))) return;
    e.preventDefault();
    btn.classList.add('holding');
    fill.style.transitionDuration = `${ms}ms`;
    timer = setTimeout(() => {
      btn.classList.remove('holding');
      action();
    }, ms);
  };
  const cancel = () => {
    clearTimeout(timer);
    fill.style.transitionDuration = '0ms';
    btn.classList.remove('holding');
  };
  btn.addEventListener('pointerdown', startHold);
  btn.addEventListener('keydown', startHold);
  ['pointerup', 'pointerleave', 'pointercancel', 'keyup', 'blur'].forEach((t) => btn.addEventListener(t, cancel));
  btn.addEventListener('click', (e) => e.preventDefault());
  return btn;
}

// ---------- 운영: STAFF 키 ----------
let escTimer = 0;
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !e.repeat) escTimer = setTimeout(reset, 2000);
  if ((e.key === 's' || e.key === 'S') && !e.repeat && run?.skip) {
    stopMedia();
    run.skip();
  }
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'Escape') clearTimeout(escTimer);
});

// ---------- 불러오기 ----------
async function loadJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

(async () => {
  try {
    story = await loadJson(STORY + 'story.json');
  } catch {
    story = { video: STORY + 'story.mp4' };
  }
  try {
    data = await loadJson(DATA + 'visitor.json');
  } catch {
    data = null; // 영상·문항이 없는 곳: 시온 STORY 만 보여 준다
  }
  renderStart();
})();
