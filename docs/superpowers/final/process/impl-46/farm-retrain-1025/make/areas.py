# 영역 표: 이름 → (월, 작업 id 목록, 분할)
AREAS={
 "06A":("06",["job_01M5SEMY219D79CGZ2HEZHH61D"],"train"),
 "06T1":("06",["job_01M5SMJ43YPPKCYGFBQ5YB7P62"],"train"),
 "06T2":("06",["job_01M5SMJ5K0WES8Q2XAM3V2QYSX"],"train"),
 "06V":("06",["job_01M5SMJ72AJPNKAN90RDPGMWBM"],"val"),
 "06X1":("06",["job_01M5SMJ8EYR190KA356K5KW0M5"],"test"),
 "06X2":("06",["job_01M5SMJ9WKS36FYS46JM0RXTHY"],"test"),
 "08D":("08",["job_01M5SK2G9GDBKNMRMK55CZGB52"],"train"),
 "08E":("08",["job_01M5SJMMKP7M14D48ZEEWQQNC2"],"train"),
 "08T":("08",["job_01M5SMJB7XGAPK9FYMPY6GGQ3G"],"train"),
 "08V":("08",["job_01M5SMJCPC918QC61PSK4WQ980"],"val"),
 "08F":("08",["job_01M5SJY5JEKJM3EQC0RP9AX2KM"],"test"),
 "08X":("08",["job_01M5SMJDYR14W0HN4EZ7S2GQ4H"],"test"),
}
CODE={"C":"경작","W":"경작","L":"경작","T":"경작","F":"휴경"}   # N 농지 아님 · U 모름 · X 영상 빈 곳 = 학습에 안 씀
OVERRIDE={"5219040021106700001":"T"}   # 사용자 지적 필지(08 후보 1 · 왼쪽에서 3번째) = 경작
