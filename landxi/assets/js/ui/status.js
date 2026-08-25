import { cssVar } from '../tokens.js';

export const STATUS_KEYS = ['found', 'doing', 'done', 'hold', 'error', 'info'];
const META = {
  found: { label: '발견',   color: '#F2622A', cssVar: '--s-found' },
  doing: { label: '진행중', color: '#E3A008', cssVar: '--s-doing' },
  done:  { label: '완료',   color: '#1E9E6A', cssVar: '--s-done'  },
  hold:  { label: '보류',   color: '#6B7A8C', cssVar: '--s-hold'  },
  error: { label: '오류',   color: '#D93025', cssVar: '--s-error' },
  info:  { label: '정보',   color: '#006DF7', cssVar: '--s-info'  },
};
const MAP = {
  job:    { PENDING: ['found', '대기'], RUNNING: ['doing', '처리중'], SUCCEEDED: ['done', '처리 완료'], FAILED: ['error', '처리 실패'] },
  card:   { '대기': ['found', '대기'], '검토중': ['doing', '검토중'], '승인': ['done', '승인'], '반려': ['error', '반려'], '비공개': ['hold', '비공개'], '공개': ['done', '공개'] },
  upload: { '대기중': ['hold', '대기중'], '일시정지': ['hold', '일시정지'], '업로드중': ['doing', '업로드중'], '완료': ['done', '완료'], '중단됨': ['error', '중단됨'] },
  user:   { '정상': ['done', '정상'], '승인 대기': ['found', '승인 대기'], '거부': ['error', '거부'], '휴면': ['hold', '휴면'] },
  inquiry:{ '미답변': ['found', '미답변'], '답변 완료': ['done', '답변 완료'] },
  key:    Object.fromEntries(STATUS_KEYS.map(k => [k, [k, META[k].label]])),
};
export function statusOf(domain, raw) {
  const hit = (MAP[domain] || {})[raw];
  const key = hit ? hit[0] : 'hold';
  const m = META[key];
  // META 를 먼저 펴야 도메인 라벨(대기·승인 대기·미답변)이 키 기본 라벨(발견)에 덮이지 않는다.
  // 색의 단일 출처는 tokens.css 다. META 의 리터럴은 DOM 이 없을 때의 폴백일 뿐이다.
  return { ...m, key, label: hit ? hit[1] : String(raw ?? ''), color: cssVar(m.cssVar, m.color) };
}
