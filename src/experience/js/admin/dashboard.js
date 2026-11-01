import { clear, fmtAgo, h } from '../common.js';
import { resetParticipant } from './participants.js';
import { adminApi, condChip, section, statusBadge, table, viewHead } from './ui.js';

const STAGE = { registered: '실험 안내', block: '파트 진행', survey: '사후 설문', done: '완료' };
const BLOCK = { pending: '시작 전', playing: '재생 중', answering: '문제 푸는 중', done: '끝남' };

export async function render(root) {
  let timer;
  const load = async () => {
    const d = await adminApi('/overview');
    const tile = (label, value, sub, cls = '') =>
      h('div', { class: `tile ${cls}` }, h('div', { class: 't-label' }, label), h('div', { class: 't-value' }, value), sub ? h('div', { class: 't-sub' }, sub) : null);
    const ready = d.readiness;

    clear(
      root,
      viewHead('대시보드', '실험 준비 상태와 지금 진행 중인 참가자를 봅니다. 10초마다 새로 고칩니다.'),
      h('div', { class: 'tiles' },
        tile('완료', d.counts.completed || 0, '분석에 들어가는 인원', 'hero'),
        tile('진행 중', d.counts.in_progress || 0),
        tile('중단', d.counts.interrupted || 0, '초기화해야 다시 참여 가능'),
        tile('초기화됨', d.counts.reset || 0),
        tile('체험 퀴즈', d.quiz.answered || 0, `오늘 ${d.quiz.today || 0}회 시작`),
      ),
      section('실험 준비 상태',
        h('div', { class: 'panel' },
          h('ul', { class: 'checklist' },
            h('li', { class: ready.open ? 'ok' : 'bad' }, h('span', { class: 'mark' }, ready.open ? '✓' : '✕'), ready.open ? '실험 접수 중' : '실험 접수가 닫혀 있습니다 (실험 설정에서 열 수 있음)'),
            ready.ok
              ? h('li', { class: 'ok' }, h('span', { class: 'mark' }, '✓'), '조건·콘텐츠·재생 파일·문항이 모두 준비되었습니다.')
              : ready.issues.map((msg) => h('li', { class: 'bad' }, h('span', { class: 'mark' }, '✕'), msg)),
          ))),
      section('진행 중·중단된 참가자',
        table(
          [
            { label: '코드', render: (p) => h('a', { href: `#participants?id=${p.id}` }, p.code) },
            { label: '이름', render: (p) => p.name },
            { label: '상태', render: (p) => statusBadge(p.status) },
            {
              label: '위치',
              render: (p) =>
                p.status === 'interrupted'
                  ? p.interrupted_reason || ''
                  : p.stage === 'block'
                    ? `영상 ${p.current_block + 1}/${p.total_blocks} · ${BLOCK[p.block_status] || ''}`
                    : STAGE[p.stage] || p.stage,
            },
            { label: '마지막 활동', render: (p) => fmtAgo(p.status === 'interrupted' ? p.interrupted_at : p.last_seen_at) },
            {
              label: '',
              class: 'actions',
              render: (p) => h('button', { type: 'button', class: 'btn btn-sm', onClick: () => resetParticipant(p, load) }, '초기화'),
            },
          ],
          d.live,
          { empty: '진행 중이거나 중단된 참가자가 없습니다.' },
        )),
      section(`배정표 (라틴방격 ${d.design.length}행)`,
        d.design.length
          ? table(
              [
                { label: '행', render: (r) => `${r.row + 1}행` },
                ...d.design[0].cells.map((_, i) => ({
                  label: `${i + 1}번째 파트`,
                  render: (r) => h('span', null, condChip(r.cells[i].condition, false), ' ', r.cells[i].contentCode),
                })),
                { label: '완료', class: 'num', render: (r) => r.completed },
                { label: '진행 중', class: 'num', render: (r) => r.inProgress },
              ],
              d.design,
            )
          : h('div', { class: 'notice warn' }, '실험 설정에서 조건과 콘텐츠를 같은 개수로 골라야 배정표가 만들어집니다.'),
        h('p', { class: 'muted small', style: { marginTop: '8px' } }, '새 참가자는 완료·진행 중 인원이 가장 적은 행에 배정됩니다. 중단·초기화된 기록은 세지 않습니다.')),
    );
  };
  await load();
  timer = setInterval(() => load().catch(() => {}), 10000);
  return () => clearInterval(timer);
}
