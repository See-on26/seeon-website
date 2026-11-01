import { clear, fmtPct, h } from '../common.js';
import { adminApi, CONDITION_INFO, condChip, section, table, viewHead } from './ui.js';

const GROUPINGS = [
  ['byUnit', '도메인 × 대분류 × 소분류', [['domain', '도메인'], ['major', '대분류'], ['minor', '소분류']]],
  ['byDomain', '도메인', [['domain', '도메인']]],
  ['byMajor', '대분류 (부분 / 통합)', [['major', '대분류']]],
  ['byMinor', '소분류', [['major', '대분류'], ['minor', '소분류']]],
  ['byLanguage', '언어', [['language', '언어']]],
];

const ratio = (v) => (v == null ? '–' : v.toFixed(3));
const cellCa = (c) => (c && c.n ? h('span', null, fmtPct(c.ca), h('span', { class: 'muted small' }, ` (${c.n})`)) : h('span', { class: 'muted' }, '–'));

// 조건별 정답률 막대. 계열이 하나라 범례는 두지 않고, 막대 끝에 값을 적는다.
function barChart(conds, byCond) {
  const tip = h('div', { class: 'chart-tip', hidden: true, role: 'tooltip' });
  const wrap = h('div', { class: 'bars', role: 'img', 'aria-label': `조건별 정답률: ${conds.map((c) => `${c} ${fmtPct(byCond[c]?.ca)}`).join(', ')}` });
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  for (const c of conds) {
    const cell = byCond[c] || {};
    const w = cell.ca == null ? 0 : cell.ca * 100;
    const row = h('div', { class: 'bar-row', tabindex: '0' },
      h('span', { class: 'bar-label' }, `${c} · ${CONDITION_INFO[c].short}`),
      h('div', { class: 'bar-plot' },
        ticks.map((t) => h('span', { class: 'bar-grid', style: { left: `${t * 100}%` } })),
        cell.ca == null ? null : h('div', { class: `bar${c === 'S' ? ' accent' : ''}`, style: { width: `${w}%` } }),
        h('span', { class: 'bar-value', style: { left: `calc(${w}% + 8px)` } }, cell.ca == null ? '자료 없음' : fmtPct(cell.ca))));
    const show = () => {
      tip.replaceChildren(
        h('b', null, `${c} · ${CONDITION_INFO[c].short}`), h('br'),
        `정답률 ${fmtPct(cell.ca)} · 정답 ${cell.correct ?? 0} / 응답 ${cell.n ?? 0}`, h('br'),
        `알 수 없음 ${fmtPct(cell.unknownRate)}`);
      tip.hidden = false;
      const r = row.getBoundingClientRect();
      const plot = row.querySelector('.bar-plot').getBoundingClientRect();
      const base = wrap.getBoundingClientRect();
      const x = plot.left - base.left + (plot.width * w) / 100;
      tip.style.top = `${r.bottom - base.top + 4}px`;
      tip.style.left = `${Math.max(0, Math.min(base.width - tip.offsetWidth - 4, x - 20))}px`;
    };
    const hide = () => (tip.hidden = true);
    row.addEventListener('mouseenter', show);
    row.addEventListener('focus', show);
    row.addEventListener('mouseleave', hide);
    row.addEventListener('blur', hide);
    wrap.append(row);
  }
  wrap.append(
    h('div', { class: 'bar-axis', 'aria-hidden': 'true' }, h('span'),
      h('div', { class: 'ticks' }, ticks.map((t) => h('span', { style: { left: `${t * 100}%` } }, `${t * 100}%`)))),
    tip,
  );
  return wrap;
}

export async function render(root) {
  const filters = { language: '', domain: '', visual: '' };
  let grouping = 'byUnit';
  const body = h('div');

  const query = () => new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();

  async function load() {
    const d = await adminApi(`/analysis?${query()}`);
    const conds = d.conditions;
    const o = d.overall;
    const has = (c) => o.byCond[c]?.n > 0;

    const domainSel = h('select', { value: filters.domain },
      h('option', { value: '' }, '전체'), d.domains.map((x) => h('option', { value: x }, x)));
    const langSel = h('select', { value: filters.language },
      h('option', { value: '' }, '전체'), h('option', { value: 'en' }, '영어'), h('option', { value: 'ko' }, '한국어'));
    const visualSel = h('select', { value: filters.visual },
      h('option', { value: '' }, '전체'), h('option', { value: 'none' }, '없음'), h('option', { value: 'impaired' }, '있음'));
    for (const [sel, key] of [[domainSel, 'domain'], [langSel, 'language'], [visualSel, 'visual']]) {
      sel.addEventListener('change', () => {
        filters[key] = sel.value;
        load();
      });
    }

    const groupSel = h('select', { value: grouping, 'aria-label': '묶음 기준' }, GROUPINGS.map(([k, label]) => h('option', { value: k }, label)));
    groupSel.addEventListener('change', () => {
      grouping = groupSel.value;
      load();
    });
    const [gKey, , gFields] = GROUPINGS.find((g) => g[0] === grouping);
    const groupRows = d[gKey];
    const showAR = conds.includes('H');

    const metricCols = [
      ...conds.map((c) => ({ label: h('span', null, condChip(c, false), ' 정답률'), class: 'num', render: (g) => cellCa(g.byCond[c]) })),
      { label: '도달률 S/C', class: 'num', render: (g) => fmtPct(g.reach) },
      { label: '증가폭 (S−A)/C', class: 'num', render: (g) => h('b', null, fmtPct(g.gain)) },
      ...(showAR ? [{ label: 'AR (S−A)/(H−A)', class: 'num', render: (g) => ratio(g.accuracyRatio) }] : []),
    ];

    const missing = ['A', 'S', 'C'].filter((c) => !has(c));
    clear(body,
      h('div', { class: 'filters', role: 'group', 'aria-label': '필터' },
        h('label', null, '언어', langSel), h('label', null, '도메인', domainSel), h('label', null, '시각 장애', visualSel),
        h('span', { class: 'muted small' }, `완료 참가자 ${d.participants}명 · 응답 ${d.responses}개`)),
      d.responses === 0
        ? h('div', { class: 'panel empty' }, '아직 집계할 응답이 없습니다. 실험을 완료한 참가자가 생기면 자동으로 계산됩니다.')
        : [
            h('div', { class: 'panel hero-panel' },
              h('div', null,
                h('div', { class: 't-label muted' }, '도달률 증가폭 (S − A) ÷ C'),
                h('div', { class: 'hero-figure' }, fmtPct(o.gain)),
                h('p', { class: 'formula', style: { margin: '6px 0 0' } },
                  missing.length ? `${missing.join('·')} 조건 응답이 없어 계산할 수 없습니다.`
                    : `화면을 본 경우(C ${fmtPct(o.byCond.C.ca)}) 대비, SEEON AD(S ${fmtPct(o.byCond.S.ca)})가 음성만(A ${fmtPct(o.byCond.A.ca)})보다 끌어올린 이해 수준`)),
              h('div', { class: 'tiles' },
                h('div', { class: 'tile' }, h('div', { class: 't-label' }, '도달률 S ÷ C'), h('div', { class: 't-value' }, fmtPct(o.reach)), h('div', { class: 't-sub' }, '화면을 본 경우 대비 이해 수준')),
                showAR ? h('div', { class: 'tile' }, h('div', { class: 't-label' }, 'Accuracy Ratio'), h('div', { class: 't-value' }, ratio(o.accuracyRatio)), h('div', { class: 't-sub' }, '(S − A) ÷ (H − A), 사람 AD 대비')) : null,
                h('div', { class: 'tile' }, h('div', { class: 't-label' }, '알 수 없음 (S)'), h('div', { class: 't-value' }, fmtPct(o.byCond.S?.unknownRate)), h('div', { class: 't-sub' }, `A ${fmtPct(o.byCond.A?.unknownRate)} · C ${fmtPct(o.byCond.C?.unknownRate)}`)))),
            section('조건별 정답률 (CA)',
              h('div', { class: 'panel' }, barChart(conds, o.byCond)),
              h('div', { style: { marginTop: '12px' } },
                table(
                  [
                    { label: '조건', render: (c) => condChip(c) },
                    { label: '응답 수', class: 'num', render: (c) => o.byCond[c]?.n ?? 0 },
                    { label: '정답 수', class: 'num', render: (c) => o.byCond[c]?.correct ?? 0 },
                    { label: '정답률', class: 'num', render: (c) => fmtPct(o.byCond[c]?.ca) },
                    { label: '알 수 없음', class: 'num', render: (c) => fmtPct(o.byCond[c]?.unknownRate) },
                  ],
                  conds,
                ))),
            h('section', { class: 'section' },
              h('div', { class: 'section-head' }, h('h2', null, '나눠 보기'), h('label', { class: 'small' }, '묶음 기준 ', groupSel)),
              table([...gFields.map(([k, label]) => ({ label, render: (g) => (k === 'language' ? (g[k] === 'ko' ? '한국어' : '영어') : g[k] || '–') })), ...metricCols], groupRows)),
            section('문항별 (난이도 확인용)',
              table(
                [
                  { label: '문항', render: (g) => h('span', { title: g.stem }, g.question_code) },
                  { label: '콘텐츠', render: (g) => g.content_code },
                  { label: '분류', render: (g) => h('span', { class: 'nowrap' }, `${g.major} · ${g.minor}`) },
                  ...conds.map((c) => ({ label: c, class: 'num', render: (g) => cellCa(g.byCond[c]) })),
                ],
                d.byQuestion,
              )),
            section('참가자별',
              table(
                [
                  { label: '참가자', render: (g) => g.participant_code },
                  { label: '시각 장애', render: (g) => g.visual_impairment },
                  ...conds.map((c) => ({ label: c, class: 'num', render: (g) => cellCa(g.byCond[c]) })),
                  { label: '전체', class: 'num', render: (g) => fmtPct(g.total.ca) },
                ],
                d.byParticipant,
              )),
          ],
      h('p', { class: 'muted small', style: { marginTop: '18px' } },
        "완료한 참가자의 응답과 사용 중인 문항만 집계합니다. '알 수 없음'은 오답입니다. 괄호 안은 응답 수입니다. 혼합효과 모형(3장 LLM–사람 검증)은 「내보내기·백업」의 문항 단위 CSV로 계산합니다."),
      h('div', { class: 'btn-row' },
        h('a', { class: 'btn btn-sm', href: `/api/admin/export/results.xlsx?${query()}` }, '이 결과 엑셀로 받기'),
        h('a', { class: 'btn btn-sm', href: `/api/admin/export/responses.csv?${query()}` }, '문항 단위 응답 CSV')),
    );
  }

  clear(root, viewHead('결과 분석', 'Confluence 「성능 평가 방식」 2.4 지표를 자동으로 계산합니다.'), body);
  await load();
}
