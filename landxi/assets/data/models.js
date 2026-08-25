// 학습 모델 메타 — tools/prepare-assets.py 가 실제 .pt 파일 stat 과 data(*.yaml) 에서 생성.
// inferred:true 는 data yaml 이 없어 파일명/노트북에서 클래스를 추정한 모델.
// 자동 생성 — 직접 고치지 말고 파이프라인을 다시 돌릴 것.
export const MODELS = [
  {
    "id": "best-car",
    "name": "차량·교통량 탐지",
    "file": "best(Car).pt",
    "sizeMB": 114.4,
    "task": "detect",
    "classes": [
      "Bus",
      "Car",
      "People",
      "Truck"
    ],
    "trainedAt": "2025-07",
    "inferred": false
  },
  {
    "id": "best-house",
    "name": "건물 탐지",
    "file": "best(House).pt",
    "sizeMB": 118.6,
    "task": "detect",
    "classes": [
      "House"
    ],
    "trainedAt": "2025-07",
    "inferred": false
  },
  {
    "id": "best-road",
    "name": "도로망 세그멘테이션",
    "file": "best(Road).pt",
    "sizeMB": 249.2,
    "task": "segment",
    "classes": [
      "Road"
    ],
    "trainedAt": "2025-08",
    "inferred": false
  },
  {
    "id": "best-vinylhouse",
    "name": "비닐하우스 탐지",
    "file": "best(Vinylhouse).pt",
    "sizeMB": 236.7,
    "task": "detect",
    "classes": [
      "Vinylhouse"
    ],
    "trainedAt": "2025-07",
    "inferred": false
  },
  {
    "id": "yolo11x-obb",
    "name": "YOLO11x-OBB 회전객체",
    "file": "yolo11x-obb.pt",
    "sizeMB": 118.4,
    "task": "obb",
    "classes": [
      "plane",
      "ship",
      "storage tank",
      "baseball diamond",
      "tennis court",
      "basketball court",
      "ground track field",
      "harbor",
      "bridge",
      "large vehicle",
      "small vehicle",
      "helicopter",
      "roundabout",
      "soccer ball field",
      "swimming pool"
    ],
    "trainedAt": "2025-07",
    "inferred": true
  },
  {
    "id": "yolo11n",
    "name": "YOLO11n 범용 사전학습",
    "file": "yolo11n.pt",
    "sizeMB": 5.6,
    "task": "detect",
    "classes": [
      "person",
      "bicycle",
      "car",
      "motorcycle",
      "airplane",
      "bus",
      "train",
      "truck",
      "boat",
      "traffic light",
      "fire hydrant",
      "stop sign",
      "parking meter",
      "bench",
      "bird",
      "cat",
      "dog",
      "horse",
      "sheep",
      "cow"
    ],
    "trainedAt": "2025-07",
    "inferred": true
  },
  {
    "id": "model-yolo-illegal",
    "name": "개발제한구역 불법행위 탐지",
    "file": "model_yolo_illegal.pt",
    "sizeMB": 6.7,
    "task": "detect",
    "classes": [
      "불법건축물",
      "불법적치",
      "불법형질변경"
    ],
    "trainedAt": "2023-12",
    "inferred": true
  },
  {
    "id": "model-yolo-illegal-building",
    "name": "불법건축물 탐지",
    "file": "model_yolo_illegal_building.pt",
    "sizeMB": 6.8,
    "task": "detect",
    "classes": [
      "불법건축물"
    ],
    "trainedAt": "2023-12",
    "inferred": true
  },
  {
    "id": "model-segformer-land",
    "name": "토지형질 SegFormer",
    "file": "model_segformer_land.pt",
    "sizeMB": 15.0,
    "task": "segment",
    "classes": [
      "건물",
      "도로",
      "농경지",
      "산림",
      "나지",
      "수역"
    ],
    "trainedAt": "2023-12",
    "inferred": true
  },
  {
    "id": "model-landuse-epoch000",
    "name": "토지이용 분류",
    "file": "model_landuse_epoch000.pt",
    "sizeMB": 15.0,
    "task": "segment",
    "classes": [
      "주거",
      "상업",
      "공업",
      "농업",
      "녹지"
    ],
    "trainedAt": "2023-12",
    "inferred": true
  }
];
