import { useRef, useEffect } from "react";

export function useChartJs(builder, deps) {
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

export const COPTS = {
  responsive:true, maintainAspectRatio:false,
  plugins:{ legend:{display:false}, tooltip:{ backgroundColor:"rgba(10,16,30,0.95)", titleColor:"#94a3b8", bodyColor:"#e2e8f0", padding:10, cornerRadius:6 } },
};
export const GC = "rgba(255,255,255,0.06)";
export const TC = "#64748b";
