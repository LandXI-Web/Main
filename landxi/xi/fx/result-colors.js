/* result-colors.js — 지도 결과 분류색 한 표(11-02 박람회 AI 결과 표현 개편 §1-A).
   영농 4색(경작 · 휴경 · 시설 · 전용 의심)은 11-02 PM 시안 A안 · 나머지는 서버 card_cover.py COLOR 와 같은 값.
   ★ B안으로 바꿀 때 고칠 곳 = 아래 FARM 한 줄(네 값)뿐. B안: 경작 '#7CE86B' · 휴경 '#FFB020' · 시설 '#4DA3FF' · 전용 의심 '#FF4D6D'. */
export const FARM = { tillage: '#15C39A', fallow: '#FF8A3D', facility: '#FFD23F', suspect: '#FF4D6D' };

/** 분류 → 색. 영농 묶음은 위 FARM, 나머지는 서버 표 그대로 */
export const CLS_COLOR = {
  경작지: FARM.tillage, 경작: FARM.tillage,
  비경작지: FARM.fallow, 휴경: FARM.fallow,
  비닐하우스: FARM.facility, 비닐하우스_단동: FARM.facility, 비닐하우스_다동: FARM.facility,
  건물: '#3182F6', 건축물: '#3182F6', 주차장: '#8B5CF6', 곤포사일리지: '#B07A3A', 해양쓰레기: '#0FA9A0', styrofoam: '#0FA9A0',
  차량: '#3182F6', IRG: '#74B816', 호밀: '#E8590C', 옥수수: '#F59F00', 수단그라스: '#AE3EC9',
  신축: '#F04452', 소실: '#6B7684', '경작 전환': '#0FA9A0', '포장 확대': '#FF9F1C', '식생 증감': '#74B816',
  '산림 → 나지': '#C2410C', '산림 → 도로': '#FF9F1C', '산림 → 건물': '#F04452', '산림 → 농지 · 초지': '#8B5CF6', '채석장 · 개발지 확장': '#6B7684',
};
/** 경작·휴경 결과 세트 안에서만 '전용 의심'(조치가 필요한 것)으로 칠하는 분류 */
export const SUSPECT_CLS = ['건물', '건축물', '주차장', '포장 확대', '신축'];
/** 점선으로 그리는 분류(휴경) */
export const DASH_CLS = ['비경작지', '휴경'];
/** 경작·휴경 세트인지 — 세트 이름 · 모양(style)으로만 판단(지역 이름 0) */
export const isFarmSet = (it) => {
  const nm = typeof it === 'string' ? it : (it?.name?.ko ?? it?.name ?? it?.title ?? '');
  return it?.style === 'farmland' || /farmland/.test(String(it?.id ?? '')) || /경작|휴경|영농|농경지/.test(String(nm));
};
/** 서비스(업무) 이름 → 대표색(지도 점 · 말풍선 색 점) */
export const NAMED_COLOR = { '경작·휴경': CLS_COLOR.경작지, 비닐하우스: CLS_COLOR.비닐하우스, 건축물: CLS_COLOR.건축물, 주차장: CLS_COLOR.주차장,
  곤포사일리지: CLS_COLOR.곤포사일리지, 해양쓰레기: CLS_COLOR.해양쓰레기, 토지피복: '#5C8DA8' };
/** 전국 분석 결과(national.js) 분류색 */
export const NCOLOR = { 경작지: CLS_COLOR.경작지, 비닐하우스: CLS_COLOR.비닐하우스, 건물: CLS_COLOR.건물 };

export const colorOfCls = (c, { suspect = false } = {}) => (suspect && SUSPECT_CLS.includes(c) ? FARM.suspect : CLS_COLOR[c]);
/** maplibre 식 — cls 속성 → 분류색(없는 분류 · cls 없는 결과는 fallback). suspect = 경작·휴경 세트 */
export const clsColorExpr = (fallback = '#15C39A', { suspect = false } = {}) => {
  const pairs = Object.entries(CLS_COLOR).filter(([k]) => !(suspect && SUSPECT_CLS.includes(k))).flat();
  if (suspect) for (const k of SUSPECT_CLS) pairs.push(k, FARM.suspect);
  return ['match', ['to-string', ['coalesce', ['get', 'cls'], '']], ...pairs, fallback];
};
