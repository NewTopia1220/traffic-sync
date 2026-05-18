import { useState, useEffect, useRef } from "react";
import { domColor } from "../../utils/signalUtils";

// 지도 기본 중심 좌표 (잠실역) — initialCenter prop 없을 때 사용
const DEFAULT_LAT = 37.5133;
const DEFAULT_LON = 127.1002;

// 스프링 REST API 주소 — CCTV 목록 조회용
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

/**
 * KakaoMapView 컴포넌트
 *
 * 카카오맵 SDK를 동적으로 로드하고 교차로 신호등 마커 + CCTV 마커를 표시.
 * MapDashboard 좌측 전체를 차지하는 핵심 지도 뷰.
 *
 * @param {Array}    crossroads    - WebSocket 교차로 신호 데이터 배열 (useWebSocket에서 가공됨)
 * @param {Object}   selected      - 현재 선택된 교차로 (마커 강조 + panTo)
 * @param {Function} onSelect      - 마커 클릭 시 교차로 객체 전달 콜백
 * @param {Object}   initialCenter - 최초 지도 중심 좌표 { lat, lon } (구 클릭 시 전달)
 * @param {Function} onCctvClick   - CCTV 마커 클릭 시 CCTV 객체 전달 콜백 → CctvModal 열기
 */
export default function KakaoMapView({ crossroads, selected, onSelect, initialCenter, onCctvClick, stations = [], onStationSelect }) {

  // ── Ref: 재렌더링 없이 값 유지 ──────────────────────────────────────────────
  const mapRef       = useRef(null); // 카카오맵이 실제로 렌더링될 DOM div 요소
  const mapObj       = useRef(null); // kakao.maps.Map 인스턴스 (지도 객체)
  const overlays     = useRef({});   // 교차로 오버레이 맵 { crsrdId → CustomOverlay }
  const cctvOverlays = useRef([]);   // CCTV CustomOverlay 배열 (toggle 시 일괄 제거용)
  const clusterer    = useRef(null); // MarkerClusterer 인스턴스 (줌아웃 시 마커 묶음)

  // ── State: 바뀌면 리렌더 트리거 ────────────────────────────────────────────
  const [ready,    setReady]    = useState(false); // SDK 로드 완료 여부 (false면 로딩 스피너)
  const [zoom,     setZoom]     = useState(4);     // 현재 줌 레벨 (마커↔클러스터 전환 기준)
  const [cctvList, setCctvList] = useState([]);    // 스프링 /api/cctv에서 받은 CCTV 목록
  const [showCctv, setShowCctv] = useState(false); // CCTV 마커 표시 여부 (토글 버튼)

  // ── 교통량 추가 ────────────────────────────────────────────
  const trafficOverlays = useRef([]); // 교통량 오버레이 관리용
  const [showTraffic, setShowTraffic] = useState(false); // 교통량 마커 토글 상태
  const [activeStation, setActiveStation] = useState(null); // 클릭된 지점 상세 정보
  const stationDetailOverlay = useRef(null); // 상세정보 오버레이 관리용

  // ── useEffect 1: 카카오맵 SDK 동적 로드 ────────────────────────────────────
  // 카카오맵 SDK는 index.html에 미리 넣지 않고 컴포넌트 마운트 시 동적으로 삽입.
  // 이유: API 키를 .env에서 가져와야 하고, 지도 페이지에서만 필요하기 때문.
  useEffect(() => {
    const KEY = import.meta.env.VITE_KAKAO_APP_KEY;

    // 케이스 1: 이미 SDK가 로드된 경우 (다른 컴포넌트가 먼저 로드했거나 HMR 재마운트)
    if (window.kakao?.maps) { setReady(true); return; }

    // 케이스 2: script 태그가 삽입됐지만 아직 로드 중인 경우 → 100ms 폴링으로 완료 대기
    if (document.querySelector("script[data-kakao]")) {
      const id = setInterval(() => {
        if (window.kakao?.maps) { clearInterval(id); setReady(true); }
      }, 100);
      return;
    }

    // 케이스 3: 최초 로드 → script 태그 동적 삽입
    // libraries=clusterer: MarkerClusterer 사용
    // libraries=services: 주소 검색 등 (현재 미사용, 확장 대비)
    // autoload=false: 수동으로 kakao.maps.load() 호출해서 초기화
    const s = document.createElement("script");
    s.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${KEY}&libraries=clusterer,services&autoload=false`;
    s.setAttribute("data-kakao", "1"); // 중복 삽입 방지용 식별자
    s.onload = () => window.kakao.maps.load(() => setReady(true));
    document.head.appendChild(s);
  }, []); // 마운트 1회만 실행

  // ── useEffect 2: 지도 초기화 (SDK 로드 완료 후 1회) ────────────────────────
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const kakao = window.kakao;

    // initialCenter: 통합 대시보드에서 구 클릭 시 해당 구 좌표 전달됨
    // 없으면 잠실역 기본값
    const centerLat = initialCenter?.lat ?? DEFAULT_LAT;
    const centerLon = initialCenter?.lon ?? DEFAULT_LON;

    const map = new kakao.maps.Map(mapRef.current, {
      center: new kakao.maps.LatLng(centerLat, centerLon),
      level: 4, // 초기 줌 레벨 (1=가장 확대, 14=가장 축소)
    });
    mapObj.current = map;

    // 다크 모드 필터: 카카오맵 기본 밝은 배경을 어둡게 변환
    // invert(90%): 명암 반전, hue-rotate(180deg): 색상 반전 보정
    // brightness(0.85) saturate(0.9): 채도/밝기 미세 조정
    mapRef.current.style.filter = "invert(90%) hue-rotate(180deg) brightness(0.85) saturate(0.9)";

    // 줌 변경 이벤트 → zoom state 업데이트 → 마커/클러스터 전환 트리거
    kakao.maps.event.addListener(map, "zoom_changed", () => setZoom(map.getLevel()));

    // MarkerClusterer: 줌 레벨 5 미만에서 가까운 마커들을 하나의 원으로 묶어 표시
    // minLevel: 5 → 줌 5 미만(더 축소된 상태)에서 클러스터 활성화
    // averageCenter: 클러스터 중심을 포함 마커들의 평균 위치로 설정
    clusterer.current = new kakao.maps.MarkerClusterer({
      map,
      averageCenter: true,
      minLevel: 5,
      // 클러스터 마커 스타일: 주황 원형 (교차로 수 표시)
      styles: [{
        width: "42px", height: "42px",
        background: "rgba(18,14,10,0.9)",
        borderRadius: "50%",
        border: "2px solid rgba(255,170,51,0.7)",
        color: "#ffaa33",
        fontSize: "14px", fontWeight: "700",
        lineHeight: "42px", textAlign: "center",
      }],
    });
  }, [ready]); // ready가 true로 바뀔 때 1회 실행

  // ── useEffect 3: 교차로 마커 업데이트 ──────────────────────────────────────
  // crossroads(새 신호 데이터), selected(선택 교차로), zoom(줌 레벨) 변경 시마다 실행
  // 매번 기존 오버레이를 전부 제거하고 새로 생성 (diffing 없이 전체 재생성)
  useEffect(() => {
    if (!ready || !mapObj.current) return;
    const kakao = window.kakao;

    // 기존 오버레이 전부 지도에서 제거
    Object.values(overlays.current).forEach(ov => ov.setMap(null));
    overlays.current = {};

    if (zoom >= 5) {
      // ── 줌 5 이상: 교차로별 개별 CustomOverlay 표시 ──
      if (clusterer.current) clusterer.current.clear(); // 클러스터 마커 제거

      crossroads.forEach(cr => {
        const pos   = new kakao.maps.LatLng(cr.lat, cr.lon);
        const isSel = selected?.crsrdId === cr.crsrdId;
        // domColor: mappedSignals의 신호 상태 → 빨강/노랑/초록 색상 반환
        const color = domColor(cr.mappedSignals);

        // 선택된 교차로: 큰 원형 마커 + 이름 라벨 (zIndex: 10으로 위에 표시)
        // 미선택 교차로: 작은 점 마커 (zIndex: 3)
        const content = isSel
          ? `<div style="position:relative;cursor:pointer">
               <div style="width:36px;height:36px;border-radius:50%;border:2px solid ${color};background:${color}33;display:flex;align-items:center;justify-content:center">
                 <div style="width:13px;height:13px;border-radius:50%;background:${color};box-shadow:0 0 8px ${color}"></div>
               </div>
               <div style="position:absolute;top:-22px;left:50%;transform:translateX(-50%);background:rgba(18,14,10,0.92);border:1px solid ${color}66;border-radius:3px;padding:2px 8px;font-size:11px;color:${color};white-space:nowrap;font-weight:700;font-family:Malgun Gothic,sans-serif">${cr.crsrdNm}</div>
             </div>`
          : `<div style="width:12px;height:12px;border-radius:50%;border:2px solid rgba(255,255,255,0.35);background:${color};box-shadow:0 0 5px ${color}88;cursor:pointer"></div>`;

        const ov = new kakao.maps.CustomOverlay({
          position: pos,
          content,
          zIndex: isSel ? 10 : 3,
          xAnchor: 0.5, // 마커 중앙이 좌표에 정렬
          yAnchor: 0.5,
        });
        ov.setMap(mapObj.current);
        ov.__cr = cr; // 클릭 이벤트 핸들러에서 교차로 데이터 접근용 (비표준 속성)
        overlays.current[cr.crsrdId] = ov;
      });

    } else {
      // ── 줌 5 미만: MarkerClusterer에 기본 마커 추가 ──
      // CustomOverlay는 클러스터러가 지원하지 않아 기본 Marker 사용
      // 클릭 이벤트는 kakao.maps.event.addListener로 직접 등록
      if (clusterer.current) {
        const markers = crossroads.map(cr => {
          const m = new kakao.maps.Marker({ position: new kakao.maps.LatLng(cr.lat, cr.lon) });
          kakao.maps.event.addListener(m, "click", () => onSelect(cr));
          return m;
        });
        clusterer.current.addMarkers(markers);
      }
    }
  }, [ready, crossroads, selected, zoom]);

  // ── useEffect 4: 선택된 교차로로 지도 이동 ─────────────────────────────────
  // selected.crsrdId 기준으로 실행 (같은 교차로의 신호 데이터만 갱신되면 이동 안 함)
  useEffect(() => {
    if (!ready || !mapObj.current || !selected?.lat || !selected?.lon) return;
    // panTo: 즉시 이동이 아닌 부드러운 애니메이션 이동
    mapObj.current.panTo(new window.kakao.maps.LatLng(selected.lat, selected.lon));
  }, [ready, selected?.crsrdId]); // crsrdId가 바뀔 때만 실행

  // ── useEffect 5: CCTV 목록 로드 ────────────────────────────────────────────
  // 마운트 시 1회: 스프링 /api/cctv → Oracle DB CCTV3 테이블 전체 조회
  // CCTV 마커 버튼 클릭 전에 미리 로드해둠 (토글 시 즉시 표시)
  useEffect(() => {
    fetch(`${API_BASE}/api/cctv`)
      .then(r => r.json())
      .then(data => setCctvList(data))
      .catch(() => {}); // 실패 시 조용히 무시 (마커 없음으로 처리)
  }, []);

  // ── useEffect 6: CCTV 마커 토글 ────────────────────────────────────────────
  // showCctv 또는 cctvList 변경 시 실행
  useEffect(() => {
    if (!ready || !mapObj.current) return;
    const kakao = window.kakao;

    // 기존 CCTV 오버레이 전부 제거 (showCctv false면 여기서 종료)
    cctvOverlays.current.forEach(ov => ov.setMap(null));
    cctvOverlays.current = [];
    if (!showCctv) return;

    cctvList.forEach(cctv => {
      const pos = new kakao.maps.LatLng(cctv.lat, cctv.lon);

      // CCTV 마커: DOM 요소 직접 생성 (innerHTML로 SVG + 텍스트 삽입)
      // 흰 배경 카드 + 카메라 SVG + 이름 6자 축약 + 핀 막대 + 하단 원
      // streamId 있으면 초록 테두리(스트림 연결됨), 없으면 회색
      const el = document.createElement("div");
      el.style.cssText = "cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.8))";
      el.title = cctv.cctvNm;
      el.innerHTML = `
        <div style="background:#fff;border-radius:8px;padding:5px 6px;display:flex;flex-direction:column;align-items:center;gap:2px;border:2px solid ${cctv.streamId ? '#22c55e' : '#9ca3af'}">
          <svg width="28" height="22" viewBox="0 0 38 30" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="6" width="24" height="18" rx="3" fill="#1e293b"/>
            <polygon points="26,11 34,8 34,22 26,19" fill="#1e293b"/>
            <circle cx="14" cy="15" r="5.5" fill="#334155"/>
            <circle cx="14" cy="15" r="3" fill="#0f172a"/>
            <circle cx="12.5" cy="13.5" r="1.2" fill="#fff" opacity="0.7"/>
            <rect x="8" y="3" width="7" height="3" rx="1" fill="#1e293b"/>
            <rect x="20" y="9" width="3" height="3" rx="0.5" fill="#94a3b8"/>
          </svg>
          <div style="font-size:9px;color:#1e293b;font-weight:700;font-family:Malgun Gothic,sans-serif;max-width:52px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2">
            ${cctv.cctvNm.length > 6 ? cctv.cctvNm.slice(0, 6) + '…' : cctv.cctvNm}
          </div>
        </div>
        <div style="width:2px;height:6px;background:#fff;opacity:0.9"></div>
        <div style="width:6px;height:6px;border-radius:50%;background:#fff;opacity:0.9"></div>`;

      // e.stopPropagation(): 지도 클릭 이벤트(교차로 선택)로 버블링 방지
      // onCctvClick?: optional chaining으로 prop 없어도 에러 안 남
      el.addEventListener("click", e => { e.stopPropagation(); onCctvClick?.(cctv); });

      const ov = new kakao.maps.CustomOverlay({
        position: pos,
        content: el,
        zIndex: 5,    // 교차로 마커(3)보다 위, 선택 교차로(10)보다 아래
        xAnchor: 0.5,
        yAnchor: 1.0, // 마커 하단(핀 끝)이 좌표에 정렬
      });
      ov.setMap(mapObj.current);
      cctvOverlays.current.push(ov);
    });
  }, [ready, showCctv, cctvList, onCctvClick]);

  
  // ── useEffect 7: 교통량 지점(AI Station) 마커 표시 ─────────────────────────────
  useEffect(() => {
    if (!ready || !mapObj.current) return;
    const kakao = window.kakao;

    // 기존 교통량 오버레이 제거
    trafficOverlays.current.forEach(ov => ov.setMap(null));
    trafficOverlays.current = [];

    if (!showTraffic) return; 

    stations.forEach(st => {
      const pos = new kakao.maps.LatLng(st.latitude, st.longitude);
      // const MARKER_COLOR = "#ffca28";

      // 마커 디자인 (다이아몬드)
      const el = document.createElement("div");
      el.style.cssText = "cursor:pointer; display:flex; flex-direction:column; align-items:center; filter: drop-shadow(0 0 4px #ffca28);";
      el.innerHTML = `
        <div style="width: 14px; height: 14px; background: #000; border: 2px solid #ffca28; 
             border-radius: 2px; transform: rotate(45deg); display: flex; align-items: center; justify-content: center;">
          <div style="width: 4px; height: 4px; background: #ffca28; border-radius: 50%;"></div>
        </div>
        <div style="margin-top: 6px; padding: 1px 15px; background: transparent; 
             color: #ffffff; font-size: 10px; font-weight: 700; white-space: nowrap;
             filter: invert(1) hue-rotate(180deg);">
          ${st.stationName}
        </div>
      `;

      // 마커 클릭 이벤트: activeStation 상태 업데이트 + 부모 콜백 호출
      el.onclick = (e) => {
        e.stopPropagation();
        setActiveStation(st.stationId); // 상세 팝업 트리거z
        if (onStationSelect) onStationSelect(st.stationId);
      };

      const ov = new kakao.maps.CustomOverlay({
        position: pos,
        content: el,
        zIndex: 6,
        xAnchor: 0.5,
        yAnchor: 0.5,
      });
      ov.setMap(mapObj.current);
      trafficOverlays.current.push(ov);
    });
  }, [ready, showTraffic, stations]);

  // ── useEffect 7-1: 상세 정보 팝업(오버레이) Fetch 및 표시 ──────────────────────
  // 상세 정보 팝업(오버레이) 관리 useEffect
  useEffect(() => {
    if (!ready || !mapObj.current || !activeStation) return;

    if (stationDetailOverlay.current) {
      stationDetailOverlay.current.setMap(null);
    }

    // 백엔드 ForecastController 주소와 정확히 일치시킴
    const requestUrl = `${API_BASE}/api/forecast/station/${activeStation}`;
    console.log("요청 주소:", requestUrl);

    fetch(requestUrl)
      .then(res => {
        if (!res.ok) throw new Error(`서버 에러: ${res.status}`);
        return res.json();
      })
      .then(data => {
        // ForecastResult 모델 내부의 예측 데이터 리스트 추출
        console.log("받은 데이터:", data);

        const st = stations.find(s => s.stationId === activeStation);
        if (!st) return;

        const currentHour = new Date().getHours();

        // 1. 단순 숫자 배열(up 또는 down)을 { hour, count } 객체 배열로 변환
        // 백엔드에서 준 up: (24) [347, 235, ...] 구조를 활용합니다.
        const predictionList = (data.up || []).map((val, idx) => ({
          hour: idx,      // 배열의 인덱스가 곧 시간(0~23)
          count: val      // 해당 인덱스의 값이 교통량
        }));

        // 2. 현재 시간 이후의 데이터만 필터링
        const futureData = predictionList.filter(item => item.hour >= currentHour);
      
        const pos = new window.kakao.maps.LatLng(st.latitude, st.longitude);
        const content = document.createElement("div");
        content.style.cssText = `
          position: relative; bottom: 45px; background: rgba(10, 20, 35, 0.95);
          border: 1px solid #ffca28; border-radius: 8px; padding: 12px;
          width: 180px; color: #fff; box-shadow: 0 4px 15px rgba(0,0,0,0.5);
          backdrop-filter: blur(8px); z-index: 100;
        `;

        content.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,202,40,0.3); padding-bottom:5px; margin-bottom:8px;">
            <span style="font-size:13px; font-weight:bold; color:#ffffff;">${st.stationName}</span>
            <button id="close-ov" style="background:none; border:none; color:#fff; cursor:pointer; font-size:18px;">&times;</button>
          </div>
          <div style="max-height: 120px; overflow-y: auto;">
            ${futureData.length > 0 
              ? futureData.map(d => `
                  <div style="display:flex; justify-content:space-between; font-size:12px; padding:4px 0;">
                    <span style="color:#aab4c8;">${d.hour}시</span>
                    <span style="color:#fff; font-weight:700;">${Number(d.value || d.count).toLocaleString()}대</span>
                  </div>
                `).join('')
              : '<div style="font-size:11px; color:#666; text-align:center; padding:10px;">이후 예측 데이터 없음</div>'
            }
          </div>
          <div style="position:absolute; bottom:-10px; left:50%; transform:translateX(-50%); width:0; height:0; border-left:10px solid transparent; border-right:10px solid transparent; border-top:10px solid #ffca28;"></div>
        `;

        content.querySelector("#close-ov").onclick = () => setActiveStation(null);

        const ov = new window.kakao.maps.CustomOverlay({
          position: pos,
          content: content,
          yAnchor: 1
        });

        ov.setMap(mapObj.current);
        stationDetailOverlay.current = ov;
      })
      .catch(err => {
        console.error("상세 데이터 로드 실패:", err.message);
        setActiveStation(null);
      });

  }, [activeStation, ready, stations]);

  // ── useEffect 8: 교차로 마커 클릭 이벤트 ───────────────────────────────────
  // CustomOverlay는 카카오맵 이벤트 시스템 밖의 일반 DOM이라
  // kakao.maps.event.addListener로 클릭을 잡을 수 없음.
  // → mapRef div에 직접 click 리스너 등록 후
  //   클릭된 요소가 어떤 오버레이의 DOM 안에 있는지 contains()로 확인
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const el = mapRef.current;

    const h = e => {
      Object.values(overlays.current).forEach(ov => {
        const n = ov.getContent();
        if (typeof n === "string") return; // HTML string 오버레이는 DOM 참조 불가 → 건너뜀
        if (n?.contains?.(e.target)) onSelect(ov.__cr); // 클릭된 요소가 이 오버레이 안에 있으면 선택
      });
    };

    el.addEventListener("click", h);
    // 클린업: 컴포넌트 언마운트 또는 의존성 변경 시 리스너 제거 (메모리 누수 방지)
    return () => el.removeEventListener("click", h);
  }, [ready, onSelect, onCctvClick]);

  // ── SDK 미로드 시 로딩 화면 ─────────────────────────────────────────────────
  if (!ready) return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0a1020", gap: 10 }}>
      <div style={{ width: 28, height: 28, border: "3px solid rgba(59,130,246,0.3)", borderTop: "3px solid #3b82f6", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
      <div style={{ fontSize: 14, color: "#6b7280" }}>카카오맵 로딩 중...</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ── 지도 렌더링 ─────────────────────────────────────────────────────────────
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>

      {/* 카카오맵이 실제로 렌더링되는 div (ref로 참조) */}
      <div ref={mapRef} style={{ width: "100%", height: "100%" }} />

      {/* 우상단: 교통 상태 범례 (pointerEvents:none → 지도 클릭 방해 안 함) */}
      <div style={{ position: "absolute", top: 14, right: 14, background: "rgba(18,14,10,0.88)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "10px 14px", zIndex: 10, pointerEvents: "none", backdropFilter: "blur(4px)" }}>
        <div style={{ fontSize: 12, color: "#aab4c8", fontWeight: 700, marginBottom: 8 }}>교통 상태</div>
        {[["#2ee07a", "원활 (40km/h+)"], ["#ffaa33", "서행 (20~40km/h)"], ["#ff5566", "혼잡 (~20km/h)"]].map(([c, l]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
            <div style={{ width: 9, height: 9, borderRadius: "50%", background: c }} />
            <span style={{ fontSize: 12, color: "#aab4c8" }}>{l}</span>
          </div>
        ))}
      </div>

      {/* 좌상단: 교차로 수 안내 + CCTV 마커 토글 버튼 */}
      <div style={{ position: "absolute", top: 14, left: 14, display: "flex", gap: 7, zIndex: 10 }}>
        {/* 교차로 수 안내 (pointerEvents:none) */}
        <div style={{ background: "rgba(18,14,10,0.88)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "4px 12px", fontSize: 12, color: "#aab4c8", pointerEvents: "none", backdropFilter: "blur(4px)" }}>
          🗺️ 잠실역 반경 1km · V2X 실시간 · {crossroads.length}개 교차로
        </div>
        {/* CCTV 토글 버튼: 활성화 시 주황 배경/테두리로 강조 */}
        <button
          onClick={() => setShowCctv(v => !v)}
          style={{
            background: showCctv ? "rgba(255,170,51,0.15)" : "rgba(18,14,10,0.88)",
            border: `1px solid ${showCctv ? "rgba(255,170,51,0.5)" : "rgba(255,255,255,0.08)"}`,
            borderRadius: 4, padding: "4px 12px", fontSize: 12,
            color: showCctv ? "#ffaa33" : "#aab4c8",
            cursor: "pointer", fontFamily: "inherit", backdropFilter: "blur(4px)",
          }}>
          📹 CCTV {cctvList.length > 0 ? `${cctvList.length}개` : ""}
        </button>

        {/* 교통량 지점 토글 버튼 */}
        <button
          onClick={() => setShowTraffic(v => !v)}
          style={{
            background: showTraffic ? "rgba(78,166,255,0.15)" : "rgba(18,14,10,0.88)",
            border: `1px solid ${showTraffic ? "rgba(78,166,255,0.5)" : "rgba(255,255,255,0.08)"}`,
            borderRadius: 4, padding: "4px 12px", fontSize: 12,
            color: showTraffic ? "#4ea6ff" : "#aab4c8",
            cursor: "pointer", backdropFilter: "blur(4px)",
          }}>
          교통량 지점 {stations.length}개
        </button>
      </div>

      {/* 하단 중앙: 클러스터 모드 안내 (zoom < 5일 때만 표시) */}
      {zoom < 5 && (
        <div style={{ position: "absolute", bottom: 14, left: "50%", transform: "translateX(-50%)", background: "rgba(18,14,10,0.88)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, padding: "5px 14px", fontSize: 12, color: "#aab4c8", zIndex: 10, pointerEvents: "none", backdropFilter: "blur(4px)" }}>
          클러스터 모드 · 확대하면 교차로별 신호 표시
        </div>
      )}
    </div>
  );
}