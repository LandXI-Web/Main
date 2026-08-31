// 원판 갤러리(landxi/proto/review/masters.html) 생성 — canvas.json + renders/*.png.
// 카테고리(화면) × 상태(적용/검토/폐기). 상태는 STATUS 표가 기준이고, 페이지에서 바꾼 값은
// localStorage 에 임시 저장되어 '변경 요약'으로 복사해 전달 → 여기 STATUS 에 반영한다.
// 실행: node tools/review/masters.mjs
import fs from 'node:fs';
import { build } from './_gallery.mjs';

// [카테고리, 상태(apply|review|drop), 메모]
const STATUS = {
  'B5-Login': ['로그인', 'apply', 'login.html 적용'],
  'B2-Login': ['로그인', 'drop', '1차 안(소개 카피 + 디오라마 판)'],
  'B5-Dashboard-Data': ['대시보드', 'apply', 'dashboard.html 적용'],
  'B5-Dashboard-User': ['대시보드','review','사용자(직원) 대시보드 — 원본 dashboard2 1:1'],
  'B5-Dashboard-Viewer': ['대시보드','review','뷰어 대시보드 — 원본 dashboard3 1:1'],
  'B5-Dashboard': ['대시보드', 'drop', '이등분 스택 안'],
  'B4-Dashboard': ['대시보드', 'drop', '전면 개편 4차'],
  'B3-Dashboard': ['대시보드', 'drop', '축소 원장'],
  'B2-Dashboard': ['대시보드', 'drop', '지도 위 원장'],
  'B5-DataMgmt': ['데이터 관리', 'apply', 'dataset.html 적용'],
  'B5-DataMgmt-Upload': ['데이터 관리', 'apply', 'dataset.html?tab=upload 적용'],
  'B3-DataMgmt': ['데이터 관리', 'drop', '파이프라인 4단계 원장'],
  'B2-DataMgmt-Upload': ['데이터 관리', 'drop', '2차 안'],
  'B2-DataMgmt-List': ['데이터 관리', 'drop', '2차 안'],
  'B5-Projects': ['프로젝트', 'review', '목록 + 우 프로젝트 조회'],
  'B5-Project-Create': ['프로젝트', 'review', '만들기 — 한 화면 · 우 폼 · 좌 = 편집 중 필드 문맥'],
  'B5-Project-Create-Review': ['프로젝트', 'review', '만들기 검토 — 좌 검토 판 · 우 요약 + CTA'],
  'B5-Project-Overview': ['프로젝트', 'review', '개요 · 구현 대기'],
  'B5-Project-Data': ['프로젝트', 'review', '데이터 탭 · 구현 대기'],
  'B5-Project-Labeling': ['프로젝트', 'review', '라벨링 + 클래스 편집기'],
  'B5-Project-Train': ['프로젝트', 'review', '학습 워크플로우 캔버스'],
  'B5-Project-Analysis': ['프로젝트', 'review', '분석 탭'],
  'B5-Project-Deploy': ['프로젝트', 'review', '배포 · 발행 폼'],
  'B5-Project-Delete': ['프로젝트', 'review', '삭제 확인'],
  'B2-Projects': ['프로젝트', 'drop', '2차 안'],
  'B5-Analysis-List': ['분석 서비스', 'review', '서비스 홈'],
  'B5-Analysis-Run-Review': ['분석 서비스', 'review', '분석 실행 1 · 실행 검토 — 영상 중심(불러오기 · 업로드)'],
  'B5-Analysis-Run-Progress': ['분석 서비스', 'review', '분석 실행 2 · 실행중 — 제목 정정 · 영상별 진행 · 누적'],
  'B5-Analysis-Result': ['분석 서비스', 'review', '분석 실행 3 · 실행 결과'],
  // B5-Analysis-Run · Run-1…5: drop — 5단계 안 → 3화면으로 통합(2026-08-27 · NOTES §19.6) · 파일은 git 이력에만
  'B2-HomeFilm': ['메인(필름)', 'drop', '초기 카피 판 — 메인은 스크럽 필름 구현본(scrub/index.html)이 원판'],
  'B2-HomeAtlas': ['메인(필름)', 'drop', '홈 아틀라스(필름 뒤 페이지) — 미사용'],
  'B5-Map': ['지도 서비스', 'review', '기본 — V-World 실타일 + 레이어 카드 + 시점 스트립'],
  'B5-Map-Info': ['지도 서비스', 'review', '객체 정보 — 브래킷 콜아웃 + 탐지 정보 + 조치 상태'],
  'B5-Map-Compare': ['지도 서비스', 'review', '겹쳐보기 — 2025.04 | 2025.10 스와이프 + 변화 지수'],
  'B2-XiMap': ['지도 서비스', 'drop', 'XI맵 초안 — 원본 지도 서비스 기능의 1/4 · 임계/스캔은 원본에 없음(NOTES §20)'],
};
const CATS = ['메인(필름)', '로그인', '대시보드', '데이터 관리', '프로젝트', '분석 서비스', '지도 서비스', '기타'];
// 원판 없이 구현본이 곧 원판인 화면 — 갤러리에 카드로 노출
const EXTRA = [{ id: 'LIVE-Main', cat: '메인(필름)', st: 'apply', note: 'scrub/index.html — 스크럽 필름 구현본이 원판 (타임라인: film/timeline.html)', title: '메인 · 스크럽 필름 (구현본)', img: '../../assets/proto/film/legs/full.webp', href: '../scrub/index.html' }];

const c = JSON.parse(fs.readFileSync('design-canvas/v2/canvas.json', 'utf8'));
const boards = c.artboards.map(a => a.file.replace('.dc.html', '')).filter(id => fs.existsSync(`design-canvas/v2/renders/${id}.png`))
  .map(id => { const [cat, st, note] = STATUS[id] || ['기타', 'drop', '미분류']; const t = c.artboards.find(a => a.file === id + '.dc.html'); return { id, cat, st, note, title: t?.title || id }; }).concat(EXTRA);

build({
  boards, cats: CATS, renderDir: '../../../design-canvas/v2/renders',
  title: 'Land-XI 원판 갤러리',
  h1: `디자인 원판 ${boards.length}장`,
  subline: 'Land-XI · 원판 갤러리 · GitHub 버전 · 자동 생성 (node tools/review/masters.mjs)',
  lead: '카테고리별로 <b>적용</b>(사이트에 구현됨)과 <b>검토</b>(확장·구현 대기)를 보여주고, <b>폐기</b>는 맨 아래 카테고리별로 둡니다. 카드의 버튼으로 상태를 바꾸면(승격 포함) 아래 요약에 모입니다 — 복사해 전달하시면 기준표에 반영합니다. <a href="index.html">검토 허브</a> · <a href="masters-tone.html">톤앤매너 갤러리</a>',
  key: 'lx_masters_status', out: 'landxi/proto/review/masters.html',
});
