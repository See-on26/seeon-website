import { clear, confirmDialog, fmtClock, fmtPct, h, modal, toast } from '../common.js';
import { adminApi, field, mediaLabel, mediaSelect, section, table, viewHead, yesNo } from './ui.js';

// "1:23", "83", "1:02:03" → 초. 빈칸은 null
function parseTime(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  const parts = t.split(':').map(Number);
  if (parts.some((p) => !Number.isFinite(p))) return NaN;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}
const showTime = (sec) => (sec == null ? '' : fmtClock(sec));
const range = (s, e) => (s == null && e == null ? '전체' : `${showTime(s ?? 0)} ~ ${e == null ? '끝' : showTime(e)}`);

export async function render(root) {
  const [{ items }, { media }, { settings: s }, { questions }] = await Promise.all([
    adminApi('/quiz'), adminApi('/media'), adminApi('/settings'), adminApi('/questions'),
  ]);

  const showUnknown = h('input', { type: 'checkbox', checked: s.quizShowUnknown });
  const allowReplay = h('input', { type: 'checkbox', checked: s.quizAllowReplay });
  const msgOk = h('input', { type: 'text', value: s.quizMessageCorrect });
  const msgBad = h('input', { type: 'text', value: s.quizMessageWrong });
  async function saveOptions() {
    try {
      await adminApi('/settings', {
        method: 'PUT',
        body: { quizShowUnknown: showUnknown.checked, quizAllowReplay: allowReplay.checked, quizMessageCorrect: msgOk.value, quizMessageWrong: msgBad.value },
      });
      toast('퀴즈 설정을 저장했습니다.', 'ok');
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  function edit(item) {
    const titleIn = h('input', { type: 'text', value: item?.title || '' });
    const source = h('select', { value: item?.source_question_id ? String(item.source_question_id) : '' },
      h('option', { value: '' }, '— 직접 쓰기 —'),
      questions.map((q) => h('option', { value: String(q.id) }, `${q.code} · ${q.stem.slice(0, 50)}`)));
    const stem = h('textarea', { rows: 3, value: item?.stem || '' });
    const radioName = `qa-${Math.random().toString(36).slice(2)}`;
    const opts = [0, 1, 2, 3].map((i) => ({
      radio: h('input', { type: 'radio', name: radioName, value: String(i), checked: (item?.answer ?? 0) === i, 'aria-label': `보기 ${i + 1}을 정답으로` }),
      input: h('input', { type: 'text', value: item?.options[i] || '', placeholder: `보기 ${i + 1}` }),
    }));
    const explanation = h('textarea', { rows: 2, value: item?.explanation || '', placeholder: '결과 화면에 보여 줄 짧은 설명 (선택)' });
    const audio = mediaSelect(media, item?.audio_media_id, { emptyLabel: '— 오디오 고르기 —' });
    const aStart = h('input', { type: 'text', value: showTime(item?.audio_start), placeholder: '처음부터' });
    const aEnd = h('input', { type: 'text', value: showTime(item?.audio_end), placeholder: '끝까지' });
    const video = mediaSelect(media, item?.video_media_id, { emptyLabel: '— 영상 고르기 —' });
    const vStart = h('input', { type: 'text', value: showTime(item?.video_start), placeholder: '처음부터' });
    const vEnd = h('input', { type: 'text', value: showTime(item?.video_end), placeholder: '끝까지' });
    const active = h('input', { type: 'checkbox', checked: item ? item.active : true });

    source.addEventListener('change', () => {
      const q = questions.find((x) => String(x.id) === source.value);
      if (!q) return;
      stem.value = q.stem;
      q.options.forEach((o, i) => (opts[i].input.value = o));
      opts[q.answer].radio.checked = true;
      if (!titleIn.value) titleIn.value = q.code;
    });

    modal({
      title: item ? '퀴즈 수정' : '퀴즈 추가',
      wide: true,
      body: h('div', null,
        h('div', { class: 'form-grid' }, field('제목 (관리용)', titleIn), field('실험 문항에서 가져오기', source)),
        field('문항', stem),
        h('div', { class: 'field' }, h('span', { class: 'label' }, '보기 (왼쪽 동그라미 = 정답)'), opts.map((o) => h('div', { class: 'opt-row' }, o.radio, o.input))),
        field('해설', explanation),
        h('div', { class: 'panel', style: { marginBottom: '14px' } },
          h('h3', { style: { fontSize: '15px' } }, '① 먼저 들려줄 오디오 — SEEON AD가 결합된 오디오'),
          h('div', { class: 'form-grid' }, h('div', { class: 'span-all' }, field('파일', audio)), field('시작 (분:초)', aStart), field('끝 (분:초)', aEnd))),
        h('div', { class: 'panel', style: { marginBottom: '14px' } },
          h('h3', { style: { fontSize: '15px' } }, '② 정답 확인 뒤 보여 줄 영상 — 같은 부분을 화면과 함께'),
          h('div', { class: 'form-grid' }, h('div', { class: 'span-all' }, field('파일', video)), field('시작 (분:초)', vStart), field('끝 (분:초)', vEnd)),
          h('p', { class: 'muted small', style: { margin: 0 } }, '교차 모드 오디오는 AD가 들어간 만큼 시간이 밀릴 수 있어 오디오와 영상 구간을 따로 적습니다. 영상은 그 파일의 소리와 함께 재생됩니다.')),
        h('label', { class: 'switch' }, active, '퀴즈에 내기'),
      ),
      actions: [
        { label: '취소' },
        {
          label: '저장', class: 'btn-primary',
          onClick: async () => {
            const body = {
              title: titleIn.value, sourceQuestionId: source.value ? Number(source.value) : null, stem: stem.value,
              options: opts.map((o) => o.input.value), answer: Number(opts.find((o) => o.radio.checked)?.radio.value ?? -1),
              explanation: explanation.value, audioMediaId: Number(audio.value), audioStart: parseTime(aStart.value), audioEnd: parseTime(aEnd.value),
              videoMediaId: Number(video.value), videoStart: parseTime(vStart.value), videoEnd: parseTime(vEnd.value), active: active.checked,
            };
            if ([body.audioStart, body.audioEnd, body.videoStart, body.videoEnd].some((v) => Number.isNaN(v))) {
              toast('시각은 1:23 또는 83처럼 적어 주세요.', 'bad');
              return false;
            }
            try {
              if (item) await adminApi(`/quiz/${item.id}`, { method: 'PUT', body });
              else await adminApi('/quiz', { method: 'POST', body });
              toast('저장했습니다.', 'ok');
              render(root);
            } catch (err) {
              toast(err.message, 'bad');
              return false;
            }
          },
        },
      ],
    });
  }

  async function remove(item) {
    const ok = await confirmDialog({ title: '퀴즈 삭제', message: `「${item.title}」와 그 플레이 기록을 지웁니다.`, confirmLabel: '삭제', danger: true });
    if (!ok) return;
    await adminApi(`/quiz/${item.id}`, { method: 'DELETE' });
    toast('삭제했습니다.');
    render(root);
  }

  const mediaName = (id, label, name) => mediaLabel({ id, label, original_name: name });
  clear(root,
    viewHead('체험 퀴즈', '일반객 체험 부스용. 켜 둔 퀴즈 중 하나가 무작위로 나옵니다(같은 퀴즈가 연달아 나오지 않음).',
      h('button', { type: 'button', class: 'btn btn-primary', onClick: () => edit(null) }, '+ 퀴즈 추가'),
      h('a', { class: 'btn', href: 'visitor.html', target: '_blank' }, '체험 화면 열기')),
    table(
      [
        { label: '제목', render: (q) => q.title },
        { label: '문항', render: (q) => h('div', { class: 'clip', title: q.stem }, q.stem) },
        { label: '① 오디오', render: (q) => h('div', null, h('div', { class: 'small' }, mediaName(q.audio_media_id, q.audio_label, q.audio_name)), h('div', { class: 'muted small' }, range(q.audio_start, q.audio_end))) },
        { label: '② 영상', render: (q) => h('div', null, h('div', { class: 'small' }, mediaName(q.video_media_id, q.video_label, q.video_name)), h('div', { class: 'muted small' }, range(q.video_start, q.video_end))) },
        { label: '사용', render: (q) => yesNo(q.active) },
        { label: '플레이', class: 'num', render: (q) => q.plays },
        { label: '정답률', class: 'num', render: (q) => (q.plays ? fmtPct(q.correct / q.plays) : '–') },
        {
          label: '', class: 'actions',
          render: (q) => [
            h('button', { type: 'button', class: 'btn btn-sm', onClick: () => edit(q) }, '수정'),
            h('button', { type: 'button', class: 'btn btn-sm btn-danger', onClick: () => remove(q) }, '삭제'),
          ],
        },
      ],
      items,
      { empty: '퀴즈가 없습니다. 「퀴즈 추가」로 SEEON AD 오디오 구간, 문항 1개, 화면 공개 영상 구간을 묶어 주세요.' },
    ),
    section('퀴즈 진행 설정',
      h('div', { class: 'panel' },
        h('div', { class: 'choice-list' },
          h('label', { class: 'switch' }, showUnknown, "보기에 '알 수 없음' 넣기"),
          h('label', { class: 'switch' }, allowReplay, '문제 화면에서 「다시 듣기」 허용')),
        h('div', { class: 'form-grid', style: { marginTop: '14px' } },
          field('정답일 때 결과 화면 문구', msgOk),
          field('오답일 때 결과 화면 문구', msgBad, '정답자만 상품을 준다면 오답 문구를 바꾸세요.')),
        h('button', { type: 'button', class: 'btn', onClick: saveOptions }, '퀴즈 설정 저장'))),
  );
}
