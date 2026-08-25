/* wf-run.js — 실행 엔진
   진행률을 지어내지 않는다. 여기서 재는 것은 전부 실제로 일어난 일이다:
     · 타일 처리량 = 실제 landxi/assets/tiles/... webp 를 디코딩한 개수 / 실제 경과 시간
     · 탐지 건수   = 그 범위 안의 실제 폴리곤 개수
     · 후처리      = 실제 임계 통과 판정에 든 실제 ms
   모델 가중치(.pt)는 저장소에 없다 → "메타만 읽음"으로 정직하게 표기한다.
*/

import { tileImage, isCached, lon2x, lat2y } from './wf-thumb.js';
import { BASE } from './wf-data.js';

const now = () => performance.now();

/** 범위를 덮는 실제 타일 좌표 목록 (존재 여부는 로드해 봐야 안다). */
export function tilesFor(imagery, bbox, z) {
  const zoom = Math.max(imagery.minzoom, Math.min(z, imagery.maxzoom));
  const x0 = Math.floor(lon2x(bbox[0], zoom)), x1 = Math.floor(lon2x(bbox[2], zoom));
  const y0 = Math.floor(lat2y(bbox[3], zoom)), y1 = Math.floor(lat2y(bbox[1], zoom));
  const out = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([zoom, x, y]);
  return out;
}

export function createRunner({ data, mapc, graph, on }) {
  let running = false;
  const log = [];

  function note(stage, text, ms) {
    const line = { stage, text, ms, at: new Date().toISOString().slice(11, 23) };
    log.push(line);
    on?.log?.(line);
  }

  async function run(sel) {
    if (running) return;
    running = true;
    graph.setRunning(true);
    log.length = 0;
    // 선택이 한 필지 수준이면 타일 4장짜리 "실행"이 되어 처리량이 의미가 없다.
    // 그럴 때는 고해상 도엽 전체를 돌리고, 그 사실을 로그에 쓴다.
    let bbox = sel?.bbox || data.detail || data.core;
    let scope = '선택 영역';
    if (data.img && tilesFor(data.img, bbox, data.preset.detZoom).length < 16) {
      bbox = data.detail || data.core; scope = '선택이 작아 고해상 도엽 전체';
    }
    const t00 = now();

    /* 01 영상 — 이 범위를 덮는 실제 정사영상 타일을 센다. */
    graph.setNodeRun('source', 0);
    let tiles = [];
    if (data.img) tiles = tilesFor(data.img, bbox, data.preset.detZoom);
    note('source', `${data.img ? data.img.label : '위성 영상'} · ${scope} · 대상 타일 ${tiles.length}장`, 0);
    graph.setNodeRun('source', 1);

    /* 02 타일 분할 — 실제로 디코딩하며 처리량을 잰다. 이게 펄스 속도가 된다. */
    graph.setNodeRun('tile', 0);
    const t0 = now();
    let ok = 0, tried = 0, fresh = 0, cached = 0;
    const budget = Math.min(tiles.length, 120);
    const CH = 8;
    for (let i = 0; i < budget; i += CH) {
      if (!running) break;
      const chunk = tiles.slice(i, i + CH);
      const urls = chunk.map(([z, x, y]) => BASE + data.img.tiles.replace('{z}', z).replace('{x}', x).replace('{y}', y));
      for (const u of urls) (isCached(u) ? cached++ : fresh++);
      const imgs = await Promise.all(urls.map((u) => tileImage(u)));
      tried += chunk.length;
      ok += imgs.filter(Boolean).length;
      const dt = (now() - t0) / 1000;
      const tps = dt > 0 && fresh > 0 ? fresh / dt : 0;
      graph.setTps(tps);
      graph.setNodeRun('tile', tried / budget);
      on?.tps?.(tps, ok, budget);
      await new Promise((r) => setTimeout(r, 0));
    }
    const tileMs = now() - t0;
    const tps = tileMs > 0 && fresh > 0 ? (fresh / tileMs) * 1000 : 0;
    note('tile', fresh
      ? `타일 ${ok}/${tried}장 · 신규 ${fresh}장 ${tps.toFixed(0)} tiles/s(로컬 디코딩 실측) · 캐시 ${cached}장`
      : `타일 ${ok}/${tried}장 전부 캐시 적중 — 처리량 측정 없음`, Math.round(tileMs));
    graph.setNodeRun('tile', 1);

    /* 03 모델 — 가중치 파일은 저장소에 없다. 메타만 읽었다고 쓴다. */
    graph.setNodeRun('model', 1);
    note('model', data.mdl
      ? `${data.mdl.file} · ${data.mdl.sizeMB} MB · ${data.mdl.classes.length}클래스 — 메타만 읽음(가중치 파일은 저장소 외부)`
      : '이 과업의 학습 모델 파일이 저장소에 없다 — 산출물만 존재', 0);

    /* 04 탐지 — 그 범위 안의 실제 폴리곤을 센다. */
    graph.setNodeRun('detect', 0);
    const t1 = now();
    let inBox = 0, objs = 0;
    for (const f of data.feats) {
      const b = f.properties.bb;
      if (b[2] < bbox[0] || b[0] > bbox[2] || b[3] < bbox[1] || b[1] > bbox[3]) continue;
      inBox++; objs += f.properties.nobj;
    }
    const detMs = now() - t1;
    note('detect', `${inBox.toLocaleString()} ${data.unit} · ${objs.toLocaleString()}동 — ${data.res.src}`, Math.round(detMs));
    graph.setNodeRun('detect', 1);

    /* 05 후처리 — 임계 통과 판정 실측 */
    graph.setNodeRun('post', 0);
    const t2 = now();
    const c = mapc.counts();
    const postMs = now() - t2;
    note('post', `conf ≥ ${mapc.state.thr.toFixed(2)} 통과 ${c.shown.toLocaleString()} / ${c.total.toLocaleString()}`, Math.round(postMs));
    graph.setNodeRun('post', 1);

    /* 06 지도 — 레이어 반영 실측 */
    graph.setNodeRun('mapout', 0);
    const t3 = now();
    mapc.apply();
    const mapMs = now() - t3;
    note('mapout', `지도 레이어 갱신 · ${c.obj.toLocaleString()}동 표시`, Math.round(mapMs));
    graph.setNodeRun('mapout', 1);

    const total = now() - t00;
    running = false;
    graph.setRunning(false);
    on?.done?.({ total: Math.round(total), tps, tiles: ok, fresh, cached, log: [...log] });
    return { total, tps, tiles: ok, fresh, cached };
  }

  return { run, stop() { running = false; graph.setRunning(false); }, get running() { return running; }, log };
}
