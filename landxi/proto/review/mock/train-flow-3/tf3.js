/* 설계 23차 · 학습 = AI 모델 작업 흐름 3차 시안(원칙 200 · 208 · 209) — 서버 호출 0 · 코드 수정 0 · GPU 0.
   이 프로젝트(비닐하우스 2026) 지금 학습 하나에 집중 — 지난 판 겹쳐 비교 · 기준선 · 실험 겹침 없음. 이력은 아래 목록.
   ?v=done(기본)  10-08 에 끝난 학습 — 흐름 판 · 반복마다 정확도 그래프(20회 전부) · 핵심 수치 · 이력 목록
   ?v=live        같은 학습이 도는 중일 때의 모습(20회 중 12회째 · 그래프가 차오름) — 지금 실제로 도는 학습이 없어 '시안' 표시
   끌어다 놓기(위 칩) · 선 잇기(출구 ○ 누르고 다음 블록) · 같은 블록 여러 개 · D 복제 · Delete 지우기 · 선 누르면 끊기 · 블록 누르면 오른쪽 서랍.
   숫자는 실제 기록만(2026-10-12 09:01 바깥 주소 로그인 폼 1회 · 모델 장부 + 학습 기록):
   · 10-08 판: job_01M4AVD8… 반복 20회 · 크기 1280 · 한 번에 8장 · 학습 데이터 35,247장(비닐하우스 있는 칸 27,247 + 없는 칸 8,000 · 그중 자체 검증 1,762장) · 학습 끝 검증 89.8% · 같은 검증 묶음 3,000칸 87.3%(원판 90.6%) · 10-07 18:34 → 10-08 19:12
   · 09-30 판 둘: job_01M3RCHB…(원판에서 3회 · 200장 · 66.3%) · job_01M3RG60…(그 판에서 이어 3회 · 200장 · 69.9% · 지금 서비스 중)
   · 원판: 건물·주차장 등 4종 모델(2026.05.16) 88.6% */
(() => {
  const q = new URLSearchParams(location.search); const V = q.get('v') === 'live' ? 'live' : 'done';
  const $ = (s, r = document) => r.querySelector(s);
  const now = new Date(); const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  $('#clock').textContent = hm; $('#stampT').textContent = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')} ${hm} · 데이터 2026-10-12 09:01`;
  const nf = (n) => Number(n).toLocaleString('ko-KR');

  /* ── 실제 기록(이 프로젝트 지금 학습 · 10-08 판) ── */
  const MAP = [80.1, 78.2, 72.3, 75.7, 77.3, 78.3, 79.6, 81.6, 82.7, 83.4, 84.1, 85.1, 85.7, 87.2, 87.4, 88.3, 88.5, 89.3, 89.4, 89.9]; // 반복마다 자체 검증 정확도(mAP50)
  const LIVE_EPOCH = 12, EPOCHS = 20;
  const live = V === 'live';
  const HIST = [ // 판 · 날짜 · AI 모델 정확도(학습 끝 검증) · 학습 데이터 n장 · 상태
    { when: '10-08', name: '다시 학습 판', how: '원판에서 · 반복 20회 · 크기 1280', acc: 89.8, same: 87.3, n: 35247, st: ['down', '같은 검증 묶음 87% · 원판 91%보다 낮아 후보로 남음'], now: true },
    { when: '09-30', name: '두 번째 판', how: '첫 판에서 이어서 · 반복 3회 · 크기 640', acc: 69.9, n: 200, st: ['ok', '서비스 중'] },
    { when: '09-30', name: '첫 판', how: '원판에서 · 반복 3회 · 크기 640', acc: 66.3, n: 200, st: ['', '지난 판'] },
    { when: '05-16', name: '원판', how: '건물 · 주차장 · 경작지 · 비닐하우스 4종 모델', acc: 88.6, n: null, st: ['base', '기반 모델'] },
  ];

  /* ── 블록 종류(이름은 글자 · 사람 말) ── */
  const KIND = { data: '학습 데이터', base: '기반 모델', cfg: '학습 설정', train: '학습', eval: '평가', test: '추론 시험', deploy: '배포 신청' };
  const IN = { train: ['data', 'base', 'cfg'], eval: ['train'], test: ['train', 'base'], deploy: ['eval'] };
  const ONE = { train: ['base', 'cfg'] };
  const WHY = { train: '학습에는 학습 데이터 · 기반 모델 · 학습 설정만 들어와요', eval: '평가는 학습이 끝난 모델에만 이어요', test: '추론 시험은 학습한 모델이나 기반 모델에 이어요', deploy: '배포 신청에는 평가만 이어요',
    data: '학습 데이터 앞에는 아무것도 오지 않아요', base: '기반 모델 앞에는 아무것도 오지 않아요', cfg: '학습 설정 앞에는 아무것도 오지 않아요' };
  const ONE_WHY = { base: '학습 하나에 기반 모델은 하나만 — 둘을 나란히 보려면 학습 블록을 하나 더 놓아요', cfg: '학습 하나에 학습 설정은 하나만 — 설정을 바꿔 보려면 학습 블록을 하나 더 놓아요' };
  const W = 168, C0 = 20, C1 = 250, C2 = 480, C3 = 710, R = [16, 112, 200];

  /* ── 흐름(이 프로젝트 지금 학습 하나) ── */
  const nodes = {
    data1: { id: 'data1', kind: 'data', x: C0, y: R[0], line: '25cm 항공 · 35,247장', tag: 'XI맵에서 고친 것 0장' },
    base1: { id: 'base1', kind: 'base', x: C0, y: R[1], line: '원판 · 4종 모델' },
    cfg1: { id: 'cfg1', kind: 'cfg', x: C0, y: R[2], line: '반복 20회 · 크기 1280 · 한 번에 8장' },
    train1: live ? { id: 'train1', kind: 'train', x: C1, y: R[1], cls: 'live', line: '학습 중 · 12 / 20회', bar: 60, tag: '10-07 18:34 시작 · 밤 대기열' }
                 : { id: 'train1', kind: 'train', x: C1, y: R[1], line: '끝남 · 10-08 19:12 · 20회', num: '학습 끝 검증 90%' },
    eval1: live ? { id: 'eval1', kind: 'eval', x: C2, y: R[1], line: '끝나면 같은 검증 묶음으로' }
                : { id: 'eval1', kind: 'eval', x: C2, y: R[1], line: '같은 검증 묶음 3,000칸 · 87%', tag: '원판 91%보다 낮음', tagc: 'down' },
    deploy1: { id: 'deploy1', kind: 'deploy', x: C3, y: R[1], cls: 'off', line: live ? '평가 뒤에 켜져요' : '지난 판보다 낮아 꺼짐' },
  };
  const links = [['data1', 'train1'], ['base1', 'train1'], ['cfg1', 'train1'], ['train1', 'eval1', live ? 'live' : ''], ['eval1', 'deploy1', 'off']].map(([a, b, c]) => ({ a, b, c }));
  let picked = null, from = null, seq = 100;

  /* 같은 종류가 둘 이상이면 이름 뒤에 표(학습 A · B · 학습 데이터 1 · 2) */
  function label(n) {
    const same = Object.values(nodes).filter((m) => m.kind === n.kind);
    if (same.length < 2) return KIND[n.kind];
    if (n.kind === 'train') return `${KIND[n.kind]}<em>${String.fromCharCode(65 + same.indexOf(n))}</em>`;
    return `${KIND[n.kind]}<em>${same.indexOf(n) + 1}</em>`;
  }

  /* 단계 막대(실제 화면과 같은 여섯 단계) */
  const ST = ['데이터 올리기', '학습데이터 구축', '학습', '추론', '결과 확인', '배포 신청'];
  $('#stages').innerHTML = `<div class="pj"><small>프로젝트</small><b>비닐하우스 2026</b></div>` +
    ST.map((t, i) => `${i ? '<span class="line"></span>' : ''}<span class="st ${i < 2 ? 'done' : i === 2 ? 'on' : ''}"><i>${i < 2 ? '✓' : i + 1}</i>${t}</span>`).join('') +
    `<span class="sp"></span><div class="pj" style="width:auto;text-align:right"><small>GPU</small><b>관리자가 배정 · 프로젝트 하나에 한 장</b></div>`;
  $('#hint').innerHTML = live ? '학습 중 · 20회 중 12회째 · 한 번 반복에 약 75분<span class="mock">시안 · 지금 도는 학습 없음</span>' : '10-08 에 끝난 학습 · 평가까지 끝남 · 같은 설정으로 다시 돌리거나 블록을 바꿔 새로 돌릴 수 있어요';
  const go = $('#go'); go.textContent = live ? '멈추기' : '다시 돌리기';

  /* 블록 더하기 — 칩(끌어다 놓기 · 누르면 판에 더함) */
  const add = $('#add');
  for (const k in KIND) { const c = document.createElement('span'); c.className = 'chip'; c.draggable = true; c.dataset.k = k; c.textContent = KIND[k]; add.appendChild(c);
    c.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', k); c.classList.add('drag'); }); c.addEventListener('dragend', () => c.classList.remove('drag'));
    c.addEventListener('click', () => addNode(k, 20 + (seq % 5) * 36, 184 + (seq % 3) * 10)); }
  const canvas = $('#canvas');
  canvas.insertAdjacentHTML('beforeend', '<div class="how">출구 ○ 를 누른 뒤 다음 블록을 눌러 이어요 · 선을 누르면 끊어요<b>D</b>복제<b>Del</b>지우기</div>');
  canvas.addEventListener('dragover', (e) => { e.preventDefault(); canvas.classList.add('over'); });
  canvas.addEventListener('dragleave', () => canvas.classList.remove('over'));
  canvas.addEventListener('drop', (e) => { e.preventDefault(); canvas.classList.remove('over'); const k = e.dataTransfer.getData('text/plain'); if (!KIND[k]) return; const r = canvas.getBoundingClientRect(); addNode(k, Math.max(8, e.clientX - r.left - W / 2), Math.max(8, Math.min(e.clientY - r.top - 24, canvas.clientHeight - 70))); });
  function addNode(k, x, y, src) {
    const id = `${k}${seq++}`;
    nodes[id] = { id, kind: k, x, y, line: src ? src.line : ({ data: '학습 데이터를 고르세요', base: '모델을 고르세요', cfg: '반복 20회 · 크기 1280 · 한 번에 8장', train: '밤 시간 · 대기열', eval: '같은 검증 묶음', test: '모델 판 · 설정 고르세요', deploy: '나아진 판만' })[k], cls: src ? '' : 'need' };
    picked = id; render(); return id;
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { picked = null; render(); return; }
    if (!picked || !nodes[picked]) return;
    if (e.key === 'd' || e.key === 'D') { const n = nodes[picked]; addNode(n.kind, Math.min(n.x + 24, canvas.clientWidth - W - 8), Math.min(n.y + 40, canvas.clientHeight - 70), n); }
    if (e.key === 'Delete' || e.key === 'Backspace') { for (let i = links.length - 1; i >= 0; i--) if (links[i].a === picked || links[i].b === picked) links.splice(i, 1); delete nodes[picked]; picked = null; render(); }
  });

  /* 판 그리기 */
  const wires = $('#wires');
  function render() {
    canvas.querySelectorAll('.node,.say').forEach((n) => n.remove());
    for (const n of Object.values(nodes)) {
      const el = document.createElement('div');
      el.className = `node ${n.cls || ''} ${picked === n.id || from === n.id ? 'on' : ''}`; el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; el.dataset.id = n.id;
      el.innerHTML = `${IN[n.kind] ? '<i class="port in"></i>' : ''}<b>${label(n)}</b>` + (n.num ? `<small class="num">${n.num}</small>` : '') + `<small>${n.line}</small>` +
        (n.bar ? `<div class="bar"><i style="width:${n.bar}%"></i></div>` : '') + (n.tag ? `<span class="tag ${n.tagc || (/XI맵/.test(n.tag) ? 'new' : '')}">${n.tag}</span>` : '') +
        `${['deploy', 'test'].includes(n.kind) ? '' : '<i class="port"></i>'}`;
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('port') && !e.target.classList.contains('in')) { from = from === n.id ? null : n.id; render(); return; }
        if (from && from !== n.id) { connect(from, n.id); from = null; return; }
        if (from === n.id) { say(n, '같은 블록끼리는 이을 수 없어요', true); from = null; render(); return; }
        picked = picked === n.id ? null : n.id; render();
      });
      canvas.appendChild(el);
    }
    drawWires(); side();
  }
  function box(id) { const el = canvas.querySelector(`.node[data-id="${id}"]`); return { x: nodes[id].x, y: nodes[id].y, w: el ? el.offsetWidth : W, h: el ? el.offsetHeight : 60 }; }
  function drawWires() {
    wires.innerHTML = links.map((l, i) => { const a = box(l.a), b = box(l.b); const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2; const dx = Math.max(40, (x2 - x1) / 2);
      return `<path class="${l.c || ''}" data-i="${i}" d="M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}"/>`; }).join('');
    wires.querySelectorAll('path').forEach((p) => p.addEventListener('click', () => { links.splice(+p.dataset.i, 1); render(); }));
  }
  function connect(a, b) {
    const A = nodes[a], B = nodes[b];
    if (links.some((l) => l.a === a && l.b === b)) { say(B, '이미 이어져 있어요'); render(); return; }
    let why = null;
    if (A.kind === B.kind) why = '같은 블록끼리는 이을 수 없어요';
    else if (!(IN[B.kind] || []).includes(A.kind)) why = WHY[B.kind];
    else if ((ONE[B.kind] || []).includes(A.kind) && links.some((l) => l.b === b && nodes[l.a].kind === A.kind)) why = ONE_WHY[A.kind];
    if (why) { const was = B.cls; B.cls = 'bad'; links.push({ a, b, c: 'bad' }); render(); say(B, why, true);
      setTimeout(() => { B.cls = was; const i = links.findIndex((l) => l.a === a && l.b === b && l.c === 'bad'); if (i >= 0) links.splice(i, 1); render(); }, 2800); return; }
    links.push({ a, b, c: '' }); render();
  }
  function say(n, text, bad = false) {
    canvas.querySelectorAll('.say').forEach((s) => s.remove());
    const el = document.createElement('div'); el.className = `say ${bad ? 'bad' : ''}`; el.textContent = text;
    const b = box(n.id); el.style.left = Math.min(n.x, canvas.clientWidth - 300) + 'px'; el.style.top = Math.min(n.y + b.h + 8, canvas.clientHeight - 44) + 'px';
    canvas.appendChild(el); setTimeout(() => el.remove(), 2800);
  }

  /* 서랍 — 고른 블록(닫으면 사라짐) */
  function side() {
    const el = $('#side'); const n = picked && nodes[picked];
    if (!n) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    const H = `<button class="x" type="button" aria-label="닫기" id="side-x">×</button><h2>${label(n)}</h2>`;
    if (n.kind === 'data') el.innerHTML = H + `<p class="lab">학습 데이터 자산에서</p>
      <div class="opt"><i class="${n.id === 'data1' ? 'on' : ''}"></i><span>비닐하우스 · 25cm 항공<small>있는 칸 27,247 + 없는 칸 8,000 · 검증 묶음 3,000칸은 뺌</small></span><span class="n">35,247장</span></div>
      <div class="opt"><i></i><span>비닐하우스 올린 묶음<small>09-30 · 건물 · 주차장 · 경작지 함께</small></span><span class="n">200장</span></div>
      <div class="opt new"><i></i><span>XI맵에서 고친 것<small>새 묶음 · 결과 확인에서 고친 것도</small></span><span class="n">0장</span></div>
      <p class="lab">분류</p><div class="opt"><i class="on"></i>비닐하우스</div>
      <p>묶음을 더 보태려면 학습 데이터 블록을 하나 더 놓고 같은 학습에 이어요 — 합쳐져서 들어가요.</p>`;
    else if (n.kind === 'base') el.innerHTML = H + `<p class="lab">지금 있는 모델</p>
      <div class="opt"><i class="r on"></i><span>원판 · 4종 모델<small>건물 · 주차장 · 경작지 · 비닐하우스 · 25cm 항공</small></span><span class="n">89%</span></div>
      <div class="opt"><i class="r"></i><span>두 번째 판<small>09-30 · 지금 서비스 중</small></span><span class="n">70%</span></div>
      <div class="opt"><i class="r"></i><span>다시 학습 판<small>10-08 · 후보</small></span><span class="n">90%</span></div>
      <p>기반 모델은 이미 배운 것을 품고 시작해요. 영상 해상도가 같은 모델이 좋아요. 둘을 나란히 보려면 학습 블록도 둘이어야 해요.</p>`;
    else if (n.kind === 'cfg') el.innerHTML = H + `<p class="lab">반복 횟수 <span class="num">20회</span> · 최대 50</p>
      <div class="seg"><span>3회</span><span>10회</span><span class="on">20회</span><span>직접</span></div>
      <p>많을수록 오래 걸려요 — 20회는 지난번 약 25시간(한 번 반복 약 75분)이었어요.</p>
      <p class="lab">이미지 크기</p><div class="seg"><span>640</span><span class="on">1280</span></div>
      <div class="note">지난 판과 견주려면 검증 묶음과 같은 크기여야 해요.</div>
      <p class="lab">한 번에</p><div class="seg"><span>4장</span><span class="on">8장</span></div>
      <div class="gpu">GPU 메모리는 관리자가 정한 한도 안에서 서버가 맞춰요 — 넘치면 줄여서 돌려요.</div>
      <p style="margin-top:10px">다른 설정으로 한 번 더 보려면 학습 설정 블록을 하나 더 놓고(D) 다른 학습에 이어요.</p>`;
    else if (n.kind === 'train') el.innerHTML = H + (live ? `<span class="verdict wait">학습 중 · 20회 중 12회째</span>
      <div class="kv" style="margin-top:10px"><b>시작</b><span class="num">10-07 18:34 · 밤 대기열</span><b>한 번 반복</b><span>약 75분</span><b>남은 시간</b><span>약 10시간</span><b>지금까지</b><span class="num">자체 검증 85%</span></div>
      <p>끝나면 평가 블록이 같은 검증 묶음 3,000칸으로 재고 알림을 보내요.</p>` :
      `<span class="verdict ok">끝남 · 10-08 19:12</span>
      <div class="kv" style="margin-top:10px"><b>학습 데이터</b><span class="num">35,247장</span><b>기반 모델</b><span>원판 · 4종 모델</span><b>설정</b><span>반복 20회 · 크기 1280 · 한 번에 8장</span><b>걸린 시간</b><span class="num">24시간 38분</span><b>학습 끝 검증</b><span class="num">90%</span></div>
      <p>같은 설정으로 다시 돌리거나, 학습 데이터 · 설정 블록을 바꿔 새로 돌릴 수 있어요(밤 대기열).</p>`) +
      `<div class="gpu">GPU는 LX 관리자가 배정해요 — 프로젝트 하나는 한 번에 GPU 한 장. 여기서 고르거나 바꿀 수 없어요.</div>`;
    else if (n.kind === 'eval') el.innerHTML = H + (live ? `<span class="verdict wait">학습이 끝나면 재요</span><p class="lab">어떻게 재나</p><p>학습에 안 쓴 같은 검증 묶음 3,000칸으로 재요. 결과는 AI 모델 정확도 한 줄이에요.</p>` :
      `<span class="verdict">10-08 · 원판보다 낮음 · 후보로 남음</span>
      <div class="kv" style="margin-top:10px"><b>같은 검증 묶음</b><span class="num">3,000칸</span><b>이 판</b><span class="num">87%</span><b>원판</b><span class="num">91%</span></div>
      <p>학습 중 자체 검증(90%)과 같은 검증 묶음 값(87%)은 다른 묶음으로 잰 값이에요. 배포 기준은 같은 검증 묶음 값이에요.</p>`);
    else if (n.kind === 'test') el.innerHTML = H + `<p class="lab">모델 판</p>
      <div class="opt"><i class="r"></i>원판 · 4종 모델<span class="n">89%</span></div><div class="opt"><i class="r"></i>두 번째 판<span class="n">서비스 중</span></div><div class="opt"><i class="r on"></i>다시 학습 판<span class="n">후보</span></div>
      <p class="lab">설정</p><div class="kv"><b>결과로 남길 기준</b><span class="seg" style="margin:0"><span>30%</span><span class="on">50%</span><span>70%</span></span><b>이미지 크기</b><span class="seg" style="margin:0"><span>640</span><span class="on">1280</span></span></div>
      <p class="lab">영상 하나</p><div class="opt"><i class="on r"></i>남원시 2023 · 25cm 항공<span class="n">등록 영상</span></div>
      <div class="thumb"><i style="left:22px;top:24px;width:70px;height:34px"></i><i style="left:120px;top:56px;width:52px;height:26px"></i><i style="left:200px;top:20px;width:64px;height:30px"></i><span>결과 보기 · 시안</span></div>
      <p style="margin-top:8px">배포 전 눈으로 보는 자리라 결과는 남기지 않아요.</p><span class="btn dark">시험 돌리기</span>`;
    else if (n.kind === 'deploy') el.innerHTML = H + `<span class="verdict">${live ? '평가가 끝나면 켜져요' : '지난 판보다 낮아 꺼져 있어요'}</span><p class="lab">그래도 신청하려면</p><p>사유를 적어 보내면 LX 관리자가 비교 값을 보고 판단해요.</p><span class="btn dim">사유 적고 신청</span>`;
    $('#side-x').addEventListener('click', () => { picked = null; render(); });
  }

  /* ── ② 이번 학습 — 반복마다 정확도 그래프 하나(실제 기록) + 핵심 수치 ── */
  let shown = live ? 1 : EPOCHS;
  const perf = $('#perf');
  function drawPerf() {
    const vals = MAP.slice(0, shown); let lo = Math.min(...vals), hi = Math.max(...vals); const pad = Math.max(2, (hi - lo) * 0.18); lo = Math.max(0, Math.floor(lo - pad)); hi = Math.min(100, Math.ceil(hi + pad));
    const Wd = 760, Hd = 220, L = 40, Rr = 48, T = 14, Bb = 26, pw = Wd - L - Rr, ph = Hd - T - Bb;
    const X = (e) => L + (e - 1) / (EPOCHS - 1) * pw, Y = (v) => T + (hi - v) / (hi - lo) * ph;
    let g = '';
    for (let i = 0; i <= 4; i++) { const v = lo + (hi - lo) * i / 4; g += `<line class="grid" x1="${L}" x2="${L + pw}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ax" x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${Math.round(v)}%</text>`; }
    for (const e of [1, 5, 10, 15, 20]) g += `<text class="ax" x="${X(e)}" y="${Hd - 8}" text-anchor="middle">${e}회</text>`;
    const pts = vals.map((v, i) => [X(i + 1), Y(v)]);
    g += `<path class="area" d="M${pts[0][0]},${Y(lo)} ${pts.map((p) => 'L' + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')} L${pts[pts.length - 1][0]},${Y(lo)} Z"/>`;
    g += `<path class="ser" d="${pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}"/>`;
    pts.slice(0, -1).forEach((p) => { g += `<circle class="dotp" cx="${p[0]}" cy="${p[1]}" r="2"/>`; });
    const last = pts[pts.length - 1]; g += `<circle class="dot" cx="${last[0]}" cy="${last[1]}" r="4.5"/><text class="lbl" x="${last[0] + 8}" y="${last[1] - 6}">${Math.round(vals[vals.length - 1])}%</text>`;
    perf.innerHTML = `<div class="ph"><h2>이번 학습 · 반복마다 정확도</h2><p>${live ? '20회 중 12회째 · 반복마다 자체 검증 1,762장으로 잰 값' : '10-07 18:34 → 10-08 19:12 · 반복 20회 · 반복마다 자체 검증 1,762장으로 잰 값'}</p><span class="big">${Math.round(vals[vals.length - 1])}%<small>${live ? '지금까지' : '학습 끝 검증'}</small></span></div>
      <div class="plot"><svg viewBox="0 0 ${Wd} ${Hd}" preserveAspectRatio="none" id="svg">${g}<line class="cross" id="cross" y1="${T}" y2="${T + ph}" style="display:none"/></svg><div class="tip" id="tip" style="display:none"></div></div>
      <p class="foot">${live ? '한 번 반복에 약 75분 · 남은 시간 약 10시간 · 끝나면 같은 검증 묶음 3,000칸으로 한 번 더 재요' : '학습이 끝난 뒤 같은 검증 묶음 3,000칸으로 잰 값은 87% — 배포 기준은 이 값이에요'}</p>`;
    const svg = $('#svg'), tip = $('#tip'), cross = $('#cross');
    svg.addEventListener('mousemove', (e) => { const r = svg.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width * Wd; const ep = Math.round((x - L) / pw * (EPOCHS - 1)) + 1;
      if (ep < 1 || ep > shown) { tip.style.display = cross.style.display = 'none'; return; }
      cross.style.display = ''; cross.setAttribute('x1', X(ep)); cross.setAttribute('x2', X(ep));
      tip.textContent = `반복 ${ep}회 · ${MAP[ep - 1]}%`; tip.style.display = ''; tip.style.left = Math.min(X(ep) / Wd * r.width + 10, r.width - 130) + 'px'; tip.style.top = (e.clientY - r.top - 36) + 'px'; });
    svg.addEventListener('mouseleave', () => { tip.style.display = cross.style.display = 'none'; });
  }
  drawPerf();
  if (live) { const t = setInterval(() => { shown++; if (shown >= LIVE_EPOCH) { shown = LIVE_EPOCH; clearInterval(t); } drawPerf(); }, 180); }
  $('#keys').innerHTML = `<h2>핵심 수치<span class="st ${live ? 'live' : 'down'}">${live ? '학습 중' : '끝남 · 후보로 남음'}</span></h2>
    <div class="kv"><b>학습 데이터</b><span class="num">35,247장</span><b>기반 모델</b><span class="num" style="font-family:var(--font-body);font-weight:400">원판 · 4종 모델</span><b>반복 · 크기 · 한 번에</b><span class="num">20회 · 1280 · 8장</span>
    <b>${live ? '지금까지' : '학습 끝 검증'}</b><span class="num">${live ? '85%' : '90%'}</span><b>같은 검증 묶음</b><span class="num ${live ? '' : 'down'}">${live ? '끝나면' : '87% (원판 91%)'}</span><b>${live ? '남은 시간' : '걸린 시간'}</b><span class="num">${live ? '약 10시간' : '24시간 38분'}</span></div>
    <p class="gpu">GPU — LX 관리자가 배정 · 프로젝트 하나에 한 장 · 밤 대기열</p>`;

  /* ── ③ 학습 이력 — 목록(판 · 날짜 · AI 모델 정확도 · 학습 데이터 n장 · 상태) ── */
  $('#hist').innerHTML = `<h2>학습 이력<small>이 프로젝트 · 최근 순 · AI 모델 정확도는 학습 끝 검증 값</small></h2>
    <table class="tbl"><thead><tr><th>날짜</th><th>판</th><th class="num">AI 모델 정확도</th><th class="num">학습 데이터</th><th>상태</th></tr></thead><tbody>` +
    HIST.map((h) => `<tr class="${h.now ? 'is-now' : ''}"><td class="num">${h.when}</td><td>${h.name}<small>${h.how}</small></td><td class="num"><b>${Math.round(h.acc)}%</b>${h.same ? `<small>같은 검증 묶음 ${Math.round(h.same)}%</small>` : ''}</td><td class="num">${h.n ? nf(h.n) + '장' : '—'}</td><td><span class="st ${h.st[0]}">${h.st[1]}</span></td></tr>`).join('') + `</tbody></table>`;

  render();
})();
