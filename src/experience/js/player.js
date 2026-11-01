// 멈춤·되감기를 막은 재생기. 실험과 체험 퀴즈가 함께 쓴다.
// 정해진 구간 [start, end]만 한 번 재생하고 끝나면 onEnded를 부른다.
export class LockedPlayer {
  constructor(video, { onProgress, onEnded, onEvent, onError } = {}) {
    this.video = video;
    this.cb = { onProgress, onEnded, onEvent, onError };
    this.start = 0;
    this.end = null;
    this.state = 'idle';
    this.lastTime = 0;
    this.raf = 0;

    video.controls = false;
    video.playsInline = true;
    video.disablePictureInPicture = true;
    video.setAttribute('controlsList', 'nodownload noplaybackrate noremoteplayback');
    video.preload = 'auto';
    video.addEventListener('contextmenu', (e) => e.preventDefault());

    video.addEventListener('pause', () => {
      if (this.state !== 'playing' || video.ended) return;
      this.cb.onEvent?.('pause_blocked', { at: Math.round(video.currentTime) });
      video.play().catch(() => {});
    });
    video.addEventListener('seeking', () => {
      if (this.state !== 'playing') return;
      if (Math.abs(video.currentTime - this.lastTime) > 1.5) {
        this.cb.onEvent?.('seek_blocked', { from: Math.round(this.lastTime), to: Math.round(video.currentTime) });
        video.currentTime = this.lastTime;
      }
    });
    // 탭이 가려져 requestAnimationFrame이 멈춰도 구간 끝은 잡도록 timeupdate로도 확인한다
    video.addEventListener('timeupdate', () => {
      if (this.state !== 'playing') return;
      if (!video.seeking) this.lastTime = video.currentTime;
      if (this.end != null && video.currentTime >= this.end - 0.03) this.finish();
    });
    video.addEventListener('waiting', () => this.state === 'playing' && this.cb.onEvent?.('stall', { at: Math.round(video.currentTime) }));
    video.addEventListener('ended', () => this.finish());
    video.addEventListener('error', () => {
      if (this.state === 'idle' || this.state === 'done') return;
      this.state = 'error';
      cancelAnimationFrame(this.raf);
      this.cb.onError?.(video.error);
    });

    if ('mediaSession' in navigator) {
      for (const action of ['pause', 'stop', 'seekbackward', 'seekforward', 'seekto', 'previoustrack', 'nexttrack']) {
        try {
          navigator.mediaSession.setActionHandler(action, () => {});
        } catch {
          /* 지원하지 않는 동작 */
        }
      }
    }
  }

  // 파일을 불러와 시작 위치에 맞춘다. 재생할 준비가 되면 끝난다.
  load(url, { start = 0, end = null } = {}) {
    const v = this.video;
    this.start = Number(start) || 0;
    this.end = end == null || end === '' ? null : Number(end);
    this.state = 'loading';
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        v.removeEventListener('loadedmetadata', onMeta);
        v.removeEventListener('canplaythrough', onReady);
        v.removeEventListener('error', onErr);
        clearTimeout(timer);
      };
      const onMeta = () => {
        if (this.start > 0) v.currentTime = this.start;
      };
      const onReady = () => {
        if (settled) return;
        settled = true;
        cleanup();
        this.state = 'ready';
        resolve(this.duration());
      };
      const onErr = () => {
        if (settled) return;
        settled = true;
        cleanup();
        this.state = 'error';
        reject(v.error || new Error('media error'));
      };
      // 오래 걸려도 재생은 할 수 있게 한다(버퍼링은 stall 이벤트로 남는다)
      const timer = setTimeout(() => v.readyState >= 2 && onReady(), 12000);
      v.addEventListener('loadedmetadata', onMeta);
      v.addEventListener('canplaythrough', onReady);
      v.addEventListener('error', onErr);
      v.src = url;
      v.load();
    });
  }

  duration() {
    const total = Number.isFinite(this.video.duration) ? this.video.duration : null;
    const end = this.end ?? total;
    return end == null ? null : Math.max(0, end - this.start);
  }

  async play() {
    this.state = 'playing';
    this.lastTime = this.video.currentTime;
    try {
      await this.video.play();
    } catch (err) {
      // AbortError는 재생 도중 일시정지·재시작이 겹칠 때 나는 것이라 재생은 계속된다.
      // 자동 재생 차단(NotAllowedError)이나 형식 오류만 실패로 본다.
      if (err?.name === 'AbortError') return this.startTicking();
      this.state = 'ready';
      throw err;
    }
    this.startTicking();
  }

  startTicking() {
    cancelAnimationFrame(this.raf);
    const tick = () => {
      if (this.state !== 'playing') return;
      const t = this.video.currentTime;
      if (!this.video.seeking) this.lastTime = t;
      const elapsed = t - this.start;
      this.cb.onProgress?.(elapsed, this.duration());
      if (this.end != null && t >= this.end - 0.03) {
        this.finish();
        return;
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  finish() {
    if (this.state !== 'playing') return;
    this.state = 'done';
    cancelAnimationFrame(this.raf);
    this.video.pause();
    this.cb.onEnded?.();
  }

  // 퀴즈의 '다시 듣기'처럼 같은 구간을 처음부터 다시 준비한다
  rewind() {
    this.state = 'ready';
    this.video.currentTime = this.start;
  }

  dispose() {
    this.state = 'idle';
    cancelAnimationFrame(this.raf);
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
  }
}

export function requestFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {});
}

export function exitFullscreen() {
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
}

// 음량 테스트용 짧은 신호음 (관리자가 음량 테스트 파일을 올리지 않았을 때)
export function playChime() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return Promise.resolve();
  const ctx = new Ctx();
  const notes = [523.25, 659.25, 783.99, 659.25, 523.25];
  const t0 = ctx.currentTime + 0.05;
  notes.forEach((f, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = f;
    const s = t0 + i * 0.45;
    gain.gain.setValueAtTime(0, s);
    gain.gain.linearRampToValueAtTime(0.25, s + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, s + 0.42);
    osc.connect(gain).connect(ctx.destination);
    osc.start(s);
    osc.stop(s + 0.44);
  });
  return new Promise((resolve) => setTimeout(() => (ctx.close(), resolve()), notes.length * 450 + 200));
}
