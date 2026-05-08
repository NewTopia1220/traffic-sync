import { useState, useEffect, useRef } from "react";

const CCTV_SERVER = "http://localhost:8000";

// 기본 중심 좌표 (거제시청)
const DEFAULT_LAT = 34.8800;
const DEFAULT_LON = 128.6215;
const DEFAULT_NAME = "거제시";

async function fetchCctvList({ lat = DEFAULT_LAT, lon = DEFAULT_LON, radius = 10.0, keyword = "" } = {}) {
  const params = new URLSearchParams({ lat, lon, radius, keyword, limit: 50 });
  const res = await fetch(`${CCTV_SERVER}/cctv?${params}`);
  if (!res.ok) throw new Error(`서버 오류: ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json;
}

/* ── HLS 플레이어 ── */
function HlsPlayer({ url, name }) {
  const videoRef = useRef(null);
  const hlsRef   = useRef(null);

  useEffect(() => {
    if (!url || !videoRef.current) return;

    function initHls(Hls) {
      if (hlsRef.current) hlsRef.current.destroy();
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: false });
        hls.loadSource(url);
        hls.attachMedia(videoRef.current);
        hls.on(Hls.Events.MANIFEST_PARSED, () => videoRef.current?.play().catch(()=>{}));
        hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) console.warn("HLS 오류:", d.details); });
        hlsRef.current = hls;
      } else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
        videoRef.current.src = url;
        videoRef.current.play().catch(()=>{});
      }
    }

    if (window.Hls) { initHls(window.Hls); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.4.12/hls.min.js";
    s.onload = () => initHls(window.Hls);
    document.head.appendChild(s);
    return () => hlsRef.current?.destroy();
  }, [url]);

  return (
    <video ref={videoRef} muted playsInline controls
      style={{ width:"100%", height:"100%", objectFit:"cover", background:"#000", borderRadius:6 }}
      aria-label={`CCTV: ${name}`}
    />
  );
}

/* ── CCTV 플레이어 (HLS URL 추출 후 재생) ── */
function CctvPlayer({ cctv }) {
  const [hlsUrl,  setHlsUrl]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed,  setFailed]  = useState(false);

  useEffect(() => {
    if (!cctv) return;
    setLoading(true); setFailed(false); setHlsUrl(null);

    fetch(`${CCTV_SERVER}/cctv/stream?cctvid=${cctv.cctvid}`)
      .then(r => r.json())
      .then(data => {
        if (data.hls_url) setHlsUrl(data.hls_url);
        else setFailed(true);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [cctv?.cctvid]);

  if (loading) return (
    <div style={{ width:"100%", height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10, background:"#060d1a" }}>
      <div style={{ width:28, height:28, border:"3px solid rgba(59,130,246,0.3)", borderTop:"3px solid #3b82f6", borderRadius:"50%", animation:"spin 1s linear infinite" }}/>
      <div style={{ fontSize:13, color:"#6b7280" }}>스트림 연결 중...</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (failed || !hlsUrl) return (
    <div style={{ width:"100%", height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10, background:"#060d1a" }}>
      <div style={{ fontSize:28 }}>🔒</div>
      <div style={{ fontSize:13, color:"#6b7280", textAlign:"center", lineHeight:1.7 }}>
        스트림 접근이 제한된 CCTV입니다<br/>
        <span style={{ fontSize:11, color:"#374151" }}>({cctv.center})</span>
      </div>
    </div>
  );

  return <HlsPlayer url={hlsUrl} name={cctv.cctvname} />;
}

/* ── 썸네일 카드 ── */
function CctvCard({ cctv, isSelected, onClick }) {
  return (
    <div onClick={onClick}
      style={{
        background: isSelected ? "rgba(29,78,216,0.15)" : "rgba(14,20,36,0.8)",
        border: `1px solid ${isSelected ? "rgba(59,130,246,0.5)" : "rgba(255,255,255,0.08)"}`,
        borderRadius:9, overflow:"hidden", cursor:"pointer", transition:"all .15s",
      }}
      onMouseEnter={e=>{ if(!isSelected) e.currentTarget.style.borderColor="rgba(59,130,246,0.3)"; }}
      onMouseLeave={e=>{ if(!isSelected) e.currentTarget.style.borderColor="rgba(255,255,255,0.08)"; }}
    >
      <div style={{ height:90, background:"#060d1a", position:"relative", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:4 }}>
        <div style={{ fontSize:20 }}>📷</div>
        <div style={{ fontSize:10, color:"#475569" }}>클릭하여 재생</div>
        {cctv.distance_km !== undefined && (
          <div style={{ position:"absolute", top:5, right:6, background:"rgba(0,0,0,0.65)", borderRadius:4, padding:"1px 7px", fontSize:10, color:"#94a3b8" }}>
            {cctv.distance_km < 1 ? `${Math.round(cctv.distance_km*1000)}m` : `${cctv.distance_km.toFixed(1)}km`}
          </div>
        )}
        {isSelected && <div style={{ position:"absolute", inset:0, border:"2px solid #3b82f6", borderRadius:9, pointerEvents:"none" }}/>}
      </div>
      <div style={{ padding:"8px 10px" }}>
        <div style={{ fontSize:12, fontWeight:600, color:"#e2e8f0", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{cctv.cctvname}</div>
        <div style={{ fontSize:10, color:"#475569", marginTop:2 }}>{cctv.center}</div>
      </div>
    </div>
  );
}

/* ── 메인 패널 ── */
export default function CctvPanel({ selected }) {
  const [cctvList,    setCctvList]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [serverOk,    setServerOk]    = useState(null);
  const [keyword,     setKeyword]     = useState("");
  const [inputKw,     setInputKw]     = useState("");
  const [radius,      setRadius]      = useState(10.0);

  // 서버 상태 확인
  useEffect(() => {
    fetch(`${CCTV_SERVER}/health`)
      .then(r => r.json())
      .then(() => setServerOk(true))
      .catch(() => setServerOk(false));
  }, []);

  // 선택된 교차로 좌표 or 기본값(거제시) 기준 조회
  const lat = selected?.lat ?? DEFAULT_LAT;
  const lon = selected?.lon ?? DEFAULT_LON;
  const centerName = selected?.crsrdNm ?? DEFAULT_NAME;

  useEffect(() => {
    if (!serverOk) return;
    setLoading(true); setError(null);

    fetchCctvList({ lat, lon, radius, keyword })
      .then(res => {
        setCctvList(res.data ?? []);
        setSelectedIdx(res.data?.length > 0 ? 0 : null);
        if (!res.data?.length) {
          setError(`반경 ${radius}km 내 CCTV 없음\n반경을 넓히거나 키워드를 변경해보세요.`);
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [lat, lon, radius, keyword, serverOk]);

  // 서버 미실행 안내
  if (serverOk === false) return (
    <div style={{ height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, padding:28 }}>
      <div style={{ fontSize:32 }}>🐍</div>
      <div style={{ fontSize:16, fontWeight:700, color:"#f59e0b" }}>CCTV 중계 서버 미실행</div>
      <div style={{ background:"rgba(0,0,0,0.45)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, padding:"16px 20px", width:"100%", maxWidth:440 }}>
        <div style={{ fontSize:13, fontWeight:700, color:"#94a3b8", marginBottom:12 }}>📋 실행 방법 (파이참 터미널)</div>
        {[
          ["1단계", "패키지 설치",  "pip install fastapi uvicorn requests"],
          ["2단계", "파일 확인",    "cctv_server.py + Geoje_CCTV.csv 같은 폴더"],
          ["3단계", "서버 실행",    "python cctv_server.py"],
        ].map(([step, title, code]) => (
          <div key={step} style={{ marginBottom:10 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
              <span style={{ fontSize:11, background:"rgba(59,130,246,0.2)", color:"#60a5fa", padding:"1px 8px", borderRadius:4, fontWeight:700 }}>{step}</span>
              <span style={{ fontSize:13, color:"#e2e8f0" }}>{title}</span>
            </div>
            <div style={{ fontFamily:"monospace", fontSize:11, color:"#60a5fa", background:"rgba(59,130,246,0.08)", borderRadius:6, padding:"5px 11px" }}>{code}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const selCctv = selectedIdx !== null ? cctvList[selectedIdx] : null;

  return (
    <div style={{ height:"100%", display:"flex", flexDirection:"column", gap:10 }}>

      {/* 서버 상태 + 위치 */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12 }}>
          {serverOk === null
            ? <><span style={{ width:7, height:7, borderRadius:"50%", background:"#6b7280", display:"inline-block" }}/><span style={{ color:"#6b7280" }}>확인 중...</span></>
            : <><span style={{ width:7, height:7, borderRadius:"50%", background:"#22c55e", display:"inline-block" }}/><span style={{ color:"#22c55e" }}>서버 연결됨 · {cctvList.length > 0 ? `${cctvList.length}개` : ""}</span></>
          }
        </div>
        <div style={{ fontSize:11, color:"#475569" }}>📍 {centerName} 기준</div>
      </div>

      {/* 검색 + 반경 */}
      <div style={{ display:"flex", gap:6, flexShrink:0 }}>
        <input
          value={inputKw}
          onChange={e => setInputKw(e.target.value)}
          onKeyDown={e => { if (e.key==="Enter") setKeyword(inputKw); }}
          placeholder="이름 검색 (엔터)"
          style={{ flex:1, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:7, padding:"6px 10px", color:"#e2e8f0", fontSize:12, outline:"none", fontFamily:"inherit" }}
        />
        <select value={radius} onChange={e => setRadius(Number(e.target.value))}
          style={{ background:"rgba(14,20,36,0.9)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:7, padding:"6px 8px", color:"#e2e8f0", fontSize:12, cursor:"pointer" }}>
          <option value={3}>3km</option>
          <option value={5}>5km</option>
          <option value={10}>10km</option>
          <option value={20}>20km</option>
          <option value={50}>50km</option>
        </select>
        {keyword && (
          <button onClick={() => { setKeyword(""); setInputKw(""); }}
            style={{ padding:"6px 10px", borderRadius:7, background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.3)", color:"#ef4444", fontSize:11, cursor:"pointer" }}>✕</button>
        )}
      </div>

      {/* 로딩 */}
      {(serverOk === null || loading) && (
        <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12 }}>
          <div style={{ width:32, height:32, border:"3px solid rgba(59,130,246,0.3)", borderTop:"3px solid #3b82f6", borderRadius:"50%", animation:"spin 1s linear infinite" }}/>
          <div style={{ fontSize:14, color:"#6b7280" }}>{serverOk===null ? "서버 연결 중..." : "CCTV 목록 로딩 중..."}</div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* 오류 */}
      {!loading && error && (
        <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10, padding:20 }}>
          <div style={{ fontSize:24 }}>📭</div>
          <div style={{ fontSize:14, color:"#f59e0b", fontWeight:700 }}>CCTV 없음</div>
          <div style={{ fontSize:13, color:"#64748b", textAlign:"center", whiteSpace:"pre-line" }}>{error}</div>
        </div>
      )}

      {/* 정상 */}
      {!loading && !error && (
        <>
          {/* 대형 뷰 */}
          <div style={{ flexShrink:0, background:"rgba(14,20,36,0.9)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, overflow:"hidden" }}>
            <div style={{ height:240, background:"#000", position:"relative" }}>
              {selCctv
                ? <CctvPlayer cctv={selCctv} />
                : <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", color:"#374151", fontSize:13 }}>CCTV를 선택하세요</div>
              }
              {selCctv && (
                <>
                  <div style={{ position:"absolute", top:10, left:12, background:"rgba(0,0,0,0.72)", borderRadius:6, padding:"4px 12px", fontSize:13, color:"#e2e8f0", fontWeight:600, pointerEvents:"none", zIndex:10 }}>
                    📷 {selCctv.cctvname}
                  </div>
                  <div style={{ position:"absolute", top:10, right:12, background:"rgba(239,68,68,0.88)", borderRadius:5, padding:"3px 10px", fontSize:11, fontWeight:700, color:"#fff", pointerEvents:"none", zIndex:10 }}>
                    ● LIVE
                  </div>
                </>
              )}
            </div>
            <div style={{ padding:"7px 13px", display:"flex", justifyContent:"space-between", fontSize:12, color:"#64748b" }}>
              <span>{selCctv?.center ?? ""}</span>
              <span>{selectedIdx !== null ? `${selectedIdx+1} / ${cctvList.length}개` : ""}</span>
            </div>
          </div>

          {/* 목록 */}
          <div style={{ flex:1, overflowY:"auto" }}>
            <div style={{ fontSize:14, fontWeight:700, color:"#94a3b8", marginBottom:10 }}>
              📷 {centerName} 반경 {radius}km CCTV ({cctvList.length}개)
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {cctvList.map((cctv, i) => (
                <CctvCard
                  key={cctv.cctvid}
                  cctv={cctv}
                  isSelected={i === selectedIdx}
                  onClick={() => setSelectedIdx(i)}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}