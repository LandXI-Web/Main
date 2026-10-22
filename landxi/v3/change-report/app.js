/* change-report — 국토 변화 탐지 보고서 미리보기(10-22 CHANGE-DEMO-ORDER P1-6 · §7 7단계). 개조식 — 구간 개요 → 변화 요약(유형 · 안/밖 · 판정)
   → 필지별 목록 → 근거 영상(두 해 썸네일) → 권고 조치. 'PDF 내려받기'는 서버가 같은 내용으로 만든 PDF(GET /change/runs/{결과}/report.pdf).
   값 = 서버 한 출처(GET /change/runs/{결과}/report.json — 결과 파일 · 판정 기록). 주소 ?job=<결과>. LX 직원 · 공유받은 기관. */
import * as K from '../kit/index.js';
import { h, api } from '../kit/util.js';
import { staffMenu } from '../kit/lx-menu.js';

const who = await K.gate('change-report');
const tenant = String(who?.key || '').startsWith('tenant/');
let rail;
if (tenant) { const m = await import('../gov-select/menu.js'); rail = m.govRail({ who, current: 'list' }); } else rail = staffMenu('mapsvc');
const S = K.shell({ who, home: 'change-report', title: '변화 탐지 보고서', rail });
const Q = new URLSearchParams(location.search);
let job = Q.get('job');
const paper = h('article.cr-paper');
const bar = h('div.cr-bar');
S.main.append(h('div.cr-page', {}, bar, paper));

if (!job) {
  const sh = await api('/change/shared').catch(() => null);
  job = sh?.items?.[0]?.job_id || null;
}
let R = null;
if (job) { const done = K.hold(); try { R = await api(`/change/runs/${encodeURIComponent(job)}/report.json`); } catch (e) { K.devlog('report', String(e?.message || e)); } finally { done(); } }
if (!R) {
  K.empty(paper, { kind: 'first', title: '보고서를 만들 결과가 없습니다', text: '변화 탐지 결과가 있는 대상지에서 다시 열어 주세요' });
} else {
  document.title = `${R.title} · Land-XI`;
  const pdf = h('button.t-btn', { type: 'button', text: 'PDF 내려받기' });
  pdf.addEventListener('click', async () => {
    pdf.disabled = true; pdf.textContent = 'PDF 만드는 중';
    try {
      const r = await api(`/change/runs/${encodeURIComponent(job)}/report.pdf`, { raw: true });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error?.message || 'PDF를 만들지 못했습니다');
      const u = URL.createObjectURL(await r.blob());
      const a = h('a', { href: u, download: `${R.title.replace(/[\\/:*?"<>|\s]+/g, '_')}.pdf` }); document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 4000);
    } catch (e) { K.toast(e.message || 'PDF를 만들지 못했습니다'); }
    finally { pdf.disabled = false; pdf.textContent = 'PDF 내려받기'; }
  });
  bar.append(pdf, h('button.t-btn.t-btn--2', { type: 'button', text: '인쇄', onclick: () => print() }),
    h('a.t-btn.t-btn--text', { href: '../change-field/?' + new URLSearchParams({ job }), text: '현장점검' }));
  const li = (xs) => h('ul', {}, ...xs.map((x) => h('li', { text: x })));
  const by = Object.fromEntries((R.table || []).map((t) => [t.id, t]));
  const ya = R.period_y?.a?.year, yb = R.period_y?.b?.year;
  const thumbs = h('div.cr-thumbs');
  for (const fid of R.thumbs || []) {
    const t = by[fid] || {};
    const a = h('img', { alt: `${ya}년 ${fid}`, decoding: 'async' }), b = h('img', { alt: `${yb}년 ${fid}`, decoding: 'async' });
    thumbs.append(h('figure.cr-pair', {}, h('figcaption', { text: `${fid} · ${t.jibun || ''} · ${t.type || ''} · ${t.area || ''}` }), h('div', {}, h('span', {}, a, h('small', { text: `${ya}년` })), h('span', {}, b, h('small', { text: `${yb}년` })))));
    for (const [img, k] of [[a, 'a'], [b, 'b']]) api(`/change/runs/${encodeURIComponent(job)}/thumbs/${fid}_${k}.png`, { raw: true }).then(async (r) => { if (r.ok) img.src = URL.createObjectURL(await r.blob()); });
  }
  const head = ['번호', '지번', '지목', '소유구분', '변화 유형', '면적', '판정'];
  paper.append(
    h('p.cr-k', { text: `국토 변화 모니터링 · ${R.period}` }), h('h1', { text: R.title }), h('p.cr-sub', { text: `만든 날 ${R.made}` }),
    h('h2', { text: '□ 구간 개요' }), li(R.overview || []),
    h('h2', { text: '□ 변화 요약' }), li(R.summary || []),
    h('h2', { text: '□ 필지별 목록(구역선 안)' }),
    h('div.cr-tw', {}, h('table.cr-t', {}, h('thead', {}, h('tr', {}, ...head.map((x) => h('th', { text: x })))),
      h('tbody', {}, ...(R.table || []).map((t) => h('tr', {}, ...[t.id, t.jibun, t.jimok, t.owner, t.type, t.area, t.status].map((x) => h('td', { text: x }))))))),
    (R.more?.value ? h('p.cr-cap', { text: `그 밖 ${Number(R.more.value).toLocaleString('ko-KR')}건은 필지 표(CSV)에서 봅니다.` }) : ''),
    h('h2', { text: `□ 근거 영상(${ya}년 · ${yb}년)` }), thumbs,
    h('h2', { text: '□ 권고 조치' }), li(R.recommend || []),
    h('p.cr-src', { text: R.source }));
}
document.body.dataset.ready = '1';
