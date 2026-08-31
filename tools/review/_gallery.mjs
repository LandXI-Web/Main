// 갤러리 껍데기 — 원판 갤러리(masters)와 톤앤매너 갤러리(masters-tone)가 함께 쓴다.
// 진단(2026-08-31)의 "같은 것이 여러 곳에 산다"를 피하기 위해 페이지 셸은 여기 한 곳에만 둔다.
import fs from 'node:fs';

const LABEL = { apply: ['적용', '#0FA9A0'], review: ['검토', '#006DF7'], drop: ['폐기', '#8A8A8A'] };

export const card = (b, renderDir) => {
  const img = b.img || `${renderDir}/${b.id}.png`;
  const open = b.href ? `<a href="${b.href}" class="live-link" title="구현 화면 열기">` : `<a href="${img}" class="lb" data-title="${b.title}">`;
  return `<figure class="card" data-id="${b.id}" data-cat="${b.cat}" data-st="${b.st}">${open}<img loading="lazy" src="${img}" alt="${b.id}"></a><figcaption><div class="row"><span class="badge"></span><b>${b.title}</b></div><span class="meta">${b.id} · ${b.note}</span><div class="ctl"><button type="button" data-set="apply">적용</button><button type="button" data-set="review">검토</button><button type="button" data-set="drop">폐기</button></div></figcaption></figure>`;
};

/** boards: [{id,cat,st,note,title,img?,href?}] · cats: 표시 순서 · key: localStorage 키 */
export function build({ boards, cats, renderDir, title, h1, lead, subline, key, out, showDrop = true }) {
  let body = '';
  for (const cat of cats) {
    const live = boards.filter(b => b.cat === cat && b.st !== 'drop');
    if (!live.length) continue;
    body += `<section class="cat" data-cat="${cat}"><h2>${cat} <span class="n">적용 ${live.filter(b => b.st === 'apply').length} · 검토 ${live.filter(b => b.st === 'review').length}</span></h2><div class="grid">${live.map(b => card(b, renderDir)).join('')}</div></section>`;
  }
  if (showDrop) {
    let d0 = '';
    for (const cat of cats) {
      const d = boards.filter(b => b.cat === cat && b.st === 'drop');
      if (!d.length) continue;
      d0 += `<h3>${cat}</h3><div class="grid">${d.map(b => card(b, renderDir)).join('')}</div>`;
    }
    if (d0) body += `<section class="drop-zone"><h2>폐기 <span class="n">카테고리별 · 승격 가능</span></h2>${d0}</section>`;
  }
  const html = SHELL({ body, boards, title, h1, lead, subline, key });
  fs.writeFileSync(out, html);
  console.log(out, '—', boards.length, 'boards;', boards.filter(b => b.st === 'apply').length, 'apply,', boards.filter(b => b.st === 'review').length, 'review,', boards.filter(b => b.st === 'drop').length, 'drop');
}

function SHELL({ body, boards, title, h1, lead, subline, key }) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<style>body{margin:0;background:#fff;color:#010102;font:15px/1.6 Pretendard,system-ui,sans-serif}.w{max-width:1400px;margin:0 auto;padding:28px 32px 64px}h1{font-size:30px;margin:0 0 4px;letter-spacing:-.02em}h2{font-size:22px;margin:0 0 12px}h3{font-size:15px;color:#8A8A8A;margin:18px 0 8px}h2 .n{font:600 12px Inter,sans-serif;color:#8A8A8A;margin-left:8px}.sub{color:#8A8A8A;font-size:13px}section{padding:24px 0;border-top:1px solid #DDD}.drop-zone{border-top:2px solid #010102;margin-top:24px}.drop-zone .card{opacity:.6}.drop-zone .card:hover{opacity:1}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(400px,1fr));gap:20px}figure{margin:0}img{width:100%;display:block;border:1px solid #DDD}.card[data-st=apply] img{border:2px solid #0FA9A0}.card[data-st=review] img{border:2px solid #006DF7}figcaption{font-size:13px;margin-top:6px}.row{display:flex;align-items:center;gap:8px}.meta{color:#8A8A8A;font-family:Inter,monospace;font-size:12px;display:block}.badge{font:600 10.5px/1 Inter,sans-serif;letter-spacing:.06em;padding:4px 6px;border:1px solid;white-space:nowrap;flex:none}.ctl{display:flex;gap:6px;margin-top:6px}.ctl button{font:500 12px Pretendard,sans-serif;padding:4px 10px;background:#fff;border:1px solid #DDD;cursor:pointer}.ctl button.on{border-color:#010102;background:#010102;color:#fff}.card.changed .meta::after{content:' · 변경됨(미반영)';color:#B7791F}#sum{position:sticky;top:0;background:#fff;border-bottom:1px solid #DDD;padding:10px 0;z-index:5;font-size:13px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}#sum textarea{flex:1;min-width:320px;font:12px Inter,monospace;border:1px solid #DDD;padding:6px;height:34px;resize:vertical}#sum button{font:500 12px Pretendard,sans-serif;padding:6px 10px;background:#fff;border:1px solid #DDD;cursor:pointer}a{color:#006DF7;text-decoration:none}
#lb{position:fixed;inset:0;background:rgba(1,1,2,.92);z-index:50;display:flex;align-items:center;justify-content:center;padding:56px 24px 24px}#lb[hidden]{display:none}#lb img{max-width:100%;max-height:100%;border:1px solid #444;background:#fff}#lb-x{position:fixed;top:14px;right:16px;font:600 14px Pretendard,sans-serif;background:#fff;color:#010102;border:0;padding:10px 14px;cursor:pointer}#lb-t{position:fixed;top:20px;left:24px;color:#fff;font:600 15px Pretendard,sans-serif}#lb-prev,#lb-next{position:fixed;top:50%;transform:translateY(-50%);width:56px;height:96px;background:rgba(255,255,255,.12);color:#fff;border:0;font:300 44px/1 Pretendard,sans-serif;cursor:pointer}#lb-prev{left:8px}#lb-next{right:8px}#lb-prev:hover,#lb-next:hover{background:rgba(255,255,255,.28)}</style></head>
<body><div class="w"><div class="sub">${subline}</div><h1>${h1}</h1><p class="sub">${lead}</p>
<div id="sum"><b>상태 변경</b><textarea id="sum-t" readonly>변경 없음</textarea><button id="sum-reset" type="button">되돌리기</button></div>
${body}</div>
<div id="lb" hidden><button id="lb-x" type="button" aria-label="닫기">닫기 ×</button><button id="lb-prev" type="button" aria-label="이전">‹</button><button id="lb-next" type="button" aria-label="다음">›</button><div id="lb-t"></div><img id="lb-img" alt=""></div>
<script>(function(){
var KEY='${key}',LABEL={apply:['적용','#0FA9A0'],review:['검토','#006DF7'],drop:['폐기','#8A8A8A']};var ov={};try{ov=JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(e){}
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
}
