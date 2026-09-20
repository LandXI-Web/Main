/* 프로젝트 — 탭 모듈이 함께 쓰는 조각. 부품(parts.css)에 없는 것만 여기 있다.
   레일 · 마스트헤드 · 제목 행 · 푸터 · 모달 · 토스트 · 페이저 · 표 · 폼은 shell.js 것을 쓴다. */
import { esc, icon } from './shell.js';
import { nf } from './project-data.js';

export const n = (v) => (v == null ? '—' : nf.format(v));
export const demo = (on = true) => (on ? ' <em class="tag">시연</em>' : '');
export const guess = (on = true) => (on ? ' <em class="tag">추정</em>' : '');
export const miss = (why) => `<span class="pj-miss">${esc(why)}</span>`;

/** 그림 카드 — 실크롭만 쓴다. src 가 없으면 점선 결손 액자(원판 `.imgcard--none`). */
export function fig(src, alt, cap = '', o = {}) {
  const cls = `imgcard${o.below ? ' imgcard--below' : ''}${o.cls ? ' ' + o.cls : ''}`;
  if (!src) return `<figure class="imgcard imgcard--none${o.cls ? ' ' + o.cls : ''}"${o.style ? ` style="${o.style}"` : ''}>${esc(o.none || '이미지 없음')}</figure>`;
  return `<figure class="${cls}"${o.style ? ` style="${o.style}"` : ''}><img src="${esc(src)}" alt="${esc(alt || '')}" loading="lazy">${cap ? `<figcaption>${cap}</figcaption>` : ''}</figure>`;
}

/** 키–값 표(부품 `.kv`) */
export const kv = (rows, cls = '') => `<dl class="kv ${cls}">${rows.filter(Boolean).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

/** 상태어 — 글자색만(법전 §2). 빨강은 조치 필요에만. */
const TONE = { 완료: 'st--acc', '학습 완료': 'st--acc', 승인: 'st--acc', 라벨링됨: 'st--acc', 등록됨: 'st--acc', 추가됨: 'st--acc',
  '진행 중': 'st--acc', 분석중: 'st--acc', '추가 중': 'st--acc', 대기: 'st--warn', 실패: 'st--warn', '추가 실패': 'st--warn', 반려: 'st--dim', 미작업: 'st--dim', 마감: 'st--dim', '준비 중': 'st--dim' };
export const st = (word, extra = '') => `<span class="st ${TONE[word] || ''}">${esc(word)}${extra ? ' · ' + esc(extra) : ''}</span>`;

/** 빈 상태 — 점선 무채. 색을 넣지 않는다. */
export const empty = (title, why = '', ic = 'notice') => `<div class="empty">${icon(ic, 30)}<p class="empty-t">${esc(title)}</p>${why ? `<p class="empty-w">${esc(why)}</p>` : ''}</div>`;

/** 로딩 / 오류 공용 패턴 — notes/B7-project-states.md §3. 직전 화면의 대표 이미지를 무채로 남긴다. */
export function statePlate(kind, { img: src, title, why, retry = '다시 시도', back = '‹ 프로젝트 목록' }) {
  const err = kind === 'error';
  return `<div class="pj-stateplate"${err ? ' data-err' : ''}>
    ${err ? '' : '<span class="pj-load" aria-hidden="true"></span>'}
    ${fig(src, '', '', { cls: 'pj-stateimg', style: '--ar:778/440' })}
    <div class="pj-statebox">${err ? '<span class="st st--warn">불러오기 실패</span>' : '<p class="mic" style="margin:0 0 4px;color:var(--accent)">불러오는 중</p>'}
      <h2>${esc(title)}</h2><p>${esc(why)}</p>
      ${err ? `<p class="acts">${cta(retry, 'retry')}<a class="link link--ink" href="ai-project.html">${esc(back)}</a></p>` : ''}
    </div></div>`;
}

/** 검정 CTA — 판당 1개. 채운 파란 버튼은 법전이 금지한다. */
export const cta = (label, act, extra = '') => `<button type="button" class="btn" data-act="${esc(act)}"${extra}>${esc(label)}</button>`;
export const br = (label, act, extra = '') => `<button type="button" class="btn-br" data-act="${esc(act)}"${extra}>${esc(label)}</button>`;
export const link = (label, act, extra = '') => `<button type="button" class="link" data-act="${esc(act)}"${extra}>${esc(label)}</button>`;

/** 뼈대 막대 — 값 자리. 그라디언트 · 반짝임 0(법전 §2). */
export const bone = (w = '100%') => `<span class="pj-bone" style="width:${w}" aria-hidden="true"></span>`;

/** 막대 묶음(클래스별 F1 · 클래스 분포) */
export const bars = (rows) => `<div class="pj-bars">${rows.map(([k, v, acc]) => `<span>${esc(k)}</span><span><i class="${acc ? 'a' : ''}" style="width:${Math.max(2, Math.round(v * 100))}%"></i></span><span class="n">${typeof v === 'number' ? v.toFixed(2) : esc(v)}</span>`).join('')}</div>`;

/** 진행 막대(부품 `.meter`) */
export const meter = (p, warn = false) => `<span class="meter${warn ? ' meter--warn' : ''}" style="--v:${Math.max(0, Math.min(100, p))}%"><i></i></span>`;

/** 단계 눈금(부품 `.steps`) */
export const steps = (list, cur) => `<div class="steps">${list.map((s, i) => `<span${i === cur ? ' aria-current="step"' : ''}>${esc(s)}</span>`).join('')}</div>`;
