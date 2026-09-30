/* 부품 갤러리 — 16 부품을 실데이터(/regions · /survey/stats · /registry/cards · /deploys · /survey/findings · /jobs)로 한 페이지에.
   정문 로그인 세션만 쓴다(관문 K2 · 세션 주입 0). 숫자는 전부 서버 봉투. */
import * as K from './index.js';
import { api, isEnvelope, bboxOf } from './util.js';
import { env } from '../../shared/api-v1.js';
import { scan } from './lint/forbidden.mjs';
import { collect } from './lint/number-lint.mjs';

const $ = (id) => document.getElementById(id);
const who = await K.gate('kit');
K.devDrawer({ who });


const get = (p) => api(p).catch(() => null);
const [emd, prio, cards, deploys, jobs, finds] = await Promise.all([
  get('/survey/stats?by=emd'), get('/survey/stats?by=priority'), get('/registry/cards'), get('/deploys'), get('/jobs?limit=200'),
  get('/survey/findings?limit=300&sort=score&priority=A'),
]);
const regions = await K.loadRegions();
const fieldCheck = prio?.items?.find((i) => i.key === 'A')?.n || null;          // 현장 확인 필요(A 등급)
const lastAt = [emd?.as_of, cards?.as_of, deploys?.as_of].filter(Boolean).sort().at(-1);

/* ── 셸 + 무대 + 지역 + 서랍 + 에이전트 바 ───────────────────── */
const RAIL = ['데이터 올리기', '학습', '서비스 만들기', '결과 확인', '배포', '서비스 관리'].map((label, i) => ({ id: 's' + i, label }));
const S = K.shell({ who, home: 'lx-console', mount: $('frame'), contained: true, rail: { kind: 'steps', items: RAIL, current: 3, done: [0, 1, 2], onPick: (i) => S.go(i) } });
S.fresh(lastAt);
const stageEl = document.createElement('div'); S.main.append(stageEl);
const stage = K.createStage(stageEl);
const pickerEl = document.createElement('div');
const cmdk = K.mountCmdk({ stage, guest: false, context: () => ({ region: pickerEl.dataset.sgg || null }) });
const slot = document.createElement('span'); slot.style.display = 'contents'; slot.append(pickerEl, cmdk.button());
S.mast(slot);

const hud = document.createElement('div'); hud.className = 'g-hud'; stageEl.append(hud);
K.bignum(hud, null, { label: '현장 확인 필요', hud: true }).set(fieldCheck);   // 이미 불러온 뒤 — 없으면 빈 값
const onCard = K.card({ map: true, cls: 'g-card-on', body: '<div class="t-label">선택 지역</div><div class="t-sub" id="rgName">전국</div><div class="g-acts"><button class="t-btn" type="button" id="openList">읍면동 목록</button></div>' });
stageEl.append(onCard);

const picker = await K.regionPicker(pickerEl, {
  onPick: (r) => {
    $('rgName').textContent = r.full || r.name;
    stage.go(r);
    const aois = (deploys?.items || []).filter((d) => (d.region_profile || d.tenant_id) === r.sgg_cd && !/-test/.test(d.id)).map((d) => ({ type: 'Feature', properties: {}, geometry: d.aoi }));
    stage.geo('focus', { type: 'FeatureCollection', features: aois }, 'focus');
  },
});
await stage.ready;
if (finds?.items?.length) stage.geo('ai', { type: 'FeatureCollection', features: finds.items.filter((f) => f.geometry).map((f) => ({ type: 'Feature', properties: { p: f.priority }, geometry: f.geometry })) }, 'ai');

/* 서랍 + 표 */
const emdRows = (emd?.items || []).map((i) => ({ name: i.key, sus: i.suspect_parcels, all: i.parcels }));
$('openList').addEventListener('click', () => {
  const d = K.drawer({ title: '읍면동', host: stageEl });
  const box = document.createElement('div'); d.set(box);
  K.table(box, { cols: [{ key: 'name', label: '읍면동' }, { key: 'sus', label: '의심 필지', num: true }], rows: emdRows, sort: 'sus', limit: 12 });
});

/* 첫 지역: 배포가 있는 지역 중 첫째(데이터가 정한다 · 하드코딩 0) */
const first = K.recent()[0] ? regions.find((r) => r.sgg_cd === K.recent()[0]) : [...regions].sort((a, b) => (b.deploys?.length || 0) - (a.deploys?.length || 0))[0];
if (first) setTimeout(() => picker.pick(first.sgg_cd), 1200);

/* ── 관제 메뉴 변형 + 무대 ops ─────────────────────────────── */
const MENU = [['현황', 'chart'], ['인프라', 'gear'], ['기관', 'org'], ['배포', 'deploy'], ['결재', 'inbox']].map(([label, icon], i) => ({ id: 'm' + i, label, icon }));
const S2 = K.shell({ who, home: 'ops-core', mount: $('frame2'), contained: true, rail: { kind: 'menu', items: MENU, current: 3 } });
S2.fresh(lastAt);
const st2El = document.createElement('div'); S2.main.append(st2El);
const st2 = K.createStage(st2El, { mode: 'ops', interactive: false, scale: false });
st2.ready.then(() => {
  const pts = (deploys?.items || []).filter((d) => !/-test/.test(d.id)).map((d) => { const b = bboxOf(d.aoi); return b && { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] } }; }).filter(Boolean);
  st2.geo('deploys', { type: 'FeatureCollection', features: pts }, 'point');
});

/* ── 큰 숫자 · 신뢰 기호 ─────────────────────────────────── */
const joined = K.joinCards((cards?.items || []).filter((c) => c.scope === 'local'), deploys?.items || []);
const canMake = joined.filter((j) => j.state !== 'none').length;
K.bignum($('big'), null, { label: '만들 수 있는 업무', unit: '개' }).set(cards ? env(canMake, '개', 'recorded', 'registry/cards · deploys', '실배포 · 실결과가 있는 카드') : null);
const sigRow = [[emd?.parcels, '필지'], [fieldCheck, '현장 확인 필요']];
const demoEnv = (jobs?.items || []).map((j) => j.counts_env).find((e) => isEnvelope(e) && (e.basis === 'demo' || e.basis === 'history'));
if (demoEnv) sigRow.push([demoEnv, '분석 결과']);
$('sigs').innerHTML = sigRow.filter(([e]) => isEnvelope(e)).map(([e, l]) => `<span><span class="g-n">${K.numHtml(e)}</span><i class="t-label">${K.esc(l)}</i></span>`).join('');

/* ── 스텝퍼 ─────────────────────────────────────────────── */
K.stepper($('steps'), [{ t: '데이터 올리기' }, { t: '배포' }, { t: '결과 확인' }, { t: '기관 포털' }], { current: 2 });
const sv = K.stepper($('stepsV'), RAIL.map((r) => ({ t: r.label })), { current: 3, vertical: true, onPick: (i) => sv.go(i) });

/* ── 서비스 카드(크롭은 결과 크롭 폴더 — 예시 데이터 파일) ─────── */
const CROP = { 'card-farm': 'namwon-farmland-2025/1.jpg', 'card-marine': 'yeosu-marine-2026-drone/1.jpg', 'card-change': 'kuksan-change/1.jpg', 'card-living': 'jeju-illegal/1.jpg' };
K.serviceGrid($('cards'), joined.slice(0, 6), { map: (r) => ({ crop: CROP[r.card.id] ? `../../assets/proto/crops/${CROP[r.card.id]}` : null, where: r.deploy?.region_name?.ko?.split(' ').pop() || '' }) });

/* ── 기다림 · 빈 화면 · 문제(그림 없음) ────────────────────────────────────────────── */
K.empty($('e1'), { kind: 'first', text: '첫 분석이 끝나면 카드가 생깁니다', action: { label: '분석 계획 보기', onClick: () => K.toast('계획을 열었습니다') } });
K.empty($('e2'), { kind: 'ingest', text: '이 지역 영상을 먼저 올려 주세요' });
const ld = K.empty($('e3'), { kind: 'loading', text: '결과를 지도에 올리고 있습니다', progress: 0 });
let p = 0; setInterval(() => { p = p >= 1 ? 0 : p + 0.1; ld.set({ progress: p }); }, 600);
K.empty($('e4'), { kind: '404' });
K.empty($('e5'), { kind: 'error', title: '결재함을 불러오지 못했습니다', onRetry: () => K.toast('다시 불러옵니다') });

/* ── 업로드(브라우저 안에서 행 수만 센다 · 서버 반입은 대장 API 가 맡는다) ── */
K.dropzone($('drop'), {
  onFile: async (file, prog) => { prog(0.3); const txt = /\.(csv|geojson)$/i.test(file.name) ? await file.text() : ''; prog(0.9); return { rows: txt ? txt.split(/\r?\n/).filter(Boolean).length : null }; },
  onDone: (out) => K.toast(out.rows ? `${K.nf(out.rows)}행을 읽었습니다` : '파일을 받았습니다'),
});

/* ── 알림 · 개발자 · 다국어 ─────────────────────────────── */
$('toastBtn').addEventListener('click', () => K.toast('배정했습니다', { action: { label: '되돌리기', onClick: () => K.toast('되돌렸습니다') } }));
$('devBtn').addEventListener('click', () => K.toast(new URLSearchParams(location.search).get('dev') === '1' ? '` 키로 여닫습니다' : '개발 모드에서만 열립니다'));
const en = await fetch('./i18n/en.json').then((r) => r.json()).catch(() => ({}));
const keys = ['cmdk.placeholder', 'region.placeholder', 'empty.first', 'card.state.pilot'];
$('i18n').innerHTML = `<table class="g-i18n"><thead><tr><th>한국어</th><th>English</th></tr></thead><tbody>${keys.map((k) => `<tr><td>${K.esc(K.t(k))}</td><td>${K.esc(en[k] || '')}</td></tr>`).join('')}<tr><td class="num">${K.nf(emd?.parcels?.value)}</td><td class="num">${K.esc(Number(emd?.parcels?.value || 0).toLocaleString('en-US'))}</td></tr></tbody></table>`;

/* ── 표 · 차트 ──────────────────────────────────────────── */
K.table($('tbl'), { cols: [{ key: 'name', label: '읍면동' }, { key: 'sus', label: '의심 필지', num: true }, { key: 'all', label: '필지', num: true }], rows: emdRows, sort: 'sus', limit: 10 });
K.bars($('bars'), { items: [...emdRows].sort((a, b) => (b.sus?.value || 0) - (a.sus?.value || 0)).slice(0, 8).map((r) => ({ label: r.name, value: r.sus })), ai: true, unit: '필지' });
const byHour = new Map();
for (const j of jobs?.items || []) { const d = new Date(j.created_at); const k = `${String(d.getHours()).padStart(2, '0')}시`; byHour.set(k, (byHour.get(k) || 0) + 1); }
const hours = [...byHour].reverse().map(([label, value]) => ({ label, value }));
K.line($('line'), { points: hours, unit: '건' });

/* ── 관문 · 검사기 ──────────────────────────────────────── */
K.enter();
setTimeout(() => {
  const r = scan(document);
  const m = collect(document);
  $('lint').innerHTML = [
    ['관문', '통과'], ['금지어', r.hits.length], ['첫 뷰 글자', r.chars], ['숫자 표기', m.length],
  ].map(([l, v]) => `<div><div class="l">${K.esc(l)}</div><div class="v num">${K.esc(typeof v === 'number' ? K.nf(v) : v)}</div></div>`).join('');
  if (r.hits.length) console.warn('[kit] 금지어', r.hits);
  document.documentElement.dataset.kitReady = '1';
}, 2600);
