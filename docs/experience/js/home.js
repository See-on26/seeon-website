import { reducedMotion, startScene, startWaves, storage } from './fx.js';
import { markSvg, mountLogos, wordmarkSvg } from './logo.js';

const INTRO_KEY = 'seeon.intro.seen';

mountLogos();
const scene = startScene(document.getElementById('backdrop'));
const waves = startWaves(document.getElementById('waves'), { lines: 5, intensity: 0.6, baseline: 0.86 });

// ---------- 로딩 연출 (탭마다 처음 한 번) ----------
function reveal() {
  document.body.classList.add('ready');
}

function runIntro() {
  const intro = document.getElementById('intro');
  const seen = storage.get(INTRO_KEY, sessionStorage);
  if (seen || reducedMotion()) {
    intro.remove();
    reveal();
    return;
  }
  document.getElementById('intro-mark').innerHTML = markSvg({ label: '' });
  document.getElementById('intro-word').innerHTML = wordmarkSvg();
  const pct = document.getElementById('intro-pct');
  const duration = 1900;
  const start = performance.now();
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    storage.set(INTRO_KEY, '1', sessionStorage);
    pct.textContent = '100';
    intro.classList.add('done');
    reveal();
    setTimeout(() => intro.remove(), 900);
  };
  const step = (now) => {
    if (finished) return;
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    pct.textContent = String(Math.round(eased * 100)).padStart(3, '0');
    if (t < 1) requestAnimationFrame(step);
    else setTimeout(finish, 250);
  };
  requestAnimationFrame(step);
  setTimeout(finish, duration + 900); // 프레임이 멈춰도 연출이 끝나게
  intro.addEventListener('click', finish);
  window.addEventListener('keydown', finish, { once: true });
}
runIntro();

// ---------- 카드·관리자 버튼: 올리면 배경이 그 갈래의 사진으로 바뀌고 파형이 커진다(글자 뒤섞기 연출은 정신없다는 의견으로 뺐다, 2026-10-20) ----------
document.querySelectorAll('.gate, .admin-link').forEach((gate) => {
  const enter = () => {
    scene.show(gate.dataset.shot);
    waves.setEnergy(gate.classList.contains('gate') ? 1.15 : 0.8);
  };
  const leave = () => {
    scene.reset();
    waves.setEnergy(0.55);
  };
  gate.addEventListener('pointerenter', enter);
  gate.addEventListener('focus', enter);
  gate.addEventListener('pointerleave', leave);
  gate.addEventListener('blur', leave);
});
