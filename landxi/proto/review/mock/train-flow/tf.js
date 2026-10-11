/* 설계 20차 · 학습 = AI 모델 작업 흐름(원칙 183) 시안 — 서버 호출 0 · 코드 수정 0 · GPU 0.
   ?v=start  처음 연 프로젝트(주차장 2026) — 기본 흐름이 이미 놓여 있고 학습 데이터만 고르면 돌릴 수 있다
   ?v=run    실제 기록(비닐하우스 2026 · 10-07~08 다시 학습 · 원판 91% → 이 판 87% · 후보로 남음) — 판 계보까지
   ?v=settings  학습 설정 펼침(기본값 · 고급) + 추론 시험 블록을 더한 흐름
   ?v=wrong  잘못 이었을 때 — 그 자리에 왜 안 되는지 한 문장
   끌어다 놓기 · 선 잇기(출구 ○ 누르고 다음 블록 누름)는 실제로 움직인다. 숫자는 10-07~08 · 09-30 실제 기록만. */
(() => {
  const q = new URLSearchParams(location.search); const V = q.get('v') || 'start';
  const $ = (s, r = document) => r.querySelector(s);
  const now = new Date(); const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  $('#clock').textContent = hm; $('#stampT').textContent = `${now.getMonth() + 1}-${String(now.getDate()).padStart(2, '0')} ${hm}`;

  /* 블록 종류 — 이름은 글자(아이콘 0) · 사람 말 */
  const KIND = {
    data: ['학습 데이터', '학습 데이터 자산에서 · 클래스 고르기'],
    base: ['기반 모델', '지금 있는 모델에서'],
    cfg: ['학습 설정', '기본값 그대로 · 펼치면 고급'],
    train: ['학습', 'GPU 한 장 · 밤 · 대기열'],
    eval: ['평가', '같은 검증 묶음 · 지난 판과 비교'],
    test: ['추론 시험', '영상 하나 · 결과 보기'],
    deploy: ['배포 신청', '나아진 판만'],
  };
  const ALLOW = { train: ['data', 'base', 'cfg'], eval: ['train'], test: ['train', 'base'], deploy: ['eval'] };
  const WHY = {
    train: '학습에는 학습 데이터 · 기반 모델 · 학습 설정만 들어와요',
    eval: '평가는 학습이 끝난 모델에만 이어요',
    test: '추론 시험은 학습한 모델이나 기반 모델에 이어요',
    deploy: '배포 신청은 평가를 거친 판만 이어요',
    data: '이 블록 앞에는 아무것도 오지 않아요', base: '이 블록 앞에는 아무것도 오지 않아요', cfg: '이 블록 앞에는 아무것도 오지 않아요',
  };
  const P = { data: [20, 36], base: [20, 150], cfg: [20, 264], train: [204, 150], eval: [388, 150], deploy: [572, 150], test: [388, 300] };
  const W = 160;

  /* 변형마다 — 프로젝트 · 블록 상태 · 선 · 고른 블록 · 계보 */
  const VARS = {
    start: {
      project: '주차장 2026', next: '학습 데이터 고르기', stage: 2, hint: '기본 흐름이 놓여 있어요 · 학습 데이터만 고르면 돌릴 수 있어요', go: ['밤에 돌리기', false],
      nodes: {
        data: { cls: 'need', line: '학습 데이터를 고르세요' },
        base: { line: '주차장 원판' },
        cfg: { line: '기본값 · 반복 3회' },
        train: { line: '밤 · 대기열 · GPU 한 장' },
        eval: { line: '검증 묶음 3,000칸' },
        deploy: { line: '나아진 판만' },
      },
      links: [['data', 'train'], ['base', 'train'], ['cfg', 'train'], ['train', 'eval'], ['eval', 'deploy']],
      pick: 'data',
      lineage: [
        { t: '주차장 원판', s: '서비스 중 · 25cm 항공', n: '89%', cls: 'live' },
        { t: '09-30 학습', s: '작은 표본 170장 · 반복 3회', n: '40%', nc: 'down', s2: '원판보다 낮아 후보로 남음' },
        { t: '다음 판', s: '이 흐름으로 · 아직', n: '—', cls: 'ghost' },
      ],
    },
    run: {
      project: '비닐하우스 2026', next: '사유 적고 신청 · 또는 다시 학습', stage: 2, hint: '10-08 19:12 끝남 · 지난 판보다 낮아 후보로 남았어요', go: ['다시 돌리기', true],
      nodes: {
        data: { line: '25cm 항공 · 35,485칸', tag: 'XI맵에서 고친 것 0칸' },
        base: { line: '비닐하우스 원판' },
        cfg: { line: '반복 20회 · 한 번에 8장' },
        train: { line: '끝남 · 약 25시간 · GPU 한 장', tag: '10-08 19:12 끝' },
        eval: { line: '같은 검증 묶음 3,000칸', pct: ['91%', '87%', 'down'], tag: '나아지지 않음' },
        deploy: { cls: 'off', line: '지난 판보다 낮아 꺼짐' },
      },
      links: [['data', 'train'], ['base', 'train'], ['cfg', 'train'], ['train', 'eval'], ['eval', 'deploy', 'off']],
      pick: 'eval',
      lineage: [
        { t: '비닐하우스 원판', s: '서비스 중 · 25cm 항공', n: '91%', cls: 'live' },
        { t: '10-08 다시 학습', s: '35,485칸 · 반복 20회', n: '87%', nc: 'down', s2: '원판보다 낮아 후보로 남음' },
        { t: '다음 판', s: 'XI맵에서 고친 칸이 쌓이면 · 아직', n: '—', cls: 'ghost' },
      ],
    },
    settings: {
      project: '비닐하우스 2026', next: '밤에 돌리기', stage: 2, hint: '학습 설정을 펼쳤어요 · 추론 시험 블록을 더했어요', go: ['밤에 돌리기', true],
      nodes: {
        data: { line: '25cm 항공 · 35,485칸', tag: 'XI맵에서 고친 것 0칸' },
        base: { line: '비닐하우스 원판' },
        cfg: { cls: 'on', line: '반복 20회 · 이미지 크기 640 · 한 번에 8장' },
        train: { line: '밤 · 대기열 · GPU 한 장' },
        eval: { line: '검증 묶음 3,000칸' },
        test: { line: '남원시 2025 영상 하나' },
        deploy: { line: '나아진 판만' },
      },
      links: [['data', 'train'], ['base', 'train'], ['cfg', 'train'], ['train', 'eval'], ['train', 'test'], ['eval', 'deploy']],
      pick: 'cfg', adv: true,
      lineage: [
        { t: '비닐하우스 원판', s: '서비스 중 · 25cm 항공', n: '91%', cls: 'live' },
        { t: '10-08 다시 학습', s: '35,485칸 · 반복 20회', n: '87%', nc: 'down', s2: '원판보다 낮아 후보로 남음' },
        { t: '다음 판', s: '이 흐름으로 · 아직', n: '—', cls: 'ghost' },
      ],
    },
    wrong: {
      project: '비닐하우스 2026', next: '선 다시 잇기', stage: 2, hint: '잘못 이으면 그 자리에서 알려 줘요', go: ['밤에 돌리기', false],
      nodes: {
        data: { line: '25cm 항공 · 35,485칸' },
        base: { line: '비닐하우스 원판' },
        cfg: { line: '기본값 · 반복 3회' },
        train: { line: '밤 · 대기열 · GPU 한 장' },
        eval: { line: '검증 묶음 3,000칸' },
        deploy: { cls: 'bad', line: '평가 뒤에 이어요', why: true },
      },
      links: [['data', 'train'], ['base', 'train'], ['cfg', 'train'], ['train', 'eval'], ['data', 'deploy', 'bad']],
      pick: null, badSay: ['deploy', '배포 신청은 평가를 거친 판만 이어요'],
      lineage: [
        { t: '비닐하우스 원판', s: '서비스 중 · 25cm 항공', n: '91%', cls: 'live' },
        { t: '10-08 다시 학습', s: '35,485칸 · 반복 20회', n: '87%', nc: 'down', s2: '원판보다 낮아 후보로 남음' },
        { t: '다음 판', s: '이 흐름으로 · 아직', n: '—', cls: 'ghost' },
      ],
    },
  };
  const S = VARS[V] || VARS.start;
  const nodes = {}; for (const k in S.nodes) nodes[k] = { kind: k, x: P[k][0], y: P[k][1], ...S.nodes[k] };
  const links = S.links.map(([a, b, c]) => ({ a, b, c }));
  let picked = S.pick, from = null;

  /* 단계 막대 */
  const ST = ['데이터 올리기', '학습데이터 구축', '학습', '결과 확인', '배포 신청', '서비스 관리'];
  $('#stages').innerHTML = `<div class="pj"><small>프로젝트</small><b>${S.project}</b></div>` +
    ST.map((t, i) => `${i ? '<span class="line"></span>' : ''}<span class="st ${i < S.stage ? 'done' : i === S.stage ? 'on' : ''}"><i>${i < S.stage ? '✓' : i + 1}</i>${t}</span>`).join('') +
    `<span class="sp"></span><div class="pj" style="width:auto;text-align:right"><small>다음 할 일</small><b>${S.next}</b></div>`;
  $('#hint').textContent = S.hint;
  const go = $('#go'); go.textContent = S.go[0]; go.classList.toggle('off', !S.go[1]);

  /* 왼쪽 블록 목록 — 끌어다 놓기 */
  const list = $('#blocks');
  list.innerHTML = `<h2>블록</h2><p class="how">끌어다 판에 놓고, 출구 ○ 를 누른 뒤 다음 블록을 눌러 이어요</p>` +
    Object.keys(KIND).map((k) => `<div class="blk ${nodes[k] ? 'used' : ''}" draggable="true" data-k="${k}"><b>${KIND[k][0]}</b><small>${KIND[k][1]}</small></div>`).join('');
  list.querySelectorAll('.blk').forEach((el) => {
    el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', el.dataset.k); el.classList.add('drag'); });
    el.addEventListener('dragend', () => el.classList.remove('drag'));
  });
  const canvas = $('#canvas');
  canvas.addEventListener('dragover', (e) => { e.preventDefault(); canvas.classList.add('over'); });
  canvas.addEventListener('dragleave', () => canvas.classList.remove('over'));
  canvas.addEventListener('drop', (e) => {
    e.preventDefault(); canvas.classList.remove('over');
    const k = e.dataTransfer.getData('text/plain'); if (!KIND[k]) return;
    const r = canvas.getBoundingClientRect();
    if (nodes[k]) { say(nodes[k], '이 블록은 이미 판에 있어요 — 한 흐름에 하나씩', true); return; }
    nodes[k] = { kind: k, x: Math.max(8, e.clientX - r.left - W / 2), y: Math.max(8, e.clientY - r.top - 24), line: KIND[k][1] };
    picked = k; list.querySelector(`[data-k="${k}"]`).classList.add('used'); render();
  });

  /* 판 그리기 */
  const wires = $('#wires');
  function render() {
    canvas.querySelectorAll('.node,.say').forEach((n) => n.remove());
    for (const n of Object.values(nodes)) {
      const el = document.createElement('div');
      el.className = `node ${n.cls || ''} ${picked === n.kind ? 'on' : ''} ${from === n.kind ? 'on' : ''}`; el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; el.dataset.k = n.kind;
      el.innerHTML = `${['data', 'base', 'cfg'].includes(n.kind) ? '' : '<i class="port in"></i>'}<b>${KIND[n.kind][0]}</b>` +
        (n.pct ? `<small><span class="pct">${n.pct[0]}</span> → <span class="pct ${n.pct[2]}">${n.pct[1]}</span></small>` : '') +
        `<small class="${n.why ? 'why' : ''}">${n.line}</small>` + (n.tag ? `<span class="tag ${/XI맵/.test(n.tag) ? 'new' : ''}">${n.tag}</span>` : '') +
        `${['deploy', 'test'].includes(n.kind) ? '' : '<i class="port"></i>'}`;
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('port') && !e.target.classList.contains('in')) { from = from === n.kind ? null : n.kind; render(); return; }
        if (from && from !== n.kind) { connect(from, n.kind); from = null; return; }
        if (from === n.kind) { say(n, '같은 블록끼리는 이을 수 없어요', true); from = null; render(); return; }
        picked = n.kind; render();
      });
      canvas.appendChild(el);
    }
    drawWires();
    if (S.badSay && !canvas.querySelector('.say')) { say(nodes[S.badSay[0]], S.badSay[1], true, true); S.badSay = null; }
    side();
  }
  function box(k) { const el = canvas.querySelector(`.node[data-k="${k}"]`); return { x: nodes[k].x, y: nodes[k].y, w: el.offsetWidth, h: el.offsetHeight }; }
  function drawWires() {
    wires.innerHTML = links.map((l) => {
      const a = box(l.a), b = box(l.b); const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2; const dx = Math.max(40, (x2 - x1) / 2);
      return `<path class="${l.c || ''}" d="M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}"/>`;
    }).join('');
  }
  function connect(a, b) {
    if (links.some((l) => l.a === a && l.b === b)) { say(nodes[b], '이미 이어져 있어요'); render(); return; }
    if (!(ALLOW[b] || []).includes(a)) { nodes[b].cls = 'bad'; links.push({ a, b, c: 'bad' }); render(); say(nodes[b], WHY[b], true);
      setTimeout(() => { nodes[b].cls = ''; links.splice(links.findIndex((l) => l.a === a && l.b === b && l.c === 'bad'), 1); render(); }, 2600); return; }
    links.push({ a, b }); render();
  }
  function say(n, text, bad = false, keep = false) {
    canvas.querySelectorAll('.say').forEach((s) => s.remove());
    const el = document.createElement('div'); el.className = `say ${bad ? 'bad' : ''}`; el.textContent = text;
    const b = box(n.kind); el.style.left = Math.min(n.x, canvas.clientWidth - 300) + 'px'; el.style.top = (n.y + b.h + 8) + 'px';
    canvas.appendChild(el); if (!keep) setTimeout(() => el.remove(), 2600);
  }

  /* 오른쪽 — 고른 블록 */
  function side() {
    const el = $('#side'); const n = picked && nodes[picked];
    if (!n) { el.innerHTML = `<h2>블록을 고르세요</h2><p class="empty">판의 블록을 누르면 여기서 고르고 바꿔요</p>`; return; }
    const H = `<h2>${KIND[n.kind][0]}</h2>`;
    const pct = (v) => `<span class="num">${v}</span>`;
    if (n.kind === 'data') {
      const run = V !== 'start';
      el.innerHTML = H + `<p class="lab">학습 데이터 자산에서</p>` + (run ?
        `<div class="opt"><i class="on"></i><span>비닐하우스 · 25cm 항공<small>없는 칸 8,000 포함 · AI 허브 토지피복</small></span><span class="n">35,485칸</span></div>
        <div class="opt"><i></i><span>비닐하우스 표본<small>올린 묶음</small></span><span class="n">200장</span></div>` :
        `<div class="opt"><i></i><span>주차장 표본<small>올린 묶음 · 09-30</small></span><span class="n">170장</span></div>
        <div class="opt"><i></i><span>토지피복 · 25cm 항공<small>주차장 포함 · AI 허브</small></span><span class="n">자산 등록 뒤</span></div>`) +
        `<div class="opt new"><i></i><span>XI맵에서 고친 것<small>새 묶음 · 결과 확인에서 고친 것도</small></span><span class="n">0칸</span></div>
        <p>고친 칸이 쌓이면 새 묶음으로 여기 들어와요. 검증 묶음 3,000칸은 학습에서 빼고 평가에만 써요.</p>
        <p class="lab">클래스 고르기</p>
        <div class="opt"><i class="on"></i>${run ? '비닐하우스' : '주차장'}</div>
        <div class="opt dim"><i></i><span>건물 · 경작지 · ${run ? '주차장' : '비닐하우스'}<small>이 묶음에 없음 · 무시</small></span></div>
        <p>고른 묶음에 없는 클래스는 틀린 것으로 세지 않아요(빠진 클래스는 무시).</p>`;
    } else if (n.kind === 'base') {
      el.innerHTML = H + `<p class="lab">지금 있는 모델</p>
        <div class="opt"><i class="on r"></i>${S.project.split(' ')[0]} 원판 · 25cm 항공<span class="n">서비스 중</span></div>
        <div class="opt"><i class="r"></i>건물 · 주차장 · 경작지 · 비닐하우스 함께 보는 모델<span class="n">25cm 항공</span></div>
        <div class="opt"><i class="r"></i>지난 판에서 이어서<span class="n">${V === 'start' ? '09-30 학습' : '10-08 다시 학습'}</span></div>
        <p>기반 모델은 이미 배운 것을 품고 시작해요. 영상 해상도가 같은 모델을 고르면 좋아요.</p>`;
    } else if (n.kind === 'cfg') {
      const adv = S.adv;
      el.innerHTML = H + `<p class="lab">기본값 그대로</p>
        <div class="kv"><b>반복 횟수</b><span class="num">${adv ? 20 : 3}회</span><b>이미지 크기</b><span class="num">640</span><b>한 번에</b><span class="num">${adv ? 8 : 4}장</span></div>
        <div class="adv ${adv ? 'open' : ''}">${adv ? '고급 접기' : '고급 펼치기'}</div>` + (!adv ? '' : `
        <p class="lab">반복 횟수 <span class="num">20회</span> · 최대 50</p>
        <div class="range"><div class="bar"><i style="width:40%"></i><b style="left:40%"></b></div></div>
        <p>많을수록 오래 걸려요 — 20회는 지난번 약 25시간이었어요.</p>
        <p class="lab">이미지 크기</p><div class="seg"><span class="on">640</span><span>1280</span></div>
        <div class="note">검증 묶음과 같은 크기여야 지난 판과 비교돼요. 크기가 다르면 같은 모델도 62% · 68%처럼 갈려요.</div>
        <p class="lab">한 번에</p><div class="seg"><span>4장</span><span class="on">8장</span></div>
        <p>GPU 한 장의 메모리 안에서만 — 넘치면 서버가 줄여서 돌려요.</p>`);
    } else if (n.kind === 'train') {
      el.innerHTML = H + (V === 'run' ? `<p class="lab">이번 학습</p><div class="kv"><b>시작</b><span class="num">10-07 18:34 · 밤 대기열</span><b>끝</b><span class="num">10-08 19:12</span><b>걸린 시간</b><span>약 25시간</span><b>GPU</b><span>한 장 · 밤 대기열</span></div>` :
        `<p class="lab">어떻게 돌아가나</p><p>밤 시간에 작업 대기열에서 한 건씩, GPU 한 장으로 돌아요. 다른 무거운 작업이 돌고 있으면 기다려요.</p><p class="lab">끝나면</p><p>평가 블록이 같은 검증 묶음으로 지난 판과 재고, 결과를 알림으로 보내요.</p>`);
    } else if (n.kind === 'eval') {
      el.innerHTML = H + (V === 'run' ? `<p class="lab">같은 검증 묶음 3,000칸 · 지난 판과</p>
        <div class="big"><span>91%</span><span class="to">→</span><span class="down">87%</span></div>
        <span class="verdict">나아지지 않음 · 후보로 남음</span>
        <p class="lab">자세히</p>
        <div class="kv"><b>찾은 것 중 맞음</b><span>${pct('87%')} → ${pct('84%')}</span><b>있는 것 중 찾음</b><span>${pct('86%')} → ${pct('81%')}</span></div>
        <p>기준은 AI 모델 정확도 하나예요. 지난 판보다 낮으면 배포 신청이 꺼지고, 사유를 적으면 관리자 판단으로 넘길 수 있어요.</p>` :
        `<p class="lab">어떻게 재나</p><p>학습에 안 쓴 같은 검증 묶음 3,000칸으로 지난 판과 같은 설정에서 재요. 결과는 AI 모델 정확도 한 줄이에요.</p>`);
    } else if (n.kind === 'test') {
      el.innerHTML = H + `<p class="lab">영상 하나</p><div class="opt"><i class="on r"></i>남원시 2025 · 25cm 항공<span class="n">등록 영상</span></div>
        <div class="thumb"><i style="left:22px;top:28px;width:70px;height:34px"></i><i style="left:120px;top:60px;width:52px;height:26px"></i><i style="left:200px;top:22px;width:64px;height:30px"></i><span>결과 보기 · 시안</span></div>
        <p>학습이 끝난 모델로 영상 하나를 돌려 결과를 눈으로 봐요. 배포 전 확인용이라 결과는 남기지 않아요.</p>`;
    } else if (n.kind === 'deploy') {
      el.innerHTML = H + (V === 'run' ? `<span class="verdict">지난 판보다 낮아 꺼져 있어요</span><p class="lab">그래도 신청하려면</p><p>사유를 적어 보내면 LX 관리자가 비교 값을 보고 판단해요.</p><span class="btn dim">사유 적고 신청</span>` :
        `<p class="lab">나아진 판만</p><p>평가에서 지난 판보다 나아지면 신청서가 비교 값으로 미리 채워져요. 보내면 LX 관리자가 승인하고 서비스 새 판이 돼요.</p>`);
    }
  }

  /* 판 계보 */
  $('#lineage').innerHTML = `<h2>이 흐름으로 만든 판 <small>${S.project}</small></h2><div class="vers">` +
    S.lineage.map((v, i) => `${i ? '<span class="arrow">→</span>' : ''}<div class="ver ${v.cls || ''}"><b>${v.t}</b><small>${v.s}</small><div class="n ${v.nc || ''}">${v.n}</div>${v.s2 ? `<small>${v.s2}</small>` : ''}</div>`).join('') + '</div>';

  render();
})();
