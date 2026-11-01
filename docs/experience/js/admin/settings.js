import { api, clear, h, toast } from '../common.js';
import { adminApi, condChip, field, mediaSelect, section, table, viewHead } from './ui.js';

export async function render(root) {
  const [{ settings: s, conditions, participantCount }, { contents }, { media }] = await Promise.all([
    adminApi('/settings'), adminApi('/contents'), adminApi('/media'),
  ]);

  // ---- 실험 구성: 조건 + 콘텐츠 → 배정표 ----
  const condBoxes = conditions.map((c) =>
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', value: c.id, checked: s.conditions.includes(c.id) }),
      h('span', null, h('b', null, c.label), h('br'), h('span', { class: 'muted small' }, c.desc))));
  const contentList = h('div', { class: 'choice-list' });
  const preview = h('div');
  let picked = s.experimentContents.slice();
  const perPart = h('input', { type: 'number', min: '1', max: '4', value: String(s.contentsPerPart || 1), style: { width: '80px' } });
  const perPartValue = () => Math.min(4, Math.max(1, Math.round(Number(perPart.value) || 1)));
  const contentOptions = () => contents.map((c) => h('option', { value: String(c.id) }, `${c.code} · ${c.title} (${c.domain || '-'}, ${c.language === 'ko' ? '한' : '영'}, 문항 ${c.n_active})`));

  const selectedConds = () => condBoxes.map((b) => b.querySelector('input')).filter((i) => i.checked).map((i) => i.value);

  function drawContentPickers() {
    const m = perPartValue();
    const n = selectedConds().length * m;
    picked = picked.slice(0, n);
    while (picked.length < n) picked.push(null);
    clear(contentList, picked.map((id, i) => {
      const name = m === 1 ? `${i + 1}` : `묶음 ${Math.floor(i / m) + 1} · ${(i % m) + 1}`;
      const sel = h('select', { value: id == null ? '' : String(id), 'aria-label': `콘텐츠 ${name}` },
        h('option', { value: '' }, '— 콘텐츠 고르기 —'),
        contentOptions());
      sel.addEventListener('change', () => {
        picked[i] = sel.value ? Number(sel.value) : null;
        drawPreview();
      });
      return h('div', { class: 'opt-row' }, h('b', null, name), sel);
    }));
    drawPreview();
  }

  async function drawPreview() {
    const conds = selectedConds();
    const ids = picked.filter((x) => x != null);
    const need = conds.length * perPartValue();
    if (!conds.length) return clear(preview, h('div', { class: 'notice warn' }, '조건을 하나 이상 켜세요.'));
    if (ids.length !== need || new Set(ids).size !== ids.length) {
      return clear(preview, h('div', { class: 'notice warn' }, `서로 다른 콘텐츠 ${need}개를 고르면 배정표가 만들어집니다.`));
    }
    const d = await adminApi('/design/preview', { method: 'POST', body: { conditions: conds, experimentContents: ids, contentsPerPart: perPartValue() } });
    clear(preview,
      table(
        [
          { label: '행', render: (r) => `${r.row + 1}행` },
          ...d.rows[0].cells.map((_, i) => ({ label: `${i + 1}번째 파트`, render: (r) => h('span', null, condChip(r.cells[i].condition, false), ' ', r.cells[i].contentCode) })),
        ],
        d.rows,
      ),
      h('p', { class: 'muted small', style: { marginTop: '8px' } },
        `${d.rows.length}행 배정표 — 행마다 모든 조건과 모든 ${perPartValue() > 1 ? '묶음' : '콘텐츠'}을 한 번씩 보고, 각 조건·${perPartValue() > 1 ? '묶음' : '콘텐츠'}이 각 순서에 고르게 나옵니다. 균형을 맞추려면 참가자 수를 ${d.rows.length}의 배수로 두세요.`));
  }

  condBoxes.forEach((b) => b.addEventListener('change', drawContentPickers));
  perPart.addEventListener('change', drawContentPickers);

  // ---- 연습 파트 ----
  const practice = h('select', { value: s.practiceContentId == null ? '' : String(s.practiceContentId), 'aria-label': '연습 콘텐츠' },
    h('option', { value: '' }, '— 연습 없음 —'), contentOptions());
  const practiceCond = h('select', { value: s.practiceCondition, 'aria-label': '연습 조건' },
    conditions.map((c) => h('option', { value: c.id }, c.label)));
  const postSurvey = h('input', { type: 'checkbox', checked: s.postSurvey });
  const showSubtitles = h('input', { type: 'checkbox', checked: s.showSubtitles });
  const allowNotes = h('input', { type: 'checkbox', checked: s.allowNotes });
  const allowReview = h('input', { type: 'checkbox', checked: s.allowReview });
  const requireDesktop = h('input', { type: 'checkbox', checked: s.requireDesktop });

  // ---- 진행 옵션 ----
  const open = h('input', { type: 'checkbox', checked: s.experimentOpen });
  const shuffleQ = h('input', { type: 'checkbox', checked: s.shuffleQuestions });
  const shuffleO = h('input', { type: 'checkbox', checked: s.shuffleOptions });
  const perQ = h('input', { type: 'number', min: '5', max: '300', value: String(s.secondsPerQuestion) });
  const volume = mediaSelect(media, s.volumeMediaId, { emptyLabel: '— 기본 신호음 —' });
  const doneSec = h('input', { type: 'number', min: '3', max: '600', value: String(s.doneReturnSeconds) });

  // ---- 문구 ----
  const intro = h('textarea', { rows: 8, value: s.introText });
  const consent = h('textarea', { rows: 10, value: s.consentText });
  const sensitive = h('textarea', { rows: 5, value: s.sensitiveConsentText });
  const consentVersion = h('input', { type: 'text', value: s.consentVersion });
  const doneMsg = h('input', { type: 'text', value: s.doneMessage });

  // ---- 분류 ----
  const domains = h('input', { type: 'text', value: s.domains.join(', ') });
  const catPart = h('input', { type: 'text', value: s.categories['부분'].join(', ') });
  const catWhole = h('input', { type: 'text', value: s.categories['통합'].join(', ') });
  const list = (el) => el.value.split(',').map((x) => x.trim()).filter(Boolean);

  async function save() {
    const conds = selectedConds();
    const ids = picked.filter((x) => x != null);
    const changingDesign = conds.join() !== s.conditions.join() || ids.join() !== s.experimentContents.join() || perPartValue() !== (s.contentsPerPart || 1);
    if (changingDesign && participantCount > 0 &&
      !window.confirm(`이미 참가 기록이 ${participantCount}건 있습니다. 조건·콘텐츠를 바꾸면 새 참가자부터 새 배정표를 쓰고, 이전 참가자와는 행 균형을 따로 셉니다. 저장할까요?`)) return;
    const body = {
      experimentOpen: open.checked,
      conditions: conds,
      experimentContents: ids,
      contentsPerPart: perPartValue(),
      practiceContentId: practice.value ? Number(practice.value) : null,
      practiceCondition: practiceCond.value,
      postSurvey: postSurvey.checked,
      showSubtitles: showSubtitles.checked,
      allowNotes: allowNotes.checked,
      allowReview: allowReview.checked,
      requireDesktop: requireDesktop.checked,
      shuffleQuestions: shuffleQ.checked,
      shuffleOptions: shuffleO.checked,
      secondsPerQuestion: Number(perQ.value),
      volumeMediaId: volume.value ? Number(volume.value) : null,
      doneReturnSeconds: Number(doneSec.value),
      introText: intro.value,
      consentText: consent.value,
      sensitiveConsentText: sensitive.value,
      consentVersion: consentVersion.value.trim(),
      doneMessage: doneMsg.value,
      domains: list(domains),
      categories: { 부분: list(catPart), 통합: list(catWhole) },
    };
    try {
      await adminApi('/settings', { method: 'PUT', body });
      toast('설정을 저장했습니다.', 'ok');
      render(root);
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  // ---- 비밀번호 ----
  const pwCur = h('input', { type: 'password', autocomplete: 'current-password' });
  const pwNew = h('input', { type: 'password', autocomplete: 'new-password' });
  const pwNew2 = h('input', { type: 'password', autocomplete: 'new-password' });
  async function changePassword() {
    if (pwNew.value !== pwNew2.value) return toast('새 비밀번호 두 칸이 서로 다릅니다.', 'bad');
    try {
      await api('/api/admin/password', { method: 'POST', body: { current: pwCur.value, next: pwNew.value } });
      toast('비밀번호를 바꿨습니다.', 'ok');
      pwCur.value = pwNew.value = pwNew2.value = '';
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  const saveBtn = h('button', { type: 'button', class: 'btn btn-primary', onClick: save }, '설정 저장');
  clear(root,
    viewHead('실험 설정', '조건·콘텐츠를 고르면 라틴방격 배정표가 자동으로 만들어집니다.', saveBtn),
    section('접수',
      h('div', { class: 'panel' }, h('label', { class: 'switch' }, open, h('span', null, h('b', null, '실험 접수 열기'), ' — 끄면 실험자 화면에서 새 등록을 받지 않습니다.')))),
    section('실험 조건',
      h('div', { class: 'panel' },
        h('div', { class: 'choice-list' }, condBoxes),
        h('p', { class: 'muted small', style: { margin: '10px 0 0' } }, '사람 작성 AD(H)를 확보하지 못하면 끄세요. 조건 3개면 3×3 배정표가 됩니다.'))),
    section('실험 콘텐츠 (조건 수 × 파트당 콘텐츠 수)',
      h('div', { class: 'panel' },
        h('div', { class: 'form-grid', style: { marginBottom: '14px' } },
          field('파트당 콘텐츠 수', perPart, '한 파트(같은 조건)에서 연달아 보는 콘텐츠 수. 2면 위에서부터 2개씩 한 묶음이 되고, 배정표는 묶음 단위로 짭니다.')),
        contentList, h('div', { style: { marginTop: '14px' } }, preview))),
    section('연습 파트 (분석 제외)',
      h('div', { class: 'panel' },
        h('div', { class: 'form-grid' },
          field('연습 콘텐츠', practice, '본 파트 앞에 한 번 냅니다. 실험 콘텐츠와 달라야 하고, 응답은 분석·내보내기에서 빠집니다.'),
          field('연습 조건', practiceCond, '이 조건의 재생 파일이 연습 콘텐츠에 있어야 합니다.')))),
    section('진행 방식',
      h('div', { class: 'panel' },
        h('div', { class: 'choice-list' },
          h('label', { class: 'switch' }, shuffleQ, '참가자마다 문항 순서 섞기'),
          h('label', { class: 'switch' }, shuffleO, "참가자마다 보기 순서 섞기 ('알 수 없음'은 항상 마지막)"),
          h('label', { class: 'switch' }, postSurvey, '마지막 파트 뒤 사후 설문 (이어폰 사용·소음·방해·본 적 있는 영상·의견)'),
          h('label', { class: 'switch' }, showSubtitles, '재생 중 화면 아래 자막 (말은 흰색, AD 는 파란색 — 재생 파일에 자막을 올린 경우만)'),
          h('label', { class: 'switch' }, allowNotes, '메모 허용 (재생 중 화면 오른쪽, 문제 풀 때 문제 옆에 메모 칸. 결과 엑셀 「메모」 시트로 내보냄)'),
          h('label', { class: 'switch' }, allowReview, '문제 풀 때 다시 보기 허용 (첫 재생은 끝까지 한 번, 문제 화면에서 같은 조건의 영상·소리를 다시 재생·이동. 문항별 다시 본 횟수·초를 응답 자료에 남김)'),
          h('label', { class: 'switch' }, requireDesktop, 'PC·노트북만 허용 (가로 1024px 미만이거나 터치 전용 기기면 시작하지 못함)')),
        h('div', { class: 'form-grid', style: { marginTop: '16px' } },
          field('문항당 예상 시간(초)', perQ, '예상 소요 시간 계산에만 씁니다.'),
          field('완료 후 첫 화면 복귀(초)', doneSec),
          field('음량 테스트 파일', volume, '실험 음성과 비슷한 크기의 말소리 파일을 권장합니다.')))),
    section('안내 문구',
      h('div', { class: 'panel' },
        field('실험 방법 안내 (한 줄 = 한 항목)', intro, "'! ' 로 시작하는 줄은 「꼭 지켜 주세요」 상자, '? ' 로 시작하는 줄은 「문제에 답하는 방법」 상자에 들어갑니다. **굵게** 로 감싼 부분은 강조됩니다. 예상 소요 시간과 파트 수는 자동으로 위에 붙습니다. 조건 이름(SEEON 등)은 참가자에게 알리지 않는 것이 원칙입니다."),
        field('완료 문구', doneMsg))),
    section('동의서',
      h('div', { class: 'panel' },
        h('div', { class: 'notice warn', style: { marginBottom: '14px' } }, '초안입니다. 보유 기간·책임자 연락처 등을 팀(지도교수·IRB 기준)에 맞게 고친 뒤 판(버전)을 올리세요.'),
        field('동의서 판', consentVersion, '참가자 기록에 함께 저장됩니다.'),
        field('개인정보 수집·이용 동의', consent),
        field('민감정보(시각 장애 여부) 처리 동의', sensitive))),
    section('분류 목록',
      h('div', { class: 'panel' },
        field('도메인 (쉼표로 구분)', domains),
        field('부분 정보 이해도 소분류', catPart),
        field('통합 정보 이해도 소분류', catWhole))),
    section('관리자 비밀번호',
      h('div', { class: 'panel' },
        h('div', { class: 'form-grid' }, field('지금 비밀번호', pwCur), field('새 비밀번호 (8자 이상)', pwNew), field('새 비밀번호 확인', pwNew2)),
        h('button', { type: 'button', class: 'btn', onClick: changePassword }, '비밀번호 바꾸기'))),
    h('div', { class: 'btn-row end', style: { marginTop: '24px' } }, h('button', { type: 'button', class: 'btn btn-primary btn-lg', onClick: save }, '설정 저장')),
  );
  drawContentPickers();
}
