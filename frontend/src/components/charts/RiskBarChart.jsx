import { useChartJs, COPTS, GC, TC } from "../../hooks/useChartJs";

export default function RiskBarChart({ data, height=180 }) {
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
