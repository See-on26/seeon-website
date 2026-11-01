// 메인·체험 화면의 움직임: 파형 배경, 글자 뒤섞기, 사운드
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- 흐르는 음성 파형 (canvas) ----------
export function startWaves(canvas, { lines = 7, baseline = 0.66, intensity = 1, bars = true } = {}) {
  const ctx = canvas.getContext('2d');
  const still = reducedMotion();
  let w = 0;
  let h = 0;
  let raf = 0;
  let energy = 0.55;
  let target = 0.55;
  const pointer = { x: 0.5, tx: 0.5 };
  const waves = Array.from({ length: lines }, (_, i) => ({
    k1: 1.1 + i * 0.29,
    k2: 2.6 + i * 0.47,
    sp1: 0.9 + i * 0.21,
    sp2: 1.6 + i * 0.17,
    ph: i * 1.7,
    amp: 0.35 + 0.65 * Math.abs(Math.sin(i * 1.3 + 0.4)),
    main: i === Math.floor(lines / 2),
  }));

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function envelope(u) {
    const edge = Math.pow(Math.sin(Math.PI * u), 1.5);
    const bump = Math.exp(-((u - pointer.x) ** 2) / 0.03);
    return edge * (0.55 + 0.6 * bump);
  }

  function draw(t) {
    energy += (target - energy) * 0.05;
    pointer.x += (pointer.tx - pointer.x) * 0.06;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    const base = h * baseline;
    const ampMax = Math.min(h * 0.15, 130) * energy * intensity;

    if (bars) {
      // 로고의 소리 막대를 닮은 스펙트럼
      ctx.lineCap = 'round';
      ctx.lineWidth = 2;
      for (let x = 10; x < w; x += 14) {
        const u = x / w;
        const v = 0.25 + 0.75 * Math.abs(Math.sin(u * 23 + t * 1.3) * Math.sin(u * 7 - t * 0.7));
        const len = ampMax * 1.2 * envelope(u) * v;
        ctx.strokeStyle = `rgba(0, 103, 242, ${0.1 + 0.18 * v})`;
        ctx.beginPath();
        ctx.moveTo(x, base - len);
        ctx.lineTo(x, base + len);
        ctx.stroke();
      }
    }

    for (const wv of waves) {
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      const a = wv.main ? 0.95 : 0.22 + wv.amp * 0.2;
      grad.addColorStop(0, 'rgba(0, 103, 242, 0)');
      grad.addColorStop(0.3, `rgba(0, 103, 242, ${a})`);
      grad.addColorStop(0.5, `rgba(110, 178, 255, ${a})`);
      grad.addColorStop(0.7, `rgba(0, 103, 242, ${a})`);
      grad.addColorStop(1, 'rgba(0, 103, 242, 0)');
      ctx.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const u = x / w;
        const y =
          base +
          ampMax * wv.amp * envelope(u) *
            (Math.sin(u * wv.k1 * Math.PI * 2 + t * wv.sp1 + wv.ph) * 0.62 + Math.sin(u * wv.k2 * Math.PI * 2 - t * wv.sp2) * 0.38);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineWidth = wv.main ? 2 : 1;
      ctx.strokeStyle = grad;
      ctx.shadowBlur = wv.main ? 14 : 0;
      ctx.shadowColor = 'rgba(0, 103, 242, 0.9)';
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'source-over';
  }

  const loop = (now) => {
    draw(now / 1000);
    raf = requestAnimationFrame(loop);
  };
  const onMove = (e) => (pointer.tx = e.clientX / Math.max(1, window.innerWidth));
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', onMove);
  if (still) draw(2);
  else raf = requestAnimationFrame(loop);

  return {
    setEnergy(v) {
      target = v;
      if (still) draw(2);
    },
    stop() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
    },
  };
}

// ---------- 글자 뒤섞기 (뒤섞였다가 제자리로) ----------
const LATIN = '!<>-_\\/[]{}=+*^?#0123456789';
const HANGUL = '가나다라마바사아자차카타파하거너더러머버서어저처커터퍼허';

export function scramble(el, text = el.dataset.text ?? el.textContent, { frames = 22, interval = 32 } = {}) {
  clearTimeout(el._scramble);
  if (reducedMotion()) {
    el.textContent = text;
    return;
  }
  const pool = /[가-힣]/.test(text) ? HANGUL : LATIN;
  const plan = [...text].map((ch) => ({
    ch,
    start: Math.floor(Math.random() * (frames * 0.35)),
    end: Math.floor(frames * 0.45 + Math.random() * frames * 0.55),
  }));
  let f = 0;
  // requestAnimationFrame은 화면이 가려지면 멈추므로 타이머로 돌려 항상 끝까지 맞춰지게 한다
  const step = () => {
    let out = '';
    let done = 0;
    for (const p of plan) {
      if (p.ch === ' ' || f >= p.end) {
        out += p.ch;
        done++;
      } else if (f >= p.start) out += pool[Math.floor(Math.random() * pool.length)];
      else out += p.ch;
    }
    el.textContent = out;
    f++;
    if (done < plan.length) el._scramble = setTimeout(step, interval);
    else el.textContent = text;
  };
  step();
}

// ---------- 사운드: 잔잔한 배경음 + 마우스를 올릴 때 짧은 소리 ----------
let audio = null;

function ensureAudio() {
  if (audio) return audio;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  const actx = new Ctx();
  const master = actx.createGain();
  master.gain.value = 0;
  master.connect(actx.destination);
  const filter = actx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 700;
  filter.Q.value = 0.7;
  filter.connect(master);
  for (const [f, type, g] of [[110, 'sine', 0.5], [164.8, 'sine', 0.32], [220.4, 'triangle', 0.12], [329.6, 'sine', 0.06]]) {
    const o = actx.createOscillator();
    const gain = actx.createGain();
    o.type = type;
    o.frequency.value = f;
    gain.gain.value = g;
    o.connect(gain).connect(filter);
    o.start();
  }
  const lfo = actx.createOscillator();
  const lfoGain = actx.createGain();
  lfo.frequency.value = 0.07;
  lfoGain.gain.value = 260;
  lfo.connect(lfoGain).connect(filter.frequency);
  lfo.start();
  audio = { actx, master, on: false };
  return audio;
}

export function setAmbient(on) {
  const a = ensureAudio();
  if (!a) return false;
  a.on = on;
  if (on && a.actx.state === 'suspended') a.actx.resume();
  const now = a.actx.currentTime;
  a.master.gain.cancelScheduledValues(now);
  a.master.gain.setTargetAtTime(on ? 0.06 : 0, now, on ? 0.8 : 0.25);
  return on;
}

export function tick(freq = 1320) {
  if (!audio?.on) return;
  const { actx } = audio;
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  const now = actx.currentTime;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.05, now + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
  o.connect(g).connect(actx.destination);
  o.start(now);
  o.stop(now + 0.1);
}

export const storage = {
  get(key, store = localStorage) {
    try {
      return store.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value, store = localStorage) {
    try {
      store.setItem(key, value);
    } catch {
      /* 저장소를 못 써도 동작은 같다 */
    }
  },
};
