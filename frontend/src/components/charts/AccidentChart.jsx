import { useChartJs, COPTS, GC, TC } from "../../hooks/useChartJs";
import { ACCIDENT_DATA } from "../../constants/dashboardData";

export default function AccidentChart({ height=170 }) {
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
