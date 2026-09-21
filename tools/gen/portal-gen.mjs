#!/usr/bin/env node
/* 포털 화면 생성기 — 명세에서 지자체 화면을 찍어낸다.
 *
 *   발주자: "지자체 서비스 카드별로 디자인을 LX에서 클로드 코드로 만들어냈으면 좋겠다.
 *            그래야만 적극적으로 지자체에서 요구사항을 수시로 피드백 보완 할 수 있거든."
 *
 * 입력  landxi/assets/data/{cards,portal,studio,brand}.js   (명세 · CI)
 * 출력  landxi/proto/portal.html                            (기관 홈 = 서비스 카드 격자)
 *       landxi/proto/portal-<배포본>.html                   (카드별 작업공간 — 블록이 카드마다 다르다)
 *       landxi/proto/portal-gen.json                        (무엇을 언제 찍었나)
 *
 * 쓰는 법  node tools/gen/portal-gen.mjs            전부 다시 찍는다
 *          node tools/gen/portal-gen.mjs --queue    요구가 반영된 것만 다시 찍는다
 *
 * 화면 CSS 는 생성하지 않는다 — 골격(shell.css · parts.css · portal.css)은 LX 가 손으로 한 벌
 * 만들어 둔 생산품이고, 생성기는 **그 부품을 카드 명세대로 배치**할 뿐이다.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const D = (p) => pathToFileURL(resolve(ROOT, 'landxi/assets/data', p)).href;

const { DEPLOYS, cardById, modelsOfCard } = await import(D('cards.js'));
const { TENANTS, serviceCards, portalSummary, portalSpec, blockInfo, seatOf } = await import(D('portal.js'));
const { specOf, BLOCKS, genQueue, loopStats, studioScale } = await import(D('studio.js'));
const { themeOf, cssVars, brandGuard } = await import(D('brand.js'));

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const out = (rel, body) => { const p = resolve(ROOT, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, body, 'utf8'); return rel; };

/* ── 페이지 껍데기 — 모든 기관이 같은 것을 받는다(LX 생산품) ─────────
 * gl:true 인 화면은 MapLibre 를 함께 싣는다. 작업공간에는 **진짜 지도**가 선다 —
 * 연한 상자에 '지도' 라고 적어 둔 자리 화면은 기관이 업무에 못 쓴다. */
const page = ({ title, tenant, svc = '', mod, skeleton, gl = false }) => {
  const th = themeOf(tenant);
  return `<!doctype html><html lang="ko"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — ${esc(th.short)}</title>
<link rel="icon" href="../assets/images/favicon_landxi.png">
<script src="shell-gate.js"></script>
<link rel="stylesheet" href="fonts-system.css">${gl ? `
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.css">` : ''}
<link rel="stylesheet" href="shell.css">
<link rel="stylesheet" href="parts.css">
<link rel="stylesheet" href="portal.css">
<style>${cssVars(tenant)}</style>
</head><body class="lx pt" data-gen="rows" data-page="portal" data-tenant="${esc(tenant)}"${svc ? ` data-svc="${esc(svc)}"` : ''}>
<main id="main">${skeleton}</main>
<noscript>${esc(title)} — 이 화면은 자바스크립트가 필요합니다.</noscript>${gl ? `
<script src="https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.js"></script>` : ''}
<script type="module" src="${mod}"></script>
</body></html>
`;
};

/* ── 블록 골격 — 생성기가 아는 부품만 놓는다 ─────────────────────────
 * 이름과 한 줄 설명은 blockInfo() 가 준다. 생산 라인 사전(studio.js BLOCKS)의 말은
 * '머리 숫자' 처럼 만드는 쪽 말이라, 기관 화면에서는 쓰는 쪽 말로 덮인다. */
const block = (id, tab, opts = {}) => {
  const b = blockInfo(id); if (!b.name) return '';
  const o = opts[id] ? ` data-opt='${esc(JSON.stringify(opts[id]))}'` : '';
  return `\n      <section class="pt-b" data-block="${id}" data-seat="${seatOf(id)}" data-tab="${tab}"${o} aria-label="${esc(b.name)}">
        <h3 class="pt-b-h">${esc(b.name)}<span class="pt-b-w">${esc(b.what)}</span></h3>
        <div class="pt-b-body" data-slot="${id}"></div>
      </section>`;
};

/* 한 화면에 넣는 수 — 블록을 세로로 쌓지 않는다.
   band 는 얇게 한 줄씩 위에, grow 는 남은 높이를 **좌우로 나눠** 채운다.
   순서(기관 요구 order 연산)는 각 줄 안에서 그대로 지킨다. */
const paneSkeleton = (t) => {
  const band = t.band.map((b) => block(b, t.id, t.opts)).join('');
  const grow = t.grow.map((b) => block(b, t.id, t.opts)).join('');
  return (band ? `\n    <div class="pt-row pt-row--band">${band}\n    </div>` : '')
    + (grow ? `\n    <div class="pt-row pt-row--grow" data-n="${t.grow.length}">${grow}\n    </div>` : '');
};

const workspaceSkeleton = (spec) => {
  const tabs = spec.tabs.map((t, i) => `<button type="button" role="tab" id="pt-tab-${t.id}" aria-controls="pt-pane-${t.id}" data-tab="${t.id}" aria-selected="${i === 0}">${esc(t.name)}</button>`).join('');
  const panes = spec.tabs.map((t, i) => `\n  <div class="pt-pane" role="tabpanel" id="pt-pane-${t.id}" aria-labelledby="pt-tab-${t.id}" data-tab="${t.id}"${i ? ' hidden' : ''}>${paneSkeleton(t)}\n  </div>`).join('');
  return `
<div class="pt-work" data-svc="${esc(spec.deployId)}">
  <nav class="pt-tabs" role="tablist" aria-label="${esc(spec.name)} 작업공간">${tabs}</nav>${panes}
</div>`;
};

/* ── 찍는다 ────────────────────────────────────────────────────────── */
const onlyQueue = process.argv.includes('--queue');
/* --only=<조각> : 그 조각이 든 배포본만 다시 찍는다.
   광주전남 두 배포본은 생성기가 찍은 뒤 **손으로 넓혀 커밋**돼 있다(인라인 CSS·모듈).
   전부 다시 찍으면 그 작업이 지워지므로, 남원만 찍을 때 `--only=dp-nw-` 를 쓴다.
   장기적으로는 그 자리가 studio.js 의 블록 종류로 올라가야 하고, 그때 이 옵션은 필요 없다. */
const onlyArg = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const queue = genQueue();
const written = [];

// 1) 기관 홈 — 서비스 카드 격자 (기관마다 내용이 다르지만 화면은 한 벌)
written.push(out('landxi/proto/portal.html', page({
  title: '내 서비스', tenant: 'namwon', mod: 'portal-ui.js',
  /* 홈은 **고르는 화면**이다 — 대시보드가 아니다.
     발주자(2026-09-21): "타로카드 선택처럼 메인에서는 카드 형태 서비스가 나오고
                          그걸 클릭하면 새로운 서비스 화면이 펼쳐지는거였어."
     그래서 격자(.pt-grid)가 아니라 **덱(.pt-deck)** 이다. 칸이 아니라 낱장이 선다. */
  skeleton: `\n<div class="pt-home">\n  <div class="pt-sum" data-slot="summary"></div>\n  <ul class="pt-deck" data-slot="cards"></ul>\n</div>`,
})));

// 어느 배포본이 어느 기관 것인가 — 서비스 카드가 이미 답을 안다(추측하지 않는다).
const ownerOf = new Map();
TENANTS.filter((t) => t.kind === 'user').forEach((t) => serviceCards(t.id).forEach((c) => ownerOf.set(c.id, t.id)));

// 2) 배포본마다 작업공간 한 장 — **블록 구성이 카드마다 다르다**
for (const d of DEPLOYS) {
  const q = queue.find((x) => x.deployId === d.id);
  if (onlyQueue && !q?.rebuild) continue;
  if (onlyArg && !d.id.includes(onlyArg)) continue;
  const spec = portalSpec(d.id); if (!spec) continue;
  written.push(out(`landxi/proto/portal-${d.id}.html`, page({
    title: `${spec.name} · ${spec.region}`, tenant: ownerOf.get(d.id) || 'lx', svc: d.id,
    mod: 'portal-ui.js', skeleton: workspaceSkeleton(spec),
    gl: spec.tabs.some((t) => t.blocks.includes('map')),          // 지도탭이 있으면 MapLibre 를 싣는다
  })));
}

// 3) 무엇을 찍었나 — 감사 기록
const manifest = {
  at: new Date().toISOString().slice(0, 10),
  mode: onlyQueue ? 'queue' : onlyArg ? `only:${onlyArg}` : 'all',
  files: written,
  specs: DEPLOYS.map((d) => { const s = portalSpec(d.id); return s && { id: d.id, name: s.name, region: s.region, tabs: s.tabs.map((t) => ({ id: t.id, name: t.name, blocks: t.blocks, band: t.band, grow: t.grow })), applied: s.applied, pending: s.pending }; }).filter(Boolean),
  loop: loopStats(), scale: studioScale(),
  brand: TENANTS.filter((t) => t.kind === 'user').map((t) => brandGuard(t.id)),
};
out('landxi/proto/portal-gen.json', JSON.stringify(manifest, null, 2) + '\n');

console.log(`찍은 화면 ${written.length}장${onlyQueue ? ' (요구 반영분만)' : onlyArg ? ` (${onlyArg} 만)` : ''}`);
written.forEach((f) => console.log('  ·', f));
console.log('\n요구 고리:', JSON.stringify(loopStats(), null, 0));
console.log('생산 규모:', JSON.stringify(studioScale(), null, 0));
const bad = manifest.brand.filter((b) => !b.ok);
console.log(bad.length ? `CI 가드 경고 ${bad.length}건: ${JSON.stringify(bad)}` : 'CI 가드 이상 없음');
