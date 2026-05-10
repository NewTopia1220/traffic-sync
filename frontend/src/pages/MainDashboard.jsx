import { useState, useEffect, useCallback } from "react";
import { GU_LIST, calcDistKm } from "../constants/seoulGeoData";
import { SPEED_TREND, RISK_MOCK, WAIT_MOCK } from "../constants/dashboardData";
import SeoulSvgMap from "../components/map/SeoulSvgMap";
import SpeedChart from "../components/charts/SpeedChart";
import RiskBarChart from "../components/charts/RiskBarChart";
import AccidentChart from "../components/charts/AccidentChart";
import WaitChart from "../components/charts/WaitChart";
import Card from "../components/common/Card";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

export default function MainDashboard({ onGoMap, wsData }) {
  const [time, setTime] = useState(new Date());
  const [selectedGu, setSelectedGu] = useState(GU_LIST.find(g => g.name === "송파구"));
  const [loading, setLoading] = useState(false);
  const [fetchMsg, setFetchMsg] = useState(null);

  useEffect(()=>{const t=setInterval(()=>setTime(new Date()),1000);return()=>clearInterval(t);},[]);

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

  const guData = selectedGu
    ? wsData.filter(c => c.lat && c.lon && calcDistKm(c.lat, c.lon, selectedGu.lat, selectedGu.lon) <= 2.5)
    : wsData;

  const activeData = guData.length > 0 ? guData : wsData;

  const riskData = activeData.length>0 ? activeData.map(c=>({name:c.crsrdNm,score:c.riskScore??0})).sort((a,b)=>b.score-a.score).slice(0,6) : RISK_MOCK;
  const waitData = activeData.length>0 ? activeData.map(c=>({name:c.crsrdNm,wait:c.avgWait??0})).sort((a,b)=>b.wait-a.wait).slice(0,6) : WAIT_MOCK;
  const isLive   = wsData.length>0;
  const avgSpeed = activeData.length ? Math.round(activeData.reduce((a,c)=>a+(c.speed??30),0)/activeData.length) : 24;
  const highRisk = activeData.length ? activeData.filter(c=>(c.riskScore??0)>=70).length : 1;
  const avgWait  = waitData.length ? Math.round(waitData.reduce((a,c)=>a+c.wait,0)/waitData.length) : 42;
  const maxRisk  = riskData[0]?.score??85;
  const guLabel  = selectedGu ? `${selectedGu.name} 반경 2.5km` : "잠실역 반경 1km";

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

        {/* 서울 SVG 지도 */}
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
