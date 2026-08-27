// 원판 갤러리(landxi/proto/review/masters.html) 생성 — canvas.json + renders/*.png 기준.
// 상태는 아래 STATUS 표에서 관리한다. 실행: node tools/review/masters.mjs
import fs from 'node:fs';

const STATUS = {
  // 적용 중 = 프로토에 구현·배포된 원판
  'B5-Login': ['live', '적용 중 · login.html'],
  'B5-Dashboard-Data': ['live', '적용 중 · dashboard.html'],
  'B5-DataMgmt': ['live', '적용 중 · dataset.html'],
  'B5-DataMgmt-Upload': ['live', '적용 중 · dataset.html?tab=upload'],
  // 확정(구현 대기) / 검토 중
  'B5-Projects': ['ok', '확정 · 구현 대기'],
  'B5-Project-Overview': ['ok', '확정 · 구현 대기'],
  'B5-Project-Data': ['ok', '확정 · 구현 대기'],
  'B5-Project-Train': ['review', 'D5 검토 중(워크플로우 개정)'],
  'B5-Project-Labeling': ['review', 'D5 검토 중(클래스 편집기)'],
  'B5-Project-Create': ['review', 'D5 검토 중(신규)'],
  'B5-Project-Analysis': ['review', 'D5 검토 중'],
  'B5-Project-Deploy': ['review', 'D5 검토 중'],
  'B5-Project-Delete': ['review', 'D5 검토 중'],
  'B5-Analysis-List': ['review', '분석 서비스 · 검토 대기(D10)'],
  'B5-Analysis-Run': ['review', '분석 서비스 · 검토 대기(D10)'],
  'B5-Analysis-Result': ['review', '분석 서비스 · 검토 대기(D10)'],
  'B2-Login': ['old', '이전 안'],
  'B2-HomeFilm': ['ref', '메인 필름 카피 판 참고'],
  'B2-HomeAtlas': ['ref', '홈 아틀라스 참고'],
  'B2-XiMap': ['ref', 'XI맵 초안(미착수)'],
};
const GROUPS = [
  ['적용 중', f => STATUS[f]?.[0] === 'live'],
  ['확정 · 구현 대기', f => STATUS[f]?.[0] === 'ok'],
  ['검토 중', f => STATUS[f]?.[0] === 'review'],
  ['참고 · 초안', f => STATUS[f]?.[0] === 'ref'],
  ['이전 안 (폐기)', () => true],
];
const BADGE = { live: ['적용 중', '#0FA9A0'], ok: ['확정', '#006DF7'], review: ['검토 중', '#B7791F'], ref: ['참고', '#8A8A8A'], old: ['이전 안', '#CCCCCC'] };

const c = JSON.parse(fs.readFileSync('design-canvas/v2/canvas.json', 'utf8'));
const abs = c.artboards.filter(a => fs.existsSync('design-canvas/v2/renders/' + a.file.replace('.dc.html', '.png')));
const seen = new Set(); let body = '';
for (const [g, pred] of GROUPS) {
  const list = abs.filter(a => !seen.has(a.file) && pred(a.file.replace('.dc.html', '')));
  if (!list.length) continue; list.forEach(a => seen.add(a.file));
  body += `<section><h2>${g} <span class="n">${list.length}</span></h2><div class="grid">` + list.map(a => {
    const id = a.file.replace('.dc.html', ''); const png = '../../../design-canvas/v2/renders/' + id + '.png';
    const st = STATUS[id]?.[0] || 'old'; const [label, col] = BADGE[st]; const note = STATUS[id]?.[1] || '이전 안';
    return `<figure class="${st}"><a href="${png}" class="lb" data-title="${a.title || id}"><img loading="lazy" src="${png}" alt="${id}"></a><figcaption><div><span class="badge" style="border-color:${col};color:${col}">${label}</span><b>${a.title || id}</b></div><span>${id} · ${note}</span></figcaption></figure>`;
  }).join('') + '</div></section>';
}
const live = abs.filter(a => STATUS[a.file.replace('.dc.html', '')]?.[0] === 'live').length;
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Land-XI 원판 갤러리</title><link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"><style>body{margin:0;background:#fff;color:#010102;font:15px/1.6 Pretendard,system-ui,sans-serif}.w{max-width:1400px;margin:0 auto;padding:28px 32px 64px}h1{font-size:30px;margin:0 0 4px;letter-spacing:-.02em}h2{font-size:20px;margin:0 0 12px}h2 .n{font:600 12px Inter,sans-serif;color:#8A8A8A;margin-left:6px}.sub{color:#8A8A8A;font-size:13px}section{padding:24px 0;border-top:1px solid #DDD}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:20px}figure{margin:0}img{width:100%;display:block;border:1px solid #DDD}figure.live img{border:2px solid #0FA9A0}figure.old{opacity:.55}figcaption{font-size:13px;margin-top:6px}figcaption>div{display:flex;align-items:center;gap:8px}figcaption>span{color:#8A8A8A;font-family:Inter,monospace;font-size:12px}.badge{font:600 10.5px/1 Inter,sans-serif;letter-spacing:.06em;text-transform:uppercase;padding:4px 6px;border:1px solid}a{color:#006DF7;text-decoration:none}</style></head><body><div class="w"><div class="sub">Land-XI · 원판 갤러리 · GitHub 버전 · 자동 생성 (node tools/review/masters.mjs)</div><h1>디자인 원판 ${abs.length}장 — 적용 중 ${live}</h1><p class="sub">청록 테두리 = 지금 사이트에 적용된 원판. 클릭하면 원본 PNG. 편집 캔버스: <a href="../../../design-canvas/v2/landxi-design-b2.html">landxi-design-b2.html</a> · <a href="index.html">검토 허브</a></p>${body}</div>
<div id="lb" hidden><button id="lb-x" type="button" aria-label="닫기">닫기 ×</button><div id="lb-t"></div><img id="lb-img" alt=""></div>
<style>#lb{position:fixed;inset:0;background:rgba(1,1,2,.92);z-index:50;display:flex;align-items:center;justify-content:center;padding:56px 24px 24px}#lb[hidden]{display:none}#lb img{max-width:100%;max-height:100%;border:1px solid #444;background:#fff}#lb-x{position:fixed;top:14px;right:16px;font:600 14px Pretendard,sans-serif;background:#fff;color:#010102;border:0;padding:10px 14px;cursor:pointer}#lb-t{position:fixed;top:20px;left:24px;color:#fff;font:600 15px Pretendard,sans-serif}</style>
<script>(function(){var lb=document.getElementById('lb'),im=document.getElementById('lb-img'),t=document.getElementById('lb-t');function close(){lb.hidden=true;im.src='';document.body.style.overflow='';}document.querySelectorAll('a.lb').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();im.src=a.getAttribute('href');t.textContent=a.dataset.title||'';lb.hidden=false;document.body.style.overflow='hidden';});});document.getElementById('lb-x').addEventListener('click',close);lb.addEventListener('click',function(e){if(e.target===lb)close();});document.addEventListener('keydown',function(e){if(e.key==='Escape')close();});})();</script>
</body></html>`;
fs.writeFileSync('landxi/proto/review/masters.html', html);
console.log(abs.length, 'boards, live', live);
