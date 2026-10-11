/* 설계 21차 · 학습 = AI 모델 작업 흐름 2차 시안(원칙 183 · 200) — 서버 호출 0 · 코드 수정 0 · GPU 0.
   ?v=start    처음 연 프로젝트(주차장 2026) — 기본 흐름이 놓여 있고 학습 데이터만 고르면 돌릴 수 있다 · 아래 판엔 지난 학습 기록(09-30 실험 둘)
   ?v=live     학습 중(비닐하우스 2026 · 10-07~08 다시 학습 · 20회 중 12회째) — 에포크별 그래프가 실시간으로 차오르고 원판 기준선과 겹쳐 보임
   ?v=compare  실험 둘 나란히(주차장 · 실험 A 원판에서 3회 · 실험 B 실험 A 판에서 이어 3회) — 학습 데이터 둘 합침 · 평가 한 표 비교
   ?v=test     추론 시험 블록 — 모델 판(실험 A · B · 원판)과 설정을 골라 영상 하나로 돌림
   ?v=wrong    잘못 이었을 때 — 그 자리에 문장 하나(기반 모델 둘을 학습 하나에 · 학습 데이터 → 배포 신청)
   끌어다 놓기 · 선 잇기(출구 ○ 누르고 다음 블록) · 같은 블록 여러 개 · D 복제 · Delete 지우기 · 선 누르면 끊기 — 실제로 움직인다.
   숫자는 실제 기록만: 02. 데이터/models/trained/job_01M4AVD8…/results.csv(비닐하우스 20회), job_01M3RCHB…(주차장 실험 A 3회), job_01M3RG60…(실험 B 3회),
   training/retrain/progress.json(같은 검증 묶음 3,000칸 · 원판 90.6% → 이 판 87.3%). 그래프의 학습 중 값은 학습 묶음 안 자체 검증(비닐하우스 1,762칸) 값. */
(() => {
  const q = new URLSearchParams(location.search); const V = q.get('v') || 'start';
  const $ = (s, r = document) => r.querySelector(s);
  const now = new Date(); const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  $('#clock').textContent = hm; $('#stampT').textContent = `${now.getMonth() + 1}-${String(now.getDate()).padStart(2, '0')} ${hm}`;

  /* ── 실제 기록 ── */
  const GH = { // 비닐하우스 다시 학습 10-07 18:34 → 10-08 19:12 · 20회 · 자체 검증 1,762칸
    map: [80.1, 78.2, 72.3, 75.7, 77.3, 78.3, 79.6, 81.6, 82.7, 83.4, 84.1, 85.1, 85.7, 87.2, 87.4, 88.3, 88.5, 89.3, 89.4, 89.9],
    p: [75.4, 70.5, 66.6, 68.0, 69.7, 70.3, 72.6, 74.2, 75.8, 77.4, 78.1, 78.2, 79.2, 82.2, 82.7, 83.1, 83.6, 85.4, 85.6, 87.3],
    r: [77.0, 80.4, 75.1, 77.8, 79.2, 80.1, 81.2, 82.3, 81.6, 82.0, 82.3, 82.8, 83.0, 82.3, 83.2, 84.0, 84.8, 84.8, 84.6, 83.8],
    loss: [1.049, 1.146, 1.281, 1.329, 1.244, 1.186, 1.139, 1.103, 1.069, 1.041, 1.043, 1.007, 0.977, 0.958, 0.927, 0.904, 0.880, 0.855, 0.833, 0.810],
  };
  const PA = { map: [57.9, 63.6, 66.3], p: [56.5, 69.8, 75.7], r: [60.1, 61.3, 58.3], loss: [2.216, 1.963, 1.866] }; // 주차장 실험 A · 09-30 · 원판에서 3회
  const PB = { map: [66.1, 68.6, 70.0], p: [68.5, 69.4, 70.5], r: [63.2, 64.3, 66.7], loss: [1.564, 1.634, 1.703] }; // 주차장 실험 B · 09-30 · 실험 A 판에서 이어 3회
  const LIVE_EPOCH = 12; // 학습 중 장면 — 20회 중 12회째

  /* ── 블록 종류(이름은 글자 · 사람 말) ── */
  const KIND = {
    data: ['학습 데이터', '여러 개 — 합쳐져요'],
    base: ['기반 모델', '학습마다 하나'],
    cfg: ['학습 설정', '실험마다 달리'],
    train: ['학습', '여러 개 = 실험'],
    eval: ['평가', '실험 한 표 비교'],
    test: ['추론 시험', '모델 판 · 설정 고름'],
    deploy: ['배포 신청', '나아진 판만'],
  };
  const IN = { train: ['data', 'base', 'cfg'], eval: ['train'], test: ['train', 'base'], deploy: ['eval'] };
  const ONE = { train: ['base', 'cfg'] }; // 학습 하나에 하나만 들어오는 블록
  const WHY = {
    train: '학습에는 학습 데이터 · 기반 모델 · 학습 설정만 들어와요',
    eval: '평가는 학습이 끝난 모델에만 이어요',
    test: '추론 시험은 학습한 모델이나 기반 모델에 이어요',
    deploy: '배포 신청에는 평가만 이어요',
    data: '학습 데이터 앞에는 아무것도 오지 않아요', base: '기반 모델 앞에는 아무것도 오지 않아요', cfg: '학습 설정 앞에는 아무것도 오지 않아요',
  };
  const ONE_WHY = { base: '학습 하나에 기반 모델은 하나만 — 둘을 나란히 보려면 학습 블록을 하나 더 놓아요', cfg: '학습 하나에 학습 설정은 하나만 — 설정을 바꿔 보려면 학습 블록을 하나 더 놓아요' };
  const W = 158, C0 = 16, C1 = 222, C2 = 418, C3 = 614, R = [16, 100, 184, 268, 352];

  /* ── 변형 ── */
  const PARK_LIN = { cls: 'live' };
  const VARS = {
    start: {
      project: '주차장 2026', stage: 2, hint: '기본 흐름이 놓여 있어요 · 학습 데이터만 고르면 돌릴 수 있어요', go: ['밤에 돌리기', false], pick: 'data1',
      nodes: {
        data1: { kind: 'data', x: C0, y: R[0], cls: 'need', line: '학습 데이터를 고르세요' },
        base1: { kind: 'base', x: C0, y: R[1], line: '주차장 원판' },
        cfg1: { kind: 'cfg', x: C0, y: R[2], line: '반복 3회 · 크기 640 · 한 번에 4장' },
        train1: { kind: 'train', x: C1, y: R[1], line: '밤 시간 · 대기열 비어 있음' },
        eval1: { kind: 'eval', x: C2, y: R[1], line: '같은 검증 묶음 3,000칸' },
        deploy1: { kind: 'deploy', x: C3, y: R[1], line: '나아진 판만' },
      },
      links: [['data1', 'train1'], ['base1', 'train1'], ['cfg1', 'train1'], ['train1', 'eval1'], ['eval1', 'deploy1']],
      perf: { title: '지난 학습 기록 · 주차장', sub: '09-30 실험 둘 · 반복 3회씩 · 자체 검증 값', series: [['A', '실험 A', PA, 3], ['B', '실험 B', PB, 3]], ref: ['주차장 원판 89%', 89], max: 3,
        leg: [['A', '실험 A · 원판에서 3회', '09-30 · 170장', '66%'], ['B', '실험 B · A 판에서 이어 3회', '09-30 · 170장', '70%'], ['dash', '주차장 원판', '같은 검증 묶음 3,000칸', '89%']] },
    },
    live: {
      project: '비닐하우스 2026', stage: 2, hint: '학습 중 · 20회 중 12회째 · 한 번 반복에 약 75분', go: ['멈추기', true], pick: 'train1', live: true,
      nodes: {
        data1: { kind: 'data', x: C0, y: R[0], line: '25cm 항공 · 35,485칸', tag: 'XI맵에서 고친 것 0칸' },
        base1: { kind: 'base', x: C0, y: R[1], line: '비닐하우스 원판' },
        cfg1: { kind: 'cfg', x: C0, y: R[2], line: '반복 20회 · 크기 1280 · 한 번에 8장' },
        train1: { kind: 'train', x: C1, y: R[1], cls: 'live', line: '학습 중 · 12 / 20회', bar: 60, tag: '10-07 18:34 시작 · GPU 한 장' },
        eval1: { kind: 'eval', x: C2, y: R[1], line: '끝나면 같은 검증 묶음으로' },
        deploy1: { kind: 'deploy', x: C3, y: R[1], cls: 'off', line: '평가 뒤에 켜져요' },
      },
      links: [['data1', 'train1'], ['base1', 'train1'], ['cfg1', 'train1'], ['train1', 'eval1', 'A'], ['eval1', 'deploy1', 'off']],
      perf: { title: '학습 진행 · 비닐하우스', sub: '반복마다 자체 검증 1,762칸 값 · 끝나면 같은 검증 묶음 3,000칸으로 원판과 비교해요', series: [['A', '이번 학습', GH, LIVE_EPOCH]], ref: ['비닐하우스 원판 91% · 같은 검증 묶음', 90.6], max: 20, live: true,
        leg: [['A', '이번 학습 · 12회째', '반복 20회 · 크기 1280', null], ['dash', '비닐하우스 원판', '같은 검증 묶음 3,000칸', '91%']] },
    },
    compare: {
      project: '주차장 2026', stage: 2, hint: '실험 둘이 끝났어요 · 평가가 한 표로 비교해요', go: ['다시 돌리기', true], pick: 'eval1',
      nodes: {
        data1: { kind: 'data', x: C0, y: R[0], line: '주차장 표본 · 170장' },
        data2: { kind: 'data', x: C0, y: R[1], line: 'XI맵에서 고친 것 · 0칸', tag: '쌓이면 합쳐져요' },
        base1: { kind: 'base', x: C0, y: R[2], line: '주차장 원판', ex: 'A' },
        base2: { kind: 'base', x: C0, y: R[3], line: '실험 A 판에서 이어서', ex: 'B' },
        cfg1: { kind: 'cfg', x: C0, y: R[4], line: '반복 3회 · 크기 640 · 한 번에 4장' },
        train1: { kind: 'train', x: C1, y: 96, ex: 'A', line: '끝남 · 09-30 · 3회', num: '66%' },
        train2: { kind: 'train', x: C1, y: 262, ex: 'B', line: '끝남 · 09-30 · 3회', num: '70%' },
        eval1: { kind: 'eval', x: C2, y: 180, line: '실험 둘 · 같은 검증 묶음', tag: '원판보다 낮음' },
        deploy1: { kind: 'deploy', x: C3, y: 180, cls: 'off', line: '지난 판보다 낮아 꺼짐' },
      },
      links: [['data1', 'train1'], ['data2', 'train1'], ['data1', 'train2'], ['data2', 'train2'], ['base1', 'train1'], ['base2', 'train2'], ['cfg1', 'train1'], ['cfg1', 'train2'], ['train1', 'eval1', 'A'], ['train2', 'eval1', 'B'], ['eval1', 'deploy1', 'off']],
      perf: { title: '실험 비교 · 주차장', sub: '09-30 실험 둘 · 반복 3회씩 · 자체 검증 값 · 원판은 같은 검증 묶음 값', series: [['A', '실험 A', PA, 3], ['B', '실험 B', PB, 3]], ref: ['주차장 원판 89%', 89], max: 3,
        leg: [['A', '실험 A · 원판에서 3회', '170장 · 크기 640', '66%'], ['B', '실험 B · A 판에서 이어 3회', '170장 · 크기 640', '70%'], ['dash', '주차장 원판', '같은 검증 묶음 3,000칸', '89%']] },
    },
    test: {
      project: '주차장 2026', stage: 2, hint: '추론 시험 블록을 더했어요 · 모델 판과 설정을 골라 영상 하나로', go: ['시험 돌리기', true], pick: 'test1',
      nodes: {
        data1: { kind: 'data', x: C0, y: R[0], line: '주차장 표본 · 170장' },
        base1: { kind: 'base', x: C0, y: R[1], line: '주차장 원판', ex: 'A' },
        base2: { kind: 'base', x: C0, y: R[2], line: '실험 A 판에서 이어서', ex: 'B' },
        cfg1: { kind: 'cfg', x: C0, y: R[3], line: '반복 3회 · 크기 640 · 한 번에 4장' },
        train1: { kind: 'train', x: C1, y: 70, ex: 'A', line: '끝남 · 09-30 · 3회', num: '66%' },
        train2: { kind: 'train', x: C1, y: 200, ex: 'B', line: '끝남 · 09-30 · 3회', num: '70%' },
        eval1: { kind: 'eval', x: C2, y: 120, line: '실험 둘 · 같은 검증 묶음' },
        test1: { kind: 'test', x: C2, y: 296, cls: 'on', line: '실험 B 판 · 기준 50% · 크기 640', tag: '남원시 2025 영상 하나' },
        deploy1: { kind: 'deploy', x: C3, y: 120, cls: 'off', line: '지난 판보다 낮아 꺼짐' },
      },
      links: [['data1', 'train1'], ['data1', 'train2'], ['base1', 'train1'], ['base2', 'train2'], ['cfg1', 'train1'], ['cfg1', 'train2'], ['train1', 'eval1', 'A'], ['train2', 'eval1', 'B'], ['train2', 'test1', 'B'], ['base1', 'test1'], ['eval1', 'deploy1', 'off']],
      perf: { title: '실험 비교 · 주차장', sub: '09-30 실험 둘 · 반복 3회씩 · 자체 검증 값 · 원판은 같은 검증 묶음 값', series: [['A', '실험 A', PA, 3], ['B', '실험 B', PB, 3]], ref: ['주차장 원판 89%', 89], max: 3,
        leg: [['A', '실험 A · 원판에서 3회', '170장 · 크기 640', '66%'], ['B', '실험 B · A 판에서 이어 3회', '170장 · 크기 640', '70%'], ['dash', '주차장 원판', '같은 검증 묶음 3,000칸', '89%']] },
    },
    wrong: {
      project: '주차장 2026', stage: 2, hint: '잘못 이으면 그 자리에서 알려 줘요', go: ['밤에 돌리기', false], pick: null,
      nodes: {
        data1: { kind: 'data', x: C0, y: R[0], line: '주차장 표본 · 170장' },
        base1: { kind: 'base', x: C0, y: R[1], line: '주차장 원판' },
        base2: { kind: 'base', x: C0, y: R[2], line: '함께 보는 모델' },
        cfg1: { kind: 'cfg', x: C0, y: R[3], line: '반복 3회 · 크기 640 · 한 번에 4장' },
        train1: { kind: 'train', x: C1, y: R[1], cls: 'bad', line: '밤 시간 · 대기열 비어 있음' },
        eval1: { kind: 'eval', x: C2, y: R[1], line: '같은 검증 묶음 3,000칸' },
        deploy1: { kind: 'deploy', x: C3, y: R[1], cls: 'bad', line: '나아진 판만' },
      },
      links: [['data1', 'train1'], ['base1', 'train1'], ['base2', 'train1', 'bad'], ['cfg1', 'train1'], ['train1', 'eval1'], ['eval1', 'deploy1'], ['data1', 'deploy1', 'bad']],
      says: [['train1', ONE_WHY.base], ['deploy1', WHY.deploy]],
      perf: { title: '지난 학습 기록 · 주차장', sub: '09-30 실험 둘 · 반복 3회씩 · 자체 검증 값', series: [['A', '실험 A', PA, 3], ['B', '실험 B', PB, 3]], ref: ['주차장 원판 89%', 89], max: 3,
        leg: [['A', '실험 A · 원판에서 3회', '09-30 · 170장', '66%'], ['B', '실험 B · A 판에서 이어 3회', '09-30 · 170장', '70%'], ['dash', '주차장 원판', '같은 검증 묶음 3,000칸', '89%']] },
    },
  };
  const S = VARS[V] || VARS.start;
  const nodes = {}; for (const id in S.nodes) nodes[id] = { id, ...S.nodes[id] };
  const links = S.links.map(([a, b, c]) => ({ a, b, c }));
  let picked = S.pick, from = null, seq = 100;

  /* 같은 종류가 둘 이상이면 이름 뒤에 표(학습 A · B · 학습 데이터 1 · 2) */
  function label(n) {
    const same = Object.values(nodes).filter((m) => m.kind === n.kind);
    if (same.length < 2) return KIND[n.kind][0];
    if (n.kind === 'train' || n.ex) { const ex = n.ex || String.fromCharCode(65 + same.indexOf(n)); return `${KIND[n.kind][0]}<em class="${ex}">${ex}</em>`; }
    return `${KIND[n.kind][0]}<em>${same.indexOf(n) + 1}</em>`;
  }

  /* 단계 막대 */
  const ST = ['데이터 올리기', '학습데이터 구축', '학습', '결과 확인', '배포 신청', '서비스 관리'];
  $('#stages').innerHTML = `<div class="pj"><small>프로젝트</small><b>${S.project}</b></div>` +
    ST.map((t, i) => `${i ? '<span class="line"></span>' : ''}<span class="st ${i < S.stage ? 'done' : i === S.stage ? 'on' : ''}"><i>${i < S.stage ? '✓' : i + 1}</i>${t}</span>`).join('') +
    `<span class="sp"></span><div class="pj" style="width:auto;text-align:right"><small>GPU</small><b>관리자가 배정 · 프로젝트 하나에 한 장</b></div>`;
  $('#hint').textContent = S.hint; $('#rule').remove();
  const go = $('#go'); go.textContent = S.go[0]; go.classList.toggle('off', !S.go[1]);

  /* 왼쪽 블록 목록 — 끌어다 놓기 · 단축 */
  const list = $('#blocks');
  list.innerHTML = `<h2>블록</h2><p class="how">끌어다 놓고, 출구 ○ 를 누른 뒤 다음 블록을 눌러 이어요. 같은 블록을 여러 개 놓아도 돼요.</p>` +
    Object.keys(KIND).map((k) => `<div class="blk" draggable="true" data-k="${k}"><b>${KIND[k][0]}</b><small>${KIND[k][1]}</small></div>`).join('') +
    `<div class="keys"><b>D</b>고른 블록 복제 &nbsp; <b>Del</b>지우기<br>선을 누르면 끊어요</div>`;
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
    add(k, Math.max(8, e.clientX - r.left - W / 2), Math.max(8, e.clientY - r.top - 24));
  });
  function add(k, x, y, src) {
    const id = `${k}${seq++}`;
    nodes[id] = { id, kind: k, x, y, line: src ? src.line : ({ data: '학습 데이터를 고르세요', base: '모델을 고르세요', cfg: '반복 3회 · 크기 640 · 한 번에 4장', train: '밤 시간 · 대기열', eval: '같은 검증 묶음', test: '모델 판 · 설정 고르세요', deploy: '나아진 판만' })[k] };
    picked = id; render(); return id;
  }
  document.addEventListener('keydown', (e) => {
    if (!picked || !nodes[picked]) return;
    if (e.key === 'd' || e.key === 'D') { const n = nodes[picked]; add(n.kind, Math.min(n.x + 24, canvas.clientWidth - W - 8), n.y + 40, n); }
    if (e.key === 'Delete' || e.key === 'Backspace') { for (let i = links.length - 1; i >= 0; i--) if (links[i].a === picked || links[i].b === picked) links.splice(i, 1); delete nodes[picked]; picked = null; render(); }
  });

  /* 판 그리기 */
  const wires = $('#wires');
  function render() {
    canvas.querySelectorAll('.node,.say').forEach((n) => n.remove());
    for (const n of Object.values(nodes)) {
      const el = document.createElement('div');
      el.className = `node ${n.cls || ''} ${picked === n.id || from === n.id ? 'on' : ''}`; el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; el.dataset.id = n.id;
      el.innerHTML = `${IN[n.kind] ? '<i class="port in"></i>' : ''}<b>${label(n)}</b>` +
        (n.num ? `<small class="num">자체 검증 ${n.num}</small>` : '') + `<small>${n.line}</small>` +
        (n.bar ? `<div class="bar"><i style="width:${n.bar}%"></i></div>` : '') +
        (n.tag ? `<span class="tag ${/XI맵/.test(n.tag) ? 'new' : ''}">${n.tag}</span>` : '') +
        `${['deploy', 'test'].includes(n.kind) ? '' : '<i class="port"></i>'}`;
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('port') && !e.target.classList.contains('in')) { from = from === n.id ? null : n.id; render(); return; }
        if (from && from !== n.id) { connect(from, n.id); from = null; return; }
        if (from === n.id) { say(n, '같은 블록끼리는 이을 수 없어요', true); from = null; render(); return; }
        picked = n.id; render();
      });
      canvas.appendChild(el);
    }
    drawWires();
    if (S.says) { S.says.forEach(([id, t], i) => say(nodes[id], t, true, true, i)); S.says = null; }
    side();
  }
  function box(id) { const el = canvas.querySelector(`.node[data-id="${id}"]`); return { x: nodes[id].x, y: nodes[id].y, w: el ? el.offsetWidth : W, h: el ? el.offsetHeight : 60 }; }
  function drawWires() {
    wires.innerHTML = links.map((l, i) => {
      const a = box(l.a), b = box(l.b); const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2; const dx = Math.max(40, (x2 - x1) / 2);
      return `<path class="${l.c || ''}" data-i="${i}" d="M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}"/>`;
    }).join('');
    wires.querySelectorAll('path').forEach((p) => p.addEventListener('click', () => { links.splice(+p.dataset.i, 1); render(); }));
  }
  function connect(a, b) {
    const A = nodes[a], B = nodes[b];
    if (links.some((l) => l.a === a && l.b === b)) { say(B, '이미 이어져 있어요'); render(); return; }
    let why = null;
    if (A.kind === B.kind) why = '같은 블록끼리는 이을 수 없어요';
    else if (!(IN[B.kind] || []).includes(A.kind)) why = WHY[B.kind];
    else if ((ONE[B.kind] || []).includes(A.kind) && links.some((l) => l.b === b && nodes[l.a].kind === A.kind)) why = ONE_WHY[A.kind];
    if (why) { B.cls = 'bad'; links.push({ a, b, c: 'bad' }); render(); say(B, why, true);
      setTimeout(() => { B.cls = ''; const i = links.findIndex((l) => l.a === a && l.b === b && l.c === 'bad'); if (i >= 0) links.splice(i, 1); render(); }, 2800); return; }
    links.push({ a, b, c: A.ex || (A.kind === 'train' ? '' : undefined) }); render();
  }
  function say(n, text, bad = false, keep = false, k = 0) {
    if (!keep) canvas.querySelectorAll('.say').forEach((s) => s.remove());
    const el = document.createElement('div'); el.className = `say ${bad ? 'bad' : ''}`; el.textContent = text;
    const b = box(n.id); el.style.left = Math.min(n.x, canvas.clientWidth - 300) + 'px'; el.style.top = (n.y + b.h + 8 + k * 46) + 'px';
    canvas.appendChild(el); if (!keep) setTimeout(() => el.remove(), 2800);
  }

  /* 오른쪽 — 고른 블록 */
  function side() {
    const el = $('#side'); const n = picked && nodes[picked];
    if (!n) { el.innerHTML = `<h2>블록을 고르세요</h2><p class="empty">판의 블록을 누르면 여기서 고르고 바꿔요</p>`; return; }
    const H = `<h2>${label(n)}</h2>`;
    const park = /주차장/.test(S.project);
    if (n.kind === 'data') {
      el.innerHTML = H + `<p class="lab">학습 데이터 자산에서</p>` + (park ?
        `<div class="opt"><i class="${n.id === 'data1' || V === 'start' ? 'on' : ''}"></i><span>주차장 표본<small>올린 묶음 · 09-30</small></span><span class="n">170장</span></div>
        <div class="opt"><i></i><span>토지피복 · 25cm 항공<small>주차장 포함 · AI 허브</small></span><span class="n">자산 등록 뒤</span></div>` :
        `<div class="opt"><i class="on"></i><span>비닐하우스 · 25cm 항공<small>없는 칸 8,000 포함 · AI 허브 토지피복</small></span><span class="n">35,485칸</span></div>
        <div class="opt"><i></i><span>비닐하우스 표본<small>올린 묶음</small></span><span class="n">200장</span></div>`) +
        `<div class="opt new"><i class="${n.id === 'data2' ? 'on' : ''}"></i><span>XI맵에서 고친 것<small>새 묶음 · 결과 확인에서 고친 것도</small></span><span class="n">0칸</span></div>
        <p class="lab">클래스</p>
        <div class="opt"><i class="on"></i>${park ? '주차장' : '비닐하우스'}</div>
        <div class="opt dim"><i></i><span>건물 · 경작지 · ${park ? '비닐하우스' : '주차장'}<small>이 묶음에 없음 · 무시</small></span></div>
        <p>묶음을 더 보태려면 학습 데이터 블록을 하나 더 놓고 같은 학습에 이어요 — 합쳐져서 들어가요. 검증 묶음 3,000칸은 학습에서 빼요.</p>`;
    } else if (n.kind === 'base') {
      const o = (on, t, s, r) => `<div class="opt"><i class="r ${on ? 'on' : ''}"></i><span>${t}${s ? `<small>${s}</small>` : ''}</span><span class="n">${r}</span></div>`;
      el.innerHTML = H + `<p class="lab">지금 있는 모델</p>` +
        o(n.ex !== 'B', `${S.project.split(' ')[0]} 원판`, '25cm 항공', '서비스 중') +
        o(false, '건물 · 주차장 · 경작지 · 비닐하우스 함께 보는 모델', '', '25cm 항공') +
        `<p class="lab">이 프로젝트의 판</p>` +
        o(n.ex === 'B', park ? '실험 A 판' : '10-08 다시 학습 판', park ? '09-30 · 자체 검증 66%' : '같은 검증 묶음 87%', '이어서 학습') +
        `<p>기반 모델은 이미 배운 것을 품고 시작해요. 영상 해상도가 같은 모델이 좋아요. 기반 모델을 둘로 나눠 보려면 학습 블록도 둘이어야 해요(실험 A · B).</p>`;
    } else if (n.kind === 'cfg') {
      const live = V === 'live';
      el.innerHTML = H + `<p class="lab">반복 횟수 <span class="num">${live ? 20 : 3}회</span> · 최대 50</p>
        <div class="seg"><span class="${live ? '' : 'on'}">3회</span><span>10회</span><span class="${live ? 'on' : ''}">20회</span><span>직접</span></div>
        <p>많을수록 오래 걸려요 — 20회는 지난번 약 25시간(한 번 반복 약 75분)이었어요.</p>
        <p class="lab">이미지 크기</p><div class="seg"><span class="${live ? '' : 'on'}">640</span><span class="${live ? 'on' : ''}">1280</span></div>
        <div class="note">지난 판과 비교하려면 검증 묶음과 같은 크기여야 해요. 크기가 다르면 같은 모델도 62% · 68%처럼 갈려요.</div>
        <p class="lab">한 번에</p><div class="seg"><span class="${live ? '' : 'on'}">4장</span><span class="${live ? 'on' : ''}">8장</span></div>
        <div class="gpu">GPU 메모리는 관리자가 정한 한도 안에서 서버가 맞춰요 — 넘치면 줄여서 돌려요.</div>
        <p style="margin-top:10px">다른 설정으로 한 번 더 보려면 학습 설정 블록을 하나 더 놓고(D) 다른 학습에 이어요 — 실험 둘이 돼요.</p>`;
    } else if (n.kind === 'train') {
      const ex = n.ex ? `<p class="lab">이 실험</p><div class="kv"><b>학습 데이터</b><span>주차장 표본 170장 + XI맵에서 고친 것 0칸</span><b>기반 모델</b><span>${n.ex === 'A' ? '주차장 원판' : '실험 A 판에서 이어서'}</span><b>설정</b><span>반복 3회 · 크기 640 · 한 번에 4장</span><b>끝</b><span class="num">09-30</span><b>자체 검증</b><span class="num">${n.num}</span></div>` : '';
      el.innerHTML = H + (V === 'live' ? `<span class="verdict wait">학습 중 · 20회 중 12회째</span>
        <div class="kv" style="margin-top:10px"><b>시작</b><span class="num">10-07 18:34 · 밤 대기열</span><b>한 번 반복</b><span>약 75분</span><b>남은 시간</b><span>약 10시간</span><b>지금까지</b><span class="num">자체 검증 85%</span></div>
        <p>끝나면 평가 블록이 같은 검증 묶음 3,000칸으로 원판(91%)과 재고 알림을 보내요.</p>` :
        ex + `<p class="lab">어떻게 돌아가나</p><p>밤 시간(관리자가 정함)에 작업 대기열에서 한 건씩 돌아요. 실험이 둘이면 차례로 돌아요.</p>`) +
        `<div class="gpu">GPU는 LX 관리자가 배정해요 — 프로젝트 하나는 한 번에 GPU 한 장. 여기서 고르거나 바꿀 수 없어요.</div>`;
    } else if (n.kind === 'eval') {
      if (V === 'live') el.innerHTML = H + `<span class="verdict wait">학습이 끝나면 재요</span><p class="lab">어떻게 재나</p><p>학습에 안 쓴 같은 검증 묶음 3,000칸으로, 원판과 같은 설정에서 재요. 결과는 AI 모델 정확도 한 줄이고 아래 그래프에 원판 기준선과 겹쳐 보여요.</p>
        <p class="lab">지난번 같은 흐름</p><div class="big"><span>91%</span><span class="to">→</span><span class="down">87%</span></div><span class="verdict">10-08 · 나아지지 않음 · 후보로 남음</span>`;
      else if (V === 'start') el.innerHTML = H + `<p class="lab">어떻게 재나</p><p>학습에 안 쓴 같은 검증 묶음 3,000칸으로 지난 판과 같은 설정에서 재요. 학습을 여러 개 이으면 한 표로 나란히 비교해요.</p>`;
      else el.innerHTML = H + `<p class="lab">실험 둘 · 한 표</p>
        <table class="tbl"><tr><th>실험</th><th>자체 검증</th><th>같은 검증 묶음</th></tr>
        <tr><td><span class="sw A"></span>실험 A</td><td>66%</td><td class="down">40%</td></tr>
        <tr><td><span class="sw B"></span>실험 B</td><td>70%</td><td>아직 안 잼</td></tr>
        <tr><td>주차장 원판</td><td>—</td><td>89%</td></tr></table>
        <p>같은 검증 묶음 값이 비교 기준이에요. 실험 B를 재려면 평가를 다시 돌려요(밤 대기열).</p><span class="btn">실험 B 재기</span>`;
    } else if (n.kind === 'test') {
      el.innerHTML = H + `<p class="lab">모델 판</p>
        <div class="opt"><i class="r"></i>주차장 원판<span class="n">서비스 중</span></div>
        <div class="opt"><i class="r"></i>실험 A 판<span class="n">자체 검증 66%</span></div>
        <div class="opt"><i class="r B"></i>실험 B 판<span class="n">자체 검증 70%</span></div>
        <p class="lab">설정</p><div class="kv"><b>결과로 남길 기준</b><span class="seg" style="margin:0"><span>30%</span><span class="on">50%</span><span>70%</span></span><b>이미지 크기</b><span class="seg" style="margin:0"><span class="on">640</span><span>1280</span></span></div>
        <p class="lab">영상 하나</p><div class="opt"><i class="on r"></i>남원시 2025 · 25cm 항공<span class="n">등록 영상</span></div>
        <div class="thumb"><i style="left:22px;top:24px;width:70px;height:34px"></i><i style="left:120px;top:56px;width:52px;height:26px"></i><i style="left:200px;top:20px;width:64px;height:30px"></i><span>결과 보기 · 시안</span></div>
        <p style="margin-top:8px">배포 전 눈으로 보는 자리라 결과는 남기지 않아요. 판을 바꿔 같은 영상으로 다시 돌려 봐요.</p><span class="btn dark">시험 돌리기</span>`;
    } else if (n.kind === 'deploy') {
      el.innerHTML = H + (n.cls === 'off' ? `<span class="verdict">${V === 'live' ? '평가가 끝나면 켜져요' : '지난 판보다 낮아 꺼져 있어요'}</span><p class="lab">그래도 신청하려면</p><p>사유를 적어 보내면 LX 관리자가 비교 값을 보고 판단해요.</p><span class="btn dim">사유 적고 신청</span>` :
        `<p class="lab">나아진 판만</p><p>평가에서 지난 판보다 나아지면 신청서가 비교 값으로 미리 채워져요. 보내면 LX 관리자가 승인하고 서비스 새 판이 돼요.</p>`);
    }
  }

  /* ── 아래 성능 판 — 에포크별 선 그래프(실시간 차오름 · 지난 판 기준선 겹침) ── */
  const TABS = [['map', '정확도 mAP'], ['p', '정밀도'], ['r', '재현율'], ['loss', '오차']];
  let tab = 'map', shown = S.perf.live ? 1 : 99;
  const perf = $('#perf');
  function drawPerf() {
    const P = S.perf; const isLoss = tab === 'loss';
    const vals = [].concat(...P.series.map(([, , d, n]) => d[tab].slice(0, Math.min(n, shown))));
    if (!isLoss && P.ref) vals.push(P.ref[1]);
    let lo = Math.min(...vals), hi = Math.max(...vals); const pad = (hi - lo) * 0.18 || 2; lo = Math.max(0, lo - pad); hi = isLoss ? hi + pad : Math.min(100, hi + pad);
    const Wd = 560, Hd = 180, L = 40, Rr = 60, T = 12, Bb = 26, pw = Wd - L - Rr, ph = Hd - T - Bb;
    const X = (e) => L + (P.max === 1 ? 0 : (e - 1) / (P.max - 1) * pw), Y = (v) => T + (hi - v) / (hi - lo) * ph;
    let g = '';
    const ticks = 4; for (let i = 0; i <= ticks; i++) { const v = lo + (hi - lo) * i / ticks; g += `<line class="grid" x1="${L}" x2="${L + pw}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ax" x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${isLoss ? v.toFixed(2) : Math.round(v) + '%'}</text>`; }
    const xt = P.max > 10 ? [1, 5, 10, 15, 20].filter((e) => e <= P.max) : Array.from({ length: P.max }, (_, i) => i + 1); for (const e of xt) g += `<text class="ax" x="${X(e)}" y="${Hd - 8}" text-anchor="middle">${e}회</text>`;
    if (!isLoss && P.ref) g += `<line class="ref" x1="${L}" x2="${L + pw}" y1="${Y(P.ref[1])}" y2="${Y(P.ref[1])}"/><text class="reft" x="${L + pw + 6}" y="${Y(P.ref[1]) + 4}">원판 ${Math.round(P.ref[1])}%</text>`;
    for (const [k, , d, n] of P.series) {
      const m = Math.min(n, shown); const pts = d[tab].slice(0, m).map((v, i) => [X(i + 1), Y(v)]);
      if (!pts.length) continue;
      g += `<path class="ser ${k}" d="${pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}"/>`;
      const last = pts[pts.length - 1]; const lv = d[tab][m - 1];
      g += `<circle class="dot ${k}" cx="${last[0]}" cy="${last[1]}" r="4.5"/><text class="lbl" x="${last[0] + 8}" y="${last[1] - 6}">${isLoss ? lv.toFixed(2) : Math.round(lv) + '%'}</text>`;
    }
    const liveT = '';
    perf.innerHTML = `<div class="ph"><h2>${P.title}</h2><p>${P.sub}</p>${liveT}<div class="tabs">${TABS.map(([k, t]) => `<span class="${k === tab ? 'on' : ''}" data-t="${k}">${t}</span>`).join('')}</div></div>
      <div class="plot"><svg viewBox="0 0 ${Wd} ${Hd}" preserveAspectRatio="none" id="svg">${g}<line class="cross" id="cross" y1="${T}" y2="${T + ph}" style="display:none"/></svg><div class="tip" id="tip" style="display:none"></div></div>
      <div class="leg">${P.leg.map(([k, t, s, v]) => `<div class="row"><i class="${k}"></i><span><b>${t}</b><small>${s}</small></span>${v ? `<span class="v">${v}</span>` : `<span class="v">${Math.round(GH.map[Math.min(shown, LIVE_EPOCH) - 1])}%</span>`}</div>`).join('')}</div>`;
    perf.querySelectorAll('.tabs span').forEach((t) => t.addEventListener('click', () => { tab = t.dataset.t; drawPerf(); }));
    /* 가로줄 + 말풍선 */
    const svg = $('#svg'), tip = $('#tip'), cross = $('#cross');
    svg.addEventListener('mousemove', (e) => {
      const r = svg.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width * Wd; const ep = Math.round((x - L) / pw * (P.max - 1)) + 1;
      if (ep < 1 || ep > P.max) { tip.style.display = cross.style.display = 'none'; return; }
      cross.style.display = ''; cross.setAttribute('x1', X(ep)); cross.setAttribute('x2', X(ep));
      const rows = P.series.map(([k, t, d, n]) => ep <= Math.min(n, shown) ? `${t} ${isLoss ? d[tab][ep - 1].toFixed(2) : Math.round(d[tab][ep - 1]) + '%'}` : null).filter(Boolean);
      tip.innerHTML = `반복 ${ep}회<br>${rows.join('<br>') || '아직'}`; tip.style.display = ''; tip.style.left = Math.min(X(ep) / Wd * r.width + 10, r.width - 130) + 'px'; tip.style.top = (e.clientY - r.top - 36) + 'px';
    });
    svg.addEventListener('mouseleave', () => { tip.style.display = cross.style.display = 'none'; });
  }
  drawPerf();
  if (S.perf.live) { const t = setInterval(() => { shown++; if (shown >= LIVE_EPOCH) { shown = LIVE_EPOCH; clearInterval(t); } drawPerf(); }, 180); }

  render();
})();
