import { createMap } from '../map/shell.js';
import { AuthState } from '../shell.js';
import { NotifyUI } from '../ui/dialog.js';

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;

const mapEl = document.getElementById('loginMap');
if (mapEl) createMap(mapEl, { mode: 'backdrop', globe: true, zoom: 2.4, interactive: false, tools: false, rulebar: false });

if (AuthState.isLoggedIn()) {
  const next = new URLSearchParams(location.search).get('next') || 'dashboard.html';
  location.replace(next);
}

const form = document.getElementById('loginForm');
const errorEl = document.querySelector('.login-error');
const card = document.querySelector('.login-card');

const savedEmail = localStorage.getItem('lx_saved_email');
if (savedEmail) { form.email.value = savedEmail; form.remember.checked = true; }

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const email = form.email.value.trim();
  const pw = form.pw.value;
  const emailField = form.email.closest('.field');
  const pwField = form.pw.closest('.field');
  emailField.classList.toggle('has-error', !email);
  pwField.classList.toggle('has-error', !pw);

  if (!email || !pw) {
    errorEl.textContent = '아이디(이메일)와 비밀번호를 입력해 주세요.';
    errorEl.hidden = false;
    return;
  }
  errorEl.hidden = true;

  AuthState.login();
  if (form.remember.checked) localStorage.setItem('lx_saved_email', email);
  else localStorage.removeItem('lx_saved_email');

  const next = new URLSearchParams(location.search).get('next') || 'dashboard.html';
  const go = () => { location.href = next; };
  if (REDUCE) { go(); return; }
  card.classList.add('is-leaving');
  setTimeout(go, 400);
});

document.querySelector('[data-action=find-id]')?.addEventListener('click', () => {
  NotifyUI.alert('등록하신 이메일로 아이디 찾기 안내를 보내드립니다. 확인이 어려우시면 고객센터(063-713-1213)로 문의해 주세요.', '아이디 찾기');
});
document.querySelector('[data-action=find-pw]')?.addEventListener('click', () => {
  NotifyUI.alert('가입하신 이메일 주소로 비밀번호 재설정 링크를 보내드립니다. 이메일을 입력한 뒤 다시 시도해 주세요.', '비밀번호 찾기');
});
