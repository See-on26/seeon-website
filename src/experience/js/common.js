import { staticApi } from './static-api.js';

export class ApiError extends Error {
  constructor(status, data) {
    super(data?.message || `요청이 실패했습니다 (${status})`);
    this.status = status;
    this.data = data || {};
    this.code = data?.error;
  }
}

// 공개 사이트에는 평가 서버가 없으므로 static-api.js 가 서버 대신 답한다.
export async function api(path, { method = 'GET', body } = {}) {
  const { status, data } = await staticApi(path, { method, body });
  if (status >= 400) throw new ApiError(status, data);
  return data;
}

// 파일 올리기는 관리자 화면에서만 쓰고, 공개 사이트에서는 받지 않는다.
export function upload() {
  return Promise.reject(new ApiError(403, { message: '이 공개 사이트에서는 파일을 올릴 수 없습니다.' }));
}

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'value') value = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v);
  }
  append(el, children);
  if (value !== undefined) el.value = value;
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);

export function clear(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

export function fmtClock(sec) {
  if (sec == null || !Number.isFinite(sec)) return '--:--';
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fmtAgo(iso) {
  if (!iso) return '';
  const sec = (Date.now() - Date.parse(iso)) / 1000;
  if (sec < 60) return '방금';
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
  return fmtDateTime(iso);
}

export const fmtPct = (v, digits = 1) => (v == null ? '–' : `${(v * 100).toFixed(digits)}%`);

export function fmtBytes(n) {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

let toastWrap;
export function toast(message, type = '') {
  if (!toastWrap) {
    toastWrap = h('div', { class: 'toast-wrap', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastWrap);
  }
  const t = h('div', { class: `toast ${type}` }, message);
  toastWrap.append(t);
  setTimeout(() => t.remove(), type === 'bad' ? 6000 : 3200);
}

// <dialog> 기반 모달. actions: [{label, class, onClick(close) → false면 닫지 않음}]
export function modal({ title, body, actions = [], wide = false, onClose }) {
  const dlg = h('dialog', { class: `modal${wide ? ' wide' : ''}`, 'aria-label': title });
  const close = () => dlg.close();
  const foot = h('div', { class: 'modal-foot' }, h('div', { class: 'btn-row end' },
    actions.map((a) =>
      h('button', {
        type: 'button',
        class: `btn ${a.class || ''}`,
        onClick: async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          try {
            const keep = await a.onClick?.(close);
            if (keep !== false) close();
          } finally {
            btn.disabled = false;
          }
        },
      }, a.label),
    ),
  ));
  dlg.append(
    h('div', { class: 'modal-head' }, h('h2', null, title), h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: close, 'aria-label': '닫기' }, '✕')),
    h('div', { class: 'modal-body' }, body),
  );
  if (actions.length) dlg.append(foot);
  dlg.addEventListener('close', () => {
    dlg.remove();
    onClose?.();
  });
  document.body.append(dlg);
  dlg.showModal();
  return { dialog: dlg, close };
}

export function confirmDialog({ title, message, confirmLabel = '확인', danger = false, input }) {
  return new Promise((resolve) => {
    let settled = false;
    const field = input ? h('input', { type: 'text', placeholder: input.placeholder || '', value: input.value || '' }) : null;
    modal({
      title,
      body: h('div', null, typeof message === 'string' ? h('p', { style: { whiteSpace: 'pre-wrap' } }, message) : message,
        field ? h('div', { class: 'field' }, input.label ? h('label', null, input.label) : null, field) : null),
      actions: [
        { label: '취소', onClick: () => {} },
        {
          label: confirmLabel,
          class: danger ? 'btn-danger' : 'btn-primary',
          onClick: () => {
            settled = true;
            resolve(field ? field.value : true);
          },
        },
      ],
      onClose: () => !settled && resolve(false),
    });
  });
}

// 미디어 파일 길이(초)를 브라우저에서 읽는다
export function probeDuration(src) {
  return new Promise((resolve) => {
    const el = document.createElement('video');
    el.preload = 'metadata';
    let finished = false;
    const done = (v) => {
      if (finished) return;
      finished = true;
      el.removeAttribute('src');
      el.load();
      resolve(v);
    };
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? el.duration : null);
    el.onerror = () => done(null);
    setTimeout(() => done(null), 15000);
    el.src = src;
  });
}
