/* 생산 관리 — LX 운영자 화면.
   데이터 파일에 세워 둔 네 기능(능동 운영 · 인프라 · 포털 생산 · 화면 요구)을
   한자리에서 본다. 이 화면은 숫자를 만들지 않는다 — 전부 규칙에서 나온 값을 옮길 뿐이다. */
import { mountShell, esc, nf, ymd, openModal } from './shell.js';
import { DUTIES, AGENCY_DUTY, THRESHOLDS, opsSummary, businessView } from '../assets/data/ops.js';
import { infraSummary, capacityPlan, costOfNewRegion, RATES, COVER_RATIO } from '../assets/data/infra.js';
import { SHELL_PARTS, LOCKED, PRODUCE, INTAKE, THEMES, themeOf, brandGuard, produceState } from '../assets/data/brand.js';
import { REQUESTS, loopStats, genQueue, studioScale, BLOCKS } from '../assets/data/studio.js';
import { TENANTS } from '../assets/data/portal.js';
import { CARDS, DEPLOYS, cardById } from '../assets/data/cards.js';
import { PROFILES } from '../assets/data/registry.js';

const TAB = new URLSearchParams(location.search).get('tab') || 'ops';
const b = businessView(), inf = infraSummary(), cap = capacityPlan(), loop = loopStats();

mountShell({
  active: 'produce', title: '생산 관리',
  subtitle: 'AI 서비스를 양산하고, 기관에 분기하고, 화면까지 찍어내는 자리 — 손으로 하면 용역이고 기능으로 하면 사업이다',
  notice: false, demo: true,
  tabStyle: 'line', tab: TAB,
  tabs: [
    { key: 'ops', label: '능동 운영', href: 'produce.html?tab=ops', count: b.이번주기_재학습 + b.검수필요 },
    { key: 'infra', label: '인프라', href: 'produce.html?tab=infra', count: `${cap.rows[0].pct}%` },
    { key: 'brand', label: '포털 생산', href: 'produce.html?tab=brand', count: produceState().tenants },
    { key: 'studio', label: '화면 요구', href: 'produce.html?tab=studio', count: loop.반영중 + loop.대기 },
  ],
});

const main = document.getElementById('main');
const tile = (l, v, u, tone = '') => `<div class="tile${tone ? ` tile--${tone}` : ''}${v ? '' : ' tile--zero'}">
  <span class="tile-l">${esc(l)}</span><span class="tile-v"><b>${typeof v === 'number' ? nf.format(v) : esc(v)}</b><span>${esc(u)}</span></span></div>`;
const nameOfDeploy = (id) => cardById((DEPLOYS.find((d) => d.id === id) || {}).cardId)?.name || id;
const h = (t, sub, right = '') => `<h2 class="pd-h">${esc(t)}<span>${esc(sub)}</span><span class="sp"></span>${right}</h2>`;

const VIEWS = { ops, infra, brand, studio };
main.insertAdjacentHTML('beforeend', `<div class="pd-sec">${(VIEWS[TAB] || ops)()}</div>`);

/* ── 능동 운영 ────────────────────────────────────────────────────── */
function ops() {
  const s = opsSummary();
  return `
  <div class="band band--s">
    ${tile('감시 중', s.watched, '건')}
    ${tile('재학습 필요', s.retrain, '건', s.retrainUrgent ? 'warn' : '')}
    ${tile('검수 필요', s.verify, '건', 'ink')}
    ${tile('능동 비율', b.능동비율 + '%', '', 'ink')}
    <p class="band-note">기관 신고 ${nf.format(b.기관신고)}건 — 보조 신호일 뿐이다</p>
  </div>
  ${h('지금 해야 할 일', `기준 미달이면 기계가 먼저 든다 · 신뢰도 ${THRESHOLDS.conf} · IoU ${THRESHOLDS.iou} · 학습 후 ${THRESHOLDS.staleDays}일 · 표본 ${THRESHOLDS.sampleMin}건`)}
  <table class="tb"><thead><tr><th>배포본</th><th>지역</th><th class="r">신뢰도</th><th class="r">IoU</th><th>마지막 학습</th><th>할 일</th><th>근거</th></tr></thead><tbody>
  ${s.rows.map((r) => `<tr>
    <td>${esc(r.card.name || r.deploy.id)}</td><td>${esc(r.deploy.region)}</td>
    <td class="n">${r.ops.conf.toFixed(2)}</td><td class="n">${r.ops.iou.toFixed(2)}</td>
    <td class="n">${esc(ymd(r.ops.lastTrain))} <span class="st st--dim">${r.stale}일</span></td>
    <td class="pd-lv" data-l="${esc(r.top.level)}">${esc(DUTIES.find((d) => d.id === r.top.duty)?.name || r.top.duty)}</td>
    <td>${esc(r.top.why)}</td></tr>`).join('')}
  </tbody></table>
  ${h('다섯 임무는 전부 LX 몫', '기관 임무는 하나뿐이다')}
  <table class="tb"><thead><tr><th>임무</th><th>누가</th><th>무엇을</th><th>왜</th></tr></thead><tbody>
  ${DUTIES.map((d) => `<tr><td>${esc(d.name)}</td><td><span class="st st--acc">${esc(d.who)}</span></td><td>${d.what.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</td><td>${esc(d.why)}</td></tr>`).join('')}
  <tr><td>${esc(AGENCY_DUTY.name)}</td><td><span class="st st--dim">${esc(AGENCY_DUTY.who)}</span></td><td>${esc(AGENCY_DUTY.what)}</td><td>${esc(AGENCY_DUTY.why)}</td></tr>
  </tbody></table>
  <p class="pd-note">납품형은 기관이 신고해야 고친다. 사업형은 <b>LX 가 먼저 찾아 고쳐 올린다</b> — 좋아진 것을 보여야 다음 계약이 이어진다.</p>`;
}

/* ── 인프라 ───────────────────────────────────────────────────────── */
function infra() {
  const bar = (r) => {
    const w = Math.min(100, r.pct), a = Math.min(100, r.afterPct);
    return `<div class="pd-cap-r${r.afterPct >= 80 ? ' pd-cap--warn' : ''}">
      <div class="pd-cap-n">${esc(r.name)}<em>${esc(r.note)}</em></div>
      <div class="pd-track"><div class="pd-fill" style="width:${w}%"></div>
        ${a > w ? `<div class="pd-after" style="left:${a}%" data-l="예정 ${r.afterPct}%"></div>` : ''}</div>
      <div class="pd-cap-v"><b>${nf.format(r.use)}</b> / ${nf.format(r.cap)} ${esc(r.unit)} · ${r.pct}%</div>
    </div>`;
  };
  return `
  <div class="band band--s">
    ${tile('배포본', inf.deploys, '개')}
    ${tile('적용 지역', inf.regions, '곳')}
    ${tile('저장', inf.storageTb, 'TB', 'ink')}
    ${tile('GPU', inf.gpuYear + inf.gpuRetrain, 'h/년', 'ink')}
    <p class="band-note">${esc(cap.line)}</p>
  </div>
  ${h('용량', '배포본이 늘면 여기가 저절로 는다 — 분기가 기능이기 때문이다')}
  <div class="pd-cap">${cap.rows.map(bar).join('')}</div>
  <p class="pd-note">검은 선은 <b>예정 사업까지 넣었을 때</b>의 자리다. 80 %를 넘으면 증설을 검토한다.</p>
  ${h('배포본이 쓰는 자원', '지역 전체가 아니라 그 서비스가 실제로 보는 범위로 잰다',
    '<button type="button" class="btn-br btn-br--s" data-act="cost">새 지역 비용 산출</button>')}
  <table class="tb"><thead><tr><th>서비스</th><th>지역</th><th class="r">대상 범위</th><th class="r">원본</th><th class="r">타일</th><th class="r">추론/년</th><th>상태</th></tr></thead><tbody>
  ${inf.rows.map((r) => `<tr>
    <td>${esc(r.card.name || r.deploy.id)}</td><td>${esc(r.deploy.region)} <span class="st st--dim n">${esc(r.deploy.year)}</span></td>
    <td class="n">${nf.format(r.area)} km²${r.regionArea ? ` <span class="st st--dim">/${nf.format(r.regionArea)}</span>` : ''}</td>
    <td class="n">${nf.format(r.storage.raw)} GB</td><td class="n">${nf.format(r.storage.tile)} GB</td>
    <td class="n">${nf.format(r.compute.perYear)} h</td>
    <td><span class="st st--${r.deploy.status === '운영' ? 'teal' : r.deploy.status === '구축' ? 'acc' : 'dim'}">${esc(r.deploy.status)}</span></td></tr>`).join('')}
  </tbody></table>
  <p class="pd-note">단가는 실측에서 뽑았다 — 정사영상 <b>${RATES.rawPerKm2.ortho} GB/km²</b>(남원 전역 1시점 2.1 TB ÷ 752 km²) ·
  타일은 원본의 <b>${(RATES.tileRatio * 100).toFixed(1)}%</b> · 추론 <b>${RATES.gpuHourPerKm2.ortho} GPU·h/km²</b>.
  원본은 <em>LX 보관</em>이고 기관에는 타일만 나간다.</p>`;
}

/* ── 포털 생산 ────────────────────────────────────────────────────── */
function brand() {
  const st = produceState();
  const users = TENANTS.filter((t) => t.kind === 'user');
  return `
  <div class="band band--s">
    ${tile('기관 포털', st.tenants, '곳')}
    ${tile('골격 부위', SHELL_PARTS.length, '개', 'ink')}
    ${tile('자동 절차', st.autoSteps, `/${PRODUCE.length}`, 'ink')}
    ${tile('CI 가드', st.guards.filter((g) => g.ok).length, `/${st.guards.length} 통과`, 'ink')}
    <p class="band-note">${esc(st.line)}</p>
  </div>
  ${h('기관이 내는 것은 CI 한 벌뿐', '나머지는 LX 가 찍어 내린다')}
  <div class="pd-ci">${users.map((t) => {
    const th = themeOf(t.id), g = brandGuard(t.id);
    return `<div class="pd-ci-c">
      <div class="pd-ci-m" style="color:${esc(th.accent)}">${th.mark.split('/').map((s) => `<span>${esc(s)}</span>`).join('')}</div>
      <strong class="pd-ci-n">${esc(th.name)}</strong>
      <dl class="pd-ci-l">
        <dt>상징색</dt><dd><i class="pd-sw" style="background:${esc(th.accent)}"></i>${esc(th.accent)}</dd>
        <dt>행정단위</dt><dd>${esc(th.unitLabel)}</dd>
        <dt>좌표계</dt><dd class="n">${esc(th.crs)}</dd>
        <dt>대비</dt><dd class="n">${g.contrast} <span class="st st--${g.ok ? 'teal' : 'warn'}">${g.ok ? '통과' : '미달'}</span></dd>
      </dl>
      <p class="pd-note"><a class="link" href="portal.html">포털 열기 ›</a></p>
    </div>`;
  }).join('')}</div>
  ${h('포털 한 벌을 세우는 절차', `자동 ${st.autoSteps} · 수동 ${st.manualSteps} — 이 비율이 생산화의 척도다`)}
  <div class="pd-steps">${PRODUCE.map((p) => `<div class="pd-step" data-by="${esc(p.by)}">
    <b>STEP ${p.step} · ${esc(p.by)}</b><strong>${esc(p.name)}</strong><p>${esc(p.what)}</p></div>`).join('')}</div>
  ${h('골격은 LX 가 잠근다', '기관이 바꿀 수 있는 것과 없는 것')}
  <table class="tb"><thead><tr><th>부위</th><th>무엇</th><th>기관이 바꾸는 것</th></tr></thead><tbody>
  ${SHELL_PARTS.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.what)}</td>
    <td>${p.ci === '없음' ? '<span class="st st--dim">없음</span>' : esc(p.ci)}</td></tr>`).join('')}
  </tbody></table>
  <p class="pd-note">잠긴 값 — ${esc(LOCKED.display)} · ${esc(LOCKED.body)} · 바닥 ${LOCKED.floorPx}px ·
  라운드 ${LOCKED.radius} · 그림자 ${LOCKED.shadow} · 레일 ${LOCKED.rail} · 마진 ${LOCKED.margin} · ${esc(LOCKED.rule)}.
  <b>기관이 못 바꾼다</b> — 그래야 50곳이 한 벌로 유지되고 개선이 전부에 퍼진다.</p>
  ${h('기관이 내야 하는 것', '이게 다 모이면 포털이 선다')}
  <table class="tb"><thead><tr><th>항목</th><th>무엇</th><th>필수</th></tr></thead><tbody>
  ${INTAKE.map((i) => `<tr><td>${esc(i.name)}</td><td>${esc(i.what)}</td>
    <td>${i.min ? '<span class="st st--acc">필수</span>' : '<span class="st st--dim">선택</span>'}</td></tr>`).join('')}
  </tbody></table>`;
}

/* ── 화면 요구 ────────────────────────────────────────────────────── */
function studio() {
  const sc = studioScale(), q = genQueue();
  return `
  <div class="band band--s">
    ${tile('유지 화면', sc.화면, '개')}
    ${tile('블록 종류', sc.블록종류, '종', 'ink')}
    ${tile('평균 반영', loop.평균소요일, '일', 'ink')}
    ${tile('손으로 짠 화면', sc.손으로짠화면, '개', 'ink')}
    <p class="band-note">${esc(sc.line)}</p>
  </div>
  ${h('기관 요구 고리', '접수 → 명세 한 줄 수정 → 다시 찍기 → 배포',
    '<button type="button" class="btn-br btn-br--s" data-act="gen">생성 대기 보기</button>')}
  <table class="tb"><thead><tr><th>기관</th><th>서비스</th><th>요구</th><th>연산</th><th>접수</th><th class="r">소요</th><th>상태</th></tr></thead><tbody>
  ${REQUESTS.map((r) => {
    const d = r.done ? Math.round((Date.parse(r.done) - Date.parse(r.got)) / 864e5) : null;
    return `<tr><td>${esc(r.from)}</td><td>${esc(nameOfDeploy(r.deployId))}</td>
    <td>${esc(r.want)}</td><td><code class="n">${esc(r.op)}</code> ${esc(r.at)}</td>
    <td class="n">${esc(ymd(r.got))}</td><td class="n">${d === null ? '—' : d + '일'}</td>
    <td><span class="st st--${r.state === '배포' ? 'teal' : r.state === '반영' ? 'acc' : 'dim'}">${esc(r.state)}</span></td></tr>`;
  }).join('')}
  </tbody></table>
  <p class="pd-note">${esc(loop.line)}</p>
  ${h('블록 사전', '화면은 이 부품들로만 조립된다 — 새 서비스가 생겨도 화면 코드를 고치지 않는다')}
  <table class="tb"><thead><tr><th>블록</th><th>무엇</th></tr></thead><tbody>
  ${Object.entries(BLOCKS).map(([k, v]) => `<tr><td><code class="n">${esc(k)}</code> ${esc(v.name)}</td><td>${esc(v.what)}</td></tr>`).join('')}
  </tbody></table>
  <p class="pd-note">다시 찍기: <b>node tools/gen/portal-gen.mjs</b> (전부) · <b>--queue</b> (요구 반영분만 ${q.filter((x) => x.rebuild).length}장)</p>`;
}

/* ── 손잡이 ───────────────────────────────────────────────────────── */
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-act="cost"]')) {
    const rows = [];
    CARDS.filter((c) => c.status === '운영').forEach((c) => PROFILES.forEach((p) => {
      const r = costOfNewRegion(c.id, p.id); if (r) rows.push(r);
    }));
    openModal({
      title: '새 지역 한 곳을 더 받으면', width: 720, tag: '계약 근거',
      content: `<p class="pd-note">카드는 그대로 두고 <b>지역 프로파일만 갈아 끼운</b> 산출이다 — 분기가 기능이기 때문에 계산된다.</p>
      <table class="tb"><thead><tr><th>서비스</th><th>지역</th><th class="r">대상 범위</th><th class="r">저장</th><th class="r">첫 추론</th><th class="r">추론/년</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${esc(r.card)}</td><td>${esc(r.region)}</td>
        <td class="n">${nf.format(r.cover)} km²</td><td class="n">${r.storageTb} TB</td>
        <td class="n">${nf.format(r.firstRun)} h</td><td class="n">${nf.format(r.gpuYear)} h</td></tr>`).join('')}
      </tbody></table>`,
      actions: [{ label: '닫기' }],
    });
  }
  if (e.target.closest('[data-act="gen"]')) {
    const q = genQueue();
    openModal({
      title: '다시 찍을 화면', width: 560,
      content: `<table class="tb"><thead><tr><th>서비스</th><th>지역</th><th>사유</th></tr></thead><tbody>
      ${q.map((x) => `<tr><td>${esc(x.card || x.deployId)}</td><td>${esc(x.region)}</td>
        <td>${x.rebuild ? '<span class="st st--acc">요구 반영</span>' : '<span class="st st--dim">변경 없음</span>'}</td></tr>`).join('')}
      </tbody></table><p class="pd-note">명령: <b>node tools/gen/portal-gen.mjs --queue</b></p>`,
      actions: [{ label: '닫기' }],
    });
  }
});
