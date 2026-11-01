import { clear, confirmDialog, fmtBytes, fmtClock, fmtDateTime, h, probeDuration, toast, upload } from '../common.js';
import { adminApi, section, table, viewHead } from './ui.js';

const ACCEPT = '.mp4,.webm,.mov,.m4v,.mp3,.wav,.m4a,.aac,.ogg,.oga,.flac';

export async function render(root) {
  const listEl = h('div');
  const queueEl = h('div', { class: 'upload-list' });
  const picker = h('input', { type: 'file', accept: ACCEPT, multiple: true, hidden: true });
  const drop = h('div', { class: 'dropzone' },
    h('p', { style: { margin: '0 0 10px', fontWeight: 600 } }, '영상·오디오 파일을 여기로 끌어 놓거나'),
    h('button', { type: 'button', class: 'btn btn-primary', onClick: () => picker.click() }, '파일 고르기'),
    h('p', { class: 'muted small', style: { margin: '10px 0 0' } }, 'mp4·webm·mov / mp3·wav·m4a·aac·ogg·flac · 여러 개를 한 번에 올릴 수 있습니다'),
    picker);

  drop.addEventListener('dragover', (e) => (e.preventDefault(), drop.classList.add('over')));
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    send([...e.dataTransfer.files]);
  });
  picker.addEventListener('change', () => {
    send([...picker.files]);
    picker.value = '';
  });

  async function send(files) {
    for (const file of files) {
      const bar = h('div');
      const pct = h('span', { class: 'num small' }, '0%');
      const row = h('div', { class: 'upload-row' }, h('span', { class: 'clip' }, file.name), h('div', { class: 'progress' }, bar), pct);
      queueEl.append(row);
      const url = URL.createObjectURL(file);
      const duration = await probeDuration(url);
      URL.revokeObjectURL(url);
      const fd = new FormData();
      if (duration) fd.append('duration', String(duration));
      fd.append('file', file);
      try {
        await upload('/api/admin/media', fd, (p) => {
          bar.style.width = `${Math.round(p * 100)}%`;
          pct.textContent = `${Math.round(p * 100)}%`;
        });
        pct.textContent = '완료';
      } catch (err) {
        pct.textContent = '실패';
        toast(`${file.name}: ${err.message}`, 'bad');
      }
    }
    await load();
    setTimeout(() => clear(queueEl), 2500);
  }

  async function rename(m) {
    const label = await confirmDialog({ title: '이름 붙이기', message: m.original_name, confirmLabel: '저장', input: { label: '표시 이름', value: m.label } });
    if (label === false) return;
    await adminApi(`/media/${m.id}`, { method: 'PATCH', body: { label } });
    await load();
  }

  async function reprobe(m) {
    const d = await probeDuration(`/api/admin/media/${m.id}/file`);
    if (!d) return toast('길이를 읽지 못했습니다. 브라우저가 재생할 수 있는 형식인지 확인하세요.', 'bad');
    await adminApi(`/media/${m.id}`, { method: 'PATCH', body: { durationSec: d } });
    await load();
  }

  async function remove(m) {
    const ok = await confirmDialog({ title: '파일 삭제', message: `${m.original_name}\n\n파일을 지웁니다. 콘텐츠·퀴즈·응답 기록이 쓰고 있는 파일은 지울 수 없습니다.`, confirmLabel: '삭제', danger: true });
    if (!ok) return;
    try {
      await adminApi(`/media/${m.id}`, { method: 'DELETE' });
      toast('삭제했습니다.');
      await load();
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  async function load() {
    const { media } = await adminApi('/media');
    clear(listEl,
      table(
        [
          { label: '#', class: 'num', render: (m) => m.id },
          { label: '이름', render: (m) => h('div', null, h('div', null, m.label || m.original_name), m.label ? h('div', { class: 'muted small' }, m.original_name) : null) },
          { label: '종류', render: (m) => (m.kind === 'video' ? '영상' : '오디오') },
          { label: '길이', class: 'num', render: (m) => (m.duration_sec ? fmtClock(m.duration_sec) : h('button', { type: 'button', class: 'btn btn-sm', onClick: () => reprobe(m) }, '길이 읽기')) },
          { label: '크기', class: 'num', render: (m) => fmtBytes(m.size) },
          { label: '쓰는 곳', class: 'wrap', render: (m) => (m.usage.length ? m.usage.join(', ') : h('span', { class: 'muted' }, '없음')) },
          { label: '올린 시각', render: (m) => h('span', { class: 'nowrap' }, fmtDateTime(m.created_at)) },
          {
            label: '', class: 'actions',
            render: (m) => [
              h('a', { class: 'btn btn-sm', href: `/api/admin/media/${m.id}/file`, target: '_blank' }, '재생'),
              h('a', { class: 'btn btn-sm', href: `/api/admin/media/${m.id}/file?download=1` }, '다운로드'),
              h('button', { type: 'button', class: 'btn btn-sm', onClick: () => rename(m) }, '이름'),
              h('button', { type: 'button', class: 'btn btn-sm btn-danger', onClick: () => remove(m) }, '삭제'),
            ],
          },
        ],
        media,
        { empty: '올린 파일이 없습니다.' },
      ));
  }

  clear(root,
    viewHead('미디어 파일', '실험·퀴즈에 쓸 영상과 오디오를 올립니다. 올린 뒤 「콘텐츠·문항」이나 「체험 퀴즈」에서 고릅니다.'),
    drop,
    queueEl,
    section('올린 파일', listEl),
    h('p', { class: 'muted small' }, '길이는 실험 예상 시간과 진행 막대에 씁니다. 파일은 서버 컴퓨터의 data/uploads 폴더에 저장됩니다. 다운로드는 관리자만 할 수 있고, 실험자·일반객은 진행 중인 파트·퀴즈 화면 안에서만 재생할 수 있습니다.'));
  await load();
}
