// 원판 갤러리(landxi/proto/review/masters.html) 생성 — canvas.json + renders/*.png.
// 카테고리(화면) × 상태(적용/검토/폐기). 상태는 STATUS 표가 기준이고, 페이지에서 바꾼 값은
// localStorage 에 임시 저장되어 '변경 요약'으로 복사해 전달 → 여기 STATUS 에 반영한다.
// 실행: node tools/review/masters.mjs
import fs from 'node:fs';

// [카테고리, 상태(apply|review|drop), 메모]
const STATUS = {
  'B5-Login': ['로그인', 'apply', 'login.html 적용'],
  'B2-Login': ['로그인', 'drop', '1차 안(소개 카피 + 디오라마 판)'],
  'B5-Dashboard-Data': ['대시보드', 'apply', 'dashboard.html 적용'],
  'B5-Dashboard': ['대시보드', 'drop', '이등분 스택 안'],
  'B4-Dashboard': ['대시보드', 'drop', '전면 개편 4차'],
  'B3-Dashboard': ['대시보드', 'drop', '축소 원장'],
  'B2-Dashboard': ['대시보드', 'drop', '지도 위 원장'],
  'B5-DataMgmt': ['데이터 관리', 'apply', 'dataset.html 적용'],
  'B5-DataMgmt-Upload': ['데이터 관리', 'apply', 'dataset.html?tab=upload 적용'],
  'B3-DataMgmt': ['데이터 관리', 'drop', '파이프라인 4단계 원장'],
  'B2-DataMgmt-Upload': ['데이터 관리', 'drop', '2차 안'],
  'B2-DataMgmt-List': ['데이터 관리', 'drop', '2차 안'],
  'B5-Projects': ['프로젝트', 'review', '목록 + 우 프로젝트 조회'],
  'B5-Project-Create': ['프로젝트', 'review', '만들기 — 우 폼 · 좌 픽커 + 벡터 지도'],
  'B5-Project-Overview': ['프로젝트', 'review', '개요 · 구현 대기'],
  'B5-Project-Data': ['프로젝트', 'review', '데이터 탭 · 구현 대기'],
  'B5-Project-Labeling': ['프로젝트', 'review', '라벨링 + 클래스 편집기'],
  'B5-Project-Train': ['프로젝트', 'review', '학습 워크플로우 캔버스'],
  'B5-Project-Analysis': ['프로젝트', 'review', '분석 탭'],
  'B5-Project-Deploy': ['프로젝트', 'review', '배포 · 발행 폼'],
  'B5-Project-Delete': ['프로젝트', 'review', '삭제 확인'],
  'B2-Projects': ['프로젝트', 'drop', '2차 안'],
  'B5-Analysis-List': ['분석 서비스', 'review', '서비스 홈'],
  'B5-Analysis-Run': ['분석 서비스', 'review', '분석 실행 워크플로우'],
  'B5-Analysis-Result': ['분석 서비스', 'review', '결과 화면'],
  'B5-Analysis-Run-1': ['분석 서비스', 'review', '실행 1/4 · 분석 과제'],
  'B5-Analysis-Run-2': ['분석 서비스', 'review', '실행 2/4 · 모델'],
  'B5-Analysis-Run-3': ['분석 서비스', 'review', '실행 3/4 · 영상 선택'],
  'B5-Analysis-Run-4': ['분석 서비스', 'review', '실행 4/4 · 실행 검토'],
  'B5-Analysis-Run-5': ['분석 서비스', 'review', '실행중 · 진행 오버레이'],
  'B2-HomeFilm': ['메인(필름)', 'review', '필름 스테이지 카피 판 — 구현본이 앞섬'],
  'B2-HomeAtlas': ['메인(필름)', 'drop', '홈 아틀라스(필름 뒤 페이지) — 미사용'],
  'B2-XiMap': ['XI맵', 'review', '초안 — 미착수'],
};
const CATS = ['로그인', '대시보드', '데이터 관리', '프로젝트', '분석 서비스', '메인(필름)', 'XI맵', '기타'];
const LABEL = { apply: ['적용', '#0FA9A0'], review: ['검토', '#006DF7'], drop: ['폐기', '#8A8A8A'] };

const c = JSON.parse(fs.readFileSync('design-canvas/v2/canvas.json', 'utf8'));
const boards = c.artboards.map(a => a.file.replace('.dc.html', '')).filter(id => fs.existsSync(`design-canvas/v2/renders/${id}.png`))
  .map(id => { const [cat, st, note] = STATUS[id] || ['기타', 'drop', '미분류']; const t = c.artboards.find(a => a.file === id + '.dc.html'); return { id, cat, st, note, title: t?.title || id }; });

const card = b => `<figure class="card" data-id="${b.id}" data-cat="${b.cat}" data-st="${b.st}"><a href="../../../design-canvas/v2/renders/${b.id}.png" class="lb" data-title="${b.title}"><img loading="lazy" src="../../../design-canvas/v2/renders/${b.id}.png" alt="${b.id}"></a><figcaption><div class="row"><span class="badge"></span><b>${b.title}</b></div><span class="meta">${b.id} · ${b.note}</span><div class="ctl"><button type="button" data-set="apply">적용</button><button type="button" data-set="review">검토</button><button type="button" data-set="drop">폐기</button></div></figcaption></figure>`;

let body = '';
for (const cat of CATS) {
  const live = boards.filter(b => b.cat === cat && b.st !== 'drop');
  if (!live.length) continue;
  body += `<section class="cat" data-cat="${cat}"><h2>${cat} <span class="n">적용 ${live.filter(b => b.st === 'apply').length} · 검토 ${live.filter(b => b.st === 'review').length}</span></h2><div class="grid">${live.map(card).join('')}</div></section>`;
}
body += `<section class="drop-zone"><h2>폐기 <span class="n">카테고리별 · 승격 가능</span></h2>`;
for (const cat of CATS) {
  const d = boards.filter(b => b.cat === cat && b.st === 'drop');
  if (!d.length) continue;
  body += `<h3>${cat}</h3><div class="grid">${d.map(card).join('')}</div>`;
}
body += `</section>`;

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Land-XI 원판 갤러리</title><link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<style>body{margin:0;background:#fff;color:#010102;font:15px/1.6 Pretendard,system-ui,sans-serif}.w{max-width:1400px;margin:0 auto;padding:28px 32px 64px}h1{font-size:30px;margin:0 0 4px;letter-spacing:-.02em}h2{font-size:22px;margin:0 0 12px}h3{font-size:15px;color:#8A8A8A;margin:18px 0 8px}h2 .n{font:600 12px Inter,sans-serif;color:#8A8A8A;margin-left:8px}.sub{color:#8A8A8A;font-size:13px}section{padding:24px 0;border-top:1px solid #DDD}.drop-zone{border-top:2px solid #010102;margin-top:24px}.drop-zone .card{opacity:.6}.drop-zone .card:hover{opacity:1}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(400px,1fr));gap:20px}figure{margin:0}img{width:100%;display:block;border:1px solid #DDD}.card[data-st=apply] img{border:2px solid #0FA9A0}.card[data-st=review] img{border:2px solid #006DF7}figcaption{font-size:13px;margin-top:6px}.row{display:flex;align-items:center;gap:8px}.meta{color:#8A8A8A;font-family:Inter,monospace;font-size:12px;display:block}.badge{font:600 10.5px/1 Inter,sans-serif;letter-spacing:.06em;padding:4px 6px;border:1px solid;white-space:nowrap;flex:none}.ctl{display:flex;gap:6px;margin-top:6px}.ctl button{font:500 12px Pretendard,sans-serif;padding:4px 10px;background:#fff;border:1px solid #DDD;cursor:pointer}.ctl button.on{border-color:#010102;background:#010102;color:#fff}.card.changed .meta::after{content:' · 변경됨(미반영)';color:#B7791F}#sum{position:sticky;top:0;background:#fff;border-bottom:1px solid #DDD;padding:10px 0;z-index:5;font-size:13px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}#sum textarea{flex:1;min-width:320px;font:12px Inter,monospace;border:1px solid #DDD;padding:6px;height:34px;resize:vertical}#sum button{font:500 12px Pretendard,sans-serif;padding:6px 10px;background:#fff;border:1px solid #DDD;cursor:pointer}a{color:#006DF7;text-decoration:none}
#lb{position:fixed;inset:0;background:rgba(1,1,2,.92);z-index:50;display:flex;align-items:center;justify-content:center;padding:56px 24px 24px}#lb[hidden]{display:none}#lb img{max-width:100%;max-height:100%;border:1px solid #444;background:#fff}#lb-x{position:fixed;top:14px;right:16px;font:600 14px Pretendard,sans-serif;background:#fff;color:#010102;border:0;padding:10px 14px;cursor:pointer}#lb-t{position:fixed;top:20px;left:24px;color:#fff;font:600 15px Pretendard,sans-serif}#lb-prev,#lb-next{position:fixed;top:50%;transform:translateY(-50%);width:56px;height:96px;background:rgba(255,255,255,.12);color:#fff;border:0;font:300 44px/1 Pretendard,sans-serif;cursor:pointer}#lb-prev{left:8px}#lb-next{right:8px}#lb-prev:hover,#lb-next:hover{background:rgba(255,255,255,.28)}</style></head>
<body><div class="w"><div class="sub">Land-XI · 원판 갤러리 · GitHub 버전 · 자동 생성 (node tools/review/masters.mjs)</div><h1>디자인 원판 ${boards.length}장</h1><p class="sub">카테고리별로 <b>적용</b>(사이트에 구현됨)과 <b>검토</b>(확장·구현 대기)를 보여주고, <b>폐기</b>는 맨 아래 카테고리별로 둡니다. 카드의 버튼으로 상태를 바꾸면(승격 포함) 아래 요약에 모입니다 — 복사해 전달하시면 기준표에 반영합니다. 편집 캔버스: <a href="../../../design-canvas/v2/landxi-design-b2.html">landxi-design-b2.html</a> · <a href="index.html">검토 허브</a></p>
<div id="sum"><b>상태 변경</b><textarea id="sum-t" readonly>변경 없음</textarea><button id="sum-reset" type="button">되돌리기</button></div>
${body}</div>
<div id="lb" hidden><button id="lb-x" type="button" aria-label="닫기">닫기 ×</button><button id="lb-prev" type="button" aria-label="이전">‹</button><button id="lb-next" type="button" aria-label="다음">›</button><div id="lb-t"></div><img id="lb-img" alt=""></div>
<script>(function(){
var KEY='lx_masters_status',LABEL={apply:['적용','#0FA9A0'],review:['검토','#006DF7'],drop:['폐기','#8A8A8A']};var ov={};try{ov=JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(e){}
function paint(){var lines=[];document.querySelectorAll('.card').forEach(function(c){var id=c.dataset.id,base=c.getAttribute('data-base')||c.dataset.st;if(!c.getAttribute('data-base'))c.setAttribute('data-base',base);var st=ov[id]||base;c.dataset.st=st;c.classList.toggle('changed',st!==base);var b=c.querySelector('.badge');b.textContent=LABEL[st][0];b.style.borderColor=b.style.color=LABEL[st][1];c.querySelectorAll('.ctl button').forEach(function(x){x.classList.toggle('on',x.dataset.set===st)});if(st!==base)lines.push(id+': '+LABEL[base][0]+' → '+LABEL[st][0]);});document.getElementById('sum-t').value=lines.length?lines.join('\\n'):'변경 없음';}
document.querySelectorAll('.ctl button').forEach(function(x){x.addEventListener('click',function(){var c=x.closest('.card');var base=c.getAttribute('data-base');var v=x.dataset.set;if(v===base)delete ov[c.dataset.id];else ov[c.dataset.id]=v;try{localStorage.setItem(KEY,JSON.stringify(ov))}catch(e){}paint();});});
document.getElementById('sum-reset').addEventListener('click',function(){ov={};try{localStorage.removeItem(KEY)}catch(e){}paint();});paint();
var lb=document.getElementById('lb'),im=document.getElementById('lb-img'),t=document.getElementById('lb-t'),links=Array.prototype.slice.call(document.querySelectorAll('a.lb')),cur=-1;
function show(i){if(i<0)i=links.length-1;if(i>=links.length)i=0;cur=i;var a=links[i];im.src=a.getAttribute('href');var c=a.closest('.card');t.textContent=(i+1)+' / '+links.length+' · '+(a.dataset.title||'')+(c?'  ['+c.dataset.cat+' · '+c.querySelector('.badge').textContent+']':'');lb.hidden=false;document.body.style.overflow='hidden';}
function close(){lb.hidden=true;im.src='';document.body.style.overflow='';}
links.forEach(function(a,i){a.addEventListener('click',function(e){e.preventDefault();show(i);});});
document.getElementById('lb-x').addEventListener('click',close);document.getElementById('lb-prev').addEventListener('click',function(){show(cur-1)});document.getElementById('lb-next').addEventListener('click',function(){show(cur+1)});
lb.addEventListener('click',function(e){if(e.target===lb)close();});
document.addEventListener('keydown',function(e){if(lb.hidden)return;if(e.key==='Escape')close();else if(e.key==='ArrowLeft')show(cur-1);else if(e.key==='ArrowRight'||e.key===' ')show(cur+1);});
var sx=null;lb.addEventListener('touchstart',function(e){sx=e.touches[0].clientX},{passive:true});lb.addEventListener('touchend',function(e){if(sx===null)return;var dx=e.changedTouches[0].clientX-sx;sx=null;if(dx>50)show(cur-1);else if(dx<-50)show(cur+1);});
})();</script></body></html>`;
fs.writeFileSync('landxi/proto/review/masters.html', html);
console.log(boards.length, 'boards;', boards.filter(b => b.st === 'apply').length, 'apply,', boards.filter(b => b.st === 'review').length, 'review,', boards.filter(b => b.st === 'drop').length, 'drop');
