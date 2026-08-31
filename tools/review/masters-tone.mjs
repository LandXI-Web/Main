// 톤앤매너 갤러리(landxi/proto/review/masters-tone.html) 생성 — design-canvas/v3/renders/*.png.
// 원판 갤러리(masters.mjs)와 같은 껍데기(_gallery.mjs)를 쓰고, 보드만 v3(톤앤매너 v4 적용본)로 바꾼다.
// 실행: node tools/review/masters-tone.mjs
import fs from 'node:fs';
import { build } from './_gallery.mjs';

// [id, 카테고리, 제목, 메모] — 상태는 전부 'review'(새로 그린 안, 승인 대기)
const BOARDS = [
  ['V3-Login', '로그인', '로그인', '좌 필름 · 우 폼 · 1차 CTA 를 잉크 채움으로 교정'],
  ['V3-Dashboard-Admin', '대시보드', '대시보드 · 관리자', '원장 372 실적용 · 승인 대기 EVIDENCE-PAIR · 관리 타일 4'],
  ['V3-Dashboard-User', '대시보드', '대시보드 · 사용자', '할 일 큐 우선 · 프로젝트 이미지 카드 + 단계 레일'],
  ['V3-Dashboard-Viewer', '대시보드', '대시보드 · 뷰어', '권한 결과 3건 탭 · 실사 판 + 읍면별 면적표'],
  ['V3-DataMgmt', '데이터 관리', '데이터 관리', '타일 격자 + 쪽당 4·6·8·16 · 우 원장 = 단계 현황판'],
  ['V3-Project', '프로젝트', '프로젝트', '목록 + 우 조회 원장 · 단계 레일 5단'],
  ['V3-Analysis', '분석 서비스', '분석 서비스', '카드 15종 펼침 + 우 카드 정보'],
  ['V3-MapService', '지도 서비스', '지도 서비스', '실사 판 전면 + 레이어 · 4시점 · 우 탐지 정보'],
  ['V3-XiMap', 'XI맵', 'XI맵', '원본 기능 범위 그대로 — 임계·스캔 등 신규 기능 없음'],
  ['V3-CardPublish', '카드 발행', '카드 발행 관리', '발행 대기·승인·공개 상태 목록 + 우 발행 정보'],
  ['V3-ServiceAdmin', '서비스 관리', '서비스 관리', '사용자 목록 표 + 우 상세 · 승인 대기는 빨강 글자'],
  ['V3-Support', '서비스 지원', '서비스 지원', '공지·FAQ·1:1 문의·매뉴얼 · 미답변 6건'],
  ['V3-My', 'MY', 'MY', '회원 정보 · 디스크 사용량 · 증량 신청 이력'],
];

const CATS = ['메인(필름)', '로그인', '대시보드', '데이터 관리', '프로젝트', '분석 서비스',
  '지도 서비스', 'XI맵', '카드 발행', '서비스 관리', '서비스 지원', 'MY', '기타'];

// 필름은 구현본이 곧 원판 — 원판 갤러리와 같은 자리에 둔다.
const EXTRA = [{
  id: 'LIVE-Main', cat: '메인(필름)', st: 'apply', title: '메인 · 스크럽 필름 (구현본)',
  note: 'scrub/index.html — 톤앤매너의 출발점(디오라마 판·앰버 탐지 순간)',
  img: '../../assets/proto/film/legs/full.webp', href: '../scrub/index.html',
}];

const boards = BOARDS
  .filter(([id]) => fs.existsSync(`design-canvas/v3/renders/${id}.png`))
  .map(([id, cat, title, note]) => ({ id, cat, st: 'review', title, note }))
  .concat(EXTRA);

const missing = BOARDS.filter(([id]) => !fs.existsSync(`design-canvas/v3/renders/${id}.png`)).map(([id]) => id);
if (missing.length) console.warn('렌더 없음 →', missing.join(', '));

build({
  boards, cats: CATS, renderDir: '../../../design-canvas/v3/renders',
  title: 'Land-XI 원판 갤러리 (톤앤매너)',
  h1: `톤앤매너 적용 원판 ${boards.length}장`,
  subline: 'Land-XI · 원판 갤러리(톤앤매너) · GitHub 버전 · 자동 생성 (node tools/review/masters-tone.mjs)',
  lead: '헌장 일곱 조항(서체 셋 · 색은 뜻 · 형태 없음 · 격자 고정 · 숫자엔 단위 · 이미지가 먼저 · 움직임은 하나)을 <b>메뉴별로 다시 그린</b> 원판입니다. 토큰·부품을 <code>design-canvas/v3/_base.mjs</code> 한 곳에서만 가져다 써서 화면 사이의 어긋남을 없앴고, 진단에서 지적된 원장 372 · 바닥 14 px · 1차 버튼 하나를 실제로 적용했습니다. 카드의 버튼으로 상태를 바꾸면 아래 요약에 모입니다. <a href="index.html">검토 허브</a> · <a href="masters.html">원판 갤러리</a>',
  key: 'lx_tone_status', out: 'landxi/proto/review/masters-tone.html',
  showDrop: false,
});
