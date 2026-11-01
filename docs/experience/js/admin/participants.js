import { clear, confirmDialog, fmtAgo, fmtClock, fmtDateTime, fmtPct, h, modal, toast } from '../common.js';
import { adminApi, condChip, section, statusBadge, table, viewHead } from './ui.js';

const STAGE = { registered: '실험 안내', block: '파트 진행', survey: '사후 설문', done: '완료' };
const BLOCK = { pending: '시작 전', playing: '재생 중', answering: '문제 푸는 중', done: '끝남' };
const EVENT = {
  registered: '등록', intro_done: '안내 확인·실험 시작', media_start: '재생 시작', media_end: '재생 끝',
  completed: '완료', aborted: '중단', reset: '관리자 초기화', reregister_blocked: '재등록 시도(차단)',
  tab_hidden: '다른 창으로 전환', tab_visible: '실험 창으로 복귀', fullscreen_exit: '전체 화면 해제',
  pause_blocked: '일시정지 시도(막음)', seek_blocked: '되감기 시도(막음)', stall: '버퍼링',
  client_info: '접속 화면 크기', blocks_done: '모든 파트 끝(설문으로)',
};

const blockName = (b) => (b.practice ? '연습' : b.part != null ? `파트 ${b.part + 1}-${(b.slot ?? 0) + 1}` : `${b.position + 1}`);

export async function resetParticipant(p, onDone) {
  const done = p.status === 'completed';
  const reason = await confirmDialog({
    title: `${p.code} ${p.name} 초기화`,
    message: h('div', null,
      h('p', null, '초기화하면 이 사람이 같은 전화번호로 처음부터 다시 참여할 수 있습니다. 지금까지의 응답은 지우지 않고 「초기화됨」으로 남기며 분석에서는 뺍니다.'),
      done ? h('div', { class: 'notice bad' }, '이 참가자는 이미 실험을 완료했습니다. 완료 기록을 초기화하면 분석에서 빠집니다.') : null,
      h('div', { class: 'notice warn', style: { marginTop: '10px' } }, '이미 들은 콘텐츠가 있으면 다시 할 때 답을 알고 풀 수 있습니다. 다시 참여시킬지는 판단해 주세요.')),
    confirmLabel: '초기화',
    danger: true,
    input: { label: '사유 (기록용)', placeholder: '예: 새로 고침으로 중단', value: p.interrupted_reason || '' },
  });
  if (reason === false) return;
  try {
    await adminApi(`/participants/${p.id}/reset`, { method: 'POST', body: { reason } });
    toast(`${p.code} 초기화했습니다. 이제 다시 등록할 수 있습니다.`, 'ok');
    onDone?.();
  } catch (err) {
    toast(err.message, 'bad');
  }
}

async function deleteParticipant(p, onDone) {
  const ok = await confirmDialog({
    title: `${p.code} ${p.name} 영구 삭제`,
    message: '이 기록과 응답·이벤트를 DB에서 완전히 지웁니다. 되돌릴 수 없습니다. 테스트 기록을 정리할 때만 쓰세요.',
    confirmLabel: '영구 삭제',
    danger: true,
  });
  if (!ok) return;
  try {
    await adminApi(`/participants/${p.id}`, { method: 'DELETE' });
    toast('삭제했습니다.');
    onDone?.();
  } catch (err) {
    toast(err.message, 'bad');
  }
}

async function showDetail(id) {
  const d = await adminApi(`/participants/${id}`);
  const p = d.participant;
  const correct = d.responses.filter((r) => r.active && !r.practice && r.correct).length;
  const counted = d.responses.filter((r) => r.active && !r.practice).length;
  const blockOf = new Map(d.blocks.map((b) => [b.position, b]));
  const sv = d.survey;
  const kv = (pairs) => h('dl', { class: 'kv' }, pairs.flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v ?? '')]));
  modal({
    title: `${p.code} · ${p.name}`,
    wide: true,
    body: h('div', null,
      h('div', { class: 'grid-2' },
        kv([
          ['상태', statusBadge(p.status)],
          ['나이', `${p.age}세`],
          ['전화번호', p.phone],
          ['시각 장애', p.visual_impairment],
          ['동의', `${fmtDateTime(p.consent_at)} (판 ${p.consent_version})`],
        ]),
        kv([
          ['배정 행', `${p.latin_row + 1}행`],
          ['등록', fmtDateTime(p.created_at)],
          ['완료', fmtDateTime(p.completed_at)],
          ['중단', p.interrupted_at ? `${fmtDateTime(p.interrupted_at)} · ${p.interrupted_reason || ''}` : ''],
          ['초기화', p.reset_at ? `${fmtDateTime(p.reset_at)} · ${p.reset_reason || ''}` : ''],
          ['정답률', counted ? `${fmtPct(correct / counted)} (${correct}/${counted})` : '–'],
        ]),
      ),
      section('파트',
        table(
          [
            { label: '순서', render: (b) => b.position + 1 },
            { label: '파트', render: (b) => blockName(b) },
            { label: '조건', render: (b) => condChip(b.condition) },
            { label: '콘텐츠', render: (b) => `${b.content_code} ${b.content_title}` },
            { label: '상태', render: (b) => BLOCK[b.status] || b.status },
            { label: '재생 시간', class: 'num', render: (b) => (b.playedSec != null ? `${fmtClock(b.playedSec)} / ${fmtClock(b.duration_sec)}` : '') },
            { label: '문항', class: 'num', render: (b) => b.questionCount },
            { label: '메모', class: 'wrap', render: (b) => (b.notes ? h('span', { title: b.notes }, b.notes.length > 60 ? `${b.notes.slice(0, 60)}…` : b.notes) : '') },
          ],
          d.blocks,
        )),
      section('응답',
        table(
          [
            { label: '파트', render: (r) => blockName(blockOf.get(r.position) || r) },
            { label: '조건', render: (r) => condChip(r.condition, false) },
            { label: '문항', render: (r) => h('span', { title: r.stem }, r.questionCode) },
            { label: '고른 답', render: (r) => r.choiceText },
            { label: '정답', render: (r) => r.answerText },
            { label: '정오', render: (r) => (!r.active ? h('span', { class: 'badge mute' }, '문항 안 씀') : r.correct ? h('span', { class: 'badge ok' }, 'O') : h('span', { class: 'badge bad' }, 'X')) },
            { label: '응답 시간', class: 'num', render: (r) => (r.rtMs != null ? `${(r.rtMs / 1000).toFixed(1)}초` : '') },
          ],
          d.responses,
          { empty: '응답이 없습니다.' },
        )),
      sv
        ? section('사후 설문',
          kv([
            ['이어폰·헤드폰', sv.headphones],
            ['주변 소음', sv.noise],
            ['방해', sv.disturbed + (sv.disturbedDetail ? ` · ${sv.disturbedDetail}` : '')],
            ['본 적 있는 영상', (sv.seenBeforeCodes || []).join(', ') || '없음'],
            ['의견', sv.comment || ''],
          ]))
        : null,
      section('기록',
        table(
          [
            { label: '시각', render: (e) => fmtDateTime(e.at) },
            { label: '내용', render: (e) => EVENT[e.type] || e.type },
            { label: '세부', class: 'wrap', render: (e) => h('code', { class: 'small' }, e.detail || '') },
          ],
          d.events,
        )),
    ),
  });
}

export async function render(root) {
  let filter = 'all';
  let query = '';
  let rows = [];

  const listEl = h('div');
  const search = h('input', { type: 'search', placeholder: '이름·전화번호·코드 검색', 'aria-label': '검색' });
  const statusSel = h('select', { 'aria-label': '상태' },
    h('option', { value: 'all' }, '모든 상태'),
    h('option', { value: 'in_progress' }, '진행 중'),
    h('option', { value: 'completed' }, '완료'),
    h('option', { value: 'interrupted' }, '중단'),
    h('option', { value: 'reset' }, '초기화됨'));
  search.addEventListener('input', () => ((query = search.value.trim()), draw()));
  statusSel.addEventListener('change', () => ((filter = statusSel.value), draw()));

  const load = async () => {
    rows = (await adminApi('/participants')).participants;
    draw();
  };

  function draw() {
    const q = query.replace(/-/g, '');
    const list = rows.filter((p) => (filter === 'all' || p.status === filter) && (!q || `${p.code}${p.name}${p.phone.replace(/-/g, '')}`.includes(q)));
    clear(listEl,
      table(
        [
          { label: '코드', render: (p) => h('a', { href: '#', onClick: (e) => (e.preventDefault(), showDetail(p.id)) }, p.code) },
          { label: '이름', render: (p) => p.name },
          { label: '나이', class: 'num', render: (p) => p.age },
          { label: '전화번호', render: (p) => h('span', { class: 'nowrap' }, p.phone) },
          { label: '시각 장애', render: (p) => p.visual_impairment },
          { label: '상태', render: (p) => statusBadge(p.status) },
          {
            label: '진행',
            render: (p) =>
              p.status === 'completed' ? `${p.total_blocks}/${p.total_blocks} 영상`
                : p.stage === 'block' ? `영상 ${p.current_block + 1}/${p.total_blocks}` : STAGE[p.stage] || '',
          },
          { label: '배정', class: 'num', render: (p) => `${p.latin_row + 1}행` },
          { label: '정답률', class: 'num', render: (p) => (p.n_responses ? fmtPct(p.n_correct / p.n_responses) : '–') },
          { label: '등록', render: (p) => h('span', { class: 'nowrap' }, fmtDateTime(p.created_at)) },
          { label: '마지막 활동', render: (p) => fmtAgo(p.last_seen_at) },
          {
            label: '',
            class: 'actions',
            render: (p) => [
              h('button', { type: 'button', class: 'btn btn-sm', onClick: () => showDetail(p.id) }, '상세'),
              p.status !== 'reset' ? h('button', { type: 'button', class: 'btn btn-sm', onClick: () => resetParticipant(p, load) }, '초기화') : null,
              h('button', { type: 'button', class: 'btn btn-sm btn-danger', onClick: () => deleteParticipant(p, load) }, '삭제'),
            ],
          },
        ],
        list,
        { empty: rows.length ? '조건에 맞는 참가자가 없습니다.' : '아직 등록한 참가자가 없습니다.' },
      ),
      h('p', { class: 'muted small', style: { marginTop: '8px' } }, `${list.length}명 표시 · 전체 ${rows.length}건 (초기화 후 다시 참여하면 새 코드로 한 건 더 생깁니다)`),
    );
  }

  clear(
    root,
    viewHead('참가자', '인적사항과 진행 상태입니다. 중간에 멈춘 사람은 「초기화」해야 처음부터 다시 할 수 있습니다.'),
    h('div', { class: 'toolbar' }, search, statusSel, h('span', { class: 'grow' }), h('button', { type: 'button', class: 'btn btn-sm', onClick: load }, '새로 고침')),
    listEl,
  );
  await load();
  const id = new URLSearchParams(location.hash.split('?')[1] || '').get('id');
  if (id) showDetail(id).catch((err) => toast(err.message, 'bad'));
}
