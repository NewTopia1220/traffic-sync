import { useChartJs, COPTS, GC, TC } from "../../hooks/useChartJs";

export default function SpeedChart({ data, height=200 }) {
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
