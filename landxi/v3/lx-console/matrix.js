/* matrix.js — ③ 조립: '뭘 만들 수 있지?'에 답하는 카탈로그 매트릭스(업무 10 × 모델·대장·영상·규칙).
   카드 = 모델 + 규칙 + 대장 스키마(F3-DIRECTION §2). 업무 10행은 SURVEY-SPEC §1.1 표 그대로.
   칸의 채움은 전부 실데이터로 판정한다 — 모델=/registry/models 클래스 · 영상=/catalog/layers · 규칙=/survey/rules · 대장=필지 참조층/V-World. */
import { D, n, esc, mk, card, gsdText } from './data.js';

/* 업무 정의(카드 초안 — 서버 cards 에 ledger_schema 가 들어오면 그쪽이 정본) */
export const TASKS = [
  { id: 'farmland', name: '농지이용', dept: '농정과', cls: ['경작지', '비경작지'], ledger: 'parcel', gsd: .5, rules: ['R2'], card: 'card-farm' },
  { id: 'greenhouse', name: '비닐하우스', dept: '농정과', cls: ['비닐하우스', '비닐하우스_단동'], ledger: 'parcel', gsd: .5, rules: ['R3'], card: 'card-farm' },
  { id: 'illegal_bldg', name: '무허가 건축', dept: '건축과', cls: ['건물'], ledger: 'parcel', gsd: .5, rules: ['R1'], card: 'card-change' },
  { id: 'greenbelt', name: '개발제한구역', dept: '도시과', cls: ['built_gain'], ledger: 'vworld', gsd: .5, rules: [], card: 'card-change' },
  { id: 'landuse', name: '지목 불부합', dept: '토지정보과', cls: ['주차장', '경작지'], ledger: 'parcel', gsd: .5, rules: ['R4', 'R5'], card: 'card-change' },
  { id: 'dev_permit', name: '개발행위허가', dept: '허가과', cls: ['built_gain'], ledger: 'tenant', gsd: .5, rules: [], card: 'card-change' },
  { id: 'public_asset', name: '공유재산', dept: '회계과', cls: ['건물'], ledger: 'parcel', gsd: .5, rules: ['R6'], card: null },
  { id: 'river_occupy', name: '하천 점용', dept: '하천과', cls: ['건물'], ledger: 'tenant', gsd: .5, rules: [], card: null },
  { id: 'trash', name: '방치폐기물·소각', dept: '환경과', cls: ['폐기물', '쓰레기', '소각'], ledger: 'none', gsd: .05, rules: [], card: 'card-living' },
  { id: 'marine', name: '해양쓰레기', dept: '해양수산과', cls: ['해양쓰레기', '해안'], ledger: 'none', gsd: .05, imgMatch: /marine|coast|해안|해양/, rules: [], card: 'card-marine' },
];

const LEDGER = { parcel: '연속지적(지목)', vworld: 'V-World 개발제한구역', tenant: '기관 대장', none: '해당 없음' };

/** 한 업무의 네 칸 판정 */
export function judge(t) {
  const model = D.models.find((m) => (m.classes || []).some((c) => t.cls.includes(c)));
  const own = D.catalog.filter((i) => i.role === 'imagery' && i.source === 'pmtiles' && i.gsd_m != null && i.gsd_m <= t.gsd && (!t.imgMatch || t.imgMatch.test(i.id + i.name?.ko)));
  const parcels = D.catalog.find((i) => i.id.startsWith('parcels-'));
  const ledgerOk = t.ledger === 'none' || t.ledger === 'vworld' || (t.ledger === 'parcel' && !!parcels);
  const rules = D.rules.filter((r) => t.rules.includes(r.id));
  const hits = rules.reduce((s, r) => s + (r.counts?.total?.value || 0), 0);
  const cells = { model: !!model, ledger: ledgerOk, img: own.length > 0, rule: rules.length > 0 };
  return { t, model, own, parcels, rules, hits, cells, ready: Object.values(cells).every(Boolean), na: t.ledger === 'none' };
}

export function render(body, ui) {
  const rows = TASKS.map(judge);
  const ready = rows.filter((r) => r.ready).length;
  body.innerHTML = `
    <div class="big"><b class="num">${ready}</b><span class="num">/ ${TASKS.length}</span></div>
    <p class="big-l">지금 카드로 만들 수 있는 업무</p>
    <table class="mx" aria-label="업무별 준비 상태">
      <thead><tr><th>업무</th><th>모델</th><th>대장</th><th>영상</th><th>규칙</th></tr></thead>
      <tbody>${rows.map((r, i) => `
        <tr class="${r.ready ? 'is-ready' : ''}">
          <td><button class="task" data-i="${i}">${esc(r.t.name)}<small>${esc(r.t.dept)}</small></button></td>
          ${['model', 'ledger', 'img', 'rule'].map((k) => `<td><i class="cell ${r.cells[k] ? (k === 'ledger' && r.na ? 'is-half' : 'is-on') : ''}" title="${esc(tip(r, k))}"></i></td>`).join('')}
        </tr>`).join('')}
      </tbody>
    </table>
    <p class="mx-key"><span><i class="cell is-on"></i>있음</span><span><i class="cell is-half"></i>필요 없음</span><span><i class="cell"></i>없음</span></p>
    <div id="mxDetail"></div>`;
  body.querySelectorAll('.task').forEach((b) => b.addEventListener('click', () => detail(body.querySelector('#mxDetail'), rows[+b.dataset.i], ui)));
}

function tip(r, k) {
  if (k === 'model') return r.model ? (r.model.classes || []).join('·') : '모델 없음';
  if (k === 'ledger') return LEDGER[r.t.ledger];
  if (k === 'img') return r.own.length ? `${r.own.length}벌 · 최고 ${gsdText(Math.min(...r.own.map((i) => i.gsd_m)))}` : `${gsdText(r.t.gsd)} 이하 영상 없음`;
  return r.rules.length ? r.rules.map((x) => x.name).join(' · ') : '규칙 없음';
}

function detail(el, r, ui) {
  const c = r.t.card && card(r.t.card);
  const deps = r.t.card ? D.deploys.filter((d) => d.card_id === r.t.card) : [];
  const line = (ok, t, s) => `<li class="step ${ok ? 'is-ok' : 'is-todo'}"><i>${ok ? '✓' : '·'}</i><b>${t}</b><em>${ok ? '있음' : '필요'}</em><span>${s}</span></li>`;
  el.innerHTML = `
    <p class="sec__h" style="margin-top:20px"><span>${esc(r.t.name)}</span><b>${r.ready ? '카드로 만들 수 있음' : '채울 칸 ' + Object.values(r.cells).filter((x) => !x).length}</b></p>
    <ul class="steps">
      ${line(r.cells.model, '모델', r.model ? esc((r.model.classes || []).join(' · ')) : '학습 데이터부터')}
      ${line(r.cells.ledger, '대장', esc(LEDGER[r.t.ledger]))}
      ${line(r.cells.img, '영상', r.own.length ? `${r.own.length}벌 · ${esc(r.own[0].name.ko)}` : `${gsdText(r.t.gsd)} 이하 영상 등록`)}
      ${line(r.cells.rule, '규칙', r.rules.length ? `${esc(r.rules.map((x) => x.name).join(' · '))} · 의심 ${n(r.hits)}건 ${mk(r.rules[0].counts?.total)}` : '대조 규칙 작성')}
    </ul>
    ${c ? `<div class="act"><button class="btn btn--line" id="mxDeploy">${esc(c.name)} · 깔린 곳 ${deps.length}</button></div>` : `<p class="note">연결된 카드 없음</p>`}`;
  el.querySelectorAll('.step').forEach((s, i) => (s.style.animationDelay = i * 60 + 'ms'));
  el.querySelector('#mxDeploy')?.addEventListener('click', () => ui.open('deploy', { cardId: r.t.card }));
}
