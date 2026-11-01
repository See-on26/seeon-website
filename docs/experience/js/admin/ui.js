import { api, ApiError, h } from '../common.js';

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn);

export async function adminApi(path, opts) {
  try {
    return await api(`/api/admin${path}`, opts);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) onUnauthorized();
    throw err;
  }
}

export const CONDITION_INFO = {
  A: { short: '음성만', screen: false },
  S: { short: '음성 + SEEON AD', screen: false },
  H: { short: '음성 + 사람 AD', screen: false },
  C: { short: '음성 + 화면', screen: true },
};

export const condChip = (c, withText = true) =>
  h('span', { class: 'cond-chip', title: CONDITION_INFO[c]?.short },
    h('span', { class: `c${CONDITION_INFO[c]?.screen ? ' screen' : ''}` }, c),
    withText ? h('span', null, CONDITION_INFO[c]?.short) : null);

const STATUS = {
  in_progress: ['진행 중', 'info'],
  completed: ['완료', 'ok'],
  interrupted: ['중단', 'bad'],
  reset: ['초기화됨', 'mute'],
};
export const statusBadge = (s) => h('span', { class: `badge ${STATUS[s]?.[1] || ''}` }, STATUS[s]?.[0] || s);
export const statusLabel = (s) => STATUS[s]?.[0] || s;

export function viewHead(title, desc, ...actions) {
  return h('div', { class: 'view-head' },
    h('div', null, h('h1', null, title), desc ? h('p', null, desc) : null),
    actions.length ? h('div', { class: 'btn-row' }, actions) : null);
}

export function section(title, ...children) {
  return h('section', { class: 'section' }, title ? h('h2', null, title) : null, ...children);
}

// columns: [{label, render(row) → node|string, class}]
export function table(columns, rows, { empty = '자료가 없습니다.', rowClass } = {}) {
  if (!rows.length) return h('div', { class: 'table-wrap' }, h('div', { class: 'empty' }, empty));
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, columns.map((c) => h('th', { class: c.class || '', scope: 'col' }, c.label)))),
      h('tbody', null, rows.map((r) => h('tr', { class: rowClass?.(r) || '' }, columns.map((c) => h('td', { class: c.class || '' }, c.render(r))))))));
}

export function field(label, control, hint) {
  const id = control.id || `f-${Math.random().toString(36).slice(2, 9)}`;
  control.id = id;
  return h('div', { class: 'field' }, h('label', { for: id }, label), control, hint ? h('span', { class: 'hint' }, hint) : null);
}

export function mediaLabel(m) {
  return m ? `#${m.id} ${m.label || m.original_name}` : '';
}

// 미디어 라이브러리에서 고르는 select
export function mediaSelect(media, value, { kind, allowEmpty = true, emptyLabel = '— 선택 안 함 —' } = {}) {
  const list = kind ? media.filter((m) => m.kind === kind || kind === 'any') : media;
  return h('select', { value: value == null ? '' : String(value) },
    allowEmpty ? h('option', { value: '' }, emptyLabel) : null,
    list.map((m) => h('option', { value: String(m.id) }, `${mediaLabel(m)}${m.duration_sec ? ` (${Math.round(m.duration_sec / 60 * 10) / 10}분)` : ''}`)));
}

export const yesNo = (v) => (v ? h('span', { class: 'badge ok' }, '사용') : h('span', { class: 'badge mute' }, '안 씀'));
