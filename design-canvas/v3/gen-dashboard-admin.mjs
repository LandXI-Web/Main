// V3-Dashboard-Admin — 관리자 대시보드, 톤앤매너 v4 적용본(기준 원판).
// 원본 dashboard.html 기능 1:1. 수치는 원본 시드 그대로.
// 진단 대응: 토큰 단일화(_base.mjs) · 원장 372 실제 적용 · 바닥 14px · 14–20 세 단 · 1차 CTA 하나.
import fs from 'node:fs';
import { T, F, disp, num, page, mast, rail, RAIL_ALL, title, kpiBand, head, table, tile,
  plate, stack, tabs, cta, link, foot, doc, esc } from './_base.mjs';

const KPI = [
  { label: '전체 사용자', v: '21', u: '명', sub: '정상 19 · 가입 대기 1' },
  { label: '발행 분석 카드', v: '8', u: '건', sub: '공개 7 · 비공개 1' },
  { label: '카드 발행 승인 대기', v: '2', u: '건', sub: '승인 필요', act: true },
  { label: '가입 승인 대기', v: '1', u: '건', sub: '승인 필요', act: true },
  { label: '미답변 문의', v: '6', u: '건', sub: '전체 12 · 답변 필요', act: true },
];

const CAP = [['남원 정사영상', 412], ['여수 해양쓰레기', 318], ['울주 산림', 256], ['제주 불법행위', 198], ['국토 변화', 142]];
const MAX = 412;

const capRows = CAP.map(([n, v]) => `
  <div style="display:flex;align-items:center;gap:10px;height:38px;border-bottom:1px solid var(--line)">
    <span style="flex:1;min-width:0;${F.small};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(n)}</span>
    <span style="flex:none;width:120px;height:10px;background:var(--t1)"><span style="display:block;height:10px;width:${Math.round(v / MAX * 100)}%;background:var(--accent)"></span></span>
    <span class="n" style="flex:none;width:64px;text-align:right;${F.small}">${v}<span class="u">GB</span></span>
  </div>`).join('');

const ADMIN_TILES = [['admin', '사용자 관리', '21명'], ['support', '공지사항', ''], ['support', '문의 관리', '12건'], ['data', 'FAQ', '']]
  .map(([g, t, n]) => `
  <a href="#" style="border:1px solid var(--line);padding:14px 14px 16px;display:flex;flex-direction:column;gap:8px;text-decoration:none;color:var(--ink)">
    <span style="${F.small}">${esc(t)}</span>
    <span class="n" style="${F.label};color:${n ? 'var(--accent)' : 'var(--grey)'}">${n ? esc(n) : '바로가기 ›'}</span>
  </a>`).join('');

const left = `
  ${head('map', '국토 데이터 분포', '0.25° 격자', '지도 서비스')}
  <div style="margin-top:14px">${plate({
    img: 'plate-korea.jpg', h: 296, badge: 'AI 분석 결과 4종',
    legend: [[T.teal, '분석 완료'], [T.accent, '수집 완료'], ['#7FD4CF', '학습 중']],
    scale: '0.25° 격자 · 2026.06', action: '지도 서비스',
  })}</div>

  <div style="margin-top:26px">${head('data', '승인 대기', '2', '전체 목록')}</div>
  <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--gap);margin-top:14px">
    ${tile({ img: 'ev-res-greenhouse.jpg', name: '남원 금지면 비닐하우스 탐지', meta: '요청 2026.06.02', state: '카드 발행 승인 대기', ar: '16 / 9' })}
    ${tile({ img: 'ev-res-farmland.jpg', name: '남원 농지 이용 현황', meta: '요청 2026.06.05', state: '카드 발행 승인 대기', ar: '16 / 9' })}
  </div>
  <div style="display:flex;align-items:center;gap:14px;margin-top:16px">
    ${cta('승인 검토')}
    <span style="${F.small};color:var(--warn)">2건이 검토를 기다린다 · 최장 6일</span>
  </div>`;

const right = `
  ${tabs([['프로젝트 용량', true], ['7일 방문', false], ['스토리지', false]])}
  <div style="margin-top:16px">
    <div style="display:flex;align-items:baseline;gap:10px">
      <span style="${disp(700)};${F.kpi};color:var(--accent)">1,326<span style="font-size:20px;color:var(--ink);margin-left:6px;letter-spacing:0">GB</span></span>
      <span class="n" style="${F.label};color:var(--grey)">상위 5개 합계</span>
    </div>
    <div style="margin-top:12px;border-top:1px solid var(--ink)">${capRows}</div>
  </div>

  <div style="margin-top:26px">
    <div style="${F.small};color:var(--grey)">스토리지</div>
    <div style="display:flex;align-items:baseline;gap:8px;margin:6px 0 12px">
      <span class="n" style="${F.h4}">44.5<span class="u" style="font-size:16px">TB</span></span>
      <span class="n" style="${F.small};color:var(--grey)">/ 184 TB · 24 % 사용</span>
    </div>
    ${stack([
      { pct: 24, c: T.accent, t: '사용 44.5 TB' },
      { pct: 12, c: '#2E86FF', t: '예약 22.1 TB' },
      { pct: 64, c: T.line, t: '여유 117.4 TB' },
    ])}
  </div>

  <div style="margin-top:auto;padding-top:22px">
    <div style="${F.label};color:var(--grey);margin-bottom:10px">관리</div>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">${ADMIN_TILES}</div>
  </div>`;

const body = `
  ${title('LX 관리자', '대시보드', 'XI-VFM v2.1 · 최종 적용 2026.03.12 · 연결 과제 14개')}
  ${kpiBand(KPI)}
  <div style="flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 1px var(--ledger);column-gap:var(--gap);padding:24px 0 20px">
    <div style="min-width:0;display:flex;flex-direction:column">${left}</div>
    <div style="background:var(--line)"></div>
    <div style="min-width:0;display:flex;flex-direction:column">${right}</div>
  </div>
  ${foot()}`;

const H = 1260;
fs.writeFileSync(new URL('./V3-Dashboard-Admin.dc.html', import.meta.url),
  doc(page({ h: H, rail: rail(RAIL_ALL, 'dashboard'), mast: mast({ notice: '고위험 탐지 건 긴급 처리 안내', date: '2026.06.08' }), body }), H));
console.log('V3-Dashboard-Admin.dc.html');
