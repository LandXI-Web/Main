/* 지자체 포털 컨트롤러 — 생성된 골격에 내용을 채운다.
   화면 구성(어느 탭에 어느 블록이 오는가)은 생성기가 이미 HTML 로 찍어 두었다.
   이 파일은 **블록 한 종류를 어떻게 그리는가**만 안다 — 카드 이름을 모른다.
   그래서 새 서비스가 생겨도 여기는 고치지 않는다(성장 규칙 R5).

   ── 무엇을 보고 그리는가 ────────────────────────────────────────────────
     1) 카드의 `kind` 선언(needsOf)  → 어떤 장치를 켤 것인가
     2) 그 배포본이 가진 실측(evidenceOf) → 장치 안에 무엇이 들어가는가
   둘 다 카드 이름이 아니다. `if (카드 === '영농관리')` 같은 줄은 이 파일에 없다.

   ── 값이 없을 때 ────────────────────────────────────────────────────────
   지어내지 않는다. 장치는 그대로 서고(선언이 그렇게 말했으므로), 안에는
   **왜 비었는지 한 줄**이 선다. 인파관리가 비어 있는 것은 버그가 아니라 2027년 사업이라
   모델이 아직 없기 때문이고, 화면은 그 사실을 적어야 한다.

   ── 한 화면 ─────────────────────────────────────────────────────────────
   표·목록·막대는 **잰 높이만큼만** 줄을 채운다(fitRows). 넘치면 스크롤이 아니라
   쪽으로 넘어간다 — 발주자는 판 안쪽 스크롤도 화면이 안 끝난 것으로 본다.
   그래서 2560×1440 에서는 더 많은 줄이, 1280×720 에서는 더 적은 줄이 보인다. */
import { mountShell, esc, nf, ymd, say } from './shell.js';
import { serviceCards, portalSummary, tenantById, evidenceOf, measuresOf, localModules, blockInfo } from '../assets/data/portal.js';
import { cardById, modelsOfCard, needsOf, CORE_MODULES } from '../assets/data/cards.js';
import { specOf, requestsOf } from '../assets/data/studio.js';
import { themeOf } from '../assets/data/brand.js';
import { cropsFor } from '../assets/data/crops.js';
import { profileOf, SHARE_LABEL, tierById } from '../assets/data/registry.js';

const body = document.body;
const TENANT = body.dataset.tenant || 'namwon';
const SVC = body.dataset.svc || '';
/* 이 화면이 **새 골격**인가 — 생성기가 찍은 것에만 data-gen="rows" 가 붙는다.
   광주전남 두 배포본은 옛 골격으로 이미 커밋돼 있고(판을 그리드로 덮어 쓰는 인라인 CSS +
   슬롯을 제 손으로 채우는 인라인 모듈) 같은 이 파일을 쓴다. 그 화면에서는
   **한 번만 그리고 다시 그리지 않는다** — 다시 그리면 그 인라인 모듈이 채운 것을 지운다.
   지도도 세우지 않는다(그쪽은 제 지도를 따로 세운다). */
const NEW = body.dataset.gen === 'rows';
const th = themeOf(TENANT);
const t = tenantById(TENANT);

/* ══ 껍데기 ═══════════════════════════════════════════════════════════ */
const svcCard = SVC ? serviceCards('lx').find((c) => c.id === SVC) : null;
mountShell({
  active: 'analysis',
  title: svcCard ? svcCard.name : '내 서비스',
  /* 제목 줄은 짧게 — shell.css 의 #page-sub 는 넘치면 `…` 로 자른다(법전이 금지하는 것).
     1280 폭에서 긴 줄이 잘렸다. 다만 **옛 골격 화면의 글은 줄이지 않는다** — 그 화면은
     1996 기준으로 맞춰 놓은 남의 작업이고, 내가 말을 빼앗을 자리가 아니다. */
  subtitle: svcCard
    ? (NEW ? `${esc(svcCard.region)} · ${esc(svcCard.year)}년 배포본`
      : `${esc(svcCard.region)} · ${esc(svcCard.year)}년 배포본 — 모델과 결과 품질은 LX 가 책임진다`)
    : esc(th.name),
  crumbs: svcCard
    ? [{ label: '내 서비스', href: 'portal.html' }, { label: svcCard.name }]
    : null,
  notice: false, asOf: svcCard?.lastRun || undefined, demo: true,
  /* 기관 포털은 **그 기관의 사이트**다 — LX 사이트의 하위 화면이 아니다.
     발주자(2026-09-21): "사실 다른 사이트라고 생각하고 해야지. 지자체에서는 나만의 AI 시스템인
                          것처럼 보여야 한다. LX에 위탁은 하지만."
     그래서 발의 주소를 그 기관 것으로 갈고, 위탁 사실은 **각주 한 줄**로 남긴다.
     이원화 구조와 같은 말이다 — 1층(AI 양산)은 LX, 2층(행정 서비스)은 기관 얼굴. */
  footAddr: `${th.name} · 대표전화 ${th.contact}`,
  footCredit: 'AI 판독 · 모델 개발과 갱신 — LX 한국국토정보공사',
  // 한 화면 — body[data-fit] 이 #main 을 남은 높이에 가둔다.
  // 옛 골격 화면을 여기에 가두면 넘치는 만큼이 **잘린다**. 새 골격에서만 건다.
  fit: NEW,
});
document.title = `${svcCard ? svcCard.name : '내 서비스'} — ${th.short}`;

/* CI 교체 · 메뉴 경계 — 골격(레일 72 · 마스트헤드 64)은 그대로 두고 두 가지만 갈아 끼운다.
   1) 마크: 간판은 그 기관 것이다.
   2) 메뉴: 기관은 **행정서비스 쪽만** 본다. 데이터 관리 · 프로젝트 · 카드 발행은 LX 몫이라
      기관 레일에 뜨면 이원화 경계가 무너진다(TENANTS.menus 가 정하고, 화면은 그것만 읽는다). */
const mark = document.getElementById('rail-mark');
if (mark) {
  mark.innerHTML = th.mark.split('/').map((s) => `<span>${esc(s)}</span>`).join('');
  mark.setAttribute('aria-label', `${th.name} 홈`);
  mark.setAttribute('href', 'portal.html');
}
if (Array.isArray(t.menus)) {
  const allow = new Set([...t.menus, 'my']);
  document.querySelectorAll('#rail .rail-i[data-menu]').forEach((a) => {
    if (!allow.has(a.dataset.menu)) a.remove();
  });
  const svcNav = document.querySelector('#rail .rail-i[data-menu="analysis"]');
  if (svcNav) { svcNav.href = 'portal.html'; svcNav.querySelector('.rl').textContent = '내 서비스'; }
}

/* ══ 공용 조각 ════════════════════════════════════════════════════════ */
const slot = (id, root = document) => root.querySelector(`[data-slot="${id}"]`);
const pct = (v) => `${Math.round(v * 100)}%`;
const ha = (v) => `${nf.format(Math.round(v * 10) / 10)} ha`;

function tile(label, val, unit, sub = '', tone = '') {
  const zero = val === null || val === undefined;
  return `<div class="tile${tone ? ` tile--${tone}` : ''}${zero ? ' tile--zero' : ''}">
    <span class="tile-l">${esc(label)}</span>
    <span class="tile-v"><b>${zero ? '—' : nf.format(val)}</b><span>${esc(unit || '')}</span></span>
    ${sub ? `<span class="tile-s">${sub}</span>` : ''}</div>`;
}

/** 막대 — 값이 있는 것만. 높이에 맞춰 위에서부터 n개. */
function bars(rows, max) {
  const m = max || Math.max(1, ...rows.map((r) => r[1]));
  return rows.map(([k, v]) => `<div class="pt-bar"><span>${esc(k)}</span>`
    + `<u style="width:${Math.max(1, Math.round((v / m) * 100))}%"></u>`
    + `<b>${nf.format(v)}</b></div>`).join('');
}

function legend(labels, colors) {
  return `<p class="pt-legend">${labels.map((l, i) => `<span><i style="background:${colors[i] || colors[colors.length - 1]}"></i>${esc(l)}</span>`).join('')}</p>`;
}

/** 값이 없는 자리 — 제목 한 줄 + **왜 없는지** 한 줄. 둘 다 없으면 쓰지 않는다. */
const empty = (head, why) => `<p class="pt-empty"><b>${esc(head)}</b>${why ? esc(why) : ''}</p>`;

/**
 * 잰 높이만큼만 채운다 — 판 안쪽 스크롤을 만들지 않기 위한 장치.
 * host 의 실제 높이를 재서 몇 줄이 들어가는지 계산하고, 그만큼만 그린다.
 * 화면이 커지면 더 많이 보이고 작아지면 덜 보인다. 지우는 게 아니라 쪽으로 넘긴다.
 */
function fitRows(host, rowH, min = 2) {
  // 판이 없으면 잴 것도 없다. 비동기로 그리는 칸은 기다리는 사이에 바깥 코드가
  // 그 자리를 통째로 갈아 끼울 수 있다(광주전남 배포본의 인라인 모듈이 그렇게 한다).
  if (!host) return min;
  const h = host.clientHeight || host.parentElement?.clientHeight || 0;
  return Math.max(min, Math.floor(h / rowH));
}

/* ══ 홈 — 서비스 카드 격자 ════════════════════════════════════════════ */
if (!SVC) {
  const cs = serviceCards(TENANT), s = portalSummary(TENANT);
  const span = s.years.length ? `${s.years[0]}–${s.years[s.years.length - 1]}년 사업` : '사업 없음';
  slot('summary').innerHTML = `
    <div class="band band--s">
      ${tile('내 서비스', s.total, '개', esc(span))}
      ${tile('운영 중', s.live, '개', '결과를 지금 쓸 수 있다')}
      ${tile('구축 · 예정', s.building + s.planned, '개', '분석 결과 준비 중', 'ink')}
      ${tile('실측 보유', s.measured, '개', '판독 결과가 들어와 있는 서비스', 'ink')}
      <p class="band-note">${esc(t.desc)} · 모델은 LX 가 만들고 갱신한다</p>
    </div>`;

  /* 카드가 세로로 길어진 만큼을 **빈칸이 아니라 실측 분포로** 채운다.
     홈에서 "어디에 몰려 있나"까지 보이면 그 다음 눌러야 할 서비스가 정해진다.
     분포가 없는 서비스는 여기에 '왜 없는지' 가 선다 — 지어낸 막대를 그리지 않는다. */
  /* 막대는 **넉넉히 심고 화면이 재서 줄인다**(trimCards). 2560×1440 에서는 읍·면·동이
     더 많이 보이고, 1280×720 에서는 몇 줄만 남는다 — 그것이 모니터마다 최적화다. */
  const distOf = (c) => {
    const e = evidenceOf(c.id);
    const run = e.runs[0];
    if (run && run.stats.emd) {
      return { head: `${run.title} · ${th.unitLabel}별 ${run.unit}`,
        rows: Object.entries(run.stats.emd).sort((a, b) => b[1] - a[1]).slice(0, 16) };
    }
    if (e.pairs.length) {
      return { head: '시점 쌍별 변화 지수(비지도) · 건',
        rows: e.pairs.map((p) => [p.label.replace(/2025-/g, ''), p.stats.n]) };
    }
    return null;
  };

  /* 분포가 없어도 **기관이 무엇을 하는 서비스인지**는 카드에 선다 —
     owner:'local' 전용 모듈이 곧 2층(기관)의 일이다. */
  /* 카드 얼굴 — **그 서비스가 실제로 판독한 자리**를 잘라 얹는다.
     발주자: "실 판독 크롭을 넣는다." 그림이 없으면 카드가 아니라 글자 상자다.
     다만 **그 서비스의 결과일 때만** 얹는다. 남원 정사영상이 있다고 해서 아직 판독하지 않은
     서비스(생활환경 · 도로안전 · 인파관리 2027)에 영상을 깔면, 안 한 일을 한 것처럼 보인다.
     그 카드들은 얼굴 없이 '왜 비었는지' 한 줄로 남는다 — 지어내지 않는다. */
  const faceOf = (c) => {
    const e = evidenceOf(c.id);
    const key = e.runs[0]?.id || (e.pairs.length ? 'kuksan-change' : '');
    const cr = key ? cropsFor(key)[0] : null;
    if (!cr) return null;
    // 판독 표시가 그려진 쪽(file)을 쓴다. clean 은 표시 없는 원본이라 '찾아 준 것'이 안 보인다.
    return { src: `../${cr.file}`, src2x: cr.file2x ? `../${cr.file2x}` : '',
      alt: `${c.name} — 실제 판독 자리 (${e.runs[0]?.title || '시점 비교'})` };
  };
  /* 얼굴 자리는 **다섯 장 모두 같다.** 있는 카드만 자리를 차지하면 글줄이 어긋나 덱이 흐트러진다.
     크롭이 없는 카드는 빈 판을 두되 **왜 없는지**를 적는다 — 남의 영상을 빌려다 채우지 않는다. */
  const face = (c) => {
    const f = faceOf(c);
    if (f) {
      return `<span class="pt-c-face"><img src="${esc(f.src)}"${f.src2x ? ` srcset="${esc(f.src)} 1x, ${esc(f.src2x)} 2x"` : ''}`
        + ` alt="${esc(f.alt)}" loading="lazy" decoding="async"></span>`;
    }
    const why = c.status === '예정' ? `${c.year}년 사업 — 판독 전` : '판독한 자리가 아직 없습니다';
    return `<span class="pt-c-face pt-c-face--none"><span>${esc(why)}</span></span>`;
  };

  const S = { done: '운영', wip: '구축 중', todo: '설계' };
  const localLine = (c) => {
    const lm = localModules(c.id);
    return lm.length
      ? `<span class="pt-c-lm"><span class="pt-c-dh">우리 시가 하는 일</span>${
        lm.map((m) => `<span class="pt-c-lmi">${esc(m.name)}<i>${esc(S[m.build] || S.todo)}</i></span>`).join('')}</span>`
      : '';
  };

  slot('cards').innerHTML = cs.map((c) => {
    const ms = c.measures || [];
    const d = distOf(c);
    const mid = `<span class="pt-c-d">${
      d ? `<span class="pt-c-dh">${esc(d.head)}</span><span class="pt-bars">${bars(d.rows)}</span>` : ''
    }${ms.length ? '' : `<span class="pt-c-gap">${esc(c.gap || c.note || '분석 실행 전 — 집계할 결과가 없습니다')}</span>`
    }${localLine(c)}</span>`;
    // 실측이 있으면 **제 단위 그대로** 한 줄씩. 단위가 다른 것을 더하지 않는다.
    // 모델 이름은 **줄바꿈으로** 받는다. 폭이 좁다고 글자를 잘라 내면 무슨 값인지 모른다.
    const evRows = ms.map((m) => `<span class="pt-c-m"><span class="mn">${esc(m.name)}</span>`
      + `<span class="mw"><b class="mv">${nf.format(m.value)}</b><span class="mu">${esc(m.unit)}</span></span></span>`).join('');
    return `
    <li><a class="pt-c" href="portal-${esc(c.id)}.html" data-state="${esc(c.status)}">
      ${face(c)}
      <span class="pt-c-y">${esc(c.year)} · ${esc(c.region)}</span>
      <strong class="pt-c-n">${esc(c.name)}</strong>
      <span class="pt-c-s">${esc(c.summary || c.duty || '')}</span>
      ${mid}
      ${evRows ? `<span class="pt-c-ev">${evRows}</span>` : ''}
      <span class="pt-c-f">
        <span class="st st--${c.status === '운영' ? 'teal' : c.status === '구축' ? 'acc' : 'dim'}">${esc(c.status)}</span>
        <span class="sp"></span>
        ${c.lastRun ? `<span class="n">${esc(ymd(c.lastRun))} 기준</span>` : `<span>${esc(c.scale || '')}</span>`}
        ${c.update && c.update.level !== 'same' ? '<span class="chip chip--on">갱신</span>' : ''}
      </span>
      <span class="pt-c-open">${c.status === '예정' ? '준비 중인 서비스 열기' : '이 서비스 펴기'}<i aria-hidden="true">→</i></span>
    </a></li>`;
  }).join('') || '<li class="pt-empty"><b>아직 깔린 서비스가 없습니다</b>LX 가 카드를 발행하면 여기에 놓입니다.</li>';

  /* 모니터마다 — 카드에 남은 높이를 재서 **막대 수만** 줄인다.
     이름 · 요약 · 실측 · 상태는 어느 화면에서도 온전히 남는다. 그것이 카드의 뜻이고,
     막대는 덤이다. 덤이 자리를 못 잡으면 덤을 접지, 뜻을 자르지 않는다.
     (1차 시도는 폭이 좁아지면 격자를 4열로 접었는데, 5장이 두 줄이 되면서 글자가 잘렸다) */
  const trimCards = () => {
    document.querySelectorAll('.pt-c').forEach((c) => {
      const d = c.querySelector('.pt-c-d'); if (!d) return;
      d.hidden = false;
      const bars = [...d.querySelectorAll('.pt-bar')];
      const barBox = d.querySelector('.pt-bars');
      const barHead = d.querySelector(':scope > .pt-c-dh');   // 막대 제목(기관 일 목록 제목과 구분)
      const lm = d.querySelector('.pt-c-lm');
      const lmItems = [...d.querySelectorAll('.pt-c-lmi')];
      [...bars, ...lmItems].forEach((x) => { x.hidden = false; });
      if (barBox) barBox.hidden = false;
      if (barHead) barHead.hidden = false;
      if (lm) lm.hidden = false;
      // 넘침은 **d 자신**을 재야 한다. d 가 overflow:hidden 이라 카드의 scrollHeight 는
      // 자라지 않는다 — 처음에 카드를 재다가 위쪽 막대가 잘려 나갔다.
      const over = () => d.scrollHeight - d.clientHeight > 1 || c.scrollHeight - c.clientHeight > 1;
      // 접는 순서 = 덜 중요한 것부터. 분포 막대 → 막대 묶음 → 기관 일 목록.
      // '우리 시가 하는 일'이 막대보다 오래 남는 이유는, 이 화면이 **기관 화면**이기 때문이다.
      for (let i = bars.length - 1; i >= 0 && over(); i--) bars[i].hidden = true;
      if (over() && barBox) { barBox.hidden = true; if (barHead) barHead.hidden = true; }
      for (let i = lmItems.length - 1; i >= 0 && over(); i--) lmItems[i].hidden = true;
      if (over() && lm) lm.hidden = true;
      // **'왜 비었는지' 한 줄은 끝까지 남긴다** — 그것이 이 카드가 전할 가장 중요한 말이다.
      if (over() && !d.querySelector('.pt-c-gap')) d.hidden = true;
    });
  };
  trimCards();
  let ht; addEventListener('resize', () => { clearTimeout(ht); ht = setTimeout(trimCards, 160); });

  /* ── 고르기 · 펴기 ────────────────────────────────────────────────────
     발주자: "카드 형태 서비스가 나오고 그걸 클릭하면 새로운 서비스 화면이 펼쳐지는거였어."

     고른 장이 있던 자리에서 판 하나가 화면까지 자라고, 그 뒤에 작업공간으로 넘어간다.
     **카드 본문을 늘리지 않는다** — 글자를 scale 하면 일그러진다. 자라는 것은 빈 판뿐이고,
     도착한 화면이 같은 결로 펴지면서(pt-unfold) 한 동작처럼 이어진다.

     움직임을 끈 사람에게는 아무 일도 하지 않는다 — 그냥 링크가 된다. */
  const deck = slot('cards');
  const slow = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cards = () => [...deck.querySelectorAll('.pt-c')];

  if (deck && !slow) {
    deck.addEventListener('click', (e) => {
      const a = e.target.closest('.pt-c'); if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault();
      const li = a.closest('li'), r = a.getBoundingClientRect();
      li.dataset.picked = ''; deck.dataset.open = '';

      const veil = document.createElement('div');
      veil.className = 'pt-veil';
      veil.style.inset = `${r.top}px ${innerWidth - r.right}px ${innerHeight - r.bottom}px ${r.left}px`;
      document.body.append(veil);
      // 자란 뒤에 넘어간다. 화면 전체를 덮은 판이 다음 화면의 바탕이 된다.
      requestAnimationFrame(() => { veil.style.inset = '0px'; });
      try { sessionStorage.setItem('pt.from', a.getAttribute('href') || ''); } catch { /* 저장소 차단 */ }
      setTimeout(() => { location.href = a.getAttribute('href'); }, 430);
    });
  }

  /* 좌우 키로 장을 옮긴다 — 고르는 화면이면 손이 카드 사이를 오갈 수 있어야 한다. */
  deck?.addEventListener('keydown', (e) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'Home' ? -99 : e.key === 'End' ? 99 : 0;
    if (!step) return;
    const list = cards(); const i = list.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    list[Math.min(list.length - 1, Math.max(0, Math.abs(step) > 9 ? (step > 0 ? list.length - 1 : 0) : i + step))].focus();
  });
}

/* ══ 도착 — 고른 카드에서 왔으면 같은 결로 펴진다 ══════════════════════ */
if (SVC && NEW) {
  let from = '';
  try { from = sessionStorage.getItem('pt.from') || ''; sessionStorage.removeItem('pt.from'); } catch { /* 저장소 차단 */ }
  if (from && from.includes(SVC) && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    body.dataset.from = '';
    // 한 번만 편다. 새로고침하거나 주소로 바로 들어온 사람에게는 펴는 동작이 없다.
    setTimeout(() => { delete body.dataset.from; }, 700);
  }
}

/* ══ 작업공간 ═════════════════════════════════════════════════════════ */
if (SVC && svcCard) {
  const spec = specOf(SVC);
  const card = cardById(svcCard.cardId) || {};
  const n = needsOf(card);
  const ev = evidenceOf(SVC);
  /* 정사영상 시점은 **정사영상을 먹는 카드에만** 쓴다.
     인파관리(입력=드론 영상)에 남원 농경지 정사영상 시점이 시간 축으로 붙어 있었다 —
     그 서비스의 자료가 아닌 것을 그 서비스의 값처럼 보여 주면 지어낸 것과 같다.
     무엇을 먹는지는 카드가 이미 선언해 두었다(kind.input). */
  if (!needsOf(cardById(svcCard.cardId) || {}).input.includes('ortho')) ev.epochs = [];
  const measures = measuresOf(SVC);
  const locals = localModules(SVC);
  const pf = profileOf(svcCard.region);
  const models = modelsOfCard(card);
  const reqs = requestsOf(SVC).filter((r) => r.state !== '접수');

  /* 왜 비었는가 — 한 곳에서만 말한다. 서비스마다 이유가 다르고, 그 이유가 곧 답이다. */
  const why = card.gap || svcCard.gap
    || (models.length === 0 ? '묶인 AI 모델이 없습니다 — 모델 개발 전입니다'
      : models.some((m) => m.real) ? '건별 결과가 아직 이 포털에 연계되지 않았습니다 — 모델 실적만 들어와 있습니다'
        : '분석 실행 전입니다');

  /* 고른 것 — 실행 · 시점. 한 군데서 갖고, 바뀌면 그 탭을 다시 그린다. */
  const pick = { run: ev.runs[0] || null, pair: ev.pairs[ev.pairs.length - 1] || null, epoch: ev.epochs[0] || null, base: 'satellite' };
  const geoCache = new Map();
  const maps = new WeakMap();

  const geoUrl = (p) => `../${p}`;
  async function geo(path) {
    if (!path) return null;
    if (!geoCache.has(path)) geoCache.set(path, fetch(geoUrl(path)).then((r) => (r.ok ? r.json() : null)).catch(() => null));
    return geoCache.get(path);
  }

  /* ── 탭 ─────────────────────────────────────────────────────────── */
  const tabs = [...document.querySelectorAll('.pt-tabs button')];
  const panes = [...document.querySelectorAll('.pt-pane')];
  const paneOf = (id) => panes.find((p) => p.dataset.tab === id);
  const showTab = (id) => {
    tabs.forEach((x) => x.setAttribute('aria-selected', String(x.dataset.tab === id)));
    panes.forEach((p) => { p.hidden = p.dataset.tab !== id; });
    // 옛 골격에서는 판만 켜고 끈다. 다시 그리면 그 화면의 인라인 모듈이 채운 것을 지운다.
    if (NEW) drawPane(paneOf(id));
  };
  tabs.forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

  // 요구로 들어온 블록에 흔적을 남긴다
  reqs.filter((r) => r.op === 'add').forEach((r) => {
    paneOf(r.at)?.querySelector(`.pt-b[data-block="${r.val}"]`)?.setAttribute('data-req', r.id);
  });

  /* ── 블록 그리기 ─────────────────────────────────────────────────── */
  const draw = {
    /* 한눈 현황 — 실측을 **제 단위 그대로** 한 칸씩. 더하지 않는다. */
    kpi: (el) => {
      if (!measures.length) {
        el.innerHTML = `<div class="band band--s">
          ${tile('판독 결과', null, '', esc(why))}
          ${tile('묶인 모델', models.length, '개', models.length ? esc(models.map((m) => m.name).join(' · ')) : '모델 개발 전', 'ink')}
          ${tile('대상 규모', null, '', esc(svcCard.scale || '미정'), 'ink')}
          <p class="band-note">${esc(svcCard.status)} · ${esc(svcCard.year)}년 사업</p></div>`;
        return;
      }
      el.innerHTML = `<div class="band band--s">
        ${measures.map((m) => tile(m.name, m.value, m.unit,
          m.run ? `${esc(nf.format(m.run.stats.count))} ${esc(m.run.unit)} · ${esc(ha(m.area))} · 신뢰도 ${esc(pct(m.conf))}`
            : `${esc(ymd(m.lastRun))} 실행`)).join('')}
        ${tile('묶인 모델', models.length, '개', `공통 모듈 ${CORE_MODULES.length}개 + 기관 전용 ${locals.length}개`, 'ink')}
        <p class="band-note">${esc(ymd(svcCard.lastRun || ''))} 기준 · 결과 수정·삭제 권한은 LX</p></div>`;
    },

    /* 분포 · 추이 — 시계열이 있으면 시점별, 없으면 행정구역별. 둘 다 없으면 이유. */
    chart: (el) => {
      if (n.timeAxis && ev.pairs.length) {
        const keys = [...new Set(ev.pairs.flatMap((p) => Object.keys(p.stats.byClass)))];
        const nm = { veg_gain: '식생 증가', veg_loss: '식생 감소', built_new: '신축', other: '기타' };
        const max = Math.max(...ev.pairs.map((p) => p.stats.n));
        el.innerHTML = `<div class="pt-bars">${bars(ev.pairs.map((p) => [p.label.replace(/2025-/g, ''), p.stats.n]), max)}</div>`
          + `<p class="pt-note">시점 쌍별 변화 <em>지수</em> 건수 — 유형: ${esc(keys.map((k) => nm[k] || k).join(' · '))}. 학습 모델의 탐지가 아니라 두 시점 영상의 변화 지수(비지도)입니다.</p>`;
        return;
      }
      const run = pick.run;
      if (run && run.stats.emd) {
        const host = el;
        const rows = Object.entries(run.stats.emd).sort((a, b) => b[1] - a[1]);
        host.innerHTML = '<div class="pt-bars"></div><p class="pt-foot"></p>';
        const box = host.querySelector('.pt-bars');
        const k = Math.min(rows.length, fitRows(box, 20, 3));
        box.innerHTML = bars(rows.slice(0, k));
        host.querySelector('.pt-foot').textContent =
          `${run.title} · 상위 ${k} / ${rows.length} ${th.unitLabel} · 단위 ${run.unit}`;
        return;
      }
      el.innerHTML = empty('분포를 그릴 결과가 없습니다', why);
    },

    /* 탐지 결과 목록 — 건별. 쪽으로 넘긴다(안쪽 스크롤 없음). */
    table: (el) => {
      if (!NEW) { el.innerHTML = legacyTable(); return; }      // 옛 골격: 그 화면이 제 손으로 채운다
      if (pick.run) return featureTable(el, pick.run);
      if (ev.pairs.length) return pairTable(el);
      el.innerHTML = empty('건별 목록이 없습니다', why) + gapNote();
    },

    /* 필지별 판정 — 지도와 짝이다. 줄을 누르면 지도가 그 필지로 간다. */
    parcel: (el, sec) => {
      if (!NEW) { el.innerHTML = legacyParcel(); return; }
      if (!pick.run) { el.innerHTML = empty('필지 결과가 없습니다', why) + gapNote(); return; }
      const opt = readOpt(sec);
      parcelTable(el, pick.run, opt);
    },

    /* 지도 — 진짜 MapLibre. 배경은 V-World, 그 위에 이 지역 정사영상 시점과 결과 레이어. */
    map: (el) => (NEW ? mapBlock(el)
      : el.innerHTML = `<div class="pt-map">지도 · ${esc(svcCard.region)} 결과 레이어<br>좌표계 ${esc(th.crs)}</div>`),

    /* 밀도 격자 — 격자 크기는 고를 수 있고, 값은 분석 실행 뒤에 들어온다. */
    heatmap: (el) => {
      el.innerHTML = `<div class="pt-map-bar"><span class="lb">격자</span>${
        ['50 m', '100 m', '200 m'].map((g, i) => `<button type="button" class="btn-br btn-br--s" data-grid="${g}" aria-pressed="${i === 1}">${g}</button>`).join('')
      }</div><div class="pt-map"><p class="pt-map-wait"></p></div>
      ${legend(['낮음', '보통', '높음', '매우 높음'], ['#E8F1FF', '#9DC4FB', '#4E92F9', '#006DF7'])}
      <p class="pt-note" data-role="gridnote"></p>`;
      const note = el.querySelector('.pt-map-wait');
      const foot = el.querySelector('[data-role="gridnote"]');
      const paint = () => {
        const on = el.querySelector('[data-grid][aria-pressed="true"]')?.dataset.grid || '100 m';
        note.textContent = `${on} 격자 · 집계할 밀도 결과가 없습니다 — ${why}`;
        foot.textContent = `구역을 ${on} 격자로 나눠 ㎡당 인원을 셉니다. 격자 크기는 기관이 정합니다.`;
      };
      el.querySelectorAll('[data-grid]').forEach((b) => b.addEventListener('click', () => {
        el.querySelectorAll('[data-grid]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        paint();
      }));
      paint();
    },

    /* 시점 — 시계열이 있으면 끌 수 있고, 없으면 왜 없는지 적힌 채로 선다. */
    timeline: (el) => {
      const steps = ev.pairs.length ? ev.pairs.map((p) => ({ k: p.pair, label: p.label, sub: `${p.stats.n}건` }))
        : ev.epochs.length ? ev.epochs.map((e) => ({ k: e.id, label: e.label.split('·').pop().trim(), sub: `GSD ${e.gsd} m` }))
          : [];
      if (!steps.length) {
        el.innerHTML = `<div class="pt-scrub"><span class="n">시각</span>
          <input type="range" min="0" max="100" value="0" disabled aria-label="시간 축 — 값 없음"><span class="n">—</span></div>`
          + empty('되감을 시각이 없습니다', why);
        return;
      }
      const i0 = Math.max(0, steps.findIndex((s) => s.k === (pick.pair?.pair || pick.epoch?.id)));
      el.innerHTML = `<div class="pt-scrub"><span class="n" data-role="t0">${esc(steps[0].label)}</span>
        <input type="range" min="0" max="${steps.length - 1}" step="1" value="${i0}" aria-label="시점">
        <span class="n" data-role="t1">${esc(steps[steps.length - 1].label)}</span></div>
        <p class="pt-steps" data-role="now"></p>`;
      const rng = el.querySelector('input');
      const now = el.querySelector('[data-role="now"]');
      const apply = () => {
        const s = steps[+rng.value];
        now.innerHTML = `<span>고른 시점 <b>${esc(s.label)}</b></span><span>${esc(s.sub)}</span>`
          + `<span>${esc(steps.length)}개 시점 중 ${+rng.value + 1}번째</span>`;
        if (ev.pairs.length) pick.pair = ev.pairs[+rng.value]; else pick.epoch = ev.epochs[+rng.value];
        document.querySelectorAll('.pt-b[data-block="map"] .pt-b-body').forEach((m) => m.__setPair?.(pick.pair));
        redrawTab(el);
      };
      rng.addEventListener('input', apply);
      apply();
    },

    /* 구간 등급 — 선을 끊어 등급으로. 구간 데이터가 오기 전에도 기준은 선다. */
    grade: (el) => {
      const G = [['A', '양호'], ['B', '주의'], ['C', '보수 검토'], ['D', '보수 시급'], ['E', '통행 위험']];
      /* 등급은 **한 색의 농도**로 오른다. 마지막 칸에 경고 빨강(--warn)을 채웠다가 법전에
         걸렸다 — warn 은 글자색 자리에만 쓴다. 농도 사다리가 등급을 더 잘 읽히게도 한다. */
      const c = ['#E8F1FF', '#9DC4FB', '#4E92F9', '#0057C4', '#01213F'];
      el.innerHTML = legend(G.map(([g, s]) => `${g} ${s}`), c)
        + `<p class="pt-note">100 m 구간마다 파손 밀도로 등급을 매깁니다. <em>노선 구간화 · 포장 상태 등급은 기관 몫</em>입니다 — LX 는 파손 지점 판독까지입니다.</p>`
        + (measures.length ? '' : `<p class="pt-note">${esc(why)}</p>`);
    },

    /* 드론 영상 판독 — 장치는 선다. 원본 영상은 LX 가 보관하므로 기관 화면에는 결과만 온다. */
    player: (el) => {
      const raw = tierById('raw');
      el.innerHTML = `<div class="pt-vid" data-on="0"><span data-role="vs"></span></div>
        <div class="pt-scrub">
          <button type="button" class="btn-br btn-br--s" data-act="play" aria-pressed="false">재생</button>
          <input type="range" min="0" max="100" value="0" disabled aria-label="재생 위치">
          <button type="button" class="btn-br btn-br--s" data-act="boxes" aria-pressed="true">탐지 상자</button>
        </div>
        <p class="pt-note">${esc(raw.name)} — <em>${esc(SHARE_LABEL[raw.share])}</em>. 원본은 LX 가 보관하고 기관에는 판독 결과와 영상 이미지(타일)만 옵니다.</p>`;
      const vs = el.querySelector('[data-role="vs"]');
      const paint = () => {
        const playing = el.querySelector('[data-act="play"]').getAttribute('aria-pressed') === 'true';
        const boxes = el.querySelector('[data-act="boxes"]').getAttribute('aria-pressed') === 'true';
        vs.textContent = `드론 영상 미연계 — ${why}`
          + `  (재생 ${playing ? '켬' : '끔'} · 탐지 상자 ${boxes ? '켬' : '끔'})`;
      };
      el.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
        b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
        paint();
      }));
      paint();
    },

    /* 행정구역 집계 — 읍·면·동 단위. 실측이 있으면 표 그대로. */
    stats: (el) => {
      const run = pick.run;
      if (!run || !run.stats.emd) {
        el.innerHTML = empty(`${th.unitLabel}별로 묶을 결과가 없습니다`, why)
          + (pf ? `<p class="pt-note">${esc(pf.region)} · ${esc(pf.units)}개 ${esc(pf.unitLabel)} · ${esc(nf.format(pf.area))} km² — 경계는 들어와 있습니다.</p>` : '');
        return;
      }
      const rows = Object.entries(run.stats.emd).sort((a, b) => b[1] - a[1]);
      const total = rows.reduce((a, r) => a + r[1], 0);
      el.innerHTML = `<div class="pt-split"><div>
          <div class="pt-tb"><table>
            <colgroup><col style="width:34%"><col><col><col></colgroup>
            <thead><tr>
              <th>${esc(th.unitLabel)}</th><th class="r">${esc(run.unit)}</th><th class="r">비중</th><th class="r">누적</th>
            </tr></thead><tbody></tbody></table></div>
          <p class="pt-pager"><span data-role="c"></span><span class="sp"></span>
            <button type="button" class="btn-br btn-br--s" data-act="xls">엑셀 내려받기</button></p>
        </div><aside class="pt-side">${sideOf(run, 'mix')}</aside></div>`;
      const tb = el.querySelector('tbody');
      const k = Math.min(rows.length, Math.max(3, fitRows(el.querySelector('.pt-tb'), 28) - 1));
      let acc = 0;
      tb.innerHTML = rows.slice(0, k).map(([name, v]) => {
        acc += v;
        return `<tr><td>${esc(name)}</td><td class="r n">${nf.format(v)}</td>`
          + `<td class="r n">${pct(v / total)}</td><td class="r n">${pct(acc / total)}</td></tr>`;
      }).join('');
      el.querySelector('[data-role="c"]').textContent =
        `${run.title} · 상위 ${k} / ${rows.length} ${th.unitLabel} · 합계 ${nf.format(total)} ${run.unit}`;
      el.querySelector('[data-act="xls"]').addEventListener('click',
        () => say(`${th.unitLabel}별 집계 ${rows.length}행을 내려받습니다 — 시연 화면입니다.`));
    },

    /* 보고서 발급 — 공문에 그대로 붙는 서식. 숫자는 실측만 들어간다. */
    report: (el) => {
      const today = svcCard.lastRun || '';
      /* 근거 크롭 — 공문에 붙는 그림이다. 실제 정사영상에서 판독 지점을 잘라 낸 것이고
         좌표·신뢰도·면적이 원본 결과에서 따라온다(crops.js). 없으면 아예 넣지 않는다. */
      const cr = ev.crops.slice(0, 4);
      el.innerHTML = `<div class="pt-doc">
        <p class="pt-doc-t">${esc(svcCard.name)} 분석 결과 보고</p>
        <dl>
          <dt>대상</dt><dd>${esc(svcCard.region)} · ${esc(svcCard.scale || '—')}</dd>
          <dt>근거 업무</dt><dd>${esc(card.duty || '—')}</dd>
          <dt>분석 기준일</dt><dd class="n">${esc(today ? ymd(today) : '—')}</dd>
          <dt>판독 결과</dt><dd>${measures.length
            ? esc(measures.map((m) => `${m.name} ${nf.format(m.value)} ${m.unit}`).join(' · '))
            : `<em>${esc(why)}</em>`}</dd>
          <dt>판독 책임</dt><dd>LX 한국국토정보공사 — 결과의 검수·수정·삭제 권한은 LX</dd>
          <dt>행정 가공</dt><dd>${locals.length ? esc(locals.map((m) => m.name).join(' · ')) : '해당 없음'} (${esc(th.name)})</dd>
        </dl>
        ${cr.length ? `<h4 class="pt-note" style="margin:0">붙임 · 판독 근거 ${cr.length}점</h4>
        <div class="pt-crops">${cr.map((c, i) => `<figure class="pt-crop">
          <img src="../${esc(c.file)}" alt="${esc(c.of)} 판독 근거 ${i + 1}" loading="lazy">
          <figcaption>${esc(CLS_SHORT(c.cls || '판독 지점'))}${c.conf != null ? ` · 신뢰도 ${pct(c.conf)}` : ''}${c.area_m2 != null ? ` · ${nf.format(c.area_m2)} ㎡` : ''}</figcaption>
        </figure>`).join('')}</div>` : ''}
        <p class="pt-doc-seal">${esc(th.sealNote)} · 문의 ${esc(th.contact)}</p>
      </div>
      <p class="pt-pager"><span>서식은 LX 가 한 벌로 관리합니다 — 기관은 CI 한 벌만 냅니다.</span><span class="sp"></span>
        <button type="button" class="btn-br btn-br--s" data-act="report">보고서 발급</button></p>`;
      el.querySelector('[data-act="report"]').addEventListener('click',
        () => say('보고서 발급은 시연 화면입니다 — 서식은 LX 가 한 벌로 관리합니다.'));
    },

    /* 기관 행정 가공 — **2층의 정체성이 사는 자리**. LX 는 판독까지다. */
    ext: (el) => {
      if (!locals.length) { el.innerHTML = empty('이 서비스에는 기관 전용 기능이 없습니다', '판독 결과를 그대로 씁니다.'); return; }
      const S = { done: ['만듦', 'teal'], wip: ['만드는 중', 'acc'], todo: ['설계 단계', 'dim'] };
      el.innerHTML = `<div class="pt-list">${locals.map((m) => {
        const [lab, tone] = S[m.build] || S.todo;
        return `<div class="pt-it">
          <span class="pt-it-n">${esc(m.name)}</span>
          <span class="pt-it-s st st--${tone}">${esc(lab)}</span>
          <span class="pt-it-d">${esc(m.desc)}</span>
          ${m.build === 'done' ? '<span class="pt-it-a"><button type="button" class="btn-br btn-br--s" data-goto="map">지도에서</button></span>' : ''}
        </div>`;
      }).join('')}</div>
      <p class="pt-note">기관마다 업무 규칙이 달라 LX 가 표준화하지 않습니다 — <em>${esc(th.name)}가 만들고 여기서 돕니다.</em></p>`;
      el.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.goto)));
    },

    /* 이 서비스의 근거 — 어떤 모델이, 어떤 영상으로, 어느 버전으로 도는가. */
    basis: (el) => {
      const up = svcCard.update;
      const rows = [
        ...models.map((m) => ({ n: m.name, s: m.real ? `${nf.format(m.count)} ${m.unit}` : '준비 중',
          d: `${m.ministry} · ${m.real ? `${ymd(m.lastRun)} 실행` : '실측 없음'}` })),
        ...ev.epochs.slice(0, 4).map((e) => ({ n: e.label, s: `GSD ${e.gsd} m`, d: `정사영상 ${e.captured} · 타일 공유` })),
        { n: '카드 버전', s: card.version || '—', d: up && up.level !== 'same' ? `갱신 필요 — ${up.need}` : 'LX 최신 버전과 같습니다' },
      ];
      el.innerHTML = '<div class="pt-list"></div>'
        + `<p class="pt-note">모델 개발·갱신은 LX 몫입니다. 오탐·누락은 <em>서비스 지원</em>으로 신고하면 다음 학습에 들어갑니다.</p>`;
      const box = el.querySelector('.pt-list');
      const k = Math.min(rows.length, fitRows(box, 42, 2));
      box.innerHTML = rows.slice(0, k).map((r) => `<div class="pt-it">
        <span class="pt-it-n">${esc(r.n)}</span><span class="pt-it-s n">${esc(r.s)}</span>
        <span class="pt-it-d">${esc(r.d)}</span></div>`).join('');
    },
  };

  /* 빈 칸에는 **무엇이 있어야 채워지는지**까지 적는다. '없음' 한 줄은 화면을 죽은 것으로
     보이게 하지만, 무엇이 남았는지 적으면 그 칸은 다음에 할 일이 된다.
     셋 다 지어낸 값이 아니라 대장이 이미 들고 있는 것이다 —
     실적(services.js) · 이식 필요 조건(카드 needs) · 기관 모듈(EXT_MODULES owner:'local'). */
  const gapNote = () => {
    const todo = locals.filter((m) => m.build !== 'done');
    return (measures.length ? `<p class="pt-note">모델 실적: ${esc(measures.map((m) => `${m.name} ${nf.format(m.value)} ${m.unit}`).join(' · '))}</p>` : '')
      + (card.needs?.length ? `<p class="pt-note">이 칸이 서려면: ${esc(card.needs.join(' · '))}</p>` : '')
      + (todo.length ? `<p class="pt-note">기관 기능 <em>${esc(todo.map((m) => m.name).join(' · '))}</em> — ${esc(th.name)}가 만듭니다.</p>` : '');
  };

  /* ── 표 두 종류 ──────────────────────────────────────────────────── */
  const CLS_SHORT = (s) => String(s).replace(/^비닐하우스_/, '').replace(/_/g, ' ');
  const dl = (rows) => `<dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;

  /** 같은 결과의 다른 얼굴 — 분류 구성 · 면적 · 신뢰도. 전부 실측(results.js stats)이다. */
  function sideOf(run, what) {
    const st = run.stats;
    if (what === 'conf') {
      const hist = st.confHist || [];
      const max = Math.max(1, ...hist);
      return `<h4>AI 신뢰도 분포 (${esc(nf.format(st.confN))}건)</h4>
        <div class="pt-bars">${hist.map((v, i) => [`${(i / 10).toFixed(1)}–${((i + 1) / 10).toFixed(1)}`, v])
          .filter((r) => r[1] > 0).map(([k, v]) => `<div class="pt-bar"><span>${esc(k)}</span>`
            + `<u style="width:${Math.max(1, Math.round((v / max) * 100))}%"></u><b>${nf.format(v)}</b></div>`).join('')}</div>
        ${dl([['평균', pct(st.confMean)], ['중앙값', pct(st.confMedian)],
          ['최소 · 최대', `${pct(st.confMin)} · ${pct(st.confMax)}`]])}
        <h4>분류별</h4>${dl(Object.entries(st.classes).map(([k, v]) => [CLS_SHORT(k), `${nf.format(v)} ${run.unit}`]))}`;
    }
    return `<h4>분류별 구성</h4>
      ${dl(Object.entries(st.classes).map(([k, v]) => [CLS_SHORT(k), `${nf.format(v)} ${run.unit}`]))}
      <h4>면적</h4>${dl([['합계', ha(st.areaHa)], ['평균', `${nf.format(st.areaMeanM2)} ㎡`],
        ['중앙값', `${nf.format(st.areaMedianM2)} ㎡`]])}
      <h4>AI 신뢰도</h4>${dl([['평균', pct(st.confMean)], ['중앙값', pct(st.confMedian)]])}
      <h4>판독</h4>${dl([['영상', run.sensor === 'drone' ? '드론 정사영상' : '항공 정사영상'],
        ['분석일', ymd(st.analyzedAt)], ['원 좌표계', st.crsSrc]])}`;
  }

  /* 옛 골격(data-gen 없음)이 쓰는 renderer 둘 — 2026-09-20 이전과 같은 것.
     그 화면들은 제 인라인 모듈로 이 자리를 다시 채우므로, 여기서는 fetch 를 걸지 않는다.
     비동기로 열어 두면 기다리는 사이에 그쪽이 자리를 갈아 끼워 판이 사라진다. */
  const legacyTable = () => (models.filter((m) => m.real).length
    ? `<table class="tb"><thead><tr><th>모델</th><th class="r">건수</th><th>단위</th><th>최근 실행</th></tr></thead><tbody>${
      models.filter((m) => m.real).map((m) => `<tr><td>${esc(m.name)}</td><td class="r n">${nf.format(m.count || 0)}</td>`
        + `<td>${esc(m.unit || '건')}</td><td class="n">${esc(ymd(m.lastRun || '—'))}</td></tr>`).join('')}</tbody></table>`
    : empty('건별 목록이 없습니다', why));
  const legacyParcel = () => `<table class="tb"><thead><tr><th>필지</th><th>${esc(th.unitLabel)}</th>`
    + `<th>판정</th><th>대장 대조</th></tr></thead><tbody><tr><td colspan="4" class="pt-empty">`
    + '필지 결과는 분석 실행 후 채워집니다.</td></tr></tbody></table>';

  /* 비동기로 그리는 칸(표)은 늦게 온 응답이 새 내용을 덮지 않도록 세대를 단다. */
  let GEN = 0;

  /** 건별 목록 — geojson 을 읽어 쪽 단위로. 고른 줄은 지도와 이어진다. */
  async function featureTable(el, run) {
    const gen = el.dataset.gen = String(++GEN);
    const runs = ev.runs;
    el.innerHTML = `${runs.length > 1 ? `<div class="pt-map-bar"><span class="lb">분석 실행</span>${
      runs.map((r) => `<button type="button" class="btn-br btn-br--s" data-run="${esc(r.id)}" aria-pressed="${r.id === run.id}">${esc(r.title.replace(/^[가-힣]+시 /, ''))}</button>`).join('')
    }</div>` : ''}
      <div class="pt-split"><div>
        <div class="pt-tb"><table>
          <colgroup><col style="width:13%"><col style="width:13%"><col style="width:15%"><col style="width:13%"><col></colgroup>
          <thead><tr>
            <th>분류</th><th>${esc(th.unitLabel)}</th><th class="r">면적 ㎡</th><th class="r">신뢰도</th><th>필지번호(PNU)</th>
          </tr></thead><tbody><tr><td colspan="5">결과를 읽는 중…</td></tr></tbody></table></div>
        <p class="pt-pager"><span data-role="c">—</span><span class="sp"></span>
          <button type="button" class="btn-br btn-br--s" data-page="-1" disabled>이전</button>
          <button type="button" class="btn-br btn-br--s" data-page="1" disabled>다음</button></p>
      </div><aside class="pt-side">${sideOf(run, 'conf')}</aside></div>`;
    el.querySelectorAll('[data-run]').forEach((b) => b.addEventListener('click', () => {
      pick.run = ev.runs.find((r) => r.id === b.dataset.run) || pick.run;
      redrawTab(el);
    }));
    const g = await geo(run.geojson);
    if (!el.isConnected || el.dataset.gen !== gen) return;            // 그 사이 다른 것이 그려졌으면 버린다
    const tb = el.querySelector('tbody');
    if (!g) { tb.innerHTML = `<tr><td colspan="5">결과 파일을 읽지 못했습니다 — ${esc(run.geojson)}</td></tr>`; return; }
    const fs = g.features;
    let page = 0;
    const per = Math.max(3, fitRows(el.querySelector('.pt-tb'), 28) - 1);
    const paint = () => {
      const from = page * per;
      tb.innerHTML = fs.slice(from, from + per).map((f, i) => {
        const p = f.properties;
        return `<tr data-i="${from + i}"><td>${esc(CLS_SHORT(p.cls))}</td><td>${esc(p.emd || '—')}</td>`
          + `<td class="r n">${nf.format(Math.round(p.area || 0))}</td>`
          + `<td class="r n">${p.conf == null ? '—' : pct(p.conf)}</td><td class="n">${esc(p.pnu || '—')}</td></tr>`;
      }).join('');
      el.querySelector('[data-role="c"]').textContent =
        `${run.title} · ${nf.format(from + 1)}–${nf.format(Math.min(from + per, fs.length))} / ${nf.format(fs.length)} ${run.unit}`;
      el.querySelector('[data-page="-1"]').disabled = page === 0;
      el.querySelector('[data-page="1"]').disabled = from + per >= fs.length;
    };
    el.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => {
      page = Math.max(0, page + Number(b.dataset.page)); paint();
    }));
    paint();
  }

  /** 고른 시점 쌍의 속살 — change.js 가 가진 값만 적는다. */
  function pairSide(p, nm) {
    if (!p) return '';
    const tot = p.stats.n || 1;
    return `<h4>고른 시점 · ${esc(p.label)}</h4>
      ${dl(Object.entries(p.stats.byClass).map(([k, v]) => [nm[k] || k, `${nf.format(v)}건 · ${pct(v / tot)}`]))}
      <h4>범위</h4>${dl([['건수', `${nf.format(p.stats.n)}건`],
        ['면적', `${nf.format(Math.round(p.stats.area_m2))} ㎡`],
        ['방법', p.method], ['줌', `${p.minzoom}–${p.maxzoom}`]])}
      <p class="pt-note">시점 축을 끌면 지도의 결과 레이어도 그 쌍만 남습니다.</p>`;
  }

  /** 시점 쌍 표 — 변화 지수(비지도). 탐지 결과가 아니라는 표기를 반드시 단다. */
  function pairTable(el) {
    const nm = { veg_gain: '식생 증가', veg_loss: '식생 감소', built_new: '신축', other: '기타' };
    const keys = [...new Set(ev.pairs.flatMap((p) => Object.keys(p.stats.byClass)))];
    el.innerHTML = `<div class="pt-split"><div><div class="pt-tb"><table><thead><tr><th>시점 쌍</th>
      ${keys.map((k) => `<th class="r">${esc(nm[k] || k)}</th>`).join('')}
      <th class="r">합계</th><th class="r">면적 ㎡</th></tr></thead><tbody>
      ${ev.pairs.map((p) => `<tr data-pair="${esc(p.pair)}" aria-selected="${p.pair === pick.pair?.pair}">
        <td>${esc(p.label)}</td>
        ${keys.map((k) => `<td class="r n">${nf.format(p.stats.byClass[k] || 0)}</td>`).join('')}
        <td class="r n">${nf.format(p.stats.n)}</td><td class="r n">${nf.format(Math.round(p.stats.area_m2))}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="pt-note">학습 모델의 탐지가 아니라 두 시점 정사영상의 <em>변화 지수(비지도)</em>입니다 — 현장 확인 대상지를 좁히는 용도입니다.</p>
      </div><aside class="pt-side">${pairSide(pick.pair || ev.pairs[0], nm)}</aside></div>`;
    el.querySelectorAll('[data-pair]').forEach((tr) => tr.addEventListener('click', () => {
      pick.pair = ev.pairs.find((p) => p.pair === tr.dataset.pair) || pick.pair;
      redrawTab(el);
    }));
  }

  /** 필지별 판정 — 지도와 짝. 줄을 누르면 지도가 그 필지로 날아간다. */
  async function parcelTable(el, run, opt) {
    const gen = el.dataset.gen = String(++GEN);
    // 기관 요구(rq-01, 남원시 농정과) '대장 불일치만 먼저' 가 이 보기를 만든 이유다.
    el.innerHTML = `<div class="pt-map-bar"><span class="lb">보기</span>
        <button type="button" class="btn-br btn-br--s" data-f="all" aria-pressed="${opt?.filter !== 'mismatch'}">전체</button>
        <button type="button" class="btn-br btn-br--s" data-f="mismatch" aria-pressed="${opt?.filter === 'mismatch'}">대장 불일치 먼저</button>
      </div>
      <div class="pt-tb"><table>
        <!-- 19자리 PNU 가 잘리지 않을 만큼을 먼저 떼어 준다.
             1280 폭에서 다섯 칸을 똑같이 나눴더니 필지번호가 중간에서 끊겼다 —
             무슨 필지인지 모르는 필지 표는 대장과 대조할 수 없다. -->
        <colgroup><col style="width:46%"><col style="width:14%"><col style="width:16%"><col style="width:16%"><col></colgroup>
        <thead><tr>
        <th>필지번호(PNU)</th><th>${esc(th.unitLabel)}</th><th>판정</th><th class="r">면적 ㎡</th><th>대조</th>
      </tr></thead><tbody><tr><td colspan="5">결과를 읽는 중…</td></tr></tbody></table></div>
      <p class="pt-pager"><span data-role="c">—</span><span class="sp"></span>
        <button type="button" class="btn-br btn-br--s" data-page="-1" disabled>이전</button>
        <button type="button" class="btn-br btn-br--s" data-page="1" disabled>다음</button></p>
      <p class="pt-note" data-role="mm"></p>`;
    const g = await geo(run.geojson);
    if (!el.isConnected || el.dataset.gen !== gen) return;
    const tb = el.querySelector('tbody');
    if (!g) { tb.innerHTML = '<tr><td colspan="5">결과 파일을 읽지 못했습니다.</td></tr>'; return; }
    const fs = g.features.filter((f) => f.properties.pnu);
    let page = 0;
    const per = Math.max(3, fitRows(el.querySelector('.pt-tb'), 28) - 1);
    const paint = () => {
      const from = page * per;
      tb.innerHTML = fs.slice(from, from + per).map((f, i) => {
        const p = f.properties;
        return `<tr data-i="${from + i}" tabindex="0"><td class="n">${esc(p.pnu)}</td><td>${esc(p.emd || '—')}</td>`
          + `<td>${esc(CLS_SHORT(p.cls))}</td><td class="r n">${nf.format(Math.round(p.area || 0))}</td><td>—</td></tr>`;
      }).join('');
      el.querySelector('[data-role="c"]').textContent =
        `${nf.format(from + 1)}–${nf.format(Math.min(from + per, fs.length))} / ${nf.format(fs.length)} 필지`;
      el.querySelector('[data-page="-1"]').disabled = page === 0;
      el.querySelector('[data-page="1"]').disabled = from + per >= fs.length;
      tb.querySelectorAll('tr').forEach((tr) => tr.addEventListener('click', () => {
        tb.querySelectorAll('tr').forEach((x) => x.removeAttribute('aria-selected'));
        tr.setAttribute('aria-selected', 'true');
        flyTo(fs[+tr.dataset.i]);
      }));
    };
    el.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => {
      page = Math.max(0, page + Number(b.dataset.page)); paint();
    }));
    /* 요구는 숨기지 않는다 — 켤 수 없으면 **무엇이 있어야 켜지는지**를 적는다.
       지적 대장(PNU 소유·지목)이 아직 연계되지 않아 대조 칸은 비어 있다. 여기서
       `불일치 3건` 같은 숫자를 지어내면 그 순간 이 화면은 행정에 못 쓰는 화면이 된다. */
    const mm = el.querySelector('[data-role="mm"]');
    const paintMM = (f) => {
      mm.innerHTML = f === 'mismatch'
        ? '지적 대장(PNU 소유·지목)이 아직 연계되지 않아 <em>대조 결과가 비어 있습니다</em> — 판정까지가 현재 값입니다. 대장이 들어오면 이 보기가 켜집니다.'
        : `<em>필지 대장 대조</em>는 ${esc(th.name)} 전용 기능입니다 — LX 는 경작·비경작 판정까지입니다.`;
    };
    el.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => {
      el.querySelectorAll('[data-f]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      paintMM(b.dataset.f);
    }));
    paintMM(opt?.filter === 'mismatch' ? 'mismatch' : 'all');
    paint();
  }

  /* ── 지도 ────────────────────────────────────────────────────────── */
  /* 시점 단추 이름 — 지역 이름을 떼고 **무엇을 덮는 도엽인지 + 언제**를 남긴다.
     '남원 농경지 · 2025.10' 과 '남원 전역 · 2025.10' 이 둘 다 '2025.10' 으로 줄어
     같은 이름 단추가 두 개 서 있었다. 어느 것을 누를지 알 수 없는 화면은 자리 화면이다. */
  const epochLabel = (e) => {
    const what = String(e.label).replace(/^[^\s·]+\s*/, '').split('·')[0].trim();
    return `${String(e.captured).replace('-', '.')} ${what}`;      // 2025.10 농경지
  };

  function mapBlock(el) {
    if (el.dataset.built === '1') { maps.get(el)?.resize(); return; }
    el.dataset.built = '1';
    // 시점이 8개면 단추 줄이 두 줄이 되고 그만큼 지도가 낮아진다. 최신 6개까지.
    const epochs = ev.epochs.filter((e) => e.tiles)
      .sort((a, b) => String(b.captured).localeCompare(String(a.captured))).slice(0, 5);
    el.innerHTML = `<div class="pt-map-bar"><span class="lb">배경</span>
        <button type="button" class="btn-br btn-br--s" data-base="satellite" aria-pressed="true">위성</button>
        <button type="button" class="btn-br btn-br--s" data-base="base" aria-pressed="false">지도</button>
        ${epochs.map((e) => `<button type="button" class="btn-br btn-br--s" data-epoch="${esc(e.id)}" aria-pressed="false">${esc(epochLabel(e))}</button>`).join('')}
      </div>
      <div class="pt-map"><p class="pt-map-wait">지도를 세우는 중…</p></div>`;
    const host = el.querySelector('.pt-map');
    buildMap(el, host, epochs);
  }

  async function buildMap(el, host, epochs) {
    let gl;
    try { gl = await import('./map-gl.js'); } catch { gl = null; }
    if (!gl || !gl.hasGL()) {
      host.querySelector('.pt-map-wait').textContent = '지도 엔진(MapLibre)을 불러오지 못했습니다 — 네트워크를 확인해 주세요.';
      return;
    }
    const cam = pick.run?.camera || null;
    const box = document.createElement('div');
    box.style.cssText = 'position:absolute;inset:0';
    host.appendChild(box);
    let map;
    try {
      map = await gl.createMap(box, {
        center: cam?.center || [127.42136, 35.43203],
        zoom: cam ? Math.max(9.4, cam.zoom) : 10.4,
        label: `${svcCard.region} ${svcCard.name} 결과 지도 — 화살표 키로 이동, +/- 로 확대·축소`,
      });
    } catch {
      box.remove();                                        // 빈 판을 남기지 않는다
      host.querySelector('.pt-map-wait').textContent = '지도를 세우지 못했습니다 — 배경 타일에 닿지 않습니다.';
      return;
    }
    maps.set(el, map);
    host.querySelector('.pt-map-wait')?.remove();

    // 행정경계 — 프로파일이 가진 것이라 결과가 없어도 선다.
    geo('assets/data/geo/namwon-emd.geojson').then((j) => {
      if (j && map.getSource('emd')) {
        gl.setEmd(map, j.features.map((f, i) => ({ ...f, properties: { ...f.properties, fill: gl.EMD_FILL[i % gl.EMD_FILL.length] } })));
      }
    }).catch(() => {});

    // 정사영상 시점 — 실제로 구워진 타일이다(imagery.js).
    epochs.forEach((e) => {
      const id = `ep-${e.id}`;
      map.addSource(id, { type: 'raster', tiles: [`../${e.tiles}`], tileSize: 256, minzoom: e.minzoom, maxzoom: e.maxzoom, bounds: e.bounds });
      map.addLayer({ id, type: 'raster', source: id, layout: { visibility: 'none' } }, 'sr-fill');
    });

    const note = document.createElement('p');
    note.className = 'pt-map-note';
    host.appendChild(note);

    // 결과 레이어 — 있으면 올리고, 없으면 왜 없는지 판 위에 적는다.
    const src = pick.run?.geojson || (ev.pairs.length ? ev.pairs[0].polygons : null);
    const label = pick.run?.title || (ev.pairs.length ? '변화 지수(비지도)' : null);
    if (src) {
      const j = await geo(src);
      if (j) {
        gl.addResult(map, 'res', j, { opacity: 92, polyWidth: 2 });
        const bb = pick.run?.stats.bbox || ev.pairs[0]?.bounds;
        if (bb) gl.fit(map, bb, { pad: 24, maxZoom: 14 });
        note.innerHTML = `${esc(label)} · ${nf.format(j.features.length)}건 — 결과 레이어(청록). 좌표계 ${esc(th.crs)}`;
      } else {
        note.textContent = `결과 파일을 읽지 못했습니다 (${src}).`;
      }
    } else {
      note.innerHTML = `${esc(svcCard.region)} 행정경계만 표시됩니다 — <em>${esc(why)}</em>`;
    }

    const paint = () => {
      const b = el.querySelector('[data-base][aria-pressed="true"]')?.dataset.base;
      const epOn = el.querySelector('[data-epoch][aria-pressed="true"]')?.dataset.epoch;
      gl.setBase(map, b === 'base' ? 'base' : 'satellite');
      epochs.forEach((e) => map.getLayer(`ep-${e.id}`) && map.setLayoutProperty(`ep-${e.id}`, 'visibility', `ep-${e.id}` === `ep-${epOn}` ? 'visible' : 'none'));
      if (epOn) {
        const e = epochs.find((x) => x.id === epOn);
        gl.fit(map, e.bounds, { pad: 16, maxZoom: 17 });
      }
    };
    el.querySelectorAll('[data-base]').forEach((b) => b.addEventListener('click', () => {
      el.querySelectorAll('[data-base]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      el.querySelectorAll('[data-epoch]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      paint();
    }));
    el.querySelectorAll('[data-epoch]').forEach((b) => b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      el.querySelectorAll('[data-epoch]').forEach((x) => x.setAttribute('aria-pressed', String(x === b && on)));
      paint();
    }));
    /* 시점 축이 지도를 움직인다 — 고른 쌍의 도형만 남긴다.
       (변화 지수 geojson 은 네 쌍이 한 파일에 있고 `pair` 속성으로 구분된다) */
    if (ev.pairs.length) {
      el.__setPair = (pr) => {
        try { gl.setResultFilter(map, 'res', pr ? ['==', ['get', 'pair'], pr.pair] : null); } catch { /* 무시 */ }
        if (pr) note.innerHTML = `변화 지수(비지도) · ${esc(pr.label)} · ${nf.format(pr.stats.n)}건 — 결과 레이어(청록). 좌표계 ${esc(th.crs)}`;
      };
      el.__setPair(pick.pair);
    }

    // 필지 표에서 줄을 누르면 그 필지로 날아가 흰 테두리로 집어 준다.
    el.__fly = (f) => {
      if (!f) return;
      try { gl.setHighlight(map, [f]); map.flyTo({ center: bboxCenter(f), zoom: 16.4, duration: 700 }); }
      catch { /* 무시 — 지도가 아직 안 섰을 수 있다 */ }
    };
    map.resize();
  }

  const bboxCenter = (f) => {
    const cs = JSON.stringify(f.geometry.coordinates).match(/-?\d+\.?\d*/g).map(Number);
    let x = 0, y = 0, k = 0;
    for (let i = 0; i + 1 < cs.length; i += 2) { x += cs[i]; y += cs[i + 1]; k++; }
    return [x / k, y / k];
  };
  const flyTo = (f) => document.querySelectorAll('.pt-b[data-block="map"]').forEach((sec) => sec.querySelector('.pt-b-body')?.__fly?.(f));

  /* ── 그리기 ──────────────────────────────────────────────────────── */
  const readOpt = (sec) => { try { return JSON.parse(sec.dataset.opt || 'null'); } catch { return null; } };

  let drawing = false;
  function drawPane(pane) {
    if (!pane) return;
    drawing = true;                               // 첫 그리기 중에는 재그리기 요청을 무시한다
    pane.querySelectorAll('.pt-b').forEach((sec) => {
      const k = sec.dataset.block;
      const el = sec.querySelector('.pt-b-body');
      if (k === 'map' && el.dataset.built === '1') { maps.get(el)?.resize(); return; }
      try { (draw[k] || ((x) => { x.innerHTML = empty(blockInfo(k).name, '이 블록은 아직 자리만 잡혀 있습니다.'); }))(el, sec); }
      catch (e) { el.innerHTML = empty('이 칸을 그리지 못했습니다', String(e.message || e)); }
    });
    drawing = false;
  }
  /** 고른 것이 바뀌면 그 탭만 다시 그린다(지도는 이미 선 것을 다시 쓴다). */
  function redrawTab(fromEl) {
    if (drawing) return;
    const pane = fromEl.closest('.pt-pane');
    pane?.querySelectorAll('.pt-b').forEach((sec) => {
      const k = sec.dataset.block;
      if (k === 'map' || k === 'timeline') return;          // 지도·시간 축은 스스로 산다
      const el = sec.querySelector('.pt-b-body');
      try { draw[k]?.(el, sec); } catch { /* 무시 */ }
    });
  }

  if (NEW) drawPane(panes.find((p) => !p.hidden));
  else panes.forEach(drawPane);          // 옛 골격: 처음에 전부 한 번 그리고 끝(옛 동작 그대로)

  // 창 크기가 바뀌면 줄 수를 다시 잰다 — 모니터마다 최적화의 실체가 여기다.
  /* 옛 골격 화면에 있던 생성 내력 한 줄을 그대로 돌려 놓는다.
     새 골격에서는 이 줄이 판 높이를 먹어(한 화면이 깨진다) 빼 두었고,
     같은 말은 '이 서비스의 근거' 블록이 대신한다. */
  if (!NEW) document.querySelector('.pt-work')?.insertAdjacentHTML('beforeend',
    `<p class="pt-note">이 화면은 명세에서 생성되었습니다 · 블록 ${spec.tabs.reduce((a, x) => a + x.blocks.length, 0)}개`
    + `${spec.applied.length ? ` · 기관 요구 ${spec.applied.length}건 반영` : ''}`
    + `${spec.pending.length ? ` · <em>접수 ${spec.pending.length}건 대기</em>` : ''} — 요구는 LX 가 명세를 고쳐 다시 찍습니다.</p>`);

  let rt;
  if (NEW) addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { const p = panes.find((x) => !x.hidden); drawPane(p); }, 180);
  });
}
