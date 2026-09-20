/* ============================================================================
   landxi/proto/scrub/ending.js — 브랜드 마감

   ── v2 (2026-09-01, FINALE_MODE = 'globe') ───────────────────────
   클라이언트 원문: *"필름은 마무리 영상이 더 있어야 될 것 같네 느낌상.
   한반도가 사라지면서 Land-XI 플랫폼 CI 가 떠야 될 것 같다."*

   레그 12(A12 → A01, 귀환)가 14번째 레그로 탑재되면서 필름의 마지막 프레임은
   한반도가 아니라 **A01 — 작업대 위 모형 지구본, 상단이 어두움** 이다.
   그 프레임을 붙잡은 채로 두 가지가 동시에 일어난다:

     ① 지구본이 어둠 속으로 물러난다 — 무대(.sb-world)가 실제로 축소되고(1 → 0.78)
        밝기·불투명도가 떨어지며(1 → 0.22), 무대 뒤 바닥이 필름의 캔버스색(#08090B)으로 닫힌다.
        세 값은 하나의 u 를 먹는다 = 하나의 카메라가 뒤로 빠지는 것으로 읽힌다.
     ② 그 위 빈 어둠에 **실제 브랜드 벡터**가 순서대로 뜬다 —
        landxi-wordmark.svg(백색) → tagline.svg(민트) → lx-lockup-reverse.svg(역상).
        AI 로 그린 글자·로고는 하나도 쓰지 않는다.

   연출 규칙(고정): 이징은 `cubic-bezier(0.15,1,0.3,1)` **하나**,
   지속은 500 / 750 / 1000 / 1250 ms **사다리**, 스태거는 워드마크 → 태그라인 → 락업 → CTA.
   그래서 CI 층은 스크럽하지 않는다 — 스크롤이 문턱을 넘으면 CSS 전이가 제 속도로 뜬다.
   물러남(①)만 스크럽이다(스크롤을 되감으면 지구본이 그대로 돌아온다).
   prefers-reduced-motion 이면 전이 없이 즉시 정지 상태(.is-static).

   ── v1 (2026-08-26, FINALE_MODE = 'plate') — 꺼 뒀다. 지우지 않았다 ────────
   국토 V-World 실지도 판 위에서 워드마크가 지도의 줌아웃과 같은 비율로 수축하던 9비트 판.
   레그 12 가 붙으면서 인계 카메라(A12 한반도)가 사라져 전제가 무효가 됐다.
   되돌리려면 FINALE_MODE 를 'plate' 로, manifest.finale.plate 를 true 로 되돌린다
   (아래 v1 상수·createPlateEnding 이 그대로 있고, index.html 의 .sb-end__v1 마크업도 남아 있다).
   근거 문서는 그대로다: docs/superpowers/research/2026-08-26-promo-video.md §2·§4.
   ========================================================================= */

/* 되돌리기 스위치. 'globe' = 지구본이 물러나고 CI 가 뜨는 마감(현재) · 'plate' = 국토 판 9비트(v1). */
export const FINALE_MODE = 'globe';

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
const WM_RATIO = 9.7;       // 폭 : 캡하이트 — §2-1 실측 (캡 41px @720p)
/* 워드마크는 브랜드 벡터를 쓰지 않는다. assets/brand/vector/landxi-wordmark.svg 는 홍보영상의
   트레이스가 아니라 Archivo Black 을 좁혀 다시 짠 폴백이라(shots/brand/vector-vs-promo.jpg 라벨)
   폭:캡 10.0 은 맞아도 글자 하나하나가 눌려 있고 낱말 사이가 벌어진다 — 31 % 로 놓으면 홍보영상의
   넓고 무거운 지오메트릭 그로테스크가 아니라 컨덴스드로 읽힌다. 원본 벡터가 오기 전까지는
   SUIT 800 조판이 더 가깝다. 태그라인·LX 락업은 벡터 그대로다(트레이스라 정확하다). */
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

   ※ V-World 위성영상에는 평평한 회청색 모자이크 공백이 구워져 있다(13/7001/3257 등, 모든
   레벨에 같다). 가막만 주변 실측(z15 64px 셀 표준편차 <3 · R>40, tools 없이 1회 샘플링):
     서쪽  lon < 127.672 (lat 34.522–34.545) · lon < 127.697 (lat ≤ 34.522, lat ≥ 34.602)
     동쪽  lon ≥ 127.801 (lat 34.552–34.574)
   dz 는 그대로 두고 인계 카메라 중심을 옮겨 해결한다 — manifest.handoffFinal.center 를
   [127.736, 34.566] 으로 잡으면 수축 끝(z13.02, 1440×900) 프레임이 lon 127.675–127.797 ·
   lat 34.535–34.597 이라 네 공백이 전부 프레임 밖이다. 수축은 중심 고정 줌아웃이므로
   끝 프레임이 비어 있지 않으면 중간 프레임도 비어 있지 않다. */
export function dzFor(zoom) {
  const room = (zoom - Math.floor(zoom)) - 0.02;   // 줌 정수 경계까지(스펙 계약: floor(z) 불변)
  return room >= 0.35 ? Math.min(DZ, room) : DZ;
}

export function createEnding(ctx) {
  return FINALE_MODE === 'globe' ? createGlobeEnding(ctx) : createPlateEnding(ctx);
}

/* ══ v2 — 지구본이 물러나고 CI 가 뜬다 ══════════════════════
   SPAN 안의 자리(전부 e = 0…1):
     0.00 – 0.34  물러남   무대 스케일 1 → 0.78 · 밝기 1 → 0.34 · 불투명 1 → 0.22 · 바닥 0 → 1
     0.22 →       워드마크   500 ms
     0.40 →       태그라인   750 ms
     0.58 →       LX 락업   1000 ms
     0.74 →       CTA        1250 ms
   문턱을 되넘으면 같은 전이로 되돌아간다. */
const STEPS = [['wm', 0.22], ['tag', 0.40], ['lx', 0.58], ['cta', 0.74]];
const RECEDE = 0.34;
const SCALE_END = 0.78, DIM_END = 0.34, FADE_END = 0.22;

function createGlobeEnding(ctx) {
  const root = document.documentElement;
  const host = document.getElementById('sb-end');
  const ci = document.getElementById('sb-end-ci');
  if (!host || !ci) return { paint() {}, layout() {}, jump() {}, PAD, mode: 'globe', state: () => null };

  const reduce = ctx.reduce;
  if (reduce) host.classList.add('is-static');

  let on = false;
  const lit = new Set();

  function paint() {
    const vh = innerHeight;
    const y0 = ctx.trackTop() + ctx.totalVh() * vh;             // 필름이 끝나는 지점
    const lead = clamp01((scrollY - y0) / (LEAD * vh));
    const e = clamp01((scrollY - y0 - LEAD * vh) / (SPAN * vh));

    // 크롬(마스트헤드·카피·계기판·항로)은 필름이 끝나는 순간부터 물러난다.
    root.style.setProperty('--sb-chrome', (1 - lead).toFixed(4));
    root.classList.toggle('sb-endgame', lead > 0.98);

    const want = lead > 0;
    if (want !== on) {
      on = want;
      host.classList.toggle('is-on', want);
      host.setAttribute('aria-hidden', want ? 'false' : 'true');
      // 물러남은 무대(.sb-world)에 거는 transform/filter/opacity 다. 마감 밖에서는 아예 걸지
      // 않는다 — 필름 13 레그가 도는 동안 무대에 합성 레이어를 하나 더 얹을 이유가 없다.
      root.classList.toggle('sb-receding', want);
      if (!want) {   // 되감아 나가면 무대와 CI 를 원래대로 돌려 놓는다
        lit.clear();
        for (const st of STEPS) ci.classList.remove('is-' + st[0]);
        root.style.setProperty('--sb-globe-s', '1');
        root.style.setProperty('--sb-globe-b', '1');
        root.style.setProperty('--sb-globe-o', '1');
        root.style.setProperty('--sb-floor', '0');
      }
    }
    root.style.setProperty('--sb-e', e.toFixed(5));
    if (!want) return;    // 마감 밖에서는 아무것도 쓰지 않는다

    if (reduce) return;   // 저감 모드 — 전이 없이 정지 상태(CSS .is-static)

    /* ① 물러남 — 하나의 u 가 스케일·밝기·불투명·바닥을 동시에 먹는다. */
    const u = smooth(seg(e, 0, RECEDE));
    root.style.setProperty('--sb-globe-s', (1 - (1 - SCALE_END) * u).toFixed(4));
    root.style.setProperty('--sb-globe-b', (1 - (1 - DIM_END) * u).toFixed(4));
    root.style.setProperty('--sb-globe-o', (1 - (1 - FADE_END) * u).toFixed(4));
    root.style.setProperty('--sb-floor', u.toFixed(4));

    /* ② CI — 문턱을 넘으면 클래스가 붙고 CSS 전이가 제 속도(500/750/1000/1250 ms)로 뜬다. */
    for (const st of STEPS) {
      const k = st[0], want2 = on && e >= st[1];
      if (want2 === lit.has(k)) continue;
      if (want2) lit.add(k); else lit.delete(k);
      ci.classList.toggle('is-' + k, want2);
    }
  }

  function layout() { /* v2 는 벡터라 실측 조판이 없다 — 폭은 CSS 가 vw 로 잡는다. */ }

  function jump() {
    scrollTo({ top: Math.ceil(ctx.trackTop() + ctx.totalVh() * innerHeight) + 1, behavior: 'auto' });
    paint();
  }

  const op = id => +getComputedStyle(document.getElementById(id)).opacity;
  const num = k => +getComputedStyle(root).getPropertyValue('--sb-' + k);

  return {
    layout, paint, jump, PAD, mode: 'globe',
    state() {
      const vh = innerHeight, y0 = ctx.trackTop() + ctx.totalVh() * vh;
      const e = clamp01((scrollY - y0 - LEAD * vh) / (SPAN * vh));
      const r = document.getElementById('sb-end-wm').getBoundingClientRect();
      const wmo = op('sb-end-wm'), tag = op('sb-end-tag'), lx = op('sb-end-lx');
      return {
        mode: 'globe',
        lead: clamp01((scrollY - y0) / (LEAD * vh)), e, on,
        stage: e <= 0 ? 'lead' : e < STEPS[0][1] ? 'recede' : e < STEPS[2][1] ? 'wordmark' : 'lockup',
        steps: { wm: STEPS[0][1], tag: STEPS[1][1], lx: STEPS[2][1], cta: STEPS[3][1] },
        globe: { scale: num('globe-s'), brightness: num('globe-b'), opacity: num('globe-o'), floor: num('floor') },
        wordmark: { opacity: wmo, widthPct: r.width / innerWidth, liveWidthPct: r.width / innerWidth,
          topPct: r.top / vh, bottomPct: r.bottom / vh },
        tagline: tag,
        lockup: lx,
        cta: op('sb-end-cta'),
        ci: [wmo, tag, lx],
      };
    },
  };
}

/* ══ v1 — 국토 V-World 판 위 9비트 (꺼 둠) ════════════════════════ */
function createPlateEnding(ctx) {
  // 값은 <html> 에 흘린다. 마스트헤드는 [data-sc-mode] 밖에 있고, 커스텀 프로퍼티는
  // 상속으로만 내려가므로 트랙 컨테이너에 쓰면 크롬 페이드가 마스트헤드에 닿지 않는다.
  const root = document.documentElement;
  const host = document.getElementById('sb-end');
  const wm = document.getElementById('sb-end-wm-v1');
  if (!host || !wm) return { paint() {}, layout() {}, jump() {}, PAD, state: () => null };

  const reduce = ctx.reduce;
  if (reduce) host.classList.add('is-static');

  let fs = 0, asc = 0, top = 0, wpx = 0;   // 워드마크 실측 결과(스케일 1 기준)
  let cv = null;

  /* ── 워드마크 기하 — 홍보영상 비율을 화면 크기와 무관하게 재현한다 ────────
     자족은 SUIT 800. 홍보영상은 지오메트릭 그로테스크 ExtraBold 이고, SUIT 는
     체계가 이미 싣고 있는 유일한 지오메트릭 표시 서체다(제4의 서체를 들이지 않는다).
     폭을 먼저 31 %에 맞추고, 그 다음 캔버스 폰트 메트릭으로 베이스라인을 56.8 %에 건다.
     em 값으로 어림잡지 않는 이유: 폴백 서체가 걸리면 비율이 통째로 어긋난다. */
  function layout() {
    const vw = innerWidth, vh = innerHeight;
    const target = vw * WM_WIDTH;
    // 31 % 는 **수축이 끝난 뒤**(스케일 1.000)의 폭이다 — 홍보영상 64.17 s 실측.
    // 재는 동안 월드 그룹을 1.000 으로 고정한다. 스케일이 걸린 채로 재면
    // 진입 크기(1.538×)를 31 % 에 맞추게 되고, 마감이 20 % 로 쪼그라든다.
    const prev = root.style.getPropertyValue('--sb-wm-s');
    root.style.setProperty('--sb-wm-s', '1');
    fs = target / WM_RATIO / 0.72;                 // 캡비 0.72 로 출발
    for (let i = 0; i < 3; i++) {                  // 실측으로 수렴시킨다
      wm.style.fontSize = fs + 'px';
      const w = wm.getBoundingClientRect().width;
      if (!w) break;
      fs *= target / w;
    }
    wm.style.fontSize = fs + 'px';
    wpx = wm.getBoundingClientRect().width;

    // line-height:1 상자 안에서 베이스라인이 앉는 높이 = (fs − (asc+desc))/2 + asc
    if (!cv) cv = document.createElement('canvas').getContext('2d');
    cv.font = '800 ' + fs + 'px SUIT, Pretendard, system-ui, sans-serif';
    const m = cv.measureText('LAND-XI PLATFORM');
    const a = m.fontBoundingBoxAscent || m.actualBoundingBoxAscent || fs * 0.88;
    const d = m.fontBoundingBoxDescent || m.actualBoundingBoxDescent || fs * 0.22;
    asc = (fs - (a + d)) / 2 + a;
    top = vh * WM_BASE - asc;
    wm.style.top = top + 'px';
    root.style.setProperty('--sb-wm-cap', (wpx / WM_RATIO).toFixed(2) + 'px');
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
    // y0 는 소수 px 이다(Σw × innerHeight). round 로 그 앞에 떨어지면 lead = 0 이라 판이 켜지지
    // 않는다(트랙 6.987vh × 900 = 6288.3 → 6288). 한 px 뒤에 선다 — lead ≈ 0.004, e = 0.
    scrollTo({ top: Math.ceil(ctx.trackTop() + ctx.totalVh() * innerHeight) + 1, behavior: 'auto' });
    paint();
  }

  const stageOf = e => (e <= 0 ? 'lead' : e < D[1] ? 'wordmark' : e < G[1] ? 'tagline' : 'lockup');
  const op = id => +getComputedStyle(document.getElementById(id)).opacity;

  return {
    layout, paint, jump, PAD, mode: 'plate',
    state() {
      const vh = innerHeight, y0 = ctx.trackTop() + ctx.totalVh() * vh;
      const e = clamp01((scrollY - y0 - LEAD * vh) / (SPAN * vh));
      const r = wm.getBoundingClientRect();
      return {
        mode: 'plate',
        lead: clamp01((scrollY - y0) / (LEAD * vh)), e, on, stage: stageOf(e),
        cuts: { B, C, D, E, F, G, H, I },
        dz, shrink: dz === null ? null : Math.pow(2, -dz),
        wordmark: {
          widthPct: wpx / innerWidth, baselinePct: (top + asc) / innerHeight, fontSize: fs,
          liveWidthPct: r.width / innerWidth, opacity: op('sb-end-wm-v1'),
        },
        tagline: op('sb-end-tag-v1'),
        lockup: op('sb-end-lx-v1'),
        cta: op('sb-end-cta-v1'),
      };
    },
  };
}
