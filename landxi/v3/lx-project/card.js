/* card.js — 프로젝트 카드 한 부품(구현 23차 · 원칙 219 — 분석하기의 분석 서비스 카드와 같은 틀 .k-sc.la-ac + 단계 줄 · 사람 줄 .lxp-pc).
   메뉴 '프로젝트' 목록(app.js)과 LX 직원 대시보드 '최근 진행한 프로젝트'(lx-console · 구현 26차 · 원칙 226)가 같은 부품을 쓴다(숫자 한 출처 — GET /projects).
   compact = 대시보드: '무엇을' 줄 대신 찾는 것(학습한 클래스 finds · 원칙 225) · 구성원 줄 없음 · 마지막 활동은 지금 단계 줄에. */
import { h, API, session } from '../kit/util.js';
import { stageHref, projectHref } from './context.js';
import { GROUPS, N, groupOf, seg4El, doneN, kick, ago } from './board.js';

const thumbs = new Map();
function authPic(path) {               // LX 계정만 받는 그림(영상 썸네일) — 세션을 실어 받는다(분석하기 영상 고르기와 같은 길)
  if (!thumbs.has(path)) {
    thumbs.set(path, (async () => {
      const s = session.get();
      const r = await fetch(API.prefix + path, { headers: s ? { authorization: 'Bearer ' + s.token } : {} });
      if (!r.ok || r.status === 204) return null;
      const b = await r.blob();
      return b.size ? URL.createObjectURL(b) : null;
    })().catch(() => null));
  }
  return thumbs.get(path);
}
const nf = (v) => Number(v).toLocaleString('ko-KR');
function peopleWord(ps = []) {
  if (!ps.length) return '—';
  const names = ps.map((x) => x.name || x.role_label);
  return names.length > 2 ? `${names.slice(0, 2).join(' · ')} 외 ${names.length - 2}명` : names.join(' · ');
}

export function projCard(p, deckBy, { compact = false } = {}) {
  const archived = p.state === 'archived';
  const go = archived ? projectHref(p.id) : stageHref(p, p.next?.stage || p.stage?.key, p.next?.target);
  const svc = p.card ? deckBy.get(p.card) : null;            // 이 프로젝트가 만든 서비스(분석하기 카드 덱) — 결과 장면 · 정확도는 그 카드와 같은 값
  const pic = h('div.k-sc-crop.la-ac-pic');
  const blank = () => { const keep = [...pic.querySelectorAll('.la-ac-cat, .k-sc-flag')]; pic.classList.add('is-blank'); pic.replaceChildren(h('span.k-sc-blank', { text: '그림 없음' }), ...keep); };
  const scene = svc?.scene?.src ? (String(svc.scene.src).startsWith('/api/') ? API.base + svc.scene.src : svc.scene.src) : null;
  if (scene) pic.append(h('img', { src: scene, alt: '', loading: 'lazy', decoding: 'async', onerror: blank }));
  else if (p.pic) authPic(p.pic).then((u) => { if (u) pic.prepend(h('img', { src: u, alt: '', decoding: 'async', onerror: blank })); else blank(); });
  else blank();
  const st = p.stage ? `${p.stage.index + 1} ${p.stage.label}` : '';
  pic.append(h('div.la-ac-cat', {}, h('span', { text: archived ? '보관' : st })));
  const k = archived ? null : kick(p);
  if (k?.kind === 'warn') pic.append(h('span.k-sc-flag', { text: k.text }));
  const acc = svc?.model?.acc?.value ?? p.acc?.value ?? null;
  const tn = p.train_n?.value ?? null;
  const regs = p.regions || [];
  const regText = regs.length ? (regs.length > 3 ? `${regs.slice(0, 3).map((g) => g.name).join(' · ')} 외 ${regs.length - 3}곳` : regs.map((g) => g.name).join(' · ')) : '영상이 등록되면 정해집니다';
  const line = compact ? ((p.finds || []).join(' · ') || p.description || '')            // 대시보드 = '무엇을' 줄 없이 찾는 것(학습한 클래스 · 원칙 225)
    : (p.description || p.task || (p.finds || []).join(' · '));   // 업무를 묻지 않는 새 프로젝트 = 학습 데이터 클래스(원칙 225)
  const el = h('article.k-sc.la-ac.lxp-pc', { dataset: { kind: 'project', id: p.id, stage: GROUPS[groupOf(p)].key }, tabindex: '0', 'aria-label': `${p.name} · ${archived ? '보관' : st}` },
    pic,
    h('div.k-sc-b.la-ac-b', {},
      h('h3.k-sc-t', { text: p.name }),
      h('p.k-sc-line.la-ac-line', { text: line, title: line }),
      h('div.lxp-pc-st', {}, archived ? null : seg4El(p),
        h('span.lxp-pc-w', {}, archived ? h('b', { text: '보관한 프로젝트' }) : h('b', { text: `지금 ${st}` }),
          archived ? null : h('small.num', { text: ` · ${doneN(p)}/${N}` }), k?.kind === 'wait' ? h('small', { text: ` · ${k.text}` }) : null,
          compact ? h('small', { text: ` · 마지막 활동 ${ago(p.last_at || p.updated_at)}` }) : null)),
      h('div.la-ac-hero', {},
        h('div', {}, tn === null ? h('b', { text: '—' }) : h('b.num', {}, nf(tn), h('i', { text: '장' })), h('small', { text: '학습 데이터' })),
        h('div', {}, acc === null ? h('b', { text: '—' }) : h('b.num', {}, String(acc), h('i', { text: '%' })), h('small', { text: 'AI 모델 정확도' }))),
      h('div.la-ac-where', {}, h('span.k', { text: regs.length ? `대상지 ${regs.length}곳` : '대상지' }), h('span.v', { text: regText, title: regs.map((g) => g.full || g.name).join(' · ') })),
      compact ? null : h('div.lxp-pc-meta', {},
        h('span', { title: (p.people || []).map((x) => x.name).join(' · ') }, h('span.k', { text: '구성원' }), h('span.v', { text: peopleWord(p.people) })),
        h('span', {}, h('span.k', { text: '마지막 활동' }), h('span.v.num', { text: ago(p.last_at || p.updated_at) }))),
      h('div.k-sc-acts', {}, h('a.t-btn.k-sc-go', { href: go, text: '열기' }), h('a.k-sc-more', { href: projectHref(p.id), text: '프로젝트 →' }))));
  el.addEventListener('click', (e) => { if (!e.target.closest('a')) location.href = go; });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === el) location.href = go; });
  return el;
}
