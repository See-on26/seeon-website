// 공개 사이트(GitHub Pages)에는 평가 서버가 없다. 서버 API(/api/…) 요청을 이 파일이 대신 받는다.
//  - 일반객 체험 퀴즈: data/quiz.json 의 문항을 무작위로 내고, 정답 확인도 브라우저 안에서 한다.
//  - 실험자: 응답을 모을 서버가 없으므로 「지금은 실험 접수를 받지 않는」 상태로 답한다.
//  - 관리자: 로그인을 받지 않는다. 관리는 평가 서버(seeon-eval-web)에서 한다.
// 돌려주는 값은 { status, data } 이고, common.js 의 api() 가 서버 응답과 똑같이 다룬다.

const UNKNOWN_CHOICE = 4;
const UNKNOWN_LABEL = '알 수 없음';
const BASE = new URL('../', import.meta.url);
const QUIZ_URL = new URL('data/quiz.json', BASE);

const ok = (data) => ({ status: 200, data });
const fail = (status, error, message) => ({ status, data: { error, message } });

let quizData = null;
function loadQuiz() {
  quizData ||= fetch(QUIZ_URL, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  return quizData;
}

const segment = (media) => ({
  url: media?.src ? new URL(media.src, BASE).href : '',
  start: media?.start ?? 0,
  end: media?.end ?? null,
});

const plays = new Map();

async function quizNext(query) {
  const { settings = {}, items = [] } = await loadQuiz();
  let pool = items.filter((it) => it.active !== false);
  const last = Number(query.get('last'));
  if (pool.length > 1 && Number.isInteger(last)) pool = pool.filter((it) => it.id !== last);
  if (!pool.length) return fail(404, 'no_quiz', '아직 준비된 퀴즈가 없습니다. 문항이 준비되면 이곳에서 체험할 수 있습니다.');
  const item = pool[Math.floor(Math.random() * pool.length)];
  const playId = plays.size + 1;
  plays.set(playId, item.id);
  const options = (item.options || []).map((text, value) => ({ value, text }));
  if (settings.showUnknown) options.push({ value: UNKNOWN_CHOICE, text: UNKNOWN_LABEL });
  return ok({
    id: item.id,
    playId,
    stem: item.stem,
    options,
    allowReplay: !!settings.allowReplay,
    audio: segment(item.audio),
  });
}

async function quizAnswer(id, body) {
  const { settings = {}, items = [] } = await loadQuiz();
  const item = items.find((it) => it.id === id);
  if (!item) return fail(404, 'no_quiz', '퀴즈를 찾을 수 없습니다.');
  const choice = Number(body?.choice);
  if (!Number.isInteger(choice) || choice < 0 || choice > UNKNOWN_CHOICE) return fail(400, 'bad_choice', '보기를 골라 주세요.');
  if (plays.get(Number(body?.playId)) !== id) return fail(400, 'no_play', '퀴즈를 처음부터 다시 시작해 주세요.');
  const correct = choice === item.answer;
  const options = item.options || [];
  return ok({
    correct,
    answer: item.answer,
    answerText: options[item.answer],
    chosenText: choice === UNKNOWN_CHOICE ? UNKNOWN_LABEL : options[choice],
    explanation: item.explanation || '',
    message: (correct ? settings.messageCorrect : settings.messageWrong) || '',
    video: segment(item.video),
  });
}

export async function staticApi(path, { method = 'GET', body } = {}) {
  const [route, qs = ''] = path.split('?');
  const query = new URLSearchParams(qs);

  if (route === '/api/quiz/next' && method === 'GET') return quizNext(query);
  const answer = route.match(/^\/api\/quiz\/(\d+)\/answer$/);
  if (answer && method === 'POST') return quizAnswer(Number(answer[1]), body);

  if (route === '/api/exp/status') return ok({ open: false, ready: false, requireDesktop: false, visualOptions: [] });
  if (route === '/api/exp/abort') return ok({ ok: true });
  if (route.startsWith('/api/exp/')) return fail(403, 'closed', '지금은 실험 접수를 받지 않습니다.');

  if (route === '/api/admin/login') {
    return fail(403, 'static_site', '이 공개 사이트에서는 관리자 기능을 쓸 수 없습니다. 평가 서버에서 로그인해 주세요.');
  }
  if (route === '/api/admin/logout') return ok({ ok: true });
  if (route.startsWith('/api/admin/')) return fail(401, 'unauthorized', '로그인이 필요합니다.');

  return fail(404, 'not_found', '없는 주소입니다.');
}
