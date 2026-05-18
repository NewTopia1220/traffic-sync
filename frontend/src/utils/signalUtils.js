export const DIR_MAP = {
  nt: "north", et: "east", st: "south", wt: "west",
  ne: "northeast", se: "southeast", sw: "southwest", nw: "northwest",
};

export const mapKeys = raw =>
  raw ? Object.fromEntries(Object.entries(raw).map(([k, v]) => [DIR_MAP[k] || k, v])) : {};

export const statusCls = st => {
  if (!st) return "gray";
  const s = st.toLowerCase();
  if (s.includes("movement-allowed")) return "green";
  if (s.includes("stop")) return "red";
  return "gray";
};

export const domColor = signals => {
  if (!signals) return "#6b7280";
  let g = 0, r = 0;
  Object.values(signals).forEach(d => {
    ["stsg", "ltsg", "pdsg"].forEach(k => {
      const c = statusCls(d?.[k]?.status);
      if (c === "green") g++;
      else if (c === "red") r++;
    });
  });
  if (g > 0 && r > 0) return "#f59e0b";
  if (g > 0) return "#22c55e";
  if (r > 0) return "#ef4444";
  return "#6b7280";
};

export const congColor = c =>
  c === "혼잡" ? "#ef4444" : c === "서행" ? "#f59e0b" : "#22c55e";

export const riskColor = s =>
  s >= 70 ? "#ef4444" : s >= 50 ? "#f59e0b" : "#22c55e";

export const riskLabel = s =>
  s >= 70 ? "높음" : s >= 50 ? "보통" : "낮음";
