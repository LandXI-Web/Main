/* 보안 서약서 — 내보내기(지도) · 엑셀 다운로드(통계 · 보고서)가 같은 모달을 쓴다.
   원판 B7-Map-Pledge · B7-Map-Pledge-Busy · B7-Map-Download · B7-Report-Pledge.
   서약문 · 검증 문구는 원본 그대로. 모달·포커스 가둠·토스트는 셸(shell.js)이 한다. */
import { openModal, icon, esc, nf, $ } from './shell.js';
import * as D from './map-data.js';

export function openPledge({ targets = [], title = '보안 서약서', kind = '내보내기', onDone } = {}) {
  const t0 = D.today(), t1 = D.plusMonth(t0, 1);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const m = openModal({
    title, width: 640,
    content: `
${targets.length ? `<div class="pl-targets"><p class="t">내보낼 대상 · 켜 둔 결과 레이어 ${targets.length}</p>
  <ul>${targets.map((l) => `<li><img src="${esc(l.thumb)}" alt="">${esc(l.title)}<b class="n">${nf.format(l.count)} ${esc(l.unit)}</b></li>`).join('')}</ul></div>` : ''}
<p class="mic" style="margin:0 0 12px">다운로드를 받기 위해서는 해당 내용에 대한 동의가 필요합니다.</p>
<div class="pl-text">${esc(D.PLEDGE_TEXT)}</div>
<p class="pl-who">신청자 : 관리자 님</p>
<div class="pl-bar" id="pl-bar" hidden><i></i></div>
<div class="form">
  <div class="field field--12"><label class="ck"><input type="checkbox" id="pl-ok" aria-describedby="pl-ok-e"><span class="pl-req">[필수]</span>&nbsp;위 보안 서약 내용에 동의합니다.</label><p class="err" id="pl-ok-e" hidden>${esc(D.PLEDGE_ERR.agree)}</p></div>
  <div class="field field--12"><div class="field-h"><label class="field-l" for="pl-name">요청명<em class="req">*</em></label></div>
    <input id="pl-name" class="inp" maxlength="60" aria-describedby="pl-name-e" placeholder="예) 금지면 비닐하우스 현황 점검"><p class="err" id="pl-name-e" hidden>${esc(D.PLEDGE_ERR.name)}</p></div>
  <div class="field field--12"><div class="field-h"><label class="field-l" for="pl-from">활용 기간<em class="req">*</em></label></div>
    <div class="field-row"><input id="pl-from" class="inp" type="date" value="${iso(t0)}" aria-label="활용 시작일"><span class="tilde">~</span><input id="pl-to" class="inp" type="date" value="${iso(t1)}" aria-label="활용 종료일"><span class="mic">기본 = 오늘부터 1개월</span></div></div>
  <div class="field field--12"><div class="field-h"><label class="field-l" for="pl-purpose">사용 목적<em class="req">*</em></label></div>
    <input id="pl-purpose" class="inp" maxlength="80" aria-describedby="pl-purpose-e" placeholder="예) 포트홀 긴급 보수 우선순위 선정"><p class="err" id="pl-purpose-e" hidden>${esc(D.PLEDGE_ERR.purpose)}</p></div>
</div>`,
    actions: [
      { label: '취소', kind: 'bracket' },
      { label: kind === '엑셀' ? '엑셀 다운로드' : '다운로드 실행', kind: 'primary', onClick: () => run() },
    ],
  });

  function bad(id, on) {
    const err = $('#' + id + '-e', m.el), inp = $('#' + id, m.el);
    err.hidden = !on; inp.setAttribute('aria-invalid', String(!!on));
    inp.setAttribute('aria-describedby', id + '-e');
    return on;
  }
  function run() {
    const ok = $('#pl-ok', m.el).checked, name = $('#pl-name', m.el).value.trim(), purpose = $('#pl-purpose', m.el).value.trim();
    const e1 = bad('pl-ok', !ok), e2 = bad('pl-name', !name), e3 = bad('pl-purpose', !purpose);
    if (e1 || e2 || e3) { $(e1 ? '#pl-ok' : e2 ? '#pl-name' : '#pl-purpose', m.el).focus(); return false; }
    const btn = $('.modal-f .btn', m.el);
    $('#pl-bar', m.el).hidden = false;
    if (btn) btn.textContent = '생성 중…';
    $$disable(m.el, true);
    setTimeout(() => {
      m.close(true);
      onDone?.({ name, purpose, from: $('#pl-from', m.el).value.replace(/-/g, '.'), to: $('#pl-to', m.el).value.replace(/-/g, '.'), targets });
    }, 620);
    return false;
  }
  function $$disable(root, on) { root.querySelectorAll('input,button,select').forEach((el) => { if (!el.classList.contains('modal-x')) el.disabled = on; }); }
  $('#pl-ok', m.el)?.focus();
  void icon;
  return m;
}
