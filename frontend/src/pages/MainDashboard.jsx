import { useState, useEffect, useRef } from "react";

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

/* ── 서울 25개 자치구 중심 좌표 (SVG 내부 상대좌표로 변환용) ── */
// viewBox 0 0 400 400 기준, 위경도 → SVG 좌표 변환
// 서울 위경도 범위: lat 37.42~37.70, lon 126.76~127.18
const LON_MIN=126.76, LON_MAX=127.18, LAT_MIN=37.42, LAT_MAX=37.70;
const W=400, H=400;
const toSvg=(lat,lon)=>[(lon-LON_MIN)/(LON_MAX-LON_MIN)*W, (1-(lat-LAT_MIN)/(LAT_MAX-LAT_MIN))*H];

const GU_LIST = [
  {name:"종로구",lat:37.5920,lon:126.9770},
  {name:"중구",  lat:37.5641,lon:126.9979},
  {name:"용산구",lat:37.5340,lon:126.9900},
  {name:"성동구",lat:37.5636,lon:127.0369},
  {name:"광진구",lat:37.5384,lon:127.0822},
  {name:"동대문구",lat:37.5744,lon:127.0396},
  {name:"중랑구",lat:37.6063,lon:127.0927},
  {name:"성북구",lat:37.6066,lon:127.0176},
  {name:"강북구",lat:37.6397,lon:127.0257},
  {name:"도봉구",lat:37.6688,lon:127.0471},
  {name:"노원구",lat:37.6542,lon:127.0568},
  {name:"은평구",lat:37.6177,lon:126.9227},
  {name:"서대문구",lat:37.5794,lon:126.9368},
  {name:"마포구",lat:37.5663,lon:126.9014},
  {name:"양천구",lat:37.5170,lon:126.8665},
  {name:"강서구",lat:37.5509,lon:126.8497},
  {name:"구로구",lat:37.4955,lon:126.8876},
  {name:"금천구",lat:37.4600,lon:126.9001},
  {name:"영등포구",lat:37.5263,lon:126.8963},
  {name:"동작구",lat:37.5124,lon:126.9393},
  {name:"관악구",lat:37.4784,lon:126.9516},
  {name:"서초구",lat:37.4837,lon:127.0324},
  {name:"강남구",lat:37.4979,lon:127.0577},
  {name:"송파구",lat:37.5145,lon:127.1059},  // ← 잠실 포함
  {name:"강동구",lat:37.5301,lon:127.1238},
];

// 서울 외곽선 SVG path (단순화된 실제 경계 근사값)
const SEOUL_PATH = `
M 185 18
L 210 22 L 235 28 L 252 35 L 265 30 L 282 38 L 295 48 L 308 52
L 322 55 L 335 65 L 342 80 L 348 95 L 355 108 L 360 125
L 355 140 L 358 158 L 362 172 L 358 185 L 352 195
L 342 205 L 338 218 L 330 228 L 320 238 L 308 248
L 295 260 L 280 268 L 265 275 L 250 280 L 235 285
L 218 288 L 200 290 L 182 288 L 165 283 L 148 275
L 132 265 L 118 252 L 106 238 L 95 222 L 86 205
L 80 188 L 76 172 L 72 155 L 70 138 L 68 120
L 70 102 L 75 88 L 82 74 L 92 62 L 104 52
L 118 44 L 132 36 L 148 28 L 165 22 Z
`;

// 한강 path (서울 내부 가로로 흐르는 강)
const HANGANG_PATH = `
M 72 195 Q 100 188 130 190 Q 160 192 185 188 Q 210 184 240 186 Q 268 188 295 182 Q 320 176 348 175
L 352 183 Q 322 186 295 192 Q 268 198 240 196 Q 210 194 185 198 Q 160 202 130 200 Q 100 198 72 205 Z
`;

/* ──────────────────────────────────────────
   서울 SVG 지도 (클릭 → 지도 페이지 이동)
──────────────────────────────────────────── */
function SeoulSvgMap({ onClick, wsData }) {
  const [hovered, setHovered] = useState(null);
  const [pulse, setPulse] = useState(0);

  // 잠실 위치
  const [jx, jy] = toSvg(37.5133, 127.1002);

  useEffect(() => {
    const t = setInterval(() => setPulse(p => (p + 1) % 100), 60);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative", width: "100%", height: "100%",
        cursor: "pointer", userSelect: "none",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}
    >
      <svg
        viewBox="50 10 320 295"
        style={{ width: "100%", height: "90%", maxHeight: 340, filter: hovered ? "brightness(1.15)" : "brightness(1)", transition: "filter .2s" }}
      >
        <defs>
          <radialGradient id="seoulGrad" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#1e3a8a" stopOpacity="0.9"/>
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0.95"/>
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2.5" result="blur"/>
            <feComposite in="SourceGraphic" in2="blur" operator="over"/>
          </filter>
          <filter id="softglow">
            <feGaussianBlur stdDeviation="4" result="blur"/>
            <feComposite in="SourceGraphic" in2="blur" operator="over"/>
          </filter>
        </defs>

        {/* 배경 */}
        <rect x="50" y="10" width="320" height="295" fill="#070c17" rx="8"/>

        {/* 서울 외곽 (글로우 효과) */}
        <path d={SEOUL_PATH} fill="rgba(30,58,138,0.15)" stroke="#1d4ed8" strokeWidth="3" filter="url(#glow)" opacity="0.6"/>
        {/* 서울 외곽 메인 */}
        <path d={SEOUL_PATH} fill="url(#seoulGrad)" stroke="#3b82f6" strokeWidth="1.5" opacity="0.9"/>

        {/* 한강 */}
        <path d={HANGANG_PATH} fill="#0ea5e9" opacity="0.25"/>
        <text x="210" y="193" fontSize="9" fill="#38bdf8" opacity="0.7" fontFamily="Malgun Gothic,sans-serif">한 강</text>

        {/* 자치구 이름 + 점 */}
        {GU_LIST.map(gu => {
          const [x, y] = toSvg(gu.lat, gu.lon);
          if (x < 55 || x > 365 || y < 15 || y > 300) return null;
          const isJamsil = gu.name === "송파구";
          return (
            <g key={gu.name}>
              <circle cx={x} cy={y} r={isJamsil ? 4 : 2}
                fill={isJamsil ? "#ef4444" : "#60a5fa"} opacity={isJamsil ? 1 : 0.6}/>
              <text x={x} y={y - 5} fontSize={isJamsil ? 9 : 7.5}
                fill={isJamsil ? "#fca5a5" : "#93c5fd"} opacity={isJamsil ? 1 : 0.75}
                textAnchor="middle" fontFamily="Malgun Gothic,sans-serif" fontWeight={isJamsil?"700":"400"}>
                {gu.name}
              </text>
            </g>
          );
        })}

        {/* 잠실역 펄스 마커 */}
        <circle cx={jx} cy={jy} r={12 + (pulse % 20) * 0.5} fill="none" stroke="#ef4444" strokeWidth="1" opacity={0.4 - (pulse % 20) * 0.02}/>
        <circle cx={jx} cy={jy} r={7} fill="#ef4444" opacity="0.9"/>
        <circle cx={jx} cy={jy} r={3.5} fill="#fff"/>
        <text x={jx + 10} y={jy - 8} fontSize="9" fill="#fca5a5" fontFamily="Malgun Gothic,sans-serif" fontWeight="700">잠실역</text>

        {/* 호버시 클릭 유도 텍스트 */}
        {hovered && (
          <g>
            <rect x="115" y="255" width="190" height="28" rx="6" fill="rgba(29,78,216,0.85)" stroke="rgba(96,165,250,0.6)" strokeWidth="1"/>
            <text x="210" y="273" fontSize="12" fill="#fff" textAnchor="middle" fontFamily="Malgun Gothic,sans-serif" fontWeight="700">
              🗺️ 실시간 교차로 지도 보기 →
            </text>
          </g>
        )}
      </svg>

      {/* 하단 상태 요약 */}
      <div style={{display:"flex", gap:16, justifyContent:"center", marginTop:6}}>
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:"#22c55e"}}/>
          <span style={{fontSize:12,color:"#94a3b8"}}>원활 {wsData.filter(c=>c.congestion==="원활").length||3}개</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:"#f59e0b"}}/>
          <span style={{fontSize:12,color:"#94a3b8"}}>서행 {wsData.filter(c=>c.congestion==="서행").length||1}개</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:"#ef4444"}}/>
          <span style={{fontSize:12,color:"#94a3b8"}}>혼잡 {wsData.filter(c=>c.congestion==="혼잡").length||2}개</span>
        </div>
      </div>
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

/* ── 카드 래퍼 ── */
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
  useEffect(()=>{const t=setInterval(()=>setTime(new Date()),1000);return()=>clearInterval(t);},[]);

  const riskData  = wsData.length>0 ? wsData.map(c=>({name:c.crsrdNm,score:c.riskScore??0})).sort((a,b)=>b.score-a.score).slice(0,6) : RISK_MOCK;
  const waitData  = wsData.length>0 ? wsData.map(c=>({name:c.crsrdNm,wait:c.avgWait??0})).sort((a,b)=>b.wait-a.wait).slice(0,6) : WAIT_MOCK;
  const isLive    = wsData.length>0;
  const avgSpeed  = wsData.length ? Math.round(wsData.reduce((a,c)=>a+(c.speed??30),0)/wsData.length) : 24;
  const highRisk  = wsData.length ? wsData.filter(c=>(c.riskScore??0)>=70).length : 1;
  const avgWait   = waitData.length ? Math.round(waitData.reduce((a,c)=>a+c.wait,0)/waitData.length) : 42;
  const maxRisk   = riskData[0]?.score??85;

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
            <div key={m} onClick={isMap?onGoMap:undefined}
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
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:16}}>
          {isLive&&<div style={{fontSize:12,color:"#22c55e",border:"1px solid rgba(34,197,94,0.3)",padding:"2px 10px",borderRadius:4,fontWeight:600}}>● LIVE · V2X 연결됨</div>}
          <div style={{fontSize:13,color:"#64748b"}}>
            {time.toLocaleDateString("ko-KR",{year:"numeric",month:"short",day:"numeric",weekday:"short"})}
            &nbsp;<span style={{color:"#94a3b8",fontFamily:"monospace",fontWeight:600}}>{time.toLocaleTimeString("ko-KR")}</span>
          </div>
        </div>
      </div>

      {/* 상단 통계 카드 */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,padding:"16px 24px 0"}}>
        {[
          {label:"모니터링 교차로", value:wsData.length||5,  unit:"개",   color:"#60a5fa", sub:"잠실역 반경 1km"},
          {label:"위험 교차로",     value:highRisk,           unit:"개",   color:"#ef4444", sub:"위험도 70점 이상"},
          {label:"현재 평균 속도",  value:avgSpeed,           unit:"km/h", color:"#22c55e", sub:"전 교차로 추정"},
          {label:"최고 위험도",     value:maxRisk,            unit:"점",   color:maxRisk>=70?"#ef4444":maxRisk>=50?"#f59e0b":"#22c55e", sub:riskData[0]?.name||"-"},
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

        {/* 속도 추이 (2칸) */}
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

        {/* 서울 SVG 지도 (2행) */}
        <Card title="🗺️ 서울 교통 현황" badge="클릭 → 실시간 지도" badgeColor="#22c55e" style={{gridColumn:"3/4",gridRow:"1/3",cursor:"pointer"}} >
          <div style={{flex:1,minHeight:0,height:380}}>
            <SeoulSvgMap onClick={onGoMap} wsData={wsData}/>
          </div>
          {/* 잠실 집중 분석 */}
          <div style={{background:"rgba(29,78,216,0.1)",border:"1px solid rgba(59,130,246,0.25)",borderRadius:9,padding:"12px 14px"}}>
            <div style={{fontSize:12,color:"#94a3b8",marginBottom:6,fontWeight:600}}>📍 잠실역 권역 현황</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:22,fontWeight:700,color:"#22c55e"}}>{wsData.filter(c=>c.congestion==="원활").length||3}<span style={{fontSize:13}}> 개</span></div>
                <div style={{fontSize:12,color:"#94a3b8"}}>원활</div>
              </div>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:22,fontWeight:700,color:"#ef4444"}}>{wsData.filter(c=>c.congestion==="혼잡").length||2}<span style={{fontSize:13}}> 개</span></div>
                <div style={{fontSize:12,color:"#94a3b8"}}>혼잡</div>
              </div>
            </div>
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

      {/* 대기시간 (하단 전체) */}
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