import { useState, useEffect, useRef, useCallback } from "react";

/* ──────────────────────────────────────────
   데이터
──────────────────────────────────────────── */
const SPEED_TREND = [
  { time:"07:00", 잠실역:22, 석촌호수:28, 잠실나루:35 },
  { time:"08:00", 잠실역:15, 석촌호수:20, 잠실나루:28 },
  { time:"09:00", 잠실역:11, 석촌호수:16, 잠실나루:22 },
  { time:"10:00", 잠실역:16, 석촌호수:25, 잠실나루:34 },
  { time:"11:00", 잠실역:22, 석촌호수:32, 잠실나루:42 },
  { time:"12:00", 잠실역:20, 석촌호수:29, 잠실나루:38 },
  { time:"13:00", 잠실역:18, 석촌호수:27, 잠실나루:36 },
  { time:"14:00", 잠실역:21, 석촌호수:31, 잠실나루:40 },
  { time:"15:00", 잠실역:19, 석촌호수:28, 잠실나루:38 },
  { time:"16:00", 잠실역:12, 석촌호수:20, 잠실나루:30 },
  { time:"17:00", 잠실역:9,  석촌호수:15, 잠실나루:25 },
  { time:"18:00", 잠실역:11, 석촌호수:18, 잠실나루:28 },
  { time:"19:00", 잠실역:17, 석촌호수:24, 잠실나루:35 },
  { time:"20:00", 잠실역:22, 석촌호수:30, 잠실나루:40 },
];
const ACCIDENT_DATA = {
  labels:["맑음","흐림","비","눈","안개"],
  data:[1.2, 1.8, 3.5, 4.2, 2.8],
  colors:["#22c55e","#60a5fa","#3b82f6","#8b5cf6","#f59e0b"],
};
const RISK_MOCK = [
  { name:"잠실역 사거리",    score:85 },
  { name:"올림픽대로 진입",  score:65 },
  { name:"석촌호수 교차로",  score:48 },
  { name:"잠실나루역",       score:35 },
  { name:"종합운동장 삼거리",score:28 },
  { name:"잠실 롯데타워",    score:20 },
];
const WAIT_MOCK = [
  { name:"잠실역 사거리",    wait:72 },
  { name:"올림픽대로 진입",  wait:58 },
  { name:"석촌호수 교차로",  wait:44 },
  { name:"잠실나루역",       wait:31 },
  { name:"종합운동장",       wait:22 },
  { name:"롯데타워 앞",      wait:14 },
];

/* ── 서울 25개 자치구 중심 좌표 ── */
const LON_MIN=126.76, LON_MAX=127.18, LAT_MIN=37.42, LAT_MAX=37.70;
const W=400, H=400;
const toSvg=(lat,lon)=>[(lon-LON_MIN)/(LON_MAX-LON_MIN)*W, (1-(lat-LAT_MIN)/(LAT_MAX-LAT_MIN))*H];

export const GU_LIST = [
  {name:"종로구",  lat:37.5920, lon:126.9770},
  {name:"중구",    lat:37.5641, lon:126.9979},
  {name:"용산구",  lat:37.5340, lon:126.9900},
  {name:"성동구",  lat:37.5636, lon:127.0369},
  {name:"광진구",  lat:37.5384, lon:127.0822},
  {name:"동대문구",lat:37.5744, lon:127.0396},
  {name:"중랑구",  lat:37.6063, lon:127.0927},
  {name:"성북구",  lat:37.6066, lon:127.0176},
  {name:"강북구",  lat:37.6397, lon:127.0257},
  {name:"도봉구",  lat:37.6688, lon:127.0471},
  {name:"노원구",  lat:37.6542, lon:127.0568},
  {name:"은평구",  lat:37.6177, lon:126.9227},
  {name:"서대문구",lat:37.5794, lon:126.9368},
  {name:"마포구",  lat:37.5663, lon:126.9014},
  {name:"양천구",  lat:37.5170, lon:126.8665},
  {name:"강서구",  lat:37.5509, lon:126.8497},
  {name:"구로구",  lat:37.4955, lon:126.8876},
  {name:"금천구",  lat:37.4600, lon:126.9001},
  {name:"영등포구",lat:37.5263, lon:126.8963},
  {name:"동작구",  lat:37.5124, lon:126.9393},
  {name:"관악구",  lat:37.4784, lon:126.9516},
  {name:"서초구",  lat:37.4837, lon:127.0324},
  {name:"강남구",  lat:37.4979, lon:127.0577},
  {name:"송파구",  lat:37.5145, lon:127.1059},
  {name:"강동구",  lat:37.5301, lon:127.1238},
];

// 한강: 좌표계 기준 y≈215~235 (마포구 y=191 아래, 용산구 y=237 위)
const HANGANG_PATH = `
M 68 228 Q 100 220 132 222 Q 162 224 186 219 Q 212 215 242 217 Q 270 219 296 213 Q 320 208 350 207
L 352 217 Q 322 218 296 224 Q 270 230 242 228 Q 212 226 186 231 Q 162 236 132 233 Q 100 231 68 239 Z
`;

/* ── Haversine 거리 (km) ── */
function calcDistKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

/* ──────────────────────────────────────────
   서울 SVG 지도 (구 개별 클릭)
──────────────────────────────────────────── */
function SeoulSvgMap({ onGoMap, selectedGu, onSelectGu, loading }) {
  const [hoveredGu, setHoveredGu] = useState(null);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setPulse(p => (p + 1) % 100), 60);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ position:"relative", width:"100%", height:"100%", userSelect:"none", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>

      {/* 실시간 지도 버튼 — 우상단 */}
      <button
        onClick={() => onGoMap(selectedGu)}
        style={{
          position:"absolute", top:0, right:0, zIndex:5,
          padding:"8px 16px", borderRadius:7,
          background:"rgba(34,197,94,0.15)", border:"1px solid rgba(34,197,94,0.5)",
          color:"#22c55e", fontSize:13, fontWeight:700, cursor:"pointer",
          fontFamily:"inherit", display:"flex", alignItems:"center", gap:6,
          transition:"all .15s",
        }}
        onMouseEnter={e => { e.currentTarget.style.background="rgba(34,197,94,0.28)"; }}
        onMouseLeave={e => { e.currentTarget.style.background="rgba(34,197,94,0.15)"; }}
      >
        🗺️ 실시간 지도 →
      </button>

      {/* 로딩 오버레이 */}
      {loading && (
        <div style={{ position:"absolute", inset:0, background:"rgba(7,12,23,0.7)", zIndex:10, display:"flex", alignItems:"center", justifyContent:"center", borderRadius:8, gap:8 }}>
          <div style={{ width:20, height:20, border:"2px solid rgba(59,130,246,0.3)", borderTop:"2px solid #3b82f6", borderRadius:"50%", animation:"spin 1s linear infinite" }}/>
          <span style={{ fontSize:13, color:"#60a5fa" }}>데이터 수집 중...</span>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* SVG — 모든 구 포함되도록 viewBox 확장 */}
      <svg viewBox="30 10 355 365" style={{ width:"100%", height:"100%" }}>
        <defs>
          <radialGradient id="seoulGrad" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#1e3a8a" stopOpacity="0.9"/>
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0.95"/>
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2.5" result="blur"/>
            <feComposite in="SourceGraphic" in2="blur" operator="over"/>
          </filter>
          <filter id="guGlow">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feComposite in="SourceGraphic" in2="blur" operator="over"/>
          </filter>
        </defs>

        <rect x="30" y="10" width="355" height="365" fill="url(#seoulGrad)" rx="12"/>
        <path d={HANGANG_PATH} fill="#0ea5e9" opacity="0.35"/>
        <text x="210" y="228" fontSize="9" fill="#38bdf8" opacity="0.8" fontFamily="Malgun Gothic,sans-serif">한 강</text>

        {/* 자치구 점 + 이름 (개별 클릭) */}
        {GU_LIST.map(gu => {
          const [x, y] = toSvg(gu.lat, gu.lon);
          if (x < 55 || x > 380 || y < 15 || y > 375) return null;
          const isSel = selectedGu?.name === gu.name;
          const isHov = hoveredGu === gu.name;
          const r = isSel ? 6 : isHov ? 5 : 2.5;
          const dotColor = isSel ? "#f59e0b" : isHov ? "#60a5fa" : "#60a5fa";
          const textColor = isSel ? "#fde68a" : isHov ? "#93c5fd" : "#93c5fd";
          const textSize = isSel ? 9.5 : isHov ? 8.5 : 7.5;
          const fontWeight = isSel ? "700" : "400";

          return (
            <g key={gu.name}
              style={{ cursor:"pointer" }}
              onClick={e => { e.stopPropagation(); onSelectGu(gu); }}
              onMouseEnter={() => setHoveredGu(gu.name)}
              onMouseLeave={() => setHoveredGu(null)}
            >
              {/* 선택된 구 글로우 링 */}
              {isSel && (
                <circle cx={x} cy={y} r={12} fill="none" stroke="#f59e0b" strokeWidth="1" opacity="0.4" filter="url(#guGlow)"/>
              )}
              {/* hover 링 */}
              {isHov && !isSel && (
                <circle cx={x} cy={y} r={9} fill="rgba(96,165,250,0.15)" stroke="#60a5fa" strokeWidth="0.8" opacity="0.6"/>
              )}
              <circle cx={x} cy={y} r={r} fill={dotColor} opacity={isSel ? 1 : isHov ? 0.9 : 0.65}/>
              <text x={x} y={y - (isSel ? 9 : 6)} fontSize={textSize}
                fill={textColor} opacity={isSel ? 1 : isHov ? 1 : 0.75}
                textAnchor="middle" fontFamily="Malgun Gothic,sans-serif" fontWeight={fontWeight}>
                {gu.name}
              </text>
            </g>
          );
        })}

        {/* 선택된 구 강조 마커 (잠실 스타일) */}
        {selectedGu && (() => {
          const [sx, sy] = toSvg(selectedGu.lat, selectedGu.lon);
          return (
            <>
              <circle cx={sx} cy={sy} r={14 + (pulse % 20) * 0.4} fill="none" stroke="#f59e0b" strokeWidth="1" opacity={0.35 - (pulse % 20) * 0.015}/>
              <text x={sx + 14} y={sy - 8} fontSize="9" fill="#fde68a" fontFamily="Malgun Gothic,sans-serif" fontWeight="700">▶ {selectedGu.name}</text>
            </>
          );
        })()}
      </svg>

    </div>
  );
}

/* ──────────────────────────────────────────
   Chart.js 훅
──────────────────────────────────────────── */
function useChartJs(builder, deps) {
  const ref   = useRef(null);
  const chart = useRef(null);
  useEffect(() => {
    function init() {
      if (!ref.current) return;
      if (chart.current) chart.current.destroy();
      chart.current = builder(ref.current);
    }
    if (window.Chart) { init(); return; }
    if (document.querySelector("script[data-chartjs]")) {
      const id = setInterval(() => { if (window.Chart) { clearInterval(id); init(); } }, 80);
      return;
    }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js";
    s.setAttribute("data-chartjs","1");
    s.onload = init;
    document.head.appendChild(s);
    return () => { if (chart.current) chart.current.destroy(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

const COPTS = {
  responsive:true, maintainAspectRatio:false,
  plugins:{ legend:{display:false}, tooltip:{ backgroundColor:"rgba(10,16,30,0.95)", titleColor:"#94a3b8", bodyColor:"#e2e8f0", padding:10, cornerRadius:6 } },
};
const GC = "rgba(255,255,255,0.06)";
const TC = "#64748b";

function SpeedChart({ data, height=200 }) {
  const ref = useChartJs(c => new window.Chart(c, {
    type:"line",
    data:{
      labels:data.map(d=>d.time),
      datasets:[
        {label:"잠실역",   data:data.map(d=>d["잠실역"]),   borderColor:"#ef4444",backgroundColor:"rgba(239,68,68,0.1)",  tension:0.4,pointRadius:3,borderWidth:2,fill:true},
        {label:"석촌호수", data:data.map(d=>d["석촌호수"]), borderColor:"#f59e0b",backgroundColor:"rgba(245,158,11,0.08)",tension:0.4,pointRadius:3,borderWidth:2,fill:true},
        {label:"잠실나루", data:data.map(d=>d["잠실나루"]), borderColor:"#22c55e",backgroundColor:"rgba(34,197,94,0.08)", tension:0.4,pointRadius:3,borderWidth:2,fill:true},
      ],
    },
    options:{...COPTS, scales:{
      x:{ticks:{color:TC,font:{size:11}},grid:{color:GC}},
      y:{ticks:{color:TC,font:{size:11},callback:v=>v+"km/h"},grid:{color:GC},min:0},
    }},
  }), []);
  return <div style={{position:"relative",width:"100%",height}}><canvas ref={ref} role="img" aria-label="속도 추이"/></div>;
}

function RiskBarChart({ data, height=180 }) {
  const rc = s => s>=70?"#ef4444":s>=50?"#f59e0b":"#22c55e";
  const ref = useChartJs(c => new window.Chart(c, {
    type:"bar",
    data:{
      labels:data.map(d=>d.name.length>6?d.name.slice(0,6)+"…":d.name),
      datasets:[{label:"위험도",data:data.map(d=>d.score),
        backgroundColor:data.map(d=>rc(d.score)+"55"),
        borderColor:data.map(d=>rc(d.score)),
        borderWidth:1,borderRadius:5}],
    },
    options:{...COPTS, scales:{
      x:{ticks:{color:TC,font:{size:11}},grid:{color:GC}},
      y:{ticks:{color:TC,font:{size:11}},grid:{color:GC},min:0,max:100,
         title:{display:true,text:"점",color:TC,font:{size:11}}},
    }, plugins:{...COPTS.plugins,tooltip:{...COPTS.plugins.tooltip,callbacks:{label:ctx=>`위험도: ${ctx.parsed.y}점`}}}},
  }), [JSON.stringify(data)]);
  return <div style={{position:"relative",width:"100%",height}}><canvas ref={ref} role="img" aria-label="위험도"/></div>;
}

function AccidentChart({ height=170 }) {
  const ref = useChartJs(c => new window.Chart(c, {
    type:"bar",
    data:{
      labels:ACCIDENT_DATA.labels,
      datasets:[{label:"월평균 사고",data:ACCIDENT_DATA.data,
        backgroundColor:ACCIDENT_DATA.colors.map(c=>c+"55"),
        borderColor:ACCIDENT_DATA.colors,
        borderWidth:1,borderRadius:5}],
    },
    options:{...COPTS, scales:{
      x:{ticks:{color:TC,font:{size:11}},grid:{color:GC}},
      y:{ticks:{color:TC,font:{size:11}},grid:{color:GC},
         title:{display:true,text:"건",color:TC,font:{size:11}}},
    }, plugins:{...COPTS.plugins,tooltip:{...COPTS.plugins.tooltip,callbacks:{label:ctx=>`월평균: ${ctx.parsed.y}건`}}}},
  }), []);
  return <div style={{position:"relative",width:"100%",height}}><canvas ref={ref} role="img" aria-label="날씨별 사고"/></div>;
}

function WaitChart({ data, height=180 }) {
  const ref = useChartJs(c => new window.Chart(c, {
    type:"bar",
    data:{
      labels:data.map(d=>d.name.length>6?d.name.slice(0,6)+"…":d.name),
      datasets:[{label:"평균 대기",data:data.map(d=>d.wait),
        backgroundColor:"rgba(59,130,246,0.4)",
        borderColor:"#3b82f6",borderWidth:1,borderRadius:5}],
    },
    options:{...COPTS, indexAxis:"y", scales:{
      x:{ticks:{color:TC,font:{size:11},callback:v=>v+"초"},grid:{color:GC}},
      y:{ticks:{color:TC,font:{size:11}},grid:{color:GC}},
    }, plugins:{...COPTS.plugins,tooltip:{...COPTS.plugins.tooltip,callbacks:{label:ctx=>`대기: ${ctx.parsed.x}초`}}}},
  }), [JSON.stringify(data)]);
  return <div style={{position:"relative",width:"100%",height}}><canvas ref={ref} role="img" aria-label="대기시간"/></div>;
}

function Card({ title, badge, badgeColor="#3b82f6", children, style={} }) {
  return (
    <div style={{background:"rgba(14,20,36,0.9)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:"16px 18px",display:"flex",flexDirection:"column",gap:10,...style}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{fontSize:15,fontWeight:700,color:"#e2e8f0"}}>{title}</div>
        {badge&&<span style={{fontSize:11,padding:"2px 9px",borderRadius:20,background:badgeColor+"22",color:badgeColor,border:`1px solid ${badgeColor}44`,fontWeight:600}}>{badge}</span>}
      </div>
      {children}
    </div>
  );
}

/* ── 메인 대시보드 ── */
export default function MainDashboard({ onGoMap, wsData }) {
  const [time, setTime] = useState(new Date());
  const [selectedGu, setSelectedGu] = useState(GU_LIST.find(g => g.name === "송파구"));
  const [loading, setLoading] = useState(false);
  const [fetchMsg, setFetchMsg] = useState(null);

  useEffect(()=>{const t=setInterval(()=>setTime(new Date()),1000);return()=>clearInterval(t);},[]);

  // 구 클릭 → /api/fetch-area 호출
  const handleSelectGu = useCallback(async (gu) => {
    setSelectedGu(gu);
    setLoading(true);
    setFetchMsg(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/fetch-area?lat=${gu.lat}&lon=${gu.lon}&radius=2.5`,
        { method: "POST" }
      );
      const data = await res.json();
      setFetchMsg(`${gu.name} · ${data.count ?? 0}개 교차로 수집됨`);
    } catch {
      setFetchMsg(`${gu.name} 데이터 수집 실패`);
    } finally {
      setLoading(false);
      setTimeout(() => setFetchMsg(null), 3000);
    }
  }, []);

  // 선택된 구 기준 2.5km 반경 필터
  const guData = selectedGu
    ? wsData.filter(c => c.lat && c.lon && calcDistKm(c.lat, c.lon, selectedGu.lat, selectedGu.lon) <= 2.5)
    : wsData;

  const activeData = guData.length > 0 ? guData : wsData;

  const riskData  = activeData.length>0 ? activeData.map(c=>({name:c.crsrdNm,score:c.riskScore??0})).sort((a,b)=>b.score-a.score).slice(0,6) : RISK_MOCK;
  const waitData  = activeData.length>0 ? activeData.map(c=>({name:c.crsrdNm,wait:c.avgWait??0})).sort((a,b)=>b.wait-a.wait).slice(0,6) : WAIT_MOCK;
  const isLive    = wsData.length>0;
  const avgSpeed  = activeData.length ? Math.round(activeData.reduce((a,c)=>a+(c.speed??30),0)/activeData.length) : 24;
  const highRisk  = activeData.length ? activeData.filter(c=>(c.riskScore??0)>=70).length : 1;
  const avgWait   = waitData.length ? Math.round(waitData.reduce((a,c)=>a+c.wait,0)/waitData.length) : 42;
  const maxRisk   = riskData[0]?.score??85;
  const guLabel   = selectedGu ? `${selectedGu.name} 반경 2.5km` : "잠실역 반경 1km";

  return (
    <div style={{fontFamily:"'Noto Sans KR','Malgun Gothic',sans-serif",background:"#070c17",color:"#e2e8f0",minHeight:"100vh",display:"flex",flexDirection:"column",overflowY:"auto"}}>

      {/* 헤더 */}
      <div style={{background:"rgba(7,12,23,0.98)",borderBottom:"1px solid rgba(255,255,255,0.08)",padding:"0 24px",height:58,display:"flex",alignItems:"center",gap:16,flexShrink:0,position:"sticky",top:0,zIndex:100}}>
        <span style={{fontSize:22}}>🚦</span>
        <div>
          <div style={{fontWeight:700,fontSize:17,color:"#60a5fa"}}>Traffic-Sync 관제 시스템</div>
          <div style={{fontSize:11,color:"#475569"}}>V2X 공공 API 기반 실시간 교통 관제 플랫폼</div>
        </div>
        <div style={{marginLeft:20,display:"flex",gap:6}}>
          {[["📊 통합 대시보드",false],["🗺️ 실시간 지도",true],["📈 통계/이력",false]].map(([m,isMap])=>(
            <div key={m} onClick={isMap ? () => onGoMap(selectedGu) : undefined}
              style={{padding:"5px 14px",borderRadius:6,fontSize:13,fontWeight:600,cursor:isMap?"pointer":"default",
                background:!isMap&&m.includes("통합")?"#1d4ed8":"transparent",
                color:!isMap&&m.includes("통합")?"#fff":"#64748b",
                border:`1px solid ${!isMap&&m.includes("통합")?"#1d4ed8":"rgba(255,255,255,0.08)"}`,
                transition:"all .15s"}}
              onMouseEnter={e=>{if(isMap)e.currentTarget.style.color="#60a5fa";}}
              onMouseLeave={e=>{if(isMap)e.currentTarget.style.color="#64748b";}}
            >{m}</div>
          ))}
        </div>

        {/* 선택된 구 표시 + fetch 메시지 */}
        {selectedGu && (
          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"4px 12px", borderRadius:20, background:"rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.3)" }}>
            <span style={{ width:7, height:7, borderRadius:"50%", background:"#f59e0b", display:"inline-block" }}/>
            <span style={{ fontSize:12, color:"#fde68a", fontWeight:600 }}>{selectedGu.name} 선택됨</span>
          </div>
        )}
        {fetchMsg && (
          <div style={{ fontSize:12, color:"#22c55e", padding:"3px 10px", borderRadius:4, border:"1px solid rgba(34,197,94,0.3)", background:"rgba(34,197,94,0.07)" }}>
            ✓ {fetchMsg}
          </div>
        )}

        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:16}}>
          {isLive&&<div style={{fontSize:12,color:"#22c55e",border:"1px solid rgba(34,197,94,0.3)",padding:"2px 10px",borderRadius:4,fontWeight:600}}>● LIVE · V2X 연결됨</div>}
          <div style={{fontSize:13,color:"#64748b"}}>
            {time.toLocaleDateString("ko-KR",{year:"numeric",month:"short",day:"numeric",weekday:"short"})}
            &nbsp;<span style={{color:"#94a3b8",fontFamily:"monospace",fontWeight:600}}>{time.toLocaleTimeString("ko-KR")}</span>
          </div>
        </div>
      </div>

      {/* 상단 KPI 카드 */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,padding:"16px 24px 0"}}>
        {[
          {label:"모니터링 교차로", value:activeData.length||wsData.length||5, unit:"개",   color:"#60a5fa", sub:guLabel},
          {label:"위험 교차로",     value:highRisk,                             unit:"개",   color:"#ef4444", sub:"위험도 70점 이상"},
          {label:"현재 평균 속도",  value:avgSpeed,                             unit:"km/h", color:"#22c55e", sub:"전 교차로 추정"},
          {label:"최고 위험도",     value:maxRisk,                              unit:"점",   color:maxRisk>=70?"#ef4444":maxRisk>=50?"#f59e0b":"#22c55e", sub:riskData[0]?.name||"-"},
        ].map(s=>(
          <div key={s.label} style={{background:"rgba(14,20,36,0.9)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:"16px 20px",textAlign:"center"}}>
            <div style={{fontSize:34,fontWeight:700,color:s.color,fontFamily:"monospace",lineHeight:1}}>{s.value}<span style={{fontSize:18,marginLeft:3}}>{s.unit}</span></div>
            <div style={{fontSize:14,color:"#94a3b8",marginTop:8}}>{s.label}</div>
            <div style={{fontSize:12,color:"#475569",marginTop:3}}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* 메인 그리드 */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gridTemplateRows:"auto auto",gap:14,padding:"14px 24px"}}>

        {/* 속도 추이 */}
        <Card title="📈 시간대별 구간 속도 추이" badge="참고용" style={{gridColumn:"1/3"}}>
          <div style={{display:"flex",gap:12}}>
            {[["#ef4444","잠실역"],["#f59e0b","석촌호수"],["#22c55e","잠실나루"]].map(([c,l])=>(
              <div key={l} style={{display:"flex",alignItems:"center",gap:5}}>
                <div style={{width:12,height:3,background:c,borderRadius:2}}/><span style={{fontSize:12,color:"#94a3b8"}}>{l}</span>
              </div>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
            {[["잠실역","#ef4444",9,22],["석촌호수","#f59e0b",15,32],["잠실나루","#22c55e",22,42]].map(([name,c,mn,mx])=>(
              <div key={name} style={{background:"rgba(0,0,0,0.3)",borderRadius:8,padding:"10px 14px",borderLeft:`3px solid ${c}`}}>
                <div style={{fontSize:13,color:"#94a3b8"}}>{name}</div>
                <div style={{fontSize:20,fontWeight:700,color:c,marginTop:4}}>{mn}~{mx}<span style={{fontSize:13}}> km/h</span></div>
              </div>
            ))}
          </div>
          <SpeedChart data={SPEED_TREND} height={170}/>
        </Card>

        {/* 서울 SVG 지도 — 구 클릭 가능 */}
        <Card title="🗺️ 서울 교통 현황" style={{gridColumn:"3/4",gridRow:"1/3"}}>
          <div style={{flex:1,minHeight:0,height:480}}>
            <SeoulSvgMap
              onGoMap={onGoMap}
              selectedGu={selectedGu}
              onSelectGu={handleSelectGu}
              loading={loading}
            />
          </div>
        </Card>

        {/* 위험도 */}
        <Card title="🔴 교차로별 AI 위험도" badge={isLive?"실시간":"참고값"} badgeColor={isLive?"#22c55e":"#f59e0b"}>
          <div style={{display:"flex",gap:8}}>
            {riskData.slice(0,3).map((d,i)=>(
              <div key={d.name} style={{flex:1,background:"rgba(0,0,0,0.3)",borderRadius:8,padding:"10px 10px",borderTop:`2px solid ${d.score>=70?"#ef4444":d.score>=50?"#f59e0b":"#22c55e"}`}}>
                <div style={{fontSize:12,color:"#64748b"}}>#{i+1}</div>
                <div style={{fontSize:11,color:"#94a3b8",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</div>
                <div style={{fontSize:22,fontWeight:700,color:d.score>=70?"#ef4444":d.score>=50?"#f59e0b":"#22c55e",marginTop:2}}>{d.score}<span style={{fontSize:12}}>점</span></div>
              </div>
            ))}
          </div>
          <RiskBarChart data={riskData} height={150}/>
        </Card>

        {/* 날씨별 사고 */}
        <Card title="🌦️ 날씨별 월평균 사고 건수" badge="TAAS 기반">
          <div style={{background:"rgba(139,92,246,0.1)",border:"1px solid rgba(139,92,246,0.25)",borderRadius:8,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:13,color:"#94a3b8"}}>가장 위험한 날씨</div>
              <div style={{fontSize:16,fontWeight:700,color:"#a78bfa",marginTop:3}}>❄️ 눈 · 월평균 4.2건</div>
            </div>
            <div style={{fontSize:30,fontWeight:700,color:"#8b5cf6"}}>4.2<span style={{fontSize:14}}>건</span></div>
          </div>
          <AccidentChart height={145}/>
        </Card>

      </div>

      {/* 대기시간 */}
      <div style={{padding:"0 24px 24px"}}>
        <Card title="⏱️ 교차로별 평균 신호 대기시간" badge={isLive?"실시간":"참고값"} badgeColor={isLive?"#22c55e":"#f59e0b"}>
          <div style={{display:"grid",gridTemplateColumns:"auto 1fr",gap:20,alignItems:"center"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,minWidth:260}}>
              {[
                {label:"최대 대기",value:waitData[0]?.wait??72, sub:waitData[0]?.name??"잠실역",color:"#ef4444"},
                {label:"최소 대기",value:waitData[waitData.length-1]?.wait??14,sub:waitData[waitData.length-1]?.name??"롯데타워",color:"#22c55e"},
              ].map(s=>(
                <div key={s.label} style={{background:`rgba(${s.color==="#ef4444"?"239,68,68":"34,197,94"},0.1)`,border:`1px solid ${s.color}33`,borderRadius:10,padding:"14px",textAlign:"center"}}>
                  <div style={{fontSize:13,color:"#94a3b8"}}>{s.label}</div>
                  <div style={{fontSize:30,fontWeight:700,color:s.color,marginTop:6}}>{s.value}<span style={{fontSize:15}}>초</span></div>
                  <div style={{fontSize:12,color:"#64748b",marginTop:4}}>{s.sub}</div>
                </div>
              ))}
              <div style={{background:"rgba(59,130,246,0.1)",border:"1px solid rgba(59,130,246,0.25)",borderRadius:10,padding:"14px",textAlign:"center",gridColumn:"1/3"}}>
                <div style={{fontSize:13,color:"#94a3b8"}}>전체 평균 대기</div>
                <div style={{fontSize:34,fontWeight:700,color:"#3b82f6",marginTop:6}}>{avgWait}<span style={{fontSize:17}}>초</span></div>
              </div>
            </div>
            <WaitChart data={waitData} height={180}/>
          </div>
        </Card>
      </div>
    </div>
  );
}
