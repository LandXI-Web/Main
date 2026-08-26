/* ============================================================================
   landxi/proto/scrub/ending.js — 브랜드 마감 판 (page-drawn brand close)

   근거: docs/superpowers/research/2026-08-26-promo-video.md §2(실측) · §4(9비트)
         docs/superpowers/proto/2026-08-26-film-shotlist-v2.md 「브랜드 마감 규격」
         scroll-craft references/worldflight.md §4 카피 창 · finale

   필름에는 글자를 굽지 않는다(프리앰블 `no text, no lettering, no numbers`).
   마지막 레그의 마지막 프레임이 붙잡힌 위에서 **페이지가 판을 그린다.**

   3단은 절대 겹치지 않는다 — 홍보영상의 문법이 그렇다(§2-2 「주의」):
     제품 워드마크(1.6 s) → 태그라인(1.8 s) → 운영기관 락업(2.4 s, 마지막 화면).

   핵심 시그니처 = **워드마크가 스크린이 아니라 월드에 붙어 있다.**
   홍보영상 63.00–64.33 에서 워드마크는 587 → 383 px(−35 %)로 줄어드는데,
   이는 로고 애니메이션이 아니라 카메라가 뒤로 빠진 결과다. 관객은 "로고가 붙었다"
   가 아니라 "이 세계가 이 이름을 갖고 있다"로 읽는다.
   우리는 그것을 이렇게 재현한다: 마지막 프레임을 이어받은 **살아 있는 지도를
   0.621 줌레벨만큼 실제로 줌아웃**시키고(지상 스케일 ×0.65), 워드마크는 같은 비율로
   1.538 → 1.000 스케일한다. 두 값은 같은 u 를 먹는다 = 같은 카메라에 물려 있다.
   (지도 스케일이 줄어도 프레임은 언제나 가득 찬다 — CSS 로 판을 축소했다면
    가장자리에 종이 바탕이 드러났을 것이다. 그래서 화면이 아니라 카메라를 움직인다.)
   ========================================================================= */

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const seg = (x, a, b) => clamp01((x - a) / (b - a));
const smooth = x => x * x * (3 - 2 * x);

/* 마감 판의 스크롤 예산(vh) — §4-1 「핀 예산」.
   LEAD  필름이 끝나고 크롬(마스트헤드·카피·계기판·항로)이 물러나는 구간.
         이 0.30vh 가 없으면 흰 카피 판 위로 워드마크가 겹쳐 뜬다.
   SPAN  B–I 9비트 = 7.0 필름초 = 1.54vh (manifest targetRate 0.218 vh/필름초).
   TAIL  마지막 화면(LX 락업)이 완전히 정지한 채로 쉬는 자리. */
export const LEAD = 0.30, SPAN = 1.54, TAIL = 0.16, PAD = LEAD + SPAN + TAIL;

/* 9비트 — 전부 §4-1 표의 초 값을 SPAN 으로 정규화한 것이다(합 = 7.00 s).
   B 0.20 · C 1.40 · D 0.35 · E 0.50 · F 1.30 · G 0.35 · H 0.50 · I 2.40 */
const BT = [0.20, 1.40, 0.35, 0.50, 1.30, 0.35, 0.50, 2.40];
const CUT = (() => { let a = 0; return BT.map(s => { const b = a; a += s / 7.0; return [b, a]; }); })();
const [B, C, D, E, F, G, H, I] = CUT;

const WM_WIDTH = 0.31;      // 프레임 폭 대비 — §2-1 실측 31.1 %
const WM_BASE = 0.568;      // 프레임 높이 대비 베이스라인 — §2-1 실측 56.8 %
/* 워드마크 벡터(assets/brand/vector/landxi-wordmark.svg, viewBox 5758×606)의 기하.
   글자 몸통은 y 15(캡 상단) → 589(베이스라인). O·C 의 둥근 바닥은 601 까지 오버슈트하고
   viewBox 는 606 에서 끝난다. 폭 : 캡하이트 = 5758/574 = 10.03 (홍보영상 실측 9.7). */
const WM_VB = [5758, 606];
const WM_BASELINE = 589 / WM_VB[1];   // 렌더 높이 대비 베이스라인 위치
const WM_CAP = 574 / WM_VB[1];        // 렌더 높이 대비 캡하이트
const SHRINK = 0.65;        // −35 % — §2-1 587 → 383 px
const DZ = Math.log2(1 / SHRINK);   // 0.621 줌레벨 = 지상 스케일 ×0.65

/* 실제로 쓸 줌아웃 폭(레벨).
   래스터 타일 레벨이 바뀌면 소스가 **한 번도 요청한 적 없는 z** 를 통째로 새로 받는다 —
   V-World 는 느려서 수축 중에 타일이 몇 장 비어 있다(실측: 0.226 에서 2.5 초 뒤에도
   `loading` 이 열 장 이상). MapLibre 는 256px 래스터의 레벨을 round(zoom + 1) 로 고르므로
   경계는 정수가 아니라 **.5** 다(coveringZoomLevel, roundZoom). 여수 13.60 은 z15 를
   그리고 13.03 은 z14 를 그린다 — 정수 경계 안(여수 −33 %)에 머물러도 레벨은 바뀐다.
   그래서 scrub.js 가 판을 만들 때 이 값으로 한 번 물러났다 돌아와 z14 를 미리 받아 둔다.
   줌 정수 경계는 그대로 지킨다(e2e 계약: floor(zoom) 불변). 정수 경계 안에 −22 % 이상의
   여유가 없을 때만 규격값(−35 %)을 그대로 쓴다 — 브랜드 문법이 타일 아티팩트보다 중요하다.

   ※ end-2 좌하단의 회청색 사각형은 로딩 구멍이 **아니다** — V-World 위성영상 자체의
   모자이크 공백이다(13/7001/3257, 14/14002/6515 … 타일 안에 평평한 회청색 면이 구워져
   있고 모든 레벨에 같다). 카메라가 물러나며 화각이 넓어질 때 프레임 안으로 들어온다.
   dz ≤ 0.23 이면 프레임 밖에 머물지만 그러면 −15 % 뿐이라 브랜드 문법이 깨진다. 소스 문제. */
export function dzFor(zoom) {
  const room = (zoom - Math.floor(zoom)) - 0.02;   // 줌 정수 경계까지(스펙 계약: floor(z) 불변)
  return room >= 0.35 ? Math.min(DZ, room) : DZ;
}

export function createEnding(ctx) {
  // 값은 <html> 에 흘린다. 마스트헤드는 [data-sc-mode] 밖에 있고, 커스텀 프로퍼티는
  // 상속으로만 내려가므로 트랙 컨테이너에 쓰면 크롬 페이드가 마스트헤드에 닿지 않는다.
  const root = document.documentElement;
  const host = document.getElementById('sb-end');
  const wm = document.getElementById('sb-end-wm');
  if (!host || !wm) return { paint() {}, layout() {}, jump() {}, PAD, state: () => null };

  const reduce = ctx.reduce;
  if (reduce) host.classList.add('is-static');

  let top = 0, wpx = 0, hpx = 0;   // 워드마크 실측 결과(스케일 1 기준)

  /* ── 워드마크 기하 — 홍보영상 비율을 화면 크기와 무관하게 재현한다 ────────
     워드마크는 브랜드 벡터(SVG) 그대로다 — 조판하지 않는다. 폭을 31 % 에 맞추고,
     렌더 높이에서 베이스라인(589/606)을 되짚어 56.8 % 에 건다. */
  function layout() {
    const vw = innerWidth, vh = innerHeight;
    // 31 % 는 **수축이 끝난 뒤**(스케일 1.000)의 폭이다 — 홍보영상 64.17 s 실측.
    // 재는 동안 월드 그룹을 1.000 으로 고정한다. 스케일이 걸린 채로 재면
    // 진입 크기(1.538×)를 31 % 에 맞추게 되고, 마감이 20 % 로 쪼그라든다.
    const prev = root.style.getPropertyValue('--sb-wm-s');
    root.style.setProperty('--sb-wm-s', '1');
    wm.style.width = (vw * WM_WIDTH).toFixed(2) + 'px';
    const r = wm.getBoundingClientRect();
    wpx = r.width || vw * WM_WIDTH;
    hpx = r.height || wpx * WM_VB[1] / WM_VB[0];
    top = vh * WM_BASE - hpx * WM_BASELINE;
    wm.style.top = top + 'px';
    root.style.setProperty('--sb-wm-cap', (hpx * WM_CAP).toFixed(2) + 'px');
    if (prev) root.style.setProperty('--sb-wm-s', prev); else root.style.removeProperty('--sb-wm-s');
  }

  let dz = null;
  function dzOf(P) {
    if (dz !== null) return dz;
    dz = (!P || !P.spec) ? DZ : dzFor(P.spec.zoom);   // 지도가 없으면 규격값 그대로
    return dz;
  }

  /* ── 스크롤 → 9비트 ─────────────────────────────────────────────────────── */
  let on = false, lastZ = null;
  function paint() {
    const vh = innerHeight;
    const y0 = ctx.trackTop() + ctx.totalVh() * vh;           // 필름이 끝나는 지점
    const lead = clamp01((scrollY - y0) / (LEAD * vh));
    const e = clamp01((scrollY - y0 - LEAD * vh) / (SPAN * vh));

    // 크롬은 필름이 끝나는 순간부터 물러난다. 마감 판은 빈 프레임 위에서 시작해야 한다.
    root.style.setProperty('--sb-chrome', (1 - lead).toFixed(4));
    document.documentElement.classList.toggle('sb-endgame', lead > 0.98);

    const want = lead > 0;
    if (want !== on) {
      on = want;
      host.classList.toggle('is-on', want);
      host.setAttribute('aria-hidden', want ? 'false' : 'true');
    }
    if (!want) return;
    root.style.setProperty('--sb-e', e.toFixed(5));

    if (reduce) return;   // 저감 모드 — 스크럽 없이 3줄 정지판(CSS .is-static)

    /* B 머티리얼라이즈(0.20 s) — 알파만. 스케일·슬라이드·글로우 금지(§2-1 「인 방식」). */
    const wmIn = seg(e, B[0], B[1]);
    const wmOut = seg(e, D[0], D[1]);
    root.style.setProperty('--sb-wm-op', (wmIn * (1 - wmOut)).toFixed(4));

    /* C 월드 부착 수축(1.40 s, −35 %) — 등속. 워드마크와 지도가 **같은 dz** 를 먹는다. */
    const u = seg(e, C[0], C[1]);
    const P = ctx.plate();
    const dz = dzOf(P);
    root.style.setProperty('--sb-wm-s', (1 + (Math.pow(2, dz) - 1) * (1 - u)).toFixed(5));
    if (P && P.ready && e <= D[1]) {
      const z = P.spec.zoom - dz * u;
      if (lastZ === null || Math.abs(z - lastZ) > 0.002) { lastZ = z; P.map.setZoom(z); }
    }

    /* D 크림 헤이즈(0.35 s) — 사방에서 조여든다. 워드마크는 동시 페이드(위 wmOut). */
    const h = smooth(seg(e, D[0], D[1]));
    root.style.setProperty('--sb-haze-op', e >= D[0] ? '1' : '0');
    root.style.setProperty('--sb-haze', (100 * (1 - h)).toFixed(2));

    /* E 태그라인 좌→우 와이프(0.50 s) · F 홀드(1.30 s) · G 디포커스 아웃(0.35 s) */
    const tw = smooth(seg(e, E[0], E[1]));
    const tg = seg(e, G[0], G[1]);
    root.style.setProperty('--sb-tag-clip', (100 - 100 * tw).toFixed(2) + '%');
    root.style.setProperty('--sb-tag-op', (e >= E[0] ? 1 - tg : 0).toFixed(4));
    root.style.setProperty('--sb-tag-blur', (8 * tg).toFixed(2) + 'px');

    /* H LX 락업 블러 인(0.50 s) + 동심원 리플 3겹 · I 홀드 2.40 s */
    const lx = seg(e, H[0], H[1]);
    root.style.setProperty('--sb-lx-op', (e >= H[0] ? Math.min(1, lx * 2.4) : 0).toFixed(4));
    root.style.setProperty('--sb-lx-blur', (10 * (1 - lx)).toFixed(2) + 'px');
    const rp = seg(e, H[0], I[0] + 0.16);
    for (let i = 0; i < 3; i++) {
      const r = clamp01((rp - i * 0.14) / 0.62);
      root.style.setProperty('--sb-rip' + i, (0.6 + 1.2 * r).toFixed(3));
      root.style.setProperty('--sb-rip' + i + '-o', ((1 - r) * 0.5).toFixed(3));
    }
    // CTA — 마지막 화면에 로그인 유도가 남아야 한다(§4-1 비트 I).
    root.style.setProperty('--sb-cta-op', seg(e, I[0] + 0.06, I[0] + 0.20).toFixed(4));
  }

  /* End 키 = 마감으로 건너뛴다. 필름이 끝나는 지점(크롬이 물러나기 시작하는 자리)에 선다. */
  function jump() {
    scrollTo({ top: Math.round(ctx.trackTop() + ctx.totalVh() * innerHeight), behavior: 'auto' });
    paint();
  }

  const stageOf = e => (e <= 0 ? 'lead' : e < D[1] ? 'wordmark' : e < G[1] ? 'tagline' : 'lockup');
  const op = id => +getComputedStyle(document.getElementById(id)).opacity;

  return {
    layout, paint, jump, PAD,
    state() {
      const vh = innerHeight, y0 = ctx.trackTop() + ctx.totalVh() * vh;
      const e = clamp01((scrollY - y0 - LEAD * vh) / (SPAN * vh));
      const r = wm.getBoundingClientRect();
      return {
        lead: clamp01((scrollY - y0) / (LEAD * vh)), e, on, stage: stageOf(e),
        cuts: { B, C, D, E, F, G, H, I },
        dz, shrink: dz === null ? null : Math.pow(2, -dz),
        wordmark: {
          widthPct: wpx / innerWidth, baselinePct: (top + hpx * WM_BASELINE) / innerHeight, height: hpx,
          liveWidthPct: r.width / innerWidth, opacity: op('sb-end-wm'),
        },
        tagline: op('sb-end-tag'),
        lockup: op('sb-end-lx'),
        cta: op('sb-end-cta'),
      };
    },
  };
}
