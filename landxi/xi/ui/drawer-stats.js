/* drawer-stats.js — ① 읍면동 집계 카드(emd-stats 봉투 · 클릭한 읍면동 옆 유리) ② 우 서랍 '통계'(기존 stats-standard.html?embed=1 · iframe · 수정 없음).
   집계: on = GET /results/{set}/stats?by=emd · off = 02. 데이터/results/namwon-landcover-2023-emd-stats.json(실파일 직접 읽기). */
import { API, api, env, fixture } from '../../shared/api-v1.js';
import { numHtml, prov } from '../fx/provenance.js';
import { panelIn, panelOut, anchor, textIn } from '../fx/glass.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STATS_FILE = '/landxi/data/results/namwon-landcover-2023-emd-stats.json';
let memo = null;
/** 계약 §4.5 stats 응답 형식으로 정규화: { items:[{key, cd, n:{cls:Env}, area_ha:{cls:Env}}], total, _via } */
export async function emdStats() {
  if (memo) return memo;
  memo = (async () => {
    if (API.mode === 'on') {
      try {
        // 계약 §4.5: items = [{key, cd, cls, n:Env, area_ha:Env}] (읍면동 × 클래스) → 화면 형식 {by[emd][cls], total[cls]} 로 접는다(값은 봉투 그대로)
        const j = await api('/results/results/lx/namwon-landcover-2023/stats?by=emd');
        const by = {}, total = {};
        for (const it of j.items || []) {
          const k = it.key, c = it.cls || '전체';
          (by[k] ||= { cd: it.cd, emd_area_ha: it.emd_area_ha?.value ?? null })[c] = { n: it.n?.value ?? 0, area_ha: it.area_ha?.value ?? 0 };
          const t = (total[c] ||= { n: 0, area_ha: 0, conf_mean: null }); t.n += it.n?.value ?? 0; t.area_ha = +(t.area_ha + (it.area_ha?.value ?? 0)).toFixed(2);
        }
        if (j.items?.length) return { by, total, _via: 'api', source: j.source || 'GET /results/…/stats?by=emd', raw: j };
      } catch { /* 폴백: 실파일 */ }
    }
    const j = await fixture(STATS_FILE);
    if (!j) return null;
    return { raw: j, total: j.total, by: j.by_emd, _via: 'file', source: 'results/namwon-landcover-2023-emd-stats.json', n_chips: j.n_chips };
  })();
  return memo;
}
const CLS = ['경작지', '건물', '비닐하우스', '주차장'];
export function emdCard(el, ctx) {
  let detach = null;
  const close = () => { detach && detach(); detach = null; panelOut(el); ctx.onClose && ctx.onClose(); };
  async function open({ name, cd, lngLat, aoi = null }) {
    const st = await emdStats();
    const row = st?.by?.[name];
    const src = st?.source || 'stats';
    const E = (v, u) => env(v, u, 'inferred', src, '검수 전 · C01 2023 25cm × aerial25/best');
    el.innerHTML = `<header><span class="xi-eyebrow">읍면동 집계 · P4 2023 25cm 재추론</span><button class="xi-x" type="button" aria-label="닫기">×</button></header>
      <h2 class="xi-emd">${esc(name)}<small>${esc(cd || '')}${row ? ` · 면적 ${numHtml(env(row.emd_area_ha, 'ha', 'measured', src), { digits: 1 })}` : ''}</small></h2>
      ${row ? `<table class="xi-table xi-table--emd"><thead><tr><th>클래스</th><th class="r">개수</th><th class="r">면적</th><th>비중</th></tr></thead><tbody>
        ${CLS.map((k) => { const v = row[k] || { n: 0, area_ha: 0 }; const share = row.emd_area_ha ? (v.area_ha / row.emd_area_ha) * 100 : 0;
          return `<tr><td>${k}</td><td class="r">${numHtml(E(v.n, 'polygons'), { unit: false })}</td><td class="r">${numHtml(E(v.area_ha, 'ha'), { digits: 1 })}</td><td><i class="xi-hbar" style="--w:${Math.min(100, share * 2).toFixed(1)}%"></i></td></tr>`; }).join('')}
        </tbody></table>` : '<p class="cw-void xi-void">이 읍면동 집계 없음</p>'}
      <p class="xi-emd-prov"></p>
      <footer>${aoi ? `<button type="button" class="xi-btn xi-btn--ink xi-aoi" data-here="${aoi.here ? 1 : 0}">${aoi.here ? '드론 AOI로 하강 ›' : `${esc(aoi.name)} 드론 AOI로 이동 ›`}</button>` : ''}${ctx.canFrame ? '<button type="button" class="xi-btn xi-btn--br xi-frame-emd">이 읍면동에 프레임</button>' : ''}<button type="button" class="xi-btn xi-btn--br xi-stats">통계 서랍</button></footer>`;
    if (row) prov(el.querySelector('.xi-emd-prov'), E(Object.values(row).reduce((a, v) => a + (v?.n || 0), 0), 'polygons'), { label: '합계' });
    el.querySelector('.xi-x').onclick = close;
    el.querySelector('.xi-aoi')?.addEventListener('click', () => { close(); ctx.toAoi(); });
    el.querySelector('.xi-frame-emd')?.addEventListener('click', () => { close(); ctx.frameEmd(name, lngLat); });
    el.querySelector('.xi-stats').addEventListener('click', () => ctx.openDrawer('stats', { emd: name }));
    detach && detach(); detach = anchor(el, ctx.A, lngLat, { avoid: [document.getElementById('hud')] });
    el.dataset.emd = name;
    await panelIn(el);
    textIn(el.querySelector('tbody') || el, { stagger: true });
  }
  return { open, close };
}

/** 우 서랍 — 통계/보고서 iframe(기존 화면 · 그 파일은 수정 없음). 기간 칩은 URL 로 전달.
   기존 화면은 embed=1 을 처리하지 않아 포털 크롬(레일 · 마스트 · 공지 · 푸터)까지 들어온다 → 같은 출처이므로 load 때
   본문만 남기는 스타일을 주입한다(주입 전에는 iframe 을 감춘다 · 포털 크롬 한 프레임도 안 보이게).
   iframe 은 열 때만 src 를 넣고 닫으면 about:blank 로 비운다 — 닫힌 서랍이 같은 스레드에서 지도·차트를 돌리지 않게(p95). */
const EMBED_CSS = `#rail,#mast,#foot,.skip,#page-head,#mw-l,#say,#st-x,#rp-x{display:none!important}
body.lx{padding:0!important;margin:0!important;background:#FFFFFF!important}
#main{margin:0!important;padding:0!important;width:100%!important;max-width:none!important}
#mw{margin:0!important;grid-template-columns:0 0 1fr!important;height:100vh!important;border:0!important}
.mw-stage{display:none!important}
#side{width:100%!important;max-width:none!important;border:0!important}
#side .dw{width:100%!important;border:0!important;box-shadow:none!important}`;
export function drawer(el, { onUrl, onClose, onDraft } = {}) {
  const frame = el.querySelector('iframe'), title = el.querySelector('.xi-drawer-t'), tabs = el.querySelector('.xi-dtabs'), slot = el.querySelector('.xi-draft');
  const S = { kind: null, embed: null, tab: 'std', q: {} };
  const SRC = { stats: '../proto/stats-standard.html', report: '../proto/report-standard.html' };
  frame.removeAttribute('loading');
  frame.style.visibility = 'hidden';
  frame.addEventListener('load', () => {
    if (!S.kind || frame.getAttribute('src') === 'about:blank') return;
    try {
      const d = frame.contentDocument;
      const st = d.createElement('style'); st.id = 'xi-embed'; st.textContent = EMBED_CSS; d.head.appendChild(st);
      S.embed = 'injected';
    } catch { S.embed = 'blocked'; }   // 다른 출처로 옮겨지면 주입 불가 — 그래도 보인다(정직하게 상태만 기록)
    frame.style.visibility = '';
    el.dataset.embed = S.embed;
  });
  el.querySelector('.xi-x').addEventListener('click', () => close());
  el.querySelectorAll('[data-period]').forEach((b) => b.addEventListener('click', () => { el.dataset.period = b.dataset.period; if (S.kind) open(S.kind, S.q); }));
  tabs?.querySelectorAll('[data-dtab]').forEach((b) => b.addEventListener('click', () => { if (S.kind === 'report') open('report', { ...S.q, tab: b.dataset.dtab }); }));
  /** open('stats' | 'report', q) — report 는 탭 2개: 'std'(기존 표준 보고서 iframe) · 'draft'(초안 슬롯 · F2-E 가 채우고, 없으면 F2-A 규칙 초안) */
  function open(kind, q = {}) {
    const { tab = kind === 'report' ? S.tab || 'std' : 'std', ...rest } = q;
    S.kind = kind; S.q = q; S.tab = kind === 'report' ? tab : 'std';
    el.dataset.tab = S.tab;
    if (tabs) { tabs.hidden = kind !== 'report'; tabs.querySelectorAll('[data-dtab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.dtab === S.tab))); }
    title.textContent = kind === 'stats' ? '통계 · 지역별/클래스별' : '보고서';
    if (S.tab === 'draft') {
      // 초안 탭: iframe 은 비운다(같은 스레드 비용 0) · 슬롯을 채운다
      if (frame.getAttribute('src') !== 'about:blank') { frame.style.visibility = 'hidden'; frame.setAttribute('src', 'about:blank'); }
      el.hidden = false; el.dataset.kind = kind;
      panelIn(el);
      onDraft && onDraft(slot, rest);
      onUrl && onUrl();
      return;
    }
    const u = new URLSearchParams({ embed: '1', period: el.dataset.period || '2025', ...Object.fromEntries(Object.entries(rest).filter(([k]) => !['emd_cd', 'rule', 'top', 'pnu'].includes(k))) });
    const src = `${SRC[kind]}?${u}`;
    if (frame.getAttribute('src') !== src) { frame.style.visibility = 'hidden'; el.dataset.embed = ''; frame.setAttribute('src', src); }
    el.hidden = false; el.dataset.kind = kind;
    panelIn(el);
    onUrl && onUrl();
  }
  async function close() {
    if (!S.kind) return;
    S.kind = null;
    onUrl && onUrl();
    await panelOut(el);
    if (!S.kind) { frame.style.visibility = 'hidden'; frame.setAttribute('src', 'about:blank'); }
    onClose && onClose();
  }
  return { S, open, close, slot };
}
