import { useState, useEffect, useRef } from "react";

const API = (import.meta.env.VITE_API_URL || "http://localhost:8080").replace(/\/+$/, "");
const KAKAO_KEY = import.meta.env.VITE_KAKAO_APP_KEY;

export const CIVIL_CATEGORIES = [
  "도로 파손/균열",
  "신호등 오작동",
  "불법 주정차",
  "노면 침수/결빙",
  "가로등 불량/소등",
  "교통표지판 훼손",
  "공사구간 미표시",
  "보행자 위험구간",
  "이륜차 불법 운행",
  "과속/난폭운전",
  "도로 청결 불량",
  "횡단보도 파손",
  "소음/진동",
  "기타",
];

const V = {
  bg0: "#000", bg1: "#0a0a0a", line: "#1a1a1a",
  ink0: "#e7ecf5", ink1: "#aab4c8", ink2: "#7a7a7a", ink3: "#3a3a3a",
  grn: "#2ee07a", red: "#ff5566", org: "#ffaa33", blu: "#4ea6ff",
  mono: "'IBM Plex Mono',ui-monospace,Menlo,monospace",
  sans: "'Pretendard','Noto Sans KR',system-ui,sans-serif",
};

const inpStyle = {
  width: "100%", padding: "0 14px", background: V.bg0, border: `1px solid ${V.line}`,
  borderRadius: 2, color: V.ink0, fontSize: 14, fontFamily: V.sans, outline: "none", boxSizing: "border-box",
};

export default function CivilDashboard({ civilUser, onLogout }) {
  const mapRef    = useRef(null);
  const mapObj    = useRef(null);
  const markerRef = useRef(null);
  const geocRef   = useRef(null);

  const [ready, setReady]             = useState(false);
  const [selectedLoc, setSelectedLoc] = useState(null);   // { lat, lng, address }
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [formOpen, setFormOpen]       = useState(false);
  const [form, setForm]               = useState({ title: "", category: CIVIL_CATEGORIES[0], content: "" });
  const [photos, setPhotos]           = useState([]);
  const [previews, setPreviews]       = useState([]);
  const [submitting, setSubmitting]   = useState(false);
  const [submitOk, setSubmitOk]       = useState(false);
  const [err, setErr]                 = useState("");
  const [searchQ, setSearchQ]         = useState("");

  // ── Kakao SDK 로드 ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (window.kakao?.maps) { setReady(true); return; }
    if (document.querySelector("script[data-kakao]")) {
      const id = setInterval(() => { if (window.kakao?.maps) { clearInterval(id); setReady(true); } }, 100);
      return () => clearInterval(id);
    }
    const s = document.createElement("script");
    s.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&libraries=clusterer,services&autoload=false`;
    s.setAttribute("data-kakao", "1");
    s.onload = () => window.kakao.maps.load(() => setReady(true));
    document.head.appendChild(s);
  }, []);

  // ── 지도 초기화 ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const kakao = window.kakao;

    const map = new kakao.maps.Map(mapRef.current, {
      center: new kakao.maps.LatLng(37.5665, 126.9780),
      level: 7,
    });
    mapRef.current.style.filter = "invert(90%) hue-rotate(180deg) brightness(0.85) saturate(0.9)";
    mapObj.current = map;
    geocRef.current = new kakao.maps.services.Geocoder();

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        map.setCenter(new kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude));
        map.setLevel(5);
      });
    }

    kakao.maps.event.addListener(map, "click", mouseEvent => {
      const latlng = mouseEvent.latLng;
      const lat = latlng.getLat();
      const lng = latlng.getLng();

      if (markerRef.current) markerRef.current.setMap(null);
      const marker = new kakao.maps.Marker({ position: latlng });
      marker.setMap(map);
      markerRef.current = marker;

      geocRef.current.coord2Address(lng, lat, (result, status) => {
        const address = status === kakao.maps.services.Status.OK
          ? (result[0].road_address?.address_name || result[0].address.address_name)
          : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        setSelectedLoc({ lat, lng, address });
        setFormOpen(false);
        setConfirmOpen(true);
      });
    });
  }, [ready]);

  // ── 검색 ────────────────────────────────────────────────────────────────────
  const handleSearch = () => {
    if (!searchQ.trim() || !mapObj.current) return;
    const ps = new window.kakao.maps.services.Places();
    ps.keywordSearch(searchQ, (data, status) => {
      if (status !== window.kakao.maps.services.Status.OK || !data.length) return;
      mapObj.current.setCenter(new window.kakao.maps.LatLng(data[0].y, data[0].x));
      mapObj.current.setLevel(4);
    });
  };

  // ── 현재 위치 ───────────────────────────────────────────────────────────────
  const goCurrentLocation = () => {
    if (!mapObj.current || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => {
      mapObj.current.setCenter(new window.kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude));
      mapObj.current.setLevel(4);
    });
  };

  // ── 사진 첨부 ───────────────────────────────────────────────────────────────
  const handlePhoto = e => {
    const files = Array.from(e.target.files).slice(0, 3 - photos.length);
    setPhotos(prev => [...prev, ...files].slice(0, 3));
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => setPreviews(prev => [...prev, ev.target.result].slice(0, 3));
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const removePhoto = i => {
    setPhotos(p => p.filter((_, j) => j !== i));
    setPreviews(p => p.filter((_, j) => j !== i));
  };

  // ── 민원 제출 ───────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.title.trim()) { setErr("제목을 입력하세요."); return; }
    if (!form.content.trim()) { setErr("민원 내용을 입력하세요."); return; }
    setSubmitting(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("userId",   civilUser.userId);
      fd.append("userName", civilUser.name);
      fd.append("title",    form.title);
      fd.append("category", form.category);
      fd.append("content",  form.content);
      fd.append("lat",      selectedLoc.lat);
      fd.append("lng",      selectedLoc.lng);
      fd.append("address",  selectedLoc.address);
      photos.forEach(p => fd.append("photos", p));

      const res = await fetch(`${API}/api/complaints`, { method: "POST", body: fd });
      if (res.ok) {
        setSubmitOk(true);
        setFormOpen(false);
        setForm({ title: "", category: CIVIL_CATEGORIES[0], content: "" });
        setPhotos([]); setPreviews([]);
        setTimeout(() => setSubmitOk(false), 5000);
      } else {
        const d = await res.json().catch(() => ({}));
        setErr(d.message || "민원 접수에 실패했습니다.");
      }
    } catch { setErr("서버 연결 오류가 발생했습니다."); }
    finally { setSubmitting(false); }
  };

  const cancelSelection = () => {
    setConfirmOpen(false);
    if (markerRef.current) markerRef.current.setMap(null);
    setSelectedLoc(null);
  };

  // ── 렌더링 ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: V.sans, background: V.bg0, color: V.ink0, height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── 헤더 ── */}
      <div style={{ height: 56, display: "flex", alignItems: "center", gap: 12, padding: "0 20px", background: V.bg1, borderBottom: `1px solid ${V.line}`, flexShrink: 0 }}>
        <span style={{ width: 8, height: 8, background: V.org, borderRadius: "50%", display: "inline-block" }} />
        <span style={{ fontWeight: 700, fontSize: 15 }}>TrafficSync 민원 신청</span>
        <div style={{ width: 1, height: 18, background: V.line }} />
        <span style={{ fontFamily: V.mono, fontSize: 12, color: V.ink2 }}>{civilUser.name} 님</span>

        {/* 검색 */}
        <div style={{ display: "flex", gap: 6, marginLeft: 16, flex: 1, maxWidth: 360 }}>
          <input
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            placeholder="위치 검색 (Enter)"
            style={{ flex: 1, height: 34, padding: "0 12px", background: "rgba(255,255,255,.05)", border: `1px solid ${V.line}`, borderRadius: 2, color: V.ink0, fontSize: 13, fontFamily: V.sans, outline: "none" }}
          />
          <button onClick={handleSearch} style={{ height: 34, padding: "0 14px", background: V.org, border: "none", borderRadius: 2, color: "#000", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>검색</button>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {submitOk && (
            <span style={{ fontFamily: V.mono, fontSize: 12, color: V.grn, padding: "4px 10px", border: "1px solid #1a3a24", background: "#0c1a12", borderRadius: 2 }}>✓ 민원이 접수되었습니다</span>
          )}
          <button onClick={onLogout} style={{ height: 32, padding: "0 14px", background: "transparent", border: "1px solid #3a1820", borderRadius: 2, color: V.red, fontSize: 13, cursor: "pointer", fontFamily: V.sans }}>로그아웃</button>
        </div>
      </div>

      {/* ── 안내 배너 ── */}
      <div style={{ padding: "7px 20px", background: "#050510", borderBottom: `1px solid ${V.line}`, fontFamily: V.mono, fontSize: 12, color: V.ink2, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <span style={{ color: V.org }}>▸</span>
        지도를 클릭하여 민원 위치를 선택하세요 · 위치 검색 또는 현재 위치 버튼을 사용할 수 있습니다
      </div>

      {/* ── 지도 ── */}
      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        <div ref={mapRef} style={{ width: "100%", height: "100%" }}>
          {!ready && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: V.bg0, color: V.ink2, fontSize: 13, fontFamily: V.mono }}>
              지도 로딩 중...
            </div>
          )}
        </div>

        {/* 현재 위치 버튼 */}
        <button onClick={goCurrentLocation} title="현재 위치로 이동"
          style={{ position: "absolute", bottom: 24, right: 16, zIndex: 10, width: 44, height: 44, background: V.bg1, border: `1px solid ${V.line}`, borderRadius: 2, color: V.ink0, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,.5)" }}>
          ◎
        </button>

        {/* 범례 */}
        <div style={{ position: "absolute", top: 12, left: 12, zIndex: 10, background: "rgba(0,0,0,0.88)", border: `1px solid ${V.line}`, borderRadius: 2, padding: "10px 14px" }}>
          <div style={{ fontFamily: V.mono, fontSize: 11, color: V.ink0, fontWeight: 700, marginBottom: 4 }}>민원 신청 방법</div>
          <div style={{ fontFamily: V.mono, fontSize: 11, color: V.ink2 }}>① 지도 클릭 → ② 위치 확인 → ③ 내용 입력</div>
        </div>
      </div>

      {/* ── 위치 확인 모달 ── */}
      {confirmOpen && selectedLoc && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: V.bg1, border: `1px solid ${V.line}`, borderRadius: 2, padding: "28px 32px", maxWidth: 460, width: "90%", boxShadow: "0 8px 32px rgba(0,0,0,0.8)" }}>
            <div style={{ fontFamily: V.mono, fontSize: 11, color: V.org, letterSpacing: ".5px", marginBottom: 10 }}>LOCATION CONFIRM</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: V.ink0, marginBottom: 12 }}>이 위치에 민원을 신청하겠습니까?</div>
            <div style={{ padding: "10px 14px", background: V.bg0, border: `1px solid ${V.line}`, borderRadius: 2, fontFamily: V.mono, fontSize: 12, color: V.ink1, marginBottom: 22, lineHeight: 1.5 }}>
              📍 {selectedLoc.address}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setConfirmOpen(false); setFormOpen(true); }}
                style={{ flex: 1, height: 46, background: V.org, border: "none", borderRadius: 2, color: "#000", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: V.sans }}>
                민원 신청하기
              </button>
              <button onClick={cancelSelection}
                style={{ flex: 1, height: 46, background: "transparent", border: `1px solid ${V.line}`, borderRadius: 2, color: V.ink1, fontSize: 14, cursor: "pointer", fontFamily: V.sans }}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 민원 입력 패널 (우측 슬라이드) ── */}
      {formOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", justifyContent: "flex-end" }}>
          <div onClick={() => setFormOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />
          <div style={{ position: "relative", width: 480, background: V.bg1, borderLeft: `1px solid ${V.line}`, display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", boxShadow: "-8px 0 32px rgba(0,0,0,0.7)" }}>

            {/* 패널 헤더 */}
            <div style={{ padding: "14px 20px", borderBottom: `1px solid ${V.line}`, background: "#080808", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: V.ink0 }}>민원 내용 입력</span>
              <div style={{ marginLeft: "auto", fontFamily: V.mono, fontSize: 11, color: V.ink2, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                📍 {selectedLoc?.address}
              </div>
              <button onClick={() => setFormOpen(false)}
                style={{ width: 28, height: 28, background: "transparent", border: `1px solid ${V.line}`, borderRadius: 2, color: V.ink2, cursor: "pointer", fontSize: 15, flexShrink: 0 }}>✕</button>
            </div>

            <div style={{ flex: 1, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>

              {/* 제목 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontFamily: V.mono, fontSize: 11, color: V.ink2, letterSpacing: ".4px" }}>제목 <span style={{ color: V.red }}>*</span></label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="민원 제목을 입력하세요"
                  style={{ ...inpStyle, height: 42 }} />
              </div>

              {/* 민원 분류 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontFamily: V.mono, fontSize: 11, color: V.ink2, letterSpacing: ".4px" }}>민원 분류 <span style={{ color: V.red }}>*</span></label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  style={{ ...inpStyle, height: 42, cursor: "pointer" }}>
                  {CIVIL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* 민원 내용 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontFamily: V.mono, fontSize: 11, color: V.ink2, letterSpacing: ".4px" }}>민원 내용 <span style={{ color: V.red }}>*</span></label>
                <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  placeholder="상황을 자세히 설명해주세요..."
                  rows={5}
                  style={{ ...inpStyle, height: "auto", padding: "12px 14px", resize: "vertical", lineHeight: 1.6 }} />
              </div>

              {/* 사진 첨부 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontFamily: V.mono, fontSize: 11, color: V.ink2, letterSpacing: ".4px" }}>
                  사진 첨부 <span style={{ color: V.ink2, fontWeight: 400 }}>(최대 3장)</span>
                </label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {previews.map((src, i) => (
                    <div key={i} style={{ position: "relative", width: 80, height: 80 }}>
                      <img src={src} alt="" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 2, border: `1px solid ${V.line}` }} />
                      <button onClick={() => removePhoto(i)}
                        style={{ position: "absolute", top: -7, right: -7, width: 20, height: 20, background: V.red, border: "none", borderRadius: "50%", color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
                        ✕
                      </button>
                    </div>
                  ))}
                  {photos.length < 3 && (
                    <label style={{ width: 80, height: 80, border: `1px dashed ${V.line}`, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: V.ink2, fontSize: 26, flexShrink: 0 }}>
                      +
                      <input type="file" accept="image/*" multiple onChange={handlePhoto} style={{ display: "none" }} />
                    </label>
                  )}
                </div>
              </div>

              {err && (
                <div style={{ fontFamily: V.mono, fontSize: 12, color: V.red, padding: "8px 12px", background: "#1a0a10", border: "1px solid #3a1820", borderRadius: 2 }}>{err}</div>
              )}
            </div>

            {/* 제출 버튼 */}
            <div style={{ padding: "16px 20px", borderTop: `1px solid ${V.line}`, flexShrink: 0, background: "#060606" }}>
              <button onClick={handleSubmit} disabled={submitting}
                style={{ width: "100%", height: 48, background: submitting ? V.ink3 : V.org, border: "none", borderRadius: 2, color: "#000", fontSize: 15, fontWeight: 700, cursor: submitting ? "wait" : "pointer", fontFamily: V.sans, letterSpacing: ".3px" }}>
                {submitting ? "접수 중..." : "민원 접수하기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
