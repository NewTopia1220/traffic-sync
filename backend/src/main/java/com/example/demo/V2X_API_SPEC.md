# V2X API 변수명 명세서

## 교차로 데이터 변수명

| 변수명 | 풀네임 | 설명 |
|--------|--------|------|
| stdgCd | Standard Dong Code | 법정동 코드 (예: 1100000000 = 서울특별시) |
| lclgvNm | Local Government Name | 지자체명 (예: 서울특별시) |
| crsrdId | Crossroad ID | 교차로 고유 아이디 (예: 1007) ★ 핵심 결합 키 |
| crsrdNm | Crossroad Name | 교차로 이름 (예: 우리은행암사) |
| mapCtptIntLat | Map Centerpoint Intersection Latitude | 교차로 중심 위도 (Y좌표) |
| mapCtptIntLot | Map Centerpoint Intersection Longitude | 교차로 중심 경도 (X좌표) |
| laneWdth | Lane Width | 차로 너비 (값이 없으면 "" 로 표시) |
| lmtSpdTypeNm | Limit Speed Type Name | 제한속도 기준 (예: 시속, 구간 등) |
| lmtSpd | Limit Speed | 제한 속도 값 |
| crsrdEngNm | Crossroad English Name | 교차로 영문 이름 |
| regId | Registration ID | 데이터를 등록한 주체 (예: V2X 시스템) |
| regDt | Registration Date | 데이터가 최초 등록된 일시 |
| totDt | Total Date | 이 데이터가 최종 수집/집계된 일시 |

---

## 신호등 데이터 변수명

### 1단계: 방향 (어느 쪽에서 오는 차인가?)

| 코드 | 풀네임 | 설명 |
|------|--------|------|
| nt | North | 북쪽 진입 |
| et | East | 동쪽 진입 |
| st | South | 남쪽 진입 |
| wt | West | 서쪽 진입 |
| ne | NorthEast | 북동쪽 진입 |
| se | SouthEast | 남동쪽 진입 |
| sw | SouthWest | 남서쪽 진입 |
| nw | NorthWest | 북서쪽 진입 |

### 2단계: 신호 종류 (누구를 위한 신호인가?)

| 코드 | 풀네임 | 설명 |
|------|--------|------|
| Stsg | Straight Signal | 직진 신호 |
| Ltsg | Left-turn Signal | 좌회전 신호 |
| Pdsg | Pedestrian Signal | 횡단보도 보행자 신호 |
| Utsg | U-turn Signal | 유턴 신호 |
| Bssg | Bus Signal | 버스 전용 신호 |
| Bcsg | Bicycle Signal | 자전거 전용 신호 |

### 3단계: 값의 형태 (무엇을 알려주는가?)

| 코드 | 풀네임 | 설명 |
|------|--------|------|
| SttsNm | Status Name | 현재 신호의 상태 (문자열) |
| RmndCs | Remain deci-seconds | 남은 잔여 시간 (데시초, /10 하면 초) |

### SttsNm 상태값

| 값 | 의미 |
|----|------|
| protected-Movement-Allowed | 초록불 (보호받는 직진/진행 허용) |
| stop-And-Remain | 빨간불 (정지 후 대기) |

### RmndCs 주의사항
- 단위가 초(Seconds)가 아니라 **데시초(1/10초)**
- 값이 300이면 30초, 350이면 35초
- 36000 이상이면 V2X 센티넬 값 (잔여시간 불명) → 무시

---

## 필드명 조합 규칙

```
방향 + 신호종류 + 값형태
 nt  +   Stsg  + SttsNm = ntStsgSttsNm  (북쪽 직진 신호 상태)
 nt  +   Stsg  + RmndCs = ntStsgRmndCs  (북쪽 직진 잔여시간)
 et  +   Ltsg  + SttsNm = etLtsgSttsNm  (동쪽 좌회전 신호 상태)
 st  +   Pdsg  + RmndCs = stPdsgRmndCs  (남쪽 보행자 잔여시간)
```
