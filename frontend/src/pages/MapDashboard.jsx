import { useState, useEffect, useRef, useCallback } from "react";

const JAMSIL_LAT = 37.5133;
const JAMSIL_LON = 127.1002;

const AI_RESPONSES = {
  default:[{role:"ai",text:"현재 우천+퇴근시간 위험도 높음.\n북쪽 신호 15초 연장을 권고합니다."}],
  "신호 최적화":[{role:"ai",text:"북향 직진 신호 15초 연장, 좌회전 페이즈 2단계 분리 시 평균 대기 22% 감소 예측됩니다."}],
  "위험도 분석":[{role:"ai",text:"위험 원인: ①우천 노면 마찰계수 저하 ②퇴근 피크 중첩 ③북향 교통량 +34%. 즉각 대응 권고."}],
  "우회로 제안":[{role:"ai",text:"추천: 잠실나루역→올림픽대로 동측→석촌호수 남로. 정체 대비 8분 절약 가능."}],
};

/* ── 유틸 ── */
const DIR_MAP={nt:"north",et:"east",st:"south",wt:"west",ne:"northeast",se:"southeast",sw:"southwest",nw:"northwest"};
const mapKeys=raw=>raw?Object.fromEntries(Object.entries(raw).map(([k,v])=>[DIR_MAP[k]||k,v])):{};
const statusCls=st=>{if(!st)return"gray";const s=st.toLowerCase();if(s.includes("movement-allowed"))return"green";if(s.includes("stop"))return"red";return"gray";};
const domColor=signals=>{if(!signals)return"#6b7280";let g=0,r=0;Object.values(signals).forEach(d=>{["stsg","ltsg","pdsg"].forEach(k=>{const c=statusCls(d?.[k]?.status);if(c==="green")g++;else if(c==="red")r++;});});if(g>0&&r>0)return"#f59e0b";if(g>0)return"#22c55e";if(r>0)return"#ef4444";return"#6b7280";};
const calcRisk=signals=>{if(!signals)return 0;let tr=0,ts=0,lw=0;Object.values(signals).forEach(d=>{["stsg","ltsg","pdsg"].forEach(k=>{const s=d?.[k];if(!s)return;ts++;if(statusCls(s.status)==="red"){tr++;if(s.rmndCs>300)lw++;}});});return ts?Math.min(99,Math.round((tr/ts)*60+lw*8)):0;};
const calcCong=signals=>{if(!signals)return"알 수 없음";let sum=0,cnt=0;Object.values(signals).forEach(d=>{if(!d?.stsg)return;if(statusCls(d.stsg.status)==="red"){sum+=d.stsg.rmndCs/10;cnt++;}});if(!cnt)return"원활";const avg=sum/cnt;return avg>60?"혼잡":avg>30?"서행":"원활";};
const calcWait=signals=>{if(!signals)return 0;let s=0,c=0;Object.values(signals).forEach(d=>{if(!d?.stsg)return;s+=d.stsg.rmndCs/10;c++;});return c?Math.round(s/c):0;};
const congColor=c=>c==="혼잡"?"#ef4444":c==="서행"?"#f59e0b":"#22c55e";
const riskColor=s=>s>=70?"#ef4444":s>=50?"#f59e0b":"#22c55e";
const riskLabel=s=>s>=70?"높음":s>=50?"보통":"낮음";

/* ── 신호 오버레이 ── */
function SignalBadge({signal,label}){
  if(!signal)return null;
  const cls=statusCls(signal.status);
  const color=cls==="green"?"#22c55e":cls==="red"?"#ef4444":"#6b7280";
  return(
    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
      <div style={{width:8,height:8,borderRadius:"50%",background:color,flexShrink:0,boxShadow:`0 0 5px ${color}`}}/>
      <span style={{fontSize:12,color:"#94a3b8",width:36}}>{label}</span>
      <span style={{fontSize:13,fontWeight:600,color,fontFamily:"monospace"}}>{(signal.rmndCs/10).toFixed(1)}s</span>
    </div>
  );
}
function DirBox({dir,label,signals}){
  const d=signals?.[dir];
  return(
    <div style={{background:d?"rgba(30,38,55,0.9)":"rgba(20,26,40,0.4)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:8,padding:"9px 11px",minWidth:88,opacity:d?1:0.4}}>
      <div style={{fontSize:11,color:"#60a5fa",fontWeight:700,marginBottom:6}}>{label}</div>
      {d?(<><SignalBadge signal={d.stsg} label="직진"/><SignalBadge signal={d.ltsg} label="좌회전"/><SignalBadge signal={d.pdsg} label="보행"/></>):<div style={{fontSize:11,color:"#374151"}}>-</div>}
    </div>
  );
}
function SignalPanel({cr}){
  const s=cr.mappedSignals||{};
  const t=cr.totDt;
  const ts=t?`${t.slice(0,4)}-${t.slice(4,6)}-${t.slice(6,8)} ${t.slice(8,10)}:${t.slice(10,12)}`:"-";
  return(
    <div>
      <div style={{fontSize:11,color:"#475569",marginBottom:8}}>API 수집: {ts}</div>
      <div style={{display:"grid",gridTemplateAreas:'". north ." "west center east" ". south ."',gridTemplateColumns:"1fr 116px 1fr",gap:6}}>
        <div style={{gridArea:"north"}}><DirBox dir="north" label="↑ 북" signals={s}/></div>
        <div style={{gridArea:"west"}}><DirBox dir="west" label="← 서" signals={s}/></div>
        <div style={{gridArea:"center",background:"rgba(15,22,36,0.95)",border:"1px solid #1d4ed8",borderRadius:10,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"10px 6px",textAlign:"center"}}>
          <div style={{fontSize:11,color:"#60a5fa",fontWeight:700,lineHeight:1.4}}>{cr.crsrdNm}</div>
          <div style={{fontSize:10,color:"#6b7280",marginTop:3}}>{cr.crsrdId}</div>
          <div style={{marginTop:8,width:34,height:34,borderRadius:"50%",background:`conic-gradient(${riskColor(cr.riskScore)} ${cr.riskScore}%,#1f2937 0)`,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{width:26,height:26,borderRadius:"50%",background:"#0f1624",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:riskColor(cr.riskScore)}}>{cr.riskScore}</div>
          </div>
        </div>
        <div style={{gridArea:"east"}}><DirBox dir="east" label="→ 동" signals={s}/></div>
        <div style={{gridArea:"south"}}><DirBox dir="south" label="↓ 남" signals={s}/></div>
      </div>
    </div>
  );
}

/* ── 카카오맵 (다크 + 클러스터) ── */
function KakaoMapView({crossroads,selected,onSelect}){
  const mapRef=useRef(null);
  const mapObj=useRef(null);
  const overlays=useRef({});
  const clusterer=useRef(null);
  const [ready,setReady]=useState(false);
  const [zoom,setZoom]=useState(4);

  useEffect(()=>{
    const KEY=import.meta.env.VITE_KAKAO_APP_KEY;
    if(window.kakao?.maps){setReady(true);return;}
    if(document.querySelector("script[data-kakao]")){
      const id=setInterval(()=>{if(window.kakao?.maps){clearInterval(id);setReady(true);}},100);return;
    }
    const s=document.createElement("script");
    s.src=`//dapi.kakao.com/v2/maps/sdk.js?appkey=${KEY}&libraries=clusterer&autoload=false`;
    s.setAttribute("data-kakao","1");
    s.onload=()=>window.kakao.maps.load(()=>setReady(true));
    document.head.appendChild(s);
  },[]);

  // 지도 초기화 + 다크 스타일
  useEffect(()=>{
    if(!ready||!mapRef.current)return;
    const kakao=window.kakao;
    const map=new kakao.maps.Map(mapRef.current,{
      center:new kakao.maps.LatLng(JAMSIL_LAT,JAMSIL_LON), level:4
    });
    mapObj.current=map;

    // 다크 오버레이 (지도 위에 반투명 어두운 레이어)
    // 카카오맵은 커스텀 스타일 미지원 → CSS 필터로 처리
    mapRef.current.style.filter="invert(90%) hue-rotate(180deg) brightness(0.85) saturate(0.9)";

    // 줌 변경 감지
    kakao.maps.event.addListener(map,"zoom_changed",()=>setZoom(map.getLevel()));

    // 마커 클러스터러
    clusterer.current=new kakao.maps.MarkerClusterer({
      map, averageCenter:true, minLevel:5,
      styles:[{
        width:"42px",height:"42px",
        background:"rgba(29,78,216,0.85)",
        borderRadius:"50%",
        border:"2px solid rgba(96,165,250,0.8)",
        color:"#fff",
        fontSize:"14px",
        fontWeight:"700",
        lineHeight:"42px",
        textAlign:"center",
      }],
    });
  },[ready]);

  // 마커/클러스터 업데이트
  useEffect(()=>{
    if(!ready||!mapObj.current)return;
    const kakao=window.kakao;

    // 기존 오버레이 제거
    Object.values(overlays.current).forEach(ov=>ov.setMap(null));
    overlays.current={};

    if(zoom>=5){
      // 줌인 → 커스텀 오버레이
      if(clusterer.current){clusterer.current.clear();}
      crossroads.forEach(cr=>{
        const pos=new kakao.maps.LatLng(cr.lat,cr.lon);
        const isSel=selected?.crsrdId===cr.crsrdId;
        const color=domColor(cr.mappedSignals);
        const content=isSel
          ?`<div style="position:relative;cursor:pointer"><div style="width:36px;height:36px;border-radius:50%;border:2px solid ${color};background:${color}33;display:flex;align-items:center;justify-content:center"><div style="width:13px;height:13px;border-radius:50%;background:${color};box-shadow:0 0 8px ${color}"></div></div><div style="position:absolute;top:-22px;left:50%;transform:translateX(-50%);background:rgba(10,16,30,0.95);border:1px solid ${color}55;border-radius:4px;padding:2px 8px;font-size:11px;color:${color};white-space:nowrap;font-weight:700;font-family:Malgun Gothic,sans-serif">${cr.crsrdNm}</div></div>`
          :`<div style="width:12px;height:12px;border-radius:50%;border:2px solid rgba(255,255,255,0.35);background:${color};box-shadow:0 0 5px ${color}88;cursor:pointer"></div>`;
        const ov=new kakao.maps.CustomOverlay({position:pos,content,zIndex:isSel?10:3,xAnchor:0.5,yAnchor:0.5});
        ov.setMap(mapObj.current);ov.__cr=cr;overlays.current[cr.crsrdId]=ov;
      });
    } else {
      // 줌아웃 → 클러스터
      if(clusterer.current){
        const markers=crossroads.map(cr=>{
          const m=new kakao.maps.Marker({position:new kakao.maps.LatLng(cr.lat,cr.lon)});
          kakao.maps.event.addListener(m,"click",()=>onSelect(cr));
          return m;
        });
        clusterer.current.addMarkers(markers);
      }
    }
  },[ready,crossroads,selected,zoom]);

  // DOM 클릭 → 교차로 선택
  useEffect(()=>{
    if(!ready||!mapRef.current)return;
    const el=mapRef.current;
    const h=e=>{Object.values(overlays.current).forEach(ov=>{const n=ov.getContent();if(typeof n==="string")return;if(n?.contains?.(e.target))onSelect(ov.__cr);});};
    el.addEventListener("click",h);
    return()=>el.removeEventListener("click",h);
  },[ready,onSelect]);

  if(!ready)return(
    <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#0a1020",gap:10}}>
      <div style={{width:28,height:28,border:"3px solid rgba(59,130,246,0.3)",borderTop:"3px solid #3b82f6",borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
      <div style={{fontSize:14,color:"#6b7280"}}>카카오맵 로딩 중...</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return(
    <div style={{position:"relative",width:"100%",height:"100%"}}>
      <div ref={mapRef} style={{width:"100%",height:"100%"}}/>
      {/* 범례 */}
      <div style={{position:"absolute",top:14,right:14,background:"rgba(8,13,26,0.9)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:9,padding:"10px 14px",zIndex:10,pointerEvents:"none"}}>
        <div style={{fontSize:12,color:"#94a3b8",fontWeight:700,marginBottom:8}}>교통 상태</div>
        {[["#22c55e","원활 (40km/h+)"],["#f59e0b","서행 (20~40km/h)"],["#ef4444","혼잡 (~20km/h)"]].map(([c,l])=>(
          <div key={l} style={{display:"flex",alignItems:"center",gap:7,marginBottom:5}}>
            <div style={{width:9,height:9,borderRadius:"50%",background:c}}/><span style={{fontSize:12,color:"#94a3b8"}}>{l}</span>
          </div>
        ))}
      </div>
      <div style={{position:"absolute",top:14,left:14,background:"rgba(8,13,26,0.85)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:7,padding:"4px 12px",fontSize:12,color:"#94a3b8",zIndex:10,pointerEvents:"none"}}>
        🗺️ 잠실역 반경 1km · V2X 실시간 · {crossroads.length}개 교차로
      </div>
      {zoom<5&&<div style={{position:"absolute",bottom:14,left:"50%",transform:"translateX(-50%)",background:"rgba(29,78,216,0.8)",border:"1px solid rgba(96,165,250,0.5)",borderRadius:7,padding:"5px 14px",fontSize:12,color:"#fff",zIndex:10,pointerEvents:"none"}}>클러스터 모드 · 확대하면 교차로별 신호 표시</div>}
    </div>
  );
}

/* ── 지도 페이지 ── */
export default function MapDashboard({onGoMain,wsData,setWsData}){
  const [time,setTime]=useState(new Date());
  const [wsStatus,setWsStatus]=useState("연결 중...");
  const [lastUpdate,setLastUpdate]=useState(null);
  const [selected,setSelected]=useState(null);
  const [chatMessages,setChatMessages]=useState(AI_RESPONSES.default);
  const [chatInput,setChatInput]=useState("");
  const [weather]=useState({icon:"🌧️",temp:"14°C",desc:"비",humidity:"78%"});
  const wsRef=useRef(null);
  const speedCache=useRef({});

  useEffect(()=>{const t=setInterval(()=>setTime(new Date()),1000);return()=>clearInterval(t);},[]);

  useEffect(()=>{
    const WS=import.meta.env.VITE_WS_URL||`ws://${window.location.hostname}:8080/ws/traffic`;
    function connect(){
      const ws=new WebSocket(WS);wsRef.current=ws;
      ws.onopen=()=>{setWsStatus("연결됨");};
      ws.onmessage=e=>{
        try{
          const list=JSON.parse(e.data);
          const proc=list.map(s=>{
            const ms=mapKeys(s.signals);
            const riskScore=calcRisk(ms);
            const congestion=calcCong(ms);
            const avgWait=calcWait(ms);
            const prev=speedCache.current[s.crsrdId];
            const base=congestion==="혼잡"?12:congestion==="서행"?27:45;
            const speed=prev?Math.max(5,Math.min(80,prev+Math.floor(Math.random()*7)-3)):base;
            speedCache.current[s.crsrdId]=speed;
            return{...s,mappedSignals:ms,riskScore,congestion,speed,avgWait};
          });
          setWsData(proc);
          setLastUpdate(new Date());
          setSelected(prev=>{
            if(!prev)return proc[0]||null;
            return proc.find(c=>c.crsrdId===prev.crsrdId)||prev;
          });
        }catch(err){console.error("WS 파싱:",err);}
      };
      ws.onclose=()=>{setWsStatus("재연결 중...");setTimeout(connect,3000);};
      ws.onerror=()=>setWsStatus("연결 오류");
    }
    connect();
    return()=>wsRef.current?.close();
  },[]);

  const selectCr=useCallback(cr=>{
    setSelected(cr);
    setChatMessages([
      {role:"ai",text:`[${cr.crsrdNm}] 선택됨.\n위험도 ${cr.riskScore}점 / ${cr.congestion} / 평균대기 ${cr.avgWait}초`},
      ...AI_RESPONSES.default,
    ]);
  },[]);

  const sendChat=useCallback(()=>{
    if(!chatInput.trim())return;
    const key=Object.keys(AI_RESPONSES).find(k=>chatInput.includes(k))||"default";
    setChatMessages(p=>[...p,{role:"user",text:chatInput},{role:"ai",text:AI_RESPONSES[key][0].text}]);
    setChatInput("");
  },[chatInput]);

  const crossroads=wsData;
  const bottlenecks=[...crossroads].filter(c=>c.congestion!=="원활").sort((a,b)=>a.speed-b.speed);
  const risks=[...crossroads].filter(c=>c.riskScore>=40).sort((a,b)=>b.riskScore-a.riskScore);
  const avgSpeed=crossroads.length?Math.round(crossroads.reduce((a,c)=>a+c.speed,0)/crossroads.length):0;
  const isConn=wsStatus==="연결됨";

  const panel=(ex={})=>({background:"rgba(14,20,36,0.9)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:10,padding:"14px 16px",...ex});

  return(
    <div style={{fontFamily:"'Noto Sans KR','Malgun Gothic',sans-serif",background:"#070c17",color:"#e2e8f0",height:"100vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>

      {/* 헤더 */}
      <div style={{background:"rgba(7,12,23,0.98)",borderBottom:"1px solid rgba(255,255,255,0.08)",padding:"0 22px",height:56,display:"flex",alignItems:"center",gap:14,flexShrink:0}}>
        <button onClick={onGoMain} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:7,padding:"5px 13px",color:"#94a3b8",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>← 대시보드</button>
        <span style={{fontSize:20}}>🚦</span>
        <div>
          <div style={{fontWeight:700,fontSize:16,color:"#60a5fa"}}>실시간 교차로 지도</div>
          <div style={{fontSize:11,color:"#475569"}}>V2X 신호 · 위험도 · 혼잡 현황</div>
        </div>
        <div style={{marginLeft:16,display:"flex",alignItems:"center",gap:6,padding:"3px 10px",borderRadius:20,border:`1px solid ${isConn?"rgba(34,197,94,0.3)":"rgba(239,68,68,0.3)"}`,background:isConn?"rgba(34,197,94,0.07)":"rgba(239,68,68,0.07)"}}>
          <span style={{width:7,height:7,borderRadius:"50%",background:isConn?"#22c55e":"#ef4444",display:"inline-block"}}/>
          <span style={{fontSize:12,color:isConn?"#22c55e":"#ef4444"}}>{wsStatus}</span>
        </div>
        {isConn&&<div style={{fontSize:12,color:"#22c55e",border:"1px solid rgba(34,197,94,0.3)",padding:"2px 9px",borderRadius:4,fontWeight:600}}>● LIVE · V2X</div>}
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:14}}>
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 12px",background:"rgba(255,255,255,0.04)",borderRadius:7,border:"1px solid rgba(255,255,255,0.06)",fontSize:13}}>
            <span>{weather.icon}</span><span style={{color:"#94a3b8"}}>{weather.desc}</span>
            <span style={{fontWeight:600}}>{weather.temp}</span>
            <span style={{fontSize:12,color:"#6b7280"}}>습도 {weather.humidity}</span>
          </div>
          <div style={{fontSize:12,color:"#6b7280"}}>갱신: <span style={{color:"#94a3b8"}}>{lastUpdate?lastUpdate.toLocaleTimeString("ko-KR"):"-"}</span></div>
          <div style={{fontSize:13,color:"#9ca3af",fontFamily:"monospace",background:"rgba(255,255,255,0.04)",padding:"3px 9px",borderRadius:5}}>{time.toLocaleTimeString("ko-KR")}</div>
        </div>
      </div>

      {/* 메인 */}
      <div style={{flex:1,display:"grid",gridTemplateColumns:"1fr 360px",minHeight:0}}>

        {/* 지도 */}
        <div style={{display:"flex",flexDirection:"column",padding:"10px 6px 10px 10px",gap:0,minHeight:0}}>
          <div style={{flex:1,position:"relative",minHeight:0,borderRadius:11,overflow:"hidden",border:"1px solid rgba(255,255,255,0.08)"}}>
            <KakaoMapView crossroads={crossroads} selected={selected} onSelect={selectCr}/>
            {crossroads.length===0&&(
              <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"rgba(7,12,23,0.75)",zIndex:30,gap:10}}>
                <div style={{fontSize:15,color:"#94a3b8"}}>V2X 데이터 수신 대기 중...</div>
                <div style={{fontSize:13,color:"#475569"}}>스프링 부트 실행 확인 (port 8080)</div>
              </div>
            )}
            {selected&&(
              <div style={{position:"absolute",bottom:14,left:14,background:"rgba(8,13,26,0.96)",border:"1px solid rgba(59,130,246,0.3)",borderRadius:12,padding:14,backdropFilter:"blur(8px)",maxWidth:430,zIndex:20}}>
                <div style={{fontSize:13,color:"#60a5fa",marginBottom:10,fontWeight:700}}>📍 {selected.crsrdNm} — 실시간 신호 현황</div>
                <SignalPanel cr={selected}/>
              </div>
            )}
          </div>
        </div>

        {/* 우측 */}
        <div style={{display:"flex",flexDirection:"column",gap:8,padding:"10px 10px 10px 4px",overflowY:"auto"}}>

          {/* 통계 */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
            {[
              {label:"교차로 수",value:crossroads.length,suffix:"개",color:"#60a5fa"},
              {label:"위험 교차로",value:crossroads.filter(c=>c.riskScore>=70).length,suffix:"개",color:"#ef4444"},
              {label:"평균 속도",value:avgSpeed,suffix:"km/h",color:"#22c55e"},
            ].map(s=>(
              <div key={s.label} style={{background:"rgba(14,20,36,0.9)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:9,padding:"12px 10px",textAlign:"center"}}>
                <div style={{fontSize:22,fontWeight:700,color:s.color,fontFamily:"monospace"}}>{s.value}<span style={{fontSize:13}}>{s.suffix}</span></div>
                <div style={{fontSize:12,color:"#6b7280",marginTop:3}}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* 병목 */}
          <div style={panel()}>
            <div style={{fontSize:14,fontWeight:700,marginBottom:10}}>🚗 실시간 병목 현황</div>
            {bottlenecks.length===0
              ?<div style={{fontSize:13,color:"#374151",textAlign:"center",padding:"10px 0"}}>{crossroads.length===0?"수신 대기 중...":"정체 없음 ✓"}</div>
              :bottlenecks.map(cr=>(
                <div key={cr.crsrdId} onClick={()=>selectCr(cr)}
                  style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",borderRadius:8,marginBottom:6,background:selected?.crsrdId===cr.crsrdId?"rgba(29,78,216,0.15)":"rgba(255,255,255,0.02)",border:`1px solid ${selected?.crsrdId===cr.crsrdId?"rgba(59,130,246,0.3)":"rgba(255,255,255,0.05)"}`,cursor:"pointer",transition:"all .15s"}}>
                  <div style={{display:"flex",alignItems:"center",gap:9}}>
                    <div style={{width:9,height:9,borderRadius:"50%",background:congColor(cr.congestion),flexShrink:0}}/>
                    <div>
                      <div style={{fontSize:13,fontWeight:600}}>{cr.crsrdNm}</div>
                      <div style={{fontSize:11,color:"#6b7280",marginTop:1}}>위험도 {cr.riskScore}점</div>
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:14,fontWeight:700,color:congColor(cr.congestion)}}>{cr.speed}km/h</div>
                    <div style={{fontSize:11,color:"#6b7280"}}>{cr.congestion}</div>
                  </div>
                </div>
              ))
            }
          </div>

          {/* 위험 도로 */}
          <div style={panel()}>
            <div style={{fontSize:14,fontWeight:700,marginBottom:10}}>⚠️ <span style={{color:"#fbbf24"}}>사고 위험 도로</span></div>
            {risks.length===0
              ?<div style={{fontSize:13,color:"#374151",textAlign:"center",padding:"10px 0"}}>{crossroads.length===0?"수신 대기 중...":"위험 없음 ✓"}</div>
              :risks.map(cr=>(
                <div key={cr.crsrdId} onClick={()=>selectCr(cr)}
                  style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",borderRadius:8,marginBottom:6,background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.05)",cursor:"pointer",transition:"all .15s"}}
                  onMouseEnter={e=>e.currentTarget.style.background="rgba(239,68,68,0.05)"}
                  onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.02)"}
                >
                  <div>
                    <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:4,background:riskColor(cr.riskScore)+"22",color:riskColor(cr.riskScore),marginRight:8}}>{riskLabel(cr.riskScore)} {cr.riskScore}점</span>
                    <span style={{fontSize:13}}>{cr.crsrdNm}</span>
                  </div>
                  <div style={{width:52,height:5,borderRadius:3,background:"#1e293b",overflow:"hidden"}}>
                    <div style={{width:`${cr.riskScore}%`,height:"100%",background:riskColor(cr.riskScore),borderRadius:3}}/>
                  </div>
                </div>
              ))
            }
          </div>

          {/* AI 챗봇 */}
          <div style={{...panel({border:"1px solid rgba(59,130,246,0.2)"}),flex:1,display:"flex",flexDirection:"column"}}>
            <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>🤖 <span style={{color:"#60a5fa"}}>AI 교통 분석 챗봇</span></div>
            {selected
              ?<div style={{fontSize:12,color:"#6b7280",marginBottom:8}}>● {selected.crsrdNm} · 위험도 {selected.riskScore}점 · 대기 {selected.avgWait}초</div>
              :<div style={{fontSize:12,color:"#374151",marginBottom:8}}>교차로를 클릭하면 분석 시작</div>
            }
            <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
              {["신호 최적화","위험도 분석","우회로 제안"].map(q=>(
                <button key={q} onClick={()=>setChatInput(q)} style={{padding:"3px 10px",fontSize:11,borderRadius:5,border:"1px solid rgba(59,130,246,0.3)",background:"rgba(29,78,216,0.1)",color:"#93c5fd",cursor:"pointer",fontFamily:"inherit"}}>{q}</button>
              ))}
            </div>
            <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:6,marginBottom:10,maxHeight:200,minHeight:80}}>
              {chatMessages.map((m,i)=>(
                <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
                  <div style={{maxWidth:"88%",padding:"8px 11px",borderRadius:m.role==="user"?"10px 10px 2px 10px":"10px 10px 10px 2px",background:m.role==="user"?"rgba(29,78,216,0.5)":"rgba(30,38,55,0.9)",border:`1px solid ${m.role==="user"?"rgba(59,130,246,0.3)":"rgba(255,255,255,0.07)"}`,fontSize:12,lineHeight:1.7,whiteSpace:"pre-line"}}>
                    {m.role==="ai"&&<div style={{fontSize:10,color:"#60a5fa",marginBottom:3,fontWeight:600}}>AI 분석</div>}
                    {m.text}
                  </div>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:6}}>
              <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendChat()} placeholder="추가 질문 입력..."
                style={{flex:1,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:7,padding:"8px 11px",color:"#e2e8f0",fontSize:13,outline:"none",fontFamily:"inherit"}}/>
              <button onClick={sendChat} style={{padding:"8px 14px",borderRadius:7,background:"#1d4ed8",border:"none",color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>전송</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}