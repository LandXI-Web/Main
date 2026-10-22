/* 개인정보가 든 파일 내려받기(10-18 영농-q3 · 원칙 291 — "한번 이용 약속이 편하긴 한데. 개인정보가 있는건 확인까지 받고. 아닌건 그냥 받고??").
   규칙(서버 farm_admin.PERSONAL_RULE): 올린 대장의 필지별 내용(지번 · 대장 값)이 든 파일 = 개인정보가 든 파일.
     처음 한 번 이용 약속(사용 목적 · 활용 기간 — 서버에 누가 · 언제와 함께 기록) → 받을 때마다 확인 창 한 번. 기간이 끝나면 다시 약속.
     그 밖의 파일은 이 창 없이 바로 받는다(부르는 쪽이 이 함수를 쓰지 않음).
   personalFile(path, { name }) — path = API 경로(쿼리 포함) · 서버가 ok=1 을 보고 내준다. 받으면 true · 닫으면 false. */
import { api, h } from './util.js';
import { modal } from './modal.js';
import { toast } from './toast.js';

let css = false;
function style() {
  if (css) return; css = true;
  document.head.append(h('style', { text: `
.pl-md{display:flex;flex-direction:column;gap:16px}
.pl-md p{margin:0;font:400 var(--fs-body)/25px var(--font-body);color:var(--ink)}
.pl-md .pl-s{font:400 var(--fs-aux)/var(--lh-aux) var(--font-body);color:var(--sub)}
.pl-f{display:flex;flex-direction:column;gap:6px}
.pl-f .t-label{margin:0}
.pl-f .t-input{width:100%;box-sizing:border-box;min-width:0}
.pl-ck{display:flex;gap:10px;align-items:flex-start;font:400 var(--fs-aux)/var(--lh-aux) var(--font-body);color:var(--ink-2)}
.pl-ck input{margin-top:3px;flex:none}
.pl-dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:6px 16px;font:400 var(--fs-aux)/var(--lh-aux) var(--font-body)}
.pl-dl dt{color:var(--sub)} .pl-dl dd{margin:0;color:var(--ink)}
.pl-a{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
.pl-need{margin:0;min-height:0;font:500 var(--fs-aux)/var(--lh-aux) var(--font-body);color:var(--warn)}` }));
}
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dot = (s) => String(s || '').slice(0, 10).replace(/-/g, '.');

/** 개인정보 이용 확인 창(처음 · 기간 끝난 뒤) → 적으면 서버 값 · 닫으면 null */
function pledgeForm() {
  style();
  return new Promise((resolve) => {
    let got = null;
    const now = new Date();
    const max = new Date(now.getTime() + 365 * 864e5), def = new Date(now.getTime() + 90 * 864e5);
    const purpose = h('input.t-input', { type: 'text', maxlength: '200', placeholder: '예: 조사료 재배 지원 이행 점검', 'aria-label': '사용 목적', autocomplete: 'off' });
    const until = h('input.t-input', { type: 'date', min: ymd(now), max: ymd(max), value: ymd(def), 'aria-label': '활용 기간 끝나는 날' });
    const ck = h('input', { type: 'checkbox', 'aria-label': '사용 목적 · 활용 기간 확인' });
    const need = h('p.pl-need', { role: 'status' });
    const go = h('button.t-btn', { type: 'button', text: '확인하고 받기' });
    const no = h('button.t-btn.t-btn--2', { type: 'button', text: '닫기' });
    const m = modal({ title: '개인정보 이용 확인', body: h('div.pl-md', {},
      h('p', {}, '올린 대장의 필지별 내용(지번 · 대장 값)이 들어 있습니다.', h('br'), '처음 한 번 사용 목적과 활용 기간을 적어 주세요.'),
      h('label.pl-f', {}, h('span.t-label', { text: '사용 목적' }), purpose),
      h('label.pl-f', {}, h('span.t-label', { text: '활용 기간(끝나는 날)' }), until),
      h('label.pl-ck', {}, ck, h('span', {}, '적은 목적 · 기간 안에서만 쓰고,', h('br'), '기간이 끝나면 지웁니다.')),
      need, h('p.pl-s', {}, '누가 언제 받았는지 다운로드 이력에 남습니다.', h('br'), '기간 안에는 받을 때마다 확인만 합니다.'),
      h('div.pl-a', {}, no, go)), onClose: () => resolve(got) });
    no.addEventListener('click', () => m.close());
    go.addEventListener('click', async () => {
      if (purpose.value.trim().length < 2) { need.textContent = '사용 목적을 적어 주세요'; purpose.focus(); return; }
      if (!until.value) { need.textContent = '활용 기간을 골라 주세요'; until.focus(); return; }
      if (!ck.checked) { need.textContent = '확인란에 표시해 주세요'; ck.focus(); return; }
      go.disabled = true; need.textContent = '';
      try { const j = await api('/spaces/me/pledge', { method: 'POST', body: { purpose: purpose.value.trim(), until: until.value, agree: true } }); got = j.active; m.close(); }
      catch (e) { go.disabled = false; need.textContent = e.message || '지금은 저장할 수 없습니다'; }
    });
    setTimeout(() => purpose.focus(), 60);
  });
}

/** 받을 때마다 확인 → true · 닫으면 false */
function confirmBox(pl, name) {
  style();
  return new Promise((resolve) => {
    let ok = false;
    const go = h('button.t-btn', { type: 'button', text: '받기' });
    const no = h('button.t-btn.t-btn--2', { type: 'button', text: '닫기' });
    const m = modal({ title: '개인정보 이용 확인', body: h('div.pl-md', {},
      h('p', { text: name ? `${name}에는 올린 대장의 필지별 내용이 들어 있습니다.` : '올린 대장의 필지별 내용이 들어 있습니다.' }),
      h('dl.pl-dl', {}, h('dt', { text: '사용 목적' }), h('dd', { text: pl.purpose }), h('dt', { text: '활용 기간' }), h('dd', { text: `${dot(pl.until)}까지` })),
      h('p.pl-s', { text: '받은 기록(누가 · 언제 · 무엇을)이 다운로드 이력에 남습니다.' }),
      h('div.pl-a', {}, no, go)), onClose: () => resolve(ok) });
    no.addEventListener('click', () => m.close());
    go.addEventListener('click', () => { ok = true; m.close(); });
    setTimeout(() => go.focus(), 60);
  });
}

function save(blob, name) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = u; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}

export async function personalFile(path, { name = '', label = '' } = {}) {
  let pl = null;
  try { pl = (await api('/spaces/me/pledge')).active; } catch { pl = null; }
  if (!pl) { pl = await pledgeForm(); if (!pl) return false; }
  else if (!(await confirmBox(pl, label))) return false;
  const r = await api(path + (path.includes('?') ? '&' : '?') + 'ok=1', { raw: true });
  if (r.status === 409) {                              // 그사이 기간이 끝남 — 한 번 더 약속
    const again = await pledgeForm(); if (!again) return false;
    return personalFile(path, { name, label });
  }
  if (!r.ok) { const j = await r.json().catch(() => null); throw Object.assign(new Error(j?.error?.message || '내려받지 못했습니다'), { status: r.status }); }
  const m = /filename\*=UTF-8''([^;]+)/.exec(r.headers.get('content-disposition') || '');
  save(await r.blob(), m ? decodeURIComponent(m[1]) : name || '내려받기');
  toast('내려받았습니다');
  return true;
}
