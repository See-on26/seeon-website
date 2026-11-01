import { $, clear, h } from './common.js';
import { startScene, startWaves, storage } from './fx.js';
import { markSvg, mountLogos } from './logo.js';
import { requestFullscreen } from './player.js';

// 일반객 체험 (부스)
// 시작 → 1단계(시온 이야기 슬라이드 → 효과 들어 보기) → 2단계(탐지 5문제 또는 이해도 1문제 중 고르기) → 완료(STAFF 안내)
// 영상·해설·문항은 비공개 저장소(seeon-booth-data)의 visitor/ 를 data/visitor/ 에 두었을 때만 있다.
// 없으면(공개 사이트) 시온 이야기만 들려주고 "부스에서 체험할 수 있어요"라고 안내한다.
// STAFF: Esc 를 2초 누르면 어디서든 처음으로, S 는 지금 단계 건너뛰기(점검용, 간식 안내는 띄우지 않는다).

const DATA = 'data/visitor/';
const STORY = 'story/';
const IDLE_MS = 3 * 60 * 1000;
const ANSWER_SEC = 20;
const DETECTION_COUNT = 5;
const DETECTION_GAPS = 3;
const UNKNOWN = '알 수 없음';
const LAST_COMP = 'seeon.visitor.lastComp';

const app = $('#app');
mountLogos();
startScene($('#backdrop'));
const waves = startWaves($('#waves'), { lines: 5, intensity: 0.5, baseline: 0.9 });

let data = null;
let story = null;
let screen = 'start';
let busy = false; // 영상·음성이 재생 중이면 자동 초기화를 미룬다
let lastInput = Date.now();
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
const MAIN_STEPS = ['시온 이야기', '효과 들어 보기', '퀴즈'];

function view(name, ...children) {
  screen = name;
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

// "**여기를** 보시면" 처럼 별표로 감싼 곳을 트리거로 칠한다
const starred = (text) => text.split(/\*\*(.+?)\*\*/).map((part, i) => (i % 2 ? h('mark', { class: 'trig' }, part) : part));

// ---------- 영상 + 시온 해설 재생기 (영상 하나를 화면마다 옮겨 쓴다) ----------
const video = h('video', { playsinline: true, preload: 'auto' });
const coverAd = h('p', { class: 'v-cover-ad', hidden: true }, '시온이 말하는 중');
const cover = h('div', { class: 'v-cover', 'aria-hidden': 'true' },
  h('div', { class: 'listen-mark mark-live', html: markSvg({ label: '' }) }),
  h('p', null, '화면은 가려져 있어요. 소리에 집중해 주세요'), coverAd);
const adText = h('span');
const adBar = h('div', { class: 'v-ad', hidden: true, 'aria-live': 'polite' }, h('b', null, '시온'), adText);
const badge = h('div', { class: 'v-badge', hidden: true }, '여기서 정답이 보여요');
const bar = h('div');
const player = h('div', { class: 'v-player' },
  h('div', { class: 'v-screen' }, video, cover, adBar, badge),
  h('div', { class: 'v-progress', 'aria-hidden': 'true' }, bar));
let adAudio = null;

const setBlind = (on) => player.classList.toggle('blind', on);

function showAd(cue, withText) {
  adText.textContent = cue.text;
  adBar.hidden = !withText;
  coverAd.hidden = false;
  player.classList.add('speaking');
}
function hideAd() {
  adBar.hidden = true;
  coverAd.hidden = true;
  player.classList.remove('speaking');
}

function stopMedia() {
  video.pause();
  adAudio?.pause();
  adAudio = null;
  hideAd();
  badge.hidden = true;
  busy = false;
}

async function playAd(cue, signal) {
  const audio = new Audio(DATA + 'ad/' + cue.id + '.mp3');
  adAudio = audio;
  waves.setEnergy(1.0);
  try {
    await audio.play();
    await once(audio, 'ended', signal);
  } catch (err) {
    if (err instanceof Aborted) throw err;
    await sleep(2500, signal); // 소리를 못 내면 자막만 잠깐 보여 준다
  } finally {
    audio.pause();
    if (adAudio === audio) adAudio = null;
    waves.setEnergy(0.55);
  }
}

async function loadClip(clipId, signal) {
  const clip = data.clips[clipId];
  if (video.dataset.clip !== clipId) {
    video.dataset.clip = clipId;
    video.src = DATA + clip.video;
    video.load();
  }
  if (video.readyState < 1) await once(video, 'loadedmetadata', signal);
  return clip;
}

async function seek(sec, signal) {
  if (Math.abs(video.currentTime - sec) < 0.05 && video.readyState >= 2) return;
  video.currentTime = sec;
  await once(video, 'seeked', signal);
}

// start~end 를 재생한다. withAd 면 그 사이의 해설을 넣는다(pause: 영상을 멈추고 / duck: 원음을 줄이고).
async function playSegment({ clipId, start, end, withAd = true, adText: withText = true, onTime }, signal) {
  const clip = await loadClip(clipId, signal);
  end = Math.min(end, video.duration || end);
  await seek(start, signal);
  const cues = withAd ? clip.ad.filter((a) => a.at >= start - 0.05 && a.at < end).map((a) => ({ ...a, done: false })) : [];
  const duck = [];
  const runCue = async (cue) => {
    cue.done = true;
    showAd(cue, withText);
    if (cue.mode === 'duck') {
      video.volume = 0.3;
      duck.push(playAd(cue, signal).finally(() => ((video.volume = 1), hideAd())));
      return;
    }
    video.pause();
    await playAd(cue, signal);
    hideAd();
  };
  busy = true;
  video.volume = 1;
  try {
    for (const cue of cues) if (cue.at <= start + 0.05) await runCue(cue);
    await video.play();
    await new Promise((resolve, reject) => {
      const tick = async () => {
        if (signal.aborted) return reject(new Aborted());
        const now = video.currentTime;
        bar.style.width = `${Math.min(100, ((now - start) / (end - start)) * 100)}%`;
        onTime?.(now);
        const cue = cues.find((c) => !c.done && now >= c.at);
        if (cue) {
          try {
            await runCue(cue);
            if (cue.mode !== 'duck') await video.play();
          } catch (err) {
            return reject(err);
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
  } finally {
    busy = false;
  }
}

// ---------- 시작 ----------
function renderStart() {
  stopMedia();
  document.body.classList.remove('v-running');
  const booth = !!data;
  const start = h('button', { type: 'button', class: 'btn btn-primary btn-lg' }, booth ? '체험 시작하기' : '시온 이야기 듣기');
  start.addEventListener('click', () => {
    if (booth) requestFullscreen();
    begin(booth);
  });
  const flow = [
    ['STORY', '시온 이야기', '시온을 왜 만들었는지 1분 동안 들어요.'],
    ['LISTEN', '효과 들어 보기', '시온 해설이 붙은 영상을 화면과 함께 봐요.'],
    ['QUIZ', '퀴즈 하나', '빈자리 찾기 5문제나 듣고 맞히기 1문제 중에 골라요.'],
  ].slice(0, booth ? 3 : 1);
  view('start',
    h('div', { class: 'card hud-card' },
      h('span', { class: 'corners', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i')),
      eyebrow('SEEON EXPERIENCE'),
      title('화면 없이, 소리로 따라가 보세요'),
      h('p', { class: 'lead' }, booth
        ? '시온이 무엇인지 듣고, 시온 해설이 붙은 영상을 본 뒤, 퀴즈 하나를 풀어 보세요. 3분쯤 걸려요.'
        : '퀴즈 체험은 시온 부스에서 할 수 있어요. 여기서는 시온을 왜 만들었는지 1분 동안 들어 볼 수 있어요.'),
      h('ol', { class: 'flow' }, flow.map(([k, t, d]) => h('li', { class: 'flow-step' }, h('b', null, k), h('strong', null, t), h('span', null, d)))),
      h('p', { class: 'v-phones' },
        h('span', { 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24"><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><path d="M4 15a2 2 0 0 1 2-2h1v7H6a2 2 0 0 1-2-2z"/><path d="M20 15a2 2 0 0 0-2-2h-1v7h1a2 2 0 0 0 2-2z"/></svg>' }),
        '헤드폰을 쓰고 체험해 주세요'),
      h('div', { class: 'btn-row', style: { marginTop: '22px' } }, start,
        booth ? null : h('a', { class: 'btn btn-lg', href: 'index.html' }, '체험 첫 화면으로'))));
}

function begin(booth) {
  run?.ac.abort();
  run = { ac: new AbortController(), booth, stage1: false, stage2: false, checkOnly: false, skip: null };
  lastInput = Date.now();
  document.body.classList.toggle('v-running', booth);
  playStory(run).catch(ignoreAbort);
}

function reset() {
  run?.ac.abort();
  run = null;
  renderStart();
}

// ---------- 1단계 ① 시온 이야기 ----------
function slideBody(s) {
  switch (s.kind) {
    case 'photo':
      return h('div', { class: 'v-slide photo', style: { backgroundImage: `url("${s.photo}")` } }, h('h2', null, s.title));
    case 'bubbles':
      return h('div', { class: 'v-slide' }, h('h2', null, s.title),
        h('div', { class: 'v-bubbles' }, s.bubbles.map((b) => h('p', { class: 'v-bubble' }, '“', ...starred(b), '”'))));
    case 'stats':
      return h('div', { class: 'v-slide' }, h('h2', null, s.title),
        h('div', { class: 'v-stats' }, s.stats.map((st) => h('div', { class: 'v-stat' }, h('b', null, st.value), h('span', null, st.label)))));
    case 'brand':
      return h('div', { class: 'v-slide brand' }, h('div', { class: 'v-brand-mark mark-live', html: markSvg({ label: '' }) }),
        h('h2', null, s.title), h('p', null, s.sub));
    case 'points':
      return h('div', { class: 'v-slide' }, h('h2', null, s.title),
        h('ul', { class: 'v-points' }, s.points.map((p) => h('li', null, p))));
    default:
      return h('div', { class: 'v-slide' }, h('h2', null, s.title));
  }
}

async function playStory(r) {
  const signal = stepSignal(r);
  const slides = story.slides;
  let paused = false;
  let restart = false;
  let audio = null;
  let interrupt = null; // 처음부터 버튼이 지금 읽는 장을 끊는다
  let resume = null;
  const pauseBtn = h('button', { type: 'button', class: 'btn' }, '일시정지');
  const againBtn = h('button', { type: 'button', class: 'btn' }, '처음부터');
  const slot = h('div', { class: 'v-slot' });
  const caption = h('p', { class: 'v-caption' });
  const dots = h('ol', { class: 'v-dots', 'aria-hidden': 'true' }, slides.map(() => h('li')));
  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    pauseBtn.textContent = paused ? '계속 듣기' : '일시정지';
    if (paused) audio?.pause();
    else {
      if (audio && !audio.ended) audio.play().catch(() => {});
      resume?.();
    }
  });
  againBtn.addEventListener('click', () => {
    restart = true;
    paused = false;
    pauseBtn.textContent = '일시정지';
    interrupt?.();
    resume?.();
  });
  view('story',
    r.booth ? steps(MAIN_STEPS, 0) : null,
    h('div', { class: 'card v-story' }, slot, caption, dots, h('div', { class: 'btn-row' }, pauseBtn, againBtn)));

  // 한 장을 읽는다. 소리 파일이 없으면 6초 보여 준다.
  const narrate = (s) =>
    new Promise((resolve, reject) => {
      let fallback = 0;
      const finish = () => (cleanup(), resolve());
      const onAbort = () => (cleanup(), audio.pause(), reject(new Aborted()));
      const useTimer = () => (fallback = setTimeout(finish, 6000));
      function cleanup() {
        clearTimeout(fallback);
        signal.removeEventListener('abort', onAbort);
        interrupt = null;
      }
      audio = new Audio(STORY + s.id + '.mp3');
      audio.addEventListener('ended', finish, { once: true });
      audio.addEventListener('error', useTimer, { once: true });
      signal.addEventListener('abort', onAbort, { once: true });
      interrupt = () => (audio.pause(), finish());
      if (!paused) audio.play().catch(useTimer);
    });
  const waitResume = () => new Promise((res, rej) => {
    resume = () => ((resume = null), res());
    signal.addEventListener('abort', () => rej(new Aborted()), { once: true });
  });

  busy = true;
  try {
    let i = 0;
    while (i < slides.length) {
      const s = slides[i];
      clear(slot, slideBody(s));
      caption.textContent = s.say;
      [...dots.children].forEach((d, k) => d.classList.toggle('on', k <= i));
      await narrate(s);
      if (!restart) await sleep(700, signal);
      while (paused && !restart) await waitResume();
      if (restart) {
        restart = false;
        i = 0;
      } else i++;
    }
  } catch (err) {
    if (!(err instanceof Aborted) || r.ac.signal.aborted) throw err; // 처음으로: 여기서 끝
  } finally {
    busy = false;
    audio?.pause();
  }
  if (!r.booth) return renderStoryEnd();
  renderDemo(r);
}

function renderStoryEnd() {
  const again = h('button', { type: 'button', class: 'btn btn-primary btn-lg' }, '다시 듣기');
  again.addEventListener('click', () => begin(false));
  view('story-end',
    h('div', { class: 'card' },
      title('시온 이야기를 다 들으셨어요'),
      h('p', { class: 'lead' }, '시온 해설을 직접 들어 보고 퀴즈를 푸는 체험은 시온 부스에서 할 수 있어요.'),
      h('div', { class: 'btn-row', style: { marginTop: '20px' } }, again, h('a', { class: 'btn btn-lg', href: 'index.html' }, '체험 첫 화면으로'))));
}

// ---------- 1단계 ② 효과 들어 보기 ----------
function renderDemo(r) {
  const signal = stepSignal(r);
  const clipId = data.demo;
  const clip = data.clips[clipId];
  const after = h('div', { class: 'v-after', hidden: true });
  const replay = h('button', { type: 'button', class: 'btn btn-lg' }, '다시 보기');
  const next = h('button', { type: 'button', class: 'btn btn-primary btn-lg' }, '퀴즈 고르러 가기 →');
  setBlind(false);
  bar.style.width = '0';
  view('demo',
    steps(MAIN_STEPS, 1),
    title('시온 해설을 들어 보세요'),
    h('p', { class: 'lead' }, `「${clip.title}」을 설명하는 장면이에요. 화면과 함께, 파란 자막으로 나오는 시온의 목소리를 들어 보세요.`),
    player,
    after);
  const play = async () => {
    after.hidden = true;
    replay.disabled = true;
    await playSegment({ clipId, start: 0, end: 1e6, withAd: true }, signal);
    replay.disabled = false;
    clear(after,
      h('div', { class: 'notice v-note' },
        h('strong', null, '방금 파란 자막이 시온의 목소리예요. '),
        '발표자는 "보시면 10.9, 9.3"이라고만 했지만, 시온이 어느 쪽이 남성이고 어느 쪽이 여성인지 알려 줬어요.'),
      h('div', { class: 'btn-row', style: { marginTop: '16px' } }, replay, next));
    after.hidden = false;
    r.stage1 = true;
    next.focus();
  };
  replay.addEventListener('click', () => play().catch(ignoreAbort));
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
  const card = (key, k, name, desc, count) => {
    const el = h('button', { type: 'button', class: 'v-choice' },
      h('span', { class: 'v-choice-k', lang: 'en' }, k),
      h('strong', null, name),
      h('span', null, desc),
      h('span', { class: 'v-choice-meta' }, `${count} · 약 1분 30초`));
    el.addEventListener('click', () => (key === 'det' ? runDetection(r) : runComprehension(r)).catch(ignoreAbort));
    return el;
  };
  view('choose',
    steps(MAIN_STEPS, 2),
    title('어떤 퀴즈를 풀어 볼까요?'),
    h('p', { class: 'lead' }, '둘 중 하나만 고르면 돼요.'),
    h('div', { class: 'v-choices' },
      card('det', 'DETECTION', '시온처럼 빈자리 찾기', '발표자의 말 한 마디를 듣고, 화면을 봐야 알 수 있는 말인지 맞혀 보세요.', '5문제'),
      card('comp', 'LISTENING', '화면 없이 듣고 맞히기', '화면을 가린 채 시온 해설만 듣고, 화면 속 정답을 맞혀 보세요.', '1문제')));
}

// ---------- 2단계 ① 탐지: 빈자리 찾기 ----------
// 영상마다 한 문장씩 5문제. 빈자리 3개, 아닌 것 2개를 섞는다.
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
  const again = h('button', { type: 'button', class: 'btn btn-sm', disabled: true }, '↺ 다시 듣기');
  const ask = h('div', { class: 'v-ask' },
    h('p', { class: 'q-stem' }, '이 말, 화면을 봐야 알 수 있을까요?'),
    h('div', { class: 'v-ox-row' }, yes, no),
    h('div', { class: 'btn-row', style: { marginTop: '10px' } }, again));
  const out = h('div', { class: 'v-reveal', hidden: true });
  setBlind(true);
  bar.style.width = '0';
  view('detection',
    h('div', { class: 'q-head' }, h('span', { class: 'eyebrow-mono', lang: 'en' }, 'DETECTION'), h('span', { class: 'q-count' }, `${i + 1} / ${total}`)),
    title('시온처럼 빈자리 찾기'),
    h('div', { class: 'v-split' },
      player,
      h('div', { class: 'card v-quote-card' },
        h('p', { class: 'v-quote' }, '“', ...highlight(item.text, item.triggers), '”'),
        h('p', { class: 'v-legend' }, h('mark', { class: 'trig' }, '파란 글씨'), '는 시온이 "화면을 가리키는 말"로 보는 표현이에요.'),
        ask, out)));

  const listen = async () => {
    [yes, no, again].forEach((b) => (b.disabled = true));
    await playSegment({ clipId: item.clip, start: item.start, end: item.end, withAd: false }, signal);
    [yes, no, again].forEach((b) => (b.disabled = false));
  };
  again.addEventListener('click', () => listen().catch(ignoreAbort));
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
    showAd(cue, true);
    busy = true;
    try {
      const said = playAd(cue, signal).then(() => 'ad');
      said.catch(() => {});
      if ((await Promise.race([said, clicked])) === 'next') {
        stopMedia();
        return { correct, choice };
      }
    } finally {
      busy = false;
    }
  }
  await Promise.race([clicked, sleep(cue ? 4000 : 6000, signal)]);
  hideAd();
  return { correct, choice };
}

function renderDetectionResult(r, items, results) {
  const score = results.filter((x) => x.correct).length;
  const done = h('button', { type: 'button', class: 'btn btn-primary btn-lg' }, '체험 마치기 →');
  done.addEventListener('click', () => renderDone(r));
  view('detection-result',
    steps(MAIN_STEPS, 2),
    h('div', { class: 'card' },
      title(`${results.length}문제 중 ${score}개를 맞혔어요`),
      h('ol', { class: 'v-score' }, items.map((it, k) =>
        h('li', { class: results[k].correct ? 'ok' : 'bad' },
          h('b', { 'aria-label': results[k].correct ? '맞힘' : '틀림' }, results[k].correct ? 'O' : 'X'),
          h('span', null, '“', ...highlight(it.text, it.triggers), '”'),
          h('em', null, it.gap ? '빈자리' : '빈자리 아님')))),
      h('p', { class: 'lead', style: { marginTop: '16px' } }, '시온은 이런 판단을 한국어·영어 3,600문항에서 F1 점수 96.1로 해냈어요.'),
      h('div', { class: 'btn-row', style: { marginTop: '18px' } }, done)));
  done.focus();
}

// ---------- 2단계 ② 이해도: 화면 없이 듣고 맞히기 ----------
// 화면을 가린 채 해설과 함께 듣기(문제는 아래에 함께) → 답 고르기 → 화면과 함께 정답 장면 보기 → 정답 확인
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
  const options = [...item.options, UNKNOWN];
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
    return h('label', { class: `option${k === options.length - 1 ? ' unknown' : ''}` }, input,
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
    stepBar,
    title('화면 없이, 시온 해설만 듣고 맞혀 보세요'),
    h('div', { class: 'v-split' },
      player,
      h('div', { class: 'card' },
        h('p', { class: 'q-stem' }, item.stem),
        list, timer, hint,
        h('div', { class: 'btn-row end', style: { marginTop: '16px' } }, confirm))));
  window.addEventListener('keydown', onKey);
  try {
    await sleep(700, signal);
    await playSegment({ clipId: item.clip, start: item.start, end: item.end, withAd: true, adText: false }, signal);
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
    await playSegment({
      clipId: item.clip, start: Math.max(0, item.answerAt - 5), end: item.answerAt + 6, withAd: false,
      onTime: (t) => (badge.hidden = t < item.answerAt - 0.3),
    }, signal);
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
    h('div', { class: 'card' },
      h('div', { class: `verdict ${correct ? 'ok' : 'bad'}` },
        h('div', { class: 'verdict-mark', 'aria-hidden': 'true' }, correct ? 'O' : 'X'),
        title(correct ? '정답이에요!' : selected === null ? '시간이 다 됐어요' : '아쉬워요, 오답이에요')),
      h('p', { class: 'q-stem', style: { marginTop: '16px', fontSize: '19px' } }, item.stem),
      h('div', { class: 'choice-list' }, options.map((text, k) => {
        const cls = k === item.answer ? ' is-answer' : k === selected ? ' is-wrong' : '';
        const tag = k === item.answer ? '정답' : k === selected ? '내 답' : '';
        return h('div', { class: `option${cls}`, 'aria-disabled': 'true' },
          h('span', { class: 'key', 'aria-hidden': 'true' }, String(k + 1)), h('span', { style: { flex: 1 } }, text), tag ? h('b', { class: 'small' }, tag) : null);
      })),
      h('div', { class: 'notice', style: { marginTop: '16px' } }, item.explanation),
      h('p', { class: 'lead', style: { marginTop: '14px' } }, '시온 해설 덕분에 화면을 보지 않고도 답을 알 수 있었어요. 평가에서 시온 해설은 화면을 보며 이해하는 수준에 20.8%p 더 가깝게 해 줬어요.'),
      h('div', { class: 'btn-row', style: { marginTop: '18px' } }, done)));
  done.focus();
}

// ---------- 완료 ----------
function todayKey() {
  const d = new Date();
  return `seeon.visitor.count.${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function renderDone(r) {
  stopMedia();
  r.skip = null;
  const full = r.stage1 && r.stage2 && !r.checkOnly;
  let count = null;
  if (full) {
    count = Number(storage.get(todayKey()) || 0) + 1;
    storage.set(todayKey(), String(count));
  }
  view('done',
    h('div', { class: 'card v-done' },
      h('div', { class: 'verdict ok' }, h('div', { class: 'verdict-mark', 'aria-hidden': 'true' }, '✓'), title('체험을 모두 마쳤어요!')),
      full
        ? h('div', { class: 'staff-callout' }, 'STAFF에게 이 화면을 보여 주고 간식 뽑기에 참여하세요')
        : h('div', { class: 'notice' }, '점검용으로 단계를 건너뛰었어요. 간식 안내는 띄우지 않아요.'),
      count ? h('p', { class: 'v-count' }, `오늘 ${count}번째 체험`) : null,
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

// ---------- 운영: 자동 초기화 · STAFF 키 ----------
['pointerdown', 'keydown', 'touchstart'].forEach((t) => window.addEventListener(t, () => (lastInput = Date.now()), { passive: true }));
setInterval(() => {
  if (!run || screen === 'start' || screen === 'done' || busy) return;
  if (Date.now() - lastInput > IDLE_MS) reset();
}, 5000);

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
    story = { slides: [] };
  }
  try {
    data = await loadJson(DATA + 'visitor.json');
  } catch {
    data = null; // 공개 사이트: 영상·문항 없음
  }
  renderStart();
})();
