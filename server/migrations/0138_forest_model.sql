-- 0138 산림 변화 모델 등록(11-01 — 산사태 취약지역 작업 장부에 실제 쓴 모델 이름이 남게) · 멱등.
-- 계산: change/forest.py · 설정 config/landslide.yaml(model · model_id) · 어댑터 change/unet(산림 모델 분기).
INSERT INTO models(id, family, version, weights_uri, task, classes, input, status, tile_size, adapter, name, metrics, created_at)
VALUES ('change-forest6', 'forest6-unet-r50', '20261031', 'E:/Land-XI 플랫폼/02. 데이터/models/forest-change/forest6-r50-1031.pt', 'seg',
        '["산림 → 나지", "산림 → 도로", "산림 → 건물", "산림 → 농지 · 초지", "채석장 · 개발지 확장"]'::jsonb, '["ortho"]'::jsonb, 'registered', 1024, 'change/unet',
        '{"ko": "산림 변화 탐지(토지피복 U-Net · 산림 · 두 시점 비교) 2026.10.31", "en": "Forest change (land-cover U-Net, two dates)"}'::jsonb,
        '{"mean_iou": {"value": 0.756, "unit": "ratio", "basis": "measured", "source": "AI 허브 124 · 125 · 126 검증 5,173칸 · 6 묶음", "as_of": "2026-10-31"}}'::jsonb, now())
ON CONFLICT (id) DO NOTHING;
