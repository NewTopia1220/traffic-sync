import { useState, useEffect, useCallback, useRef } from "react";
import { GU_LIST, calcDistKm } from "../constants/seoulGeoData";
import SeoulSvgMap from "../components/map/SeoulSvgMap";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

const V = {
  bg0: "#000", bg1: "#0a0a0a", line: "#1a1a1a",
  ink0: "#e7ecf5", ink1: "#aab4c8", ink2: "#7a7a7a", ink3: "#3a3a3a",
  grn: "#2ee07a", red: "#ff5566", org: "#ffaa33", blu: "#4ea6ff",
  mono: "'IBM Plex Mono',ui-monospace,Menlo,monospace",
  sans: "'Pretendard','Noto Sans KR','Malgun Gothic',system-ui,sans-serif",
};

// ─── 더미 sparkline 생성 ───────────────────────────────────────────────────
function makeSpark(base, len = 40) {
  const pts = [];
  let v = base;
  for (let i = 0; i < len; i++) {
    v = Math.max(5, Math.min(80, v + (Math.random() - 0.5) * 6));
    pts.push(v);
  }
  return pts;
}

// ─── 교차로별 더미 예측 데이터 생성 (crsrdId seed로 재현 가능) ──────────────
function makeForecast(seed = 0) {
  // 아침 출퇴근 피크 패턴
  const peakPattern = [20, 15, 10, 8, 10, 30, 80, 120, 100, 70, 60, 65,
                       70, 65, 60, 75, 110, 130, 100, 75, 60, 45, 35, 25];
  const r = (seed % 7) * 17 + 50; // seed별 기본 스케일
  const up   = peakPattern.map((v, i) => Math.max(0, Math.round(v * (r / 100) + (((seed * 13 + i * 7) % 30) - 15))));
  const down = peakPattern.map((v, i) => {
    const shifted = peakPattern[(i + 2) % 24];
    return Math.max(0, Math.round(shifted * (r / 90) + (((seed * 7 + i * 11) % 25) - 12)));
  });
  return { up, down };
}

function Sparkline({ values, color }) {
  if (!values || values.length < 2) return null;
  const W = 300, H = 100;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 6) - 3;
    return `${x},${y}`;
  }).join(" ");
  const gradId = `sg${color.replace("#", "")}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "100%", display: "block" }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${H} ${pts} ${W},${H}`} fill={`url(#${gradId})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ─── KPI 카드 ───────────────────────────────────────────────────────────────
function KpiCard({ value, unit, label, sub, status }) {
  const s = status === "위험" ? { c: V.red, bg: "#1a0a10", bd: "#3a1820" }
    : status === "서행" || status === "피크" ? { c: V.org, bg: "#1a1206", bd: "#3a2a14" }
    : { c: V.ink1, bg: V.bg0, bd: V.line };
  return (
    <div style={{ background: V.bg1, border: `1px solid ${V.line}`, borderRadius: 2, padding: "18px 22px", position: "relative", minHeight: 118 }}>
      {status && (
        <span style={{ fontFamily: V.mono, fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 2, background: s.bg, border: `1px solid ${s.bd}`, color: s.c, position: "absolute", top: 14, right: 16 }}>
          {status}
        </span>
      )}
      <div style={{ fontFamily: V.mono, fontWeight: 700, fontSize: 52, color: "#fff", letterSpacing: "-1.8px", lineHeight: 1, display: "flex", alignItems: "baseline", gap: 4 }}>
        {value}<span style={{ fontSize: 16, color: V.ink2, fontWeight: 500 }}>{unit}</span>
      </div>
      <div style={{ fontSize: 15, color: V.ink0, fontWeight: 600, marginTop: 8 }}>{label}</div>
      <div style={{ fontSize: 12, color: V.ink2, fontFamily: V.mono, marginTop: 3 }}>{sub}</div>
    </div>
  );
}

// ─── 실시간 구간 속도 카드 ───────────────────────────────────────────────────
function statusOf(v) {
  if (v < 20) return "혼잡";
  if (v < 40) return "서행";
  return "원활";
}

function LivCard({ name, color, speed, sparkData }) {
  const st = speed != null ? statusOf(speed) : "—";
  const stColor = st === "혼잡" ? V.red : st === "서행" ? V.org : st === "원활" ? V.grn : V.ink2;
  const cnt = sparkData?.length ?? 0;
  const winAvg = cnt > 0 ? Math.round(sparkData.slice(-10).reduce((a, b) => a + b, 0) / Math.min(10, cnt)) : null;
  const mn = cnt > 0 ? Math.round(Math.min(...sparkData)) : null;
  const mx = cnt > 0 ? Math.round(Math.max(...sparkData)) : null;
  const trend = cnt >= 2 ? Math.round(sparkData[cnt - 1] - sparkData[Math.max(0, cnt - 6)]) : null;

  return (
    <div style={{ background: V.bg0, border: `1px solid ${V.line}`, borderRadius: 2, padding: "16px 18px 12px", display: "flex", flexDirection: "column", gap: 10, minHeight: 200 }}>
      <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
        <span style={{ display: "inline-block", width: 14, height: 3, background: color, borderRadius: 1, marginRight: 9 }} />
        <span style={{ color: "#fff", fontSize: 17, fontWeight: 600 }}>{name}</span>
        <span style={{ marginLeft: "auto", fontFamily: V.mono, fontSize: 11, color: stColor, padding: "3px 8px", border: `1px solid ${stColor}44`, borderRadius: 2 }}>{st}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontFamily: V.mono, flexShrink: 0 }}>
        <span style={{ fontSize: 54, fontWeight: 700, color: "#fff", lineHeight: 1, letterSpacing: "-1px" }}>{speed ?? "—"}</span>
        <span style={{ fontSize: 16, color: V.ink2 }}>km/h</span>
        {trend !== null && (
          <span style={{ marginLeft: "auto", fontSize: 13, color: trend >= 0 ? V.grn : V.red }}>
            {trend >= 0 ? "▲" : "▼"} {Math.abs(trend)} km/h
          </span>
        )}
      </div>
      {/* sparkline — flex:1로 남은 공간 꽉 채움 */}
      <div style={{ flex: 1, minHeight: 64 }}>
        {sparkData && sparkData.length > 1
          ? <Sparkline values={sparkData} color={color} />
          : <div style={{ height: "100%", border: `1px dashed ${V.line}`, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", color: "#5a6378", fontFamily: V.mono, fontSize: 11 }}>SPARKLINE · 대기 중</div>
        }
      </div>
      <div style={{ display: "flex", gap: 12, fontFamily: V.mono, fontSize: 11, color: V.ink2, paddingTop: 6, borderTop: `1px solid #141414`, flexShrink: 0 }}>
        <span>{cnt}관측</span>
        <span>윈도우 평균 <b style={{ color: V.ink1 }}>{winAvg ?? "—"} km/h</b></span>
        <span>최소·최대 <b style={{ color: V.ink1 }}>{mn ?? "—"} / {mx ?? "—"} km/h</b></span>
      </div>
    </div>
  );
}

// ─── 도넛 차트 ──────────────────────────────────────────────────────────────
function DonutChart({ name, score }) {
  const color = score >= 70 ? V.red : score >= 50 ? V.org : V.grn;
  const level = score >= 70 ? "위험" : score >= 50 ? "주의" : "안전";
  const r = 80, sw = 18;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(score, 100) / 100) * circ;
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", background: V.bg0, border: `1px solid ${V.line}`, borderRadius: 2, padding: 10, minHeight: 300 }}>
      <svg viewBox="0 0 220 220" style={{ width: "100%", maxHeight: 260, display: "block" }}>
        <circle cx="110" cy="110" r={r} fill="none" stroke="#141414" strokeWidth={sw} />
        <circle cx="110" cy="110" r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 110 110)" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", pointerEvents: "none" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 6 }}>{name || "—"}</div>
        <div style={{ fontFamily: V.mono, fontWeight: 700, fontSize: 72, color: "#fff", letterSpacing: "-3px", lineHeight: 1 }}>
          {score ?? 0}<span style={{ fontSize: 15, color: V.ink2, fontWeight: 500, marginLeft: 3 }}>점</span>
        </div>
        <div style={{ marginTop: 8, fontFamily: V.mono, fontSize: 13, padding: "4px 12px", borderRadius: 2, border: `1px solid ${color}`, color, background: `${color}20`, fontWeight: 700 }}>{level}</div>
      </div>
    </div>
  );
}

// ─── 예측 차트 ──────────────────────────────────────────────────────────────
function ForecastChart({ up = [], down = [], name }) {
  const all = [...up, ...down];
  const maxVal = all.length ? Math.max(...all, 1) : 1;
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const peakUp = up.length ? up.indexOf(Math.max(...up)) : -1;
  const peakDn = down.length ? down.indexOf(Math.max(...down)) : -1;
  const axisVals = [maxVal, Math.round(maxVal * 0.75), Math.round(maxVal * 0.5), Math.round(maxVal * 0.25), 0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: V.bg0, border: `1px solid ${V.line}`, borderRadius: 2, padding: "12px 14px" }}>
        <div>
          <div style={{ fontSize: 15, color: "#fff", fontWeight: 700 }}>
            <span style={{ color: V.ink3, marginRight: 8, fontSize: 11 }}>▪</span>{name || "—"}
          </div>
          <div style={{ fontSize: 11, color: V.ink2, fontFamily: V.mono, marginTop: 3 }}>상행/하행 0시–23시 예측 (대/시)</div>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          {[{ label: "상행 피크", sw: V.blu, val: up.length ? Math.max(...up) : "—", h: peakUp >= 0 ? `${peakUp}시` : "" },
            { label: "하행 피크", sw: "#ff8e55", val: down.length ? Math.max(...down) : "—", h: peakDn >= 0 ? `${peakDn}시` : "" }
          ].map(s => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: V.ink1 }}>
              <span style={{ width: 14, height: 3, borderRadius: 1, background: s.sw, display: "inline-block" }} />
              <span style={{ fontSize: 11, color: V.ink2 }}>{s.label}</span>
              <b style={{ fontFamily: V.mono, color: "#fff", fontSize: 14, fontWeight: 700 }}>{s.val}</b>
              {s.h && <span style={{ fontFamily: V.mono, fontSize: 11, color: V.ink2 }}>· {s.h}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* 차트 */}
      <div style={{ display: "flex", flex: 1, minHeight: 200 }}>
        <div style={{ width: 44, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "6px 8px 28px 0", fontFamily: V.mono, fontSize: 11, color: V.ink2, borderRight: `1px dashed ${V.line}`, textAlign: "right" }}>
          {axisVals.map((v, i) => <span key={i}>{v}</span>)}
        </div>
        <div style={{ flex: 1, position: "relative", paddingTop: 6 }}>
          {[0, 25, 50, 75].map(p => (
            <div key={p} style={{ position: "absolute", left: 0, right: 0, height: 1, background: "#141414", top: `${p}%`, pointerEvents: "none" }} />
          ))}
          <div style={{ position: "absolute", left: 0, right: 0, height: 1, background: V.line, bottom: 28 }} />
          <div style={{ position: "absolute", left: 0, right: 0, top: 6, bottom: 28, display: "grid", gridTemplateColumns: "repeat(24,1fr)", alignItems: "flex-end" }}>
            {hours.map(h => {
              const u = up[h] ?? 0, d = down[h] ?? 0;
              const uH = (u / maxVal) * 100, dH = (d / maxVal) * 100;
              return (
                <div key={h} style={{ display: "flex", flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 1, height: "100%", padding: "0 1px" }}>
                  <div style={{ width: 6, height: `${uH}%`, minHeight: uH > 0 ? 2 : 0, background: V.blu, borderRadius: "1px 1px 0 0", outline: h === peakUp ? "1px solid #fff" : "none" }} />
                  <div style={{ width: 6, height: `${dH}%`, minHeight: dH > 0 ? 2 : 0, background: "#ff8e55", borderRadius: "1px 1px 0 0", outline: h === peakDn ? "1px solid #fff" : "none" }} />
                </div>
              );
            })}
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 24, display: "grid", gridTemplateColumns: "repeat(24,1fr)", fontFamily: V.mono, fontSize: 10, color: V.ink2, textAlign: "center" }}>
            {hours.map(h => (
              <span key={h} style={{ paddingTop: 4, color: h === peakUp || h === peakDn ? "#fff" : V.ink2, fontWeight: h === peakUp || h === peakDn ? 700 : 400 }}>
                {String(h).padStart(2, "0")}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 구간 속도 선택 드롭다운 (교차로 3개 선택, 검색 포함) ────────────────────
function SpeedDropdown({ options, selected, onToggle }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef();
  const inputRef = useRef();
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQuery(""); } };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const filtered = options.filter(o => o.name.includes(query));

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => { setOpen(o => !o); setTimeout(() => inputRef.current?.focus(), 50); }} style={{
        background: V.bg0, border: `1px solid ${V.line}`, borderRadius: 2, color: "#fff",
        fontFamily: V.sans, fontSize: 13, fontWeight: 600, padding: "7px 30px 7px 14px",
        cursor: "pointer", minWidth: 220, textAlign: "left", position: "relative",
      }}>
        {selected.length > 0 ? selected.map(s => s.name).join(", ") : "교차로 선택 (최대 3개)"}
        <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: V.ink2 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "110%", left: 0, zIndex: 200, background: "#0d0d0d", border: `1px solid ${V.line}`, borderRadius: 2, minWidth: 280, boxShadow: "0 8px 32px rgba(0,0,0,.8)" }}>
          <div style={{ padding: "8px 10px", borderBottom: `1px solid ${V.line}` }}>
            <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
              placeholder="교차로 검색..."
              style={{ width: "100%", background: "#141414", border: `1px solid ${V.line}`, borderRadius: 2, color: "#fff", fontSize: 13, padding: "6px 10px", fontFamily: V.sans, outline: "none" }} />
          </div>
          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            {filtered.length === 0
              ? <div style={{ padding: "14px", fontSize: 13, color: V.ink2, textAlign: "center" }}>검색 결과 없음</div>
              : filtered.map((opt, i) => {
                  const isSel = selected.some(s => s.id === opt.id);
                  return (
                    <div key={opt.id} onClick={() => onToggle(opt)}
                      style={{ padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
                        background: isSel ? "#141414" : "transparent", borderBottom: `1px solid ${V.line}`,
                        color: isSel ? "#fff" : V.ink1, fontSize: 13, fontWeight: isSel ? 600 : 400 }}>
                      <span style={{ fontFamily: V.mono, fontSize: 11, color: V.ink2, minWidth: 28 }}>#{i + 1}</span>
                      <span style={{ flex: 1 }}>{opt.name}</span>
                      {isSel && <span style={{ color: V.blu, fontSize: 11 }}>✓</span>}
                    </div>
                  );
                })
            }
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 관심 교차로 드롭다운 (검색 + 등록 토글) ────────────────────────────────
function RiskDropdown({ options, selectedIdx, onChange, watchIds = [] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef();
  const inputRef = useRef();
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQuery(""); } };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const levelLabel = score => score >= 70 ? "위험" : score >= 50 ? "주의" : "양호";
  const isRegisterMode = watchIds.length > 0 || selectedIdx === -1;

  const filtered = options.map((o, i) => ({ ...o, origIdx: i })).filter(o => o.name.includes(query));

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => { setOpen(o => !o); setTimeout(() => inputRef.current?.focus(), 50); }} style={{
        background: "#0a1020", border: `1px solid ${V.line}`, borderRadius: 999, color: "#fff",
        fontFamily: V.sans, fontSize: 13, fontWeight: 600, padding: "8px 32px 8px 14px",
        cursor: "pointer", minWidth: 220, textAlign: "left", position: "relative",
      }}>
        {isRegisterMode ? "교차로 검색 후 등록" : options[selectedIdx] ? `${options[selectedIdx].name}` : "교차로 선택"}
        <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: V.ink2 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "110%", left: 0, zIndex: 200, background: "#0d0d0d", border: `1px solid ${V.line}`, borderRadius: 2, minWidth: 300, boxShadow: "0 8px 32px rgba(0,0,0,.8)" }}>
          <div style={{ padding: "8px 10px", borderBottom: `1px solid ${V.line}` }}>
            <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
              placeholder="교차로 검색..."
              style={{ width: "100%", background: "#141414", border: `1px solid ${V.line}`, borderRadius: 2, color: "#fff", fontSize: 13, padding: "6px 10px", fontFamily: V.sans, outline: "none" }} />
          </div>
          <div style={{ maxHeight: 280, overflowY: "auto" }}>
            {filtered.length === 0
              ? <div style={{ padding: "14px", fontSize: 13, color: V.ink2, textAlign: "center" }}>검색 결과 없음</div>
              : filtered.map((opt) => {
                  const color = opt.score >= 70 ? V.red : opt.score >= 50 ? V.org : V.grn;
                  const isWatched = watchIds.includes(opt.id);
                  const isSel = opt.origIdx === selectedIdx;
                  return (
                    <div key={opt.name + opt.origIdx}
                      onClick={() => { onChange(opt.origIdx); if (!isRegisterMode) { setOpen(false); setQuery(""); } }}
                      style={{ padding: "11px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
                        background: isSel || isWatched ? "#141414" : "transparent", borderBottom: `1px solid ${V.line}`,
                        color: isSel || isWatched ? "#fff" : V.ink1, fontSize: 13 }}>
                      <span style={{ fontFamily: V.mono, fontSize: 11, color: V.ink2, minWidth: 28 }}>#{opt.origIdx + 1}</span>
                      <span style={{ flex: 1, fontWeight: 600 }}>{opt.name}</span>
                      <span style={{ fontFamily: V.mono, fontSize: 13, color, fontWeight: 700 }}>{opt.score}점</span>
                      <span style={{ fontFamily: V.mono, fontSize: 11, color: V.ink2, minWidth: 36 }}>({levelLabel(opt.score)})</span>
                      {isRegisterMode && (
                        <span style={{ fontFamily: V.mono, fontSize: 11, color: isWatched ? V.grn : V.ink3, minWidth: 18, textAlign: "center" }}>
                          {isWatched ? "✓" : "+"}
                        </span>
                      )}
                    </div>
                  );
                })
            }
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 메인 ───────────────────────────────────────────────────────────────────
const CARD_COLORS = [V.red, V.org, V.grn];

export default function MainDashboard({ onGoMap, onGoCctv, wsData }) {
  const [time, setTime] = useState(new Date());
  const [selectedGu, setSelectedGu] = useState(GU_LIST.find(g => g.name === "송파구"));
  const [loading, setLoading] = useState(false);
  const [fetchMsg, setFetchMsg] = useState(null);

  // 속도 카드: 선택된 교차로 3개
  const [speedSelected, setSpeedSelected] = useState([]);
  // 더미 sparkline 히스토리 (교차로ID → 수치 배열)
  const sparkRef = useRef({});

  // 관심 교차로 (최대 8개 슬롯)
  const [watchList, setWatchList] = useState([]);
  const [riskIdx, setRiskIdx] = useState(0);

  // 예측
  const [forecast, setForecast] = useState({ up: [], down: [], name: "—" });

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const LIV_MAX = 720;

  // 초기 진입 시 더미 데이터로 sparkline 채우기
  useEffect(() => {
    wsData.forEach(c => {
      if (!sparkRef.current[c.crsrdId]) {
        sparkRef.current[c.crsrdId] = makeSpark(c.speed ?? 20, 20);
      }
    });
  }, [wsData.length]);

  // 5초마다 현재 속도를 sparkline 히스토리에 기록
  useEffect(() => {
    const t = setInterval(() => {
      wsData.forEach(c => {
        if (!sparkRef.current[c.crsrdId]) {
          sparkRef.current[c.crsrdId] = makeSpark(c.speed ?? 20, 20);
        } else {
          const arr = sparkRef.current[c.crsrdId];
          arr.push(c.speed ?? arr[arr.length - 1]);
          if (arr.length > LIV_MAX) arr.shift();
        }
      });
      setTime(new Date()); // re-render 트리거
    }, 5000);
    return () => clearInterval(t);
  }, [wsData]);

  const handleSelectGu = useCallback(async (gu) => {
    setSelectedGu(gu);
    setRiskIdx(0);
    setWatchList([]);
    setSpeedSelected([]);
    setLoading(true);
    setFetchMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/fetch-area?lat=${gu.lat}&lon=${gu.lon}&radius=2.5`, { method: "POST" });
      const data = await res.json();
      setFetchMsg(`${gu.name} · ${data.count ?? 0}개 교차로 수집됨`);
    } catch {
      setFetchMsg(`${gu.name} 데이터 수집 실패`);
    } finally {
      setLoading(false);
      setTimeout(() => setFetchMsg(null), 3000);
    }
  }, []);

  // 활성 데이터
  const guData = selectedGu
    ? wsData.filter(c => c.lat && c.lon && calcDistKm(c.lat, c.lon, selectedGu.lat, selectedGu.lon) <= 2.5)
    : wsData;
  const activeData = guData.length > 0 ? guData : wsData;
  const isLive = wsData.length > 0;

  const avgSpeed = activeData.length
    ? Math.round(activeData.reduce((a, c) => a + (c.speed ?? 30), 0) / activeData.length) : 40;
  const highRisk = activeData.filter(c => (c.riskScore ?? 0) >= 70).length;
  const sortedByRisk = [...activeData].sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0));
  const maxRiskItem = sortedByRisk[0];
  const maxRisk = maxRiskItem?.riskScore ?? 99;
  const guLabel = selectedGu ? `${selectedGu.name} 반경 2.5km` : "전체";
  const speedStatus = avgSpeed >= 40 ? "정상" : avgSpeed >= 20 ? "서행" : "혼잡";

  // 위험도 리스트 (전체 — 드롭다운 검색용)
  const riskData = sortedByRisk.map(c => ({
    name: c.crsrdNm, score: c.riskScore ?? 0,
    speed: c.speed ?? 0, congestion: c.congestion ?? "—",
    id: c.crsrdId,
  }));

  // watchList: 실시간 점수 반영
  const watchListLive = watchList.map(w => {
    const live = riskData.find(r => r.id === w.id);
    return live ?? w;
  });

  // watchList에 없으면 위험도 상위로 자동 채움 (8개까지)
  const autoFill = riskData.filter(r => !watchListLive.some(w => w.id === r.id)).slice(0, 8 - watchListLive.length);
  const displayWatch = [...watchListLive, ...autoFill].slice(0, 8);

  const selectedRisk = displayWatch[riskIdx] ?? displayWatch[0];

  const toggleWatch = (item) => {
    setWatchList(prev => {
      const exists = prev.some(w => w.id === item.id);
      if (exists) return prev.filter(w => w.id !== item.id);
      if (prev.length >= 8) return prev; // 8개 초과 불가
      return [...prev, item];
    });
    setRiskIdx(0);
  };

  // 속도 카드 드롭다운 옵션 (activeData 전체)
  const speedOptions = activeData.map(c => ({ id: c.crsrdId, name: c.crsrdNm, speed: c.speed ?? 0 }));

  // 속도 카드 표시할 3개 결정
  const displayCards = speedSelected.length > 0
    ? speedSelected.map((s, i) => {
        const live = activeData.find(c => c.crsrdId === s.id);
        const spd = live?.speed ?? s.speed;
        return {
          name: s.name, color: CARD_COLORS[i % 3],
          speed: spd,
          sparkData: sparkRef.current[s.id] ?? makeSpark(spd, 30),
        };
      })
    : activeData.length > 0
    ? [...activeData].sort((a, b) => (a.speed ?? 0) - (b.speed ?? 0)).slice(0, 3).map((c, i) => ({
        name: c.crsrdNm, color: CARD_COLORS[i],
        speed: c.speed ?? 0,
        sparkData: sparkRef.current[c.crsrdId] ?? makeSpark(c.speed ?? 20, 30),
      }))
    : [
        { name: "잠실역", color: V.red, speed: null, sparkData: makeSpark(17, 30) },
        { name: "석촌호수", color: V.org, speed: null, sparkData: makeSpark(17, 30) },
        { name: "잠실나루", color: V.grn, speed: null, sparkData: makeSpark(32, 30) },
      ];

  const toggleSpeedCard = (opt) => {
    setSpeedSelected(prev => {
      const exists = prev.some(s => s.id === opt.id);
      if (exists) return prev.filter(s => s.id !== opt.id);
      if (prev.length >= 3) return [...prev.slice(1), opt];
      return [...prev, opt];
    });
  };

  // 예측 fetch — 즉시 더미 표시 후 실제 API 결과로 교체
  useEffect(() => {
    if (!selectedRisk) return;
    // seed: crsrdId 숫자 부분 또는 인덱스
    const seed = parseInt(selectedRisk.id ?? riskIdx, 10) || riskIdx;
    const dummy = makeForecast(seed);
    setForecast({ up: dummy.up, down: dummy.down, name: selectedRisk.name, isDummy: true });

    if (!selectedRisk.id) return;
    fetch(`${API_BASE}/api/forecast/${selectedRisk.id}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => {
        if (d.up?.length && d.down?.length) {
          setForecast({ up: d.up, down: d.down, name: d.crsrdNm ?? selectedRisk.name, isDummy: false });
        }
      })
      .catch(() => {}); // 더미 그대로 유지
  }, [riskIdx, riskData.length]);

  // breakdown 실데이터
  const bdItems = selectedRisk ? [
    { label: "도로 위험도", sub: "교차로 구조 · 사고 이력 종합", value: selectedRisk.score, unit: "점", color: selectedRisk.score >= 70 ? V.red : selectedRisk.score >= 50 ? V.org : V.grn, pct: selectedRisk.score },
    { label: "실시간 평균 속도", sub: "V2X 수집 · 낮을수록 위험", value: selectedRisk.speed, unit: "km/h", color: V.org, pct: Math.min((selectedRisk.speed / 80) * 100, 100) },
    { label: "혼잡 상태", sub: "현재 구간 추정", value: selectedRisk.congestion, unit: "", color: V.blu, pct: 50 },
  ] : [];

  return (
    <div style={{ fontFamily: V.sans, background: V.bg0, color: V.ink0, minHeight: "100vh", display: "flex", flexDirection: "column", overflowY: "auto" }}>

      {/* ── 헤더 ── */}
      <div style={{ background: V.bg0, borderBottom: `1px solid ${V.line}`, padding: "0 18px", height: 60, display: "flex", alignItems: "center", gap: 18, flexShrink: 0, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 260 }}>
          <div style={{ width: 28, height: 28, borderRadius: 4, display: "grid", placeItems: "center", background: "#0a0a0a", border: `1px solid ${V.line}` }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: V.grn, display: "block" }} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Traffic-Sync 관제 시스템</div>
            <div style={{ fontSize: 11, color: V.ink2 }}>V2X 공공 API 기반 실시간 교통 관제 플랫폼</div>
          </div>
        </div>

        {/* 탭 */}
        <div style={{ display: "flex", gap: 2, background: V.bg0, border: `1px solid ${V.line}`, borderRadius: 2, padding: 3 }}>
          {[["통합 대시보드", "main"], ["실시간 지도", "map"], ["CCTV 관제", "cctv"]].map(([label, tab]) => {
            const isActive = tab === "main";
            return (
              <button key={tab}
                onClick={tab === "map" ? () => onGoMap(selectedGu) : tab === "cctv" ? onGoCctv : undefined}
                style={{ appearance: "none", border: 0, background: isActive ? "#141414" : "transparent", color: isActive ? "#fff" : V.ink1, padding: "7px 15px", borderRadius: 2, fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, boxShadow: isActive ? "inset 0 0 0 1px #2a2a2a" : "none", fontFamily: V.sans }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: isActive ? V.blu : V.ink3, display: "inline-block" }} />
                {label}
              </button>
            );
          })}
        </div>

        {selectedGu && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 13px", borderRadius: 2, background: "#1a1206", border: "1px solid #3a2a14", color: V.org, fontSize: 12, fontWeight: 600 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: V.org, display: "inline-block" }} />
            {selectedGu.name} 선택됨
          </div>
        )}
        {fetchMsg && (
          <div style={{ fontSize: 12, color: V.grn, padding: "3px 10px", borderRadius: 2, border: "1px solid #1a3a24", background: "#0c1a12", fontFamily: V.mono }}>✓ {fetchMsg}</div>
        )}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
          {isLive && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", border: `1px solid ${V.line}`, background: V.bg0, borderRadius: 2, fontFamily: V.mono, fontSize: 12, color: V.ink1 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: V.grn, display: "inline-block" }} />
              LIVE · V2X 연결됨
            </span>
          )}
          <span style={{ fontFamily: V.mono, fontSize: 13, color: V.ink0, letterSpacing: ".3px" }}>
            <span style={{ color: V.ink2, marginRight: 6 }}>{time.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" })}</span>
            {time.toLocaleTimeString("ko-KR")}
          </span>
        </div>
      </div>

      {/* ── KPI 4개 ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, padding: 8 }}>
        <KpiCard value={activeData.length || 0} unit="개" label="모니터링 교차로" sub={guLabel} status="정상" />
        <KpiCard value={highRisk} unit="개" label="위험 교차로" sub="위험도 70점 이상" status={highRisk > 0 ? "위험" : "정상"} />
        <KpiCard value={avgSpeed} unit="km/h" label="현재 평균 속도" sub="전 교차로 추정" status={speedStatus === "혼잡" ? "혼잡" : speedStatus === "서행" ? "서행" : "정상"} />
        <KpiCard value={maxRisk} unit="점" label="최고 위험도" sub={maxRiskItem?.crsrdNm ?? "—"} status={maxRisk >= 70 ? "위험" : maxRisk >= 50 ? "피크" : "정상"} />
      </div>

      {/* ── row2: 속도 + 지도 ── */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8, padding: "0 8px", alignItems: "stretch" }}>

        {/* 실시간 구간 속도 */}
        <div style={{ background: V.bg1, border: `1px solid ${V.line}`, borderRadius: 2, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: `1px solid ${V.line}`, background: "#080808", flexWrap: "wrap", flexShrink: 0 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>
              <span style={{ color: V.ink3, marginRight: 8, fontSize: 11 }}>▪</span>실시간 구간 속도
            </span>
            <SpeedDropdown options={speedOptions} selected={speedSelected} onToggle={toggleSpeedCard} />
            <div style={{ marginLeft: "auto", fontFamily: V.mono, fontSize: 12, color: isLive ? V.grn : V.ink2, padding: "3px 8px", border: `1px solid ${isLive ? "#1a3a24" : V.line}`, borderRadius: 2, background: isLive ? "#0c1a12" : V.bg0 }}>
              {isLive ? "● LIVE · 수집 중" : "대기 중"}
            </div>
          </div>
          <div style={{ padding: 12, flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, flex: 1 }}>
              {displayCards.map((c, i) => <LivCard key={i} {...c} />)}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, padding: "9px 12px", background: V.bg0, border: `1px solid ${V.line}`, borderRadius: 2, fontFamily: V.mono, fontSize: 12, color: V.ink2, flexShrink: 0 }}>
              <span>마지막 갱신 {isLive ? time.toLocaleTimeString("ko-KR") : "—"}</span>
              <span style={{ color: V.ink3 }}>·</span>
              <span>누적 —분 / 최대 60분</span>
              <span style={{ marginLeft: "auto", color: "#5a6378" }}>5초 간격 샘플링 · localStorage 보관</span>
            </div>
          </div>
        </div>

        {/* 서울 지도 — row2와 같은 높이로 stretch */}
        <div style={{ background: V.bg1, border: `1px solid ${V.line}`, borderRadius: 2, display: "flex", flexDirection: "column", minHeight: 460 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", borderBottom: `1px solid ${V.line}`, background: "#080808", flexShrink: 0 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>
              <span style={{ color: V.ink3, marginRight: 8, fontSize: 11 }}>▪</span>서울 교통 현황
            </span>
            <button onClick={() => onGoMap(selectedGu)} style={{ marginLeft: "auto", fontFamily: V.mono, fontSize: 11, color: V.ink1, padding: "3px 8px", border: `1px solid ${V.line}`, borderRadius: 2, background: V.bg0, cursor: "pointer" }}>
              실시간 지도 →
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <SeoulSvgMap onGoMap={onGoMap} selectedGu={selectedGu} onSelectGu={handleSelectGu} loading={loading} />
          </div>
        </div>
      </div>

      {/* ── row3: 위험도 + 예측 ── */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8, padding: "8px 8px 24px", alignItems: "stretch" }}>

        {/* 위험도 패널 */}
        <div style={{ background: V.bg1, border: `1px solid ${V.line}`, borderRadius: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: `1px solid ${V.line}`, background: "#080808" }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>
              <span style={{ color: V.ink3, marginRight: 8, fontSize: 11 }}>▪</span>교차로별 위험도
            </span>
            <span style={{ marginLeft: "auto", fontFamily: V.mono, fontSize: 12, color: isLive ? V.grn : V.ink2, padding: "3px 8px", border: `1px solid ${isLive ? "#1a3a24" : V.line}`, borderRadius: 2, background: isLive ? "#0c1a12" : V.bg0 }}>
              {isLive ? "● 실시간" : "참고값"}
            </span>
          </div>
          <div style={{ padding: 12 }}>

            {/* 관심 교차로 등록 바 */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 14px", background: V.bg0, border: `1px solid ${V.line}`, borderRadius: 2, marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>
                <span style={{ color: V.ink3, marginRight: 8, fontSize: 11 }}>◉</span>관심 교차로 등록
              </span>
              <RiskDropdown options={riskData} selectedIdx={-1} onChange={i => toggleWatch(riskData[i])} watchIds={watchList.map(w => w.id)} />
              <span style={{ marginLeft: "auto", fontFamily: V.mono, fontSize: 11, color: V.ink2 }}>{watchList.length}/8 등록됨 · 최대 8개</span>
            </div>

            {/* 그리드 pill (8슬롯 고정) */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", border: `1px solid ${V.line}`, borderRadius: 2, background: V.bg1, marginBottom: 12, overflow: "hidden" }}>
              {Array.from({ length: 8 }).map((_, i) => {
                const d = displayWatch[i];
                const isManual = d && watchList.some(w => w.id === d.id);
                const color = d ? (d.score >= 70 ? V.red : d.score >= 50 ? V.org : V.grn) : V.line;
                const isSel = i === riskIdx;
                return d ? (
                  <div key={i} onClick={() => setRiskIdx(i)} style={{
                    display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: 10,
                    padding: "14px 16px", background: isSel ? "#141414" : "transparent",
                    borderRight: `1px solid ${V.line}`, borderBottom: `1px solid ${V.line}`,
                    cursor: "pointer", boxShadow: isSel ? `inset 2px 0 0 ${color}` : "none", position: "relative",
                  }}>
                    <span style={{ fontFamily: V.mono, fontSize: 12, color: isSel ? "#fff" : V.ink2, fontWeight: 700 }}>#{i + 1}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#d8dde8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                      <span style={{ fontFamily: V.mono, fontSize: 16, fontWeight: 700, color: "#fff" }}>{d.score}</span>
                      {isManual && (
                        <span onClick={e => { e.stopPropagation(); toggleWatch(d); }}
                          style={{ fontSize: 9, color: V.ink2, cursor: "pointer", padding: "1px 4px", border: `1px solid ${V.line}`, borderRadius: 2 }}>✕</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div key={i} style={{
                    padding: "14px 16px", borderRight: `1px solid ${V.line}`, borderBottom: `1px solid ${V.line}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: `1px dashed ${V.line}`, color: V.ink3, fontSize: 11, fontFamily: V.mono,
                  }}>
                    #{i + 1} 빈 슬롯
                  </div>
                );
              })}
            </div>

            {/* 도넛 + breakdown */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <DonutChart name={selectedRisk?.name} score={selectedRisk?.score ?? 0} />
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {bdItems.map((b, i) => (
                  <div key={i} style={{ background: V.bg0, border: `1px solid ${V.line}`, borderRadius: 2, padding: "16px 18px", display: "grid", gridTemplateColumns: "1fr auto", rowGap: 12 }}>
                    <div style={{ fontSize: 14, color: "#fff", fontWeight: 600 }}>
                      {b.label}
                      <small style={{ display: "block", color: V.ink2, fontSize: 11, fontFamily: V.mono, fontWeight: 500, marginTop: 3 }}>{b.sub}</small>
                    </div>
                    <div style={{ fontFamily: V.mono, fontWeight: 700, fontSize: 28, color: "#fff", textAlign: "right", alignSelf: "end" }}>
                      {b.value}<em style={{ fontStyle: "normal", fontSize: 13, color: V.ink2, marginLeft: 3 }}>{b.unit}</em>
                    </div>
                    <div style={{ gridColumn: "1/3", height: 6, background: "#141414" }}>
                      <div style={{ height: "100%", width: `${b.pct}%`, background: b.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 시간대별 예측 */}
        <div style={{ background: V.bg1, border: `1px solid ${V.line}`, borderRadius: 2, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", borderBottom: `1px solid ${V.line}`, background: "#080808" }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>
              <span style={{ color: V.ink3, marginRight: 8, fontSize: 11 }}>▪</span>시간대별 교통량 예측
            </span>
            <span style={{ marginLeft: "auto", fontFamily: V.mono, fontSize: 11,
              color: forecast.isDummy ? V.org : V.grn,
              padding: "3px 8px", border: `1px solid ${forecast.isDummy ? "#3a2a14" : "#1a3a24"}`,
              borderRadius: 2, background: forecast.isDummy ? "#1a1206" : "#0c1a12" }}>
              {forecast.isDummy ? "더미 데이터" : "● 예측 모델"}
            </span>
          </div>
          {/* 교차로 선택 드롭다운 — 관심 등록된 8개 기준 */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderBottom: `1px solid ${V.line}`, background: "#060606" }}>
            <span style={{ fontSize: 12, color: V.ink2, fontFamily: V.mono }}>교차로</span>
            <RiskDropdown options={displayWatch} selectedIdx={riskIdx} onChange={setRiskIdx} />
          </div>
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12, flex: 1, minHeight: 0 }}>
            <ForecastChart up={forecast.up} down={forecast.down} name={forecast.name} />
          </div>
        </div>
      </div>

    </div>
  );
}
