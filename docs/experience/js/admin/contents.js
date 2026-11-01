import { api, clear, confirmDialog, h, modal, toast } from '../common.js';
import { adminApi, condChip, field, mediaSelect, section, table, viewHead, yesNo } from './ui.js';

const SLOT_DESC = {
  A: '발표 음성만 (사용 전). 원본 영상 파일을 그대로 골라도 됩니다 — 화면은 가려집니다.',
  S: '음성 + SEEON AD (교차 · 균형 모드 출력)',
  H: '음성 + 사람 작성 AD',
  C: '음성 + 화면. 원본 영상',
};

export async function render(root) {
  let state = { contents: [], media: [], settings: null, conditions: [], selectedId: null, questions: [] };
  const left = h('div');
  const right = h('div');

  async function loadAll(keepSelection = true) {
    const [c, m, s] = await Promise.all([adminApi('/contents'), adminApi('/media'), adminApi('/settings')]);
    state.contents = c.contents;
    state.media = m.media;
    state.settings = s.settings;
    state.conditions = s.conditions;
    if (!keepSelection || !state.contents.some((x) => x.id === state.selectedId)) state.selectedId = state.contents[0]?.id ?? null;
    drawList();
    await drawDetail();
  }

  function drawList() {
    clear(left,
      h('div', { class: 'btn-row', style: { marginBottom: '10px' } },
        h('button', { type: 'button', class: 'btn btn-primary btn-sm', onClick: () => editContent(null) }, '+ 콘텐츠 추가')),
      state.contents.length
        ? h('div', { class: 'list' }, state.contents.map((c) =>
            h('button', {
              type: 'button', class: 'list-item', 'aria-current': c.id === state.selectedId ? 'true' : 'false',
              onClick: async () => {
                state.selectedId = c.id;
                drawList();
                await drawDetail();
              },
            },
              h('span', { class: 'li-top' },
                h('span', { class: 'li-code' }, c.code),
                h('span', { class: 'slots', 'aria-label': '재생 파일' }, ['A', 'S', 'H', 'C'].map((k) => h('span', { class: `slot-dot${c.media[k] ? ' on' : ''}`, title: `${k} ${c.media[k] ? '있음' : '없음'}` }, k)))),
              h('span', null, c.title),
              h('span', { class: 'muted small' }, `${c.domain || '도메인 없음'} · ${c.language === 'ko' ? '한국어' : '영어'} · 문항 ${c.n_active}/${c.n_questions}${c.inExperiment ? ' · 실험에 사용' : ''}`),
            )))
        : h('div', { class: 'panel muted' }, '콘텐츠가 없습니다. 영상 1편마다 콘텐츠를 하나 만들고, 조건별 재생 파일과 문항을 붙입니다.'),
    );
  }

  async function drawDetail() {
    const c = state.contents.find((x) => x.id === state.selectedId);
    if (!c) return clear(right);
    state.questions = (await adminApi(`/questions?contentId=${c.id}`)).questions;

    const slots = state.conditions.map((cond) => {
      const current = c.media[cond.id];
      const sel = mediaSelect(state.media, current?.id, { emptyLabel: '— 파일 없음 —' });
      sel.setAttribute('aria-label', `${cond.label} 재생 파일`);
      sel.addEventListener('change', async () => {
        try {
          await adminApi(`/contents/${c.id}/media`, { method: 'PUT', body: { condition: cond.id, mediaId: sel.value ? Number(sel.value) : null } });
          toast(`${c.code} ${cond.id} 파일을 바꿨습니다.`, 'ok');
          await loadAll();
        } catch (err) {
          toast(err.message, 'bad');
        }
      });
      const used = state.settings.conditions.includes(cond.id);
      return h('div', { class: 'media-slot' },
        h('div', { class: 'slot-name' }, condChip(cond.id, false), ' ', cond.label.split(' · ')[1], h('small', null, used ? SLOT_DESC[cond.id] : '실험 설정에서 꺼진 조건')),
        sel,
        current ? h('a', { class: 'btn btn-sm', href: `/api/admin/media/${current.id}/file`, target: '_blank' }, '미리 보기') : h('span'),
      );
    });

    clear(right,
      h('div', { class: 'panel' },
        h('div', { class: 'section-head' },
          h('h2', null, `${c.code} · ${c.title}`),
          h('div', { class: 'btn-row' },
            h('button', { type: 'button', class: 'btn btn-sm', onClick: () => editContent(c) }, '정보 수정'),
            h('button', { type: 'button', class: 'btn btn-sm btn-danger', onClick: () => deleteContent(c) }, '삭제'))),
        h('p', { class: 'muted', style: { margin: 0 } }, `${c.domain || '도메인 없음'} · ${c.language === 'ko' ? '한국어' : '영어'}${c.note ? ` · ${c.note}` : ''}`)),
      section('조건별 재생 파일',
        h('div', { class: 'panel' }, h('div', { class: 'media-slots' }, slots),
          h('p', { class: 'muted small', style: { margin: '12px 0 0' } }, '파일은 「미디어 파일」 메뉴에서 먼저 올립니다. 화면이 보이는 조건은 C뿐이고, 나머지는 검은 화면에 소리만 나옵니다.'))),
      h('section', { class: 'section' },
        h('div', { class: 'section-head' },
          h('h2', null, `문항 ${state.questions.length}개`),
          h('div', { class: 'btn-row' },
            h('button', { type: 'button', class: 'btn btn-primary btn-sm', onClick: () => editQuestion(c, null) }, '+ 문항 추가'),
            h('a', { class: 'btn btn-sm', href: '/api/admin/questions/template.xlsx' }, '엑셀 양식'),
            h('button', { type: 'button', class: 'btn btn-sm', onClick: importQuestions }, '엑셀 가져오기'),
            h('a', { class: 'btn btn-sm', href: '/api/admin/questions/export.xlsx' }, '전체 문항 내보내기'))),
        table(
          [
            { label: '순서', class: 'num', render: (q) => q.ordinal },
            { label: '코드', render: (q) => h('span', { class: 'nowrap' }, q.code) },
            { label: '분류', render: (q) => h('span', { class: 'nowrap' }, `${q.major} · ${q.minor}`) },
            { label: '문항', render: (q) => h('div', { class: 'clip', title: q.stem }, q.stem) },
            { label: '정답', render: (q) => h('div', { class: 'clip', style: { maxWidth: '160px' }, title: q.options[q.answer] }, `${q.answer + 1}. ${q.options[q.answer]}`) },
            { label: '응답', class: 'num', render: (q) => q.n_responses },
            { label: '사용', render: (q) => yesNo(q.active) },
            {
              label: '', class: 'actions',
              render: (q) => [
                h('button', { type: 'button', class: 'btn btn-sm', onClick: () => editQuestion(c, q) }, '수정'),
                h('button', { type: 'button', class: 'btn btn-sm btn-danger', onClick: () => deleteQuestion(q) }, '삭제'),
              ],
            },
          ],
          state.questions,
          { empty: '문항이 없습니다. 「문항 추가」나 「엑셀 가져오기」로 넣으세요.' },
        ),
        h('p', { class: 'muted small', style: { marginTop: '8px' } }, "모든 문항에 '알 수 없음' 보기가 자동으로 붙습니다. 「안 씀」 문항은 실험에 내지 않고 분석에서도 뺍니다. 정답을 고치면 이미 받은 응답도 새 정답으로 다시 채점됩니다.")),
    );
  }

  function editContent(c) {
    const code = h('input', { type: 'text', value: c?.code || '', placeholder: 'LEC01' });
    const title = h('input', { type: 'text', value: c?.title || '' });
    const domains = [...new Set([...(state.settings?.domains || []), ...(c?.domain ? [c.domain] : [])])];
    const domain = h('select', { value: c?.domain || domains[0] || '' }, domains.map((d) => h('option', { value: d }, d)));
    const language = h('select', { value: c?.language || 'en' }, h('option', { value: 'en' }, '영어'), h('option', { value: 'ko' }, '한국어'));
    const note = h('input', { type: 'text', value: c?.note || '', placeholder: '출처, 구간 등' });
    modal({
      title: c ? `${c.code} 정보 수정` : '새 콘텐츠',
      body: h('div', { class: 'form-grid' },
        field('코드', code, '영문·숫자. 문항 코드 앞부분으로도 씁니다.'),
        field('언어', language),
        h('div', { class: 'span-all' }, field('제목', title)),
        field('도메인', domain, '목록은 실험 설정에서 바꿉니다.'),
        field('메모', note)),
      actions: [
        { label: '취소' },
        {
          label: '저장', class: 'btn-primary',
          onClick: async () => {
            const body = { code: code.value, title: title.value, domain: domain.value, language: language.value, note: note.value };
            try {
              if (c) await adminApi(`/contents/${c.id}`, { method: 'PUT', body });
              else state.selectedId = (await adminApi('/contents', { method: 'POST', body })).id;
              toast('저장했습니다.', 'ok');
              await loadAll();
            } catch (err) {
              toast(err.message, 'bad');
              return false;
            }
          },
        },
      ],
    });
  }

  async function deleteContent(c) {
    const ok = await confirmDialog({ title: `${c.code} 삭제`, message: '콘텐츠와 그 문항을 모두 지웁니다. 응답이 있는 콘텐츠는 지울 수 없습니다.', confirmLabel: '삭제', danger: true });
    if (!ok) return;
    try {
      await adminApi(`/contents/${c.id}`, { method: 'DELETE' });
      toast('삭제했습니다.');
      await loadAll(false);
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  function editQuestion(c, q) {
    const cats = state.settings.categories;
    const nextOrdinal = Math.max(0, ...state.questions.map((x) => x.ordinal)) + 1;
    const code = h('input', { type: 'text', value: q?.code || `${c.code}-Q${String(nextOrdinal).padStart(2, '0')}` });
    const ordinal = h('input', { type: 'number', value: String(q?.ordinal ?? nextOrdinal) });
    const major = h('select', { value: q?.major || '부분' }, Object.keys(cats).map((m) => h('option', { value: m }, `${m} 정보 이해도`)));
    const minor = h('select');
    const fillMinor = (val) => {
      clear(minor, cats[major.value].map((m) => h('option', { value: m }, m)));
      minor.value = cats[major.value].includes(val) ? val : cats[major.value][0];
    };
    fillMinor(q?.minor);
    major.addEventListener('change', () => fillMinor());
    const stem = h('textarea', { rows: 3, value: q?.stem || '', placeholder: '화면을 가리킬 때는 발화를 인용합니다. 예: 발표자가 "보시는 것처럼 30%예요"라고 한 30%는 무엇의 수치인가?' });
    const radioName = `ans-${Math.random().toString(36).slice(2)}`;
    const opts = [0, 1, 2, 3].map((i) => ({
      radio: h('input', { type: 'radio', name: radioName, value: String(i), checked: (q?.answer ?? 0) === i, 'aria-label': `보기 ${i + 1}을 정답으로` }),
      input: h('input', { type: 'text', value: q?.options[i] || '', placeholder: `보기 ${i + 1}`, 'aria-label': `보기 ${i + 1}` }),
    }));
    const evidence = h('textarea', { rows: 2, value: q?.evidence || '', placeholder: '정답 근거 (검수용 메모, 참가자에게 안 보임)' });
    const active = h('input', { type: 'checkbox', checked: q ? q.active : true });

    modal({
      title: q ? `${q.code} 수정` : `${c.code} 문항 추가`,
      wide: true,
      body: h('div', null,
        h('div', { class: 'form-grid' }, field('문항 코드', code), field('순서', ordinal), field('대분류', major), field('소분류', minor)),
        field('문항', stem),
        h('div', { class: 'field' },
          h('span', { class: 'label' }, '보기 (왼쪽 동그라미 = 정답)'),
          opts.map((o) => h('div', { class: 'opt-row' }, o.radio, o.input)),
          h('span', { class: 'hint' }, "'알 수 없음'은 5번째 보기로 자동으로 붙습니다. 발화만으로 걸러지는 오답과 화면이 있어야 걸러지는 오답을 섞어 주세요.")),
        field('근거', evidence),
        h('label', { class: 'switch' }, active, '실험에 사용'),
      ),
      actions: [
        { label: '취소' },
        {
          label: '저장', class: 'btn-primary',
          onClick: async () => {
            const body = {
              contentId: c.id, code: code.value, ordinal: Number(ordinal.value), major: major.value, minor: minor.value,
              stem: stem.value, options: opts.map((o) => o.input.value), answer: Number(opts.find((o) => o.radio.checked)?.radio.value ?? -1),
              evidence: evidence.value, active: active.checked,
            };
            try {
              if (q) await adminApi(`/questions/${q.id}`, { method: 'PUT', body });
              else await adminApi('/questions', { method: 'POST', body });
              toast('저장했습니다.', 'ok');
              await loadAll();
            } catch (err) {
              toast(err.message, 'bad');
              return false;
            }
          },
        },
      ],
    });
  }

  async function deleteQuestion(q) {
    const ok = await confirmDialog({
      title: `${q.code} 삭제`,
      message: q.n_responses ? `이 문항에는 응답이 ${q.n_responses}개 있어 지울 수 없습니다. 「수정」에서 사용을 끄세요.` : '문항을 지웁니다.',
      confirmLabel: '삭제', danger: true,
    });
    if (!ok) return;
    try {
      await adminApi(`/questions/${q.id}`, { method: 'DELETE' });
      toast('삭제했습니다.');
      await loadAll();
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  function importQuestions() {
    const input = h('input', { type: 'file', accept: '.xlsx,.csv' });
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      const fd = new FormData();
      fd.append('file', file);
      try {
        const r = await api('/api/admin/questions/import', { method: 'POST', body: fd });
        toast(`문항 ${r.created}개를 새로 넣고 ${r.updated}개를 고쳤습니다.`, 'ok');
        await loadAll();
      } catch (err) {
        if (err.data?.errors) {
          modal({
            title: '가져오지 못했습니다',
            wide: true,
            body: h('div', null,
              h('p', null, `${err.message} 고친 뒤 다시 올려 주세요.`),
              table(
                [
                  { label: '줄', class: 'num', render: (e) => e.row },
                  { label: '문항 코드', render: (e) => e.code },
                  { label: '문제', class: 'wrap', render: (e) => e.messages.join(' ') },
                ],
                err.data.errors,
              )),
            actions: [{ label: '닫기' }],
          });
        } else toast(err.message, 'bad');
      }
    });
    input.click();
  }

  clear(root,
    viewHead('콘텐츠·문항', '평가 영상 1편 = 콘텐츠 1개. 조건(A·S·H·C)별 재생 파일과 4지선다 문항을 붙입니다.'),
    h('div', { class: 'split' }, left, right));
  await loadAll(false);
}

