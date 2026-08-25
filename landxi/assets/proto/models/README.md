# Land-XI 3D 모델 (glTF / .glb)

MapLibre 지구본 위에 얹는 three.js CustomLayer 용 경량 자산. 세 개 모두 Blender 파이썬
스크립트로 **절차적으로 생성**되며, 텍스처가 전혀 없고(순수 PBR 머티리얼) 외부 디코더
의존성도 없다(Draco 미사용 — GLTFLoader 단독으로 로드된다).

| 파일 | 삼각형 | 용량 | 크기(glTF X × Y × Z, m) | 노드 |
|---|---:|---:|---|---|
| `satellite.glb` | 3,580 | 170 KB | 12.34 × 5.49 × 3.06 | `bus`, `payload`, `solar_l`, `solar_r`, `antenna` |
| `drone.glb` | 2,920 | 123 KB | 0.88 × 0.24 × 0.88 | `body`, `gimbal`, `rotor_0`, `rotor_1`, `rotor_2`, `rotor_3` |
| `aircraft.glb` | 3,130 | 116 KB | 10.04 × 2.81 × 8.26 | `fuselage`, `wing`, `cowl`, `prop` |

## 규약

* **스케일**: 1 유닛 = 1 m. 위성 버스 2.4 m(탑재체 포함 전고 약 5 m)·태양전지 폭 12 m,
  드론 프로펠러 포함 폭 0.88 m, 항공기 익폭 10 m·전장 8.3 m.
* **좌표계**: glTF 표준 **Y-up**. 진행 방향은 **−Z**(드론 기수·항공기 기수 모두 −Z),
  위성은 나디르(지구를 보는 광학 탑재체 방향)가 **−Y**.
* **원점**: 각 모델의 원점은 기체 중심 — 위성은 버스 중심, 드론은 동체 중심,
  항공기는 주익 부근 무게중심. 지도 위에 놓을 때 원점을 그대로 위치로 쓰면 된다.
* **노드 계층**: 전부 씬 루트 바로 아래의 형제 노드다(부모-자식 없음). 각 노드의
  **원점(translation)이 회전 피벗**이므로 노드를 그냥 회전시키면 된다.

## 움직이는 부품

```js
// 드론 로터 — 노드 원점이 모터 축 위에 있고, 축은 로컬 +Y(수직).
// 인접 로터는 실제처럼 피치가 반대로 잡혀 있으니 회전 방향도 번갈아 주면 좋다.
for (let i = 0; i < 4; i++) {
  const r = gltf.scene.getObjectByName(`rotor_${i}`);
  r.rotation.y += (i % 2 ? -1 : 1) * dt * 90;   // rad/s
}

// 항공기 프로펠러 — 축은 기수-꼬리 축이므로 로컬 +Z. 스피너가 함께 돈다.
gltf.scene.getObjectByName('prop').rotation.z += dt * 60;

// 위성 태양전지 — 태양 추적처럼 날개를 돌리려면 solar_l / solar_r 를 요크 축(로컬 X)으로.
gltf.scene.getObjectByName('solar_l').rotation.x = sunAngle;
gltf.scene.getObjectByName('solar_r').rotation.x = sunAngle;
```

`gimbal`(드론 카메라)도 별도 노드라 짐벌 팬/틸트를 흉내낼 수 있다.

## 렌더링 시 주의

머티리얼이 대부분 **메탈릭**(위성 MLI 골드·알루미늄 구조, 드론 모터, 항공기 스피너)이라
**환경맵이 없으면 새까맣게 보인다.** HDR 파일 없이 쓰려면 three 의 `RoomEnvironment` +
`PMREMGenerator` 로 충분하다.

```js
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;   // 지도 위에서는 0.4~0.7 사이가 자연스럽다
```

항법등/렌즈에 `emissiveStrength`(KHR_materials_emissive_strength)가 들어 있으므로
톤매핑은 `ACESFilmicToneMapping` 을 권장한다.

## 다시 만들기

```bash
# 전체: Blender 생성 → glTF-Transform 정리(dedup/weld/prune) → 4분할 프리뷰 스크린샷
node tools/models/build.mjs

# 하나만 / 스크린샷 없이
node tools/models/build.mjs drone --no-shot

# Blender 를 직접 부를 때
"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b -P tools/models/satellite.py
```

형상 정의는 `tools/models/{satellite,drone,aircraft}.py`, 공통 지오메트리 헬퍼는
`tools/models/lxbuild.py`(bmesh 기반 프리미티브·로프트·익형 단면·포물면 접시).
검수용 프리뷰는 `tools/models/preview.html` — `?m=<이름>` 으로 열고
`?anim=1` 로 로터/프로펠러를 돌려 피벗을 확인할 수 있다. 결과 이미지는 `shots/models/`.

용량 예산은 파일당 250 KB. Draco 압축은 three.js 쪽에 CDN 디코더가 필요해 일부러 쓰지 않았다.

## 라이선스

Land-XI 자체 제작(절차적 생성). **CC0 1.0 / 퍼블릭 도메인** — 외부 에셋을 가져다 쓴 부분이
없으므로 출처 표기 없이 자유롭게 쓰고 고쳐도 된다.
