(function () {
  'use strict';
  document.documentElement.lang = 'ko';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (e) { return null; }
    return null;
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function fmt(s) { s = Math.round(s); return '0:' + (s < 10 ? '0' : '') + s; }
  var PLAY = 'M4 2.5v11l9.5-5.5z';
  var STOP = 'M3.5 3h3.5v10H3.5zM9 3h3.5v10H9z';

  /* 머리줄: 사진 위에서는 투명, 내려가면 흰 바탕 */
  var head = $('#site-head');
  var hasHero = !!$('.hero');
  var menuBtn = $('#menu-btn');
  var nav = $('#site-nav');
  function paintHead() {
    var open = menuBtn.getAttribute('aria-expanded') === 'true';
    head.classList.toggle('solid', open || !hasHero || window.scrollY > 24);
  }
  function setMenu(open) {
    menuBtn.setAttribute('aria-expanded', String(open));
    $('.sr', menuBtn).textContent = open ? '메뉴 닫기' : '메뉴 열기';
    nav.classList.toggle('open', open);
    paintHead();
  }
  window.addEventListener('scroll', paintHead, { passive: true });
  paintHead();
  menuBtn.addEventListener('click', function () { setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'); });
  $$('#site-nav a').forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });

  /* 음성 */
  var synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
  if (synth) { try { synth.getVoices(); } catch (e) {} }
  function koVoices() {
    if (!synth) return [];
    try { return synth.getVoices().filter(function (v) { return /^ko/i.test(v.lang); }); } catch (e) { return []; }
  }
  function cancelSpeech() { if (synth) { try { synth.cancel(); } catch (e) {} } }
  function say(text, who) {
    return new Promise(function (resolve) {
      var voices = koVoices();
      if (!voices.length) { setTimeout(resolve, Math.max(1300, text.length * 115)); return; }
      var done = false;
      var guard = 0;
      function fin() { if (!done) { done = true; clearTimeout(guard); resolve(); } }
      var u = new SpeechSynthesisUtterance(text);
      var seeon = who === 'seeon';
      u.lang = 'ko-KR';
      u.voice = seeon && voices[1] ? voices[1] : voices[0];
      u.rate = seeon ? 1.08 : 1;
      u.pitch = seeon ? (voices[1] ? 1 : 1.3) : 0.85;
      u.onend = fin;
      u.onerror = fin;
      guard = setTimeout(fin, Math.max(4000, text.length * 300));
      synth.speak(u);
    });
  }
  var current = null;
  function claim(id, stopFn) {
    if (current && current.id !== id) current.stop();
    current = { id: id, stop: stopFn };
  }
  function release(id) { if (current && current.id === id) current = null; }
  document.addEventListener('visibilitychange', function () { if (document.hidden && current) current.stop(); });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (current) current.stop();
    if (nav.classList.contains('open')) { setMenu(false); menuBtn.focus(); }
  });

  /* 체험 플레이어 */
  if ($('#player')) (function () {
    // 차례는 제품의 차단 규칙을 따른다: 숫자(발화 기반) 안내 뒤 12~18초 안의 가리킨 곳(지시) 안내는 막히므로 가리킨 곳을 먼저 둔다.
    var TOTAL = 25;
    var DEMO = [
      { who: 'speaker', t: 0, d: 2.6, text: '다음 장 보겠습니다.' },
      { who: 'seeon', kind: '화면 전환', t: 3, d: 3.4, text: '슬라이드 3: 분기별 매출 막대그래프', slide: 3 },
      { who: 'speaker', t: 6.8, d: 3.8, text: '보시는 것처럼 3분기가 제일 높습니다.', hl: 'q3' },
      { who: 'seeon', kind: '넘어감', t: 10.8, d: 1, text: '말만 들어도 알 수 있어서 넘어가요.', silent: true },
      { who: 'speaker', t: 12.2, d: 2, text: '여기 이 부분 보시면요,', hl: 'table' },
      { who: 'seeon', kind: '가리킨 곳', t: 14.6, d: 2.6, text: '2년간 매출 추이 표', hl: 'table' },
      { who: 'speaker', t: 17.8, d: 2.2, text: '이게 73%⁠입니다.', hl: 'kpi' },
      { who: 'seeon', kind: '숫자의 뜻', t: 20.6, d: 3.6, text: '73%⁠는 작년 대비 기업가치 성장률을 의미', hl: 'kpi' }
    ];
    var player = $('#player');
    var screenEl = $('#meet-screen');
    var stream = $('#stream');
    var playBtn = $('#demo-play');
    var timeEl = $('#demo-time');
    var statusEl = $('#demo-status');
    var playhead = $('#playhead');
    var seeonOn = true;
    var seed = 11;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }

    var laneSp = $('#tl-sp');
    var laneSe = $('#tl-se');
    var scriptOl = $('#demo-script');
    DEMO.forEach(function (ev) {
      var seg = el('div', 'seg');
      seg.style.left = (ev.t / TOTAL * 100) + '%';
      seg.style.width = (ev.d / TOTAL * 100) + '%';
      if (ev.who === 'speaker') {
        seg.classList.add('speech');
        var n = Math.max(8, Math.round(ev.d * 6));
        for (var i = 0; i < n; i++) {
          var b = el('span', 'bar');
          var env = Math.sin(Math.PI * (i + 0.5) / n);
          b.style.height = (14 + (36 + rnd() * 50) * (0.35 + 0.65 * env)) + '%';
          seg.appendChild(b);
        }
        laneSp.appendChild(seg);
      } else {
        seg.classList.add(ev.silent ? 'silence' : 'voice');
        seg.textContent = ev.silent ? '넘어감' : ev.kind;
        laneSe.appendChild(seg);
      }
      ev.seg = seg;
      var li = el('li');
      li.dataset.who = ev.who;
      if (ev.silent) li.dataset.silent = '';
      li.appendChild(el('span', 't', fmt(ev.t)));
      li.appendChild(el('span', 'w', ev.who === 'speaker' ? '발표자' : '시온'));
      li.appendChild(el('span', 'x', ev.silent ? '(말하지 않음) ' + ev.text : ev.text));
      scriptOl.appendChild(li);
      ev.li = li;
    });
    function paintSeeonLane() {
      DEMO.forEach(function (ev) {
        if (ev.who === 'seeon' && !ev.silent) ev.seg.textContent = seeonOn ? ev.kind : '빈자리';
      });
    }

    function setSlide(n) {
      $$('.slide', screenEl).forEach(function (s) { s.classList.toggle('is-on', s.dataset.slide === String(n)); });
      if (n !== 3) screenEl.removeAttribute('data-hl');
    }
    function setHL(h) { if (h) screenEl.setAttribute('data-hl', h); else screenEl.removeAttribute('data-hl'); }
    function setPlayIcon(playing) {
      $('path', playBtn).setAttribute('d', playing ? STOP : PLAY);
      playBtn.setAttribute('aria-label', playing ? '예시 장면 멈추기' : '예시 장면 재생');
    }
    function push(node) {
      stream.appendChild(node);
      stream.scrollTop = stream.scrollHeight;
    }
    function addCard(ev) {
      var card;
      if (ev.who === 'speaker') {
        card = el('div', 'sc sc-speaker');
        card.appendChild(el('span', 'who', '발표자 · ' + fmt(ev.t)));
        card.appendChild(document.createTextNode(ev.text));
      } else if (!seeonOn) {
        card = el('div', 'sc sc-gap', '· · ·');
      } else if (ev.silent) {
        card = el('div', 'sc sc-silence', ev.text);
      } else {
        card = el('div', 'sc sc-seeon');
        card.appendChild(el('span', 'who', '시온 · ' + ev.kind));
        card.appendChild(document.createTextNode(ev.text));
      }
      push(card);
    }
    function movePlayhead(ev) {
      playhead.hidden = false;
      playhead.style.transition = 'none';
      playhead.style.left = (ev.t / TOTAL * 100) + '%';
      if (!reduce) {
        void playhead.offsetWidth;
        playhead.style.transition = 'left ' + ev.d + 's linear';
        playhead.style.left = ((ev.t + ev.d) / TOTAL * 100) + '%';
      }
    }
    function activate(ev) {
      DEMO.forEach(function (e) { e.seg.classList.toggle('is-active', e === ev); e.li.classList.toggle('is-active', e === ev); });
      timeEl.textContent = fmt(ev.t);
      movePlayhead(ev);
      if (ev.slide) setSlide(ev.slide);
      if (ev.hl) setHL(ev.hl);
      player.classList.toggle('speaking', ev.who === 'speaker');
      addCard(ev);
    }
    function resetVisual() {
      DEMO.forEach(function (e) { e.seg.classList.remove('is-active'); e.li.classList.remove('is-active'); });
      player.classList.remove('speaking');
      playhead.style.transition = 'none';
    }

    var demoRun = null;
    function demoStop(message) {
      if (!demoRun) return;
      demoRun.cancelled = true;
      demoRun = null;
      cancelSpeech();
      release('demo');
      setPlayIcon(false);
      resetVisual();
      if (message !== undefined) statusEl.textContent = message;
    }
    function showEnd() {
      var box = el('div', 'sc sc-end');
      if (!seeonOn) {
        box.appendChild(el('p', '', '‘이 부분’이 어디였는지, 73%⁠가 무엇이었는지 들으셨나요? 이번엔 시온을 켜고 같은 장면을 들어 보세요.'));
        var again = el('button', 'btn btn-primary btn-sm', '시온 켜고 다시 듣기');
        again.type = 'button';
        again.addEventListener('click', function () { setSeeon(true); demoPlay(0); });
        var row = el('div');
        row.appendChild(again);
        box.appendChild(row);
      } else {
        box.appendChild(el('p', '', '시온은 세 번 말하고 한 번은 넘어갔어요. ‘화면 가리기’를 누르고 다시 들어 보거나, 시온을 끄고 비교해 보세요.'));
      }
      push(box);
    }
    function demoPlay(from) {
      claim('demo', function () { demoStop('재생을 멈췄어요.'); });
      cancelSpeech();
      var run = { cancelled: false };
      demoRun = run;
      setPlayIcon(true);
      stream.textContent = '';
      setSlide(from >= 2 ? 3 : 2);
      if (from < 2) setHL(null);
      statusEl.textContent = koVoices().length ? '재생 중이에요. 멈추려면 버튼을 다시 누르거나 Esc를 누르세요.' : '이 브라우저에서는 한국어 음성이 나오지 않아 글자로만 보여 드려요.';
      var i = from;
      function next() {
        if (run.cancelled) return;
        if (i >= DEMO.length) {
          demoRun = null;
          release('demo');
          setPlayIcon(false);
          resetVisual();
          timeEl.textContent = fmt(TOTAL);
          playhead.style.left = '100%';
          showEnd();
          statusEl.textContent = '재생이 끝났어요.';
          return;
        }
        var ev = DEMO[i++];
        activate(ev);
        var p;
        if (ev.who === 'seeon' && !seeonOn) p = wait(ev.d * 1000);
        else if (ev.silent) p = wait(1200);
        else p = say(ev.text, ev.who);
        p.then(function () { return wait(350); }).then(next);
      }
      next();
    }
    playBtn.addEventListener('click', function () {
      if (demoRun) { demoStop('재생을 멈췄어요.'); return; }
      demoPlay(0);
    });
    $('#demo-tl').addEventListener('click', function (e) {
      var r = this.getBoundingClientRect();
      var t = (e.clientX - r.left) / r.width * TOTAL;
      var idx = 0;
      DEMO.forEach(function (ev, k) { if (ev.t <= t) idx = k; });
      if (demoRun) demoStop();
      demoPlay(idx);
    });
    $$('.seg-ctrl button', player).forEach(function (b) {
      b.addEventListener('click', function () {
        player.dataset.screen = b.dataset.screen;
        $$('.seg-ctrl button', player).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      });
    });
    var seeonSwitch = $('#seeon-switch');
    function setSeeon(on) {
      seeonOn = on;
      seeonSwitch.setAttribute('aria-checked', String(on));
      player.classList.toggle('seeon-off', !on);
      paintSeeonLane();
    }
    seeonSwitch.addEventListener('click', function () { setSeeon(!seeonOn); });
  })();

  /* 판단 퀴즈 */
  if ($('#quiz')) (function () {
    var QUIZ = [
      { ctx: '화면: 분기별 매출 막대그래프', say: '보시는 것처럼 3분기가 제일 높습니다.', speak: false,
        why: '무엇이 가장 높은지 이미 말에 들어 있어요. 화면을 보지 않아도 알 수 있으면 넘어가요.' },
      { ctx: '화면: 기업가치 성장률 73%', say: '이게 73%⁠입니다.', speak: true, voice: '73%⁠는 작년 대비 기업가치 성장률을 의미',
        why: '숫자는 말했지만 그게 무엇인지는 화면에만 있어요. 그래서 둘을 이어서 말해 줘요.' },
      { ctx: '화면: 민원 처리 절차 안내', say: '대기 시간이 꽤 길죠.', speak: false,
        why: '시간이나 부담처럼 화면으로 정도를 알 수 없는 건 말하지 않아요.' },
      { ctx: '화면: 산불 피해 지역 지도', say: '피해 지역이 꽤 넓죠.', speak: true, voice: '피해 지역은 지도에서 시 면적의 절반 정도',
        why: '‘꽤 넓다’가 어느 정도인지는 지도에 있어요. 화면에서 찾아 다른 것과 견주어 알려 줘요.' },
      { ctx: '화면: 워크숍 일정 안내', say: '워크숍 장소는 본사 연수원입니다. 거기는 주차가 무료예요.', speak: false,
        why: '‘거기’는 바로 앞에서 말한 연수원이에요. 앞뒤 말로 이어지면 빈자리가 아니에요.' },
      { ctx: '화면: 2년간 매출 추이 표가 있는 슬라이드', say: '여기 이 부분 보시면요,', speak: true, voice: '2년간 매출 추이 표',
        why: '‘이 부분’이 어디인지는 화면을 봐야만 알 수 있어요. 가리킨 곳을 화면에서 찾아 알려 줘요.' }
    ];
    var qi = 0, qScore = 0;
    var qDots = $('#q-dots');
    QUIZ.forEach(function () { qDots.appendChild(el('i')); });
    var qBtns = $$('.q-btn');
    function qRender() {
      $('#q-count').textContent = (qi + 1) + ' / ' + QUIZ.length;
      $$('i', qDots).forEach(function (d, k) { d.className = k < qi ? 'done' : k === qi ? 'now' : ''; });
      $('#q-context').textContent = QUIZ[qi].ctx;
      $('#q-utter').textContent = '“' + QUIZ[qi].say + '”';
      qBtns.forEach(function (b) { b.disabled = false; b.classList.remove('picked', 'right', 'wrong'); b.removeAttribute('aria-pressed'); });
      $('#q-result').hidden = true;
      $('#q-end').hidden = true;
      $('#q-body').hidden = false;
      $('#q-actions').hidden = false;
    }
    qBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        var item = QUIZ[qi];
        var right = (b.dataset.pick === 'speak') === item.speak;
        if (right) qScore++;
        qBtns.forEach(function (x) { x.disabled = true; });
        b.classList.add('picked', right ? 'right' : 'wrong');
        b.setAttribute('aria-pressed', 'true');
        var verdict = $('#q-verdict');
        verdict.className = 'q-verdict ' + (right ? 'ok' : 'no');
        verdict.textContent = right ? '맞혔어요' : '시온은 다르게 판단했어요';
        $('#q-res-h').textContent = item.speak ? '시온은 이렇게 말해요' : '시온은 넘어가요';
        var voice = $('#q-voice');
        voice.hidden = !item.speak;
        voice.textContent = '';
        if (item.speak) {
          voice.appendChild(el('span', 'who', '시온'));
          voice.appendChild(document.createTextNode(item.voice));
        }
        $('#q-why').textContent = item.why;
        $('#q-next').textContent = qi === QUIZ.length - 1 ? '결과 보기' : '다음 문제';
        $('#q-result').hidden = false;
        $('#q-res-h').focus();
      });
    });
    $('#q-next').addEventListener('click', function () {
      qi++;
      if (qi >= QUIZ.length) {
        $$('i', qDots).forEach(function (d) { d.className = 'done'; });
        $('#q-body').hidden = true;
        $('#q-actions').hidden = true;
        $('#q-result').hidden = true;
        var score = $('#q-score');
        score.textContent = '';
        score.appendChild(document.createTextNode(QUIZ.length + '문제 중 '));
        score.appendChild(el('span', '', qScore + '문제'));
        score.appendChild(document.createTextNode('를 시온과 똑같이 골랐어요.'));
        $('#q-end').hidden = false;
        score.focus();
        return;
      }
      qRender();
      qBtns[0].focus();
    });
    $('#q-retry').addEventListener('click', function () { qi = 0; qScore = 0; qRender(); qBtns[0].focus(); });
    qRender();
  })();

  /* 기능 탭 */
  if ($('#tabs')) (function () {
    var GROUPS = {
      on: { text: '늘 켜져 있어요', quiet: false },
      opt: { text: '켜고 끌 수 있어요', quiet: true },
      ask: { text: '궁금할 때 물어요', quiet: true },
      after: { text: '회의가 끝나면', quiet: true }
    };
    var FEATS = [
      { id: 'deixis', group: 'on', name: '가리킨 곳', title: '화면의 한 곳을 가리킬 때', ctx: '화면: 2년간 매출 추이 표가 있는 슬라이드', says: '“이거 보시면 차이가 확 나죠.”', voice: '2년간 매출 추이 표',
        rule: '가리킨 대상에 적힌 글자와 숫자만 써서 짧게 말해요. 비슷한 것이 여럿이라 어느 것을 가리켰는지 확실하지 않으면 말하지 않아요.' },
      { id: 'value', group: 'on', name: '숫자의 뜻', title: '숫자만 말하고 넘어갈 때', ctx: '화면: 작년 대비 기업가치 성장률 73%', says: '“이게 73%⁠입니다.”', voice: '73%⁠는 작년 대비 기업가치 성장률을 의미',
        rule: '말에는 숫자만 있고 그 뜻은 화면에 있을 때 둘을 이어 줘요. 안내에 넣을 숫자는 화면 글자와 다시 맞춰 보고, 화면에 없으면 버려요.' },
      { id: 'change', group: 'on', name: '바뀐 값', title: '바뀌었다고만 말할 때', ctx: '화면: 지원 자격 나이 제한 작년 25세, 올해 26세', says: '“나이 제한이 1년 바뀌었다는 점을 말씀드리고요.”', voice: '지원 자격 나이 제한, 작년 25세 올해 26세',
        rule: '무엇이 얼마에서 얼마로 바뀌었는지가 화면에만 있으면 그 값을 알려 줘요. 말로 이미 다 했으면 넘어가요.' },
      { id: 'scale', group: 'on', name: '크기', title: '크기를 말로만 할 때', ctx: '화면: 시 경계와 산불 피해 지역이 표시된 지도', says: '“피해 지역이 꽤 넓죠.”', voice: '피해 지역은 지도에서 시 면적의 절반 정도',
        rule: '화면 속 다른 것과 견주어 말해요. ‘소나무보다 4배 큰 불상’처럼요. 몇 배인지 모르면 숫자 없이 말하고, 시간이나 부담처럼 화면으로 볼 수 없는 정도는 말하지 않아요.' },
      { id: 'silence', group: 'on', name: '말없이 띄운 자료', title: '자료를 띄우고 말이 멈출 때', ctx: '화면: 3년간 매출 막대그래프', says: '“이 그래프 잠깐 보시죠.” (5초 넘게 조용해요)', speak: '이 그래프 잠깐 보시죠.', pause: 1800, voice: '이미지 제시, 3년간 두 배로 늘어난 매출 막대그래프',
        rule: '자료를 보라는 말이 있고 5초 넘게 조용할 때만 말해요. ‘들어 보시죠’ 같은 말이나 마무리 인사 뒤의 침묵에는 말하지 않아요.' },
      { id: 'screen', group: 'opt', name: '화면 전환', title: '화면이 바뀔 때', ctx: '화면: 구청 민원 접수 안내 웹페이지', says: '“화면 바꿔서 보여 드릴게요.”', voice: '페이지: 구청 민원 접수 방법을 안내하는 웹페이지',
        rule: '3초 넘게 머문 화면만 알려요. PPT는 ‘슬라이드 몇’, 웹페이지나 문서는 ‘페이지’라고 말해요. 이미 본 화면으로 돌아가면 ‘이전 슬라이드 3: 세션 하이재킹 개념’처럼 짧게 알려요.' },
      { id: 'speaker', group: 'opt', name: '말하는 사람', title: '말하는 사람이 바뀔 때', ctx: '화면: 참가자 타일 가운데 서윤님 타일이 강조됨', says: '(다른 참가자가 말하기 시작해요)', silent: true, voice: '서윤님이 말합니다',
        rule: '같은 사람이 계속 말하면 다시 알리지 않아요. 이름을 짐작하지 않고, 화면에서 확실히 읽을 수 없으면 알리지 않아요.' },
      { id: 'ask', group: 'ask', name: '직접 묻기', title: '궁금한 걸 바로 물을 때', ctx: '화면: 남녀 하루 소금 섭취량 그래프 (한국 수치는 없음)', says: '(마이크로 물어요) “한국 섭취량은?”', speak: '한국 섭취량은?', voice: '화면과 발화에 없는 내용이에요', extra: 'keys',
        rule: '답은 15초 안에, 지금 나오는 안내가 끝나자마자 들려줘요. 화면과 회의에서 나온 말에 근거가 없으면 지어내지 않고 없다고 답해요.' },
      { id: 'summary', group: 'after', name: '회의 기록', title: '회의가 끝났을 때', ctx: '회의를 마치면 내 컴퓨터의 문서 폴더에 저장돼요', says: '(회의를 마쳐요)', silent: true, voice: '이 회의는 분기 실적을 돌아보는 자리였습니다. 첫 장은 표지였고…', extra: 'script',
        rule: '오간 말과 화면 안내, 질문과 답을 시간 순서대로 적은 스크립트를 남기고, 요약은 글과 음성 파일로 만들어요. 요약은 아직 다듬고 있는 기능이에요.' }
    ];
    var tabsEl = $('#tabs');
    var panel = $('#feat-panel');
    var fpVoice = $('#fp-voice');
    var typingTimer = 0;
    var tabBtns = FEATS.map(function (f, k) {
      var b = el('button', 'tab', f.name);
      b.type = 'button';
      b.id = 'tab-' + f.id;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-controls', 'feat-panel');
      b.addEventListener('click', function () { selectTab(k, true); });
      b.addEventListener('keydown', function (e) {
        var to = null;
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') to = (k + 1) % FEATS.length;
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') to = (k - 1 + FEATS.length) % FEATS.length;
        if (e.key === 'Home') to = 0;
        if (e.key === 'End') to = FEATS.length - 1;
        if (to !== null) { e.preventDefault(); selectTab(to, true); tabBtns[to].focus(); }
      });
      tabsEl.appendChild(b);
      return b;
    });
    function typeInto(node, text) {
      clearInterval(typingTimer);
      if (reduce) { node.textContent = text; return; }
      var chars = Array.from(text);
      var n = 0;
      node.textContent = '';
      node.classList.add('typing');
      typingTimer = setInterval(function () {
        n++;
        node.textContent = chars.slice(0, n).join('');
        if (n >= chars.length) { clearInterval(typingTimer); node.classList.remove('typing'); }
      }, Math.max(18, Math.min(45, 800 / chars.length)));
    }
    function extraFor(f) {
      var box = document.createDocumentFragment();
      if (f.extra === 'keys') {
        var dl = el('dl', 'keys');
        [['1', '무슨 자료야?'], ['2', '지금 화면 요약'], ['3', '그래프 축이 뭐야?'], ['M', '말로 묻기']].forEach(function (k) {
          var row = el('div');
          var dt = el('dt');
          dt.appendChild(el('kbd', '', 'Ctrl'));
          dt.appendChild(document.createTextNode(' + '));
          dt.appendChild(el('kbd', '', k[0]));
          row.appendChild(dt);
          row.appendChild(el('dd', '', k[1]));
          dl.appendChild(row);
        });
        box.appendChild(dl);
        box.appendChild(el('p', '', '입력창에 적어서 물을 수도 있어요. 말로 묻는 동안에는 Meet 마이크가 저절로 꺼져요.'));
      }
      if (f.extra === 'script') {
        var pre = el('pre', 'excerpt');
        pre.appendChild(el('span', 'scr', '[02:30] ── 슬라이드 3: 분기별 매출 막대그래프 ──'));
        pre.appendChild(document.createTextNode('\n[02:31] 발표자: 보시는 것처럼 3분기가 제일 높습니다\n[02:36] 화자 미상: 4분기는 어떻게 예상하세요?'));
        box.appendChild(pre);
        box.appendChild(el('p', '', '스크립트와 요약은 앱의 ‘지난 회의’에서 다시 열어 볼 수 있어요.'));
      }
      return box;
    }
    function selectTab(k, animate) {
      var f = FEATS[k];
      tabBtns.forEach(function (b, j) {
        b.setAttribute('aria-selected', String(j === k));
        b.tabIndex = j === k ? 0 : -1;
      });
      panel.setAttribute('aria-labelledby', 'tab-' + f.id);
      var badge = $('#fp-badge');
      badge.textContent = GROUPS[f.group].text;
      badge.classList.toggle('quiet', GROUPS[f.group].quiet);
      $('#fp-title').textContent = f.title;
      $('#fp-ctx').textContent = f.ctx;
      $('#fp-says').textContent = f.says;
      $('#fp-voice-sr').textContent = f.voice;
      if (animate) typeInto(fpVoice, f.voice);
      else { clearInterval(typingTimer); fpVoice.classList.remove('typing'); fpVoice.textContent = f.voice; }
      var extra = $('#fp-extra');
      extra.textContent = '';
      extra.appendChild(extraFor(f));
      $('#fp-rule').textContent = f.rule;
      if (current && current.id === 'feat') current.stop();
    }
    selectTab(0, false);

    var fpPlay = $('#fp-play');
    var featRun = null;
    function setFpBtn(playing) {
      $('path', fpPlay).setAttribute('d', playing ? STOP : PLAY);
      $('.lbl', fpPlay).textContent = playing ? '멈추기' : fpPlay.dataset.label;
    }
    function featStop() {
      if (!featRun) return;
      featRun.cancelled = true;
      featRun = null;
      cancelSpeech();
      release('feat');
      setFpBtn(false);
    }
    fpPlay.addEventListener('click', function () {
      if (featRun) { featStop(); return; }
      var k = tabBtns.findIndex(function (b) { return b.getAttribute('aria-selected') === 'true'; });
      var f = FEATS[k];
      claim('feat', featStop);
      cancelSpeech();
      var run = { cancelled: false };
      featRun = run;
      setFpBtn(true);
      var first = f.silent ? wait(700) : say(f.speak || f.says.replace(/[“”]/g, ''), 'speaker');
      first.then(function () { return run.cancelled ? null : wait(f.pause || 300); })
        .then(function () { return run.cancelled ? null : say(f.voice, 'seeon'); })
        .then(function () { if (!run.cancelled) { featRun = null; release('feat'); setFpBtn(false); } });
    });
  })();

  /* 교차 방식: 품질·균형·성능 */
  if ($('#sic-viz')) (function () {
    var sicViz = $('#sic-viz');
    var sicDesc = $('#sic-desc');
    var PROFILES = {
      quality: { rate: '1.1배', text: '품질 — 회의를 60초 늦게 들어요. 안내를 넣을 자리를 가장 꼼꼼히 고르고, 따라잡을 때도 1.1배속까지만 빨라져서 말소리가 거의 달라지지 않아요.' },
      balanced: { rate: '1.5배', text: '균형 — 회의를 10초 늦게 들어요. 전문 화면해설의 99.4%⁠가 장면이 나오고 10초 안에 들어간다는 연구를 참고해 정했어요. 따라잡을 때는 1.5배속까지 빨라져요.' },
      speed: { rate: '1.8배', text: '성능 — 회의를 늦추지 않고 바로 들어요. 안내는 더 짧게 넣고, 늦어진 만큼 1.8배속까지 빠르게 틀어 금방 따라잡아요.' }
    };
    function setProfile(p) {
      sicViz.dataset.profile = p;
      $$('.mode-switch button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.profile === p)); });
      $('#sic-rate').textContent = PROFILES[p].rate;
      sicDesc.textContent = PROFILES[p].text;
    }
    $$('.mode-switch button').forEach(function (b) { b.addEventListener('click', function () { setProfile(b.dataset.profile); }); });
    $$('.sv-lane .sp').forEach(function (s) {
      var k = Number(s.dataset.k);
      for (var i = 0; i < 24; i++) {
        var bar = el('i');
        bar.style.height = (25 + Math.abs(Math.sin(i * 1.7 + k * 2.3)) * 70) + '%';
        s.appendChild(bar);
      }
    });
    setProfile('balanced');
  })();
})();
