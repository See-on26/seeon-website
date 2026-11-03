// 심사위원 시연: 사례 3개 × 동시·교차(균형) 모드 = 영상 6개 중 하나를 골라 본다.
// 고르는 화면(judge.html)과 재생 화면(judge.html#a-sync)을 주소의 # 로 오간다.
import { clear, h } from './common.js?v=2998d57d';
import { startScene, startWaves } from './fx.js?v=2998d57d';
import { mountLogos } from './logo.js?v=2998d57d';

const DATA = 'data/judge/';
const MODES = { sync: '동시 모드', cross: '교차 모드' };

const $ = (id) => document.getElementById(id);
const menu = $('menu');
const player = $('player');
const video = $('p-video');
const seek = $('p-seek');
const big = $('p-big');
const toggle = $('p-toggle');

let items = new Map(); // 'a-sync' → { kase, mode, info, url, duration, missing, link }
let current = null;
let fromMenu = false; // 고르는 화면에서 들어왔으면 돌아가기를 브라우저 뒤로 가기로(뒤로 가기 기록이 쌓이지 않게)
let scrubbing = false;
let raf = 0;

mountLogos();
startScene($('backdrop'));
startWaves($('waves'), { lines: 5, intensity: 0.5, baseline: 0.9 });

// 0:00 꼴. 지금 위치는 내림, 전체 길이는 반올림(고르는 화면의 「23초」와 같게)
const clock = (sec, whole = false) => {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = whole ? Math.round(sec) : Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const length = (sec) => {
  const s = Math.round(sec);
  return s >= 60 ? `${Math.floor(s / 60)}분${s % 60 ? ` ${s % 60}초` : ''}` : `${s}초`;
};
const adCount = (m) => `자동 AD ${m.auto} · 수동 AD ${m.manual}`;
const caseTitle = (k) => `${k.label}. ${k.title}`; // 「Case A. 사장님 최애 간식이 뭐라구요?」

// ---------- 고르는 화면 ----------
function playIcon() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M6.8 4.5v15l12.5-7.5z'); // 삼각형은 상자 가운데보다 폭의 1/12 만큼 오른쪽에 둬야 원 가운데로 보인다
  svg.append(path);
  return svg;
}

function renderMenu(cases) {
  const rows = cases.map((kase) => {
    const buttons = Object.entries(MODES).map(([mode, name]) => {
      const info = kase.modes[mode];
      const id = `${kase.id}-${mode}`;
      const len = h('span', { class: 'j-len' }, length(info.seconds));
      const link = h('a', { class: 'j-mode', href: `#${id}`, 'aria-label': `${kase.label} ${name} 영상 보기, ${adCount(info)}, ${length(info.seconds)}` },
        h('span', { class: 'j-mode-ico' }, playIcon()),
        h('span', { class: 'j-mode-name' }, name),
        len,
        h('span', { class: 'j-mode-meta' }, adCount(info)));
      const item = { kase, mode, info, url: DATA + info.video, duration: info.seconds, missing: false, link, len };
      items.set(id, item);
      link.addEventListener('click', (e) => {
        e.preventDefault();
        if (item.missing) return;
        history.pushState({ judge: id }, '', `#${id}`);
        fromMenu = true;
        route();
      });
      return link;
    });
    return h('article', { class: 'j-case', 'aria-labelledby': `case-${kase.id}` },
      h('h2', { class: 'j-case-h', id: `case-${kase.id}` }, caseTitle(kase)),
      h('img', { class: 'j-thumb', src: DATA + kase.thumb, alt: `${kase.label} 발표 화면. 시온이 알려 줄 부분은 가려 두었습니다.`, decoding: 'async' }),
      h('blockquote', { class: 'j-quote' }, `“${kase.quote}”`),
      h('div', { class: 'j-modes', role: 'group', 'aria-label': `${kase.label} 영상 고르기` }, buttons));
  });
  clear($('cases'), rows);
  probe();
}

// 영상 길이를 실제 파일에서 읽어 메뉴판 값 대신 보여 주고, 파일이 아직 없으면 「영상 준비 중」으로 둔다
function probe() {
  for (const item of items.values()) {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    const done = () => {
      v.removeAttribute('src');
      v.load();
    };
    v.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(v.duration) && v.duration > 0) {
        item.duration = v.duration;
        item.len.textContent = length(v.duration);
        item.link.setAttribute('aria-label', `${item.kase.label} ${MODES[item.mode]} 영상 보기, ${adCount(item.info)}, ${length(v.duration)}`);
      }
      done();
    }, { once: true });
    v.addEventListener('error', () => {
      item.missing = true;
      item.link.classList.add('is-missing');
      item.link.setAttribute('aria-disabled', 'true');
      item.link.setAttribute('aria-label', `${item.kase.label} ${MODES[item.mode]} 영상 준비 중`);
      item.len.textContent = '준비 중';
      done();
    }, { once: true });
    v.src = item.url;
  }
}

// ---------- 재생 화면 ----------
function setState() {
  const missing = player.classList.contains('is-missing');
  const ended = !missing && video.ended;
  const playing = !missing && !video.paused && !video.ended;
  player.classList.toggle('is-playing', playing);
  player.classList.toggle('is-ended', ended);
  const label = ended ? '처음부터 다시 재생' : playing ? '일시정지' : '재생';
  toggle.setAttribute('aria-label', label);
  big.setAttribute('aria-label', label);
}

function duration() {
  return Number.isFinite(video.duration) && video.duration > 0 ? video.duration : current?.duration || 0;
}

function paint() {
  const d = duration();
  const t = video.ended ? d : video.currentTime;
  if (!scrubbing) seek.value = String(t);
  const shown = scrubbing ? Number(seek.value) : t;
  seek.style.setProperty('--played', `${d ? (shown / d) * 100 : 0}%`);
  let loaded = 0;
  for (let i = 0; i < video.buffered.length; i++) {
    if (video.buffered.start(i) <= shown + 0.5) loaded = Math.max(loaded, video.buffered.end(i));
  }
  seek.style.setProperty('--loaded', `${d ? Math.min(100, (loaded / d) * 100) : 0}%`);
  $('p-cur').textContent = video.ended ? clock(d, true) : clock(shown);
  seek.setAttribute('aria-valuetext', `${clock(shown)} / ${clock(d, true)}`);
}

// 재생 중에는 프레임마다 막대를 옮긴다(창이 가려져 프레임이 멈추면 timeupdate 가 대신 옮긴다)
function loop() {
  paint();
  raf = video.paused ? 0 : requestAnimationFrame(loop);
}

function play() {
  if (player.classList.contains('is-missing')) return;
  if (video.ended) video.currentTime = 0;
  video.play().catch(() => setState());
}

function togglePlay() {
  if (video.paused || video.ended) play();
  else video.pause();
}

function skip(sec) {
  if (player.classList.contains('is-missing')) return;
  const d = duration();
  video.currentTime = Math.min(Math.max(0, video.currentTime + sec), d || video.currentTime + sec);
  paint();
}

function openPlayer(item) {
  current = item;
  $('p-mode').textContent = MODES[item.mode];
  $('p-meta').textContent = adCount(item.info);
  $('p-title').textContent = caseTitle(item.kase);
  $('p-dur').textContent = clock(item.duration, true);
  $('p-cur').textContent = '0:00';
  $('p-missing-path').textContent = `experience/${item.url}`;
  $('p-missing').hidden = true;
  player.classList.remove('is-missing', 'is-waiting', 'is-ended', 'is-playing');
  player.classList.add('is-fresh'); // 아직 한 번도 틀지 않음: 가운데 큰 ▶ 를 띄운다
  seek.max = String(item.duration || 1);
  seek.value = '0';
  seek.disabled = false;
  toggle.disabled = false;
  seek.style.setProperty('--played', '0%');
  seek.style.setProperty('--loaded', '0%');
  video.src = item.url;
  video.load();
  menu.hidden = true;
  player.hidden = false;
  $('p-back').hidden = false;
  $('j-meta').hidden = true;
  document.body.classList.add('in-player');
  document.title = `${item.kase.label} ${MODES[item.mode]} · SEEON 심사위원 시연`;
  setState();
  big.focus({ preventScroll: true });
}

function closePlayer() {
  if (!current) return;
  const back = current.link;
  current = null;
  fromMenu = false;
  cancelAnimationFrame(raf);
  raf = 0;
  video.pause();
  video.removeAttribute('src');
  video.load();
  player.hidden = true;
  player.classList.remove('is-missing', 'is-waiting', 'is-ended', 'is-playing');
  menu.hidden = false;
  $('p-back').hidden = true;
  $('j-meta').hidden = false;
  document.body.classList.remove('in-player');
  document.title = 'SEEON 심사위원 시연';
  back?.focus({ preventScroll: true });
}

function route() {
  const item = items.get(location.hash.slice(1));
  if (item && !item.missing) {
    if (item !== current) {
      closePlayer();
      openPlayer(item);
    }
  } else {
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    closePlayer();
  }
}

function goBack() {
  if (fromMenu) {
    fromMenu = false;
    history.back();
  } else {
    history.replaceState(null, '', location.pathname + location.search);
    route();
  }
}

video.controls = false;
video.disablePictureInPicture = true;
video.setAttribute('controlsList', 'nodownload noplaybackrate noremoteplayback');
video.addEventListener('contextmenu', (e) => e.preventDefault());
video.addEventListener('loadedmetadata', () => {
  if (current && Number.isFinite(video.duration)) {
    current.duration = video.duration;
    seek.max = String(video.duration);
    $('p-dur').textContent = clock(video.duration, true);
  }
  paint();
});
video.addEventListener('play', () => {
  player.classList.remove('is-fresh');
  if (document.activeElement === big) toggle.focus({ preventScroll: true }); // 숨는 큰 단추에 초점이 남지 않게
  setState();
  if (!raf) raf = requestAnimationFrame(loop);
});
video.addEventListener('pause', () => (setState(), paint()));
video.addEventListener('ended', () => (setState(), paint()));
video.addEventListener('seeked', () => (setState(), paint()));
video.addEventListener('timeupdate', () => raf || paint());
video.addEventListener('progress', paint);
video.addEventListener('waiting', () => player.classList.add('is-waiting'));
for (const ev of ['playing', 'canplay', 'seeked', 'pause']) video.addEventListener(ev, () => player.classList.remove('is-waiting'));
video.addEventListener('error', () => {
  if (!current || !video.getAttribute('src')) return;
  player.classList.add('is-missing');
  $('p-missing').hidden = false;
  seek.disabled = true;
  toggle.disabled = true;
  setState();
});

// 영상을 누르면 재생·일시정지, 가운데 기호와 아래 단추도 같다
$('p-screen').addEventListener('click', (e) => {
  if (e.target.closest('.j-missing')) return;
  togglePlay();
});
big.addEventListener('click', (e) => {
  e.stopPropagation();
  togglePlay();
});
toggle.addEventListener('click', togglePlay);
$('p-back').addEventListener('click', goBack);

// 재생 위치 바: 끌면 바로 그 장면으로 옮긴다
seek.addEventListener('pointerdown', () => (scrubbing = true));
seek.addEventListener('input', () => {
  scrubbing = true;
  video.currentTime = Number(seek.value);
  paint();
});
const endScrub = () => {
  if (!scrubbing) return;
  scrubbing = false;
  paint();
};
seek.addEventListener('change', endScrub);
seek.addEventListener('pointerup', endScrub);
seek.addEventListener('pointercancel', endScrub);
seek.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') skip(-5);
  else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') skip(5);
  else if (e.key === 'Home') skip(-Infinity);
  else return;
  e.preventDefault();
});
// 바 위에 올리면 그 자리의 시각을 보여 준다
$('p-seekbox').addEventListener('pointermove', (e) => {
  const r = seek.getBoundingClientRect();
  const x = Math.min(Math.max(0, e.clientX - r.left), r.width);
  const tip = $('p-tip');
  tip.textContent = clock((x / r.width) * duration());
  tip.style.left = `${Math.min(Math.max(x, 24), r.width - 24)}px`;
});

// 키보드: 스페이스·K 재생/일시정지, ←/→ 5초
window.addEventListener('keydown', (e) => {
  if (!current || e.altKey || e.ctrlKey || e.metaKey) return;
  const onControl = e.target instanceof Element && e.target.closest('button, a');
  if ((e.key === ' ' && !onControl) || e.key === 'k' || e.key === 'K') togglePlay();
  else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.target !== seek) skip(e.key === 'ArrowLeft' ? -5 : 5);
  else return;
  e.preventDefault();
});

window.addEventListener('popstate', route);

fetch(`${DATA}judge.json`)
  .then((r) => r.json())
  .then((data) => {
    renderMenu(data.cases);
    route();
  })
  .catch(() => clear($('cases'), h('p', { class: 'j-error' }, '시연 목록을 불러오지 못했습니다. 화면을 새로 고쳐 주세요.')));
