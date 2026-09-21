/* 내려받기 — **실제로 파일이 떨어진다** (2026-09-21).
 *
 *   발주자: "분석서비스 - 영상 업로드 등 이런 기능도 다 안되고~"
 *            "전수 점검. 기능 구현. 자잘한 것들은 다 구현."
 *
 * 전에는 `다운로드를 시작합니다 · 시연` 이라고 **말만 하고 끝났다.** 실제 오픈 기준으로는
 * 눌렀는데 아무것도 안 떨어지는 버튼이다. 콘티라도 **내려받기는 진짜로 떨어져야** 한다 —
 * 내용이 콘티일 뿐, 동작은 동작이어야 한다.
 *
 * 원본 파일이 저장소에 있으면 그것을 주고(결과 GeoJSON 등), 없으면 그 자리에서
 * **무엇을 받았는지 적힌 파일**을 만들어 준다. 없는 파일을 있는 척하지 않는다. */

/** 브라우저가 파일로 받게 한다. 링크 하나를 만들어 누르고 지운다(라이브러리 없음). */
function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.style.display = 'none';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 저장소에 있는 파일을 그대로 받는다. 없으면 false — 부른 쪽이 대체본을 만든다. */
export async function downloadFile(url, filename) {
  try {
    const r = await fetch(url);
    if (!r.ok) return false;
    saveBlob(await r.blob(), filename || url.split('/').pop());
    return true;
  } catch { return false; }
}

/** 원본이 없을 때 — **무엇을 받았는지 적힌** 텍스트를 만들어 준다. 빈 파일을 주지 않는다. */
export function downloadNote(filename, lines) {
  const body = [
    ...lines,
    '',
    '— 이 파일은 Land-XI 시연본에서 만들어졌습니다.',
    '   원본 자료가 연결되면 같은 자리에서 실제 파일이 내려갑니다.',
  ].join('\r\n');
  saveBlob(new Blob(['\ufeff' + body], { type: 'text/plain;charset=utf-8' }), filename);
}

/** 결과를 GeoJSON 으로. 저장소에 원본이 있으면 그것을, 없으면 받은 객체를 찍어 준다. */
export async function downloadGeoJSON(name, url, fallback) {
  const safe = String(name).replace(/[\/:*?"<>|]/g, '_');
  if (url && await downloadFile(url, `${safe}.geojson`)) return '원본';
  if (fallback) {
    saveBlob(new Blob([JSON.stringify(fallback, null, 1)], { type: 'application/geo+json' }), `${safe}.geojson`);
    return '요약';
  }
  return '';
}
