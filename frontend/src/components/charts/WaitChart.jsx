import { useChartJs, COPTS, GC, TC } from "../../hooks/useChartJs";

export default function WaitChart({ data, height=180 }) {
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
