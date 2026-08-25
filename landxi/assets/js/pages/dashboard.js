// LX 관리자 대시보드 — 지도 백드롭 위에 유리 패널을 얹고, 좌(처리 대기 큐)·중(KPI·차트)·우(운영 현황)를
// 하나의 카메라와 묶는다. 큐/KPI/프로젝트 행에 손을 올리면 지도가 강조되고, 클릭하면 카메라가 내려가며
// 우측 Drawer 가 요약을 연다.
import { mountShell, AuthState } from '../shell.js';
import { createMap } from '../map/shell.js';
import { DASH } from '../../data/dashboard.js';
import { statusOf } from '../ui/status.js';
import { countUpAll } from '../ui/kpi.js';
import { initTabs } from '../ui/tabs.js';
import { createDrawer } from '../ui/drawer.js';
import { icon } from '../ui/icon.js';

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const BASE_DATE = DASH.notice.date;

/** 큐 타입별 표기·도메인·처리 화면. 브리프의 검토/승인·거부/답변 3분류. */
const TYPE = {
  card: { label: '카드', domain: 'card', act: '검토', href: 'admin-publish.html?status=대기', full: '카드 발행 승인' },
  user: { label: '가입', domain: 'user', act: '승인·거부', href: 'admin-users.html', full: '가입 승인' },
  inquiry: { label: '문의', domain: 'inquiry', act: '답변', href: 'admin-inquiry.html', full: '문의 답변' },
};

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, r = document) => r.querySelector(s);
const num = (n) => Number(n).toLocaleString('ko-KR');

function start() {
  const queue = [...DASH.queue].sort((a, b) => b.age - a.age);
  renderHead();
  renderQueue(queue);
  renderKpis();
  renderSide();
  initCharts();
  countUpAll($('#kpis'));
  wireInteractions();
  boot();                                   // 지도는 비동기. 그때까지 강조 호출은 무시된다.
}

/* ── 지도 ────────────────────────────────────────────────────────── */
let map = null;
const hl = (id, fn) => { if (map && map.getLayer(id)) map.setHighlight(id, fn); };

async function boot() {
  const el = $('#dashMap');
  if (!el) return;
  map = await createMap(el, { mode: 'backdrop', center: [127.6, 35.9], zoom: 8.4, pitch: 40, interactive: false, tools: false, rulebar: false });
  // ── [Task 8b 훅] 실 정사영상 타일 ────────────────────────────────
  // 병렬 과제(Task 8b)가 assets/data/imagery.js 의 IMAGERY 와 map.addRaster 를 올린다.
  // 합류하면 파일 상단에 import 를 더하고 아래 한 줄의 주석을 푼다. 그전에는 import 하지 않는다.
  //   import { IMAGERY } from '../../data/imagery.js';
  //   map.addRaster('namwon', IMAGERY.namwon_2508, { opacity: 0.5 });
  const [extents, orgs] = await Promise.all([
    fetchGeo('assets/data/geo/projects-extent.geojson', f => f.properties.pid),
    fetchGeo('assets/data/geo/orgs.geojson', f => f.properties.name),
  ]);
  if (extents) map.addGeoJSON('extents', extents, { kind: 'extent' });
  if (orgs) map.addGeoJSON('orgs', orgs, { kind: 'org' });
  indexPins(extents, orgs);
}

/** GeoJSON 을 읽어 setHighlight 가 쓰는 properties.id 를 채워 준다(원본에는 없다). */
async function fetchGeo(url, idOf) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status);
    const g = await r.json();
    (g.features || []).forEach(f => { f.properties = Object.assign({}, f.properties, { id: idOf(f) }); });
    return g;
  } catch (e) { console.warn('[dash] geo 실패:', url, e.message); return null; }
}

/** 큐 항목 ↔ 지도 피처 연결. 카드는 과제명 접두사로 pid 를, 사용자·문의는 본문에 등장하는 기관명으로 잇는다. */
function indexPins(extents, orgs) {
  const ex = (extents && extents.features) || [], og = (orgs && orgs.features) || [];
  document.querySelectorAll('.q').forEach(row => {
    const item = DASH.queue[+row.dataset.i];
    if (!item) return;
    if (row.dataset.type === 'card') {
      const hit = ex.find(f => item.title.startsWith(f.properties.name));
      if (hit) row.dataset.pid = item.pid || hit.properties.pid;
    } else {
      const text = item.title + ' ' + item.sub;
      const hit = og.find(f => text.includes(f.properties.name));
      if (hit) row.dataset.org = hit.properties.name;
    }
  });
}

/* ── 헤더 ────────────────────────────────────────────────────────── */
function renderHead() {
  const n = DASH.notice;
  $('#dashNotice').innerHTML = `<span class="dash__notice-tag">공지</span><span class="dash__notice-title">${esc(n.title)}</span><span class="mono faint">${esc(n.date)}</span>${icon('chevron-right', 14)}`;
  $('#dashDate').textContent = BASE_DATE.replace(/-/g, '.') + ' 09:00 기준';
}

/* ── 좌: 처리 대기 큐 ────────────────────────────────────────────── */
function renderQueue(queue) {
  $('#queueCount').textContent = queue.length;
  $('#queueList').innerHTML = queue.map(item => {
    const t = TYPE[item.type] || TYPE.card;
    const s = statusOf(t.domain, item.status);
    const hot = item.age >= 60;
    return `<div class="q${hot ? ' is-hot' : ''}" role="button" tabindex="0" data-type="${esc(item.type)}" data-i="${DASH.queue.indexOf(item)}" aria-label="${esc(t.full)} · ${esc(item.title)} · ${item.age}일 대기">
      <span class="q__bar" style="--c:var(--s-${s.key})"></span>
      <span class="q__type">${esc(t.label)}</span>
      <b class="q__title">${esc(item.title)}</b>
      <span class="q__sub">${esc(item.sub)}</span>
      <span class="q__age mono">${item.age}일</span>
      <a class="q__act btn btn--sm btn--primary" href="${esc(t.href)}" tabindex="-1">${esc(t.act)}</a>
    </div>`;
  }).join('');
}

/* ── 중: KPI ─────────────────────────────────────────────────────── */
function renderKpis() {
  const k = DASH.kpis;
  // 5번째 항목('가입 승인 대기')은 자체 타일 없이 전체 사용자 타일의 부제에만 녹아든다.
  // 배열 순서가 아니라 라벨로 찾아야 DASH.kpis 가 재배열돼도 안 깨진다.
  const pending = k.find(kpi => kpi.label === '가입 승인 대기');
  const shown = k.filter(kpi => kpi !== pending);
  const subOf = (kpi, i) => i === 0
    ? `정상 ${num(kpi.value - pending.value)} · <a class="link" href="admin-users.html">승인 대기 ${num(pending.value)}</a>`
    : esc(kpi.sub);
  $('#kpis').innerHTML = shown.map((kpi, i) => `<article class="kpi card glass${kpi.status === 'found' ? ' kpi--hot' : ''}" data-interactive data-status="${esc(kpi.status)}" data-kpi="${i}">
      <div class="kpi__label">${esc(kpi.label)}</div>
      <div class="kpi__value" data-n="${kpi.value}"><span class="kpi__num">0</span><span class="unit">${esc(kpi.unit)}</span></div>
      <div class="kpi__sub">${subOf(kpi, i)}</div>
    </article>`).join('');
}

/* ── 우: 백본 · 스토리지 · 프로젝트 용량 · 관리 타일 ─────────────── */
const TILES = [
  ['user', '사용자 관리', 'admin-users.html'],
  ['bell', '공지 관리', 'admin-notice.html'],
  ['help', '문의 관리', 'admin-inquiry.html'],
  ['info', 'FAQ 관리', 'admin-faq.html'],
];

function renderSide() {
  const b = DASH.backbone, st = DASH.storage;
  const free = Math.max(0, st.total - st.parts.reduce((a, p) => a + p.tb, 0));
  const seg = [...st.parts, { label: '여유', tb: free, free: true }];
  const maxGb = Math.max(...DASH.projects.map(p => p.gb));

  $('#side').innerHTML = `
    <section class="card glass backbone">
      <div class="card__head"><h3 class="card__title">백본 모델</h3></div>
      <div class="card__body">
        <div class="backbone__name">${esc(b.name)}<span class="mono">${esc(b.ver)}</span></div>
        <dl class="kv"><dt>적용일</dt><dd class="mono">${esc(b.applied)}</dd><dt>학습 과제</dt><dd class="mono">${b.tasks}건</dd></dl>
      </div>
    </section>

    <section class="card glass storage">
      <div class="card__head"><h3 class="card__title">스토리지</h3><div class="card__actions mono xsmall">${st.used} / ${st.total} TB</div></div>
      <div class="card__body">
        <div class="storage__bar">${seg.map((p, i) => `<span class="storage__seg${p.free ? ' is-free' : ''}" style="width:${(p.tb / st.total * 100).toFixed(1)}%;--i:${i}" title="${esc(p.label)} ${p.tb} TB"></span>`).join('')}</div>
        <ul class="storage__legend">${seg.map((p, i) => `<li${p.free ? ' class="is-free"' : ''} style="--i:${i}"><span>${esc(p.label)}</span><b class="mono">${p.tb.toFixed(1)}</b></li>`).join('')}</ul>
      </div>
    </section>

    <section class="card glass projects">
      <div class="card__head"><h3 class="card__title">프로젝트 용량 <span class="count">${DASH.projects.length}</span></h3></div>
      <div class="card__body">${DASH.projects.map(p => `<div class="p" data-pid="${esc(p.pid)}">
        <span class="p__name">${esc(p.name)}</span>
        <span class="p__track"><i style="width:${(p.gb / maxGb * 100).toFixed(1)}%"></i></span>
        <b class="p__gb mono">${num(p.gb)}</b>
      </div>`).join('')}</div>
    </section>

    <section class="card glass tiles">
      <div class="card__head"><h3 class="card__title">사용자·콘텐츠 관리</h3></div>
      <div class="card__body tiles__grid">${TILES.map(([ic, label, href]) => `<a class="tile" href="${href}">${icon(ic, 18)}<span>${esc(label)}</span></a>`).join('')}</div>
    </section>`;
}

/* ── 인터랙션 — 큐/KPI/프로젝트 ↔ 지도 ───────────────────────────── */
function wireInteractions() {
  const drawer = createDrawer({ side: 'right', width: 392, host: document.body });
  drawer.el.classList.add('dash-drawer');
  drawer.el.addEventListener('click', e => { if (e.target.closest('[data-close]')) drawer.close(); });

  const list = $('#queueList');
  // 큐는 pid·org 두 레이어를 오간다. 한 곳에서 매 mouseover 마다 둘 다 켜고 끄지 않으면
  // (행 밖 · 어느 쪽에도 안 걸리는 행으로 옮길 때) 이전 강조가 남는다 — 아래 side 핸들러와 같은 패턴.
  list.addEventListener('mouseover', e => {
    const row = e.target.closest('.q');
    const hit = row && list.contains(row) ? row : null;
    hl('extents', hit && hit.dataset.pid ? p => p.pid === hit.dataset.pid : null);
    hl('orgs', hit && hit.dataset.org ? p => p.name === hit.dataset.org : null);
  });
  list.addEventListener('mouseleave', () => { hl('extents', null); hl('orgs', null); });

  const open = row => {
    const item = DASH.queue[+row.dataset.i]; if (!item) return;
    const t = TYPE[item.type] || TYPE.card, s = statusOf(t.domain, item.status);
    if (map) map.flyTo(item.pin.lnglat, 11, { pitch: 45 });
    document.querySelectorAll('.q.is-active').forEach(r => r.classList.remove('is-active'));
    row.classList.add('is-active');
    drawer.open(`<div class="dw">
      <div class="dw__head"><span class="dw__type">${esc(t.full)}</span><button type="button" class="icon-btn" data-close aria-label="닫기">${icon('close', 14)}</button></div>
      <h3 class="dw__title">${esc(item.title)}</h3>
      <p class="dw__sub">${esc(item.sub)}</p>
      <div class="dw__meta"><span class="pill" data-status="${s.key}">${esc(s.label)}</span><span class="mono faint">${item.age}일 대기</span></div>
      <dl class="kv">
        <dt>좌표</dt><dd class="mono">${item.pin.lnglat.map(v => v.toFixed(3)).join(', ')}</dd>
        <dt>기준일</dt><dd class="mono">${esc(BASE_DATE)}</dd>
      </dl>
      <a class="btn btn--primary btn--block" href="${esc(t.href)}">${esc(t.act)}하러 가기</a>
    </div>`);
  };
  list.addEventListener('click', e => {
    if (e.target.closest('.q__act')) return;                 // 액션 버튼은 링크 그대로
    const row = e.target.closest('.q'); if (row && list.contains(row)) open(row);
  });
  list.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const row = e.target.closest('.q'); if (!row) return;
    e.preventDefault(); open(row);
  });

  const kpis = $('#kpis');
  kpis.addEventListener('mouseover', e => {
    const kpi = e.target.closest('.kpi'); if (!kpi) return;
    const want = kpi.dataset.status;
    hl('extents', want === 'all' ? () => true : p => statusOf('card', p.status).key === want);
  });
  kpis.addEventListener('mouseleave', () => hl('extents', null));

  const side = $('#side');
  // 우측 컬럼은 카드가 여러 장이라 mouseleave 만으로는 프로젝트 행을 벗어나도 강조가 남는다.
  // 행 밖으로 나가는 즉시 해제하도록 mouseover 한 곳에서 켜고 끈다.
  side.addEventListener('mouseover', e => {
    const p = e.target.closest('.p');
    hl('extents', p ? f => f.pid === p.dataset.pid : null);
  });
  side.addEventListener('mouseleave', () => hl('extents', null));
}

/* ── 차트 — ECharts. 색은 CSS 토큰에서 읽는다. ───────────────────── */
function initCharts() {
  const cs = getComputedStyle(document.documentElement);
  const tok = n => cs.getPropertyValue(n).trim();
  const INK = tok('--ink') || '#111C2D', LX = tok('--lx') || '#006DF7';
  const INK2 = 'rgba(17,28,45,.68)', INK3 = 'rgba(17,28,45,.48)', LINE = 'rgba(17,28,45,.10)';
  const PALETTE = [INK, LX, '#6E93EA', '#A9BFF2', '#CDD9F7'];
  const MONO = 'IBM Plex Mono, ui-monospace, monospace';
  const base = { animation: !REDUCE, color: PALETTE, textStyle: { fontFamily: 'IBM Plex Sans KR, system-ui, sans-serif' } };

  const OPTIONS = {
    chartProjects() {
      const rows = [...DASH.projects].sort((a, b) => a.gb - b.gb);
      return {
        ...base,
        grid: { left: 104, right: 56, top: 6, bottom: 6 },
        tooltip: { trigger: 'item', formatter: p => `${p.name} · ${p.value.toLocaleString('ko-KR')} GB` },
        xAxis: { type: 'value', show: false, max: 'dataMax' },
        yAxis: { type: 'category', data: rows.map(p => p.name), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: INK2, fontSize: 11 } },
        series: [{ type: 'bar', barWidth: 10, data: rows.map(p => p.gb), itemStyle: { color: LX, borderRadius: [0, 3, 3, 0] }, emphasis: { itemStyle: { color: INK } }, label: { show: true, position: 'right', formatter: '{c} GB', fontFamily: MONO, fontSize: 10.5, color: INK3 } }],
      };
    },
    chartVisits() {
      const max = Math.max(...DASH.visits.map(v => v.count));
      return {
        ...base,
        grid: { left: 44, right: 12, top: 16, bottom: 24 },
        tooltip: { trigger: 'axis', valueFormatter: v => v.toLocaleString('ko-KR') + '회' },
        xAxis: { type: 'category', data: DASH.visits.map(v => v.day), axisLine: { lineStyle: { color: LINE } }, axisTick: { show: false }, axisLabel: { color: INK2, fontSize: 11 } },
        yAxis: { type: 'value', splitLine: { lineStyle: { color: LINE } }, axisLabel: { color: INK3, fontSize: 10.5, fontFamily: MONO } },
        series: [{ type: 'bar', barWidth: '46%', data: DASH.visits.map(v => ({ value: v.count, itemStyle: { color: v.count === max ? INK : LX, borderRadius: [3, 3, 0, 0] } })) }],
      };
    },
    chartStorage() {
      const st = DASH.storage, free = Math.max(0, st.total - st.parts.reduce((a, p) => a + p.tb, 0));
      return {
        ...base,
        tooltip: { trigger: 'item', formatter: p => `${p.name} · ${p.value} TB (${p.percent}%)` },
        legend: { orient: 'vertical', left: '56%', top: 'center', itemWidth: 9, itemHeight: 9, itemGap: 10, textStyle: { color: INK2, fontSize: 11 } },
        series: [{
          type: 'pie', radius: ['54%', '80%'], center: ['30%', '50%'], avoidLabelOverlap: true,
          itemStyle: { borderColor: '#fff', borderWidth: 2 }, label: { show: false }, labelLine: { show: false },
          data: [...st.parts.map(p => ({ name: p.label, value: p.tb })), { name: '여유', value: +free.toFixed(1), itemStyle: { color: 'rgba(17,28,45,.08)' } }],
        }],
      };
    },
  };

  const made = {};
  const build = id => {
    if (made[id]) return;
    const el = document.getElementById(id);
    if (!el || el.hidden || !el.clientWidth) return;
    // CDN 이 막힌 오프라인에서는 빈 상자 대신 이유를 남긴다. echarts 가 늦게 떠도 다음 탭 전환에서 다시 시도한다.
    if (!window.echarts) { el.innerHTML = '<p class="chart__off">차트 라이브러리를 불러오지 못했습니다.</p>'; return; }
    el.innerHTML = '';
    made[id] = echarts.init(el);
    made[id].setOption(OPTIONS[id]());
  };
  const tabs = $('#chartTabs');
  tabs.addEventListener('tabchange', e => { const id = e.detail.controls; build(id); if (made[id]) made[id].resize(); });
  initTabs(tabs);                                  // 초기 선택도 tabchange 로 발화 → 첫 차트가 그려진다
  addEventListener('resize', () => Object.values(made).forEach(c => c.resize()));
}

mountShell({ active: 'dashboard', crumb: ['대시보드', '관리자'] });
if (AuthState.isLoggedIn()) start();       // 로그아웃이면 mountShell 이 login.html 로 보낸 뒤다
