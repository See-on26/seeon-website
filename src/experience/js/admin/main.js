import { $, api, clear, h, toast } from '../common.js';
import * as analysis from './analysis.js';
import * as contents from './contents.js';
import * as dashboard from './dashboard.js';
import * as exportsView from './exports.js';
import * as media from './media.js';
import * as participants from './participants.js';
import * as quiz from './quiz.js';
import * as settings from './settings.js';
import { setUnauthorizedHandler } from './ui.js';
import { mountLogos } from '../logo.js';

mountLogos();

const ROUTES = [
  ['dashboard', '대시보드', dashboard],
  ['participants', '참가자', participants],
  ['contents', '콘텐츠·문항', contents],
  ['media', '미디어 파일', media],
  ['settings', '실험 설정', settings],
  ['analysis', '결과 분석', analysis],
  ['quiz', '체험 퀴즈', quiz],
  ['exports', '내보내기·백업', exportsView],
];

const loginBox = $('#login');
const shell = $('#shell');
const viewEl = $('#view');
const nav = $('#side-nav');
let cleanup = null;

function showLogin() {
  cleanup?.();
  cleanup = null;
  shell.hidden = true;
  loginBox.hidden = false;
  $('#login-password').value = '';
  $('#login-password').focus();
}

setUnauthorizedHandler(() => {
  if (!shell.hidden) toast('로그인이 만료되었습니다. 다시 로그인해 주세요.', 'bad');
  showLogin();
});

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#login-error');
  err.textContent = '';
  try {
    await api('/api/admin/login', { method: 'POST', body: { password: $('#login-password').value } });
    enter();
  } catch (e2) {
    err.textContent = e2.message;
  }
});

$('#logout').addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST', body: {} }).catch(() => {});
  showLogin();
});

function enter() {
  loginBox.hidden = true;
  shell.hidden = false;
  clear(nav, ROUTES.map(([id, label]) => h('a', { href: `#${id}`, dataset: { route: id } }, label)));
  route();
}

async function route() {
  if (shell.hidden) return;
  const id = location.hash.slice(1).split('?')[0] || 'dashboard';
  const found = ROUTES.find(([r]) => r === id) || ROUTES[0];
  for (const a of nav.querySelectorAll('a')) a.toggleAttribute('aria-current', a.dataset.route === found[0]);
  nav.querySelector(`a[data-route="${found[0]}"]`)?.setAttribute('aria-current', 'page');
  cleanup?.();
  cleanup = null;
  clear(viewEl, h('p', { class: 'muted' }, '불러오는 중…'));
  document.title = `${found[1]} · SEEON 관리자`;
  try {
    cleanup = (await found[2].render(viewEl)) || null;
  } catch (err) {
    if (err.status !== 401) clear(viewEl, h('div', { class: 'notice bad' }, err.message || String(err)));
  }
  viewEl.focus();
}

window.addEventListener('hashchange', route);

(async () => {
  try {
    await api('/api/admin/me');
    enter();
  } catch {
    showLogin();
  }
})();
