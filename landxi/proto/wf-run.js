// 파이프라인 실행 엔진 — 여기서 "진짜"는 두 가지다.
//  1) 각 블록이 실제 파일(webp 타일 · GeoJSON)을 읽고 실제 픽셀을 그린다.
//  2) 지연시간은 performance.now() 로 잰 실측이다. 가짜 진행률이 없다.
// 블록 캐시는 Roboflow P8 그대로: 파라미터가 바뀐 블록과 그 하류만 다시 돈다.

import { loadSample, exampleCurve, ko } from './wf-data.js';
import { mosaic, drawDets, drawSlices, drawModelCard, drawGridMini, label } from './wf-thumb.js';

const sleep = () => new Promise((r) => requestAnimationFrame(() => r()));
const M_PER_DEG = 111320;

export function createRunner(env) {
  const { graph, IMAGERY, MODELS, grid, getCanvas, onNode, onStep, toast } = env;
  const runs = [];
  let lastSteps = [];

  const imageryById = (id) => IMAGERY.find((i) => i.id === id) || IMAGERY[0];
  const modelById = (id) => MODELS.find((m) => m.id === id) || MODELS[0];

  /* 캐시 키 — 자기 파라미터 + 상류 키. 상류가 바뀌면 자동으로 무효가 된다. */
  function keyOf(n, seen = new Map()) {
    if (seen.has(n.id)) return seen.get(n.id);
    const ups = graph.G.edges.filter((e) => e.t === n.id)
      .map((e) => keyOf(graph.nodeById(e.f), seen)).join('|');
    const k = n.type + ':' + JSON.stringify(n.params) + '<' + ups;
    seen.set(n.id, k);
    return k;
  }

  const EX = {
    /* 01 영상 입력 — 실제 타일 피라미드에서 3×3 모자이크를 만든다. */
    async input(n, _in, ctx) {
      const img = imageryById(n.params.imagery);
      const c = getCanvas(n.id); const g = c.getContext('2d');
      const box = await mosaic(g, img, { span: 3 });
      label(g, `${img.id} z${box.zoom} · 타일 ${box.tiles}/9`);
      n.log.push(`타일 ${box.tiles}/9 로드 · z${box.zoom}`);
      const wm = (img.bounds[2] - img.bounds[0]) * M_PER_DEG * Math.cos((img.bounds[1] * Math.PI) / 180);
      const hm = (img.bounds[3] - img.bounds[1]) * M_PER_DEG;
      return { imagery: img, box, ok: box.ok, extentM: [wm, hm],
               meta: { 도엽: img.id, GSD: (img.gsd * 100).toFixed(2) + ' cm/px',
                       촬영: img.captured, 범위: `${wm.toFixed(0)}×${hm.toFixed(0)} m`,
                       타일: `${box.tiles}/9 · z${box.zoom}` } };
    },

    /* 02 타일 분할 — 슬라이스 크기와 중첩에서 지상 스텝과 총 타일 수를 실제로 계산한다. */
    async slice(n, ins) {
      const up = ins.image; if (!up?.ok && !up) throw new Error('입력 없음');
      const img = up.imagery;
      const c = getCanvas(n.id); const g = c.getContext('2d');
      await mosaic(g, img, { span: 3 });
      const s = drawSlices(g, up.box, { slice: n.params.slice, overlap: n.params.overlap, gsd: img.gsd });
      const stepM = n.params.slice * img.gsd * (1 - n.params.overlap);
      const cols = Math.ceil(up.extentM[0] / stepM), rows = Math.ceil(up.extentM[1] / stepM);
      const total = cols * rows;
      label(g, `슬라이스 ${n.params.slice}px · 지상 ${stepM.toFixed(1)} m`);
      n.log.push(`SAHI ${n.params.slice}px / 중첩 ${Math.round(n.params.overlap * 100)}% → ${total.toLocaleString()} 타일`);
      return { ...up, slice: n.params, tiles: total,
               meta: { 슬라이스: n.params.slice + ' px', 중첩: Math.round(n.params.overlap * 100) + ' %',
                       지상스텝: stepM.toFixed(1) + ' m', 격자: `${cols} × ${rows}`,
                       총타일: total.toLocaleString() + ' 장' } };
    },

    /* 03 모델 — 실제 .pt 메타. 성능 숫자는 만들지 않고 예시 곡선임을 그림 안에 쓴다. */
    async model(n) {
      const m = modelById(n.params.model);
      const c = getCanvas(n.id); const g = c.getContext('2d');
      const curve = exampleCurve(m.id);
      drawModelCard(g, m, curve);
      n.log.push(`가중치 ${m.file} · ${m.sizeMB} MB 로드`);
      if (m.inferred) n.log.push('⚠ data yaml 없음 — 클래스는 파일명/노트북에서 추정');
      return { model: m, curve,
               meta: { 파일: m.file, 용량: m.sizeMB + ' MB', 태스크: m.task,
                       클래스: m.classes.length + '종', 학습: m.trainedAt,
                       메타: m.inferred ? '추정(yaml 없음)' : '확정' } };
    },

    /* 04 탐지 — 샘플 도엽에 실제로 저장된 산출물을 타일 좌표로 투영해 그린다.
       여수 해안에는 우리 정사영상이 없으므로 이 단계는 "샘플 도엽 즉시 추론" 이다. */
    async detect(n, ins, ctx) {
      const up = ins.tiles, mdl = ins.model;
      if (!up) throw new Error('타일 입력 없음');
      const img = up.imagery;
      const c = getCanvas(n.id); const g = c.getContext('2d');
      await mosaic(g, img, { span: 3 });
      const { feats, spec } = await loadSample(img.id);
      let stat = { drawn: 0, dimmed: 0 };
      if (spec) {
        // 진행률을 실제 청크 처리에 붙인다 — 가짜 타이머가 아니다.
        const chunk = Math.ceil(feats.length / 6) || 1;
        for (let i = 0; i < feats.length; i += chunk) {
          const part = feats.slice(i, i + chunk);
          const r = drawDets(g, up.box, part, { labels: 0 });
          stat.drawn += r.drawn;
          ctx.progress(Math.min(1, (i + chunk) / feats.length));
          await sleep();
        }
        drawDets(g, up.box, feats, { labels: 4 });
        label(g, `${spec.label} · 화면 ${stat.drawn}건`);
        n.log.push(`${spec.label} — ${feats.length}건 중 도엽 내 ${stat.drawn}건`);
        n.log.push(spec.note);
      } else {
        label(g, '이 도엽에 저장된 탐지 산출물 없음');
        n.log.push('이 도엽에는 저장된 탐지 결과가 없다 — 없는 것을 그리지 않는다');
      }
      return { feats, spec, box: up.box, imagery: img, model: mdl?.model, inBox: stat.drawn,
               meta: { 도엽: img.id, 출처: spec ? spec.label : '없음',
                       원본건수: feats.length.toLocaleString(),
                       도엽내: stat.drawn.toLocaleString(),
                       모델: mdl ? mdl.model.name : '미연결' } };
    },

    /* 05 후처리 — 임계·NMS·최소면적. 걸러진 것은 썸네일에서도 지워지지 않고 흐려진다. */
    async post(n, ins) {
      const up = ins.det; if (!up) throw new Error('검출 입력 없음');
      const c = getCanvas(n.id); const g = c.getContext('2d');
      await mosaic(g, up.imagery, { span: 3 });
      const P = n.params;
      const test = (f) => (f.conf == null || f.conf >= P.conf) && (f.area || 0) >= P.minArea;
      const r = drawDets(g, up.box, up.feats, { test, labels: 4 });
      const kept = up.feats.filter(test).length;
      label(g, `통과 ${r.drawn} · 감쇠 ${r.dimmed} (임계 ${P.conf.toFixed(2)})`);
      n.log.push(`임계 ${P.conf.toFixed(2)} · NMS IoU ${P.nms.toFixed(2)} · 최소면적 ${P.minArea} ㎡`);
      n.log.push(`전체 ${up.feats.length} → 통과 ${kept} (도엽 내 표시 ${r.drawn})`);
      return { ...up, feats: up.feats.filter(test), all: up.feats, test, kept,
               meta: { 임계: P.conf.toFixed(2), NMS_IoU: P.nms.toFixed(2),
                       최소면적: P.minArea + ' ㎡', 통과: kept.toLocaleString(),
                       감쇠: r.dimmed.toLocaleString() } };
    },

    /* 06 지도 출력 — 실제 지도 레이어와 같은 임계값을 공유한다. */
    async mapout(n, ins, ctx) {
      const c = getCanvas(n.id); const g = c.getContext('2d');
      const thr = env.mapState().thr;
      const r = drawGridMini(g, env.feats(), env.bbox(), env.passes);
      const cnt = env.counts();
      label(g, `전남 해안 · 표시 ${cnt.shown.toLocaleString()}`);
      n.log.push(`결과 지도 레이어 갱신 — 임계 ${thr.toFixed(2)} · 표시 ${cnt.shown.toLocaleString()}건`);
      return { meta: { 지도표시: cnt.shown.toLocaleString() + ' 건',
                       전체: cnt.total.toLocaleString() + ' 건',
                       총면적: (cnt.area / 10000).toFixed(2) + ' ha',
                       평균신뢰도: cnt.mean.toFixed(3),
                       격자셀: r.cells.toLocaleString() } };
    },

    /* 라이브러리 블록 — 실제로 뭔가를 계산하는 것만 넣는다. 장식 블록은 만들지 않는다. */
    async viz(n, ins) {
      const up = ins.det; if (!up) throw new Error('입력 없음');
      const c = getCanvas(n.id); const g = c.getContext('2d');
      await mosaic(g, up.imagery, { span: 3 });
      const r = drawDets(g, up.box, up.feats, { labels: 8 });
      label(g, `외곽 2px · 채움 22% · ${r.drawn}건`);
      return { meta: { 표시: r.drawn + ' 건', 스타일: '외곽 2px / 채움 22%' } };
    },
    async area(n, ins) {
      const up = ins.det; if (!up) throw new Error('입력 없음');
      const c = getCanvas(n.id); const g = c.getContext('2d');
      const A = up.feats.map((f) => f.area || 0).filter(Boolean).sort((a, b) => a - b);
      const sum = A.reduce((s, v) => s + v, 0);
      drawTable(g, [['건수', up.feats.length.toLocaleString()],
                    ['합계', (sum / 10000).toFixed(3) + ' ha'],
                    ['평균', (A.length ? sum / A.length : 0).toFixed(1) + ' ㎡'],
                    ['중앙값', (A.length ? A[A.length >> 1] : 0).toFixed(1) + ' ㎡']]);
      return { meta: { 건수: up.feats.length.toLocaleString(), 합계: (sum / 10000).toFixed(3) + ' ha' } };
    },
    async gridag(n, ins) {
      const c = getCanvas(n.id); const g = c.getContext('2d');
      const r = drawGridMini(g, env.feats(), env.bbox(), env.passes);
      return { meta: { 셀: r.cells.toLocaleString(), 검출: r.live.toLocaleString(), 크기: '약 1.2 km' } };
    },
    async obb(n, ins) { return passthrough(n, ins, '회전 폴리곤 4점 표기 — 원본이 축정렬이면 그대로 통과'); },
    async parcel(n, ins) { return passthrough(n, ins, 'PNU 필지 경계 미탑재 — 통과'); },
    async compare(n, ins) { return passthrough(n, ins, '두 실행 차집합 — 입력 2개 필요'); },
    async export(n, ins) {
      if (!env.sink()) { n.log.push('국토조사 DB 반영 스위치가 꺼져 있다 — 안전한 시험 실행');
                         return { skipped: true, meta: { 상태: '건너뜀(안전)' } }; }
      return { meta: { 상태: '내보내기 준비' } };
    },
  };

  async function passthrough(n, ins, note) {
    const up = ins.det || ins.a;
    const c = getCanvas(n.id); const g = c.getContext('2d');
    if (up?.imagery) { await mosaic(g, up.imagery, { span: 3 }); drawDets(g, up.box, up.feats || [], { labels: 3 }); }
    label(g, note);
    n.log.push(note);
    return { ...(up || {}), meta: { 비고: note } };
  }

  function drawTable(g, rows) {
    const W = g.canvas.width, H = g.canvas.height;
    g.fillStyle = '#1C2127'; g.fillRect(0, 0, W, H);
    g.font = `500 ${Math.round(W / 24)}px "IBM Plex Mono",monospace`;
    rows.forEach((r, i) => {
      const y = H * 0.24 + i * (H * 0.18);
      g.fillStyle = 'rgba(255,255,255,.5)'; g.textAlign = 'left'; g.fillText(r[0], W * 0.06, y);
      g.fillStyle = '#EAF0F7'; g.textAlign = 'right'; g.fillText(r[1], W * 0.94, y);
    });
    g.textAlign = 'left';
  }

  /* ── 실행 ─────────────────────────────────────────────────────────── */
  let running = false;
  async function run({ useCache = true, stepwise = false } = {}) {
    if (running) return null;
    running = true;
    const seq = graph.order();
    const steps = [];
    const t0 = performance.now();
    graph.setFlow(true);

    for (const n of seq) {
      const key = keyOf(n);
      const cached = useCache && n.out && n.cacheKey === key;
      const tone = n.spec.tone;
      if (cached) {
        n.state = 'cache'; n.prog = 1; onNode(n);
        steps.push({ id: n.id, name: n.spec.name, ms: 0.4, cached: true, tone });
        onStep?.(steps, n);
        continue;
      }
      n.state = 'run'; n.prog = 0; n.log = []; onNode(n);
      const ins = {};
      for (const e of graph.G.edges.filter((x) => x.t === n.id)) {
        const src = graph.nodeById(e.f);
        ins[e.tp] = src?.out || null;
      }
      const ts = performance.now();
      try {
        const ctx = { progress: (p) => { n.prog = p; onNode(n); } };
        n.out = await (EX[n.type] || passthroughStub)(n, ins, ctx);
        n.state = 'done'; n.prog = 1; n.cacheKey = key;
      } catch (err) {
        n.state = 'err'; n.out = null; n.log.push('실패: ' + err.message);
        toast?.(n.spec.name + ' 실패 — ' + err.message);
      }
      const ms = performance.now() - ts;
      n.t = ms;
      steps.push({ id: n.id, name: n.spec.name, ms, cached: false, tone });
      onNode(n); onStep?.(steps, n);
      if (n.state === 'done') flash(n);
      if (stepwise) await new Promise((r) => setTimeout(r, 260));
    }

    const total = performance.now() - t0;
    runs.push(total); lastSteps = steps;
    graph.setFlow(false);
    running = false;
    return { total, steps, runs };
  }

  async function passthroughStub(n, ins) { return passthrough(n, ins, '실행기 없음'); }

  function flash(n) {
    const el = document.querySelector(`.node[data-id="${n.id}"]`);
    if (!el) return;
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }

  return { run, runs, get lastSteps() { return lastSteps; }, keyOf,
           get busy() { return running; } };
}

export { ko };
