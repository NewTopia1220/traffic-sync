import { useState, useEffect, useRef } from "react";
import { mapKeys, calcRisk, calcCong, calcWait } from "../utils/signalUtils";

export function useWebSocket(setWsData) {
  const [wsStatus, setWsStatus] = useState("연결 중...");
  const [lastUpdate, setLastUpdate] = useState(null);
  const wsRef = useRef(null);
  const speedCache = useRef({});

  useEffect(() => {
    const WS = import.meta.env.VITE_WS_URL || `ws://${window.location.hostname}:8080/ws/traffic`;

    function connect() {
      const ws = new WebSocket(WS);
      wsRef.current = ws;

      ws.onopen = () => setWsStatus("연결됨");

      ws.onmessage = e => {
        try {
          const list = JSON.parse(e.data);
          const proc = list.map(s => {
            const ms = mapKeys(s.signals);
            const riskScore = calcRisk(ms);
            const congestion = calcCong(ms);
            const avgWait = calcWait(ms);
            const prev = speedCache.current[s.crsrdId];
            const base = congestion === "혼잡" ? 12 : congestion === "서행" ? 27 : 45;
            const speed = prev
              ? Math.max(5, Math.min(80, prev + Math.floor(Math.random() * 7) - 3))
              : base;
            speedCache.current[s.crsrdId] = speed;
            return { ...s, mappedSignals: ms, riskScore, congestion, speed, avgWait };
          });
          setWsData(proc);
          setLastUpdate(new Date());
        } catch (err) {
          console.error("WS 파싱:", err);
        }
      };

      ws.onclose = () => { setWsStatus("재연결 중..."); setTimeout(connect, 3000); };
      ws.onerror = () => setWsStatus("연결 오류");
    }

    connect();
    return () => wsRef.current?.close();
  }, []);

  return { wsStatus, lastUpdate };
}
